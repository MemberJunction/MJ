import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const mocks = vi.hoisted(() => ({ LogError: vi.fn<(message: string) => void>() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return { ...actual, LogError: mocks.LogError };
});

import {
  ScoredRows,
  SearchRows,
  SimpleVectorService,
  VectorClusterJob,
  VectorSearchJob,
  VectorStore,
} from '@memberjunction/ai-vectors-memory';
import { WorkerPoolVectorAccelerator, LoadWorkerPoolVectorAccelerator } from '../WorkerPoolVectorAccelerator';
import { LoadVectorMemoryServer } from '../index';
import { VectorAccelerationSettings } from '../VectorAccelerationSettings';
import { VectorWorkerPool } from '../VectorWorkerPool';
import { NativeVectorBackend } from '../NativeVectorBackend';
import type { WorkerResponse } from '../worker/VectorWorkerProtocol';

type Allocation = 'shared' | 'plain';

function storeOf(rows: number, dims: number, allocation: Allocation = 'shared'): VectorStore<string> {
  const allocate = allocation === 'shared' ? (n: number) => new SharedArrayBuffer(n) : (n: number) => new ArrayBuffer(n);
  const store = new VectorStore<string>('float32', allocate);
  for (let i = 0; i < rows; i++) store.Write(`k${i}`, Array.from({ length: dims }, (_, d) => Math.sin(i * 7 + d)));
  return store;
}

function searchJob(store: VectorStore<string>, overrides: Partial<VectorSearchJob> = {}): VectorSearchJob {
  const query = Float64Array.from(store.CopyRow(0));
  return {
    Query: query,
    QueryNormSq: query.reduce((s, v) => s + v * v, 0),
    Candidates: null,
    Metric: 'cosine',
    TopK: 5,
    Threshold: null,
    Snapshot: store.Snapshot(),
    Source: store,
    ...overrides,
  };
}

function clusterJob(store: VectorStore<string>, overrides: Partial<VectorClusterJob> = {}): VectorClusterJob {
  return { Snapshot: store.Snapshot(), Candidates: null, Algorithm: 'dbscan', Metric: 'euclidean', Epsilon: 0.5, MinPoints: 1, ...overrides };
}

const accelerator = new WorkerPoolVectorAccelerator();
const pool = VectorWorkerPool.Instance;
const native = NativeVectorBackend.Instance;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.LogError.mockClear();
  VectorAccelerationSettings.Instance.Reset();
  // Offload everything, so routing decisions are visible; the pool itself is stubbed per test.
  VectorAccelerationSettings.Instance.Configure({ OffloadMinWork: 1, NativeMinWork: 1, ClusterOffloadMinRows: 1, PoolSize: 2 });
  vi.spyOn(pool, 'IsAvailable', 'get').mockReturnValue(true);
});

afterAll(() => {
  vi.unstubAllGlobals();
  VectorAccelerationSettings.Instance.Reset();
});

describe('WorkerPoolVectorAccelerator routing', () => {
  it('can be anchored against tree-shaking from server bootstrap', () => {
    expect(() => LoadWorkerPoolVectorAccelerator()).not.toThrow();
    expect(() => LoadVectorMemoryServer()).not.toThrow();
  });

  it('does not load the native backend when UseNative is off', () => {
    VectorAccelerationSettings.Instance.Configure({ UseNative: false });
    const load = vi.spyOn(native, 'Load');
    new WorkerPoolVectorAccelerator();
    expect(load).not.toHaveBeenCalled();
    VectorAccelerationSettings.Instance.Configure({ UseNative: true });
    new WorkerPoolVectorAccelerator();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('scans in-process with the JS kernels when neither workers nor native code can take a search', async () => {
    VectorAccelerationSettings.Instance.Configure({ UseNative: false });
    vi.spyOn(pool, 'IsAvailable', 'get').mockReturnValue(false);
    const job = searchJob(storeOf(50, 4));
    expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
  });

  it('allocates ordinary memory where SharedArrayBuffer does not exist, and then never offloads', async () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    expect(accelerator.AllocateBuffer(16)).toBeInstanceOf(ArrayBuffer);
    const run = vi.spyOn(pool, 'Run');
    const store = storeOf(50, 4, 'plain');
    const job = searchJob(store);
    expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
    expect(await accelerator.ClusterAsync(clusterJob(store))).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  describe('synchronous search', () => {
    it('never uses native code when UseNative is off', () => {
      VectorAccelerationSettings.Instance.Configure({ UseNative: false });
      const exact = vi.spyOn(native, 'SearchRows');
      expect(accelerator.TrySearchSync(searchJob(storeOf(50, 4)))).toBeNull();
      expect(exact).not.toHaveBeenCalled();
    });

    it('leaves searches below NativeMinWork to the JS kernels', () => {
      VectorAccelerationSettings.Instance.Configure({ NativeMinWork: 1_000_000 });
      const exact = vi.spyOn(native, 'SearchRows');
      expect(accelerator.TrySearchSync(searchJob(storeOf(50, 4)))).toBeNull();
      expect(exact).not.toHaveBeenCalled();
    });

    it('measures a filtered search by its candidate count, not the store size', () => {
      VectorAccelerationSettings.Instance.Configure({ NativeMinWork: 100 });
      const exact = vi.spyOn(native, 'SearchRows');
      const store = storeOf(50, 4); // 50 rows × 4 dims = 200 to score unfiltered, but 2 × 4 = 8 filtered
      expect(accelerator.TrySearchSync(searchJob(store, { Candidates: Int32Array.from([0, 1]) }))).toBeNull();
      expect(exact).not.toHaveBeenCalled();
      accelerator.TrySearchSync(searchJob(store));
      expect(exact).toHaveBeenCalledTimes(1);
    });

    it('runs native exact search on the calling thread with every core', () => {
      const exact = vi.spyOn(native, 'SearchRows');
      const job = searchJob(storeOf(50, 4));
      expect(accelerator.TrySearchSync(job)).toEqual(SearchRows(job.Snapshot, job));
      expect(exact).toHaveBeenCalledWith(job.Snapshot, job, 0);
    });
  });

  describe('async search', () => {
    it('answers from an approximate index first, without dispatching', async () => {
      const approximate: ScoredRows = { Rows: Int32Array.from([3]), Scores: Float64Array.from([0.9]) };
      vi.spyOn(native, 'SearchApproximate').mockReturnValue(approximate);
      const run = vi.spyOn(pool, 'Run');
      expect(await accelerator.SearchAsync(searchJob(storeOf(50, 4)))).toBe(approximate);
      expect(run).not.toHaveBeenCalled();
    });

    it('sends a native-capable search to one worker whole, with a share of the cores', async () => {
      const run = vi.spyOn(pool, 'Run').mockResolvedValue({ TaskID: 1, Ok: true, Kind: 'search', Rows: Int32Array.from([0]), Scores: Float64Array.from([1]) });
      const job = searchJob(storeOf(50, 4));
      const result = await accelerator.SearchAsync(job);
      expect(Array.from(result.Rows)).toEqual([0]);
      expect(run).toHaveBeenCalledTimes(1);
      const [request] = run.mock.calls[0];
      if (request.Kind !== 'search') throw new Error('expected a search request');
      expect(request.NativeThreads).toBeGreaterThanOrEqual(1);
      expect(request.Spec.RowStart).toBe(0);
      expect(request.Spec.RowEnd).toBe(50);
    });

    it('splits a filtered search into candidate partitions and merges the partial results', async () => {
      VectorAccelerationSettings.Instance.Configure({ PartitionWork: 40 });
      const run = vi.spyOn(pool, 'Run').mockImplementation(request => {
        if (request.Kind !== 'search') throw new Error('expected a search request');
        const part = SearchRows(request.View, request.Spec);
        return Promise.resolve<WorkerResponse>({ TaskID: 1, Ok: true, Kind: 'search', Rows: part.Rows, Scores: part.Scores });
      });
      const store = storeOf(50, 4);
      const job = searchJob(store, { Candidates: Int32Array.from({ length: 30 }, (_, i) => i + 10) });
      expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
      expect(run).toHaveBeenCalledTimes(2); // 30 rows × 4 dims / 40 per partition, capped at PoolSize
      for (const [request] of run.mock.calls) {
        if (request.Kind !== 'search') throw new Error('expected a search request');
        expect(request.NativeThreads).toBe(0);
        expect(request.Spec.Candidates!.length).toBe(15);
      }
    });

    it('splits an unfiltered JS search into row ranges when native code is off', async () => {
      VectorAccelerationSettings.Instance.Configure({ UseNative: false, PartitionWork: 50 });
      const run = vi.spyOn(pool, 'Run').mockImplementation(request => {
        if (request.Kind !== 'search') throw new Error('expected a search request');
        const part = SearchRows(request.View, request.Spec);
        return Promise.resolve<WorkerResponse>({ TaskID: 1, Ok: true, Kind: 'search', Rows: part.Rows, Scores: part.Scores });
      });
      const job = searchJob(storeOf(50, 4), { Metric: 'manhattan', TopK: null });
      expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
      const ranges = run.mock.calls.map(([request]) => request.Kind === 'search' ? [request.Spec.RowStart, request.Spec.RowEnd] : []);
      expect(ranges).toEqual([[0, 25], [25, 50]]);
    });

    it('logs a worker failure and answers in-process instead', async () => {
      vi.spyOn(pool, 'Run').mockRejectedValue(new Error('worker crashed'));
      const job = searchJob(storeOf(50, 4));
      expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
      expect(mocks.LogError).toHaveBeenCalledWith('Vector search on worker failed, running in-process: worker crashed');
    });

    it('treats a reply of the wrong kind as a failure', async () => {
      vi.spyOn(pool, 'Run').mockResolvedValue({ TaskID: 1, Ok: true, Kind: 'cluster', Result: { Clusters: new Map(), Centroids: null, Outliers: null } });
      const job = searchJob(storeOf(50, 4));
      expect(await accelerator.SearchAsync(job)).toEqual(SearchRows(job.Snapshot, job));
      expect(mocks.LogError).toHaveBeenCalledWith('Vector search on worker failed, running in-process: unexpected vector worker response');
    });

    it('keeps small searches, private memory and an unavailable pool in-process', async () => {
      const run = vi.spyOn(pool, 'Run');
      VectorAccelerationSettings.Instance.Configure({ OffloadMinWork: 1_000_000 });
      await accelerator.SearchAsync(searchJob(storeOf(50, 4)));
      VectorAccelerationSettings.Instance.Configure({ OffloadMinWork: 1 });
      await accelerator.SearchAsync(searchJob(storeOf(50, 4, 'plain')));
      vi.spyOn(pool, 'IsAvailable', 'get').mockReturnValue(false);
      await accelerator.SearchAsync(searchJob(storeOf(50, 4)));
      expect(run).not.toHaveBeenCalled();
    });

    it('logs a non-Error rejection as text', async () => {
      vi.spyOn(pool, 'Run').mockRejectedValue('pool exploded');
      await accelerator.SearchAsync(searchJob(storeOf(50, 4)));
      expect(mocks.LogError).toHaveBeenCalledWith('Vector search on worker failed, running in-process: pool exploded');
    });
  });

  describe('clustering', () => {
    it('declines small, private-memory and pool-less jobs so the service clusters in-process', async () => {
      const run = vi.spyOn(pool, 'Run');
      VectorAccelerationSettings.Instance.Configure({ ClusterOffloadMinRows: 100 });
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(50, 4)))).toBeNull();
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(50, 4), { Candidates: Int32Array.from([1, 2]) }))).toBeNull();
      VectorAccelerationSettings.Instance.Configure({ ClusterOffloadMinRows: 1 });
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(50, 4, 'plain')))).toBeNull();
      vi.spyOn(pool, 'IsAvailable', 'get').mockReturnValue(false);
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(50, 4)))).toBeNull();
      expect(run).not.toHaveBeenCalled();
    });

    it('returns a worker\'s clustering result', async () => {
      const store = storeOf(20, 2);
      const job = clusterJob(store);
      const expected = SimpleVectorService.RunClusterJob(job);
      vi.spyOn(pool, 'Run').mockResolvedValue({ TaskID: 1, Ok: true, Kind: 'cluster', Result: expected });
      expect(await accelerator.ClusterAsync(job)).toBe(expected);
    });

    it('declines on a reply of the wrong kind, and logs a worker failure', async () => {
      const run = vi.spyOn(pool, 'Run').mockResolvedValue({ TaskID: 1, Ok: true, Kind: 'search', Rows: new Int32Array(0), Scores: new Float64Array(0) });
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(20, 2)))).toBeNull();
      run.mockRejectedValue(new Error('timed out'));
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(20, 2)))).toBeNull();
      run.mockRejectedValue('gone');
      expect(await accelerator.ClusterAsync(clusterJob(storeOf(20, 2)))).toBeNull();
      expect(mocks.LogError.mock.calls.map(c => c[0])).toEqual([
        'Vector clustering on worker failed, running in-process: timed out',
        'Vector clustering on worker failed, running in-process: gone',
      ]);
    });
  });
});
