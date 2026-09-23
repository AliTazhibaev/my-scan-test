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
export function createWoodTexture(baseColor, scale) {
  const key = baseColor + '_' + (scale || 1);
  if (woodTextureCache.has(key)) return woodTextureCache.get(key);
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
  // Wood grain lines — more visible (0.25 alpha instead of 0.08)
  ctx.globalAlpha = 0.25;
  var grainCount = _quality === 'low' ? 20 : _quality === 'medium' ? 40 : 80;
  for (let i = 0; i < grainCount; i++) {
    const y = Math.random() * size;
    const w = 1 + Math.random() * 3;
    const drift = Math.random() * 20 - 10;
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
    const n = (Math.random() - 0.5) * 8;
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
  'ЛДСП', 'лдсп', 'ЛМДФ', 'лмдф', 'ДСП', 'дсп', 'мдф', 'МДФ',
  'фанера', 'plywood', 'шпон', 'veneer', 'древес', 'wood', 'timber',
  'каштанов', 'коричн', 'brown'
];
export var SOLID_KEYWORDS = [
  'белый', 'white', 'чёрный', 'черный', 'black', 'серый', 'grey', 'gray',
  'бежевый', 'beige', 'кремовый', 'cream', 'крем', 'слоновая кость', 'ivory',
  'графит', 'graphite', 'антрацит', 'anthracite', 'перламутр', 'pearl',
  'пыльн', 'dusty', 'кашемир', 'cashmere', 'шёлк', 'silk', 'льнян', 'linen',
  'альпийск', 'alpine', 'полярн', 'polar', 'арктик', 'arctic',
  'базов', 'basic', 'премиум', 'premium', 'платинов', 'platinum',
  'красный', 'red', 'синий', 'blue', 'голубой', 'light blue', 'зелёный', 'green',
  'жёлтый', 'yellow', 'оранжевый', 'orange', 'розовый', 'pink',
  'фиолетов', 'violet', 'purple', 'бордов', 'burgundy'
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
  if (!matName) return { cat: 'unknown', tex: null, color: '#8a7f76' };
  var name = matName.toLowerCase();

  // 1. Egger код (H1386, W1000, F028, U702...)
  var eggerMatch = name.match(/\b([HWFU]\d{3,4})\b/i);
  if (eggerMatch) {
    var code = eggerMatch[1].toUpperCase();
    if (EGGER_DB[code]) {
      var entry = EGGER_DB[code];
      var url = entry.file ? (TEX_BASE + '/' + entry.dir + '/' + encodeURIComponent(entry.file)) : null;
      return { cat: entry.cat, tex: url, color: entry.color || guessColor(name) };
    }
  }

  // 1b. Коды других производителей (G711, K358, etc.)
  var mfgMatch = name.match(/\b([GK]\d{3})\b/i);
  if (mfgMatch) {
    var mfgCode = mfgMatch[1].toUpperCase();
    if (MANUFACTURER_MAP[mfgCode] && EGGER_DB[MANUFACTURER_MAP[mfgCode]]) {
      var mappedEntry = EGGER_DB[MANUFACTURER_MAP[mfgCode]];
      var mappedUrl = mappedEntry.file ? (TEX_BASE + '/' + mappedEntry.dir + '/' + encodeURIComponent(mappedEntry.file)) : null;
      return { cat: mappedEntry.cat, tex: mappedUrl, color: mappedEntry.color || guessColor(name) };
    }
  }

  // 2. Ключевые слова
  for (var w = 0; w < WOOD_KEYWORDS.length; w++) {
    if (name.indexOf(WOOD_KEYWORDS[w]) >= 0) {
      return { cat: 'wood', tex: findBestWoodTexture(name), color: guessColor(name) };
    }
  }
  for (var s = 0; s < SOLID_KEYWORDS.length; s++) {
    if (name.indexOf(SOLID_KEYWORDS[s]) >= 0) {
      return { cat: 'solid', tex: null, color: guessColor(name) };
    }
  }
  for (var m = 0; m < MATERIAL_KEYWORDS.length; m++) {
    if (name.indexOf(MATERIAL_KEYWORDS[m]) >= 0) {
      return { cat: 'material', tex: null, color: guessColor(name) };
    }
  }
  return { cat: 'unknown', tex: null, color: guessColor(name) };
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
export function guessColor(name) {
  if (!name) return '#8a7f76';
  var n = name.toLowerCase();
  if (n.match(/белый|white|cream|крем|ivory/)) return '#ece7e0';
  if (n.match(/чёрный|черный|black/)) return '#2a2a30';
  if (n.match(/серый|grey|gray|графит|graphite/)) return '#8a8a96';
  if (n.match(/венге|wenge/)) return '#3b2a1c';
  if (n.match(/белен|bleach|светл|light/)) return '#d8c8a8';
  if (n.match(/коричн|brown|табак|tobacco/)) return '#7a5830';
  if (n.match(/орех|walnut|nut/)) return '#6a5040';
  if (n.match(/дуб|oak/)) return '#b09070';
  if (n.match(/красн|red/)) return '#a83030';
  if (n.match(/синий|blue/)) return '#304880';
  if (n.match(/зелён|green/)) return '#306838';
  if (n.match(/жёлт|yellow/)) return '#d0b840';
  if (n.match(/оранж|orange/)) return '#c86828';
  if (n.match(/розов|pink/)) return '#c88088';
  if (n.match(/фиолет|violet|purple/)) return '#683888';
  if (n.match(/бежев|beige|песочн|sand/)) return '#c8b898';
  if (n.match(/антрацит|anthracite/)) return '#3a3a40';
  if (n.match(/бетон|concrete/)) return '#a09890';
  if (n.match(/металл|metal|алюмин|aluminum|хром|chrome/)) return '#b0b0b8';
  if (n.match(/кожа|leather/)) return '#704828';
  if (n.match(/ХДФ|HDF/)) return '#d8dce6';
  if (n.match(/МДФ|MDF|ламинир/)) return '#b0a080';
  return '#8a7f76';
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

  var matProps = {
    color: baseColor,
    roughness: info.cat === 'material' ? 0.6 : 0.78,
    metalness: info.cat === 'material' ? 0.15 : 0.02,
    emissive: new THREE.Color(0),
    emissiveIntensity: 0
  };

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
      var wt = createWoodTexture(baseColor, 4);
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
    var pt = createWoodTexture(baseColor, 4);
    applyTexRotation(pt);
    mat.map = pt;
  }

  return mat;
}
