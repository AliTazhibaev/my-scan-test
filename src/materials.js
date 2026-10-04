// ============================================================
// MATERIAL / TEXTURE SYSTEM (extracted from app.js)
// ============================================================

// Internal references set via init()
var _quality = 'high';
var _renderer = null;

/**
 * Initialize the materials module with device quality and renderer.
 * Must be called before using texture-loading functions.
 */
export function init(quality, r) {
  _quality = quality;
  _renderer = r;
}

// === WOOD TEXTURE GENERATOR ===
export const woodTextureCache = new Map();
// Seeded PRNG for deterministic wood grain per material name
function _seededRandom(seed) {
  var s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}
function _hashStr(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic color variation: shift hue/saturation/lightness based on full material name
// so "ЛДСП Серый" and "Серый кашемир" and "Алюминий" get different colors.
function _varyColor(result, fullName) {
  if (!fullName || !result || !result.color) return result;
  var hex = result.color;
  if (hex.charAt(0) !== '#' || hex.length < 7) return result;
  var h = _hashStr(fullName.toLowerCase());
  // Parse hex to RGB then HSL
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var hh = 0, ss = 0, ll = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  // Large shifts so different materials are clearly distinct:
  // hue ±45°, saturation ±25%, lightness ±15%
  // Lightness only: grays stay gray, woods stay brown, reds stay red.
  ll = Math.max(0.15, Math.min(0.9, ll + ((h % 17) - 8) / 100));
  // HSL back to RGB
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  var rr, gg, bb;
  if (ss === 0) { rr = gg = bb = ll; }
  else {
    var q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    var p = 2 * ll - q;
    rr = hue2rgb(p, q, hh + 1/3);
    gg = hue2rgb(p, q, hh);
    bb = hue2rgb(p, q, hh - 1/3);
  }
  var toHex = function(v) { var s = Math.round(v * 255).toString(16); return s.length < 2 ? '0' + s : s; };
  return { color: '#' + toHex(rr) + toHex(gg) + toHex(bb), smooth: result.smooth };
}

// Shift lightness in alternating +/- steps (collision resolution that keeps the colour family)
function _shiftLightness(hex, tries) {
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var hh = 0, ss = 0, ll = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  var step = Math.ceil(tries / 2) * 0.035 * (tries % 2 ? 1 : -1);
  return _hslToHex(hh, ss, Math.max(0.12, Math.min(0.92, ll + step)));
}

// Shift a hex color's hue by `deg` degrees (for collision resolution)
function _shiftHex(hex, deg) {
  var r = parseInt(hex.substring(1, 3), 16) / 255;
  var g = parseInt(hex.substring(3, 5), 16) / 255;
  var b = parseInt(hex.substring(5, 7), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var hh = 0, ss = 0, ll = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    ss = ll > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hh = ((b - r) / d + 2) / 6;
    else hh = ((r - g) / d + 4) / 6;
  }
  return _hslToHex(((hh * 360 + deg) % 360 + 360) % 360 / 360, ss, ll);
}

function _hslToHex(h, s, l) {
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  var toHex = function(v) { var sv = Math.round(v * 255).toString(16); return sv.length < 2 ? '0' + sv : sv; };
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export function createWoodTexture(baseColor, scale, materialName) {
  var key = (materialName || baseColor) + '_' + (scale || 1);
  if (woodTextureCache.has(key)) return woodTextureCache.get(key);
  var rng = _seededRandom(_hashStr(key));
  var size = _quality === 'low' ? 64 : _quality === 'medium' ? 128 : 256;
  const canvas2d = document.createElement('canvas');
  canvas2d.width = size; canvas2d.height = size;
  const ctx = canvas2d.getContext('2d');
  // Base fill
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  // Parse base color for variation
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.fillStyle = baseColor; tmp.fillRect(0, 0, 1, 1);
  const rgb = tmp.getImageData(0, 0, 1, 1).data;
  const r0 = rgb[0], g0 = rgb[1], b0 = rgb[2];
  // Wood grain lines
  ctx.globalAlpha = 0.25;
  var grainCount = _quality === 'low' ? 20 : _quality === 'medium' ? 40 : 80;
  for (let i = 0; i < grainCount; i++) {
    const y = rng() * size;
    const w = 1 + rng() * 3;
    const drift = rng() * 20 - 10;
    ctx.strokeStyle = i % 3 === 0
      ? `rgba(${Math.max(0, r0 - 30)},${Math.max(0, g0 - 30)},${Math.max(0, b0 - 20)},0.5)`
      : `rgba(${Math.min(255, r0 + 20)},${Math.min(255, g0 + 15)},${Math.min(255, b0 + 10)},0.3)`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x < size; x += 20) {
      ctx.lineTo(x, y + Math.sin(x * 0.02 + drift) * 6);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Noise overlay
  const imgData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const n = (rng() - 0.5) * 8;
    imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + n));
    imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + n));
    imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + n));
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas2d);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(scale || 1, scale || 1);
  woodTextureCache.set(key, tex);
  return tex;
}

// ============================================================
// MATERIAL CLASSIFICATION & REALISTIC TEXTURE SYSTEM
// ============================================================
// Текстуры Egger размещаются в /textures/ рядом с приложением.
// Для разработки можно использовать абсолютный URL.
export var TEX_BASE = '/textures';

// Egger код → путь к текстуре + метаданные
// Категории: 'wood' (древесный), 'solid' (одноцветный), 'material' (камень/металл/бетон)
export var EGGER_DB = {};

// --- Древесные декоры (H-серия) — только 4 основных ---
(function() {
  var wood = {
    'H1145': 'H1145 ST10 Дуб Бардолино натуральный.jpg',
    'H1180': 'H1180 ST37 Дуб Галифакс натуральный.jpg',
    'H3131': 'H3131 ST12 Дуб Давос натуральный.jpg',
    'H3700': 'H3700 ST10 Орех Пацифик натуральный.jpg'
  };
  for (var k in wood) EGGER_DB[k] = { file: wood[k], cat: 'wood', dir: 'Древесные декоры' };
})();

// --- Камень/металл/бетон (F-серия) — только 4 основных ---
(function() {
  var mats = {
    'F028': 'F028 ST89 Гранит Верчелли антрацит.jpg',
    'F029': 'F029 ST89 Гранит Верчелли серый.jpg',
    'F160': 'F160 ST9 Мрамор Мармара.jpg',
    'F186': 'F186 ST9 Бетон Чикаго светло-серый.jpg'
  };
  for (var k in mats) EGGER_DB[k] = { file: mats[k], cat: 'material', dir: 'Материалы' };
})();


// Ключевые слова для классификации неизвестных материалов
export var WOOD_KEYWORDS = [
  'дуб', ' oak', 'орех', 'walnut', 'nut', 'ясень', 'ash', 'бук', 'beech',
  'сосна', 'pine', 'берёза', 'birch', 'клён', 'maple', 'вишня', 'cherry',
  'каштан', 'chestnut', 'махагон', 'mahogany', 'венге', 'wenge', 'тик', 'teak',
  'лиственница', 'larch', 'клен', 'береза', 'груша', 'pear', 'липа', 'linden',
  'гикори', 'hickory', 'бамбук', 'bamboo', 'акация', 'acacia', 'пихта', 'fir',
  'вяз', 'elm', 'каселла', 'casella', 'ликольн', 'lincoln', 'сонома', 'sonoma',
  'макассар', 'macassar', 'канзас', 'kansas', 'бардолино', 'bardolino',
  'галифакс', 'halifax', 'сорано', 'sorano', 'аризона', 'arizona',
  'денвер', 'denver', 'кендал', 'kendal', 'гладстоун', 'gladstone',
  'небраска', 'nebraska', 'орлеанский', 'orleans', 'чарльстон', 'charleston',
  'винченца', 'vincenza', 'ланкастер', 'lancaster', 'корбридж', 'corbridge',
  'pacифик', 'pacific', 'карини', 'karini', 'дижон', 'dijon',
  'мардал', 'mandal', 'сахарный', 'sugar', 'кантри', 'country',
  'термо', 'thermo', 'натуральн', 'natural', 'белен', 'bleach',
  'горизонт', 'horizontal', 'крем', 'cream', 'табак', 'tobacco',
  'трюфель', 'truffle', 'коньяк', 'cognac', 'промасл', 'oiled',
  'сепия', 'sepia', 'мокка', 'mocha', 'песочн', 'sand',
  'фанера', 'plywood', 'шпон', 'veneer', 'древес', 'wood', 'timber',
  'каштанов', 'коричн', 'brown'
];
export var SOLID_KEYWORDS = [
  'белый', 'white', 'альпийск', 'полярн', 'арктик', 'фарфор', 'снежн',
  'крем', 'cream', 'ivory', 'молоч', 'ванил', 'vanilla',
  'чёрный', 'черный', 'black', 'обсидиан',
  'серый', 'grey', 'gray', 'графит', 'graphite', 'антрацит', 'anthracite',
  'пепельн', 'дымчат', 'светло.сер', 'тёмно.сер',
  'бежев', 'beige', 'песочн', 'sand', 'кэмел', 'камел', 'латт', 'капучин', 'шампань',
  'красн', 'red', 'коралл', 'бордо', 'марoon', 'розов', 'pink', 'пурпурн',
  'синий', 'blue', 'голуб', 'бирюз', 'индиго',
  'зелён', 'green', 'мятн', 'оливк', 'хвоин', 'изумруд',
  'жёлт', 'yellow', 'оранж', 'orange', 'золот', 'gold', 'горчичн',
  'фиолет', 'violet', 'purple', 'лаванд', 'слив',
  'слоновая кость', 'ивory',
  'пыльн', 'dusty', 'кашемир', 'cashmere', 'шёлк', 'silk', 'льнян', 'linen',
  'альпийск', 'alpine', 'полярн', 'polar', 'арктик', 'arctic',
  'базов', 'basic', 'премиум', 'premium', 'платинов', 'platinum',
  // ЛДСП / МДФ / HDF / пластик — гладкие, без текстуры
  'ЛДСП', 'лдсп', 'ЛМДФ', 'лмдф', 'ДСП', 'дсп', 'мдф', 'МДФ',
  'HDF', 'hdf', 'ХДФ', 'хдф', 'ламинир', 'laminate', 'пластик', 'plastic',
  'акрил', 'acrylic'
];
export var MATERIAL_KEYWORDS = [
  'гранит', 'granite', 'мрамор', 'marble', 'камень', 'stone',
  'бетон', 'concrete', 'керамик', 'ceramic', 'терраццо', 'terrazzo',
  'шифер', 'slate', 'алюминий', 'aluminum', 'металлик', 'metallic',
  'металл', 'metal', 'хром', 'chrome', 'медь', 'copper', 'золото', 'gold',
  'серебр', 'silver', 'бронза', 'bronze', 'железо', 'iron', 'сталь', 'steel',
  'кожа', 'leather', 'лён', 'linen', 'ткань', 'fabric', 'текстиль', 'textile',
  'бетон', ' concrete', 'ферро', 'ferro'
];

// Cache for loaded textures
export var _realTexCache = new Map();

// Маппинг кодов других производителей → Egger текстуры
// G-серия (Ультрадекор/Sonae), K-серия, Kronospan и др.
export var MANUFACTURER_MAP = {
  'G711': 'H1180',   // Ультрадекор (Дуб Тенор, серо-коричневый) → Дуб Галифакс
  'G715': 'H1180',   // Ультрадекор → Дуб Галифакс натуральный
  'K370': 'H1180',   // Kronospan → Дуб Галифакс натуральный
  'K526': 'H1145',   // Kronospan → Дуб Бардолино
};

// Wood species / decor names. A laminated board (ЛДСП/МДФ) named after a wood decor must look like
// wood, not like a flat color. Deliberately NOT generic words such as 'коричн'/'brown'/'natural' —
// "ЛДСП Красно-коричневый" is a plain color.
export var WOOD_SPECIES_RE = /дуб|(^|[^a-z])oak|орех|walnut|ясень|(^|[^a-z])ash([^a-z]|$)|(^|[^а-яё])бук|beech|сосн|(^|[^a-z])pine|берёз|берез|birch|клён|клен|maple|вишн|cherry|махагон|mahogany|венге|wenge|teak|лиственниц|larch|каселл|casella|тенор|tenor|сонома|sonoma|бардолино|bardolino|галифакс|halifax|давос|davos|пацифик|pacific|шпон|veneer|фанер|plywood/i;

// Pick the real decor photo that is closest in tone/species to the name.
export function pickWoodTexture(name) {
  var n = String(name || '').toLowerCase();
  var code = 'H1145'; // Дуб Бардолино — light natural oak
  if (/орех|walnut|венге|wenge|махагон|mahogany|тёмн|темн|dark|корич|корчнев|brown|каселл|casella|табак|мокка|вишн|cherry/.test(n)) code = 'H3700'; // Орех Пацифик — dark
  else if (/сер|grey|gray|галифакс|halifax|тенор|tenor|g711|g715|k370|graphite|графит/.test(n)) code = 'H1180';   // Дуб Галифакс — grey oak
  else if (/давос|davos|мёд|honey|тёпл|warm|сонома|sonoma|золот/.test(n)) code = 'H3131';                         // Дуб Давос — warm oak
  var e = EGGER_DB[code];
  return TEX_BASE + '/' + e.dir + '/' + encodeURIComponent(e.file);
}

// Классификация материала по имени
export function classifyMaterial(matName) {
  if (!matName) return { cat: 'unknown', tex: null, color: '#8a7f76', smooth: false };
  var name = matName.toLowerCase();
  var ci = guessColorInfo(name);

  // 1. Egger код (H1386, W1000, F028, U702...)
  var eggerMatch = name.match(/\b([HWFU]\d{3,4})\b/i);
  if (eggerMatch) {
    var code = eggerMatch[1].toUpperCase();
    if (EGGER_DB[code]) {
      var entry = EGGER_DB[code];
      var url = entry.file ? (TEX_BASE + '/' + entry.dir + '/' + encodeURIComponent(entry.file)) : null;
      return { cat: entry.cat, tex: url, color: entry.color || ci.color, smooth: false };
    }
  }

  // 1b. Коды других производителей (G711, K358, etc.)
  var mfgMatch = name.match(/\b([GK]\d{3})\b/i);
  if (mfgMatch) {
    var mfgCode = mfgMatch[1].toUpperCase();
    if (MANUFACTURER_MAP[mfgCode] && EGGER_DB[MANUFACTURER_MAP[mfgCode]]) {
      var mappedEntry = EGGER_DB[MANUFACTURER_MAP[mfgCode]];
      var mappedUrl = mappedEntry.file ? (TEX_BASE + '/' + mappedEntry.dir + '/' + encodeURIComponent(mappedEntry.file)) : null;
      return { cat: mappedEntry.cat, tex: mappedUrl, color: mappedEntry.color || ci.color, smooth: false };
    }
  }

  // 2a. Wood decor name (даже у ЛДСП/МДФ) → реальное фото дерева подходящего тона
  if (WOOD_SPECIES_RE.test(name)) {
    return { cat: 'wood', tex: pickWoodTexture(name), color: ci.color, smooth: false, photo: true };
  }
  // 2. Ключевые слова — SOLID (ЛДСП/МДФ без названия декора — гладкие)
  for (var s = 0; s < SOLID_KEYWORDS.length; s++) {
    if (name.indexOf(SOLID_KEYWORDS[s]) >= 0) {
      return { cat: 'solid', tex: null, color: ci.color, smooth: ci.smooth };
    }
  }
  for (var w = 0; w < WOOD_KEYWORDS.length; w++) {
    if (name.indexOf(WOOD_KEYWORDS[w]) >= 0) {
      return { cat: 'wood', tex: findBestWoodTexture(name), color: ci.color, smooth: false };
    }
  }
  for (var m = 0; m < MATERIAL_KEYWORDS.length; m++) {
    if (name.indexOf(MATERIAL_KEYWORDS[m]) >= 0) {
      return { cat: 'material', tex: null, color: ci.color, smooth: false };
    }
  }
  return { cat: 'unknown', tex: null, color: ci.color, smooth: ci.smooth };
}

// Поиск наиболее подходящей древесной текстуры по имени
export function findBestWoodTexture(name) {
  var bestCode = null, bestScore = 0;
  for (var code in EGGER_DB) {
    var e = EGGER_DB[code];
    if (e.cat !== 'wood' || !e.file) continue;
    var fname = e.file.toLowerCase();
    var score = 0;
    // Проверяем совпадение слов из имени материала с именем файла
    var words = name.split(/[\s,;.]+/);
    for (var w = 0; w < words.length; w++) {
      if (words[w].length >= 3 && fname.indexOf(words[w]) >= 0) score++;
    }
    if (score > bestScore) { bestScore = score; bestCode = code; }
  }
  if (bestCode && EGGER_DB[bestCode]) {
    var e = EGGER_DB[bestCode];
    return TEX_BASE + '/' + e.dir + '/' + encodeURIComponent(e.file);
  }
  return null;
}

// Cache for guessColorInfo results
var _guessColorCache = new Map();
// GUARANTEE: each unique material name gets a unique color — NEVER collide
var _usedColors = new Map(); // hex → first materialName that claimed it
var _nameColorMap = new Map(); // materialName → final assigned hex

// Guess color from material name (fallback)
// Returns { color, smooth } — smooth=true means no texture needed (ЛДСП, МДФ, HDF, белый, серый...)
export function guessColorInfo(name) {
  if (!name) return { color: '#8a7f76', smooth: false };
  if (_nameColorMap.has(name)) return { color: _nameColorMap.get(name), smooth: _guessColorCache.get(name).smooth };
  var result = _guessColorInfoCompute(name);
  // Apply hash-based variation so same-keyword materials differ
  result = _varyColor(result, name);
  var hex = result.color;
  // GUARANTEE UNIQUE: if this hex is already taken by a DIFFERENT material, shift until free
  var tries = 0;
  while (_usedColors.has(hex) && _usedColors.get(hex) !== name && tries < 200) {
    tries++;
    hex = _shiftLightness(hex, tries);
  }
  // Fallback: direct hue from name hash
  if (_usedColors.has(hex) && _usedColors.get(hex) !== name) {
    var h2 = _hashStr(name.toLowerCase());
    hex = _hslToHex((h2 % 360) / 360, 0.35 + (h2 % 40) / 100, 0.3 + (h2 % 35) / 100);
    var t2 = 0;
    while (_usedColors.has(hex) && _usedColors.get(hex) !== name && t2 < 360) {
      t2++;
      hex = _hslToHex(((h2 + t2 * 7) % 360) / 360, 0.35 + (h2 % 40) / 100, 0.3 + (h2 % 35) / 100);
    }
  }
  _usedColors.set(hex, name);
  _nameColorMap.set(name, hex);
  result.color = hex;
  _guessColorCache.set(name, result);
  return result;
}
function _guessColorInfoCompute(name) {
  var n = name.toLowerCase();

  // === ТКАНИ / ФАКТУРЫ — проверяем ПЕРЕД общими цветами ===
  // (чтобы "Кашемир серый" ≠ "ЛДСП серый")
  if (n.match(/кашемир|cashmere/)) return { color: '#a09898', smooth: true };
  if (n.match(/шёлк|silk/)) return { color: '#d8d0c0', smooth: true };
  if (n.match(/бархат|velvet/)) return { color: '#604850', smooth: true };
  if (n.match(/фетр|felt/)) return { color: '#888080', smooth: true };
  if (n.match(/джинс|denim/)) return { color: '#4060a0', smooth: true };
  if (n.match(/замш|suede/)) return { color: '#a08060', smooth: true };
  if (n.match(/кожа|leather/)) return { color: '#704828', smooth: true };
  if (n.match(/лён|linen|ткань|fabric|текстиль|textile/)) return { color: '#c0b8a0', smooth: true };
  if (n.match(/пробк|cork/)) return { color: '#b09870', smooth: true };

  // === МЕТАЛЛЫ — проверяем ПЕРЕД общими серыми ===
  if (n.match(/алюмин|aluminum/)) return { color: '#c0c8d0', smooth: true };
  if (n.match(/хром|chrome/)) return { color: '#d0d8e0', smooth: true };
  if (n.match(/нержаве|stainless|сталь|steel/)) return { color: '#a8b0b8', smooth: true };
  if (n.match(/медь|copper/)) return { color: '#b07040', smooth: true };
  if (n.match(/бронз|bronze/)) return { color: '#8a7040', smooth: true };
  if (n.match(/серебр|silver/)) return { color: '#c0c0c8', smooth: true };
  if (n.match(/никел|nickel/)) return { color: '#a0a0a8', smooth: true };
  if (n.match(/металл|metal|железо|iron/)) return { color: '#b0b0b8', smooth: true };
  if (n.match(/золот|gold/)) return { color: '#c8a030', smooth: true };

  // === ГЛАДКИЕ ПОВЕРХНОСТИ (ЛДСП, МДФ, HDF, пластик) — только цвет, без текстуры ===
  // Белые
  if (n.match(/белый|white|альпийск|alpine|полярн|polar|арктик|arctic|фарфор|porcelain|снежн|snow/)) return { color: '#f0ece4', smooth: true };
  if (n.match(/крем|cream| ivory|слонов|vanilla|ванил/)) return { color: '#f0e8d8', smooth: true };
  if (n.match(/молоч|milk|молочн/)) return { color: '#f5f0e8', smooth: true };

  // Серые
  if (n.match(/серый|grey|gray/)) return { color: '#9a9a9e', smooth: true };
  if (n.match(/графит|graphite/)) return { color: '#5a5a60', smooth: true };
  if (n.match(/антрацит|anthracite/)) return { color: '#3a3a40', smooth: true };
  if (n.match(/пепельн|ash grey|дымчат|smoky/)) return { color: '#a8a0a0', smooth: true };
  if (n.match(/светло.сер|light grey|седой/)) return { color: '#c0bfc4', smooth: true };
  if (n.match(/тёмно.сер|dark grey/)) return { color: '#6a6a70', smooth: true };
  if (n.match(/холодн.*сер|cool grey/)) return { color: '#8890a0', smooth: true };
  if (n.match(/тёпл.*сер|warm grey/)) return { color: '#a09890', smooth: true };

  // Чёрные
  if (n.match(/чёрный|черный|black|обсидиан|obsidian/)) return { color: '#2a2a30', smooth: true };

  // Бежевые / песочные
  if (n.match(/бежев|beige/)) return { color: '#c8b898', smooth: true };
  if (n.match(/песочн|sand|песок/)) return { color: '#d4c4a0', smooth: true };
  if (n.match(/кэмел|camel|камел/)) return { color: '#c0a070', smooth: true };
  if (n.match(/латт|latte|молоч.*кофе/)) return { color: '#d0c0a0', smooth: true };
  if (n.match(/капучин|cappuccino/)) return { color: '#b8a080', smooth: true };
  if (n.match(/шампань|champagne/)) return { color: '#f0e0c0', smooth: true };

  // Красные / розовые
  if (n.match(/красн|red/)) return { color: '#a83030', smooth: true };
  if (n.match(/коралл|coral/)) return { color: '#d86850', smooth: true };
  if (n.match(/бордо|burgundy|марoon/)) return { color: '#681828', smooth: true };
  if (n.match(/розов|pink/)) return { color: '#d8a0a8', smooth: true };
  if (n.match(/пурпурн|purple/)) return { color: '#783068', smooth: true };

  // Синие / голубые
  if (n.match(/синий|blue/) && !n.match(/голуб/)) return { color: '#304880', smooth: true };
  if (n.match(/голуб|sky blue|небесн/)) return { color: '#70a8d0', smooth: true };
  if (n.match(/бирюз|turquoise|teal/)) return { color: '#40a0a0', smooth: true };
  if (n.match(/индиго|indigo/)) return { color: '#303080', smooth: true };

  // Зелёные
  if (n.match(/зелён|green/)) return { color: '#306838', smooth: true };
  if (n.match(/мятн|mint/)) return { color: '#80c8b0', smooth: true };
  if (n.match(/оливк|olive/)) return { color: '#687830', smooth: true };
  if (n.match(/хвоин|pine green|изумруд|emerald/)) return { color: '#206848', smooth: true };

  // Жёлтые / оранжевые
  if (n.match(/жёлт|yellow/)) return { color: '#d8c040', smooth: true };
  if (n.match(/оранж|orange/)) return { color: '#d87830', smooth: true };
  if (n.match(/золот|gold/)) return { color: '#c8a030', smooth: true };
  if (n.match(/горчичн|mustard/)) return { color: '#c0a020', smooth: true };

  // Фиолетовые
  if (n.match(/фиолет|violet|purple/)) return { color: '#683888', smooth: true };
  if (n.match(/лаванд|lavender/)) return { color: '#a088c0', smooth: true };
  if (n.match(/слив|plum/)) return { color: '#684868', smooth: true };

  // Металлик / алюминий / хром
  if (n.match(/металл|metal|алюмин|aluminum|хром|chrome|нержаве|stainless|сталь|steel|железо|iron/)) return { color: '#b0b0b8', smooth: true };
  if (n.match(/медь|copper/)) return { color: '#b07040', smooth: true };
  if (n.match(/бронз|bronze/)) return { color: '#8a7040', smooth: true };
  if (n.match(/серебр|silver/)) return { color: '#c0c0c8', smooth: true };
  if (n.match(/никел|nickel/)) return { color: '#a0a0a8', smooth: true };

  // Кожа / ткань
  if (n.match(/кожа|leather/)) return { color: '#704828', smooth: true };
  if (n.match(/лён|linen|ткань|fabric|текстиль|textile/)) return { color: '#c0b8a0', smooth: true };

  // Бетон / камень (материалы — не гладкие, но текстуры обычно нет)
  if (n.match(/бетон|concrete/)) return { color: '#a09890', smooth: false };
  if (n.match(/гранит|granite/)) return { color: '#707068', smooth: false };
  if (n.match(/мрамор|marble/)) return { color: '#e0dcd8', smooth: false };
  if (n.match(/камень|stone/)) return { color: '#908880', smooth: false };
  if (n.match(/керамик|ceramic/)) return { color: '#d8d0c0', smooth: false };
  if (n.match(/терраццо|terrazzo/)) return { color: '#b0a898', smooth: false };
  if (n.match(/шифер|slate/)) return { color: '#606068', smooth: false };
  if (n.match(/ферро|ferro|ржавч|rust/)) return { color: '#8a5830', smooth: false };

  // === ЛДСП / МДФ / HDF — гладкие, но с правильным цветом ===
  // Проверяем цветовые ключевые слова ПЕРЕД generic "лдсп"
  if (n.match(/белый|white|альпийск|полярн|арктик/)) { /* fall through to white check above */ }
  else if (n.match(/чёрный|черный|black/)) { /* fall through */ }
  else if (n.match(/серый|grey|gray|графит|антрацит/)) { /* fall through */ }
  else if (!WOOD_SPECIES_RE.test(n) && n.match(/ЛДСП|лдсп|ЛМДФ|лмдф|ДСП|дсп|мдф|МДФ|HDF|hdf|ламинир|laminate|пластик|plastic|акрил|acrylic/)) {
    // Unknown decor: neutral warm light gray (was a hash-random hue -> candy green/blue/orange).
    // Distinct materials are told apart by lightness in guessColorInfo, not by hue.
    return { color: '#cbc4b8', smooth: true };
  }

  // === ДРЕВЕСНЫЕ — с текстурой ===
  if (n.match(/венге|wenge/)) return { color: '#3b2a1c', smooth: false };
  if (n.match(/белен|bleach/)) return { color: '#d8c8a8', smooth: false };
  if (n.match(/табак|tobacco/)) return { color: '#6a4828', smooth: false };
  if (n.match(/орех|walnut|nut/)) return { color: '#6a5040', smooth: false };
  if (n.match(/дуб|oak/)) return { color: '#b09070', smooth: false };
  if (n.match(/ясень|ash/)) return { color: '#c8b898', smooth: false };
  if (n.match(/бук|beech/)) return { color: '#d0b888', smooth: false };
  if (n.match(/сосна|pine/)) return { color: '#d8c8a0', smooth: false };
  if (n.match(/берёза|береза|birch/)) return { color: '#e0d0b0', smooth: false };
  if (n.match(/клён|клен|maple/)) return { color: '#e0c898', smooth: false };
  if (n.match(/вишня|cherry/)) return { color: '#905040', smooth: false };
  if (n.match(/махагон|mahogany/)) return { color: '#603020', smooth: false };
  if (n.match(/груша|pear/)) return { color: '#c8a080', smooth: false };
  if (n.match(/лиственниц|larch/)) return { color: '#c0a070', smooth: false };
  if (n.match(/гикори|hickory/)) return { color: '#8a6840', smooth: false };
  if (n.match(/акация|acacia/)) return { color: '#c8a060', smooth: false };
  if (n.match(/пихта|fir/)) return { color: '#d8c8a0', smooth: false };
  if (n.match(/вяз|elm/)) return { color: '#a08060', smooth: false };
  if (n.match(/бамбук|bamboo/)) return { color: '#d0c080', smooth: false };
  if (n.match(/каштан|chestnut/)) return { color: '#785838', smooth: false };
  if (n.match(/липа|linden/)) return { color: '#e0d0b8', smooth: false };
  if (n.match(/термо|thermo/)) return { color: '#4a3828', smooth: false };
  if (n.match(/макассар|macassar/)) return { color: '#2a1a10', smooth: false };
  if (n.match(/шпон|veneer|фанера|plywood/)) return { color: '#b09070', smooth: false };
  if (n.match(/натуральн|natural/)) return { color: '#c0a878', smooth: false };
  if (n.match(/светл|light/)) return { color: '#d8c8a8', smooth: false };
  if (n.match(/тёмн|dark|темн/)) return { color: '#5a4030', smooth: false };
  if (n.match(/серо.бежев|grey.beige/)) return { color: '#b0a898', smooth: false };
  if (n.match(/коричн|brown/)) return { color: '#7a5830', smooth: false };
  if (n.match(/мокка|mocha/)) return { color: '#6a5840', smooth: false };
  if (n.match(/трюфель|truffle/)) return { color: '#5a4838', smooth: false };
  if (n.match(/коньяк|cognac/)) return { color: '#906030', smooth: false };
  if (n.match(/сепия|sepia/)) return { color: '#7a6048', smooth: false };
  if (n.match(/пробк|cork/)) return { color: '#b09870', smooth: false };

  return { color: '#8a7f76', smooth: false };
}

// Backwards-compatible wrapper
export function guessColor(name) {
  return guessColorInfo(name).color;
}

// Загрузка реальной текстуры (с кешем)
export function loadRealTexture(url) {
  return new Promise(function(resolve) {
    if (_realTexCache.has(url)) { resolve(_realTexCache.get(url)); return; }
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      var tex = new THREE.Texture(img);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding; // photos are sRGB; output is sRGB
      tex.needsUpdate = true;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      if (_renderer) tex.anisotropy = Math.min(8, _renderer.capabilities.getMaxAnisotropy());
      _realTexCache.set(url, tex);
      resolve(tex);
    };
    img.onerror = function() {
      _realTexCache.set(url, null);
      resolve(null);
    };
    img.src = url;
  });
}

// sRGB→Linear color fix (DetalQR pattern).
// When renderer.outputEncoding = sRGBEncoding, material colors must be in linear space.
// A HEX value from БАЗИС is sRGB — converting it to linear prevents 20-30% darkening.
export function sRGBFix(mat) {
  if (!mat || !mat.color) return mat;
  if (mat.color.convertSRGBToLinear) mat.color.convertSRGBToLinear();
  return mat;
}

// Bake UV coordinates into geometry based on real texture dimensions (DetalQR pattern).
// This ensures textures tile correctly at real-world scale instead of stretching.
//   tw/th  — texture tile size in mm (e.g., 1000×1000 for Egger decor)
//   swap   — if true, rotate UV 90° (grain direction along Y instead of X)
// Positions are in METERS, so tw/th must be 1 / (tile size in meters) — passing 1/1000 (a mm value)
// stretched the photo ~1000x and every decor collapsed into a flat colour.
// swap: grain (the photo's V axis) runs along local X instead of local Y.
// seed: per-part offset so neighbouring panels of one decor don't show identical grain.
export function bakeUV(geo, tw, th, swap, isBox, seed) {
  if (!geo || !geo.attributes || !geo.attributes.position) return;
  var uv = geo.attributes.uv;
  if (!uv) return;
  var pos = geo.attributes.position;
  var s = (typeof seed === 'number') ? seed : 0;
  var ou = (s * 0.6180339887) % 1, ov = (s * 0.3819660113) % 1;
  // DetalQR pattern: iterate ALL vertices using position XY → UV.
  // Side faces get UV from their edge positions — texture continues naturally.
  for (var i = 0; i < uv.count; i++) {
    var x = pos.getX(i), y = pos.getY(i);
    if (swap) { uv.setXY(i, y * tw + ou, x * th + ov); }
    else      { uv.setXY(i, x * tw + ou, y * th + ov); }
  }
  uv.needsUpdate = true;
}

// Создание материала для детали (с учётом типа и направления текстуры)
export function createPartMaterial(partData, geoType) {
  var matName = partData.material || '';
  var info = classifyMaterial(matName);
  var baseColor = info.color;
  var isSmooth = info.smooth || false;

  // All panels transparent:true for xray, fully opaque by default
  // polygonOffset prevents z-fighting between adjacent panels of the same color
  var matProps = {
    color: baseColor,
    roughness: isSmooth ? 0.85 : (info.cat === 'material' ? 0.6 : 0.78),
    metalness: isSmooth ? 0 : (info.cat === 'material' ? 0.15 : 0.02),
    emissive: new THREE.Color(0),
    emissiveIntensity: 0,
    transparent: true,
    opacity: 1,
    depthWrite: true,
    // Faces must NOT be pulled toward the camera (was factor/units -1): coplanar edge lines then
    // lost the depth test against their own face and outlines/grooves vanished at oblique angles.
    polygonOffset: true,
    polygonOffsetFactor: 0,
    polygonOffsetUnits: 1
  };

  // Гладкие — сразу возвращаем без текстуры
  if (isSmooth && !info.tex) {
    var smoothMat = new THREE.MeshStandardMaterial(matProps);
    // Was skipped on this early return: colors were read as linear and blew out to white.
    sRGBFix(smoothMat);
    smoothMat.envMapIntensity = 0.1;
    return smoothMat;
  }

  // Grain direction is handled in the UVs (bakeUV): TextureOrientation 2 = along W (local Y),
  // otherwise along L (local X). The photo's own grain runs along its V axis. Here we only add the
  // optional manual rotation from the texture editor.
  var grainAngle = 0;

  // Apply rot from texture editor (adds to grain angle)
  var texSettings = partData.texSettings;
  if (texSettings && texSettings.rot) {
    grainAngle += texSettings.rot * Math.PI / 180;
  }

  // Если есть реальная текстура — загружаем асинхронно
  var mat = new THREE.MeshStandardMaterial(matProps);
  var applyTexRotation = function(tex) {
    if (grainAngle !== 0) {
      tex.rotation = grainAngle;
      tex.center = new THREE.Vector2(0.5, 0.5);
    }
  };
  var applyTexSettings = function(tex) {
    if (!texSettings || !tex) return;
    // Tile size is fixed to the real photo size (see bakeUV); repeat/offset from the editor are not used.
    if (texSettings.angle) tex.rotation += texSettings.angle * Math.PI / 180;
    if (texSettings.mirror) tex.wrapS = THREE.MirroredRepeatWrapping;
  };

  if (info.tex) {
    // Сначала ставим процедурную текстуру как fallback
    if (info.cat === 'wood') {
      var wt = createWoodTexture(baseColor, 4, matName);
      applyTexRotation(wt);
      applyTexSettings(wt);
      mat.map = wt;
    }
    // Асинхронно загружаем реальную — обновляем САМ материал
    loadRealTexture(info.tex).then(function(realTex) {
      if (realTex) {
        // Per-material clone: rotation/wrap differ per part but the image is shared.
        var t = realTex.clone();
        t.needsUpdate = true;
        applyTexRotation(t);
        applyTexSettings(t);
        mat.map = t;
        // Photo is the colour: a tinted base colour would multiply and dirty it.
        mat.color.setRGB(1, 1, 1);
        mat.needsUpdate = true;
      }
    });
  } else if (info.cat === 'wood') {
    var pt = createWoodTexture(baseColor, 4, matName);
    applyTexRotation(pt);
    applyTexSettings(pt);
    mat.map = pt;
  }

  // Apply sRGB→linear color correction (DetalQR pattern)
  sRGBFix(mat);
  // Environment map intensity — control reflection strength per material type
  if (info.cat === 'material') mat.envMapIntensity = 0.35;
  else if (info.cat === 'wood') mat.envMapIntensity = 0.14;
  else mat.envMapIntensity = 0.1;
  return mat;
}
