/**
 * WorkerThreadHost runs a subclass's calls on a real worker thread (MJ #5510). These tests drive a
 * test subclass against fixtures/fake-worker.mjs, which speaks the protocol and can block, fail or
 * crash on demand.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { TransferListItem } from 'node:worker_threads';
import { WorkerThreadHost } from '../WorkerThreadHost';

type TestCall = { Text: string } | { Bytes: Uint8Array };

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-worker.mjs', import.meta.url));
const IN_PROCESS_ENV = 'MJ_TEST_WORKER_IN_PROCESS';

class TestWorkerHost extends WorkerThreadHost<TestCall, number> {
  protected constructor() {
    super({
      Name: 'Test worker',
      InProcessEnvVar: IN_PROCESS_ENV,
      ScriptPath: '/nonexistent/TestWorker.js',
      LogPrefix: '[Test]',
      FallbackDescription: 'Running in-process',
    });
  }

  public static get Instance(): TestWorkerHost {
    return super.getInstance<TestWorkerHost>();
  }

  protected override TransferListFor(call: TestCall): TransferListItem[] {
    return 'Bytes' in call && call.Bytes.buffer instanceof ArrayBuffer ? [call.Bytes.buffer] : [];
  }
}

const host = () => TestWorkerHost.Instance;
const run = (text: string) => host().Run({ Text: text });

describe('WorkerThreadHost', () => {
  beforeEach(() => {
    delete process.env[IN_PROCESS_ENV];
    host().UseScriptPath(FAKE_WORKER);
  });

  afterEach(async () => {
    await host().Shutdown();
    host().UseScriptPath(null);
    delete process.env[IN_PROCESS_ENV];
  });

  it('resolves with the result the worker produced', async () => {
    expect(await run('hello')).toBe(5);
  });

  it('answers concurrent calls by ID, on one worker', async () => {
    expect(await Promise.all([run('a'), run('abc'), run('ab')])).toEqual([1, 3, 2]);
  });

  it('transfers the buffers the subclass names instead of copying them', async () => {
    const bytes = new Uint8Array(1024);
    expect(await host().Run({ Bytes: bytes })).toBe(1024);
    expect(bytes.byteLength).toBe(0);
  });

  it("keeps the caller's event loop free while the worker is busy", async () => {
    let worstLagMs = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      worstLagMs = Math.max(worstLagMs, now - last - 10);
      last = now;
    }, 10);
    try {
      await run('BLOCK:600');
    } finally {
      clearInterval(ticker);
    }
    expect(worstLagMs).toBeLessThan(150);
  });

  it("rejects with the worker's error when the call fails", async () => {
    await expect(run('FAIL')).rejects.toThrow('handler exploded');
  });

  it('rejects a pending call when the worker dies, and starts a new worker for the next call', async () => {
    await expect(run('CRASH')).rejects.toThrow('Test worker stopped (exited with code 3)');
    expect(await run('abc')).toBe(3);
    expect(host().IsAvailable).toBe(true);
  });

  it('disables itself after three worker deaths within a minute', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(run('CRASH')).rejects.toThrow(/Test worker stopped/);
    }
    expect(host().IsAvailable).toBe(false);
    expect(host().DisabledReason).toMatch(/^3 worker crashes in 60s/);
  });

  it('rejects pending calls on Shutdown', async () => {
    const rejected = expect(run('BLOCK:2000')).rejects.toThrow('Test worker shut down');
    await host().Shutdown();
    await rejected;
  });

  it('is unavailable while the in-process switch is on', () => {
    for (const value of ['true', '1', 'YES']) {
      process.env[IN_PROCESS_ENV] = value;
      expect(host().IsAvailable).toBe(false);
    }
    process.env[IN_PROCESS_ENV] = 'false';
    expect(host().IsAvailable).toBe(true);
  });

  it('is unavailable, with the reason, when the worker script is missing', () => {
    host().UseScriptPath('/nonexistent/TestWorker.js');
    expect(host().IsAvailable).toBe(false);
    expect(host().DisabledReason).toBe('worker script not found at /nonexistent/TestWorker.js');
  });
});
