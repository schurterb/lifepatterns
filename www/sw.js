// Service Worker for Life Patterns
const CACHE_NAME = 'life-patterns-v4';

// Same-origin API paths — always network, never cached
const API_PREFIXES = ['/health', '/auth/', '/account', '/push/', '/data/', '/subscription/', '/sync/', '/ai/'];
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/app.js',
    '/js/db.js',
    '/js/utils.js',
    '/vendor/alpine.min.js',
    '/vendor/dexie.min.js',
    '/vendor/chart.min.js',
    '/vendor/dompurify.min.js',
    '/manifest.json',
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE).catch(error => {
                console.warn('Cache addAll error:', error);
                return Promise.resolve();
            });
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Never cache same-origin API calls (per-user, authenticated)
    const url = new URL(event.request.url);
    if (url.origin === self.location.origin && API_PREFIXES.some(p => url.pathname.startsWith(p))) {
        return;
    }

    // Skip external API calls (they should use network)
    if (event.request.url.includes('api.open-meteo.com') || 
        event.request.url.includes('services.swpc.noaa.gov')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response('Network error', { status: 503 });
            })
        );
        return;
    }

    // Cache-first strategy for assets
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) {
                return response;
            }

            return fetch(event.request).then(response => {
                // Don't cache non-successful responses
                if (!response || response.status !== 200 || response.type === 'error') {
                    return response;
                }

                // Clone the response
                const responseToCache = response.clone();

                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Return cached response if available, otherwise offline page
                return caches.match(event.request).then(response => {
                    return response || new Response('Offline', { status: 503 });
                });
            });
        })
    );
});

// Handle messages from clients
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
