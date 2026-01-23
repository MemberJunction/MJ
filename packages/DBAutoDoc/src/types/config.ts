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
  requestsPerMinute?: number;
  effortLevel?: number; // Optional effort level 1-100 (1=lowest, 100=highest). Not all models support this.
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
