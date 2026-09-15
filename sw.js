const CACHE_NAME = 'darmarket-v3';
const RUNTIME_CACHE = 'darmarket-runtime-v3';

// Файлы, которые кэшируем при установке (статика — картинки, шрифты)
const PRECACHE_URLS = [
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

// === УСТАНОВКА ===
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: установка v3');
  self.skipWaiting(); // Не ждать закрытия вкладок — сразу активировать
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.log('Кэш частично не загружен:', err);
      });
    })
  );
});

// === АКТИВАЦИЯ ===
self.addEventListener('activate', event => {
  console.log('✅ Service Worker: активация v3');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Удаляем ВСЕ старые кэши
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('🗑️ Удаляю старый кэш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Применяем сразу ко всем вкладкам
  );
});

// === ЗАПРОСЫ ===
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. НЕ кэшируем HTML — всегда грузим из сети (это самое важное!)
  if (request.mode === 'navigate' || 
      request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/' ||
      url.pathname === '/index.html') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 2. НЕ кэшируем запросы к Supabase (база данных, авторизация)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. НЕ кэшируем Telegram API
  if (url.hostname.includes('telegram.org')) {
    event.respondWith(fetch(request));
    return;
  }

  // 4. НЕ кэшируем Яндекс Карты / Leaflet тайлы
  if (url.hostname.includes('cartocdn.com') || 
      url.hostname.includes('yandex.ru') ||
      url.hostname.includes('komoot.io')) {
    event.respondWith(fetch(request));
    return;
  }

  // 5. Статика (картинки, шрифты, CSS) — сначала кэш, потом сеть
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then(response => {
        // Кэшируем только успешные GET-запросы
        if (!response || response.status !== 200 || request.method !== 'GET') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => {
          cache.put(request, responseToCache);
        });
        return response;
      });
    })
  );
});

// === СООБЩЕНИЯ ОТ ГЛАВНОЙ СТРАНИЦЫ ===
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
