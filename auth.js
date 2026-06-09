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
  
  if (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
  
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
    await supabase
      .from('devices')
      .update({ last_active: new Date(), is_active: true })
      .eq('device_id', DEVICE_ID);
    return true;
  }
  
  const { count } = await supabase
    .from('devices')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_active', true);
  
  const maxDevices = 5;
  
  if (count >= maxDevices) {
    alert(`❌ Превышен лимит устройств (${maxDevices}).`);
    return false;
  }
  
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
  
  console.log('Попытка входа:', email);
  
  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }
  
  try {
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
    
    // Получаем информацию о команде пользователя
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('team_id, role')
      .eq('id', currentUser.id)
      .single();
    
    console.log('Данные пользователя в таблице users:', { userData, userError });
    
    if (userError || !userData) {
      alert('Пользователь не найден в системе. Обратитесь к администратору.');
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
    
    // Инициализируем приложение если функция существует
    if (typeof initApp === 'function') {
      initApp();
    }
    
  } catch (err) {
    console.error('Ошибка при входе:', err);
    alert('Ошибка: ' + err.message);
  }
}

// Выход
async function logout() {
  try {
    await supabase
      .from('devices')
      .update({ is_active: false })
      .eq('device_id', DEVICE_ID);
  } catch(e) { console.error(e); }
  
  await supabase.auth.signOut();
  
  currentUser = null;
  currentTeam = null;
  
  localStorage.removeItem('user_logged_in');
  localStorage.removeItem('user_email');
  
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginModal').classList.remove('hidden');
  
  // Очистка полей
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
}

// Проверка сессии при загрузке
async function checkSession() {
  const loggedIn = localStorage.getItem('user_logged_in');
  console.log('Проверка сессии, loggedIn:', loggedIn);
  
  if (loggedIn === 'true') {
    const { data } = await supabase.auth.getSession();
    console.log('Текущая сессия:', data.session);
    
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
            if (typeof initApp === 'function') initApp();
            return;
          }
        }
      }
    }
  }
  
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
}

// Кнопка выхода
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
  
  checkSession();
});