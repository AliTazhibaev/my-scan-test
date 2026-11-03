// ============================================================
// AUTH & DEVICE MANAGEMENT (extracted from app.js)
// ============================================================
// Depends on Firebase (global): firebase, auth, db

import { readPass, makePass, clearPass, evaluatePass, passNow, touchPass, daysLeft, OFFLINE_DAYS } from './license.js';
import { showToast } from './ui.js';
import { askConfirm } from './dialog.js';
import { isNative } from './native.js';

let currentUser = null;
let userDeviceLimit = 5;
let loginPromise = null;      // идёт вход: проверка доступа ждёт регистрации устройства
let mainShown = false;
let gateRunning = false;
let lastRefresh = 0;
let watchTimer = null;
let warnedOffline = false;
const WA_NUMBER = '996990551884';

export function getCurrentUser() { return currentUser; }

async function getDeviceFingerprint() {
  const components = [
    navigator.userAgent, navigator.language,
    screen.width + 'x' + screen.height, screen.colorDepth,
    new Date().getTimezoneOffset(), navigator.hardwareConcurrency || 'unknown'
  ];
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) {
    const m = ua.match(/;\s*([^;]+)\s*Build/);
    return m ? m[1].trim() : 'Android Device';
  }
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux PC';
  return 'Unknown Device';
}

async function checkDeviceLimit(user) {
  const fingerprint = await getDeviceFingerprint();
  const deviceName = getDeviceName();
  const devicesRef = db.collection('users').doc(user.uid).collection('devices');
  const deviceDoc = await devicesRef.doc(fingerprint).get();
  if (deviceDoc.exists) {
    await devicesRef.doc(fingerprint).update({
      lastAccess: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { allowed: true, id: fingerprint };
  }
  const devicesSnap = await devicesRef.get();
  const deviceCount = devicesSnap.size;
  const userDoc = await db.collection('users').doc(user.uid).get();
  const limit = userDoc.data()?.deviceLimit || 5;
  userDeviceLimit = limit;
  if (deviceCount >= limit) {
    return {
      allowed: false, deviceCount, deviceLimit: limit,
      message: 'Лимит устройств исчерпан (' + deviceCount + '/' + limit + ')'
    };
  }
  await devicesRef.doc(fingerprint).set({
    name: deviceName, fingerprint,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastAccess: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { allowed: true, id: fingerprint, deviceCount: deviceCount + 1, deviceLimit: limit };
}

export async function handleLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errorEl = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  if (!email || !password) {
    errorEl.textContent = 'Введите email и пароль';
    errorEl.classList.add('show');
    return;
  }
  loginBtn.disabled = true;
  loginBtn.querySelector('span').textContent = 'Вход...';
  errorEl.classList.remove('show');
  let finishLogin;
  loginPromise = new Promise(r => { finishLogin = r; });
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const deviceResult = await checkDeviceLimit(cred.user);
    if (!deviceResult.allowed) {
      await auth.signOut();
      throw new Error(deviceResult.message);
    }
    setStoredDeviceId(cred.user.uid, deviceResult.id);
    currentUser = cred.user;
    if (deviceResult.deviceCount) document.getElementById('deviceCountInfo').textContent = deviceResult.deviceCount;
    if (deviceResult.deviceLimit) document.getElementById('deviceLimitInfo').textContent = deviceResult.deviceLimit;
    // Дальше доступ проверяет runGate (onAuthStateChanged).
  } catch (authErr) {
    let errMsg = 'Ошибка авторизации';
    if (authErr.code === 'auth/user-not-found') errMsg = 'Пользователь не найден';
    else if (authErr.code === 'auth/wrong-password') errMsg = 'Неверный пароль';
    else if (authErr.code === 'auth/invalid-email') errMsg = 'Некорректный email';
    else if (authErr.code === 'auth/too-many-requests') errMsg = 'Слишком много попыток. Подождите';
    else errMsg = authErr.message;
    errorEl.textContent = errMsg;
    errorEl.classList.add('show');
  } finally {
    loginBtn.disabled = false;
    loginBtn.querySelector('span').textContent = 'Войти';
    finishLogin();
    loginPromise = null;
  }
}

function showLoginPage() {
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
  // Initialize 3D AFTER canvas is visible
  if (window.init3D) window.init3D();
  window.dispatchEvent(new Event('resize'));
}

// ============================================================
// ПРОВЕРКА ДОСТУПА (пропуск, см. license.js)
// ============================================================
function deviceKey(uid) { return 'aivoDeviceId_' + uid; }
function getStoredDeviceId(uid) { try { return localStorage.getItem(deviceKey(uid)); } catch (e) { return null; } }
function setStoredDeviceId(uid, id) {
  try { if (id) localStorage.setItem(deviceKey(uid), id); else localStorage.removeItem(deviceKey(uid)); } catch (e) {}
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// Время сервера из заголовка Date (HEAD-запрос мимо кэша). Нет сети — ошибка.
async function fetchServerTime() {
  const r = await withTimeout(fetch('/manifest.json?t=' + Date.now(), { method: 'HEAD', cache: 'no-store' }), 6000);
  const d = Date.parse(r.headers.get('Date') || '');
  return isNaN(d) ? null : d;
}

// Время сервера через Firestore (в приложении заголовок Date у локальных файлов не годится):
// пишем отметку serverTimestamp в своё устройство и читаем её обратно.
async function firestoreTime(user) {
  const id = getStoredDeviceId(user.uid);
  if (!id) return null;
  const ref = db.collection('users').doc(user.uid).collection('devices').doc(id);
  await withTimeout(ref.update({ lastAccess: firebase.firestore.FieldValue.serverTimestamp() }), 8000);
  const d = await withTimeout(ref.get(), 8000);
  const t = d.exists && d.data().lastAccess;
  return t && t.toDate ? t.toDate().getTime() : null;
}

// Это устройство всё ещё привязано к аккаунту?
async function verifyDevice(user) {
  const ref = db.collection('users').doc(user.uid).collection('devices');
  const id = getStoredDeviceId(user.uid);
  if (id) {
    const d = await withTimeout(ref.doc(id).get(), 8000);
    if (!d.exists) return 'unlinked';
    ref.doc(id).update({ lastAccess: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
    return 'ok';
  }
  // Вошли до обновления: номера устройства ещё нет — находим или регистрируем.
  const r = await checkDeviceLimit(user);
  if (!r.allowed) return 'limit';
  setStoredDeviceId(user.uid, r.id);
  return 'ok';
}

// Проверка в сети: новый пропуск + устройство. Нет сети — ошибка.
async function refreshPass(user) {
  let serverNow = isNative() ? null : await fetchServerTime();
  const doc = await withTimeout(db.collection('users').doc(user.uid).get(), 8000);
  if (!serverNow) { try { serverNow = await firestoreTime(user); } catch (e) {} }
  const deviceNow = Date.now();
  const data = doc.exists ? doc.data() : {};
  userDeviceLimit = data.deviceLimit || 5;
  let exp = null;
  if (data.expiresAt) exp = (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)).getTime();
  const pass = makePass(user.uid, { expiresAt: exp, frozen: data.frozen === true }, serverNow || deviceNow, deviceNow);
  lastRefresh = Date.now();
  let device = 'ok';
  try { device = await verifyDevice(user); } catch (e) { /* не удалось проверить устройство — не мешаем работать */ }
  return { pass, device };
}

function openApp() {
  if (mainShown) return;
  mainShown = true;
  showMainApp();
  setTimeout(showOnboarding, 500);
}

async function runGate(user) {
  if (gateRunning || !user) return;
  gateRunning = true;
  try {
    if (loginPromise) { try { await loginPromise; } catch (e) {} }
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
    const local = readPass(user.uid);
    let verdict = evaluatePass(local, passNow(local));
    if (verdict.ok) openApp();
    else showGate('checking');
    try {
      const r = await refreshPass(user);
      if (r.device === 'unlinked') { await leave('Это устройство отвязано от аккаунта. Войдите снова.', false); return; }
      if (r.device === 'limit') { showGate('limit'); return; }
      verdict = evaluatePass(r.pass, passNow(r.pass));
    } catch (e) { /* нет сети — решаем по пропуску */ }
    if (verdict.ok) {
      hideGate();
      openApp();
      warnOffline(verdict);
    } else {
      showGate(verdict.reason, verdict);
    }
    updateAccountInfo();
  } finally {
    gateRunning = false;
  }
}

function warnOffline(verdict) {
  if (warnedOffline || !verdict.offlineLeftMs) return;
  const days = daysLeft(verdict.offlineLeftMs);
  if (days <= 2 && Date.now() - lastRefresh > 60000) {
    warnedOffline = true;
    showToast('📶 Без интернета осталось ' + days + ' дн. Подключитесь, чтобы проверить подписку');
  }
}

function startWatch(user) {
  clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    const p = readPass(user.uid);
    if (!p) return;
    const now = passNow(p);
    touchPass(p, now);
    const v = evaluatePass(p, now);
    if (!v.ok) showGate(v.reason, v);
    else warnOffline(v);
    if (Date.now() - lastRefresh > 3600000) runGate(user);
  }, 60000);
}

// Выход: удаляем это устройство из аккаунта (если просили) и перезапускаем страницу.
async function leave(message, unlink) {
  const user = auth.currentUser;
  if (user && unlink) {
    const id = getStoredDeviceId(user.uid);
    if (id) {
      try { await withTimeout(db.collection('users').doc(user.uid).collection('devices').doc(id).delete(), 6000); } catch (e) {}
    }
  }
  if (user) setStoredDeviceId(user.uid, null);
  clearPass();
  try { if (message) sessionStorage.setItem('aivoLoginMsg', message); } catch (e) {}
  try { await auth.signOut(); } catch (e) {}
  location.reload();
}

function askLogout() {
  askConfirm('Выйти из аккаунта на этом устройстве? Устройство освободится, и на его место можно будет войти с другого телефона. Проекты в этом телефоне сохранятся.', { ok: 'Выйти', danger: true })
    .then(ok => { if (ok) leave('', true); });
}

// ---------- экран «нет доступа» ----------
let gateEl = null;
function fmtDate(ms) { return new Date(ms).toLocaleDateString('ru-RU'); }

function gateContent(reason, v) {
  const buy = { label: 'Продлить доступ', href: 'buy.html', primary: true };
  const retry = { label: 'Проверить снова', action: 'retry' };
  const wa = { label: 'Написать в WhatsApp', href: 'https://wa.me/' + WA_NUMBER };
  switch (reason) {
    case 'checking': return { icon: '⏳', title: 'Проверяем доступ…', text: 'Это займёт пару секунд.', buttons: [] };
    case 'first': return { icon: '📶', title: 'Нужен интернет', text: 'Для первого запуска на этом устройстве подключитесь к интернету. Потом приложение будет работать и без него до ' + OFFLINE_DAYS + ' дней.', buttons: [Object.assign({}, retry, { primary: true })] };
    case 'offline': return { icon: '📶', title: 'Подключитесь к интернету', text: 'Без интернета Aivo Scan работает до ' + OFFLINE_DAYS + ' дней. Этот срок прошёл: подключитесь на минуту, чтобы проверить подписку. Проекты и отметки сохранены.', buttons: [Object.assign({}, retry, { primary: true })] };
    case 'clock': return { icon: '🕒', title: 'Проверьте дату и время', text: 'Похоже, часы на устройстве переведены назад. Включите автоматическую дату и время и подключитесь к интернету.', buttons: [Object.assign({}, retry, { primary: true })] };
    case 'expired':
      // В приложении из магазинов ссылок на оплату быть не должно (правила Google/Apple).
      if (isNative()) return { icon: '🔒', title: 'Срок доступа закончился', text: 'Доступ был до ' + fmtDate(v.expiresAt) + '. Чтобы продлить, обратитесь к администратору вашего аккаунта. Когда доступ продлят, нажмите «Проверить снова».', buttons: [Object.assign({}, retry, { primary: true })] };
      return { icon: '🔒', title: 'Срок доступа закончился', text: 'Доступ был оплачен до ' + fmtDate(v.expiresAt) + '. Продлите его на сайте. Если уже оплатили, нажмите «Проверить снова» после подтверждения.', buttons: [buy, retry] };
    case 'frozen': return { icon: '⏸', title: 'Доступ приостановлен', text: 'Свяжитесь с нами, чтобы возобновить доступ.', buttons: [Object.assign({}, wa, { primary: true }), retry] };
    case 'limit': return { icon: '📱', title: 'Лимит устройств', text: 'На этом аккаунте уже занято ' + userDeviceLimit + ' из ' + userDeviceLimit + ' устройств. Выйдите из аккаунта на старом телефоне или попросите администратора отвязать его.', buttons: [retry] };
  }
  return { icon: '🔒', title: 'Нет доступа', text: '', buttons: [retry] };
}

function showGate(reason, v) {
  if (!gateEl) {
    gateEl = document.createElement('div');
    gateEl.className = 'gate';
    gateEl.setAttribute('role', 'alertdialog');
    gateEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(gateEl);
    gateEl.addEventListener('click', e => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      if (b.dataset.action === 'retry' && auth.currentUser) runGate(auth.currentUser);
      if (b.dataset.action === 'logout') askLogout();
    });
  }
  const c = gateContent(reason, v || {});
  let html = '<div class="gate-box"><div class="gate-icon">' + c.icon + '</div><h2 class="gate-title">' + c.title + '</h2><p class="gate-text">' + c.text + '</p><div class="gate-actions">';
  c.buttons.forEach(b => {
    const cls = 'gate-btn' + (b.primary ? ' primary' : '');
    html += b.href
      ? '<a class="' + cls + '" href="' + b.href + '"' + (b.href.startsWith('http') ? ' target="_blank" rel="noopener"' : '') + '>' + b.label + '</a>'
      : '<button type="button" class="' + cls + '" data-action="' + b.action + '">' + b.label + '</button>';
  });
  html += '</div>';
  if (reason !== 'checking') html += '<button type="button" class="gate-logout" data-action="logout">Выйти из аккаунта</button>';
  html += '</div>';
  gateEl.innerHTML = html;
  gateEl.classList.add('show');
}

function hideGate() { if (gateEl) gateEl.classList.remove('show'); }

// ---------- строка аккаунта в меню ----------
function updateAccountInfo() {
  const box = document.getElementById('accountInfo');
  const user = auth.currentUser;
  if (!box || !user) return;
  const p = readPass(user.uid);
  let line = '';
  if (p) {
    line = p.expiresAt ? 'доступ до ' + fmtDate(p.expiresAt) : 'доступ бессрочный';
    const v = evaluatePass(p, passNow(p));
    if (v.ok && Date.now() - lastRefresh > 3600000) line += ' · без интернета ещё ' + daysLeft(v.offlineLeftMs) + ' дн.';
  }
  box.querySelector('.account-email').textContent = user.email || '';
  box.querySelector('.account-meta').textContent = line;
  box.style.display = '';
}

// === Onboarding ===
let onboardStep = 0;
let onboardSteps, onboardDots, onboardBtn;

function showOnboarding() {
  if (localStorage.getItem('aivoOnboarded')) return;
  document.getElementById('onboardingModal').classList.remove('hidden');
}

function updateOnboardStep() {
  onboardSteps.forEach((step, idx) => step.style.display = idx === onboardStep ? 'block' : 'none');
  onboardDots.forEach((dot, idx) => {
    dot.style.background = idx === onboardStep ? 'var(--accent)' : 'var(--bg-tertiary)';
    dot.style.width = idx === onboardStep ? '20px' : '8px';
  });
  onboardBtn.textContent = onboardStep === onboardSteps.length - 1 ? 'Начать!' : 'Далее';
}

// Wire up all auth-related event listeners and state
export function initAuth() {
  onboardSteps = document.querySelectorAll('.onboard-step');
  onboardDots = document.querySelectorAll('.onboard-dot');
  onboardBtn = document.getElementById('onboardNext');

  if (onboardBtn) {
    onboardBtn.addEventListener('click', () => {
      onboardStep++;
      if (onboardStep >= onboardSteps.length) {
        localStorage.setItem('aivoOnboarded', '1');
        document.getElementById('onboardingModal').classList.add('hidden');
        onboardStep = 0;
      } else {
        updateOnboardStep();
      }
    });
  }

  var onboardSkip = document.getElementById('onboardSkip');
  if (onboardSkip) {
    onboardSkip.addEventListener('click', () => {
      localStorage.setItem('aivoOnboarded', '1');
      document.getElementById('onboardingModal').classList.add('hidden');
      onboardStep = 0;
    });
  }

  auth.onAuthStateChanged(authUser => {
    if (authUser) {
      currentUser = authUser;
      runGate(authUser);
      startWatch(authUser);
    } else {
      currentUser = null;
      clearInterval(watchTimer);
      hideGate();
      if (mainShown) { location.reload(); return; }
      showLoginPage();
    }
  });

  // Сеть появилась / вернулись в приложение — проверяем подписку.
  window.addEventListener('online', () => { if (auth.currentUser) runGate(auth.currentUser); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.currentUser && Date.now() - lastRefresh > 10 * 60000) runGate(auth.currentUser);
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', askLogout);

  // Сообщение после выхода (например, «устройство отвязано»).
  try {
    const msg = sessionStorage.getItem('aivoLoginMsg');
    if (msg) {
      sessionStorage.removeItem('aivoLoginMsg');
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = msg;
      errorEl.classList.add('show');
    }
  } catch (e) {}

  document.getElementById('authPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('authEmail').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('authPassword').focus();
  });

  // Expose for inline HTML onclick handler
  window.handleLogin = handleLogin;
}
