const CACHE_NAME = 'ironlog-v1'; 
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
