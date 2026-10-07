/**
 * @fileoverview The seam that lets a host run {@link SimpleVectorService} work
 * somewhere faster than the calling thread.
 *
 * This package is bundled into browsers, so it cannot reference
 * `worker_threads` or native addons. Instead it resolves a
 * {@link BaseVectorAccelerator} through the MJ ClassFactory. The default
 * registered here does everything in-process. A server package registers a
 * subclass (worker pool, native SIMD/HNSW backend) with a higher priority, and
 * every `SimpleVectorService` in that process picks it up with no code change.
 *
 * **The search contract is "candidates, then exact re-rank".** An accelerator
 * returns rows it believes are the best matches — exact, approximate, or a
 * superset — and the service re-scores those rows against its live store with
 * the shared kernels, applies the threshold and ranks them. Approximate
 * backends can therefore only ever lose recall, never return a wrong score.
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { BaseSingleton, MJGlobal, RegisterClass } from '@memberjunction/global';
import { DistanceMetric, ScoredRows, SearchRows, VectorSearchSpec } from './VectorKernels';
import { VectorStoreSnapshot } from './VectorStore';

/** ClassFactory key every accelerator registers under. */
export const VECTOR_ACCELERATOR_KEY = 'Default';

/**
 * Lets an accelerator keep a derived index (for example a native ANN graph) in
 * step with a store between searches. Only valid on the thread that owns the
 * store; never post it to a worker.
 */
export interface VectorStoreChangeSource {
  /** See `VectorStore.ChangedRowsSince` */
  ChangedRowsSince(version: number, generation: number): Int32Array | null;
}

/** A nearest-neighbour search over a store snapshot. */
export interface VectorSearchJob extends VectorSearchSpec {
  Snapshot: VectorStoreSnapshot;
  /** The live store, for accelerators that maintain derived indexes */
  Source?: VectorStoreChangeSource;
}

export type VectorClusterAlgorithm = 'kmeans' | 'dbscan';

/** A clustering run over a store snapshot (optionally a subset of its rows). */
export interface VectorClusterJob {
  Snapshot: VectorStoreSnapshot;
  /** Ascending rows to cluster, or null for every live row */
  Candidates: Int32Array | null;
  Algorithm: VectorClusterAlgorithm;
  Metric: DistanceMetric;
  /** K-Means: number of clusters */
  K?: number;
  /** K-Means: iteration cap */
  MaxIterations?: number;
  /** K-Means: convergence tolerance */
  Tolerance?: number;
  /** DBSCAN: neighbourhood radius (0-1, exclusive) */
  Epsilon?: number;
  /** DBSCAN: minimum neighbours for a core point */
  MinPoints?: number;
}

/** A clustering result expressed in snapshot rows rather than keys. */
export interface VectorClusterJobResult {
  Clusters: Map<number, Int32Array>;
  Centroids: Map<number, number[]> | null;
  Outliers: Int32Array | null;
  Iterations?: number;
  Inertia?: number;
  SilhouetteScore?: number;
}

/**
 * In-process accelerator. Subclass it and register with
 * `@RegisterClass(BaseVectorAccelerator, VECTOR_ACCELERATOR_KEY)` from a
 * package that loads after this one to take over vector work process-wide.
 */
@RegisterClass(BaseVectorAccelerator, VECTOR_ACCELERATOR_KEY)
export class BaseVectorAccelerator {
  /**
   * Allocates memory for store buffers. Override to return a
   * `SharedArrayBuffer` so other threads can read stores without copying.
   */
  public AllocateBuffer(byteLength: number): ArrayBufferLike {
    return new ArrayBuffer(byteLength);
  }

  /**
   * A synchronous fast path used by `FindNearest`, for backends that are fast
   * enough to run on the calling thread (native SIMD). Return null to let the
   * service run its own kernel.
   */
  public TrySearchSync(_job: VectorSearchJob): ScoredRows | null {
    return null;
  }

  /**
   * Runs a search for `FindNearestAsync`, possibly off-thread. The result may
   * be approximate or a superset — the service re-ranks it exactly. With
   * `TopK: null` it must include every row that passes the threshold.
   */
  public SearchAsync(job: VectorSearchJob): Promise<ScoredRows> {
    return Promise.resolve(SearchRows(job.Snapshot, job));
  }

  /**
   * Runs clustering off-thread when worthwhile. Resolve to null to have the
   * service run it in-process instead.
   */
  public ClusterAsync(_job: VectorClusterJob): Promise<VectorClusterJobResult | null> {
    return Promise.resolve(null);
  }
}

/**
 * Resolves the highest-priority registered accelerator, re-resolving if a
 * new registration appears (packages can load after the first lookup).
 */
export class VectorAcceleratorResolver extends BaseSingleton<VectorAcceleratorResolver> {
  private current: BaseVectorAccelerator | null = null;
  private currentClass: unknown = null;

  protected constructor() {
    super();
  }

  public static get Instance(): VectorAcceleratorResolver {
    return super.getInstance<VectorAcceleratorResolver>();
  }

  /** The accelerator vector services in this process should use. */
  public get Current(): BaseVectorAccelerator {
    const factory = MJGlobal.Instance.ClassFactory;
    const registration = factory.GetRegistration(BaseVectorAccelerator, VECTOR_ACCELERATOR_KEY);
    const resolvedClass = registration?.SubClass ?? BaseVectorAccelerator;
    if (!this.current || this.currentClass !== resolvedClass) {
      this.current = factory.CreateInstance<BaseVectorAccelerator>(BaseVectorAccelerator, VECTOR_ACCELERATOR_KEY)
        ?? new BaseVectorAccelerator();
      this.currentClass = resolvedClass;
    }
    return this.current;
  }
}
