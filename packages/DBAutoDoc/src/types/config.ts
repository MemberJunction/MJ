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
  provider: 'openai' | 'anthropic' | 'groq' | 'mistral' | 'gemini';
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
}

export interface GuardrailsConfig {
  maxTokensPerRun?: number;        // Stop after N tokens total (default: unlimited)
  maxDurationSeconds?: number;      // Stop after N seconds (default: unlimited)
  maxCostDollars?: number;          // Stop after $N spent (default: unlimited)
  maxTokensPerPrompt?: number;      // Truncate individual prompts (default: model max)
  warnThresholds?: {                // Warn at X% of limits (default: 80%)
    tokenPercentage?: number;       // Warn at % of maxTokensPerRun
    durationPercentage?: number;    // Warn at % of maxDurationSeconds
    costPercentage?: number;        // Warn at % of maxCostDollars
  };
}

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
