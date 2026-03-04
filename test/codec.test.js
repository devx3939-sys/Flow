import test from "node:test";
import assert from "node:assert/strict";
import { decodeUrl, encodeUrl } from "../src/codec.js";

test("encodeUrl/decodeUrl round-trip", () => {
  const input = "https://example.com/path?a=1&b=two";
  const encoded = encodeUrl(input);
  assert.ok(!encoded.includes("/"));
  assert.equal(decodeUrl(encoded), input);
});
