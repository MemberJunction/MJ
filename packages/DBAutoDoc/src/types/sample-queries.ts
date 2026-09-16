/**
 * Sample query generation types for DBAutoDoc
 * These queries serve as reference implementations for AI agents like Skip
 */

/**
 * Phase 1: Query Planning - lightweight descriptions of what queries to create
 */
export interface QueryPlan {
  id: string;
  name: string;
  description: string;
  businessPurpose: string;
  queryType: QueryType;
  queryPattern: QueryPattern;
  complexity: QueryComplexity;
  primaryEntities: EntityReference[];
  relatedEntities: EntityReference[];
  relatedQueryIds: string[];  // For alignment tracking
  confidence: number;
  reasoning?: string;
}

/**
 * Phase 2: SQL Generation - detailed SQL implementation for a single query
 */
export interface QuerySQL {
  sqlQuery: string;
  parameters: QueryParameter[];
  sampleResultColumns: ResultColumn[];
  filteringRules: string[];
  aggregationRules: string[];
  joinRules: string[];
  alignmentNotes?: string;
}

/**
 * Complete sample query combining plan + SQL + execution results
 */
export interface SampleQuery {
  /** Unique identifier for this query */
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Human-readable name */
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Detailed description of what this query does */
  description: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Business purpose and use case */
  businessPurpose: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Schema this query belongs to */
  schema: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Entity context */
  primaryEntities: EntityReference[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  relatedEntities: EntityReference[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Query metadata */
  queryType: QueryType;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queryPattern: QueryPattern;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  complexity: QueryComplexity;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** The actual SQL query */
  sqlQuery: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Query parameters */
  parameters: QueryParameter[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Results documentation */
  sampleResultColumns: ResultColumn[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  sampleResultRows: Record<string, unknown>[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  expectedRowCount?: RowCountRange;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Business logic documentation */
  filteringRules: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  aggregationRules: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  joinRules: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** For multi-query alignment */
  relatedQueries?: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  alignmentNotes?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Execution metadata */
  executionTime?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  validated: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  validationError?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Fix attempt tracking */
  fixAttempts?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  fixHistory?: Array<{ sql: string; error: string }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Refinement tracking */
  refinementAttempts?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  refinementHistory?: Array<{ sql: string; feedback: string }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  wasRefined?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /** Generation metadata */
  generatedAt: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  confidence: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  modelUsed: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  reasoning?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface EntityReference {
  schema: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  table: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  alias?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export type QueryType =
  | 'aggregation'
  | 'filter'
  | 'join'
  | 'detail'
  | 'summary'
  | 'ranking'
  | 'time-series'
  | 'drill-down';

export type QueryPattern =
  | 'simple-select'
  | 'filtered-select'
  | 'aggregation-group-by'
  | 'time-series-aggregation'
  | 'join-detail'
  | 'left-join-counts'
  | 'drill-down-detail'
  | 'ranking-top-n'
  | 'multi-level-aggregation';

export type QueryComplexity = 'simple' | 'moderate' | 'complex';

export interface QueryParameter {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  required: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  defaultValue?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  exampleValues: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ResultColumn {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  dataType: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  isMeasure: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  isDimension: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface RowCountRange {
  min: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  max: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  typical: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface SampleQueryGenerationResult {
  success: boolean;
  queries: SampleQuery[];
  summary: SampleQueryGenerationSummary;
  errorMessage?: string;
}

export interface SampleQueryGenerationSummary {
  totalQueriesGenerated: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queriesValidated: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queriesFailed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalExecutionTime: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  tokensUsed: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  estimatedCost: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  averageConfidence: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queriesByType: Record<QueryType, number>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queriesByPattern: Record<QueryPattern, number>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  queriesByComplexity: Record<QueryComplexity, number>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface SampleQueryGenerationConfig {
  enabled: boolean;
  queriesPerTable: number;
  maxExecutionTime: number;
  includeMultiQueryPatterns: boolean;
  validateAlignment: boolean;
  tokenBudget: number;  // Token budget for query generation phase (default: 100000, set to 0 for unlimited)
  queryTypes?: QueryType[];
  maxRowsInSample: number;
  maxTables?: number;  // Max tables to generate queries for (default: 10, set to 0 for all tables)
  enableQueryFix?: boolean;  // Enable automatic query fix attempts (default: true)
  maxFixAttempts?: number;  // Maximum number of fix attempts per query (default: 3)
  enableQueryRefinement?: boolean;  // Enable LLM-based result analysis and refinement (default: false)
  maxRefinementAttempts?: number;  // Maximum refinement iterations per query (default: 1)
}

export interface QueryGenerationContext {
  schema: string;
  tables: TableContext[];
  existingQueries: SampleQuery[];
}

export interface TableContext {
  name: string;
  description?: string;
  rowCount: number;
  columns: ColumnContext[];
  primaryKeys: string[];
  foreignKeys: ForeignKeyContext[];
  dependents: string[];
}

export interface ColumnContext {
  name: string;
  dataType: string;
  description?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  possibleValues?: unknown[];
  statistics?: {
    distinctCount?: number;
    min?: unknown;
    max?: unknown;
    avg?: number;
  };
}

export interface ForeignKeyContext {
  column: string;
  referencesSchema: string;
  referencesTable: string;
  referencesColumn: string;
}
