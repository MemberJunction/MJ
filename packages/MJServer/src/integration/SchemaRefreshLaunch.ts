/**
 * @fileoverview Pure reporting helpers for the connector schema-refresh pipeline launch.
 *
 * The refresh is a live vendor introspect and can run for minutes on a large catalog, so
 * IntegrationCreateConnection / IntegrationUpdateConnection can launch it *detached* and hand the
 * caller a tailable run ID instead of blocking. That split creates one easy-to-get-wrong reporting
 * case: a detached summary's counts are placeholder zeros, and describing them as results ("0
 * created, 0 updated") reads to an operator as "the refresh found nothing" — the opposite of "the
 * refresh has not finished yet". This module owns that decision so it can be pinned by a test
 * without standing up a resolver.
 */

/**
 * The subset of the pipeline summary that message construction reads. Structural so both the
 * GraphQL `@ObjectType` and a test fixture satisfy it without either depending on the other.
 */
export interface SchemaRefreshSummaryLike {
    /** Tailable run ID — the only meaningful field while `InProgress` is true. */
    RunID: string;
    /** True ⇒ launched detached and still running; every count below is a placeholder zero. */
    InProgress: boolean;
    ObjectsCreated: number;
    ObjectsUpdated: number;
    UnresolvedObjects: string[];
}

/**
 * Builds the human-facing `Message` for IntegrationCreateConnection.
 *
 * @param testConnection whether the caller asked for (and got) a live connection test
 * @param summary the refresh summary, or undefined when no refresh was requested
 */
export function BuildCreateConnectionMessage(
    testConnection: boolean,
    summary: SchemaRefreshSummaryLike | undefined
): string {
    if (!summary) return 'Connection created and test passed';
    const created = `Connection created${testConnection ? ', test passed' : ''}`;
    // Never report a detached run's placeholder counts as findings — point at the run stream instead.
    if (summary.InProgress) return `${created}, schema refresh running — tail run ${summary.RunID}`;
    return `${created}, schema refresh: ${summary.ObjectsCreated} created, ` +
        `${summary.ObjectsUpdated} updated, ${summary.UnresolvedObjects.length} PK-unresolved`;
}

/**
 * Builds the human-facing `Message` for IntegrationUpdateConnection's detached-refresh path.
 * Separate from {@link BuildCreateConnectionMessage} because update has no connection-test clause.
 */
export function BuildDetachedRefreshMessage(runID: string): string {
    return `Updated, schema refresh running — tail run ${runID}`;
}
