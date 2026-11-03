// ============================================================
// ПРОПУСК: работа без интернета не дольше OFFLINE_DAYS дней.
// При каждой удачной проверке в сети запоминаем: до какого числа оплачено,
// не заморожен ли аккаунт и когда была проверка (по времени сервера).
// Без интернета приложение пускает по пропуску, пока:
//   - не прошло OFFLINE_DAYS дней с последней проверки,
//   - не закончился оплаченный срок,
//   - часы на телефоне не переведены назад.
// Время считаем «по серверу»: время телефона + поправка, найденная при проверке.
// ============================================================

export const OFFLINE_DAYS = 7;
const DAY = 86400000;
const SKEW = 10 * 60 * 1000;          // 10 минут допуска на неточные часы
const KEY = 'aivoPass';
const SALT = 'aivo-pass-v1';

function sign(p) {
  var s = [SALT, p.uid, p.expiresAt, p.frozen ? 1 : 0, p.checkedAt, p.offset, p.maxSeen].join('|');
  var h = 2166136261 >>> 0;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}

export function readPass(uid) {
  try {
    var p = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!p || p.uid !== uid || p.sig !== sign(p)) return null;
    return p;
  } catch (e) { return null; }
}

export function writePass(p) {
  p.sig = sign(p);
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  return p;
}

export function clearPass() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

// «Серверное» сейчас для этого пропуска.
export function passNow(p, deviceNow) {
  return (deviceNow === undefined ? Date.now() : deviceNow) + ((p && p.offset) || 0);
}

// Новый пропуск после удачной проверки в сети.
export function makePass(uid, info, serverNow, deviceNow) {
  return writePass({
    uid: uid,
    expiresAt: info.expiresAt || null,      // null = бессрочно
    frozen: !!info.frozen,
    checkedAt: serverNow,
    offset: serverNow - deviceNow,
    maxSeen: serverNow
  });
}

// Можно ли работать сейчас. now — «серверное» время (passNow).
export function evaluatePass(p, now) {
  if (!p) return { ok: false, reason: 'first' };
  if (now < (p.maxSeen || 0) - SKEW || p.checkedAt > now + SKEW) return { ok: false, reason: 'clock' };
  if (p.frozen) return { ok: false, reason: 'frozen' };
  if (p.expiresAt && now > p.expiresAt) return { ok: false, reason: 'expired', expiresAt: p.expiresAt };
  var left = OFFLINE_DAYS * DAY - (now - p.checkedAt);
  if (left <= 0) return { ok: false, reason: 'offline' };
  return { ok: true, offlineLeftMs: left, expiresAt: p.expiresAt };
}

// Запоминаем самое позднее виденное время (ловит перевод часов назад).
export function touchPass(p, now) {
  if (p && now > (p.maxSeen || 0)) { p.maxSeen = now; writePass(p); }
  return p;
}

export function daysLeft(ms) {
  return Math.max(0, Math.ceil(ms / DAY));
}
