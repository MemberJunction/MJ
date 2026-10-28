import type { SQLDialect } from '@memberjunction/sql-dialect';
import { FindForbiddenFunctionCalls, IsReadOnlyQuery, LexSQL, SignificantTokens } from '@memberjunction/sql-parser';

/**
 * The safety stage every rendered statement passes before it can run, on every path (saved
 * queries, composed queries, ad hoc SQL, TestQuerySQL, specs, data contexts).
 *
 * It works from tokens, never from a complete parse, so a read query the structural parser cannot
 * fully read (T-SQL `JOIN … JOIN … ON … ON`, `(NOLOCK)`) still runs, and no parse failure can let a
 * write through:
 * - one statement (no stacked statements), starting with `SELECT` or `WITH`;
 * - every CTE a read, and the statement after the WITH clause a `SELECT`;
 * - no top-level `SELECT … INTO` (it creates a table);
 * - no call to a function the dialect lists in `CallerSQLForbiddenFunctions` (`OPENROWSET`,
 *   `pg_read_file`, `dblink`, …): they read what a check of the referenced tables cannot see.
 *
 * node-sql-parser plays no part. SQL with no statement at all (empty, only comments or semicolons)
 * runs nothing and passes, unless the caller asks for a statement (`refuseEmpty`, for SQL a caller
 * supplied).
 */
export class SafetyGate {
    /**
     * @param refuseEmpty - Whether SQL with no statement is refused too.
     * @throws Error saying why `sql` may not run.
     */
    static AssertSafeToExecute(sql: string, dialect: SQLDialect, refuseEmpty: boolean): void {
        if (!refuseEmpty && SafetyGate.IsEmpty(sql, dialect)) return;
        const check = IsReadOnlyQuery(sql, dialect);
        if (!check.IsReadOnly) {
            throw new Error(`RenderPipeline: only a single read query may be run here, and this SQL is not one: ${check.Reason}.`);
        }
        const forbidden = FindForbiddenFunctionCalls(sql, dialect);
        if (forbidden.length > 0) {
            throw new Error(
                `RenderPipeline: a query may not call ${forbidden.join(', ')}. These functions run SQL ` +
                'given as a string, or read files or other databases, so what they read cannot be checked.',
            );
        }
    }

    /** Whether `sql` holds no statement: nothing but whitespace, comments and semicolons. */
    static IsEmpty(sql: string, dialect: SQLDialect): boolean {
        return SignificantTokens(LexSQL(sql, dialect)).every(t => t.Kind === 'semicolon');
    }
}
