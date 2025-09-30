const CACHE_NAME = 'gainslog-v4'; 
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
        self.clients.claim().then(() => { 
            return caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (!cacheWhitelist.includes(cacheName)) {
                            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
                            return caches.delete(cacheName); 
                        }
                    })
                );
            });
        })
    );
});

// 3. Message Event: Handles the 'clear_data' message from the app
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'clear_data') {
        console.log('[Service Worker] Received clear_data message. Clearing all storage...');
        
        // Use event.waitUntil to keep the service worker alive until cleanup is done
        event.waitUntil(
            Promise.all([
                // 1. Delete all file caches
                caches.keys().then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => caches.delete(cacheName))
                    );
                }),
                
                // 2. Delete the IndexedDB database
                new Promise((resolve, reject) => {
                    const deleteRequest = indexedDB.deleteDatabase('GainsLogDB');
                    deleteRequest.onsuccess = () => {
                        console.log('[Service Worker] IndexedDB deleted.');
                        resolve();
                    };
                    deleteRequest.onerror = (err) => {
                        console.error('[Service Worker] Failed to delete IndexedDB:', err);
                        reject(err);
                    };
                })
            ])
            .then(() => {
                // Let the app know the data cleanup is done
                event.source.postMessage({ action: 'data_cleared' });
            })
            .catch(error => {
                console.error('[Service Worker] Global clear failed:', error);
                event.source.postMessage({ action: 'clear_failed' });
            })
        );
    }
});


// 4. Fetch Event: Main Request Routing Logic
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse; 
                }

                return fetch(event.request)
                    .then(networkResponse => {
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }

                        const responseToCache = networkResponse.clone();
                        
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return networkResponse;
                    })
                    .catch(error => {
                        // Network failed, nothing to do here as it wasn't a core asset
                    });
            })
    );
});
