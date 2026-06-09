// ═══════════════════════════════════════
//  ДАННЫЕ
// ═══════════════════════════════════════
let parts = [];
let selectedId = null;
let scanned = new Set();
let hiddenIds = new Set();

// ═══════════════════════════════════════
//  XML / JSON ПАРСЕР
// ═══════════════════════════════════════
document.getElementById('xmlFile').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(ev.target.result);
        parts = data.parts || data;
      } else {
        parts = parseXML(ev.target.result);
      }
      autoLayout(parts);
      buildScene();
      renderList();
      document.getElementById('hint').style.display = 'none';
      centerOnModel();
    } catch(err) {
      alert('Ошибка загрузки файла: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
});

function parseXML(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const result = [];
  doc.querySelectorAll('Объект').forEach((obj, idx) => {
    const name = obj.getAttribute('Наименование') || `Деталь ${idx+1}`;
    const code = obj.getAttribute('Артикул') || `D-${String(idx+1).padStart(3,'0')}`;
    const L = parseFloat(obj.getAttribute('Длина') || 0);
    const W = parseFloat(obj.getAttribute('Ширина') || 0);
    const T = parseFloat(obj.getAttribute('Толщина') || 18);
    const matEl = obj.querySelector('ОсновнойМатериал');
    const mat = matEl?.getAttribute('Наименование') || obj.getAttribute('Материал') || 'ЛДСП';
    const qty = parseInt(obj.getAttribute('Количество') || 1);
    if (L > 0 && W > 0) {
      result.push({ id: idx, code, name, L, W, T, material: mat, qty });
    }
  });
  return result;
}

// ═══════════════════════════════════════
//  АВТО РАСКЛАДКА (низ деталей на Y=0)
// ═══════════════════════════════════════
function autoLayout(parts) {
  let minY = Infinity;
  
  parts.forEach(p => {
    if (p.pos && p.pos.y !== undefined) {
      minY = Math.min(minY, p.pos.y);
    }
  });
  
  if (minY === Infinity) minY = 0;
  const sc = 0.001;
  
  parts.forEach(p => {
    if (!p.pos || !p.gab) {
      const cols = Math.ceil(Math.sqrt(parts.length));
      const row = Math.floor(p.id / cols);
      const col = p.id % cols;
      p._pos = { x: (col - cols/2) * 0.15, y: 0, z: (row - cols/2) * 0.15 };
      p._size = { x: 0.1, y: 0.1, z: 0.1 };
      return;
    }
    
    const px = (p.pos.x + p.gab.w / 2) * sc;
    const py = (p.pos.y - minY + p.gab.h / 2) * sc;
    const pz = (p.pos.z + p.gab.d / 2) * sc;
    
    p._pos = { x: px, y: py, z: pz };
    p._size = { 
      x: Math.max(p.gab.w, 1) * sc, 
      y: Math.max(p.gab.h, 1) * sc, 
      z: Math.max(p.gab.d, 1) * sc 
    };
  });
}

// ═══════════════════════════════════════
//  THREE.JS СЦЕНА
// ═══════════════════════════════════════
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c12);
scene.fog = new THREE.FogExp2(0x0a0c12, 0.03);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(3, 2.5, 3);

// Освещение
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
mainLight.position.set(5, 10, 5);
scene.add(mainLight);
const fillLight = new THREE.DirectionalLight(0x88aaff, 0.4);
fillLight.position.set(-3, 2, -4);
scene.add(fillLight);
const backLight = new THREE.DirectionalLight(0xffaa88, 0.3);
backLight.position.set(0, 2, -5);
scene.add(backLight);

// Пол
const gridHelper = new THREE.GridHelper(8, 20, 0x2a3a5a, 0x1a2a4a);
gridHelper.position.y = -0.01;
scene.add(gridHelper);

const planeMat = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.3 });
const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), planeMat);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -0.02;
scene.add(groundPlane);

const meshMap = {};

function getColor(mat) {
  const m = (mat || '').toLowerCase();
  if (m.includes('белый') || m.includes('white')) return '#f0ede8';
  if (m.includes('дуб сонома') || m.includes('sonoma')) return '#c4a46b';
  if (m.includes('дуб') || m.includes('oak')) return '#b8935a';
  if (m.includes('орех') || m.includes('walnut')) return '#6b4c2a';
  if (m.includes('венге') || m.includes('wenge')) return '#2d1f0f';
  if (m.includes('гикори') || m.includes('hickory')) return '#8b6340';
  if (m.includes('ясень') || m.includes('ash')) return '#d4b896';
  if (m.includes('бук') || m.includes('beech')) return '#c8a882';
  if (m.includes('сосна') || m.includes('pine')) return '#deb887';
  if (m.includes('зеркал')) return '#a8c8d8';
  if (m.includes('стекл')) return '#88bbcc';
  if (m.includes('металл') || m.includes('metal')) return '#909090';
  if (m.includes('хдф')) return '#d0c8bc';
  if (m.includes('мдф') || m.includes('mdf')) return '#e8e0d4';
  if (m.includes('черн') || m.includes('black')) return '#2a2a2a';
  if (m.includes('серый')) return '#808080';
  if (m.includes('лдсп')) return '#c4a46b';
  return '#b0a898';
}

function buildScene() {
  Object.values(meshMap).forEach(m => scene.remove(m));
  Object.keys(meshMap).forEach(k => delete meshMap[k]);

  parts.forEach(p => {
    const geo = new THREE.BoxGeometry(p._size.x, p._size.y, p._size.z);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(getColor(p.material)),
      roughness: 0.6,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p._pos.x, p._pos.y, p._pos.z);
    mesh.userData = { partId: p.id, part: p };
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    
    const edges = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edges,
      new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.15, transparent: true })
    ));
    scene.add(mesh);
    meshMap[p.id] = mesh;
  });
  
  centerOnModel();
}

// ═══════════════════════════════════════
//  КАМЕРА
// ═══════════════════════════════════════
let isDragging = false;
let isPinching = false;
let prevMouse = { x: 0, y: 0 };
let startDistance = 0;
let startCamDist = 0;
let theta = 0.8, phi = 0.9, camDist = 3.5;
let autoRot = false;
let targetPartId = null;
let flyAnimationId = null;

const target = new THREE.Vector3(0, 0.5, 0);

function centerOnModel() {
  if (parts.length === 0) return;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  parts.forEach(p => {
    if (!p._pos) return;
    minX = Math.min(minX, p._pos.x - p._size.x/2);
    maxX = Math.max(maxX, p._pos.x + p._size.x/2);
    minY = Math.min(minY, p._pos.y - p._size.y/2);
    maxY = Math.max(maxY, p._pos.y + p._size.y/2);
    minZ = Math.min(minZ, p._pos.z - p._size.z/2);
    maxZ = Math.max(maxZ, p._pos.z + p._size.z/2);
  });
  
  target.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  camDist = Math.max(size * 1.5, 2);
  targetPartId = null;
  updateCam();
}

function updateCam() {
  camera.position.x = target.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + camDist * Math.cos(phi);
  camera.position.z = target.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(target);
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#00d4ff;padding:8px 16px;border-radius:20px;font-size:12px;z-index:1000;pointer-events:none;transition:opacity 0.3s;opacity:0';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => toast.style.opacity = '0', 1500);
}

// Управление мышью
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    autoRot = false;
    document.getElementById('btnRot')?.classList.remove('on');
    document.getElementById('btnRot').textContent = '▶ Вращение';
  }
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  theta -= (e.clientX - prevMouse.x) * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (e.clientY - prevMouse.y) * 0.005));
  prevMouse = { x: e.clientX, y: e.clientY };
  updateCam();
});

window.addEventListener('mouseup', () => { isDragging = false; });

canvas.addEventListener('wheel', (e) => {
  camDist = Math.max(0.5, Math.min(12, camDist + camDist * e.deltaY * 0.001));
  updateCam();
  e.preventDefault();
}, { passive: false });

// Тач управление
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1) {
    isDragging = true;
    prevMouse = { x: touches[0].clientX, y: touches[0].clientY };
    autoRot = false;
  } else if (touches.length === 2) {
    isPinching = true;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    startDistance = Math.sqrt(dx * dx + dy * dy);
    startCamDist = camDist;
  }
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1 && isDragging) {
    theta -= (touches[0].clientX - prevMouse.x) * 0.005;
    phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (touches[0].clientY - prevMouse.y) * 0.005));
    prevMouse = { x: touches[0].clientX, y: touches[0].clientY };
    updateCam();
  } else if (touches.length === 2 && isPinching) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    camDist = Math.max(0.5, Math.min(12, startCamDist + (startDistance - distance) * 0.01));
    updateCam();
  }
});

canvas.addEventListener('touchend', (e) => {
  isDragging = false;
  isPinching = false;
});

// Клик по детали (с исключением скрытых)
const raycaster = new THREE.Raycaster();
let clickStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
  clickStart = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener('mouseup', (e) => {
  if (Math.abs(e.clientX - clickStart.x) > 5 || Math.abs(e.clientY - clickStart.y) > 5) return;
  const rect = canvas.getBoundingClientRect();
  const mouseVec = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouseVec, camera);
  // Исключаем скрытые детали
  const visibleMeshes = Object.values(meshMap).filter(m => m.visible === true);
  const hits = raycaster.intersectObjects(visibleMeshes);
  if (hits.length) {
    const hitId = hits[0].object.userData.partId;
    if (!hiddenIds.has(hitId)) selectPart(hitId);
  }
});

// ПКМ центрирование
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseVec = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouseVec, camera);
  const visibleMeshes = Object.values(meshMap).filter(m => m.visible === true);
  const hits = raycaster.intersectObjects(visibleMeshes);
  if (hits.length) {
    const p = parts.find(x => x.id === hits[0].object.userData.partId);
    if (p && p._pos) {
      target.set(p._pos.x, p._pos.y, p._pos.z);
      updateCam();
      showToast('🎯 ' + p.name);
    }
  }
  return false;
});

// Resize
function resize() {
  const wrap = canvas.parentElement;
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
setTimeout(resize, 50);

// Анимация
function animate() {
  requestAnimationFrame(animate);
  if (autoRot && !isDragging) {
    theta += 0.002;
    updateCam();
  }
  renderer.render(scene, camera);
}
animate();

// ═══════════════════════════════════════
//  КНОПКИ
// ═══════════════════════════════════════
document.getElementById('btnRot')?.addEventListener('click', () => {
  autoRot = !autoRot;
  const btn = document.getElementById('btnRot');
  btn.classList.toggle('on', autoRot);
  btn.textContent = autoRot ? '⏸ Стоп' : '▶ Вращение';
});

document.getElementById('btnReset')?.addEventListener('click', () => {
  theta = 0.8; phi = 0.9;
  centerOnModel();
  updateCam();
});

// Кнопка центрирования
if (!document.getElementById('btnCenter')) {
  const btnCenter = document.createElement('button');
  btnCenter.id = 'btnCenter';
  btnCenter.className = 'btn-ctrl';
  btnCenter.innerHTML = '🎯 Центр';
  btnCenter.style.marginLeft = '8px';
  btnCenter.addEventListener('click', () => centerOnModel());
  document.querySelector('header')?.appendChild(btnCenter);
}

// ═══════════════════════════════════════
//  РЕНТГЕН + ПЛАВНОЕ ПРИБЛИЖЕНИЕ
// ═══════════════════════════════════════
let xrayEnabled = false;
let originalMaterials = new Map();

function smoothZoomToPart(partId) {
  if (flyAnimationId) cancelAnimationFrame(flyAnimationId);
  
  const p = parts.find(x => x.id === partId);
  if (!p || !p._pos) return;
  
  const targetPos = new THREE.Vector3(p._pos.x, p._pos.y, p._pos.z);
  const startPos = camera.position.clone();
  const startTarget = target.clone();
  let startTime = null;
  const duration = 600;
  
  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const progress = Math.min(1, (timestamp - startTime) / duration);
    const ease = 1 - Math.pow(1 - progress, 3);
    
    camera.position.lerpVectors(startPos, targetPos.clone().add(new THREE.Vector3(0.3, 0.3, 0.5)), ease);
    target.lerpVectors(startTarget, targetPos, ease);
    camera.lookAt(target);
    
    if (progress < 1) {
      flyAnimationId = requestAnimationFrame(animate);
    } else {
      flyAnimationId = null;
      camDist = 0.8;
      updateCam();
    }
  }
  
  flyAnimationId = requestAnimationFrame(animate);
}

function toggleXray() {
  xrayEnabled = !xrayEnabled;
  
  Object.values(meshMap).forEach(mesh => {
    if (xrayEnabled && selectedId !== null && mesh.userData.partId !== selectedId && mesh.visible) {
      if (!originalMaterials.has(mesh.uuid)) {
        originalMaterials.set(mesh.uuid, {
          transparent: mesh.material.transparent,
          opacity: mesh.material.opacity,
          color: mesh.material.color.getHex()
        });
      }
      mesh.material.transparent = true;
      mesh.material.opacity = 0.25;
    } else if (originalMaterials.has(mesh.uuid)) {
      const orig = originalMaterials.get(mesh.uuid);
      mesh.material.transparent = orig.transparent;
      mesh.material.opacity = orig.opacity;
      mesh.material.color.setHex(orig.color);
    } else {
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
    }
  });
  
  updateRightPanel(parts.find(x => x.id === selectedId));
}

function showAll() {
  selectedId = null;
  Object.values(meshMap).forEach(m => {
    m.material.emissive = new THREE.Color(0x000000);
    m.material.emissiveIntensity = 0;
  });
  
  hiddenIds.clear();
  Object.values(meshMap).forEach(m => { m.visible = true; });
  
  if (xrayEnabled) {
    xrayEnabled = false;
    Object.values(meshMap).forEach(m => {
      if (originalMaterials.has(m.uuid)) {
        const orig = originalMaterials.get(m.uuid);
        m.material.transparent = orig.transparent;
        m.material.opacity = orig.opacity;
        m.material.color.setHex(orig.color);
      }
    });
  }
  
  centerOnModel();
  updateRightPanel(null);
  renderList();
}

// ═══════════════════════════════════════
//  ВЫБОР ДЕТАЛИ
// ═══════════════════════════════════════
function selectPart(id) {
  selectedId = id;
  
  Object.values(meshMap).forEach(m => {
    m.material.emissive = new THREE.Color(0x000000);
    m.material.emissiveIntensity = 0;
  });
  
  const mesh = meshMap[id];
  if (mesh) {
    mesh.material.emissive = new THREE.Color(0xff6600);
    mesh.material.emissiveIntensity = 0.7;
  }
  
  if (xrayEnabled) {
    Object.values(meshMap).forEach(m => {
      if (m.userData.partId !== id && m.visible) {
        if (!originalMaterials.has(m.uuid)) {
          originalMaterials.set(m.uuid, {
            transparent: m.material.transparent,
            opacity: m.material.opacity,
            color: m.material.color.getHex()
          });
        }
        m.material.transparent = true;
        m.material.opacity = 0.25;
      } else if (m.userData.partId === id && originalMaterials.has(m.uuid)) {
        const orig = originalMaterials.get(m.uuid);
        m.material.transparent = orig.transparent;
        m.material.opacity = orig.opacity;
        m.material.color.setHex(orig.color);
      }
    });
  }
  
  updateRightPanel(parts.find(x => x.id === id));
  
  document.querySelectorAll('.part-item').forEach(el => el.classList.remove('active'));
  const row = document.getElementById('pi-' + id);
  if (row) row.classList.add('active');
}

function updateRightPanel(p) {
  const panel = document.getElementById('partInfo');
  if (!p) {
    panel.innerHTML = `
      <div class="no-select">
        <div style="margin-bottom:16px">👆 Нажми на деталь</div>
        <button class="btn-toggle-vis" onclick="showAll()" style="background:#2a6a3a">🎯 Показать всё</button>
      </div>
    `;
    return;
  }
  
  const isHidden = hiddenIds.has(p.id);
  const status = scanned.has(p.id)
    ? '<span class="info-value green">✅ Отсканировано</span>'
    : '<span class="info-value" style="color:#ffd700">⏳ Ждёт</span>';
  
  panel.innerHTML = `
    <div class="info-block">
      <div class="info-label">Код</div>
      <div class="info-value accent">${escapeHtml(p.code)}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Название</div>
      <div class="info-value">${escapeHtml(p.name)}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Размеры</div>
      <div class="dim-row">
        <div class="dim-box"><div class="dk">Д</div><div class="dv">${p.L || '?'}</div></div>
        <div class="dim-box"><div class="dk">Ш</div><div class="dv">${p.W || '?'}</div></div>
        <div class="dim-box"><div class="dk">Т</div><div class="dv">${p.T || '?'}</div></div>
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Материал</div>
      <div class="info-value" style="color:#ff6b35">${escapeHtml(p.material)}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Статус</div>
      ${status}
    </div>
    <div class="info-block">
      <button class="btn-toggle-vis" onclick="toggleVisibility(${p.id})">
        ${isHidden ? '👁 Показать' : '🙈 Скрыть'}
      </button>
    </div>
    <div class="info-block">
      <button class="btn-toggle-vis" onclick="smoothZoomToPart(${p.id})">
        🔍 Приблизить
      </button>
    </div>
    <div class="info-block">
      <button class="btn-toggle-vis" style="background:${xrayEnabled ? '#ff6600' : '#2a4a6a'}" onclick="toggleXray()">
        ${xrayEnabled ? '🔘 Рентген ВКЛ' : '🔘 Рентген'}
      </button>
    </div>
    <div class="info-block">
      <button class="btn-toggle-vis" onclick="showAll()">🎯 Показать всё</button>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function toggleVisibility(id) {
  const mesh = meshMap[id];
  if (!mesh) return;
  
  if (hiddenIds.has(id)) {
    hiddenIds.delete(id);
    mesh.visible = true;
  } else {
    hiddenIds.add(id);
    mesh.visible = false;
  }
  
  if (selectedId === id && hiddenIds.has(id)) {
    selectedId = null;
    Object.values(meshMap).forEach(m => {
      m.material.emissive = new THREE.Color(0x000000);
      m.material.emissiveIntensity = 0;
    });
    updateRightPanel(null);
  }
  
  renderList();
  updateRightPanel(parts.find(x => x.id === selectedId));
}

// ═══════════════════════════════════════
//  СПИСОК ДЕТАЛЕЙ
// ═══════════════════════════════════════
function renderList() {
  const list = document.getElementById('partsList');
  if (!list) return;
  list.innerHTML = '';
  
  parts.forEach(p => {
    const isHidden = hiddenIds.has(p.id);
    const color = getColor(p.material);
    const div = document.createElement('div');
    div.className = 'part-item' +
      (scanned.has(p.id) ? ' scanned' : '') +
      (selectedId === p.id ? ' active' : '') +
      (isHidden ? ' hidden-part' : '');
    div.id = 'pi-' + p.id;
    div.innerHTML = `
      <div class="part-swatch" style="background:${color};opacity:${isHidden ? 0.3 : 1}"></div>
      <div style="flex:1">
        <div class="part-name" style="opacity:${isHidden ? 0.4 : 1}">${escapeHtml(p.name)}</div>
        <div class="part-code">${escapeHtml(p.code)}</div>
      </div>
      <div style="display:flex;gap:4px;align-items:center">
        <span style="font-size:11px;cursor:pointer;opacity:0.5" onclick="toggleVisibility(${p.id})">${isHidden ? '👁' : '🙈'}</span>
        <div class="part-check ${scanned.has(p.id) ? 'done' : ''}">${scanned.has(p.id) ? '✅' : '○'}</div>
      </div>
    `;
    div.onclick = (e) => {
      if (e.target.tagName === 'SPAN') return;
      selectPart(p.id);
    };
    list.appendChild(div);
  });
}

// ═══════════════════════════════════════
//  QR СКАНЕР (ИСПРАВЛЕННЫЙ)
// ═══════════════════════════════════════

let scanInterval = null;
let videoStream = null;

document.getElementById('btnScan')?.addEventListener('click', openScanner);

function openScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) modal.classList.remove('hidden');
  
  const video = document.getElementById('video');
  if (!video) return;
  
  // Останавливаем предыдущий поток если есть
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
  }
  
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: { exact: "environment" } } 
  })
  .then(stream => {
    videoStream = stream;
    video.srcObject = stream;
    video.setAttribute('playsinline', true);
    video.play();
    startQRScan();
  })
  .catch(() => {
    // Пробуем без точного режима
    navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "environment" } 
    })
    .then(stream => {
      videoStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      video.play();
      startQRScan();
    })
    .catch(err => {
      alert('Нет доступа к камере: ' + err.message);
    });
  });
}

function closeScanner() {
  const modal = document.getElementById('scannerModal');
  if (modal) modal.classList.add('hidden');
  
  const video = document.getElementById('video');
  if (video && video.srcObject) {
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  }
  
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

function startQRScan() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('qrCanvas');
  
  if (!video || !canvas) return;
  
  const ctx = canvas.getContext('2d');
  let scanning = true;
  
  scanInterval = setInterval(() => {
    if (!scanning) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;
    
    // Устанавливаем размер canvas как у видео
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Рисуем кадр на canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Получаем данные изображения
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Пробуем найти QR код
    try {
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
      
      if (code) {
        scanning = false;
        console.log("QR найден:", code.data);
        handleScan(code.data);
        closeScanner();
      }
    } catch(e) {
      console.log("Ошибка сканирования:", e);
    }
  }, 300); // Интервал 300ms для стабильности
}

function handleScan(code) {
  console.log("Обработка кода:", code);
  
  // Поиск детали по коду
  let found = parts.find(x => x.code === code || x.code === code.trim());
  
  // Если не нашли, пробуем без учета регистра
  if (!found) {
    found = parts.find(x => x.code.toLowerCase() === code.toLowerCase());
  }
  
  // Если не нашли, пробуем частичное совпадение
  if (!found) {
    found = parts.find(x => code.includes(x.code) || x.code.includes(code));
  }
  
  if (!found) {
    alert('❌ Деталь не найдена!\nКод: ' + code);
    return;
  }
  
  scanned.add(found.id);
  selectPart(found.id);
  renderList();
  
  // Визуальный фидбек
  showToast('✅ Отсканировано: ' + found.name);
  
  // Опционально: плавный перелёт к детали
  if (typeof smoothZoomToPart === 'function') {
    smoothZoomToPart(found.id);
  }
}

// Добавьте эту функцию если её нет
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#00ff88;padding:10px 20px;border-radius:30px;font-size:14px;z-index:2000;pointer-events:none;transition:opacity 0.3s;opacity:0';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}