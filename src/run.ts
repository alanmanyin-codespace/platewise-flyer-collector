import type { SearchOffer } from "./providers/flipp.js";

// A saved collection file, as written by `npm run collect` (or a synthetic equivalent).
export interface Collection {
  provider: string;
  market?: string;
  postalCode: string;
  queries: string[];
  collectedAt: string;
  offers: (SearchOffer & { matchedQueries?: string[]; seenIn?: string[] })[];
}

// Version 1 of the PlateWise API run contract (POST /v1/ingest/runs).
export interface RunOffer {
  sourceOfferId: string;
  retailer: { sourceRetailerId: string; displayName: string };
  productName: string;
  price: { amountCents: number; currency: "CAD"; text: string; purchaseQuantity: number; purchaseUnit: string };
  validFrom: string | null;
  validUntil: string | null;
  observedAt: string;
  isSample: boolean;
  seenIn?: string[];
}
export interface RunPayload {
  schemaVersion: 1;
  run: { id: string; source: string; searchPostalCode: string; startedAt: string; finishedAt: string; status: "completed" | "partial" | "failed"; isSample: boolean; market?: string };
  offers: RunOffer[];
  rejections: { recordReference: string; reasonCode: string }[];
}

const MAX_PER_RUN = 100;
const MAX_TEXT = 200;
const POSTAL = /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/i;
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

// Time zone by the first letter of the postal code (the province or territory).
const ZONES: Record<string, string> = { A: "America/St_Johns", B: "America/Halifax", C: "America/Halifax", E: "America/Moncton", G: "America/Toronto", H: "America/Toronto", J: "America/Toronto", K: "America/Toronto", L: "America/Toronto", M: "America/Toronto", N: "America/Toronto", P: "America/Toronto", R: "America/Winnipeg", S: "America/Regina", T: "America/Edmonton", V: "America/Vancouver", X: "America/Yellowknife", Y: "America/Whitehorse" };

// Calendar date in the postal code's time zone. null stays null; undefined means unreadable.
export function localDate(value: string | null, postalCode: string): string | null | undefined {
  if (value === null) return null;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return Number.isNaN(Date.parse(value)) ? undefined : value;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return undefined;
  const timeZone = ZONES[postalCode.trim().charAt(0).toUpperCase()] ?? "America/Toronto";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);
}

// "2/" or "3 for" before the price means the price covers that many items.
function quantityOf(prefix: string | null): number {
  const match = prefix?.trim().match(/^(\d+)\s*(?:\/|for)$/i);
  return match && Number(match[1]) > 0 ? Number(match[1]) : 1;
}

// "ea", "/lb", "/100 g", "BAG" after the price name the unit; anything else is per item.
function unitOf(suffix: string | null): string {
  const text = suffix?.trim().toLowerCase().replace(/^\/\s*/, "") ?? "";
  if (/^(ea|each)\b/.test(text)) return "each";
  const match = text.match(/^(100\s?g|kg|lb|g|box|bag|pack|pk)\b/);
  return match ? match[1].replace(/^100\s?g$/, "100 g") : "item";
}

const slug = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const present = (v: string | null): v is string => typeof v === "string" && v.trim().length > 0;

export function buildRuns(collection: Collection): RunPayload[] {
  const { provider, postalCode, collectedAt } = collection;
  if (!present(provider)) throw new Error("Collection is missing its provider.");
  if (!POSTAL.test(postalCode)) throw new Error("Collection has an invalid Canadian postal code.");
  if (!INSTANT.test(collectedAt) || Number.isNaN(Date.parse(collectedAt))) throw new Error("Collection has an invalid collectedAt timestamp.");

  const offers: RunOffer[] = [];
  const rejections: RunPayload["rejections"] = [];
  const seen = new Set<string>();
  collection.offers.forEach((o, index) => {
    const row = `row-${index + 1}`;
    const reject = (reasonCode: string, reference = row) => { rejections.push({ recordReference: reference, reasonCode }); };
    if (!present(o.id) || o.id.length > MAX_TEXT) return reject(present(o.id) ? "FIELD_TOO_LONG" : "MISSING_ID");
    if (seen.has(o.id)) return reject("DUPLICATE_ID");
    seen.add(o.id);
    if (!present(o.retailer) || !slug(o.retailer)) return reject("MISSING_RETAILER", o.id);
    if (!present(o.productName)) return reject("MISSING_NAME", o.id);
    if (o.price === null || !Number.isSafeInteger(Math.round(o.price * 100))) return reject("MISSING_PRICE", o.id);
    const amountCents = Math.round(o.price * 100);
    const text = [o.pricePrefix?.trim(), `$${(amountCents / 100).toFixed(2)}`, o.priceSuffix?.trim()].filter(Boolean).join(" ");
    const sourceRetailerId = slug(o.retailer);
    if ([o.retailer, o.productName, text, sourceRetailerId].some(v => v.length > MAX_TEXT)) return reject("FIELD_TOO_LONG", o.id);
    const validFrom = localDate(o.validFrom, postalCode);
    const validUntil = localDate(o.validUntil, postalCode);
    if (validFrom === undefined || validUntil === undefined) return reject("INVALID_DATE", o.id);
    if (validFrom && validUntil && validFrom > validUntil) return reject("INVALID_DATE_RANGE", o.id);
    offers.push({
      sourceOfferId: o.id,
      retailer: { sourceRetailerId, displayName: o.retailer },
      productName: o.productName,
      price: { amountCents, currency: "CAD", text, purchaseQuantity: quantityOf(o.pricePrefix), purchaseUnit: unitOf(o.priceSuffix) },
      validFrom, validUntil,
      observedAt: collectedAt,
      isSample: provider === "mock",
      ...(o.seenIn ? { seenIn: o.seenIn } : {}),
    });
  });

  // Same collection in, same run IDs and bytes out, so a retry replays instead of conflicting.
  const status = offers.length === 0 ? "failed" : rejections.length ? "partial" : "completed";
  const { market } = collection;
  const baseId = `${provider}-${market ?? postalCode.replace(/\s/g, "").toUpperCase()}-${collectedAt.replace(/[-:.]/g, "")}`;
  const parts = Math.max(1, Math.ceil(offers.length / MAX_PER_RUN), Math.ceil(rejections.length / MAX_PER_RUN));
  return Array.from({ length: parts }, (_, i) => ({
    schemaVersion: 1,
    run: { id: parts > 1 ? `${baseId}-p${i + 1}of${parts}` : baseId, source: provider, searchPostalCode: postalCode, startedAt: collectedAt, finishedAt: collectedAt, status, isSample: provider === "mock", ...(market ? { market } : {}) },
    offers: offers.slice(i * MAX_PER_RUN, (i + 1) * MAX_PER_RUN),
    rejections: rejections.slice(i * MAX_PER_RUN, (i + 1) * MAX_PER_RUN),
  }));
}
