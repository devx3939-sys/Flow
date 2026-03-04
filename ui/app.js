const cfg = window.__FLOW_UI_CONFIG__;
const frame = document.getElementById("proxy-frame");
const input = document.getElementById("nav-input");
const navForm = document.getElementById("nav-form");
const backBtn = document.getElementById("back-btn");
const forwardBtn = document.getElementById("forward-btn");
const reloadBtn = document.getElementById("reload-btn");
const homeBtn = document.getElementById("home-btn");
 codex/create-undetectable-proxy-system-flow-q0loq5
const quickLinks = Array.from(document.querySelectorAll(".quick-link"));
const body = document.body;
=======
 main

const historyStack = [];
let historyIndex = -1;

function normalizeUserInput(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(".")) return `https://${value}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
}

function encodeUrl(url) {
  return btoa(unescape(encodeURIComponent(url)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toProxyPath(url) {
  return `${cfg.flowPrefix}/${encodeUrl(url)}`;
}

function renderNavigationState() {
  backBtn.disabled = historyIndex <= 0;
  forwardBtn.disabled = historyIndex >= historyStack.length - 1;
  if (historyIndex >= 0) {
    input.value = historyStack[historyIndex];
  }
}

 codex/create-undetectable-proxy-system-flow-q0loq5
function setLoading(isLoading) {
  body.classList.toggle("loading", isLoading);
}

=======
 main
function navigateTo(rawUrl, push = true) {
  const normalized = normalizeUserInput(rawUrl);
  if (!normalized) return;

 codex/create-undetectable-proxy-system-flow-q0loq5
  setLoading(true);
=======
 main
  frame.src = toProxyPath(normalized);

  if (push) {
    historyStack.splice(historyIndex + 1);
    historyStack.push(normalized);
    historyIndex = historyStack.length - 1;
  }

  renderNavigationState();
}

backBtn.addEventListener("click", () => {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  navigateTo(historyStack[historyIndex], false);
});

forwardBtn.addEventListener("click", () => {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex += 1;
  navigateTo(historyStack[historyIndex], false);
});

reloadBtn.addEventListener("click", () => {
  if (historyIndex < 0) return;
  navigateTo(historyStack[historyIndex], false);
});

homeBtn.addEventListener("click", () => {
  navigateTo(cfg.homeUrl, true);
});

 codex/create-undetectable-proxy-system-flow-q0loq5
quickLinks.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    if (target) navigateTo(target, true);
  });
});

=======
 main
navForm.addEventListener("submit", (event) => {
  event.preventDefault();
  navigateTo(input.value, true);
});

 codex/create-undetectable-proxy-system-flow-q0loq5
frame.addEventListener("load", () => {
  setLoading(false);
});

=======
 main
navigateTo(cfg.homeUrl, true);
