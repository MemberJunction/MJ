/**
 * Prompt-related types for DBAutoDoc
 */

export interface PromptExecutionResult<T> {
  success: boolean;
  result?: T;
  errorMessage?: string;
  tokensUsed: number;
  cost?: number;
  promptInput?: string;
  promptOutput?: string;
  inputTokens?: number;
  outputTokens?: number;
  guardrailExceeded?: boolean;
}

export interface TableAnalysisPromptResult {
  tableDescription: string;
  reasoning: string;
  confidence: number;
  columnDescriptions: ColumnDescriptionPromptResult[];
  inferredBusinessDomain?: string;
  parentTableInsights?: ParentTableInsight[];
}

export interface ParentTableInsight {
  parentTable: string;  // "schema.table" format
  insight: string;
  confidence: number;
}

export interface ColumnDescriptionPromptResult {
  columnName: string;
  description: string;
  reasoning: string;
}

export interface BackpropagationPromptResult {
  needsRevision: boolean;
  revisedDescription?: string;
  reasoning: string;
  confidence: number;
}

export interface SchemaSanityCheckPromptResult {
  schemaDescription: string;
  inconsistencies: string[];
  suggestions: string[];
}

export interface CrossSchemaSanityCheckPromptResult {
  insights: string[];
  globalPatterns: string[];
  suggestions: string[];
}

export interface ConvergenceCheckPromptResult {
  hasConverged: boolean;
  reasoning: string;
  recommendedActions: string[];
}

export interface SemanticComparisonPromptResult {
  tableMateriallyChanged: boolean;
  tableChangeReasoning: string;
  columnChanges: ColumnChangeResult[];
}

export interface ColumnChangeResult {
  columnName: string;
  materiallyChanged: boolean;
  changeReasoning: string;
}

// Dependency-Level Sanity Check Types
export interface DependencyLevelSanityCheckResult {
  hasMaterialIssues: boolean;
  overallAssessment: string;
  tableIssues: TableIssue[];
  crossTableObservations: CrossTableObservation[];
}

export interface TableIssue {
  tableName: string;
  issueType: 'description' | 'business_purpose' | 'relationships' | 'terminology';
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
}

export interface CrossTableObservation {
  tables: string[];
  observation: string;
  impact: string;
  recommendation: string;
}

// Schema-Level Sanity Check Types
export interface SchemaLevelSanityCheckResult {
  hasMaterialIssues: boolean;
  schemaCoherence: 'excellent' | 'good' | 'fair' | 'poor';
  overallAssessment: string;
  schemaLevelIssues: SchemaLevelIssue[];
  tableIssues: TableIssue[];
  architecturalPatterns: ArchitecturalPattern[];
  businessDomainSuggestions: BusinessDomainSuggestion[];
}

export interface SchemaLevelIssue {
  issueType: 'consistency' | 'relationships' | 'business_domain' | 'naming' | 'architecture' | 'missing_pattern';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedTables: string[];
  suggestedSchemaDescription?: string;
}

export interface ArchitecturalPattern {
  pattern: 'audit_trail' | 'configuration' | 'lookup' | 'transaction' | 'versioning' | 'soft_delete' | 'hierarchy';
  tables: string[];
  description: string;
}

export interface BusinessDomainSuggestion {
  suggestedDomain: string;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

// Cross-Schema Sanity Check Types
export interface CrossSchemaSanityCheckResult {
  hasMaterialIssues: boolean;
  overallConsistency: 'excellent' | 'good' | 'fair' | 'poor';
  overallAssessment: string;
  crossSchemaIssues: CrossSchemaIssue[];
  terminologyConflicts: TerminologyConflict[];
  schemaIssues: SchemaIssue[];
  databaseLevelObservations: DatabaseLevelObservation[];
}

export interface CrossSchemaIssue {
  issueType: 'terminology' | 'shared_tables' | 'relationships' | 'business_domains' | 'naming' | 'duplication';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedSchemas: string[];
  affectedTables: Array<{ schema: string; table: string }>;
  suggestedResolution: string;
}

export interface TerminologyConflict {
  term: string;
  usages: Array<{
    schema: string;
    table: string;
    meaning: string;
  }>;
  recommendedStandardization: string;
}

export interface SchemaIssue {
  schemaName: string;
  issueType: 'description' | 'business_domain' | 'relationships';
  description: string;
  suggestedFix: string;
}

export interface DatabaseLevelObservation {
  observation: string;
  impact: string;
  recommendation: string;
}
