import { test } from "node:test";
import assert from "node:assert/strict";
import { searchFlipp } from "../dist/providers/flipp.js";

test("requests the given location and query and preserves unknown price details", async () => {
  let requested;
  const fake = async (url) => {
    requested = new URL(url);
    return new Response(JSON.stringify({items: [{id: 42, name: "Broccoli", merchant_name: "Co-op", current_price: 2.49, post_price_text: "/lb", valid_to: "2026-11-05T04:59:59Z"}, {id: 43, name: "Rice", current_price: null}], ecom_items: []}), {status: 200});
  };
  const results = await searchFlipp("T2P 1J9", "broccoli", 2, fake);
  assert.equal(requested.searchParams.get("postal_code"), "T2P 1J9");
  assert.equal(requested.searchParams.get("q"), "broccoli");
  assert.equal(results.length, 2);
  assert.equal(results[0].price, 2.49);
  assert.equal(results[0].priceSuffix, "/lb");
  assert.equal(results[1].price, null);
});

test("reports upstream errors without retrying", async () => {
  let calls = 0;
  await assert.rejects(searchFlipp("T2P 1J9", "milk", 3, async () => { calls++; return new Response("", {status: 429}); }), /429/);
  assert.equal(calls, 1);
});

test("rejects invalid postal codes, empty queries, and invalid limits before network access", async () => {
  const fail = async () => { throw new Error("network called"); };
  await assert.rejects(searchFlipp("invalid", "milk", 3, fail), /postal/i);
  await assert.rejects(searchFlipp("T2P 1J9", " ", 3, fail), /query/i);
  await assert.rejects(searchFlipp("T2P 1J9", "milk", 0, fail), /limit/i);
});
