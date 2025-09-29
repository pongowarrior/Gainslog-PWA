const CACHE_NAME = 'gainslog-v3'; // Incrementing cache version to force update
const urlsToCache = [
    './',
    'index.html',
    'style.css',
    'app.js',
    'manifest.json',
    'icon-192.png', 
    'icon-512.png'
];

// Install event: Caches all required assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache and added all core files.');
                return cache.addAll(urlsToCache);
            })
    );
});

// Fetch event: Serves files from cache first, then network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - return response
                if (response) {
                    return response;
                }
                // Not in cache - fetch from network
                return fetch(event.request);
            })
    );
});

// Activate event: Deletes old caches (this is key to cleaning up previous versions)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName); // Deletes old caches (v1, v2, etc.)
                    }
                })
            );
        })
    );
});
