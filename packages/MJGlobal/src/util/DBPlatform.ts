/**
 * Single source of truth for the database-platform vocabulary used across the
 * MJ stack — MJCLI, MJServer, CodeGenLib, MetadataSync, and the SQL converter
 * / dialect packages. There is exactly one canonical name and one canonical
 * value set; do NOT introduce parallel vocabularies (e.g. `'mssql'`).
 */

/**
 * Canonical database platform value. Use this type wherever you would have
 * written `'mssql' | 'postgresql'` or `string`. The two accepted strings are
 * the *only* values permitted; aliases (`mssql`, `postgres`, `pg`) are not
 * recognized — config validation, env-var parsing, and runtime branching all
 * compare against these literals.
 */
export type DatabasePlatform = 'sqlserver' | 'postgresql';

/**
 * Resolve the active database platform from an environment variable.
 *
 * Strict — only the canonical {@link DatabasePlatform} values are recognized
 * (case-insensitive). An unset, empty, or whitespace-only variable returns
 * `undefined`, letting the caller pick a default. Any other non-empty value
 * (typos, legacy aliases like `mssql`/`postgres`/`pg`, unsupported dialects)
 * throws — silent fallback is the bug we don't want, because it routes the
 * wrong provider at the wrong dialect against a real database.
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
