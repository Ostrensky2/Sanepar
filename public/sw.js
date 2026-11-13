/*
 * Yva'e sem sinal (service worker).
 *
 * Em campo quase nunca há sinal. Este arquivo faz o app abrir e mostrar os dados
 * do último acesso mesmo assim:
 *
 * - telas (navegação): tenta a rede; sem resposta em poucos segundos, abre a cópia
 *   guardada da última vez que a tela foi aberta com sinal;
 * - arquivos do app (/_next/static): guardados na primeira vez e reaproveitados;
 * - alguns dados de leitura (sessão, pontos, campanhas, parâmetros, registros):
 *   tenta a rede e, sem resposta, devolve a última cópia guardada.
 *
 * Gravações (POST, PUT, PATCH, DELETE) nunca passam por aqui: o que é registrado
 * sem sinal fica guardado pelo próprio app (lib/field-outbox) e sobe sozinho.
 * Ao sair do sistema ou entrar com outra conta, os dados guardados são apagados.
 */

const STATIC_CACHE = "yvae-static-v1";
const PAGES_CACHE = "yvae-pages-v1";
const DATA_CACHE = "yvae-data-v1";
const KNOWN_CACHES = [STATIC_CACHE, PAGES_CACHE, DATA_CACHE];

/** Telas que ficam guardadas mesmo sem terem sido abertas (o app pede ao abrir). */
const OFFLINE_ROUTES = ["/dados/diario-de-campo", "/"];

/** Leituras que podem vir da última cópia quando não há sinal. */
const DATA_PATHS = new Set([
  "/api/auth-users/session",
  "/api/role-permissions",
  "/api/campaign-management",
  "/api/field-diary",
  "/api/field-diary/point-options",
  "/api/field-diary/planned-points",
  "/api/field-diary/parameters",
  "/api/field-diary/samples",
  "/api/field-diary/readings",
  "/api/field-diary/history",
]);

const PAGE_TIMEOUT_MS = 7000;
const DATA_TIMEOUT_MS = 6000;
const WARM_MIN_INTERVAL_MS = 30 * 60 * 1000;
const MAX_STATIC_ENTRIES = 600;
const OFFLINE_HEADER = "x-yvae-sem-sinal";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith("yvae-") && !KNOWN_CACHES.includes(name)).map((name) => caches.delete(name)),
      );
      await trimStaticCache();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;

  if (!data || typeof data !== "object") return;

  if (data.type === "yvae:warm") {
    event.waitUntil(warm(Array.isArray(data.data) ? data.data : []));
  }

  if (data.type === "yvae:clear-user-data") {
    event.waitUntil(clearUserData());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    // Sair do sistema ou entrar com outra conta: os dados guardados da conta anterior saem do aparelho.
    if (isSessionChange(request.method, url.pathname)) {
      event.respondWith(passAndClear(request));
    }
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(page(event, url));
    return;
  }

  // Navegação interna do Next (RSC): sem sinal, a falha faz o Next abrir a tela
  // inteira, que então vem da cópia guardada.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (DATA_PATHS.has(url.pathname)) {
    event.respondWith(data(event, url));
    return;
  }

  if (isStaticFile(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

function isSessionChange(method, pathname) {
  return (
    (method === "DELETE" && pathname === "/api/auth-users/session") ||
    (method === "POST" && pathname === "/api/auth-users/login")
  );
}

async function passAndClear(request) {
  try {
    return await fetch(request);
  } finally {
    await clearUserData();
  }
}

async function clearUserData() {
  await Promise.all([caches.delete(DATA_CACHE), caches.delete(PAGES_CACHE)]);
}

function isStaticFile(pathname) {
  return (
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/data/") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    /\.(?:svg|png|jpe?g|webp|ico|woff2?)$/i.test(pathname)
  );
}

function pageKey(url) {
  return new URL(url.pathname, self.location.origin).href;
}

function isCacheablePage(response) {
  return (
    response &&
    response.status === 200 &&
    response.type === "basic" &&
    !response.redirected &&
    (response.headers.get("content-type") || "").includes("text/html")
  );
}

/** A promessa vence se a rede responder antes do prazo; senão, falha (e a rede segue em segundo plano). */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function markedFromDevice(response) {
  const headers = new Headers(response.headers);
  headers.set(OFFLINE_HEADER, "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function page(event, url) {
  const key = pageKey(url);
  const network = fetch(event.request).then(async (response) => {
    if (isCacheablePage(response)) {
      const cache = await caches.open(PAGES_CACHE);
      await cache.put(key, response.clone());
    }
    return response;
  });

  event.waitUntil(network.then(() => undefined, () => undefined));

  try {
    return await withTimeout(network, PAGE_TIMEOUT_MS);
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const cached = await cache.match(key);

    if (cached) return markedFromDevice(cached);

    const diary = await cache.match(pageKey(new URL("/dados/diario-de-campo", self.location.origin)));
    return offlinePage(Boolean(diary));
  }
}

async function data(event, url) {
  const key = url.href;
  const network = fetch(event.request).then(async (response) => {
    const cache = await caches.open(DATA_CACHE);

    if (response.status === 200) {
      await cache.put(key, response.clone());
    } else if (response.status === 401 || response.status === 403) {
      // Sem sessão ou sem permissão: a cópia antiga não pode continuar valendo.
      await cache.delete(key);
    }

    return response;
  });

  event.waitUntil(network.then(() => undefined, () => undefined));

  try {
    const response = await withTimeout(network, DATA_TIMEOUT_MS);

    if (response.status < 500) return response;

    // Nuvem fora do ar: a última cópia é melhor do que nada.
    const cached = await (await caches.open(DATA_CACHE)).match(key);
    return cached ? markedFromDevice(cached) : response;
  } catch {
    const cached = await (await caches.open(DATA_CACHE)).match(key);

    if (cached) return markedFromDevice(cached);

    return new Response(
      JSON.stringify({ error: "Sem sinal, e este dado ainda não foi aberto neste aparelho.", offline: true }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", [OFFLINE_HEADER]: "1" } },
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }

  return response;
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      await cache.put(event.request, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(network.then(() => undefined, () => undefined));
    return cached;
  }

  return network;
}

/**
 * Guarda as telas de campo e os arquivos delas, e as leituras pedidas pelo app,
 * para o aparelho funcionar sem sinal mesmo numa tela que ainda não foi aberta.
 */
async function warm(dataUrls) {
  const pages = await caches.open(PAGES_CACHE);
  const statics = await caches.open(STATIC_CACHE);

  for (const route of OFFLINE_ROUTES) {
    const key = pageKey(new URL(route, self.location.origin));

    try {
      const cached = await pages.match(key);
      const cachedAt = cached ? Date.parse(cached.headers.get("date") || "") : NaN;

      if (cached && Number.isFinite(cachedAt) && Date.now() - cachedAt < WARM_MIN_INTERVAL_MS) continue;

      const response = await fetch(key, { credentials: "same-origin", cache: "no-store" });

      if (!isCacheablePage(response)) continue;

      const html = await response.clone().text();
      await pages.put(key, response);

      for (const asset of staticAssetsOf(html)) {
        if (await statics.match(asset)) continue;

        const assetResponse = await fetch(asset, { credentials: "same-origin" });

        if (assetResponse.ok) await statics.put(asset, assetResponse);
      }
    } catch {
      // Sem sinal agora: fica para a próxima vez que o app abrir.
    }
  }

  const cache = await caches.open(DATA_CACHE);

  for (const raw of dataUrls) {
    try {
      const url = new URL(String(raw), self.location.origin);

      if (url.origin !== self.location.origin || !DATA_PATHS.has(url.pathname)) continue;

      const response = await fetch(url.href, { credentials: "same-origin", cache: "no-store" });

      if (response.status === 200) await cache.put(url.href, response);
    } catch {
      // Idem.
    }
  }
}

function staticAssetsOf(html) {
  const assets = new Set();

  for (const match of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\)]+/g)) {
    const path = match[0].startsWith("/_next/") ? match[0] : `/_next/${match[0]}`;
    assets.add(new URL(path, self.location.origin).href);
  }

  return assets;
}

async function trimStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;

  for (let index = 0; index < excess; index += 1) {
    await cache.delete(keys[index]);
  }
}

function offlinePage(hasDiary) {
  const link = hasDiary
    ? '<p><a href="/dados/diario-de-campo">Abrir o Diário de campo</a></p>'
    : "<p>Abra o app uma vez com sinal para ele ficar disponível no campo.</p>";
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem sinal | Yva'e Monitoramento</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Arial,Helvetica,sans-serif;background:#f4f7fb;color:#12284a;padding:16px;box-sizing:border-box}
main{max-width:420px;background:#fff;border:1px solid #d5deea;border-radius:16px;padding:24px;text-align:center}
h1{font-size:20px;margin:0 0 8px}p{font-size:15px;line-height:1.5;color:#46566f;margin:8px 0}
a{display:inline-block;margin-top:8px;padding:12px 20px;border-radius:12px;background:#12284a;color:#fff;font-weight:700;text-decoration:none}
</style></head>
<body><main><h1>Sem sinal</h1><p>Esta tela ainda não foi aberta neste aparelho com sinal, por isso não está guardada.</p>${link}</main></body></html>`;

  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", [OFFLINE_HEADER]: "1" },
  });
}
