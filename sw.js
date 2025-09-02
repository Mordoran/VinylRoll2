const CACHE = "vinylroll-v71";
const ASSETS = ["./","./index.html","./styles.css","./script.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); });
self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
});
