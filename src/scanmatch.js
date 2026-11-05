// ============================================================
// ПОИСК ДЕТАЛИ ПО QR / ВВЕДЁННОМУ КОДУ
// - одинаковые детали (один и тот же код у нескольких штук): берём
//   следующую ещё не отмеченную, а не каждый раз первую;
// - код сравнивается без учёта регистра, пробелов/дефисов/точек,
//   русских букв-двойников (А/A, С/C...) и лишних нулей (02_0005 = 02_005);
// - если в QR записан длинный текст, ищем в нём код детали целиком.
// findPartByScan(parts, scanned, text, idMode) ->
//   { part, copies, copiesDone, allDone } или null
// ============================================================

var LOOKALIKE = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'Ё': 'E'
};

export function normCode(value) {
  if (value === undefined || value === null) return '';
  var s = String(value).trim().toUpperCase();
  s = s.replace(/[АВЕКМНОРСТУХЁ]/g, function (ch) { return LOOKALIKE[ch]; });
  s = s.replace(/[\s\-–—./\\:;,|]+/g, '_').replace(/[^0-9A-ZА-Я_]/g, '');
  return s.replace(/_+/g, '_').replace(/^_|_$/g, '');
}

// Тот же код, но без ведущих нулей в числах: GOST_02_0005 -> GOST_2_5
function looseCode(norm) {
  return norm.split('_').map(function (t) { return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t; }).join('_');
}

function keyOf(part, field) {
  return normCode(part[field]);
}

function pick(list, scanned) {
  var free = list.filter(function (p) { return !scanned.has(p.id); });
  return {
    all: list,
    part: free.length ? free[0] : list[0],
    copies: list.length,
    copiesDone: list.length - free.length + (free.length ? 1 : 0),
    allDone: free.length === 0
  };
}

function byField(parts, field, text) {
  var want = normCode(text);
  if (!want) return [];
  var exact = parts.filter(function (p) { return keyOf(p, field) === want; });
  if (exact.length) return exact;
  var loose = looseCode(want);
  var near = parts.filter(function (p) { var k = keyOf(p, field); return k && looseCode(k) === loose; });
  if (near.length) return near;
  // Длинный текст в QR: ищем код детали как отдельное «слово» внутри него.
  var hay = '_' + want + '_';
  var best = [], bestLen = 0;
  parts.forEach(function (p) {
    var k = keyOf(p, field);
    if (k.length < 4 || k.length < bestLen || hay.indexOf('_' + k + '_') < 0) return;
    if (k.length > bestLen) { best = [p]; bestLen = k.length; }
    else if (k.length === bestLen && keyOf(best[0], field) === k) best.push(p);
  });
  return best;
}

export function findPartByScan(parts, scanned, text, idMode) {
  if (!parts || !parts.length) return null;
  var main = idMode === 'position' ? 'position' : 'code';
  var other = main === 'position' ? 'code' : 'position';
  var list = byField(parts, main, text);
  // Сканируют другой код, чем выбран в настройках: пробуем обозначение
  // (позиции вида «1», «2» повторяются в каждом модуле — их не пробуем).
  if (!list.length && other === 'code') list = byField(parts, 'code', text);
  if (!list.length) return null;
  return pick(list, scanned);
}
