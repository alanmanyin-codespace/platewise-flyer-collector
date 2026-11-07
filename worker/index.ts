import fixture from "../fixtures/mock-collection.json";
import { buildRuns, type Collection } from "../src/run.js";
import { uploadRun } from "../src/upload.js";

interface Env { API: { fetch: typeof fetch }; INGEST_TOKEN: string }

export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const collection = { ...fixture, collectedAt: new Date().toISOString() } as Collection;
    const request: typeof fetch = (input, init) => env.API.fetch(input, { ...init, redirect: "manual" });
    for (const run of buildRuns(collection)) {
      const result = await uploadRun("https://platewise-api.internal", env.INGEST_TOKEN, run, request);
      console.log(`${run.run.id}: ${result.status} (${result.accepted} accepted)`);
    }
  },
};
