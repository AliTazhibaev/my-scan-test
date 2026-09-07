// === Main App Logic ===
const CONFIG = {
  FOG_DENSITY: 0.012,
  MAX_PIXEL_RATIO: 2,
  CAMERA_FOV: 45,
  TOUCH_ROTATION_SPEED: 0.008,
  MOUSE_ROTATION_SPEED: 0.005,
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 80,
  EXPLODE_DURATION: 600,
  ASSEMBLY_INTERVAL: 1500,
  QR_SCAN_INTERVAL: 200,
  TOAST_DURATION: 2000,
  MATERIAL_DENSITY: 6.5e-7,
  AUTO_ROTATE_SPEED: 0.0025,
  TAP_THRESHOLD: 5,
  PAN_THRESHOLD: 8,
  SCALE_FACTOR: 0.001,
};

let parts = [];
let selectedId = null;
let scannedSet = new Set();
let hiddenSet = new Set();
let idMode = localStorage.getItem("aivoIdMode") || "designation";
let meshMap = new Map();
let edgeLineMap = new Map();
let xrayActive = false;
let isDarkTheme = true;
let explodeActive = false;
let explodeProgress = 0;
let originalPositions = new Map();
let moduleMap = new Map();
let assemblyMode = false;
let assemblyIndex = 0;
let assemblyOrder = [];
let assemblyPlaying = false;
let assemblyTimer = null;
let fastenerData = [];
let csgEnabled = true;
let fastenerMeshes = [];
let scene;
let camera;
let renderer;
let theta = 0.8;
let phi = 0.9;
let camDist = 3.5;
let targetPosition = new THREE.Vector3(0, 0.5, 0);
let isDragging = false;
let prevMouse = {
  x: 0,
  y: 0
};
let autoRotate = false;
let isSmoothZoom = false;
let zoomTarget = new THREE.Vector3();
let touchStartPos = null;
let isPinching = false;
let pinchStartDist = 0;
let pinchStartCamDist = 0;
let isPanning = false;
let panStartMid = null;
let panStartTarget = null;
let mouseStartPos = null;
let mouseMovedDistance = 0;
let isPanningMouse = false;
let panStartMouse = null;
const MODULE_COLORS = ["#00d4aa", "#ff6b6b", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#34d399", "#e879f9", "#06b6d4", "#8b5cf6", "#ef4444", "#10b981", "#f59e0b", "#ec4899", "#14b8a6", "#84cc16", "#6366f1", "#f97316", "#22d3ee", "#a855f7", "#e11d48", "#059669", "#d97706", "#d946ef", "#0891b2", "#65a30d", "#4f46e5", "#ea580c"];
const colorCache = new Map();
let colorIdx = 0;
function getModulePrefix(partCode) {
  if (!partCode) {
    return "OTHER";
  }
  const matchResult = partCode.match(/^([A-Z]+\d*_\d+)/);
  if (matchResult) {
    return matchResult[1];
  }
  return "OTHER";
}
function getModuleKey(code) {
  const prefix = getModulePrefix(code);
  if (prefix === "OTHER") {
    return "OTHER";
  }
  if (prefix.startsWith("D-")) {
    return "HARDWARE";
  }
  const keyMatch = prefix.match(/^([A-Z]+\d*_\d+)/);
  if (keyMatch) {
    return keyMatch[1];
  }
  return prefix;
}
function getModuleColor(materialName) {
  const moduleKey = getModuleKey(materialName);
  if (moduleKey === "HARDWARE") {
    return "#94a3b8";
  }
  if (moduleKey === "OTHER") {
    return "#6b7280";
  }
  if (colorCache.has(moduleKey)) {
    return colorCache.get(moduleKey);
  }
  const assignedColor = MODULE_COLORS[colorIdx % MODULE_COLORS.length];
  colorIdx++;
  colorCache.set(moduleKey, assignedColor);
  return assignedColor;
}
function getModuleName(partCodeForName, groupName) {
  if (groupName) return groupName;
  const moduleKeyName = getModuleKey(partCodeForName);
  if (moduleKeyName === "HARDWARE") {
    return "Фурнитура";
  }
  if (moduleKeyName === "OTHER") {
    return "Прочее";
  }
  return moduleKeyName;
}
function initTheme() {
  isDarkTheme = localStorage.getItem("aivoTheme") !== "light";
  applyTheme();
}
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  localStorage.setItem("aivoTheme", isDarkTheme ? "dark" : "light");
  applyTheme();
}
function applyTheme() {
  if (isDarkTheme) {
    document.body.classList.remove("light-theme");
    document.getElementById("themeToggle").innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    if (scene) {
      scene.background.setHex(0x141416);
      if (floor) floor.material.color.setHex(0x3a3a3e);
      if (wall) wall.material.color.setHex(0x444448);
    }
    if (scene) {
      scene.fog.color.setHex(0x141416);
    }
  } else {
    document.body.classList.add("light-theme");
    document.getElementById("themeToggle").innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    if (scene) {
      scene.background.setHex(0xf0f0f2);
      if (floor) floor.material.color.setHex(0xc0c0c4);
      if (wall) wall.material.color.setHex(0xd0d0d4);
    }
    if (scene) {
      scene.fog.color.setHex(0xf0f0f2);
    }
  }
}
const canvas = document.getElementById("canvas3d");
var floor = null;
var wall = null;
function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(isDarkTheme ? 0x141416 : 0xf0f0f2);
  scene.fog = new THREE.FogExp2(isDarkTheme ? 0x141416 : 0xf0f0f2, 0.012);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(3, 2.5, 3);
  const ambientLight = new THREE.AmbientLight(0x666666, 1.8);
  scene.add(ambientLight);
  const mainLight = new THREE.DirectionalLight(16777215, 1);
  mainLight.position.set(10, 20, 10);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.left = -50;
  mainLight.shadow.camera.right = 50;
  mainLight.shadow.camera.top = 50;
  mainLight.shadow.camera.bottom = -50;
  mainLight.shadow.bias = -0.001;
  mainLight.shadow.radius = 4;
  scene.add(mainLight);
  const fillLight = new THREE.DirectionalLight(8956671, 0.45);
  fillLight.position.set(-5, 4, -8);
  scene.add(fillLight);
  // Room — floor: 20m wide, 10m deep, one-sided (visible from above only)
  var floorGeo = new THREE.PlaneGeometry(20, 10);
  var floorMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x3a3a3e : 0xc0c0c4,
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.35
  });
  floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // Grid on the floor - subtle, not too harsh
  var gridHelper = new THREE.GridHelper(20, 40, 0x00d4aa, 0x00d4aa);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.06;
  gridHelper.position.y = 0.001;
  scene.add(gridHelper);

  // Room — back wall: 20m wide, 5m tall, one-sided
  var wallGeo = new THREE.PlaneGeometry(20, 5);
  var wallMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x444448 : 0xd0d0d4,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.25
  });
  wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 2.5, -5);
  wall.receiveShadow = true;
  scene.add(wall);
  setupControls();
  animate();
}
function setupControls() {
  canvas.addEventListener("touchstart", onTouchStart, {
    passive: false
  });
  canvas.addEventListener("touchmove", onTouchMove, {
    passive: false
  });
  canvas.addEventListener("touchend", onTouchEnd, {
    passive: false
  });
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, {
    passive: false
  });
  canvas.addEventListener("contextmenu", function(e) { e.preventDefault(); });
}
function onTouchStart(touchEvent) {
  touchEvent.preventDefault();
  const touches = touchEvent.touches;
  if (touches.length === 1) {
    touchStartPos = {
      x: touches[0].clientX,
      y: touches[0].clientY
    };
    isDragging = true;
    prevMouse = {
      x: touches[0].clientX,
      y: touches[0].clientY
    };
    autoRotate = false;
  } else if (touches.length === 2) {
    isPinching = true;
    isDragging = false;
    isPanning = false;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartCamDist = camDist;
    panStartMid = {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
    panStartTarget = targetPosition.clone();
  }
}
function onTouchMove(moveEvent) {
  moveEvent.preventDefault();
  const moveTouches = moveEvent.touches;
  if (moveTouches.length === 1 && isDragging) {
    theta -= (moveTouches[0].clientX - prevMouse.x) * 0.008;
    phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (moveTouches[0].clientY - prevMouse.y) * 0.008));
    prevMouse = {
      x: moveTouches[0].clientX,
      y: moveTouches[0].clientY
    };
    updateCamera();
  } else if (moveTouches.length === 2 && isPinching) {
    const pinchDx = moveTouches[0].clientX - moveTouches[1].clientX;
    const pinchDy = moveTouches[0].clientY - moveTouches[1].clientY;
    const currentDist = Math.hypot(pinchDx, pinchDy);
    const distRatio = currentDist / pinchStartDist;
    const midX = (moveTouches[0].clientX + moveTouches[1].clientX) / 2;
    const midY = (moveTouches[0].clientY + moveTouches[1].clientY) / 2;
    const midDx = midX - panStartMid.x;
    const midDy = midY - panStartMid.y;
    const midMove = Math.hypot(midDx, midDy);
    const distChange = Math.abs(distRatio - 1);
    if (!isPanning && midMove > 8 && distChange < 0.08) {
      isPanning = true;
    }
    if (isPanning && panStartTarget) {
      const panSpeed = camDist * 0.0012;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      targetPosition.copy(panStartTarget);
      targetPosition.addScaledVector(right, -midDx * panSpeed);
      targetPosition.addScaledVector(up, midDy * panSpeed);
    } else {
      camDist = Math.max(0.5, Math.min(80, pinchStartCamDist / distRatio));
    }
    updateCamera();
  }
}
function onTouchEnd(endEvent) {
  if (touchStartPos && !isPinching) {
    const canvasRect = canvas.getBoundingClientRect();
    const changedTouch = endEvent.changedTouches[0];
    if (Math.abs(changedTouch.clientX - touchStartPos.x) < 5 && Math.abs(changedTouch.clientY - touchStartPos.y) < 5) {
      handleRaycast(changedTouch.clientX, changedTouch.clientY, canvasRect);
    }
  }
  isDragging = false;
  isPinching = false;
  isPanning = false;
  panStartMid = null;
  panStartTarget = null;
  touchStartPos = null;
}
function onMouseDown(mouseEvent) {
  if (mouseEvent.button === 0) {
    mouseStartPos = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    mouseMovedDistance = 0;
    isDragging = true;
    prevMouse = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    autoRotate = false;
  } else if (mouseEvent.button === 2) {
    isPanningMouse = true;
    panStartMouse = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    panStartTarget = targetPosition.clone();
  }
}
function onMouseMove(moveEvt) {
  if (isPanningMouse && panStartMouse && panStartTarget) {
    const midDx = moveEvt.clientX - panStartMouse.x;
    const midDy = moveEvt.clientY - panStartMouse.y;
    const panSpeed = camDist * 0.0012;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
    targetPosition.copy(panStartTarget);
    targetPosition.addScaledVector(right, -midDx * panSpeed);
    targetPosition.addScaledVector(up, midDy * panSpeed);
    updateCamera();
    return;
  }
  if (!isDragging) {
    return;
  }
  const deltaX = moveEvt.clientX - prevMouse.x;
  const deltaY = moveEvt.clientY - prevMouse.y;
  mouseMovedDistance += Math.abs(deltaX) + Math.abs(deltaY);
  theta -= deltaX * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - deltaY * 0.005));
  prevMouse = {
    x: moveEvt.clientX,
    y: moveEvt.clientY
  };
  updateCamera();
}
function onMouseUp() {
  if (isDragging && mouseStartPos && mouseMovedDistance < 5) {
    const canvasRect = canvas.getBoundingClientRect();
    handleRaycast(mouseStartPos.x, mouseStartPos.y, canvasRect);
  }
  isDragging = false;
  isPanningMouse = false;
  panStartMouse = null;
  mouseStartPos = null;
  mouseMovedDistance = 0;
}
function onWheel(wheelEvent) {
  wheelEvent.preventDefault();
  camDist = Math.max(0.5, Math.min(80, camDist + camDist * wheelEvent.deltaY * 0.001));
  updateCamera();
}
function updateCamera() {
  if (isSmoothZoom) {
    return;
  }
  camera.position.x = targetPosition.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = targetPosition.y + camDist * Math.cos(phi);
  camera.position.z = targetPosition.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(targetPosition);
}
let zoomPartCenter = null;
function startSmoothZoom(partId) {
  const part = parts.find(p => p.id === partId);
  if (!part || !part._pos) {
    return;
  }
  zoomPartCenter = new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z);
  const size = Math.max(part._size.x, part._size.y, part._size.z);
  const dist = Math.max(size * 2.5, 0.8);
  const dir = camera.position.clone().sub(zoomPartCenter).normalize();
  zoomTarget.set(
    part._pos.x + dir.x * dist,
    part._pos.y + dir.y * dist,
    part._pos.z + dir.z * dist
  );
  isSmoothZoom = true;
  autoRotate = false;
}
function animateSmoothZoom() {
  if (!isSmoothZoom) {
    return;
  }
  const lerpFactor = 0.12;
  camera.position.lerp(zoomTarget, lerpFactor);
  if (zoomPartCenter) {
    targetPosition.lerp(zoomPartCenter, lerpFactor);
  }
  camera.lookAt(targetPosition);
  if (camera.position.distanceTo(zoomTarget) < 0.15) {
    isSmoothZoom = false;
    if (zoomPartCenter) {
      targetPosition.copy(zoomPartCenter);
    }
    camDist = camera.position.distanceTo(targetPosition);
    zoomPartCenter = null;
  }
}
let prevClickKey = null;
function deselectPart() {
  if (selectedId === null) return;
  selectedId = null;
  meshMap.forEach(mesh => {
    mesh.material.emissive.setHex(0);
    mesh.material.emissiveIntensity = 0;
  });
  edgeLineMap.forEach(edgeLine => {
    edgeLine.material.color.setHex(0x1a1a1a);
  });
  if (xrayActive) {
    applyXray();
  }
  updateSheet(null);
  closeSheet();
  renderPartsList();
}
function handleRaycast(clickX, clickY, rect) {
  const mouse = new THREE.Vector2();
  mouse.x = (clickX - rect.left) / rect.width * 2 - 1;
  mouse.y = -((clickY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const meshes = Array.from(meshMap.values()).filter(m => m.visible === true);
  if (typeof detailMeshes !== 'undefined') {
    detailMeshes.forEach(arr => {
      arr.forEach(m => { if (m.visible && m.userData && m.userData.partId) meshes.push(m); });
    });
  }
  if (typeof fastenerMeshes !== 'undefined') {
    fastenerMeshes.forEach(m => { if (m.visible && m.userData && m.userData.fastenerId !== undefined) meshes.push(m); });
  }
  const hits = rc.intersectObjects(meshes);
  if (hits.length === 0) {
    deselectPart();
    return;
  }
  // Check if a fastener was clicked
  for (let i = 0; i < hits.length; i++) {
    const ud = hits[i].object.userData;
    if (ud && ud.fastenerId !== undefined) {
      const f = fastenerData.find(fd => fd.id === ud.fastenerId);
      if (f) {
        showToast("🔧 " + (f.name || "Фурнитура") + " [" + (f.type || "?") + "]");
      }
      return;
    }
  }
  const seen = {};
  const unique = [];
  for (let i = 0; i < hits.length; i++) {
    const pid = hits[i].object.userData.partId;
    if (pid !== undefined && !seen[pid]) { seen[pid] = true; unique.push({ id: pid, dist: hits[i].distance, obj: hits[i].object }); }
  }
  if (unique.length === 0) return;
  let bestId = unique[0].id;
  let bestVol = Infinity;
  const closestDist = unique[0].dist;
  for (let k = 0; k < unique.length; k++) {
    if (unique[k].dist - closestDist > 0.01) break;
    const geo = unique[k].obj.geometry;
    const params = geo.parameters || {};
    const vol = (params.width || 1) * (params.height || 1) * (params.depth || 1);
    if (vol < bestVol) { bestVol = vol; bestId = unique[k].id; }
  }
  const clickKey = Math.round(clickX * 10) + ',' + Math.round(clickY * 10);
  if (clickKey === prevClickKey && unique.length > 1) {
    let idx = 0;
    for (let m = 0; m < unique.length; m++) { if (unique[m].id === bestId) { idx = m; break; } }
    bestId = unique[(idx + 1) % unique.length].id;
  }
  prevClickKey = clickKey;
  if (!hiddenSet.has(bestId)) {
    selectPart(bestId);
  }
}
let layoutMinY = 0;
function autoLayout(partsArr) {
  let minY = Infinity;
  partsArr.forEach(part => {
    if (part.pos && part.pos.y !== undefined) {
      minY = Math.min(minY, part.pos.y);
    }
  });
  if (minY === Infinity) {
    minY = 0;
  }
  layoutMinY = minY;
  const scaleFactor = 0.001;
  partsArr.forEach(p => {
    if (!p.pos || !p.gab) {
      const gridSize = Math.ceil(Math.sqrt(partsArr.length));
      const row = Math.floor(p.id / gridSize);
      const col = p.id % gridSize;
      p._pos = {
        x: (col - gridSize / 2) * 0.15,
        y: 0,
        z: (row - gridSize / 2) * 0.15
      };
      p._size = {
        x: 0.1,
        y: 0.1,
        z: 0.1
      };
      return;
    }
    p._pos = {
      x: (p.pos.x + p.gab.w / 2) * scaleFactor,
      y: (p.pos.y - minY + p.gab.h / 2) * scaleFactor,
      z: (p.pos.z + p.gab.d / 2) * scaleFactor - 4
    };
    p._size = {
      x: Math.max(p.gab.w, 1) * scaleFactor,
      y: Math.max(p.gab.h, 1) * scaleFactor,
      z: Math.max(p.gab.d, 1) * scaleFactor
    };
  });
}
// ═══════════════════════════════════════
//  ПРОЦЕДУРНЫЕ ТЕКСТУРЫ (как у detalqr)
// ═══════════════════════════════════════
const _texCache = new Map();
let _envTex = null;

function _rndGen(seed) {
  let s = seed || 12345;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function _genWood(base, dark, seed) {
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), rnd = _rndGen(seed);
  const bc = parseInt(base.slice(1), 16);
  const br = (bc >> 16) & 255, bg = (bc >> 8) & 255, bb = bc & 255;
  const dc = parseInt(dark.slice(1), 16);
  const dr = (dc >> 16) & 255, dg = (dc >> 8) & 255, db = dc & 255;
  const img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      // Волокна дерева — синусоидальные полосы
      const grain = Math.sin((x + rnd() * 8) * 0.18 + y * 0.04 + rnd() * 2) * 0.5 + 0.5;
      const noise = (rnd() - 0.5) * 18;
      const t = Math.max(0, Math.min(1, grain));
      d[i]   = Math.max(0, Math.min(255, br + (dr - br) * t + noise));
      d[i+1] = Math.max(0, Math.min(255, bg + (dg - bg) * t + noise));
      d[i+2] = Math.max(0, Math.min(255, bb + (db - bb) * t + noise));
      d[i+3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function _genPlain(base, seed, amp) {
  const N = 256, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), rnd = _rndGen(seed);
  const bc = parseInt(base.slice(1), 16);
  const br = (bc >> 16) & 255, bg = (bc >> 8) & 255, bb = bc & 255;
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < N * N; i++) {
    const o = (rnd() - 0.5) * 2 * amp, j = i * 4;
    d[j]   = Math.max(0, Math.min(255, br + o));
    d[j+1] = Math.max(0, Math.min(255, bg + o));
    d[j+2] = Math.max(0, Math.min(255, bb + o));
    d[j+3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function _mkTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

function getEnvMap() {
  if (_envTex) return _envTex;
  try {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#f2f2f0'); gr.addColorStop(0.48, '#c9c9c7');
    gr.addColorStop(0.55, '#75757a'); gr.addColorStop(1, '#404044');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 32);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    _envTex = pm.fromEquirectangular(t).texture;
    t.dispose(); pm.dispose();
  } catch(e) { _envTex = null; }
  return _envTex;
}

function _matFinish(matName) {
  const m = (matName || '').toLowerCase();
  // Зеркало
  if (m.match(/зеркал|mirror/)) return { kind: 'mirror' };
  // Стекло
  if (m.match(/стекл|glass/)) return { kind: 'glass' };
  // Металл/алюминий
  if (m.match(/алюмин|метал|aluminum|metal|профил/)) return { kind: 'metal', mcol: '#b8bcc2' };
  // Дерево
  if (m.match(/дуб сонома|sonoma/))    return { kind: 'wood', base: '#d4af8f', dark: '#a07848', seed: 1001, gloss: false };
  if (m.match(/дуб|oak/))             return { kind: 'wood', base: '#c4a060', dark: '#8c6030', seed: 1002, gloss: false };
  if (m.match(/гикори|hickory|рокфорд/)) return { kind: 'wood', base: '#8b6f47', dark: '#5a4020', seed: 1003, gloss: false };
  if (m.match(/орех|walnut|nut/))     return { kind: 'wood', base: '#7a5840', dark: '#3c2010', seed: 1004, gloss: false };
  if (m.match(/венге|wenge/))         return { kind: 'wood', base: '#3b2a1c', dark: '#1a0e08', seed: 1005, gloss: false };
  if (m.match(/ясень|ash/))           return { kind: 'wood', base: '#d4c4a0', dark: '#a09060', seed: 1006, gloss: false };
  if (m.match(/сосна|pine/))          return { kind: 'wood', base: '#deb887', dark: '#a08040', seed: 1007, gloss: false };
  if (m.match(/бук|beech/))           return { kind: 'wood', base: '#c8a882', dark: '#907848', seed: 1008, gloss: false };
  if (m.match(/каселла|casella/))     return { kind: 'wood', base: '#7a5c3a', dark: '#3c2010', seed: 1009, gloss: false };
  if (m.match(/ликольн|lincoln/))     return { kind: 'wood', base: '#6b5340', dark: '#302010', seed: 1010, gloss: false };
  // Однотонные (ЛДСП, МДФ)
  if (m.match(/белый|white|pearl|cream|ivory/)) return { kind: 'plain', base: '#ece7e0', seed: 2001, gloss: m.match(/глянц|глянс|gloss|высок/) ? true : false };
  if (m.match(/серый|grey|gray|кашемир/))       return { kind: 'plain', base: '#8a8a96', seed: 2002, gloss: false };
  if (m.match(/черный|black|graphit|графит/))   return { kind: 'plain', base: '#2a2a30', seed: 2003, gloss: m.match(/глянц|глянс|gloss/) ? true : false };
  if (m.match(/бежев|beige/))                   return { kind: 'plain', base: '#d8c8a8', seed: 2004, gloss: false };
  if (m.match(/хдф|hdf/))                       return { kind: 'plain', base: '#d8dce6', seed: 2005, gloss: false };
  if (m.match(/мдф|mdf/))                       return { kind: 'plain', base: '#c8b898', seed: 2006, gloss: false };
  if (m.match(/лдсп|ldsp/))                     return { kind: 'plain', base: '#c4a46b', seed: 2007, gloss: false };
  return { kind: 'plain', base: '#b0a898', seed: 9999, gloss: false };
}

function genMatTex(matName) {
  const key = matName || '';
  if (_texCache.has(key)) return _texCache.get(key);
  const f = _matFinish(key);
  let cv = null, mm = 800;
  if (f.kind === 'wood') { cv = _genWood(f.base, f.dark, f.seed); mm = 900; }
  else if (f.kind === 'plain') { cv = _genPlain(f.base, f.seed, f.gloss ? 2 : 7); mm = 300; }
  const out = {
    kind: f.kind, gloss: f.gloss, mcol: f.mcol,
    map: cv ? _mkTex(cv) : null, mm: mm,
    rough: f.kind === 'wood' ? (f.gloss ? 0.34 : 0.72) : (f.gloss ? 0.18 : 0.78),
    base: f.base || '#b0a898'
  };
  _texCache.set(key, out);
  return out;
}

function bakeUV(geo, sx, sy, swap) {
  const uv = geo.attributes && geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (swap) { const tmp = u; u = v; v = tmp; }
    uv.setXY(i, u * sx, v * sy);
  }
  uv.needsUpdate = true;
}

function getColor(materialStr, partData) {
  const f = _matFinish(materialStr || '');
  return f.base || '#b0a898';
}
function buildPartDetails(partInfo, meshObj) {
  const detailArr = [];
  const grooves = partInfo.grooves || [];
  const holes = partInfo.holes || [];
  const cutouts = partInfo.cutouts || [];
  const edges = partInfo.edges || [];
  if (!grooves.length && !holes.length && !cutouts.length && !edges.length) {
    return detailArr;
  }
  const meshPos = meshObj.position;
  const panelW = (partInfo.L || 100) * sc;
  const panelH = (partInfo.W || 100) * sc;
  const panelT = (partInfo.T || 16) * sc;

  // --- Пазы: тёмные линии на поверхности панели ---
  grooves.forEach(groove => {
    const grooveW = (groove.width || groove.w || 20) * sc;
    const grooveH = (groove.length || groove.h || 20) * sc;
    const grooveD = (groove.depth || groove.d || 4) * sc;
    const grooveGeo = new THREE.BoxGeometry(grooveW, grooveH, grooveD);
    const grooveMat = new THREE.MeshStandardMaterial({
      color: 1118481,
      roughness: 0.95,
      metalness: 0
    });
    const grooveMesh = new THREE.Mesh(grooveGeo, grooveMat);
    grooveMesh.position.set(
      meshPos.x + (groove.x || 0) * sc,
      meshPos.y + (groove.y || 0) * sc,
      meshPos.z + (groove.z || 0) * sc
    );
    grooveMesh.userData = { partId: partInfo.id, detailType: "groove" };
    scene.add(grooveMesh);
    const grooveEdgeGeo = new THREE.EdgesGeometry(grooveGeo, 15);
    const grooveEdgeLine = new THREE.LineSegments(grooveEdgeGeo, new THREE.LineBasicMaterial({ color: 3355443 }));
    grooveEdgeLine.position.copy(grooveMesh.position);
    scene.add(grooveEdgeLine);
    detailArr.push(grooveMesh, grooveEdgeLine);
  });

  // --- Отверстия: тёмные цилиндры (v4: drillMode) ---
  holes.forEach(hole => {
    const holeRadius = (hole.diameter || hole.d || hole.r || 8) / 2 * sc;
    const holeDepth = hole.depth ? hole.depth * sc : panelT;
    const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
      metalness: 0.4,
      transparent: true,
      opacity: 0.9
    });
    const holeMesh = new THREE.Mesh(holeGeo, holeMat);
    holeMesh.position.set(
      meshPos.x + ((hole.x || 0) - (partInfo.L || 0) / 2) * sc,
      meshPos.y + ((hole.y || 0) - (partInfo.W || 0) / 2) * sc,
      meshPos.z + (hole.z || 0) * sc
    );
    // v4: drillMode — ориентация отверстия
    if (hole.drillMode === 1) {
      holeMesh.rotation.z = Math.PI / 2;
    } else if (hole.angleX) {
      holeMesh.rotation.x = hole.angleX * Math.PI / 180;
    } else if (hole.angleZ) {
      holeMesh.rotation.z = hole.angleZ * Math.PI / 180;
    }
    holeMesh.userData = { partId: partInfo.id, detailType: "hole" };
    scene.add(holeMesh);
    const holeRingGeo = new THREE.RingGeometry(holeRadius * 0.7, holeRadius, 24);
    const holeRingMat = new THREE.MeshBasicMaterial({ color: 0x00D4AA, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const holeRingFront = new THREE.Mesh(holeRingGeo, holeRingMat);
    holeRingFront.position.copy(holeMesh.position);
    if (hole.drillMode === 1) {
      holeRingFront.rotation.z = Math.PI / 2;
      holeRingFront.position.x += panelT / 2 + 0.0001;
    } else {
      holeRingFront.position.z += panelT / 2 + 0.0001;
    }
    scene.add(holeRingFront);
    detailArr.push(holeMesh, holeRingFront);
  });

  // --- Вырезы: CSG-стиль — тёмные объёмные блоки с контуром ---
  cutouts.forEach(cutout => {
    const cutoutW = (cutout.w || 30) * sc;
    const cutoutH = (cutout.h || 30) * sc;
    const cutoutD = cutout.d ? cutout.d * sc : panelT;
    const cutoutGeo = new THREE.BoxGeometry(cutoutW, cutoutH, cutoutD);
    const cutoutMat = new THREE.MeshStandardMaterial({
      color: 3355443,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.85,
      emissive: 1315860,
      emissiveIntensity: 0.3
    });
    const cutoutMesh = new THREE.Mesh(cutoutGeo, cutoutMat);
    cutoutMesh.position.set(
      meshPos.x + ((cutout.x || 0) - (partInfo.L || 0) / 2) * sc + cutoutW / 2,
      meshPos.y + ((cutout.y || 0) - (partInfo.W || 0) / 2) * sc + cutoutH / 2,
      meshPos.z + (cutout.z || 0) * sc
    );
    cutoutMesh.userData = { partId: partInfo.id, detailType: "cutout" };
    scene.add(cutoutMesh);
    const cutoutEdgeGeo = new THREE.EdgesGeometry(cutoutGeo, 15);
    const cutoutEdgeLine = new THREE.LineSegments(cutoutEdgeGeo, new THREE.LineBasicMaterial({ color: 16744448 }));
    cutoutEdgeLine.position.copy(cutoutMesh.position);
    scene.add(cutoutEdgeLine);
    // Стрелка-индикатор выреза (треугольник)
    const arrowGeo = new THREE.BufferGeometry();
    const arrowVerts = new Float32Array([
      -cutoutW * 0.3, -cutoutH * 0.15, 0,
       cutoutW * 0.3,  0, 0,
      -cutoutW * 0.3,  cutoutH * 0.15, 0
    ]);
    arrowGeo.setAttribute("position", new THREE.BufferAttribute(arrowVerts, 3));
    const arrowMat = new THREE.MeshBasicMaterial({ color: 16744448, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(cutoutMesh.position.x, cutoutMesh.position.y, meshPos.z + panelT / 2 + 0.0005);
    scene.add(arrowMesh);
    detailArr.push(cutoutMesh, cutoutEdgeLine, arrowMesh);
  });

  // --- Кромки: тонкие полосы ---
  edges.forEach(edge => {
    const edgeSide = (edge.side || "").toLowerCase();
    const edgeLen = (edge.length || 0) * sc;
    const edgeThick = 0.003;
    let edgeW, edgeH, edgeD, edgeX, edgeY, edgeZ;
    if (edgeSide.includes("w") || edgeSide.includes("длин")) {
      edgeW = edgeLen || panelW;
      edgeH = edgeThick;
      edgeD = panelT;
      edgeX = meshPos.x;
      edgeY = meshPos.y + panelH / 2;
      edgeZ = meshPos.z;
    } else if (edgeSide.includes("h") || edgeSide.includes("выс")) {
      edgeW = edgeThick;
      edgeH = edgeLen || panelH;
      edgeD = panelT;
      edgeX = meshPos.x + panelW / 2;
      edgeY = meshPos.y;
      edgeZ = meshPos.z;
    } else {
      edgeW = panelW;
      edgeH = edgeThick;
      edgeD = panelT;
      edgeX = meshPos.x;
      edgeY = meshPos.y - panelH / 2;
      edgeZ = meshPos.z;
    }
    const edgeGeo = new THREE.BoxGeometry(edgeW || 0.01, edgeH || 0.01, edgeD || 0.01);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 10066329,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
      opacity: 0.8
    });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.position.set(edgeX, edgeY, edgeZ);
    edgeMesh.userData = { partId: partInfo.id, detailType: "edge" };
    scene.add(edgeMesh);
    detailArr.push(edgeMesh);
  });
  return detailArr;
}

const FASTENER_COLORS = {
  "Петля": 16753920,
  "Направляющая": 10040064,
  "Ручка": 10079232,
  "Саморез": 8421504,
  "Доводчик": 6737151,
  "Конфирмат": 5592405,
  "Эксцентрик": 16744576,
  "Стяжка": 65535,
  "Ножка": 8388736,
  "Держатель полки": 8421376,
  "Вытяжка": 16761024,
  "Фурнитура": 12632256
};

// Мусорные слова для фурнитуры
const FURN_JUNK = ['размер', 'линия', 'section', 'сечение', 'параллельн', 'dimension', 'parallel'];
function isFurnJunk(name) {
  const n = (name || '').toLowerCase();
  return FURN_JUNK.some(j => n.includes(j));
}

function buildFasteners(fasteners) {
  if (!fasteners || !fasteners.length) return;

  // InstancedMesh для конфирматов/саморезов (много одинаковых)
  const confirmats = fasteners.filter(f => !isFurnJunk(f.name) && (f.type === 'Конфирмат' || f.type === 'Саморез'));
  const others = fasteners.filter(f => !isFurnJunk(f.name) && f.type !== 'Конфирмат' && f.type !== 'Саморез');

  // Конфирматы — цилиндры, много штук через InstancedMesh
  if (confirmats.length > 0) {
    const cylGeo = new THREE.CylinderGeometry(0.0035, 0.002, 0.018, 8);
    const cylMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.7, emissive: 0x334455, emissiveIntensity: 0.1 });
    const im = new THREE.InstancedMesh(cylGeo, cylMat, confirmats.length);
    const dummy = new THREE.Object3D();
    confirmats.forEach((f, i) => {
      const fx = (f.pos ? f.pos.x : 0) * sc;
      const fy = ((f.pos ? f.pos.y : 0) - layoutMinY) * sc;
      const fz = (f.pos ? f.pos.z : 0) * sc;
      dummy.position.set(fx, fy, fz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.userData = { fastenerId: f.id, type: 'fastener', name: f.name };
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    fastenerMeshes.push(im);
  }

  // Остальная фурнитура
  others.forEach(fastener => {
    const fx = (fastener.pos ? fastener.pos.x : 0) * sc;
    const fy = ((fastener.pos ? fastener.pos.y : 0) - layoutMinY) * sc;
    const fz = (fastener.pos ? fastener.pos.z : 0) * sc;
    const color = FASTENER_COLORS[fastener.type] || FASTENER_COLORS["Фурнитура"];

    // Реальная геометрия из Базиса (TriData)
    let geo;
    if (fastener.triData && fastener.triData.verts && fastener.triData.tris) {
      try {
        geo = new THREE.BufferGeometry();
        const arr = new Float32Array(fastener.triData.verts.length);
        for (let i = 0; i < fastener.triData.verts.length; i++) arr[i] = fastener.triData.verts[i] * sc;
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geo.setIndex(fastener.triData.tris);
        geo.computeVertexNormals();
      } catch(e) { geo = null; }
    }

    // Если нет реальной геометрии — используем примитив по типу
    if (!geo) {
      const type = (fastener.type || '').toLowerCase();
      if (type.includes('петл'))      geo = new THREE.CylinderGeometry(0.006, 0.006, 0.022, 10);
      else if (type.includes('направл')) geo = new THREE.BoxGeometry(0.004, 0.085, 0.006);
      else if (type.includes('ручк'))    geo = new THREE.TorusGeometry(0.013, 0.003, 8, 20, Math.PI);
      else if (type.includes('эксцент')) geo = new THREE.CylinderGeometry(0.009, 0.009, 0.007, 14);
      else if (type.includes('стяжк'))   geo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12);
      else if (type.includes('ножк'))    geo = new THREE.CylinderGeometry(0.009, 0.012, 0.035, 10);
      else if (type.includes('доводчик')) geo = new THREE.BoxGeometry(0.007, 0.022, 0.007);
      else                               geo = new THREE.BoxGeometry(0.009, 0.009, 0.009);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.4, metalness: 0.65,
      emissive: color, emissiveIntensity: 0.12
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, fy, fz);
    mesh.userData = { fastenerId: fastener.id, type: 'fastener', name: fastener.name };
    mesh.castShadow = true;
    scene.add(mesh);
    fastenerMeshes.push(mesh);

    // Кольцо-маркер
    const ringGeo = new THREE.RingGeometry(0.011, 0.014, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(fx, fy, fz + 0.012);
    scene.add(ring);
    fastenerMeshes.push(ring);
  });
}
const detailMeshes = new Map();
const sc = 0.001;

// Создать геометрию панели — ExtrudeGeometry если есть poly, иначе Box
function buildPanelGeo(part) {
  const L = (part.L || 100) * sc;
  const W = (part.W || 100) * sc;
  const T = Math.abs(part.T || 16) * sc;
  const poly = part.poly || [];
  const cuts = part.cuts || [];

  // ExtrudeGeometry — точный контур с вырезами
  if (poly.length >= 3) {
    try {
      const shape = new THREE.Shape();
      shape.moveTo(poly[0][0] * sc, poly[0][1] * sc);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i][0] * sc, poly[i][1] * sc);
      }
      shape.closePath();

      // Добавляем вырезы как holes
      cuts.forEach(function(cut) {
        if (!cut || cut.length < 3) return;
        const hole = new THREE.Path();
        hole.moveTo(cut[0][0] * sc, cut[0][1] * sc);
        for (let i = 1; i < cut.length; i++) {
          hole.lineTo(cut[i][0] * sc, cut[i][1] * sc);
        }
        hole.closePath();
        shape.holes.push(hole);
      });

      const geo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      if (part.T < 0) geo.translate(0, 0, -T);
      return { geo, isBox: false };
    } catch(e) {}
  }

  // Fallback — BoxGeometry
  const geo = new THREE.BoxGeometry(L, W, T);
  return { geo, isBox: true };
}

function buildScene() {
  // Очистка
  meshMap.forEach(m => { m.geometry.dispose(); m.material.dispose(); scene.remove(m); });
  edgeLineMap.forEach(l => { l.geometry.dispose(); l.material.dispose(); scene.remove(l); });
  detailMeshes.forEach(arr => arr.forEach(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); scene.remove(o); }));
  fastenerMeshes.forEach(fm => { if(fm.geometry) fm.geometry.dispose(); if(fm.material) fm.material.dispose(); scene.remove(fm); });
  fastenerMeshes.length = 0;
  meshMap.clear(); edgeLineMap.clear(); detailMeshes.clear(); originalPositions.clear();

  // Обновляем environment map
  const env = getEnvMap();
  if (env && scene) scene.environment = env;

  parts.forEach(part => {
    // Геометрия — ExtrudeGeometry или Box
    const { geo, isBox } = buildPanelGeo(part);

    // Процедурная текстура
    const fin = genMatTex(part.material || '');
    let matOpts;
    if (fin.map) {
      // UV масштаб под размер панели
      const swap = (part.W || 0) > (part.L || 0);
      if (isBox) bakeUV(geo, (part.L || 100) / fin.mm, (part.W || 100) / fin.mm, swap);
      else       bakeUV(geo, 1 / fin.mm, 1 / fin.mm, swap);
      matOpts = { color: 0xffffff, map: fin.map, roughness: fin.rough, metalness: 0.05 };
    } else if (fin.kind === 'mirror') {
      matOpts = { color: 0xd3dade, roughness: 0.06, metalness: 0.9 };
    } else if (fin.kind === 'glass') {
      matOpts = { color: 0xbcd2e2, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, depthWrite: false };
    } else if (fin.kind === 'metal') {
      matOpts = { color: fin.mcol ? parseInt(fin.mcol.slice(1), 16) : 0xb8bcc2, roughness: 0.3, metalness: 0.85 };
    } else {
      matOpts = { color: parseInt((fin.base || '#b0a898').slice(1), 16), roughness: fin.rough || 0.75, metalness: 0.05 };
    }

    const mat = new THREE.MeshStandardMaterial({
      ...matOpts,
      emissive: new THREE.Color(0),
      emissiveIntensity: 0
    });
    if (fin.map) mat.envMapIntensity = fin.gloss ? 0.55 : 0.3;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(part._pos.x, part._pos.y, part._pos.z);

    // Применяем кватернион вращения если есть
    if (part.quat && (part.quat[0] !== 0 || part.quat[1] !== 0 || part.quat[2] !== 0 || part.quat[3] !== 1)) {
      mesh.quaternion.set(part.quat[0], part.quat[1], part.quat[2], part.quat[3]);
    }

    mesh.userData = { partId: part.id, base: matOpts.color, tr: !!matOpts.transparent, op: matOpts.opacity || 1, dw: matOpts.depthWrite !== false };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Рёбра
    const edgeGeo = new THREE.EdgesGeometry(geo, 15);
    const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.35 }));
    edgeLine.position.copy(mesh.position);
    edgeLine.quaternion.copy(mesh.quaternion);
    scene.add(edgeLine);

    originalPositions.set(part.id, new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z));
    meshMap.set(part.id, mesh);
    edgeLineMap.set(part.id, edgeLine);

    // Детали (отверстия, пазы)
    const details = buildPartDetails(part, mesh);
    if (details.length) detailMeshes.set(part.id, details);
  });

  centerCamera();
  updateStats();
  buildModuleMap();
  renderPartsList();
  updateSummary();
  buildFasteners(fastenerData);
}
function buildModuleMap() {
  moduleMap.clear();
  parts.forEach(part => {
    // Use explicit group field if available, otherwise parse from code
    let groupName;
    if (part.group) {
      groupName = part.group;
    } else {
      const idCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
      groupName = getModuleKey(idCode);
    }
    if (!moduleMap.has(groupName)) {
      moduleMap.set(groupName, []);
    }
    moduleMap.get(groupName).push(part);
  });
}
function centerCamera() {
  if (!parts.length) {
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY2 = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  parts.forEach(part => {
    if (!part._pos) {
      return;
    }
    minX = Math.min(minX, part._pos.x - part._size.x / 2);
    maxX = Math.max(maxX, part._pos.x + part._size.x / 2);
    minY2 = Math.min(minY2, part._pos.y - part._size.y / 2);
    maxY = Math.max(maxY, part._pos.y + part._size.y / 2);
    minZ = Math.min(minZ, part._pos.z - part._size.z / 2);
    maxZ = Math.max(maxZ, part._pos.z + part._size.z / 2);
  });
  targetPosition.set((minX + maxX) / 2, (minY2 + maxY) / 2, (minZ + maxZ) / 2);
  const maxExtent = Math.max(maxX - minX, maxY - minY2, maxZ - minZ);
  camDist = Math.max(maxExtent * 1.5, 2);
  updateCamera();
}
function selectPart(partId) {
  selectedId = partId;
  meshMap.forEach(mesh => {
    mesh.material.emissive.setHex(0);
    mesh.material.emissiveIntensity = 0;
  });
  edgeLineMap.forEach(edgeLine => {
    edgeLine.material.color.setHex(0x1a1a1a);
  });
  const selectedMesh = meshMap.get(partId);
  const selectedEdge = edgeLineMap.get(partId);
  if (selectedMesh) {
    selectedMesh.material.emissive.setHex(0x00D4AA);
    selectedMesh.material.emissiveIntensity = 0.5;
  }
  if (selectedEdge) {
    selectedEdge.material.color.setHex(0x2a2a2a);
  }
  if (xrayActive) {
    applyXray();
  }
  updateSheet(parts.find(part => part.id === partId));
  renderPartsList();
  openSheet();
}
function renderProcessingInfo(partData) {
  const grooves = partData.grooves || [];
  const holes2 = partData.holes || [];
  const cutouts2 = partData.cutouts || [];
  const edges2 = partData.edges || [];
  const hasProcessing = grooves.length || holes2.length || cutouts2.length || edges2.length;
  const relatedFasteners = fastenerData.filter(f => f.ownerCode && partData.code && f.ownerCode === partData.code);
  if (!hasProcessing && !relatedFasteners.length) {
    return "";
  }
  let html = "<div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">";
  if (grooves.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Пазы (" + grooves.length + "):</div>";
    grooves.forEach((groove, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (groove.x || 0) + " y:" + (groove.y || 0) + " " + (groove.width || groove.w || 0) + "×" + (groove.length || groove.h || 0) + "×" + (groove.depth || groove.d || 0) + " мм</div>";
    });
  }
  if (holes2.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Отверстия (" + holes2.length + "):</div>";
    holes2.forEach((hole, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (hole.x || 0) + " y:" + (hole.y || 0) + " ⌀" + (hole.diameter || hole.d || hole.r || "?") + " мм</div>";
    });
  }
  if (cutouts2.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Вырезы (" + cutouts2.length + "):</div>";
    cutouts2.forEach((cutout, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (cutout.x || 0) + " y:" + (cutout.y || 0) + " " + (cutout.w || 0) + "×" + (cutout.h || 0) + " мм</div>";
    });
  }
  if (edges2.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Кромка (" + edges2.length + "):</div>";
    edges2.forEach((edge, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + (edge.side || edge.type || "?") + " " + (edge.thickness || edge.length || "") + (edge.thickness || edge.length ? " мм" : "") + "</div>";
    });
  }
  if (relatedFasteners.length) {
    html += "<div style=\"font-size:9px;color:#ff9800;margin-bottom:2px\">Фурнитура (" + relatedFasteners.length + "):</div>";
    relatedFasteners.forEach((f, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + (f.name || "?") + " [" + (f.type || "?") + "]</div>";
    });
  }
  html += "</div>";
  return html;
}
function updateSheet(part) {
  const sheetEl = document.getElementById("sheetContent");
  if (!part) {
    sheetEl.innerHTML = "<div style=\"text-align:center;color:var(--text-secondary);padding:10px;font-size:11px;\">👆 Нажмите на деталь</div>";
    return;
  }
  const isScanned = scannedSet.has(part.id);
  const displayCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
  const modKey = getModuleKey(displayCode);
  const modName = part.groupName || getModuleName(displayCode);
  const modColor = getModuleColor(displayCode);
  let assemblyHint = "";
  if (modKey !== "HARDWARE" && modKey !== "OTHER") {
    const modParts = moduleMap.get(modKey) || [];
    const partIndex = modParts.indexOf(part) + 1;
    assemblyHint = "<div class=\"assembly-hint\">📦 " + modName + " — деталь " + partIndex + " из " + modParts.length + " в модуле</div>";
  }
  sheetEl.innerHTML = "\n      <div class=\"detail-card\">\n        <div class=\"detail-row\">\n          <span class=\"detail-label\">Наименование:</span>\n          <span class=\"detail-value\" style=\"font-size:13px;font-weight:600\">" + escapeHtml(part.name || "—") + "</span>\n        </div>\n        <div class=\"detail-row\">\n          <span class=\"detail-label\">Обозначение:</span>\n          <span class=\"detail-code\">" + escapeHtml(part.code || "—") + "</span>\n        </div>\n        " + (part.position ? "<div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"detail-label\">Позиция:</span>\n          <span class=\"detail-code\">" + escapeHtml(part.position) + "</span>\n        </div>" : "") + "\n        <div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"material-tag\">" + escapeHtml(part.material || "Материал") + "</span>\n          <span class=\"module-badge\" style=\"color:" + modColor + ";background:" + modColor + "18;border-color:" + modColor + "30\">" + modName + "</span>\n        </div>\n        " + (part.group ? "<div class=\"detail-row\" style=\"margin-top:2px\"><span class=\"detail-label\">Группа:</span><span class=\"detail-code\" style=\"font-size:11px\">" + escapeHtml(part.group) + " — " + escapeHtml(part.groupName || modName) + "</span></div>" : "") + "\n        <div class=\"dims-row\" style=\"margin-top:3px\">\n          <div class=\"dim\"><span class=\"dim-label\">Д</span><span class=\"dim-value\">" + (part.L || "—") + "</span></div>\n          <div class=\"dim\"><span class=\"dim-label\">Ш</span><span class=\"dim-value\">" + (part.W || "—") + "</span></div>\n          <div class=\"dim\"><span class=\"dim-label\">Т</span><span class=\"dim-value\">" + (part.T || "—") + "</span></div>\n        </div>\n        <div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"status-badge " + (isScanned ? "scanned" : "waiting") + "\">" + (isScanned ? "✅ ОТСКАНИРОВАНО" : "⏳ ОЖИДАЕТ") + "</span>\n        </div>\n        " + assemblyHint + "\n        " + renderProcessingInfo(part) + "\n      </div>\n    ";

}
function toggleVisibility(partId) {
  const visMesh = meshMap.get(partId);
  const visEdge = edgeLineMap.get(partId);
  if (!visMesh) {
    return;
  }
  if (hiddenSet.has(partId)) {
    hiddenSet.delete(partId);
    visMesh.visible = true;
    if (visEdge) {
      visEdge.visible = true;
    }
  } else {
    hiddenSet.add(partId);
    visMesh.visible = false;
    if (visEdge) {
      visEdge.visible = false;
    }
    if (selectedId === partId) {
      selectedId = null;
      updateSheet(null);
      closeSheet();
    }
  }
  renderPartsList();
  if (xrayActive) {
    applyXray();
  }
  saveProgress();
  showToast((hiddenSet.has(partId) ? "🙈" : "👁") + " Деталь " + (hiddenSet.has(partId) ? "скрыта" : "показана"));
}
function toggleCSGVisibility() {
  csgEnabled = !csgEnabled;
  detailMeshes.forEach(function(arr) {
    arr.forEach(function(obj) { obj.visible = csgEnabled; });
  });
  fastenerMeshes.forEach(function(fm) { fm.visible = csgEnabled; });
  const btn = document.getElementById("csgBtn");
  btn.classList.toggle("active", csgEnabled);
  showToast(csgEnabled ? "Вырезы и фурнитура показаны" : "Вырезы и фурнитура скрыты");
}
function showAllParts() {
  hiddenSet.clear();
  meshMap.forEach(m => {
    m.visible = true;
  });
  edgeLineMap.forEach(e => {
    e.visible = true;
  });
  renderPartsList();
  if (xrayActive) {
    applyXray();
  }
  showToast("👁 Все детали показаны");
}
function applyXray() {
  meshMap.forEach((xrayMesh, xrayId) => {
    if (!xrayActive || !xrayMesh.visible) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
      return;
    }
    if (selectedId !== null && xrayId === selectedId) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
    } else {
      xrayMesh.material.transparent = true;
      xrayMesh.material.opacity = 0.12;
    }
  });
}
function toggleXray() {
  xrayActive = !xrayActive;
  document.getElementById("xrayBtn").classList.toggle("active", xrayActive);
  if (!xrayActive) {
    meshMap.forEach(m => {
      m.material.transparent = false;
      m.material.opacity = 1;
    });
  } else {
    applyXray();
  }
}
function toggleExplode() {
  explodeActive = !explodeActive;
  document.getElementById("explodeBtn").classList.toggle("active", explodeActive);
  if (!explodeActive) {
    animateExplodeTo(0);
  } else {
    animateExplodeTo(1);
  }
}
function animateExplodeTo(target) {
  const startVal = explodeProgress;
  const startTime = performance.now();
  const duration = 600;
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = progress < 0.5 ? progress * 2 * progress : 1 - Math.pow(progress * -2 + 2, 2) / 2;
    explodeProgress = startVal + (target - startVal) * eased;
    applyExplode();
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}
function applyExplode() {
  if (!originalPositions.size) {
    return;
  }
  const center = new THREE.Vector3();
  let count = 0;
  originalPositions.forEach(origCenter => {
    center.add(origCenter);
    count++;
  });
  if (count > 0) {
    center.divideScalar(count);
  }
  parts.forEach(part => {
    const explodeMesh = meshMap.get(part.id);
    const explodeEdge = edgeLineMap.get(part.id);
    const origPos = originalPositions.get(part.id);
    if (!explodeMesh || !origPos) {
      return;
    }
    const dir = new THREE.Vector3().subVectors(origPos, center);
    const dist = dir.length();
    if (dist > 0.001) {
      dir.normalize();
    }
    const offset = explodeProgress * dist * 0.8;
    const newPos = origPos.clone().add(dir.multiplyScalar(offset));
    const delta = new THREE.Vector3().subVectors(newPos, origPos);
    explodeMesh.position.copy(newPos);
    if (explodeEdge) {
      explodeEdge.position.copy(newPos);
    }
    const explDetails = detailMeshes.get(part.id);
    if (explDetails) {
      explDetails.forEach(detailObj => {
        if (detailObj.isMesh || detailObj.isLineSegments) {
          detailObj.position.add(delta);
        }
      });
    }
  });
}
function toggleAssembly() {
  assemblyMode = !assemblyMode;
  document.getElementById("assembleBtn").classList.toggle("active", assemblyMode);
  document.getElementById("assemblyOverlay").classList.toggle("active", assemblyMode);
  if (assemblyMode) {
    buildAssemblyOrder();
    assemblyIndex = 0;
    updateAssemblyStep();
    autoRotate = false;
  } else {
    stopAssemblyPlay();
  }
}
function buildAssemblyOrder() {
  const sortedKeys = Array.from(moduleMap.keys()).sort();
  assemblyOrder = [];
  sortedKeys.forEach(key => {
    const moduleParts = moduleMap.get(key);
    if (moduleParts) {
      moduleParts.forEach(part => assemblyOrder.push(part));
    }
  });
  if (assemblyOrder.length === 0) {
    assemblyOrder = [...parts];
  }
}
function updateAssemblyStep() {
  if (assemblyOrder.length === 0) {
    return;
  }
  const currentPart = assemblyOrder[assemblyIndex];
  if (!currentPart) {
    return;
  }
  document.getElementById("assemblyStepLabel").textContent = "Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length;
  const partLabel = currentPart.position ? currentPart.code + " / " + currentPart.position : currentPart.code;
  document.getElementById("assemblyInfo").textContent = partLabel + " — " + (currentPart.name || "—");
  meshMap.forEach((asmMesh, asmId) => {
    asmMesh.material.emissive.setHex(0);
    asmMesh.material.emissiveIntensity = 0;
    asmMesh.material.transparent = false;
    asmMesh.material.opacity = 0.15;
  });
  edgeLineMap.forEach(asmEdge => {
    asmEdge.material.color.setHex(0x1a1a1a);
    asmEdge.material.transparent = true;
    asmEdge.material.opacity = 0.15;
  });
  const highlightMesh = meshMap.get(currentPart.id);
  const highlightEdge = edgeLineMap.get(currentPart.id);
  if (highlightMesh) {
    highlightMesh.material.emissive.setHex(0x00D4AA);
    highlightMesh.material.emissiveIntensity = 0.6;
    highlightMesh.material.transparent = false;
    highlightMesh.material.opacity = 1;
  }
  if (highlightEdge) {
    highlightEdge.material.color.setHex(0x2a2a2a);
    highlightEdge.material.transparent = false;
    highlightEdge.material.opacity = 1;
  }
  startSmoothZoom(currentPart.id);
  updateSheet(currentPart);
  openSheet();
  renderPartsList();
  showToast("🔧 Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length + ": " + (currentPart.name || currentPart.code));
}
function stopAssemblyPlay() {
  assemblyPlaying = false;
  if (assemblyTimer) {
    clearInterval(assemblyTimer);
  }
  assemblyTimer = null;
  document.getElementById("asmPlay").innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}
function toggleAssemblyPlay() {
  if (assemblyPlaying) {
    stopAssemblyPlay();
  } else {
    assemblyPlaying = true;
    document.getElementById("asmPlay").innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    assemblyTimer = setInterval(() => {
      assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
      updateAssemblyStep();
    }, 1500);
  }
}
function updateSummary() {
  if (parts.length === 0) {
    document.getElementById("materialSummary").style.display = "none";
    return;
  }
  document.getElementById("materialSummary").style.display = "block";
  const materialStats = {};
  let totalMass = 0;
  parts.forEach(part => {
    const matName = part.material || "Неизвестно";
    if (!materialStats[matName]) {
      materialStats[matName] = {
        count: 0,
        totalArea: 0
      };
    }
    materialStats[matName].count++;
    if (part.L && part.W) {
      materialStats[matName].totalArea += part.L * part.W / 1000000;
    }
    if (part.L && part.W && part.T) {
      totalMass += part.L * part.W * part.T / 1000 * 6.5e-7;
    }
  });
  const moduleCount = moduleMap.size;
  let summaryHtml = "\n      <div class=\"summary-row\"><span class=\"summary-label\">Всего деталей:</span><span class=\"summary-val\">" + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Модулей:</span><span class=\"summary-val\">" + moduleCount + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Собрано:</span><span class=\"summary-val\" style=\"color:var(--success)\">" + scannedSet.size + " / " + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Масса:</span><span class=\"summary-val\">≈ " + totalMass.toFixed(1) + " кг</span></div>\n      <div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">\n    ";
  const sortedMats = Object.entries(materialStats).sort((a, b) => b[1].count - a[1].count);
  sortedMats.slice(0, 6).forEach(([mat, stats]) => {
    summaryHtml += "<div class=\"summary-row\"><span class=\"summary-label\" style=\"font-size:8px\">" + escapeHtml(mat.substring(0, 30)) + "</span><span class=\"summary-val\" style=\"font-size:9px\">" + stats.count + " шт</span></div>";
  });
  summaryHtml += "</div>";
  document.getElementById("summaryContent").innerHTML = summaryHtml;
}
function updateStats() {
  const total = parts.length;
  const scanned = scannedSet.size;
  const percent = total > 0 ? Math.round(scanned / total * 100) : 0;
  document.getElementById("totalCount").textContent = total;
  document.getElementById("scannedCount").textContent = scanned;
  document.getElementById("progressFill").style.width = percent + "%";
  const fastenerInfo = document.getElementById("fastenerCount");
  if (fastenerInfo) {
    fastenerInfo.textContent = fastenerData.length ? "🔧 " + fastenerData.length : "";
  }
}
function renderPartsList() {
  const container = document.getElementById("partsList");
  if (!container) {
    return;
  }
  const searchVal = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (parts.length === 0) {
    container.innerHTML = "<div style=\"text-align:center;padding:20px;color:var(--text-secondary);font-size:11px\">📁 Загрузите JSON файл для начала</div>";
    return;
  }
  let filteredParts = parts;
  if (searchVal) {
    filteredParts = parts.filter(p => (p.name || "").toLowerCase().includes(searchVal) || (p.code || "").toLowerCase().includes(searchVal) || (p.position || "").toLowerCase().includes(searchVal));
  }
  if (searchVal) {
    container.innerHTML = "";
    if (filteredParts.length === 0) {
      container.innerHTML = "<div style=\"text-align:center;padding:16px;color:var(--text-secondary);font-size:11px\">🔍 Ничего не найдено</div>";
      return;
    }
    filteredParts.forEach(part => container.appendChild(createPartItem(part)));
    return;
  }
  container.innerHTML = "";
  const sortedModules = Array.from(moduleMap.keys()).sort((a, b) => {
    if (a === "HARDWARE") {
      return 1;
    }
    if (b === "HARDWARE") {
      return -1;
    }
    const aPrefix = a.replace(/_\d+$/, "");
    const bPrefix = b.replace(/_\d+$/, "");
    if (aPrefix !== bPrefix) {
      return aPrefix.localeCompare(bPrefix);
    }
    const aNum = parseInt(a.match(/\d+$/)?.[0] || "0");
    const bNum = parseInt(b.match(/\d+$/)?.[0] || "0");
    return aNum - bNum;
  });
  sortedModules.forEach(moduleKey => {
    const moduleParts = moduleMap.get(moduleKey);
    if (!moduleParts) {
      return;
    }
    // Get groupName from first part in module
    const displayName = (moduleParts[0] && moduleParts[0].groupName) ? moduleParts[0].groupName : getModuleName(moduleKey === "HARDWARE" ? "D-000" : moduleKey + "_00");
    const dotColor = moduleKey === "HARDWARE" ? "#94a3b8" : getModuleColor(moduleKey + "_00");
    const scannedCount = moduleParts.filter(p => scannedSet.has(p.id)).length;
    const groupEl = document.createElement("div");
    groupEl.className = "module-group";
    groupEl.innerHTML = "\n        <div class=\"module-header\" data-module=\"" + moduleKey + "\">\n          <div class=\"module-dot\" style=\"background:" + dotColor + "\"></div>\n          <span class=\"module-name\">" + escapeHtml(displayName) + "</span>\n          <span class=\"module-count\">" + scannedCount + "/" + moduleParts.length + "</span>\n          <span class=\"module-arrow open\">▶</span>\n        </div>\n        <div class=\"module-parts\" data-module-parts=\"" + moduleKey + "\"></div>\n      ";
    const headerEl = groupEl.querySelector(".module-header");
    const partsContainer = groupEl.querySelector(".module-parts");
    headerEl.addEventListener("click", () => {
      partsContainer.classList.toggle("collapsed");
      headerEl.querySelector(".module-arrow").classList.toggle("open");
    });
    moduleParts.forEach(part => partsContainer.appendChild(createPartItem(part)));
    container.appendChild(groupEl);
  });
}
function createPartItem(part) {
  const isHidden = hiddenSet.has(part.id);
  const isScanned = scannedSet.has(part.id);
  const itemEl = document.createElement("div");
  itemEl.className = "part-item " + (selectedId === part.id ? "active" : "");
  itemEl.style.opacity = isHidden ? "0.4" : "1";
  const displayId = idMode === "position" ? part.position || part.code || "—" : part.code || "—";
  const moduleColor = getModuleColor(idMode === "position" ? part.position || part.code || "" : part.code || "");
  itemEl.innerHTML = "\n      <div class=\"part-swatch\" style=\"background:" + getColor(part.material, part) + ";border-left:3px solid " + moduleColor + "\"></div>\n      <div class=\"part-info\">\n        <div class=\"part-name\">" + escapeHtml(part.name || "—") + "</div>\n        <div class=\"part-code\">" + escapeHtml(displayId) + "</div>\n        <div class=\"part-dims\">" + (part.gab ? part.gab.w + "×" + part.gab.h + "×" + part.gab.d + " мм" : "") + "</div>\n      </div>\n      <div class=\"check " + (isScanned ? "done" : "") + "\">" + (isScanned ? "✅" : "○") + "</div>\n    ";
  itemEl.addEventListener("click", () => selectPart(part.id));
  return itemEl;
}
function showStats() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const materialCounts = {};
  let totalMass = 0;
  let totalArea = 0;
  parts.forEach(part => {
    const matName = part.material || "Неизвестно";
    if (!materialCounts[matName]) {
      materialCounts[matName] = 0;
    }
    materialCounts[matName]++;
    if (part.L && part.W && part.T) {
      totalMass += part.L * part.W * part.T / 1000 * 6.5e-7;
      totalArea += part.L * part.W / 1000000;
    }
  });
  let html = "\n      <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px\">\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + parts.length + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">деталей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + moduleMap.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">модулей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--success)\">" + scannedSet.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">собрано</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--warning)\">≈" + totalMass.toFixed(1) + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">кг масса</div>\n        </div>\n      </div>\n      <div style=\"font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px\">МАТЕРИАЛЫ:</div>\n    ";
  Object.entries(materialCounts).sort((a, b) => b[1] - a[1]).forEach(([mat, count]) => {
    html += "<div style=\"display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)\">\n        <span style=\"color:var(--text-primary)\">" + escapeHtml(mat) + "</span>\n        <span style=\"color:var(--accent);font-weight:600\">" + count + " шт</span>\n      </div>";
  });
  if (fastenerData.length) {
    const fastenerTypeCounts = {};
    fastenerData.forEach(f => {
      const t = f.type || "Прочее";
      if (!fastenerTypeCounts[t]) fastenerTypeCounts[t] = 0;
      fastenerTypeCounts[t]++;
    });
    html += "<div style=\"font-size:10px;font-weight:700;color:#ff9800;margin:10px 0 6px\">ФУРНИТУРА (" + fastenerData.length + "):</div>";
    Object.entries(fastenerTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      html += "<div style=\"display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)\">\n        <span style=\"color:var(--text-primary)\">" + escapeHtml(type) + "</span>\n        <span style=\"color:#ff9800;font-weight:600\">" + count + " шт</span>\n      </div>";
    });
  }
  document.getElementById("statsContent").innerHTML = html;
  document.getElementById("statsModal").classList.remove("hidden");
}
function printSpecification() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const printWin = window.open("", "_blank");
  let printHtml = "<html><head><title>Спецификация</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0;font-weight:700}.mod{background:#e8e8ff;font-weight:700}</style></head><body>";
  printHtml += "<h2>Спецификация — " + document.getElementById("projectTitle").textContent + "</h2>";
  printHtml += "<p>Всего деталей: " + parts.length + " | Собрано: " + scannedSet.size + "</p>";
  printHtml += "<table><tr><th>#</th><th>Обозначение</th><th>Позиция</th><th>Наименование</th><th>Материал</th><th>Размеры (мм)</th><th>Статус</th></tr>";
  let lastModule = "";
  parts.forEach((part, idx) => {
    const partCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
    const modKey = getModuleKey(partCode);
    if (modKey !== lastModule) {
      lastModule = modKey;
      printHtml += "<tr><td colspan=\"7\" class=\"mod\">" + escapeHtml(getModuleName(modKey === "HARDWARE" ? "D-000" : modKey + "_0")) + "</td></tr>";
    }
    const statusIcon = scannedSet.has(part.id) ? "✅" : "○";
    const dims = part.gab ? part.gab.w + "×" + part.gab.h + "×" + part.gab.d : (part.L || "—") + "×" + (part.W || "—") + "×" + (part.T || "—");
    printHtml += "<tr><td>" + (idx + 1) + "</td><td>" + escapeHtml(part.code || "") + "</td><td>" + escapeHtml(part.position || "") + "</td><td>" + escapeHtml(part.name || "") + "</td><td>" + escapeHtml(part.material || "") + "</td><td>" + dims + "</td><td>" + statusIcon + "</td></tr>";
  });
  printHtml += "</table>";
  if (fastenerData.length) {
    printHtml += "<h3 style=\"margin-top:20px\">Фурнитура (" + fastenerData.length + ")</h3>";
    printHtml += "<table><tr><th>#</th><th>Тип</th><th>Наименование</th><th>Привязка</th></tr>";
    fastenerData.forEach((f, idx) => {
      printHtml += "<tr><td>" + (idx + 1) + "</td><td>" + escapeHtml(f.type || "") + "</td><td>" + escapeHtml(f.name || "") + "</td><td>" + escapeHtml(f.ownerCode || "—") + "</td></tr>";
    });
    printHtml += "</table>";
  }
  printHtml += "</body></html>";
  printWin.document.write(printHtml);
  printWin.document.close();
  printWin.print();
}
let scanInterval;
let videoStream;
function openScanner() {
  document.getElementById("scannerModal").classList.remove("hidden");
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment"
    }
  }).then(stream => {
    videoStream = stream;
    const videoEl2 = document.getElementById("video");
    videoEl2.srcObject = stream;
    videoEl2.play();
    startQRScan();
  }).catch(() => showToast("❌ Нет доступа к камере"));
}
function closeScanner() {
  document.getElementById("scannerModal").classList.add("hidden");
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  if (scanInterval) {
    clearInterval(scanInterval);
  }
}
function startQRScan() {
  const videoEl = document.getElementById("video");
  const qrCanvas = document.getElementById("qrCanvas");
  const qrCtx = qrCanvas.getContext("2d");
  scanInterval = setInterval(() => {
    if (videoEl.readyState !== videoEl.HAVE_ENOUGH_DATA) {
      return;
    }
    qrCanvas.width = videoEl.videoWidth;
    qrCanvas.height = videoEl.videoHeight;
    qrCtx.drawImage(videoEl, 0, 0);
    const imgData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
    const qrResult = jsQR(imgData.data, imgData.width, imgData.height);
    if (qrResult) {
      handleScan(qrResult.data);
      closeScanner();
    }
  }, 200);
}
function handleManualCode() {
  const manualVal = document.getElementById("manualCode").value.trim();
  if (manualVal) {
    handleScan(manualVal);
    closeScanner();
  }
}
function handleScan(scanData) {
  let foundPart;
  if (idMode === "position") {
    foundPart = parts.find(p => p.position === scanData || p.position?.trim() === scanData.trim() || p.position?.toLowerCase() === scanData.toLowerCase());
    if (!foundPart) {
      foundPart = parts.find(p => scanData.includes(p.position) || p.position?.includes(scanData));
    }
  } else {
    foundPart = parts.find(p => p.code === scanData || p.code?.trim() === scanData.trim() || p.code?.toLowerCase() === scanData.toLowerCase());
    if (!foundPart) {
      foundPart = parts.find(p => scanData.includes(p.code) || p.code?.includes(scanData));
    }
  }
  if (!foundPart) {
    showToast("❌ Деталь не найдена");
    return;
  }
  scannedSet.add(foundPart.id);
  updateStats();
  selectPart(foundPart.id);
  startSmoothZoom(foundPart.id);
  showToast("✅ " + foundPart.name);
  saveProgress();
  renderPartsList();
}
function saveProgress() {
  localStorage.setItem("aivoProgress", JSON.stringify({
    scanned: Array.from(scannedSet),
    hidden: Array.from(hiddenSet),
    projectTitle: document.getElementById("projectTitle").textContent
  }));
}
function loadProgress() {
  const saved = JSON.parse(localStorage.getItem("aivoProgress") || "{}");
  if (saved.scanned) {
    scannedSet = new Set(saved.scanned);
  }
  if (saved.hidden) {
    hiddenSet = new Set(saved.hidden);
  }
}
function resetProgress() {
  if (confirm("Сбросить весь прогресс сборки?")) {
    scannedSet.clear();
    hiddenSet.clear();
    meshMap.forEach(m => m.visible = true);
    edgeLineMap.forEach(e => e.visible = true);
    selectedId = null;
    updateSheet(null);
    closeSheet();
    updateStats();
    renderPartsList();
    localStorage.removeItem("aivoProgress");
    showToast("🔄 Прогресс сброшен");
  }
}
function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerBackdrop").style.display = "block";
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawerBackdrop").style.display = "none";
}
function openSheet() {
  document.getElementById("bottomSheet").classList.add("open");
}
function closeSheet() {
  document.getElementById("bottomSheet").classList.remove("open");
}
function escapeHtml(str) {
  return (str || "").replace(/[&<>]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  })[char]);
}
function showToast(message) {
  let toastEl = document.getElementById("customToast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "customToast";
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), 2000);
}
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("uploadBtn").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", changeEvent => {
  const file = changeEvent.target.files[0];
  if (!file) {
    return;
  }
  document.getElementById("loadingOverlay").classList.add("show");
  const reader = new FileReader();
  reader.onload = loadEvent => {
    try {
      const jsonData = JSON.parse(loadEvent.target.result);
      parts = jsonData.parts || jsonData;
      fastenerData = (jsonData.fasteners || []).filter(f =>
        f.name && f.pos && !isFurnJunk(f.name)
      );
      parts.forEach((part, index) => {
        if (part.id === undefined) {
          part.id = index;
        }
      });
      autoLayout(parts);
      buildScene();
      selectedId = null;
      loadProgress();
      centerCamera();
      closeDrawer();
      updateStats();
      showToast("✅ Загружено " + parts.length + " деталей");
      document.getElementById("projectTitle").textContent = file.name.replace(".json", "");
      saveProgress();
    } catch (err) {
      showToast("❌ Ошибка файла: " + err.message);
    } finally {
      document.getElementById("loadingOverlay").classList.remove("show");
    }
  };
  reader.readAsText(file, "UTF-8");
});
document.getElementById("menuBtn").addEventListener("click", openDrawer);
document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
document.getElementById("closeDrawerBtn").addEventListener("click", closeDrawer);
document.getElementById("closeSheetBtn").addEventListener("click", closeSheet);

document.getElementById("scanBtn").addEventListener("click", openScanner);
document.getElementById("hideBtn").addEventListener("click", () => {
  if (selectedId !== null) { toggleVisibility(selectedId); }
});
document.getElementById("showAllBtn").addEventListener("click", showAllParts);
document.getElementById("rotateBtn").addEventListener("click", () => {
  autoRotate = !autoRotate;
});
document.getElementById("resetViewBtn").addEventListener("click", () => {
  isSmoothZoom = false;
  autoRotate = false;
  centerCamera();
});
document.getElementById("focusBtn").addEventListener("click", () => {
  if (selectedId !== null) {
    startSmoothZoom(selectedId);
  } else {
    showToast("Сначала выберите деталь");
  }
});
document.getElementById("xrayBtn").addEventListener("click", toggleXray);
document.getElementById("explodeBtn").addEventListener("click", toggleExplode);
document.getElementById("assembleBtn").addEventListener("click", toggleAssembly);
document.getElementById("resetProgressBtn").addEventListener("click", resetProgress);
document.getElementById("printBtn").addEventListener("click", printSpecification);
document.getElementById("statsBtn").addEventListener("click", showStats);
document.getElementById("csgBtn").addEventListener("click", toggleCSGVisibility);
document.getElementById("closeScannerBtn").addEventListener("click", closeScanner);
document.getElementById("scannerModal").addEventListener("click", function(e) { if (e.target === this) closeScanner(); });
document.getElementById("statsModal").addEventListener("click", function(e) { if (e.target === this) this.classList.add("hidden"); });
document.getElementById("manualSubmit").addEventListener("click", handleManualCode);
document.getElementById("searchInput").addEventListener("input", renderPartsList);
document.querySelectorAll(".id-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    idMode = btn.dataset.mode;
    localStorage.setItem("aivoIdMode", idMode);
    document.querySelectorAll(".id-mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    buildModuleMap();
    renderPartsList();
  });
});
// Initialize ID-mode toggle active state
document.querySelector('.id-mode-btn[data-mode="' + idMode + '"]')?.classList.add('active');
document.getElementById("asmPrev").addEventListener("click", () => {
  if (assemblyOrder.length === 0) {
    return;
  }
  assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
  updateAssemblyStep();
});
document.getElementById("asmNext").addEventListener("click", () => {
  if (assemblyOrder.length === 0) {
    return;
  }
  assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
  updateAssemblyStep();
});
document.getElementById("asmPlay").addEventListener("click", toggleAssemblyPlay);
document.getElementById("asmClose").addEventListener("click", toggleAssembly);

// === UX IMPROVEMENTS ===

// 2.1 Drag-and-drop file upload
(function() {
  const canvas = document.getElementById('canvas3d');
  const overlay = document.getElementById('dropOverlay');
  let dragCounter = 0;

  canvas.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    overlay.style.display = 'flex';
  });
  canvas.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.style.display = 'none'; }
  });
  canvas.addEventListener('dragover', function(e) { e.preventDefault(); });
  canvas.addEventListener('drop', function(e) {
    e.preventDefault();
    dragCounter = 0;
    overlay.style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.json')) {
      showToast('❌ Только JSON файлы');
      return;
    }
    document.getElementById('loadingOverlay').classList.add('show');
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        parts = data.parts || data;
        fastenerData = (data.fasteners || []).filter(f =>
          f.name && f.pos && !isFurnJunk(f.name)
        );
        parts.forEach(function(p, i) { if (p.id === undefined) p.id = i; });
        autoLayout(parts);
        buildScene();
        selectedId = null;
        loadProgress();
        centerCamera();
        closeDrawer();
        updateStats();
        showToast('✅ Загружено ' + parts.length + ' деталей');
        document.getElementById('projectTitle').textContent = file.name.replace('.json', '');
        saveProgress();
      } catch (err) {
        showToast('❌ Ошибка файла: ' + err.message);
      } finally {
        document.getElementById('loadingOverlay').classList.remove('show');
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
})();

// 2.2 Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Don't handle shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch(e.key) {
    case 'Escape':
      closeDrawer();
      closeSheet();
      document.getElementById('scannerModal').classList.add('hidden');
      document.getElementById('statsModal').classList.add('hidden');
      document.getElementById('onboardingModal').classList.add('hidden');
      break;
    case 'r':
    case 'R':
      if (!e.ctrlKey && !e.metaKey) {
        isSmoothZoom = false;
        autoRotate = false;
        centerCamera();
        showToast('🎯 Вид сброшен');
      }
      break;
    case 'x':
    case 'X':
      if (!e.ctrlKey && !e.metaKey) toggleXray();
      break;
    case 'e':
    case 'E':
      if (!e.ctrlKey && !e.metaKey) toggleExplode();
      break;
    case 'f':
    case 'F':
      if (!e.ctrlKey && !e.metaKey) {
        if (selectedId !== null) { startSmoothZoom(selectedId); }
        else { showToast('Сначала выберите деталь'); }
      }
      break;
    case 'ArrowLeft':
      if (assemblyMode && assemblyOrder.length > 0) {
        e.preventDefault();
        assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
        updateAssemblyStep();
      }
      break;
    case 'ArrowRight':
      if (assemblyMode && assemblyOrder.length > 0) {
        e.preventDefault();
        assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
        updateAssemblyStep();
      }
      break;
    case ' ':
      if (assemblyMode) {
        e.preventDefault();
        toggleAssemblyPlay();
      }
      break;
  }
});

// 2.3 Swipe navigation for assembly overlay
(function() {
  const overlay = document.getElementById('assemblyOverlay');
  let touchStartX = 0;
  let touchStartY = 0;

  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  overlay.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // Swipe left -> next
        assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
      } else {
        // Swipe right -> prev
        assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
      }
      updateAssemblyStep();
    }
  }, { passive: true });
})();

// End UX improvements

function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  if (autoRotate && !isDragging && !isSmoothZoom) {
    theta += 0.0025;
    updateCamera();
  }
  if (isSmoothZoom) {
    animateSmoothZoom();
  }
  renderer.render(scene, camera);
}
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
initTheme();
try {
  initThree();
} catch(e) {
  console.error('3D initialization failed:', e);
  document.getElementById('loadingOverlay').innerHTML = '<div style="text-align:center;color:#ff6b6b;padding:20px"><div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="font-size:14px">Ошибка инициализации 3D</div><div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">' + e.message + '</div></div>';
  document.getElementById('loadingOverlay').classList.add('show');
}
updateStats();

// === Auth & Device Logic ===
let currentUser = null;
let userDeviceLimit = 5;
async function getDeviceFingerprint() {
  const components = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, screen.colorDepth, new Date().getTimezoneOffset(), navigator.hardwareConcurrency || "unknown"];
  const fingerprintStr = components.join("|");
  let hash = 0;
  for (let i = 0; i < fingerprintStr.length; i++) {
    const charCode = fingerprintStr.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash = hash & hash;
  }
  return "fp_" + Math.abs(hash).toString(36);
}
function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) {
    return "iPhone";
  }
  if (/iPad/.test(ua)) {
    return "iPad";
  }
  if (/Android/.test(ua)) {
    const uaMatch = ua.match(/;\s*([^;]+)\s*Build/);
    if (uaMatch) {
      return uaMatch[1].trim();
    } else {
      return "Android Device";
    }
  }
  if (/Windows/.test(ua)) {
    return "Windows PC";
  }
  if (/Mac/.test(ua)) {
    return "Mac";
  }
  if (/Linux/.test(ua)) {
    return "Linux PC";
  }
  return "Unknown Device";
}
async function checkDeviceLimit(user) {
  const fingerprint = await getDeviceFingerprint();
  const deviceName = getDeviceName();
  const devicesRef = db.collection("users").doc(user.uid).collection("devices");
  const deviceDoc = await devicesRef.doc(fingerprint).get();
  if (deviceDoc.exists) {
    await devicesRef.doc(fingerprint).update({
      lastAccess: firebase.firestore.FieldValue.serverTimestamp()
    });
    return {
      allowed: true
    };
  }
  const devicesSnap = await devicesRef.get();
  const deviceCount = devicesSnap.size;
  const userDoc = await db.collection("users").doc(user.uid).get();
  const limit = userDoc.data()?.deviceLimit || 5;
  userDeviceLimit = limit;
  if (deviceCount >= limit) {
    return {
      allowed: false,
      deviceCount: deviceCount,
      deviceLimit: limit,
      message: "Лимит устройств исчерпан (" + deviceCount + "/" + limit + ")"
    };
  }
  await devicesRef.doc(fingerprint).set({
    name: deviceName,
    fingerprint: fingerprint,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
  });
  return {
    allowed: true,
    deviceCount: deviceCount + 1,
    deviceLimit: limit
  };
}
async function handleLogin() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errorEl = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  if (!email || !password) {
    errorEl.textContent = "Введите email и пароль";
    errorEl.classList.add("show");
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Вход...";
  errorEl.classList.remove("show");
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const authUser = cred.user;
    const deviceResult = await checkDeviceLimit(authUser);
    if (!deviceResult.allowed) {
      await auth.signOut();
      throw new Error(deviceResult.message);
    }
    currentUser = authUser;
    document.getElementById("deviceCountInfo").textContent = deviceResult.deviceCount;
    document.getElementById("deviceLimitInfo").textContent = deviceResult.deviceLimit;
    showMainApp();
  } catch (authErr) {
    let errMsg = "Ошибка авторизации";
    if (authErr.code === "auth/user-not-found") {
      errMsg = "Пользователь не найден";
    } else if (authErr.code === "auth/wrong-password") {
      errMsg = "Неверный пароль";
    } else if (authErr.code === "auth/invalid-email") {
      errMsg = "Некорректный email";
    } else if (authErr.code === "auth/too-many-requests") {
      errMsg = "Слишком много попыток. Подождите";
    } else {
      errMsg = authErr.message;
    }
    errorEl.textContent = errMsg;
    errorEl.classList.add("show");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Войти";
  }
}
function showLoginPage() {
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("mainApp").style.display = "none";
}
function showMainApp() {
  document.getElementById("loginPage").classList.remove("active");
  document.getElementById("mainApp").style.display = "block";
}
async function checkAccountDeadline(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    var data = doc.data();
    if (data && data.expiresAt) {
      var exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (new Date() > exp) {
        var days = Math.ceil((new Date() - exp) / 86400000);
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0c12;color:#fff;font-family:sans-serif;text-align:center;padding:20px"><div><div style="font-size:48px;margin-bottom:16px">&#x1f512;</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">&#x410;&#x43a;&#x43a;&#x430;&#x443;&#x43d;&#x442; &#x437;&#x430;&#x431;&#x43b;&#x43e;&#x43a;&#x438;&#x440;&#x43e;&#x432;&#x430;&#x43d;</div><div style="font-size:14px;color:#94a3b8;margin-bottom:16px">&#x421;&#x440;&#x43e;&#x43a; &#x434;&#x435;&#x439;&#x441;&#x442;&#x432;&#x438;&#x44f; &#x438;&#x441;&#x442;&#x451;&#x43a; ' + exp.toLocaleDateString('ru-RU') + ' (' + days + ' &#x434;&#x43d;.)</div><div style="font-size:12px;color:#64748b">&#x421;&#x432;&#x44f;&#x436;&#x438;&#x442;&#x435;&#x441;&#x44c; &#x441; &#x430;&#x434;&#x43c;&#x438;&#x43d;&#x438;&#x441;&#x442;&#x440;&#x430;&#x442;&#x43e;&#x440;&#x43e;&#x43c; &#x434;&#x43b;&#x44f; &#x43f;&#x440;&#x43e;&#x434;&#x43b;&#x435;&#x43d;&#x438;&#x44f;</div></div></div>';
        auth.signOut();
      }
    }
  } catch(e) { console.error("Account deadline check failed:", e); }
}

auth.onAuthStateChanged(authUser => {
  if (authUser) {
    currentUser = authUser;
    checkDeviceLimit(authUser).then(result => {
      if (result.allowed) {
        document.getElementById("deviceCountInfo").textContent = result.deviceCount;
        document.getElementById("deviceLimitInfo").textContent = result.deviceLimit;
        showMainApp();
        checkAccountDeadline(authUser.uid);
      } else {
        showLoginPage();
      }
    });
  } else {
    currentUser = null;
    showLoginPage();
  }
});
document.getElementById("authPassword").addEventListener("keypress", e => {
  if (e.key === "Enter") {
    handleLogin();
  }
});
document.getElementById("authEmail").addEventListener("keypress", e => {
  if (e.key === "Enter") {
    document.getElementById("authPassword").focus();
  }
});
let onboardStep = 0;
const onboardSteps = document.querySelectorAll(".onboard-step");
const onboardDots = document.querySelectorAll(".onboard-dot");
const onboardBtn = document.getElementById("onboardNext");
function showOnboarding() {
  const onboarded = localStorage.getItem("aivoOnboarded");
  if (onboarded) {
    return;
  }
  document.getElementById("onboardingModal").classList.remove("hidden");
}
function updateOnboardStep() {
  onboardSteps.forEach((step, idx) => step.style.display = idx === onboardStep ? "block" : "none");
  onboardDots.forEach((dot, idx) => {
    dot.style.background = idx === onboardStep ? "var(--accent)" : "var(--bg-tertiary)";
    dot.style.width = idx === onboardStep ? "20px" : "8px";
  });
  onboardBtn.textContent = onboardStep === onboardSteps.length - 1 ? "Начать!" : "Далее";
}
onboardBtn.addEventListener("click", () => {
  onboardStep++;
  if (onboardStep >= onboardSteps.length) {
    localStorage.setItem("aivoOnboarded", "1");
    document.getElementById("onboardingModal").classList.add("hidden");
    onboardStep = 0;
  } else {
    updateOnboardStep();
  }
});
const origShowMainApp = showMainApp;
showMainApp = function () {
  origShowMainApp();
  setTimeout(showOnboarding, 500);
};