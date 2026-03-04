const cfg = window.__FLOW_APP_CONFIG__;

function normalizeUserInput(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(".")) return `https://${value}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

async function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register(cfg.swPath, { scope: "/" });
  await navigator.serviceWorker.ready;
}

function encodeUrl(url) {
  return btoa(unescape(encodeURIComponent(url)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

await registerSw();

const form = document.getElementById("flow-form");
const input = document.getElementById("flow-url");
const frame = document.getElementById("flow-frame");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const normalized = normalizeUserInput(input.value);
  if (!normalized) return;
  frame.src = `${cfg.flowPrefix}/${encodeUrl(normalized)}`;
});
