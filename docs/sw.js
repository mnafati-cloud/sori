/* Sori service worker — network-first (mises à jour auto), repli cache (hors-ligne) */
const CACHE = "sori-v157";
const ASSETS = ["./", "./index.html", "./style.css", "./themes.css", "./themes.js",
                "./engine.js", "./app.js", "./data.js", "./extra.js",
                "./events-data.js", "./events.js", "./search.js", "./exam.js", "./quests.js", "./typing.js", "./numbers.js", "./structure.js", "./placement.js", "./conversation.js",
                "./grammar.js", "./grammar-data.js", "./gramex.js", "./story.js", "./story-data.js", "./story-sens.js",
                "./scenarios-data.js", "./scenarios.js", "./player.js",
                "./fonts/nanum-myeongjo-bold-sub.woff2", "./fonts/alegreya-bold-sub.woff2",
                "./fonts/caveat-bold-sub.woff2",
                "./audio/index.js", "./manifest.json", "./icon-192-v3.png", "./icon-512-v3.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    /* "sori-audio-store" = telechargement mode avion (app.js) : ne JAMAIS le purger ici */
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== "sori-audio-store").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;  // api.github.com etc. : ne pas intercepter/cacher
  /* v157 : les MP3 ne vont JAMAIS dans le cache versionne — ils ont leur cache dedie
     ("sori-audio-store", rempli par le telechargement mode avion). Les copier ici doublait
     l'occupation disque (~283 Mo -> ~566 Mo) et faisait de l'origine la premiere victime
     d'une eviction de stockage Android — le scenario qui a efface la progression le 21/08. */
  const isAudio = url.pathname.endsWith(".mp3");
  e.respondWith(
    /* no-cache: toujours revalider aupres du serveur (304 pas cher via ETag)
       -> les mises a jour arrivent vraiment, le repli cache gere le hors-ligne */
    fetch(e.request, { cache: "no-cache" }).then(res => {
      /* v157 : garde res.ok — une page d'erreur (404/503 d'un deploiement rate) n'ecrase
         plus la bonne copie du cache : le repli hors-ligne survit a l'incident serveur. */
      if (res.ok && !isAudio) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      /* caches.match global : cherche AUSSI dans sori-audio-store -> l'audio telecharge
         reste servi hors-ligne meme sans copie versionnee. */
      caches.match(e.request, { ignoreSearch: true })
        /* v157 : le repli index.html est reserve aux NAVIGATIONS. Le servir a n'importe
           quel GET echoue faisait stocker du HTML sous des URLs de .mp3 pendant un
           telechargement coupe (empoisonnement definitif de l'audio hors-ligne). */
        .then(hit => hit || (e.request.mode === "navigate"
                             ? caches.match("./index.html")
                             : Response.error()))
    )
  );
});
