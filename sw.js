const CACHE_NAME = 'darmarket-v6';
const RUNTIME_CACHE = 'darmarket-runtime-v6';

const PRECACHE_URLS = [
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  console.log('🔧 SW: install v6');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(err => console.log('Кэш частично не загружен:', err))
    )
  );
});

self.addEventListener('activate', event => {
  console.log('✅ SW: activate v6');
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

  // === HTML — всегда из сети, при офлайне — из кеша ===
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Обновляем кеш свежей версией
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then(cached =>
            cached || new Response(
              '<!doctype html><meta charset="utf-8"><title>Офлайн</title>' +
              '<body style="font-family:sans-serif;padding:40px;text-align:center;background:#f5f5f5">' +
              '<h2>Нет соединения</h2>' +
              '<p>Откройте приложение при подключённом интернете.</p>' +
              '</body>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          )
        )
    );
    return;
  }

  // === Supabase — всегда из сети ===
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // === Telegram — всегда из сети, без кэша ===
  if (url.hostname.includes('telegram.org')) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // === Карты и геокодеры — всегда из сети ===
  if (
    url.hostname.includes('cartocdn.com') ||
    url.hostname.includes('yandex.ru') ||
    url.hostname.includes('komoot.io') ||
    url.hostname.includes('openstreetmap.org')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // === CDN-библиотеки — сначала кеш, потом сеть ===
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
      )
    );
    return;
  }

  // === Всё остальное — cache-first с фолбэком в сеть ===
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
