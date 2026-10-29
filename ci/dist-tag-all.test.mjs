// Tests for ci/dist-tag-all.mjs — run with: node --test ci/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { parseCliArgs, buildPlan, parseDistTagLs, withRetry, runPool, verifyOne } from './dist-tag-all.mjs';

test('parseCliArgs: happy path with defaults', () => {
  const args = parseCliArgs(['--version', '5.50.1', '--tag', 'latest']);
  assert.equal(args.version, '5.50.1');
  assert.equal(args.tag, 'latest');
  assert.equal(args.dryRun, false);
  assert.equal(args.concurrency, 8);
  assert.equal(args.scope, '@memberjunction');
});

test('parseCliArgs: accepts edge versions and custom tags', () => {
  const args = parseCliArgs(['--version', '6.2.0-edge.14', '--tag', 'edge', '--dry-run']);
  assert.equal(args.version, '6.2.0-edge.14');
  assert.equal(args.dryRun, true);
});

test('parseCliArgs: rejects missing/invalid inputs', () => {
  assert.throws(() => parseCliArgs(['--tag', 'latest']), /--version/);
  assert.throws(() => parseCliArgs(['--version', 'abc', '--tag', 'latest']), /--version/);
  assert.throws(() => parseCliArgs(['--version', '5.50.1']), /--tag/);
  assert.throws(() => parseCliArgs(['--version', '5.50.1', '--tag', '5.50.1']), /--tag/);
  assert.throws(() => parseCliArgs(['--version', '5.50.1', '--tag', 'latest', '--concurrency', '0']), /--concurrency/);
  assert.throws(() => parseCliArgs(['--version', '5.50.1', '--tag', 'latest', '--concurrency', '99']), /--concurrency/);
  assert.throws(() => parseCliArgs(['--nope']), /unknown argument/);
});

test('buildPlan: one entry per package with name@version spec', () => {
  const plan = buildPlan(['@memberjunction/core', '@memberjunction/global'], '5.50.1');
  assert.deepEqual(plan, [
    { name: '@memberjunction/core', spec: '@memberjunction/core@5.50.1' },
    { name: '@memberjunction/global', spec: '@memberjunction/global@5.50.1' },
  ]);
});

test('parseDistTagLs: parses npm output lines', () => {
  const out = 'edge: 6.2.0-edge.4\nlatest: 6.1.3\nlts-6.1: 6.1.3\n';
  assert.deepEqual(parseDistTagLs(out), { edge: '6.2.0-edge.4', latest: '6.1.3', 'lts-6.1': '6.1.3' });
});

test('withRetry: succeeds after transient failures, bounded attempts', async () => {
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls < 3) throw new Error('transient');
    return 'ok';
  };
  const result = await withRetry(flaky, 3, 1, async () => {});
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('withRetry: throws the last error after max attempts', async () => {
  let calls = 0;
  const failing = async () => {
    calls++;
    throw new Error(`attempt ${calls}`);
  };
  await assert.rejects(() => withRetry(failing, 3, 1, async () => {}), /attempt 3/);
  assert.equal(calls, 3);
});

test('runPool: processes every item with bounded concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const results = await runPool(items, async (i) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    return i * 2;
  }, 4);
  assert.equal(results.length, 20);
  assert.deepEqual([...results].sort((a, b) => a - b), items.map((i) => i * 2));
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded 4`);
});

test('runPool: handles empty input', async () => {
  assert.deepEqual(await runPool([], async () => 1, 8), []);
});

const lsOutput = (tagValue) => ({ stdout: tagValue ? `latest: ${tagValue}\n` : '' });

test('verifyOne: polls with a fresh, removed npm cache dir per attempt until the tag lands', async () => {
  const caches = [];
  let calls = 0;
  const exec = async (_cmd, args) => {
    const cache = args[args.indexOf('--cache') + 1];
    assert.ok(existsSync(cache), 'cache dir exists during the call');
    caches.push(cache);
    return lsOutput(++calls < 3 ? '1.0.0' : '2.0.0');
  };
  const sleeps = [];
  const result = await verifyOne({ name: '@x/a' }, 'latest', '2.0.0', undefined, { exec, sleep: async (ms) => sleeps.push(ms) });
  assert.deepEqual(result, { name: '@x/a', ok: true });
  assert.equal(calls, 3);
  assert.equal(new Set(caches).size, 3, 'each attempt uses its own cache dir');
  for (const c of caches) assert.equal(existsSync(c), false, 'cache dir removed afterwards');
  assert.equal(sleeps.length, 2);
});

test('verifyOne: reports the last mismatch after exhausting ~10 polls over ~30s', async () => {
  let calls = 0;
  let slept = 0;
  const exec = async () => {
    calls++;
    return lsOutput('1.0.0');
  };
  const result = await verifyOne({ name: '@x/a' }, 'latest', '2.0.0', undefined, { exec, sleep: async (ms) => (slept += ms) });
  assert.equal(result.ok, false);
  assert.match(result.error, /expected latest → 2\.0\.0, found 1\.0\.0/);
  assert.equal(calls, 10);
  assert.ok(slept >= 25000 && slept <= 35000, `total backoff ${slept}ms`);
});

test('verifyOne: passes --registry and surfaces exec errors', async () => {
  let seen;
  const exec = async (_cmd, args) => {
    seen = args;
    throw Object.assign(new Error('boom'), { stderr: 'npm ERR! network\n' });
  };
  const result = await verifyOne({ name: '@x/a' }, 'latest', '2.0.0', 'http://r', { exec, sleep: async () => {}, attempts: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'npm ERR! network');
  assert.ok(seen.includes('--registry') && seen.includes('http://r'));
});
