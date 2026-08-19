// Service Worker for LocateX Background GPS & Offline Caching
const CACHE_NAME = 'locatex-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Periodic background sync or keep-alive message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PING_BACKGROUND') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ status: 'PONG', timestamp: Date.now() });
    }
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
