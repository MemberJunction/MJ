/**
 * Save-grammar types — consumed by the dialect-driven save pipeline in
 * `GenericDatabaseProvider.GenerateSaveSQL` and implemented by provider
 * subclasses (`SQLServerDataProvider`, `PostgreSQLDataProvider`).
 *
 * See `plans/sp-save-builder-generic-layer-refactor.md` (rev 4) for the
 * architecture rationale. Short version: save-call composition is
 * provider-specific behavior, so the abstract hooks + types live on the
 * generic-database-provider layer (where `EntityFieldInfo` is in scope)
 * rather than on `SQLDialect`.
 */

/**
 * Result of a provider's `CoerceSaveFieldValue` per-field value transform.
 *
 * - `{ kind: 'use', value }` — bind the (possibly transformed) value.
 * - `{ kind: 'skip' }` — omit the field from the save call entirely, so the
 *   SP body's default fires. Used when a `uniqueidentifier` PK-on-create
 *   carries a function-literal value like `"newid()"` and we want the DB
 *   default to supply the UUID instead of trying to insert the literal
 *   string.
 */
export type SaveCoercedValue =
    | { kind: 'use'; value: unknown }
    | { kind: 'skip' };

/**
 * Dialect-specific binding shape produced by `RenderSaveCallBinding`.
 * Treated as opaque by `GenerateSaveSQL` — the same provider's
 * `WrapSaveCallForResult` / `WrapSaveCallWithRecordChange` pattern-match
 * the variant they produced.
 *
 * Adding a new dialect (e.g. MySQL) adds a new variant here — touches this
 * file once, no provider-side changes elsewhere.
 */
export type SaveCallBinding =
    /**
     * SQL Server: parameter values inlined as DECLARE/SET statements
     * (so SQL Server's per-save variable naming for batched saves works),
     * with an EXEC line that consumes the variables.
     */
    | {
          kind: 'mssql-declare-exec';
          /** `DECLARE @x_uuid type, @y_uuid type` — empty if no params. */
          preambleSQL: string;
          /** `SET @x_uuid = N'value'\nSET @y_uuid = 1` — empty if no params. */
          setSQL: string;
          /** Comma-joined `@CodeName=@x_uuid, ...` for the EXEC line. */
          callArgsSQL: string;
          /** Back-compat inline single-line `@CodeName=N'value', ...` form. */
          simpleParamsSQL: string;
      }
    /**
     * PostgreSQL positional-arg shape: typed `$N` placeholders bound via
     * `values` at execution time.
     */
    | {
          kind: 'pg-positional';
          /** `p_name => $1, p_other => $2` for the call site. */
          callArgsSQL: string;
          /** Parameter values bound in `$N` order. */
          values: unknown[];
      }
    /**
     * PostgreSQL JSON-arg shape for wide entities — single `$1::jsonb` arg
     * with field values JSON-encoded. Used when the typed-arg shape would
     * exceed `ProcedureParamLimit`.
     */
    | {
          kind: 'pg-json-arg';
          /** Always `p_data => $1::jsonb`. */
          callArgsSQL: string;
          /** Single-element `[jsonString]`. */
          values: [string];
      };

/**
 * Final SQL + optional parameter array produced by `WrapSaveCallForResult`
 * and `WrapSaveCallWithRecordChange`. Returned by `GenericDatabaseProvider`
 * via `SaveSQLResult`.
 *
 * For SQL Server, `parameters` is typically omitted — the binding inlines
 * everything via DECLARE/SET. For PostgreSQL, `parameters` carries the
 * positional or JSON-arg values that bind to the `$N` placeholders.
 */
export interface SaveSQLFragment {
    sql: string;
    parameters?: unknown[];
}

// Re-export `RecordChangePayload` from `@memberjunction/core` for convenience.
// The canonical definition lives there alongside `BaseEntity` and
// `BuildRecordChangePayload` — we don't duplicate it.
export type { RecordChangePayload } from '@memberjunction/core';
