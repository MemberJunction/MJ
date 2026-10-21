/**
 * @fileoverview Numeric kernels behind {@link SimpleVectorService}.
 *
 * Every similarity formula the service exposes lives here exactly once, as a
 * pure function over array-likes with explicit offsets. That lets the same code
 * score a `number[]` passed to the public `CalculateDistance`, a row inside the
 * service's packed `Float32Array`/`Float64Array` store, and a row inside a
 * `SharedArrayBuffer` read by a worker thread.
 *
 * The module has no imports on purpose: it runs unchanged in browsers, in Node,
 * and inside `worker_threads`.
 *
 * **Bit-for-bit compatibility.** Each loop accumulates its terms in the same
 * order as the original per-pair implementations, so a float64 store produces
 * the exact same scores the service always has. Do not unroll or re-associate
 * these loops without accepting that scores move in the last bits.
 *
 * @module @memberjunction/ai-vectors-memory
 */

/**
 * Supported distance/similarity metrics for vector operations
 */
export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan' | 'dotproduct' | 'jaccard' | 'hamming';

/** Any numeric vector the kernels accept: `number[]`, `Float32Array`, `Float64Array`. */
export type NumericVector = ArrayLike<number>;

/** The packed element types a vector store can hold. */
export type VectorArray = Float32Array<ArrayBufferLike> | Float64Array<ArrayBufferLike>;

/**
 * A read-only window onto packed vector rows. Row `r` occupies
 * `Data[r * Dims .. r * Dims + Dims)`. Rows whose `Live` flag is 0 are
 * tombstones and are never scored.
 */
export interface VectorRowsView {
  /** Packed row data, `RowCount * Dims` meaningful elements */
  Data: VectorArray;
  /** Sum of squares of each row, precomputed so cosine needs only a dot product */
  Norms: Float64Array<ArrayBufferLike>;
  /** 1 for a live row, 0 for a removed one */
  Live: Uint8Array<ArrayBufferLike>;
  /** Number of rows written, including tombstones */
  RowCount: number;
  /** Dimensions per row */
  Dims: number;
}

/** What to search for, and how to rank it. */
export interface VectorSearchSpec {
  /** The query, with values already rounded to the store's precision */
  Query: Float64Array<ArrayBufferLike>;
  /** Sum of squares of the query */
  QueryNormSq: number;
  /** Ascending row indexes to consider, or null for every live row in [RowStart, RowEnd) */
  Candidates: Int32Array | null;
  /** First row scanned when Candidates is null (default 0) */
  RowStart?: number;
  /** Row after the last one scanned when Candidates is null (default RowCount) */
  RowEnd?: number;
  Metric: DistanceMetric;
  /** Maximum rows to return, or null to return every row that passes the threshold */
  TopK: number | null;
  /** Minimum score (inclusive), or null for no threshold */
  Threshold: number | null;
}

/**
 * Rows ranked by score, highest first. Equal scores keep ascending row order,
 * which is the insertion order the service has always used to break ties.
 */
export interface ScoredRows {
  Rows: Int32Array;
  Scores: Float64Array;
}

/**
 * Sum of squares of `dims` elements starting at `offset`.
 */
export function SumOfSquares(v: NumericVector, offset: number, dims: number): number {
  let sum = 0;
  for (let i = 0; i < dims; i++) {
    const x = v[offset + i];
    sum += x * x;
  }
  return sum;
}

/**
 * Raw cosine similarity in [-1, 1] from precomputed sums of squares.
 * Returns 0 when either vector is all zeros (a zero vector has no direction).
 */
export function CosineFromNorms(
  a: NumericVector, aOffset: number, aNormSq: number,
  b: NumericVector, bOffset: number, bNormSq: number,
  dims: number
): number {
  let dot = 0;
  for (let i = 0; i < dims; i++) {
    dot += a[aOffset + i] * b[bOffset + i];
  }
  if (aNormSq === 0 || bNormSq === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aNormSq) * Math.sqrt(bNormSq));
}

/** Euclidean distance mapped to a 0-1 similarity: `1 / (1 + distance)`. */
export function EuclideanScore(a: NumericVector, aOffset: number, b: NumericVector, bOffset: number, dims: number): number {
  let sumSquaredDiff = 0;
  for (let i = 0; i < dims; i++) {
    const diff = a[aOffset + i] - b[bOffset + i];
    sumSquaredDiff += diff * diff;
  }
  return 1 / (1 + Math.sqrt(sumSquaredDiff));
}

/** Manhattan (L1) distance mapped to a 0-1 similarity: `1 / (1 + distance)`. */
export function ManhattanScore(a: NumericVector, aOffset: number, b: NumericVector, bOffset: number, dims: number): number {
  let sumAbsDiff = 0;
  for (let i = 0; i < dims; i++) {
    sumAbsDiff += Math.abs(a[aOffset + i] - b[bOffset + i]);
  }
  return 1 / (1 + sumAbsDiff);
}

/** Dot product squashed to 0-1 with `(tanh(dot / sqrt(dims)) + 1) / 2`. */
export function DotProductScore(a: NumericVector, aOffset: number, b: NumericVector, bOffset: number, dims: number): number {
  let dotProduct = 0;
  for (let i = 0; i < dims; i++) {
    dotProduct += a[aOffset + i] * b[bOffset + i];
  }
  const normalized = Math.tanh(dotProduct / Math.sqrt(dims));
  return (normalized + 1) / 2;
}

/** Jaccard similarity treating non-zero elements as set members. Two empty sets score 1. */
export function JaccardScore(a: NumericVector, aOffset: number, b: NumericVector, bOffset: number, dims: number): number {
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < dims; i++) {
    const aPresent = a[aOffset + i] !== 0;
    const bPresent = b[bOffset + i] !== 0;
    if (aPresent && bPresent) {
      intersection++;
    }
    if (aPresent || bPresent) {
      union++;
    }
  }
  return union === 0 ? 1 : intersection / union;
}

/** Hamming distance mapped to a 0-1 similarity: `1 - differences / dims`. */
export function HammingScore(a: NumericVector, aOffset: number, b: NumericVector, bOffset: number, dims: number): number {
  let differences = 0;
  for (let i = 0; i < dims; i++) {
    if (a[aOffset + i] !== b[bOffset + i]) {
      differences++;
    }
  }
  return 1 - (differences / dims);
}

/**
 * The normalized 0-1 similarity for any metric — identical to
 * `SimpleVectorService.CalculateDistance`. Cosine maps [-1, 1] onto [0, 1].
 * The sums of squares are read only by cosine; pass 0 for other metrics.
 *
 * @throws {Error} For an unknown metric
 */
export function MetricScore(
  metric: DistanceMetric,
  a: NumericVector, aOffset: number, aNormSq: number,
  b: NumericVector, bOffset: number, bNormSq: number,
  dims: number
): number {
  switch (metric) {
    case 'cosine':
      return (CosineFromNorms(a, aOffset, aNormSq, b, bOffset, bNormSq, dims) + 1) / 2;
    case 'euclidean':
      return EuclideanScore(a, aOffset, b, bOffset, dims);
    case 'manhattan':
      return ManhattanScore(a, aOffset, b, bOffset, dims);
    case 'dotproduct':
      return DotProductScore(a, aOffset, b, bOffset, dims);
    case 'jaccard':
      return JaccardScore(a, aOffset, b, bOffset, dims);
    case 'hamming':
      return HammingScore(a, aOffset, b, bOffset, dims);
    default:
      throw new Error(`Unknown distance metric: ${metric as string}`);
  }
}

/** True when the metric is one the kernels implement. */
export function IsKnownMetric(metric: string): metric is DistanceMetric {
  return metric === 'cosine' || metric === 'euclidean' || metric === 'manhattan'
    || metric === 'dotproduct' || metric === 'jaccard' || metric === 'hamming';
}

/**
 * Scores rows of a packed store against a query and ranks them.
 *
 * With a numeric `TopK` this keeps a bounded, stable insertion buffer, so the
 * cost is O(rows × dims) with no full sort. With `TopK: null` it returns every
 * row that passes the threshold, fully sorted. NaN scores (only possible from
 * NaN or infinite vector values) are never returned.
 *
 * @throws {Error} For an unknown metric
 */
export function SearchRows(view: VectorRowsView, spec: VectorSearchSpec): ScoredRows {
  if (!IsKnownMetric(spec.Metric)) {
    throw new Error(`Unknown distance metric: ${spec.Metric as string}`);
  }
  const collector = spec.TopK === null ? new AllRowsCollector() : new TopRowsCollector(spec.TopK);
  if (view.Data instanceof Float32Array) {
    scanFloat32Rows(view.Data, view, spec, collector);
  } else {
    scanFloat64Rows(view.Data, view, spec, collector);
  }
  return collector.Result();
}

// ── Row scans ─────────────────────────────────────────────────────────────
//
// scanFloat32Rows and scanFloat64Rows are deliberately identical apart from
// the element type of `data`. V8 specialises a function to the array types it
// has seen; one scan shared by both precisions (and by the `number[]` metric
// methods) turns polymorphic and measured ~2.5x slower once a process holds
// stores of both precisions. Two copies keep each one monomorphic. Cosine,
// euclidean and dot product — the metrics used for embeddings — are inlined;
// the set/categorical metrics go through MetricScore. Keep the two in step.

function scanFloat32Rows(data: Float32Array<ArrayBufferLike>, view: VectorRowsView, spec: VectorSearchSpec, collector: RowsCollector): void {
  const dims = view.Dims;
  const norms = view.Norms;
  const live = view.Live;
  const query = spec.Query;
  const queryNormSq = spec.QueryNormSq;
  const candidates = spec.Candidates;
  const threshold = spec.Threshold;
  const metric = spec.Metric;
  const start = candidates ? 0 : (spec.RowStart ?? 0);
  const end = candidates ? candidates.length : Math.min(spec.RowEnd ?? view.RowCount, view.RowCount);
  for (let i = start; i < end; i++) {
    const row = candidates ? candidates[i] : i;
    if (live[row] !== 1) continue;
    const offset = row * dims;
    let score: number;
    if (metric === 'cosine') {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += query[d] * data[offset + d];
      const rowNormSq = norms[row];
      const cosine = queryNormSq === 0 || rowNormSq === 0 ? 0 : dot / (Math.sqrt(queryNormSq) * Math.sqrt(rowNormSq));
      score = (cosine + 1) / 2;
    } else if (metric === 'euclidean') {
      let sumSquaredDiff = 0;
      for (let d = 0; d < dims; d++) {
        const diff = query[d] - data[offset + d];
        sumSquaredDiff += diff * diff;
      }
      score = 1 / (1 + Math.sqrt(sumSquaredDiff));
    } else if (metric === 'dotproduct') {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += query[d] * data[offset + d];
      score = (Math.tanh(dot / Math.sqrt(dims)) + 1) / 2;
    } else {
      score = MetricScore(metric, query, 0, queryNormSq, data, offset, norms[row], dims);
    }
    if (score !== score) continue; // NaN
    if (threshold !== null && !(score >= threshold)) continue;
    collector.Offer(row, score);
  }
}

function scanFloat64Rows(data: Float64Array<ArrayBufferLike>, view: VectorRowsView, spec: VectorSearchSpec, collector: RowsCollector): void {
  const dims = view.Dims;
  const norms = view.Norms;
  const live = view.Live;
  const query = spec.Query;
  const queryNormSq = spec.QueryNormSq;
  const candidates = spec.Candidates;
  const threshold = spec.Threshold;
  const metric = spec.Metric;
  const start = candidates ? 0 : (spec.RowStart ?? 0);
  const end = candidates ? candidates.length : Math.min(spec.RowEnd ?? view.RowCount, view.RowCount);
  for (let i = start; i < end; i++) {
    const row = candidates ? candidates[i] : i;
    if (live[row] !== 1) continue;
    const offset = row * dims;
    let score: number;
    if (metric === 'cosine') {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += query[d] * data[offset + d];
      const rowNormSq = norms[row];
      const cosine = queryNormSq === 0 || rowNormSq === 0 ? 0 : dot / (Math.sqrt(queryNormSq) * Math.sqrt(rowNormSq));
      score = (cosine + 1) / 2;
    } else if (metric === 'euclidean') {
      let sumSquaredDiff = 0;
      for (let d = 0; d < dims; d++) {
        const diff = query[d] - data[offset + d];
        sumSquaredDiff += diff * diff;
      }
      score = 1 / (1 + Math.sqrt(sumSquaredDiff));
    } else if (metric === 'dotproduct') {
      let dot = 0;
      for (let d = 0; d < dims; d++) dot += query[d] * data[offset + d];
      score = (Math.tanh(dot / Math.sqrt(dims)) + 1) / 2;
    } else {
      score = MetricScore(metric, query, 0, queryNormSq, data, offset, norms[row], dims);
    }
    if (score !== score) continue; // NaN
    if (threshold !== null && !(score >= threshold)) continue;
    collector.Offer(row, score);
  }
}

interface RowsCollector {
  Offer(row: number, score: number): void;
  Result(): ScoredRows;
}

/**
 * Keeps the best `k` rows seen so far, highest score first. A new row only
 * displaces an existing one with a strictly lower score, so among equal
 * scores the earliest row wins — the same result a stable sort would give.
 */
class TopRowsCollector implements RowsCollector {
  private readonly rows: Int32Array;
  private readonly scores: Float64Array;
  private count = 0;

  constructor(private readonly k: number) {
    const size = Math.max(0, Math.trunc(k));
    this.rows = new Int32Array(size);
    this.scores = new Float64Array(size);
  }

  public Offer(row: number, score: number): void {
    const size = this.rows.length;
    if (size === 0) return;
    let position: number;
    if (this.count < size) {
      position = this.count++;
    } else if (score > this.scores[size - 1]) {
      position = size - 1;
    } else {
      return;
    }
    while (position > 0 && this.scores[position - 1] < score) {
      this.scores[position] = this.scores[position - 1];
      this.rows[position] = this.rows[position - 1];
      position--;
    }
    this.scores[position] = score;
    this.rows[position] = row;
  }

  public Result(): ScoredRows {
    return { Rows: this.rows.slice(0, this.count), Scores: this.scores.slice(0, this.count) };
  }
}

/** Collects every offered row, then sorts by score descending, row ascending. */
class AllRowsCollector implements RowsCollector {
  private rows: number[] = [];
  private scores: number[] = [];

  public Offer(row: number, score: number): void {
    this.rows.push(row);
    this.scores.push(score);
  }

  public Result(): ScoredRows {
    const order = this.rows.map((_, i) => i);
    order.sort((a, b) => (this.scores[b] - this.scores[a]) || (this.rows[a] - this.rows[b]));
    const rows = new Int32Array(order.length);
    const scores = new Float64Array(order.length);
    for (let i = 0; i < order.length; i++) {
      rows[i] = this.rows[order[i]];
      scores[i] = this.scores[order[i]];
    }
    return { Rows: rows, Scores: scores };
  }
}

/**
 * Merges several ranked lists (for example, one per worker partition) into
 * one ranked list, keeping at most `topK` rows (`null` keeps all). Ties are
 * broken by ascending row so partitioning never changes the result.
 */
export function MergeScoredRows(parts: ScoredRows[], topK: number | null): ScoredRows {
  const collector: RowsCollector = topK === null ? new AllRowsCollector() : new TopRowsCollector(topK);
  const merged: Array<{ row: number; score: number }> = [];
  for (const part of parts) {
    for (let i = 0; i < part.Rows.length; i++) {
      merged.push({ row: part.Rows[i], score: part.Scores[i] });
    }
  }
  // Offer in ascending row order so the collector's tie-breaking stays row-ordered.
  merged.sort((a, b) => a.row - b.row);
  for (const m of merged) {
    collector.Offer(m.row, m.score);
  }
  return collector.Result();
}
