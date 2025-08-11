import { LogError } from '@memberjunction/core';

/**
 * Represents a vector entry with a unique key and associated embedding
 */
export interface VectorEntry {
  /** User-defined unique identifier for the vector */
  key: string;
  /** The embedding/vector as an array of numbers */
  vector: number[];
  /** Optional metadata associated with the vector */
  metadata?: any;
}

/**
 * Search result returned from vector similarity operations
 */
export interface VectorSearchResult {
  /** The unique key of the matched vector */
  key: string;
  /** Similarity score (0-1 for cosine similarity, where 1 is most similar) */
  score: number;
  /** Optional metadata associated with the matched vector */
  metadata?: any;
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
export class SimpleVectorService {
  private vectors: Map<string, VectorEntry> = new Map();
  
  /**
   * Loads vectors into memory. Can accept either an array of VectorEntry objects
   * or a Map where keys are identifiers and values are vector arrays.
   * 
   * @param {VectorEntry[] | Map<string, number[]>} entries - The vectors to load
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
  public LoadVectors(entries: VectorEntry[] | Map<string, number[]>): void {
    if (!entries) {
      throw new Error('Entries cannot be null or undefined');
    }

    if (entries instanceof Map) {
      entries.forEach((vector, key) => {
        this.vectors.set(key, { key, vector });
      });
    } else {
      entries.forEach(entry => {
        this.vectors.set(entry.key, entry);
      });
    }
  }
  
  /**
   * Adds or updates a single vector in the service
   * 
   * @param {VectorEntry} entry - The vector entry containing key, vector, and optional metadata
   * @throws {Error} If entry is null/undefined, or if key or vector is invalid
   * 
   * @example
   * ```typescript
   * service.AddVector({
   *   key: 'product123',
   *   vector: [0.1, 0.2, 0.3],
   *   metadata: {
   *     name: 'Product Name',
   *     category: 'Electronics'
   *   }
   * });
   * ```
   * 
   * @public
   * @method
   */
  public AddVector(key: string, vector: number[], metadata?: any): void {
    if (!key) {
      throw new Error('Key cannot be null or undefined');
    }
    if (!vector || vector.length === 0) {
      throw new Error('Vector cannot be null, undefined, or empty');
    }

    this.vectors.set(key, { key, vector, metadata });
  }
  
  /**
   * Finds the K nearest neighbors to a query vector using cosine similarity
   * 
   * @param {number[]} queryVector - The vector to search for similar items
   * @param {number} [topK=10] - Number of nearest neighbors to return
   * @returns {VectorSearchResult[]} Array of search results sorted by similarity (highest first)
   * @throws {Error} If queryVector is null/undefined or empty
   * 
   * @example
   * ```typescript
   * const queryEmbedding = [0.15, 0.25, 0.35];
   * const nearestItems = service.FindNearest(queryEmbedding, 5);
   * nearestItems.forEach(item => {
   *   console.log(`${item.key}: ${item.score}`);
   * });
   * ```
   * 
   * @public
   * @method
   */
  public FindNearest(queryVector: number[], topK: number = 10): VectorSearchResult[] {
    if (!queryVector || queryVector.length === 0) {
      throw new Error('Query vector cannot be null, undefined, or empty');
    }

    const results = Array.from(this.vectors.values())
      .map(entry => {
        try {
          return {
            key: entry.key,
            score: this.CosineSimilarity(queryVector, entry.vector),
            metadata: entry.metadata
          };
        } catch (error) {
          // Log error and skip this entry
          LogError(`Error calculating similarity for key ${entry.key}: ${error}`);
          return null;
        }
      })
      .filter(result => result !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    
    return results;
  }
  
  /**
   * Finds vectors similar to an existing vector identified by its key.
   * The source vector itself is excluded from the results.
   * 
   * @param {string} key - The key of the source vector
   * @param {number} [topK=10] - Number of similar vectors to return
   * @returns {VectorSearchResult[]} Array of similar vectors sorted by similarity
   * @throws {Error} If the key doesn't exist in the service
   * 
   * @example
   * ```typescript
   * // Find items similar to 'product123'
   * const similarProducts = service.FindSimilar('product123', 5);
   * ```
   * 
   * @public
   * @method
   */
  public FindSimilar(key: string, topK: number = 10): VectorSearchResult[] {
    const sourceVector = this.vectors.get(key);
    if (!sourceVector) {
      throw new Error(`Vector with key "${key}" not found`);
    }
    
    // Get topK + 1 to account for excluding self
    return this.FindNearest(sourceVector.vector, topK + 1)
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
   * Calculates cosine similarity between two vectors.
   * Returns a value between -1 and 1, where 1 means identical direction,
   * 0 means perpendicular, and -1 means opposite direction.
   * 
   * @param {number[]} a - First vector
   * @param {number[]} b - Second vector
   * @returns {number} Cosine similarity score
   * @throws {Error} If vectors have different dimensions
   * 
   * @protected
   * @method
   */
  protected CosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vectors must have same dimensions. Got ${a.length} and ${b.length}`);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    // Handle zero vectors
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
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
   * @returns {any | undefined} The metadata, or undefined if not found
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
  public GetMetadata(key: string): any | undefined {
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
   * @returns {VectorEntry[]} Array of all vector entries
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
  public ExportVectors(): VectorEntry[] {
    return Array.from(this.vectors.values());
  }
}