/* Sori service worker — network-first (mises à jour auto), repli cache (hors-ligne) */
const CACHE = "sori-v7";
const ASSETS = ["./", "./index.html", "./style.css", "./engine.js", "./app.js", "./data.js", "./extra.js",
                "./audio/index.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    /* no-cache: toujours revalider aupres du serveur (304 pas cher via ETag)
       -> les mises a jour arrivent vraiment, le repli cache gere le hors-ligne */
    fetch(e.request, { cache: "no-cache" }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match("./index.html"))
    )
  );
});
