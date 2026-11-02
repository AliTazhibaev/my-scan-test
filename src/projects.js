// ============================================================
// МОИ ПРОЕКТЫ: открытые JSON запоминаются в браузере (IndexedDB),
// у каждого проекта свой прогресс сборки. Если хранилище недоступно
// (приватный режим и т. п.), приложение просто работает как раньше.
// ============================================================

const DB_NAME = 'aivo-scan';
const DB_VERSION = 1;
const LAST_KEY = 'aivoLastProject';
const LEGACY_PROGRESS_KEY = 'aivoProgress';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      var db = req.result;
      // meta — лёгкие записи для списка, files — сам текст JSON (может быть большим).
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  }).catch(function (err) { dbPromise = null; throw err; });
  return dbPromise;
}

function tx(stores, mode, work) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(stores, mode);
      var result;
      t.oncomplete = function () { resolve(result); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error); };
      result = work(t);
    });
  });
}

function getFrom(t, store, key) {
  return new Promise(function (resolve) {
    var r = t.objectStore(store).get(key);
    r.onsuccess = function () { resolve(r.result || null); };
    r.onerror = function () { resolve(null); };
  });
}

// Один и тот же файл (то же имя и то же содержимое) = тот же проект: прогресс сохранится.
export function projectId(fileName, text) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'p_' + h.toString(36) + '_' + text.length.toString(36) + '_' + encodeURIComponent(fileName).length.toString(36);
}

export function saveProject(id, title, text, partsCount) {
  var now = Date.now();
  return tx(['meta', 'files'], 'readwrite', function (t) {
    var metaStore = t.objectStore('meta');
    var r = metaStore.get(id);
    r.onsuccess = function () {
      var meta = r.result || { id: id, addedAt: now, scanned: [], hidden: [] };
      meta.title = title;
      meta.partsCount = partsCount;
      meta.openedAt = now;
      metaStore.put(meta);
    };
    t.objectStore('files').put({ id: id, text: text });
  }).then(function () { setLastProject(id); }).catch(function () {});
}

export function listProjects() {
  return tx(['meta'], 'readonly', function (t) {
    var out = [];
    t.objectStore('meta').openCursor().onsuccess = function (e) {
      var cur = e.target.result;
      if (cur) { out.push(cur.value); cur.continue(); }
    };
    return out;
  }).then(function (list) {
    return list.sort(function (a, b) { return (b.openedAt || 0) - (a.openedAt || 0); });
  }).catch(function () { return []; });
}

export function getProjectText(id) {
  var text = null;
  return tx(['files'], 'readonly', function (t) {
    getFrom(t, 'files', id).then(function (row) { text = row ? row.text : null; });
  }).then(function () { return text; }).catch(function () { return null; });
}

export function getProjectMeta(id) {
  var meta = null;
  return tx(['meta'], 'readonly', function (t) {
    getFrom(t, 'meta', id).then(function (row) { meta = row; });
  }).then(function () { return meta; }).catch(function () { return null; });
}

export function deleteProject(id) {
  if (getLastProject() === id) setLastProject(null);
  return tx(['meta', 'files'], 'readwrite', function (t) {
    t.objectStore('meta').delete(id);
    t.objectStore('files').delete(id);
  }).catch(function () {});
}

export function saveProjectProgress(id, scanned, hidden) {
  if (!id) return Promise.resolve();
  return tx(['meta'], 'readwrite', function (t) {
    var store = t.objectStore('meta');
    var r = store.get(id);
    r.onsuccess = function () {
      if (!r.result) return;
      r.result.scanned = scanned;
      r.result.hidden = hidden;
      r.result.updatedAt = Date.now();
      store.put(r.result);
    };
  }).catch(function () {});
}

// Прогресс проекта. Для старых проектов (до «Моих проектов») один раз забираем
// общий прогресс из localStorage, если он был от этого же проекта.
export function loadProjectProgress(id, title) {
  return getProjectMeta(id).then(function (meta) {
    var scanned = (meta && meta.scanned) || [];
    var hidden = (meta && meta.hidden) || [];
    if (!scanned.length && !hidden.length) {
      try {
        var legacy = JSON.parse(localStorage.getItem(LEGACY_PROGRESS_KEY) || '{}');
        if (legacy.projectTitle === title && (legacy.scanned || legacy.hidden)) {
          scanned = legacy.scanned || [];
          hidden = legacy.hidden || [];
          localStorage.removeItem(LEGACY_PROGRESS_KEY);
          saveProjectProgress(id, scanned, hidden);
        }
      } catch (e) {}
    }
    return { scanned: scanned, hidden: hidden };
  });
}

export function setLastProject(id) {
  try { if (id) localStorage.setItem(LAST_KEY, id); else localStorage.removeItem(LAST_KEY); } catch (e) {}
}

export function getLastProject() {
  try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; }
}
