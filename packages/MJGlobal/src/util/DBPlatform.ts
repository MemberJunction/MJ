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
 * Resolve the active database platform from the `DB_TYPE` environment
 * variable. Strict — only the canonical {@link DatabasePlatform} values are
 * recognized; any other input (including legacy aliases like `mssql` or
 * `pg`) returns `undefined`, and the caller is responsible for choosing a
 * default.
 */
export function resolveDbPlatformFromEnv(envVarName: string = 'DB_TYPE'): DatabasePlatform | undefined {
  const raw = process.env[envVarName]?.trim().toLowerCase();
  return raw === 'sqlserver' || raw === 'postgresql' ? raw : undefined;
}
