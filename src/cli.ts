import { searchBatch } from "./batch.js";
import { searchFlipp } from "./providers/flipp.js";
import { readQueries } from "./query-file.js";
import { outputFilename, saveResult } from "./output.js";
import { collectMarket, marketFilename, readMarket } from "./market.js";
import { fileURLToPath } from "node:url";

const usage = `Usage: npm run collect -- (--postal "T2P 1J9" | --market calgary) [--items-file ./config/items.json] [--limit 20]

The items file is a JSON array of 1–20 search terms. One request per term and postal code; --limit (1–100) applies locally per query. Markets are defined in config/markets.json.`;

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
  } else {
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      if (!["--postal", "--market", "--items-file", "--limit"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error(`Invalid argument: ${key}\n${usage}`);
      options.set(key, value);
    }
    const market = options.get("--market");
    if (market && options.has("--postal")) throw new Error(`Use --postal or --market, not both.\n${usage}`);
    const postal = options.get("--postal") ?? "";
    const limitText = options.get("--limit") ?? "20";
    if (!/^\d+$/.test(limitText)) throw new Error("Limit must be an integer from 1 to 100.");
    const file = options.get("--items-file") ?? new URL("../config/items.json", import.meta.url);
    const queries = await readQueries(file);
    const postalCodes = market ? await readMarket(new URL("../config/markets.json", import.meta.url), market) : [];
    const offers = market ? await collectMarket(postalCodes, code => searchBatch(code, queries, Number(limitText), searchFlipp)) : await searchBatch(postal, queries, Number(limitText), searchFlipp);
    const collectedAt = new Date();
    const output = new URL(`../data/${market ? marketFilename(market, collectedAt) : outputFilename(postal, collectedAt)}`, import.meta.url);
    await saveResult(output, { provider: "flipp", ...(market ? { market, postalCodes } : {}), postalCode: (market ? postalCodes[0] : postal).trim().toUpperCase(), queries, collectedAt: collectedAt.toISOString(), offers });
    console.log(`Saved ${offers.length} offers to ${fileURLToPath(output)}`);
  }
} catch (error) {
  console.error(`Collection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
