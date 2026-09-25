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
  'G711': 'H1145',   // Ультрадекор → Дуб Бардолино натуральный
  'G715': 'H1180',   // Ультрадекор → Дуб Галифакс натуральный
  'K370': 'H1180',   // Kronospan → Дуб Галифакс натуральный
  'K526': 'H1145',   // Kronospan → Дуб Бардолино
};

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

  // 2. Ключевые слова — SOLID FIRST (ЛДСП/МДФ — гладкие, без текстуры, даже если в имени "дуб")
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

// Guess color from material name (fallback)
// Returns { color, smooth } — smooth=true means no texture needed (ЛДСП, МДФ, HDF, белый, серый...)
export function guessColorInfo(name) {
  if (!name) return { color: '#8a7f76', smooth: false };
  var n = name.toLowerCase();

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
  else if (n.match(/ЛДСП|лдсп|ЛМДФ|лмдф|ДСП|дсп|мдф|МДФ|HDF|hdf|ламинир|laminate|пластик|plastic|акрил|acrylic/)) {
    // Генерируем уникальный цвет на основе хеша имени
    var hash = 0;
    for (var hi = 0; hi < n.length; hi++) hash = ((hash << 5) - hash + n.charCodeAt(hi)) | 0;
    var hue = Math.abs(hash) % 360;
    var sat = 15 + (Math.abs(hash >> 8) % 25); // 15-40%
    var lit = 45 + (Math.abs(hash >> 16) % 25); // 45-70%
    return { color: 'hsl(' + hue + ',' + sat + '%,' + lit + '%)', smooth: true };
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

// Создание материала для детали (с учётом типа и направления текстуры)
export function createPartMaterial(partData) {
  var matName = partData.material || '';
  var info = classifyMaterial(matName);
  var baseColor = info.color;
  var isSmooth = info.smooth || false;

  // Для гладких материалов (ЛДСП, МДФ, HDF, белый, серый, пластик) — без текстуры
  var matProps = {
    color: baseColor,
    roughness: isSmooth ? 0.85 : (info.cat === 'material' ? 0.6 : 0.78),
    metalness: isSmooth ? 0 : (info.cat === 'material' ? 0.15 : 0.02),
    emissive: new THREE.Color(0),
    emissiveIntensity: 0
  };

  // Гладкие — сразу возвращаем без текстуры
  if (isSmooth && !info.tex) {
    return new THREE.MeshStandardMaterial(matProps);
  }

  // EGGER текстуры: H1145 и аналоги имеют горизонтальные волокна (U-ось = shape X = L панели).
  // ExtrudeGeometry UV: U → shape X (=L), V → shape Y (=W).
  // Без поворота волокна идут по X (=L). Поворот 90° смещает волокна на Y (=W).
  // Правило: текстура идёт по длинной стороне панели.
  //   L > W → волокна уже по L (длинная) → поворот НЕ нужен
  //   W > L → нужно сместить волокна на W (длинная) → поворот 90°
  //   grain=1 → по X (L) → не поворачиваем
  //   grain=2 → по Y (W) → поворачиваем на 90°
  var grainAngle = 0;
  var grain = partData.grain || 0;
  // ExtrudeGeometry UV: U → shape X (=L), V → shape Y (=W).
  // Egger texture images have grain running vertically (V direction).
  // Grain should follow the LONGER side of the panel.
  //   W >= L → grain already along V (=W) → no rotation
  //   L > W  → need to rotate 90° to shift grain from V(=W) to U(=L, long side)
  // grain=0: auto-detect by dimensions
  // grain=1: force along L (U) — rotate90°
  // grain=2: force along W (V) — no rotation
  if (grain === 1) {
    grainAngle = Math.PI / 2;
  } else if (grain === 0) {
    if ((partData.L || 0) > (partData.W || 0)) {
      grainAngle = Math.PI / 2;
    }
  }

  // Если есть реальная текстура — загружаем асинхронно
  var mat = new THREE.MeshStandardMaterial(matProps);
  var applyTexRotation = function(tex) {
    if (grainAngle !== 0) {
      tex.rotation = grainAngle;
      tex.center = new THREE.Vector2(0.5, 0.5);
    }
  };

  if (info.tex) {
    // Сначала ставим процедурную текстуру как fallback
    if (info.cat === 'wood') {
      var wt = createWoodTexture(baseColor, 4, matName);
      applyTexRotation(wt);
      mat.map = wt;
    }
    // Асинхронно загружаем реальную — обновляем САМ материал
    loadRealTexture(info.tex).then(function(realTex) {
      if (realTex) {
        applyTexRotation(realTex);
        mat.map = realTex;
        mat.needsUpdate = true;
      }
    });
  } else if (info.cat === 'wood') {
    var pt = createWoodTexture(baseColor, 4, matName);
    applyTexRotation(pt);
    mat.map = pt;
  }

  return mat;
}
