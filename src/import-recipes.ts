import { importRecipes, mealDbSource, type Recipe, type RecipeApi } from "./recipes.js";

const usage = `Usage: npm run import:recipes [-- --refresh]

Imports TheMealDB recipes into the PlateWise API. By default only recipes not yet stored are fetched; --refresh re-fetches all of them.
Requires PLATEWISE_API_URL and INGEST_TOKEN. THEMEALDB_KEY defaults to the development key "1".`;

try {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(usage);
  } else {
    if (args.some(a => a !== "--refresh")) throw new Error(`Invalid arguments.\n${usage}`);
    const baseUrl = process.env.PLATEWISE_API_URL;
    const token = process.env.INGEST_TOKEN;
    if (!baseUrl || !token) throw new Error("PLATEWISE_API_URL and INGEST_TOKEN are required.");
    const url = new URL("/v1/ingest/recipes", baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("API must use HTTPS except on localhost.");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const api: RecipeApi = {
      async knownIds() {
        const response = await fetch(`${url}?source=themealdb`, { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Could not list stored recipes (HTTP ${response.status}).`);
        return (await response.json() as { ids: string[] }).ids;
      },
      async upload(recipes: Recipe[]) {
        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ source: "themealdb", recipes }), redirect: "error", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Recipe upload failed (HTTP ${response.status}).`);
        console.log(`Stored ${recipes.length} recipe(s).`);
      },
    };
    const result = await importRecipes(mealDbSource(process.env.THEMEALDB_KEY ?? "1"), api, { refresh: args.includes("--refresh"), delayMs: 250 });
    console.log(`Listed ${result.listed}, already stored ${result.known}, imported ${result.imported}.`);
  }
} catch (error) {
  console.error(`Recipe import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
