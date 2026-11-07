import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectMarket, marketFilename, readMarket } from '../dist/market.js';
import { buildRuns } from '../dist/run.js';

const offer = (id, query) => ({ id, productName: 'Milk', retailer: 'Example Grocer', price: 4.99, regularPrice: null, pricePrefix: null, priceSuffix: null, saleDescription: null, validFrom: null, validUntil: null, flyerId: '1', imageUrl: null, matchedQueries: [query] });

test('merges items across postal codes and records where each was seen', async () => {
  const calls = [];
  const search = async (postal) => { calls.push(postal); return postal === 'T3A 1B1' ? [offer('a', 'milk'), offer('b', 'milk')] : [offer('a', 'eggs'), offer('c', 'eggs')]; };
  const offers = await collectMarket(['T3A 1B1', 'T2P 1J9'], search);
  assert.deepEqual(calls, ['T3A 1B1', 'T2P 1J9']);
  assert.deepEqual(offers.map(o => [o.id, o.seenIn, o.matchedQueries]), [['a', ['T3A1B1', 'T2P1J9'], ['milk', 'eggs']], ['b', ['T3A1B1'], ['milk']], ['c', ['T2P1J9'], ['eggs']]]);
});

test('one failed postal code stops the market so partial coverage is not saved', async () => {
  const search = async (postal) => { if (postal === 'T2P 1J9') throw new Error('upstream'); return []; };
  await assert.rejects(() => collectMarket(['T3A 1B1', 'T2P 1J9'], search), /upstream/);
});

test('reads a named market and rejects unknown or invalid ones', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'market-')), 'markets.json');
  await writeFile(file, JSON.stringify({ calgary: { postalCodes: ['T3A 1B1'] }, bad: { postalCodes: ['nope'] } }));
  assert.deepEqual(await readMarket(file, 'calgary'), ['T3A 1B1']);
  await assert.rejects(() => readMarket(file, 'edmonton'), /Unknown market/);
  await assert.rejects(() => readMarket(file, 'bad'), /postal/);
});

test('market collections become market runs', () => {
  const [run] = buildRuns({ provider: 'mock', market: 'calgary', postalCode: 'T3A 1B1', queries: [], collectedAt: '2026-11-07T06:00:00.000Z', offers: [{ ...offer('a', 'milk'), seenIn: ['T3A1B1', 'T2P1J9'] }] });
  assert.equal(run.run.id, 'mock-calgary-20261107T060000000Z');
  assert.equal(run.run.market, 'calgary');
  assert.deepEqual(run.offers[0].seenIn, ['T3A1B1', 'T2P1J9']);
});

test('market filenames are filesystem-safe', () => {
  assert.equal(marketFilename('calgary', new Date('2026-11-07T06:00:00.000Z'), 'id'), 'offers-calgary-2026-11-07T06-00-00-000Z-id.json');
  assert.throws(() => marketFilename('../x', new Date()), /market/);
});
