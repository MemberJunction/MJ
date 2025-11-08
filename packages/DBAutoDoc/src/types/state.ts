/**
 * State file format for DBAutoDoc
 * Tracks all documentation, iterations, and analysis progress
 */

export interface DatabaseDocumentation {
  version: string;
  database: DatabaseInfo;
  seedContext?: SeedContext;
  schemas: SchemaDefinition[];
  analysisRuns: AnalysisRun[];
  createdAt: string;
  lastModified: string;
  totalIterations: number;
}

export interface DatabaseInfo {
  name: string;
  server: string;
  analyzedAt: string;
}

export interface SeedContext {
  overallPurpose?: string;
  businessDomains?: string[];
  customInstructions?: string;
  industryContext?: string;
}

export interface SchemaDefinition {
  name: string;
  tables: TableDefinition[];
  description?: string;
  descriptionIterations: DescriptionIteration[];
  inferredPurpose?: string;
  businessDomains?: string[];
}

export interface TableDefinition {
  name: string;
  rowCount: number;
  dependencyLevel?: number;
  dependsOn: ForeignKeyReference[];
  dependents: ForeignKeyReference[];
  columns: ColumnDefinition[];
  description?: string;
  descriptionIterations: DescriptionIteration[];
  userNotes?: string;
  userDescription?: string;
  userApproved?: boolean;
}

export interface ColumnDefinition {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyReferences?: ForeignKeyReference;
  checkConstraint?: string;
  defaultValue?: string;
  possibleValues?: any[];
  statistics?: ColumnStatistics;
  description?: string;
  descriptionIterations: DescriptionIteration[];
}

export interface ForeignKeyReference {
  schema: string;
  table: string;
  column: string;
  referencedColumn: string;
}

export interface ColumnStatistics {
  distinctCount: number;
  uniquenessRatio: number;
  nullCount: number;
  nullPercentage: number;
  sampleValues: any[];
  min?: any;
  max?: any;
  avg?: number;
  stdDev?: number;
  median?: number;
  percentiles?: {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  avgLength?: number;
  maxLength?: number;
  minLength?: number;
  commonPrefixes?: string[];
  formatPattern?: string;
  containsUrls?: boolean;
  containsEmails?: boolean;
  containsPhones?: boolean;
}

export interface DescriptionIteration {
  description: string;
  reasoning: string;
  generatedAt: string;
  modelUsed: string;
  confidence?: number;
  triggeredBy?: 'initial' | 'backpropagation' | 'refinement' | 'sanity_check';
  changedFrom?: string;
}

export interface AnalysisRun {
  runId: string;
  startedAt: string;
  completedAt?: string;
  status: 'in_progress' | 'completed' | 'failed' | 'converged';
  levelsProcessed: number;
  iterationsPerformed: number;
  backpropagationCount: number;
  converged: boolean;
  convergenceReason?: string;
  modelUsed: string;
  vendor: string;
  temperature: number;
  topP?: number;
  topK?: number;
  totalTokensUsed: number;
  estimatedCost: number;
  warnings: string[];
  errors: string[];
  processingLog: ProcessingLogEntry[];
}

export interface ProcessingLogEntry {
  timestamp: string;
  level: number;
  schema: string;
  table: string;
  action: 'analyze' | 'backpropagate' | 'sanity_check';
  result: 'success' | 'changed' | 'unchanged' | 'error';
  message?: string;
  tokensUsed?: number;
  promptInput?: string;
  promptOutput?: string;
  inputTokens?: number;
  outputTokens?: number;
}
