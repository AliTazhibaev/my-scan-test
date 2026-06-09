// ═══════════════════════════════════════
//  АВТОРИЗАЦИЯ И ПОДПИСКА
// ═══════════════════════════════════════

let currentUser = null;
let currentTeam = null;

// Проверка подписки команды
async function checkTeamSubscription(teamId) {
  const { data, error } = await supabase
    .from('teams')
    .select('subscription_end, max_devices')
    .eq('id', teamId)
    .single();
  
  if (error) return false;
  
  const now = new Date();
  const expireDate = new Date(data.subscription_end);
  
  if (expireDate < now) {
    alert('❌ Подписка истекла. Обратитесь к администратору.');
    return false;
  }
  
  return true;
}

// Регистрация устройства
async function registerDevice(teamId) {
  const { data: existing } = await supabase
    .from('devices')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .single();
  
  if (existing) {
    // Обновляем активность
    await supabase
      .from('devices')
      .update({ last_active: new Date(), is_active: true })
      .eq('device_id', DEVICE_ID);
    return true;
  }
  
  // Считаем сколько уже устройств
  const { count } = await supabase
    .from('devices')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_active', true);
  
  const maxDevices = 5; // максимум 5 устройств
  
  if (count >= maxDevices) {
    alert(`❌ Превышен лимит устройств (${maxDevices}). Отвяжите старое устройство в админ-панели.`);
    return false;
  }
  
  // Добавляем новое устройство
  await supabase
    .from('devices')
    .insert({
      device_id: DEVICE_ID,
      team_id: teamId,
      last_active: new Date(),
      is_active: true
    });
  
  return true;
}

// Вход
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password
  });
  
  if (error) {
    alert('Ошибка: ' + error.message);
    return;
  }
  
  currentUser = data.user;
  
  // Получаем информацию о команде пользователя
  const { data: userData } = await supabase
    .from('users')
    .select('team_id, role')
    .eq('id', currentUser.id)
    .single();
  
  if (!userData) {
    alert('Пользователь не найден в системе');
    return;
  }
  
  // Проверяем подписку команды
  const subscriptionOk = await checkTeamSubscription(userData.team_id);
  if (!subscriptionOk) return;
  
  // Регистрируем устройство
  const deviceOk = await registerDevice(userData.team_id);
  if (!deviceOk) return;
  
  currentTeam = { id: userData.team_id, role: userData.role };
  
  // Сохраняем сессию
  localStorage.setItem('user_logged_in', 'true');
  localStorage.setItem('user_email', email);
  
  // Показываем приложение
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('app').style.display = 'block';
  
  initApp(); // Инициализируем приложение после входа
}

// Выход
async function logout() {
  // Деактивируем устройство
  await supabase
    .from('devices')
    .update({ is_active: false })
    .eq('device_id', DEVICE_ID);
  
  await supabase.auth.signOut();
  
  currentUser = null;
  currentTeam = null;
  
  localStorage.removeItem('user_logged_in');
  localStorage.removeItem('user_email');
  
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginModal').classList.remove('hidden');
  
  // Очистка полей
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

// Проверка сессии при загрузке
async function checkSession() {
  const loggedIn = localStorage.getItem('user_logged_in');
  
  if (loggedIn === 'true') {
    // Пытаемся восстановить сессию
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      currentUser = data.session.user;
      
      const { data: userData } = await supabase
        .from('users')
        .select('team_id, role')
        .eq('id', currentUser.id)
        .single();
      
      if (userData) {
        const subOk = await checkTeamSubscription(userData.team_id);
        if (subOk) {
          const deviceOk = await registerDevice(userData.team_id);
          if (deviceOk) {
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('app').style.display = 'block';
            initApp();
            return;
          }
        }
      }
    }
  }
  
  // Если не восстановилось — показываем вход
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
}

// Кнопка выхода
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
  
  checkSession();
});