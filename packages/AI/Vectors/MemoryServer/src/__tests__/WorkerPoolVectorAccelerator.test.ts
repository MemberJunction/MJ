import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BaseVectorAccelerator,
  DistanceMetric,
  SimpleVectorService,
  VectorAcceleratorResolver,
} from '@memberjunction/ai-vectors-memory';
import { WorkerPoolVectorAccelerator } from '../WorkerPoolVectorAccelerator';
import { VectorAccelerationSettings } from '../VectorAccelerationSettings';
import { VectorWorkerPool } from '../VectorWorkerPool';
import { NativeVectorBackend } from '../NativeVectorBackend';

// Workers run the COMPILED script (turbo builds a package before testing it).
const WORKER_SCRIPT = fileURLToPath(new URL('../../dist/worker/VectorComputeWorker.js', import.meta.url));
const workerScriptBuilt = existsSync(WORKER_SCRIPT);

type Meta = { group: number };

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Clustered vectors with exact duplicates (ties) and some zero rows mixed in. */
function makeEntries(count: number, dims: number, seed = 1) {
  const rand = seeded(seed);
  const centers = Array.from({ length: 6 }, () => Array.from({ length: dims }, () => rand() * 2 - 1));
  return Array.from({ length: count }, (_, i) => {
    const center = centers[i % centers.length];
    let vector = center.map(c => c + (rand() - 0.5) * 0.4);
    if (i % 97 === 5) vector = new Array(dims).fill(0);
    return { key: `k${i}`, vector, metadata: { group: i % 4 } };
  });
}

/** The same data in an accelerated service and an in-process reference service. */
function makePair(count: number, dims: number, precision: 'float32' | 'float64' = 'float32') {
  const entries = makeEntries(count, dims);
  const accelerated = new SimpleVectorService<Meta>({ Precision: precision });
  const reference = new SimpleVectorService<Meta>({ Precision: precision, Accelerator: new BaseVectorAccelerator() });
  accelerated.LoadVectors(entries);
  reference.LoadVectors(entries);
  // Duplicate a vector under a new key so the K boundary has exact ties.
  accelerated.AddVector('dup', entries[10].vector, { group: 1 });
  reference.AddVector('dup', entries[10].vector, { group: 1 });
  return { accelerated, reference, entries };
}

const metrics: DistanceMetric[] = ['cosine', 'euclidean', 'dotproduct', 'manhattan', 'jaccard', 'hamming'];

describe('WorkerPoolVectorAccelerator', () => {
  beforeAll(() => {
    VectorAccelerationSettings.Instance.Reset();
    VectorAccelerationSettings.Instance.Configure({ WorkerScriptPath: WORKER_SCRIPT });
  });

  afterAll(async () => {
    await VectorWorkerPool.Instance.Shutdown();
    VectorAccelerationSettings.Instance.Reset();
  });

  beforeEach(() => {
    VectorWorkerPool.Instance.Reset();
    VectorAccelerationSettings.Instance.Configure({
      WorkerScriptPath: WORKER_SCRIPT, PoolSize: 2, OffloadMinWork: 1, PartitionWork: 2000,
      UseNative: true, NativeMinWork: 1, ANN: { Enabled: false },
    });
  });

  it('is the accelerator every service resolves once this package is loaded', () => {
    expect(VectorAcceleratorResolver.Instance.Current).toBeInstanceOf(WorkerPoolVectorAccelerator);
  });

  it('allocates store memory as SharedArrayBuffer', () => {
    expect(new WorkerPoolVectorAccelerator().AllocateBuffer(64)).toBeInstanceOf(SharedArrayBuffer);
  });

  it('loads the native backend when usearch is installed', () => {
    expect(NativeVectorBackend.Instance.Load()).toBe(true);
  });

  describe.skipIf(!workerScriptBuilt)('off-thread search (requires a build — run `pnpm run build` first)', () => {
    it('returns exactly what in-process search returns, for every metric, filtered and not', async () => {
      const { accelerated, reference, entries } = makePair(600, 24);
      for (const metric of metrics) {
        for (const query of [entries[3].vector, entries[10].vector, entries[311].vector]) {
          for (const topK of [1, 5, 40, 2000]) {
            for (const threshold of [undefined, 0.55]) {
              const filter = topK === 5 ? (m: Meta) => m.group !== 2 : undefined;
              const expected = reference.FindNearest(query, topK, threshold, metric, filter);
              expect(await accelerated.FindNearestAsync(query, topK, threshold, metric, filter)).toEqual(expected);
            }
          }
        }
      }
    });

    it('matches with the native backend disabled (pure JS workers)', async () => {
      VectorAccelerationSettings.Instance.Configure({ UseNative: false });
      const { accelerated, reference, entries } = makePair(400, 16, 'float64');
      for (const metric of ['cosine', 'euclidean'] as DistanceMetric[]) {
        expect(await accelerated.FindNearestAsync(entries[7].vector, 12, undefined, metric))
          .toEqual(reference.FindNearest(entries[7].vector, 12, undefined, metric));
      }
    });

    it('sees writes made after a previous search (shared memory, re-scored results)', async () => {
      const { accelerated, entries } = makePair(500, 16);
      await accelerated.FindNearestAsync(entries[0].vector, 3);
      accelerated.AddVector('new', entries[0].vector.map(v => v * 2), { group: 0 });
      accelerated.RemoveVector('k0');
      const keys = (await accelerated.FindNearestAsync(entries[0].vector, 3)).map(r => r.key);
      expect(keys).toContain('new');
      expect(keys).not.toContain('k0');
    });

    it('runs DBSCAN on a worker with the same result as in-process', async () => {
      VectorAccelerationSettings.Instance.Configure({ ClusterOffloadMinRows: 1 });
      const { accelerated, reference } = makePair(300, 8);
      const filter = (m: Meta) => m.group !== 3;
      expect(await accelerated.DBSCANClusterAsync(0.2, 3, 'euclidean', filter))
        .toEqual(reference.DBSCANCluster(0.2, 3, 'euclidean', filter));
    });

    it('runs K-Means on a worker, assigning every vector exactly once', async () => {
      VectorAccelerationSettings.Instance.Configure({ ClusterOffloadMinRows: 1 });
      const { accelerated } = makePair(300, 8);
      const result = await accelerated.KMeansClusterAsync(6, 50, 'euclidean');
      const assigned = Array.from(result.clusters.values()).flat();
      expect(assigned.length).toBe(accelerated.Size);
      expect(new Set(assigned).size).toBe(accelerated.Size);
      expect(result.centroids?.size).toBe(6);
      expect(result.metadata?.inertia).toBeGreaterThan(0);
    });

    it('falls back to in-process work when the pool cannot start', async () => {
      VectorAccelerationSettings.Instance.Configure({ WorkerScriptPath: '/nonexistent/worker.js' });
      const { accelerated, reference, entries } = makePair(200, 8);
      expect(await accelerated.FindNearestAsync(entries[1].vector, 5)).toEqual(reference.FindNearest(entries[1].vector, 5));
      expect(VectorWorkerPool.Instance.DisabledReason).toMatch(/not found/);
    });
  });

  describe('native exact search on the calling thread', () => {
    it('matches the JS kernels exactly, ties and zero vectors included', () => {
      const { accelerated, reference, entries } = makePair(800, 32);
      for (const metric of ['cosine', 'euclidean', 'dotproduct'] as DistanceMetric[]) {
        for (const query of [entries[10].vector, entries[42].vector, entries[5].vector]) {
          for (const topK of [1, 2, 10, 100]) {
            expect(accelerated.FindNearest(query, topK, undefined, metric)).toEqual(reference.FindNearest(query, topK, undefined, metric));
            expect(accelerated.FindNearest(query, topK, 0.6, metric)).toEqual(reference.FindNearest(query, topK, 0.6, metric));
          }
        }
      }
    });
  });

  describe('approximate (HNSW) search', () => {
    it('is off by default', () => {
      VectorAccelerationSettings.Instance.Reset();
      expect(VectorAccelerationSettings.Instance.Options.ANN.Enabled).toBe(false);
    });

    it('builds in the background, then serves exact scores with high recall and follows later writes', async () => {
      VectorAccelerationSettings.Instance.Configure({ ANN: { Enabled: true, MinRows: 100, BuildSliceMs: 4 } });
      const { accelerated, reference, entries } = makePair(1500, 32);
      const query = entries[20].vector;

      const before = accelerated.FindNearest(query, 10); // triggers the build; served exactly meanwhile
      expect(before).toEqual(reference.FindNearest(query, 10));
      await waitFor(() => NativeVectorBackend.Instance.IsAnnReady(accelerated.StoreID));

      const approximate = accelerated.FindNearest(query, 10);
      const exact = reference.FindNearest(query, 10);
      const exactKeys = new Set(exact.map(r => r.key));
      expect(approximate.filter(r => exactKeys.has(r.key)).length).toBeGreaterThanOrEqual(9);
      for (const hit of approximate) {
        expect(hit.score).toBe(reference.FindNearest(query, 2000).find(r => r.key === hit.key)!.score);
      }

      accelerated.AddVector('fresh', query, { group: 0 });
      expect(accelerated.FindNearest(query, 3).map(r => r.key)).toContain('fresh');
    });
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition not met in time');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
