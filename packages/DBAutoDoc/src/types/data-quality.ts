/**
 * Data quality types.
 *
 * The data quality phase works in two layers:
 *
 * - **Measurements** are raw counts taken from the database: one consolidated probe statement per
 *   table, and one anti-join per relationship that is not already guaranteed by a trusted
 *   constraint. They are persisted in `state.phases.dataQuality` so a resumed run does not repeat
 *   them.
 * - **Findings** are derived from the measurements, the column statistics the sampling pass already
 *   collected, and the catalog. Deriving is a pure function of state and config, so findings are
 *   recomputed whenever keys change (the description loop proposes keys, pruning removes them) and
 *   a config change between runs never needs a new probe.
 */

/** Every finding kind a run can produce. Each is a switch in `analysis.dataQuality.checks`. */
export type DataQualityCheck =
  // Table, from statistics and the catalog
  | 'EmptyTable'
  | 'StaleRowCountEstimate'
  | 'NoPrimaryKey'
  | 'IsolatedTable'
  // Column, from statistics (a probe adds exact counts to the last four)
  | 'AlwaysNull'
  | 'ConstantValue'
  | 'HighNullRate'
  | 'NullableNeverNull'
  | 'NearUnique'
  | 'UndeclaredUnique'
  | 'ForeignKeyMostlyNull'
  | 'OneToOne'
  | 'SentinelDate'
  | 'FutureDate'
  | 'LengthAtCapacity'
  | 'NegativeValue'
  // Column, from the table probe
  | 'BlankString'
  | 'UntrimmedString'
  | 'CaseWhitespaceVariants'
  | 'NumericStoredAsText'
  | 'DateStoredAsText'
  // Table, from the table probe
  | 'ExactDuplicateRows'
  // Relationship, from the catalog
  | 'UntrustedForeignKey'
  | 'ForeignKeyTypeMismatch'
  // Relationship, from the relationship probe
  | 'OrphanedForeignKey'
  | 'UnreferencedParentRows';

/**
 * `info` is worth telling the model and the reader; `warning` is a probable data problem;
 * `error` breaks joins or constraints.
 */
export type DataQualitySeverity = 'info' | 'warning' | 'error';

export type DataQualityScope = 'column' | 'table' | 'relationship';

/** Where the evidence came from: existing statistics, the catalog, or a probe statement. */
export type DataQualitySource = 'statistics' | 'catalog' | 'probe';

/** The parent side of a relationship finding. */
export interface DataQualityRelatedTable {
  SchemaName: string;
  TableName: string;
  /** Parent columns, in the same order as {@link DataQualityFinding.ColumnNames}. */
  ColumnNames: string[];
  ConstraintName?: string;
  /** True for a constraint declared in the database, false for a discovered relationship. */
  Declared: boolean;
}

/** One data quality finding. Messages are a single sentence, used verbatim in prompts and reports. */
export interface DataQualityFinding {
  /** `Kind:schema.table[.column][->schema.table]`, stable across runs so two reports can be diffed. */
  Id: string;
  Kind: DataQualityCheck;
  Severity: DataQualitySeverity;
  Scope: DataQualityScope;
  Source: DataQualitySource;
  SchemaName: string;
  TableName: string;
  /** Column findings: the column. Relationship findings: the first child column. */
  ColumnName?: string;
  /** Relationship findings: every child column of the relationship, in key order. */
  ColumnNames?: string[];
  Related?: DataQualityRelatedTable;
  /** The numbers behind the finding, e.g. `{ Rows, Affected, Share }`. */
  Measures: Record<string, number>;
  /** A few example values, when `includeSampleValues` allows and the kind has them. */
  SampleValues?: string[];
  Message: string;
  /** True when a measure is an estimate rather than an exact count. */
  Approximate?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurements
// ─────────────────────────────────────────────────────────────────────────────

/** A count a table probe can take for one column. Only measures for enabled checks are requested. */
export type ColumnMeasure =
  | 'NonNull'
  | 'Blank'
  | 'Untrimmed'
  | 'Variants'
  | 'NumericLike'
  | 'DateLike'
  | 'SentinelDate'
  | 'FutureDate'
  | 'Negative'
  | 'AtCapacity';

/** Counts one table probe took for one column. Absent fields were not requested. */
export interface ColumnQualityMeasures {
  NonNullRows?: number;
  /** Rows that are empty or whitespace only. */
  BlankRows?: number;
  /** Non-blank rows with leading or trailing whitespace. */
  UntrimmedRows?: number;
  /** Exact distinct values minus distinct values after `lower(trim())`; 0 means no variants. */
  VariantSpellings?: number;
  NumericLikeRows?: number;
  DateLikeRows?: number;
  SentinelDateRows?: number;
  FutureDateRows?: number;
  NegativeRows?: number;
  AtCapacityRows?: number;
  /**
   * Exact (case and whitespace sensitive) value distribution, fetched only for a column whose
   * probe found spelling variants. SQL Server's default collation folds case in `GROUP BY`, so the
   * sampled distribution there already hides the variants.
   */
  ExactDistribution?: Array<{ Value: string; Frequency: number }>;
  /** Value-free reason when this column alone failed after its batch was split. */
  Failed?: string;
}

/** The outcome of probing one table. */
export interface TableQualityProbeResult {
  ProbedAt: string;
  /** `partial` when some columns failed; `skipped` when the table was not probed at all. */
  Outcome: 'ok' | 'partial' | 'failed' | 'skipped';
  /** Value-free reason for `failed`/`skipped`, e.g. "rows above maxRowsForProbe". */
  Reason?: string;
  /** Exact `COUNT(*)`, when the probe ran. */
  RowCount?: number;
  /** Measures requested, so a resume can re-probe when a newly enabled check needs more. */
  Measures: ColumnMeasure[];
  Columns: Record<string, ColumnQualityMeasures>;
  DuplicateRows?: number;
  /** True when columns that cannot be compared (large objects) were left out of the duplicate count. */
  DuplicateRowsApproximate?: boolean;
  DurationMs: number;
}

/** Why a relationship was probed for orphans. */
export type RelationshipProbeOrigin = 'DeclaredUntrusted' | 'Discovered';

/** The outcome of probing one relationship for orphan rows. */
export interface RelationshipProbeResult {
  ProbedAt: string;
  Child: { Schema: string; Table: string; Columns: string[] };
  Parent: { Schema: string; Table: string; Columns: string[] };
  ConstraintName?: string;
  Origin: RelationshipProbeOrigin;
  Outcome: 'ok' | 'failed';
  Reason?: string;
  /** Child rows with every key column non-null: the rows a constraint would check. */
  CheckedRows?: number;
  /** Checked rows with no matching parent row. */
  OrphanRows?: number;
  ParentRows?: number;
  /** Parent rows no child row references. Only when UnreferencedParentRows is enabled. */
  UnreferencedParentRows?: number;
  DurationMs: number;
}

/** Phase metadata and measurements in `state.phases.dataQuality`. */
export interface DataQualityPhase {
  /** `partial` when a probe failed or a table was skipped; `skipped` when the run opted out. */
  Status: 'completed' | 'partial' | 'skipped';
  StartedAt: string;
  CompletedAt?: string;
  /** False for a run with `probes: false`: only statistics and catalog checks were evaluated. */
  ProbesEnabled: boolean;
  TotalTables: number;
  TablesProbed: number;
  TablesSkipped: number;
  TablesFailed: number;
  RelationshipsProbed: number;
  RelationshipsFailed: number;
  ProbeDurationMs: number;
  /** Keyed `schema.table`. */
  TableProbes: Record<string, TableQualityProbeResult>;
  /** Keyed by `RelationshipProbeKey`. */
  RelationshipProbes: Record<string, RelationshipProbeResult>;
  FindingsDerivedAt?: string;
  FindingCounts?: Record<DataQualitySeverity, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe contracts
// ─────────────────────────────────────────────────────────────────────────────

/** One column of a table probe and the measures wanted for it. */
export interface TableQualityProbeColumn {
  Name: string;
  DataType: string;
  /** Declared character length, when known. */
  DeclaredLength?: number;
  Measures: ColumnMeasure[];
}

/** What to measure on one table. */
export interface TableQualityProbeSpec {
  Schema: string;
  Table: string;
  Columns: TableQualityProbeColumn[];
  /** Also count exact duplicate rows. Only for tables without a primary key or unique index. */
  CountDuplicateRows: boolean;
  /** Columns compared for duplicate rows; large-object types are left out. */
  DuplicateRowColumns?: string[];
  FutureToleranceDays: number;
}

/** Result of probing one table. Never throws: failures are a value-free reason. */
export type TableQualityProbeOutcome =
  | {
      Ok: true;
      RowCount: number;
      Columns: Record<string, ColumnQualityMeasures>;
      DuplicateRows?: number;
      /** Column name to value-free reason, for columns that failed on their own. */
      FailedColumns: Record<string, string>;
    }
  | { Ok: false; Reason: string; Code?: string };

/** One relationship to probe for orphans. Composite keys list every column in key order. */
export interface RelationshipProbeSpec {
  Child: { Schema: string; Table: string; Columns: string[] };
  Parent: { Schema: string; Table: string; Columns: string[] };
  /** The two sides' types differ: compare as text, which avoids conversion errors. */
  CompareAsText: boolean;
  CountUnreferencedParents: boolean;
}

export type RelationshipProbeOutcome =
  | { Ok: true; CheckedRows: number; OrphanRows: number; ParentRows?: number; UnreferencedParentRows?: number }
  | { Ok: false; Reason: string; Code?: string };

/** One SQL statement run with a server-side bound where the engine has one. Never throws. */
export type BoundedQueryOutcome<T> = { Ok: true; Rows: T[] } | { Ok: false; Reason: string; Code?: string };
