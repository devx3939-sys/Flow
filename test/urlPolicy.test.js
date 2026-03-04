import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAndValidateUrl } from "../src/urlPolicy.js";

test("normalizeAndValidateUrl accepts https URL when private checks disabled", async () => {
  const parsed = await normalizeAndValidateUrl("https://example.com", false);
  assert.equal(parsed.hostname, "example.com");
});

test("normalizeAndValidateUrl rejects invalid protocol", async () => {
  await assert.rejects(() => normalizeAndValidateUrl("ftp://example.com", false), {
    message: "Only http/https protocols are allowed"
  });
});
