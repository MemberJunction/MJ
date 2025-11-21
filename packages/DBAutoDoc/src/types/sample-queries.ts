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
  id: string;

  /** Human-readable name */
  name: string;

  /** Detailed description of what this query does */
  description: string;

  /** Business purpose and use case */
  businessPurpose: string;

  /** Schema this query belongs to */
  schema: string;

  /** Entity context */
  primaryEntities: EntityReference[];
  relatedEntities: EntityReference[];

  /** Query metadata */
  queryType: QueryType;
  queryPattern: QueryPattern;
  complexity: QueryComplexity;

  /** The actual SQL query */
  sqlQuery: string;

  /** Query parameters */
  parameters: QueryParameter[];

  /** Results documentation */
  sampleResultColumns: ResultColumn[];
  sampleResultRows: Record<string, unknown>[];
  expectedRowCount?: RowCountRange;

  /** Business logic documentation */
  filteringRules: string[];
  aggregationRules: string[];
  joinRules: string[];

  /** For multi-query alignment */
  relatedQueries?: string[];
  alignmentNotes?: string;

  /** Execution metadata */
  executionTime?: number;
  validated: boolean;
  validationError?: string;

  /** Fix attempt tracking */
  fixAttempts?: number;
  fixHistory?: Array<{ sql: string; error: string }>;

  /** Generation metadata */
  generatedAt: string;
  confidence: number;
  modelUsed: string;
  reasoning?: string;
}

export interface EntityReference {
  schema: string;
  table: string;
  alias?: string;
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
  name: string;
  dataType: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  exampleValues: string[];
}

export interface ResultColumn {
  name: string;
  dataType: string;
  description: string;
  isMeasure: boolean;
  isDimension: boolean;
}

export interface RowCountRange {
  min: number;
  max: number;
  typical: number;
}

export interface SampleQueryGenerationResult {
  success: boolean;
  queries: SampleQuery[];
  summary: SampleQueryGenerationSummary;
  errorMessage?: string;
}

export interface SampleQueryGenerationSummary {
  totalQueriesGenerated: number;
  queriesValidated: number;
  queriesFailed: number;
  totalExecutionTime: number;
  tokensUsed: number;
  estimatedCost: number;
  averageConfidence: number;
  queriesByType: Record<QueryType, number>;
  queriesByPattern: Record<QueryPattern, number>;
  queriesByComplexity: Record<QueryComplexity, number>;
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
