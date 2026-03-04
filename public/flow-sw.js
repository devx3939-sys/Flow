self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function decodeUrl(segment) {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

self.addEventListener("fetch", (event) => {
  const config = self.__FLOW_SW_CONFIG__;
  if (!config) return;

  const requestUrl = new URL(event.request.url);
  if (!requestUrl.pathname.startsWith(`${config.flowPrefix}/`)) return;

  const encoded = requestUrl.pathname.slice(config.flowPrefix.length + 1);
  if (!encoded) return;

  let target;
  try {
    target = decodeUrl(encoded);
  } catch {
    return;
  }

  const backendUrl = `${config.proxyPath}?url=${encodeURIComponent(target)}`;
  event.respondWith(fetch(backendUrl, {
    method: event.request.method,
    headers: event.request.headers,
    redirect: "follow"
  }));
});
