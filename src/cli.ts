import { searchBatch } from "./batch.js";
import { searchFlipp, type SearchOffer } from "./providers/flipp.js";
import { readQueries } from "./query-file.js";
import { outputFilename, saveResult } from "./output.js";
import { collectMarket, marketFilename, readMarket } from "./market.js";
import { buildTasks, loadJob, recordTask, runSeries, taskKey } from "./job.js";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const usage = `Usage: npm run collect -- (--postal "T2P 1J9" | --market calgary) [--items-file ./config/items.json] [--limit 20] [--series-size 500] [--delay-ms 1000]

The items file is a JSON array of 1–1000 search terms. One request per term and postal code; --limit (1–100) applies locally per query. Markets are defined in config/markets.json.

--series-size (with --market) makes up to that many requests, saves progress and stops. Run the same command again to continue; failed requests are retried. The collection is saved once every request has finished.`;

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
  } else {
    const options = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i];
      const value = args[i + 1];
      if (!["--postal", "--market", "--items-file", "--limit", "--series-size", "--delay-ms"].includes(key) || !value || value.startsWith("--") || options.has(key)) throw new Error(`Invalid argument: ${key}\n${usage}`);
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
    const seriesText = options.get("--series-size");
    const delayText = options.get("--delay-ms") ?? "1000";
    if (seriesText && !market) throw new Error(`--series-size needs --market.\n${usage}`);
    if ((seriesText && !/^[1-9]\d*$/.test(seriesText)) || !/^\d+$/.test(delayText)) throw new Error("Series size and delay must be whole numbers.");
    const limit = Number(limitText);
    let jobFile: URL | undefined;
    let search = searchFlipp as (postal: string, query: string, limit: number) => Promise<SearchOffer[]>;
    if (seriesText) {
      const id = createHash("sha256").update(JSON.stringify([postalCodes, queries, limit])).digest("hex").slice(0, 12);
      jobFile = new URL(`../data/job-${market}-${id}.jsonl`, import.meta.url);
      const file = jobFile;
      const saved = await loadJob<SearchOffer>(file);
      const tasks = buildTasks(postalCodes, queries);
      const pending = tasks.filter(task => !saved.has(taskKey(task)));
      const result = await runSeries(pending, { seriesSize: Number(seriesText), delayMs: Number(delayText), attempts: 4, baseDelayMs: 2000, maxConsecutiveFailures: 5 }, async task => {
        const offers = await searchFlipp(task.postal, task.query, limit);
        await recordTask(file, task, offers);
        saved.set(taskKey(task), offers);
      });
      const remaining = pending.length - result.completed;
      console.log(`Series finished: ${result.completed} completed, ${result.failed.length} failed, ${remaining} of ${tasks.length} requests left.`);
      if (result.stopped) console.error("Stopped after repeated failures; wait before running again.");
      if (remaining) {
        console.log(`Progress is saved in ${fileURLToPath(file)}. Run the same command again to continue.`);
        if (result.stopped) process.exitCode = 1;
        process.exit();
      }
      search = async (postal, query) => saved.get(taskKey({ postal, query })) ?? [];
    }
    const offers = market ? await collectMarket(postalCodes, code => searchBatch(code, queries, limit, search)) : await searchBatch(postal, queries, limit, searchFlipp);
    const collectedAt = new Date();
    const output = new URL(`../data/${market ? marketFilename(market, collectedAt) : outputFilename(postal, collectedAt)}`, import.meta.url);
    await saveResult(output, { provider: "flipp", ...(market ? { market, postalCodes } : {}), postalCode: (market ? postalCodes[0] : postal).trim().toUpperCase(), queries, collectedAt: collectedAt.toISOString(), offers });
    if (jobFile) await rm(jobFile, { force: true });
    console.log(`Saved ${offers.length} offers to ${fileURLToPath(output)}`);
  }
} catch (error) {
  console.error(`Collection failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
