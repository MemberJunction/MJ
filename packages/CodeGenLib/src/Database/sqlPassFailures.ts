/**
 * One failure recorded by the SQL generation/execution pass
 * (`SQLCodeGenBase.ManageSQLScriptsAndExecution`).
 *
 * The post-pass CRUD self-heal re-runs only the entities whose routines are missing, so it can
 * repair only failures that belong to one of those entities. A failure with no entity (a custom
 * SQL script, the bulk file execution, field sync, permissions) is outside its reach.
 */
export interface SQLPassFailure {
    /** The step that failed, e.g. `Generating SQL`, `before-sql scripts`, `Applying permissions`. */
    Step: string;
    /** The entity the failure belongs to, or null when the step failed as a whole. */
    EntityName: string | null;
    /** What failed, for the run's failure list. */
    Message: string;
}

/**
 * Returns the SQL-pass failures the CRUD self-heal did not repair: every failure with no entity,
 * and every entity failure whose entity the self-heal did not re-run successfully. An empty
 * result means the SQL-pass failure can be cleared.
 *
 * @param failures what the SQL pass recorded
 * @param healedEntityNames entities the self-heal re-ran with every phase succeeding
 */
export function UnhealedSQLPassFailures(
    failures: ReadonlyArray<SQLPassFailure>,
    healedEntityNames: Iterable<string>,
): SQLPassFailure[] {
    const healed = new Set<string>();
    for (const name of healedEntityNames) healed.add(name.trim().toLowerCase());
    return failures.filter((f) => f.EntityName === null || !healed.has(f.EntityName.trim().toLowerCase()));
}
