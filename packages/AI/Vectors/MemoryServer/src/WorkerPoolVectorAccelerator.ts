/**
 * @fileoverview The server's {@link BaseVectorAccelerator}.
 *
 * Registered through the ClassFactory, so once this package is loaded every
 * `SimpleVectorService` in the process uses it with no code change:
 *
 * - store buffers are `SharedArrayBuffer`s, readable by workers without copying
 * - `FindNearest` (sync) uses the native backend for large unfiltered scans
 * - `FindNearestAsync` sends large scans to the worker pool — split across
 *   workers, each using native code when it applies — so the event loop keeps
 *   serving other requests; small scans stay in-process where a round trip
 *   would cost more than the scan
 * - `KMeansClusterAsync` / `DBSCANClusterAsync` run entirely on a worker
 * - opt-in HNSW serves large cosine searches approximately
 *
 * Any failure (pool disabled, worker crash, native error) degrades to the
 * in-process path and is logged; a search never fails because acceleration
 * did.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { availableParallelism } from 'node:os';
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
  BaseVectorAccelerator,
  MergeScoredRows,
  ScoredRows,
  SearchRows,
  VECTOR_ACCELERATOR_KEY,
  VectorClusterJob,
  VectorClusterJobResult,
  VectorRowsView,
  VectorSearchJob,
  VectorSearchSpec,
} from '@memberjunction/ai-vectors-memory';
import { NativeVectorBackend } from './NativeVectorBackend';
import { VectorAccelerationSettings } from './VectorAccelerationSettings';
import { VectorWorkerPool } from './VectorWorkerPool';
import { IsClusterResponse, IsSearchResponse } from './worker/VectorWorkerProtocol';

@RegisterClass(BaseVectorAccelerator, VECTOR_ACCELERATOR_KEY)
export class WorkerPoolVectorAccelerator extends BaseVectorAccelerator {
  constructor() {
    super();
    if (VectorAccelerationSettings.Instance.Options.UseNative) {
      NativeVectorBackend.Instance.Load();
    }
  }

  /** Shared memory, so workers read stores in place. */
  public override AllocateBuffer(byteLength: number): ArrayBufferLike {
    return typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(byteLength) : new ArrayBuffer(byteLength);
  }

  /** Native code for `FindNearest`: approximate when ANN is on, otherwise a verified exact scan. */
  public override TrySearchSync(job: VectorSearchJob): ScoredRows | null {
    const options = VectorAccelerationSettings.Instance.Options;
    if (!options.UseNative) return null;
    const native = NativeVectorBackend.Instance;
    const approximate = native.SearchApproximate(job);
    if (approximate) return approximate;
    if (workOf(job) < options.NativeMinWork) return null;
    return native.SearchRows(job.Snapshot, job, 0);
  }

  public override async SearchAsync(job: VectorSearchJob): Promise<ScoredRows> {
    const options = VectorAccelerationSettings.Instance.Options;
    if (options.UseNative) {
      const approximate = NativeVectorBackend.Instance.SearchApproximate(job);
      if (approximate) return approximate;
    }
    if (this.shouldOffloadSearch(job)) {
      try {
        return await this.searchOnWorkers(job);
      } catch (e) {
        LogError(`Vector search on worker failed, running in-process: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.TrySearchSync(job) ?? SearchRows(job.Snapshot, job);
  }

  public override async ClusterAsync(job: VectorClusterJob): Promise<VectorClusterJobResult | null> {
    const rows = job.Candidates ? job.Candidates.length : job.Snapshot.LiveCount;
    const options = VectorAccelerationSettings.Instance.Options;
    if (rows < options.ClusterOffloadMinRows || !isShared(job.Snapshot) || !VectorWorkerPool.Instance.IsAvailable) {
      return null;
    }
    try {
      const response = await VectorWorkerPool.Instance.Run({ Kind: 'cluster', Job: job });
      return IsClusterResponse(response) ? response.Result : null;
    } catch (e) {
      LogError(`Vector clustering on worker failed, running in-process: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private shouldOffloadSearch(job: VectorSearchJob): boolean {
    return workOf(job) >= VectorAccelerationSettings.Instance.Options.OffloadMinWork
      && isShared(job.Snapshot)
      && VectorWorkerPool.Instance.IsAvailable;
  }

  /**
   * Runs a search on workers. A search native code can serve goes to one
   * worker whole (native search cannot take a partition — see
   * `NativeVectorBackend.SearchRows`) and is parallelised by usearch's own
   * threads. Anything else is split into JS partitions across workers and
   * the ranked results are merged.
   */
  private async searchOnWorkers(job: VectorSearchJob): Promise<ScoredRows> {
    const options = VectorAccelerationSettings.Instance.Options;
    const native = options.UseNative && NativeVectorBackend.Instance.CanSearch(job, job.Snapshot);
    const nativeThreads = native ? Math.max(1, Math.floor(availableParallelism() / Math.max(1, options.PoolSize))) : 0;
    const partitions = native ? 1 : Math.max(1, Math.min(options.PoolSize, Math.ceil(workOf(job) / options.PartitionWork)));
    const view: VectorRowsView = {
      Data: job.Snapshot.Data,
      Norms: job.Snapshot.Norms,
      Live: job.Snapshot.Live,
      RowCount: job.Snapshot.RowCount,
      Dims: job.Snapshot.Dims,
    };
    const specs = partitionSpecs(job, partitions);
    const responses = await Promise.all(specs.map(spec =>
      VectorWorkerPool.Instance.Run({ Kind: 'search', View: view, Spec: spec, NativeThreads: nativeThreads })
    ));
    const parts: ScoredRows[] = responses.map(response => {
      if (!IsSearchResponse(response)) throw new Error('unexpected vector worker response');
      return { Rows: response.Rows, Scores: response.Scores };
    });
    return parts.length === 1 ? parts[0] : MergeScoredRows(parts, job.TopK);
  }
}

/** Rows × dimensions a search has to score. */
function workOf(job: VectorSearchJob): number {
  const rows = job.Candidates ? job.Candidates.length : job.Snapshot.LiveCount;
  return rows * job.Snapshot.Dims;
}

function isShared(view: VectorRowsView): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
    && view.Data.buffer instanceof SharedArrayBuffer
    && view.Norms.buffer instanceof SharedArrayBuffer
    && view.Live.buffer instanceof SharedArrayBuffer;
}

/**
 * The search spec for each partition: contiguous row ranges for an
 * unfiltered search, or slices of the candidate list for a filtered one. Each carries only what a worker
 * needs — never the store itself.
 */
function partitionSpecs(job: VectorSearchJob, partitions: number): VectorSearchSpec[] {
  const base: VectorSearchSpec = {
    Query: job.Query,
    QueryNormSq: job.QueryNormSq,
    Candidates: null,
    Metric: job.Metric,
    TopK: job.TopK,
    Threshold: job.Threshold,
  };
  const specs: VectorSearchSpec[] = [];
  if (job.Candidates) {
    const size = Math.ceil(job.Candidates.length / partitions);
    for (let start = 0; start < job.Candidates.length; start += size) {
      specs.push({ ...base, Candidates: job.Candidates.slice(start, start + size) });
    }
  } else {
    const rowCount = job.Snapshot.RowCount;
    const size = Math.ceil(rowCount / partitions);
    for (let start = 0; start < rowCount; start += size) {
      specs.push({ ...base, RowStart: start, RowEnd: Math.min(rowCount, start + size) });
    }
  }
  return specs;
}

/** Tree-shaking prevention: call from a module that is always loaded so the registration runs. */
export function LoadWorkerPoolVectorAccelerator(): void {
  // intentionally empty
}
