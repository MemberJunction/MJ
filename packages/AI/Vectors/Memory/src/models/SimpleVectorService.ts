import { LogError } from '@memberjunction/core';
import {
  CosineFromNorms,
  DistanceMetric,
  DotProductScore,
  EuclideanScore,
  HammingScore,
  IsKnownMetric,
  JaccardScore,
  ManhattanScore,
  MetricScore,
  NumericVector,
  ScoredRows,
  SearchRows,
  SumOfSquares,
  VectorArray,
  VectorRowsView,
  VectorSearchSpec,
} from './VectorKernels';
import { VectorPrecision, VectorStore } from './VectorStore';
import {
  BaseVectorAccelerator,
  VectorAcceleratorResolver,
  VectorClusterJob,
  VectorClusterJobResult,
  VectorSearchJob,
} from './VectorAccelerator';

// Kept exported from this module too: callers have long imported it from here.
export type { DistanceMetric } from './VectorKernels';

/**
 * Construction options for {@link SimpleVectorService}.
 */
export interface SimpleVectorServiceOptions {
  /**
   * Element precision of the packed store. `'float64'` (the default) keeps
   * every value and score exactly as given. `'float32'` halves memory and is
   * the right choice for model embeddings, which are float32 at the source;
   * scores then differ from float64 only in the 7th significant digit.
   */
  Precision?: VectorPrecision;
  /**
   * Accelerator to use instead of the process-wide one resolved through the
   * ClassFactory. Mainly for tests and for callers that must stay in-process.
   */
  Accelerator?: BaseVectorAccelerator;
}

/** A validated search, ready for the kernel or an accelerator. */
interface SearchPlan<TMetadata> {
  Mode: 'kernel' | 'custom';
  QueryVector: number[];
  /** The caller's topK, applied with `Array.slice` semantics */
  TopK: number;
  Metric: DistanceMetric;
  Threshold: number | null;
  Filter: ((metadata: TMetadata) => boolean) | undefined;
  /** Row→key mapping when the job was dispatched (survives compaction) */
  KeysAtDispatch: ReadonlyArray<string | null>;
  VersionAtDispatch: number;
  Job: VectorSearchJob;
}

interface RankedHit {
  Row: number;
  Score: number;
}

/** A K-Means centroid with its cached sum of squares. */
interface Centroid {
  Values: Float64Array;
  NormSq: number;
}

/** Scoring closures bound to one metric and one store view. */
interface MetricScorer {
  RowVsCentroid(row: number, centroid: Centroid): number;
  RowVsRow(a: number, b: number): number;
  EuclideanBetween(a: Centroid, b: Centroid): number;
}

/**
 * Result of clustering operations
 */
export interface ClusterResult<TMetadata = Record<string, unknown>> {
  /** Map of cluster ID to array of vector keys in that cluster */
  clusters: Map<number, string[]>;
  /** Map of cluster ID to centroid vector (for K-means) */
  centroids?: Map<number, number[]>;
  /** Array of vector keys identified as outliers (for DBSCAN) */
  outliers?: string[];
  /** Metadata about the clustering operation */
  metadata?: {
    /** Distance metric used */
    metric: DistanceMetric;
    /** Number of iterations until convergence */
    iterations?: number;
    /** Sum of squared distances to centroids (for K-means) */
    inertia?: number;
    /** Silhouette score (-1 to 1, higher is better) */
    silhouetteScore?: number;
  };
}

/**
 * Represents a vector entry with a unique key and associated embedding
 */
/**
 * The values of a vector supplied to the service. A typed array is copied into the store just like
 * a `number[]` — passing the `Float32Array` that `Base64ToFloat32Vector` (from
 * `@memberjunction/global`) decodes from a binary embedding column avoids building an intermediate
 * `number[]`.
 */
export type VectorValues = number[] | Float32Array | Float64Array;

/**
 * A vector to load into the service: like {@link VectorEntry}, but the values may be a typed array.
 */
export interface VectorInputEntry<TMetadata = Record<string, unknown>> {
  /** User-defined unique identifier for the vector */
  key: string;
  /** The embedding values; copied into the store */
  vector: VectorValues;
  /** Optional metadata associated with the vector */
  metadata?: TMetadata;
}

export interface VectorEntry<TMetadata = Record<string, unknown>> {
  /** User-defined unique identifier for the vector */
  key: string;
  /** The embedding/vector as an array of numbers */
  vector: number[];
  /** Optional metadata associated with the vector */
  metadata?: TMetadata;
}

/**
 * Search result returned from vector similarity operations
 */
export interface VectorSearchResult<TMetadata = Record<string, unknown>> {
  /** The unique key of the matched vector */
  key: string;
  /** Similarity score (0-1 for cosine similarity, where 1 is most similar) */
  score: number;
  /** Optional metadata associated with the matched vector */
  metadata?: TMetadata;
}

/**
 * SimpleVectorService provides in-memory vector similarity search capabilities.
 * This service is storage-agnostic and allows developers to manage their own vector persistence.
 * 
 * @example
 * ```typescript
 * // Create service instance
 * const vectorService = new SimpleVectorService();
 * 
 * // Load vectors from your data source
 * const vectors = new Map<string, number[]>();
 * vectors.set('item1', [0.1, 0.2, 0.3]);
 * vectors.set('item2', [0.4, 0.5, 0.6]);
 * vectorService.LoadVectors(vectors);
 * 
 * // Find similar items
 * const queryVector = [0.15, 0.25, 0.35];
 * const results = vectorService.FindNearest(queryVector, 5);
 * ```
 * 
 * @class
 * @public
 */
export class SimpleVectorService<TMetadata = Record<string, unknown>> {
  private store: VectorStore<TMetadata>;
  private expectedDimensions: number | null = null;
  private readonly explicitAccelerator: BaseVectorAccelerator | undefined;

  /**
   * @param {SimpleVectorServiceOptions} [options] - Storage precision and an optional explicit accelerator
   */
  constructor(options?: SimpleVectorServiceOptions) {
    this.explicitAccelerator = options?.Accelerator;
    // Resolve the allocator lazily: buffers are allocated on first write, by
    // which time a server package may have registered a shared-memory accelerator.
    this.store = new VectorStore<TMetadata>(options?.Precision ?? 'float64', (bytes) => this.accelerator.AllocateBuffer(bytes));
  }

  /**
   * Builds a read-only service over packed rows produced elsewhere — typically
   * shared memory a worker thread received. Each row in `candidates` (or every
   * live row) is keyed by `String(row)`, so results map straight back to rows.
   */
  public static FromRowsView<T = Record<string, unknown>>(
    view: VectorRowsView,
    precision: VectorPrecision,
    candidates: Int32Array | null
  ): SimpleVectorService<T> {
    const service = new SimpleVectorService<T>({ Precision: precision, Accelerator: new BaseVectorAccelerator() });
    service.store = VectorStore.Adopt<T>(view, precision, candidates);
    service.expectedDimensions = view.Dims > 0 ? view.Dims : null;
    return service;
  }

  /**
   * Runs a clustering job in-process and returns it in rows. This is what a
   * worker thread calls; it reuses the exact clustering code the service runs
   * on the calling thread.
   */
  public static RunClusterJob(job: VectorClusterJob): VectorClusterJobResult {
    const service = SimpleVectorService.FromRowsView(job.Snapshot, job.Snapshot.Precision, job.Candidates);
    const result = job.Algorithm === 'kmeans'
      ? service.KMeansCluster(job.K ?? 1, job.MaxIterations ?? 100, job.Metric, job.Tolerance ?? 0.0001)
      : service.DBSCANCluster(job.Epsilon ?? 0.1, job.MinPoints ?? 1, job.Metric);
    return SimpleVectorService.clusterResultToRows(result);
  }

  /** Process-unique identity of this service's storage, for diagnostics and accelerator caches. */
  public get StoreID(): number {
    return this.store.StoreID;
  }

  /** The storage precision chosen at construction. */
  public get Precision(): VectorPrecision {
    return this.store.Precision;
  }

  /**
   * Pre-sizes storage for `additionalVectors` more vectors of `dimensions`
   * each, so a loader adding rows one at a time allocates once instead of
   * growing repeatedly. Optional; `LoadVectors` does this automatically.
   *
   * @throws {Error} If `dimensions` conflicts with vectors already loaded
   */
  public ReserveCapacity(additionalVectors: number, dimensions: number): void {
    if (additionalVectors <= 0 || dimensions <= 0) return;
    this.validateAndSetDimensionCount(dimensions);
    this.store.Reserve(additionalVectors, dimensions);
  }

  /**
   * Loads vectors into memory. Can accept either an array of VectorEntry objects
   * or a Map where keys are identifiers and values are vector arrays.
   * 
   * @param {VectorInputEntry<TMetadata>[] | Map<string, VectorValues>} entries - The vectors to load; values may be `number[]` or a typed array
   * @throws {Error} If entries is null or undefined
   * 
   * @example
   * ```typescript
   * // Load from array
   * service.LoadVectors([
   *   { key: 'doc1', vector: [0.1, 0.2], metadata: { title: 'Document 1' } },
   *   { key: 'doc2', vector: [0.3, 0.4], metadata: { title: 'Document 2' } }
   * ]);
   * 
   * // Load from Map
   * const vectorMap = new Map();
   * vectorMap.set('doc1', [0.1, 0.2]);
   * vectorMap.set('doc2', [0.3, 0.4]);
   * service.LoadVectors(vectorMap);
   * ```
   * 
   * @public
   * @method
   */
  public LoadVectors(entries: VectorInputEntry<TMetadata>[] | Map<string, VectorValues>): void {
    if (!entries) {
      throw new Error('Entries cannot be null or undefined');
    }

    const incoming = entries instanceof Map ? entries.size : entries.length;
    const firstVector = entries instanceof Map ? entries.values().next().value : entries[0]?.vector;
    if (incoming > 0 && firstVector) {
      // One allocation for the whole batch instead of repeated growth.
      this.validateAndSetDimensions(firstVector);
      this.store.Reserve(incoming, firstVector.length);
    }

    if (entries instanceof Map) {
      entries.forEach((vector, key) => {
        this.validateAndSetDimensions(vector);
        this.store.SetMetadata(this.store.Write(key, vector), undefined);
      });
    } else {
      entries.forEach(entry => {
        this.validateAndSetDimensions(entry.vector);
        this.store.SetMetadata(this.store.Write(entry.key, entry.vector), entry.metadata);
      });
    }
  }
  
  /**
   * Adds or updates a single vector in the service
   * 
   * @param {string} key - The unique identifier for the vector
   * @param {VectorValues} vector - The vector/embedding values (`number[]` or a typed array; copied)
   * @param {TMetadata} metadata - Optional metadata to associate with the vector
   * @throws {Error} If key is null/undefined, or if vector is invalid
   * 
   * @example
   * ```typescript
   * service.AddVector('product123', [0.1, 0.2, 0.3], {
   *   name: 'Product Name',
   *   category: 'Electronics'
   * });
   * ```
   * 
   * @public
   * @method
   */
  public AddVector(key: string, vector: VectorValues, metadata?: TMetadata): void {
    if (!key) {
      throw new Error('Key cannot be null or undefined');
    }
    if (!vector || vector.length === 0) {
      throw new Error('Vector cannot be null, undefined, or empty');
    }

    this.validateAndSetDimensions(vector);
    this.store.SetMetadata(this.store.Write(key, vector), metadata);
  }
  
  /**
   * Finds the K nearest neighbors to a query vector using the specified similarity metric
   *
   * @param {number[]} queryVector - The vector to search for similar items
   * @param {number} [topK=10] - Number of nearest neighbors to return
   * @param {number} [threshold] - Optional minimum similarity threshold (0-1)
   * @param {DistanceMetric} [metric='cosine'] - The distance metric to use
   * @param {(metadata: TMetadata) => boolean} [filter] - Optional filter to pre-filter vectors by metadata before similarity calculation
   * @returns {VectorSearchResult<TMetadata>[]} Array of search results sorted by similarity (highest first)
   * @throws {Error} If queryVector is null/undefined or empty
   *
   * @example
   * ```typescript
   * // Default cosine similarity
   * const nearestItems = service.FindNearest(queryEmbedding, 5);
   *
   * // Using Euclidean distance for numeric features
   * const similarProducts = service.FindNearest(productFeatures, 10, undefined, 'euclidean');
   *
   * // With threshold - only return items with similarity > 0.7
   * const highSimilarity = service.FindNearest(queryVector, 10, 0.7, 'cosine');
   *
   * // Using Jaccard for categorical data
   * const similarUsers = service.FindNearest(userPreferences, 5, undefined, 'jaccard');
   *
   * // Filter by metadata before searching (efficient pre-filtering)
   * const agentNotes = service.FindNearest(
   *   queryVector,
   *   5,
   *   0.5,
   *   'cosine',
   *   (metadata) => metadata.agentId === 'agent-123'
   * );
   * ```
   *
   * @public
   * @method
   */
  public FindNearest(
    queryVector: number[],
    topK: number = 10,
    threshold?: number,
    metric: DistanceMetric = 'cosine',
    filter?: (metadata: TMetadata) => boolean
  ): VectorSearchResult<TMetadata>[] {
    const plan = this.planSearch(queryVector, topK, threshold, metric, filter);
    if (!plan) return [];
    if (plan.Mode === 'custom') return this.searchWithCustomMetric(plan);

    const fast = this.accelerator.TrySearchSync(plan.Job);
    if (fast) return this.finalizeSearch(plan, fast, true);
    return this.finalizeSearch(plan, SearchRows(plan.Job.Snapshot, plan.Job), false);
  }

  /**
   * Async form of {@link FindNearest} with identical arguments and results.
   * Server hosts register an accelerator that runs large searches on a worker
   * thread (and/or a native backend), so the calling thread — typically the
   * one serving every other request — is not blocked by the scan. With no
   * accelerator registered it runs in-process exactly like `FindNearest`.
   *
   * @public
   * @method
   */
  public async FindNearestAsync(
    queryVector: number[],
    topK: number = 10,
    threshold?: number,
    metric: DistanceMetric = 'cosine',
    filter?: (metadata: TMetadata) => boolean
  ): Promise<VectorSearchResult<TMetadata>[]> {
    const plan = this.planSearch(queryVector, topK, threshold, metric, filter);
    if (!plan) return [];
    if (plan.Mode === 'custom') return this.searchWithCustomMetric(plan);

    const rows = await this.accelerator.SearchAsync(plan.Job);
    return this.finalizeSearch(plan, rows, true);
  }

  /**
   * Validates a search and turns it into a job over the packed store.
   * Returns null when the search can only produce an empty result.
   */
  private planSearch(
    queryVector: number[],
    topK: number,
    threshold: number | undefined,
    metric: DistanceMetric,
    filter: ((metadata: TMetadata) => boolean) | undefined
  ): SearchPlan<TMetadata> | null {
    if (!queryVector || queryVector.length === 0) {
      throw new Error('Query vector cannot be null, undefined, or empty');
    }
    const candidates = filter ? this.filterRows(filter) : null;
    const candidateCount = candidates ? candidates.length : this.store.Size;
    if (candidateCount === 0) return null;
    const custom = this.usesCustomMetric;
    // A bad metric or dimension count fails every row identically. The service
    // has always logged and returned no results rather than thrown; keep that,
    // but log once instead of once per row.
    if (!custom && !IsKnownMetric(metric)) {
      LogError(`Error calculating ${metric} similarity: Unknown distance metric: ${metric}`);
      return null;
    }
    if (!custom && this.store.Dims !== queryVector.length) {
      LogError(`Error calculating ${metric} similarity: Vectors must have same dimensions. Got ${queryVector.length} and ${this.store.Dims}`);
      return null;
    }
    const k = Math.trunc(topK);
    const bounded = k >= 1 && k < candidateCount;
    const plan: SearchPlan<TMetadata> = {
      Mode: custom ? 'custom' : 'kernel',
      QueryVector: queryVector,
      TopK: topK,
      Metric: metric,
      Threshold: threshold == null ? null : threshold,
      Filter: filter,
      KeysAtDispatch: this.store.Keys,
      VersionAtDispatch: this.store.Version,
      Job: this.buildSearchJob(queryVector, bounded ? k : null, threshold, metric, candidates),
    };
    return plan;
  }

  private buildSearchJob(
    queryVector: number[],
    topK: number | null,
    threshold: number | undefined,
    metric: DistanceMetric,
    candidates: Int32Array | null
  ): VectorSearchJob {
    const query = this.store.ToStorePrecision(queryVector);
    const spec: VectorSearchSpec = {
      Query: query,
      QueryNormSq: SumOfSquares(query, 0, query.length),
      Candidates: candidates,
      Metric: metric,
      TopK: topK,
      Threshold: threshold == null ? null : threshold,
    };
    return { ...spec, Snapshot: this.store.Snapshot(), Source: this.store };
  }

  /** Ascending live rows whose metadata passes the filter (rows without metadata never do). */
  private filterRows(filter: (metadata: TMetadata) => boolean): Int32Array {
    const rows: number[] = [];
    const rowCount = this.store.RowCount;
    for (let row = 0; row < rowCount; row++) {
      if (!this.store.IsLive(row)) continue;
      const metadata = this.store.MetadataAt(row);
      if (metadata && filter(metadata)) rows.push(row);
    }
    return Int32Array.from(rows);
  }

  /**
   * Turns ranked rows into results. When the rows came from somewhere other
   * than an in-process scan of the current store (another thread, a native
   * backend, an approximate index) they are re-scored against the live store,
   * so a concurrent write or a lower-precision backend can never surface a
   * wrong score. `topK` is applied with `Array.slice` semantics, as before.
   */
  private finalizeSearch(plan: SearchPlan<TMetadata>, ranked: ScoredRows, rescore: boolean): VectorSearchResult<TMetadata>[] {
    const exact = !rescore && plan.VersionAtDispatch === this.store.Version;
    const hits = exact ? this.hitsFromRows(ranked) : this.rescoreRows(plan, ranked);
    return hits.slice(0, plan.TopK).map(hit => ({
      key: this.store.KeyAt(hit.Row) as string,
      score: hit.Score,
      metadata: this.store.MetadataAt(hit.Row),
    }));
  }

  private hitsFromRows(ranked: ScoredRows): RankedHit[] {
    const hits: RankedHit[] = new Array(ranked.Rows.length);
    for (let i = 0; i < ranked.Rows.length; i++) {
      hits[i] = { Row: ranked.Rows[i], Score: ranked.Scores[i] };
    }
    return hits;
  }

  /** Maps rows from the dispatch-time snapshot to current rows and scores them exactly. */
  private rescoreRows(plan: SearchPlan<TMetadata>, ranked: ScoredRows): RankedHit[] {
    const job = plan.Job;
    const view = this.store.View();
    const seen = new Set<number>();
    const hits: RankedHit[] = [];
    for (let i = 0; i < ranked.Rows.length; i++) {
      const key = plan.KeysAtDispatch[ranked.Rows[i]];
      const row = key == null ? undefined : this.store.RowOf(key);
      if (row === undefined || seen.has(row)) continue;
      seen.add(row);
      if (plan.Filter) {
        const metadata = this.store.MetadataAt(row);
        if (!metadata || !plan.Filter(metadata)) continue;
      }
      const score = MetricScore(job.Metric, job.Query, 0, job.QueryNormSq, view.Data, row * view.Dims, view.Norms[row], view.Dims);
      if (score !== score) continue; // NaN
      if (job.Threshold !== null && !(score >= job.Threshold)) continue;
      hits.push({ Row: row, Score: score });
    }
    hits.sort((a, b) => (b.Score - a.Score) || (a.Row - b.Row));
    return job.TopK === null ? hits : hits.slice(0, job.TopK);
  }

  /**
   * Subclasses that override a metric method keep working: rank with their
   * override, one row at a time, exactly as the service did before packing.
   */
  private searchWithCustomMetric(plan: SearchPlan<TMetadata>): VectorSearchResult<TMetadata>[] {
    const rows = plan.Job.Candidates ?? this.store.LiveRows();
    const results: VectorSearchResult<TMetadata>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = this.store.KeyAt(row) as string;
      try {
        const score = this.CalculateDistance(plan.QueryVector, this.store.ReadRow(row), plan.Metric);
        if (plan.Threshold === null || score >= plan.Threshold) {
          results.push({ key, score, metadata: this.store.MetadataAt(row) });
        }
      } catch (error) {
        LogError(`Error calculating ${plan.Metric} similarity for key ${key}: ${error}`);
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, plan.TopK);
  }

  /** The accelerator this service uses: the explicit one, else the process-wide registration. */
  private get accelerator(): BaseVectorAccelerator {
    return this.explicitAccelerator ?? VectorAcceleratorResolver.Instance.Current;
  }

  /**
   * True when a subclass overrides any metric method. The packed kernels
   * cannot call an override, so such subclasses are scored row by row.
   */
  private get usesCustomMetric(): boolean {
    const base = SimpleVectorService.prototype;
    return this.CalculateDistance !== base.CalculateDistance
      || this.CosineSimilarity !== base.CosineSimilarity
      || this.EuclideanDistance !== base.EuclideanDistance
      || this.ManhattanDistance !== base.ManhattanDistance
      || this.DotProduct !== base.DotProduct
      || this.JaccardSimilarity !== base.JaccardSimilarity
      || this.HammingDistance !== base.HammingDistance;
  }
  
  /**
   * Finds vectors similar to an existing vector identified by its key.
   * The source vector itself is excluded from the results.
   *
   * @param {string} key - The key of the source vector
   * @param {number} [topK=10] - Number of similar vectors to return
   * @param {number} [threshold] - Optional minimum similarity threshold (0-1)
   * @param {DistanceMetric} [metric='cosine'] - The distance metric to use
   * @param {(metadata: TMetadata) => boolean} [filter] - Optional filter to pre-filter vectors by metadata before similarity calculation
   * @returns {VectorSearchResult<TMetadata>[]} Array of similar vectors sorted by similarity
   * @throws {Error} If the key doesn't exist in the service
   *
   * @example
   * ```typescript
   * // Find items similar to 'product123'
   * const similarProducts = service.FindSimilar('product123', 5);
   *
   * // Find highly similar items (similarity > 0.8)
   * const verySimilar = service.FindSimilar('product123', 10, 0.8);
   *
   * // Find similar items using Euclidean distance
   * const similar = service.FindSimilar('product123', 5, undefined, 'euclidean');
   *
   * // Find similar items filtered by category
   * const similarInCategory = service.FindSimilar(
   *   'product123',
   *   5,
   *   0.7,
   *   'cosine',
   *   (metadata) => metadata.category === 'Electronics'
   * );
   * ```
   *
   * @public
   * @method
   */
  public FindSimilar(
    key: string,
    topK: number = 10,
    threshold?: number,
    metric: DistanceMetric = 'cosine',
    filter?: (metadata: TMetadata) => boolean
  ): VectorSearchResult<TMetadata>[] {
    const row = this.store.RowOf(key);
    if (row === undefined) {
      throw new Error(`Vector with key "${key}" not found`);
    }

    // Get topK + 1 to account for excluding self
    return this.FindNearest(this.store.ReadRow(row), topK + 1, threshold, metric, filter)
      .filter(result => result.key !== key)  // Exclude self
      .slice(0, topK);
  }
  
  /**
   * Calculates the cosine similarity between two vectors identified by their keys
   * 
   * @param {string} key1 - Key of the first vector
   * @param {string} key2 - Key of the second vector
   * @returns {number} Cosine similarity score between 0 and 1
   * @throws {Error} If either key doesn't exist in the service
   * 
   * @example
   * ```typescript
   * const similarity = service.Similarity('item1', 'item2');
   * console.log(`Similarity: ${similarity}`);
   * ```
   * 
   * @public
   * @method
   */
  public Similarity(key1: string, key2: string): number {
    const row1 = this.store.RowOf(key1);
    const row2 = this.store.RowOf(key2);

    if (row1 === undefined) {
      throw new Error(`Vector with key "${key1}" not found`);
    }
    if (row2 === undefined) {
      throw new Error(`Vector with key "${key2}" not found`);
    }

    if (this.usesCustomMetric) {
      return this.CosineSimilarity(this.store.ReadRow(row1), this.store.ReadRow(row2));
    }
    const view = this.store.View();
    return CosineFromNorms(view.Data, row1 * view.Dims, view.Norms[row1], view.Data, row2 * view.Dims, view.Norms[row2], view.Dims);
  }
  
  /**
   * Calculates cosine similarity between two vectors using the formula:
   * similarity = (A · B) / (||A|| × ||B||)
   * 
   * ## What is Cosine Similarity?
   * Cosine similarity measures the cosine of the angle between two vectors in multi-dimensional space.
   * It tells us how similar two vectors are regardless of their magnitude (length).
   * 
   * ## Return Values:
   * - **1.0**: Vectors point in exactly the same direction (identical)
   * - **0.0**: Vectors are perpendicular (orthogonal/unrelated)
   * - **-1.0**: Vectors point in opposite directions (completely different)
   * - **0.7-1.0**: High similarity (vectors are closely related)
   * - **0.3-0.7**: Moderate similarity
   * - **< 0.3**: Low similarity
   * 
   * ## Why Use Cosine Similarity for Embeddings?
   * Text embeddings encode semantic meaning as vectors. Cosine similarity is ideal because:
   * - It focuses on direction (meaning) rather than magnitude (importance)
   * - It's normalized between -1 and 1, making scores comparable
   * - It works well in high-dimensional spaces (384-1536 dimensions)
   * 
   * ## Mathematical Formula:
   * ```
   * cosine_similarity = dot_product(A, B) / (magnitude(A) * magnitude(B))
   * 
   * Where:
   * - dot_product(A, B) = Σ(a[i] * b[i]) for all i
   * - magnitude(A) = √(Σ(a[i]²)) for all i
   * ```
   * 
   * @param {number[]} a - First vector (e.g., embedding of document A)
   * @param {number[]} b - Second vector (e.g., embedding of document B)
   * @returns {number} Cosine similarity score between -1 and 1
   * @throws {Error} If vectors have different dimensions (must be same length)
   * 
   * @example
   * ```typescript
   * // Two identical vectors have similarity of 1
   * const similarity1 = CosineSimilarity([1, 2, 3], [1, 2, 3]); // ≈ 1.0
   * 
   * // Perpendicular vectors have similarity of 0
   * const similarity2 = CosineSimilarity([1, 0], [0, 1]); // = 0.0
   * 
   * // Opposite vectors have similarity of -1
   * const similarity3 = CosineSimilarity([1, 2], [-1, -2]); // = -1.0
   * ```
   * 
   * @protected
   * @method
   */
  protected CosineSimilarity(a: number[], b: number[]): number {
    // Vectors must have the same number of dimensions to be compared
    // For embeddings, this means both texts were processed by the same model
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    // Zero vectors have no direction, so the kernel returns 0 for them by convention
    return CosineFromNorms(a, 0, SumOfSquares(a, 0, a.length), b, 0, SumOfSquares(b, 0, b.length), a.length);
  }

  /**
   * Calculates Euclidean distance between two vectors, normalized to 0-1 range.
   * 
   * ## What is Euclidean Distance?
   * Euclidean distance is the "straight-line" distance between two points in space.
   * It's what you'd measure with a ruler in the physical world.
   * 
   * ## Mathematical Formula:
   * ```
   * distance = √(Σ(a[i] - b[i])²)
   * normalized_similarity = 1 / (1 + distance)
   * ```
   * 
   * ## Return Values (Normalized):
   * - **1.0**: Identical vectors (distance = 0)
   * - **0.5**: Moderate distance (distance = 1)
   * - **→0**: Very different vectors (large distance)
   * 
   * ## Business Use Cases:
   * - **Product specifications**: Compare products by numeric features (size, weight, price)
   * - **Quality control**: Measure deviation from target specifications
   * - **Geographic analysis**: Distance between store locations (lat/long)
   * - **Customer segmentation**: Group customers by purchase behavior metrics
   * - **Inventory management**: Find similar SKUs by dimensions
   * 
   * ## When to Use:
   * ✅ Continuous numeric features where magnitude matters
   * ✅ Physical measurements and specifications
   * ✅ When you need true geometric distance
   * ❌ High-dimensional sparse data (use cosine instead)
   * ❌ Text embeddings (use cosine for better results)
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Normalized similarity score (0-1, where 1 = identical)
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected EuclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    // Normalized to 0-1: closer = higher score
    return EuclideanScore(a, 0, b, 0, a.length);
  }

  /**
   * Calculates Manhattan distance between two vectors, normalized to 0-1 range.
   * 
   * ## What is Manhattan Distance?
   * Manhattan distance (also called L1 distance, city block distance, or taxicab distance)
   * measures the distance between two points by summing the absolute differences of their coordinates.
   * Like navigating a city grid where you can only move along streets.
   * 
   * ## Mathematical Formula:
   * ```
   * distance = Σ|a[i] - b[i]|
   * normalized_similarity = 1 / (1 + distance)
   * ```
   * 
   * ## Return Values (Normalized):
   * - **1.0**: Identical vectors (distance = 0)
   * - **0.5**: Moderate distance (sum of differences = 1)
   * - **→0**: Very different vectors (large total difference)
   * 
   * ## Business Use Cases:
   * - **Supply chain**: Warehouse grid navigation, pick-path optimization
   * - **Time series**: Comparing trends (robust to outliers)
   * - **Resource allocation**: Movement costs in grid systems
   * - **Urban planning**: Actual travel distance in city blocks
   * - **Inventory differences**: Total units different across SKUs
   * 
   * ## When to Use:
   * ✅ Grid-based movement systems
   * ✅ When outliers should have linear (not squared) impact
   * ✅ Discrete movements or changes
   * ✅ Each dimension represents independent cost/distance
   * ❌ Smooth gradients needed
   * ❌ True geometric distance required
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Normalized similarity score (0-1, where 1 = identical)
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected ManhattanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    return ManhattanScore(a, 0, b, 0, a.length);
  }

  /**
   * Calculates dot product similarity between two vectors, normalized to 0-1 range.
   * 
   * ## What is Dot Product?
   * Dot product (inner product) measures both direction AND magnitude alignment.
   * Unlike cosine similarity, it rewards vectors that point the same way AND have similar magnitudes.
   * 
   * ## Mathematical Formula:
   * ```
   * dot_product = Σ(a[i] × b[i])
   * normalized = (tanh(dot_product / scale) + 1) / 2
   * ```
   * 
   * ## Return Values (Normalized):
   * - **1.0**: Perfect alignment with similar magnitude
   * - **0.5**: Orthogonal or neutral relationship
   * - **0.0**: Opposite direction or very different magnitudes
   * 
   * ## Business Use Cases:
   * - **Recommendation systems**: When popularity (magnitude) matters
   * - **Revenue analysis**: Quantity × Price calculations
   * - **Weighted scoring**: Features × Importance weights
   * - **Portfolio analysis**: Holdings × Performance
   * - **Marketing effectiveness**: Reach × Engagement metrics
   * 
   * ## When to Use:
   * ✅ Magnitude is meaningful (popularity, importance, quantity)
   * ✅ Pre-normalized vectors with semantic magnitude
   * ✅ Weighted feature comparisons
   * ✅ Collaborative filtering with implicit feedback
   * ❌ Vectors with different scales
   * ❌ When only direction matters (use cosine)
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Normalized similarity score (0-1, where 1 = high similarity)
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected DotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    return DotProductScore(a, 0, b, 0, a.length);
  }

  /**
   * Calculates Jaccard similarity between two vectors treated as sets.
   * 
   * ## What is Jaccard Similarity?
   * Jaccard similarity (Jaccard index) measures the similarity between two sets
   * as the size of their intersection divided by the size of their union.
   * For vectors, non-zero elements are treated as "present" in the set.
   * 
   * ## Mathematical Formula:
   * ```
   * jaccard = |A ∩ B| / |A ∪ B|
   * where A and B are sets of non-zero indices
   * ```
   * 
   * ## Return Values:
   * - **1.0**: Identical sets (same non-zero positions)
   * - **0.5**: Half of combined elements are shared
   * - **0.0**: No overlap (completely different sets)
   * 
   * ## Business Use Cases:
   * - **Customer behavior**: Products purchased, features used
   * - **Document similarity**: Presence/absence of keywords
   * - **Market basket**: Product co-occurrence analysis
   * - **User permissions**: Comparing access control sets
   * - **Tag similarity**: Comparing item categorizations
   * 
   * ## When to Use:
   * ✅ Binary or categorical data (presence/absence)
   * ✅ Sparse vectors where zeros mean "not present"
   * ✅ Set membership comparisons
   * ✅ When magnitude doesn't matter, only presence
   * ❌ Continuous numeric features
   * ❌ Dense embeddings
   * 
   * ## Note on Sparse Vectors:
   * This implementation treats 0 as absence and any non-zero as presence.
   * This is suitable for sparse representations where 0 explicitly means "not in set".
   * 
   * @param {number[]} a - First vector (treated as set)
   * @param {number[]} b - Second vector (treated as set)
   * @returns {number} Jaccard similarity (0-1, where 1 = identical sets)
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected JaccardSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    return JaccardScore(a, 0, b, 0, a.length);
  }

  /**
   * Calculates Hamming distance between two vectors, normalized to similarity score.
   * 
   * ## What is Hamming Distance?
   * Hamming distance counts the number of positions where two vectors differ.
   * Originally designed for error detection in telecommunications, it's useful
   * for comparing categorical data or binary strings.
   * 
   * ## Mathematical Formula:
   * ```
   * hamming_distance = count(a[i] ≠ b[i])
   * similarity = 1 - (hamming_distance / vector_length)
   * ```
   * 
   * ## Return Values (Normalized):
   * - **1.0**: Identical vectors (no differences)
   * - **0.5**: Half of positions differ
   * - **0.0**: All positions differ
   * 
   * ## Business Use Cases:
   * - **Data quality**: Detecting errors in data entry
   * - **A/B testing**: Comparing feature flags or configurations
   * - **Fraud detection**: Unusual patterns in categorical attributes
   * - **Product variants**: Comparing product configurations
   * - **System monitoring**: Configuration drift detection
   * 
   * ## When to Use:
   * ✅ Categorical data comparison
   * ✅ Binary feature vectors
   * ✅ Error detection and correction
   * ✅ Fixed-length codes or identifiers
   * ❌ Continuous numeric features
   * ❌ When magnitude of difference matters
   * 
   * ## Note on Continuous Values:
   * For continuous values, this uses exact equality. Consider binning
   * continuous values first if approximate matching is needed.
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Normalized similarity (0-1, where 1 = identical)
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected HammingDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    return HammingScore(a, 0, b, 0, a.length);
  }

  /**
   * Calculates distance/similarity between two vectors using the specified metric.
   * All metrics are normalized to 0-1 range where 1 indicates highest similarity.
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @param {DistanceMetric} [metric='cosine'] - The metric to use
   * @returns {number} Normalized similarity score (0-1)
   * @throws {Error} If vectors have different dimensions or invalid metric
   * 
   * @example
   * ```typescript
   * const similarity = service.CalculateDistance(vec1, vec2, 'euclidean');
   * ```
   * 
   * @public
   * @method
   */
  public CalculateDistance(a: number[], b: number[], metric: DistanceMetric = 'cosine'): number {
    switch (metric) {
      case 'cosine':
        // Convert from [-1, 1] to [0, 1]
        return (this.CosineSimilarity(a, b) + 1) / 2;
      case 'euclidean':
        return this.EuclideanDistance(a, b);
      case 'manhattan':
        return this.ManhattanDistance(a, b);
      case 'dotproduct':
        return this.DotProduct(a, b);
      case 'jaccard':
        return this.JaccardSimilarity(a, b);
      case 'hamming':
        return this.HammingDistance(a, b);
      default:
        throw new Error(`Unknown distance metric: ${metric}`);
    }
  }
  
  /**
   * Gets the current number of vectors in the service
   * 
   * @returns {number} The number of vectors currently loaded
   * 
   * @public
   * @readonly
   */
  public get Size(): number {
    return this.store.Size;
  }
  
  /**
   * Clears all vectors from memory
   * 
   * @example
   * ```typescript
   * service.Clear();
   * console.log(service.Size); // 0
   * ```
   * 
   * @public
   * @method
   */
  public Clear(): void {
    this.store.Clear();
  }
  
  /**
   * Checks if a vector with the given key exists
   * 
   * @param {string} key - The key to check
   * @returns {boolean} True if the key exists, false otherwise
   * 
   * @example
   * ```typescript
   * if (service.Has('product123')) {
   *   console.log('Product vector exists');
   * }
   * ```
   * 
   * @public
   * @method
   */
  public Has(key: string): boolean {
    return this.store.Has(key);
  }
  
  /**
   * Retrieves a specific vector by its key
   * 
   * @param {string} key - The key of the vector to retrieve
   * @returns {number[] | undefined} A copy of the vector, or undefined if not found
   * 
   * @example
   * ```typescript
   * const vector = service.GetVector('product123');
   * if (vector) {
   *   console.log(`Vector dimensions: ${vector.length}`);
   * }
   * ```
   * 
   * @public
   * @method
   */
  public GetVector(key: string): number[] | undefined {
    const row = this.store.RowOf(key);
    return row === undefined ? undefined : this.store.ReadRow(row);
  }

  /**
   * Retrieves the metadata associated with a specific vector
   * 
   * @param {string} key - The key of the vector
   * @returns {TMetadata | undefined} The metadata, or undefined if not found
   * 
   * @example
   * ```typescript
   * const metadata = service.GetMetadata('product123');
   * if (metadata) {
   *   console.log(`Product name: ${metadata.name}`);
   * }
   * ```
   * 
   * @public
   * @method
   */
  public GetMetadata(key: string): TMetadata | undefined {
    const row = this.store.RowOf(key);
    return row === undefined ? undefined : this.store.MetadataAt(row);
  }

  /**
   * Updates an existing vector entry in-place, allowing partial updates to the vector data,
   * metadata, or both without removing and re-adding the entry. Unlike {@link AddVector}, this
   * method requires the key to already exist and will throw if it does not.
   *
   * This is useful when you need to:
   * - Update the embedding for an existing key after re-encoding (e.g., content changed)
   * - Patch metadata without touching the vector data
   * - Atomically update both vector and metadata in a single call
   *
   * @param {string} key - The unique identifier of the vector to update. Must already exist.
   * @param {Object} updates - The fields to update. At least one of `vector` or `metadata` must be provided.
   * @param {number[]} [updates.vector] - New vector/embedding to replace the existing one.
   *   Must match the expected dimensions of the service.
   * @param {TMetadata} [updates.metadata] - New metadata to replace the existing metadata.
   * @returns {boolean} True if the update was applied successfully
   * @throws {Error} If the key does not exist in the service
   * @throws {Error} If neither `vector` nor `metadata` is provided
   * @throws {Error} If the new vector has mismatched dimensions
   *
   * @example
   * ```typescript
   * // Update only the vector (e.g., after re-embedding content)
   * service.UpdateVector('doc123', { vector: newEmbedding });
   *
   * // Update only metadata (e.g., status changed)
   * service.UpdateVector('doc123', { metadata: { title: 'Updated Title', status: 'reviewed' } });
   *
   * // Update both vector and metadata atomically
   * service.UpdateVector('doc123', {
   *   vector: newEmbedding,
   *   metadata: { title: 'Updated Title', version: 2 }
   * });
   * ```
   *
   * @public
   * @method
   */
  public UpdateVector(key: string, updates: { vector?: VectorValues; metadata?: TMetadata }): boolean {
    const row = this.store.RowOf(key);
    if (row === undefined) {
      throw new Error(`Vector with key "${key}" not found. Use AddVector to create new entries.`);
    }

    if (updates.vector == null && updates.metadata == null) {
      throw new Error('At least one of vector or metadata must be provided for an update');
    }

    if (updates.vector != null) {
      if (updates.vector.length === 0) {
        throw new Error('Vector cannot be empty');
      }
      this.validateAndSetDimensions(updates.vector);
      this.store.Write(key, updates.vector);
    }

    if (updates.metadata != null) {
      this.store.SetMetadata(row, updates.metadata);
    }

    return true;
  }

  /**
   * Adds a new vector or updates an existing one based on whether the key already exists.
   * If the key does not exist, a new entry is created. If the key already exists, the
   * vector and/or metadata are updated in place.
   *
   * @param {string} key - The unique identifier for the vector
   * @param {number[]} vector - The vector/embedding array
   * @param {TMetadata} [metadata] - Optional metadata to associate with the vector
   * @returns {boolean} True if an existing vector was updated, false if a new vector was added
   * @throws {Error} If key is null/undefined, or if vector is invalid
   *
   * @example
   * ```typescript
   * // First call creates the entry
   * const wasUpdate = service.AddOrUpdateVector('doc1', [0.1, 0.2, 0.3], { title: 'Doc 1' });
   * console.log(wasUpdate); // false (new entry)
   *
   * // Second call updates the existing entry
   * const wasUpdate2 = service.AddOrUpdateVector('doc1', [0.4, 0.5, 0.6], { title: 'Doc 1 v2' });
   * console.log(wasUpdate2); // true (updated)
   * ```
   *
   * @public
   * @method
   */
  public AddOrUpdateVector(key: string, vector: VectorValues, metadata?: TMetadata): boolean {
    if (!key) {
      throw new Error('Key cannot be null or undefined');
    }
    if (!vector || vector.length === 0) {
      throw new Error('Vector cannot be null, undefined, or empty');
    }

    const exists = this.store.Has(key);
    if (exists) {
      this.UpdateVector(key, { vector, metadata });
    } else {
      this.AddVector(key, vector, metadata);
    }
    return exists;
  }

  /**
   * Removes a vector from the service
   * 
   * @param {string} key - The key of the vector to remove
   * @returns {boolean} True if the vector was removed, false if it didn't exist
   * 
   * @example
   * ```typescript
   * if (service.RemoveVector('product123')) {
   *   console.log('Vector removed successfully');
   * }
   * ```
   * 
   * @public
   * @method
   */
  public RemoveVector(key: string): boolean {
    return this.store.Remove(key);
  }

  /**
   * Gets all keys currently stored in the service
   * 
   * @returns {string[]} Array of all vector keys
   * 
   * @example
   * ```typescript
   * const allKeys = service.GetAllKeys();
   * console.log(`Total vectors: ${allKeys.length}`);
   * ```
   * 
   * @public
   * @method
   */
  public GetAllKeys(): string[] {
    return Array.from(this.store.LiveRows(), row => this.store.KeyAt(row) as string);
  }

  /**
   * Exports all vectors as an array of VectorEntry objects.
   * Useful for persistence or transferring data.
   * 
   * @returns {VectorEntry<TMetadata>[]} Array of all vector entries (vectors are copies)
   * 
   * @example
   * ```typescript
   * const allVectors = service.ExportVectors();
   * // Save to database or file
   * await saveToDatabase(allVectors);
   * ```
   * 
   * @public
   * @method
   */
  public ExportVectors(): VectorEntry<TMetadata>[] {
    return Array.from(this.store.LiveRows(), row => ({
      key: this.store.KeyAt(row) as string,
      vector: this.store.ReadRow(row),
      metadata: this.store.MetadataAt(row),
    }));
  }

  /**
   * Validates vector dimensions and sets expected dimensions if not yet set.
   * Ensures all vectors have consistent dimensions for valid similarity calculations.
   * 
   * @param {number[]} vector - The vector to validate
   * @throws {Error} If vector dimensions don't match expected dimensions
   * 
   * @private
   * @method
   */
  private validateAndSetDimensions(vector: VectorValues): void {
    this.validateAndSetDimensionCount(vector.length);
  }

  private validateAndSetDimensionCount(dimensions: number): void {
    if (this.expectedDimensions === null) {
      // First vector sets the expected dimensions
      this.expectedDimensions = dimensions;
    } else if (dimensions !== this.expectedDimensions) {
      throw new Error(
        `Vector dimension mismatch. Expected ${this.expectedDimensions} dimensions, got ${dimensions}. ` +
        `All vectors must have the same number of dimensions for similarity calculations to work.`
      );
    }
  }

  /**
   * Gets the expected vector dimensions for this service instance
   * 
   * @returns {number | null} The expected dimensions, or null if no vectors loaded yet
   * 
   * @public
   * @readonly
   */
  public get ExpectedDimensions(): number | null {
    return this.expectedDimensions;
  }

  /**
   * Finds all vectors with similarity above a threshold
   *
   * @param {number[]} queryVector - The vector to search for similar items
   * @param {number} threshold - Minimum similarity threshold (0-1)
   * @param {DistanceMetric} [metric='cosine'] - The distance metric to use
   * @param {(metadata: TMetadata) => boolean} [filter] - Optional filter to pre-filter vectors by metadata before similarity calculation
   * @returns {VectorSearchResult<TMetadata>[]} Array of search results sorted by similarity
   *
   * @example
   * ```typescript
   * // Find all highly similar items (similarity > 0.8)
   * const similar = service.FindAboveThreshold(queryVector, 0.8);
   *
   * // Find all items with Jaccard similarity > 0.5
   * const matches = service.FindAboveThreshold(features, 0.5, 'jaccard');
   *
   * // Find all similar items in a specific category
   * const categoryMatches = service.FindAboveThreshold(
   *   queryVector,
   *   0.7,
   *   'cosine',
   *   (metadata) => metadata.status === 'Active'
   * );
   * ```
   *
   * @public
   * @method
   */
  public FindAboveThreshold(
    queryVector: number[],
    threshold: number,
    metric: DistanceMetric = 'cosine',
    filter?: (metadata: TMetadata) => boolean
  ): VectorSearchResult<TMetadata>[] {
    return this.FindNearest(queryVector, this.store.Size, threshold, metric, filter);
  }

  // ============================================================================
  // PHASE 2: CLUSTERING ALGORITHMS
  // ============================================================================

  /**
   * Performs K-Means clustering on the loaded vectors.
   * Uses K-Means++ initialization for better starting centroids.
   * 
   * ## What is K-Means Clustering?
   * K-Means divides vectors into K clusters by minimizing within-cluster variance.
   * Each vector is assigned to the nearest centroid, and centroids are iteratively updated.
   * 
   * ## Business Use Cases:
   * - **Customer Segmentation**: Group customers by behavior patterns
   * - **Product Categorization**: Organize products into natural groups
   * - **Market Segmentation**: Identify distinct market segments
   * - **Anomaly Detection**: Identify unusual patterns (far from all centroids)
   * - **Document Organization**: Group similar documents together
   * 
   * ## When to Use:
   * ✅ Known or estimated number of clusters
   * ✅ Spherical, well-separated clusters
   * ✅ Similar cluster sizes
   * ✅ Need interpretable centroids
   * ❌ Non-spherical clusters
   * ❌ Varying cluster densities
   * ❌ Unknown number of clusters
   * 
   * @param {number} k - Number of clusters
   * @param {number} [maxIterations=100] - Maximum iterations before stopping
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @param {number} [tolerance=0.0001] - Convergence tolerance
   * @returns {ClusterResult<TMetadata>} Clustering results with assignments and centroids
   * 
   * @example
   * ```typescript
   * const result = service.KMeansCluster(3, 100, 'euclidean');
   * result.clusters.forEach((members, clusterId) => {
   *   console.log(`Cluster ${clusterId}: ${members.length} members`);
   * });
   * ```
   * 
   * @public
   * @method
   */
  public KMeansCluster(
    k: number,
    maxIterations: number = 100,
    metric: DistanceMetric = 'euclidean',
    tolerance: number = 0.0001
  ): ClusterResult<TMetadata> {
    if (k <= 0 || k > this.store.Size) {
      throw new Error(`Invalid k: ${k}. Must be between 1 and ${this.store.Size}`);
    }

    // Non-empty: the k check above rejects an empty store.
    const rows = this.store.LiveRows();
    const scorer = this.createScorer(metric);
    // Initialize centroids using K-Means++
    const centroids = this.initializeKMeansPlusPlus(rows, k, scorer);
    let assignments: Int32Array | null = null;
    let iterations = 0;
    let converged = false;

    while (iterations < maxIterations && !converged) {
      // Assignment step: assign each point to nearest centroid
      const newAssignments = this.assignToNearestCentroid(rows, centroids, scorer);
      // Check for convergence
      converged = assignments !== null && this.sameAssignments(assignments, newAssignments);
      assignments = newAssignments;

      if (!converged) {
        // Update step: recalculate centroids, keeping the old one for an empty cluster
        const newCentroids = this.recomputeCentroids(rows, assignments, k, centroids);
        // Stop when no centroid moved significantly
        if (this.maxCentroidMovement(centroids, newCentroids, scorer) < tolerance) {
          converged = true;
        }
        centroids.clear();
        newCentroids.forEach((centroid, id) => centroids.set(id, centroid));
      }

      iterations++;
    }

    return this.buildKMeansResult(rows, assignments ?? this.assignToNearestCentroid(rows, centroids, scorer), centroids, k, metric, iterations, scorer);
  }

  /** Assembles the K-Means result: members per cluster in insertion order, inertia, silhouette. */
  private buildKMeansResult(
    rows: Int32Array,
    assignments: Int32Array,
    centroids: Map<number, Centroid>,
    k: number,
    metric: DistanceMetric,
    iterations: number,
    scorer: MetricScorer
  ): ClusterResult<TMetadata> {
    const clusters = new Map<number, string[]>();
    for (let i = 0; i < k; i++) {
      clusters.set(i, []);
    }
    for (let i = 0; i < rows.length; i++) {
      clusters.get(assignments[i])!.push(this.store.KeyAt(rows[i]) as string);
    }

    // Calculate inertia (sum of squared distances to centroids)
    let inertia = 0;
    for (let i = 0; i < rows.length; i++) {
      const distance = 1 - scorer.RowVsCentroid(rows[i], centroids.get(assignments[i])!);
      inertia += distance * distance;
    }

    const publicCentroids = new Map<number, number[]>();
    centroids.forEach((centroid, id) => publicCentroids.set(id, Array.from(centroid.Values)));
    return {
      clusters,
      centroids: publicCentroids,
      metadata: {
        metric,
        iterations,
        inertia,
        silhouetteScore: this.SilhouetteScore({ clusters, centroids: publicCentroids }, metric)
      }
    };
  }

  /**
   * K-Means++ initialization for better starting centroids.
   * Chooses initial centroids that are far apart from each other.
   * 
   * @private
   */
  private initializeKMeansPlusPlus(rows: Int32Array, k: number, scorer: MetricScorer): Map<number, Centroid> {
    const centroids = new Map<number, Centroid>();

    // Choose first centroid randomly
    const firstIdx = Math.floor(Math.random() * rows.length);
    centroids.set(0, this.centroidFromRow(rows[firstIdx]));

    // Choose remaining centroids
    for (let i = 1; i < k; i++) {
      const distances = new Float64Array(rows.length);
      for (let j = 0; j < rows.length; j++) {
        let minDist = Infinity;
        centroids.forEach(centroid => {
          minDist = Math.min(minDist, 1 - scorer.RowVsCentroid(rows[j], centroid));
        });
        distances[j] = minDist;
      }

      // Choose next centroid with probability proportional to squared distance
      let sumSquaredDist = 0;
      for (let j = 0; j < distances.length; j++) {
        sumSquaredDist += distances[j] * distances[j];
      }
      const threshold = Math.random() * sumSquaredDist;
      let cumSum = 0;

      for (let j = 0; j < rows.length; j++) {
        cumSum += distances[j] * distances[j];
        if (cumSum >= threshold) {
          centroids.set(i, this.centroidFromRow(rows[j]));
          break;
        }
      }
    }

    return centroids;
  }

  /** Index of the nearest centroid for each row (first centroid wins a tie). */
  private assignToNearestCentroid(rows: Int32Array, centroids: Map<number, Centroid>, scorer: MetricScorer): Int32Array {
    const assignments = new Int32Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      let minDistance = Infinity;
      let assignedCluster = 0;
      centroids.forEach((centroid, clusterId) => {
        const distance = 1 - scorer.RowVsCentroid(rows[i], centroid);
        if (distance < minDistance) {
          minDistance = distance;
          assignedCluster = clusterId;
        }
      });
      assignments[i] = assignedCluster;
    }
    return assignments;
  }

  /** Mean of each cluster's members, summed in insertion order like {@link FindCentroid}. */
  private recomputeCentroids(
    rows: Int32Array,
    assignments: Int32Array,
    k: number,
    previous: Map<number, Centroid>
  ): Map<number, Centroid> {
    const dims = this.store.Dims;
    const view = this.store.View();
    const sums: Float64Array[] = [];
    const counts = new Int32Array(k);
    for (let c = 0; c < k; c++) sums.push(new Float64Array(dims));
    for (let i = 0; i < rows.length; i++) {
      const sum = sums[assignments[i]];
      const offset = rows[i] * dims;
      for (let d = 0; d < dims; d++) sum[d] += view.Data[offset + d];
      counts[assignments[i]]++;
    }
    const next = new Map<number, Centroid>();
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Empty cluster - keep old centroid
        next.set(c, previous.get(c)!);
        continue;
      }
      const values = sums[c];
      for (let d = 0; d < dims; d++) values[d] /= counts[c];
      next.set(c, { Values: values, NormSq: SumOfSquares(values, 0, dims) });
    }
    return next;
  }

  /** Largest euclidean distance (1 - similarity) any centroid moved. */
  private maxCentroidMovement(oldCentroids: Map<number, Centroid>, newCentroids: Map<number, Centroid>, scorer: MetricScorer): number {
    let maxMovement = 0;
    newCentroids.forEach((newCentroid, clusterId) => {
      const movement = 1 - scorer.EuclideanBetween(oldCentroids.get(clusterId)!, newCentroid);
      maxMovement = Math.max(maxMovement, movement);
    });
    return maxMovement;
  }

  private centroidFromRow(row: number): Centroid {
    const values = Float64Array.from(this.store.CopyRow(row));
    return { Values: values, NormSq: SumOfSquares(values, 0, values.length) };
  }

  /**
   * Check if cluster assignments have converged
   * @private
   */
  private sameAssignments(oldAssignments: Int32Array, newAssignments: Int32Array): boolean {
    // Both cover the same rows, so they always have the same length.
    for (let i = 0; i < newAssignments.length; i++) {
      if (oldAssignments[i] !== newAssignments[i]) return false;
    }
    return true;
  }

  /**
   * Scores rows and centroids with the clustering metric. Subclasses that
   * override a metric method get it honoured here too, row by row.
   */
  private createScorer(metric: DistanceMetric): MetricScorer {
    const view = this.store.View();
    const dims = view.Dims;
    if (this.usesCustomMetric) {
      return {
        RowVsCentroid: (row, centroid) => this.CalculateDistance(this.store.ReadRow(row), Array.from(centroid.Values), metric),
        RowVsRow: (a, b) => this.CalculateDistance(this.store.ReadRow(a), this.store.ReadRow(b), metric),
        EuclideanBetween: (a, b) => this.CalculateDistance(Array.from(a.Values), Array.from(b.Values), 'euclidean'),
      };
    }
    return {
      RowVsCentroid: (row, centroid) =>
        MetricScore(metric, view.Data, row * dims, view.Norms[row], centroid.Values, 0, centroid.NormSq, dims),
      RowVsRow: (a, b) =>
        MetricScore(metric, view.Data, a * dims, view.Norms[a], view.Data, b * dims, view.Norms[b], dims),
      EuclideanBetween: (a, b) => EuclideanScore(a.Values, 0, b.Values, 0, dims),
    };
  }

  /**
   * Performs DBSCAN (Density-Based Spatial Clustering of Applications with Noise) clustering.
   *
   * ## What is DBSCAN?
   * DBSCAN groups together points that are closely packed together (high density),
   * marking points in low-density regions as outliers. Unlike K-Means, it doesn't require
   * specifying the number of clusters beforehand.
   *
   * ## Business Use Cases:
   * - **Fraud Detection**: Identify unusual transaction patterns
   * - **Anomaly Detection**: Find outliers in any dataset
   * - **Customer Behavior**: Find natural groupings without preconceptions
   * - **Geographic Clustering**: Find areas of high activity
   * - **Quality Control**: Identify defective products
   *
   * ## When to Use:
   * ✅ Unknown number of clusters
   * ✅ Non-spherical clusters
   * ✅ Varying cluster densities
   * ✅ Need to identify outliers
   * ✅ Noise in the data
   * ❌ High-dimensional sparse data
   * ❌ Clusters of vastly different densities
   *
   * @param {number} epsilon - Maximum distance between two vectors to be considered neighbors
   * @param {number} minPoints - Minimum number of points to form a dense region
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @param {(metadata: TMetadata) => boolean} [filter] - Optional filter to pre-filter vectors by metadata before clustering
   * @returns {ClusterResult<TMetadata>} Clustering results with outliers identified
   *
   * @example
   * ```typescript
   * // epsilon=0.3 means similarity must be > 0.7
   * const result = service.DBSCANCluster(0.3, 3, 'cosine');
   * console.log(`Found ${result.clusters.size} clusters`);
   * console.log(`Outliers: ${result.outliers?.length || 0}`);
   *
   * // Cluster only active items
   * const activeResult = service.DBSCANCluster(
   *   0.3,
   *   3,
   *   'cosine',
   *   (metadata) => metadata.status === 'Active'
   * );
   * ```
   *
   * @public
   * @method
   */
  public DBSCANCluster(
    epsilon: number,
    minPoints: number,
    metric: DistanceMetric = 'euclidean',
    filter?: (metadata: TMetadata) => boolean
  ): ClusterResult<TMetadata> {
    if (epsilon <= 0 || epsilon >= 1) {
      throw new Error('Epsilon must be between 0 and 1 (exclusive)');
    }
    if (minPoints <= 0) {
      throw new Error('MinPoints must be positive');
    }

    // Pre-filter vectors if filter provided
    const rows = filter ? this.filterRows(filter) : this.store.LiveRows();

    // Build neighborhood map for efficiency (using filtered rows)
    const neighborhoods = this.buildNeighborhoods(rows, 1 - epsilon, metric, filter);

    const visited = new Uint8Array(this.store.RowCount);
    const clustered = new Uint8Array(this.store.RowCount);
    const clusters = new Map<number, string[]>();
    const outliers: number[] = [];
    let clusterId = 0;

    // DBSCAN algorithm
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (visited[row]) continue;
      visited[row] = 1;
      const neighbors = neighborhoods[row]!;

      if (neighbors.length < minPoints) {
        // Mark as noise (may later be added to a cluster)
        outliers.push(row);
      } else {
        // Start a new cluster
        const cluster: string[] = [];
        clusters.set(clusterId, cluster);
        this.expandCluster(row, neighbors, cluster, visited, clustered, neighborhoods, minPoints);
        clusterId++;
      }
    }

    // Remove outliers that were later added to clusters
    const finalOutliers = outliers.filter(row => !clustered[row]).map(row => this.store.KeyAt(row) as string);

    return {
      clusters,
      outliers: finalOutliers,
      metadata: {
        metric,
        silhouetteScore: clusters.size > 0 ? 
          this.SilhouetteScore({ clusters, outliers: finalOutliers }, metric) : 
          undefined
      }
    };
  }

  /**
   * Each row's neighbours — every row in `rows` scoring at least
   * `similarityThreshold` (itself included) — ranked highest first, ties in
   * insertion order. Indexed by row.
   */
  private buildNeighborhoods(
    rows: Int32Array,
    similarityThreshold: number,
    metric: DistanceMetric,
    filter: ((metadata: TMetadata) => boolean) | undefined
  ): Array<Int32Array | undefined> {
    const neighborhoods: Array<Int32Array | undefined> = new Array(this.store.RowCount);
    if (this.usesCustomMetric) {
      for (let i = 0; i < rows.length; i++) {
        const neighbors = this.FindNearest(this.store.ReadRow(rows[i]), rows.length, similarityThreshold, metric, filter);
        neighborhoods[rows[i]] = Int32Array.from(neighbors, n => this.store.RowOf(n.key) as number);
      }
      return neighborhoods;
    }
    const view = this.store.View();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ranked = SearchRows(view, {
        Query: Float64Array.from(view.Data.subarray(row * view.Dims, (row + 1) * view.Dims)),
        QueryNormSq: view.Norms[row],
        Candidates: rows,
        Metric: metric,
        TopK: null,
        Threshold: similarityThreshold,
      });
      neighborhoods[row] = ranked.Rows;
    }
    return neighborhoods;
  }

  /**
   * Expand a cluster in DBSCAN
   * @private
   */
  private expandCluster(
    row: number,
    neighbors: Int32Array,
    cluster: string[],
    visited: Uint8Array,
    clustered: Uint8Array,
    neighborhoods: Array<Int32Array | undefined>,
    minPoints: number
  ): void {
    cluster.push(this.store.KeyAt(row) as string);
    clustered[row] = 1;

    const queue: number[] = Array.from(neighbors);
    for (let head = 0; head < queue.length; head++) {
      const neighborRow = queue[head];

      if (!visited[neighborRow]) {
        visited[neighborRow] = 1;
        const neighborNeighbors = neighborhoods[neighborRow]!;

        if (neighborNeighbors.length >= minPoints) {
          // Add unprocessed neighbors to queue
          for (let j = 0; j < neighborNeighbors.length; j++) {
            if (!visited[neighborNeighbors[j]]) {
              queue.push(neighborNeighbors[j]);
            }
          }
        }
      }

      if (!clustered[neighborRow]) {
        cluster.push(this.store.KeyAt(neighborRow) as string);
        clustered[neighborRow] = 1;
      }
    }
  }

  // ============================================================================
  // PHASE 3: UTILITY METHODS
  // ============================================================================

  /**
   * Finds the centroid (mean) of a set of vectors.
   * 
   * ## What is a Centroid?
   * A centroid is the mean position of all vectors in a group.
   * It represents the "center" of the cluster in vector space.
   * 
   * ## Business Use Cases:
   * - **Representative Selection**: Find the average customer profile
   * - **Summarization**: Create a summary vector for a group
   * - **Cluster Analysis**: Understand cluster characteristics
   * - **Trend Analysis**: Find the average trend across time periods
   * 
   * @param {number[][]} vectors - Array of vectors to find centroid of
   * @returns {number[]} The centroid vector
   * 
   * @example
   * ```typescript
   * const vectors = [[1, 2], [3, 4], [5, 6]];
   * const centroid = service.FindCentroid(vectors);
   * // Returns [3, 4] (mean of each dimension)
   * ```
   * 
   * @public
   * @method
   */
  public FindCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      throw new Error('Cannot find centroid of empty vector set');
    }

    const dimensions = vectors[0].length;
    const centroid = new Array(dimensions).fill(0);

    vectors.forEach(vector => {
      if (vector.length !== dimensions) {
        throw new Error('All vectors must have the same dimensions');
      }
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += vector[i];
      }
    });

    // Calculate mean
    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= vectors.length;
    }

    return centroid;
  }

  /**
   * Calculates the average within-cluster distance for a clustering result.
   * Lower values indicate tighter, more cohesive clusters.
   * 
   * ## What is Within-Cluster Distance?
   * Measures how close points are to other points in the same cluster.
   * Also known as cluster cohesion or compactness.
   * 
   * ## Business Interpretation:
   * - **Low value**: Tight, well-defined groups (good)
   * - **High value**: Loose, scattered groups (may need more clusters)
   * 
   * @param {ClusterResult<TMetadata>} clusterResult - The clustering result
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @returns {number} Average within-cluster distance (0-1, lower is better)
   * 
   * @example
   * ```typescript
   * const result = service.KMeansCluster(3);
   * const cohesion = service.WithinClusterDistance(result);
   * console.log(`Cluster cohesion: ${cohesion.toFixed(3)}`);
   * ```
   * 
   * @public
   * @method
   */
  public WithinClusterDistance(
    clusterResult: ClusterResult<TMetadata>,
    metric: DistanceMetric = 'euclidean'
  ): number {
    let totalDistance = 0;
    let totalPairs = 0;
    const scorer = this.createScorer(metric);

    clusterResult.clusters.forEach((members) => {
      const rows = this.rowsForKeys(members);
      // Calculate pairwise distances within cluster
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          if (rows[i] >= 0 && rows[j] >= 0) {
            // Convert similarity to distance
            totalDistance += 1 - scorer.RowVsRow(rows[i], rows[j]);
            totalPairs++;
          }
        }
      }
    });

    return totalPairs > 0 ? totalDistance / totalPairs : 0;
  }

  /**
   * Calculates the average between-cluster distance for a clustering result.
   * Higher values indicate better cluster separation.
   * 
   * ## What is Between-Cluster Distance?
   * Measures how far apart different clusters are from each other.
   * Also known as cluster separation.
   * 
   * ## Business Interpretation:
   * - **High value**: Well-separated groups (good)
   * - **Low value**: Overlapping groups (may have too many clusters)
   * 
   * @param {ClusterResult<TMetadata>} clusterResult - The clustering result
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @returns {number} Average between-cluster distance (0-1, higher is better)
   * 
   * @example
   * ```typescript
   * const result = service.KMeansCluster(3);
   * const separation = service.BetweenClusterDistance(result);
   * console.log(`Cluster separation: ${separation.toFixed(3)}`);
   * ```
   * 
   * @public
   * @method
   */
  public BetweenClusterDistance(
    clusterResult: ClusterResult<TMetadata>,
    metric: DistanceMetric = 'euclidean'
  ): number {
    const clusterIds = Array.from(clusterResult.clusters.keys());
    
    if (clusterIds.length < 2) {
      return 0; // No between-cluster distance with single cluster
    }

    let totalDistance = 0;
    let totalPairs = 0;
    const scorer = this.createScorer(metric);

    // Calculate distances between all pairs of clusters
    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        const rows1 = this.rowsForKeys(clusterResult.clusters.get(clusterIds[i])!);
        const rows2 = this.rowsForKeys(clusterResult.clusters.get(clusterIds[j])!);

        // Calculate average distance between all pairs across clusters
        for (let a = 0; a < rows1.length; a++) {
          for (let b = 0; b < rows2.length; b++) {
            if (rows1[a] >= 0 && rows2[b] >= 0) {
              totalDistance += 1 - scorer.RowVsRow(rows1[a], rows2[b]);
              totalPairs++;
            }
          }
        }
      }
    }

    return totalPairs > 0 ? totalDistance / totalPairs : 0;
  }

  /**
   * Calculates the Silhouette Score for a clustering result.
   * Measures how similar a point is to its own cluster compared to other clusters.
   * 
   * ## What is Silhouette Score?
   * A measure of how appropriate the clustering is, combining both cohesion and separation.
   * Ranges from -1 to 1, where:
   * - **1**: Perfect clustering (tight, well-separated clusters)
   * - **0**: Overlapping clusters
   * - **-1**: Wrong clustering (points assigned to wrong clusters)
   * 
   * ## Business Interpretation:
   * - **0.7-1.0**: Strong clustering structure
   * - **0.5-0.7**: Reasonable structure
   * - **0.25-0.5**: Weak structure
   * - **< 0.25**: No meaningful structure
   * 
   * @param {ClusterResult<TMetadata>} clusterResult - The clustering result
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @returns {number} Silhouette score (-1 to 1, higher is better)
   * 
   * @example
   * ```typescript
   * const result = service.KMeansCluster(3);
   * const score = service.SilhouetteScore(result);
   * if (score > 0.7) {
   *   console.log('Excellent clustering!');
   * }
   * ```
   * 
   * @public
   * @method
   */
  public SilhouetteScore(
    clusterResult: ClusterResult<TMetadata>,
    metric: DistanceMetric = 'euclidean'
  ): number {
    const scores: number[] = [];
    const scorer = this.createScorer(metric);
    const rowsByCluster = new Map<number, Int32Array>();
    clusterResult.clusters.forEach((members, clusterId) => rowsByCluster.set(clusterId, this.rowsForKeys(members)));

    clusterResult.clusters.forEach((members, clusterId) => {
      const memberRows = rowsByCluster.get(clusterId)!;
      for (let m = 0; m < members.length; m++) {
        const row = memberRows[m];
        if (row < 0) continue;

        // Calculate a(i): average distance to other points in same cluster
        let a = 0;
        if (members.length > 1) {
          let sum = 0;
          let count = 0;
          for (let o = 0; o < members.length; o++) {
            if (members[o] === members[m]) continue;
            sum += memberRows[o] >= 0 ? 1 - scorer.RowVsRow(row, memberRows[o]) : 0;
            count++;
          }
          a = sum / count;
        }

        // Calculate b(i): minimum average distance to points in other clusters
        let b = Infinity;
        rowsByCluster.forEach((otherRows, otherClusterId) => {
          if (otherClusterId === clusterId || otherRows.length === 0) return;
          let sum = 0;
          for (let o = 0; o < otherRows.length; o++) {
            sum += otherRows[o] >= 0 ? 1 - scorer.RowVsRow(row, otherRows[o]) : 0;
          }
          b = Math.min(b, sum / otherRows.length);
        });

        // Calculate silhouette coefficient for this point
        if (b !== Infinity) {
          const s = (b - a) / Math.max(a, b);
          scores.push(s);
        }
      }
    });
    
    // Return average silhouette score
    return scores.length > 0 ? 
      scores.reduce((sum, s) => sum + s, 0) / scores.length : 
      0;
  }

  /**
   * Finds the optimal number of clusters using the elbow method.
   * Tests different values of k and returns their inertias.
   * 
   * ## What is the Elbow Method?
   * A technique to find the optimal number of clusters by plotting inertia vs k.
   * The "elbow" point where inertia stops decreasing rapidly suggests the optimal k.
   * 
   * ## How to Use:
   * 1. Run this method with a range of k values
   * 2. Plot inertia (y-axis) vs k (x-axis)
   * 3. Look for the "elbow" where the curve flattens
   * 4. Choose k at the elbow point
   * 
   * @param {number} minK - Minimum number of clusters to test
   * @param {number} maxK - Maximum number of clusters to test
   * @param {DistanceMetric} [metric='euclidean'] - Distance metric to use
   * @returns {Map<number, number>} Map of k values to inertias
   * 
   * @example
   * ```typescript
   * const elbowData = service.ElbowMethod(2, 10);
   * elbowData.forEach((inertia, k) => {
   *   console.log(`k=${k}: inertia=${inertia.toFixed(2)}`);
   * });
   * // Look for the "elbow" in the results
   * ```
   * 
   * @public
   * @method
   */
  public ElbowMethod(
    minK: number,
    maxK: number,
    metric: DistanceMetric = 'euclidean'
  ): Map<number, number> {
    if (minK < 1 || maxK > this.store.Size || minK > maxK) {
      throw new Error('Invalid k range');
    }

    const results = new Map<number, number>();
    
    for (let k = minK; k <= maxK; k++) {
      const clusterResult = this.KMeansCluster(k, 100, metric);
      results.set(k, clusterResult.metadata?.inertia || 0);
    }
    
    return results;
  }

  /**
   * Async form of {@link KMeansCluster} with identical arguments and results.
   * On a server host with a worker-pool accelerator the whole run — including
   * the O(n²) silhouette score — happens on a worker thread, so a large
   * clustering request does not stall every other request on the process.
   *
   * @public
   * @method
   */
  public async KMeansClusterAsync(
    k: number,
    maxIterations: number = 100,
    metric: DistanceMetric = 'euclidean',
    tolerance: number = 0.0001
  ): Promise<ClusterResult<TMetadata>> {
    if (k <= 0 || k > this.store.Size) {
      throw new Error(`Invalid k: ${k}. Must be between 1 and ${this.store.Size}`);
    }
    if (this.usesCustomMetric) return this.KMeansCluster(k, maxIterations, metric, tolerance);
    const keys = this.store.Keys;
    const offloaded = await this.accelerator.ClusterAsync({
      Snapshot: this.store.Snapshot(), Candidates: null, Algorithm: 'kmeans',
      Metric: metric, K: k, MaxIterations: maxIterations, Tolerance: tolerance,
    });
    return offloaded ? this.clusterResultFromRows(offloaded, keys, metric) : this.KMeansCluster(k, maxIterations, metric, tolerance);
  }

  /**
   * Async form of {@link DBSCANCluster} with identical arguments and results.
   * The metadata filter runs on the calling thread; the O(n²) neighbourhood
   * scan and the silhouette score run on a worker when one is available.
   *
   * @public
   * @method
   */
  public async DBSCANClusterAsync(
    epsilon: number,
    minPoints: number,
    metric: DistanceMetric = 'euclidean',
    filter?: (metadata: TMetadata) => boolean
  ): Promise<ClusterResult<TMetadata>> {
    if (epsilon <= 0 || epsilon >= 1) {
      throw new Error('Epsilon must be between 0 and 1 (exclusive)');
    }
    if (minPoints <= 0) {
      throw new Error('MinPoints must be positive');
    }
    if (this.usesCustomMetric) return this.DBSCANCluster(epsilon, minPoints, metric, filter);
    const keys = this.store.Keys;
    const offloaded = await this.accelerator.ClusterAsync({
      Snapshot: this.store.Snapshot(), Candidates: filter ? this.filterRows(filter) : null, Algorithm: 'dbscan',
      Metric: metric, Epsilon: epsilon, MinPoints: minPoints,
    });
    return offloaded ? this.clusterResultFromRows(offloaded, keys, metric) : this.DBSCANCluster(epsilon, minPoints, metric, filter);
  }

  /** Converts a key-based result whose keys are `String(row)` (see {@link FromRowsView}) into rows. */
  private static clusterResultToRows(result: ClusterResult<Record<string, unknown>>): VectorClusterJobResult {
    const toRows = (keys: string[]): Int32Array => Int32Array.from(keys, key => Number(key));
    const clusters = new Map<number, Int32Array>();
    result.clusters.forEach((keys, id) => clusters.set(id, toRows(keys)));
    return {
      Clusters: clusters,
      Centroids: result.centroids ?? null,
      Outliers: result.outliers ? toRows(result.outliers) : null,
      Iterations: result.metadata?.iterations,
      Inertia: result.metadata?.inertia,
      SilhouetteScore: result.metadata?.silhouetteScore,
    };
  }

  /** Maps an off-thread result back to keys using the row→key array captured at dispatch. */
  private clusterResultFromRows(
    result: VectorClusterJobResult,
    keysAtDispatch: ReadonlyArray<string | null>,
    metric: DistanceMetric
  ): ClusterResult<TMetadata> {
    const toKeys = (rows: Int32Array): string[] => Array.from(rows, row => keysAtDispatch[row] as string);
    const clusters = new Map<number, string[]>();
    result.Clusters.forEach((rows, id) => clusters.set(id, toKeys(rows)));
    const mapped: ClusterResult<TMetadata> = {
      clusters,
      metadata: { metric, silhouetteScore: result.SilhouetteScore },
    };
    if (result.Centroids) mapped.centroids = result.Centroids;
    if (result.Outliers) mapped.outliers = toKeys(result.Outliers);
    if (result.Iterations !== undefined) mapped.metadata!.iterations = result.Iterations;
    if (result.Inertia !== undefined) mapped.metadata!.inertia = result.Inertia;
    return mapped;
  }

  /** Current rows for `keys`, -1 where a key is not stored. */
  private rowsForKeys(keys: string[]): Int32Array {
    const rows = new Int32Array(keys.length);
    for (let i = 0; i < keys.length; i++) {
      rows[i] = this.store.RowOf(keys[i]) ?? -1;
    }
    return rows;
  }
}
