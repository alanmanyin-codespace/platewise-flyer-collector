import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOffers } from "../dist/collector.js";

const now = new Date("2026-10-31T12:00:00Z");
const base = { id: "1", productName: "Milk", retailer: "Example", price: 4.99, validUntil: "2026-11-01" };

test("normalizes valid offers and rejects duplicates, invalid prices and expired offers", () => {
  const result = normalizeOffers([base, base, {...base, id: "2", price: -1}, {...base, id: "3", validUntil: "2026-10-30"}], { postalCode: "T2P 1J9", provider: "mock", now });
  assert.equal(result.offers.length, 1);
  assert.equal(result.rejected, 3);
  assert.equal(result.offers[0].currency, "CAD");
  assert.equal(result.offers[0].location, "T2P 1J9");
});

test("rejects malformed dates and offers with no expiry rather than asserting validity", () => {
  const result = normalizeOffers([{...base, validUntil: "2026-02-30"}, {...base, id: "2", validUntil: undefined}], { postalCode: "T2P 1J9", provider: "mock", now });
  assert.equal(result.offers.length, 0);
  assert.equal(result.rejected, 2);
});
