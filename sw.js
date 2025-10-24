
const CACHE_NAME = 'jharkhand-repair-ai-v1';
const urlsToCache = [
  '.',
  'index.html',
  'index.js',
  'manifest.json',
  'metadata.json',
  'translations/en.json',
  'translations/hi.json',
  'translations/bn.json',
  'translations/te.json',
  'translations/ta.json',
  'translations/kn.json',
  'translations/ur.json',
  'translations/mr.json',
  'translations/gu.json',
  'translations/en_in.json',
  'icons/icon-192x192.svg',
  'icons/icon-512x512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        // Use {ignoreVary: true} to avoid issues with opaque responses for CDN assets
        const requests = urlsToCache.map(url => new Request(url, {cache: 'reload'}));
        return cache.addAll(requests).catch(err => {
            console.error('Failed to cache all URLs:', err);
            // Even if one fails, we might want to continue.
            // For a better UX, you might want to handle this more gracefully.
        });
      })
  );
});

self.addEventListener('fetch', (event) => {
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (response) => {
            // Check if we received a valid response
            if (!response || response.status !== 200) {
              return response;
            }
            
            // We don't cache API requests from genai
            if(event.request.url.includes('generativelanguage.googleapis.com')) {
                return response;
            }

            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});