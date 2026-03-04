import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const PRIVATE_IPV4_RANGES = [
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["100.64.0.0", 10],
  ["0.0.0.0", 8]
];

function ipv4ToInt(ip) {
  return ip
    .split(".")
    .map(Number)
    .reduce((acc, n) => (acc << 8) + n, 0) >>> 0;
}

function inIpv4Cidr(ip, [base, prefix]) {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isPrivateIp(ip) {
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }

  if (isIP(ip) !== 4) {
    return true;
  }

  return PRIVATE_IPV4_RANGES.some((range) => inIpv4Cidr(ip, range));
}

export async function normalizeAndValidateUrl(rawUrl, denyPrivateNetworks = true) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https protocols are allowed");
  }

  if (denyPrivateNetworks) {
    const result = await lookup(parsed.hostname, { all: true });
    if (!result.length || result.some((item) => isPrivateIp(item.address))) {
      throw new Error("Target host is not allowed");
    }
  }

  return parsed;
}
