import { normalizeOffers } from './collector.js';
import { uploadOffers } from './upload.js';

try {
  const baseUrl = process.env.PLATEWISE_API_URL;
  const token = process.env.INGEST_TOKEN;
  if (!baseUrl || !token) throw new Error('PLATEWISE_API_URL and INGEST_TOKEN are required.');
  const { offers } = normalizeOffers([{id:'sample-milk',productName:'Milk',retailer:'Example Store',price:4.99,validUntil:'2099-12-31'}], {postalCode:process.env.POSTAL_CODE || 'T2P 1J9',provider:'mock',now:new Date()});
  await uploadOffers(baseUrl, token, offers);
  console.log(`Uploaded ${offers.length} synthetic offer(s).`);
} catch (error) {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
