// `DatabasePlatform` is owned by `@memberjunction/sql-dialect`. Re-exported
// here so callsites that already pull other things from `@memberjunction/core`
// get the matching type from one place.
//
// The companion `resolveDbPlatformFromEnv` helper that used to live alongside
// this re-export was moved out — it touches `process.env`, which is a Node
// API, and core is imported by client-side packages. The helper now lives in
// `@memberjunction/generic-database-provider` (the first server-only package
// in the dep chain).
export type { DatabasePlatform } from '@memberjunction/sql-dialect';

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
