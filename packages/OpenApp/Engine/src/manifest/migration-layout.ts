/**
 * Limits on the SQL folders an Open App ships (migrations, teardown scripts).
 */

/**
 * The deepest a `.sql` file may sit below its declared directory, in folders. Bounded so a
 * pathological or adversarial tree cannot walk forever. Generous vs any real repo.
 */
export const MAX_MIGRATION_DIRECTORY_DEPTH = 6;
