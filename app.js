// ═══════════════════════════════════════
//  ОСНОВНАЯ ЛОГИКА 3D + ШТОРКИ
// ═══════════════════════════════════════

let parts = [];
let selectedId = null;
let scanned = new Set();
let hiddenIds = new Set();
let meshMap = {};
let xrayEnabled = false;
let originalMaterials = new Map();
let autoRot = false;

// DOM элементы
let canvas, renderer, scene, camera;
let theta = 0.8, phi = 0.9, camDist = 3.5;
let target = new THREE.Vector3(0, 0.5, 0);
let isDragging = false, prevMouse = { x: 0, y: 0 };

// ═══════════════════════════════════════
//  ШТОРКИ
// ═══════════════════════════════════════

function openLeftDrawer() {
  document.getElementById('leftDrawer').classList.add('open');
}
function closeLeftDrawer() {
  document.getElementById('leftDrawer').classList.remove('open');
}
function openRightDrawer() {
  document.getElementById('rightDrawer').classList.add('open');
}
function closeRightDrawer() {
  document.getElementById('rightDrawer').classList.remove('open');
}

// ═══════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ THREE.JS
// ═══════════════════════════════════════

function initThree() {
  canvas = document.getElementById('canvas3d');
  const container = canvas.parentElement;
  
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c12);
  scene.fog = new THREE.FogExp2(0x0a0c12, 0.03);
  
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(3, 2.5, 3);
  
  // Освещение
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
  mainLight.position.set(5, 10, 5);
  scene.add(mainLight);
  scene.add(new THREE.DirectionalLight(0x88aaff, 0.4).position.set(-3, 2, -4));
  scene.add(new THREE.DirectionalLight(0xffaa88, 0.3).position.set(0, 2, -5));
  
  // Пол
  const gridHelper = new THREE.GridHelper(8, 20, 0x2a3a5a, 0x1a2a4a);
  gridHelper.position.y = -0.01;
  scene.add(gridHelper);
  
  // Управление
  setupControls();
  
  animate();
}

function setupControls() {
  canvas.addEventListener('touchstart', onTouchStart);
  canvas.addEventListener('touchmove', onTouchMove);
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  
  // Клик по детали
  canvas.addEventListener('click', onClickCanvas);
}

let touchStart = { x: 0, y: 0 };
let isPinching = false;
let startDistance = 0, startCamDist = 0;

function onTouchStart(e) {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1) {
    isDragging = true;
    touchStart = { x: touches[0].clientX, y: touches[0].clientY };
    prevMouse = { x: touches[0].clientX, y: touches[0].clientY };
    autoRot = false;
  } else if (touches.length === 2) {
    isPinching = true;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    startDistance = Math.sqrt(dx * dx + dy * dy);
    startCamDist = camDist;
  }
}

function onTouchMove(e) {
  e.preventDefault();
  const touches = e.touches;
  if (touches.length === 1 && isDragging) {
    const deltaX = touches[0].clientX - prevMouse.x;
    const deltaY = touches[0].clientY - prevMouse.y;
    theta -= deltaX * 0.008;
    phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - deltaY * 0.008));
    prevMouse = { x: touches[0].clientX, y: touches[0].clientY };
    updateCam();
  } else if (touches.length === 2 && isPinching) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    camDist = Math.max(0.5, Math.min(12, startCamDist + (startDistance - distance) * 0.015));
    updateCam();
  }
}

function onTouchEnd(e) {
  isDragging = false;
  isPinching = false;
}

function onMouseDown(e) {
  if (e.button === 0) {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    autoRot = false;
  }
}

function onMouseMove(e) {
  if (!isDragging) return;
  theta -= (e.clientX - prevMouse.x) * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (e.clientY - prevMouse.y) * 0.005));
  prevMouse = { x: e.clientX, y: e.clientY };
  updateCam();
}

function onMouseUp() { isDragging = false; }

function onWheel(e) {
  camDist = Math.max(0.5, Math.min(12, camDist + camDist * e.deltaY * 0.001));
  updateCam();
  e.preventDefault();
}

function onClickCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  let clientX, clientY;
  if (e.touches) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  const mouseVec = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouseVec, camera);
  const visibleMeshes = Object.values(meshMap).filter(m => m.visible === true);
  const hits = raycaster.intersectObjects(visibleMeshes);
  if (hits.length) {
    const hitId = hits[0].object.userData.partId;
    if (!hiddenIds.has(hitId)) selectPart(hitId);
  }
}

function updateCam() {
  camera.position.x = target.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + camDist * Math.cos(phi);
  camera.position.z = target.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(target);
}

function centerOnModel() {
  if (parts.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  parts.forEach(p => {
    if (!p._pos) return;
    minX = Math.min(minX, p._pos.x - p._size.x/2);
    maxX = Math.max(maxX, p._pos.x + p._size.x/2);
    minY = Math.min(minY, p._pos.y - p._size.y/2);
    maxY = Math.max(maxY, p._pos.y + p._size.y/2);
    minZ = Math.min(minZ, p._pos.z - p._size.z/2);
    maxZ = Math.max(maxZ, p._pos.z + p._size.z/2);
  });
  target.set((minX + maxX)/2, (minY + maxY)/2, (minZ + maxZ)/2);
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  camDist = Math.max(size * 1.5, 2);
  updateCam();
}

function animate() {
  requestAnimationFrame(animate);
  if (autoRot && !isDragging) {
    theta += 0.002;
    updateCam();
  }
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// ═══════════════════════════════════════
//  ЗАГРУЗКА ФАЙЛА
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
      closeLeftDrawer();
    } catch(err) {
      alert('Ошибка: ' + err.message);
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

function autoLayout(parts) {
  let minY = Infinity;
  parts.forEach(p => { if (p.pos && p.pos.y !== undefined) minY = Math.min(minY, p.pos.y); });
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
    p._pos = { 
      x: (p.pos.x + p.gab.w/2) * sc, 
      y: (p.pos.y - minY + p.gab.h/2) * sc, 
      z: (p.pos.z + p.gab.d/2) * sc 
    };
    p._size = { 
      x: Math.max(p.gab.w, 1) * sc, 
      y: Math.max(p.gab.h, 1) * sc, 
      z: Math.max(p.gab.d, 1) * sc 
    };
  });
}

function getColor(mat) {
  const m = (mat || '').toLowerCase();
  if (m.includes('белый') || m.includes('white')) return '#f0ede8';
  if (m.includes('дуб сонома') || m.includes('sonoma')) return '#c4a46b';
  if (m.includes('дуб') || m.includes('oak')) return '#b8935a';
  if (m.includes('венге') || m.includes('wenge')) return '#2d1f0f';
  if (m.includes('графит')) return '#4a4a4a';
  if (m.includes('хром')) return '#d4d4dc';
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
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(p._pos.x, p._pos.y, p._pos.z);
    mesh.userData = { partId: p.id, part: p };
    const edges = new THREE.EdgesGeometry(geo);
    mesh.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.15, transparent: true })));
    scene.add(mesh);
    meshMap[p.id] = mesh;
  });
  centerOnModel();
}

function selectPart(id) {
  selectedId = id;
  Object.values(meshMap).forEach(m => {
    m.material.emissive = new THREE.Color(0x000000);
    m.material.emissiveIntensity = 0;
  });
  if (meshMap[id]) {
    meshMap[id].material.emissive = new THREE.Color(0xff6600);
    meshMap[id].material.emissiveIntensity = 0.7;
  }
  updateRightPanel(parts.find(x => x.id === id));
  renderList();
  openRightDrawer();
}

function updateRightPanel(p) {
  const panel = document.getElementById('partInfo');
  if (!p) {
    panel.innerHTML = `<div class="no-select">👆 Нажми на деталь</div>`;
    return;
  }
  const isHidden = hiddenIds.has(p.id);
  const status = scanned.has(p.id) ? '<span style="color:#00ff88">✅ Отсканировано</span>' : '<span style="color:#ffd700">⏳ Ждёт</span>';
  panel.innerHTML = `
    <div class="info-block"><div class="info-label">Код</div><div class="info-value accent">${escapeHtml(p.code)}</div></div>
    <div class="info-block"><div class="info-label">Название</div><div class="info-value">${escapeHtml(p.name)}</div></div>
    <div class="info-block"><div class="info-label">Размеры</div>
      <div class="dim-row">
        <div class="dim-box"><div class="dk">Д</div><div class="dv">${p.L}</div></div>
        <div class="dim-box"><div class="dk">Ш</div><div class="dv">${p.W}</div></div>
        <div class="dim-box"><div class="dk">Т</div><div class="dv">${p.T}</div></div>
      </div>
    </div>
    <div class="info-block"><div class="info-label">Материал</div><div class="info-value" style="color:#ff6b35">${escapeHtml(p.material)}</div></div>
    <div class="info-block"><div class="info-label">Статус</div>${status}</div>
    <button class="btn-toggle-vis" onclick="toggleVisibility(${p.id})">${isHidden ? '👁 Показать' : '🙈 Скрыть'}</button>
    <button class="btn-toggle-vis" onclick="smoothZoomToPart(${p.id})">🔍 Приблизить</button>
    <button class="btn-toggle-vis" onclick="toggleXray()">${xrayEnabled ? '🔘 Рентген ВЫКЛ' : '🔘 Рентген'}</button>
    <button class="btn-toggle-vis" onclick="showAll()">🎯 Показать всё</button>
  `;
}

function toggleVisibility(id) {
  if (hiddenIds.has(id)) {
    hiddenIds.delete(id);
    meshMap[id].visible = true;
  } else {
    hiddenIds.add(id);
    meshMap[id].visible = false;
  }
  if (selectedId === id && hiddenIds.has(id)) {
    selectedId = null;
    Object.values(meshMap).forEach(m => m.material.emissiveIntensity = 0);
    updateRightPanel(null);
    closeRightDrawer();
  }
  renderList();
}

function toggleXray() {
  xrayEnabled = !xrayEnabled;
  Object.values(meshMap).forEach(mesh => {
    if (xrayEnabled && selectedId !== null && mesh.userData.partId !== selectedId && mesh.visible) {
      mesh.material.transparent = true;
      mesh.material.opacity = 0.25;
    } else {
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
    }
  });
  updateRightPanel(parts.find(x => x.id === selectedId));
}

function showAll() {
  selectedId = null;
  hiddenIds.clear();
  Object.values(meshMap).forEach(m => { m.visible = true; m.material.emissiveIntensity = 0; });
  if (xrayEnabled) toggleXray();
  centerOnModel();
  updateRightPanel(null);
  renderList();
  closeRightDrawer();
}

function smoothZoomToPart(partId) {
  const p = parts.find(x => x.id === partId);
  if (!p || !p._pos) return;
  target.set(p._pos.x, p._pos.y, p._pos.z);
  camDist = 0.6;
  updateCam();
}

function renderList() {
  const list = document.getElementById('partsList');
  if (!list) return;
  list.innerHTML = '';
  parts.forEach(p => {
    const isHidden = hiddenIds.has(p.id);
    const color = getColor(p.material);
    const div = document.createElement('div');
    div.className = `part-item ${scanned.has(p.id) ? 'scanned' : ''} ${selectedId === p.id ? 'active' : ''} ${isHidden ? 'hidden-part' : ''}`;
    div.id = 'pi-' + p.id;
    div.innerHTML = `
      <div class="part-swatch" style="background:${color}"></div>
      <div style="flex:1">
        <div class="part-name">${escapeHtml(p.name)}</div>
        <div class="part-code">${escapeHtml(p.code)}</div>
      </div>
      <div class="part-check ${scanned.has(p.id) ? 'done' : ''}">${scanned.has(p.id) ? '✅' : '○'}</div>
    `;
    div.onclick = (e) => { e.stopPropagation(); selectPart(p.id); };
    list.appendChild(div);
  });
}

function escapeHtml(str) { return (str || '').replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }

// ═══════════════════════════════════════
//  QR СКАНЕР
// ═══════════════════════════════════════

let scanInterval = null;
let videoStream = null;

function openScanner() {
  document.getElementById('scannerModal').classList.remove('hidden');
  const video = document.getElementById('video');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
    .then(stream => {
      videoStream = stream;
      video.srcObject = stream;
      video.play();
      startQRScan();
    })
    .catch(() => alert('Нет доступа к камере'));
}

function closeScanner() {
  document.getElementById('scannerModal').classList.add('hidden');
  if (videoStream) videoStream.getTracks().forEach(t => t.stop());
  if (scanInterval) clearInterval(scanInterval);
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
    const img = ctx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
    const code = jsQR(img.data, img.width, img.height);
    if (code) {
      status.textContent = '✅ Найдено: ' + code.data;
      setTimeout(() => { handleScan(code.data); closeScanner(); }, 300);
    }
  }, 200);
}

function handleManualCode() {
  const code = document.getElementById('manualCode').value.trim();
  if (code) handleScan(code);
  closeScanner();
}

function handleScan(code) {
  let found = parts.find(x => x.code === code || x.code === code.trim() || x.code.toLowerCase() === code.toLowerCase());
  if (!found) found = parts.find(x => code.includes(x.code) || x.code.includes(code));
  if (!found) {
    alert('❌ Деталь не найдена!\nКод: ' + code);
    return;
  }
  scanned.add(found.id);
  selectPart(found.id);
  renderList();
  showToast('✅ Отсканировано: ' + found.name);
  smoothZoomToPart(found.id);
}

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#00ff88;padding:10px 20px;border-radius:30px;font-size:14px;z-index:200;pointer-events:none';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(() => toast.style.opacity = '0', 2000);
}

// ═══════════════════════════════════════
//  ЗАПУСК
// ═══════════════════════════════════════

function initApp() {
  initThree();
  window.addEventListener('resize', () => {
    const container = canvas.parentElement;
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  });
  setTimeout(() => {
    const container = canvas.parentElement;
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  }, 100);
  
  document.getElementById('menuBtn').onclick = openLeftDrawer;
  document.getElementById('scanFloatBtn').onclick = openScanner;
  document.getElementById('rotateBtn').onclick = () => { autoRot = !autoRot; };
  document.getElementById('resetViewBtn').onclick = () => { centerOnModel(); };
}