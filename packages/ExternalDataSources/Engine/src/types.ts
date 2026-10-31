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
  /** Order-by expression in the data source's dialect (caller-supplied; screened for read-only safety). */
  orderBy?: string;
  /**
   * Fallback ordering columns — raw, unquoted identifier names from MJ metadata (the entity's primary
   * key) — the driver applies ONLY when {@link orderBy} is absent, to make offset pagination
   * deterministic. Each driver applies them per its own dialect: SQL drivers quote each identifier
   * (so mixed-case / reserved-word PK columns resolve on case-sensitive dialects); MongoDB uses them
   * as raw field names. Trusted (PK names from introspected metadata), so NOT clause-screened.
   */
  defaultOrderByColumns?: readonly string[];
  /** Maximum rows to return (page size). */
  maxRows?: number;
  /** Zero-based row offset for pagination. */
  offset?: number;
  /**
   * Structured incremental lower-bound: return only rows where `Field >= Value` (INCLUSIVE). The driver
   * renders this to its own dialect — SQL drivers to a quoted `WHERE <Field> >= <literal>` using their own
   * identifier quoting, MongoDB to `{ <Field>: { $gte: <coerced> } }` — so an incremental-sync caller
   * NEVER writes dialect SQL. Combined (ANDed) with {@link filter} when both are present. Inclusive by
   * design so a caller can re-read the watermark boundary and rely on downstream dedup rather than risk
   * skipping a row whose sub-second timestamp truncates to the saved value.
   */
  incrementalSince?: { Field: string; Value: string };
  /**
   * Structured keyset ("seek") resume point for deep pagination. The driver renders it into its own
   * dialect — identifier quoting, literal formatting and NULL ordering — so a caller never writes dialect
   * SQL. ANDed with {@link filter} and {@link incrementalSince}. A caller that supplies it is seeking
   * instead of offsetting, so it passes `offset: 0` (or no offset). Ordering contract: {@link ExternalSeekAfter}.
   */
  seekAfter?: ExternalSeekAfter;
}

/**
 * The last row a keyset walk consumed, over rows ordered by `Watermark.Field` ASC (when present) and then
 * each `Keys[i].Field` ASC. A driver renders "every row strictly after this one in that order". The part
 * no caller can know is where the dialect sorts a NULL watermark: SQL Server, MySQL, Databricks and MongoDB
 * put NULL first in an ascending sort; PostgreSQL, Oracle and Snowflake put it last. The driver owns that.
 */
export interface ExternalSeekAfter {
  /** The watermark component of the ordering. Omitted when the walk is keyed on the primary key alone. */
  Watermark?: {
    Field: string;
    /** The last consumed watermark value, or `null` when the last consumed row's watermark was NULL. */
    Value: string | null;
    /**
     * Present when `Value` is a temporal value truncated by the driver (JavaScript `Date` holds whole
     * milliseconds, so a `datetime2(7)` / `timestamp(6)` value comes back without its sub-millisecond part):
     * every consumed row's watermark lies in `[Value, ExclusiveUpper)`. With `Keys` empty that whole range
     * has been consumed and the seek is "after the range"; with `Keys` the seek is
     * "after the range OR (in the range AND keys after)".
     *
     * A column coarser than a millisecond (SQL Server `datetime` holds 1/300 s, `smalldatetime` whole
     * minutes) rounds the `ExclusiveUpper` literal back down into the consumed range, so a driver must
     * not render "after the range" as `Field >= ExclusiveUpper` alone: SQL drivers render
     * `Field >= ExclusiveUpper AND Field > Value` and "in the range" as
     * `Field >= Value AND (Field < ExclusiveUpper OR Field = Value)`, which are exact for every precision.
     */
    ExclusiveUpper?: string;
    /**
     * Only with `ExclusiveUpper` and a non-NULL `Value`: restrict the read to rows INSIDE
     * `[Value, ExclusiveUpper)` with keys after `Keys` (every row of the range when `Keys` is empty).
     * The caller then orders by the key columns alone. Used to walk one truncated range that holds more
     * rows than a batch, where the full-precision watermark order inside the range cannot be resumed.
     */
    WithinRange?: boolean;
  };
  /**
   * The primary-key components in ordering position, each holding the last consumed value. May be empty
   * only together with `Watermark.ExclusiveUpper` (the whole truncation range was consumed, or — with
   * `WithinRange` — none of it has been read yet).
   */
  Keys: Array<{ Field: string; Value: string | number }>;
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

/**
 * Strip credentials from any connection-string-like `scheme://user:pass@host` embedded in a message.
 * Driver SDKs (notably MongoDB) echo the connection URI in their errors; a URI with inline credentials
 * (e.g. `mongodb://user:pass@host`) would otherwise leak into logs and API error responses. Redacts the
 * entire userinfo portion, leaving the host intact. Shared by the base driver and the read router so
 * every external-read error surface redacts identically.
 */
export function RedactConnectionSecrets(message: string): string {
  return message.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1***@');
}

/** @deprecated Use {@link RedactConnectionSecrets}. */
export function redactConnectionSecrets(message: string): string {
  return RedactConnectionSecrets(message);
}
