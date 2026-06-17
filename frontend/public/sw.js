const CACHE_STATIC = 'pos-static-v2';
const CACHE_API = 'pos-api-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/icon-maskable.svg',
];

// ----- Install: cache app shell -----
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ----- Activate: clean old caches -----
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_API)
          .map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ----- Fetch: strategy per request type -----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // --- API requests: Network-first, fallback to cache ---
  if (url.pathname.startsWith('/api/')) {
    // Only cache GET requests
    if (request.method === 'GET') {
      event.respondWith(networkFirstWithCache(request));
    }
    // POST/PUT/DELETE: must go to network (will be queued by app if offline)
    return;
  }

  // --- Static assets & navigation: Cache-first ---
  event.respondWith(cacheFirst(request));
});

// ----- Strategies -----
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    // Hanya cache response sukses (2xx), jangan cache error 500
    if (response.ok) {
      const cache = await caches.open(CACHE_API);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline: try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving from cache:', request.url);
      return cached;
    }
    // No cache: return a JSON error
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Tidak ada koneksi & data tidak tersedia di cache' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Hanya cache response sukses (2xx)
    if (response.ok && response.status < 400) {
      const cache = await caches.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // If it's a navigation, serve index.html (SPA fallback)
    if (request.mode === 'navigate') {
      const cached = await caches.match('/index.html');
      if (cached) return cached;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ----- Listen for messages from the app -----
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_API_CACHE') {
    caches.delete(CACHE_API).then(() => {
      console.log('[SW] API cache cleared');
      event.ports?.[0]?.postMessage({ ok: true });
    });
  }
});
