import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuns, localDate } from '../dist/run.js';
import { uploadRun } from '../dist/upload.js';

const offer = (id, over = {}) => ({ id, productName: 'Large Eggs 12pk', retailer: 'Example Grocer', price: 3.99, regularPrice: null, pricePrefix: null, priceSuffix: 'ea', saleDescription: null, validFrom: '2026-10-29T07:00:00+00:00', validUntil: '2026-11-05T04:59:59+00:00', flyerId: '9001', imageUrl: null, matchedQueries: ['eggs'], ...over });
const collection = (offers, over = {}) => ({ provider: 'mock', postalCode: 'T3A 1B1', queries: ['eggs'], collectedAt: '2026-11-03T05:00:00.000Z', offers, ...over });

test('maps a collection to a versioned run with integer cents and local dates', () => {
  const [run] = buildRuns(collection([offer('1')]));
  assert.equal(run.schemaVersion, 1);
  assert.deepEqual(run.run, { id: 'mock-T3A1B1-20261103T050000000Z', source: 'mock', searchPostalCode: 'T3A 1B1', startedAt: '2026-11-03T05:00:00.000Z', finishedAt: '2026-11-03T05:00:00.000Z', status: 'completed', isSample: true });
  const [o] = run.offers;
  assert.equal(o.sourceOfferId, '1');
  assert.deepEqual(o.retailer, { sourceRetailerId: 'example-grocer', displayName: 'Example Grocer' });
  assert.deepEqual(o.price, { amountCents: 399, currency: 'CAD', text: '$3.99 ea', purchaseQuantity: 1, purchaseUnit: 'each' });
  assert.equal(o.validFrom, '2026-10-29');
  assert.equal(o.validUntil, '2026-11-04');
  assert.equal(o.observedAt, '2026-11-03T05:00:00.000Z');
  assert.equal(o.isSample, true);
});

test('reads multi-buy and per-weight prices', () => {
  const [run] = buildRuns(collection([
    offer('a', { price: 12, pricePrefix: '2/', priceSuffix: 'OR $6.58 each' }),
    offer('b', { price: 10, pricePrefix: '3 for', priceSuffix: null }),
    offer('c', { price: 1.99, priceSuffix: '/lb' }),
    offer('d', { price: 2.49, priceSuffix: '/100 g' }),
    offer('e', { price: 8.99, pricePrefix: 'Member Price', priceSuffix: null }),
  ]));
  const p = Object.fromEntries(run.offers.map(o => [o.sourceOfferId, o.price]));
  assert.deepEqual([p.a.amountCents, p.a.purchaseQuantity, p.a.purchaseUnit, p.a.text], [1200, 2, 'item', '2/ $12.00 OR $6.58 each']);
  assert.deepEqual([p.b.amountCents, p.b.purchaseQuantity], [1000, 3]);
  assert.deepEqual([p.c.purchaseQuantity, p.c.purchaseUnit], [1, 'lb']);
  assert.equal(p.d.purchaseUnit, '100 g');
  assert.deepEqual([p.e.amountCents, p.e.purchaseUnit, p.e.text], [899, 'item', 'Member Price $8.99']);
});

test('moves offers the API would refuse into rejections and marks the run partial', () => {
  const [run] = buildRuns(collection([offer('ok'), offer('nop', { price: null }), offer(null), offer('nr', { retailer: null }), offer('long', { productName: 'x'.repeat(201) }), offer('dates', { validFrom: '2026-11-09T07:00:00+00:00' })]));
  assert.deepEqual(run.offers.map(o => o.sourceOfferId), ['ok']);
  assert.deepEqual(run.rejections, [
    { recordReference: 'nop', reasonCode: 'MISSING_PRICE' },
    { recordReference: 'row-3', reasonCode: 'MISSING_ID' },
    { recordReference: 'nr', reasonCode: 'MISSING_RETAILER' },
    { recordReference: 'long', reasonCode: 'FIELD_TOO_LONG' },
    { recordReference: 'dates', reasonCode: 'INVALID_DATE_RANGE' },
  ]);
  assert.equal(run.run.status, 'partial');
});

test('a collection with no usable offers is a failed run', () => {
  const [run] = buildRuns(collection([offer('nop', { price: null })]));
  assert.equal(run.run.status, 'failed');
  assert.equal(run.offers.length, 0);
});

test('splits more than 100 offers into parts with their own run IDs', () => {
  const runs = buildRuns(collection(Array.from({ length: 150 }, (_, i) => offer(String(i)))));
  assert.deepEqual(runs.map(r => [r.run.id, r.offers.length]), [['mock-T3A1B1-20261103T050000000Z-p1of2', 100], ['mock-T3A1B1-20261103T050000000Z-p2of2', 50]]);
});

test('the same collection always produces identical bytes so retries replay', () => {
  const c = collection([offer('1'), offer('2', { price: null })]);
  assert.equal(JSON.stringify(buildRuns(c)), JSON.stringify(buildRuns(structuredClone(c))));
});

test('local dates follow the postal code time zone', () => {
  assert.equal(localDate('2026-11-05T04:59:59+00:00', 'T3A 1B1'), '2026-11-04');
  assert.equal(localDate('2026-11-05T04:59:59+00:00', 'M5V 2T6'), '2026-11-04');
  assert.equal(localDate('2026-11-05T06:30:00+00:00', 'M5V 2T6'), '2026-11-05');
  assert.equal(localDate('2026-11-05', 'T3A 1B1'), '2026-11-05');
  assert.equal(localDate(null, 'T3A 1B1'), null);
  assert.equal(localDate('soon', 'T3A 1B1'), undefined);
});

test('refuses to upload runs that are not synthetic', async () => {
  const [run] = buildRuns(collection([offer('1')], { provider: 'flipp' }));
  await assert.rejects(() => uploadRun('http://localhost:8787', 'secret', run), /synthetic/);
});
