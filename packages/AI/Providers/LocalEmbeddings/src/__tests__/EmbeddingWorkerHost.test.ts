/**
 * EmbeddingWorkerHost runs local embedding inference on a worker thread so it cannot block the
 * event loop that serves requests (MJ #5510). These tests drive a real worker thread running a
 * fake model (fixtures/fake-embedding-worker.mjs) that speaks the same protocol.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { EmbeddingWorkerHost, LOCAL_EMBEDDINGS_IN_PROCESS_ENV } from '../worker/EmbeddingWorkerHost';

const FAKE_WORKER = fileURLToPath(new URL('./fixtures/fake-embedding-worker.mjs', import.meta.url));
const embed = (texts: string[]) => EmbeddingWorkerHost.Instance.Run({ Kind: 'embed', Model: 'm', Texts: texts, Settings: {} });

describe('EmbeddingWorkerHost', () => {
  beforeEach(() => {
    delete process.env[LOCAL_EMBEDDINGS_IN_PROCESS_ENV];
    EmbeddingWorkerHost.Instance.UseScriptPath(FAKE_WORKER);
  });

  afterEach(async () => {
    await EmbeddingWorkerHost.Instance.Shutdown();
    EmbeddingWorkerHost.Instance.UseScriptPath(null);
    delete process.env[LOCAL_EMBEDDINGS_IN_PROCESS_ENV];
  });

  it('returns the vectors the worker computed, one per text, in order', async () => {
    const vectors = await embed(['a', 'abcd', 'ab']);
    expect(vectors.map((v) => Array.from(v))).toEqual([[1], [4], [2]]);
  });

  it("keeps the caller's event loop free while the worker computes", async () => {
    let worstLagMs = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      worstLagMs = Math.max(worstLagMs, now - last - 10);
      last = now;
    }, 10);
    try {
      await embed(['BLOCK:600']);
    } finally {
      clearInterval(ticker);
    }
    // Inference on this thread would show ~600ms here.
    expect(worstLagMs).toBeLessThan(150);
  });

  it("rejects with the worker's error when inference fails", async () => {
    await expect(embed(['FAIL'])).rejects.toThrow('model exploded');
  });

  it('rejects a pending call when the worker dies, and starts a new worker for the next call', async () => {
    await expect(embed(['CRASH'])).rejects.toThrow(/Embedding worker stopped/);
    const vectors = await embed(['abc']);
    expect(Array.from(vectors[0])).toEqual([3]);
    expect(EmbeddingWorkerHost.Instance.IsAvailable).toBe(true);
  });

  it('disables itself after three worker deaths within a minute, so callers run in-process', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(embed(['CRASH'])).rejects.toThrow(/Embedding worker stopped/);
    }
    expect(EmbeddingWorkerHost.Instance.IsAvailable).toBe(false);
    expect(EmbeddingWorkerHost.Instance.DisabledReason).toMatch(/3 worker crashes/);
  });

  it('is unavailable when the worker script is missing', () => {
    EmbeddingWorkerHost.Instance.UseScriptPath('/nonexistent/EmbeddingWorker.js');
    expect(EmbeddingWorkerHost.Instance.IsAvailable).toBe(false);
    expect(EmbeddingWorkerHost.Instance.DisabledReason).toMatch(/worker script not found/);
  });

  it(`is unavailable when ${LOCAL_EMBEDDINGS_IN_PROCESS_ENV}=true`, () => {
    process.env[LOCAL_EMBEDDINGS_IN_PROCESS_ENV] = 'true';
    expect(EmbeddingWorkerHost.Instance.IsAvailable).toBe(false);
  });
});
