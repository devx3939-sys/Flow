import test from "node:test";
import assert from "node:assert/strict";
import { TimedLruCache } from "../src/cache.js";

test("TimedLruCache evicts least recently used entries", () => {
  const cache = new TimedLruCache({ maxEntries: 2, ttlMs: 1000 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.set("c", 3);

  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("TimedLruCache expires entries by ttl", async () => {
  const cache = new TimedLruCache({ maxEntries: 2, ttlMs: 10 });
  cache.set("a", 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(cache.get("a"), null);
});
