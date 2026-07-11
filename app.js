// === Main App Logic ===
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
let mouseStartPos = null;
let mouseMovedDistance = 0;
const MODULE_COLORS = ["#00d4aa", "#ff6b6b", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#34d399", "#e879f9", "#06b6d4", "#8b5cf6", "#ef4444", "#10b981", "#f59e0b", "#ec4899", "#14b8a6", "#84cc16", "#6366f1", "#f97316", "#22d3ee", "#a855f7", "#e11d48", "#059669", "#d97706", "#d946ef", "#0891b2", "#65a30d", "#4f46e5", "#ea580c"];
const colorCache = new Map();
let colorIdx = 0;
function getModulePrefix(_0x1a87e9) {
  if (!_0x1a87e9) {
    return "OTHER";
  }
  const _0x6a7f3b = _0x1a87e9.match(/^(DETS_\d+|MEDC_\d+|KUH_\d+_\d+|MUD_\d+|D-\d+)/);
  if (_0x6a7f3b) {
    return _0x6a7f3b[1];
  }
  return "OTHER";
}
function getModuleKey(_0xf7de14) {
  const _0x4932b7 = getModulePrefix(_0xf7de14);
  if (_0x4932b7 === "OTHER") {
    return "OTHER";
  }
  if (_0x4932b7.startsWith("D-")) {
    return "HARDWARE";
  }
  const _0x37853d = _0x4932b7.match(/^(MEDC_\d+|KUH_\d+|MUD_\d+)/);
  if (_0x37853d) {
    return _0x37853d[1];
  }
  return _0x4932b7;
}
function getModuleColor(_0x1d9c4c) {
  const _0x3ad003 = getModuleKey(_0x1d9c4c);
  if (_0x3ad003 === "HARDWARE") {
    return "#94a3b8";
  }
  if (_0x3ad003 === "OTHER") {
    return "#6b7280";
  }
  if (colorCache.has(_0x3ad003)) {
    return colorCache.get(_0x3ad003);
  }
  const _0x11fa1f = MODULE_COLORS[colorIdx % MODULE_COLORS.length];
  colorIdx++;
  colorCache.set(_0x3ad003, _0x11fa1f);
  return _0x11fa1f;
}
function getModuleName(_0x53a1eb) {
  const _0x340d0c = getModuleKey(_0x53a1eb);
  if (_0x340d0c === "HARDWARE") {
    return "Фурнитура";
  }
  if (_0x340d0c === "OTHER") {
    return "Прочее";
  }
  if (_0x340d0c.startsWith("MEDC_")) {
    const _0x597725 = _0x340d0c.replace("MEDC_", "");
    return "Медицинский " + _0x597725;
  }
  if (_0x340d0c.startsWith("KUH_")) {
    const _0x201dcd = _0x340d0c.replace("KUH_", "");
    return "Шкаф " + _0x201dcd;
  }
  if (_0x340d0c.startsWith("MUD_")) {
    const _0x4e4c3b = _0x340d0c.replace("MUD_", "");
    return "Тумба " + _0x4e4c3b;
  }
  return _0x340d0c;
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
    document.getElementById("themeToggle").textContent = "🌙";
    if (scene) {
      scene.background.setHex(1711134);
      if (floor) floor.material.color.setHex(0x2a2a2e);
      if (wall) wall.material.color.setHex(0x222226);
    }
    if (scene) {
      scene.fog.color.setHex(1711134);
    }
  } else {
    document.body.classList.add("light-theme");
    document.getElementById("themeToggle").textContent = "☀️";
    if (scene) {
      scene.background.setHex(15790322);
      if (floor) floor.material.color.setHex(0xd8d8dc);
      if (wall) wall.material.color.setHex(0xeaeaed);
    }
    if (scene) {
      scene.fog.color.setHex(15790322);
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
  scene.background = new THREE.Color(isDarkTheme ? 1711134 : 15790322);
  scene.fog = new THREE.FogExp2(isDarkTheme ? 1711134 : 15790322, 0.025);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(3, 2.5, 3);
  const _0x3c7944 = new THREE.AmbientLight(6316160, 1.2);
  scene.add(_0x3c7944);
  const _0x4052af = new THREE.DirectionalLight(16777215, 1);
  _0x4052af.position.set(10, 20, 10);
  _0x4052af.castShadow = true;
  _0x4052af.shadow.mapSize.set(1024, 1024);
  _0x4052af.shadow.camera.left = -50;
  _0x4052af.shadow.camera.right = 50;
  _0x4052af.shadow.camera.top = 50;
  _0x4052af.shadow.camera.bottom = -50;
  _0x4052af.shadow.bias = -0.001;
  _0x4052af.shadow.radius = 4;
  scene.add(_0x4052af);
  const _0x2c35d8 = new THREE.DirectionalLight(8956671, 0.45);
  _0x2c35d8.position.set(-5, 4, -8);
  scene.add(_0x2c35d8);
  // Room — floor
  var floorGeo = new THREE.PlaneGeometry(60, 60);
  var floorMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x2a2a2e : 0xd8d8dc,
    roughness: 0.85,
    metalness: 0
  });
  floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  scene.add(floor);

  // Room — back wall
  var wallGeo = new THREE.PlaneGeometry(60, 30);
  var wallMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x222226 : 0xeaeaed,
    roughness: 0.95,
    metalness: 0
  });
  wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 15, -30);
  wall.receiveShadow = true;
  scene.add(wall);

  // Room — left wall
  var lWallGeo = new THREE.PlaneGeometry(60, 30);
  var lWallMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x252528 : 0xe5e5e7,
    roughness: 0.95,
    metalness: 0
  });
  var lWall = new THREE.Mesh(lWallGeo, lWallMat);
  lWall.position.set(-30, 15, 0);
  lWall.rotation.y = Math.PI / 2;
  lWall.receiveShadow = true;
  scene.add(lWall);
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
}
function onTouchStart(_0x254a9d) {
  _0x254a9d.preventDefault();
  const _0x2c40f5 = _0x254a9d.touches;
  if (_0x2c40f5.length === 1) {
    touchStartPos = {
      x: _0x2c40f5[0].clientX,
      y: _0x2c40f5[0].clientY
    };
    isDragging = true;
    prevMouse = {
      x: _0x2c40f5[0].clientX,
      y: _0x2c40f5[0].clientY
    };
    autoRotate = false;
  } else if (_0x2c40f5.length === 2) {
    isPinching = true;
    isDragging = false;
    const _0x2c681d = _0x2c40f5[0].clientX - _0x2c40f5[1].clientX;
    const _0x485dab = _0x2c40f5[0].clientY - _0x2c40f5[1].clientY;
    pinchStartDist = Math.hypot(_0x2c681d, _0x485dab);
    pinchStartCamDist = camDist;
  }
}
function onTouchMove(_0x699653) {
  _0x699653.preventDefault();
  const _0x1240a0 = _0x699653.touches;
  if (_0x1240a0.length === 1 && isDragging) {
    theta -= (_0x1240a0[0].clientX - prevMouse.x) * 0.008;
    phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (_0x1240a0[0].clientY - prevMouse.y) * 0.008));
    prevMouse = {
      x: _0x1240a0[0].clientX,
      y: _0x1240a0[0].clientY
    };
    updateCamera();
  } else if (_0x1240a0.length === 2 && isPinching) {
    const _0x53e651 = _0x1240a0[0].clientX - _0x1240a0[1].clientX;
    const _0xe2b279 = _0x1240a0[0].clientY - _0x1240a0[1].clientY;
    const _0x55210e = Math.hypot(_0x53e651, _0xe2b279);
    camDist = Math.max(0.5, Math.min(80, pinchStartCamDist + (pinchStartDist - _0x55210e) * 0.015));
    updateCamera();
  }
}
function onTouchEnd(_0x4a1163) {
  if (touchStartPos && !isPinching) {
    const _0x3f1e04 = canvas.getBoundingClientRect();
    const _0xd5ccae = _0x4a1163.changedTouches[0];
    if (Math.abs(_0xd5ccae.clientX - touchStartPos.x) < 5 && Math.abs(_0xd5ccae.clientY - touchStartPos.y) < 5) {
      handleRaycast(_0xd5ccae.clientX, _0xd5ccae.clientY, _0x3f1e04);
    }
  }
  isDragging = false;
  isPinching = false;
  touchStartPos = null;
}
function onMouseDown(_0x4d6338) {
  if (_0x4d6338.button === 0) {
    mouseStartPos = {
      x: _0x4d6338.clientX,
      y: _0x4d6338.clientY
    };
    mouseMovedDistance = 0;
    isDragging = true;
    prevMouse = {
      x: _0x4d6338.clientX,
      y: _0x4d6338.clientY
    };
    autoRotate = false;
  }
}
function onMouseMove(_0x2cd6db) {
  if (!isDragging) {
    return;
  }
  const _0xc9cc87 = _0x2cd6db.clientX - prevMouse.x;
  const _0x2ee767 = _0x2cd6db.clientY - prevMouse.y;
  mouseMovedDistance += Math.abs(_0xc9cc87) + Math.abs(_0x2ee767);
  theta -= _0xc9cc87 * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - _0x2ee767 * 0.005));
  prevMouse = {
    x: _0x2cd6db.clientX,
    y: _0x2cd6db.clientY
  };
  updateCamera();
}
function onMouseUp() {
  if (isDragging && mouseStartPos && mouseMovedDistance < 5) {
    const _0x4bb2d3 = canvas.getBoundingClientRect();
    handleRaycast(mouseStartPos.x, mouseStartPos.y, _0x4bb2d3);
  }
  isDragging = false;
  mouseStartPos = null;
  mouseMovedDistance = 0;
}
function onWheel(_0x20bc2f) {
  _0x20bc2f.preventDefault();
  camDist = Math.max(0.5, Math.min(80, camDist + camDist * _0x20bc2f.deltaY * 0.001));
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
function startSmoothZoom(_0x522c0d) {
  const _0x4805c9 = parts.find(_0x2bf44b => _0x2bf44b.id === _0x522c0d);
  if (!_0x4805c9 || !_0x4805c9._pos) {
    return;
  }
  zoomPartCenter = new THREE.Vector3(_0x4805c9._pos.x, _0x4805c9._pos.y, _0x4805c9._pos.z);
  const size = Math.max(_0x4805c9._size.x, _0x4805c9._size.y, _0x4805c9._size.z);
  const dist = Math.max(size * 2.5, 0.8);
  const dir = camera.position.clone().sub(zoomPartCenter).normalize();
  zoomTarget.set(
    _0x4805c9._pos.x + dir.x * dist,
    _0x4805c9._pos.y + dir.y * dist,
    _0x4805c9._pos.z + dir.z * dist
  );
  isSmoothZoom = true;
  autoRotate = false;
}
function animateSmoothZoom() {
  if (!isSmoothZoom) {
    return;
  }
  const _0x88b9bb = 0.12;
  camera.position.lerp(zoomTarget, _0x88b9bb);
  if (zoomPartCenter) {
    targetPosition.lerp(zoomPartCenter, _0x88b9bb);
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
  const hits = rc.intersectObjects(meshes);
  if (hits.length === 0) return;
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
function autoLayout(_0x21e6bb) {
  let _0x55fa88 = Infinity;
  _0x21e6bb.forEach(_0x394f4f => {
    if (_0x394f4f.pos && _0x394f4f.pos.y !== undefined) {
      _0x55fa88 = Math.min(_0x55fa88, _0x394f4f.pos.y);
    }
  });
  if (_0x55fa88 === Infinity) {
    _0x55fa88 = 0;
  }
  const _0x144740 = 0.001;
  _0x21e6bb.forEach(_0x47c18e => {
    if (!_0x47c18e.pos || !_0x47c18e.gab) {
      const _0x1f9f95 = Math.ceil(Math.sqrt(_0x21e6bb.length));
      const _0x24224b = Math.floor(_0x47c18e.id / _0x1f9f95);
      const _0x346bc5 = _0x47c18e.id % _0x1f9f95;
      _0x47c18e._pos = {
        x: (_0x346bc5 - _0x1f9f95 / 2) * 0.15,
        y: 0,
        z: (_0x24224b - _0x1f9f95 / 2) * 0.15
      };
      _0x47c18e._size = {
        x: 0.1,
        y: 0.1,
        z: 0.1
      };
      return;
    }
    _0x47c18e._pos = {
      x: (_0x47c18e.pos.x + _0x47c18e.gab.w / 2) * _0x144740,
      y: (_0x47c18e.pos.y - _0x55fa88 + _0x47c18e.gab.h / 2) * _0x144740,
      z: (_0x47c18e.pos.z + _0x47c18e.gab.d / 2) * _0x144740
    };
    _0x47c18e._size = {
      x: Math.max(_0x47c18e.gab.w, 1) * _0x144740,
      y: Math.max(_0x47c18e.gab.h, 1) * _0x144740,
      z: Math.max(_0x47c18e.gab.d, 1) * _0x144740
    };
  });
}
function getColor(_0x4bbcdd, _0xd91d8f) {
  if (_0xd91d8f?.color) {
    return _0xd91d8f.color;
  }
  const _0xad0f3a = (_0x4bbcdd || "").toLowerCase();
  const _0x1ea202 = (_0xd91d8f?.code || _0x4bbcdd || "").toLowerCase();
  const _0x123e4a = {
    h3050: "#d4af8f",
    h3051: "#b89062",
    h3052: "#a67c52",
    h3053: "#3b2a1c",
    "la-oak-light": "#d4af8f",
    "la-oak-dark": "#b89062",
    "la-wenge": "#3b2a1c",
    "la-white": "#ece7e0",
    "la-gray": "#5a5a60"
  };
  if (_0x123e4a[_0x1ea202]) {
    return _0x123e4a[_0x1ea202];
  }
  if (_0xad0f3a.match(/гикори|рокфорд|walnut|hickory/)) {
    return "#8b6f47";
  }
  if (_0xad0f3a.match(/каселла|casella|коричнев|brown/)) {
    return "#7a5c3a";
  }
  if (_0xad0f3a.match(/ликольн|lincoln|орех|nut/)) {
    return "#6b5340";
  }
  if (_0xad0f3a.match(/белый|white|pearl|cream|ivory/)) {
    return "#ece7e0";
  }
  if (_0xad0f3a.match(/сонома|sonoma/)) {
    return "#d4af8f";
  }
  if (_0xad0f3a.match(/венге|wenge/)) {
    return "#3b2a1c";
  }
  if (_0xad0f3a.match(/черный|black|graphite|графит/)) {
    return "#3a3a44";
  }
  if (_0xad0f3a.match(/серый|grey|gray|кашемир|cashmere/)) {
    return "#8a8a96";
  }
  if (_0xad0f3a.match(/хдф|HDF/)) {
    return "#d8dce6";
  }
  if (_0xad0f3a.match(/мдф|MDF|ламинир/)) {
    return "#a89878";
  }
  if (_0xad0f3a.match(/алюминий|aluminum|профиль/)) {
    return "#b8bcc8";
  }
  if (_0xad0f3a.match(/черновой|rough/)) {
    return "#7a7060";
  }
  return "#8a7f76";
}
function buildPartDetails(_0x2b3c69, _0x4fc6b4) {
  const _0x5755d4 = [];
  const _0x5dfeb9 = _0x2b3c69.grooves || [];
  const _0x490fa6 = _0x2b3c69.holes || [];
  const _0x4631c4 = _0x2b3c69.cutouts || [];
  const _0x11d49e = _0x2b3c69.edges || [];
  if (!_0x5dfeb9.length && !_0x490fa6.length && !_0x4631c4.length && !_0x11d49e.length) {
    return _0x5755d4;
  }
  const _0x15dd94 = _0x4fc6b4.position;
  _0x5dfeb9.forEach(_0x542ff5 => {
    const _0x26c768 = (_0x542ff5.w || 20) * sc;
    const _0x367f75 = (_0x542ff5.h || 20) * sc;
    const _0x51c5a0 = (_0x542ff5.d || _0x2b3c69.T || 16) * sc;
    const _0x419078 = new THREE.BoxGeometry(_0x26c768, _0x367f75, _0x51c5a0);
    const _0x46a40e = new THREE.MeshStandardMaterial({
      color: 2236962,
      roughness: 0.9,
      metalness: 0
    });
    const _0x400601 = new THREE.Mesh(_0x419078, _0x46a40e);
    _0x400601.position.set(_0x15dd94.x + (_0x542ff5.x || 0) * sc, _0x15dd94.y + (_0x542ff5.y || 0) * sc, _0x15dd94.z + (_0x542ff5.z || 0) * sc);
    _0x400601.userData = {
      partId: _0x2b3c69.id,
      detailType: "groove"
    };
    scene.add(_0x400601);
    const _0x110204 = new THREE.EdgesGeometry(_0x419078, 15);
    const _0x3321a8 = new THREE.LineSegments(_0x110204, new THREE.LineBasicMaterial({
      color: 5592405
    }));
    _0x3321a8.position.copy(_0x400601.position);
    scene.add(_0x3321a8);
    _0x5755d4.push(_0x400601, _0x3321a8);
  });
  _0x490fa6.forEach(_0x488813 => {
    const _0x2690f4 = (_0x488813.d || _0x488813.r || 8) / 2 * sc;
    const _0x419a0e = (_0x488813.depth || _0x2b3c69.T || 16) * sc;
    const _0x4fb012 = new THREE.CylinderGeometry(_0x2690f4, _0x2690f4, _0x419a0e, 12);
    const _0x47236e = new THREE.MeshStandardMaterial({
      color: 1711134,
      roughness: 0.8,
      metalness: 0.2
    });
    const _0x2810ed = new THREE.Mesh(_0x4fb012, _0x47236e);
    _0x2810ed.position.set(_0x15dd94.x + (_0x488813.x || 0) * sc, _0x15dd94.y + (_0x488813.y || 0) * sc, _0x15dd94.z + (_0x488813.z || 0) * sc);
    if (_0x488813.angleX) {
      _0x2810ed.rotation.x = _0x488813.angleX * Math.PI / 180;
    }
    if (_0x488813.angleZ) {
      _0x2810ed.rotation.z = _0x488813.angleZ * Math.PI / 180;
    }
    _0x2810ed.userData = {
      partId: _0x2b3c69.id,
      detailType: "hole"
    };
    scene.add(_0x2810ed);
    _0x5755d4.push(_0x2810ed);
  });
  _0x4631c4.forEach(_0x44dd11 => {
    const _0x591426 = (_0x44dd11.w || 30) * sc;
    const _0x213f13 = (_0x44dd11.h || 30) * sc;
    const _0x483422 = (_0x44dd11.d || _0x2b3c69.T || 16) * sc;
    const _0x67b09c = new THREE.BoxGeometry(_0x591426, _0x213f13, _0x483422);
    const _0x1ffb5d = new THREE.MeshStandardMaterial({
      color: 1710638,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.7
    });
    const _0x43beae = new THREE.Mesh(_0x67b09c, _0x1ffb5d);
    _0x43beae.position.set(_0x15dd94.x + (_0x44dd11.x || 0) * sc, _0x15dd94.y + (_0x44dd11.y || 0) * sc, _0x15dd94.z + (_0x44dd11.z || 0) * sc);
    _0x43beae.userData = {
      partId: _0x2b3c69.id,
      detailType: "cutout"
    };
    scene.add(_0x43beae);
    const _0x8889bb = new THREE.EdgesGeometry(_0x67b09c, 15);
    const _0x22d089 = new THREE.LineSegments(_0x8889bb, new THREE.LineBasicMaterial({
      color: 6710886
    }));
    _0x22d089.position.copy(_0x43beae.position);
    scene.add(_0x22d089);
    _0x5755d4.push(_0x43beae, _0x22d089);
  });
  _0x11d49e.forEach(_0x42d5a3 => {
    const _0x4c105b = (_0x42d5a3.side || "").toLowerCase();
    const _0x2680a0 = (_0x42d5a3.length || 0) * sc;
    const _0x9bf9cd = 0.002;
    let _0x453a88;
    let _0x96928b;
    let _0x2a853f;
    let _0x133cdc;
    let _0x1f48b1;
    let _0x13a94e;
    if (_0x4c105b.includes("w") || _0x4c105b.includes("длин")) {
      _0x453a88 = _0x2680a0;
      _0x96928b = _0x9bf9cd;
      _0x2a853f = _0x9bf9cd;
      _0x133cdc = _0x15dd94.x;
      _0x1f48b1 = _0x15dd94.y;
      _0x13a94e = _0x15dd94.z + (_0x42d5a3.offset || 0) * sc;
    } else if (_0x4c105b.includes("h") || _0x4c105b.includes("выс")) {
      _0x453a88 = _0x9bf9cd;
      _0x96928b = _0x2680a0;
      _0x2a853f = _0x9bf9cd;
      _0x133cdc = _0x15dd94.x + (_0x42d5a3.offset || 0) * sc;
      _0x1f48b1 = _0x15dd94.y;
      _0x13a94e = _0x15dd94.z;
    } else {
      _0x453a88 = _0x9bf9cd;
      _0x96928b = _0x9bf9cd;
      _0x2a853f = _0x2680a0;
      _0x133cdc = _0x15dd94.x;
      _0x1f48b1 = _0x15dd94.y + (_0x42d5a3.offset || 0) * sc;
      _0x13a94e = _0x15dd94.z;
    }
    const _0x52947a = new THREE.BoxGeometry(_0x453a88 || 0.01, _0x96928b || 0.01, _0x2a853f || 0.01);
    const _0xb14f12 = new THREE.MeshStandardMaterial({
      color: 3832378,
      roughness: 0.6,
      metalness: 0.1
    });
    const _0x5357ea = new THREE.Mesh(_0x52947a, _0xb14f12);
    _0x5357ea.position.set(_0x133cdc, _0x1f48b1, _0x13a94e);
    _0x5357ea.userData = {
      partId: _0x2b3c69.id,
      detailType: "edge"
    };
    scene.add(_0x5357ea);
    _0x5755d4.push(_0x5357ea);
  });
  return _0x5755d4;
}
const detailMeshes = new Map();
const sc = 0.001;
function buildScene() {
  meshMap.forEach(_0x173be4 => scene.remove(_0x173be4));
  edgeLineMap.forEach(_0x950062 => scene.remove(_0x950062));
  detailMeshes.forEach(_0x14b315 => _0x14b315.forEach(_0x2f8487 => scene.remove(_0x2f8487)));
  meshMap.clear();
  edgeLineMap.clear();
  detailMeshes.clear();
  originalPositions.clear();
  const _sharedEdgeMat = new THREE.LineBasicMaterial({ color: 1710618 });
  parts.forEach(_0x243d4d => {
    const _0x23519e = new THREE.BoxGeometry(_0x243d4d._size.x, _0x243d4d._size.y, _0x243d4d._size.z);
    const _0x4b7de9 = new THREE.MeshStandardMaterial({
      color: getColor(_0x243d4d.material, _0x243d4d),
      roughness: 0.55,
      metalness: 0.1,
      emissive: new THREE.Color(0),
      emissiveIntensity: 0
    });
    const _0x6305cf = new THREE.Mesh(_0x23519e, _0x4b7de9);
    _0x6305cf.position.set(_0x243d4d._pos.x, _0x243d4d._pos.y, _0x243d4d._pos.z);
    _0x6305cf.userData = {
      partId: _0x243d4d.id
    };
    _0x6305cf.castShadow = true;
    _0x6305cf.receiveShadow = true;
    scene.add(_0x6305cf);
    const _0x44c383 = new THREE.EdgesGeometry(_0x23519e, 15);
    const _0x50f719 = new THREE.LineSegments(_0x44c383, _sharedEdgeMat);
    _0x50f719.position.copy(_0x6305cf.position);
    scene.add(_0x50f719);
    originalPositions.set(_0x243d4d.id, new THREE.Vector3(_0x243d4d._pos.x, _0x243d4d._pos.y, _0x243d4d._pos.z));
    meshMap.set(_0x243d4d.id, _0x6305cf);
    edgeLineMap.set(_0x243d4d.id, _0x50f719);
    const _0x726769 = buildPartDetails(_0x243d4d, _0x6305cf);
    if (_0x726769.length) {
      detailMeshes.set(_0x243d4d.id, _0x726769);
    }
  });
  centerCamera();
  updateStats();
  buildModuleMap();
  renderPartsList();
  updateSummary();
}
function buildModuleMap() {
  moduleMap.clear();
  parts.forEach(_0x4def2b => {
    const _0x28d01c = idMode === "position" ? _0x4def2b.position || _0x4def2b.code || "" : _0x4def2b.code || "";
    const _0x367b87 = getModuleKey(_0x28d01c);
    if (!moduleMap.has(_0x367b87)) {
      moduleMap.set(_0x367b87, []);
    }
    moduleMap.get(_0x367b87).push(_0x4def2b);
  });
}
function centerCamera() {
  if (!parts.length) {
    return;
  }
  let _0x361143 = Infinity;
  let _0x1652e5 = -Infinity;
  let _0x279946 = Infinity;
  let _0xcfe2d1 = -Infinity;
  let _0x2836ce = Infinity;
  let _0x21a543 = -Infinity;
  parts.forEach(_0x5e20e0 => {
    if (!_0x5e20e0._pos) {
      return;
    }
    _0x361143 = Math.min(_0x361143, _0x5e20e0._pos.x - _0x5e20e0._size.x / 2);
    _0x1652e5 = Math.max(_0x1652e5, _0x5e20e0._pos.x + _0x5e20e0._size.x / 2);
    _0x279946 = Math.min(_0x279946, _0x5e20e0._pos.y - _0x5e20e0._size.y / 2);
    _0xcfe2d1 = Math.max(_0xcfe2d1, _0x5e20e0._pos.y + _0x5e20e0._size.y / 2);
    _0x2836ce = Math.min(_0x2836ce, _0x5e20e0._pos.z - _0x5e20e0._size.z / 2);
    _0x21a543 = Math.max(_0x21a543, _0x5e20e0._pos.z + _0x5e20e0._size.z / 2);
  });
  targetPosition.set((_0x361143 + _0x1652e5) / 2, (_0x279946 + _0xcfe2d1) / 2, (_0x2836ce + _0x21a543) / 2);
  const _0x2194f8 = Math.max(_0x1652e5 - _0x361143, _0xcfe2d1 - _0x279946, _0x21a543 - _0x2836ce);
  camDist = Math.max(_0x2194f8 * 1.5, 2);
  updateCamera();
}
function selectPart(_0x73f236) {
  selectedId = _0x73f236;
  meshMap.forEach(_0x242f1b => {
    _0x242f1b.material.emissive.setHex(0);
    _0x242f1b.material.emissiveIntensity = 0;
  });
  edgeLineMap.forEach(_0x15c27c => {
    _0x15c27c.material.color.setHex(1710618);
  });
  const _0x218202 = meshMap.get(_0x73f236);
  const _0x4607cd = edgeLineMap.get(_0x73f236);
  if (_0x218202) {
    _0x218202.material.emissive.setHex(54442);
    _0x218202.material.emissiveIntensity = 0.5;
  }
  if (_0x4607cd) {
    _0x4607cd.material.color.setHex(54442);
  }
  if (xrayActive) {
    applyXray();
  }
  updateSheet(parts.find(_0x319268 => _0x319268.id === _0x73f236));
  renderPartsList();
  openSheet();
}
function renderProcessingInfo(_0x2b70dd) {
  const _0x4e9ebd = _0x2b70dd.grooves || [];
  const _0x304d7f = _0x2b70dd.holes || [];
  const _0x4bc704 = _0x2b70dd.cutouts || [];
  const _0x278068 = _0x2b70dd.edges || [];
  const _0x2475e1 = _0x4e9ebd.length || _0x304d7f.length || _0x4bc704.length || _0x278068.length;
  if (!_0x2475e1) {
    return "";
  }
  let _0x502e00 = "<div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">";
  if (_0x4e9ebd.length) {
    _0x502e00 += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Пазы (" + _0x4e9ebd.length + "):</div>";
    _0x4e9ebd.forEach((_0x19407e, _0x380aea) => {
      _0x502e00 += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (_0x380aea + 1) + ". x:" + (_0x19407e.x || 0) + " y:" + (_0x19407e.y || 0) + " " + (_0x19407e.w || 0) + "×" + (_0x19407e.h || 0) + "×" + (_0x19407e.d || 0) + " мм</div>";
    });
  }
  if (_0x304d7f.length) {
    _0x502e00 += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Отверстия (" + _0x304d7f.length + "):</div>";
    _0x304d7f.forEach((_0x5d287d, _0x4df51b) => {
      _0x502e00 += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (_0x4df51b + 1) + ". x:" + (_0x5d287d.x || 0) + " y:" + (_0x5d287d.y || 0) + " ⌀" + (_0x5d287d.d || _0x5d287d.r || "?") + " мм</div>";
    });
  }
  if (_0x4bc704.length) {
    _0x502e00 += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Вырезы (" + _0x4bc704.length + "):</div>";
    _0x4bc704.forEach((_0x4b7cba, _0x3f59e9) => {
      _0x502e00 += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (_0x3f59e9 + 1) + ". x:" + (_0x4b7cba.x || 0) + " y:" + (_0x4b7cba.y || 0) + " " + (_0x4b7cba.w || 0) + "×" + (_0x4b7cba.h || 0) + " мм</div>";
    });
  }
  if (_0x278068.length) {
    _0x502e00 += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Кромка (" + _0x278068.length + "):</div>";
    _0x278068.forEach((_0x209c61, _0x20db6e) => {
      _0x502e00 += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (_0x20db6e + 1) + ". " + (_0x209c61.side || _0x209c61.type || "?") + " " + (_0x209c61.length || "") + (_0x209c61.length ? " мм" : "") + "</div>";
    });
  }
  _0x502e00 += "</div>";
  return _0x502e00;
}
function updateSheet(_0x434ca8) {
  const _0x3bebcb = document.getElementById("sheetContent");
  if (!_0x434ca8) {
    _0x3bebcb.innerHTML = "<div style=\"text-align:center;color:var(--text-secondary);padding:10px;font-size:11px;\">👆 Нажмите на деталь</div>";
    return;
  }
  const _0x13d061 = scannedSet.has(_0x434ca8.id);
  const _0x356435 = idMode === "position" ? _0x434ca8.position || _0x434ca8.code || "" : _0x434ca8.code || "";
  const _0x578194 = getModuleKey(_0x356435);
  const _0x144877 = getModuleName(_0x356435);
  const _0xd64636 = getModuleColor(_0x356435);
  let _0x36092c = "";
  if (_0x578194 !== "HARDWARE" && _0x578194 !== "OTHER") {
    const _0x232770 = moduleMap.get(_0x578194) || [];
    const _0x5ba284 = _0x232770.indexOf(_0x434ca8) + 1;
    _0x36092c = "<div class=\"assembly-hint\">📦 " + _0x144877 + " — деталь " + _0x5ba284 + " из " + _0x232770.length + " в модуле</div>";
  }
  _0x3bebcb.innerHTML = "\n      <div class=\"detail-card\">\n        <div class=\"detail-row\">\n          <span class=\"detail-label\">Наименование:</span>\n          <span class=\"detail-value\" style=\"font-size:13px;font-weight:600\">" + escapeHtml(_0x434ca8.name || "—") + "</span>\n        </div>\n        <div class=\"detail-row\">\n          <span class=\"detail-label\">Обозначение:</span>\n          <span class=\"detail-code\">" + escapeHtml(_0x434ca8.code || "—") + "</span>\n        </div>\n        " + (_0x434ca8.position ? "<div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"detail-label\">Позиция:</span>\n          <span class=\"detail-code\">" + escapeHtml(_0x434ca8.position) + "</span>\n        </div>" : "") + "\n        <div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"material-tag\">" + escapeHtml(_0x434ca8.material || "Материал") + "</span>\n          <span class=\"module-badge\" style=\"color:" + _0xd64636 + ";background:" + _0xd64636 + "18;border-color:" + _0xd64636 + "30\">" + _0x144877 + "</span>\n        </div>\n        <div class=\"dims-row\" style=\"margin-top:3px\">\n          <div class=\"dim\"><span class=\"dim-label\">Д</span><span class=\"dim-value\">" + (_0x434ca8.L || "—") + "</span></div>\n          <div class=\"dim\"><span class=\"dim-label\">Ш</span><span class=\"dim-value\">" + (_0x434ca8.W || "—") + "</span></div>\n          <div class=\"dim\"><span class=\"dim-label\">Т</span><span class=\"dim-value\">" + (_0x434ca8.T || "—") + "</span></div>\n        </div>\n        <div class=\"detail-row\" style=\"margin-top:2px\">\n          <span class=\"status-badge " + (_0x13d061 ? "scanned" : "waiting") + "\">" + (_0x13d061 ? "✅ ОТСКАНИРОВАНО" : "⏳ ОЖИДАЕТ") + "</span>\n        </div>\n        " + _0x36092c + "\n        " + renderProcessingInfo(_0x434ca8) + "\n      </div>\n    ";

}
function toggleVisibility(_0x1fb5ed) {
  const _0x15de41 = meshMap.get(_0x1fb5ed);
  const _0x13c8c9 = edgeLineMap.get(_0x1fb5ed);
  if (!_0x15de41) {
    return;
  }
  if (hiddenSet.has(_0x1fb5ed)) {
    hiddenSet.delete(_0x1fb5ed);
    _0x15de41.visible = true;
    if (_0x13c8c9) {
      _0x13c8c9.visible = true;
    }
  } else {
    hiddenSet.add(_0x1fb5ed);
    _0x15de41.visible = false;
    if (_0x13c8c9) {
      _0x13c8c9.visible = false;
    }
    if (selectedId === _0x1fb5ed) {
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
  showToast((hiddenSet.has(_0x1fb5ed) ? "🙈" : "👁") + " Деталь " + (hiddenSet.has(_0x1fb5ed) ? "скрыта" : "показана"));
}
function showAllParts() {
  hiddenSet.clear();
  meshMap.forEach(_0x1eb95e => {
    _0x1eb95e.visible = true;
  });
  edgeLineMap.forEach(_0x27ab11 => {
    _0x27ab11.visible = true;
  });
  renderPartsList();
  if (xrayActive) {
    applyXray();
  }
  showToast("👁 Все детали показаны");
}
function applyXray() {
  meshMap.forEach((_0x2a1ea7, _0x41f7ed) => {
    if (xrayActive && selectedId !== null && _0x41f7ed !== selectedId && _0x2a1ea7.visible) {
      _0x2a1ea7.material.transparent = true;
      _0x2a1ea7.material.opacity = 0.12;
    } else {
      _0x2a1ea7.material.transparent = false;
      _0x2a1ea7.material.opacity = 1;
    }
  });
}
function toggleXray() {
  xrayActive = !xrayActive;
  document.getElementById("xrayBtn").classList.toggle("active", xrayActive);
  if (!xrayActive) {
    meshMap.forEach(_0xa5f3ca => {
      _0xa5f3ca.material.transparent = false;
      _0xa5f3ca.material.opacity = 1;
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
function animateExplodeTo(_0xbe5e22) {
  const _0x161763 = explodeProgress;
  const _0x215067 = performance.now();
  const _0xcb15d9 = 600;
  function _0x141926(_0x2c8fd4) {
    const _0x39f2f7 = Math.min((_0x2c8fd4 - _0x215067) / _0xcb15d9, 1);
    const _0x6e02ab = _0x39f2f7 < 0.5 ? _0x39f2f7 * 2 * _0x39f2f7 : 1 - Math.pow(_0x39f2f7 * -2 + 2, 2) / 2;
    explodeProgress = _0x161763 + (_0xbe5e22 - _0x161763) * _0x6e02ab;
    applyExplode();
    if (_0x39f2f7 < 1) {
      requestAnimationFrame(_0x141926);
    }
  }
  requestAnimationFrame(_0x141926);
}
function applyExplode() {
  if (!originalPositions.size) {
    return;
  }
  const _0xa87199 = new THREE.Vector3();
  let _0x11a52a = 0;
  originalPositions.forEach(_0x4fb99c => {
    _0xa87199.add(_0x4fb99c);
    _0x11a52a++;
  });
  if (_0x11a52a > 0) {
    _0xa87199.divideScalar(_0x11a52a);
  }
  parts.forEach(_0x5dc469 => {
    const _0xeb9121 = meshMap.get(_0x5dc469.id);
    const _0x3fd9c4 = edgeLineMap.get(_0x5dc469.id);
    const _0x114eec = originalPositions.get(_0x5dc469.id);
    if (!_0xeb9121 || !_0x114eec) {
      return;
    }
    const _0x148798 = new THREE.Vector3().subVectors(_0x114eec, _0xa87199);
    const _0x1838e1 = _0x148798.length();
    if (_0x1838e1 > 0.001) {
      _0x148798.normalize();
    }
    const _0x30aabb = explodeProgress * _0x1838e1 * 0.8;
    const _0x421b81 = _0x114eec.clone().add(_0x148798.multiplyScalar(_0x30aabb));
    const _0x21babc = new THREE.Vector3().subVectors(_0x421b81, _0x114eec);
    _0xeb9121.position.copy(_0x421b81);
    if (_0x3fd9c4) {
      _0x3fd9c4.position.copy(_0x421b81);
    }
    const _0x450672 = detailMeshes.get(_0x5dc469.id);
    if (_0x450672) {
      _0x450672.forEach(_0x307322 => {
        if (_0x307322.isMesh || _0x307322.isLineSegments) {
          _0x307322.position.add(_0x21babc);
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
  const _0x4917c1 = Array.from(moduleMap.keys()).sort();
  assemblyOrder = [];
  _0x4917c1.forEach(_0x26a864 => {
    const _0x56ac50 = moduleMap.get(_0x26a864);
    if (_0x56ac50) {
      _0x56ac50.forEach(_0x4b3918 => assemblyOrder.push(_0x4b3918));
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
  const _0x334ddd = assemblyOrder[assemblyIndex];
  if (!_0x334ddd) {
    return;
  }
  document.getElementById("assemblyStepLabel").textContent = "Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length;
  const _0x176c95 = _0x334ddd.position ? _0x334ddd.code + " / " + _0x334ddd.position : _0x334ddd.code;
  document.getElementById("assemblyInfo").textContent = _0x176c95 + " — " + (_0x334ddd.name || "—");
  meshMap.forEach((_0x958b20, _0x2aa3c7) => {
    _0x958b20.material.emissive.setHex(0);
    _0x958b20.material.emissiveIntensity = 0;
    _0x958b20.material.transparent = false;
    _0x958b20.material.opacity = 0.15;
  });
  edgeLineMap.forEach(_0x390fd5 => {
    _0x390fd5.material.color.setHex(1710618);
    _0x390fd5.material.transparent = true;
    _0x390fd5.material.opacity = 0.15;
  });
  const _0x413641 = meshMap.get(_0x334ddd.id);
  const _0x371f13 = edgeLineMap.get(_0x334ddd.id);
  if (_0x413641) {
    _0x413641.material.emissive.setHex(54442);
    _0x413641.material.emissiveIntensity = 0.6;
    _0x413641.material.transparent = false;
    _0x413641.material.opacity = 1;
  }
  if (_0x371f13) {
    _0x371f13.material.color.setHex(54442);
    _0x371f13.material.transparent = false;
    _0x371f13.material.opacity = 1;
  }
  startSmoothZoom(_0x334ddd.id);
  updateSheet(_0x334ddd);
  openSheet();
  renderPartsList();
  showToast("🔧 Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length + ": " + (_0x334ddd.name || _0x334ddd.code));
}
function stopAssemblyPlay() {
  assemblyPlaying = false;
  if (assemblyTimer) {
    clearInterval(assemblyTimer);
  }
  assemblyTimer = null;
  document.getElementById("asmPlay").textContent = "▶";
}
function toggleAssemblyPlay() {
  if (assemblyPlaying) {
    stopAssemblyPlay();
  } else {
    assemblyPlaying = true;
    document.getElementById("asmPlay").textContent = "⏸";
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
  const _0x3b1b67 = {};
  let _0x1c4b65 = 0;
  parts.forEach(_0x5c13a7 => {
    const _0x4b2352 = _0x5c13a7.material || "Неизвестно";
    if (!_0x3b1b67[_0x4b2352]) {
      _0x3b1b67[_0x4b2352] = {
        count: 0,
        totalArea: 0
      };
    }
    _0x3b1b67[_0x4b2352].count++;
    if (_0x5c13a7.L && _0x5c13a7.W) {
      _0x3b1b67[_0x4b2352].totalArea += _0x5c13a7.L * _0x5c13a7.W / 1000000;
    }
    if (_0x5c13a7.L && _0x5c13a7.W && _0x5c13a7.T) {
      _0x1c4b65 += _0x5c13a7.L * _0x5c13a7.W * _0x5c13a7.T / 1000 * 6.5e-7;
    }
  });
  const _0x146cea = moduleMap.size;
  let _0x25ce73 = "\n      <div class=\"summary-row\"><span class=\"summary-label\">Всего деталей:</span><span class=\"summary-val\">" + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Модулей:</span><span class=\"summary-val\">" + _0x146cea + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Собрано:</span><span class=\"summary-val\" style=\"color:var(--success)\">" + scannedSet.size + " / " + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Масса:</span><span class=\"summary-val\">≈ " + _0x1c4b65.toFixed(1) + " кг</span></div>\n      <div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">\n    ";
  const _0x3a0c2a = Object.entries(_0x3b1b67).sort((_0x35d8cf, _0x373351) => _0x373351[1].count - _0x35d8cf[1].count);
  _0x3a0c2a.slice(0, 6).forEach(([_0x3d1194, _0x1e4fc0]) => {
    _0x25ce73 += "<div class=\"summary-row\"><span class=\"summary-label\" style=\"font-size:8px\">" + escapeHtml(_0x3d1194.substring(0, 30)) + "</span><span class=\"summary-val\" style=\"font-size:9px\">" + _0x1e4fc0.count + " шт</span></div>";
  });
  _0x25ce73 += "</div>";
  document.getElementById("summaryContent").innerHTML = _0x25ce73;
}
function updateStats() {
  const _0x2ca248 = parts.length;
  const _0x231762 = scannedSet.size;
  const _0x40c396 = _0x2ca248 > 0 ? Math.round(_0x231762 / _0x2ca248 * 100) : 0;
  document.getElementById("totalCount").textContent = _0x2ca248;
  document.getElementById("scannedCount").textContent = _0x231762;
  document.getElementById("progressFill").style.width = _0x40c396 + "%";
}
function renderPartsList() {
  const _0x3d9460 = document.getElementById("partsList");
  if (!_0x3d9460) {
    return;
  }
  const _0x1ec15f = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (parts.length === 0) {
    _0x3d9460.innerHTML = "<div style=\"text-align:center;padding:20px;color:var(--text-secondary);font-size:11px\">📁 Загрузите JSON файл для начала</div>";
    return;
  }
  let _0xe2870e = parts;
  if (_0x1ec15f) {
    _0xe2870e = parts.filter(_0x459900 => (_0x459900.name || "").toLowerCase().includes(_0x1ec15f) || (_0x459900.code || "").toLowerCase().includes(_0x1ec15f) || (_0x459900.position || "").toLowerCase().includes(_0x1ec15f));
  }
  if (_0x1ec15f) {
    _0x3d9460.innerHTML = "";
    if (_0xe2870e.length === 0) {
      _0x3d9460.innerHTML = "<div style=\"text-align:center;padding:16px;color:var(--text-secondary);font-size:11px\">🔍 Ничего не найдено</div>";
      return;
    }
    _0xe2870e.forEach(_0xe95f32 => _0x3d9460.appendChild(createPartItem(_0xe95f32)));
    return;
  }
  _0x3d9460.innerHTML = "";
  const _0x30f91e = Array.from(moduleMap.keys()).sort((_0x56fd03, _0x1018a5) => {
    if (_0x56fd03 === "HARDWARE") {
      return 1;
    }
    if (_0x1018a5 === "HARDWARE") {
      return -1;
    }
    const _0x9a6a75 = _0x56fd03.replace(/_\d+$/, "");
    const _0x97df1f = _0x1018a5.replace(/_\d+$/, "");
    if (_0x9a6a75 !== _0x97df1f) {
      return _0x9a6a75.localeCompare(_0x97df1f);
    }
    const _0x2a1502 = parseInt(_0x56fd03.match(/\d+$/)?.[0] || "0");
    const _0x114155 = parseInt(_0x1018a5.match(/\d+$/)?.[0] || "0");
    return _0x2a1502 - _0x114155;
  });
  _0x30f91e.forEach(_0x4a1608 => {
    const _0x4043d2 = moduleMap.get(_0x4a1608);
    if (!_0x4043d2) {
      return;
    }
    const _0x2f921c = getModuleName(_0x4a1608 === "HARDWARE" ? "D-000" : _0x4a1608 + "_00");
    const _0x597a3c = _0x4a1608 === "HARDWARE" ? "#94a3b8" : getModuleColor(_0x4a1608 + "_00");
    const _0x5ae72d = _0x4043d2.filter(_0x24a7ea => scannedSet.has(_0x24a7ea.id)).length;
    const _0x46356c = document.createElement("div");
    _0x46356c.className = "module-group";
    _0x46356c.innerHTML = "\n        <div class=\"module-header\" data-module=\"" + _0x4a1608 + "\">\n          <div class=\"module-dot\" style=\"background:" + _0x597a3c + "\"></div>\n          <span class=\"module-name\">" + escapeHtml(_0x2f921c) + "</span>\n          <span class=\"module-count\">" + _0x5ae72d + "/" + _0x4043d2.length + "</span>\n          <span class=\"module-arrow open\">▶</span>\n        </div>\n        <div class=\"module-parts\" data-module-parts=\"" + _0x4a1608 + "\"></div>\n      ";
    const _0x91b2a8 = _0x46356c.querySelector(".module-header");
    const _0x28dda9 = _0x46356c.querySelector(".module-parts");
    _0x91b2a8.addEventListener("click", () => {
      _0x28dda9.classList.toggle("collapsed");
      _0x91b2a8.querySelector(".module-arrow").classList.toggle("open");
    });
    _0x4043d2.forEach(_0x3bea5c => _0x28dda9.appendChild(createPartItem(_0x3bea5c)));
    _0x3d9460.appendChild(_0x46356c);
  });
}
function createPartItem(_0x40899f) {
  const _0x3d248d = hiddenSet.has(_0x40899f.id);
  const _0x38ceb6 = scannedSet.has(_0x40899f.id);
  const _0x507de3 = document.createElement("div");
  _0x507de3.className = "part-item " + (selectedId === _0x40899f.id ? "active" : "");
  _0x507de3.style.opacity = _0x3d248d ? "0.4" : "1";
  const _0x27cdb0 = idMode === "position" ? _0x40899f.position || _0x40899f.code || "—" : _0x40899f.code || "—";
  const _0x4f6ac3 = getModuleColor(idMode === "position" ? _0x40899f.position || _0x40899f.code || "" : _0x40899f.code || "");
  _0x507de3.innerHTML = "\n      <div class=\"part-swatch\" style=\"background:" + getColor(_0x40899f.material, _0x40899f) + ";border-left:3px solid " + _0x4f6ac3 + "\"></div>\n      <div class=\"part-info\">\n        <div class=\"part-name\">" + escapeHtml(_0x40899f.name || "—") + "</div>\n        <div class=\"part-code\">" + escapeHtml(_0x27cdb0) + "</div>\n        <div class=\"part-dims\">" + (_0x40899f.gab ? _0x40899f.gab.w + "×" + _0x40899f.gab.h + "×" + _0x40899f.gab.d + " мм" : "") + "</div>\n      </div>\n      <div class=\"check " + (_0x38ceb6 ? "done" : "") + "\">" + (_0x38ceb6 ? "✅" : "○") + "</div>\n    ";
  _0x507de3.addEventListener("click", () => selectPart(_0x40899f.id));
  return _0x507de3;
}
function showStats() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const _0x160969 = {};
  let _0x3d823d = 0;
  let _0x45f6af = 0;
  parts.forEach(_0xba6fab => {
    const _0x9fdc05 = _0xba6fab.material || "Неизвестно";
    if (!_0x160969[_0x9fdc05]) {
      _0x160969[_0x9fdc05] = 0;
    }
    _0x160969[_0x9fdc05]++;
    if (_0xba6fab.L && _0xba6fab.W && _0xba6fab.T) {
      _0x3d823d += _0xba6fab.L * _0xba6fab.W * _0xba6fab.T / 1000 * 6.5e-7;
      _0x45f6af += _0xba6fab.L * _0xba6fab.W / 1000000;
    }
  });
  let _0x2b9ad7 = "\n      <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px\">\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + parts.length + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">деталей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + moduleMap.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">модулей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--success)\">" + scannedSet.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">собрано</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--warning)\">≈" + _0x3d823d.toFixed(1) + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">кг масса</div>\n        </div>\n      </div>\n      <div style=\"font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px\">МАТЕРИАЛЫ:</div>\n    ";
  Object.entries(_0x160969).sort((_0x2f8696, _0xcea003) => _0xcea003[1] - _0x2f8696[1]).forEach(([_0x45a20c, _0x1865fd]) => {
    _0x2b9ad7 += "<div style=\"display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)\">\n        <span style=\"color:#e8edf4\">" + escapeHtml(_0x45a20c) + "</span>\n        <span style=\"color:var(--accent);font-weight:600\">" + _0x1865fd + " шт</span>\n      </div>";
  });
  document.getElementById("statsContent").innerHTML = _0x2b9ad7;
  document.getElementById("statsModal").classList.remove("hidden");
}
function printSpecification() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const _0x32213a = window.open("", "_blank");
  let _0x105cf0 = "<html><head><title>Спецификация</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0;font-weight:700}.mod{background:#e8e8ff;font-weight:700}</style></head><body>";
  _0x105cf0 += "<h2>Спецификация — " + document.getElementById("projectTitle").textContent + "</h2>";
  _0x105cf0 += "<p>Всего деталей: " + parts.length + " | Собрано: " + scannedSet.size + "</p>";
  _0x105cf0 += "<table><tr><th>#</th><th>Обозначение</th><th>Позиция</th><th>Наименование</th><th>Материал</th><th>Размеры (мм)</th><th>Статус</th></tr>";
  let _0x3d7d30 = "";
  parts.forEach((_0x4008cf, _0x3c9fab) => {
    const _0x4f5dbe = idMode === "position" ? _0x4008cf.position || _0x4008cf.code || "" : _0x4008cf.code || "";
    const _0x5addc1 = getModuleKey(_0x4f5dbe);
    if (_0x5addc1 !== _0x3d7d30) {
      _0x3d7d30 = _0x5addc1;
      _0x105cf0 += "<tr><td colspan=\"7\" class=\"mod\">" + escapeHtml(getModuleName(_0x5addc1 === "HARDWARE" ? "D-000" : _0x5addc1 + "_0")) + "</td></tr>";
    }
    const _0x235aea = scannedSet.has(_0x4008cf.id) ? "✅" : "○";
    const _0x24360e = _0x4008cf.gab ? _0x4008cf.gab.w + "×" + _0x4008cf.gab.h + "×" + _0x4008cf.gab.d : (_0x4008cf.L || "—") + "×" + (_0x4008cf.W || "—") + "×" + (_0x4008cf.T || "—");
    _0x105cf0 += "<tr><td>" + (_0x3c9fab + 1) + "</td><td>" + escapeHtml(_0x4008cf.code || "") + "</td><td>" + escapeHtml(_0x4008cf.position || "") + "</td><td>" + escapeHtml(_0x4008cf.name || "") + "</td><td>" + escapeHtml(_0x4008cf.material || "") + "</td><td>" + _0x24360e + "</td><td>" + _0x235aea + "</td></tr>";
  });
  _0x105cf0 += "</table></body></html>";
  _0x32213a.document.write(_0x105cf0);
  _0x32213a.document.close();
  _0x32213a.print();
}
let scanInterval;
let videoStream;
function openScanner() {
  document.getElementById("scannerModal").classList.remove("hidden");
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment"
    }
  }).then(_0x4b1cc4 => {
    videoStream = _0x4b1cc4;
    const _0x55b064 = document.getElementById("video");
    _0x55b064.srcObject = _0x4b1cc4;
    _0x55b064.play();
    startQRScan();
  }).catch(() => showToast("❌ Нет доступа к камере"));
}
function closeScanner() {
  document.getElementById("scannerModal").classList.add("hidden");
  if (videoStream) {
    videoStream.getTracks().forEach(_0x450470 => _0x450470.stop());
  }
  if (scanInterval) {
    clearInterval(scanInterval);
  }
}
function startQRScan() {
  const _0x2bb780 = document.getElementById("video");
  const _0x2a1544 = document.getElementById("qrCanvas");
  const _0x37789c = _0x2a1544.getContext("2d");
  scanInterval = setInterval(() => {
    if (_0x2bb780.readyState !== _0x2bb780.HAVE_ENOUGH_DATA) {
      return;
    }
    _0x2a1544.width = _0x2bb780.videoWidth;
    _0x2a1544.height = _0x2bb780.videoHeight;
    _0x37789c.drawImage(_0x2bb780, 0, 0);
    const _0x124bb1 = _0x37789c.getImageData(0, 0, _0x2a1544.width, _0x2a1544.height);
    const _0x14f4dc = jsQR(_0x124bb1.data, _0x124bb1.width, _0x124bb1.height);
    if (_0x14f4dc) {
      handleScan(_0x14f4dc.data);
      closeScanner();
    }
  }, 200);
}
function handleManualCode() {
  const _0x556a7b = document.getElementById("manualCode").value.trim();
  if (_0x556a7b) {
    handleScan(_0x556a7b);
    closeScanner();
  }
}
function handleScan(_0x518bb4) {
  let _0x279726;
  if (idMode === "position") {
    _0x279726 = parts.find(_0x468172 => _0x468172.position === _0x518bb4 || _0x468172.position?.trim() === _0x518bb4.trim() || _0x468172.position?.toLowerCase() === _0x518bb4.toLowerCase());
    if (!_0x279726) {
      _0x279726 = parts.find(_0xde1054 => _0x518bb4.includes(_0xde1054.position) || _0xde1054.position?.includes(_0x518bb4));
    }
  } else {
    _0x279726 = parts.find(_0x5085ae => _0x5085ae.code === _0x518bb4 || _0x5085ae.code?.trim() === _0x518bb4.trim() || _0x5085ae.code?.toLowerCase() === _0x518bb4.toLowerCase());
    if (!_0x279726) {
      _0x279726 = parts.find(_0x1aaf14 => _0x518bb4.includes(_0x1aaf14.code) || _0x1aaf14.code?.includes(_0x518bb4));
    }
  }
  if (!_0x279726) {
    showToast("❌ Деталь не найдена");
    return;
  }
  scannedSet.add(_0x279726.id);
  updateStats();
  selectPart(_0x279726.id);
  startSmoothZoom(_0x279726.id);
  showToast("✅ " + _0x279726.name);
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
  const _0x3aeb7b = JSON.parse(localStorage.getItem("aivoProgress") || "{}");
  if (_0x3aeb7b.scanned) {
    scannedSet = new Set(_0x3aeb7b.scanned);
  }
  if (_0x3aeb7b.hidden) {
    hiddenSet = new Set(_0x3aeb7b.hidden);
  }
}
function resetProgress() {
  if (confirm("Сбросить весь прогресс сборки?")) {
    scannedSet.clear();
    hiddenSet.clear();
    meshMap.forEach(_0x3a0f90 => _0x3a0f90.visible = true);
    edgeLineMap.forEach(_0x3f8a59 => _0x3f8a59.visible = true);
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
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
}
function openSheet() {
  document.getElementById("bottomSheet").classList.add("open");
}
function closeSheet() {
  document.getElementById("bottomSheet").classList.remove("open");
}
function escapeHtml(_0x53ae23) {
  return (_0x53ae23 || "").replace(/[&<>]/g, _0x19f2db => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  })[_0x19f2db]);
}
function showToast(_0x5f46f3) {
  let _0x33aae1 = document.getElementById("customToast");
  if (!_0x33aae1) {
    _0x33aae1 = document.createElement("div");
    _0x33aae1.id = "customToast";
    _0x33aae1.className = "toast";
    document.body.appendChild(_0x33aae1);
  }
  _0x33aae1.textContent = _0x5f46f3;
  _0x33aae1.classList.add("show");
  clearTimeout(_0x33aae1._timer);
  _0x33aae1._timer = setTimeout(() => _0x33aae1.classList.remove("show"), 2000);
}
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("uploadBtn").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", _0x262370 => {
  const _0xa3032f = _0x262370.target.files[0];
  if (!_0xa3032f) {
    return;
  }
  document.getElementById("loadingOverlay").classList.add("show");
  const _0xfed3e6 = new FileReader();
  _0xfed3e6.onload = _0x28de92 => {
    try {
      const _0x3fe2fe = JSON.parse(_0x28de92.target.result);
      parts = _0x3fe2fe.parts || _0x3fe2fe;
      parts.forEach((_0x4928c4, _0x46edde) => {
        if (_0x4928c4.id === undefined) {
          _0x4928c4.id = _0x46edde;
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
      document.getElementById("projectTitle").textContent = _0xa3032f.name.replace(".json", "");
      saveProgress();
    } catch (_0x257fed) {
      showToast("❌ Ошибка файла: " + _0x257fed.message);
    } finally {
      document.getElementById("loadingOverlay").classList.remove("show");
    }
  };
  _0xfed3e6.readAsText(_0xa3032f, "UTF-8");
});
document.getElementById("menuBtn").addEventListener("click", openDrawer);
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
document.getElementById("closeScannerBtn").addEventListener("click", closeScanner);
document.getElementById("manualSubmit").addEventListener("click", handleManualCode);
document.getElementById("searchInput").addEventListener("input", renderPartsList);
document.querySelectorAll(".id-mode-btn").forEach(_0x50ec20 => {
  _0x50ec20.addEventListener("click", () => {
    idMode = _0x50ec20.dataset.mode;
    localStorage.setItem("aivoIdMode", idMode);
    document.querySelectorAll(".id-mode-btn").forEach(_0x7f42f6 => _0x7f42f6.classList.remove("active"));
    _0x50ec20.classList.add("active");
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
  document.getElementById('loadingOverlay').innerHTML = '<div style="text-align:center;color:#ff6b6b;padding:20px"><div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="font-size:14px">Ошибка инициализации 3D</div><div style="font-size:12px;color:#6b7d94;margin-top:8px">' + e.message + '</div></div>';
  document.getElementById('loadingOverlay').classList.add('show');
}
updateStats();

// === Auth & Device Logic ===
let currentUser = null;
let userDeviceLimit = 5;
async function getDeviceFingerprint() {
  const _0x2545fd = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, screen.colorDepth, new Date().getTimezoneOffset(), navigator.hardwareConcurrency || "unknown"];
  const _0x103832 = _0x2545fd.join("|");
  let _0x1d32a5 = 0;
  for (let _0x187e86 = 0; _0x187e86 < _0x103832.length; _0x187e86++) {
    const _0x23cd79 = _0x103832.charCodeAt(_0x187e86);
    _0x1d32a5 = (_0x1d32a5 << 5) - _0x1d32a5 + _0x23cd79;
    _0x1d32a5 = _0x1d32a5 & _0x1d32a5;
  }
  return "fp_" + Math.abs(_0x1d32a5).toString(36);
}
function getDeviceName() {
  const _0x43dea2 = navigator.userAgent;
  if (/iPhone/.test(_0x43dea2)) {
    return "iPhone";
  }
  if (/iPad/.test(_0x43dea2)) {
    return "iPad";
  }
  if (/Android/.test(_0x43dea2)) {
    const _0x1dbabc = _0x43dea2.match(/;\s*([^;]+)\s*Build/);
    if (_0x1dbabc) {
      return _0x1dbabc[1].trim();
    } else {
      return "Android Device";
    }
  }
  if (/Windows/.test(_0x43dea2)) {
    return "Windows PC";
  }
  if (/Mac/.test(_0x43dea2)) {
    return "Mac";
  }
  if (/Linux/.test(_0x43dea2)) {
    return "Linux PC";
  }
  return "Unknown Device";
}
async function checkDeviceLimit(_0x44e7dc) {
  const _0xd0bd5e = await getDeviceFingerprint();
  const _0x3237a0 = getDeviceName();
  const _0x972876 = db.collection("users").doc(_0x44e7dc.uid).collection("devices");
  const _0x4fda95 = await _0x972876.doc(_0xd0bd5e).get();
  if (_0x4fda95.exists) {
    await _0x972876.doc(_0xd0bd5e).update({
      lastAccess: firebase.firestore.FieldValue.serverTimestamp()
    });
    return {
      allowed: true
    };
  }
  const _0x5ada8d = await _0x972876.get();
  const _0x5ce6c3 = _0x5ada8d.size;
  const _0xbd4a25 = await db.collection("users").doc(_0x44e7dc.uid).get();
  const _0x360920 = _0xbd4a25.data()?.deviceLimit || 5;
  userDeviceLimit = _0x360920;
  if (_0x5ce6c3 >= _0x360920) {
    return {
      allowed: false,
      deviceCount: _0x5ce6c3,
      deviceLimit: _0x360920,
      message: "Лимит устройств исчерпан (" + _0x5ce6c3 + "/" + _0x360920 + ")"
    };
  }
  await _0x972876.doc(_0xd0bd5e).set({
    name: _0x3237a0,
    fingerprint: _0xd0bd5e,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
  });
  return {
    allowed: true,
    deviceCount: _0x5ce6c3 + 1,
    deviceLimit: _0x360920
  };
}
async function handleLogin() {
  const _0x5b225b = document.getElementById("authEmail").value.trim();
  const _0x16bd4f = document.getElementById("authPassword").value;
  const _0x4cbe08 = document.getElementById("loginError");
  const _0x4ce00c = document.getElementById("loginBtn");
  if (!_0x5b225b || !_0x16bd4f) {
    _0x4cbe08.textContent = "Введите email и пароль";
    _0x4cbe08.classList.add("show");
    return;
  }
  _0x4ce00c.disabled = true;
  _0x4ce00c.textContent = "Вход...";
  _0x4cbe08.classList.remove("show");
  try {
    const _0x202509 = await auth.signInWithEmailAndPassword(_0x5b225b, _0x16bd4f);
    const _0x4f2e59 = _0x202509.user;
    const _0x23e7d2 = await checkDeviceLimit(_0x4f2e59);
    if (!_0x23e7d2.allowed) {
      await auth.signOut();
      throw new Error(_0x23e7d2.message);
    }
    currentUser = _0x4f2e59;
    document.getElementById("deviceCountInfo").textContent = _0x23e7d2.deviceCount;
    document.getElementById("deviceLimitInfo").textContent = _0x23e7d2.deviceLimit;
    showMainApp();
  } catch (_0x185e6d) {
    let _0x5e3a9f = "Ошибка авторизации";
    if (_0x185e6d.code === "auth/user-not-found") {
      _0x5e3a9f = "Пользователь не найден";
    } else if (_0x185e6d.code === "auth/wrong-password") {
      _0x5e3a9f = "Неверный пароль";
    } else if (_0x185e6d.code === "auth/invalid-email") {
      _0x5e3a9f = "Некорректный email";
    } else if (_0x185e6d.code === "auth/too-many-requests") {
      _0x5e3a9f = "Слишком много попыток. Подождите";
    } else {
      _0x5e3a9f = _0x185e6d.message;
    }
    _0x4cbe08.textContent = _0x5e3a9f;
    _0x4cbe08.classList.add("show");
  } finally {
    _0x4ce00c.disabled = false;
    _0x4ce00c.textContent = "Войти";
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
  } catch(e) {}
}

auth.onAuthStateChanged(_0x2decb7 => {
  if (_0x2decb7) {
    currentUser = _0x2decb7;
    checkDeviceLimit(_0x2decb7).then(_0x2edd69 => {
      if (_0x2edd69.allowed) {
        document.getElementById("deviceCountInfo").textContent = _0x2edd69.deviceCount;
        document.getElementById("deviceLimitInfo").textContent = _0x2edd69.deviceLimit;
        showMainApp();
        checkAccountDeadline(_0x2decb7.uid);
      } else {
        showLoginPage();
      }
    });
  } else {
    currentUser = null;
    showLoginPage();
  }
});
document.getElementById("authPassword").addEventListener("keypress", _0x28f814 => {
  if (_0x28f814.key === "Enter") {
    handleLogin();
  }
});
document.getElementById("authEmail").addEventListener("keypress", _0x50865e => {
  if (_0x50865e.key === "Enter") {
    document.getElementById("authPassword").focus();
  }
});
let onboardStep = 0;
const onboardSteps = document.querySelectorAll(".onboard-step");
const onboardDots = document.querySelectorAll(".onboard-dot");
const onboardBtn = document.getElementById("onboardNext");
function showOnboarding() {
  const _0x4162d6 = localStorage.getItem("aivoOnboarded");
  if (_0x4162d6) {
    return;
  }
  document.getElementById("onboardingModal").classList.remove("hidden");
}
function updateOnboardStep() {
  onboardSteps.forEach((_0x3d9efd, _0x15b79b) => _0x3d9efd.style.display = _0x15b79b === onboardStep ? "block" : "none");
  onboardDots.forEach((_0x27361e, _0x517c69) => {
    _0x27361e.style.background = _0x517c69 === onboardStep ? "var(--accent)" : "var(--bg-tertiary)";
    _0x27361e.style.width = _0x517c69 === onboardStep ? "20px" : "8px";
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