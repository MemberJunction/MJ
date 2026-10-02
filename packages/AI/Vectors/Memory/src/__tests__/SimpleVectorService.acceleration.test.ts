import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));

import { LogError } from '@memberjunction/core';
import { SimpleVectorService } from '../models/SimpleVectorService';
import { BaseVectorAccelerator, VectorClusterJob, VectorClusterJobResult, VectorSearchJob } from '../models/VectorAccelerator';
import { ScoredRows, SearchRows } from '../models/VectorKernels';
import { VectorStore } from '../models/VectorStore';

type Meta = { group: number };

function loaded(precision: 'float32' | 'float64' = 'float64', accelerator?: BaseVectorAccelerator): SimpleVectorService<Meta> {
  const service = new SimpleVectorService<Meta>({ Precision: precision, Accelerator: accelerator ?? new BaseVectorAccelerator() });
  service.LoadVectors([
    { key: 'a', vector: [1, 0, 0], metadata: { group: 1 } },
    { key: 'b', vector: [0.9, 0.1, 0], metadata: { group: 2 } },
    { key: 'c', vector: [0, 1, 0], metadata: { group: 1 } },
    { key: 'd', vector: [0, 0, 1], metadata: { group: 2 } },
  ]);
  return service;
}

/** An accelerator that answers with whatever rows and scores the test supplies. */
class ScriptedAccelerator extends BaseVectorAccelerator {
  public Jobs: VectorSearchJob[] = [];
  constructor(private readonly answer: (job: VectorSearchJob) => ScoredRows) {
    super();
  }
  public override SearchAsync(job: VectorSearchJob): Promise<ScoredRows> {
    this.Jobs.push(job);
    return Promise.resolve(this.answer(job));
  }
}

describe('SimpleVectorService acceleration contract', () => {
  it('re-ranks whatever an accelerator returns with exact scores', async () => {
    // Claims row 3 ("d") is the best match with a fabricated score, and repeats a row.
    const liar = new ScriptedAccelerator(() => ({
      Rows: Int32Array.from([3, 0, 0, 1]),
      Scores: Float64Array.from([5, 4, 4, 3]),
    }));
    const service = loaded('float64', liar);
    const results = await service.FindNearestAsync([1, 0, 0], 2);
    expect(results.map(r => r.key)).toEqual(['a', 'b']);
    expect(results[0].score).toBe(1);
  });

  it('drops rows removed, and re-checks the filter, after the job was dispatched', async () => {
    let service!: SimpleVectorService<Meta>;
    const racing = new ScriptedAccelerator(job => {
      service.RemoveVector('a');
      service.UpdateVector('b', { metadata: { group: 9 } });
      return SearchRows(job.Snapshot, job);
    });
    service = loaded('float64', racing);
    const results = await service.FindNearestAsync([1, 0, 0], 4, undefined, 'cosine', m => m.group !== 2);
    expect(results.map(r => r.key)).toEqual(['c']);
  });

  it('gives the same results from FindNearestAsync as FindNearest with the in-process accelerator', async () => {
    const service = loaded();
    for (const metric of ['cosine', 'euclidean', 'hamming'] as const) {
      expect(await service.FindNearestAsync([1, 0.2, 0], 3, 0.1, metric)).toEqual(service.FindNearest([1, 0.2, 0], 3, 0.1, metric));
    }
  });

  it('passes only rows that pass the metadata filter to the accelerator', async () => {
    const recorder = new ScriptedAccelerator(job => SearchRows(job.Snapshot, job));
    const service = loaded('float64', recorder);
    await service.FindNearestAsync([1, 0, 0], 1, undefined, 'cosine', m => m.group === 2);
    expect(Array.from(recorder.Jobs[0].Candidates!)).toEqual([1, 3]);
  });

  it('logs a dimension mismatch once instead of once per row, and returns nothing', () => {
    vi.mocked(LogError).mockClear();
    expect(loaded().FindNearest([1, 0], 5)).toEqual([]);
    expect(LogError).toHaveBeenCalledTimes(1);
  });

  it('logs an unknown metric once and returns nothing, as before', () => {
    vi.mocked(LogError).mockClear();
    expect(loaded().FindNearest([1, 0, 0], 5, undefined, 'nope' as 'cosine')).toEqual([]);
    expect(LogError).toHaveBeenCalledTimes(1);
  });
});

describe('SimpleVectorService async clustering', () => {
  it('maps an off-thread result back from rows to keys', async () => {
    class ClusterOnce extends BaseVectorAccelerator {
      public override ClusterAsync(job: VectorClusterJob): Promise<VectorClusterJobResult | null> {
        return Promise.resolve(SimpleVectorService.RunClusterJob(job));
      }
    }
    const service = loaded('float64', new ClusterOnce());
    const offThread = await service.DBSCANClusterAsync(0.2, 1, 'euclidean');
    expect(offThread).toEqual(service.DBSCANCluster(0.2, 1, 'euclidean'));
    expect(Array.from(offThread.clusters.values()).flat().sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('runs in-process when the accelerator declines', async () => {
    const service = loaded();
    const result = await service.DBSCANClusterAsync(0.2, 1, 'euclidean', m => m.group === 1);
    expect(result).toEqual(service.DBSCANCluster(0.2, 1, 'euclidean', m => m.group === 1));
  });

  it('validates arguments before dispatching', async () => {
    await expect(loaded().KMeansClusterAsync(0)).rejects.toThrow(/Invalid k/);
    await expect(loaded().DBSCANClusterAsync(1, 2)).rejects.toThrow(/Epsilon/);
  });
});

describe('SimpleVectorService storage', () => {
  it('stores float32 values when asked, and scores identical rows as identical', () => {
    const service = loaded('float32');
    expect(service.Precision).toBe('float32');
    expect(service.GetVector('b')).toEqual([Math.fround(0.9), Math.fround(0.1), 0]);
    service.AddVector('b2', [0.9, 0.1, 0]);
    expect(service.FindNearest([0.9, 0.1, 0], 2, undefined, 'hamming').map(r => r.score)).toEqual([1, 1]);
  });

  it('returns copies from GetVector and ExportVectors, never live storage', () => {
    const service = loaded();
    service.GetVector('a')![0] = 99;
    service.ExportVectors()[0].vector[0] = 99;
    expect(service.GetVector('a')).toEqual([1, 0, 0]);
  });

  it('keeps honouring a subclass that overrides a metric', () => {
    class Inverted extends SimpleVectorService<Meta> {
      public override CalculateDistance(a: number[], b: number[]): number {
        return 1 - super.CalculateDistance(a, b, 'cosine');
      }
    }
    const service = new Inverted({ Accelerator: new BaseVectorAccelerator() });
    service.AddVector('same', [1, 0]);
    service.AddVector('opposite', [-1, 0]);
    expect(service.FindNearest([1, 0], 1)[0].key).toBe('opposite');
  });

  it('pre-sizes storage with ReserveCapacity and rejects conflicting dimensions', () => {
    const service = new SimpleVectorService({ Accelerator: new BaseVectorAccelerator() });
    service.ReserveCapacity(100, 3);
    expect(service.ExpectedDimensions).toBe(3);
    expect(() => service.ReserveCapacity(10, 4)).toThrow(/dimension mismatch/);
  });

  it('gives each service a distinct StoreID', () => {
    expect(loaded().StoreID).not.toBe(loaded().StoreID);
  });
});

describe('VectorStore.ChangedRowsSince', () => {
  it('reports rows written or removed after a version, and gives up across a renumbering', () => {
    const store = new VectorStore<string>();
    store.Write('a', [1]);
    store.Write('b', [2]);
    const version = store.Version;
    store.Write('c', [3]);
    store.Remove('a');
    expect(Array.from(store.ChangedRowsSince(version, store.Generation)!)).toEqual([2, 0]);
    expect(store.ChangedRowsSince(version, store.Generation + 1)).toBeNull();
    store.Clear();
    expect(store.ChangedRowsSince(version, store.Generation)).toBeNull();
  });
});

describe('SearchRows row ranges', () => {
  it('scans only [RowStart, RowEnd) when no candidates are given', () => {
    const store = new VectorStore<string>();
    ['a', 'b', 'c', 'd'].forEach((k, i) => store.Write(k, [i + 1, 0]));
    const query = Float64Array.from([1, 0]);
    const result = SearchRows(store.View(), {
      Query: query, QueryNormSq: 1, Candidates: null, Metric: 'euclidean', TopK: null, Threshold: null, RowStart: 1, RowEnd: 3,
    });
    expect(Array.from(result.Rows)).toEqual([1, 2]);
  });
});
