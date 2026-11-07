# PlateWise Grocery Collector

A local TypeScript collector for manually exploring grocery flyer offers by Canadian postal code.

## Setup

Use Node 22.22.1 (`nvm use` if using nvm), then run `npm install`.

## Real manual search

Search the default list in `config/items.json`:

```sh
npm run collect -- --postal "T2P 1J9" --limit 5
```

To use another file, first create it (for example, copy the default and edit it), then pass its path with `--items-file`. Relative paths are resolved from the current directory:

```sh
cp config/items.json my-items.json
npm run collect -- --postal "T2P 1J9" --items-file ./my-items.json --limit 5
```

The file must be a JSON array containing 1–20 non-empty strings, for example:

```json
["milk", "eggs", "chicken breast", "rice", "broccoli"]
```

Each distinct query makes one request, sequentially. A batch stops on the first error and does not return partial results. At most 20 queries are accepted. Offers with the same source ID are deduplicated, with matching queries listed in `matchedQueries`; offers without IDs are kept separately. `--limit` is optional (default 20, maximum 100), applies per query, and limits output locally rather than the number of upstream records. Search results are not a complete inventory of flyers or products. Empty or unknown fields are `null`; a price does not by itself establish the offer is current, available, or applicable to a particular quantity.

Each successful run saves JSON to a new file in `data/`, with the postal code, UTC collection timestamp and a unique ID in its name (for example, `offers-T2P1J9-2026-10-31T17-30-45-123Z-<id>.json`), and prints the full path. A failed batch leaves earlier files intact. The `data/` directory is ignored by Git.

Flipp is an unofficial source and its terms and authorization have not been established. Use this adapter for explicitly invoked, limited local tests only. Do not schedule Flipp collection or publish its data without confirming authorization. No scheduler is included. `npm run upload:run` can store Flipp collections when the API allows them; this does not publish them. The upstream interface can change without notice.

## Market search

`npm run collect -- --market calgary --limit 100` searches every postal code listed for that market in `config/markets.json` and saves one merged collection named `offers-calgary-<timestamp>-<id>.json`. Items are merged by source ID, and `seenIn` records which postal codes returned each one. Each query makes one request per postal code, so the Calgary list of 6 with 5 queries makes 30 requests. Any failure stops the whole market and saves nothing. A market is a sample of its area, not a guarantee of complete coverage. The Flipp limits above apply: run it manually only.

## Mock data and tests

Run `npm run collect:mock` for synthetic data or `npm test` to compile and run tests. The separate mock normalizer rejects missing or malformed expiry dates and compares date-only expiry against Calgary's local calendar day; the live search preserves source timestamps and does not assert validity.

`npm run upload:mock` generates and uploads a synthetic offer to the PlateWise API. Set `PLATEWISE_API_URL` and `INGEST_TOKEN` in the execution environment first; the token must be provisioned securely and never committed or added to frontend configuration. HTTP is allowed only for localhost. The uploader rejects non-mock providers, and no schedule is configured. Authorized real sources need a separate reviewed integration before recurring ingestion can be enabled.

## Run upload (API schema version 1)

`npm run upload:run -- --file <collection.json>` maps a saved collection to the PlateWise API run contract and posts it to `POST /v1/ingest/runs`. Set `PLATEWISE_API_URL` and `INGEST_TOKEN` first. Mock and Flipp collections are accepted; Flipp runs are labelled as real data and need `ALLOW_LICENSED_IMPORTS` enabled on the API. Add `--dry-run` to print a summary without network access.

`fixtures/mock-collection.json` is a synthetic collection shaped like Flipp output (multi-buy, per-weight and missing prices, repeated listings, UTC timestamps) for end-to-end tests:

```sh
npm run upload:run -- --file fixtures/mock-collection.json --dry-run
npm run upload:run -- --file fixtures/mock-collection.json
```

Mapping rules:

- Prices become integer cents. A `2/` or `3 for` prefix sets the purchase quantity; a suffix such as `ea`, `/lb` or `/100 g` sets the unit, otherwise `item`. The original price text is kept.
- Validity timestamps become calendar dates in the postal code's time zone.
- Offers the API would refuse (missing ID, retailer, name or price; overlong text; unreadable or reversed dates; duplicate IDs) are sent as rejections with a reason code rather than failing the run. No usable offers makes a `failed` run; any rejection makes it `partial`.
- The run ID is derived from the provider, postal code and `collectedAt`, so uploading the same file again returns `replayed` instead of creating a duplicate. A run over 100 offers or rejections is split into parts (`-p1of2`, ...).

Market collections upload as market runs: the run carries `market`, each offer carries `seenIn`, and the API stores the market as the location. A product with two prices is only detected within one run part.

The API groups observations by retailer and product name to keep one current offer per product and its price history.
