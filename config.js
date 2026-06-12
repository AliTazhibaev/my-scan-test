// ═══════════════════════════════════════
//  КОНФИГУРАЦИЯ SUPABASE
// ═══════════════════════════════════════

const SUPABASE_URL = 'https://bobrkqxeqvkotozyzdp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvYnJrY3F4ZXF2a290bG95emRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDYxODQsImV4cCI6MjA5NjU4MjE4NH0.Fj9hCayj3j5TcmIXFlI2qmOEtE9d03ILxjxlrs3e4Zw';

// Инициализация Supabase с проверкой загрузки библиотеки
let supabase = null;

function initSupabase() {
  console.log('🔍 Проверка Supabase... window.supabase:', !!window.supabase);
  
  if (!window.supabase) {
    console.log('⏳ Supabase еще не загрузилась, повторная попытка через 100мс...');
    setTimeout(initSupabase, 100);
    return;
  }
  
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase успешно инициализирован');
  } catch (err) {
    console.error('❌ Ошибка инициализации Supabase:', err);
  }
}

// Запускаем инициализацию
initSupabase();

// Генерация уникального ID устройства (fingerprint)
function getDeviceFingerprint() {
  let fingerprint = localStorage.getItem('device_fingerprint');
  if (!fingerprint) {
    const screen = `${screen.width}x${screen.height}`;
    const userAgent = navigator.userAgent;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fingerprint = btoa(`${screen}|${userAgent}|${timezone}|${Date.now()}`).substring(0, 32);
    localStorage.setItem('device_fingerprint', fingerprint);
  }
  return fingerprint;
}

const DEVICE_ID = getDeviceFingerprint();

console.log('🔧 Config loaded, SUPABASE_URL:', SUPABASE_URL);