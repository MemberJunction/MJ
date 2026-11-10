/**
 * MJ metadata records field types in SQL Server's vocabulary on every platform: on PostgreSQL,
 * `vwSQLColumnsAndEntityFields` reports a `uuid` column as `uniqueidentifier`. A client clause built
 * from `EntityFieldInfo.Type` without knowing the platform (the list-membership filter's
 * `CAST(RecordID AS uniqueidentifier)`) therefore names a type PostgreSQL does not have.
 *
 * `CAST(… AS uniqueidentifier)` is the one form MJ builds this way, so only that form is rewritten:
 * `AS uniqueidentifier` immediately before the CAST's closing parenthesis becomes `AS uuid`. The
 * PostgreSQL provider applies this to the code (not the literals) of every client clause it runs
 * (`TransformExternalSQLClause`), and the client-clause screen applies it to the copy it parses
 * under the PostgreSQL dialect, so the screen judges the clause the provider will run.
 */
const UNIQUEIDENTIFIER_CAST = /\b(AS\s+)uniqueidentifier(?=\s*\))/gi;

/** `CAST(x AS uniqueidentifier)` → `CAST(x AS uuid)`; the rest of `sql` is unchanged. */
export function MapTSQLCastTypesForPostgreSQL(sql: string): string {
    return sql.replace(UNIQUEIDENTIFIER_CAST, '$1uuid');
}
