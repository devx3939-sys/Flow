import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";

function startTestServer(handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  return once(server, "listening").then(() => server);
}

async function loadServerModule() {
  return import(`../src/server.js?test=${Date.now()}-${Math.random()}`);
}

async function loadCodecModule() {
  return import(`../src/codec.js?test=${Date.now()}-${Math.random()}`);
}

test("Flow proxy forwards upstream status and headers", async (t) => {
  process.env.DENY_PRIVATE_NETWORKS = "false";
  delete process.env.PROXY_PATH;
  delete process.env.INCLUDE_SERVER_HEADERS;

  const { createFlowServer } = await loadServerModule();

  const upstream = await startTestServer((req, res) => {
    if (req.url === "/missing") {
      res.writeHead(404, { "content-type": "text/plain", etag: "abc" });
      res.end("missing");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });

  const flow = createFlowServer();
  flow.listen(0, "127.0.0.1");
  await once(flow, "listening");

  t.after(() => {
    upstream.close();
    flow.close();
  });

  const upstreamPort = upstream.address().port;
  const flowPort = flow.address().port;

  const target = encodeURIComponent(`http://127.0.0.1:${upstreamPort}/missing`);
  const response = await fetch(`http://127.0.0.1:${flowPort}/proxy?url=${target}`);

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("etag"), "abc");
  assert.equal(response.headers.get("x-flow-cache"), "MISS");
  assert.equal(await response.text(), "missing");
});

test("Flow supports custom route path and optional service headers", async (t) => {
  process.env.DENY_PRIVATE_NETWORKS = "false";
  process.env.PROXY_PATH = "/gateway/fetch";
  process.env.INCLUDE_SERVER_HEADERS = "false";

  const { createFlowServer } = await loadServerModule();

  const upstream = await startTestServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });

  const flow = createFlowServer();
  flow.listen(0, "127.0.0.1");
  await once(flow, "listening");

  t.after(() => {
    upstream.close();
    flow.close();
  });

  const upstreamPort = upstream.address().port;
  const flowPort = flow.address().port;

  const target = encodeURIComponent(`http://127.0.0.1:${upstreamPort}/`);

  const oldPathResponse = await fetch(`http://127.0.0.1:${flowPort}/proxy?url=${target}`);
  assert.equal(oldPathResponse.status, 404);

  const response = await fetch(`http://127.0.0.1:${flowPort}/gateway/fetch?url=${target}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-flow-cache"), null);
  assert.equal(response.headers.get("x-flow-proxy"), null);
  assert.equal(await response.text(), "ok");
});


test("Flow forwards no-content upstream responses without treating them as errors", async (t) => {
  process.env.DENY_PRIVATE_NETWORKS = "false";
  delete process.env.PROXY_PATH;

  const { createFlowServer } = await loadServerModule();

  const upstream = await startTestServer((_req, res) => {
    res.writeHead(204, { etag: "nobody" });
    res.end();
  });

  const flow = createFlowServer();
  flow.listen(0, "127.0.0.1");
  await once(flow, "listening");

  t.after(() => {
    upstream.close();
    flow.close();
  });

  const upstreamPort = upstream.address().port;
  const flowPort = flow.address().port;
  const target = encodeURIComponent(`http://127.0.0.1:${upstreamPort}/`);

  const response = await fetch(`http://127.0.0.1:${flowPort}/proxy?url=${target}`);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("etag"), "nobody");
  assert.equal(await response.text(), "");
});

test("Flow blocks UI static path traversal attempts", async (t) => {
  process.env.DENY_PRIVATE_NETWORKS = "false";
  delete process.env.UI_PATH;

  const { createFlowServer } = await loadServerModule();

  const flow = createFlowServer();
  flow.listen(0, "127.0.0.1");
  await once(flow, "listening");

  t.after(() => {
    flow.close();
  });

  const flowPort = flow.address().port;
  const response = await fetch(`http://127.0.0.1:${flowPort}/ui/%2e%2e/package.json`);

  assert.ok(response.status === 400 || response.status === 404);
  const payload = await response.json();
  assert.ok(payload.error === "Invalid path" || payload.error === "Not found");
});

test("Flow serves app shell and flow encoded path", async (t) => {
  process.env.DENY_PRIVATE_NETWORKS = "false";
  delete process.env.PROXY_PATH;
  delete process.env.APP_PATH;
  delete process.env.FLOW_PATH_PREFIX;
  delete process.env.UI_PATH;

  const { createFlowServer } = await loadServerModule();
  const { encodeUrl } = await loadCodecModule();

  const upstream = await startTestServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("proxied");
  });

  const flow = createFlowServer();
  flow.listen(0, "127.0.0.1");
  await once(flow, "listening");

  t.after(() => {
    upstream.close();
    flow.close();
  });

  const upstreamPort = upstream.address().port;
  const flowPort = flow.address().port;

  const appResponse = await fetch(`http://127.0.0.1:${flowPort}/app`);
  assert.equal(appResponse.status, 200);
  assert.match(await appResponse.text(), /<iframe id="flow-frame"/);


  const rootResponse = await fetch(`http://127.0.0.1:${flowPort}/`, { redirect: "manual" });
  assert.equal(rootResponse.status, 302);
  assert.equal(rootResponse.headers.get("location"), "/ui");

  const uiResponse = await fetch(`http://127.0.0.1:${flowPort}/ui`);
  assert.equal(uiResponse.status, 200);
  assert.match(await uiResponse.text(), /id="nav-form"/);

  const uiScriptResponse = await fetch(`http://127.0.0.1:${flowPort}/ui/app.js`);
  assert.equal(uiScriptResponse.status, 200);
  assert.match(await uiScriptResponse.text(), /window\.__FLOW_UI_CONFIG__/);

  const encoded = encodeUrl(`http://127.0.0.1:${upstreamPort}/`);
  const proxied = await fetch(`http://127.0.0.1:${flowPort}/flow/${encoded}`);
  assert.equal(proxied.status, 200);
  assert.equal(await proxied.text(), "proxied");
});
