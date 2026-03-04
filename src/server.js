import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { PassThrough, Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { TimedLruCache } from "./cache.js";
import { decodeUrl, encodeUrl } from "./codec.js";
import { normalizeAndValidateUrl } from "./urlPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const uiDir = path.join(__dirname, "..", "ui");

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function shouldCache(headers, status, method, cfg) {
  if (method !== "GET" || status !== 200) return false;
  const control = headers.get("cache-control") || "";
  if (control.includes("no-store") || control.includes("private")) return false;
  const length = Number(headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > cfg.maxPayloadBytes) return false;
  return true;
}

function toResponseHeaders(upstreamHeaders, cacheState, cfg) {
  const responseHeaders = {};
  if (cfg.includeServerHeaders) {
    responseHeaders["x-flow-cache"] = cacheState;
    responseHeaders["x-flow-proxy"] = "Flow";
  }

  for (const [headerName, headerValue] of upstreamHeaders.entries()) {
    const lower = headerName.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "content-length") continue;
    responseHeaders[headerName] = headerValue;
  }
  return responseHeaders;
}

function makeUpstreamHeaders(req, cfg) {
  const headers = {
    "user-agent": req.headers["user-agent"] || cfg.userAgent,
    accept: req.headers.accept || "*/*"
  };
  const passThroughHeaders = ["accept-language", "accept-encoding", "if-none-match", "if-modified-since", "range"];
  for (const headerName of passThroughHeaders) {
    const value = req.headers[headerName];
    if (typeof value === "string" && value.length > 0) headers[headerName] = value;
  }
  return headers;
}


function getContentType(filePath) {
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function rewriteHtmlDocument(html, targetUrl, cfg) {
  const target = new URL(targetUrl);
  const attrPattern = /(href|src|action)=(["'])([^"']+)\2/gi;

  return html.replace(attrPattern, (full, attr, quote, value) => {
    if (!value || value.startsWith("#") || value.startsWith("data:") || value.startsWith("javascript:")) {
      return full;
    }

    let absolute;
    try {
      absolute = new URL(value, target).toString();
    } catch {
      return full;
    }

    return `${attr}=${quote}${cfg.flowPathPrefix}/${encodeUrl(absolute)}${quote}`;
  });
}

async function serveFile(res, filePath, contentType, inject = null) {
  const content = await fs.readFile(filePath, "utf8");
  const body = inject ? inject(content) : content;
  res.writeHead(200, { "content-type": contentType });
  res.end(body);
}

function addCacheHitHeaders(headers, cfg) {
  if (!cfg.includeServerHeaders) return headers;
  return { ...headers, "x-flow-cache": "HIT" };
}

async function proxyRequest(req, res, targetRaw, cfg, cache) {
  if (!targetRaw) return json(res, 400, { error: "Missing url query parameter" });

  let targetUrl;
  try {
    targetUrl = await normalizeAndValidateUrl(targetRaw, cfg.denyPrivateNetworks);
  } catch (error) {
    return json(res, 400, { error: error.message });
  }

  const cacheKey = `${req.method}:${targetUrl.toString()}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    res.writeHead(cached.status, addCacheHitHeaders({ ...cached.headers, "content-length": String(cached.body.byteLength) }, cfg));
    if (req.method === "HEAD") return res.end();
    return res.end(cached.body);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), cfg.requestTimeoutMs);

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      redirect: "follow",
      signal: abortController.signal,
      headers: makeUpstreamHeaders(req, cfg)
    });

    if (!upstream.body && req.method !== "HEAD") return json(res, 502, { error: "Upstream returned empty body" });

    const responseHeaders = toResponseHeaders(upstream.headers, "MISS", cfg);
    const contentType = upstream.headers.get("content-type") || "";

    if (req.method === "GET" && contentType.includes("text/html") && upstream.body) {
      const html = await upstream.text();
      const rewritten = rewriteHtmlDocument(html, targetUrl.toString(), cfg);
      res.writeHead(upstream.status, responseHeaders);
      res.end(rewritten);
      return;
    }

    const cacheable = shouldCache(upstream.headers, upstream.status, req.method, cfg);
    if (!cacheable || !upstream.body) {
      res.writeHead(upstream.status, responseHeaders);
      if (req.method === "HEAD" || !upstream.body) return res.end();
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    }

    let totalBytes = 0;
    let cacheAllowed = true;
    const chunks = [];
    const collector = new PassThrough();
    collector.on("data", (chunk) => {
      totalBytes += chunk.byteLength;
      if (cacheAllowed && totalBytes <= cfg.maxPayloadBytes) {
        chunks.push(chunk);
      } else {
        cacheAllowed = false;
        chunks.length = 0;
      }
    });

    res.writeHead(upstream.status, responseHeaders);
    await pipeline(Readable.fromWeb(upstream.body), collector, res);

    if (cacheAllowed && chunks.length > 0) {
      cache.set(cacheKey, { status: upstream.status, headers: responseHeaders, body: Buffer.concat(chunks) });
    }
  } catch (error) {
    if (error?.name === "AbortError") return json(res, 504, { error: "Upstream request timeout" });
    return json(res, 502, { error: "Failed to reach upstream" });
  } finally {
    clearTimeout(timeout);
  }
}

export function createFlowServer() {
  const cfg = getConfig();
  const cache = new TimedLruCache({ maxEntries: cfg.cacheMaxEntries, ttlMs: cfg.cacheTtlMs });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "GET" && url.pathname === cfg.healthPath) return json(res, 200, { status: "ok", service: "Flow" });

<<<<< codex/create-undetectable-proxy-system-flow-cgzylk
    if (req.method === "GET" && url.pathname === "/") {
      if (cfg.uiPath === "/") {
        return serveFile(res, path.join(uiDir, "index.html"), "text/html; charset=utf-8");
      }
      res.writeHead(302, { location: cfg.uiPath });
      return res.end();
    }

=======
>>>>> main
    if (req.method === "GET" && url.pathname === cfg.metadataPath) {
      return json(res, 200, {
        name: "Flow",
        mode: "transparent uv-inspired",
        usage: `Open ${cfg.uiPath} or ${cfg.appPath}, then browse via ${cfg.flowPathPrefix}/<encoded-url>`
      });
    }

    if (req.method === "GET" && url.pathname === cfg.appPath) {
      return serveFile(res, path.join(publicDir, "app.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === `${cfg.appPath}/client.js`) {
      return serveFile(res, path.join(publicDir, "client.js"), "application/javascript; charset=utf-8", (content) => {
        const appConfig = {
          flowPrefix: cfg.flowPathPrefix,
          proxyPath: cfg.proxyPath,
          swPath: `${cfg.appPath}/flow-sw.js`
        };
        return `window.__FLOW_APP_CONFIG__ = ${JSON.stringify(appConfig)};\n${content}`;
      });
    }

    if (req.method === "GET" && url.pathname === `${cfg.appPath}/flow-sw.js`) {
      return serveFile(res, path.join(publicDir, "flow-sw.js"), "application/javascript; charset=utf-8", (content) => {
        const swConfig = {
          flowPrefix: cfg.flowPathPrefix,
          proxyPath: cfg.proxyPath
        };
        return `self.__FLOW_SW_CONFIG__ = ${JSON.stringify(swConfig)};\n${content}`;
      });
    }

    if (req.method === "GET" && url.pathname === cfg.uiPath) {
      return serveFile(res, path.join(uiDir, "index.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname.startsWith(`${cfg.uiPath}/`)) {
      const relative = url.pathname.slice(cfg.uiPath.length + 1);
      if (relative === "app.js") {
        return serveFile(res, path.join(uiDir, "app.js"), "application/javascript; charset=utf-8", (content) => {
          const uiConfig = {
            flowPrefix: cfg.flowPathPrefix,
            homeUrl: "https://example.com"
          };
          return `window.__FLOW_UI_CONFIG__ = ${JSON.stringify(uiConfig)};
${content}`;
        });
      }

      const filePath = path.join(uiDir, relative);
      if (!filePath.startsWith(uiDir)) {
        return json(res, 400, { error: "Invalid path" });
      }

      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) {
          return json(res, 404, { error: "Not found" });
        }
      } catch {
        return json(res, 404, { error: "Not found" });
      }

      return serveFile(res, filePath, getContentType(filePath));
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname === cfg.proxyPath) {
      return proxyRequest(req, res, url.searchParams.get("url"), cfg, cache);
    }

    if ((req.method === "GET" || req.method === "HEAD") && url.pathname.startsWith(`${cfg.flowPathPrefix}/`)) {
      const encoded = url.pathname.slice(cfg.flowPathPrefix.length + 1);
      if (!encoded) return json(res, 400, { error: "Missing encoded URL" });
      let decoded;
      try {
        decoded = decodeUrl(encoded);
      } catch {
        return json(res, 400, { error: "Invalid encoded URL" });
      }
      return proxyRequest(req, res, decoded, cfg, cache);
    }

    return json(res, 404, { error: "Not found" });
  });
}

export function startServer(port = getConfig().port) {
  const server = createFlowServer();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Flow listening on port ${port}`);
  });
  return server;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) startServer();
