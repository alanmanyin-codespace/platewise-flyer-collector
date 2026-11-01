export interface GroceryOffer {
  id: string;
  productName: string;
  retailer: string;
  location: string;
  price: number;
  currency: "CAD";
  validUntil: string;
  collectedAt: string;
  provider: string;
}

export interface Provider {
  name: string;
  fetchOffers(): Promise<unknown[]>;
}

export interface NormalizeOptions {
  postalCode: string;
  provider: string;
  now: Date;
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeOffers(items: unknown[], options: NormalizeOptions): { offers: GroceryOffer[]; rejected: number } {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit" }).format(options.now);
  const offers: GroceryOffer[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id.trim() || typeof row.productName !== "string" || !row.productName.trim() || typeof row.retailer !== "string" || !row.retailer.trim() || typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0 || !isDate(row.validUntil) || row.validUntil < today) continue;
    const key = `${options.provider}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push({ id: row.id, productName: row.productName, retailer: row.retailer, location: options.postalCode, price: row.price, currency: "CAD", validUntil: row.validUntil, collectedAt: options.now.toISOString(), provider: options.provider });
  }
  return { offers, rejected: items.length - offers.length };
}
