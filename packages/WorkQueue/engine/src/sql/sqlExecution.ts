import type { UserInfo } from '@memberjunction/core';
import type { SqlBuilderContext, SqlStatement, WorkQueueSqlExecutor } from './WorkQueueSqlExecutor';

interface AffectedRowsRow {
    AffectedRows: number | string | null;
}

export function QualifiedTable(context: SqlBuilderContext, table: string): string {
    return `${context.QuoteIdentifier(context.MJCoreSchemaName)}.${context.QuoteIdentifier(table)}`;
}

/**
 * Runs a guarded-write procedure call and returns the affected-row count it reports. Every work-queue write is a
 * stored procedure whose single result set carries `AffectedRows` (`SELECT @@ROWCOUNT AS [AffectedRows]`, plan 12 /
 * CD9); the count is the fence's arbitration signal, so a missing result set reads as zero rows changed.
 */
export async function ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number> {
    const rows = await executor.ExecuteSQL<AffectedRowsRow>(statement.SQL, statement.Params, { isMutation: true }, contextUser);
    return ToNumber(rows?.[0]?.AffectedRows) ?? 0;
}

/** Runs a statement that ends in exactly one result set and returns its rows. */
export async function ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]> {
    const rows = await executor.ExecuteSQL<T>(statement.SQL, statement.Params, { isMutation: true }, contextUser);
    return rows ?? [];
}

const UNIQUE_VIOLATION_CODES = new Set(['2601', '2627', '23505']);
const TRANSIENT_CODES = new Set(['1205', '1222', '40P01', '40001', '55P03']);

/**
 * True when a database error is a unique violation **of the named index or constraint**. Both halves are required:
 * the platform code (SQL Server 2601/2627, PostgreSQL SQLSTATE 23505) says it is a unique violation, and the name says
 * which one — an unrelated error whose text merely mentions the index never matches. Names compare case-insensitively
 * because PostgreSQL folds unquoted identifiers.
 */
export function IsUniqueViolation(error: unknown, indexName: string): boolean {
    const codes = ErrorCodes(error);
    const text = ErrorText(error).toLowerCase();
    const isUnique = codes.some(code => UNIQUE_VIOLATION_CODES.has(code))
        || text.includes('duplicate key') || text.includes('unique constraint');
    return isUnique && text.includes(indexName.toLowerCase());
}

/** Deadlocks, serialization failures and lock timeouts: safe to retry the whole operation. */
export function IsTransientDatabaseError(error: unknown): boolean {
    if (ErrorCodes(error).some(code => TRANSIENT_CODES.has(code.toUpperCase()))) {
        return true;
    }
    const text = ErrorText(error).toLowerCase();
    return text.includes('deadlock')
        || text.includes('could not serialize')
        || text.includes('lock request time out')
        || text.includes('lock timeout');
}

/** Driver error codes (`number` on mssql, `code` on pg), following `cause`/`originalError` one level down. */
export function ErrorCodes(error: unknown): string[] {
    const codes: string[] = [];
    const visit = (value: unknown): void => {
        if (typeof value !== 'object' || value === null) {
            return;
        }
        if ('number' in value && (typeof value.number === 'number' || typeof value.number === 'string')) {
            codes.push(String(value.number));
        }
        if ('code' in value && (typeof value.code === 'number' || typeof value.code === 'string')) {
            codes.push(String(value.code));
        }
    };
    visit(error);
    if (typeof error === 'object' && error !== null) {
        visit('cause' in error ? error.cause : null);
        visit('originalError' in error ? error.originalError : null);
    }
    return codes;
}

/** Message text, including a PostgreSQL error's `constraint` name when the driver supplies one. */
export function ErrorText(error: unknown): string {
    if (error instanceof Error) {
        const constraint = 'constraint' in error && typeof error.constraint === 'string' ? ` [${error.constraint}]` : '';
        return `${error.message}${constraint}`;
    }
    return typeof error === 'string' ? error : JSON.stringify(error);
}

/** BIGINT columns arrive as strings from the SQL Server driver; normalise to numbers. */
export function ToNumber(value: number | string | bigint | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** BIT columns arrive as booleans or 0/1 depending on the driver. */
export function ToBoolean(value: boolean | number | string | null | undefined): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
}

export function ToIsoString(value: Date | string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
