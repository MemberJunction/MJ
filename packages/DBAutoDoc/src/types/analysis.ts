/**
 * Analysis-related types for DBAutoDoc
 */

import { TableDefinition } from './state.js';

export interface DependencyGraph {
  nodes: Map<string, TableNode>;
  levels: TableNode[][];
}

export interface TableNode {
  schema: string;
  table: string;
  fullName: string;
  dependsOn: TableNode[];
  dependents: TableNode[];
  level: number;
  tableDefinition?: TableDefinition;
}

export interface BackpropagationTrigger {
  sourceTable: string;
  targetTable: string;
  insight: string;
  confidence: number;
}

export interface ConvergenceResult {
  converged: boolean;
  reason: string;
  iterationsPerformed: number;
  suggestions?: string[];
}

export interface AnalysisMetrics {
  tablesAnalyzed: number;
  columnsAnalyzed: number;
  totalTokensUsed: number;
  totalCost: number;
  averageConfidence: number;
  lowConfidenceCount: number;
  backpropagationCount: number;
  iterationCount: number;
}

export interface TableAnalysisContext {
  schema: string;
  table: string;
  rowCount: number;
  columns: any[];
  dependsOn: any[];
  dependents: any[];
  sampleData: any[];
  parentDescriptions?: ParentTableDescription[];
  userNotes?: string;
  seedContext?: any;
  allTables?: Array<{ schema: string; name: string }>;
  /** Ground truth for this table from config — AI must align with this */
  groundTruth?: TableGroundTruthContext;
}

export interface TableGroundTruthContext {
  tableDescription?: string;
  tableNotes?: string;
  businessDomain?: string;
  columnDescriptions?: Record<string, string>;
  columnNotes?: Record<string, string>;
}

export interface ParentTableDescription {
  schema: string;
  table: string;
  description: string;
}

export interface AnalysisResult {
  success: boolean;
  tableDescription?: string;
  reasoning?: string;
  confidence?: number;
  columnDescriptions?: ColumnDescriptionResult[];
  inferredBusinessDomain?: string;
  errorMessage?: string;
  tokensUsed: number;
}

export interface ColumnDescriptionResult {
  columnName: string;
  description: string;
  reasoning: string;
}
