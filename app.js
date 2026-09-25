import {
  init as initMaterials,
  createWoodTexture,
  woodTextureCache,
  TEX_BASE,
  EGGER_DB,
  WOOD_KEYWORDS,
  SOLID_KEYWORDS,
  MATERIAL_KEYWORDS,
  MANUFACTURER_MAP,
  classifyMaterial,
  findBestWoodTexture,
  guessColor,
  _realTexCache,
  loadRealTexture,
  createPartMaterial
} from './src/materials.js';
import { handleLogin, initAuth } from './src/auth.js';
import { initQR, wireQRListeners } from './src/qr.js';
import {
  initCamera, setupCameraControls, updateCamera,
  startSmoothZoom, animateSmoothZoom,
  deselectPart, handleRaycast as cameraHandleRaycast
} from './src/camera.js';
import { initAssembly, toggleAssembly, toggleAssemblyPlay, stopAssemblyPlay, updateAssemblyStep } from './src/assembly.js';
import {
  initUI, showToast, escapeHtml, updateStats, updateSummary,
  renderPartsList, renderPartsListDeferred, openSheet, closeSheet,
  openDrawer, closeDrawer, isMobileSheet
} from './src/ui.js';
import { initEvents } from './src/events.js';
import {
  // state values
  parts, selectedId, scannedSet, hiddenSet, idMode,
  meshMap, edgeLineMap, originalPositions, moduleMap,
  isDarkTheme, needsRender, blockMode,
  xrayActive, explodeActive, explodeProgress, explodeModuleKey,
  isolatedModule, csgEnabled, autoRotate,
  theta, phi, camDist,
  isDragging, prevMouse, isSmoothZoom,
  targetPosition, zoomTarget,
  assemblyMode, assemblyIndex, assemblyPrevIndex,
  assemblyOrder, assemblyPlaying, assemblyTimer,
  fastenerData, dimsData, dimGroup, dimsVisible, fastenerMeshes,
  scene, camera, renderer, floor, wall,
  wakeLock, layoutMinY,
  MODULE_COLORS, colorCache, colorIdx,
  detailMeshes, holeMeshes, pocketMeshes,
  deviceQuality,
  getModulePrefix, getModuleKey, getModuleColor, getModuleName,
  // setters
  setParts, setSelectedId, setIdMode,
  setIsDarkTheme, setNeedsRender, setBlockMode,
  setXrayActive, setExplodeActive, setExplodeProgress, setExplodeModuleKey,
  setIsolatedModule, setCsgEnabled, setAutoRotate,
  setTheta, setPhi, setCamDist,
  setIsDragging, setPrevMouse, setIsSmoothZoom,
  setTargetPosition, setZoomTarget,
  setAssemblyMode, setAssemblyIndex, setAssemblyPrevIndex,
  setAssemblyOrder, setAssemblyPlaying, setAssemblyTimer,
  setFastenerData, setDimsData, setDimGroup, setDimsVisible,
  setScene, setCamera, setRenderer, setFloor, setWall,
  setWakeLock, setLayoutMinY, setColorIdx,
  setDeviceQuality
} from './src/state.js';

// === Wake Lock ===
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      setWakeLock(await navigator.wakeLock.request("screen"));
      wakeLock.addEventListener("release", () => { setWakeLock(null); });
    }
  } catch(e) {}
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); setWakeLock(null); }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && parts.length > 0) requestWakeLock();
});
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

// === Device Capability Detection ===
(function detectDevice() {
  var cores = navigator.hardwareConcurrency || 2;
  var mem = navigator.deviceMemory || 4;
  var pixels = screen.width * screen.height * (window.devicePixelRatio || 1);
  var ua = navigator.userAgent;
  var isMobile = /Android|iPhone|iPad/i.test(ua);
  if (cores <= 2 || mem <= 2) setDeviceQuality('low');
  else if (isMobile || cores <= 4 || mem <= 4 || pixels > 3000000) setDeviceQuality('medium');
})();
// Auth — MUST run before any Three.js code so login works even if 3D fails
initAuth();
// Pre-allocated temp vectors for explode animation (avoids GC pressure per frame)
const _tmpCenter = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpNewPos = new THREE.Vector3();
const _tmpDelta = new THREE.Vector3();
function initTheme() {
  setIsDarkTheme(localStorage.getItem("aivoTheme") !== "light");
  applyTheme();
}
function toggleTheme() {
  setIsDarkTheme(!isDarkTheme);
  localStorage.setItem("aivoTheme", isDarkTheme ? "dark" : "light");
  applyTheme();
}
function applyTheme() {
  if (isDarkTheme) {
    document.body.classList.remove("light-theme");
    document.getElementById("themeToggle").innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    if (scene) {
      scene.background.setHex(0x141416);
      edgeLineMap.forEach(e => { e.material.color.setHex(0x1a1a1a); });
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
      edgeLineMap.forEach(e => { e.material.color.setHex(0x888888); });
      if (floor) floor.material.color.setHex(0xc0c0c4);
      if (wall) wall.material.color.setHex(0xd0d0d4);
    }
    if (scene) {
      scene.fog.color.setHex(0xf0f0f2);
    }
  }
}
const canvas = document.getElementById("canvas3d");
function initThree() {
  const _renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  _renderer.setSize(window.innerWidth, window.innerHeight);
  var maxRatio = deviceQuality === 'low' ? 1 : deviceQuality === 'medium' ? 1.5 : 2;
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
  _renderer.shadowMap.enabled = deviceQuality !== 'low';
  _renderer.shadowMap.type = deviceQuality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  _renderer.toneMapping = deviceQuality === 'low' ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = 1.15;
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  setRenderer(_renderer);
  initMaterials(deviceQuality, _renderer);
  const _scene = new THREE.Scene();
  _scene.background = new THREE.Color(isDarkTheme ? 0x141416 : 0xf0f0f2);
  _scene.fog = new THREE.FogExp2(isDarkTheme ? 0x141416 : 0xf0f0f2, deviceQuality === 'low' ? 0.005 : 0.008);
  setScene(_scene);
  const _camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 500);
  _camera.position.set(3, 2.5, 3);
  setCamera(_camera);
  setTargetPosition(new THREE.Vector3(0, 0.5, 0));
  setZoomTarget(new THREE.Vector3());
  const ambientLight = new THREE.AmbientLight(0x8899aa, 0.6);
  _scene.add(ambientLight);
  const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
  mainLight.position.set(8, 18, 12);
  mainLight.castShadow = deviceQuality !== 'low';
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.camera.left = -50;
  mainLight.shadow.camera.right = 50;
  mainLight.shadow.camera.top = 50;
  mainLight.shadow.camera.bottom = -50;
  mainLight.shadow.bias = -0.001;
  mainLight.shadow.radius = 4;
  _scene.add(mainLight);
  const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.35);
  fillLight.position.set(-6, 3, -8);
  _scene.add(fillLight);
  // Rim light for edge definition on wood panels
  const rimLight = new THREE.DirectionalLight(0x00D4AA, 0.15);
  rimLight.position.set(-8, 6, 4);
  if (deviceQuality !== 'low') _scene.add(rimLight);
  // Hemisphere: sky blue top, warm ground
  if (deviceQuality !== 'low') {
    var hemiLight = new THREE.HemisphereLight(0x8899cc, 0x443322, 0.3);
    _scene.add(hemiLight);
  }
  // Room — floor: 20m wide, 10m deep, one-sided (visible from above only)
  var floorGeo = new THREE.PlaneGeometry(20, 10);
  var floorMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x2a2a2e : 0xd0d0d4,
    roughness: 0.85,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.3
  });
  var _floor = new THREE.Mesh(floorGeo, floorMat);
  _floor.rotation.x = -Math.PI / 2;
  _floor.position.set(0, 0, 0);
  _floor.receiveShadow = deviceQuality !== 'low';
  _scene.add(_floor);
  setFloor(_floor);

  // Grid on the floor - subtle, not too harsh
  var gridHelper = new THREE.GridHelper(20, 40, 0x00d4aa, 0x00d4aa);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.04;
  gridHelper.position.y = 0.001;
  if (deviceQuality !== 'low') _scene.add(gridHelper);

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
  var _wall = new THREE.Mesh(wallGeo, wallMat);
  _wall.position.set(0, 2.5, -5);
  _wall.receiveShadow = deviceQuality !== 'low';
  if (deviceQuality !== 'low') _scene.add(_wall);
  setWall(_wall);
  setupCameraControls(canvas);
  animate();
}
// Camera controls handled by src/camera.js — wired via setupCameraControls()
// deselectPart and handleRaycast handled by src/camera.js
// Camera controls handled by src/camera.js — wired via setupCameraControls()
// deselectPart and handleRaycast handled by src/camera.js
function autoLayout(partsArr) {
  var hasPlacement = false;
  partsArr.forEach(function(p) {
    if (p.placement && p.placement.origin && typeof p.placement.origin.x === 'number') hasPlacement = true;
  });

  const scaleFactor = 0.001;
  setLayoutMinY(0);

  partsArr.forEach(p => {
    if (hasPlacement && p.placement && p.placement.origin) {
      // v4: placement.origin + quaternion из ax/ay/az
      var o = p.placement.origin;
      p._pos = { x: o.x * scaleFactor, y: o.y * scaleFactor, z: o.z * scaleFactor };
      // Конвертируем базисные векторы в quaternion
      var ax = p.placement.ax || {x:1,y:0,z:0};
      var ay = p.placement.ay || {x:0,y:1,z:0};
      var az = p.placement.az || {x:0,y:0,z:1};
      var m = new THREE.Matrix4();
      m.set(ax.x, ay.x, az.x, 0,
            ax.y, ay.y, az.y, 0,
            ax.z, ay.z, az.z, 0,
            0,    0,    0,    1);
      p._quat = new THREE.Quaternion();
      p._quat.setFromRotationMatrix(m);
    } else if (p.pos && p.gab) {
      // v3: GabMin + gab/2 = центр
      p._pos = {
        x: (p.pos.x + p.gab.w / 2) * scaleFactor,
        y: (p.pos.y + p.gab.h / 2) * scaleFactor,
        z: (p.pos.z + p.gab.d / 2) * scaleFactor
      };
      p._quat = null; // v3 без поворота
    } else {
      var gridSize = Math.ceil(Math.sqrt(partsArr.length));
      var row = Math.floor((p.id || 0) / gridSize);
      var col = (p.id || 0) % gridSize;
      p._pos = { x: (col - gridSize / 2) * 0.15, y: 0, z: (row - gridSize / 2) * 0.15 };
      p._quat = null;
    }
    // Размеры для bounding box и explode
    if (p.gab) {
      p._size = {
        x: Math.max(p.gab.w, 1) * scaleFactor,
        y: Math.max(p.gab.h, 1) * scaleFactor,
        z: Math.max(p.gab.d, 1) * scaleFactor
      };
    } else {
      p._size = { x: 0.1, y: 0.1, z: 0.1 };
    }
  });
}
function buildPartDetails(partInfo, meshObj) {
  const detailArr = [];
  const grooves = partInfo.grooves || [];
  const holes2 = partInfo.holes || [];
  if (!grooves.length && !holes2.length) {
    return detailArr;
  }
  const panelT = (partInfo.T || 16) * sc;

  // --- Grooves: recessed lines on panel surface ---
  grooves.forEach(function(groove) {
    const grooveW = (groove.width || groove.w || 20) * sc;
    const grooveH = (groove.length || groove.h || 20) * sc;
    const grooveD = (groove.depth || groove.d || 4) * sc;
    const grooveGeo = new THREE.BoxGeometry(grooveW, grooveH, grooveD);
    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a, roughness: 0.9, metalness: 0,
      emissive: 0x1a0a00, emissiveIntensity: 0.15
    });
    const grooveMesh = new THREE.Mesh(grooveGeo, grooveMat);
    grooveMesh.position.set(
      (groove.x || 0) * sc,
      (groove.y || 0) * sc,
      (groove.z || 0) * sc
    );
    grooveMesh.userData = { partId: partInfo.id, detailType: "groove" };
    grooveMesh.castShadow = false;
    grooveMesh.receiveShadow = false;
    meshObj.add(grooveMesh);
    var grooveEdgeGeo = new THREE.EdgesGeometry(grooveGeo, 15);
    var grooveEdgeLine = new THREE.LineSegments(grooveEdgeGeo, new THREE.LineBasicMaterial({ color: 0x00D4AA, transparent: true, opacity: 0.6 }));
    grooveEdgeLine.position.copy(grooveMesh.position);
    meshObj.add(grooveEdgeLine);
    detailArr.push(grooveMesh, grooveEdgeLine);
  });

  // --- Holes: cylinders with ring markers ---
  holes2.forEach(function(hole) {
    const holeRadius = (hole.diameter || hole.d || hole.r || 8) / 2 * sc;
    const holeDepth = (hole.depth || panelT) * sc;
    const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 0.6, metalness: 0.4,
      emissive: 0x111111, emissiveIntensity: 0.1
    });
    const holeMesh = new THREE.Mesh(holeGeo, holeMat);
    holeMesh.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc
    );
    if (hole.angleX) holeMesh.rotation.x = hole.angleX * Math.PI / 180;
    if (hole.angleZ) holeMesh.rotation.z = hole.angleZ * Math.PI / 180;
    holeMesh.userData = { partId: partInfo.id, detailType: "hole" };
    meshObj.add(holeMesh);
    var ringGeo = new THREE.RingGeometry(holeRadius * 0.8, holeRadius, 24);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x00D4AA, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    var ringFront = new THREE.Mesh(ringGeo, ringMat);
    ringFront.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc + panelT / 2 + 0.0002
    );
    meshObj.add(ringFront);
    var ringBack = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ringBack.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc - panelT / 2 - 0.0002
    );
    meshObj.add(ringBack);
    detailArr.push(holeMesh, ringFront, ringBack);
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
  "Шкант": 13882323,
  "Вытяжка": 16761024,
  "Фурнитура": 12632256
};

function buildFasteners(fasteners) {
  if (!fasteners || !fasteners.length) return;
  var UP = new THREE.Vector3(0, 1, 0);
  var q = new THREE.Quaternion();
  var dir = new THREE.Vector3();
  fasteners.forEach(function(fastener) {
    var color = FASTENER_COLORS[fastener.type] || FASTENER_COLORS["\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430"];
    // Новый формат: sections[] — цилиндры
    if (fastener.sections && fastener.sections.length) {
      fastener.sections.forEach(function(sec) {
        var r = Math.max(0.0016, (sec.r || 3) * sc);
        var len = Math.max(0.001, (sec.len || 14) * sc);
        var geo = new THREE.CylinderGeometry(r, r, len, 12);
        var mat = new THREE.MeshStandardMaterial({
          color: color, roughness: 0.35, metalness: 0.6,
          emissive: color, emissiveIntensity: 0.12
        });
        var mesh = new THREE.Mesh(geo, mat);
        dir.set(sec.d ? sec.d[0] : 0, sec.d ? sec.d[1] : 0, sec.d ? sec.d[2] : 1);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        q.setFromUnitVectors(UP, dir);
        mesh.quaternion.copy(q);
        mesh.position.set(
          sec.p[0] * sc + dir.x * len / 2,
          sec.p[1] * sc + dir.y * len / 2,
          sec.p[2] * sc + dir.z * len / 2
        );
        mesh.userData = { fastenerId: fastener.id, type: "fastener", name: fastener.name };
        mesh.castShadow = true;
        scene.add(mesh);
        fastenerMeshes.push(mesh);
      });
      return;
    }
    // Старый формат: pos + type
    var fx = (fastener.pos ? fastener.pos.x : 0) * sc;
    var fy = (fastener.pos ? fastener.pos.y : 0) * sc;
    var fz = (fastener.pos ? fastener.pos.z : 0) * sc;
    var type = (fastener.type || "").toLowerCase();
    var geoKey;
    if (type.indexOf("\u043f\u0435\u0442\u043b") >= 0 || type.indexOf("hinge") >= 0) geoKey = "hinge";
    else if (type.indexOf("\u043d\u0430\u043f\u0440\u0430\u0432\u043b") >= 0 || type.indexOf("slide") >= 0) geoKey = "slide";
    else if (type.indexOf("\u0440\u0443\u0447\u043a") >= 0 || type.indexOf("handle") >= 0) geoKey = "handle";
    else if (type.indexOf("\u0441\u0430\u043c\u043e\u0440\u0435\u0437") >= 0 || type.indexOf("\u043a\u043e\u043d\u0444\u0438\u0440\u043c\u0430\u0442") >= 0 || type.indexOf("\u0435\u0432\u0440\u043e\u0432\u0438\u043d\u0442") >= 0) geoKey = "screw";
    else if (type.indexOf("\u044d\u043a\u0441\u0446\u0435\u043d\u0442\u0440") >= 0 || type.indexOf("\u0441\u0442\u044f\u0436\u043a") >= 0) geoKey = "cam";
    else if (type.indexOf("\u0448\u043a\u0430\u043d\u0442") >= 0) geoKey = "dowel";
    else if (type.indexOf("\u043f\u043e\u043b\u043a\u043e\u0434\u0435\u0440\u0436") >= 0) geoKey = "shelf";
    else if (type.indexOf("\u043d\u043e\u0436\u043a") >= 0) geoKey = "leg";
    else if (type.indexOf("\u0434\u043e\u0432\u043e\u0434\u0447\u0438\u043a") >= 0) geoKey = "damper";
    else geoKey = "default";
    var geo;
    switch (geoKey) {
      case "hinge":  geo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 12); break;
      case "slide":  geo = new THREE.BoxGeometry(0.004, 0.08, 0.004); break;
      case "handle": geo = new THREE.TorusGeometry(0.012, 0.003, 8, 24, Math.PI); break;
      case "screw":  geo = new THREE.CylinderGeometry(0.002, 0.001, 0.015, 8); break;
      case "cam":    geo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16); break;
      case "dowel":  geo = new THREE.CylinderGeometry(0.004, 0.004, 0.016, 10); break;
      case "shelf":  geo = new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8); break;
      case "leg":    geo = new THREE.CylinderGeometry(0.008, 0.01, 0.03, 12); break;
      case "damper": geo = new THREE.BoxGeometry(0.006, 0.02, 0.006); break;
      default:       geo = new THREE.BoxGeometry(0.008, 0.008, 0.008); break;
    }
    var mat = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.35, metalness: 0.65,
      emissive: color, emissiveIntensity: 0.15
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, fy, fz);
    mesh.userData = { fastenerId: fastener.id, type: "fastener", name: fastener.name };
    mesh.castShadow = true;
    scene.add(mesh);
    fastenerMeshes.push(mesh);
  });
}
// --- Визуализация отверстий из holes[] ---
function buildHoles(holes) {
  if (!holes || !holes.length) return;
  var UP = new THREE.Vector3(0, 1, 0);
  var dir = new THREE.Vector3();
  var q = new THREE.Quaternion();
  holes.forEach(function(hole) {
    var r = Math.max(0.001, (hole.diameter || 5) / 2 * sc);
    var len = Math.max(0.001, (hole.depth || 16) * sc);
    var geo = new THREE.CylinderGeometry(r, r, len, 12);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x444444, roughness: 0.7, metalness: 0.3,
      transparent: true, opacity: 0.6
    });
    var mesh = new THREE.Mesh(geo, mat);
    var px = (hole.pos ? hole.pos[0] : 0) * sc;
    var py = (hole.pos ? hole.pos[1] : 0) * sc;
    var pz = (hole.pos ? hole.pos[2] : 0) * sc;
    dir.set(hole.dir ? hole.dir[0] : 0, hole.dir ? hole.dir[1] : 0, hole.dir ? hole.dir[2] : 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    q.setFromUnitVectors(UP, dir);
    mesh.quaternion.copy(q);
    mesh.position.set(px + dir.x * len / 2, py + dir.y * len / 2, pz + dir.z * len / 2);
    scene.add(mesh);
    holeMeshes.push(mesh);
  });
}
function clearHoles() {
  holeMeshes.forEach(function(m) { m.geometry.dispose(); m.material.dispose(); scene.remove(m); });
  holeMeshes.length = 0;
}

// --- Визуализация карманов/пазов (pockets) как decals на поверхности ---
// Following DetalQR approach: pockets are added as children of the panel mesh,
// using local panel coordinates. Face 'A' = front (Z=0 side), 'B' = back (Z=panelT side).
function buildPockets(partsArr) {
  partsArr.forEach(function(part) {
    if (!part.pockets || !part.pockets.length) return;
    var panelT = Math.max(part.T || 16, 1) * sc;
    var parentMesh = meshMap.get(part.id);
    if (!parentMesh) return;
    part.pockets.forEach(function(pk) {
      var sh;
      if (pk.t === 'circle' && pk.r > 0) {
        sh = new THREE.Shape();
        sh.absarc(pk.x * sc, pk.y * sc, pk.r * sc, 0, Math.PI * 2, false);
      } else if (pk.t === 'poly' && pk.pts && pk.pts.length >= 3) {
        sh = new THREE.Shape();
        sh.moveTo(pk.pts[0][0] * sc, pk.pts[0][1] * sc);
        for (var i = 1; i < pk.pts.length; i++) sh.lineTo(pk.pts[i][0] * sc, pk.pts[i][1] * sc);
        sh.closePath();
      }
      if (!sh) return;
      var geo = new THREE.ShapeGeometry(sh);
      // DetalQR: face A => Z = -0.2mm (front), face B => Z = panelT +0.2mm (back)
      var isBack = pk.face === 'B';
      geo.translate(0, 0, isBack ? panelT + 0.0002 : -0.0002);
      var mat = new THREE.MeshStandardMaterial({
        color: 0x2b2f35, roughness: 0.95, metalness: 0.05,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1;
      mesh.userData = { partId: part.id, pocket: true };
      parentMesh.add(mesh);
      pocketMeshes.push(mesh);
    });
  });
}
function clearPockets() {
  pocketMeshes.forEach(function(m) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  pocketMeshes.length = 0;
}

// --- Размерные линии (dims) — по образцу DetalQR ---
// Рисует линейные размеры из БАЗИС в 3D: выноски, стрелки, цифры.
function buildDimLines() {
  if (!dimsData || !dimsData.length) return;
  setDimGroup(new THREE.Group());
  var HL = 0.03;   // длина стрелки (м)
  var HW = 0.008;  // полудлина наконечника (м)
  var DIM_MIN_OFF = 0.12; // минимальное смещение от детали (м)
  var V = function(p) { return new THREE.Vector3(p[0] * sc, p[1] * sc, p[2] * sc); };
  var defaultMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  var dimMatCache = {};
  function dimMat(col) {
    if (!col) return defaultMat;
    if (!dimMatCache[col]) {
      var c = new THREE.Color(col);
      var lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      dimMatCache[col] = (lum > 0.86) ? defaultMat : new THREE.LineBasicMaterial({ color: c });
    }
    return dimMatCache[col];
  }
  // Центр модели для определения направления выноса
  var cx = 0, cy = 0, cz = 0;
  if (parts.length) {
    parts.forEach(function(p) { if (p._pos) { cx += p._pos.x; cy += p._pos.y; cz += p._pos.z; } });
    cx /= parts.length; cy /= parts.length; cz /= parts.length;
  }
  var ctr = new THREE.Vector3(cx, cy, cz);

  for (var di = 0; di < dimsData.length; di++) {
    var d = dimsData[di];
    var dg = new THREE.Group();
    var a = V(d.a), b = V(d.b);
    var ea = V(d.ea), eb = V(d.eb);

    // Минимальное смещение: если размер слишком близко к детали — отодвигаем
    var off = new THREE.Vector3().subVectors(a, ea);
    var ol = off.length();
    if (ol < DIM_MIN_OFF) {
      var od;
      if (ol > 0.0005) {
        od = off.clone().normalize();
      } else {
        var dd = new THREE.Vector3().subVectors(eb, ea);
        if (dd.lengthSq() < 1e-10) od = new THREE.Vector3(0, 1, 0);
        else {
          var u = Math.abs(dd.clone().normalize().y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          od = new THREE.Vector3().crossVectors(dd, u).normalize();
          var m = ea.clone().add(eb).multiplyScalar(0.5);
          if (m.clone().add(od).distanceTo(ctr) < m.clone().sub(od).distanceTo(ctr)) od.negate();
        }
      }
      var add = od.multiplyScalar(DIM_MIN_OFF - ol);
      a = a.clone().add(add);
      b = b.clone().add(add);
    }

    var dm = dimMat(d.col);
    // Линии: размерная + две выноски
    var g = new THREE.BufferGeometry().setFromPoints([a, b, ea, a, eb, b]);
    dg.add(new THREE.LineSegments(g, dm));
    // Стрелки
    var dir = new THREE.Vector3().subVectors(b, a).normalize();
    var upV = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var perp = new THREE.Vector3().crossVectors(dir, upV).normalize();
    var diV = dir.clone().multiplyScalar(HL), pe = perp.clone().multiplyScalar(HW);
    var ar = new THREE.BufferGeometry().setFromPoints([
      a, a.clone().add(diV).add(pe), a, a.clone().add(diV).sub(pe),
      b, b.clone().sub(diV).add(pe), b, b.clone().sub(diV).sub(pe)
    ]);
    dg.add(new THREE.LineSegments(ar, dm));
    // Цифра — спрайт посередине размерной линии
    var mid = a.clone().add(b).multiplyScalar(0.5);
    var nud = new THREE.Vector3().subVectors(a, ea);
    if (nud.lengthSq() < 0.0001) nud.copy(perp);
    nud.normalize().multiplyScalar(0.026);
    var label = makeDimLabel(String(Math.round(d.value)), 0.032);
    label.position.copy(mid).add(nud);
    dg.add(label);
    dimGroup.add(dg);
  }
  scene.add(dimGroup);
  setNeedsRender(true);
}

function makeDimLabel(text, worldSize) {
  var cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  var ctx = cv.getContext('2d');
  ctx.font = '500 60px system-ui, -apple-system, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(text, 128, 64);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  var sh = worldSize * 128 / 46;
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: true, depthWrite: false, transparent: true
  }));
  spr.scale.set(sh * 2, sh, 1);
  return spr;
}

function toggleDims() {
  setDimsVisible(!dimsVisible);
  if (dimsVisible && !dimGroup) buildDimLines();
  if (dimGroup) dimGroup.visible = dimsVisible;
  var btn = document.getElementById("dimsBtn");
  if (btn) btn.classList.toggle("active", dimsVisible);
  showToast(dimsVisible ? "📐 Размеры показаны" : "📐 Размеры скрыты");
  setNeedsRender(true);
}

function buildContourShape(contour, sc) {
  var shape = new THREE.Shape();
  var first = true;
  for (var ci = 0; ci < contour.length; ci++) {
    var el = contour[ci];
    if (el.t === 'line') {
      if (first) { shape.moveTo(el.x1 * sc, el.y1 * sc); first = false; }
      shape.lineTo(el.x2 * sc, el.y2 * sc);
    } else if (el.t === 'arc') {
      var cx = el.cx * sc, cy = el.cy * sc;
      var r = Math.sqrt((el.x1 - el.cx) * (el.x1 - el.cx) + (el.y1 - el.cy) * (el.y1 - el.cy)) * sc;
      var a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
      var a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
      var da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      var steps = Math.max(4, Math.floor(Math.abs(da) / 0.15) + 1);
      for (var ai = 0; ai <= steps; ai++) {
        var angle = a1 + da * ai / steps;
        var px = cx + r * Math.cos(angle);
        var py = cy + r * Math.sin(angle);
        if (first) { shape.moveTo(px, py); first = false; }
        else shape.lineTo(px, py);
      }
    } else if (el.t === 'circle') {
      var holePath = new THREE.Path();
      holePath.absarc(el.cx * sc, el.cy * sc, el.r * sc, 0, Math.PI * 2, false);
      shape.holes.push(holePath);
    }
  }
  if (!first) shape.closePath();
  return shape;
}

const sc = 0.001;
function buildScene() {
  meshMap.forEach(function(oldMesh) {
    if (oldMesh.material.map) oldMesh.material.map.dispose();
    oldMesh.material.dispose();
    oldMesh.geometry.dispose();
    scene.remove(oldMesh);
  });
  edgeLineMap.forEach(function(oldLine) { oldLine.geometry.dispose(); oldLine.material.dispose(); scene.remove(oldLine); });
  detailMeshes.forEach(function(oldArr) { oldArr.forEach(function(oldObj) { if (oldObj.geometry) oldObj.geometry.dispose(); if (oldObj.material) oldObj.material.dispose(); scene.remove(oldObj); }); });
  // Clean up fastener meshes
  fastenerMeshes.forEach(function(fm) {
    if (fm.geometry) fm.geometry.dispose();
    if (fm.material) { if (fm.material.map) fm.material.map.dispose(); fm.material.dispose(); }
    scene.remove(fm);
  });
  fastenerMeshes.length = 0;
  clearHoles();
  clearPockets();
  if (dimGroup) {
    scene.remove(dimGroup);
    dimGroup.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
    });
    setDimGroup(null);
    setDimsVisible(false);
  }
  meshMap.clear();
  edgeLineMap.clear();
  detailMeshes.clear();
  originalPositions.clear();
  parts.forEach(part => {
    try {
    if (!part._pos) return; // skip parts without layout
    var shapeW = Math.max(part.L || 100, 1) * sc;
    var shapeH = Math.max(part.W || 100, 1) * sc;
    var panelT = Math.max(part.T || 16, 1) * sc;
    var shape;
    if (part.poly && part.poly.length >= 3) {
      // poly: нормализованный контур от (0,0), origin уже скомпенсирован
      shape = new THREE.Shape();
      var started = false;
      for (var pi = 0; pi < part.poly.length; pi++) {
        var pt = part.poly[pi];
        if (typeof pt[0] === 'string' && pt[0] === 'circle') {
          var hp = new THREE.Path();
          hp.absarc(pt[1] * sc, pt[2] * sc, pt[3] * sc, 0, Math.PI * 2, false);
          shape.holes.push(hp);
          continue;
        }
        if (!started) { shape.moveTo(pt[0] * sc, pt[1] * sc); started = true; }
        else shape.lineTo(pt[0] * sc, pt[1] * sc);
      }
      if (started) shape.closePath();
      var holeArr = part.polyHoles || [];
      for (var hi = 0; hi < holeArr.length; hi++) {
        var holeLoop = holeArr[hi];
        if (!holeLoop || holeLoop.length < 3) continue;
        var holePath2 = new THREE.Path();
        holePath2.moveTo(holeLoop[0][0] * sc, holeLoop[0][1] * sc);
        for (var hj = 1; hj < holeLoop.length; hj++) {
          holePath2.lineTo(holeLoop[hj][0] * sc, holeLoop[hj][1] * sc);
        }
        holePath2.closePath();
        shape.holes.push(holePath2);
      }
    } else if (part.contour && part.contour.length >= 2 && part.contour[0].t) {
      shape = buildContourShape(part.contour, sc);
    } else {
      // Fallback: прямоугольник — проверяем, можно ли использовать быстрый BoxGeometry
      var cutouts = part.cuts || part.cutouts || [];
      var hasCutouts = cutouts.length > 0;
      if (!hasCutouts) {
        // Simple rectangle — use BoxGeometry (much faster than ExtrudeGeometry)
        var panelGeo = new THREE.BoxGeometry(shapeW, shapeH, panelT);
        var panelMat = createPartMaterial(part);
        var panelMesh = new THREE.Mesh(panelGeo, panelMat);
        if (part.placement) {
          panelMesh.position.set(
            part._pos.x + shapeW / 2,
            part._pos.y + shapeH / 2,
            part._pos.z + panelT / 2
          );
        } else {
          panelMesh.position.set(part._pos.x, part._pos.y, part._pos.z);
        }
        if (part._quat) panelMesh.quaternion.copy(part._quat);
        panelMesh.userData = { partId: part.id };
        panelMesh.castShadow = deviceQuality !== 'low';
        panelMesh.receiveShadow = deviceQuality !== 'low';
        scene.add(panelMesh);
        var edgeThreshold = deviceQuality === 'low' ? 30 : 15;
        var edgeGeo = new THREE.EdgesGeometry(panelGeo, edgeThreshold);
        var edgeMat = new THREE.LineBasicMaterial({ color: isDarkTheme ? 0x1a1a1a : 0x666666, transparent: true, opacity: 0.6 });
        var edgeLineObj = new THREE.LineSegments(edgeGeo, edgeMat);
        edgeLineObj.quaternion.copy(panelMesh.quaternion);
        edgeLineObj.position.copy(panelMesh.position);
        scene.add(edgeLineObj);
        originalPositions.set(part.id, panelMesh.position.clone());
        meshMap.set(part.id, panelMesh);
        edgeLineMap.set(part.id, edgeLineObj);
        var details = buildPartDetails(part, panelMesh);
        if (details.length) detailMeshes.set(part.id, details);
        return; // Skip the ExtrudeGeometry path
      }
      // Has cutouts — use Shape + ExtrudeGeometry
      shape = new THREE.Shape();
      if (part.placement) {
        shape.moveTo(0, 0);
        shape.lineTo(shapeW, 0);
        shape.lineTo(shapeW, shapeH);
        shape.lineTo(0, shapeH);
      } else {
        shape.moveTo(-shapeW / 2, -shapeH / 2);
        shape.lineTo(shapeW / 2, -shapeH / 2);
        shape.lineTo(shapeW / 2, shapeH / 2);
        shape.lineTo(-shapeW / 2, shapeH / 2);
      }
      shape.closePath();
      cutouts.forEach(function(cut) {
        var pth = new THREE.Path();
        if (cut.t === 'circle' && cut.r > 0) {
          pth.absarc(cut.x * sc, cut.y * sc, cut.r * sc, 0, Math.PI * 2, true);
          shape.holes.push(pth);
        } else if (cut.pts && cut.pts.length >= 3) {
          pth.moveTo(cut.pts[0][0] * sc, cut.pts[0][1] * sc);
          for (var ci = 1; ci < cut.pts.length; ci++) {
            pth.lineTo(cut.pts[ci][0] * sc, cut.pts[ci][1] * sc);
          }
          pth.closePath();
          shape.holes.push(pth);
        }
      });
      var extrudeSettings = { depth: panelT, bevelEnabled: false };
      var panelGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Fall through to the common mesh creation code below
      var panelMat = createPartMaterial(part);
      var panelMesh = new THREE.Mesh(panelGeo, panelMat);
      panelMesh.position.set(part._pos.x, part._pos.y, part._pos.z);
      if (part._quat) panelMesh.quaternion.copy(part._quat);
      panelMesh.userData = { partId: part.id };
      panelMesh.castShadow = deviceQuality !== 'low';
      panelMesh.receiveShadow = deviceQuality !== 'low';
      scene.add(panelMesh);
      var edgeThreshold = deviceQuality === 'low' ? 30 : 15;
      var edgeGeo = new THREE.EdgesGeometry(panelGeo, edgeThreshold);
      var edgeMat = new THREE.LineBasicMaterial({ color: isDarkTheme ? 0x1a1a1a : 0x666666, transparent: true, opacity: 0.6 });
      var edgeLineObj = new THREE.LineSegments(edgeGeo, edgeMat);
      edgeLineObj.quaternion.copy(panelMesh.quaternion);
      edgeLineObj.position.copy(panelMesh.position);
      scene.add(edgeLineObj);
      originalPositions.set(part.id, new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z));
      meshMap.set(part.id, panelMesh);
      edgeLineMap.set(part.id, edgeLineObj);
      var details = buildPartDetails(part, panelMesh);
      if (details.length) detailMeshes.set(part.id, details);
      return;
    }
    // Вырезы (для poly и contour форм)
    var cutouts = part.cuts || part.cutouts || [];
    if (shape) {
    cutouts.forEach(function(cut) {
      var pth = new THREE.Path();
      if (cut.t === 'circle' && cut.r > 0) {
        pth.absarc(cut.x * sc, cut.y * sc, cut.r * sc, 0, Math.PI * 2, true);
        shape.holes.push(pth);
      } else if (cut.pts && cut.pts.length >= 3) {
        pth.moveTo(cut.pts[0][0] * sc, cut.pts[0][1] * sc);
        for (var ci = 1; ci < cut.pts.length; ci++) {
          pth.lineTo(cut.pts[ci][0] * sc, cut.pts[ci][1] * sc);
        }
        pth.closePath();
        shape.holes.push(pth);
      }
    });
    }
    var extrudeSettings = { depth: panelT, bevelEnabled: false };
    var panelGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    var panelMat = createPartMaterial(part);
    var panelMesh = new THREE.Mesh(panelGeo, panelMat);
    // Позиция + поворот (DetalQR: pos + quat)
    panelMesh.position.set(part._pos.x, part._pos.y, part._pos.z);
    if (part._quat) {
      panelMesh.quaternion.copy(part._quat);
    }
    panelMesh.userData = { partId: part.id };
    panelMesh.castShadow = deviceQuality !== 'low';
    panelMesh.receiveShadow = deviceQuality !== 'low';
    scene.add(panelMesh);
    // Wireframe edges
    var edgeThreshold = deviceQuality === 'low' ? 30 : 15;
    var edgeGeo = new THREE.EdgesGeometry(panelGeo, edgeThreshold);
    var edgeMat = new THREE.LineBasicMaterial({ color: isDarkTheme ? 0x1a1a1a : 0x666666, transparent: true, opacity: 0.6 });
    var edgeLineObj = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLineObj.quaternion.copy(panelMesh.quaternion);
    edgeLineObj.position.copy(panelMesh.position);
    scene.add(edgeLineObj);
    originalPositions.set(part.id, new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z));
    meshMap.set(part.id, panelMesh);
    edgeLineMap.set(part.id, edgeLineObj);
    // Build detail overlays (grooves, holes, edges — cutouts are now in the shape)
    var details = buildPartDetails(part, panelMesh);
    if (details.length) {
      detailMeshes.set(part.id, details);
    }
    } catch(partErr) {
      console.warn("Skipping part " + (part.id || '?') + " (" + (part.code || '?') + "): " + partErr.message);
    }
  });
  centerCamera();
  setNeedsRender(true);
  updateStats();
  buildModuleMap();
  renderPartsList();
  updateSummary();
  buildFasteners(fastenerData);
  buildHoles(window._loadedHoles || []);
  buildPockets(parts);
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
  setCamDist(Math.max(maxExtent * 1.5, 2));
  updateCamera();
}

function selectModuleHighlight(moduleKey, clickedId) {
  setSelectedId(clickedId);
  var moduleParts = moduleMap.get(moduleKey);
  if (!moduleParts) { selectPart(clickedId); return; }
  var moduleIds = new Set(moduleParts.map(function(p) { return p.id; }));
  meshMap.forEach(function(mesh, id) {
    if (moduleIds.has(id)) {
      mesh.material.emissive.setHex(0x00D4AA);
      mesh.material.emissiveIntensity = id === clickedId ? 0.25 : 0.12;
      mesh.material.transparent = true;
      mesh.material.opacity = id === clickedId ? 0.85 : 0.95;
    } else {
      mesh.material.emissive.setHex(0);
      mesh.material.emissiveIntensity = 0;
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
    }
    mesh.material.needsUpdate = true;
  });
  edgeLineMap.forEach(function(e, id) {
    if (moduleIds.has(id)) {
      e.visible = true;
      e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      e.material.opacity = 0.55;
      e.material.needsUpdate = true;
    } else {
      e.visible = false;
    }
  });
  updateSheet(parts.find(function(p) { return p.id === clickedId; }));
  // Add isolate button when in block mode
  var sheetContent = document.getElementById("sheetContent");
  if (sheetContent && moduleKey) {
    var isolateBtn = document.createElement("div");
    isolateBtn.className = "action-btn";
    isolateBtn.style.marginTop = "8px";
    isolateBtn.style.background = "rgba(0,212,170,0.12)";
    isolateBtn.style.borderColor = "rgba(0,212,170,0.25)";
    isolateBtn.textContent = "\u2299 \u0418золировать \u0431лок";
    isolateBtn.onclick = function() { isolateModule(moduleKey); };
    sheetContent.appendChild(isolateBtn);
  }
  renderPartsList();
  openSheet();

  setNeedsRender(true);
}
function selectPart(partId) {
  var prevId = selectedId;
  setSelectedId(partId);
  // Only reset previous selected (not all meshes — saves O(N) per click)
  if (prevId !== null && prevId !== partId) {
    var prevMesh = meshMap.get(prevId);
    var prevEdge = edgeLineMap.get(prevId);
    if (prevMesh) {
      prevMesh.material.emissive.setHex(0);
      prevMesh.material.emissiveIntensity = 0;
      prevMesh.material.transparent = false;
      prevMesh.material.opacity = 1;
      prevMesh.material.needsUpdate = true;
    }
    if (prevEdge) {
      prevEdge.visible = true;
      prevEdge.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      prevEdge.material.opacity = 0.55;
      prevEdge.material.transparent = true;
    }
  }
  var selectedMesh = meshMap.get(partId);
  var selectedEdge = edgeLineMap.get(partId);
  if (selectedMesh) {
    selectedMesh.material.emissive.setHex(0x00D4AA);
    selectedMesh.material.emissiveIntensity = 0.25;
    selectedMesh.material.transparent = true;
    selectedMesh.material.opacity = 0.85;
    selectedMesh.material.needsUpdate = true;
  }
  if (selectedEdge) {
    selectedEdge.visible = true;
    selectedEdge.material.color.setHex(0x00D4AA);
    selectedEdge.material.opacity = 0.8;
    selectedEdge.material.transparent = true;
    selectedEdge.material.needsUpdate = true;
  }
  if (xrayActive) {
    applyXray();
  }
  updateSheet(parts.find(part => part.id === partId));
  renderPartsList();
  openSheet();

  setNeedsRender(true);
}
function renderProcessingInfo(partData) {
  const grooves = partData.grooves || [];
  const holes2 = partData.holes || [];
  const cutouts2 = partData.cutouts || [];
  const pockets = partData.pockets || [];
  // edges removed from display
  const hasProcessing = grooves.length || holes2.length || cutouts2.length || pockets.length;
  const relatedFasteners = fastenerData.filter(f => f.ownerCode && partData.code && f.ownerCode === partData.code);
  if (!hasProcessing && !relatedFasteners.length) {
    return "";
  }
  let html = "<div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">";
  if (pockets.length) {
    html += "<div style=\"font-size:9px;color:#7a4de8;margin-bottom:2px\">Пазы/карманы (" + pockets.length + "):</div>";
    pockets.forEach(function(pk, idx) {
      var shape = pk.t === 'circle' ? ('⌀' + ((pk.r || 0) * 2).toFixed(0)) : ('poly ' + (pk.pts ? pk.pts.length : 0) + ' вершин');
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + shape + " гл." + (pk.depth || 0) + " мм " + (pk.face === 'B' ? 'тыл' : 'лицо') + "</div>";
    });
  }
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
    if (relatedFasteners.length) {
    html += "<div style=\"font-size:9px;color:#ff9800;margin-bottom:2px\">Фурнитура (" + relatedFasteners.length + "):</div>";
    relatedFasteners.forEach((f, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + escapeHtml(f.name || "?") + " [" + escapeHtml(f.type || "?") + "]</div>";
    });
  }
  html += "</div>";
  return html;
}
function findNeighbors(part) {
  if (!fastenerData.length || !part) return [];
  var neighbors = [];
  var seen = new Set();
  var code = part.code || "";
  fastenerData.forEach(function(f) {
    if (f.ownerCode && f.ownerCode === code && f.neighborCode && !seen.has(f.neighborCode)) {
      seen.add(f.neighborCode);
      neighbors.push(f.neighborCode);
    }
  });
  return neighbors;
}
function navigateToNeighbor(code) {
  var found = parts.find(function(p) { return p.code === code; });
  if (found) { selectPart(found.id); startSmoothZoom(found.id); }
}
var sheetCollapsed = false;
function updateSheet(part) {
  var sheetEl = document.getElementById("sheetContent");
  var previewCodeEl = document.getElementById("sheetPreviewCode");
  var bottomSheet = document.getElementById("bottomSheet");
  if (!part) {
    sheetEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:10px;font-size:11px;">Нажмите на деталь</div>';
    if (previewCodeEl) previewCodeEl.textContent = '—';
    bottomSheet.removeAttribute('data-state');
    sheetCollapsed = false;
    return;
  }
  var isScanned = scannedSet.has(part.id);
  var displayCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
  var displayCode2 = idMode === "position" ? (part.code || "") : (part.position || "");
  var modKey = getModuleKey(displayCode);
  var modName = part.groupName || getModuleName(displayCode);
  var modColor = getModuleColor(displayCode);
  var neighbors = findNeighbors(part);
  if (previewCodeEl) var dims = (part.L || '?') + '×' + (part.W || '?') + '×' + (part.T || '?');
  previewCodeEl.textContent = (displayCode || '—') + '  ' + dims + '  ' + (part.name || '');
  var html = '<div class="detail-card">';
  html += '<div style="font-size:18px;font-weight:700;color:var(--code-color);font-family:Monaco,Menlo,monospace;margin-bottom:4px">' + escapeHtml(displayCode || '—') + '</div>';
  if (displayCode2) {
    html += '<div style="font-size:11px;color:var(--text-tertiary);font-family:Monaco,Menlo,monospace;margin-bottom:6px">' + escapeHtml(displayCode2) + '</div>';
  }
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">' + escapeHtml(part.name || '—') + '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">';
  html += '<div class="dim"><span class="dim-label">Д</span><span class="dim-value">' + (part.L || '—') + '</span></div>';
  html += '<div class="dim"><span class="dim-label">Ш</span><span class="dim-value">' + (part.W || '—') + '</span></div>';
  html += '<div class="dim"><span class="dim-label">Т</span><span class="dim-value">' + (part.T || '—') + '</span></div>';
  html += '<span class="material-tag">' + escapeHtml(part.material || 'Материал') + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">';
  html += '<span class="status-badge ' + (isScanned ? 'scanned' : 'waiting') + '">' + (isScanned ? 'СОБРАНО' : 'ОЖИДАЕТ') + '</span>';
  html += '<span class="module-badge" style="color:' + modColor + ';background:' + modColor + '18;border-color:' + modColor + '30">' + modName + '</span>';
  html += '</div>';
  if (modKey !== 'HARDWARE' && modKey !== 'OTHER') {
    var modParts = moduleMap.get(modKey) || [];
    var partIndex = modParts.indexOf(part) + 1;
    if (partIndex > 0) {
      html += '<div class="assembly-hint">' + modName + ' — деталь ' + partIndex + ' из ' + modParts.length + ' в модуле</div>';
    }
  }
  if (neighbors.length) {
    html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">';
    html += '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px">Соседи</div>';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
    neighbors.forEach(function(nb) {
      var safeNbAttr = JSON.stringify(nb || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      html += '<span onclick="navigateToNeighbor(' + safeNbAttr + ')" style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--code-color);font-family:Monaco,Menlo,monospace;cursor:pointer">' + escapeHtml(nb) + '</span>';
    });
    html += '</div></div>';
  }
  html += renderProcessingInfo(part);
  html += '<div class="action-buttons">';
  var safeCodeAttr = JSON.stringify(displayCode || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  html += '<div class="action-btn" onclick="handleScan(' + safeCodeAttr + ')">Скан</div>';
  html += '<div class="action-btn" onclick="startSmoothZoom(' + part.id + ')">Фокус</div>';
  html += '<div class="action-btn" onclick="toggleVisibility(' + part.id + ')">' + (hiddenSet.has(part.id) ? 'Показать' : 'Скрыть') + '</div>';
  html += '</div>';
  html += '</div>';
  sheetEl.innerHTML = html;
  if (isMobileSheet() && !assemblyMode) {
    bottomSheet.setAttribute('data-state', 'collapsed');
    sheetCollapsed = true;
  } else {
    bottomSheet.removeAttribute('data-state');
    sheetCollapsed = false;
  }
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
      setSelectedId(null);
      updateSheet(null);
      closeSheet();
    }
  }
  renderPartsList();
  if (xrayActive) {
    applyXray();
  }
  saveProgress();
  setNeedsRender(true);
  showToast((hiddenSet.has(partId) ? "🙈" : "👁") + " Деталь " + (hiddenSet.has(partId) ? "скрыта" : "показана"));
}
function toggleCSGVisibility() {
  setCsgEnabled(!csgEnabled);
  detailMeshes.forEach(function(arr) {
    arr.forEach(function(obj) {
      obj.visible = csgEnabled;
      if (obj.material) {
        obj.material.transparent = !csgEnabled;
        obj.material.opacity = csgEnabled ? 1 : 0;
      }
    });
  });
  fastenerMeshes.forEach(function(fm) {
    fm.visible = csgEnabled;
    if (fm.material) {
      fm.material.transparent = !csgEnabled;
      fm.material.opacity = csgEnabled ? 1 : 0;
    }
  });
  holeMeshes.forEach(function(hm) {
    hm.visible = csgEnabled;
  });
  pocketMeshes.forEach(function(pm) {
    pm.visible = csgEnabled;
  });
  const btn = document.getElementById("csgBtn");
  btn.classList.toggle("active", csgEnabled);
  setNeedsRender(true);
  showToast(csgEnabled ? "Фурнитура показана" : "Фурнитура скрыта");
}
function showAllParts() {
  hiddenSet.clear();
  setIsolatedModule(null);
  setExplodeModuleKey(null);
  meshMap.forEach(m => {
    m.visible = true;
    m.material.transparent = false;
    m.material.opacity = 1;
    m.material.roughness = 0.78;
    m.material.needsUpdate = true;
  });
  edgeLineMap.forEach(e => {
    e.visible = true;
    e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
    e.material.opacity = 0.55;
  });
  detailMeshes.forEach(arr => {
    arr.forEach(obj => { obj.visible = true; });
  });
  renderPartsList();
  if (xrayActive) { applyXray(); }
  if (explodeActive) {
    animateExplodeTo(0);
    setExplodeActive(false);
    document.getElementById("explodeBtn").classList.remove("active");
  }
  document.getElementById("isolationBar").style.display = "none";
  showToast("Все модули показаны");

  setNeedsRender(true);
}

// === Module Isolation ===
function isolateModule(moduleKey) {
  if (!moduleMap.has(moduleKey)) return;
  setIsolatedModule(moduleKey);
  var moduleParts = moduleMap.get(moduleKey);
  var moduleIds = new Set(moduleParts.map(p => p.id));
  meshMap.forEach((m, id) => {
    if (moduleIds.has(id)) {
      m.visible = true;
      m.material.transparent = false;
      m.material.opacity = 1;
      m.material.roughness = 0.78;
      m.material.needsUpdate = true;
    } else {
      m.visible = false;
    }
  });
  edgeLineMap.forEach((e, id) => {
    if (moduleIds.has(id)) {
      e.visible = true;
      e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      e.material.opacity = 0.55;
    } else {
      e.visible = false;
    }
  });
  detailMeshes.forEach((arr, id) => {
    arr.forEach(obj => { obj.visible = moduleIds.has(id); });
  });
  // Show isolation bar
  var bar = document.getElementById("isolationBar");
  var firstPart = moduleParts[0];
  var displayName = (firstPart && firstPart.groupName) ? firstPart.groupName : getModuleName(moduleKey + "_00");
  var modColor = getModuleColor(moduleKey + "_00");
  bar.querySelector(".isolation-name").textContent = displayName;
  bar.querySelector(".isolation-name").style.color = modColor;
  bar.querySelector(".isolation-count").textContent = moduleParts.length + " деталей";
  bar.style.display = "flex";
  centerCameraOnParts(moduleParts);
  renderPartsList();
  showToast("Изолирован: " + displayName);

  setNeedsRender(true);
}
function exitIsolation() {
  setIsolatedModule(null);
  setExplodeModuleKey(null);
  meshMap.forEach(m => {
    m.visible = true;
    m.material.transparent = false;
    m.material.opacity = 1;
    m.material.roughness = 0.78;
    m.material.needsUpdate = true;
  });
  edgeLineMap.forEach(e => {
    e.visible = true;
    e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
    e.material.opacity = 0.55;
    e.material.needsUpdate = true;
  });
  detailMeshes.forEach(arr => {
    arr.forEach(obj => { obj.visible = true; });
  });
  if (explodeActive) {
    animateExplodeTo(0);
    setExplodeActive(false);
    document.getElementById("explodeBtn").classList.remove("active");
  }
  document.getElementById("isolationBar").style.display = "none";
  centerCamera();
  renderPartsList();
  showToast("Изоляция снята");

  setNeedsRender(true);
}
function centerCameraOnParts(partsArr) {
  if (!partsArr.length) return;
  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;
  var minZ = Infinity, maxZ = -Infinity;
  partsArr.forEach(p => {
    if (!p._pos) return;
    minX = Math.min(minX, p._pos.x - p._size.x / 2);
    maxX = Math.max(maxX, p._pos.x + p._size.x / 2);
    minY = Math.min(minY, p._pos.y - p._size.y / 2);
    maxY = Math.max(maxY, p._pos.y + p._size.y / 2);
    minZ = Math.min(minZ, p._pos.z - p._size.z / 2);
    maxZ = Math.max(maxZ, p._pos.z + p._size.z / 2);
  });
  targetPosition.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  var maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  setCamDist(Math.max(maxExtent * 2, 1.5));
  updateCamera();
}
function explodeIsolatedModule() {
  if (!isolatedModule) return;
  setExplodeModuleKey(isolatedModule);
  setExplodeActive(true);
  document.getElementById("explodeBtn").classList.add("active");
  // Reset positions for non-module parts to original
  parts.forEach(function(p) {
    var pg = p.group || getModuleKey(p.code || "");
    if (pg !== explodeModuleKey) {
      var m = meshMap.get(p.id);
      var e = edgeLineMap.get(p.id);
      var orig = originalPositions.get(p.id);
      if (m && orig) m.position.copy(orig);
      if (e && orig) e.position.copy(orig);
    }
  });
  setExplodeProgress(0);
  animateExplodeTo(1);
}
function applyXray() {
  meshMap.forEach((xrayMesh, xrayId) => {
    // Сброс прозрачности для ВСЕХ — включая скрытые, иначе при показе останется плёнка
    if (!xrayActive) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
      xrayMesh.material.roughness = 0.78;
      xrayMesh.material.needsUpdate = true;
      return;
    }
    if (selectedId !== null && xrayId === selectedId) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
      xrayMesh.material.roughness = 0.78;
    } else {
      xrayMesh.material.transparent = true;
      xrayMesh.material.opacity = 0.28;
      xrayMesh.material.roughness = 0.92;
    }
    xrayMesh.material.needsUpdate = true;
  });

  setNeedsRender(true);
}
function toggleXray() {
  setXrayActive(!xrayActive);
  document.getElementById("xrayBtn").classList.toggle("active", xrayActive);
  if (!xrayActive) {
    meshMap.forEach(m => {
      m.material.transparent = false;
      m.material.opacity = 1;
      m.material.roughness = 0.78;
      m.material.needsUpdate = true;
    });
  } else {
    applyXray();
  }
}
function toggleExplode() {
  setExplodeActive(!explodeActive);
  document.getElementById("explodeBtn").classList.toggle("active", explodeActive);
  if (!explodeActive) {
    setExplodeModuleKey(null);
    animateExplodeTo(0);
  } else {
    if (isolatedModule) { setExplodeModuleKey(isolatedModule); }
    else { setExplodeModuleKey(null); }
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
    setExplodeProgress(startVal + (target - startVal) * eased);
    applyExplode();
    setNeedsRender(true);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}
function applyExplode() {
  if (!originalPositions.size) return;
  _tmpCenter.set(0, 0, 0);
  var count = 0;
  if (explodeModuleKey && moduleMap.has(explodeModuleKey)) {
    var modParts = moduleMap.get(explodeModuleKey);
    modParts.forEach(p => {
      var pos = originalPositions.get(p.id);
      if (pos) { _tmpCenter.add(pos); count++; }
    });
  } else {
    originalPositions.forEach(origCenter => {
      _tmpCenter.add(origCenter);
      count++;
    });
  }
  if (count > 0) _tmpCenter.divideScalar(count);
  parts.forEach(part => {
    if (explodeModuleKey) {
      var partGroup = part.group || getModuleKey(part.code || "");
      if (partGroup !== explodeModuleKey) return;
    }
    const explodeMesh = meshMap.get(part.id);
    const explodeEdge = edgeLineMap.get(part.id);
    const origPos = originalPositions.get(part.id);
    if (!explodeMesh || !origPos) return;
    _tmpDir.subVectors(origPos, _tmpCenter);
    const dist = _tmpDir.length();
    if (dist > 0.001) _tmpDir.normalize();
    const offset = explodeProgress * dist * 0.8;
    _tmpNewPos.copy(origPos).addScaledVector(_tmpDir, offset);
    _tmpDelta.subVectors(_tmpNewPos, origPos);
    explodeMesh.position.copy(_tmpNewPos);
    if (explodeEdge) explodeEdge.position.copy(_tmpNewPos);
    // Detail meshes are children of panel mesh — they move automatically
  });

  setNeedsRender(true);
}
// Assembly mode handled by src/assembly.js
// updateSummary handled by src/ui.js
// updateStats handled by src/ui.js
// renderPartsList, renderPartsListDeferred handled by src/ui.js
// _doRenderPartsList, createPartItem handled by src/ui.js
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
// QR scanner handled by src/qr.js
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
    scannedSet.clear();
    saved.scanned.forEach(id => scannedSet.add(id));
  }
  if (saved.hidden) {
    hiddenSet.clear();
    saved.hidden.forEach(id => hiddenSet.add(id));
  }
}
function resetProgress() {
  if (confirm("Сбросить весь прогресс сборки?")) {
    scannedSet.clear();
    hiddenSet.clear();
    meshMap.forEach(m => m.visible = true);
    edgeLineMap.forEach(e => e.visible = true);
    setSelectedId(null);
    updateSheet(null);
    closeSheet();
    updateStats();
    renderPartsList();
    localStorage.removeItem("aivoProgress");
    showToast("🔄 Прогресс сброшен");
  }
}
// UI functions handled by src/ui.js

// Event wiring handled by src/events.js
initEvents({
  toggleTheme, toggleVisibility, showAllParts, toggleXray, toggleExplode,
  toggleCSGVisibility, toggleDims, resetProgress, showStats, printSpecification,
  selectPart, buildModuleMap, centerCamera, handleFileLoad: function(file) {
    document.getElementById("loadingOverlay").classList.add("show");
    // Safety timeout — force-hide overlay if something hangs
    var _loadSafetyTimer = setTimeout(function() {
      document.getElementById("loadingOverlay").classList.remove("show");
      showToast("❌ Превышено время загрузки");
    }, 15000);
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        var loadedParts = data.parts || data;
        if (!Array.isArray(loadedParts) || loadedParts.length === 0) {
          clearTimeout(_loadSafetyTimer);
          showToast("❌ Неверный формат JSON — массив деталей пуст");
          document.getElementById("loadingOverlay").classList.remove("show");
          return;
        }
        setParts(loadedParts);
        setFastenerData(data.fasteners || []);
        setDimsData(data.dims || []);
        window._loadedHoles = data.holes || [];
        parts.forEach(function(p, i) { if (p.id === undefined) p.id = i; });
        autoLayout(parts);
        var loadText = document.querySelector("#loadingOverlay .load-text");
        if (loadText) loadText.textContent = "Построение 3D (" + parts.length + " деталей)...";
        setTimeout(function() {
          try {
            buildScene();
            setSelectedId(null);
            loadProgress();
            centerCamera();
            closeDrawer();
            updateStats();
            showToast("✅ Загружено " + parts.length + " деталей");
            if (dimsData.length) showToast("📐 " + dimsData.length + " размеров из БАЗИС");
            document.getElementById("projectTitle").textContent = file.name.replace(".json", "");
            saveProgress();
          } catch(buildErr) {
            console.error("3D build error:", buildErr);
            showToast("❌ Ошибка 3D: " + buildErr.message);
          }
          clearTimeout(_loadSafetyTimer);
          document.getElementById("loadingOverlay").classList.remove("show");
        }, 30);
      } catch(err) {
        clearTimeout(_loadSafetyTimer);
        showToast("❌ Ошибка файла: " + err.message);
        document.getElementById("loadingOverlay").classList.remove("show");
      }
    };
    reader.onerror = function() {
      clearTimeout(_loadSafetyTimer);
      showToast("❌ Не удалось прочитать файл");
      document.getElementById("loadingOverlay").classList.remove("show");
    };
    reader.readAsText(file, "UTF-8");
  }
});

// Drag-and-drop handled by initEvents


function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  if (autoRotate && !isDragging && !isSmoothZoom) {
    setTheta(theta + 0.0025);
    updateCamera();
  }
  if (isSmoothZoom) {
    animateSmoothZoom();
    setNeedsRender(true);
  }
  if (needsRender) {
    renderer.render(scene, camera);
    setNeedsRender(false);
  }
}
let _resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    setNeedsRender(true);
  }, 100);
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


// === Isolation bar handlers ===
document.getElementById("isolationExitBtn").addEventListener("click", exitIsolation);
document.getElementById("isolationExplodeBtn").addEventListener("click", explodeIsolatedModule);


// Camera controls — wire dependencies
initCamera({
  handleRaycast: function(bestId) {
    if (!hiddenSet.has(bestId)) {
      if (blockMode) {
        var partData = parts.find(function(p) { return p.id === bestId; });
        if (partData) {
          var partGroup = partData.group || getModuleKey(partData.code || '');
          selectModuleHighlight(partGroup, bestId);
        } else { selectPart(bestId); }
      } else { selectPart(bestId); }
    }
  },
  updateSheet: updateSheet,
  closeSheet: closeSheet,
  renderPartsList: renderPartsList,
  applyXray: applyXray,
  showToast: showToast,
  canvas: document.getElementById('canvas3d')
});

// Assembly mode — wire dependencies
initAssembly({
  startSmoothZoom: startSmoothZoom,
  updateSheet: updateSheet,
  openSheet: openSheet,
  renderPartsListDeferred: renderPartsListDeferred,
  showToast: showToast
});

// UI — wire dependencies for parts list click handlers and module isolate buttons
initUI({
  selectPart: selectPart,
  startSmoothZoom: startSmoothZoom,
  toggleVisibility: toggleVisibility,
  isolateModule: isolateModule,
  applyXray: applyXray,
  centerCamera: centerCamera,
  exitIsolation: exitIsolation,
  animateExplodeTo: animateExplodeTo
});

// Expose functions used by inline HTML onclick handlers
window.handleScan = handleScan;
window.startSmoothZoom = startSmoothZoom;
window.toggleVisibility = toggleVisibility;
window.navigateToNeighbor = navigateToNeighbor;

// QR scanner handled by src/qr.js
initQR(handleScan, showToast);
wireQRListeners();
