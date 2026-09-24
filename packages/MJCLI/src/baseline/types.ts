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
  Dialect: Dialect;
  Schemas: SchemaDef[];
  Tables: TableDef[];
  Views: ViewDef[];
  Procedures: RoutineDef[];
  Functions: RoutineDef[];
  Triggers: TriggerDef[];
  Sequences: SequenceDef[];
  /** User-defined types (table types primarily; scalar/CLR are future work). */
  UserDefinedTypes: UserDefinedTypeDef[];
  /** sp_addextendedproperty entries (descriptions etc.) on schemas/tables/columns/views/routines. */
  ExtendedProperties: ExtendedPropertyDef[];
  /** Non-system database principals (users + custom roles). */
  Principals: DatabasePrincipalDef[];
  /** Non-system role memberships (ALTER ROLE ... ADD MEMBER). */
  RoleMemberships: RoleMembershipDef[];
  /** Object/schema/database/type permission grants (no DENY/REVOKE captured by default). */
  Permissions: PermissionDef[];
}

export interface SchemaDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface TableDef {
  Schema: string;
  Name: string;
  Columns: ColumnDef[];
  PrimaryKey?: PrimaryKeyDef;
  UniqueConstraints: UniqueConstraintDef[];
  Indexes: IndexDef[];
  ForeignKeys: ForeignKeyDef[];
  Checks: CheckConstraintDef[];
  HasIdentity: boolean;
}

export interface ColumnDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  ordinal: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  dataType: string;            // canonical: e.g. 'nvarchar(255)', 'int', 'decimal(18,4)' — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isNullable: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isIdentity: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isComputed: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  /** When `isComputed`, the body of the AS (...) expression. */
  computedExpression?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  /** When `isComputed`, whether the value is PERSISTED. */
  isComputedPersisted?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  /** DEFAULT expression text (already wrapped in parens by sys.default_constraints.definition). */
  defaultExpression?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  /** Original `sys.default_constraints.name`. Needed so the new DB's DF_* constraints match the source byte-for-byte. */
  defaultConstraintName?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  collation?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface PrimaryKeyDef {
  Name: string;
  Columns: string[];
  Clustered: boolean;
}

export interface UniqueConstraintDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  columns: string[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  clustered: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface IndexDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  columns: string[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  includes: string[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isUnique: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isClustered: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  filter?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface ForeignKeyDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  columns: string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  referencedSchema: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  referencedTable: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  referencedColumns: string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  onDelete: 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  onUpdate: 'NO_ACTION' | 'CASCADE' | 'SET_NULL' | 'SET_DEFAULT';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface CheckConstraintDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  expression: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface ViewDef {
  schema: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  definition: string;          // raw OBJECT_DEFINITION / pg_get_viewdef text — case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface RoutineDef {
  schema: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  definition: string;          // raw object body text — case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  kind: 'procedure' | 'function';  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

export interface TriggerDef {
  schema: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  table: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  definition: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface SequenceDef {
  schema: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  startValue: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  increment: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  minValue?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  maxValue?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  cycle: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  currentValue?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/** A user-defined TYPE (currently only table types; scalar/CLR are future work). */
export interface UserDefinedTypeDef {
  Schema: string;
  Name: string;
  Kind: 'table';
  IsMemoryOptimized: boolean;
  Columns: UserDefinedTypeColumnDef[];
  /** Inline primary key, if any. CREATE TYPE AS TABLE supports a PK clause. */
  PrimaryKey?: PrimaryKeyDef;
}

/** Columns inside a CREATE TYPE AS TABLE definition. Subset of ColumnDef (no identity/computed/FK). */
export interface UserDefinedTypeColumnDef {
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  ordinal: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  dataType: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  isNullable: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  collation?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/**
 * A non-system database principal — a SQL user (mapped or contained) or a
 * custom database role. Fixed roles (db_owner, db_datareader, etc.) and
 * built-in users (dbo, guest, public, sys) are filtered out at introspection
 * time; the baseline never re-creates those.
 */
export interface DatabasePrincipalDef {
  Name: string;
  Kind: 'sql_user' | 'database_role' | 'windows_user' | 'application_role' | 'aad_user' | 'aad_group';
  /** Owner principal name (e.g. `db_securityadmin` for MJ's cdp_* roles). Undefined falls back to the current user (typically `dbo`). */
  Owner?: string;
  /** Default schema for users. Roles don't have one. */
  DefaultSchema?: string;
}

/** A row in `sys.database_role_members`. Both names refer to principals (user or role). */
export interface RoleMembershipDef {
  role: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  member: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
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
  grantee: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  state: PermissionState;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  permission: string;            // SELECT | EXECUTE | CONNECT | UPDATE | INSERT | DELETE | REFERENCES | etc. — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  targetClass: 'database' | 'schema' | 'object' | 'type';  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  targetSchema?: string;         // for class='schema' or 'object' — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  targetObject?: string;         // for class='object' — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  targetType?: string;           // for class='type' (UDT name) — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
  targetColumn?: string;         // for column-level grants (object-class with minor_id > 0) — case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/**
 * An `sp_addextendedproperty` entry. MJ uses these heavily for MS_Description
 * on tables, columns, views, procs, and functions. Skipping them produces a
 * silent DB difference that CodeGen and tools depend on.
 */
export interface ExtendedPropertyDef {
  /** Property name, e.g. 'MS_Description'. Case is preserved as stored. */
  Name: string;
  /** Property value, always serialized as NVARCHAR. */
  Value: string;
  /** level0 is always SCHEMA in MJ. Stored separately so we can emit the canonical 3-tier call. */
  SchemaName: string;
  /** TABLE | VIEW | PROCEDURE | FUNCTION | TYPE | SEQUENCE | TRIGGER | null (for schema-level properties). */
  Level1Type?: string;
  Level1Name?: string;
  /** COLUMN | PARAMETER | TRIGGER | INDEX | null. */
  Level2Type?: string;
  Level2Name?: string;
}

/** Per-table data dump (every row, ordered deterministically). */
export interface TableDataDump {
  Schema: string;
  Table: string;
  /** Column order matches the INSERT column list. */
  Columns: string[];
  /** Each row is an array of values matching `columns`. Null = JS null. */
  Rows: unknown[][];
  /** Set when the dump was truncated due to a hard limit. */
  Truncated?: boolean;
  RowCount: number;
}

/** Output of a full diff between two snapshots (and optional row data). */
export interface DiffReport {
  generatedAt: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  leftLabel: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  rightLabel: string;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  rowCompareMode: RowCompareMode;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  isClean: boolean;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  objectDiffs: ObjectDiff[];  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  tableRowDiffs: TableRowDiff[];  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  summary: DiffSummary;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
}

export interface DiffSummary {
  schemasChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  tablesChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  viewsChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  proceduresChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  functionsChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  triggersChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  sequencesChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  userDefinedTypesChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  extendedPropertiesChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  principalsChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  roleMembershipsChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  permissionsChecked: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  objectsWithDiffs: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  tablesWithRowDiffs: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
  totalRowDiffs: number;  // case-violation-ok-legacy-back-compat: the type crosses a serialization boundary (JSON / HTTP body), so this member name is part of a wire or on-disk shape
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
  Kind: ObjectKind;
  DiffKind: DiffKind;
  QualifiedName: string;       // e.g. "dbo.Customer" or "dbo.Customer.FirstName"
  /** Free-form details: which fields differ, with left/right values. */
  Details?: string;
  LeftValue?: unknown;
  RightValue?: unknown;
}

export interface TableRowDiff {
  Schema: string;
  Table: string;
  LeftRowCount: number;
  RightRowCount: number;
  /** First N (default 100) row mismatches captured during full mode. */
  SampleDiffs: RowDiff[];
  /** True if there are more diffs than `sampleDiffs` shows. */
  Truncated: boolean;
  /** Total mismatches counted (may exceed sampleDiffs.length). */
  DiffCount: number;
}

export interface RowDiff {
  DiffKind: DiffKind;
  /** Stringified key (PK or whole-row hash) used for matching. */
  Key: string;
  /** Per-column diffs in 'changed' rows only. */
  ColumnDiffs?: ColumnValueDiff[];
}

export interface ColumnValueDiff {
  Column: string;
  LeftValue: unknown;
  RightValue: unknown;
}

/** Build options passed to the emitter. */
export interface BaselineEmitOptions {
  baselineVersion: string;     // 'Major.Minor' (literal x is appended in filename to match V-file convention) — case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  description: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  generatedAtUtc: Date;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  includeData: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  excludedDataTables: Set<string>; // 'schema.table' lowercased — case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  batchSize: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
}

export interface BaselineCompareOptions {
  RowCompareMode: RowCompareMode;
  RowHashAlgo: RowHashAlgo;
  IgnorePattern?: RegExp;
  RowDiffSampleLimit: number;  // default 100
}
