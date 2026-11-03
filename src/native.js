// ============================================================
// ПРИЛОЖЕНИЕ ДЛЯ ANDROID / iPhone (Capacitor). На сайте ничего не делает.
// - кнопка «назад»: закрывает открытое окно, иначе сворачивает приложение;
// - «Поделиться → Aivo Scan» (файл JSON из WhatsApp и др.) открывает проект;
// - в приложении для магазинов нет ссылок на оплату (правила Google/Apple).
// ============================================================

export function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch (e) { return false; }
}

// Плагин по имени. Без сборщика (как у нас) Capacitor кладёт плагины в Capacitor.Plugins.
function plugin(name) {
  var C = window.Capacitor;
  if (!C) return null;
  if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
  try { return typeof C.registerPlugin === 'function' ? C.registerPlugin(name) : null; } catch (e) { return null; }
}

// onBack() -> true, если что-то закрыли; openShared(text, name) — открыть присланный JSON.
export function initNative(opts) {
  if (!isNative()) return;
  document.documentElement.classList.add('is-native');

  var App = plugin('App');
  if (App) {
    App.addListener('backButton', function () {
      var handled = false;
      try { handled = opts.onBack && opts.onBack(); } catch (e) {}
      if (!handled) App.minimizeApp();
    });
  }

  var Share = plugin('AivoShare');
  if (Share) {
    var deliver = function (data) {
      if (data && data.error && opts.onShareError) { opts.onShareError(data.error); return; }
      if (!data || !data.text) return;
      opts.openShared(data.text, data.name || 'Проект.json');
    };
    Share.addListener('shared', deliver);
    Share.getPending().then(deliver).catch(function () {});
  }
}
