/**
 * Configuration types for DBAutoDoc
 */

export interface DBAutoDocConfig {
  version: string;
  database: DatabaseConfig;
  ai: AIConfig;
  analysis: AnalysisConfig;
  output: OutputConfig;
  schemas: SchemaFilterConfig;
  tables: TableFilterConfig;
  seedContext?: SeedContextConfig;
  groundTruth?: GroundTruthConfig;
}

/**
 * Seed context providing high-level business information about the database.
 * This is injected into prompts to guide analysis but does NOT override AI output.
 */
export interface SeedContextConfig {
  overallPurpose?: string;
  businessDomains?: string[];
  customInstructions?: string;
  industryContext?: string;
}

/**
 * Ground truth configuration — authoritative documentation provided by the user.
 * Ground truth descriptions ALWAYS take priority over AI-generated descriptions.
 * Tables/columns with ground truth are never overwritten by the analysis engine.
 */
export interface GroundTruthConfig {
  /** Database-level ground truth description */
  databaseDescription?: string;
  /** Schema-level ground truth */
  schemas?: Record<string, SchemaGroundTruth>;
  /** Table-level ground truth, keyed by "schema.table" */
  tables?: Record<string, TableGroundTruth>;
}

export interface SchemaGroundTruth {
  description?: string;
  businessDomain?: string;
  notes?: string;
}

export interface TableGroundTruth {
  description?: string;
  notes?: string;
  businessDomain?: string;
  /** Column-level ground truth, keyed by column name */
  columns?: Record<string, ColumnGroundTruth>;
}

export interface ColumnGroundTruth {
  description?: string;
  notes?: string;
}

export interface DatabaseConfig {
  provider?: 'sqlserver' | 'mysql' | 'postgresql' | 'oracle'; // Default: sqlserver
  server: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  // SQL Server specific
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  // Connection pool and timeout settings
  connectionTimeout?: number;
  requestTimeout?: number;
  maxConnections?: number;
  minConnections?: number;
  idleTimeoutMillis?: number;
}

export interface AIConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'groq' | 'mistral' | 'vertex' | 'azure' | 'cerebras' | 'openrouter' | 'xai' | 'bedrock';
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  /** @deprecated Use rateLimits.requestsPerMinute instead */
  requestsPerMinute?: number;
  effortLevel?: number; // Optional effort level 1-100 (1=lowest, 100=highest). Not all models support this.
  pricing?: TokenPricingConfig;
  /** Rate limiting configuration for API calls */
  rateLimits?: RateLimitConfig;
  /** Retry configuration for failed API calls (429, network errors) */
  retry?: RetryConfig;
  /**
   * Per-purpose model overrides. Keys are purpose names (e.g., "fkPruning").
   * Each override can specify a different model, temperature, maxTokens, and effortLevel.
   * If a purpose is not listed, the default model/settings from the parent AIConfig are used.
   */
  modelOverrides?: Record<string, ModelOverride>;
}

/**
 * Rate limiting configuration for LLM API calls.
 */
export interface RateLimitConfig {
  /** Max requests per minute (0 = unlimited). Provider defaults apply if not set. */
  requestsPerMinute?: number;
  /** Max tokens per minute (0 = unlimited). Not enforced yet — reserved for future use. */
  tokensPerMinute?: number;
  /** Max concurrent LLM requests (default: 1 = serial). For future parallelization. */
  maxParallelRequests?: number;
}

/**
 * Retry configuration for handling transient API failures (429 rate limits, network errors).
 */
export interface RetryConfig {
  /** Max number of retries before giving up (default: 5) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 30000 = 30s) */
  initialDelayMs?: number;
  /** Maximum delay in ms (default: 480000 = 8 min). Backoff won't exceed this. */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2). Delay doubles each retry. */
  backoffMultiplier?: number;
}

/**
 * Override settings for a specific purpose (e.g., FK pruning with a stronger model).
 * Only the fields specified here will override the defaults from AIConfig.
 */
export interface ModelOverride {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  effortLevel?: number;
  /** Per-model rate limits (Pro models typically have lower limits than Flash) */
  rateLimits?: RateLimitConfig;
}

/**
 * Token pricing configuration for cost estimation.
 * Costs are specified in dollars per 1 million tokens.
 */
export interface TokenPricingConfig {
  inputCostPer1MTokens: number;   // Cost per 1M input tokens (e.g., 0.50 for Gemini 3 Flash)
  outputCostPer1MTokens: number;  // Cost per 1M output tokens (e.g., 3.00 for Gemini 3 Flash)
}

export interface AnalysisConfig {
  cardinalityThreshold: number;
  sampleSize: number;
  includeStatistics: boolean;
  includePatternAnalysis: boolean;
  convergence: ConvergenceConfig;
  backpropagation: BackpropagationConfig;
  sanityChecks: SanityCheckConfig;
  guardrails?: GuardrailsConfig;
  relationshipDiscovery?: RelationshipDiscoveryConfig;
  sampleQueryGeneration?: SampleQueryGenerationConfig;
  organicKeyDetection?: OrganicKeyDetectionConfig;
}

/**
 * Configuration for cluster-based organic key detection.
 * Baseline runs with name + value signals only (no external API).
 * Embedding and LLM refinement layer on top when an AI provider is configured.
 */
export interface OrganicKeyDetectionConfig {
  /** Enable organic key detection pass (default: false). */
  enabled: boolean;

  /** Weights for the hybrid distance metric. Setting any weight to 0 disables that signal. */
  weights?: {
    /** Weight for name-token Jaccard similarity (deps-free, default: 1.0). */
    nameSimilarity?: number;
    /** Weight for embedding cosine distance (requires AI provider, default: 1.0 when available, 0 otherwise). */
    embeddingDistance?: number;
    /** Weight for MinHash value-overlap (requires column sampling, default: 0.5). */
    valueOverlap?: number;
  };

  /** Tunable clustering thresholds. */
  thresholds?: {
    /** Edges with hybrid distance > this are not merge candidates (default: 0.5). */
    candidateEdgeMax?: number;
    /** Complete-linkage cut — max intra-cluster pairwise distance after merge (default: 0.4). */
    mergeMax?: number;
    /** Top-K nearest neighbors per column retained as candidate edges (default: 20). */
    topKNeighbors?: number;
    /** Minimum cluster size to report (default: 2). */
    minClusterSize?: number;
    /** Minimum distinct tables a cluster must span (default: 2). */
    minDistinctTables?: number;
  };

  /** Embedding configuration. Omit to skip embedding-based clustering. */
  embedding?: {
    /** Whether to compute embeddings for column descriptions (default: false). */
    enabled: boolean;
    /** Model identifier (default: 'gemini-embedding-001'). */
    model?: string;
    /** Embedding dimensions (default: 1536). */
    dimensions?: number;
    /** Batch size for embedding requests (default: 100). */
    batchSize?: number;
  };

  /** LLM refinement configuration. Omit to skip refinement entirely. */
  refinement?: {
    /** Whether to run LLM refinement on candidate clusters (default: true when AI provider configured). */
    enabled: boolean;
    /** Override model for refinement; falls back to AIConfig.model if absent. */
    model?: string;
    /** Concurrency for refinement calls (default: 4). */
    concurrency?: number;
  };

  /** MinHash signatures for value-overlap verification. */
  minHash?: {
    /** Whether to compute MinHash sketches during column sampling (default: false). */
    enabled: boolean;
    /** Number of hash functions (default: 128). */
    numHashes?: number;
    /** Sample size per column for sketching (default: reuses relationshipDiscovery.sampling.maxRowsPerTable). */
    sampleSize?: number;
  };
}

export interface SampleQueryGenerationConfig {
  enabled: boolean;                     // Enable sample query generation (default: false)
  queriesPerTable: number;              // Number of queries to generate per table (default: 5)
  maxExecutionTime: number;             // Max time to execute validation queries in ms (default: 30000)
  includeMultiQueryPatterns: boolean;   // Generate related query patterns (default: true)
  validateAlignment: boolean;           // Validate alignment between related queries (default: true)
  tokenBudget: number;                  // Token budget for query generation phase (default: 100000, set to 0 for unlimited)
  maxRowsInSample: number;              // Max rows to return in sample results (default: 10)
  maxTables?: number;                   // Max tables to generate queries for (default: 10, set to 0 for all tables)
  enableQueryFix?: boolean;             // Enable automatic query fix attempts (default: true)
  maxFixAttempts?: number;              // Maximum number of fix attempts per query (default: 3)
  enableQueryRefinement?: boolean;      // Enable LLM-based result analysis and refinement (default: false)
  maxRefinementAttempts?: number;       // Maximum refinement iterations per query (default: 1)
}

export interface RelationshipDiscoveryConfig {
  enabled: boolean;          // Enable automatic discovery (default: true)

  // Triggers for when to run discovery
  triggers: {
    runOnMissingPKs: boolean;        // Run if any table missing PK (default: true)
    runOnInsufficientFKs: boolean;   // Run if FK count below threshold (default: true)
    fkDeficitThreshold: number;      // Run if actual FKs < threshold % of expected (default: 0.4)
  };

  // Token budget allocation
  tokenBudget: {
    maxTokens?: number;              // Max tokens for discovery phase (default: 25% of total)
    ratioOfTotal?: number;           // Alternative: ratio of total budget (0-1, default: 0.25)
  };

  // Confidence thresholds
  confidence: {
    primaryKeyMinimum: number;       // Min confidence to treat as PK (default: 0.7)
    foreignKeyMinimum: number;       // Min confidence to treat as FK (default: 0.6)
    llmValidationThreshold: number;  // Use LLM validation if confidence below this (default: 0.8)
  };

  // Sampling configuration
  sampling: {
    maxRowsPerTable: number;         // Max rows to sample per table (default: 1000)
    statisticalSignificance: number; // Min sample size for valid statistics (default: 100)
    valueOverlapSampleSize: number;  // Rows to check for FK value overlap (default: 500)
  };

  // Pattern matching
  patterns: {
    primaryKeyNames: string[];       // Regex patterns for PK names (e.g., [".*[Ii][Dd]$", "^pk_.*"])
    foreignKeyNames: string[];       // Regex patterns for FK names (e.g., [".*[Ii][Dd]$", "^fk_.*"])
    compositeKeyIndicators: string[]; // Patterns suggesting composite keys
  };

  // LLM assistance
  llmValidation: {
    enabled: boolean;                // Use LLM to validate candidates (default: true)
    batchSize: number;               // Validate N candidates per LLM call (default: 5)
  };

  // Backpropagation in discovery
  backpropagation: {
    enabled: boolean;                // Re-analyze after discoveries (default: true)
    maxIterations: number;           // Max discovery iterations (default: 10)
  };
}

export interface GuardrailsConfig {
  // Hard limits - stop execution when exceeded
  maxTokensPerRun?: number;        // Stop after N tokens total (default: unlimited)
  maxDurationSeconds?: number;      // Stop after N seconds (default: unlimited)
  maxCostDollars?: number;          // Stop after $N spent (default: unlimited)
  maxTokensPerPrompt?: number;      // Truncate individual prompts (default: model max)

  // Per-phase token limits
  maxTokensPerPhase?: {
    discovery?: number;             // Max tokens for discovery phase
    analysis?: number;              // Max tokens for main analysis phase
    sanityChecks?: number;          // Max tokens for sanity checks
  };

  // Per-iteration limits
  maxTokensPerIteration?: number;   // Max tokens per iteration (soft limit, warns at threshold)
  maxIterationDurationSeconds?: number; // Max duration per iteration

  // Warning thresholds (at X% of limits)
  warnThresholds?: {
    tokenPercentage?: number;       // Warn at % of maxTokensPerRun (default: 80%)
    durationPercentage?: number;    // Warn at % of maxDurationSeconds (default: 80%)
    costPercentage?: number;        // Warn at % of maxCostDollars (default: 80%)
    iterationTokenPercentage?: number; // Warn at % of maxTokensPerIteration (default: 80%)
    phaseTokenPercentage?: number;  // Warn at % of maxTokensPerPhase (default: 80%)
  };

  // Enable/disable guardrail enforcement
  enabled?: boolean;                // Enable all guardrails (default: true)
  stopOnExceeded?: boolean;         // Stop immediately when limit exceeded (default: true)
};

export interface ConvergenceConfig {
  maxIterations: number;
  stabilityWindow: number;
  confidenceThreshold: number;
}

export interface BackpropagationConfig {
  enabled: boolean;
  maxDepth: number;
}

export interface SanityCheckConfig {
  dependencyLevel: boolean;
  schemaLevel: boolean;
  crossSchema: boolean;
}

export interface OutputConfig {
  stateFile: string;
  outputDir?: string; // Base output directory for numbered runs
  sqlFile: string;
  markdownFile: string;
}

export interface SchemaFilterConfig {
  include?: string[];
  exclude?: string[];
}

export interface TableFilterConfig {
  exclude?: string[];
}
