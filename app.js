// ═══════════════════════════════════════
//  ДАННЫЕ
// ═══════════════════════════════════════
let parts = [];
let selectedId = null;
let scanned = new Set();
let hiddenIds = new Set();

// ═══════════════════════════════════════
//  МОБИЛЬНЫЙ HELPERS
// ═══════════════════════════════════════
const isMobile = () => window.innerWidth < 768;

function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('show');
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('show');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (tab === 'list') {
    document.getElementById('tabList').classList.add('active');
    document.getElementById('infoPanel').classList.remove('open');
    openDrawer();
  } else {
    document.getElementById('tabInfo').classList.add('active');
    closeDrawer();
    if (selectedId !== null) {
      document.getElementById('infoPanel').classList.add('open');
    }
  }
}

function checkMobile() {
  if (isMobile()) {
    document.getElementById('bottomTabs').style.display = 'flex';
    document.querySelector('.float-controls').style.bottom = '70px';
  } else {
    document.getElementById('bottomTabs').style.display = 'none';
    document.querySelector('.float-controls').style.bottom = '20px';
  }
}
window.addEventListener('resize', checkMobile);

// ═══════════════════════════════════════
//  XML / JSON ПАРСЕР
// ═══════════════════════════════════════
function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      if (file.name.endsWith('.json')) {
        parts = JSON.parse(ev.target.result).parts;
      } else {
        parts = parseXML(ev.target.result);
      }
      autoLayout(parts);
      buildScene();
      renderList();
      document.getElementById('hint').style.display = 'none';
    } catch(err) {
      alert('Ошибка загрузки: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

document.getElementById('xmlFile').addEventListener('change', function(e) {
  loadFile(e.target.files[0]);
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
//  АВТО РАСКЛАДКА
// ═══════════════════════════════════════
function autoLayout(parts) {
  var minX=Infinity, minY=Infinity, minZ=Infinity;
  var maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;

  parts.forEach(function(p) {
    if (!p.pos || !p.gab) return;
    minX = Math.min(minX, p.pos.x);
    minY = Math.min(minY, p.pos.y);
    minZ = Math.min(minZ, p.pos.z);
    maxX = Math.max(maxX, p.pos.x + p.gab.w);
    maxY = Math.max(maxY, p.pos.y + p.gab.h);
    maxZ = Math.max(maxZ, p.pos.z + p.gab.d);
  });

  var cx = (minX + maxX) / 2;
  var cy = (minY + maxY) / 2;
  var cz = (minZ + maxZ) / 2;
  var sc = 0.001;

  parts.forEach(function(p) {
    if (!p.pos || !p.gab) {
      p._pos = { x:0, y:0, z:0 };
      p._size = { x:0.1, y:0.1, z:0.1 };
      p._basePos = { x:0, y:0, z:0 };
      return;
    }
    var px = (p.pos.x + p.gab.w/2 - cx) * sc;
    var py = (p.pos.y + p.gab.h/2 - cy) * sc;
    var pz = (p.pos.z + p.gab.d/2 - cz) * sc;
    var sw = Math.max(p.gab.w, 1) * sc;
    var sh = Math.max(p.gab.h, 1) * sc;
    var sd = Math.max(p.gab.d, 1) * sc;
    p._pos = { x:px, y:py, z:pz };
    p._size = { x:sw, y:sh, z:sd };
    p._basePos = { x:px, y:py, z:pz };
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
scene.background = new THREE.Color(0x080a0f);
scene.fog = new THREE.FogExp2(0x080a0f, 0.04);

const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 500);
camera.position.set(2.5, 1.8, 2.5);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
dir1.position.set(5, 8, 5);
scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
dir2.position.set(-5, 3, -5);
scene.add(dir2);
const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
dir3.position.set(0, -3, 5);
scene.add(dir3);

scene.add(new THREE.GridHelper(10, 30, 0x1a2540, 0x111928));

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
  if (m.includes('серый') || m.includes('grey') || m.includes('gray')) return '#808080';
  if (m.includes('красн') || m.includes('red')) return '#c0392b';
  if (m.includes('синий') || m.includes('blue')) return '#2980b9';
  if (m.includes('зелен') || m.includes('green')) return '#27ae60';
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
      roughness: 0.75,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p._pos.x, p._pos.y, p._pos.z);
    mesh.userData.partId = p.id;
    const edges = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edges,
      new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.2, transparent: true })
    ));
    scene.add(mesh);
    meshMap[p.id] = mesh;
  });

  updateTarget();
  updateCam();
}

// ═══════════════════════════════════════
//  КАМЕРА
// ═══════════════════════════════════════
let isDragging = false, prevMouse = { x:0, y:0 };
let theta = 0.6, phi = 0.8, camDist = 3.5;
const target = new THREE.Vector3(0, 0, 0);

function updateTarget() {
  if (!parts.length) return;
  var minX=Infinity, maxX=-Infinity;
  var minY=Infinity, maxY=-Infinity;
  var minZ=Infinity, maxZ=-Infinity;
  parts.forEach(function(p) {
    if (!p._pos) return;
    minX = Math.min(minX, p._pos.x - p._size.x/2);
    maxX = Math.max(maxX, p._pos.x + p._size.x/2);
    minY = Math.min(minY, p._pos.y - p._size.y/2);
    maxY = Math.max(maxY, p._pos.y + p._size.y/2);
    minZ = Math.min(minZ, p._pos.z - p._size.z/2);
    maxZ = Math.max(maxZ, p._pos.z + p._size.z/2);
  });
  target.set((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2);
  var size = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
  camDist = size * 1.8;
}

function updateCam() {
  camera.position.x = target.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + camDist * Math.cos(phi);
  camera.position.z = target.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(target);
}
updateCam();

// Мышь
canvas.addEventListener('mousedown', e => {
  isDragging = true;
  prevMouse = { x:e.clientX, y:e.clientY };
  autoRot = false;
  document.getElementById('btnRot').classList.remove('on');
});
window.addEventListener('mouseup', () => isDragging = false);
window.addEventListener('mousemove', e => {
  if (!isDragging) return;
  theta -= (e.clientX - prevMouse.x) * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI-0.2, phi - (e.clientY - prevMouse.y) * 0.005));
  prevMouse = { x:e.clientX, y:e.clientY };
  updateCam();
});
canvas.addEventListener('wheel', e => {
  camDist = Math.max(0.1, Math.min(50, camDist + camDist * e.deltaY * 0.001));
  updateCam();
  e.preventDefault();
}, { passive: false });

// Touch (телефон)
let touchStart = null, pinchStart = null;
canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    isDragging = true;
    prevMouse = { x:e.touches[0].clientX, y:e.touches[0].clientY };
    touchStart = { x:e.touches[0].clientX, y:e.touches[0].clientY };
    autoRot = false;
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchStart = Math.sqrt(dx*dx + dy*dy);
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 1 && isDragging) {
    theta -= (e.touches[0].clientX - prevMouse.x) * 0.005;
    phi = Math.max(0.2, Math.min(Math.PI-0.2, phi - (e.touches[0].clientY - prevMouse.y) * 0.005));
    prevMouse = { x:e.touches[0].clientX, y:e.touches[0].clientY };
    updateCam();
  } else if (e.touches.length === 2 && pinchStart) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const pinchNow = Math.sqrt(dx*dx + dy*dy);
    camDist = Math.max(0.1, Math.min(50, camDist * (pinchStart / pinchNow)));
    pinchStart = pinchNow;
    updateCam();
  }
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  isDragging = false;
  pinchStart = null;
  // Клик по детали на телефоне
  if (touchStart && e.changedTouches.length === 1) {
    const dx = Math.abs(e.changedTouches[0].clientX - touchStart.x);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.y);
    if (dx < 8 && dy < 8) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.changedTouches[0].clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.changedTouches[0].clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(Object.values(meshMap).filter(m => m.visible));
      if (hits.length) selectPart(hits[0].object.userData.partId);
    }
  }
  touchStart = null;
});

// Клик мышью
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let clickStart = { x:0, y:0 };
canvas.addEventListener('mousedown', e => clickStart = { x:e.clientX, y:e.clientY });
canvas.addEventListener('mouseup', e => {
  if (Math.abs(e.clientX-clickStart.x) > 5 || Math.abs(e.clientY-clickStart.y) > 5) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX-rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY-rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(meshMap).filter(m => m.visible));
  if (hits.length) selectPart(hits[0].object.userData.partId);
});

// Resize
function resize() {
  const wrap = canvas.parentElement;
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { resize(); checkMobile(); });
setTimeout(resize, 50);

let autoRot = false;
function animate() {
  requestAnimationFrame(animate);
  if (autoRot && !isDragging) { theta += 0.003; updateCam(); }
  renderer.render(scene, camera);
}
animate();

// ═══════════════════════════════════════
//  КНОПКИ
// ═══════════════════════════════════════
document.getElementById('btnRot').addEventListener('click', () => {
  autoRot = !autoRot;
  document.getElementById('btnRot').classList.toggle('on', autoRot);
});

document.getElementById('btnReset').addEventListener('click', () => {
  theta = 0.6; phi = 0.8;
  updateTarget();
  updateCam();
});

document.getElementById('btnMenu').addEventListener('click', openDrawer);

// ═══════════════════════════════════════
//  ВЫБОР ДЕТАЛИ
// ═══════════════════════════════════════
function selectPart(id) {
  selectedId = id;
  Object.values(meshMap).forEach(m => {
    m.material.emissive = new THREE.Color(0x000000);
  });
  const mesh = meshMap[id];
  if (mesh) {
    mesh.material.emissive = new THREE.Color(0x003355);
    mesh.material.emissiveIntensity = 1;
  }
  const p = parts.find(x => x.id === id);
  updateRightPanel(p);
  document.querySelectorAll('.part-item').forEach(el => el.classList.remove('active'));
  const row = document.getElementById('pi-'+id);
  if (row) row.classList.add('active');
  const row2 = document.getElementById('pid-'+id);
  if (row2) row2.classList.add('active');
}

function updateRightPanel(p) {
  const html = buildInfoHTML(p);

  // Десктоп
  const desktopPanel = document.getElementById('partInfoDesktop');
  if (desktopPanel) desktopPanel.innerHTML = html;

  // Мобил
  const mobileInfo = document.getElementById('partInfo');
  if (mobileInfo) mobileInfo.innerHTML = html;

  // На мобиле открываем нижнюю панель
  if (isMobile() && p) {
    document.getElementById('infoPanel').classList.add('open');
    document.getElementById('tabInfo').classList.add('active');
    document.getElementById('tabList').classList.remove('active');
    closeDrawer();
  }
}

function buildInfoHTML(p) {
  if (!p) return '<div class="no-select">Выбери деталь</div>';
  const isHidden = hiddenIds.has(p.id);
  const status = scanned.has(p.id)
    ? '<span class="info-value green">✅ Отсканировано</span>'
    : '<span class="info-value" style="color:#ffd700">⏳ Ожидает скана</span>';
  return `
    <div class="info-block">
      <div class="info-label">Код детали</div>
      <div class="info-value accent">${p.code}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Название</div>
      <div class="info-value">${p.name}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Размеры (мм)</div>
      <div class="dim-row">
        <div class="dim-box"><div class="dk">Длина</div><div class="dv">${p.L}</div></div>
        <div class="dim-box"><div class="dk">Ширина</div><div class="dv">${p.W}</div></div>
        <div class="dim-box"><div class="dk">Толщ.</div><div class="dv">${p.T}</div></div>
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">Материал</div>
      <div class="info-value" style="color:#ff6b35">${p.material}</div>
    </div>
    <div class="info-block">
      <div class="info-label">Количество</div>
      <div class="info-value">${p.qty} шт.</div>
    </div>
    <div class="info-block">
      <div class="info-label">Статус</div>
      ${status}
    </div>
    <div class="info-block">
      <button class="btn-toggle-vis" onclick="toggleVisibility(${p.id})">
        ${isHidden ? '👁 Показать' : '🙈 Скрыть деталь'}
      </button>
    </div>
  `;
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
  const p = parts.find(x => x.id === id);
  updateRightPanel(p);
  renderList();
}

// ═══════════════════════════════════════
//  СПИСОК ДЕТАЛЕЙ
// ═══════════════════════════════════════
function renderList() {
  const list = document.getElementById('partsList');
  const listDesktop = document.getElementById('partsListDesktop');
  if (list) list.innerHTML = '';
  if (listDesktop) listDesktop.innerHTML = '';

  parts.forEach(p => {
    const isHidden = hiddenIds.has(p.id);
    const color = getColor(p.material);

    // Мобил список (шторка)
    if (list) {
      const div = document.createElement('div');
      div.className = 'part-item' +
        (scanned.has(p.id) ? ' scanned' : '') +
        (selectedId === p.id ? ' active' : '') +
        (isHidden ? ' hidden-part' : '');
      div.id = 'pi-'+p.id;
      div.innerHTML = `
        <div class="part-swatch" style="background:${color}"></div>
        <div style="flex:1">
          <div class="part-name">${p.name}</div>
          <div class="part-code">${p.code}</div>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;cursor:pointer;opacity:0.5"
            onclick="event.stopPropagation();toggleVisibility(${p.id})">
            ${isHidden?'👁':'🙈'}
          </span>
          <div class="part-check ${scanned.has(p.id)?'done':''}">
            ${scanned.has(p.id)?'✅':'○'}
          </div>
        </div>
      `;
      div.onclick = () => { selectPart(p.id); closeDrawer(); };
      list.appendChild(div);
    }

    // Десктоп список
    if (listDesktop) {
      const div2 = document.createElement('div');
      div2.className = 'part-item' +
        (scanned.has(p.id) ? ' scanned' : '') +
        (selectedId === p.id ? ' active' : '') +
        (isHidden ? ' hidden-part' : '');
      div2.id = 'pid-'+p.id;
      div2.innerHTML = `
        <div class="part-swatch" style="background:${color}"></div>
        <div style="flex:1">
          <div class="part-name">${p.name}</div>
          <div class="part-code">${p.code}</div>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:11px;cursor:pointer;opacity:0.5"
            onclick="event.stopPropagation();toggleVisibility(${p.id})">
            ${isHidden?'👁':'🙈'}
          </span>
          <div class="part-check ${scanned.has(p.id)?'done':''}">
            ${scanned.has(p.id)?'✅':'○'}
          </div>
        </div>
      `;
      div2.onclick = () => selectPart(p.id);
      listDesktop.appendChild(div2);
    }
  });

  // Прогресс
  const done = scanned.size;
  const total = parts.length;
  if (total > 0) {
    document.getElementById('floatProgress').style.display = 'flex';
    document.getElementById('progressText').textContent = done + ' / ' + total;
    document.getElementById('fpFill').style.width = (done/total*100) + '%';
  }
}

// ═══════════════════════════════════════
//  QR СКАНЕР
// ═══════════════════════════════════════
let scanInterval = null;
document.getElementById('btnScan').addEventListener('click', openScanner);

function openScanner() {
  document.getElementById('scannerModal').classList.remove('hidden');
  const video = document.getElementById('video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      video.srcObject = stream;
      video.play();
      startQRScan();
    })
    .catch(() => alert('Нет доступа к камере'));
}

function closeScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
  const video = document.getElementById('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
  clearInterval(scanInterval);
}

function startQRScan() {
  const video = document.getElementById('video');
  const qrCanvas = document.getElementById('qrCanvas');
  const ctx = qrCanvas.getContext('2d');
  const status = document.getElementById('scanStatus');

  scanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    qrCanvas.width = video.videoWidth;
    qrCanvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    try {
      const img = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const code = jsQR(img.data, img.width, img.height, {
        inversionAttempts: "dontInvert"
      });
      if (code) {
        status.textContent = '✅ ' + code.data;
        status.style.color = '#00ff88';
        setTimeout(() => { handleScan(code.data); closeScanner(); }, 300);
      } else {
        status.textContent = '🔍 Сканирование...';
      }
    } catch(e) {
      status.textContent = 'Ошибка: ' + e.message;
    }
  }, 200);
}

function handleScan(code) {
  if (!code || !code.trim()) return;
  const p = parts.find(x => x.code === code.trim());
  if (!p) { alert('Деталь не найдена: ' + code); return; }
  scanned.add(p.id);
  selectPart(p.id);
  renderList();
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
checkMobile();