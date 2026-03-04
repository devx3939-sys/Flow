# Flow

Flow is a lightweight, high-performance, transparent proxy service you can host on most Node-compatible platforms.

> ⚠️ Flow is for lawful testing, development, and compatibility work. It does **not** provide stealth/evasion guarantees.

## What’s new (UV-inspired mode)

Flow includes an Ultraviolet-inspired architecture for browser-based interception workflows:

- Launcher UI at `/app` with URL input + iframe
- Service worker (`/app/flow-sw.js`) to intercept `/<flow-prefix>/<encoded-url>` requests
- Encoded URL routing (`/flow/<base64url>`) with backend proxy fallback
- Basic HTML URL rewriting (`href`, `src`, `action`) so many linked resources continue through Flow paths

This is intentionally minimal and transparent (not a full UV rewriter engine).

## Simple testing UI (new)

Flow now also ships a separate simple browser-style test app at `/ui`:

- Back / Forward / Reload / Home controls
- Address/search bar
- Iframe navigation through Flow encoded routes

This UI is meant for local testing and integration checks.

## Features

- Streaming upstream-to-client forwarding for low latency
- In-memory LRU + TTL caching for cacheable `GET` responses
- Upstream status + safe header passthrough
- Configurable endpoint paths
- Optional private-network blocking to reduce SSRF risk
- Optional Flow-specific headers (`x-flow-*`) for observability

## Endpoints (defaults)

- `GET /health` — health probe
- `GET /meta` — metadata
- `GET /app` — browser launcher UI
- `GET /app/client.js` — launcher client script
- `GET /app/flow-sw.js` — service worker script
- `GET /ui` — simple test browser UI
- `GET /ui/app.js` — simple test UI app logic
- `GET /ui/styles.css` — simple test UI styles
- `GET /proxy?url=https://example.com` — direct proxy route
- `GET /flow/<encoded-url>` — encoded proxy route (base64url)

## Quick start

```bash
npm install
npm run start
```

Open:

- `http://localhost:3000/` (redirects to `/ui` for convenience)
- `http://localhost:3000/ui` (simple browser-like test UI)
- `http://localhost:3000/app` (service-worker launcher)

## Environment variables

- `PORT` (default: `3000`)
- `REQUEST_TIMEOUT_MS` (default: `20000`)
- `MAX_PAYLOAD_BYTES` (default: `10485760`)
- `CACHE_TTL_MS` (default: `60000`)
- `CACHE_MAX_ENTRIES` (default: `200`)
- `FLOW_USER_AGENT` (default: `FlowProxy/1.0 (+https://example.com; transparent-hosted-proxy)`)
- `DENY_PRIVATE_NETWORKS` (default: `true`)
- `PROXY_PATH` (default: `/proxy`)
- `HEALTH_PATH` (default: `/health`)
- `METADATA_PATH` (default: `/meta`)
- `APP_PATH` (default: `/app`)
- `UI_PATH` (default: `/ui`)
- `FLOW_PATH_PREFIX` (default: `/flow`)
- `INCLUDE_SERVER_HEADERS` (default: `true`)

## Packaging/deployment notes

If you are integrating this in a browser project:

1. Host this Node service (or embed it behind your own app server).
2. Keep `/app/*`, `/ui/*`, and your proxy path on the same origin.
3. Optionally change paths (e.g., `PROXY_PATH=/gateway/fetch`, `FLOW_PATH_PREFIX=/gateway/content`).
4. For production, add rate limiting, auth, abuse controls, and logging policy.

## Troubleshooting (Codespaces)

If `npm run start` fails with a `SyntaxError: Unexpected token '<<'` and a line containing `<<<<<<<`, your `src/server.js` contains unresolved git merge-conflict markers in source files.

Fix steps:

```bash
git status
npm run check:merge-markers
```

If markers are found, resolve them in your source files (remove `<<<<<<<`, `=======`, `>>>>>>>` blocks), then run:

```bash
npm run check
npm test
npm run start
```

## Checks

```bash
npm run check
npm test
```
