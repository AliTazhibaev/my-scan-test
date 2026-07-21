// Service Worker - force update
const CACHE_NAME = 'aivo-scan-v6';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache the SW itself — always fetch fresh
  if (url.pathname === '/sw.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(fetch(event.request));
});

// Listen for SKIP_WAITING message from page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
