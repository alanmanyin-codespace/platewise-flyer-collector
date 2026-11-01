import type { SearchOffer } from "./providers/flipp.js";

export async function searchBatch(postal: string, queries: string[], limit: number, search: (postal: string, query: string, limit: number) => Promise<SearchOffer[]>): Promise<(SearchOffer & { matchedQueries: string[] })[]> {
  const results: (SearchOffer & { matchedQueries: string[] })[] = [];
  const seen = new Map<string, SearchOffer & { matchedQueries: string[] }>();
  for (const query of queries) {
    const offers = await search(postal, query, limit);
    for (const offer of offers) {
      const previous = offer.id ? seen.get(offer.id) : undefined;
      if (previous) {
        if (!previous.matchedQueries.includes(query)) previous.matchedQueries.push(query);
      } else {
        const result = { ...offer, matchedQueries: [query] };
        results.push(result);
        if (offer.id) seen.set(offer.id, result);
      }
    }
  }
  return results;
}
