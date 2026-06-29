/**
 * Shared type contracts for the External Data Sources subsystem.
 *
 * These describe the boundary between MJ and a remote system. Row payloads are
 * intentionally typed as `Record<string, unknown>` (aliased `ExternalRow`)
 * because the shape of a remote table/view/collection row is genuinely dynamic
 * and only known at runtime from metadata/introspection — callers narrow per
 * entity. This is a deliberate dynamic-data type, not a stand-in for a known
 * shape; every driver method is generic over `TRow` so a caller that DOES know
 * the shape can supply it.
 */

/** A single row marshalled from an external system. Keys are column/field names. */
export type ExternalRow = Record<string, unknown>;

/** Result of a driver connectivity probe. */
export interface ExternalConnectionTestResult {
  success: boolean;
  message: string;
  testedAt: Date;
  /** Round-trip latency of the probe, when measured. */
  latencyMs?: number;
}

// Schema-introspection contracts (ExternalObjectType, ExternalSchemaColumn, ExternalSchemaObject,
// ExternalSchemaDescriptor) now live in @memberjunction/core (externalDataSourceTypes.ts) so the
// abstract router seam + build-time consumers (CodeGen) can reference them without a hard
// dependency on this engine. Import them from @memberjunction/core.

/** RunView-equivalent request against a single remote object. */
export interface ExternalViewParams {
  /** Remote table/view/collection name; resolved against the data source DefaultSchema/DefaultDatabase when unqualified. */
  objectName: string;
  /** Columns to project. Empty/undefined = all columns. */
  fields?: string[];
  /** Filter expression in the data source's FilterDialect (a SQL WHERE body, or a driver-translated AST for non-SQL sources). */
  filter?: string;
  /** Order-by expression in the data source's dialect. */
  orderBy?: string;
  /** Maximum rows to return (page size). */
  maxRows?: number;
  /** Zero-based row offset for pagination. */
  offset?: number;
}

/** Result of a driver RunView call. */
export interface ExternalViewResult<TRow extends ExternalRow = ExternalRow> {
  success: boolean;
  rows: TRow[];
  /** Total rows matching the filter ignoring paging, when the driver can determine it cheaply. */
  totalRowCount?: number;
  errorMessage?: string;
  executionTimeMs: number;
}

/**
 * Normalized flat foreign-key row shape consumed by {@link BaseSqlExternalDataSourceDriver.groupForeignKeys}.
 * Each row pairs one referencing column with its referenced column; a composite key spans multiple rows
 * sharing a `constraint_name`. SQL drivers map their dialect-specific catalog rows into this shape so the
 * grouping logic lives once in the shared base.
 */
export interface ExternalFkRow {
  constraint_name: string;
  table_name: string;
  column_name: string;
  referenced_table: string;
  referenced_schema: string;
  referenced_column: string;
}

/** A bound parameter for native-dialect query execution. */
export interface ExternalQueryParameter {
  name: string;
  value: string | number | boolean | Date | null;
}

/** Result of a driver native-query call (used by MJ Queries with an ExternalDataSourceID). */
export interface ExternalQueryResult<TRow extends ExternalRow = ExternalRow> {
  success: boolean;
  rows: TRow[];
  rowCount: number;
  errorMessage?: string;
  executionTimeMs: number;
}
