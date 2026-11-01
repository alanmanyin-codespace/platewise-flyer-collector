import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveResult, outputFilename } from "../dist/output.js";

test("creates the output directory and saves valid JSON, replacing a prior result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "platewise-output-"));
  try {
    const path = join(dir, "data", "offers.json");
    await saveResult(path, { offers: [1] });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { offers: [1] });
    await saveResult(path, { offers: [2] });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { offers: [2] });
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test("creates a filesystem-safe UTC timestamped filename", () => {
  assert.equal(outputFilename("t2p 1j9", new Date("2026-10-31T17:30:45.123Z"), "abc"), "offers-T2P1J9-2026-10-31T17-30-45-123Z-abc.json");
});

test("rejects unsafe postal codes in output filenames", () => {
  assert.throws(() => outputFilename("../bad", new Date(), "abc"), /postal code/i);
});
