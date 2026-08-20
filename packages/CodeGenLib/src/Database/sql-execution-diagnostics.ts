/**
 * Run-level record of SQL execution failures, so a LATER step can name the EARLIER
 * failure that caused it.
 *
 * The problem this solves (MJ#3975 §1): CodeGen's bulk entity-SQL execution reports each
 * failed batch as a warning and keeps going — by design, because one entity's broken view
 * must not abort the other 400. But the run then reaches STEP 4 and executes the generated
 * GRANT files for objects that were never created, and *those* errors are the last thing on
 * screen. The operator is shown `Cannot find the object 'spCreateOrganization'` — a
 * consequence — while `View or function 'vwOrganizations' has more column names specified
 * than columns defined` — the cause — scrolled past hundreds of lines earlier.
 *
 * Recording the failures as they happen lets STEP 4 say "this GRANT failed BECAUSE that
 * object's creation failed, here is that error" instead of leaving the operator to bisect.
 *
 * Deliberately a static collector: CodeGen is a single-run CLI process, the recording site
 * (a database provider's file executor) and the reading site (`applyPermissions`) are far
 * apart in the call graph, and threading a context object through every layer between them
 * would touch a dozen signatures for one diagnostic. `Reset()` keeps it test-addressable.
 */
import { logError, logStatus } from '../Misc/status_logging';

/** One failed SQL batch. */
export type SQLExecutionFailure = {
    /** The SQL file being executed (a temp batch file, or a combined `_all_entities.sql`). */
    file: string;
    /** 1-based batch number within that file, when known. */
    batchNumber?: number;
    /** Total batches in that file, when known. */
    totalBatches?: number;
    /**
     * The database object the batch was creating, when it could be determined from the SQL
     * (`CREATE VIEW x`, `CREATE PROCEDURE x`, …). This is what lets a later GRANT failure be
     * matched back to the creation that failed.
     */
    objectName?: string;
    /** The database error, in full — never truncated. */
    message: string;
};

/**
 * Recognizes the `CREATE`/`ALTER` target of a batch so a downstream GRANT failure on the same
 * object can be attributed to it. Intentionally permissive about whitespace, brackets, quotes
 * and schema qualification, and it returns the BARE object name (no schema) because that is
 * how the missing-object errors name it.
 */
export function ExtractCreatedObjectName(sql: string): string | undefined {
    const m = /\b(?:CREATE|ALTER)\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?(?:VIEW|PROC|PROCEDURE|FUNCTION|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(;]+)/i.exec(sql);
    if (!m) {
        return undefined;
    }
    const parts = m[1].split('.');
    const bare = parts[parts.length - 1].replace(/^[[""`]|[\]""`]$/g, '');
    return bare.length > 0 ? bare : undefined;
}

/**
 * True when a database error means "the object this statement targets does not exist", as
 * opposed to any other reason a statement can fail. Matched on message text rather than error
 * number because CodeGen's executors surface errors from several drivers (mssql, pg) and, on
 * some paths, only the message survives.
 *
 * SQL Server: Msg 15151 / 4604 — `Cannot find the object 'X', because it does not exist or
 * you do not have permission.` (also `Cannot find the user`/`role` variants, which are a
 * different problem and deliberately NOT matched).
 * PostgreSQL: SQLSTATE 42883 / 42P01 — `relation "x" does not exist`,
 * `function x does not exist`.
 */
export function IsMissingObjectError(message: string): boolean {
    return /Cannot find the object\b/i.test(message)
        || /\b(?:relation|table|function|view|procedure)\b[^\n]*\bdoes not exist\b/i.test(message);
}

export class SQLExecutionDiagnostics {
    private static _failures: SQLExecutionFailure[] = [];

    /** Records a failed batch. Called by the database providers' file executors. */
    public static Record(failure: SQLExecutionFailure): void {
        SQLExecutionDiagnostics._failures.push(failure);
    }

    /** Every failure recorded in this run, in the order they happened. */
    public static get Failures(): readonly SQLExecutionFailure[] {
        return SQLExecutionDiagnostics._failures;
    }

    /** The first failure of the run — the one an operator should be shown as the cause. */
    public static get FirstFailure(): SQLExecutionFailure | undefined {
        return SQLExecutionDiagnostics._failures[0];
    }

    /**
     * The recorded creation failure for `objectName`, if this run has one. A GRANT that fails
     * with "cannot find the object" and gets a hit here is a CONSEQUENCE, not a cause.
     */
    public static FailureForObject(objectName: string): SQLExecutionFailure | undefined {
        const needle = objectName.toLowerCase();
        return SQLExecutionDiagnostics._failures.find(
            (f) => f.objectName?.toLowerCase() === needle || f.message.toLowerCase().includes(`'${needle}'`),
        );
    }

    /** Clears the collector. Called at the start of a run (and by tests). */
    public static Reset(): void {
        SQLExecutionDiagnostics._failures = [];
    }

    /** Renders one failure as a single operator-facing line. */
    public static Describe(f: SQLExecutionFailure): string {
        const where = f.batchNumber !== undefined
            ? `${f.file} batch ${f.batchNumber}${f.totalBatches !== undefined ? `/${f.totalBatches}` : ''}`
            : f.file;
        const what = f.objectName ? ` (creating ${f.objectName})` : '';
        return `${where}${what}: ${f.message}`;
    }

    /**
     * Prints the run's SQL failures with the FIRST one called out, so the cause is not left
     * buried among the consequences it produced. No-op when the run had none.
     */
    public static ReportSummary(): void {
        const failures = SQLExecutionDiagnostics._failures;
        if (failures.length === 0) {
            return;
        }
        logError(
            `SQL execution failed for ${failures.length} batch(es) in this run. FIRST FAILURE (most likely the cause):\n` +
            `  ${SQLExecutionDiagnostics.Describe(failures[0])}`,
        );
        if (failures.length > 1) {
            logStatus(
                `  ${failures.length - 1} further SQL failure(s) in this run:\n` +
                failures.slice(1).map((f) => `  - ${SQLExecutionDiagnostics.Describe(f)}`).join('\n'),
            );
        }
    }
}
