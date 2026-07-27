const CACHE_NAME = 'archivo-personal-shell-v2';
const ARCHIVOS_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './logo.jpg'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ARCHIVOS_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres
          .filter(function (nombre) { return nombre !== CACHE_NAME; })
          .map(function (nombre) { return caches.delete(nombre); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (evento) {
  const url = evento.request.url;

  if (url.indexOf('script.google.com') !== -1 || url.indexOf('googleapis.com') !== -1) {
    return; 
  }

  evento.respondWith(
    caches.match(evento.request).then(function (respuestaCache) {
      return respuestaCache || fetch(evento.request);
    })
  );
});
