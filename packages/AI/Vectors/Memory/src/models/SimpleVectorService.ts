import { LogError } from '@memberjunction/core';

/**
 * Supported distance/similarity metrics for vector operations
 */
export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan' | 'dotproduct' | 'jaccard' | 'hamming';

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
   * ```
   * 
   * @public
   * @method
   */
  public FindNearest(
    queryVector: number[], 
    topK: number = 10, 
    threshold?: number,
    metric: DistanceMetric = 'cosine'
  ): VectorSearchResult<TMetadata>[] {
    if (!queryVector || queryVector.length === 0) {
      throw new Error('Query vector cannot be null, undefined, or empty');
    }

    const results = Array.from(this.vectors.values())
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
   * ```
   * 
   * @public
   * @method
   */
  public FindSimilar(
    key: string, 
    topK: number = 10, 
    threshold?: number,
    metric: DistanceMetric = 'cosine'
  ): VectorSearchResult<TMetadata>[] {
    const sourceVector = this.vectors.get(key);
    if (!sourceVector) {
      throw new Error(`Vector with key "${key}" not found`);
    }
    
    // Get topK + 1 to account for excluding self
    return this.FindNearest(sourceVector.vector, topK + 1, threshold, metric)
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
   * @returns {VectorSearchResult<TMetadata>[]} Array of search results sorted by similarity
   * 
   * @example
   * ```typescript
   * // Find all highly similar items (similarity > 0.8)
   * const similar = service.FindAboveThreshold(queryVector, 0.8);
   * 
   * // Find all items with Jaccard similarity > 0.5
   * const matches = service.FindAboveThreshold(features, 0.5, 'jaccard');
   * ```
   * 
   * @public
   * @method
   */
  public FindAboveThreshold(
    queryVector: number[], 
    threshold: number,
    metric: DistanceMetric = 'cosine'
  ): VectorSearchResult<TMetadata>[] {
    return this.FindNearest(queryVector, this.vectors.size, threshold, metric);
  }
}