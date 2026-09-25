// ============================================================
// EVENT WIRING (extracted from app.js)
// ============================================================
import {
  selectedId, setSelectedId, idMode, setIdMode,
  autoRotate, setAutoRotate, isSmoothZoom, setIsSmoothZoom,
  assemblyOrder, assemblyIndex, setAssemblyIndex,
  hiddenSet, scannedSet, blockMode, setBlockMode,
  assemblyMode
} from './state.js';
import { renderPartsList, showToast, closeDrawer, closeSheet, openDrawer } from './ui.js';
import { startSmoothZoom } from './camera.js';
import { toggleAssembly, toggleAssemblyPlay, updateAssemblyStep } from './assembly.js';

export function initEvents(deps) {
  const {
    toggleTheme, toggleVisibility, showAllParts, toggleXray, toggleExplode,
    toggleCSGVisibility, toggleDims, resetProgress, showStats, printSpecification,
    selectPart, buildModuleMap, centerCamera, handleFileLoad
  } = deps;

  // === Toolbar buttons ===
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('menuBtn').addEventListener('click', openDrawer);
  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);
  document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
  document.getElementById('closeSheetBtn').addEventListener('click', closeSheet);
  // Expand collapsed bottom sheet on preview tap (mobile)
  var sheetPreview = document.getElementById('sheetPreview');
  if (sheetPreview) {
    sheetPreview.addEventListener('click', () => {
      var bottomSheet = document.getElementById('bottomSheet');
      if (bottomSheet.getAttribute('data-state') === 'collapsed') {
        bottomSheet.removeAttribute('data-state');
      }
    });
  }
  document.getElementById('hideBtn').addEventListener('click', () => {
    if (selectedId !== null) toggleVisibility(selectedId);
  });
  document.getElementById('showAllBtn').addEventListener('click', showAllParts);
  document.getElementById('rotateBtn').addEventListener('click', () => { setAutoRotate(!autoRotate); });
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    setIsSmoothZoom(false);
    setAutoRotate(false);
    centerCamera();
    showToast('🎯 Вид сброшен');
  });
  document.getElementById('focusBtn').addEventListener('click', () => {
    if (selectedId !== null) startSmoothZoom(selectedId);
    else showToast('Сначала выберите деталь');
  });
  document.getElementById('xrayBtn').addEventListener('click', toggleXray);
  document.getElementById('explodeBtn').addEventListener('click', toggleExplode);
  document.getElementById('assembleBtn').addEventListener('click', toggleAssembly);
  document.getElementById('resetProgressBtn').addEventListener('click', resetProgress);
  document.getElementById('printBtn').addEventListener('click', printSpecification);
  document.getElementById('statsBtn').addEventListener('click', showStats);
  document.getElementById('csgBtn').addEventListener('click', toggleCSGVisibility);
  document.getElementById('dimsBtn').addEventListener('click', toggleDims);
  document.getElementById('statsModal').addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });
  document.getElementById('searchInput').addEventListener('input', renderPartsList);

  // === ID Mode Toggle ===
  document.querySelectorAll('.id-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setIdMode(btn.dataset.mode);
      localStorage.setItem('aivoIdMode', idMode);
      document.querySelectorAll('.id-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildModuleMap();
      renderPartsList();
    });
  });
  document.querySelector('.id-mode-btn[data-mode="' + idMode + '"]')?.classList.add('active');

  // === Assembly navigation ===
  document.getElementById('asmPrev').addEventListener('click', () => {
    if (assemblyOrder.length === 0) return;
    setAssemblyIndex((assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length);
    updateAssemblyStep();
  });
  document.getElementById('asmNext').addEventListener('click', () => {
    if (assemblyOrder.length === 0) return;
    setAssemblyIndex((assemblyIndex + 1) % assemblyOrder.length);
    updateAssemblyStep();
  });
  document.getElementById('asmPlay').addEventListener('click', toggleAssemblyPlay);
  document.getElementById('asmClose').addEventListener('click', toggleAssembly);

  // === Block Mode ===
  var blockModeBtnEl = document.getElementById('blockModeBtn');
  if (blockModeBtnEl) blockModeBtnEl.addEventListener('click', () => {
    setBlockMode(!blockMode);
    blockModeBtnEl.classList.toggle('active', blockMode);
    showToast(blockMode ? 'Режим блоков: ВКЛ' : 'Режим блоков: ВЫКЛ');
  });

  // === File Upload ===
  document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    handleFileLoad(file);
    e.target.value = '';
  });

  // === Drag-and-Drop File Upload ===
  var dropOverlay = document.getElementById('dropOverlay');
  var dragCounter = 0;
  document.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    if (dropOverlay) dropOverlay.style.display = 'flex';
  });
  document.addEventListener('dragleave', e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      if (dropOverlay) dropOverlay.style.display = 'none';
    }
  });
  document.addEventListener('dragover', e => { e.preventDefault(); });
  document.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    if (dropOverlay) dropOverlay.style.display = 'none';
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
      var file = files[0];
      if (!file.name.endsWith('.json')) {
        showToast('❌ Только JSON файлы поддерживаются');
        return;
      }
      handleFileLoad(file);
    }
  });

  // === Keyboard Shortcuts ===
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case 'Escape':
        closeDrawer(); closeSheet();
        document.getElementById('scannerModal').classList.add('hidden');
        document.getElementById('statsModal').classList.add('hidden');
        document.getElementById('onboardingModal').classList.add('hidden');
        break;
      case 'r': case 'R':
        if (!e.ctrlKey && !e.metaKey) { setIsSmoothZoom(false); setAutoRotate(false); centerCamera(); showToast('🎯 Вид сброшен'); }
        break;
      case 'x': case 'X': if (!e.ctrlKey && !e.metaKey) toggleXray(); break;
      case 'e': case 'E': if (!e.ctrlKey && !e.metaKey) toggleExplode(); break;
      case 'f': case 'F':
        if (!e.ctrlKey && !e.metaKey) {
          if (selectedId !== null) startSmoothZoom(selectedId);
          else showToast('Сначала выберите деталь');
        }
        break;
      case 'd': case 'D': if (!e.ctrlKey && !e.metaKey) toggleDims(); break;
      case 'ArrowLeft':
        if (assemblyMode && assemblyOrder.length > 0) {
          e.preventDefault();
          setAssemblyIndex((assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length);
          updateAssemblyStep();
        }
        break;
      case 'ArrowRight':
        if (assemblyMode && assemblyOrder.length > 0) {
          e.preventDefault();
          setAssemblyIndex((assemblyIndex + 1) % assemblyOrder.length);
          updateAssemblyStep();
        }
        break;
      case ' ':
        if (assemblyMode) { e.preventDefault(); toggleAssemblyPlay(); }
        break;
    }
  });
}
