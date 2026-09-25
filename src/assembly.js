// ============================================================
// ASSEMBLY MODE (extracted from app.js)
// ============================================================
import {
  assemblyMode, setAssemblyMode,
  assemblyIndex, setAssemblyIndex,
  assemblyPrevIndex, setAssemblyPrevIndex,
  assemblyOrder, setAssemblyOrder,
  assemblyPlaying, setAssemblyPlaying,
  assemblyTimer, setAssemblyTimer,
  parts, moduleMap, meshMap, edgeLineMap,
  isDarkTheme, setAutoRotate, setNeedsRender
} from './state.js';

let _startSmoothZoom = null;
let _updateSheet = null;
let _openSheet = null;
let _renderPartsListDeferred = null;
let _showToast = null;

export function initAssembly(deps) {
  _startSmoothZoom = deps.startSmoothZoom;
  _updateSheet = deps.updateSheet;
  _openSheet = deps.openSheet;
  _renderPartsListDeferred = deps.renderPartsListDeferred;
  _showToast = deps.showToast;
}

export function toggleAssembly() {
  setAssemblyMode(!assemblyMode);
  document.getElementById('assembleBtn').classList.toggle('active', assemblyMode);
  document.getElementById('assemblyOverlay').classList.toggle('active', assemblyMode);
  if (assemblyMode) {
    buildAssemblyOrder();
    setAssemblyIndex(0);
    setAssemblyPrevIndex(-1);
    updateAssemblyStep();
    setAutoRotate(false);
  } else {
    stopAssemblyPlay();
    // Restore all mesh opacities when exiting assembly mode
    meshMap.forEach(m => {
      m.material.emissive.setHex(0);
      m.material.emissiveIntensity = 0;
      m.material.transparent = false;
      m.material.opacity = 1;
      m.material.needsUpdate = true;
    });
    edgeLineMap.forEach(e => {
      e.visible = true;
      e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      e.material.opacity = 0.55;
      e.material.needsUpdate = true;
    });
    setNeedsRender(true);
  }
}

function buildAssemblyOrder() {
  const sortedKeys = Array.from(moduleMap.keys()).sort();
  const order = [];
  sortedKeys.forEach(key => {
    const moduleParts = moduleMap.get(key);
    if (moduleParts) moduleParts.forEach(part => order.push(part));
  });
  if (order.length === 0) parts.forEach(p => order.push(p));
  setAssemblyOrder(order);
}

export function updateAssemblyStep() {
  if (assemblyOrder.length === 0) return;
  const currentPart = assemblyOrder[assemblyIndex];
  if (!currentPart) return;
  document.getElementById('assemblyStepLabel').textContent = 'Шаг ' + (assemblyIndex + 1) + '/' + assemblyOrder.length;
  const partLabel = currentPart.position ? currentPart.code + ' / ' + currentPart.position : currentPart.code;
  document.getElementById('assemblyInfo').textContent = partLabel + ' — ' + (currentPart.name || '—');

  // Only reset previous step (not all meshes — saves O(N) per step)
  if (assemblyPrevIndex >= 0 && assemblyPrevIndex !== assemblyIndex) {
    var prevPart = assemblyOrder[assemblyPrevIndex];
    if (prevPart) {
      var prevAsmMesh = meshMap.get(prevPart.id);
      var prevAsmEdge = edgeLineMap.get(prevPart.id);
      if (prevAsmMesh) {
        prevAsmMesh.material.emissive.setHex(0);
        prevAsmMesh.material.emissiveIntensity = 0;
        prevAsmMesh.material.transparent = true;
        prevAsmMesh.material.opacity = 0.15;
        prevAsmMesh.material.needsUpdate = true;
      }
      if (prevAsmEdge) {
        prevAsmEdge.visible = true;
        prevAsmEdge.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
        prevAsmEdge.material.opacity = 0.15;
        prevAsmEdge.material.transparent = true;
        prevAsmEdge.material.needsUpdate = true;
      }
    }
  } else if (assemblyPrevIndex === -1) {
    // First step — dim all meshes once
    meshMap.forEach(asmMesh => {
      asmMesh.material.emissive.setHex(0);
      asmMesh.material.emissiveIntensity = 0;
      asmMesh.material.transparent = true;
      asmMesh.material.opacity = 0.15;
      asmMesh.material.needsUpdate = true;
    });
    edgeLineMap.forEach(asmEdge => {
      asmEdge.visible = true;
      asmEdge.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      asmEdge.material.opacity = 0.15;
      asmEdge.material.transparent = true;
      asmEdge.material.needsUpdate = true;
    });
  }
  setAssemblyPrevIndex(assemblyIndex);

  const highlightMesh = meshMap.get(currentPart.id);
  const highlightEdge = edgeLineMap.get(currentPart.id);
  if (highlightMesh) {
    highlightMesh.material.emissive.setHex(0x00D4AA);
    highlightMesh.material.emissiveIntensity = 0.25;
    highlightMesh.material.transparent = false;
    highlightMesh.material.opacity = 1;
    highlightMesh.material.needsUpdate = true;
  }
  if (highlightEdge) {
    highlightEdge.visible = true;
    highlightEdge.material.color.setHex(0x00D4AA);
    highlightEdge.material.opacity = 0.8;
    highlightEdge.material.transparent = true;
    highlightEdge.material.needsUpdate = true;
  }
  if (_startSmoothZoom) _startSmoothZoom(currentPart.id);
  if (_updateSheet) _updateSheet(currentPart);
  if (_openSheet) _openSheet();
  if (_renderPartsListDeferred) _renderPartsListDeferred();
  if (_showToast) _showToast('🔧 Шаг ' + (assemblyIndex + 1) + '/' + assemblyOrder.length + ': ' + (currentPart.name || currentPart.code));
  setNeedsRender(true);
}

export function stopAssemblyPlay() {
  setAssemblyPlaying(false);
  if (assemblyTimer) clearInterval(assemblyTimer);
  setAssemblyTimer(null);
  document.getElementById('asmPlay').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}

export function toggleAssemblyPlay() {
  if (assemblyPlaying) {
    stopAssemblyPlay();
  } else {
    setAssemblyPlaying(true);
    document.getElementById('asmPlay').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    setAssemblyTimer(setInterval(() => {
      setAssemblyIndex((assemblyIndex + 1) % assemblyOrder.length);
      updateAssemblyStep();
    }, 1500));
  }
}
