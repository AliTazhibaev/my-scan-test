// ============================================================
// AUTH & DEVICE MANAGEMENT (extracted from app.js)
// ============================================================
// Depends on Firebase (global): firebase, auth, db

let currentUser = null;
let userDeviceLimit = 5;

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
    return { allowed: true };
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
  return { allowed: true, deviceCount: deviceCount + 1, deviceLimit: limit };
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
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const deviceResult = await checkDeviceLimit(cred.user);
    if (!deviceResult.allowed) {
      await auth.signOut();
      throw new Error(deviceResult.message);
    }
    currentUser = cred.user;
    document.getElementById('deviceCountInfo').textContent = deviceResult.deviceCount;
    document.getElementById('deviceLimitInfo').textContent = deviceResult.deviceLimit;
    showMainApp();
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
  }
}

function showLoginPage() {
  document.getElementById('loginPage').classList.add('active');
  document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
  document.getElementById('loginPage').classList.remove('active');
  document.getElementById('mainApp').style.display = 'block';
}

async function checkAccountDeadline(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    const data = doc.data();
    if (data && data.expiresAt) {
      const exp = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
      if (new Date() > exp) {
        const days = Math.ceil((new Date() - exp) / 86400000);
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0c12;color:#fff;font-family:sans-serif;text-align:center;padding:20px"><div><div style="font-size:48px;margin-bottom:16px">&#x1f512;</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">Аккаунт заблокирован</div><div style="font-size:14px;color:#94a3b8;margin-bottom:16px">Срок действия истёк ' + exp.toLocaleDateString('ru-RU') + ' (' + days + ' дн.)</div><div style="font-size:12px;color:#64748b">Свяжитесь с администратором для продления</div></div></div>';
        auth.signOut();
      }
    }
  } catch (e) { console.error('Account deadline check failed:', e); }
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

  auth.onAuthStateChanged(authUser => {
    if (authUser) {
      currentUser = authUser;
      checkDeviceLimit(authUser).then(result => {
        if (result.allowed) {
          document.getElementById('deviceCountInfo').textContent = result.deviceCount;
          document.getElementById('deviceLimitInfo').textContent = result.deviceLimit;
          showMainApp();
          setTimeout(showOnboarding, 500);
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

  document.getElementById('authPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('authEmail').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('authPassword').focus();
  });

  // Expose for inline HTML onclick handler
  window.handleLogin = handleLogin;
}
