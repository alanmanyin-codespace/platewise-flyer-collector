import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadOffers } from '../dist/upload.js';

test('refuses to send non-synthetic offers', async () => {
  await assert.rejects(() => uploadOffers('http://localhost:8787', 'secret', [{ provider: 'flipp' }]), /synthetic/);
});
