// ============================================================
// UI RENDERING (extracted from app.js)
// ============================================================
import {
  parts, selectedId, setSelectedId, scannedSet, hiddenSet,
  idMode, moduleMap, fastenerData, isDarkTheme,
  meshMap, edgeLineMap, xrayActive, blockMode, csgEnabled,
  isolatedModule, needsRender, setNeedsRender,
  setIsolatedModule, setCsgEnabled,
  setXrayActive, setExplodeActive, setExplodeModuleKey,
  setAutoRotate, setBlockMode, setDimsVisible
} from './state.js';
import { getModuleKey, getModuleName, getModuleColor } from './app.js';
import { classifyMaterial } from './materials.js';

// Dependencies injected via initUI()
let _selectPart, _startSmoothZoom, _toggleVisibility, _isolateModule, _applyXray;
let _centerCamera, _exitIsolation, _animateExplodeTo;

export function initUI(deps) {
  _selectPart = deps.selectPart;
  _startSmoothZoom = deps.startSmoothZoom;
  _toggleVisibility = deps.toggleVisibility;
  _isolateModule = deps.isolateModule;
  _applyXray = deps.applyXray;
  _centerCamera = deps.centerCamera;
  _exitIsolation = deps.exitIsolation;
  _animateExplodeTo = deps.animateExplodeTo;
}

export function escapeHtml(str) {
  return (str || '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

export function showToast(message) {
  let toastEl = document.getElementById('customToast');
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'customToast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

export function openDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawerBackdrop').style.display = 'block';
}
export function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawerBackdrop').style.display = 'none';
}
export function openSheet() { document.getElementById('bottomSheet').classList.add('open'); }
export function closeSheet() {
  var bs = document.getElementById('bottomSheet');
  bs.classList.remove('open');
  bs.removeAttribute('data-state');
}

export function updateStats() {
  const total = parts.length;
  const scanned = scannedSet.size;
  const percent = total > 0 ? Math.round(scanned / total * 100) : 0;
  document.getElementById('totalCount').textContent = total;
  document.getElementById('scannedCount').textContent = scanned;
  document.getElementById('progressFill').style.width = percent + '%';
}

export function updateSummary() {
  if (parts.length === 0) {
    document.getElementById('materialSummary').style.display = 'none';
    return;
  }
  document.getElementById('materialSummary').style.display = 'block';
  const materialStats = {};
  let totalMass = 0;
  parts.forEach(part => {
    const matName = part.material || 'Неизвестно';
    if (!materialStats[matName]) materialStats[matName] = { count: 0, totalArea: 0 };
    materialStats[matName].count++;
    if (part.L && part.W) materialStats[matName].totalArea += part.L * part.W / 1000000;
    if (part.L && part.W && part.T) totalMass += part.L * part.W * part.T / 1000 * 6.5e-7;
  });
  let html = '<div class="summary-row"><span class="summary-label">Всего деталей:</span><span class="summary-val">' + parts.length + '</span></div>';
  html += '<div class="summary-row"><span class="summary-label">Модулей:</span><span class="summary-val">' + moduleMap.size + '</span></div>';
  html += '<div class="summary-row"><span class="summary-label">Собрано:</span><span class="summary-val" style="color:var(--success)">' + scannedSet.size + ' / ' + parts.length + '</span></div>';
  html += '<div class="summary-row"><span class="summary-label">Масса:</span><span class="summary-val">\u2248 ' + totalMass.toFixed(1) + ' кг</span></div>';
  html += '<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:4px">';
  Object.entries(materialStats).sort((a, b) => b[1].count - a[1].count).slice(0, 6).forEach(([mat, stats]) => {
    html += '<div class="summary-row"><span class="summary-label" style="font-size:8px">' + escapeHtml(mat.substring(0, 30)) + '</span><span class="summary-val" style="font-size:9px">' + stats.count + ' шт</span></div>';
  });
  html += '</div>';
  document.getElementById('summaryContent').innerHTML = html;
}

// === Parts List Rendering ===
let _renderPartsScheduled = false;
let _deferredPartsTimer = null;
var _expandedModules = null;

export function renderPartsList() {
  if (_renderPartsScheduled) return;
  _renderPartsScheduled = true;
  requestAnimationFrame(_doRenderPartsList);
}

export function renderPartsListDeferred() {
  if (_deferredPartsTimer) clearTimeout(_deferredPartsTimer);
  _deferredPartsTimer = setTimeout(renderPartsList, 80);
}

function _doRenderPartsList() {
  _renderPartsScheduled = false;
  const container = document.getElementById('partsList');
  if (!container) return;
  const searchVal = document.getElementById('searchInput')?.value.toLowerCase() || '';
  if (parts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11px">📁 Загрузите JSON файл для начала</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  if (searchVal) {
    var filteredParts = parts.filter(p => (p.name || '').toLowerCase().includes(searchVal) || (p.code || '').toLowerCase().includes(searchVal) || (p.position || '').toLowerCase().includes(searchVal));
    if (filteredParts.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:11px">🔍 Ничего не найдено</div>';
      return;
    }
    filteredParts.forEach(part => fragment.appendChild(createPartItem(part)));
    container.innerHTML = '';
    container.appendChild(fragment);
    return;
  }
  const sortedModules = Array.from(moduleMap.keys()).sort((a, b) => {
    if (a === 'HARDWARE') return 1;
    if (b === 'HARDWARE') return -1;
    const aPrefix = a.replace(/_\d+$/, '');
    const bPrefix = b.replace(/_\d+$/, '');
    if (aPrefix !== bPrefix) return aPrefix.localeCompare(bPrefix);
    return parseInt(a.match(/\d+$/)?.[0] || '0') - parseInt(b.match(/\d+$/)?.[0] || '0');
  });
  if (!_expandedModules) _expandedModules = new Set();
  sortedModules.forEach(moduleKey => {
    const moduleParts = moduleMap.get(moduleKey);
    if (!moduleParts) return;
    const displayName = (moduleParts[0] && moduleParts[0].groupName) ? moduleParts[0].groupName : getModuleName(moduleKey === 'HARDWARE' ? 'D-000' : moduleKey + '_00');
    const dotColor = moduleKey === 'HARDWARE' ? '#94a3b8' : getModuleColor(moduleKey + '_00');
    const scannedCount = moduleParts.filter(p => scannedSet.has(p.id)).length;
    const isExpanded = _expandedModules.has(moduleKey);
    const groupEl = document.createElement('div');
    groupEl.className = 'module-group';
    groupEl.innerHTML = '<div class="module-header" data-module="' + moduleKey + '">' +
      '<div class="module-dot" style="background:' + dotColor + '"></div>' +
      '<span class="module-name">' + escapeHtml(displayName) + '</span>' +
      '<span class="module-count">' + scannedCount + '/' + moduleParts.length + '</span>' +
      '<span class="module-arrow' + (isExpanded ? ' open' : '') + '">▶</span>' +
      '</div>' +
      '<div class="module-parts' + (isExpanded ? '' : ' collapsed') + '" data-module-parts="' + moduleKey + '"></div>';
    const headerEl = groupEl.querySelector('.module-header');
    var isolateBtn = document.createElement('button');
    isolateBtn.className = 'module-isolate-btn';
    isolateBtn.textContent = '\u2299';
    isolateBtn.title = 'Изолировать модуль';
    isolateBtn.addEventListener('click', function(e) { e.stopPropagation(); if (_isolateModule) _isolateModule(moduleKey); });
    var arrowEl = headerEl.querySelector('.module-arrow');
    if (arrowEl) headerEl.insertBefore(isolateBtn, arrowEl);
    const partsContainer = groupEl.querySelector('.module-parts');
    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('.module-isolate-btn')) return;
      const nowExpanded = !partsContainer.classList.contains('collapsed') ? false : true;
      partsContainer.classList.toggle('collapsed');
      headerEl.querySelector('.module-arrow').classList.toggle('open');
      if (nowExpanded && !partsContainer.hasChildNodes()) {
        const frag = document.createDocumentFragment();
        moduleParts.forEach(part => frag.appendChild(createPartItem(part)));
        partsContainer.appendChild(frag);
      }
      if (nowExpanded) _expandedModules.add(moduleKey);
      else _expandedModules.delete(moduleKey);
    });
    var pressTimer = null;
    headerEl.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { if (_isolateModule) _isolateModule(moduleKey); }, 500); }, { passive: true });
    headerEl.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
    headerEl.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    if (isExpanded) moduleParts.forEach(part => partsContainer.appendChild(createPartItem(part)));
    fragment.appendChild(groupEl);
  });
  container.innerHTML = '';
  container.appendChild(fragment);
}

function getColor(materialStr, partData) {
  if (partData?.color) return partData.color;
  var info = classifyMaterial(materialStr);
  return info.color;
}

function createPartItem(part) {
  const isHidden = hiddenSet.has(part.id);
  const isScanned = scannedSet.has(part.id);
  const itemEl = document.createElement('div');
  itemEl.className = 'part-item ' + (selectedId === part.id ? 'active' : '');
  itemEl.style.opacity = isHidden ? '0.4' : '1';
  const displayId = idMode === 'position' ? part.position || part.code || '—' : part.code || '—';
  const moduleColor = getModuleColor(idMode === 'position' ? part.position || part.code || '' : part.code || '');
  itemEl.innerHTML = '<div class="part-swatch" style="background:' + getColor(part.material, part) + ';border-left:3px solid ' + moduleColor + '"></div>' +
    '<div class="part-info"><div class="part-name">' + escapeHtml(part.name || '—') + '</div>' +
    '<div class="part-code">' + escapeHtml(displayId) + '</div>' +
    '<div class="part-dims">' + (part.gab ? part.gab.w + '×' + part.gab.h + '×' + part.gab.d + ' мм' : '') + '</div></div>' +
    '<div class="check ' + (isScanned ? 'done' : '') + '">' + (isScanned ? '✅' : '○') + '</div>';
  itemEl.addEventListener('click', () => { if (_selectPart) _selectPart(part.id); });
  return itemEl;
}

export function isMobileSheet() { return window.innerWidth <= 600; }
