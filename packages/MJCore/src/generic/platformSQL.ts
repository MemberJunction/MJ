// `DatabasePlatform` is defined in @memberjunction/global so a single type
// definition is shared by core, sql-dialect, codegen-lib, and every other
// package that needs to branch on platform. Re-exported here so existing
// `import { DatabasePlatform } from '@memberjunction/core'` callsites keep
// compiling. New code should import from @memberjunction/global directly.
export type { DatabasePlatform } from '@memberjunction/global';

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
