const CACHE_NAME = 'gainslog-v4'; // ⚠️ INCREMENTED CACHE VERSION (v4)
const CORE_ASSETS = [
    './',
    'index.html',
    'style.css',
    'app.js',
    'manifest.json',
    'icon-192.png', 
    'icon-512.png'
];

// 1. Install Event: Caches all CORE_ASSETS
self.addEventListener('install', event => {
    // Force the waiting service worker to become the active service worker
    self.skipWaiting(); 
    console.log('[Service Worker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Pre-caching core assets.');
                return cache.addAll(CORE_ASSETS);
            })
            .catch(err => {
                console.error('[Service Worker] Failed to pre-cache core assets:', err);
            })
    );
});

// 2. Activate Event: Cleans up old caches (v3, v2, etc.)
self.addEventListener('activate', event => {
    console.log('[Service Worker] Activate');
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        // Claim clients immediately to control pages
        self.clients.claim().then(() => { 
            return caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Check if the current cacheName is NOT in the whitelist
                        if (!cacheWhitelist.includes(cacheName)) {
                            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
                            return caches.delete(cacheName); // Deletes old caches
                        }
                    })
                );
            });
        })
    );
});

// 3. Fetch Event: Main Request Routing Logic
self.addEventListener('fetch', event => {
    // Only handle GET requests and ignore chrome-extensions, etc.
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Check if the request is for one of the CORE_ASSETS
                if (cachedResponse) {
                    console.log(`[Service Worker] Cache Hit for: ${event.request.url}`);
                    return cachedResponse; // Strategy: Cache-First (for CORE_ASSETS)
                }

                // If not in the pre-cache, proceed to fetch from the network
                return fetch(event.request)
                    .then(networkResponse => {
                        // ⚠️ Check if we received a valid response (200, but not opaque, not an error)
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        // Strategy: Network-First with Dynamic Caching (for other assets/APIs)
                        // Clone the response because it's a stream and can only be consumed once
                        const responseToCache = networkResponse.clone();
                        
                        // Dynamically cache the new successful response for future use
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                console.log(`[Service Worker] Dynamic Caching: ${event.request.url}`);
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    })
                    .catch(error => {
                        // This catch block handles network failure (e.g., offline)
                        console.error(`[Service Worker] Fetch failed for: ${event.request.url}`, error);
                        // Optional: Return a specific offline page/image if needed
                        // return caches.match('offline.html'); 
                        // For now, let it fall through or return a generic offline response.
                    });
            })
    );
});
