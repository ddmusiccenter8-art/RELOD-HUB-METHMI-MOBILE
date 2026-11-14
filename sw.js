const CACHE_NAME = 'shop-tracker-v48.0';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=48.0',
  './app.js?v=48.0',
  './data.js?v=48.0',
  './i18n.js?v=48.0',
  './firebase-init.js?v=48.0',
  './manifest.json',
  './icon.png',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(e => console.warn('Failed to pre-cache', url, e)))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Stale-While-Revalidate Strategy for instantaneous sub-100ms loading
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Bypass Firestore live sync, WebSockets and cloud backend queries
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // Fetch network update in background to refresh cache
        const networkFetch = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            if (event.request.mode === 'navigate') {
              return cache.match('./index.html') || cache.match('/');
            }
          });

        // Instant return from local cache if available (<10ms)
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fallback to network if not in cache yet
        return networkFetch;
      });
    })
  );
});
