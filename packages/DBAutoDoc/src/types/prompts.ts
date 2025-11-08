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
