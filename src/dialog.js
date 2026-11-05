// ============================================================
// Окно подтверждения в стиле приложения вместо системного confirm():
// системные окна в приложениях-обёртках часто не показываются.
// askConfirm(текст, {ok, danger}) -> Promise<boolean>
// ============================================================

let box = null;

function build() {
  box = document.createElement('div');
  box.className = 'modal hidden confirm-modal';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML =
    '<div class="modal-box confirm-box">' +
      '<div class="confirm-text"></div>' +
      '<div class="confirm-actions">' +
        '<button type="button" class="modal-btn secondary confirm-cancel">Отмена</button>' +
        '<button type="button" class="modal-btn confirm-ok">Да</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(box);
}

export function askConfirm(text, options) {
  options = options || {};
  if (!box) build();
  var okBtn = box.querySelector('.confirm-ok');
  var cancelBtn = box.querySelector('.confirm-cancel');
  box.querySelector('.confirm-text').textContent = text;
  okBtn.textContent = options.ok || 'Да';
  okBtn.classList.toggle('danger', !!options.danger);
  box.classList.remove('hidden');
  setTimeout(function () { cancelBtn.focus(); }, 0);

  return new Promise(function (resolve) {
    function finish(value) {
      box.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      box.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    }
    function onOk() { finish(true); }
    function onCancel() { finish(false); }
    function onBackdrop(e) { if (e.target === box) finish(false); }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
      if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); finish(true); }
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    box.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey, true);
  });
}

// Окно с полем пароля: askPassword(текст, {ok}) -> Promise<string|null>
let pwBox = null;
export function askPassword(text, options) {
  options = options || {};
  if (!pwBox) {
    pwBox = document.createElement('div');
    pwBox.className = 'modal hidden confirm-modal';
    pwBox.setAttribute('role', 'dialog');
    pwBox.setAttribute('aria-modal', 'true');
    pwBox.innerHTML =
      '<div class="modal-box confirm-box">' +
        '<div class="confirm-text"></div>' +
        '<input type="password" class="pw-input" autocomplete="current-password" placeholder="Пароль от аккаунта">' +
        '<div class="pw-error"></div>' +
        '<div class="confirm-actions">' +
          '<button type="button" class="modal-btn secondary pw-cancel">Отмена</button>' +
          '<button type="button" class="modal-btn danger pw-ok">Да</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pwBox);
  }
  var input = pwBox.querySelector('.pw-input');
  var okBtn = pwBox.querySelector('.pw-ok');
  var cancelBtn = pwBox.querySelector('.pw-cancel');
  pwBox.querySelector('.confirm-text').textContent = text;
  pwBox.querySelector('.pw-error').textContent = options.error || '';
  okBtn.textContent = options.ok || 'Да';
  input.value = '';
  pwBox.classList.remove('hidden');
  setTimeout(function () { input.focus(); }, 0);
  return new Promise(function (resolve) {
    function finish(v) {
      pwBox.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(v);
    }
    function onOk() { if (input.value) finish(input.value); else input.focus(); }
    function onCancel() { finish(null); }
    function onKey(e) { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}
