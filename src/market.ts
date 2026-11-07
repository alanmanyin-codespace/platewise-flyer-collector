import { readFile } from "node:fs/promises";
import type { SearchOffer } from "./providers/flipp.js";

export type MarketOffer = SearchOffer & { matchedQueries: string[]; seenIn: string[] };
const POSTAL = /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i;
const MARKET = /^[a-z0-9-]{1,50}$/;
const compact = (postal: string) => postal.replace(/\s/g, "").toUpperCase();

export async function readMarket(path: string | URL, market: string): Promise<string[]> {
  const markets = JSON.parse(await readFile(path, "utf8")) as Record<string, { postalCodes?: unknown }>;
  if (!Object.hasOwn(markets, market)) throw new Error(`Unknown market: ${market}`);
  const codes = markets[market].postalCodes;
  if (!Array.isArray(codes) || !codes.length || codes.length > 20 || !codes.every(c => typeof c === "string" && POSTAL.test(c))) throw new Error(`Market ${market} needs 1-20 valid postal codes.`);
  return codes;
}

// Searches each postal code in turn and merges by item ID. Any failure stops the market,
// so a saved collection never silently covers only part of the area.
export async function collectMarket(postalCodes: string[], search: (postal: string) => Promise<(SearchOffer & { matchedQueries: string[] })[]>): Promise<MarketOffer[]> {
  const results: MarketOffer[] = [];
  const seen = new Map<string, MarketOffer>();
  for (const postal of postalCodes) {
    for (const offer of await search(postal)) {
      const previous = offer.id ? seen.get(offer.id) : undefined;
      if (previous) {
        if (!previous.seenIn.includes(compact(postal))) previous.seenIn.push(compact(postal));
        for (const query of offer.matchedQueries) if (!previous.matchedQueries.includes(query)) previous.matchedQueries.push(query);
      } else {
        const result = { ...offer, matchedQueries: [...offer.matchedQueries], seenIn: [compact(postal)] };
        results.push(result);
        if (offer.id) seen.set(offer.id, result);
      }
    }
  }
  return results;
}

export function marketFilename(market: string, date: Date, suffix: string = crypto.randomUUID()): string {
  if (!MARKET.test(market)) throw new Error("Invalid market name.");
  return `offers-${market}-${date.toISOString().replace(/[:.]/g, "-")}-${suffix}.json`;
}
