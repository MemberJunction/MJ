/**
 * @fileoverview Optional native (usearch) execution for vector search.
 *
 * `usearch` is an optional dependency: prebuilt SIMD binaries for Linux,
 * macOS and Windows that are several times faster than the JS kernels. When it
 * is not installed, or fails to load on a platform, every method here reports
 * "not handled" and callers use the JS kernels — nothing else changes.
 *
 * Two capabilities:
 *
 * 1. **Exact search** (`SearchRows`) over a store's rows.
 *    The native result is only a candidate list: candidates are re-scored
 *    with the JS kernels and the result is accepted only when it provably
 *    contains the true top-K (no row it skipped could tie or beat the K-th).
 *    Otherwise it returns null and the caller scans in JS. Results are
 *    therefore identical to the JS path.
 * 2. **Approximate search** (`SearchApproximate`, opt-in) through an HNSW
 *    index per large store, built in the background in short time slices and
 *    kept current from the store's change log.
 *
 * One instance per thread: the worker threads each load their own copy.
 *
 * @module @memberjunction/ai-vectors-memory-server
 */

import { createRequire } from 'node:module';
import { BaseSingleton } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import {
  DistanceMetric,
  MetricScore,
  ScoredRows,
  VectorRowsView,
  VectorSearchJob,
  VectorSearchSpec,
  VectorStoreChangeSource,
  VectorStoreSnapshot,
} from '@memberjunction/ai-vectors-memory';
import type { Index as UsearchIndex, MetricKind as UsearchMetricKind } from 'usearch';
import { VectorAccelerationSettings } from './VectorAccelerationSettings';

type UsearchModule = typeof import('usearch');

/**
 * How far a native score may drift from the exact JS score (float32 SIMD
 * versus float64 accumulation), on the service's normalized 0-1 scale.
 * Generous on purpose: it only decides when to fall back to an exact scan.
 */
const SCORE_TOLERANCE = 1e-4;
/** Extra native candidates fetched beyond K, so the exactness check rarely fails. */
const MIN_OVERSAMPLE = 16;
/** More pending row changes than this rebuilds an ANN index instead of patching it on the query path. */
const MAX_INCREMENTAL_ANN_CHANGES = 2048;
/** ANN indexes kept at once (least recently used are dropped). */
const MAX_ANN_INDEXES = 8;
/** Rows added to an ANN index per native call while building. */
const ANN_BUILD_CHUNK_ROWS = 256;

interface AnnIndexState {
  Index: UsearchIndex;
  Dims: number;
  Generation: number;
  /** Store version the index reflects */
  Version: number;
  Ready: boolean;
  LastUsed: number;
}

export class NativeVectorBackend extends BaseSingleton<NativeVectorBackend> {
  private module: UsearchModule | null = null;
  private loadAttempted = false;
  private annIndexes = new Map<number, AnnIndexState>();
  private annBuilds = new Set<number>();

  protected constructor() {
    super();
  }

  public static get Instance(): NativeVectorBackend {
    return super.getInstance<NativeVectorBackend>();
  }

  /** True once usearch has loaded on this thread. */
  public get IsAvailable(): boolean {
    return this.module !== null;
  }

  /**
   * Loads usearch once (later calls return the first result). Returns false —
   * and logs why — when it is not installed or cannot load on this platform.
   *
   * Loaded through `require` rather than `import()`: usearch's ESM build
   * locates its native binary by stack inspection, which yields a `file://`
   * URL that its directory walk cannot handle (it recurses until the stack
   * overflows). The CommonJS build uses `__dirname` and loads reliably. It is
   * resolved at runtime because the dependency is optional — a static import
   * would make this package fail to load wherever the binary is missing.
   */
  public Load(): boolean {
    if (this.loadAttempted) return this.module !== null;
    this.loadAttempted = true;
    try {
      this.module = this.RequireUsearch();
    } catch (e) {
      LogStatus(`Vector acceleration: native usearch backend unavailable, using JS kernels (${e instanceof Error ? e.message : String(e)})`);
    }
    return this.module !== null;
  }

  /** Resolves the usearch module. Throws when it is not installed or its binary cannot load. */
  protected RequireUsearch(): UsearchModule {
    const requireFromHere = createRequire(import.meta.url);
    return requireFromHere('usearch') as UsearchModule;
  }

  /** True when exact native search can serve this job (synchronous check). */
  public CanSearch(spec: VectorSearchSpec, view: VectorRowsView): boolean {
    return this.module !== null
      && spec.Candidates === null
      && spec.TopK !== null && spec.TopK > 0
      && this.metricKind(spec.Metric) !== null
      && !(spec.Metric === 'cosine' && spec.QueryNormSq === 0)
      && view.Dims > 0;
  }

  /**
   * Exact top-K over every row of the view, or null when native search does
   * not apply or could not prove its candidates complete — the caller then
   * scans in JS.
   *
   * Always the whole view from row 0: usearch reads a typed array from the
   * start of its underlying buffer and ignores `byteOffset`, so a subarray
   * (a partition, or a row used as the query) would silently be searched as
   * the wrong memory. Inputs that start part-way into a buffer are refused.
   *
   * @param threads usearch threads (0 = all cores, 1 = this thread only)
   */
  public SearchRows(view: VectorRowsView, spec: VectorSearchSpec, threads: number): ScoredRows | null {
    if (!this.CanSearch(spec, view) || view.RowCount === 0 || view.Data.byteOffset !== 0) return null;
    try {
      return this.searchExact(view, spec, threads);
    } catch (e) {
      LogError(`Vector acceleration: native exact search failed, falling back to JS: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private searchExact(view: VectorRowsView, spec: VectorSearchSpec, threads: number): ScoredRows | null {
    const mod = this.module!;
    const dims = view.Dims;
    const topK = spec.TopK!;
    const rowCount = view.RowCount;
    const count = Math.min(rowCount, topK + Math.max(MIN_OVERSAMPLE, topK) + (rowCount - this.liveRowsIn(view)));
    // Offset 0 by construction (checked above), so the subarray only trims the unused tail.
    const dataset = view.Data.subarray(0, rowCount * dims);
    // A fresh array: the query must not be a view part-way into a buffer either.
    const query = view.Data instanceof Float32Array ? Float32Array.from(spec.Query) : Float64Array.from(spec.Query);
    // One query vector, so the result holds a single match list.
    const keys = mod.exactSearch(dataset, query, dims, count, this.metricKind(spec.Metric)!, threads).keys;
    const rows: number[] = [];
    for (let i = 0; i < keys.length; i++) rows.push(Number(keys[i]));
    return this.rankVerified(view, spec, rows, keys.length < rowCount);
  }

  /**
   * Re-scores native candidates exactly and accepts them only when no row
   * outside the candidate list can belong in the result.
   *
   * @param partial True when native returned fewer rows than it searched
   */
  private rankVerified(view: VectorRowsView, spec: VectorSearchSpec, candidateRows: number[], partial: boolean): ScoredRows | null {
    const topK = spec.TopK!;
    const scored: Array<{ Row: number; Score: number }> = [];
    let lowestCandidateScore = Infinity;
    for (const row of candidateRows) {
      if (view.Live[row] !== 1) continue;
      const score = MetricScore(spec.Metric, spec.Query, 0, spec.QueryNormSq, view.Data, row * view.Dims, view.Norms[row], view.Dims);
      if (score !== score) return null; // NaN — let the JS path apply its own rules
      lowestCandidateScore = Math.min(lowestCandidateScore, score);
      if (spec.Threshold !== null && !(score >= spec.Threshold)) continue;
      scored.push({ Row: row, Score: score });
    }
    scored.sort((a, b) => (b.Score - a.Score) || (a.Row - b.Row));
    const result = scored.slice(0, topK);

    if (partial) {
      // Every unreturned row scored natively no better than the worst candidate,
      // so exactly at most `lowestCandidateScore + 2 * tolerance`. It is safely
      // excluded only if that is strictly below the bar it would have to clear.
      const bar = result.length >= topK ? result[topK - 1].Score : spec.Threshold;
      if (bar === null || !(lowestCandidateScore + 2 * SCORE_TOLERANCE < bar)) return null;
    }
    return {
      Rows: Int32Array.from(result, r => r.Row),
      Scores: Float64Array.from(result, r => r.Score),
    };
  }

  private liveRowsIn(view: VectorRowsView): number {
    let live = 0;
    for (let row = 0; row < view.RowCount; row++) {
      if (view.Live[row] === 1) live++;
    }
    return live;
  }

  private metricKind(metric: DistanceMetric): UsearchMetricKind | null {
    if (!this.module) return null;
    switch (metric) {
      case 'cosine': return this.module.MetricKind.Cos;
      case 'euclidean': return this.module.MetricKind.L2sq;
      case 'dotproduct': return this.module.MetricKind.IP;
      default: return null;
    }
  }

  // ── Approximate (HNSW) search ──────────────────────────────────────────

  /** True when the HNSW index for a store has finished building. */
  public IsAnnReady(storeID: number): boolean {
    return this.annIndexes.get(storeID)?.Ready === true;
  }

  /**
   * Approximate top-K through the store's HNSW index, with exact scores.
   * Returns null when ANN does not apply, the index is still being built, or
   * too few candidates survived filtering — the caller then searches exactly.
   * Starts a background build the first time a large store is searched.
   */
  public SearchApproximate(job: VectorSearchJob): ScoredRows | null {
    const ann = VectorAccelerationSettings.Instance.Options.ANN;
    const snapshot = job.Snapshot;
    if (!this.module || !ann.Enabled || job.Metric !== 'cosine' || job.TopK === null || job.TopK <= 0) return null;
    if (job.QueryNormSq === 0 || !job.Source || snapshot.LiveCount < ann.MinRows) return null;

    const state = this.annIndexes.get(snapshot.StoreID);
    if (!state || state.Generation !== snapshot.Generation || state.Dims !== snapshot.Dims) {
      this.startAnnBuild(snapshot);
      return null;
    }
    if (!state.Ready) return null;
    if (!this.catchUp(state, snapshot, job.Source)) return null;
    state.LastUsed = Date.now();
    return this.searchAnn(state, job, ann.Oversample);
  }

  private searchAnn(state: AnnIndexState, job: VectorSearchJob, oversample: number): ScoredRows | null {
    const topK = job.TopK!;
    const live = job.Snapshot.LiveCount;
    const k = Math.min(live, topK * oversample + MIN_OVERSAMPLE);
    const keys = state.Index.search(Float32Array.from(job.Query), k, 0).keys;
    const allowed = job.Candidates ? new Set(job.Candidates) : null;
    const rows: number[] = [];
    for (let i = 0; i < keys.length; i++) {
      const row = Number(keys[i]);
      if (!allowed || allowed.has(row)) rows.push(row);
    }
    // Approximate by design, so no completeness proof — but if filtering left
    // fewer than K rows while more were available, an exact scan does better.
    const ranked = this.rankUnverified(job.Snapshot, job, rows, topK);
    if (ranked.Rows.length < topK && k < live) return null;
    return ranked;
  }

  private rankUnverified(view: VectorRowsView, spec: VectorSearchSpec, rows: number[], topK: number): ScoredRows {
    const scored: Array<{ Row: number; Score: number }> = [];
    for (const row of rows) {
      if (view.Live[row] !== 1) continue;
      const score = MetricScore(spec.Metric, spec.Query, 0, spec.QueryNormSq, view.Data, row * view.Dims, view.Norms[row], view.Dims);
      if (score !== score || (spec.Threshold !== null && !(score >= spec.Threshold))) continue;
      scored.push({ Row: row, Score: score });
    }
    scored.sort((a, b) => (b.Score - a.Score) || (a.Row - b.Row));
    const result = scored.slice(0, topK);
    return { Rows: Int32Array.from(result, r => r.Row), Scores: Float64Array.from(result, r => r.Score) };
  }

  /** Applies store changes made since the index was last synced. False means it is being rebuilt. */
  private catchUp(state: AnnIndexState, snapshot: VectorStoreSnapshot, source: VectorStoreChangeSource): boolean {
    if (state.Version === snapshot.Version) return true;
    const changed = source.ChangedRowsSince(state.Version, state.Generation);
    if (!changed || changed.length > MAX_INCREMENTAL_ANN_CHANGES) {
      this.annIndexes.delete(snapshot.StoreID);
      this.startAnnBuild(snapshot);
      return false;
    }
    const unique = Array.from(new Set(changed));
    for (const row of unique) {
      const key = BigInt(row);
      if (state.Index.contains(key) === true) state.Index.remove(key);
    }
    const liveRows = unique.filter(row => snapshot.Live[row] === 1);
    if (liveRows.length > 0) this.addRows(state.Index, snapshot, liveRows);
    state.Version = snapshot.Version;
    return true;
  }

  /**
   * Builds an HNSW index from a snapshot in time slices, so the event loop is
   * never blocked for more than `BuildSliceMs`. Changes made while it builds
   * are applied from the change log on the first search after it is ready.
   */
  private startAnnBuild(snapshot: VectorStoreSnapshot): void {
    if (this.annBuilds.has(snapshot.StoreID) || !this.module) return;
    const ann = VectorAccelerationSettings.Instance.Options.ANN;
    this.evictAnnIndexes();
    const state: AnnIndexState = {
      Index: new this.module.Index({
        dimensions: snapshot.Dims,
        metric: this.module.MetricKind.Cos,
        quantization: this.module.ScalarKind.F32,
        connectivity: ann.Connectivity,
        expansion_add: 0,
        expansion_search: ann.ExpansionSearch,
        multi: false,
      }),
      Dims: snapshot.Dims,
      Generation: snapshot.Generation,
      Version: snapshot.Version,
      Ready: false,
      LastUsed: Date.now(),
    };
    this.annIndexes.set(snapshot.StoreID, state);
    this.annBuilds.add(snapshot.StoreID);
    LogStatus(`Vector acceleration: building HNSW index for ${snapshot.LiveCount} vectors in the background`);
    this.buildSlice(state, snapshot, 0);
  }

  private buildSlice(state: AnnIndexState, snapshot: VectorStoreSnapshot, startRow: number): void {
    const sliceMs = VectorAccelerationSettings.Instance.Options.ANN.BuildSliceMs;
    const sliceStart = Date.now();
    let row = startRow;
    try {
      // At least one chunk per slice, so a build always progresses (even with BuildSliceMs 0).
      do {
        const end = Math.min(snapshot.RowCount, row + ANN_BUILD_CHUNK_ROWS);
        const liveRows: number[] = [];
        for (let r = row; r < end; r++) if (snapshot.Live[r] === 1) liveRows.push(r);
        if (liveRows.length > 0) this.addRows(state.Index, snapshot, liveRows);
        row = end;
      } while (row < snapshot.RowCount && Date.now() - sliceStart < sliceMs);
    } catch (e) {
      LogError(`Vector acceleration: HNSW build failed, staying on exact search: ${e instanceof Error ? e.message : String(e)}`);
      this.annBuilds.delete(snapshot.StoreID);
      this.annIndexes.delete(snapshot.StoreID);
      return;
    }
    if (row < snapshot.RowCount) {
      setImmediate(() => this.buildSlice(state, snapshot, row));
      return;
    }
    state.Ready = true;
    this.annBuilds.delete(snapshot.StoreID);
    LogStatus(`Vector acceleration: HNSW index ready (${state.Index.size()} vectors)`);
  }

  private addRows(index: UsearchIndex, view: VectorRowsView, rows: number[]): void {
    const dims = view.Dims;
    const keys = new BigUint64Array(rows.length);
    const vectors = new Float32Array(rows.length * dims);
    rows.forEach((row, i) => {
      keys[i] = BigInt(row);
      vectors.set(view.Data.subarray(row * dims, (row + 1) * dims), i * dims);
    });
    index.add(keys, vectors, 0);
  }

  private evictAnnIndexes(): void {
    while (this.annIndexes.size >= MAX_ANN_INDEXES) {
      let oldest: number | null = null;
      let oldestUsed = Infinity;
      this.annIndexes.forEach((state, id) => {
        if (!this.annBuilds.has(id) && state.LastUsed < oldestUsed) {
          oldest = id;
          oldestUsed = state.LastUsed;
        }
      });
      if (oldest === null) return;
      this.annIndexes.delete(oldest);
    }
  }
}
