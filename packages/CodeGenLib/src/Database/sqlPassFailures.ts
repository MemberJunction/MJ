/**
 * One failure recorded by the SQL generation/execution pass
 * (`SQLCodeGenBase.ManageSQLScriptsAndExecution`).
 *
 * The post-pass CRUD self-heal re-runs only the entities whose routines are missing, so it can
 * repair only failures that belong to one of those entities. A failure with no entity (a custom
 * SQL script, the bulk file execution, field sync, permissions) is outside its reach.
 */
export interface SQLPassFailure {
    /** The step that failed, e.g. `Generating SQL`, `before-sql scripts`, `Applying permissions`. */
    Step: string;
    /** The entity the failure belongs to, or null when the step failed as a whole. */
    EntityName: string | null;
    /** What failed, for the run's failure list. */
    Message: string;
}

/**
 * Returns the SQL-pass failures the CRUD self-heal did not repair: every failure with no entity,
 * and every entity failure whose entity the self-heal did not re-run successfully. An empty
 * result means the SQL-pass failure can be cleared.
 *
 * @param failures what the SQL pass recorded
 * @param healedEntityNames entities the self-heal re-ran with every phase succeeding
 */
export function UnhealedSQLPassFailures(
    failures: ReadonlyArray<SQLPassFailure>,
    healedEntityNames: Iterable<string>,
): SQLPassFailure[] {
    const healed = new Set<string>();
    for (const name of healedEntityNames) healed.add(name.trim().toLowerCase());
    return failures.filter((f) => f.EntityName === null || !healed.has(f.EntityName.trim().toLowerCase()));
}

/**
 * One failed batch in a SQL file a provider executed, named by the object the batch acts on.
 * Collected by providers that run a file batch by batch (SQL Server), so the SQL pass can record
 * the first real failure instead of only "a file failed".
 */
export interface SQLObjectFailure {
    /** The file the batch came from. */
    File: string;
    /** The object the batch acts on, e.g. `CREATE VIEW [s].[vwX]`, `GRANT ON [s].[spCreateX]`. */
    Object: string;
    /** The database error. */
    Message: string;
}

const DESCRIBED_DDL = /^(?:CREATE(?: OR ALTER)?|ALTER|DROP) (?:PROCEDURE|PROC|VIEW|FUNCTION|TRIGGER|TABLE|INDEX) (\S+)$/i;
const DESCRIBED_PERMISSION = /^(?:GRANT|DENY|REVOKE) ON (\S+)$/i;
const DESCRIBED_EXEC = /^EXEC \S+ '([^']*)'$/i;

/**
 * Returns the lowercased `schema.name` of the object a batch description names (the forms
 * `DescribeSQLBatchObject` produces), with brackets removed, or null when the description names
 * no schema-qualified object.
 */
export function SQLObjectKeyFromDescription(description: string): string | null {
    const text = description.trim();
    const name = (DESCRIBED_DDL.exec(text) ?? DESCRIBED_PERMISSION.exec(text) ?? DESCRIBED_EXEC.exec(text))?.[1];
    if (!name) return null;
    const parts = name.split('.').map((p) => p.replace(/^\[|\]$/g, '').trim()).filter((p) => p.length > 0);
    if (parts.length < 2) return null;
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`.toLowerCase();
}

/** Formats a failure for one-line logs and the run's failure summary. */
export function DescribeSQLPassFailure(failure: SQLPassFailure): string {
    return `[${failure.Step}]${failure.EntityName ? ` ${failure.EntityName}:` : ''} ${failure.Message}`;
}

/**
 * The run-summary line for a failed SQL pass. It quotes the first recorded failure, which is
 * usually the cause: later ones (a GRANT on the object that failed to create) follow from it.
 */
export function SQLPassFailureSummary(failures: ReadonlyArray<SQLPassFailure>): string {
    const base = 'SQL generation/execution reported a failure';
    if (failures.length === 0) return `${base}; see the errors logged above`;
    const more = failures.length > 1 ? ` (${failures.length - 1} more logged above)` : '';
    return `${base}. First failure: ${DescribeSQLPassFailure(failures[0])}${more}`;
}
