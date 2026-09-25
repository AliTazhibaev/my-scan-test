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
  xrayActive, fastenerMeshes, fastenerData, detailMeshes
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
  const mouse = new THREE.Vector2();
  mouse.x = (clickX - rect.left) / rect.width * 2 - 1;
  mouse.y = -((clickY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const meshes = Array.from(meshMap.values()).filter(m => m.visible === true);
  detailMeshes.forEach(arr => {
    arr.forEach(m => { if (m.visible && m.userData && m.userData.partId) meshes.push(m); });
  });
  fastenerMeshes.forEach(m => { if (m.visible && m.userData && m.userData.fastenerId !== undefined) meshes.push(m); });
  const hits = rc.intersectObjects(meshes);
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
      handleRaycast(changedTouch.clientX, changedTouch.clientY, canvasRect);
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
    handleRaycast(mouseStartPos.x, mouseStartPos.y, canvasRect);
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
