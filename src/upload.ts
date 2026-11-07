import type { GroceryOffer } from './collector.js';
import type { RunPayload } from './run.js';

const MAX_BYTES = 100000;

function endpoint(baseUrl: string, path: string, token: string): URL {
  const url = new URL(path, baseUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API must use HTTPS except on localhost.');
  if (!token) throw new Error('INGEST_TOKEN is required.');
  return url;
}

const post = (url: URL, token: string, body: string, request: typeof fetch) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body, redirect: 'error', signal: AbortSignal.timeout(15000) });

export async function uploadOffers(baseUrl: string, token: string, offers: Pick<GroceryOffer, 'provider'>[], request: typeof fetch = fetch): Promise<void> {
  if (!offers.length || offers.some(offer => offer.provider !== 'mock')) throw new Error('Only synthetic mock offers can be uploaded.');
  const url = endpoint(baseUrl, '/v1/ingest/offers', token);
  const response = await post(url, token, JSON.stringify({offers}), request);
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
}

// Uploads one run. 201 = stored, 200 = identical retry already stored, 409 = run ID reused with different data.
export async function uploadRun(baseUrl: string, token: string, payload: RunPayload, request: typeof fetch = fetch): Promise<{ status: 'created' | 'replayed'; accepted: number }> {
  const isSample = payload.run.source === 'mock';
  if (!['mock', 'flipp'].includes(payload.run.source) || payload.run.isSample !== isSample || payload.offers.some(o => o.isSample !== isSample)) throw new Error('Only correctly labelled mock or Flipp runs are supported.');
  const url = endpoint(baseUrl, '/v1/ingest/runs', token);
  const body = JSON.stringify(payload);
  if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error(`Run ${payload.run.id} is larger than ${MAX_BYTES} bytes.`);
  const response = await post(url, token, body, request);
  if (response.status === 409) throw new Error(`Run ${payload.run.id} was already uploaded with different data.`);
  if (!response.ok) throw new Error(`Upload of run ${payload.run.id} failed (HTTP ${response.status}).`);
  return await response.json() as { status: 'created' | 'replayed'; accepted: number };
}
