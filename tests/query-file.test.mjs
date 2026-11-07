import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readQueries } from "../dist/query-file.js";

test("reads and deduplicates a JSON list, preserving order", async () => {
  const dir = await mkdtemp(join(tmpdir(), "platewise-query-"));
  try {
    const file = join(dir, "items.json");
    await writeFile(file, JSON.stringify([" Milk ", "eggs", "milk", "chicken breast"]));
    assert.deepEqual(await readQueries(file), ["milk", "eggs", "chicken breast"]);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test("rejects missing files, malformed JSON and empty or invalid lists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "platewise-query-"));
  try {
    const file = join(dir, "items.json");
    await assert.rejects(readQueries(file), /file not found.*omit --items-file/i);
    await writeFile(file, "not json");
    await assert.rejects(readQueries(file), /JSON/i);
    for (const value of [[], ["milk", " "], {items: ["milk"]}, Array(1001).fill("milk")]) {
      await writeFile(file, JSON.stringify(value));
      await assert.rejects(readQueries(file), /1–1000/);
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});
