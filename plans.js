// ============================================================
// ТАРИФЫ AIVO SCAN — одно место для цен.
// Используется страницей оплаты (buy.html) и админкой (admin.html).
// Поменять цену = поменять число здесь. Ключи (shop_month и т. д.) не менять:
// они записаны в заявках.
// ============================================================
window.AIVO_PLANS = {
  shop_month: { group: 'shop', title: 'Цех · месяц', short: 'Месяц', price: 2500, months: 1, devices: 5 },
  shop_year:  { group: 'shop', title: 'Цех · год',   short: 'Год',   price: 20000, months: 12, devices: 5 },
  solo_month: { group: 'solo', title: 'Сборщик · месяц', short: 'Месяц', price: 800, months: 1, devices: 2 },
  solo_year:  { group: 'solo', title: 'Сборщик · год',   short: 'Год',   price: 6500, months: 12, devices: 2 }
};

window.AIVO_PAY = {
  // Ссылка на оплату M Bank (QR в img/pay-mbank-qr.svg сделан из неё же)
  mbankUrl: 'https://app.mbank.kg/qr/#00020101021132440012c2c.mbank.kg01020210129967062060061302125204999953034175906ALI%20T.63040157',
  receiver: 'ALI T.',
  whatsapp: '996990551884'
};

window.aivoFormatSom = function (n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сом';
};
