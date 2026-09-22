

// === Wake Lock ===
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch(e) {}
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && parts.length > 0) requestWakeLock();
});
// === Main App Logic ===
const CONFIG = {
  FOG_DENSITY: 0.012,
  MAX_PIXEL_RATIO: 2,
  CAMERA_FOV: 45,
  TOUCH_ROTATION_SPEED: 0.008,
  MOUSE_ROTATION_SPEED: 0.005,
  ZOOM_MIN: 0.5,
  ZOOM_MAX: 80,
  EXPLODE_DURATION: 600,
  ASSEMBLY_INTERVAL: 1500,
  QR_SCAN_INTERVAL: 200,
  TOAST_DURATION: 2000,
  MATERIAL_DENSITY: 6.5e-7,
  AUTO_ROTATE_SPEED: 0.0025,
  TAP_THRESHOLD: 5,
  PAN_THRESHOLD: 8,
  SCALE_FACTOR: 0.001,
};


// === Device Capability Detection ===
var deviceQuality = 'high'; // 'low', 'medium', 'high'
(function detectDevice() {
  var cores = navigator.hardwareConcurrency || 2;
  var mem = navigator.deviceMemory || 4;
  var pixels = screen.width * screen.height * (window.devicePixelRatio || 1);
  var ua = navigator.userAgent;
  var isMobile = /Android|iPhone|iPad/i.test(ua);

  if (cores <= 2 || mem <= 2) {
    deviceQuality = 'low';
  } else if (isMobile || cores <= 4 || mem <= 4 || pixels > 3000000) {
    deviceQuality = 'medium';
  }
})();
// === WOOD TEXTURE GENERATOR ===
const woodTextureCache = new Map();
function createWoodTexture(baseColor, scale) {
  const key = baseColor + '_' + (scale || 1);
  if (woodTextureCache.has(key)) return woodTextureCache.get(key);
  var size = deviceQuality === 'low' ? 64 : deviceQuality === 'medium' ? 128 : 256;
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
  var grainCount = deviceQuality === 'low' ? 20 : deviceQuality === 'medium' ? 40 : 80;
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
var TEX_BASE = '/textures';

// Egger код → путь к текстуре + метаданные
// Категории: 'wood' (древесный), 'solid' (одноцветный), 'material' (камень/металл/бетон)
var EGGER_DB = {};

// --- Древесные декоры (H-серия) ---
(function() {
  var wood = {
    'H110':  'H110 ST9 Сосна Силэнд.jpg',
    'H1101': 'H1101 ST12 Макассар мокка.jpg',
    'H1107': 'H1107 ST9 Металлик древесина антрацит.jpg',
    'H111':  'H111 ST12 Клён сердцевинный.jpg',
    'H1113': 'H1113 ST10 Дуб Канзас коричневый.jpg',
    'H1114': 'H1114 ST9 Орех Рибера.jpg',
    'H1115': 'H1115 ST12 Баменда серо-бежевый.jpg',
    'H1116': 'H1116 ST12 Баменда венге тёмный.jpg',
    'H1122': 'H1122 ST22 Древесина белая.jpg',
    'H1123': 'H1123 ST22 Древесина графит.jpg',
    'H1137': 'H1137 ST12 Дуб Сорано чёрно-коричневый.jpg',
    'H1145': 'H1145 ST10 Дуб Бардолино натуральный.jpg',
    'H1146': 'H1146 ST10 Дуб Бардолино серый.jpg',
    'H1150': 'H1150 ST10 Дуб Аризона серый.jpg',
    'H1151': 'H1151 ST10 Дуб Аризона коричневый.jpg',
    'H1176': 'H1176 ST37 Дуб Галифакс белый.jpg',
    'H1180': 'H1180 ST37 Дуб Галифакс натуральный.jpg',
    'H1181': 'H1181 ST37 Дуб Галифакс табак.jpg',
    'H1199': 'H1199 ST12 Дуб термо чёрно-коричневый.jpg',
    'H1210': 'H1210 ST33 Вяз Тоссини серо-бежевый.jpg',
    'H1212': 'H1212 ST33 Вяз Тоссини коричневый.jpg',
    'H1213': 'H1213 ST33 Вяз Тоссини натуральный.jpg',
    'H1250': 'H1250 ST36 Ясень Наварра.jpg',
    'H1277': 'H1277 ST9 Акация Лэйклэнд светлая.jpg',
    'H1298': 'H1298 ST22 Ясень Лион песочно-бежевый.jpg',
    'H1334': 'H1334 ST9 Дуб Сорано натуральный светлый.jpg',
    'H1369': 'ЛМДФ H1369 ST40 Дуб Каселла каштановый Egger.jpg',
    'H1377': 'H1377 ST36 Дуб Орлеанский песочно-бежевый.jpg',
    'H1379': 'H1379 ST36 Дуб Орлеанский коричневый.jpg',
    'H1385': 'Дуб Каселла натуральный H1385 ST40.png',
    'H1386': 'Дуб Каселла коричневый H1386.png',
    'H1387': 'H1387 ST10 Дуб Денвер графит.jpg',
    'H1399': 'H1399 ST10 Дуб Денвер трюфель.jpg',
    'H1400': 'H1400 ST36 Древесина Аттик.jpg',
    'H1401': 'H1401 ST22 Сосна Касцина.jpg',
    'H1424': 'H1424 ST22 Файнлайн крем.jpg',
    'H1444': 'H1444 ST9 Сосна Альпийская.jpg',
    'H1486': 'H1486 ST36 Сосна Пасадена.jpg',
    'H1487': 'H1487 ST22 Пихта Брамберг.jpg',
    'H151':  'H151 ST9 Древесина бронзовая.jpg',
    'H1511': 'H1511 ST15 Бук Бавария.jpg',
    'H1518': 'H1518 ST15 Бук натуральный.jpg',
    'H1582': 'H1582 ST15 Бук Эльмау.jpg',
    'H1615': 'H1615 ST9 Вишня Верона.jpg',
    'H1636': 'H1636 ST12 Вишня Локарно.jpg',
    'H1733': 'H1733 ST9 Берёза Майнау.jpg',
    'H1887': 'H1887 ST9 Клён Штарнберг натуральный.jpg',
    'H3001': 'H3001 ST15 Ясень Одесса.jpg',
    'H3006': 'H3006 ST22 Зебрано песочно-бежевый.jpg',
    'H3012': 'H3012 ST22 Кокоболо натуральный.jpg',
    'H3025': 'H3025 HG Макассар.jpg',
    'H3047': 'H3047 ST10 Борнео трюфель.jpg',
    'H3048': 'H3048 ST10 Борнео коричневый антик.jpg',
    'H3058': 'H3058 ST22 Венге Мали.jpg',
    'H3080': 'H3080 ST15 Махагон.jpg',
    'H3081': 'H3081 ST22 Сосна Гаванна чёрная.jpg',
    'H3090': 'H3090 ST22 Древесина Шорвуд.jpg',
    'H3113': 'H3113 ST15 Груша Линдау.jpg',
    'H3114': 'H3114 ST9 Груша Тирано.jpg',
    'H3131': 'H3131 ST12 Дуб Давос натуральный.jpg',
    'H3133': 'H3133 ST12 Дуб Давос трюфель.jpg',
    'H3154': 'H3154 ST36 Дуб Чарльстон тёмно-коричневый.jpg',
    'H3155': 'H3155 ST10 Дуб Чарльстон табак.jpg',
    'H3156': 'H3156 ST12 Дуб Корбридж серый.jpg',
    'H3157': 'H3157 ST12 Дуб Винченца.jpg',
    'H3170': 'H3170 ST12 Дуб Кендал натуральный.jpg',
    'H3171': 'H3171 ST12 Дуб Кендал промасленный.jpg',
    'H3303': 'H3303 ST10 Дуб Гамильтон натуральный.jpg',
    'H3309': 'H3309 ST28 Дуб Гладстоун песочный.jpg',
    'H3325': 'H3325 ST28 Дуб Гладстоун табак.jpg',
    'H3326': 'H3326 ST28 Дуб Гладстоун серо-бежевый.jpg',
    'H3331': 'H3331 ST10 Дуб Небраска натуральный.jpg',
    'H3332': 'H3332 ST10 Дуб Небраска серый.jpg',
    'H3335': 'H3335 ST28 Дуб Гладстоун белый.jpg',
    'H3342': 'H3342 ST28 Дуб Гладстоун сепия.jpg',
    'H3344': 'H3344 ST36 Дуб Файнлайн натуральный.jpg',
    'H3368': 'H3368 ST9 Дуб Ланкастер натуральный.jpg',
    'H3395': 'H3395 ST12 Дуб Корбридж натуральный.jpg',
    'H3398': 'H3398 ST12 Дуб Кендал коньяк.jpg',
    'H3403': 'H3403 ST38 Лиственница горная белая.jpg',
    'H3404': 'H3404 ST38 Лиственница горная коричневая.jpg',
    'H3406': 'H3406 ST38 Лиственница горная антрацит.jpg',
    'H3420': 'H3420 ST36 Сосна термо.jpg',
    'H3430': 'H3430 ST22 Сосна Аланд белая.jpg',
    'H3433': 'H3433 ST22 Сосна Аланд полярная.jpg',
    'H3450': 'H3450 ST22 Флитвуд белый.jpg',
    'H3451': 'H3451 ST22 Флитвуд шампань.jpg',
    'H3453': 'H3453 ST22 Флитвуд серая лава.jpg',
    'H3470': 'H3470 ST22 Пихта сучковатая натуральная.jpg',
    'H3700': 'H3700 ST10 Орех Пацифик натуральный.jpg',
    'H3702': 'H3702 ST10 Орех Пацифик табак.jpg',
    'H3704': 'H3704 ST15 Орех Аида табак.jpg',
    'H3710': 'H3710 ST9 Орех Карини натуральный.jpg',
    'H3711': 'H3711 ST9 Орех Карини табак.jpg',
    'H3730': 'H3730 ST10 Гикори натуральный.jpg',
    'H3732': 'H3732 ST10 Гикори коричневый.jpg',
    'H3734': 'H3734 ST9 Орех Дижон натуральный.jpg',
    'H3760': 'H3760 ST29 Вяз Капский белый.jpg',
    'H3766': 'H3766 ST29 Вяз Капский тёмно-коричневый.jpg',
    'H3773': 'H3773 ST9 Орех Карини белёный.jpg',
    'H3840': 'H3840 ST9 Клён Мандал натуральный.jpg',
    'H3860': 'H3860 ST9 Клён сахарный шампань.jpg',
    'H3991': 'H3991 ST10 Бук Кантри натуральный.jpg'
  };
  for (var k in wood) EGGER_DB[k] = { file: wood[k], cat: 'wood', dir: 'Древесные декоры' };
})();

// --- Одноцветные декори (U/W-серия) ---
(function() {
  var solid = {
    'W1000': '#f2f0eb', 'W1100': '#f5f3ee', 'W1200': '#f0ede8', 'W1300': '#f8f6f2',
    'W908': '#e8e4dc', 'W911': '#ede8df', 'W980': '#f0ece5',
    'U104': '#f0ece4', 'U107': '#e8d88c', 'U108': '#f0e0a0', 'U113': '#d8ccb4',
    'U114': '#e8d440', 'U131': '#d4d440', 'U140': '#d4a830', 'U146': '#c8a830',
    'U156': '#c8b898', 'U163': '#c49428', 'U200': '#c0b090', 'U201': '#a09888',
    'U204': '#a88060', 'U216': '#c0a878', 'U222': '#e0d8c0', 'U224': '#e8e4dc',
    'U310': '#d86830', 'U311': '#882828', 'U313': '#e0d0c8', 'U321': '#c02020',
    'U323': '#d82828', 'U328': '#c85050', 'U330': '#582848', 'U332': '#d87020',
    'U334': '#b88060', 'U337': '#c84878', 'U340': '#d88038', 'U350': '#c07028',
    'U353': '#c8a0a0', 'U363': '#d89898', 'U380': '#c83020', 'U390': '#881818',
    'U400': '#b098b8', 'U404': '#8860a0', 'U414': '#583870', 'U420': '#8868a0',
    'U430': '#7050a0', 'U500': '#80c0c8', 'U504': '#78a8b8', 'U507': '#88a0b8',
    'U515': '#6090c0', 'U522': '#70a8d0', 'U525': '#5088b8', 'U533': '#a0c8e0',
    'U540': '#4870a0', 'U550': '#305888', 'U560': '#203868', 'U570': '#182848',
    'U599': '#202850', 'U606': '#286030', 'U608': '#a0c878', 'U617': '#88a870',
    'U619': '#707838', 'U626': '#78b040', 'U630': '#90c840', 'U636': '#307058',
    'U646': '#508878', 'U650': '#306830', 'U655': '#208850', 'U660': '#286828',
    'U702': '#b0a898', 'U707': '#a09898', 'U708': '#c0b8b0', 'U717': '#908880',
    'U727': '#988878', 'U732': '#a09890', 'U741': '#706860', 'U748': '#685848',
    'U750': '#888078', 'U763': '#b0a8a8', 'U767': '#908880', 'U773': '#c8c0b8',
    'U775': '#d0c8c0', 'U788': '#d8d4d0', 'U795': '#907858', 'U807': '#785838',
    'U818': '#503828', 'U899': '#383030', 'U960': '#606060', 'U961': '#303030',
    'U963': '#505050', 'U989': '#382820', 'U999': '#1a1a1a'
  };
  for (var k in solid) {
    EGGER_DB[k] = { file: null, cat: 'solid', dir: null, color: solid[k] };
  }
  // Add file paths for solid colors that have images
  var solidFiles = {
    'W1000': 'W1000 ST9 Белый Премиум.jpg', 'W1100': 'W1100 ST9 Белый Альпийский.jpg',
    'W1200': 'W1200 ST9 Фарфор белый.jpg', 'W1300': 'W1300 ST9 Белый полярный.jpg',
    'W908': 'W908 ST2 Белый базовый.jpg', 'W911': 'W911 ST2 Белый кремовый.jpg',
    'W980': 'W980 ST2 Белый платиновый.jpg',
    'U702': 'U702 ST9 Кашемир серый.jpg', 'U708': 'U708 ST9 Светло-серый.jpg',
    'U732': 'U732 ST9 Серый пыльный.jpg', 'U763': 'U763 ST9 Серый перламутровый.jpg',
    'U788': 'U788 ST9 Арктика серый.jpg', 'U960': 'U960 ST9 Оникс серый.jpg',
    'U961': 'U961 ST2 Чёрный графит.jpg', 'U999': 'U999 ST12 Чёрный.jpg',
    'U104': 'U104 ST9 Алебастр белый.jpg', 'U113': 'U113 ST9 Коттон бежевый.jpg',
    'U200': 'U200 ST9 Бежевый.jpg', 'U201': 'U201 ST9 Серая галька.jpg',
    'U323': 'U323 ST9 Ярко-красный.jpg', 'U560': 'U560 ST9 Синяя глубина.jpg',
    'U606': 'U606 ST9 Зелёный лес.jpg', 'U818': 'U818 ST9 Тёмно-коричневый.jpg'
  };
  for (var sk in solidFiles) {
    if (EGGER_DB[sk]) EGGER_DB[sk].file = solidFiles[sk];
  }
})();

// --- Камень/металл/бетон (F-серия) ---
(function() {
  var mats = {
    'F028': 'F028 ST89 Гранит Верчелли антрацит.jpg',
    'F029': 'F029 ST89 Гранит Верчелли серый.jpg',
    'F041': 'F041 ST15 Камень Сонора белый.jpg',
    'F059': 'F059 ST89 Гранит Карнак серый.jpg',
    'F061': 'F061 ST89 Гранит Карнак коричневый.jpg',
    'F066': 'F066 ST76 Гранит Сульяна бежевый.jpg',
    'F067': 'F067 ST76 Гранит Сульяна серый.jpg',
    'F093': 'F093 ST15 Мрамор Чиполлино серый.jpg',
    'F094': 'F094 ST15 Мрамор Чиполлино чёрная медь.jpg',
    'F105': 'F105 ST15 Мрамор Торано.jpg',
    'F148': 'F148 ST82 Гранит мелкий коричневый.jpg',
    'F160': 'F160 ST9 Мрамор Мармара.jpg',
    'F166': 'F166 ST9 Мрамор Пелаго белый.jpg',
    'F186': 'F186 ST9 Бетон Чикаго светло-серый.jpg',
    'F187': 'F187 ST9 Бетон Чикаго тёмно-серый.jpg',
    'F221': 'F221 ST87 Керамика Тессина крем.jpg',
    'F222': 'F222 ST87 Керамика Тессина терра.jpg',
    'F236': 'F236 ST15 Террацо серый.jpg',
    'F238': 'F238 ST15 Террацо чёрный.jpg',
    'F256': 'F256 ST87 Шифер пёстрый.jpg',
    'F274': 'F274 ST9 Бетон светлый.jpg',
    'F275': 'F275 ST9 Бетон тёмный.jpg',
    'F283': 'F283 ST22 Бетон Бостон.jpg',
    'F300': 'F300 ST87 Ферро ржавчина.jpg',
    'F302': 'F302 ST87 Ферро бронза.jpg',
    'F303': 'F303 ST87 Ферро титан серый.jpg',
    'F310': 'F310 ST87 Керамика ржавчина.jpg',
    'F311': 'F311 ST87 Керамика антрацит.jpg',
    'F365': 'F365 ST16 Амарна золотой.jpg',
    'F371': 'F371 ST82 Гранит Галиция серо-бежевый.jpg',
    'F404': 'F404 ST76 Кожа коньяк.jpg',
    'F424': 'F424 ST10 Лён терра.jpg',
    'F425': 'F425 ST10 Лён бежевый.jpg',
    'F426': 'F426 ST10 Лён серый.jpg',
    'F433': 'F433 ST10 Лён антрацит.jpg',
    'F447': 'F447 ST2 Металлик серая лава.jpg',
    'F477': 'F477 ST9 Металлик серо-голубой.jpg',
    'F478': 'F478 ST9 Металлик кубанит серый.jpg',
    'F501': 'F501 ST2 Алюминий матированный.jpg',
    'F503': 'F503 ST2 Металлик антрацит.jpg',
    'F509': 'F509 ST2 Алюминий.jpg',
    'F547': 'F547 ST9 Металл блоки.jpg',
    'F549': 'F549 ST9 Металл кракелюр.jpg',
    'F570': 'F570 ST2 Металлик медь.jpg',
    'F571': 'F571 ST2 Металлик золото.jpg',
    'F633': 'F633 ST87 Металл винтаж серо-коричневый.jpg',
    'F638': 'F638 ST16 Хромикс серебро.jpg',
    'F641': 'F641 ST16 Хромикс антрацит.jpg',
    'F649': 'F649 ST16 Аргиллит белый.jpg',
    'F651': 'F651 ST16 Аргиллит серый.jpg',
    'F672': 'F672 ST16 Камень Калабрия золотой.jpg',
    'F673': 'F673 ST16 Камень Калабрия серый титан.jpg',
    'F784': 'F784 ST2 Медь матированная.jpg',
    'F870': 'F870 ST76 Шифер Леон.jpg'
  };
  for (var k in mats) EGGER_DB[k] = { file: mats[k], cat: 'material', dir: 'Материалы' };
})();

// Ключевые слова для классификации неизвестных материалов
var WOOD_KEYWORDS = [
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
  'каштанов', 'коричнев', 'brown'
];
var SOLID_KEYWORDS = [
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
var MATERIAL_KEYWORDS = [
  'гранит', 'granite', 'мрамор', 'marble', 'камень', 'stone',
  'бетон', 'concrete', 'керамик', 'ceramic', 'терраццо', 'terrazzo',
  'шифер', 'slate', 'алюминий', 'aluminum', 'металлик', 'metallic',
  'металл', 'metal', 'хром', 'chrome', 'медь', 'copper', 'золото', 'gold',
  'серебр', 'silver', 'бронза', 'bronze', 'железо', 'iron', 'сталь', 'steel',
  'кожа', 'leather', 'лён', 'linen', 'ткань', 'fabric', 'текстиль', 'textile',
  'бетон', ' concrete', 'ферро', 'ferro'
];

// Cache for loaded textures
var _realTexCache = new Map();

// Маппинг кодов других производителей → Egger текстуры
// G-серия (Ультрадекор/Sonae), K-серия, Kronospan и др.
var MANUFACTURER_MAP = {
  // Ультрадекор / Sonae — дуб
  'G711': 'H1145',   // Дуб Тенор → Дуб Бардолино натуральный
  'G712': 'H1146',   // → Дуб Бардолино серый
  'G713': 'H1151',   // → Дуб Аризона коричневый
  'G714': 'H1150',   // → Дуб Аризона серый
  'G715': 'H1180',   // → Дуб Галифакс натуральный
  'G716': 'H1181',   // → Дуб Галифакс табак
  'G717': 'H1176',   // → Дуб Галифакс белый
  'G718': 'H1334',   // → Дуб Сорано натуральный светлый
  'G719': 'H1385',   // → Дуб Каселла натуральный
  'G720': 'H1386',   // → Дуб Каселла коричневый
  'G721': 'H3303',   // → Дуб Гамильтон натуральный
  'G722': 'H3395',   // → Дуб Корбридж натуральный
  'G723': 'H3170',   // → Дуб Кендал натуральный
  'G724': 'H3157',   // → Дуб Винченца
  'G725': 'H3331',   // → Дуб Небраска натуральный
  // Kronospan
  'K358': 'H1385',   // Дуб Каселла натуральный
  'K359': 'H1386',   // Дуб Каселла коричневый
  'K370': 'H1180',   // Дуб Галифакс натуральный
  'K526': 'H1145',   // Дуб Бардолино
  // SWISS KRONO
  'K001': 'W1000',   // Белый
  'K002': 'U961',    // Чёрный графит
  'K003': 'U702',    // Кашемир серый
  // EGGER G-codes (sometimes exported without H prefix)
  'G071': 'H3326',   // Дуб Гладстоун серо-бежевый
  'G072': 'H3309',   // Дуб Гладстоун песочный
};

// Классификация материала по имени
function classifyMaterial(matName) {
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
function findBestWoodTexture(name) {
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
function guessColor(name) {
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
function loadRealTexture(url) {
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
      if (renderer) tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
function createPartMaterial(partData) {
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
  if (grain === 2) {
    grainAngle = Math.PI / 2;
  } else if (grain === 0) {
    if ((partData.W || 0) > (partData.L || 0)) {
      grainAngle = Math.PI / 2;
    }
  }
  // grain === 1 (по X/L) — волокна уже на U(X), поворот не нужен

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

// Pre-allocated temp vectors for explode animation (avoids GC pressure per frame)
const _tmpCenter = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpNewPos = new THREE.Vector3();
const _tmpDelta = new THREE.Vector3();

let parts = [];
let selectedId = null;
let scannedSet = new Set();
let hiddenSet = new Set();
let idMode = localStorage.getItem("aivoIdMode") || "designation";
let meshMap = new Map();
let edgeLineMap = new Map();
let xrayActive = false;
let isDarkTheme = true;
let explodeActive = false;
let explodeProgress = 0;
let originalPositions = new Map();
let moduleMap = new Map();
let assemblyMode = false;
let assemblyIndex = 0;
let assemblyPrevIndex = -1;
let assemblyOrder = [];
let assemblyPlaying = false;
let assemblyTimer = null;
let fastenerData = [];
let dimsData = [];
let dimGroup = null;
let dimsVisible = false;
let csgEnabled = true;
let fastenerMeshes = [];
let isolatedModule = null;
let blockMode = false;
let explodeModuleKey = null;
let wakeLock = null;
let needsRender = true;
let scene;
let camera;
let renderer;
let theta = 0.8;
let phi = 0.9;
let camDist = 3.5;
let targetPosition = new THREE.Vector3(0, 0.5, 0);
let isDragging = false;
let prevMouse = {
  x: 0,
  y: 0
};
let autoRotate = false;
let isSmoothZoom = false;
let zoomTarget = new THREE.Vector3();
let touchStartPos = null;
let isPinching = false;
let pinchStartDist = 0;
let pinchStartCamDist = 0;
let isPanning = false;
let panStartMid = null;
let panStartTarget = null;
let mouseStartPos = null;
let mouseMovedDistance = 0;
let isPanningMouse = false;
let panStartMouse = null;
const MODULE_COLORS = ["#00d4aa", "#ff6b6b", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#38bdf8", "#fb923c", "#34d399", "#e879f9", "#06b6d4", "#8b5cf6", "#ef4444", "#10b981", "#f59e0b", "#ec4899", "#14b8a6", "#84cc16", "#6366f1", "#f97316", "#22d3ee", "#a855f7", "#e11d48", "#059669", "#d97706", "#d946ef", "#0891b2", "#65a30d", "#4f46e5", "#ea580c"];
const colorCache = new Map();
let colorIdx = 0;
function getModulePrefix(partCode) {
  if (!partCode) {
    return "OTHER";
  }
  const matchResult = partCode.match(/^([A-Z]+\d*_\d+)/);
  if (matchResult) {
    return matchResult[1];
  }
  return "OTHER";
}
function getModuleKey(code) {
  const prefix = getModulePrefix(code);
  if (prefix === "OTHER") {
    return "OTHER";
  }
  if (prefix.startsWith("D-")) {
    return "HARDWARE";
  }
  const keyMatch = prefix.match(/^([A-Z]+\d*_\d+)/);
  if (keyMatch) {
    return keyMatch[1];
  }
  return prefix;
}
function getModuleColor(materialName) {
  const moduleKey = getModuleKey(materialName);
  if (moduleKey === "HARDWARE") {
    return "#94a3b8";
  }
  if (moduleKey === "OTHER") {
    return "#6b7280";
  }
  if (colorCache.has(moduleKey)) {
    return colorCache.get(moduleKey);
  }
  const assignedColor = MODULE_COLORS[colorIdx % MODULE_COLORS.length];
  colorIdx++;
  colorCache.set(moduleKey, assignedColor);
  return assignedColor;
}
function getModuleName(partCodeForName, groupName) {
  if (groupName) return groupName;
  const moduleKeyName = getModuleKey(partCodeForName);
  if (moduleKeyName === "HARDWARE") {
    return "Фурнитура";
  }
  if (moduleKeyName === "OTHER") {
    return "Прочее";
  }
  return moduleKeyName;
}
function initTheme() {
  isDarkTheme = localStorage.getItem("aivoTheme") !== "light";
  applyTheme();
}
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  localStorage.setItem("aivoTheme", isDarkTheme ? "dark" : "light");
  applyTheme();
}
function applyTheme() {
  if (isDarkTheme) {
    document.body.classList.remove("light-theme");
    document.getElementById("themeToggle").innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    if (scene) {
      scene.background.setHex(0x141416);
      edgeLineMap.forEach(e => { e.material.color.setHex(0x1a1a1a); });
      if (floor) floor.material.color.setHex(0x3a3a3e);
      if (wall) wall.material.color.setHex(0x444448);
    }
    if (scene) {
      scene.fog.color.setHex(0x141416);
    }
  } else {
    document.body.classList.add("light-theme");
    document.getElementById("themeToggle").innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    if (scene) {
      scene.background.setHex(0xf0f0f2);
      edgeLineMap.forEach(e => { e.material.color.setHex(0x888888); });
      if (floor) floor.material.color.setHex(0xc0c0c4);
      if (wall) wall.material.color.setHex(0xd0d0d4);
    }
    if (scene) {
      scene.fog.color.setHex(0xf0f0f2);
    }
  }
}
const canvas = document.getElementById("canvas3d");
var floor = null;
var wall = null;
function initThree() {
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: false
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  var maxRatio = deviceQuality === 'low' ? 1 : deviceQuality === 'medium' ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
  renderer.shadowMap.enabled = deviceQuality !== 'low';
  renderer.shadowMap.type = deviceQuality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = deviceQuality === 'low' ? THREE.LinearToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputEncoding = THREE.sRGBEncoding;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(isDarkTheme ? 0x141416 : 0xf0f0f2);
  scene.fog = new THREE.FogExp2(isDarkTheme ? 0x141416 : 0xf0f0f2, deviceQuality === 'low' ? 0.005 : 0.008);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 500);
  camera.position.set(3, 2.5, 3);
  const ambientLight = new THREE.AmbientLight(0x8899aa, 0.6);
  scene.add(ambientLight);
  const mainLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
  mainLight.position.set(8, 18, 12);
  mainLight.castShadow = deviceQuality !== 'low';
  mainLight.shadow.mapSize.set(2048, 2048);
  mainLight.shadow.camera.left = -50;
  mainLight.shadow.camera.right = 50;
  mainLight.shadow.camera.top = 50;
  mainLight.shadow.camera.bottom = -50;
  mainLight.shadow.bias = -0.001;
  mainLight.shadow.radius = 4;
  scene.add(mainLight);
  const fillLight = new THREE.DirectionalLight(0xaabbdd, 0.35);
  fillLight.position.set(-6, 3, -8);
  scene.add(fillLight);
  // Rim light for edge definition on wood panels
  const rimLight = new THREE.DirectionalLight(0x00D4AA, 0.15);
  rimLight.position.set(-8, 6, 4);
  if (deviceQuality !== 'low') scene.add(rimLight);
  // Hemisphere: sky blue top, warm ground
  if (deviceQuality !== 'low') {
    var hemiLight = new THREE.HemisphereLight(0x8899cc, 0x443322, 0.3);
    scene.add(hemiLight);
  }
  // Room — floor: 20m wide, 10m deep, one-sided (visible from above only)
  var floorGeo = new THREE.PlaneGeometry(20, 10);
  var floorMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x2a2a2e : 0xd0d0d4,
    roughness: 0.85,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.3
  });
  floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = deviceQuality !== 'low';
  scene.add(floor);

  // Grid on the floor - subtle, not too harsh
  var gridHelper = new THREE.GridHelper(20, 40, 0x00d4aa, 0x00d4aa);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.04;
  gridHelper.position.y = 0.001;
  if (deviceQuality !== 'low') scene.add(gridHelper);

  // Room — back wall: 20m wide, 5m tall, one-sided
  var wallGeo = new THREE.PlaneGeometry(20, 5);
  var wallMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x444448 : 0xd0d0d4,
    roughness: 0.9,
    metalness: 0,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.25
  });
  wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.set(0, 2.5, -5);
  wall.receiveShadow = deviceQuality !== 'low';
  if (deviceQuality !== 'low') scene.add(wall);
  setupControls();
  animate();
}
function setupControls() {
  canvas.addEventListener("touchstart", onTouchStart, {
    passive: false
  });
  canvas.addEventListener("touchmove", onTouchMove, {
    passive: false
  });
  canvas.addEventListener("touchend", onTouchEnd, {
    passive: false
  });
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, {
    passive: false
  });
  canvas.addEventListener("contextmenu", function(e) { e.preventDefault(); });
}
function onTouchStart(touchEvent) {
  touchEvent.preventDefault();
  const touches = touchEvent.touches;
  if (touches.length === 1) {
    touchStartPos = {
      x: touches[0].clientX,
      y: touches[0].clientY
    };
    isDragging = true;
    prevMouse = {
      x: touches[0].clientX,
      y: touches[0].clientY
    };
    autoRotate = false;
  } else if (touches.length === 2) {
    isPinching = true;
    isDragging = false;
    isPanning = false;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    pinchStartDist = Math.hypot(dx, dy);
    pinchStartCamDist = camDist;
    panStartMid = {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
    panStartTarget = targetPosition.clone();
  }
}
function onTouchMove(moveEvent) {
  moveEvent.preventDefault();
  const moveTouches = moveEvent.touches;
  if (moveTouches.length === 1 && isDragging) {
    theta -= (moveTouches[0].clientX - prevMouse.x) * 0.008;
    phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - (moveTouches[0].clientY - prevMouse.y) * 0.008));
    prevMouse = {
      x: moveTouches[0].clientX,
      y: moveTouches[0].clientY
    };
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
    if (!isPanning && midMove > 8 && distChange < 0.08) {
      isPanning = true;
    }
    if (isPanning && panStartTarget) {
      const panSpeed = camDist * 0.0012;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      right.crossVectors(camera.getWorldDirection(new THREE.Vector3()), up).normalize();
      targetPosition.copy(panStartTarget);
      targetPosition.addScaledVector(right, -midDx * panSpeed);
      targetPosition.addScaledVector(up, midDy * panSpeed);
    } else {
      camDist = Math.max(0.5, Math.min(80, pinchStartCamDist / distRatio));
    }
    updateCamera();
  }
}
function onTouchEnd(endEvent) {
  if (touchStartPos && !isPinching) {
    const canvasRect = canvas.getBoundingClientRect();
    const changedTouch = endEvent.changedTouches[0];
    if (Math.abs(changedTouch.clientX - touchStartPos.x) < 5 && Math.abs(changedTouch.clientY - touchStartPos.y) < 5) {
      handleRaycast(changedTouch.clientX, changedTouch.clientY, canvasRect);
    }
  }
  isDragging = false;
  isPinching = false;
  isPanning = false;
  panStartMid = null;
  panStartTarget = null;
  touchStartPos = null;
}
function onMouseDown(mouseEvent) {
  if (mouseEvent.button === 0) {
    mouseStartPos = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    mouseMovedDistance = 0;
    isDragging = true;
    prevMouse = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    autoRotate = false;
  } else if (mouseEvent.button === 2) {
    isPanningMouse = true;
    panStartMouse = {
      x: mouseEvent.clientX,
      y: mouseEvent.clientY
    };
    panStartTarget = targetPosition.clone();
  }
}
function onMouseMove(moveEvt) {
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
  if (!isDragging) {
    return;
  }
  const deltaX = moveEvt.clientX - prevMouse.x;
  const deltaY = moveEvt.clientY - prevMouse.y;
  mouseMovedDistance += Math.abs(deltaX) + Math.abs(deltaY);
  theta -= deltaX * 0.005;
  phi = Math.max(0.2, Math.min(Math.PI - 0.2, phi - deltaY * 0.005));
  prevMouse = {
    x: moveEvt.clientX,
    y: moveEvt.clientY
  };
  updateCamera();
}
function onMouseUp() {
  if (isDragging && mouseStartPos && mouseMovedDistance < 5) {
    const canvasRect = canvas.getBoundingClientRect();
    handleRaycast(mouseStartPos.x, mouseStartPos.y, canvasRect);
  }
  isDragging = false;
  isPanningMouse = false;
  panStartMouse = null;
  mouseStartPos = null;
  mouseMovedDistance = 0;
}
function onWheel(wheelEvent) {
  wheelEvent.preventDefault();
  camDist = Math.max(0.5, Math.min(80, camDist + camDist * wheelEvent.deltaY * 0.001));
  updateCamera();
}
function updateCamera() {
  if (isSmoothZoom) {
    return;
  }
  camera.position.x = targetPosition.x + camDist * Math.sin(phi) * Math.sin(theta);
  camera.position.y = targetPosition.y + camDist * Math.cos(phi);
  camera.position.z = targetPosition.z + camDist * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(targetPosition);
  needsRender = true;
}
let zoomPartCenter = null;
function startSmoothZoom(partId) {
  const part = parts.find(p => p.id === partId);
  if (!part || !part._pos) {
    return;
  }
  zoomPartCenter = new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z);
  const size = Math.max(part._size.x, part._size.y, part._size.z);
  const dist = Math.max(size * 2.5, 0.8);
  const dir = camera.position.clone().sub(zoomPartCenter).normalize();
  zoomTarget.set(
    part._pos.x + dir.x * dist,
    part._pos.y + dir.y * dist,
    part._pos.z + dir.z * dist
  );
  isSmoothZoom = true;
  autoRotate = false;
}
function animateSmoothZoom() {
  if (!isSmoothZoom) {
    return;
  }
  const lerpFactor = 0.12;
  camera.position.lerp(zoomTarget, lerpFactor);
  if (zoomPartCenter) {
    targetPosition.lerp(zoomPartCenter, lerpFactor);
  }
  camera.lookAt(targetPosition);
  if (camera.position.distanceTo(zoomTarget) < 0.15) {
    isSmoothZoom = false;
    if (zoomPartCenter) {
      targetPosition.copy(zoomPartCenter);
    }
    camDist = camera.position.distanceTo(targetPosition);
    zoomPartCenter = null;
  }
}
let prevClickKey = null;
function deselectPart() {
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
  selectedId = null;
  if (xrayActive) {
    applyXray();
  }
  updateSheet(null);
  closeSheet();
  renderPartsList();

  needsRender = true;
}
function handleRaycast(clickX, clickY, rect) {
  const mouse = new THREE.Vector2();
  mouse.x = (clickX - rect.left) / rect.width * 2 - 1;
  mouse.y = -((clickY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const meshes = Array.from(meshMap.values()).filter(m => m.visible === true);
  if (typeof detailMeshes !== 'undefined') {
    detailMeshes.forEach(arr => {
      arr.forEach(m => { if (m.visible && m.userData && m.userData.partId) meshes.push(m); });
    });
  }
  // Add fastener meshes for raycasting
  if (typeof fastenerMeshes !== 'undefined') {
    fastenerMeshes.forEach(m => { if (m.visible && m.userData && m.userData.fastenerId !== undefined) meshes.push(m); });
  }
  const hits = rc.intersectObjects(meshes);
  if (hits.length === 0) {
    deselectPart();
    return;
  }
  // Check if a fastener was clicked
  for (let i = 0; i < hits.length; i++) {
    const ud = hits[i].object.userData;
    if (ud && ud.fastenerId !== undefined) {
      const f = fastenerData.find(fd => fd.id === ud.fastenerId);
      if (f) {
        showToast("\uD83D\uDD27 " + (f.name || "\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430") + " [" + (f.type || "?") + "]");
      }
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
  if (!hiddenSet.has(bestId)) {
    if (blockMode) {
      // Highlight all parts in the same module
      var partData = parts.find(function(p) { return p.id === bestId; });
      if (partData) {
        var partGroup = partData.group || getModuleKey(partData.code || "");
        selectModuleHighlight(partGroup, bestId);
      } else {
        selectPart(bestId);
      }
    } else {
      selectPart(bestId);
    }
  }
}
let layoutMinY = 0;
function autoLayout(partsArr) {
  var hasPlacement = false;
  partsArr.forEach(function(p) {
    if (p.placement && p.placement.origin) hasPlacement = true;
  });

  const scaleFactor = 0.001;
  layoutMinY = 0;

  partsArr.forEach(p => {
    if (hasPlacement && p.placement && p.placement.origin) {
      // v4: placement.origin + quaternion из ax/ay/az
      var o = p.placement.origin;
      p._pos = { x: o.x * scaleFactor, y: o.y * scaleFactor, z: o.z * scaleFactor };
      // Конвертируем базисные векторы в quaternion
      var ax = p.placement.ax || {x:1,y:0,z:0};
      var ay = p.placement.ay || {x:0,y:1,z:0};
      var az = p.placement.az || {x:0,y:0,z:1};
      var m = new THREE.Matrix4();
      m.set(ax.x, ay.x, az.x, 0,
            ax.y, ay.y, az.y, 0,
            ax.z, ay.z, az.z, 0,
            0,    0,    0,    1);
      p._quat = new THREE.Quaternion();
      p._quat.setFromRotationMatrix(m);
    } else if (p.pos && p.gab) {
      // v3: GabMin + gab/2 = центр
      p._pos = {
        x: (p.pos.x + p.gab.w / 2) * scaleFactor,
        y: (p.pos.y + p.gab.h / 2) * scaleFactor,
        z: (p.pos.z + p.gab.d / 2) * scaleFactor
      };
      p._quat = null; // v3 без поворота
    } else {
      var gridSize = Math.ceil(Math.sqrt(partsArr.length));
      var row = Math.floor(p.id / gridSize);
      var col = p.id % gridSize;
      p._pos = { x: (col - gridSize / 2) * 0.15, y: 0, z: (row - gridSize / 2) * 0.15 };
      p._quat = null;
    }
    // Размеры для bounding box и explode
    if (p.gab) {
      p._size = {
        x: Math.max(p.gab.w, 1) * scaleFactor,
        y: Math.max(p.gab.h, 1) * scaleFactor,
        z: Math.max(p.gab.d, 1) * scaleFactor
      };
    } else {
      p._size = { x: 0.1, y: 0.1, z: 0.1 };
    }
  });
}
function getColor(materialStr, partData) {
  if (partData?.color) {
    return partData.color;
  }
  var info = classifyMaterial(materialStr);
  return info.color;
}
function buildPartDetails(partInfo, meshObj) {
  const detailArr = [];
  const grooves = partInfo.grooves || [];
  const holes2 = partInfo.holes || [];
  if (!grooves.length && !holes2.length) {
    return detailArr;
  }
  const panelT = (partInfo.T || 16) * sc;

  // --- Grooves: recessed lines on panel surface ---
  grooves.forEach(function(groove) {
    const grooveW = (groove.width || groove.w || 20) * sc;
    const grooveH = (groove.length || groove.h || 20) * sc;
    const grooveD = (groove.depth || groove.d || 4) * sc;
    const grooveGeo = new THREE.BoxGeometry(grooveW, grooveH, grooveD);
    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a, roughness: 0.9, metalness: 0,
      emissive: 0x1a0a00, emissiveIntensity: 0.15
    });
    const grooveMesh = new THREE.Mesh(grooveGeo, grooveMat);
    grooveMesh.position.set(
      (groove.x || 0) * sc,
      (groove.y || 0) * sc,
      (groove.z || 0) * sc
    );
    grooveMesh.userData = { partId: partInfo.id, detailType: "groove" };
    grooveMesh.castShadow = false;
    grooveMesh.receiveShadow = false;
    meshObj.add(grooveMesh);
    var grooveEdgeGeo = new THREE.EdgesGeometry(grooveGeo, 15);
    var grooveEdgeLine = new THREE.LineSegments(grooveEdgeGeo, new THREE.LineBasicMaterial({ color: 0x00D4AA, transparent: true, opacity: 0.6 }));
    grooveEdgeLine.position.copy(grooveMesh.position);
    meshObj.add(grooveEdgeLine);
    detailArr.push(grooveMesh, grooveEdgeLine);
  });

  // --- Holes: cylinders with ring markers ---
  holes2.forEach(function(hole) {
    const holeRadius = (hole.diameter || hole.d || hole.r || 8) / 2 * sc;
    const holeDepth = (hole.depth || panelT) * sc;
    const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
    const holeMat = new THREE.MeshStandardMaterial({
      color: 0x333333, roughness: 0.6, metalness: 0.4,
      emissive: 0x111111, emissiveIntensity: 0.1
    });
    const holeMesh = new THREE.Mesh(holeGeo, holeMat);
    holeMesh.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc
    );
    if (hole.angleX) holeMesh.rotation.x = hole.angleX * Math.PI / 180;
    if (hole.angleZ) holeMesh.rotation.z = hole.angleZ * Math.PI / 180;
    holeMesh.userData = { partId: partInfo.id, detailType: "hole" };
    meshObj.add(holeMesh);
    var ringGeo = new THREE.RingGeometry(holeRadius * 0.8, holeRadius, 24);
    var ringMat = new THREE.MeshBasicMaterial({ color: 0x00D4AA, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    var ringFront = new THREE.Mesh(ringGeo, ringMat);
    ringFront.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc + panelT / 2 + 0.0002
    );
    meshObj.add(ringFront);
    var ringBack = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
    ringBack.position.set(
      (hole.x || 0) * sc,
      (hole.y || 0) * sc,
      (hole.z || 0) * sc - panelT / 2 - 0.0002
    );
    meshObj.add(ringBack);
    detailArr.push(holeMesh, ringFront, ringBack);
  });

  return detailArr;
}

const FASTENER_COLORS = {
  "Петля": 16753920,
  "Направляющая": 10040064,
  "Ручка": 10079232,
  "Саморез": 8421504,
  "Доводчик": 6737151,
  "Конфирмат": 5592405,
  "Эксцентрик": 16744576,
  "Стяжка": 65535,
  "Ножка": 8388736,
  "Держатель полки": 8421376,
  "Шкант": 13882323,
  "Вытяжка": 16761024,
  "Фурнитура": 12632256
};

function buildFasteners(fasteners) {
  if (!fasteners || !fasteners.length) return;
  var UP = new THREE.Vector3(0, 1, 0);
  var q = new THREE.Quaternion();
  var dir = new THREE.Vector3();
  fasteners.forEach(function(fastener) {
    var color = FASTENER_COLORS[fastener.type] || FASTENER_COLORS["\u0424\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0430"];
    // Новый формат: sections[] — цилиндры
    if (fastener.sections && fastener.sections.length) {
      fastener.sections.forEach(function(sec) {
        var r = Math.max(0.0016, (sec.r || 3) * sc);
        var len = Math.max(0.001, (sec.len || 14) * sc);
        var geo = new THREE.CylinderGeometry(r, r, len, 12);
        var mat = new THREE.MeshStandardMaterial({
          color: color, roughness: 0.35, metalness: 0.6,
          emissive: color, emissiveIntensity: 0.12
        });
        var mesh = new THREE.Mesh(geo, mat);
        dir.set(sec.d ? sec.d[0] : 0, sec.d ? sec.d[1] : 0, sec.d ? sec.d[2] : 1);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
        dir.normalize();
        q.setFromUnitVectors(UP, dir);
        mesh.quaternion.copy(q);
        mesh.position.set(
          sec.p[0] * sc + dir.x * len / 2,
          sec.p[1] * sc + dir.y * len / 2,
          sec.p[2] * sc + dir.z * len / 2
        );
        mesh.userData = { fastenerId: fastener.id, type: "fastener", name: fastener.name };
        mesh.castShadow = true;
        scene.add(mesh);
        fastenerMeshes.push(mesh);
      });
      return;
    }
    // Старый формат: pos + type
    var fx = (fastener.pos ? fastener.pos.x : 0) * sc;
    var fy = (fastener.pos ? fastener.pos.y : 0) * sc;
    var fz = (fastener.pos ? fastener.pos.z : 0) * sc;
    var type = (fastener.type || "").toLowerCase();
    var geoKey;
    if (type.indexOf("\u043f\u0435\u0442\u043b") >= 0 || type.indexOf("hinge") >= 0) geoKey = "hinge";
    else if (type.indexOf("\u043d\u0430\u043f\u0440\u0430\u0432\u043b") >= 0 || type.indexOf("slide") >= 0) geoKey = "slide";
    else if (type.indexOf("\u0440\u0443\u0447\u043a") >= 0 || type.indexOf("handle") >= 0) geoKey = "handle";
    else if (type.indexOf("\u0441\u0430\u043c\u043e\u0440\u0435\u0437") >= 0 || type.indexOf("\u043a\u043e\u043d\u0444\u0438\u0440\u043c\u0430\u0442") >= 0 || type.indexOf("\u0435\u0432\u0440\u043e\u0432\u0438\u043d\u0442") >= 0) geoKey = "screw";
    else if (type.indexOf("\u044d\u043a\u0441\u0446\u0435\u043d\u0442\u0440") >= 0 || type.indexOf("\u0441\u0442\u044f\u0436\u043a") >= 0) geoKey = "cam";
    else if (type.indexOf("\u0448\u043a\u0430\u043d\u0442") >= 0) geoKey = "dowel";
    else if (type.indexOf("\u043f\u043e\u043b\u043a\u043e\u0434\u0435\u0440\u0436") >= 0) geoKey = "shelf";
    else if (type.indexOf("\u043d\u043e\u0436\u043a") >= 0) geoKey = "leg";
    else if (type.indexOf("\u0434\u043e\u0432\u043e\u0434\u0447\u0438\u043a") >= 0) geoKey = "damper";
    else geoKey = "default";
    var geo;
    switch (geoKey) {
      case "hinge":  geo = new THREE.CylinderGeometry(0.006, 0.006, 0.02, 12); break;
      case "slide":  geo = new THREE.BoxGeometry(0.004, 0.08, 0.004); break;
      case "handle": geo = new THREE.TorusGeometry(0.012, 0.003, 8, 24, Math.PI); break;
      case "screw":  geo = new THREE.CylinderGeometry(0.002, 0.001, 0.015, 8); break;
      case "cam":    geo = new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16); break;
      case "dowel":  geo = new THREE.CylinderGeometry(0.004, 0.004, 0.016, 10); break;
      case "shelf":  geo = new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8); break;
      case "leg":    geo = new THREE.CylinderGeometry(0.008, 0.01, 0.03, 12); break;
      case "damper": geo = new THREE.BoxGeometry(0.006, 0.02, 0.006); break;
      default:       geo = new THREE.BoxGeometry(0.008, 0.008, 0.008); break;
    }
    var mat = new THREE.MeshStandardMaterial({
      color: color, roughness: 0.35, metalness: 0.65,
      emissive: color, emissiveIntensity: 0.15
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(fx, fy, fz);
    mesh.userData = { fastenerId: fastener.id, type: "fastener", name: fastener.name };
    mesh.castShadow = true;
    scene.add(mesh);
    fastenerMeshes.push(mesh);
  });
}
// --- Визуализация отверстий из holes[] ---
var holeMeshes = [];
function buildHoles(holes) {
  if (!holes || !holes.length) return;
  var UP = new THREE.Vector3(0, 1, 0);
  var dir = new THREE.Vector3();
  var q = new THREE.Quaternion();
  holes.forEach(function(hole) {
    var r = Math.max(0.001, (hole.diameter || 5) / 2 * sc);
    var len = Math.max(0.001, (hole.depth || 16) * sc);
    var geo = new THREE.CylinderGeometry(r, r, len, 12);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x444444, roughness: 0.7, metalness: 0.3,
      transparent: true, opacity: 0.6
    });
    var mesh = new THREE.Mesh(geo, mat);
    var px = (hole.pos ? hole.pos[0] : 0) * sc;
    var py = (hole.pos ? hole.pos[1] : 0) * sc;
    var pz = (hole.pos ? hole.pos[2] : 0) * sc;
    dir.set(hole.dir ? hole.dir[0] : 0, hole.dir ? hole.dir[1] : 0, hole.dir ? hole.dir[2] : 1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    q.setFromUnitVectors(UP, dir);
    mesh.quaternion.copy(q);
    mesh.position.set(px + dir.x * len / 2, py + dir.y * len / 2, pz + dir.z * len / 2);
    scene.add(mesh);
    holeMeshes.push(mesh);
  });
}
function clearHoles() {
  holeMeshes.forEach(function(m) { m.geometry.dispose(); m.material.dispose(); scene.remove(m); });
  holeMeshes.length = 0;
}

// --- Визуализация карманов/пазов (pockets) как decals на поверхности ---
// Following DetalQR approach: pockets are added as children of the panel mesh,
// using local panel coordinates. Face 'A' = front (Z=0 side), 'B' = back (Z=panelT side).
var pocketMeshes = [];
function buildPockets(partsArr) {
  partsArr.forEach(function(part) {
    if (!part.pockets || !part.pockets.length) return;
    var panelT = Math.max(part.T || 16, 1) * sc;
    var parentMesh = meshMap.get(part.id);
    if (!parentMesh) return;
    part.pockets.forEach(function(pk) {
      var sh;
      if (pk.t === 'circle' && pk.r > 0) {
        sh = new THREE.Shape();
        sh.absarc(pk.x * sc, pk.y * sc, pk.r * sc, 0, Math.PI * 2, false);
      } else if (pk.t === 'poly' && pk.pts && pk.pts.length >= 3) {
        sh = new THREE.Shape();
        sh.moveTo(pk.pts[0][0] * sc, pk.pts[0][1] * sc);
        for (var i = 1; i < pk.pts.length; i++) sh.lineTo(pk.pts[i][0] * sc, pk.pts[i][1] * sc);
        sh.closePath();
      }
      if (!sh) return;
      var geo = new THREE.ShapeGeometry(sh);
      // DetalQR: face A => Z = -0.2mm (front), face B => Z = panelT +0.2mm (back)
      var isBack = pk.face === 'B';
      geo.translate(0, 0, isBack ? panelT + 0.0002 : -0.0002);
      var mat = new THREE.MeshStandardMaterial({
        color: 0x2b2f35, roughness: 0.95, metalness: 0.05,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
        depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1;
      mesh.userData = { partId: part.id, pocket: true };
      parentMesh.add(mesh);
      pocketMeshes.push(mesh);
    });
  });
}
function clearPockets() {
  pocketMeshes.forEach(function(m) {
    if (m.parent) m.parent.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  });
  pocketMeshes.length = 0;
}

// --- Размерные линии (dims) — по образцу DetalQR ---
// Рисует линейные размеры из БАЗИС в 3D: выноски, стрелки, цифры.
function buildDimLines() {
  if (!dimsData || !dimsData.length) return;
  dimGroup = new THREE.Group();
  var HL = 0.03;   // длина стрелки (м)
  var HW = 0.008;  // полудлина наконечника (м)
  var DIM_MIN_OFF = 0.12; // минимальное смещение от детали (м)
  var V = function(p) { return new THREE.Vector3(p[0] * sc, p[1] * sc, p[2] * sc); };
  var defaultMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  var dimMatCache = {};
  function dimMat(col) {
    if (!col) return defaultMat;
    if (!dimMatCache[col]) {
      var c = new THREE.Color(col);
      var lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      dimMatCache[col] = (lum > 0.86) ? defaultMat : new THREE.LineBasicMaterial({ color: c });
    }
    return dimMatCache[col];
  }
  // Центр модели для определения направления выноса
  var cx = 0, cy = 0, cz = 0;
  if (parts.length) {
    parts.forEach(function(p) { if (p._pos) { cx += p._pos.x; cy += p._pos.y; cz += p._pos.z; } });
    cx /= parts.length; cy /= parts.length; cz /= parts.length;
  }
  var ctr = new THREE.Vector3(cx, cy, cz);

  for (var di = 0; di < dimsData.length; di++) {
    var d = dimsData[di];
    var dg = new THREE.Group();
    var a = V(d.a), b = V(d.b);
    var ea = V(d.ea), eb = V(d.eb);

    // Минимальное смещение: если размер слишком близко к детали — отодвигаем
    var off = new THREE.Vector3().subVectors(a, ea);
    var ol = off.length();
    if (ol < DIM_MIN_OFF) {
      var od;
      if (ol > 0.0005) {
        od = off.clone().normalize();
      } else {
        var dd = new THREE.Vector3().subVectors(eb, ea);
        if (dd.lengthSq() < 1e-10) od = new THREE.Vector3(0, 1, 0);
        else {
          var u = Math.abs(dd.clone().normalize().y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          od = new THREE.Vector3().crossVectors(dd, u).normalize();
          var m = ea.clone().add(eb).multiplyScalar(0.5);
          if (m.clone().add(od).distanceTo(ctr) < m.clone().sub(od).distanceTo(ctr)) od.negate();
        }
      }
      var add = od.multiplyScalar(DIM_MIN_OFF - ol);
      a = a.clone().add(add);
      b = b.clone().add(add);
    }

    var dm = dimMat(d.col);
    // Линии: размерная + две выноски
    var g = new THREE.BufferGeometry().setFromPoints([a, b, ea, a, eb, b]);
    dg.add(new THREE.LineSegments(g, dm));
    // Стрелки
    var dir = new THREE.Vector3().subVectors(b, a).normalize();
    var upV = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var perp = new THREE.Vector3().crossVectors(dir, upV).normalize();
    var diV = dir.clone().multiplyScalar(HL), pe = perp.clone().multiplyScalar(HW);
    var ar = new THREE.BufferGeometry().setFromPoints([
      a, a.clone().add(diV).add(pe), a, a.clone().add(diV).sub(pe),
      b, b.clone().sub(diV).add(pe), b, b.clone().sub(diV).sub(pe)
    ]);
    dg.add(new THREE.LineSegments(ar, dm));
    // Цифра — спрайт посередине размерной линии
    var mid = a.clone().add(b).multiplyScalar(0.5);
    var nud = new THREE.Vector3().subVectors(a, ea);
    if (nud.lengthSq() < 0.0001) nud.copy(perp);
    nud.normalize().multiplyScalar(0.026);
    var label = makeDimLabel(String(Math.round(d.value)), 0.032);
    label.position.copy(mid).add(nud);
    dg.add(label);
    dimGroup.add(dg);
  }
  scene.add(dimGroup);
  needsRender = true;
}

function makeDimLabel(text, worldSize) {
  var cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  var ctx = cv.getContext('2d');
  ctx.font = '500 60px system-ui, -apple-system, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(text, 128, 64);
  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  var sh = worldSize * 128 / 46;
  var spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: true, depthWrite: false, transparent: true
  }));
  spr.scale.set(sh * 2, sh, 1);
  return spr;
}

function toggleDims() {
  dimsVisible = !dimsVisible;
  if (dimsVisible && !dimGroup) buildDimLines();
  if (dimGroup) dimGroup.visible = dimsVisible;
  var btn = document.getElementById("dimsBtn");
  if (btn) btn.classList.toggle("active", dimsVisible);
  showToast(dimsVisible ? "📐 Размеры показаны" : "📐 Размеры скрыты");
  needsRender = true;
}

function buildContourShape(contour, sc) {
  var shape = new THREE.Shape();
  var first = true;
  for (var ci = 0; ci < contour.length; ci++) {
    var el = contour[ci];
    if (el.t === 'line') {
      if (first) { shape.moveTo(el.x1 * sc, el.y1 * sc); first = false; }
      shape.lineTo(el.x2 * sc, el.y2 * sc);
    } else if (el.t === 'arc') {
      var cx = el.cx * sc, cy = el.cy * sc;
      var r = Math.sqrt((el.x1 - el.cx) * (el.x1 - el.cx) + (el.y1 - el.cy) * (el.y1 - el.cy)) * sc;
      var a1 = Math.atan2(el.y1 - el.cy, el.x1 - el.cx);
      var a2 = Math.atan2(el.y2 - el.cy, el.x2 - el.cx);
      var da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      var steps = Math.max(4, Math.floor(Math.abs(da) / 0.15) + 1);
      for (var ai = 0; ai <= steps; ai++) {
        var angle = a1 + da * ai / steps;
        var px = cx + r * Math.cos(angle);
        var py = cy + r * Math.sin(angle);
        if (first) { shape.moveTo(px, py); first = false; }
        else shape.lineTo(px, py);
      }
    } else if (el.t === 'circle') {
      var holePath = new THREE.Path();
      holePath.absarc(el.cx * sc, el.cy * sc, el.r * sc, 0, Math.PI * 2, false);
      shape.holes.push(holePath);
    }
  }
  if (!first) shape.closePath();
  return shape;
}

const detailMeshes = new Map();
const sc = 0.001;
function buildScene() {
  meshMap.forEach(function(oldMesh) {
    if (oldMesh.material.map) oldMesh.material.map.dispose();
    oldMesh.material.dispose();
    oldMesh.geometry.dispose();
    scene.remove(oldMesh);
  });
  edgeLineMap.forEach(function(oldLine) { oldLine.geometry.dispose(); oldLine.material.dispose(); scene.remove(oldLine); });
  detailMeshes.forEach(function(oldArr) { oldArr.forEach(function(oldObj) { if (oldObj.geometry) oldObj.geometry.dispose(); if (oldObj.material) oldObj.material.dispose(); scene.remove(oldObj); }); });
  // Clean up fastener meshes
  fastenerMeshes.forEach(function(fm) {
    if (fm.geometry) fm.geometry.dispose();
    if (fm.material) { if (fm.material.map) fm.material.map.dispose(); fm.material.dispose(); }
    scene.remove(fm);
  });
  fastenerMeshes.length = 0;
  clearHoles();
  clearPockets();
  if (dimGroup) {
    scene.remove(dimGroup);
    dimGroup.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { if (obj.material.map) obj.material.map.dispose(); obj.material.dispose(); }
    });
    dimGroup = null;
    dimsVisible = false;
  }
  meshMap.clear();
  edgeLineMap.clear();
  detailMeshes.clear();
  originalPositions.clear();
  parts.forEach(part => {
    var shapeW = Math.max(part.L || 100, 1) * sc;
    var shapeH = Math.max(part.W || 100, 1) * sc;
    var panelT = Math.max(part.T || 16, 1) * sc;
    var shape;
    if (part.poly && part.poly.length >= 3) {
      // poly: нормализованный контур от (0,0), origin уже скомпенсирован
      shape = new THREE.Shape();
      var started = false;
      for (var pi = 0; pi < part.poly.length; pi++) {
        var pt = part.poly[pi];
        if (typeof pt[0] === 'string' && pt[0] === 'circle') {
          var hp = new THREE.Path();
          hp.absarc(pt[1] * sc, pt[2] * sc, pt[3] * sc, 0, Math.PI * 2, false);
          shape.holes.push(hp);
          continue;
        }
        if (!started) { shape.moveTo(pt[0] * sc, pt[1] * sc); started = true; }
        else shape.lineTo(pt[0] * sc, pt[1] * sc);
      }
      if (started) shape.closePath();
      var holeArr = part.polyHoles || [];
      for (var hi = 0; hi < holeArr.length; hi++) {
        var holeLoop = holeArr[hi];
        if (!holeLoop || holeLoop.length < 3) continue;
        var holePath2 = new THREE.Path();
        holePath2.moveTo(holeLoop[0][0] * sc, holeLoop[0][1] * sc);
        for (var hj = 1; hj < holeLoop.length; hj++) {
          holePath2.lineTo(holeLoop[hj][0] * sc, holeLoop[hj][1] * sc);
        }
        holePath2.closePath();
        shape.holes.push(holePath2);
      }
    } else if (part.contour && part.contour.length >= 2 && part.contour[0].t) {
      shape = buildContourShape(part.contour, sc);
    } else {
      // Fallback: прямоугольник от (0,0) если есть placement, иначе центрированный
      shape = new THREE.Shape();
      if (part.placement) {
        shape.moveTo(0, 0);
        shape.lineTo(shapeW, 0);
        shape.lineTo(shapeW, shapeH);
        shape.lineTo(0, shapeH);
      } else {
        shape.moveTo(-shapeW / 2, -shapeH / 2);
        shape.lineTo(shapeW / 2, -shapeH / 2);
        shape.lineTo(shapeW / 2, shapeH / 2);
        shape.lineTo(-shapeW / 2, shapeH / 2);
      }
      shape.closePath();
    }
    // Вырезы (без центрирования — координаты как в poly)
    var cutouts = part.cuts || part.cutouts || [];
    cutouts.forEach(function(cut) {
      var pth = new THREE.Path();
      if (cut.t === 'circle' && cut.r > 0) {
        pth.absarc(cut.x * sc, cut.y * sc, cut.r * sc, 0, Math.PI * 2, true);
        shape.holes.push(pth);
      } else if (cut.pts && cut.pts.length >= 3) {
        pth.moveTo(cut.pts[0][0] * sc, cut.pts[0][1] * sc);
        for (var ci = 1; ci < cut.pts.length; ci++) {
          pth.lineTo(cut.pts[ci][0] * sc, cut.pts[ci][1] * sc);
        }
        pth.closePath();
        shape.holes.push(pth);
      }
    });
    var extrudeSettings = { depth: panelT, bevelEnabled: false };
    var panelGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    var panelMat = createPartMaterial(part);
    var panelMesh = new THREE.Mesh(panelGeo, panelMat);
    // Позиция + поворот (DetalQR: pos + quat)
    panelMesh.position.set(part._pos.x, part._pos.y, part._pos.z);
    if (part._quat) {
      panelMesh.quaternion.copy(part._quat);
    }
    panelMesh.userData = { partId: part.id };
    panelMesh.castShadow = deviceQuality !== 'low';
    panelMesh.receiveShadow = deviceQuality !== 'low';
    scene.add(panelMesh);
    // Wireframe edges
    var edgeThreshold = deviceQuality === 'low' ? 30 : 15;
    var edgeGeo = new THREE.EdgesGeometry(panelGeo, edgeThreshold);
    var edgeMat = new THREE.LineBasicMaterial({ color: isDarkTheme ? 0x1a1a1a : 0x666666, transparent: true, opacity: 0.6 });
    var edgeLineObj = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLineObj.quaternion.copy(panelMesh.quaternion);
    edgeLineObj.position.copy(panelMesh.position);
    scene.add(edgeLineObj);
    originalPositions.set(part.id, new THREE.Vector3(part._pos.x, part._pos.y, part._pos.z));
    meshMap.set(part.id, panelMesh);
    edgeLineMap.set(part.id, edgeLineObj);
    // Build detail overlays (grooves, holes, edges — cutouts are now in the shape)
    var details = buildPartDetails(part, panelMesh);
    if (details.length) {
      detailMeshes.set(part.id, details);
    }
  });
  centerCamera();
  needsRender = true;
  updateStats();
  buildModuleMap();
  renderPartsList();
  updateSummary();
  buildFasteners(fastenerData);
  clearHoles();
  buildHoles(window._loadedHoles || []);
  clearPockets();
  buildPockets(parts);
}
function buildModuleMap() {
  moduleMap.clear();
  parts.forEach(part => {
    // Use explicit group field if available, otherwise parse from code
    let groupName;
    if (part.group) {
      groupName = part.group;
    } else {
      const idCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
      groupName = getModuleKey(idCode);
    }
    if (!moduleMap.has(groupName)) {
      moduleMap.set(groupName, []);
    }
    moduleMap.get(groupName).push(part);
  });
}
function centerCamera() {
  if (!parts.length) {
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY2 = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  parts.forEach(part => {
    if (!part._pos) {
      return;
    }
    minX = Math.min(minX, part._pos.x - part._size.x / 2);
    maxX = Math.max(maxX, part._pos.x + part._size.x / 2);
    minY2 = Math.min(minY2, part._pos.y - part._size.y / 2);
    maxY = Math.max(maxY, part._pos.y + part._size.y / 2);
    minZ = Math.min(minZ, part._pos.z - part._size.z / 2);
    maxZ = Math.max(maxZ, part._pos.z + part._size.z / 2);
  });
  targetPosition.set((minX + maxX) / 2, (minY2 + maxY) / 2, (minZ + maxZ) / 2);
  const maxExtent = Math.max(maxX - minX, maxY - minY2, maxZ - minZ);
  camDist = Math.max(maxExtent * 1.5, 2);
  updateCamera();
}

function selectModuleHighlight(moduleKey, clickedId) {
  selectedId = clickedId;
  var moduleParts = moduleMap.get(moduleKey);
  if (!moduleParts) { selectPart(clickedId); return; }
  var moduleIds = new Set(moduleParts.map(function(p) { return p.id; }));
  meshMap.forEach(function(mesh, id) {
    if (moduleIds.has(id)) {
      mesh.material.emissive.setHex(0x00D4AA);
      mesh.material.emissiveIntensity = id === clickedId ? 0.25 : 0.12;
      mesh.material.transparent = true;
      mesh.material.opacity = id === clickedId ? 0.85 : 0.95;
    } else {
      mesh.material.emissive.setHex(0);
      mesh.material.emissiveIntensity = 0;
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
    }
    mesh.material.needsUpdate = true;
  });
  edgeLineMap.forEach(function(e, id) {
    if (moduleIds.has(id)) {
      e.visible = true;
      e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      e.material.opacity = 0.55;
      e.material.needsUpdate = true;
    } else {
      e.visible = false;
    }
  });
  updateSheet(parts.find(function(p) { return p.id === clickedId; }));
  // Add isolate button when in block mode
  var sheetContent = document.getElementById("sheetContent");
  if (sheetContent && moduleKey) {
    var isolateBtn = document.createElement("div");
    isolateBtn.className = "action-btn";
    isolateBtn.style.marginTop = "8px";
    isolateBtn.style.background = "rgba(0,212,170,0.12)";
    isolateBtn.style.borderColor = "rgba(0,212,170,0.25)";
    isolateBtn.textContent = "\u2299 \u0418золировать \u0431лок";
    isolateBtn.onclick = function() { isolateModule(moduleKey); };
    sheetContent.appendChild(isolateBtn);
  }
  renderPartsList();
  openSheet();

  needsRender = true;
}
function selectPart(partId) {
  var prevId = selectedId;
  selectedId = partId;
  // Only reset previous selected (not all meshes — saves O(N) per click)
  if (prevId !== null && prevId !== partId) {
    var prevMesh = meshMap.get(prevId);
    var prevEdge = edgeLineMap.get(prevId);
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
      prevEdge.material.transparent = true;
    }
  }
  var selectedMesh = meshMap.get(partId);
  var selectedEdge = edgeLineMap.get(partId);
  if (selectedMesh) {
    selectedMesh.material.emissive.setHex(0x00D4AA);
    selectedMesh.material.emissiveIntensity = 0.25;
    selectedMesh.material.transparent = true;
    selectedMesh.material.opacity = 0.85;
    selectedMesh.material.needsUpdate = true;
  }
  if (selectedEdge) {
    selectedEdge.visible = true;
    selectedEdge.material.color.setHex(0x00D4AA);
    selectedEdge.material.opacity = 0.8;
    selectedEdge.material.transparent = true;
    selectedEdge.material.needsUpdate = true;
  }
  if (xrayActive) {
    applyXray();
  }
  updateSheet(parts.find(part => part.id === partId));
  renderPartsList();
  openSheet();

  needsRender = true;
}
function renderProcessingInfo(partData) {
  const grooves = partData.grooves || [];
  const holes2 = partData.holes || [];
  const cutouts2 = partData.cutouts || [];
  const pockets = partData.pockets || [];
  // edges removed from display
  const hasProcessing = grooves.length || holes2.length || cutouts2.length || pockets.length;
  const relatedFasteners = fastenerData.filter(f => f.ownerCode && partData.code && f.ownerCode === partData.code);
  if (!hasProcessing && !relatedFasteners.length) {
    return "";
  }
  let html = "<div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">";
  if (pockets.length) {
    html += "<div style=\"font-size:9px;color:#7a4de8;margin-bottom:2px\">Пазы/карманы (" + pockets.length + "):</div>";
    pockets.forEach(function(pk, idx) {
      var shape = pk.t === 'circle' ? ('⌀' + ((pk.r || 0) * 2).toFixed(0)) : ('poly ' + (pk.pts ? pk.pts.length : 0) + ' вершин');
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + shape + " гл." + (pk.depth || 0) + " мм " + (pk.face === 'B' ? 'тыл' : 'лицо') + "</div>";
    });
  }
  if (grooves.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Пазы (" + grooves.length + "):</div>";
    grooves.forEach((groove, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (groove.x || 0) + " y:" + (groove.y || 0) + " " + (groove.width || groove.w || 0) + "×" + (groove.length || groove.h || 0) + "×" + (groove.depth || groove.d || 0) + " мм</div>";
    });
  }
  if (holes2.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Отверстия (" + holes2.length + "):</div>";
    holes2.forEach((hole, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (hole.x || 0) + " y:" + (hole.y || 0) + " ⌀" + (hole.diameter || hole.d || hole.r || "?") + " мм</div>";
    });
  }
  if (cutouts2.length) {
    html += "<div style=\"font-size:9px;color:var(--accent);margin-bottom:2px\">Вырезы (" + cutouts2.length + "):</div>";
    cutouts2.forEach((cutout, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". x:" + (cutout.x || 0) + " y:" + (cutout.y || 0) + " " + (cutout.w || 0) + "×" + (cutout.h || 0) + " мм</div>";
    });
  }
    if (relatedFasteners.length) {
    html += "<div style=\"font-size:9px;color:#ff9800;margin-bottom:2px\">Фурнитура (" + relatedFasteners.length + "):</div>";
    relatedFasteners.forEach((f, idx) => {
      html += "<div style=\"font-size:8px;color:var(--text-secondary);padding-left:6px\">" + (idx + 1) + ". " + (f.name || "?") + " [" + (f.type || "?") + "]</div>";
    });
  }
  html += "</div>";
  return html;
}
function findNeighbors(part) {
  if (!fastenerData.length || !part) return [];
  var neighbors = [];
  var seen = new Set();
  var code = part.code || "";
  fastenerData.forEach(function(f) {
    if (f.ownerCode && f.ownerCode === code && f.neighborCode && !seen.has(f.neighborCode)) {
      seen.add(f.neighborCode);
      neighbors.push(f.neighborCode);
    }
  });
  return neighbors;
}
function navigateToNeighbor(code) {
  var found = parts.find(function(p) { return p.code === code; });
  if (found) { selectPart(found.id); startSmoothZoom(found.id); }
}
function isMobileSheet() {
  return window.innerWidth <= 600;
}
var sheetCollapsed = false;
function updateSheet(part) {
  var sheetEl = document.getElementById("sheetContent");
  var previewCodeEl = document.getElementById("sheetPreviewCode");
  var bottomSheet = document.getElementById("bottomSheet");
  if (!part) {
    sheetEl.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:10px;font-size:11px;">Нажмите на деталь</div>';
    if (previewCodeEl) previewCodeEl.textContent = '—';
    bottomSheet.removeAttribute('data-state');
    sheetCollapsed = false;
    return;
  }
  var isScanned = scannedSet.has(part.id);
  var displayCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
  var displayCode2 = idMode === "position" ? (part.code || "") : (part.position || "");
  var modKey = getModuleKey(displayCode);
  var modName = part.groupName || getModuleName(displayCode);
  var modColor = getModuleColor(displayCode);
  var neighbors = findNeighbors(part);
  if (previewCodeEl) var dims = (part.L || '?') + '×' + (part.W || '?') + '×' + (part.T || '?');
  previewCodeEl.textContent = (displayCode || '—') + '  ' + dims + '  ' + (part.name || '');
  var html = '<div class="detail-card">';
  html += '<div style="font-size:18px;font-weight:700;color:var(--code-color);font-family:Monaco,Menlo,monospace;margin-bottom:4px">' + escapeHtml(displayCode || '—') + '</div>';
  if (displayCode2) {
    html += '<div style="font-size:11px;color:var(--text-tertiary);font-family:Monaco,Menlo,monospace;margin-bottom:6px">' + escapeHtml(displayCode2) + '</div>';
  }
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">' + escapeHtml(part.name || '—') + '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">';
  html += '<div class="dim"><span class="dim-label">Д</span><span class="dim-value">' + (part.L || '—') + '</span></div>';
  html += '<div class="dim"><span class="dim-label">Ш</span><span class="dim-value">' + (part.W || '—') + '</span></div>';
  html += '<div class="dim"><span class="dim-label">Т</span><span class="dim-value">' + (part.T || '—') + '</span></div>';
  html += '<span class="material-tag">' + escapeHtml(part.material || 'Материал') + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">';
  html += '<span class="status-badge ' + (isScanned ? 'scanned' : 'waiting') + '">' + (isScanned ? 'СОБРАНО' : 'ОЖИДАЕТ') + '</span>';
  html += '<span class="module-badge" style="color:' + modColor + ';background:' + modColor + '18;border-color:' + modColor + '30">' + modName + '</span>';
  html += '</div>';
  if (modKey !== 'HARDWARE' && modKey !== 'OTHER') {
    var modParts = moduleMap.get(modKey) || [];
    var partIndex = modParts.indexOf(part) + 1;
    if (partIndex > 0) {
      html += '<div class="assembly-hint">' + modName + ' — деталь ' + partIndex + ' из ' + modParts.length + ' в модуле</div>';
    }
  }
  if (neighbors.length) {
    html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">';
    html += '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:4px">Соседи</div>';
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
    neighbors.forEach(function(nb) {
      html += '<span onclick="navigateToNeighbor(\'' + escapeHtml(nb).replace(/'/g, "\\'") + '\')" style="font-size:11px;padding:3px 8px;border-radius:6px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--code-color);font-family:Monaco,Menlo,monospace;cursor:pointer">' + escapeHtml(nb) + '</span>';
    });
    html += '</div></div>';
  }
  html += renderProcessingInfo(part);
  html += '<div class="action-buttons">';
  html += '<div class="action-btn" onclick="handleScan(\'' + escapeHtml(displayCode).replace(/'/g, "\\'") + '\')">Скан</div>';
  html += '<div class="action-btn" onclick="startSmoothZoom(' + part.id + ')">Фокус</div>';
  html += '<div class="action-btn" onclick="toggleVisibility(' + part.id + ')">' + (hiddenSet.has(part.id) ? 'Показать' : 'Скрыть') + '</div>';
  html += '</div>';
  html += '</div>';
  sheetEl.innerHTML = html;
  if (isMobileSheet() && !assemblyMode) {
    bottomSheet.setAttribute('data-state', 'collapsed');
    sheetCollapsed = true;
  } else {
    bottomSheet.removeAttribute('data-state');
    sheetCollapsed = false;
  }
}

function toggleVisibility(partId) {
  const visMesh = meshMap.get(partId);
  const visEdge = edgeLineMap.get(partId);
  if (!visMesh) {
    return;
  }
  if (hiddenSet.has(partId)) {
    hiddenSet.delete(partId);
    visMesh.visible = true;
    if (visEdge) {
      visEdge.visible = true;
    }
  } else {
    hiddenSet.add(partId);
    visMesh.visible = false;
    if (visEdge) {
      visEdge.visible = false;
    }
    if (selectedId === partId) {
      selectedId = null;
      updateSheet(null);
      closeSheet();
    }
  }
  renderPartsList();
  if (xrayActive) {
    applyXray();
  }
  saveProgress();
  needsRender = true;
  showToast((hiddenSet.has(partId) ? "🙈" : "👁") + " Деталь " + (hiddenSet.has(partId) ? "скрыта" : "показана"));
}
function toggleCSGVisibility() {
  csgEnabled = !csgEnabled;
  detailMeshes.forEach(function(arr) {
    arr.forEach(function(obj) {
      obj.visible = csgEnabled;
      if (obj.material) {
        obj.material.transparent = !csgEnabled;
        obj.material.opacity = csgEnabled ? 1 : 0;
      }
    });
  });
  fastenerMeshes.forEach(function(fm) {
    fm.visible = csgEnabled;
    if (fm.material) {
      fm.material.transparent = !csgEnabled;
      fm.material.opacity = csgEnabled ? 1 : 0;
    }
  });
  holeMeshes.forEach(function(hm) {
    hm.visible = csgEnabled;
  });
  pocketMeshes.forEach(function(pm) {
    pm.visible = csgEnabled;
  });
  const btn = document.getElementById("csgBtn");
  btn.classList.toggle("active", csgEnabled);
  needsRender = true;
  showToast(csgEnabled ? "Фурнитура показана" : "Фурнитура скрыта");
}
function showAllParts() {
  hiddenSet.clear();
  isolatedModule = null;
  explodeModuleKey = null;
  meshMap.forEach(m => {
    m.visible = true;
    m.material.transparent = false;
    m.material.opacity = 1;
    m.material.roughness = 0.78;
    m.material.needsUpdate = true;
  });
  edgeLineMap.forEach(e => {
    e.visible = true;
    e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
    e.material.opacity = 0.55;
  });
  detailMeshes.forEach(arr => {
    arr.forEach(obj => { obj.visible = true; });
  });
  renderPartsList();
  if (xrayActive) { applyXray(); }
  if (explodeActive) {
    animateExplodeTo(0);
    explodeActive = false;
    document.getElementById("explodeBtn").classList.remove("active");
  }
  document.getElementById("isolationBar").style.display = "none";
  showToast("Все модули показаны");

  needsRender = true;
}

// === Module Isolation ===
function isolateModule(moduleKey) {
  if (!moduleMap.has(moduleKey)) return;
  isolatedModule = moduleKey;
  var moduleParts = moduleMap.get(moduleKey);
  var moduleIds = new Set(moduleParts.map(p => p.id));
  meshMap.forEach((m, id) => {
    if (moduleIds.has(id)) {
      m.visible = true;
      m.material.transparent = false;
      m.material.opacity = 1;
      m.material.roughness = 0.78;
      m.material.needsUpdate = true;
    } else {
      m.visible = false;
    }
  });
  edgeLineMap.forEach((e, id) => {
    if (moduleIds.has(id)) {
      e.visible = true;
      e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      e.material.opacity = 0.55;
    } else {
      e.visible = false;
    }
  });
  detailMeshes.forEach((arr, id) => {
    arr.forEach(obj => { obj.visible = moduleIds.has(id); });
  });
  // Show isolation bar
  var bar = document.getElementById("isolationBar");
  var firstPart = moduleParts[0];
  var displayName = (firstPart && firstPart.groupName) ? firstPart.groupName : getModuleName(moduleKey + "_00");
  var modColor = getModuleColor(moduleKey + "_00");
  bar.querySelector(".isolation-name").textContent = displayName;
  bar.querySelector(".isolation-name").style.color = modColor;
  bar.querySelector(".isolation-count").textContent = moduleParts.length + " деталей";
  bar.style.display = "flex";
  centerCameraOnParts(moduleParts);
  renderPartsList();
  showToast("Изолирован: " + displayName);

  needsRender = true;
}
function exitIsolation() {
  isolatedModule = null;
  explodeModuleKey = null;
  meshMap.forEach(m => {
    m.visible = true;
    m.material.transparent = false;
    m.material.opacity = 1;
    m.material.roughness = 0.78;
    m.material.needsUpdate = true;
  });
  edgeLineMap.forEach(e => {
    e.visible = true;
    e.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
    e.material.opacity = 0.55;
    e.material.needsUpdate = true;
  });
  detailMeshes.forEach(arr => {
    arr.forEach(obj => { obj.visible = true; });
  });
  if (explodeActive) {
    animateExplodeTo(0);
    explodeActive = false;
    document.getElementById("explodeBtn").classList.remove("active");
  }
  document.getElementById("isolationBar").style.display = "none";
  centerCamera();
  renderPartsList();
  showToast("Изоляция снята");

  needsRender = true;
}
function centerCameraOnParts(partsArr) {
  if (!partsArr.length) return;
  var minX = Infinity, maxX = -Infinity;
  var minY = Infinity, maxY = -Infinity;
  var minZ = Infinity, maxZ = -Infinity;
  partsArr.forEach(p => {
    if (!p._pos) return;
    minX = Math.min(minX, p._pos.x - p._size.x / 2);
    maxX = Math.max(maxX, p._pos.x + p._size.x / 2);
    minY = Math.min(minY, p._pos.y - p._size.y / 2);
    maxY = Math.max(maxY, p._pos.y + p._size.y / 2);
    minZ = Math.min(minZ, p._pos.z - p._size.z / 2);
    maxZ = Math.max(maxZ, p._pos.z + p._size.z / 2);
  });
  targetPosition.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  var maxExtent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  camDist = Math.max(maxExtent * 2, 1.5);
  updateCamera();
}
function explodeIsolatedModule() {
  if (!isolatedModule) return;
  explodeModuleKey = isolatedModule;
  explodeActive = true;
  document.getElementById("explodeBtn").classList.add("active");
  // Reset positions for non-module parts to original
  parts.forEach(function(p) {
    var pg = p.group || getModuleKey(p.code || "");
    if (pg !== explodeModuleKey) {
      var m = meshMap.get(p.id);
      var e = edgeLineMap.get(p.id);
      var orig = originalPositions.get(p.id);
      if (m && orig) m.position.copy(orig);
      if (e && orig) e.position.copy(orig);
    }
  });
  explodeProgress = 0;
  animateExplodeTo(1);
}
function applyXray() {
  meshMap.forEach((xrayMesh, xrayId) => {
    // Сброс прозрачности для ВСЕХ — включая скрытые, иначе при показе останется плёнка
    if (!xrayActive) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
      xrayMesh.material.roughness = 0.78;
      xrayMesh.material.needsUpdate = true;
      return;
    }
    if (selectedId !== null && xrayId === selectedId) {
      xrayMesh.material.transparent = false;
      xrayMesh.material.opacity = 1;
      xrayMesh.material.roughness = 0.78;
    } else {
      xrayMesh.material.transparent = true;
      xrayMesh.material.opacity = 0.28;
      xrayMesh.material.roughness = 0.92;
    }
    xrayMesh.material.needsUpdate = true;
  });

  needsRender = true;
}
function toggleXray() {
  xrayActive = !xrayActive;
  document.getElementById("xrayBtn").classList.toggle("active", xrayActive);
  if (!xrayActive) {
    meshMap.forEach(m => {
      m.material.transparent = false;
      m.material.opacity = 1;
      m.material.roughness = 0.78;
      m.material.needsUpdate = true;
    });
  } else {
    applyXray();
  }
}
function toggleExplode() {
  explodeActive = !explodeActive;
  document.getElementById("explodeBtn").classList.toggle("active", explodeActive);
  if (!explodeActive) {
    explodeModuleKey = null;
    animateExplodeTo(0);
  } else {
    if (isolatedModule) { explodeModuleKey = isolatedModule; }
    else { explodeModuleKey = null; }
    animateExplodeTo(1);
  }
}
function animateExplodeTo(target) {
  const startVal = explodeProgress;
  const startTime = performance.now();
  const duration = 600;
  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = progress < 0.5 ? progress * 2 * progress : 1 - Math.pow(progress * -2 + 2, 2) / 2;
    explodeProgress = startVal + (target - startVal) * eased;
    applyExplode();
    needsRender = true;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}
function applyExplode() {
  if (!originalPositions.size) return;
  _tmpCenter.set(0, 0, 0);
  var count = 0;
  if (explodeModuleKey && moduleMap.has(explodeModuleKey)) {
    var modParts = moduleMap.get(explodeModuleKey);
    modParts.forEach(p => {
      var pos = originalPositions.get(p.id);
      if (pos) { _tmpCenter.add(pos); count++; }
    });
  } else {
    originalPositions.forEach(origCenter => {
      _tmpCenter.add(origCenter);
      count++;
    });
  }
  if (count > 0) _tmpCenter.divideScalar(count);
  parts.forEach(part => {
    if (explodeModuleKey) {
      var partGroup = part.group || getModuleKey(part.code || "");
      if (partGroup !== explodeModuleKey) return;
    }
    const explodeMesh = meshMap.get(part.id);
    const explodeEdge = edgeLineMap.get(part.id);
    const origPos = originalPositions.get(part.id);
    if (!explodeMesh || !origPos) return;
    _tmpDir.subVectors(origPos, _tmpCenter);
    const dist = _tmpDir.length();
    if (dist > 0.001) _tmpDir.normalize();
    const offset = explodeProgress * dist * 0.8;
    _tmpNewPos.copy(origPos).addScaledVector(_tmpDir, offset);
    _tmpDelta.subVectors(_tmpNewPos, origPos);
    explodeMesh.position.copy(_tmpNewPos);
    if (explodeEdge) explodeEdge.position.copy(_tmpNewPos);
    // Detail meshes are children of panel mesh — they move automatically
  });

  needsRender = true;
}
function toggleAssembly() {
  assemblyMode = !assemblyMode;
  document.getElementById("assembleBtn").classList.toggle("active", assemblyMode);
  document.getElementById("assemblyOverlay").classList.toggle("active", assemblyMode);
  if (assemblyMode) {
    buildAssemblyOrder();
    assemblyIndex = 0;
    assemblyPrevIndex = -1;
    updateAssemblyStep();
    autoRotate = false;
  } else {
    stopAssemblyPlay();
  }
}
function buildAssemblyOrder() {
  const sortedKeys = Array.from(moduleMap.keys()).sort();
  assemblyOrder = [];
  sortedKeys.forEach(key => {
    const moduleParts = moduleMap.get(key);
    if (moduleParts) {
      moduleParts.forEach(part => assemblyOrder.push(part));
    }
  });
  if (assemblyOrder.length === 0) {
    assemblyOrder = [...parts];
  }
}
function updateAssemblyStep() {
  if (assemblyOrder.length === 0) return;
  const currentPart = assemblyOrder[assemblyIndex];
  if (!currentPart) return;
  document.getElementById("assemblyStepLabel").textContent = "Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length;
  const partLabel = currentPart.position ? currentPart.code + " / " + currentPart.position : currentPart.code;
  document.getElementById("assemblyInfo").textContent = partLabel + " — " + (currentPart.name || "—");
  // Only reset previous step (not all meshes — saves O(N) per step)
  if (assemblyPrevIndex >= 0 && assemblyPrevIndex !== assemblyIndex) {
    var prevPart = assemblyOrder[assemblyPrevIndex];
    if (prevPart) {
      var prevAsmMesh = meshMap.get(prevPart.id);
      var prevAsmEdge = edgeLineMap.get(prevPart.id);
      if (prevAsmMesh) {
        prevAsmMesh.material.emissive.setHex(0);
        prevAsmMesh.material.emissiveIntensity = 0;
        prevAsmMesh.material.transparent = false;
        prevAsmMesh.material.opacity = 0.15;
        prevAsmMesh.material.needsUpdate = true;
      }
      if (prevAsmEdge) {
        prevAsmEdge.visible = true;
        prevAsmEdge.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
        prevAsmEdge.material.opacity = 0.15;
        prevAsmEdge.material.needsUpdate = true;
      }
    }
  } else if (assemblyPrevIndex === -1) {
    // First step — dim all meshes once
    meshMap.forEach((asmMesh) => {
      asmMesh.material.emissive.setHex(0);
      asmMesh.material.emissiveIntensity = 0;
      asmMesh.material.transparent = false;
      asmMesh.material.opacity = 0.15;
      asmMesh.material.needsUpdate = true;
    });
    edgeLineMap.forEach(asmEdge => {
      asmEdge.visible = true;
      asmEdge.material.color.setHex(isDarkTheme ? 0x1a1a1a : 0x888888);
      asmEdge.material.opacity = 0.15;
      asmEdge.material.needsUpdate = true;
    });
  }
  assemblyPrevIndex = assemblyIndex;
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
  }
  startSmoothZoom(currentPart.id);
  updateSheet(currentPart);
  openSheet();
  renderPartsList();
  showToast("🔧 Шаг " + (assemblyIndex + 1) + "/" + assemblyOrder.length + ": " + (currentPart.name || currentPart.code));

  needsRender = true;
}
function stopAssemblyPlay() {
  assemblyPlaying = false;
  if (assemblyTimer) {
    clearInterval(assemblyTimer);
  }
  assemblyTimer = null;
  document.getElementById("asmPlay").innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
}
function toggleAssemblyPlay() {
  if (assemblyPlaying) {
    stopAssemblyPlay();
  } else {
    assemblyPlaying = true;
    document.getElementById("asmPlay").innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    assemblyTimer = setInterval(() => {
      assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
      updateAssemblyStep();
    }, 1500);
  }
}
function updateSummary() {
  if (parts.length === 0) {
    document.getElementById("materialSummary").style.display = "none";
    return;
  }
  document.getElementById("materialSummary").style.display = "block";
  const materialStats = {};
  let totalMass = 0;
  parts.forEach(part => {
    const matName = part.material || "Неизвестно";
    if (!materialStats[matName]) {
      materialStats[matName] = {
        count: 0,
        totalArea: 0
      };
    }
    materialStats[matName].count++;
    if (part.L && part.W) {
      materialStats[matName].totalArea += part.L * part.W / 1000000;
    }
    if (part.L && part.W && part.T) {
      totalMass += part.L * part.W * part.T / 1000 * 6.5e-7;
    }
  });
  const moduleCount = moduleMap.size;
  let summaryHtml = "\n      <div class=\"summary-row\"><span class=\"summary-label\">Всего деталей:</span><span class=\"summary-val\">" + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Модулей:</span><span class=\"summary-val\">" + moduleCount + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Собрано:</span><span class=\"summary-val\" style=\"color:var(--success)\">" + scannedSet.size + " / " + parts.length + "</span></div>\n      <div class=\"summary-row\"><span class=\"summary-label\">Масса:</span><span class=\"summary-val\">≈ " + totalMass.toFixed(1) + " кг</span></div>\n      <div style=\"margin-top:4px;border-top:1px solid var(--border);padding-top:4px\">\n    ";
  const sortedMats = Object.entries(materialStats).sort((a, b) => b[1].count - a[1].count);
  sortedMats.slice(0, 6).forEach(([mat, stats]) => {
    summaryHtml += "<div class=\"summary-row\"><span class=\"summary-label\" style=\"font-size:8px\">" + escapeHtml(mat.substring(0, 30)) + "</span><span class=\"summary-val\" style=\"font-size:9px\">" + stats.count + " шт</span></div>";
  });
  summaryHtml += "</div>";
  document.getElementById("summaryContent").innerHTML = summaryHtml;
}
function updateStats() {
  const total = parts.length;
  const scanned = scannedSet.size;
  const percent = total > 0 ? Math.round(scanned / total * 100) : 0;
  document.getElementById("totalCount").textContent = total;
  document.getElementById("scannedCount").textContent = scanned;
  document.getElementById("progressFill").style.width = percent + "%";
  const fastenerInfo = document.getElementById("fastenerCount");
  if (fastenerInfo) {
    fastenerInfo.textContent = fastenerData.length ? "🔧 " + fastenerData.length : "";
  }
}
let _renderPartsScheduled = false;
function renderPartsList() {
  if (_renderPartsScheduled) return;
  _renderPartsScheduled = true;
  requestAnimationFrame(_doRenderPartsList);
}
function _doRenderPartsList() {
  _renderPartsScheduled = false;
  const container = document.getElementById("partsList");
  if (!container) return;
  const searchVal = document.getElementById("searchInput")?.value.toLowerCase() || "";
  if (parts.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:11px">📁 Загрузите JSON файл для начала</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  if (searchVal) {
    var filteredParts = parts.filter(p => (p.name || "").toLowerCase().includes(searchVal) || (p.code || "").toLowerCase().includes(searchVal) || (p.position || "").toLowerCase().includes(searchVal));
    if (filteredParts.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary);font-size:11px">🔍 Ничего не найдено</div>';
      return;
    }
    filteredParts.forEach(part => fragment.appendChild(createPartItem(part)));
    container.innerHTML = "";
    container.appendChild(fragment);
    return;
  }
  const sortedModules = Array.from(moduleMap.keys()).sort((a, b) => {
    if (a === "HARDWARE") {
      return 1;
    }
    if (b === "HARDWARE") {
      return -1;
    }
    const aPrefix = a.replace(/_\d+$/, "");
    const bPrefix = b.replace(/_\d+$/, "");
    if (aPrefix !== bPrefix) {
      return aPrefix.localeCompare(bPrefix);
    }
    const aNum = parseInt(a.match(/\d+$/)?.[0] || "0");
    const bNum = parseInt(b.match(/\d+$/)?.[0] || "0");
    return aNum - bNum;
  });
  sortedModules.forEach(moduleKey => {
    const moduleParts = moduleMap.get(moduleKey);
    if (!moduleParts) {
      return;
    }
    // Get groupName from first part in module
    const displayName = (moduleParts[0] && moduleParts[0].groupName) ? moduleParts[0].groupName : getModuleName(moduleKey === "HARDWARE" ? "D-000" : moduleKey + "_00");
    const dotColor = moduleKey === "HARDWARE" ? "#94a3b8" : getModuleColor(moduleKey + "_00");
    const scannedCount = moduleParts.filter(p => scannedSet.has(p.id)).length;
    const groupEl = document.createElement("div");
    groupEl.className = "module-group";
    groupEl.innerHTML = "\n        <div class=\"module-header\" data-module=\"" + moduleKey + "\">\n          <div class=\"module-dot\" style=\"background:" + dotColor + "\"></div>\n          <span class=\"module-name\">" + escapeHtml(displayName) + "</span>\n          <span class=\"module-count\">" + scannedCount + "/" + moduleParts.length + "</span>\n          <span class=\"module-arrow open\">▶</span>\n        </div>\n        <div class=\"module-parts\" data-module-parts=\"" + moduleKey + "\"></div>\n      ";
    const headerEl = groupEl.querySelector(".module-header");
    // Add isolate button to module header
    var isolateBtn = document.createElement("button");
    isolateBtn.className = "module-isolate-btn";
    isolateBtn.textContent = "\u2299";
    isolateBtn.title = "Изолировать модуль";
    isolateBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      isolateModule(moduleKey);
    });
    var arrowEl = headerEl.querySelector(".module-arrow");
    if (arrowEl) headerEl.insertBefore(isolateBtn, arrowEl);
    const partsContainer = groupEl.querySelector(".module-parts");
    headerEl.addEventListener("click", (e) => {
      if (e.target.closest(".module-isolate-btn")) return;
      partsContainer.classList.toggle("collapsed");
      headerEl.querySelector(".module-arrow").classList.toggle("open");
    });
    // Long-press to isolate
    var pressTimer = null;
    headerEl.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => isolateModule(moduleKey), 500);
    }, { passive: true });
    headerEl.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });
    headerEl.addEventListener("touchmove", () => clearTimeout(pressTimer), { passive: true });
    moduleParts.forEach(part => partsContainer.appendChild(createPartItem(part)));
    fragment.appendChild(groupEl);
  });
  container.innerHTML = "";
  container.appendChild(fragment);
}
function createPartItem(part) {
  const isHidden = hiddenSet.has(part.id);
  const isScanned = scannedSet.has(part.id);
  const itemEl = document.createElement("div");
  itemEl.className = "part-item " + (selectedId === part.id ? "active" : "");
  itemEl.style.opacity = isHidden ? "0.4" : "1";
  const displayId = idMode === "position" ? part.position || part.code || "—" : part.code || "—";
  const moduleColor = getModuleColor(idMode === "position" ? part.position || part.code || "" : part.code || "");
  itemEl.innerHTML = "\n      <div class=\"part-swatch\" style=\"background:" + getColor(part.material, part) + ";border-left:3px solid " + moduleColor + "\"></div>\n      <div class=\"part-info\">\n        <div class=\"part-name\">" + escapeHtml(part.name || "—") + "</div>\n        <div class=\"part-code\">" + escapeHtml(displayId) + "</div>\n        <div class=\"part-dims\">" + (part.gab ? part.gab.w + "×" + part.gab.h + "×" + part.gab.d + " мм" : "") + "</div>\n      </div>\n      <div class=\"check " + (isScanned ? "done" : "") + "\">" + (isScanned ? "✅" : "○") + "</div>\n    ";
  itemEl.addEventListener("click", () => selectPart(part.id));
  return itemEl;
}
function showStats() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const materialCounts = {};
  let totalMass = 0;
  let totalArea = 0;
  parts.forEach(part => {
    const matName = part.material || "Неизвестно";
    if (!materialCounts[matName]) {
      materialCounts[matName] = 0;
    }
    materialCounts[matName]++;
    if (part.L && part.W && part.T) {
      totalMass += part.L * part.W * part.T / 1000 * 6.5e-7;
      totalArea += part.L * part.W / 1000000;
    }
  });
  let html = "\n      <div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px\">\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + parts.length + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">деталей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--accent)\">" + moduleMap.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">модулей</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--success)\">" + scannedSet.size + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">собрано</div>\n        </div>\n        <div style=\"background:var(--bg-tertiary);padding:10px;border-radius:8px;text-align:center\">\n          <div style=\"font-size:20px;font-weight:800;color:var(--warning)\">≈" + totalMass.toFixed(1) + "</div>\n          <div style=\"font-size:9px;color:var(--text-secondary)\">кг масса</div>\n        </div>\n      </div>\n      <div style=\"font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px\">МАТЕРИАЛЫ:</div>\n    ";
  Object.entries(materialCounts).sort((a, b) => b[1] - a[1]).forEach(([mat, count]) => {
    html += "<div style=\"display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)\">\n        <span style=\"color:var(--text-primary)\">" + escapeHtml(mat) + "</span>\n        <span style=\"color:var(--accent);font-weight:600\">" + count + " шт</span>\n      </div>";
  });
  if (fastenerData.length) {
    const fastenerTypeCounts = {};
    fastenerData.forEach(f => {
      const t = f.type || "Прочее";
      if (!fastenerTypeCounts[t]) fastenerTypeCounts[t] = 0;
      fastenerTypeCounts[t]++;
    });
    html += "<div style=\"font-size:10px;font-weight:700;color:#ff9800;margin:10px 0 6px\">ФУРНИТУРА (" + fastenerData.length + "):</div>";
    Object.entries(fastenerTypeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      html += "<div style=\"display:flex;justify-content:space-between;padding:3px 0;font-size:10px;border-bottom:1px solid var(--border)\">\n        <span style=\"color:var(--text-primary)\">" + escapeHtml(type) + "</span>\n        <span style=\"color:#ff9800;font-weight:600\">" + count + " шт</span>\n      </div>";
    });
  }
  document.getElementById("statsContent").innerHTML = html;
  document.getElementById("statsModal").classList.remove("hidden");
}
function printSpecification() {
  if (parts.length === 0) {
    showToast("📁 Сначала загрузите JSON");
    return;
  }
  const printWin = window.open("", "_blank");
  let printHtml = "<html><head><title>Спецификация</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0;font-weight:700}.mod{background:#e8e8ff;font-weight:700}</style></head><body>";
  printHtml += "<h2>Спецификация — " + document.getElementById("projectTitle").textContent + "</h2>";
  printHtml += "<p>Всего деталей: " + parts.length + " | Собрано: " + scannedSet.size + "</p>";
  printHtml += "<table><tr><th>#</th><th>Обозначение</th><th>Позиция</th><th>Наименование</th><th>Материал</th><th>Размеры (мм)</th><th>Статус</th></tr>";
  let lastModule = "";
  parts.forEach((part, idx) => {
    const partCode = idMode === "position" ? part.position || part.code || "" : part.code || "";
    const modKey = getModuleKey(partCode);
    if (modKey !== lastModule) {
      lastModule = modKey;
      printHtml += "<tr><td colspan=\"7\" class=\"mod\">" + escapeHtml(getModuleName(modKey === "HARDWARE" ? "D-000" : modKey + "_0")) + "</td></tr>";
    }
    const statusIcon = scannedSet.has(part.id) ? "✅" : "○";
    const dims = part.gab ? part.gab.w + "×" + part.gab.h + "×" + part.gab.d : (part.L || "—") + "×" + (part.W || "—") + "×" + (part.T || "—");
    printHtml += "<tr><td>" + (idx + 1) + "</td><td>" + escapeHtml(part.code || "") + "</td><td>" + escapeHtml(part.position || "") + "</td><td>" + escapeHtml(part.name || "") + "</td><td>" + escapeHtml(part.material || "") + "</td><td>" + dims + "</td><td>" + statusIcon + "</td></tr>";
  });
  printHtml += "</table>";
  if (fastenerData.length) {
    printHtml += "<h3 style=\"margin-top:20px\">Фурнитура (" + fastenerData.length + ")</h3>";
    printHtml += "<table><tr><th>#</th><th>Тип</th><th>Наименование</th><th>Привязка</th></tr>";
    fastenerData.forEach((f, idx) => {
      printHtml += "<tr><td>" + (idx + 1) + "</td><td>" + escapeHtml(f.type || "") + "</td><td>" + escapeHtml(f.name || "") + "</td><td>" + escapeHtml(f.ownerCode || "—") + "</td></tr>";
    });
    printHtml += "</table>";
  }
  printHtml += "</body></html>";
  printWin.document.write(printHtml);
  printWin.document.close();
  printWin.print();
}
let scanInterval;
let videoStream;
let scanRAF = null;
let scanLastTime = 0;
function openScanner() {
  document.getElementById("scannerModal").classList.remove("hidden");
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment"
    }
  }).then(stream => {
    videoStream = stream;
    const videoEl2 = document.getElementById("video");
    videoEl2.srcObject = stream;
    videoEl2.play();
    startQRScan();
  }).catch(() => showToast("❌ Нет доступа к камере"));
}
function closeScanner() {
  document.getElementById("scannerModal").classList.add("hidden");
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
  if (scanInterval) {
    clearInterval(scanInterval);
  }
  if (scanRAF) {
    cancelAnimationFrame(scanRAF);
    scanRAF = null;
  }
}
function startQRScan() {
  const videoEl = document.getElementById("video");
  const qrCanvas = document.getElementById("qrCanvas");
  const qrCtx = qrCanvas.getContext("2d");
  scanLastTime = 0;
  function scanFrame(now) {
    if (now - scanLastTime < 180) {
      scanRAF = requestAnimationFrame(scanFrame);
      return;
    }
    scanLastTime = now;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      qrCanvas.width = videoEl.videoWidth;
      qrCanvas.height = videoEl.videoHeight;
      qrCtx.drawImage(videoEl, 0, 0);
      const imgData = qrCtx.getImageData(0, 0, qrCanvas.width, qrCanvas.height);
      const qrResult = jsQR(imgData.data, imgData.width, imgData.height);
      if (qrResult) {
        handleScan(qrResult.data);
        closeScanner();
        return;
      }
    }
    scanRAF = requestAnimationFrame(scanFrame);
  }
  scanRAF = requestAnimationFrame(scanFrame);
}
function handleManualCode() {
  const manualVal = document.getElementById("manualCode").value.trim();
  if (manualVal) {
    handleScan(manualVal);
    closeScanner();
  }
}
function handleScan(scanData) {
  let foundPart;
  if (idMode === "position") {
    foundPart = parts.find(p => p.position === scanData || p.position?.trim() === scanData.trim() || p.position?.toLowerCase() === scanData.toLowerCase());
    if (!foundPart) {
      foundPart = parts.find(p => scanData.includes(p.position) || p.position?.includes(scanData));
    }
  } else {
    foundPart = parts.find(p => p.code === scanData || p.code?.trim() === scanData.trim() || p.code?.toLowerCase() === scanData.toLowerCase());
    if (!foundPart) {
      foundPart = parts.find(p => scanData.includes(p.code) || p.code?.includes(scanData));
    }
  }
  if (!foundPart) {
    showToast("❌ Деталь не найдена");
    return;
  }
  scannedSet.add(foundPart.id);
  updateStats();
  selectPart(foundPart.id);
  startSmoothZoom(foundPart.id);
  showToast("✅ " + foundPart.name);
  saveProgress();
  renderPartsList();
}
function saveProgress() {
  localStorage.setItem("aivoProgress", JSON.stringify({
    scanned: Array.from(scannedSet),
    hidden: Array.from(hiddenSet),
    projectTitle: document.getElementById("projectTitle").textContent
  }));
}
function loadProgress() {
  const saved = JSON.parse(localStorage.getItem("aivoProgress") || "{}");
  if (saved.scanned) {
    scannedSet = new Set(saved.scanned);
  }
  if (saved.hidden) {
    hiddenSet = new Set(saved.hidden);
  }
}
function resetProgress() {
  if (confirm("Сбросить весь прогресс сборки?")) {
    scannedSet.clear();
    hiddenSet.clear();
    meshMap.forEach(m => m.visible = true);
    edgeLineMap.forEach(e => e.visible = true);
    selectedId = null;
    updateSheet(null);
    closeSheet();
    updateStats();
    renderPartsList();
    localStorage.removeItem("aivoProgress");
    showToast("🔄 Прогресс сброшен");
  }
}
function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerBackdrop").style.display = "block";
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawerBackdrop").style.display = "none";
}
function openSheet() {
  document.getElementById("bottomSheet").classList.add("open");
}
function closeSheet() {
  var bs = document.getElementById("bottomSheet");
  bs.classList.remove("open");
  bs.removeAttribute("data-state");
  sheetCollapsed = false;
}
function escapeHtml(str) {
  return (str || "").replace(/[&<>]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  })[char]);
}
function showToast(message) {
  let toastEl = document.getElementById("customToast");
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "customToast";
    toastEl.className = "toast";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove("show"), 2000);
}
document.getElementById("themeToggle").addEventListener("click", toggleTheme);
document.getElementById("uploadBtn").addEventListener("click", () => document.getElementById("fileInput").click());
document.getElementById("fileInput").addEventListener("change", changeEvent => {
  const file = changeEvent.target.files[0];
  if (!file) {
    return;
  }
  document.getElementById("loadingOverlay").classList.add("show");
  const reader = new FileReader();
  reader.onload = loadEvent => {
    try {
      const jsonData = JSON.parse(loadEvent.target.result);
      parts = jsonData.parts || jsonData;
      fastenerData = jsonData.fasteners || [];
      dimsData = jsonData.dims || [];
      var loadedHoles = jsonData.holes || [];
      window._loadedHoles = loadedHoles;
      parts.forEach((part, index) => {
        if (part.id === undefined) {
          part.id = index;
        }
      });
      autoLayout(parts);
      buildScene();
      selectedId = null;
      loadProgress();
      centerCamera();
      closeDrawer();
      updateStats();
      showToast("✅ Загружено " + parts.length + " деталей");
      if (dimsData.length) {
        showToast("📐 " + dimsData.length + " размеров из БАЗИС");
      }      document.getElementById("projectTitle").textContent = file.name.replace(".json", "");
      saveProgress();
    } catch (err) {
      showToast("❌ Ошибка файла: " + err.message);
    } finally {
      document.getElementById("loadingOverlay").classList.remove("show");
    }
  };
  reader.readAsText(file, "UTF-8");
});
document.getElementById("menuBtn").addEventListener("click", openDrawer);
document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
document.getElementById("closeDrawerBtn").addEventListener("click", closeDrawer);
document.getElementById("closeSheetBtn").addEventListener("click", closeSheet);

document.getElementById("scanBtn").addEventListener("click", openScanner);
document.getElementById("hideBtn").addEventListener("click", () => {
  if (selectedId !== null) { toggleVisibility(selectedId); }
});
document.getElementById("showAllBtn").addEventListener("click", showAllParts);
document.getElementById("rotateBtn").addEventListener("click", () => {
  autoRotate = !autoRotate;
});
document.getElementById("resetViewBtn").addEventListener("click", () => {
  isSmoothZoom = false;
  autoRotate = false;
  centerCamera();
});
document.getElementById("focusBtn").addEventListener("click", () => {
  if (selectedId !== null) {
    startSmoothZoom(selectedId);
  } else {
    showToast("Сначала выберите деталь");
  }
});
document.getElementById("xrayBtn").addEventListener("click", toggleXray);
document.getElementById("explodeBtn").addEventListener("click", toggleExplode);
document.getElementById("assembleBtn").addEventListener("click", toggleAssembly);
document.getElementById("resetProgressBtn").addEventListener("click", resetProgress);
document.getElementById("printBtn").addEventListener("click", printSpecification);
document.getElementById("statsBtn").addEventListener("click", showStats);
document.getElementById("csgBtn").addEventListener("click", toggleCSGVisibility);
document.getElementById("dimsBtn").addEventListener("click", toggleDims);
document.getElementById("closeScannerBtn").addEventListener("click", closeScanner);
document.getElementById("scannerModal").addEventListener("click", function(e) { if (e.target === this) closeScanner(); });
document.getElementById("statsModal").addEventListener("click", function(e) { if (e.target === this) this.classList.add("hidden"); });
document.getElementById("manualSubmit").addEventListener("click", handleManualCode);
document.getElementById("searchInput").addEventListener("input", renderPartsList);
document.querySelectorAll(".id-mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    idMode = btn.dataset.mode;
    localStorage.setItem("aivoIdMode", idMode);
    document.querySelectorAll(".id-mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    buildModuleMap();
    renderPartsList();
  });
});
// Initialize ID-mode toggle active state
document.querySelector('.id-mode-btn[data-mode="' + idMode + '"]')?.classList.add('active');
document.getElementById("asmPrev").addEventListener("click", () => {
  if (assemblyOrder.length === 0) {
    return;
  }
  assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
  updateAssemblyStep();
});
document.getElementById("asmNext").addEventListener("click", () => {
  if (assemblyOrder.length === 0) {
    return;
  }
  assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
  updateAssemblyStep();
});
document.getElementById("asmPlay").addEventListener("click", toggleAssemblyPlay);
document.getElementById("asmClose").addEventListener("click", toggleAssembly);

// === UX IMPROVEMENTS ===

// 2.1 Drag-and-drop file upload
(function() {
  const canvas = document.getElementById('canvas3d');
  const overlay = document.getElementById('dropOverlay');
  let dragCounter = 0;

  canvas.addEventListener('dragenter', function(e) {
    e.preventDefault();
    dragCounter++;
    overlay.style.display = 'flex';
  });
  canvas.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.style.display = 'none'; }
  });
  canvas.addEventListener('dragover', function(e) { e.preventDefault(); });
  canvas.addEventListener('drop', function(e) {
    e.preventDefault();
    dragCounter = 0;
    overlay.style.display = 'none';
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.json')) {
      showToast('❌ Только JSON файлы');
      return;
    }
    document.getElementById('loadingOverlay').classList.add('show');
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const data = JSON.parse(ev.target.result);
        parts = data.parts || data;
        fastenerData = data.fasteners || [];
        dimsData = data.dims || [];
        var loadedHoles = data.holes || [];
        window._loadedHoles = loadedHoles;
        parts.forEach(function(p, i) { if (p.id === undefined) p.id = i; });
        autoLayout(parts);
        buildScene();
        selectedId = null;
        loadProgress();
        centerCamera();
        closeDrawer();
        updateStats();
        showToast('✅ Загружено ' + parts.length + ' деталей');
        if (dimsData.length) {
          showToast('📐 ' + dimsData.length + ' размеров из БАЗИС');
        }        requestWakeLock();
        document.getElementById('projectTitle').textContent = file.name.replace('.json', '');
        saveProgress();
      } catch (err) {
        showToast('❌ Ошибка файла: ' + err.message);
      } finally {
        document.getElementById('loadingOverlay').classList.remove('show');
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
})();

// 2.2 Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Don't handle shortcuts when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch(e.key) {
    case 'Escape':
      closeDrawer();
      closeSheet();
      document.getElementById('scannerModal').classList.add('hidden');
      document.getElementById('statsModal').classList.add('hidden');
      document.getElementById('onboardingModal').classList.add('hidden');
      break;
    case 'r':
    case 'R':
      if (!e.ctrlKey && !e.metaKey) {
        isSmoothZoom = false;
        autoRotate = false;
        centerCamera();
        showToast('🎯 Вид сброшен');
      }
      break;
    case 'x':
    case 'X':
      if (!e.ctrlKey && !e.metaKey) toggleXray();
      break;
    case 'e':
    case 'E':
      if (!e.ctrlKey && !e.metaKey) toggleExplode();
      break;
    case 'f':
    case 'F':
      if (!e.ctrlKey && !e.metaKey) {
        if (selectedId !== null) { startSmoothZoom(selectedId); }
        else { showToast('Сначала выберите деталь'); }
      }
      break;
    case 'd':
    case 'D':
      if (!e.ctrlKey && !e.metaKey) toggleDims();
      break;
    case 'ArrowLeft':
      if (assemblyMode && assemblyOrder.length > 0) {
        e.preventDefault();
        assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
        updateAssemblyStep();
      }
      break;
    case 'ArrowRight':
      if (assemblyMode && assemblyOrder.length > 0) {
        e.preventDefault();
        assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
        updateAssemblyStep();
      }
      break;
    case ' ':
      if (assemblyMode) {
        e.preventDefault();
        toggleAssemblyPlay();
      }
      break;
  }
});

// 2.3 Swipe navigation for assembly overlay
(function() {
  const overlay = document.getElementById('assemblyOverlay');
  let touchStartX = 0;
  let touchStartY = 0;

  overlay.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  overlay.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // Swipe left -> next
        assemblyIndex = (assemblyIndex + 1) % assemblyOrder.length;
      } else {
        // Swipe right -> prev
        assemblyIndex = (assemblyIndex - 1 + assemblyOrder.length) % assemblyOrder.length;
      }
      updateAssemblyStep();
    }
  }, { passive: true });
})();

// End UX improvements


// === Mobile sheet expand/collapse ===
(function() {
  var preview = document.getElementById('sheetPreview');
  var bottomSheet = document.getElementById('bottomSheet');
  if (!preview || !bottomSheet) return;
  
  // Click to expand
  preview.addEventListener('click', function() {
    if (sheetCollapsed) {
      bottomSheet.removeAttribute('data-state');
      sheetCollapsed = false;
    }
  });
  
  // Touch swipe up to expand
  var touchStartY = 0;
  preview.addEventListener('touchstart', function(e) {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  preview.addEventListener('touchend', function(e) {
    var dy = e.changedTouches[0].clientY - touchStartY;
    if (dy < -20 && sheetCollapsed) {
      bottomSheet.removeAttribute('data-state');
      sheetCollapsed = false;
    }
  }, { passive: true});
  
  // Swipe down on sheet header to collapse (mobile only)
  var handle = bottomSheet.querySelector('.sheet-handle');
  if (handle) {
    var handleStartY = 0;
    handle.addEventListener('touchstart', function(e) {
      handleStartY = e.touches[0].clientY;
    }, { passive: true });
    handle.addEventListener('touchend', function(e) {
      var dy = e.changedTouches[0].clientY - handleStartY;
      if (dy > 30 && isMobileSheet() && !sheetCollapsed) {
        bottomSheet.setAttribute('data-state', 'collapsed');
        sheetCollapsed = true;
      }
    }, { passive: true });
  }
})();


// === Block Mode Toggle ===
function toggleBlockMode() {
  blockMode = !blockMode;
  var btn = document.getElementById("blockModeBtn");
  if (btn) btn.classList.toggle("active", blockMode);
  showToast(blockMode ? "Режим блоков: ВКЛ" : "Режим блоков: ВЫКЛ");
}

function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  if (autoRotate && !isDragging && !isSmoothZoom) {
    theta += 0.0025;
    updateCamera();
  }
  if (isSmoothZoom) {
    animateSmoothZoom();
    needsRender = true;
  }
  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}
let _resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    needsRender = true;
  }, 100);
});
initTheme();
try {
  initThree();
} catch(e) {
  console.error('3D initialization failed:', e);
  document.getElementById('loadingOverlay').innerHTML = '<div style="text-align:center;color:#ff6b6b;padding:20px"><div style="font-size:32px;margin-bottom:12px">⚠️</div><div style="font-size:14px">Ошибка инициализации 3D</div><div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">' + e.message + '</div></div>';
  document.getElementById('loadingOverlay').classList.add('show');
}
updateStats();


// === Isolation bar handlers ===
document.getElementById("isolationExitBtn").addEventListener("click", exitIsolation);
document.getElementById("isolationExplodeBtn").addEventListener("click", explodeIsolatedModule);


// Block mode toggle
var blockModeBtnEl = document.getElementById("blockModeBtn");
if (blockModeBtnEl) blockModeBtnEl.addEventListener("click", toggleBlockMode);

// === Auth & Device Logic ===
let currentUser = null;
let userDeviceLimit = 5;
async function getDeviceFingerprint() {
  const components = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, screen.colorDepth, new Date().getTimezoneOffset(), navigator.hardwareConcurrency || "unknown"];
  const fingerprintStr = components.join("|");
  let hash = 0;
  for (let i = 0; i < fingerprintStr.length; i++) {
    const charCode = fingerprintStr.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash = hash & hash;
  }
  return "fp_" + Math.abs(hash).toString(36);
}
function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) {
    return "iPhone";
  }
  if (/iPad/.test(ua)) {
    return "iPad";
  }
  if (/Android/.test(ua)) {
    const uaMatch = ua.match(/;\s*([^;]+)\s*Build/);
    if (uaMatch) {
      return uaMatch[1].trim();
    } else {
      return "Android Device";
    }
  }
  if (/Windows/.test(ua)) {
    return "Windows PC";
  }
  if (/Mac/.test(ua)) {
    return "Mac";
  }
  if (/Linux/.test(ua)) {
    return "Linux PC";
  }
  return "Unknown Device";
}
async function checkDeviceLimit(user) {
  const fingerprint = await getDeviceFingerprint();
  const deviceName = getDeviceName();
  const devicesRef = db.collection("users").doc(user.uid).collection("devices");
  const deviceDoc = await devicesRef.doc(fingerprint).get();
  if (deviceDoc.exists) {
    await devicesRef.doc(fingerprint).update({
      lastAccess: firebase.firestore.FieldValue.serverTimestamp()
    });
    return {
      allowed: true
    };
  }
  const devicesSnap = await devicesRef.get();
  const deviceCount = devicesSnap.size;
  const userDoc = await db.collection("users").doc(user.uid).get();
  const limit = userDoc.data()?.deviceLimit || 5;
  userDeviceLimit = limit;
  if (deviceCount >= limit) {
    return {
      allowed: false,
      deviceCount: deviceCount,
      deviceLimit: limit,
      message: "Лимит устройств исчерпан (" + deviceCount + "/" + limit + ")"
    };
  }
  await devicesRef.doc(fingerprint).set({
    name: deviceName,
    fingerprint: fingerprint,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
  });
  return {
    allowed: true,
    deviceCount: deviceCount + 1,
    deviceLimit: limit
  };
}
async function handleLogin() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const errorEl = document.getElementById("loginError");
  const loginBtn = document.getElementById("loginBtn");
  if (!email || !password) {
    errorEl.textContent = "Введите email и пароль";
    errorEl.classList.add("show");
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Вход...";
  errorEl.classList.remove("show");
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const authUser = cred.user;
    const deviceResult = await checkDeviceLimit(authUser);
    if (!deviceResult.allowed) {
      await auth.signOut();
      throw new Error(deviceResult.message);
    }
    currentUser = authUser;
    document.getElementById("deviceCountInfo").textContent = deviceResult.deviceCount;
    document.getElementById("deviceLimitInfo").textContent = deviceResult.deviceLimit;
    showMainApp();
  } catch (authErr) {
    let errMsg = "Ошибка авторизации";
    if (authErr.code === "auth/user-not-found") {
      errMsg = "Пользователь не найден";
    } else if (authErr.code === "auth/wrong-password") {
      errMsg = "Неверный пароль";
    } else if (authErr.code === "auth/invalid-email") {
      errMsg = "Некорректный email";
    } else if (authErr.code === "auth/too-many-requests") {
      errMsg = "Слишком много попыток. Подождите";
    } else {
      errMsg = authErr.message;
    }
    errorEl.textContent = errMsg;
    errorEl.classList.add("show");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Войти";
  }
}
function showLoginPage() {
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("mainApp").style.display = "none";
}
function showMainApp() {
  document.getElementById("loginPage").classList.remove("active");
  document.getElementById("mainApp").style.display = "block";
}
async function checkAccountDeadline(uid) {
  try {
    var doc = await db.collection('users').doc(uid).get();
    var data = doc.data();
    if (data && data.expiresAt) {
      var exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (new Date() > exp) {
        var days = Math.ceil((new Date() - exp) / 86400000);
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0c12;color:#fff;font-family:sans-serif;text-align:center;padding:20px"><div><div style="font-size:48px;margin-bottom:16px">&#x1f512;</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">&#x410;&#x43a;&#x43a;&#x430;&#x443;&#x43d;&#x442; &#x437;&#x430;&#x431;&#x43b;&#x43e;&#x43a;&#x438;&#x440;&#x43e;&#x432;&#x430;&#x43d;</div><div style="font-size:14px;color:#94a3b8;margin-bottom:16px">&#x421;&#x440;&#x43e;&#x43a; &#x434;&#x435;&#x439;&#x441;&#x442;&#x432;&#x438;&#x44f; &#x438;&#x441;&#x442;&#x451;&#x43a; ' + exp.toLocaleDateString('ru-RU') + ' (' + days + ' &#x434;&#x43d;.)</div><div style="font-size:12px;color:#64748b">&#x421;&#x432;&#x44f;&#x436;&#x438;&#x442;&#x435;&#x441;&#x44c; &#x441; &#x430;&#x434;&#x43c;&#x438;&#x43d;&#x438;&#x441;&#x442;&#x440;&#x430;&#x442;&#x43e;&#x440;&#x43e;&#x43c; &#x434;&#x43b;&#x44f; &#x43f;&#x440;&#x43e;&#x434;&#x43b;&#x435;&#x43d;&#x438;&#x44f;</div></div></div>';
        auth.signOut();
      }
    }
  } catch(e) { console.error("Account deadline check failed:", e); }
}

auth.onAuthStateChanged(authUser => {
  if (authUser) {
    currentUser = authUser;
    checkDeviceLimit(authUser).then(result => {
      if (result.allowed) {
        document.getElementById("deviceCountInfo").textContent = result.deviceCount;
        document.getElementById("deviceLimitInfo").textContent = result.deviceLimit;
        showMainApp();
        checkAccountDeadline(authUser.uid);
      } else {
        showLoginPage();
      }
    });
  } else {
    currentUser = null;
    showLoginPage();
  }
});
document.getElementById("authPassword").addEventListener("keypress", e => {
  if (e.key === "Enter") {
    handleLogin();
  }
});
document.getElementById("authEmail").addEventListener("keypress", e => {
  if (e.key === "Enter") {
    document.getElementById("authPassword").focus();
  }
});
let onboardStep = 0;
const onboardSteps = document.querySelectorAll(".onboard-step");
const onboardDots = document.querySelectorAll(".onboard-dot");
const onboardBtn = document.getElementById("onboardNext");
function showOnboarding() {
  const onboarded = localStorage.getItem("aivoOnboarded");
  if (onboarded) {
    return;
  }
  document.getElementById("onboardingModal").classList.remove("hidden");
}
function updateOnboardStep() {
  onboardSteps.forEach((step, idx) => step.style.display = idx === onboardStep ? "block" : "none");
  onboardDots.forEach((dot, idx) => {
    dot.style.background = idx === onboardStep ? "var(--accent)" : "var(--bg-tertiary)";
    dot.style.width = idx === onboardStep ? "20px" : "8px";
  });
  onboardBtn.textContent = onboardStep === onboardSteps.length - 1 ? "Начать!" : "Далее";
}
onboardBtn.addEventListener("click", () => {
  onboardStep++;
  if (onboardStep >= onboardSteps.length) {
    localStorage.setItem("aivoOnboarded", "1");
    document.getElementById("onboardingModal").classList.add("hidden");
    onboardStep = 0;
  } else {
    updateOnboardStep();
  }
});
const origShowMainApp = showMainApp;
showMainApp = function () {
  origShowMainApp();
  setTimeout(showOnboarding, 500);
};