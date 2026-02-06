/**
 * State file format for DBAutoDoc
 * Tracks all documentation, iterations, and analysis progress
 */

import { RelationshipDiscoveryPhase, CachedColumnStats } from './discovery.js';
import { SampleQuery, SampleQueryGenerationSummary } from './sample-queries.js';

export interface DatabaseDocumentation {
  version: string;
  summary: AnalysisSummary; // Now includes timing and iteration counts
  database: DatabaseInfo;
  seedContext?: SeedContext;
  phases: AnalysisPhases; // Multi-phase workflow organization
  schemas: SchemaDefinition[]; // Deliverable: Database structure with descriptions
  sampleQueries?: SampleQueriesDeliverable; // Deliverable: Training queries generated from schemas
  resumedFromFile?: string; // Path to the state file this analysis resumed from
}

/**
 * Summary of analysis with timing and high-level metrics
 * Moved timing fields from top-level DatabaseDocumentation here
 */
export interface AnalysisSummary {
  // Timing and versioning
  createdAt: string;
  lastModified: string;
  totalIterations: number;

  // Token and cost metrics
  totalPromptsRun: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;

  // Schema metrics
  totalSchemas: number;
  totalTables: number;
  totalColumns: number;
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

/**
 * Multi-phase workflow organization
 * Each phase is optional and tracked separately
 * Phases describe HOW deliverables were generated (process history)
 */
export interface AnalysisPhases {
  keyDetection?: RelationshipDiscoveryPhase; // Primary key and foreign key detection
  descriptionGeneration: AnalysisRun[]; // Table and column description analysis
  queryGeneration?: QueryGenerationPhase; // Metadata about query generation process
}

/**
 * Query generation phase metadata (process tracking)
 * The actual queries are stored as a top-level deliverable
 */
export interface QueryGenerationPhase {
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  queriesGenerated: number;
  tokensUsed: number;
  estimatedCost: number;
  errorMessage?: string;
}

/**
 * Sample queries deliverable (product of analysis)
 * Training queries generated from database schemas for AI agents
 */
export interface SampleQueriesDeliverable {
  generatedAt: string;
  status: 'completed' | 'partial' | 'failed';
  queries: SampleQuery[];
  summary: SampleQueryGenerationSummary;
  modelUsed?: string;
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

  /**
   * Track origin of PK/FK flags
   * - 'schema': Defined in SQL DDL (hard constraint, never reject)
   * - 'discovered': Inferred by discovery phase (soft hypothesis, can reject/refine)
   * Undefined for legacy state.json files (assume 'discovered' for safety)
   */
  pkSource?: 'schema' | 'discovered';
  fkSource?: 'schema' | 'discovered';

  /**
   * Confidence scores for discovered keys (0-100)
   * Only set when pkSource='discovered' or fkSource='discovered'
   * Undefined for schema-defined keys
   */
  pkDiscoveryConfidence?: number;
  fkDiscoveryConfidence?: number;
}

export interface ForeignKeyReference {
  schema: string;
  table: string;
  column: string;
  referencedColumn: string;
}

/**
 * Column statistics merged from both discovery cache and description analysis
 * Replaces separate ColumnStatisticsCache - now embedded in column definitions
 */
export interface ColumnStatistics {
  // Core statistics (from discovery cache)
  totalRows: number;
  distinctCount: number;
  uniquenessRatio: number; // distinctCount / totalRows
  nullCount: number;
  nullPercentage: number;

  // Data patterns (from discovery cache)
  dataPattern?: 'sequential' | 'guid' | 'composite' | 'natural' | 'unknown';
  sampleValues: any[];
  valueDistribution?: Array<{ value: string | number; frequency: number }>;

  // Data ranges
  min?: any;
  max?: any;
  minValue?: string | number; // Alias for min
  maxValue?: string | number; // Alias for max

  // Numeric statistics
  avg?: number;
  stdDev?: number;
  median?: number;
  percentiles?: {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };

  // String statistics
  avgLength?: number;
  maxLength?: number;
  minLength?: number;
  commonPrefixes?: string[];

  // Pattern detection
  formatPattern?: string;
  containsUrls?: boolean;
  containsEmails?: boolean;
  containsPhones?: boolean;

  // Cache metadata
  computedAt?: string;
  queryTimeMs?: number;
}

export interface DescriptionIteration {
  description: string;
  reasoning: string;
  generatedAt: string;
  modelUsed: string;
  confidence?: number;
  triggeredBy?: 'initial' | 'backpropagation' | 'refinement' | 'dependency_sanity_check' | 'schema_sanity_check' | 'cross_schema_sanity_check';
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
  sanityCheckCount: number;
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
  sanityChecks: SanityCheckRecord[];
  resumedFromFile?: string; // Path to the state file this run resumed from
  resumedAt?: string; // Timestamp when this run resumed

  // Granular guardrail tracking
  phaseMetrics?: PhaseMetrics; // Per-phase token and cost tracking
  iterationMetrics?: IterationMetrics[]; // Per-iteration tracking
  guardrailsEnforced?: GuardrailEnforcement; // Info about guardrails that triggered
}

/**
 * Per-phase token and cost metrics for granular guardrail enforcement
 */
export interface PhaseMetrics {
  discovery?: PhaseMetric;     // Discovery phase
  analysis?: PhaseMetric;      // Main analysis phase
  sanityChecks?: PhaseMetric;  // Sanity checks phase
}

export interface PhaseMetric {
  startedAt: string;
  completedAt?: string;
  tokensUsed: number;
  estimatedCost: number;
  warned?: boolean;      // Did this phase trigger a token warning?
  exceeded?: boolean;    // Did this phase exceed its hard limit?
}

/**
 * Per-iteration metrics for detecting iteration-level resource exhaustion
 */
export interface IterationMetrics {
  iterationNumber: number;
  startedAt: string;
  completedAt?: string;
  tokensUsed: number;
  estimatedCost: number;
  duration: number; // milliseconds
  warned?: boolean;  // Did this iteration trigger a warning?
}

/**
 * Information about guardrails that were enforced or triggered
 */
export interface GuardrailEnforcement {
  exceedances: GuardrailExceeded[];  // Which limits were exceeded
  warnings: GuardrailWarning[];      // Which warnings were triggered
  stoppedDueToGuardrails?: boolean;  // Was execution stopped due to guardrails?
  stoppedReason?: string;            // Reason for stopping
}

export interface GuardrailExceeded {
  type: 'tokens_per_run' | 'tokens_per_phase' | 'tokens_per_iteration' | 'duration' | 'cost' | 'iteration_duration';
  phase?: string;                    // Phase name if phase-specific
  iteration?: number;                // Iteration number if iteration-specific
  limit: number;
  actual: number;
  unit: string;                      // 'tokens', 'seconds', 'dollars', etc.
}

export interface GuardrailWarning {
  type: string;                      // Type of warning
  phase?: string;                    // Phase name if phase-specific
  iteration?: number;                // Iteration number if iteration-specific
  percentage: number;                // How close to limit (0-100)
  message: string;
}

export interface ProcessingLogEntry {
  timestamp: string;
  level: number;
  schema: string;
  table: string;
  action: 'analyze' | 'backpropagate' | 'dependency_sanity_check' | 'schema_sanity_check' | 'cross_schema_sanity_check';
  result: 'success' | 'changed' | 'unchanged' | 'error';
  message?: string;
  tokensUsed?: number;
  promptInput?: string;
  promptOutput?: string;
  inputTokens?: number;
  outputTokens?: number;
  semanticComparison?: {
    tableMateriallyChanged: boolean;
    tableChangeReasoning: string;
    columnChanges: Array<{
      columnName: string;
      materiallyChanged: boolean;
      changeReasoning: string;
    }>;
  };
}

export interface SanityCheckRecord {
  timestamp: string;
  checkType: 'dependency_level' | 'schema_level' | 'cross_schema';
  scope: string; // e.g., "level 2", "AssociationDemo schema", "all schemas"
  hasMaterialIssues: boolean;
  issuesFound: number;
  tablesAffected: string[];
  result: 'no_issues' | 'issues_corrected' | 'issues_flagged';
  tokensUsed: number;
  promptInput?: string;
  promptOutput?: string;
}

/**
 * DEPRECATED: ColumnStatisticsCache is no longer used
 * Statistics are now embedded directly in ColumnDefinition.statistics
 * This type remains for backward compatibility with old state files
 */
export interface ColumnStatisticsCache {
  computedAt: string;
  totalSchemas: number;
  totalTables: number;
  totalColumns: number;
  tables: Record<string, TableStatisticsEntry>; // Key: "schema.table"
}

/**
 * DEPRECATED: TableStatisticsEntry is no longer used
 * This type remains for backward compatibility with old state files
 */
export interface TableStatisticsEntry {
  schemaName: string;
  tableName: string;
  totalRows: number;
  columns: CachedColumnStats[];
}
