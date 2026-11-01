# PlateWise Grocery Collector

A separate local TypeScript workspace for exploring Calgary grocery offer collection. The only provider currently included produces synthetic data; it makes no network requests.

## Local setup

Use Node 22.22.1 (`nvm use` if using nvm), then run `npm install`. Run `npm test` for the tests, or `npm run collect:mock` to print a sample JSON result. Set `POSTAL_CODE` to override the default `T2P 1J9`.

The initial normalizer rejects missing or malformed expiry dates and compares date-only expiry against Calgary's local calendar day. This is a conservative filtering rule, not proof an offer is available or valid. Deduplication currently uses the provider and provider offer ID. Prices and dates must already be parsed by a future provider adapter; no upstream schema is assumed.

Flipp is an unofficial source. Its terms and authorization have not been established. Any investigation must be an explicitly invoked, limited local test; do not schedule collection or publish its data without confirming authorization. No schedule, upload, backend integration, or live provider is included.
