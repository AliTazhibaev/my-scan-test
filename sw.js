// Service Worker - force update
const CACHE_NAME = 'aivo-scan-v5';

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
  // Network first for everything - no caching
  event.respondWith(fetch(event.request));
});
