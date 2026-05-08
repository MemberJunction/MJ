import type { DatabasePlatform } from '@memberjunction/sql-dialect';

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
 * Lives in `@memberjunction/generic-database-provider` (server-only) rather
 * than `@memberjunction/core` or `@memberjunction/global` because the
 * `process.*` API is Node-specific and those two packages are imported by
 * client-side code paths. This is the first server-only package in the dep
 * chain, so it's the right home for env-var parsing.
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
