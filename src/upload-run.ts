import { readFile } from "node:fs/promises";
import { buildRuns, type Collection } from "./run.js";
import { uploadRun } from "./upload.js";

const usage = `Usage: npm run upload:run -- --file ./data/<collection>.json [--dry-run]

Maps a saved collection to version 1 run payloads and uploads them to POST /v1/ingest/runs.
--dry-run prints the mapped runs without network access. Uploading requires PLATEWISE_API_URL and INGEST_TOKEN, and only synthetic mock collections are accepted.`;

try {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rest = args.filter(a => a !== "--dry-run");
  if (args.includes("--help")) {
    console.log(usage);
  } else {
    if (rest.length !== 2 || rest[0] !== "--file" || !rest[1] || rest[1].startsWith("--")) throw new Error(`Invalid arguments.\n${usage}`);
    const collection = JSON.parse(await readFile(rest[1], "utf8")) as Collection;
    const runs = buildRuns(collection);
    for (const run of runs) {
      const reasons = Object.entries(run.rejections.reduce<Record<string, number>>((n, r) => ({ ...n, [r.reasonCode]: (n[r.reasonCode] ?? 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join(", ");
      console.log(`${run.run.id}: ${run.run.status}, ${run.offers.length} offer(s), ${run.rejections.length} rejected${reasons ? ` (${reasons})` : ""}`);
    }
    if (!dryRun) {
      const baseUrl = process.env.PLATEWISE_API_URL;
      const token = process.env.INGEST_TOKEN;
      if (!baseUrl || !token) throw new Error("PLATEWISE_API_URL and INGEST_TOKEN are required.");
      for (const run of runs) {
        const result = await uploadRun(baseUrl, token, run);
        console.log(`${run.run.id}: ${result.status} (${result.accepted} accepted)`);
      }
    }
  }
} catch (error) {
  console.error(`Run upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
