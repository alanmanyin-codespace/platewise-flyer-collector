import type { GroceryOffer } from './collector.js';

export async function uploadOffers(baseUrl: string, token: string, offers: Pick<GroceryOffer, 'provider'>[], request: typeof fetch = fetch): Promise<void> {
  if (!offers.length || offers.some(offer => offer.provider !== 'mock')) throw new Error('Only synthetic mock offers can be uploaded.');
  const url = new URL('/v1/ingest/offers', baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API must use HTTPS except on localhost.');
  if (!token) throw new Error('INGEST_TOKEN is required.');
  const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({offers}), redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
}
