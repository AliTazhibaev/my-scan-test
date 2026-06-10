// ═══════════════════════════════════════
//  АВТОРИЗАЦИЯ И ПОДПИСКА
// ═══════════════════════════════════════

let currentUser = null;
let currentTeam = null;

// ═══════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════

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

// Подсчёт активных пользователей (онлайн прямо сейчас)
async function getActiveUsersCount(teamId) {
  // Активным считается устройство, которое было активно в последние 5 минут
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const { count, error } = await supabase
    .from('devices')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('is_active', true)
    .gte('last_active', fiveMinutesAgo.toISOString());
  
  if (error) {
    console.error('Ошибка подсчёта активных пользователей:', error);
    return 0;
  }
  
  return count || 0;
}

// Обновление времени последней активности устройства
async function updateDeviceActivity(deviceId, teamId) {
  const { error } = await supabase
    .from('devices')
    .update({ last_active: new Date() })
    .eq('device_id', deviceId)
    .eq('team_id', teamId);
  
  if (error) {
    console.error('Ошибка обновления активности устройства:', error);
  }
}

// Регистрация или обновление устройства
async function registerDevice(teamId) {
  const maxActiveUsers = 5; // Максимум 5 одновременных пользователей
  
  // Проверяем существующее устройство
  const { data: existing } = await supabase
    .from('devices')
    .select('*')
    .eq('device_id', DEVICE_ID)
    .single();
  
  if (existing) {
    // Устройство уже зарегистрировано — просто обновляем активность
    await updateDeviceActivity(DEVICE_ID, teamId);
    return true;
  }
  
  // Проверяем, сколько активных пользователей сейчас
  const activeUsers = await getActiveUsersCount(teamId);
  
  if (activeUsers >= maxActiveUsers) {
    alert(`❌ Слишком много активных пользователей (${maxActiveUsers}).\nПодождите, пока кто-то выйдет из системы.`);
    return false;
  }
  
  // Регистрируем новое устройство
  const { error } = await supabase
    .from('devices')
    .insert({
      device_id: DEVICE_ID,
      team_id: teamId,
      last_active: new Date(),
      is_active: true
    });
  
  if (error) {
    console.error('Ошибка регистрации устройства:', error);
    alert('Ошибка регистрации устройства');
    return false;
  }
  
  return true;
}

// ═══════════════════════════════════════
//  ОСНОВНЫЕ ФУНКЦИИ ВХОДА/ВЫХОДА
// ═══════════════════════════════════════

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
    // Аутентификация через Supabase Auth
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
      await supabase.auth.signOut();
      return;
    }
    
    // Проверяем подписку команды
    const subscriptionOk = await checkTeamSubscription(userData.team_id);
    if (!subscriptionOk) {
      await supabase.auth.signOut();
      return;
    }
    
    // Регистрируем устройство (с проверкой лимита одновременных пользователей)
    const deviceOk = await registerDevice(userData.team_id);
    if (!deviceOk) {
      await supabase.auth.signOut();
      return;
    }
    
    currentTeam = { id: userData.team_id, role: userData.role };
    
    // Сохраняем сессию
    localStorage.setItem('user_logged_in', 'true');
    localStorage.setItem('user_email', email);
    localStorage.setItem('user_role', userData.role);
    
    // Показываем приложение
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('app').style.display = 'block';
    
    // Запускаем периодическое обновление активности
    startActivityPing(userData.team_id);
    
    // Инициализируем приложение
    if (typeof initApp === 'function') {
      initApp();
    }
    
  } catch (err) {
    console.error('Ошибка при входе:', err);
    alert('Ошибка: ' + err.message);
  }
}

// Периодическое обновление активности (каждые 30 секунд)
let activityInterval = null;

function startActivityPing(teamId) {
  if (activityInterval) clearInterval(activityInterval);
  
  activityInterval = setInterval(async () => {
    if (currentUser && currentTeam) {
      await updateDeviceActivity(DEVICE_ID, teamId);
      console.log('🔄 Активность обновлена');
    }
  }, 30000); // каждые 30 секунд
}

function stopActivityPing() {
  if (activityInterval) {
    clearInterval(activityInterval);
    activityInterval = null;
  }
}

// Выход из системы
async function logout() {
  try {
    // Деактивируем устройство
    await supabase
      .from('devices')
      .update({ is_active: false })
      .eq('device_id', DEVICE_ID);
    
    console.log('🔌 Устройство деактивировано');
  } catch(e) { 
    console.error('Ошибка при деактивации устройства:', e); 
  }
  
  // Выход из Supabase Auth
  await supabase.auth.signOut();
  
  // Останавливаем пинг активности
  stopActivityPing();
  
  // Очищаем переменные
  currentUser = null;
  currentTeam = null;
  
  // Очищаем localStorage
  localStorage.removeItem('user_logged_in');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_role');
  
  // Показываем модалку входа
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginModal').classList.remove('hidden');
  
  // Очищаем поля ввода
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  
  console.log('👋 Выход выполнен');
}

// ═══════════════════════════════════════
//  ПРОВЕРКА СЕССИИ ПРИ ЗАГРУЗКЕ
// ═══════════════════════════════════════

async function checkSession() {
  const loggedIn = localStorage.getItem('user_logged_in');
  console.log('Проверка сессии, loggedIn:', loggedIn);
  
  if (loggedIn === 'true') {
    const { data } = await supabase.auth.getSession();
    console.log('Текущая сессия:', data.session ? 'активна' : 'отсутствует');
    
    if (data.session) {
      currentUser = data.session.user;
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('team_id, role')
        .eq('id', currentUser.id)
        .single();
      
      if (userError) {
        console.error('Ошибка получения данных пользователя:', userError);
      }
      
      if (userData) {
        // Проверяем подписку
        const subOk = await checkTeamSubscription(userData.team_id);
        if (!subOk) {
          await logout();
          return;
        }
        
        // Проверяем/регистрируем устройство
        const deviceOk = await registerDevice(userData.team_id);
        if (!deviceOk) {
          await logout();
          return;
        }
        
        currentTeam = { id: userData.team_id, role: userData.role };
        
        // Запускаем пинг активности
        startActivityPing(userData.team_id);
        
        // Показываем приложение
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('app').style.display = 'block';
        
        // Инициализируем приложение
        if (typeof initApp === 'function') {
          initApp();
        }
        return;
      }
    }
  }
  
  // Если сессия недействительна — показываем вход
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('app').style.display = 'none';
}

// ═══════════════════════════════════════
//  ЗАПУСК ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ═══════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Кнопка выхода
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.onclick = logout;
  
  // Проверяем сессию
  checkSession();
});

// При закрытии вкладки/браузера — деактивируем устройство
window.addEventListener('beforeunload', async () => {
  if (currentUser && currentTeam) {
    await supabase
      .from('devices')
      .update({ is_active: false })
      .eq('device_id', DEVICE_ID);
  }
});