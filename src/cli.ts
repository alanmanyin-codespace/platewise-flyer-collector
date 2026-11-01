import { searchBatch } from "./batch.js";
import { searchFlipp } from "./providers/flipp.js";
import { readQueries } from "./query-file.js";
import { outputFilename, saveResult } from "./output.js";
import { fileURLToPath } from "node:url";

const usage = `Usage: npm run collect -- --postal "T2P 1J9" [--items-file ./config/items.json] [--limit 20]

The items file is a JSON array of 1–20 search terms. One request per term; --limit (1–100) applies locally per query.`;

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
  } else {
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      if (!["--postal", "--items-file", "--limit"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error(`Invalid argument: ${key}\n${usage}`);
      options.set(key, value);
    }
    const postal = options.get("--postal") ?? "";
    const limitText = options.get("--limit") ?? "20";
    if (!/^\d+$/.test(limitText)) throw new Error("Limit must be an integer from 1 to 100.");
    const file = options.get("--items-file") ?? new URL("../config/items.json", import.meta.url);
    const queries = await readQueries(file);
    const offers = await searchBatch(postal, queries, Number(limitText), searchFlipp);
    const collectedAt = new Date();
    const output = new URL(`../data/${outputFilename(postal, collectedAt)}`, import.meta.url);
    await saveResult(output, { provider: "flipp", postalCode: postal.trim().toUpperCase(), queries, collectedAt: collectedAt.toISOString(), offers });
    console.log(`Saved ${offers.length} offers to ${fileURLToPath(output)}`);
  }
} catch (error) {
  console.error(`Collection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
