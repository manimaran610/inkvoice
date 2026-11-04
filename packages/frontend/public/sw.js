const VERSION = "v1";
const SHELL_CACHE = `inkvoice-shell-${VERSION}`;
const ASSET_CACHE = `inkvoice-assets-${VERSION}`;
const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_URLS);

      const manifestResponse = await fetch("/offline-manifest.json");
      if (!manifestResponse.ok) throw new Error("Unable to load offline asset manifest");
      const manifest = await manifestResponse.json();
      const assets = new Set();
      for (const entry of Object.values(manifest)) {
        for (const file of [entry.file, ...(entry.css || []), ...(entry.assets || [])]) {
          if (file) assets.add(file.startsWith("/") ? file : `/${file}`);
        }
      }

      const cache = await caches.open(ASSET_CACHE);
      await cache.addAll([...assets]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("inkvoice-") && key !== SHELL_CACHE && key !== ASSET_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          await cache.put("/index.html", response.clone());
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match("/index.html")) || Response.error();
        }
      })(),
    );
  }
});
