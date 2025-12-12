/**
 * Configuration loader for QueryGen
 *
 * Loads configuration from mj.config.cjs and merges with CLI options
 */

/**
 * QueryGen configuration options
 */
export interface QueryGenConfig {
  // Entity Filtering
  includeEntities: string[];
  excludeEntities: string[];
  excludeSchemas: string[];

  // Entity Grouping
  maxEntitiesPerGroup: number;
  minEntitiesPerGroup: number;
  questionsPerGroup: number;
  entityGroupStrategy: 'breadth' | 'depth';

  // AI Configuration
  modelOverride?: string;
  vendorOverride?: string;
  embeddingModel: string;

  // Iteration Limits
  maxRefinementIterations: number;
  maxFixingIterations: number;

  // Few-Shot Learning
  topSimilarQueries: number;
  similarityThreshold: number;

  // Similarity Weighting
  similarityWeights: {
    name: number;
    userQuestion: number;
    description: number;
    technicalDescription: number;
  };

  // Output Configuration
  outputMode: 'metadata' | 'database' | 'both';
  outputDirectory: string;

  // Performance
  parallelGenerations: number;
  enableCaching: boolean;

  // Validation
  testWithSampleData: boolean;
  requireMinRows: number;
  maxRefinementRows: number;

  // Verbose Logging
  verbose: boolean;
}

/**
 * Load configuration from mj.config.cjs and merge with CLI options
 * Placeholder implementation
 */
export function loadConfig(cliOptions: Record<string, unknown>): QueryGenConfig {
  // Placeholder - will be implemented in Phase 9
  throw new Error('loadConfig not yet implemented');
}
