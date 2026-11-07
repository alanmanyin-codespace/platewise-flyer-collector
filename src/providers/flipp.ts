export interface SearchOffer {
  id: string | null;
  productName: string | null;
  retailer: string | null;
  price: number | null;
  regularPrice: number | null;
  pricePrefix: string | null;
  priceSuffix: string | null;
  saleDescription: string | null;
  validFrom: string | null;
  validUntil: string | null;
  flyerId: string | null;
  imageUrl: string | null;
}

const stringOrNull = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : null;
const numberOrNull = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const idOrNull = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : null;

export async function searchFlipp(postal: string, query: string, limit: number, request: typeof fetch = fetch): Promise<SearchOffer[]> {
  if (!/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i.test(postal.trim())) throw new Error("Invalid Canadian postal code.");
  if (!query.trim()) throw new Error("A search query is required.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limit must be an integer from 1 to 100.");
  const url = new URL("https://backflipp.wishabi.com/flipp/items/search");
  url.searchParams.set("postal_code", postal.trim().toUpperCase());
  url.searchParams.set("locale", "en-ca");
  url.searchParams.set("q", query.trim());
  const response = await request(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Object.assign(new Error(`Flipp request failed (HTTP ${response.status}).`), { status: response.status });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).items)) throw new Error("Unexpected Flipp response: missing items array.");
  const rows = (data as { items: unknown[] }).items;
  return rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)).slice(0, limit).map((row) => ({
    id: idOrNull(row.id), productName: stringOrNull(row.name), retailer: stringOrNull(row.merchant_name) ?? stringOrNull(row.merchant),
    price: numberOrNull(row.current_price), regularPrice: numberOrNull(row.original_price), pricePrefix: stringOrNull(row.pre_price_text), priceSuffix: stringOrNull(row.post_price_text),
    saleDescription: stringOrNull(row.sale_story), validFrom: stringOrNull(row.valid_from), validUntil: stringOrNull(row.valid_to), flyerId: idOrNull(row.flyer_id),
    imageUrl: stringOrNull(row.clipping_image_url) ?? stringOrNull(row.clean_image_url) ?? stringOrNull(row.image_url),
  }));
}
