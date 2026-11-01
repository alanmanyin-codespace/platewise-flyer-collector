import { test } from "node:test";
import assert from "node:assert/strict";
import { searchBatch } from "../dist/batch.js";

test("searches sequentially and deduplicates IDs while preserving matched queries", async () => {
  const calls = [];
  const search = async (_postal, query, limit) => { calls.push([query, limit]); return [{ id: "42", productName: "Milk" }, { id: null, productName: query }]; };
  const offers = await searchBatch("T2P 1J9", ["milk", "eggs"], 3, search);
  assert.deepEqual(calls, [["milk", 3], ["eggs", 3]]);
  assert.equal(offers.length, 3);
  assert.deepEqual(offers[0].matchedQueries, ["milk", "eggs"]);
});

test("stops on failure without making subsequent requests", async () => {
  const calls = [];
  await assert.rejects(searchBatch("T2P 1J9", ["milk", "eggs"], 3, async (_p, q) => { calls.push(q); throw new Error("429"); }), /429/);
  assert.deepEqual(calls, ["milk"]);
});
