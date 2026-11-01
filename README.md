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

Flipp is an unofficial source and its terms and authorization have not been established. Use this adapter for explicitly invoked, limited local tests only. Do not schedule Flipp collection or publish its data without confirming authorization. No scheduler, upload, or backend integration is included. The upstream interface can change without notice.

## Mock data and tests

Run `npm run collect:mock` for synthetic data or `npm test` to compile and run tests. The separate mock normalizer rejects missing or malformed expiry dates and compares date-only expiry against Calgary's local calendar day; the live search preserves source timestamps and does not assert validity.
