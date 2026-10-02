import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));

import { SimpleVectorService } from '../models/SimpleVectorService';
import { BaseVectorAccelerator, VectorClusterJob, VectorClusterJobResult } from '../models/VectorAccelerator';
import { VectorStore } from '../models/VectorStore';

type Meta = { group: number };

/** A service over points on the x axis, keyed p0, p1, …, using the in-process accelerator. */
function onLine(xs: number[], accelerator: BaseVectorAccelerator = new BaseVectorAccelerator()): SimpleVectorService<Meta> {
  const service = new SimpleVectorService<Meta>({ Accelerator: accelerator });
  xs.forEach((x, i) => service.AddVector(`p${i}`, [x, 0], { group: i % 2 }));
  return service;
}

/** Overrides a metric method, so the service scores row by row through it. */
class CustomMetricService extends SimpleVectorService<Meta> {
  public Calls = 0;
  public override CalculateDistance(a: number[], b: number[], metric: 'cosine' | 'euclidean' | 'manhattan' | 'dotproduct' | 'jaccard' | 'hamming' = 'cosine'): number {
    this.Calls++;
    return super.CalculateDistance(a, b, metric);
  }
}

function customOnLine(xs: number[]): CustomMetricService {
  const service = new CustomMetricService({ Accelerator: new BaseVectorAccelerator() });
  xs.forEach((x, i) => service.AddVector(`p${i}`, [x, 0], { group: i % 2 }));
  return service;
}

/** Records cluster jobs and runs them in-process, as a worker thread would. */
class RecordingClusterAccelerator extends BaseVectorAccelerator {
  public Jobs: VectorClusterJob[] = [];
  public override ClusterAsync(job: VectorClusterJob): Promise<VectorClusterJobResult | null> {
    this.Jobs.push(job);
    return Promise.resolve(SimpleVectorService.RunClusterJob(job));
  }
}

/** Makes K-Means++ pick the first point, then the farthest one, for the next KMeansCluster call. */
function seedKMeansPlusPlus(): void {
  vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KMeansCluster', () => {
  it('reassigns points between iterations until assignments stop changing', () => {
    // Seeds p0 and p1 (both near 0): p1 then owns the far points, its centroid moves
    // away, and p1 is reassigned to p0's cluster on the next iteration.
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(1e-9);
    const service = onLine([0, 1, 10, 11]);
    const result = service.KMeansCluster(2, 100, 'euclidean');
    expect(result.clusters.get(0)).toEqual(['p0', 'p1']);
    expect(result.clusters.get(1)).toEqual(['p2', 'p3']);
    expect(result.metadata?.iterations).toBeGreaterThan(1);
    expect(result.centroids?.get(1)).toEqual([10.5, 0]);
  });

  it('keeps the previous centroid for a cluster that receives no points', () => {
    // Identical points: K-Means++ picks the same point twice, and the first centroid wins every tie.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const service = onLine([3, 3, 3]);
    const result = service.KMeansCluster(2, 100, 'euclidean');
    expect(result.clusters.get(0)).toEqual(['p0', 'p1', 'p2']);
    expect(result.clusters.get(1)).toEqual([]);
    expect(result.centroids?.get(1)).toEqual([3, 0]);
  });

  it('assigns every point to the initial centroids when maxIterations is 0', () => {
    seedKMeansPlusPlus();
    const result = onLine([0, 1, 10, 11]).KMeansCluster(2, 0, 'euclidean');
    expect(result.metadata?.iterations).toBe(0);
    expect(Array.from(result.clusters.values()).flat().sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(result.metadata?.inertia).toBeGreaterThan(0);
  });

  it('stops when no centroid moves more than the tolerance', () => {
    seedKMeansPlusPlus();
    const result = onLine([0, 0.001, 10, 10.001]).KMeansCluster(2, 100, 'euclidean', 0.5);
    expect(result.metadata?.iterations).toBe(1);
  });

  it('honours a subclass metric override for every distance it computes', () => {
    const custom = customOnLine([0, 1, 10, 11]);
    const reference = onLine([0, 1, 10, 11]);
    seedKMeansPlusPlus();
    const customResult = custom.KMeansCluster(2, 100, 'euclidean');
    seedKMeansPlusPlus();
    expect(customResult).toEqual(reference.KMeansCluster(2, 100, 'euclidean'));
    expect(custom.Calls).toBeGreaterThan(0);
  });
});

describe('DBSCANCluster', () => {
  it('grows a cluster through a chain of core points and reclaims border points first marked as noise', () => {
    // Adjacent points score exactly 0.5 under euclidean; every interior point is a core point.
    const result = onLine([0, 1, 2, 3, 4, 20]).DBSCANCluster(0.5, 3, 'euclidean');
    expect(result.clusters.size).toBe(1);
    expect([...result.clusters.get(0)!].sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    expect(result.outliers).toEqual(['p5']);
    expect(result.metadata?.silhouetteScore).toBe(0); // one cluster: no point has a neighbour cluster
  });

  it('reports no clusters and no silhouette score when every point is noise', () => {
    const result = onLine([0, 10, 20]).DBSCANCluster(0.1, 2, 'euclidean');
    expect(result.clusters.size).toBe(0);
    expect(result.outliers).toEqual(['p0', 'p1', 'p2']);
    expect(result.metadata?.silhouetteScore).toBeUndefined();
  });

  it('gives the same result through a subclass metric override', () => {
    const custom = customOnLine([0, 1, 2, 3, 4, 20]);
    expect(custom.DBSCANCluster(0.5, 3, 'euclidean', m => m.group >= 0))
      .toEqual(onLine([0, 1, 2, 3, 4, 20]).DBSCANCluster(0.5, 3, 'euclidean', m => m.group >= 0));
    expect(custom.Calls).toBeGreaterThan(0);
  });

  it('rejects a non-positive minPoints', () => {
    expect(() => onLine([0, 1]).DBSCANCluster(0.5, 0)).toThrow('MinPoints must be positive');
  });
});

describe('cluster quality metrics', () => {
  const twoClusters = () => ({ clusters: new Map([[0, ['p0', 'p1']], [1, ['p2', 'p3']]]) });

  it('measures within- and between-cluster distance over every pair', () => {
    const service = onLine([0, 1, 10, 11]);
    // Within: both pairs are 1 apart → distance 1 - 1/2.
    expect(service.WithinClusterDistance(twoClusters(), 'euclidean')).toBeCloseTo(0.5, 12);
    const between = service.BetweenClusterDistance(twoClusters(), 'euclidean');
    const expected = [10, 11, 9, 10].reduce((sum, d) => sum + (1 - 1 / (1 + d)), 0) / 4;
    expect(between).toBeCloseTo(expected, 12);
  });

  it('returns 0 for clusters with no pairs to measure', () => {
    const service = onLine([0, 1]);
    const singletons = { clusters: new Map([[0, ['p0']], [1, ['p1']]]) };
    expect(service.WithinClusterDistance(singletons)).toBe(0);
    expect(service.BetweenClusterDistance({ clusters: new Map([[0, ['p0', 'p1']]]) })).toBe(0);
    expect(service.BetweenClusterDistance({ clusters: new Map([[0, ['p0']], [1, []]]) })).toBe(0);
  });

  it('skips keys that are no longer stored', () => {
    const service = onLine([0, 1, 10, 11]);
    const withGhost = { clusters: new Map([[0, ['p0', 'ghost', 'p1']], [1, ['p2', 'p3', 'ghost2']]]) };
    expect(service.WithinClusterDistance(withGhost, 'euclidean')).toBeCloseTo(0.5, 12);
    expect(service.BetweenClusterDistance(withGhost, 'euclidean'))
      .toBeCloseTo(service.BetweenClusterDistance(twoClusters(), 'euclidean'), 12);
    // A missing member still counts in the silhouette averages (as distance 0), but scores no point itself.
    const score = service.SilhouetteScore(withGhost, 'euclidean');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('scores a tight, well-separated clustering close to 1 and a swapped one below 0', () => {
    const service = onLine([0, 0.01, 100, 100.01]);
    expect(service.SilhouetteScore(twoClusters(), 'euclidean')).toBeGreaterThan(0.9);
    const swapped = { clusters: new Map([[0, ['p0', 'p2']], [1, ['p1', 'p3']]]) };
    expect(service.SilhouetteScore(swapped, 'euclidean')).toBeLessThan(0);
  });

  it('returns 0 when no point has another cluster to compare with', () => {
    expect(onLine([0, 1]).SilhouetteScore({ clusters: new Map([[0, ['p0', 'p1']]]) })).toBe(0);
  });

  it('computes the same metrics through a subclass metric override', () => {
    const custom = customOnLine([0, 1, 10, 11]);
    const reference = onLine([0, 1, 10, 11]);
    expect(custom.WithinClusterDistance(twoClusters())).toBe(reference.WithinClusterDistance(twoClusters()));
    expect(custom.BetweenClusterDistance(twoClusters())).toBe(reference.BetweenClusterDistance(twoClusters()));
    expect(custom.SilhouetteScore(twoClusters())).toBe(reference.SilhouetteScore(twoClusters()));
  });
});

describe('async clustering', () => {
  it('maps an off-thread K-Means result back to keys with centroids, inertia and iterations', async () => {
    const accelerator = new RecordingClusterAccelerator();
    const service = onLine([0, 1, 10, 11], accelerator);
    seedKMeansPlusPlus();
    const offThread = await service.KMeansClusterAsync(2, 50, 'euclidean', 0.001);
    seedKMeansPlusPlus();
    expect(offThread).toEqual(service.KMeansCluster(2, 50, 'euclidean', 0.001));
    expect(accelerator.Jobs[0]).toMatchObject({ Algorithm: 'kmeans', K: 2, MaxIterations: 50, Tolerance: 0.001, Candidates: null });
  });

  it('falls back to in-process K-Means when the accelerator declines', async () => {
    const service = onLine([0, 1, 10, 11]);
    seedKMeansPlusPlus();
    const result = await service.KMeansClusterAsync(2);
    seedKMeansPlusPlus();
    expect(result).toEqual(service.KMeansCluster(2));
  });

  it('passes only filtered rows to an off-thread DBSCAN', async () => {
    const accelerator = new RecordingClusterAccelerator();
    const service = onLine([0, 1, 2, 3, 4, 5], accelerator);
    const result = await service.DBSCANClusterAsync(0.5, 1, 'euclidean', m => m.group === 0);
    expect(Array.from(accelerator.Jobs[0].Candidates!)).toEqual([0, 2, 4]);
    expect(result).toEqual(service.DBSCANCluster(0.5, 1, 'euclidean', m => m.group === 0));
  });

  it('runs a subclass metric override in-process instead of dispatching it', async () => {
    const custom = customOnLine([0, 1, 10, 11]);
    const accelerator = new RecordingClusterAccelerator();
    const viaAccelerator = new CustomMetricService({ Accelerator: accelerator });
    [0, 1, 10, 11].forEach((x, i) => viaAccelerator.AddVector(`p${i}`, [x, 0], { group: 0 }));
    seedKMeansPlusPlus();
    const kmeans = await viaAccelerator.KMeansClusterAsync(2, 100, 'euclidean');
    seedKMeansPlusPlus();
    expect(kmeans).toEqual(custom.KMeansCluster(2, 100, 'euclidean'));
    expect(await viaAccelerator.DBSCANClusterAsync(0.5, 1)).toEqual(custom.DBSCANCluster(0.5, 1));
    expect(accelerator.Jobs).toHaveLength(0);
  });

  it('validates k and minPoints before dispatching', async () => {
    const accelerator = new RecordingClusterAccelerator();
    const service = onLine([0, 1], accelerator);
    await expect(service.KMeansClusterAsync(3)).rejects.toThrow(/Invalid k: 3/);
    await expect(service.DBSCANClusterAsync(0.5, 0)).rejects.toThrow('MinPoints must be positive');
    expect(accelerator.Jobs).toHaveLength(0);
  });
});

describe('RunClusterJob (the worker-side entry point)', () => {
  function snapshotOf(xs: number[]) {
    const store = new VectorStore<Meta>();
    xs.forEach((x, i) => store.Write(`p${i}`, [x, 0]));
    return store.Snapshot();
  }

  it('applies K-Means defaults when the job leaves them out', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = SimpleVectorService.RunClusterJob({ Snapshot: snapshotOf([0, 1, 2]), Candidates: null, Algorithm: 'kmeans', Metric: 'euclidean' });
    expect(Array.from(result.Clusters.get(0)!)).toEqual([0, 1, 2]);
    expect(result.Outliers).toBeNull();
    expect(result.Centroids?.size).toBe(1);
    expect(result.Iterations).toBeGreaterThan(0);
  });

  it('applies DBSCAN defaults and returns rows, not keys', () => {
    const result = SimpleVectorService.RunClusterJob({
      Snapshot: snapshotOf([0, 0.01, 50]), Candidates: Int32Array.from([0, 1, 2]), Algorithm: 'dbscan', Metric: 'euclidean',
    });
    expect(Array.from(result.Clusters.get(0)!)).toEqual([0, 1]);
    expect(Array.from(result.Outliers!)).toEqual([]);
    expect(result.Iterations).toBeUndefined();
    expect(result.Inertia).toBeUndefined();
  });

  it('wraps an empty view without inventing a dimension count', () => {
    const empty = new VectorStore<Meta>().Snapshot();
    const service = SimpleVectorService.FromRowsView(empty, 'float64', null);
    expect(service.Size).toBe(0);
    expect(service.ExpectedDimensions).toBeNull();
  });
});
