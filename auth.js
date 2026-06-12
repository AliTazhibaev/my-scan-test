// ═══════════════════════════════════════
//  АВТОРИЗАЦИЯ И ПОДПИСКА
// ═══════════════════════════════════════

let currentUser = null;
let currentTeam = null;

// Вход в систему
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  console.log('Попытка входа:', email);

  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }

  try {
    // ПРОВЕРКА: если supabase не определён
    if (!supabase) {
      console.error('supabase не определён!');
      alert('Ошибка: не удалось подключиться к серверу. Перезагрузите страницу.');
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    console.log('Результат авторизации:', { data, error });

    if (error) {
      alert('Ошибка входа: ' + error.message);
      return;
    }

    if (!data.user) {
      alert('Пользователь не найден');
      return;
    }

    currentUser = data.user;
    console.log('Пользователь вошёл:', currentUser.id);

    // Показываем приложение (без проверок БД для теста)
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('app').style.display = 'block';

    // Инициализируем 3D приложение
    if (typeof initApp === 'function') {
      initApp();
    }

  } catch (err) {
    console.error('Ошибка при входе:', err);
    alert('Ошибка: ' + err.message);
  }
}

// Выход
function logout() {
  currentUser = null;
  currentTeam = null;
  localStorage.removeItem('user_logged_in');
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginModal').classList.remove('hidden');
}

// Проверка сессии (упрощённая)
async function checkSession() {
  if (!supabase) {
    console.log('Ждём supabase...');
    setTimeout(checkSession, 100);
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('app').style.display = 'block';
    if (typeof initApp === 'function') initApp();
  } else {
    document.getElementById('loginModal').classList.remove('hidden');
    document.getElementById('app').style.display = 'none';
  }
}

// Кнопка выхода
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
  checkSession();
});