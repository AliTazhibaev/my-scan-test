// ============================================================
// ПОДСЧЁТЫ ДЛЯ «СТАТИСТИКИ»: фурнитура, пазы, отверстия, материалы.
// Считается так же, как «Мини смета» в Базисе: фурнитура по названию,
// пазы в метрах, отверстия по «диаметр × глубина».
// ============================================================

// «Шкант 8х35\r403» -> «Шкант 8х35» (после перевода строки Базис пишет артикул)
export function cleanName(name) {
  var s = String(name == null ? '' : name).split(/\r|\n/)[0].trim();
  return s || 'Без названия';
}

function num(v) { return Math.round(v * 10) / 10; }

export function fastenerSummary(fasteners) {
  var map = new Map(), total = 0;
  (fasteners || []).forEach(function (f) {
    var n = cleanName(f.name || f.type);
    var c = f.count || 1;
    map.set(n, (map.get(n) || 0) + c);
    total += c;
  });
  var list = Array.from(map, function (e) { return { name: e[0], count: e[1] }; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  return { total: total, list: list };
}

// Длина и ширина паза по контуру. Для прямоугольника (в т. ч. повёрнутого)
// из периметра P и площади A: L = (P/2 + √((P/2)² − 4A)) / 2, W = A / L.
function polySize(pts) {
  var per = 0, area = 0;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    area += a[0] * b[1] - b[0] * a[1];
  }
  area = Math.abs(area) / 2;
  var h = per / 2, d = h * h - 4 * area;
  var len = d > 0 ? (h + Math.sqrt(d)) / 2 : h / 2;
  return { len: len, width: len > 0 ? area / len : 0 };
}

export function grooveSummary(parts) {
  var grooves = new Map(), cups = new Map();
  var totalLen = 0, grooveCount = 0, cupCount = 0;
  (parts || []).forEach(function (p) {
    (p.pockets || []).forEach(function (pk) {
      var depth = num(pk.depth || 0);
      if (pk.t === 'circle') {
        var key = 'Выборка Ø' + num((pk.r || 0) * 2) + ' × ' + depth + ' мм';
        cups.set(key, (cups.get(key) || 0) + 1);
        cupCount++;
        return;
      }
      if (!pk.pts || pk.pts.length < 3) return;
      var sz = polySize(pk.pts);
      var len = pk.len > 0 ? pk.len : sz.len;
      var name = pk.name ? cleanName(pk.name) : 'Паз ' + Math.round(sz.width) + ' × ' + depth + ' мм';
      var g = grooves.get(name) || { name: name, count: 0, len: 0 };
      g.count++; g.len += len;
      grooves.set(name, g);
      totalLen += len; grooveCount++;
    });
  });
  return {
    totalLen: totalLen, count: grooveCount,
    list: Array.from(grooves.values()).sort(function (a, b) { return b.len - a.len; }),
    cupCount: cupCount,
    cups: Array.from(cups, function (e) { return { name: e[0], count: e[1] }; }).sort(function (a, b) { return b.count - a.count; })
  };
}

export function holeSummary(holes) {
  var map = new Map(), total = 0;
  (holes || []).forEach(function (h) {
    var key = num(h.diameter || 0) + (h.depth ? ' × ' + num(h.depth) : '');
    map.set(key, (map.get(key) || 0) + 1);
    total++;
  });
  return {
    total: total,
    list: Array.from(map, function (e) { return { name: e[0], count: e[1] }; })
      .sort(function (a, b) { return b.count - a.count; })
  };
}

export function materialSummary(parts) {
  var map = new Map();
  (parts || []).forEach(function (p) {
    var n = cleanName(p.material || 'Неизвестно');
    var m = map.get(n) || { name: n, count: 0, area: 0 };
    m.count++;
    if (p.L && p.W) m.area += p.L * p.W / 1e6;
    map.set(n, m);
  });
  return Array.from(map.values()).sort(function (a, b) { return b.area - a.area || b.count - a.count; });
}

// Масса как в «Мини смете» Базиса: ЛДСП 750 кг/м³, МДФ/ХДФ 900, стекло 2500.
export function densityOf(material) {
  var m = String(material || '').toLowerCase();
  if (/стекло|зеркал/.test(m)) return 2500;
  if (/мдф|хдф/.test(m)) return 900;
  return 750;
}
export function massKg(parts) {
  var kg = 0;
  (parts || []).forEach(function (p) {
    if (p.L && p.W && p.T) kg += (p.L * p.W * p.T / 1e9) * densityOf(p.material);
  });
  return kg;
}
