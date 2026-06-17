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

export type ExternalObjectType = 'table' | 'view' | 'collection';

/** One column/field discovered during schema introspection. */
export interface ExternalSchemaColumn {
  name: string;
  /** Native remote data type, verbatim (e.g. 'VARCHAR2', 'NUMBER', 'timestamptz', 'ObjectId'). */
  nativeType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  /** Human description if the remote catalog supplies one. */
  description?: string;
}

/** One table/view/collection discovered during schema introspection. */
export interface ExternalSchemaObject {
  name: string;
  objectType: ExternalObjectType;
  /** Schema/namespace the object lives in on the remote side, when applicable. */
  schema?: string;
  columns: ExternalSchemaColumn[];
}

/** The result of introspecting a remote source's schema. */
export interface ExternalSchemaDescriptor {
  /** Source-level identifier the schema was read from (database/catalog/namespace). */
  database?: string;
  objects: ExternalSchemaObject[];
}

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
