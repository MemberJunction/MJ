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
 * Default configuration values
 */
const DEFAULT_CONFIG: QueryGenConfig = {
  includeEntities: [],
  excludeEntities: [],
  excludeSchemas: ['sys', 'INFORMATION_SCHEMA'],
  maxEntitiesPerGroup: 3,
  minEntitiesPerGroup: 1,
  questionsPerGroup: 2,
  entityGroupStrategy: 'breadth',
  embeddingModel: 'text-embedding-3-small',
  maxRefinementIterations: 3,
  maxFixingIterations: 5,
  topSimilarQueries: 5,
  similarityThreshold: 0.7,
  similarityWeights: {
    name: 0.1,
    userQuestion: 0.2,
    description: 0.35,
    technicalDescription: 0.35,
  },
  outputMode: 'metadata',
  outputDirectory: './metadata/queries',
  parallelGenerations: 1,
  enableCaching: true,
  testWithSampleData: true,
  requireMinRows: 0,
  maxRefinementRows: 10,
  verbose: false,
};

/**
 * Load configuration from mj.config.cjs and merge with CLI options
 *
 * Configuration priority (highest to lowest):
 * 1. CLI options (command line flags)
 * 2. mj.config.cjs queryGen section
 * 3. Default values
 *
 * @param cliOptions - Options provided via command line
 * @returns Merged configuration ready for use
 */
export function loadConfig(cliOptions: Record<string, unknown>): QueryGenConfig {
  // Start with defaults
  const config: QueryGenConfig = { ...DEFAULT_CONFIG };

  // Load mj.config.cjs if it exists
  const mjConfig = loadMjConfig();
  if (mjConfig && mjConfig.queryGen) {
    Object.assign(config, mjConfig.queryGen);
  }

  // Override with CLI options
  if (cliOptions.entities) {
    config.includeEntities = parseArrayOption(cliOptions.entities);
  }
  if (cliOptions.excludeEntities) {
    config.excludeEntities = parseArrayOption(cliOptions.excludeEntities);
  }
  if (cliOptions.excludeSchemas) {
    config.excludeSchemas = parseArrayOption(cliOptions.excludeSchemas);
  }
  if (cliOptions.maxEntities) {
    config.maxEntitiesPerGroup = parseNumberOption(cliOptions.maxEntities, 'maxEntities');
  }
  if (cliOptions.maxRefinements) {
    config.maxRefinementIterations = parseNumberOption(cliOptions.maxRefinements, 'maxRefinements');
  }
  if (cliOptions.maxFixes) {
    config.maxFixingIterations = parseNumberOption(cliOptions.maxFixes, 'maxFixes');
  }
  if (cliOptions.model) {
    config.modelOverride = String(cliOptions.model);
  }
  if (cliOptions.vendor) {
    config.vendorOverride = String(cliOptions.vendor);
  }
  if (cliOptions.output) {
    config.outputDirectory = String(cliOptions.output);
  }
  if (cliOptions.mode) {
    const mode = String(cliOptions.mode);
    if (mode === 'metadata' || mode === 'database' || mode === 'both') {
      config.outputMode = mode;
    } else {
      throw new Error(`Invalid output mode: ${mode}. Must be metadata, database, or both`);
    }
  }
  if (cliOptions.verbose) {
    config.verbose = true;
  }

  return config;
}

/**
 * Load mj.config.cjs from current working directory
 * Returns null if file doesn't exist or can't be loaded
 */
function loadMjConfig(): { queryGen?: Partial<QueryGenConfig> } | null {
  try {
    const configPath = require('path').join(process.cwd(), 'mj.config.cjs');
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      return require(configPath);
    }
  } catch (error) {
    // Config file doesn't exist or couldn't be loaded - not an error
  }
  return null;
}

/**
 * Parse array option from CLI (handles both comma-separated strings and arrays)
 */
function parseArrayOption(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim());
  }
  return [];
}

/**
 * Parse number option from CLI with validation
 */
function parseNumberOption(value: unknown, name: string): number {
  const num = Number(value);
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid ${name}: must be a positive number`);
  }
  return num;
}
