const CACHE_NAME = 'aivo-scan-v33';
// Всё, что нужно приложению для работы без интернета (после первого открытия).
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg',
  '/qr-logo.svg',
  '/bg-dark.png',
  '/bg-light.png',
  '/src/assembly.js',
  '/src/auth.js',
  '/src/camera.js',
  '/src/csg.js',
  '/src/dialog.js',
  '/src/license.js',
  '/src/native.js',
  '/src/stats.js',
  '/src/scanmatch.js',
  '/src/events.js',
  '/src/materials.js',
  '/src/projects.js',
  '/src/qr.js',
  '/src/state.js',
  '/src/ui.js',
  '/vendor/three.min.js',
  '/vendor/jsQR.min.js',
  '/vendor/firebase-app-compat.js',
  '/vendor/firebase-auth-compat.js',
  '/vendor/firebase-firestore-compat.js'
];
// Файлы с версией в адресе (app.js?v=10) без сети ищем и без «?v=…».
function fromCache(request) {
  return caches.match(request).then(function (hit) { return hit || caches.match(request, { ignoreSearch: true }); });
}

// Pre-cache static assets on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Clean old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache the SW itself
  if (url.pathname === '/sw.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // CDN resources (Three.js, jsQR, Firebase) — network-first with cache fallback
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => fromCache(event.request))
    );
    return;
  }

  // HTML, JS, and module files — network-first (always get latest code)
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.startsWith('/src/')) {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
        .catch(() => fromCache(event.request))
    );
    return;
  }

  // Local static assets (CSS, images, etc) — cache-first, update in background
  event.respondWith(
    fromCache(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return resp;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// Listen for SKIP_WAITING message from page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
