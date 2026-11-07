import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTasks, loadJob, recordTask, runSeries, withRetry } from '../dist/job.js';
import { searchFlipp } from '../dist/providers/flipp.js';

const httpError = status => Object.assign(new Error(`HTTP ${status}`), { status });
const noSleep = async () => {};
const options = over => ({ seriesSize: 100, delayMs: 0, sleep: noSleep, attempts: 3, baseDelayMs: 1, maxConsecutiveFailures: 5, ...over });

test('retries rate limits, server and network errors, then succeeds', async () => {
  for (const error of [httpError(429), httpError(503), new TypeError('fetch failed')]) {
    let calls = 0;
    assert.equal(await withRetry(async () => { if (++calls < 3) throw error; return 'ok'; }, options()), 'ok');
    assert.equal(calls, 3);
  }
});

test('does not retry permanent errors and waits longer each attempt', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw httpError(404); }, options()));
  assert.equal(calls, 1);
  const waits = [];
  await assert.rejects(withRetry(async () => { throw httpError(500); }, options({ baseDelayMs: 100, sleep: async ms => { waits.push(ms); } })));
  assert.deepEqual(waits, [100, 200]);
});

test('runs only the series size and skips finished tasks', async () => {
  const tasks = buildTasks(['T3A 1B1', 'T2P 1J9'], ['milk', 'eggs']);
  assert.equal(tasks.length, 4);
  const seen = [];
  const result = await runSeries(tasks.slice(1), options({ seriesSize: 2 }), async t => { seen.push(t); });
  assert.deepEqual(seen, tasks.slice(1, 3));
  assert.deepEqual(result, { completed: 2, failed: [], stopped: false });
});

test('keeps going after a failed task and reports it for the next series', async () => {
  const tasks = buildTasks(['T3A 1B1'], ['milk', 'bad', 'eggs']);
  const result = await runSeries(tasks, options(), async t => { if (t.query === 'bad') throw httpError(500); });
  assert.equal(result.completed, 2);
  assert.deepEqual(result.failed.map(t => t.query), ['bad']);
  assert.equal(result.stopped, false);
});

test('stops after repeated failures instead of hammering the source', async () => {
  let calls = 0;
  const tasks = buildTasks(['T3A 1B1'], ['a', 'b', 'c', 'd']);
  const result = await runSeries(tasks, options({ maxConsecutiveFailures: 2, attempts: 1 }), async () => { calls++; throw httpError(429); });
  assert.equal(calls, 2);
  assert.equal(result.stopped, true);
});

test('saved results survive a restart, ignoring a half-written last line', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'job-')), 'job.jsonl');
  assert.equal((await loadJob(file)).size, 0);
  await recordTask(file, { postal: 'T3A 1B1', query: 'milk' }, [{ id: '1' }]);
  await appendFile(file, '{"postal":"T2P');
  const saved = await loadJob(file);
  assert.equal(saved.size, 1);
  assert.deepEqual(saved.get('T3A 1B1\nmilk'), [{ id: '1' }]);
  await writeFile(file, '');
  assert.equal((await loadJob(file)).size, 0);
});

test('Flipp errors carry the HTTP status for retry decisions', async () => {
  await assert.rejects(searchFlipp('T3A 1B1', 'milk', 5, async () => new Response('', { status: 429 })), e => e.status === 429 && /HTTP 429/.test(e.message));
});
