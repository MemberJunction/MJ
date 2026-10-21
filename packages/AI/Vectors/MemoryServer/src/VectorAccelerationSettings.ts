/**
 * @fileoverview Process-wide tuning for server-side vector acceleration.
 *
 * Defaults are chosen so a stock MJAPI gets the benefit with no
 * configuration. Hosts can adjust them in code with
 * `VectorAccelerationSettings.Instance.Configure({...})`, or for the
 * commonest knobs through environment variables:
 *
 * | Variable | Effect |
 * |---|---|
 * | `MJ_VECTOR_WORKERS` | Worker threads in the pool (`0` disables the pool) |
 * | `MJ_VECTOR_NATIVE` | `0` disables the native (usearch) backend |
 * | `MJ_VECTOR_ANN` | `1` enables approximate (HNSW) search for large cosine indexes |
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { availableParallelism } from 'node:os';
import { BaseSingleton } from '@memberjunction/global';

/** Approximate-nearest-neighbour (HNSW) settings. Off by default — see {@link VectorAccelerationOptions.ANN}. */
export interface VectorANNOptions {
  /** Build HNSW indexes for large cosine stores. Default false. */
  Enabled: boolean;
  /** Live rows a store needs before an HNSW index is built for it. Default 50,000. */
  MinRows: number;
  /** HNSW graph connectivity (edges per node). Default 16. */
  Connectivity: number;
  /** Candidate list size during search; higher trades speed for recall. Default 64. */
  ExpansionSearch: number;
  /** Candidates fetched per requested result, before exact re-ranking and filtering. Default 4. */
  Oversample: number;
  /** Milliseconds of index building per event-loop turn while an index is built in the background. Default 8. */
  BuildSliceMs: number;
}

export interface VectorAccelerationOptions {
  /** Worker threads for off-thread search and clustering. `0` keeps everything in-process. */
  PoolSize: number;
  /**
   * Smallest search, in rows × dimensions, worth sending to a worker. Below
   * this the message round trip costs more than the scan. Default 2,000,000
   * (about 1,300 rows of 1,536-dimension embeddings).
   */
  OffloadMinWork: number;
  /** Rows × dimensions per partition when one search is split across several workers. Default 8,000,000. */
  PartitionWork: number;
  /** Smallest store, in rows, whose clustering is sent to a worker. Default 200. */
  ClusterOffloadMinRows: number;
  /** A worker task running longer than this is abandoned and its worker replaced. Default 120,000 ms. */
  TaskTimeoutMs: number;
  /** Use the native usearch backend when it is installed. Default true. */
  UseNative: boolean;
  /** Smallest unfiltered search, in rows × dimensions, routed to native code. Default 100,000. */
  NativeMinWork: number;
  /**
   * Approximate nearest-neighbour search. Unlike every other path here it can
   * miss true neighbours (scores are still exact), so it is opt-in and only
   * applies to cosine searches over stores of at least `MinRows` rows.
   */
  ANN: VectorANNOptions;
  /** Path to the compiled worker script. Defaults to the one shipped beside this package's dist. */
  WorkerScriptPath?: string;
}

/** Recursive partial, so `Configure({ ANN: { Enabled: true } })` works. */
export type VectorAccelerationOverrides = Partial<Omit<VectorAccelerationOptions, 'ANN'>> & { ANN?: Partial<VectorANNOptions> };

const DEFAULT_POOL_SIZE = Math.max(1, Math.min(4, availableParallelism() - 1));

/** Holds the active {@link VectorAccelerationOptions}. */
export class VectorAccelerationSettings extends BaseSingleton<VectorAccelerationSettings> {
  private options: VectorAccelerationOptions;

  protected constructor() {
    super();
    this.options = applyEnvironment(defaultOptions());
  }

  public static get Instance(): VectorAccelerationSettings {
    return super.getInstance<VectorAccelerationSettings>();
  }

  /** The active options. Treat as read-only; change them with {@link Configure}. */
  public get Options(): Readonly<VectorAccelerationOptions> {
    return this.options;
  }

  /** Overrides some options. Takes effect for work started afterwards. */
  public Configure(overrides: VectorAccelerationOverrides): void {
    this.options = {
      ...this.options,
      ...overrides,
      ANN: { ...this.options.ANN, ...(overrides.ANN ?? {}) },
    };
  }

  /** Restores the defaults (plus environment overrides). Mainly for tests. */
  public Reset(): void {
    this.options = applyEnvironment(defaultOptions());
  }
}

function defaultOptions(): VectorAccelerationOptions {
  return {
    PoolSize: DEFAULT_POOL_SIZE,
    OffloadMinWork: 2_000_000,
    PartitionWork: 8_000_000,
    ClusterOffloadMinRows: 200,
    TaskTimeoutMs: 120_000,
    UseNative: true,
    NativeMinWork: 100_000,
    ANN: {
      Enabled: false,
      MinRows: 50_000,
      Connectivity: 16,
      ExpansionSearch: 64,
      Oversample: 4,
      BuildSliceMs: 8,
    },
  };
}

function applyEnvironment(options: VectorAccelerationOptions): VectorAccelerationOptions {
  const workers = process.env.MJ_VECTOR_WORKERS;
  if (workers !== undefined && workers.trim() !== '' && Number.isFinite(Number(workers))) {
    options.PoolSize = Math.max(0, Math.trunc(Number(workers)));
  }
  if (process.env.MJ_VECTOR_NATIVE === '0') options.UseNative = false;
  if (process.env.MJ_VECTOR_ANN === '1') options.ANN.Enabled = true;
  return options;
}
