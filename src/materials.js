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
