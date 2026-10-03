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

import { DatabasePlatform, GetDialect, IsSupportedPlatform } from '@memberjunction/sql-dialect';

/**
 * The platform key used when no provider can tell us what the tenant actually
 * runs. SQL Server is MemberJunction's historical default, so keeping it here
 * preserves behaviour for every caller that used to hardcode `'sqlserver'`.
 */
export const DEFAULT_DATABASE_PLATFORM: DatabasePlatform = 'sqlserver';

/**
 * Structural shape of anything that knows which database platform it talks to.
 *
 * `ProviderBase` (and therefore every concrete MJ data provider) already
 * exposes `PlatformKey`, but `IMetadataProvider` does not declare it — so
 * callers holding only an interface-typed provider had no typed way to ask.
 * This is that way.
 */
export interface IPlatformAwareProvider {
    readonly PlatformKey?: DatabasePlatform | string | null;
}

/**
 * THE seam through which runtime code picks a SQL dialect.
 *
 * Any code that generates, formats, or re-executes SQL must derive its dialect
 * from the provider that will actually run the SQL — never from a literal.
 * A hardcoded `'sqlserver'` is invisible on a SQL Server tenant and silently
 * wrong on every other one.
 *
 * @param provider anything that may expose `PlatformKey` (a data provider, a
 *        metadata provider, `BaseEntity.Provider`, `undefined`, …)
 * @param fallback the platform to assume when the provider is absent or does
 *        not name a platform this build supports. Defaults to
 *        {@link DEFAULT_DATABASE_PLATFORM}.
 */
export function ResolvePlatformKey(
    provider: unknown,
    fallback: DatabasePlatform = DEFAULT_DATABASE_PLATFORM,
): DatabasePlatform {
    const key = (provider as IPlatformAwareProvider | null | undefined)?.PlatformKey;
    // `IsSupportedPlatform` is backed by the dialect registry, so an unknown or
    // not-yet-implemented platform degrades to the fallback instead of throwing
    // deep inside SQL generation.
    return IsSupportedPlatform(key) ? key : fallback;
}

/**
 * Renders the dialect briefing an LLM needs in order to write SQL that will
 * actually run on `platform`.
 *
 * The text is composed by {@link SQLDialect.PromptGuidance} from the dialect's
 * own primitives, so a newly implemented dialect produces correct guidance with
 * no prompt or template edit anywhere.
 */
export function DescribeSQLDialectForPrompt(platform: DatabasePlatform): string {
    return GetDialect(platform).PromptGuidance;
}

/**
 * Human-readable name of a platform, e.g. for prompts and UI labels.
 */
export function DescribeSQLDialectName(platform: DatabasePlatform): string {
    return GetDialect(platform).DisplayName;
}

/**
 * The `sql-formatter` language key for a platform (`'tsql'`, `'postgresql'`, …).
 *
 * Lives here so callers that pretty-print SQL do not need a direct dependency
 * on `@memberjunction/sql-dialect` just to avoid hardcoding a language. The
 * value is declared by the dialect itself, so it follows the platform.
 */
export function ResolveSQLFormatterLanguage(platform: DatabasePlatform): string {
    return GetDialect(platform).FormatterLanguage;
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
