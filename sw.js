const CACHE_NAME = 'darmarket-v5';
const RUNTIME_CACHE = 'darmarket-runtime-v5';

const PRECACHE_URLS = [
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  console.log('🔧 SW: install v5');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS).catch(err => console.log('Кэш частично не загружен:', err)))
  );
});

self.addEventListener('activate', event => {
  console.log('✅ SW: activate v5');
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(cacheName => {
        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
          console.log('🗑️ Удаляю старый кэш:', cacheName);
          return caches.delete(cacheName);
        }
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // HTML — всегда из сети
  if (request.mode === 'navigate' || request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Supabase — всегда из сети
  if (url.hostname.includes('supabase.co')) { event.respondWith(fetch(request)); return; }

  // Telegram — всегда из сети (и без кэша)
  if (url.hostname.includes('telegram.org')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Карты и геокодер — всегда из сети
  if (url.hostname.includes('cartocdn.com') || url.hostname.includes('yandex.ru') || url.hostname.includes('komoot.io') || url.hostname.includes('openstreetmap.org')) {
    event.respondWith(fetch(request));
    return;
  }

  // CDN-библиотеки — сначала кэш
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Остальное
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (!response || response.status !== 200 || request.method !== 'GET') return response;
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
