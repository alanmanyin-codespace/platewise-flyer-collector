import { readFile } from "node:fs/promises";

export async function readQueries(path: string | URL): Promise<string[]> {
  let text: string;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Query file not found: ${String(path)}. Create it or omit --items-file to use config/items.json.`);
    throw new Error(`Could not read query file: ${error instanceof Error ? error.message : String(error)}`);
  }
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error("Query file must contain valid JSON."); }
  if (!Array.isArray(data) || data.length === 0 || data.length > 20 || data.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error("Query file must contain an array of 1–20 non-empty strings.");
  }
  return [...new Set((data as string[]).map(item => item.trim().toLowerCase()))];
}
