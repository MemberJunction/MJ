/**
 * SimilaritySearch - Finds similar golden queries using weighted cosine similarity
 *
 * Implements weighted similarity search across multiple fields (name, userQuestion,
 * description, technicalDescription) to find the most relevant few-shot examples.
 */

import { QueryEmbeddings, EmbeddedGoldenQuery, SimilarQuery } from '../data/schema';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

/**
 * Field weights for weighted similarity calculation
 * Note: name is excluded since queries don't have names until after generation
 */
interface FieldWeights {
  userQuestion: number;
  description: number;
  technicalDescription: number;
}

/**
 * SimilaritySearch class
 * Finds most similar golden queries using weighted cosine similarity across multiple fields
 */
export class SimilaritySearch extends SimpleVectorService {
  /**
   * Weights for each field in similarity calculation
   * Total weights sum to 1.0
   *
   * Weight distribution prioritizes technical specifications:
   * - userQuestion: 0.20 (less important - natural language is variable)
   * - description: 0.40 (high-level business logic matching)
   * - technicalDescription: 0.40 (technical implementation details)
   */
  private readonly weights: FieldWeights = {
    userQuestion: 0.20,
    description: 0.40,
    technicalDescription: 0.40
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
   * Note: name field excluded as queries don't have names during generation
   */
  private calculateFieldSimilarities(
    queryEmbeddings: QueryEmbeddings,
    goldenEmbeddings: QueryEmbeddings
  ): SimilarQuery['fieldScores'] {
    return {
      userQuestionSim: this.CosineSimilarity(queryEmbeddings.userQuestion, goldenEmbeddings.userQuestion),
      descSim: this.CosineSimilarity(queryEmbeddings.description, goldenEmbeddings.description),
      techDescSim: this.CosineSimilarity(queryEmbeddings.technicalDescription, goldenEmbeddings.technicalDescription)
    };
  }

  /**
   * Calculate weighted sum of field similarities
   * Note: name field excluded, weights adjusted accordingly
   */
  private calculateWeightedScore(fieldScores: SimilarQuery['fieldScores']): number {
    return (
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
}
