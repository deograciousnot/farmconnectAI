// Minimal offline support: cache the app shell, always go to the network for API calls.
const CACHE = 'farmconnect-v1';
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/icon.svg', '/manifest.webmanifest']))); });
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api') || url.origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)); return res; }).catch(() => caches.match(event.request).then(r => r || caches.match('/'))));
});
