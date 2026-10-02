import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { fileURLToPath } from 'node:url';

const mocks = vi.hoisted(() => ({ LogError: vi.fn<(message: string) => void>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: mocks.LogError };
});

import type { VectorRowsView } from '@memberjunction/ai-vectors-memory';
import { VectorWorkerPool } from '../VectorWorkerPool';
import { VectorAccelerationSettings } from '../VectorAccelerationSettings';
import { IsSearchResponse, WorkerRequestBody, WorkerResponse } from '../worker/VectorWorkerProtocol';

/** A worker that misbehaves on request — see the behaviour table in the fixture. */
const SCRIPTED_WORKER = fileURLToPath(new URL('./fixtures/scripted-vector-worker.mjs', import.meta.url));

const ERROR_RESPONSE = 1001;
const EXIT = 1002;
const THROW = 1003;
const HANG = 1004;
const STALE_REPLY_FIRST = 1005;

const EMPTY_VIEW: VectorRowsView = {
  Data: new Float64Array(0), Norms: new Float64Array(0), Live: new Uint8Array(0), RowCount: 0, Dims: 0,
};

/** A search request the scripted worker interprets: `mode` picks a behaviour, `delayMs` delays a normal reply. */
function task(mode = 10, delayMs = 0): WorkerRequestBody {
  return {
    Kind: 'search',
    View: EMPTY_VIEW,
    Spec: { Query: new Float64Array(0), QueryNormSq: 0, Candidates: null, Metric: 'cosine', TopK: mode, Threshold: delayMs },
    NativeThreads: 0,
  };
}

function rowsOf(response: WorkerResponse): number[] {
  if (!IsSearchResponse(response)) throw new Error('expected a search response');
  return Array.from(response.Rows);
}

const pool = VectorWorkerPool.Instance;

beforeEach(async () => {
  await pool.Shutdown();
  pool.Reset();
  mocks.LogError.mockClear();
  VectorAccelerationSettings.Instance.Reset();
  VectorAccelerationSettings.Instance.Configure({ WorkerScriptPath: SCRIPTED_WORKER, PoolSize: 2, TaskTimeoutMs: 5_000 });
});

afterAll(async () => {
  await pool.Shutdown();
  pool.Reset();
  VectorAccelerationSettings.Instance.Reset();
});

describe('VectorWorkerPool', () => {
  it('defaults to the compiled worker beside the package', () => {
    VectorAccelerationSettings.Instance.Configure({ WorkerScriptPath: undefined });
    expect(pool.ScriptPath).toMatch(/[\\/]worker[\\/]VectorComputeWorker\.js$/);
  });

  it('runs tasks on at most PoolSize workers, queueing the rest, and answers each with its own result', async () => {
    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => pool.Run(task(10, 20))));
    const taskIDs = responses.map(r => r.TaskID);
    expect(new Set(taskIDs).size).toBe(5);
    responses.forEach(r => expect(rowsOf(r)).toEqual([r.TaskID]));
    expect(pool.WorkerCount).toBe(2);
  });

  it('rejects with the error a worker reports, and keeps that worker for the next task', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1 });
    await expect(pool.Run(task(ERROR_RESPONSE))).rejects.toThrow('scripted failure');
    expect(pool.WorkerCount).toBe(1);
    expect(rowsOf(await pool.Run(task()))).toHaveLength(1);
    expect(mocks.LogError).not.toHaveBeenCalled();
  });

  it('ignores a reply that is not for the task the worker is running', async () => {
    const response = await pool.Run(task(STALE_REPLY_FIRST));
    expect(rowsOf(response)).toEqual([response.TaskID]);
  });

  it('fails a task whose worker exits, replaces the worker, and logs why', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1 });
    await expect(pool.Run(task(EXIT))).rejects.toThrow('vector worker exited with code 3');
    expect(pool.WorkerCount).toBe(0);
    expect(mocks.LogError).toHaveBeenCalledWith(expect.stringContaining('exited with code 3'));
    expect(rowsOf(await pool.Run(task()))).toHaveLength(1);
    expect(pool.WorkerCount).toBe(1);
  });

  it('fails a task whose worker throws an uncaught error', async () => {
    await expect(pool.Run(task(THROW))).rejects.toThrow('scripted crash');
    expect(pool.DisabledReason).toBeNull();
  });

  it('abandons a task that runs past the timeout and replaces its worker', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1, TaskTimeoutMs: 100 });
    await expect(pool.Run(task(HANG))).rejects.toThrow('vector worker task exceeded 100 ms');
    expect(pool.WorkerCount).toBe(0);
    expect(rowsOf(await pool.Run(task()))).toHaveLength(1);
  });

  it('starts queued work on a fresh worker after a timeout frees the slot', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1, TaskTimeoutMs: 100 });
    const hung = pool.Run(task(HANG));
    const queued = pool.Run(task());
    await expect(hung).rejects.toThrow(/exceeded/);
    expect(rowsOf(await queued)).toHaveLength(1);
  });

  it('disables itself after five failures within a minute, rejecting queued work and later calls', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1 });
    const results = await Promise.allSettled([EXIT, EXIT, EXIT, EXIT, EXIT, 10, 10].map(mode => pool.Run(task(mode))));
    expect(results.slice(0, 5).every(r => r.status === 'rejected')).toBe(true);
    const queued = results.slice(5);
    queued.forEach(r => {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') expect(String(r.reason)).toMatch(/pool disabled: 5 worker failures within 60s/);
    });
    expect(pool.IsAvailable).toBe(false);
    expect(pool.DisabledReason).toBe('5 worker failures within 60s');
    await expect(pool.Run(task())).rejects.toThrow('Vector worker pool unavailable: 5 worker failures within 60s');
    expect(mocks.LogError).toHaveBeenCalledWith(expect.stringContaining('disabled'));

    pool.Reset();
    expect(pool.IsAvailable).toBe(true);
    expect(rowsOf(await pool.Run(task()))).toHaveLength(1);
  });

  it('is unavailable with a pool size of 0', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 0 });
    expect(pool.IsAvailable).toBe(false);
    await expect(pool.Run(task())).rejects.toThrow('Vector worker pool unavailable: pool size is 0');
  });

  it('disables itself, once, when the worker script is missing', () => {
    VectorAccelerationSettings.Instance.Configure({ WorkerScriptPath: '/nonexistent/vector-worker.js' });
    expect(pool.IsAvailable).toBe(false);
    expect(pool.IsAvailable).toBe(false);
    expect(pool.DisabledReason).toBe('worker script not found at /nonexistent/vector-worker.js');
    expect(mocks.LogError).toHaveBeenCalledTimes(1);
  });

  it('rejects running and queued tasks on Shutdown, and starts again on the next Run', async () => {
    VectorAccelerationSettings.Instance.Configure({ PoolSize: 1 });
    const settled = Promise.allSettled([pool.Run(task(HANG)), pool.Run(task())]);
    await new Promise(resolve => setTimeout(resolve, 20)); // let the first task reach its worker
    await pool.Shutdown();
    const [running, queued] = await settled;
    for (const result of [running, queued]) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(String(result.reason)).toContain('Vector worker pool shut down');
    }
    expect(pool.WorkerCount).toBe(0);
    expect(mocks.LogError).not.toHaveBeenCalled(); // a deliberate shutdown is not a crash
    expect(rowsOf(await pool.Run(task()))).toHaveLength(1);
  });
});
