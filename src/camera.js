// ============================================================
// CAMERA CONTROLS + RAYCASTING (extracted from app.js)
// ============================================================
import {
  camera, targetPosition, zoomTarget,
  setTheta, setPhi, setCamDist, setIsDragging, setPrevMouse,
  setAutoRotate, setIsSmoothZoom, setNeedsRender,
  setTouchStartPos, setIsPinching, setPinchStartDist, setPinchStartCamDist,
  setIsPanning, setPanStartMid, setPanStartTarget,
  setMouseStartPos, setMouseMovedDistance, setIsPanningMouse, setPanStartMouse,
  theta, phi, camDist, isDragging, prevMouse,
  autoRotate, isSmoothZoom, needsRender,
  touchStartPos, isPinching, pinchStartDist, pinchStartCamDist,
  isPanning, panStartMid, panStartTarget,
  mouseStartPos, mouseMovedDistance, isPanningMouse, panStartMouse,
  parts, selectedId, setSelectedId,
  meshMap, edgeLineMap, isDarkTheme,
  xrayActive, fastenerMeshes, fastenerData, detailMeshes,
  rulerMode, rulerPoints, rulerLine, setRulerLine, setRulerMode
} from './state.js';

// Dependencies injected via init()
let _handleRaycast = null;
let _updateSheet = null;
let _closeSheet = null;
let _renderPartsList = null;
let _applyXray = null;
let _showToast = null;
let _canvas = null;

export function initCamera(deps) {
  _handleRaycast = deps.handleRaycast;
  _updateSheet = deps.updateSheet;
  _closeSheet = deps.closeSheet;
  _renderPartsList = deps.renderPartsList;
  _applyXray = deps.applyXray;
  _showToast = deps.showToast;
  _canvas = deps.canvas;
}

export function updateCamera() {
  if (isSmoothZoom) return;
  camera.position.x = targetPosition.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = targetPosition.y + camDist * Math.cos(phi);
  camera.position.z = targetPosition.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(targetPosition);
  setNeedsRender(true);
}

let zoomPartCenter = null;
export function startSmoothZoom(partId) {
  const part = parts.find(p => p.id === partId);
  if (!part || !part._pos) return;
  zoomPartCenter = new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z);
  const size = Math.max(part._size.x, part._size.y, part._size.z);
  const dist = Math.max(size * 2.5, 0.8);
  const dir = camera.position.clone().sub(zoomPartCenter).normalize();
  zoomTarget.set(part._pos.x + dir.x * dist, part._pos.y + dir.y * dist, part._pos.z + dir.z * dist);
  setIsSmoothZoom(true);
  setAutoRotate(false);
}

export function animateSmoothZoom() {
  if (!isSmoothZoom) return;
  const lerpFactor = 0.12;
  camera.position.lerp(zoomTarget, lerpFactor);
  if (zoomPartCenter) targetPosition.lerp(zoomPartCenter, lerpFactor);
  camera.lookAt(targetPosition);
  if (camera.position.distanceTo(zoomTarget) < 0.15) {
    setIsSmoothZoom(false);
    if (zoomPartCenter) targetPosition.copy(zoomPartCenter);
    setCamDist(camera.position.distanceTo(targetPosition));
    zoomPartCenter = null;
  }
}

// === Raycasting ===
let prevClickKey = null;
// Pre-allocated raycast objects (avoid GC pressure per click)
const _rcMouse = new THREE.Vector2();
const _rcRaycaster = new THREE.Raycaster();
let _rcVisibleCache = null;
let _rcVisibleCacheDirty = true;

export function invalidateVisibleCache() {
  _rcVisibleCacheDirty = true;
}

export function deselectPart() {
  if (selectedId === null) return;
  var prevMesh = meshMap.get(selectedId);
  var prevEdge = edgeLineMap.get(selectedId);
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
    prevEdge.material.needsUpdate = true;
  }
  setSelectedId(null);
  if (xrayActive && _applyXray) _applyXray();
  if (_updateSheet) _updateSheet(null);
  if (_closeSheet) _closeSheet();
  if (_renderPartsList) _renderPartsList();
  setNeedsRender(true);
}

export function handleRaycast(clickX, clickY, rect) {
  _rcMouse.x = (clickX - rect.left) / rect.width * 2 - 1;
  _rcMouse.y = -((clickY - rect.top) / rect.height) * 2 + 1;
  _rcRaycaster.setFromCamera(_rcMouse, camera);
  if (_rcVisibleCacheDirty || !_rcVisibleCache) {
    _rcVisibleCache = Array.from(meshMap.values()).filter(m => m.visible === true);
    _rcVisibleCacheDirty = false;
  }
  const meshes = _rcVisibleCache.slice();
  detailMeshes.forEach(arr => {
    arr.forEach(m => { if (m.visible && m.userData && m.userData.partId) meshes.push(m); });
  });
  fastenerMeshes.forEach(m => { if (m.visible && m.userData && m.userData.fastenerId !== undefined) meshes.push(m); });
  const hits = _rcRaycaster.intersectObjects(meshes);
  if (hits.length === 0) { deselectPart(); return; }
  for (let i = 0; i < hits.length; i++) {
    const ud = hits[i].object.userData;
    // Handle InstancedMesh fasteners (batched by geometry+color)
    if (ud && ud.fastenerInstances && hits[i].instanceId !== undefined) {
      const instData = ud.fastenerInstances[hits[i].instanceId];
      if (instData) {
        const f = fastenerData.find(fd => fd.id === instData.fastenerId);
        if (f && _showToast) { _showToast("\uD83D\uDD27 " + (f.name || "Фурнитура") + " [" + (f.type || "?") + "]"); }
      }
      return;
    }
    if (ud && ud.fastenerId !== undefined) {
      const f = fastenerData.find(fd => fd.id === ud.fastenerId);
      if (f && _showToast) { _showToast("\uD83D\uDD27 " + (f.name || "Фурнитура") + " [" + (f.type || "?") + "]"); }
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
  // Delegate to main app for selection logic (block mode, module highlight, etc.)
  if (_handleRaycast) _handleRaycast(bestId);
}

// === Ruler / Measurement ===
function clearRulerVisuals() {
  const _scene = rulerLine ? rulerLine.parent : null;
  rulerPoints.forEach(function(p) {
    if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    if (p.mesh && p.mesh.geometry) p.mesh.geometry.dispose();
    if (p.mesh && p.mesh.material) p.mesh.material.dispose();
  });
  rulerPoints.length = 0;
  if (rulerLine) {
    if (rulerLine.parent) rulerLine.parent.remove(rulerLine);
    if (rulerLine.geometry) rulerLine.geometry.dispose();
    if (rulerLine.material) rulerLine.material.dispose();
    setRulerLine(null);
  }
  // Remove ruler label sprite (stored on canvas as __rulerLabel)
  if (_canvas && _canvas.__rulerLabel) {
    var lbl = _canvas.__rulerLabel;
    if (lbl.parent) lbl.parent.remove(lbl);
    if (lbl.material && lbl.material.map) lbl.material.map.dispose();
    if (lbl.material) lbl.material.dispose();
    _canvas.__rulerLabel = null;
  }
  if (_scene) setNeedsRender(true);
}

function createRulerLabel(distance) {
  var cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  var ctx = cv.getContext('2d');
  // Dark background pill
  ctx.fillStyle = 'rgba(20,20,26,0.85)';
  roundRect(ctx, 8, 20, 240, 88, 16);
  ctx.fill();
  // Orange border
  ctx.strokeStyle = '#ff8a2a';
  ctx.lineWidth = 3;
  roundRect(ctx, 8, 20, 240, 88, 16);
  ctx.stroke();
  // Text
  ctx.font = 'bold 48px system-ui, -apple-system, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(distance.toFixed(0) + ' mm', 128, 64);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: true, depthWrite: false, transparent: true
  }));
  spr.scale.set(0.12, 0.06, 1);
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getRulerHitPoint(clickX, clickY, rect) {
  _rcMouse.x = (clickX - rect.left) / rect.width * 2 - 1;
  _rcMouse.y = -((clickY - rect.top) / rect.height) * 2 + 1;
  _rcRaycaster.setFromCamera(_rcMouse, camera);
  if (_rcVisibleCacheDirty || !_rcVisibleCache) {
    _rcVisibleCache = Array.from(meshMap.values()).filter(function(m) { return m.visible === true; });
    _rcVisibleCacheDirty = false;
  }
  var meshes = _rcVisibleCache.slice();
  detailMeshes.forEach(function(arr) {
    arr.forEach(function(m) { if (m.visible && m.userData && m.userData.partId) meshes.push(m); });
  });
  var hits = _rcRaycaster.intersectObjects(meshes);
  if (hits.length === 0) return null;
  return hits[0].point.clone();
}

export function addRulerPoint(clickX, clickY, rect) {
  var hitPt = getRulerHitPoint(clickX, clickY, rect);
  if (!hitPt) return;

  // If 2 points already, clear and start over
  if (rulerPoints.length >= 2) {
    clearRulerVisuals();
  }

  // Create marker sphere
  var sphereGeo = new THREE.SphereGeometry(0.005, 12, 12);
  var sphereMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  var sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.copy(hitPt);
  scene.add(sphere);
  rulerPoints.push({ point: hitPt, mesh: sphere });

  if (rulerPoints.length === 2) {
    var p1 = rulerPoints[0].point;
    var p2 = rulerPoints[1].point;
    // Create line
    var lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    var lineMat = new THREE.LineBasicMaterial({ color: 0xff8a2a, linewidth: 2 });
    var line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    setRulerLine(line);
    // Distance in mm (model units are meters, scale 0.001)
    var distM = p1.distanceTo(p2);
    var distMm = distM * 1000;
    // Label at midpoint
    var mid = p1.clone().add(p2).multiplyScalar(0.5);
    var label = createRulerLabel(distMm);
    label.position.copy(mid);
    label.position.y += 0.02;
    scene.add(label);
    if (_canvas) _canvas.__rulerLabel = label;
    // Toast
    if (_showToast) _showToast('📏 ' + distMm.toFixed(0) + ' мм');
  } else {
    if (_showToast) _showToast('📍 Точка 1 — нажмите вторую точку');
  }
  setNeedsRender(true);
}

export function startRulerMode() {
  setRulerMode(true);
  if (_canvas) _canvas.style.cursor = 'crosshair';
  clearRulerVisuals();
  if (_showToast) _showToast('📏 Режим линейки — нажмите на поверхность');
}

export function stopRulerMode() {
  setRulerMode(false);
  if (_canvas) _canvas.style.cursor = '';
  clearRulerVisuals();
}

// === Touch Controls ===
export function onTouchStart(touchEvent) {
  touchEvent.preventDefault();
  const touches = touchEvent.touches;
  if (touches.length === 1) {
    setTouchStartPos({ x: touches[0].clientX, y: touches[0].clientY });
    setIsDragging(true);
    setPrevMouse({ x: touches[0].clientX, y: touches[0].clientY });
    setAutoRotate(false);
  } else if (touches.length === 2) {
    setIsPinching(true);
    setIsDragging(false);
    setIsPanning(false);
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    setPinchStartDist(Math.hypot(dx, dy));
    setPinchStartCamDist(camDist);
    setPanStartMid({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });
    setPanStartTarget(targetPosition.clone());
  }
}

export function onTouchMove(moveEvent) {
  moveEvent.preventDefault();
  const moveTouches = moveEvent.touches;
  if (moveTouches.length === 1 && isDragging) {
    setTheta(theta - (moveTouches[0].clientX - prevMouse.x) * 0.008);
    setPhi(Math.max(0.2, Math.min(Math.PI - 0.2, phi - (moveTouches[0].clientY - prevMouse.y) * 0.008)));
    setPrevMouse({ x: moveTouches[0].clientX, y: moveTouches[0].clientY });
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
    if (!isPanning && midMove > 8 && distChange < 0.08) setIsPanning(true);
    if (isPanning && panStartTarget) {
      const panSpeed = camDist * 0.0012;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      targetPosition.copy(panStartTarget);
      targetPosition.addScaledVector(right, -midDx * panSpeed);
      targetPosition.addScaledVector(up, midDy * panSpeed);
    } else {
      setCamDist(Math.max(0.5, Math.min(80, pinchStartCamDist / distRatio)));
    }
    updateCamera();
  }
}

export function onTouchEnd(endEvent) {
  if (touchStartPos && !isPinching) {
    const canvasRect = _canvas.getBoundingClientRect();
    const changedTouch = endEvent.changedTouches[0];
    if (Math.abs(changedTouch.clientX - touchStartPos.x) < 5 && Math.abs(changedTouch.clientY - touchStartPos.y) < 5) {
      if (rulerMode) {
        addRulerPoint(changedTouch.clientX, changedTouch.clientY, canvasRect);
      } else {
        handleRaycast(changedTouch.clientX, changedTouch.clientY, canvasRect);
      }
    }
  }
  setIsDragging(false);
  setIsPinching(false);
  setIsPanning(false);
  setPanStartMid(null);
  setPanStartTarget(null);
  setTouchStartPos(null);
}

// === Mouse Controls ===
export function onMouseDown(mouseEvent) {
  if (mouseEvent.button === 0) {
    setMouseStartPos({ x: mouseEvent.clientX, y: mouseEvent.clientY });
    setMouseMovedDistance(0);
    setIsDragging(true);
    setPrevMouse({ x: mouseEvent.clientX, y: mouseEvent.clientY });
    setAutoRotate(false);
  } else if (mouseEvent.button === 2) {
    setIsPanningMouse(true);
    setPanStartMouse({ x: mouseEvent.clientX, y: mouseEvent.clientY });
    setPanStartTarget(targetPosition.clone());
  }
}

export function onMouseMove(moveEvt) {
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
  if (!isDragging) return;
  const deltaX = moveEvt.clientX - prevMouse.x;
  const deltaY = moveEvt.clientY - prevMouse.y;
  setMouseMovedDistance(mouseMovedDistance + Math.abs(deltaX) + Math.abs(deltaY));
  setTheta(theta - deltaX * 0.005);
  setPhi(Math.max(0.2, Math.min(Math.PI - 0.2, phi - deltaY * 0.005)));
  setPrevMouse({ x: moveEvt.clientX, y: moveEvt.clientY });
  updateCamera();
}

export function onMouseUp() {
  if (isDragging && mouseStartPos && mouseMovedDistance < 5) {
    const canvasRect = _canvas.getBoundingClientRect();
    if (rulerMode) {
      addRulerPoint(mouseStartPos.x, mouseStartPos.y, canvasRect);
    } else {
      handleRaycast(mouseStartPos.x, mouseStartPos.y, canvasRect);
    }
  }
  setIsDragging(false);
  setIsPanningMouse(false);
  setPanStartMouse(null);
  setMouseStartPos(null);
  setMouseMovedDistance(0);
}

export function onWheel(wheelEvent) {
  wheelEvent.preventDefault();
  setCamDist(Math.max(0.5, Math.min(80, camDist + camDist * wheelEvent.deltaY * 0.001)));
  updateCamera();
}

export function setupCameraControls(canvasEl) {
  _canvas = canvasEl;
  canvasEl.addEventListener('touchstart', onTouchStart, { passive: false });
  canvasEl.addEventListener('touchmove', onTouchMove, { passive: false });
  canvasEl.addEventListener('touchend', onTouchEnd, { passive: false });
  canvasEl.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvasEl.addEventListener('wheel', onWheel, { passive: false });
  canvasEl.addEventListener('contextmenu', function(e) { e.preventDefault(); });
}
