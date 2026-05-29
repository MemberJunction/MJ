/**
 * Shared types for the baseline migration builder + comparator.
 *
 * A SchemaSnapshot is the result of introspecting a live database. It is
 * dialect-agnostic in shape (the same shape comes back from MSSQL or PG),
 * but every field is stored verbatim from the source system. Equality is
 * decided structurally by the comparator.
 */

export type Dialect = 'mssql' | 'postgres';

/** Top-level snapshot of an introspected database. */
export interface SchemaSnapshot {
  dialect: Dialect;
  schemas: SchemaDef[];
  tables: TableDef[];
  views: ViewDef[];
  procedures: RoutineDef[];
  functions: RoutineDef[];
  triggers: TriggerDef[];
  sequences: SequenceDef[];
  /** User-defined types (table types primarily; scalar/CLR are future work). */
  userDefinedTypes: UserDefinedTypeDef[];
  /** sp_addextendedproperty entries (descriptions etc.) on schemas/tables/columns/views/routines. */
  extendedProperties: ExtendedPropertyDef[];
  /** Non-system database principals (users + custom roles). */
  principals: DatabasePrincipalDef[];
  /** Non-system role memberships (ALTER ROLE ... ADD MEMBER). */
  roleMemberships: RoleMembershipDef[];
  /** Object/schema/database/type permission grants (no DENY/REVOKE captured by default). */
  permissions: PermissionDef[];
}

export interface SchemaDef {
  name: string;
}

export interface TableDef {
  schema: string;
  name: string;
  columns: ColumnDef[];
  primaryKey?: PrimaryKeyDef;
  uniqueConstraints: UniqueConstraintDef[];
  indexes: IndexDef[];
  foreignKeys: ForeignKeyDef[];
  checks: CheckConstraintDef[];
  hasIdentity: boolean;
}

export interface ColumnDef {
  name: string;
  ordinal: number;
  dataType: string;            // canonical: e.g. 'nvarchar(255)', 'int', 'decimal(18,4)'
  isNullable: boolean;
  isIdentity: boolean;
  isComputed: boolean;
  /** When `isComputed`, the body of the AS (...) expression. */
  computedExpression?: string;
  /** When `isComputed`, whether the value is PERSISTED. */
  isComputedPersisted?: boolean;
  /** DEFAULT expression text (already wrapped in parens by sys.default_constraints.definition). */
  defaultExpression?: string;
  /** Original `sys.default_constraints.name`. Needed so the new DB's DF_* constraints match the source byte-for-byte. */
  defaultConstraintName?: string;
  collation?: string;
}

export interface PrimaryKeyDef {
  name: string;
  columns: string[];
  clustered: boolean;
}

export interface UniqueConstraintDef {
  name: string;
  columns: string[];
  clustered: boolean;
}

export interface IndexDef {
  name: string;
  columns: string[];
  includes: string[];
  isUnique: boolean;
  isClustered: boolean;
  filter?: string;
}

export interface ForeignKeyDef {
  name: string;
  columns: string[];
  referencedSchema: string;
  referencedTable: string;
  referencedColumns: string[];
  onDelete: 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT';
  onUpdate: 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT';
}

export interface CheckConstraintDef {
  name: string;
  expression: string;
}

export interface ViewDef {
  schema: string;
  name: string;
  definition: string;          // raw OBJECT_DEFINITION / pg_get_viewdef text
}

export interface RoutineDef {
  schema: string;
  name: string;
  definition: string;          // raw object body text
  kind: 'procedure' | 'function';
}

export interface TriggerDef {
  schema: string;
  name: string;
  table: string;
  definition: string;
}

export interface SequenceDef {
  schema: string;
  name: string;
  startValue: string;
  increment: string;
  minValue?: string;
  maxValue?: string;
  cycle: boolean;
  currentValue?: string;
}

/** A user-defined TYPE (currently only table types; scalar/CLR are future work). */
export interface UserDefinedTypeDef {
  schema: string;
  name: string;
  kind: 'table';
  isMemoryOptimized: boolean;
  columns: UserDefinedTypeColumnDef[];
  /** Inline primary key, if any. CREATE TYPE AS TABLE supports a PK clause. */
  primaryKey?: PrimaryKeyDef;
}

/** Columns inside a CREATE TYPE AS TABLE definition. Subset of ColumnDef (no identity/computed/FK). */
export interface UserDefinedTypeColumnDef {
  name: string;
  ordinal: number;
  dataType: string;
  isNullable: boolean;
  collation?: string;
}

/**
 * A non-system database principal — a SQL user (mapped or contained) or a
 * custom database role. Fixed roles (db_owner, db_datareader, etc.) and
 * built-in users (dbo, guest, public, sys) are filtered out at introspection
 * time; the baseline never re-creates those.
 */
export interface DatabasePrincipalDef {
  name: string;
  kind: 'sql_user' | 'database_role' | 'windows_user' | 'application_role' | 'aad_user' | 'aad_group';
  /** Owner principal name (e.g. `db_securityadmin` for MJ's cdp_* roles). Undefined falls back to the current user (typically `dbo`). */
  owner?: string;
  /** Default schema for users. Roles don't have one. */
  defaultSchema?: string;
}

/** A row in `sys.database_role_members`. Both names refer to principals (user or role). */
export interface RoleMembershipDef {
  role: string;
  member: string;
}

/** State of a permission row in `sys.database_permissions`. */
export type PermissionState = 'GRANT' | 'GRANT_WITH_GRANT_OPTION' | 'DENY' | 'REVOKE';

/**
 * A `GRANT`/`DENY` entry. MJ's CodeGen emits per-object grants for every view
 * and stored procedure (e.g. `GRANT EXECUTE ON [__mj].[spCreateAIAgent] TO [cdp_Developer]`).
 * Without these in the baseline, downstream V-files that GRANT to roles fail because
 * the grantee is missing AND/OR the migration sequence drifts.
 */
export interface PermissionDef {
  grantee: string;
  state: PermissionState;
  permission: string;            // SELECT | EXECUTE | CONNECT | UPDATE | INSERT | DELETE | REFERENCES | etc.
  targetClass: 'database' | 'schema' | 'object' | 'type';
  targetSchema?: string;         // for class='schema' or 'object'
  targetObject?: string;         // for class='object'
  targetType?: string;           // for class='type' (UDT name)
  targetColumn?: string;         // for column-level grants (object-class with minor_id > 0)
}

/**
 * An `sp_addextendedproperty` entry. MJ uses these heavily for MS_Description
 * on tables, columns, views, procs, and functions. Skipping them produces a
 * silent DB difference that CodeGen and tools depend on.
 */
export interface ExtendedPropertyDef {
  /** Property name, e.g. 'MS_Description'. Case is preserved as stored. */
  name: string;
  /** Property value, always serialized as NVARCHAR. */
  value: string;
  /** level0 is always SCHEMA in MJ. Stored separately so we can emit the canonical 3-tier call. */
  schemaName: string;
  /** TABLE | VIEW | PROCEDURE | FUNCTION | TYPE | SEQUENCE | TRIGGER | null (for schema-level properties). */
  level1Type?: string;
  level1Name?: string;
  /** COLUMN | PARAMETER | TRIGGER | INDEX | null. */
  level2Type?: string;
  level2Name?: string;
}

/** Per-table data dump (every row, ordered deterministically). */
export interface TableDataDump {
  schema: string;
  table: string;
  /** Column order matches the INSERT column list. */
  columns: string[];
  /** Each row is an array of values matching `columns`. Null = JS null. */
  rows: unknown[][];
  /** Set when the dump was truncated due to a hard limit. */
  truncated?: boolean;
  rowCount: number;
}

/** Output of a full diff between two snapshots (and optional row data). */
export interface DiffReport {
  generatedAt: string;
  leftLabel: string;
  rightLabel: string;
  rowCompareMode: RowCompareMode;
  isClean: boolean;
  objectDiffs: ObjectDiff[];
  tableRowDiffs: TableRowDiff[];
  summary: DiffSummary;
}

export interface DiffSummary {
  schemasChecked: number;
  tablesChecked: number;
  viewsChecked: number;
  proceduresChecked: number;
  functionsChecked: number;
  triggersChecked: number;
  sequencesChecked: number;
  userDefinedTypesChecked: number;
  extendedPropertiesChecked: number;
  principalsChecked: number;
  roleMembershipsChecked: number;
  permissionsChecked: number;
  objectsWithDiffs: number;
  tablesWithRowDiffs: number;
  totalRowDiffs: number;
}

export type RowCompareMode = 'full' | 'hash' | 'counts' | 'none';
export type RowHashAlgo = 'sha256' | 'md5' | 'checksum_agg';

export type ObjectKind =
  | 'schema'
  | 'table'
  | 'column'
  | 'primaryKey'
  | 'uniqueConstraint'
  | 'index'
  | 'foreignKey'
  | 'check'
  | 'view'
  | 'procedure'
  | 'function'
  | 'trigger'
  | 'sequence'
  | 'userDefinedType'
  | 'extendedProperty'
  | 'principal'
  | 'roleMembership'
  | 'permission';

export type DiffKind = 'missing-on-left' | 'missing-on-right' | 'changed';

export interface ObjectDiff {
  kind: ObjectKind;
  diffKind: DiffKind;
  qualifiedName: string;       // e.g. "dbo.Customer" or "dbo.Customer.FirstName"
  /** Free-form details: which fields differ, with left/right values. */
  details?: string;
  leftValue?: unknown;
  rightValue?: unknown;
}

export interface TableRowDiff {
  schema: string;
  table: string;
  leftRowCount: number;
  rightRowCount: number;
  /** First N (default 100) row mismatches captured during full mode. */
  sampleDiffs: RowDiff[];
  /** True if there are more diffs than `sampleDiffs` shows. */
  truncated: boolean;
  /** Total mismatches counted (may exceed sampleDiffs.length). */
  diffCount: number;
}

export interface RowDiff {
  diffKind: DiffKind;
  /** Stringified key (PK or whole-row hash) used for matching. */
  key: string;
  /** Per-column diffs in 'changed' rows only. */
  columnDiffs?: ColumnValueDiff[];
}

export interface ColumnValueDiff {
  column: string;
  leftValue: unknown;
  rightValue: unknown;
}

/** Build options passed to the emitter. */
export interface BaselineEmitOptions {
  baselineVersion: string;     // 'Major.Minor' (literal x is appended in filename to match V-file convention)
  description: string;
  generatedAtUtc: Date;
  includeData: boolean;
  excludedDataTables: Set<string>; // 'schema.table' lowercased
  batchSize: number;
}

export interface BaselineCompareOptions {
  rowCompareMode: RowCompareMode;
  rowHashAlgo: RowHashAlgo;
  ignorePattern?: RegExp;
  rowDiffSampleLimit: number;  // default 100
}
