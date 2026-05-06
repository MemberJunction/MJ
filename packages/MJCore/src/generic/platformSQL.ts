// `DatabasePlatform` is owned by `@memberjunction/sql-dialect` (the package
// that defines SQL-dialect semantics). Re-exported from `@memberjunction/core`
// so callers that import platform-aware utilities from core (like the
// `resolveDbPlatformFromEnv` helper below) get the matching type from one
// place. SQL-dialect is core's dep, so the import is acyclic.
import type { DatabasePlatform } from '@memberjunction/sql-dialect';
export type { DatabasePlatform } from '@memberjunction/sql-dialect';

/**
 * Resolve the active database platform from an environment variable.
 *
 * Strict — only the canonical {@link DatabasePlatform} values (`'sqlserver'`,
 * `'postgresql'`, case-insensitive) are recognized. An unset, empty, or
 * whitespace-only variable returns `undefined`, letting the caller pick a
 * default. Any other non-empty value (typos, legacy aliases like `mssql` /
 * `postgres` / `pg`, unsupported dialects) throws — silent fallback is the
 * bug we don't want, because it routes the wrong provider at the wrong
 * dialect against a real database.
 *
 * Lives in `@memberjunction/core` (not `global`) because the database-platform
 * concept is part of MJ's database abstraction surface, which is core's
 * domain. Global is intentionally DB-agnostic.
 *
 * @param envVarName Name of the env var to read. Defaults to `DB_PLATFORM`.
 *   The legacy `DB_TYPE` name is no longer consulted; rename your `.env`.
 * @throws Error when the variable is set to an unrecognized non-empty value.
 */
export function resolveDbPlatformFromEnv(envVarName: string = 'DB_PLATFORM'): DatabasePlatform | undefined {
    const raw = process.env[envVarName];
    if (raw === undefined) return undefined;
    const normalized = raw.trim().toLowerCase();
    if (normalized === '') return undefined;
    if (normalized === 'sqlserver' || normalized === 'postgresql') {
        return normalized;
    }
    throw new Error(
        `Invalid ${envVarName} value '${raw}'. Must be 'sqlserver' or 'postgresql' (case-insensitive). ` +
            `Legacy aliases ('mssql', 'postgres', 'pg') and the legacy env var DB_TYPE are no longer supported.`,
    );
}

/**
 * Represents a SQL fragment that may have platform-specific variants.
 * Used for ExtraFilter, OrderBy, WhereClause, and other user-provided SQL.
 *
 * Backward compatible: where a string was accepted before,
 * PlatformSQL is also accepted via union type (string | PlatformSQL).
 */
export interface PlatformSQL {
    /** The default/fallback SQL. Used if no platform-specific variant exists. */
    default: string;
    /** SQL Server specific variant */
    sqlserver?: string;
    /** PostgreSQL specific variant */
    postgresql?: string;
}

/**
 * Type guard to check if a value is a PlatformSQL object vs plain string.
 */
export function IsPlatformSQL(value: string | PlatformSQL | undefined | null): value is PlatformSQL {
    return typeof value === 'object' && value !== null && 'default' in value;
}
