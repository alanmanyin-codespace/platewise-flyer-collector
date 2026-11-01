import { normalizeOffers, type Provider } from "./collector.js";

// Synthetic fixture only; no network request or external data source.
const mockProvider: Provider = {
  name: "mock",
  async fetchOffers() {
    return [{ id: "sample-milk", productName: "Milk", retailer: "Example Store", price: 4.99, validUntil: "2099-12-31" }];
  },
};

try {
  const postalCode = process.env.POSTAL_CODE || "T2P 1J9";
  const result = normalizeOffers(await mockProvider.fetchOffers(), { postalCode, provider: mockProvider.name, now: new Date() });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Collection failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
