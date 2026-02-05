import { LogError } from '@memberjunction/core';

/**
 * Supported distance/similarity metrics for vector operations
 */
export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan' | 'dotproduct' | 'jaccard' | 'hamming';

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
  private vectors: Map<string, VectorEntry<TMetadata>> = new Map();
  private expectedDimensions: number | null = null;
  
  /**
   * Loads vectors into memory. Can accept either an array of VectorEntry objects
   * or a Map where keys are identifiers and values are vector arrays.
   * 
   * @param {VectorEntry<TMetadata>[] | Map<string, number[]>} entries - The vectors to load
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
  public LoadVectors(entries: VectorEntry<TMetadata>[] | Map<string, number[]>): void {
    if (!entries) {
      throw new Error('Entries cannot be null or undefined');
    }

    if (entries instanceof Map) {
      entries.forEach((vector, key) => {
        this.validateAndSetDimensions(vector);
        this.vectors.set(key, { key, vector } as VectorEntry<TMetadata>);
      });
    } else {
      entries.forEach(entry => {
        this.validateAndSetDimensions(entry.vector);
        this.vectors.set(entry.key, entry);
      });
    }
  }
  
  /**
   * Adds or updates a single vector in the service
   * 
   * @param {string} key - The unique identifier for the vector
   * @param {number[]} vector - The vector/embedding array
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
  public AddVector(key: string, vector: number[], metadata?: TMetadata): void {
    if (!key) {
      throw new Error('Key cannot be null or undefined');
    }
    if (!vector || vector.length === 0) {
      throw new Error('Vector cannot be null, undefined, or empty');
    }

    this.validateAndSetDimensions(vector);
    this.vectors.set(key, { key, vector, metadata });
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
    if (!queryVector || queryVector.length === 0) {
      throw new Error('Query vector cannot be null, undefined, or empty');
    }

    // Pre-filter vectors by metadata BEFORE similarity calculation
    const candidateVectors = filter
      ? Array.from(this.vectors.values()).filter(entry => entry.metadata && filter(entry.metadata))
      : Array.from(this.vectors.values());

    // Calculate similarity ONLY for filtered candidates
    const results = candidateVectors
      .map(entry => {
        try {
          return {
            key: entry.key,
            score: this.CalculateDistance(queryVector, entry.vector, metric),
            metadata: entry.metadata
          };
        } catch (error) {
          // Log error and skip this entry
          LogError(`Error calculating ${metric} similarity for key ${entry.key}: ${error}`);
          return null;
        }
      })
      .filter(result => result !== null)
      .filter(result => threshold == null || result!.score >= threshold)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, topK) as VectorSearchResult<TMetadata>[];

    return results;
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
    const sourceVector = this.vectors.get(key);
    if (!sourceVector) {
      throw new Error(`Vector with key "${key}" not found`);
    }

    // Get topK + 1 to account for excluding self
    return this.FindNearest(sourceVector.vector, topK + 1, threshold, metric, filter)
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
    const v1 = this.vectors.get(key1);
    const v2 = this.vectors.get(key2);
    
    if (!v1) {
      throw new Error(`Vector with key "${key1}" not found`);
    }
    if (!v2) {
      throw new Error(`Vector with key "${key2}" not found`);
    }
    
    return this.CosineSimilarity(v1.vector, v2.vector);
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
    
    // Initialize our three accumulator variables:
    // - dotProduct: Sum of element-wise products (measures alignment)
    // - normA: Sum of squares for vector A (used to calculate magnitude)
    // - normB: Sum of squares for vector B (used to calculate magnitude)
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    // Single pass through both vectors to calculate all needed values
    // This is more efficient than multiple loops
    for (let i = 0; i < a.length; i++) {
      // Dot product: Multiply corresponding elements and sum them
      // This measures how much the vectors "agree" at each dimension
      dotProduct += a[i] * b[i];
      
      // Calculate sum of squares for each vector
      // These will be used to normalize the dot product
      normA += a[i] * a[i];  // Same as Math.pow(a[i], 2) but faster
      normB += b[i] * b[i];  // Same as Math.pow(b[i], 2) but faster
    }
    
    // Handle edge case: Zero vectors (all elements are 0)
    // A zero vector has no direction, so similarity is undefined
    // We return 0 by convention (neither similar nor dissimilar)
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    // Final calculation: Normalize the dot product by the magnitudes
    // Math.sqrt(normA) = magnitude of vector A (||A||)
    // Math.sqrt(normB) = magnitude of vector B (||B||)
    // This gives us the cosine of the angle between the vectors
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
    
    let sumSquaredDiff = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sumSquaredDiff += diff * diff;
    }
    
    const distance = Math.sqrt(sumSquaredDiff);
    // Normalize to 0-1 range: closer = higher score
    return 1 / (1 + distance);
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
    
    let sumAbsDiff = 0;
    for (let i = 0; i < a.length; i++) {
      sumAbsDiff += Math.abs(a[i] - b[i]);
    }
    
    // Normalize to 0-1 range
    return 1 / (1 + sumAbsDiff);
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
    
    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    
    // Normalize using tanh for bounded output
    // Scale factor based on expected vector dimensions
    const scale = Math.sqrt(a.length);
    const normalized = Math.tanh(dotProduct / scale);
    
    // Convert from [-1, 1] to [0, 1]
    return (normalized + 1) / 2;
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
    
    let intersection = 0;
    let union = 0;
    
    for (let i = 0; i < a.length; i++) {
      const aPresent = a[i] !== 0;
      const bPresent = b[i] !== 0;
      
      if (aPresent && bPresent) {
        intersection++;
      }
      if (aPresent || bPresent) {
        union++;
      }
    }
    
    // Handle edge case: both vectors are all zeros
    if (union === 0) {
      return 1; // Consider empty sets as identical
    }
    
    return intersection / union;
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
    
    let differences = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        differences++;
      }
    }
    
    // Normalize to similarity score (1 = identical, 0 = all different)
    return 1 - (differences / a.length);
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
    return this.vectors.size;
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
    this.vectors.clear();
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
    return this.vectors.has(key);
  }
  
  /**
   * Retrieves a specific vector by its key
   * 
   * @param {string} key - The key of the vector to retrieve
   * @returns {number[] | undefined} The vector array, or undefined if not found
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
    return this.vectors.get(key)?.vector;
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
    return this.vectors.get(key)?.metadata;
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
  public UpdateVector(key: string, updates: { vector?: number[]; metadata?: TMetadata }): boolean {
    const existing = this.vectors.get(key);
    if (!existing) {
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
      existing.vector = updates.vector;
    }

    if (updates.metadata != null) {
      existing.metadata = updates.metadata;
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
  public AddOrUpdateVector(key: string, vector: number[], metadata?: TMetadata): boolean {
    if (!key) {
      throw new Error('Key cannot be null or undefined');
    }
    if (!vector || vector.length === 0) {
      throw new Error('Vector cannot be null, undefined, or empty');
    }

    const exists = this.vectors.has(key);
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
    return this.vectors.delete(key);
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
    return Array.from(this.vectors.keys());
  }

  /**
   * Exports all vectors as an array of VectorEntry objects.
   * Useful for persistence or transferring data.
   * 
   * @returns {VectorEntry<TMetadata>[]} Array of all vector entries
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
    return Array.from(this.vectors.values());
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
  private validateAndSetDimensions(vector: number[]): void {
    if (this.expectedDimensions === null) {
      // First vector sets the expected dimensions
      this.expectedDimensions = vector.length;
    } else if (vector.length !== this.expectedDimensions) {
      throw new Error(
        `Vector dimension mismatch. Expected ${this.expectedDimensions} dimensions, got ${vector.length}. ` +
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
    return this.FindNearest(queryVector, this.vectors.size, threshold, metric, filter);
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
    if (k <= 0 || k > this.vectors.size) {
      throw new Error(`Invalid k: ${k}. Must be between 1 and ${this.vectors.size}`);
    }

    const entries = Array.from(this.vectors.values());
    if (entries.length === 0) {
      throw new Error('No vectors loaded for clustering');
    }

    // Initialize centroids using K-Means++
    const centroids = this.initializeKMeansPlusPlus(entries, k, metric);
    let assignments = new Map<string, number>();
    let iterations = 0;
    let converged = false;

    while (iterations < maxIterations && !converged) {
      // Assignment step: assign each point to nearest centroid
      const newAssignments = new Map<string, number>();
      entries.forEach(entry => {
        let minDistance = Infinity;
        let assignedCluster = 0;
        
        centroids.forEach((centroid, clusterId) => {
          const distance = 1 - this.CalculateDistance(entry.vector, centroid, metric);
          if (distance < minDistance) {
            minDistance = distance;
            assignedCluster = clusterId;
          }
        });
        
        newAssignments.set(entry.key, assignedCluster);
      });

      // Check for convergence
      converged = this.checkConvergence(assignments, newAssignments);
      assignments = newAssignments;

      if (!converged) {
        // Update step: recalculate centroids
        const newCentroids = new Map<number, number[]>();
        
        for (let clusterId = 0; clusterId < k; clusterId++) {
          const clusterMembers = entries.filter(e => assignments.get(e.key) === clusterId);
          if (clusterMembers.length > 0) {
            newCentroids.set(clusterId, this.FindCentroid(clusterMembers.map(m => m.vector)));
          } else {
            // Empty cluster - keep old centroid
            newCentroids.set(clusterId, centroids.get(clusterId)!);
          }
        }

        // Check if centroids moved significantly
        let maxCentroidMovement = 0;
        newCentroids.forEach((newCentroid, clusterId) => {
          const oldCentroid = centroids.get(clusterId)!;
          const movement = 1 - this.CalculateDistance(oldCentroid, newCentroid, 'euclidean');
          maxCentroidMovement = Math.max(maxCentroidMovement, movement);
        });

        if (maxCentroidMovement < tolerance) {
          converged = true;
        }

        centroids.clear();
        newCentroids.forEach((centroid, id) => centroids.set(id, centroid));
      }

      iterations++;
    }

    // Build result
    const clusters = new Map<number, string[]>();
    for (let i = 0; i < k; i++) {
      clusters.set(i, []);
    }
    
    assignments.forEach((clusterId, key) => {
      clusters.get(clusterId)!.push(key);
    });

    // Calculate inertia (sum of squared distances to centroids)
    let inertia = 0;
    entries.forEach(entry => {
      const clusterId = assignments.get(entry.key)!;
      const centroid = centroids.get(clusterId)!;
      const distance = 1 - this.CalculateDistance(entry.vector, centroid, metric);
      inertia += distance * distance;
    });

    return {
      clusters,
      centroids,
      metadata: {
        metric,
        iterations,
        inertia,
        silhouetteScore: this.SilhouetteScore({ clusters, centroids }, metric)
      }
    };
  }

  /**
   * K-Means++ initialization for better starting centroids.
   * Chooses initial centroids that are far apart from each other.
   * 
   * @private
   */
  private initializeKMeansPlusPlus(
    entries: VectorEntry<TMetadata>[],
    k: number,
    metric: DistanceMetric
  ): Map<number, number[]> {
    const centroids = new Map<number, number[]>();
    
    // Choose first centroid randomly
    const firstIdx = Math.floor(Math.random() * entries.length);
    centroids.set(0, [...entries[firstIdx].vector]);

    // Choose remaining centroids
    for (let i = 1; i < k; i++) {
      const distances = entries.map(entry => {
        let minDist = Infinity;
        centroids.forEach(centroid => {
          const dist = 1 - this.CalculateDistance(entry.vector, centroid, metric);
          minDist = Math.min(minDist, dist);
        });
        return minDist;
      });

      // Choose next centroid with probability proportional to squared distance
      const sumSquaredDist = distances.reduce((sum, d) => sum + d * d, 0);
      let threshold = Math.random() * sumSquaredDist;
      let cumSum = 0;
      
      for (let j = 0; j < entries.length; j++) {
        cumSum += distances[j] * distances[j];
        if (cumSum >= threshold) {
          centroids.set(i, [...entries[j].vector]);
          break;
        }
      }
    }

    return centroids;
  }

  /**
   * Check if cluster assignments have converged
   * @private
   */
  private checkConvergence(
    oldAssignments: Map<string, number>,
    newAssignments: Map<string, number>
  ): boolean {
    if (oldAssignments.size !== newAssignments.size) return false;
    
    for (const [key, clusterId] of newAssignments) {
      if (oldAssignments.get(key) !== clusterId) {
        return false;
      }
    }
    
    return true;
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
    const entries = filter
      ? Array.from(this.vectors.values()).filter(entry => entry.metadata && filter(entry.metadata))
      : Array.from(this.vectors.values());

    const visited = new Set<string>();
    const clustered = new Set<string>();
    const clusters = new Map<number, string[]>();
    const outliers: string[] = [];
    let clusterId = 0;

    // Build neighborhood map for efficiency (using filtered entries)
    const neighborhoods = new Map<string, string[]>();
    entries.forEach(entry => {
      const neighbors = this.FindNearest(
        entry.vector,
        entries.length,  // Search within filtered space
        1 - epsilon, // Convert epsilon to similarity threshold
        metric,
        filter  // Apply same filter to neighborhood search
      ).map(r => r.key);
      neighborhoods.set(entry.key, neighbors);
    });

    // DBSCAN algorithm
    entries.forEach(entry => {
      if (visited.has(entry.key)) return;
      
      visited.add(entry.key);
      const neighbors = neighborhoods.get(entry.key)!;
      
      if (neighbors.length < minPoints) {
        // Mark as noise (may later be added to a cluster)
        outliers.push(entry.key);
      } else {
        // Start a new cluster
        const cluster: string[] = [];
        clusters.set(clusterId, cluster);
        
        this.expandCluster(
          entry.key,
          neighbors,
          cluster,
          visited,
          clustered,
          neighborhoods,
          minPoints,
          outliers
        );
        
        clusterId++;
      }
    });

    // Remove outliers that were later added to clusters
    const finalOutliers = outliers.filter(key => !clustered.has(key));

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
   * Expand a cluster in DBSCAN
   * @private
   */
  private expandCluster(
    key: string,
    neighbors: string[],
    cluster: string[],
    visited: Set<string>,
    clustered: Set<string>,
    neighborhoods: Map<string, string[]>,
    minPoints: number,
    outliers: string[]
  ): void {
    cluster.push(key);
    clustered.add(key);
    
    const queue = [...neighbors];
    
    while (queue.length > 0) {
      const neighborKey = queue.shift()!;
      
      if (!visited.has(neighborKey)) {
        visited.add(neighborKey);
        const neighborNeighbors = neighborhoods.get(neighborKey)!;
        
        if (neighborNeighbors.length >= minPoints) {
          // Add unprocessed neighbors to queue
          neighborNeighbors.forEach(nn => {
            if (!visited.has(nn)) {
              queue.push(nn);
            }
          });
        }
      }
      
      if (!clustered.has(neighborKey)) {
        cluster.push(neighborKey);
        clustered.add(neighborKey);
        
        // Remove from outliers if it was there
        const outlierIdx = outliers.indexOf(neighborKey);
        if (outlierIdx !== -1) {
          outliers.splice(outlierIdx, 1);
        }
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

    clusterResult.clusters.forEach((members) => {
      // Calculate pairwise distances within cluster
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const vec1 = this.vectors.get(members[i])?.vector;
          const vec2 = this.vectors.get(members[j])?.vector;
          
          if (vec1 && vec2) {
            // Convert similarity to distance
            totalDistance += 1 - this.CalculateDistance(vec1, vec2, metric);
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

    // Calculate distances between all pairs of clusters
    for (let i = 0; i < clusterIds.length; i++) {
      for (let j = i + 1; j < clusterIds.length; j++) {
        const cluster1 = clusterResult.clusters.get(clusterIds[i])!;
        const cluster2 = clusterResult.clusters.get(clusterIds[j])!;
        
        // Calculate average distance between all pairs across clusters
        cluster1.forEach(key1 => {
          cluster2.forEach(key2 => {
            const vec1 = this.vectors.get(key1)?.vector;
            const vec2 = this.vectors.get(key2)?.vector;
            
            if (vec1 && vec2) {
              totalDistance += 1 - this.CalculateDistance(vec1, vec2, metric);
              totalPairs++;
            }
          });
        });
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
    
    clusterResult.clusters.forEach((members, clusterId) => {
      members.forEach(key => {
        const vector = this.vectors.get(key)?.vector;
        if (!vector) return;
        
        // Calculate a(i): average distance to other points in same cluster
        let a = 0;
        if (members.length > 1) {
          const sameClusterDistances = members
            .filter(k => k !== key)
            .map(k => {
              const otherVec = this.vectors.get(k)?.vector;
              return otherVec ? 1 - this.CalculateDistance(vector, otherVec, metric) : 0;
            });
          a = sameClusterDistances.reduce((sum, d) => sum + d, 0) / sameClusterDistances.length;
        }
        
        // Calculate b(i): minimum average distance to points in other clusters
        let b = Infinity;
        clusterResult.clusters.forEach((otherMembers, otherClusterId) => {
          if (otherClusterId === clusterId) return;
          
          const otherClusterDistances = otherMembers.map(k => {
            const otherVec = this.vectors.get(k)?.vector;
            return otherVec ? 1 - this.CalculateDistance(vector, otherVec, metric) : 0;
          });
          
          if (otherClusterDistances.length > 0) {
            const avgDist = otherClusterDistances.reduce((sum, d) => sum + d, 0) / otherClusterDistances.length;
            b = Math.min(b, avgDist);
          }
        });
        
        // Calculate silhouette coefficient for this point
        if (b !== Infinity) {
          const s = (b - a) / Math.max(a, b);
          scores.push(s);
        }
      });
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
    if (minK < 1 || maxK > this.vectors.size || minK > maxK) {
      throw new Error('Invalid k range');
    }

    const results = new Map<number, number>();
    
    for (let k = minK; k <= maxK; k++) {
      const clusterResult = this.KMeansCluster(k, 100, metric);
      results.set(k, clusterResult.metadata?.inertia || 0);
    }
    
    return results;
  }
}