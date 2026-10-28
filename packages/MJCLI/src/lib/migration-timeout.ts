/**
 * Default per-request timeout for `mj migrate` (30 minutes). Skyway's own default
 * is 5 minutes, which at least one baseline batch exceeds (#3168). Override with
 * `MJ_MIGRATION_REQUEST_TIMEOUT` (milliseconds) or `dbRequestTimeout` in mj.config.cjs.
 */
export const DEFAULT_MIGRATION_REQUEST_TIMEOUT_MS = 1_800_000;

/** Messages the SQL Server driver produces when a request runs past its timeout. */
const TIMEOUT_PATTERN = /Request failed to complete in \d+ms|Failed to cancel request in \d+ms|ETIMEOUT/i;

/**
 * Returns a hint naming `MJ_MIGRATION_REQUEST_TIMEOUT` when any of the given error
 * texts is a request timeout, otherwise `undefined`.
 *
 * @param texts - Error messages and log lines from the failed migration run.
 * @param currentTimeoutMs - The request timeout the run used.
 */
export function MigrationTimeoutHint(texts: ReadonlyArray<string | undefined>, currentTimeoutMs: number): string | undefined {
    if (!texts.some((t) => t !== undefined && TIMEOUT_PATTERN.test(t))) return undefined;
    return (
        `A migration request timed out (limit ${currentTimeoutMs}ms). ` +
        'Raise the limit with MJ_MIGRATION_REQUEST_TIMEOUT=<milliseconds> (or dbRequestTimeout in mj.config.cjs) and re-run. ' +
        'On SQL Server a timed-out batch can leave the database partly migrated; check the history table before retrying.'
    );
}
