const CACHE_NAME = "leanerp-mobile-shell-v1";
const SHELL_FILES = ["/mobile", "/mobile.js", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting(); // Activate the new service worker as soon as possible.
});

self.addEventListener("activate", (event) => {
  // Delete every cache except the current cache.
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim(); // Take control of pages that are already open
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!SHELL_FILES.includes(url.pathname)) return; // records/API calls stay untouched, always live

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
        return res;
      });
      return cached || network;
    })
  );
});
