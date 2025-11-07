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
  server: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
  connectionTimeout?: number;
}

export interface AIConfig {
  provider: 'openai' | 'anthropic' | 'groq' | 'mistral' | 'gemini';
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  requestsPerMinute?: number;
}

export interface AnalysisConfig {
  cardinalityThreshold: number;
  sampleSize: number;
  includeStatistics: boolean;
  includePatternAnalysis: boolean;
  convergence: ConvergenceConfig;
  backpropagation: BackpropagationConfig;
  sanityChecks: SanityCheckConfig;
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
  schemaLevel: boolean;
  crossSchema: boolean;
}

export interface OutputConfig {
  stateFile: string;
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
