/* Minimal service worker for the Expenses PWA shell.
 * Its job: (1) satisfy Android's "Install app" requirement (a fetch handler),
 *          (2) cache the tiny shell so it opens instantly.
 * It does NOT touch the cross-origin Apps Script iframe — that loads live. */

var CACHE = 'expenses-shell-v1';
var ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Only serve our own shell assets from cache; let the Apps Script iframe pass through untouched.
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
  }
});
