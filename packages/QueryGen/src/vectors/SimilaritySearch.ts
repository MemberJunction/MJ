/**
 * SimilaritySearch - Finds similar golden queries using weighted cosine similarity
 *
 * Implements weighted similarity search across multiple fields (name, userQuestion,
 * description, technicalDescription) to find the most relevant few-shot examples.
 */

import { QueryEmbeddings, EmbeddedGoldenQuery, SimilarQuery } from '../data/schema';

/**
 * Field weights for weighted similarity calculation
 */
interface FieldWeights {
  name: number;
  userQuestion: number;
  description: number;
  technicalDescription: number;
}

/**
 * SimilaritySearch class
 * Finds most similar golden queries using weighted cosine similarity across multiple fields
 */
export class SimilaritySearch {
  /**
   * Weights for each field in similarity calculation
   * Total weights sum to 1.0
   */
  private readonly weights: FieldWeights = {
    name: 0.1,
    userQuestion: 0.2,
    description: 0.35,
    technicalDescription: 0.35
  };

  /**
   * Find similar golden queries using weighted cosine similarity
   *
   * Calculates similarity for each field separately, then combines with weights.
   * ALWAYS returns topK results, even if below threshold (threshold is informational).
   *
   * @param queryEmbeddings - Embeddings for the user's query (one per field)
   * @param goldenEmbeddings - Array of golden queries with their embeddings
   * @param topK - Number of most similar queries to return (default: 5)
   * @returns Array of top-K most similar golden queries with scores
   */
  async findSimilarQueries(
    queryEmbeddings: QueryEmbeddings,
    goldenEmbeddings: EmbeddedGoldenQuery[],
    topK: number = 5
  ): Promise<SimilarQuery[]> {
    // Calculate weighted similarity for each golden query
    const similarities = goldenEmbeddings.map(golden => {
      const fieldScores = this.calculateFieldSimilarities(queryEmbeddings, golden.embeddings);
      const weightedScore = this.calculateWeightedScore(fieldScores);

      return {
        query: golden.query,
        similarity: weightedScore,
        fieldScores
      };
    });

    // Sort by similarity (highest first) and return top K
    return this.selectTopK(similarities, topK);
  }

  /**
   * Calculate cosine similarity for each field separately
   */
  private calculateFieldSimilarities(
    queryEmbeddings: QueryEmbeddings,
    goldenEmbeddings: QueryEmbeddings
  ): SimilarQuery['fieldScores'] {
    return {
      nameSim: this.cosineSimilarity(queryEmbeddings.name, goldenEmbeddings.name),
      userQuestionSim: this.cosineSimilarity(queryEmbeddings.userQuestion, goldenEmbeddings.userQuestion),
      descSim: this.cosineSimilarity(queryEmbeddings.description, goldenEmbeddings.description),
      techDescSim: this.cosineSimilarity(queryEmbeddings.technicalDescription, goldenEmbeddings.technicalDescription)
    };
  }

  /**
   * Calculate weighted sum of field similarities
   */
  private calculateWeightedScore(fieldScores: SimilarQuery['fieldScores']): number {
    return (
      fieldScores.nameSim * this.weights.name +
      fieldScores.userQuestionSim * this.weights.userQuestion +
      fieldScores.descSim * this.weights.description +
      fieldScores.techDescSim * this.weights.technicalDescription
    );
  }

  /**
   * Select top K results sorted by similarity
   */
  private selectTopK(similarities: SimilarQuery[], topK: number): SimilarQuery[] {
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * Returns a value between -1 and 1:
   * - 1.0: Vectors point in same direction (identical meaning)
   * - 0.0: Vectors are perpendicular (unrelated)
   * - -1.0: Vectors point in opposite directions
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity score (-1 to 1)
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
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
}
