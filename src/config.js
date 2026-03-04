function normalizeRoutePath(value, fallback) {
  const candidate = (value || fallback).trim();
  const withLeadingSlash = candidate.startsWith("/") ? candidate : `/${candidate}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

export function getConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    maxPayloadBytes: Number(process.env.MAX_PAYLOAD_BYTES || 10 * 1024 * 1024),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 20_000),
    userAgent:
      process.env.FLOW_USER_AGENT ||
      "FlowProxy/1.0 (+https://example.com; transparent-hosted-proxy)",
    cacheTtlMs: Number(process.env.CACHE_TTL_MS || 60_000),
    cacheMaxEntries: Number(process.env.CACHE_MAX_ENTRIES || 200),
    denyPrivateNetworks: process.env.DENY_PRIVATE_NETWORKS !== "false",
    proxyPath: normalizeRoutePath(process.env.PROXY_PATH, "/proxy"),
    healthPath: normalizeRoutePath(process.env.HEALTH_PATH, "/health"),
    metadataPath: normalizeRoutePath(process.env.METADATA_PATH, "/meta"),
    appPath: normalizeRoutePath(process.env.APP_PATH, "/app"),
    uiPath: normalizeRoutePath(process.env.UI_PATH, "/ui"),
    flowPathPrefix: normalizeRoutePath(process.env.FLOW_PATH_PREFIX, "/flow"),
    includeServerHeaders: process.env.INCLUDE_SERVER_HEADERS !== "false"
  };
}

export const config = getConfig();
