/**
 * cross-server-signatures.ts — failure classifiers for the cross-server invalidation rig.
 *
 * Kept apart from `cross-server-invalidation-tests.ts` because that script runs `main()` on load,
 * so a unit test cannot import it. This module has no side effects; its test is
 * `src/__tests__/cross-server-signatures.test.ts`.
 */

/**
 * The signature of a BaseEngine cached array that has been overwritten with plain JSON.
 *
 * Deserialized rows carry the DATA but not the PROTOTYPE, so field reads keep working while any
 * METHOD call throws `... is not a function`. `MJQueryEntityExtended.UserCanRun` is the one every
 * RunQuery goes through (`GenericDatabaseProvider.ValidateQueryForExecution`), which is why the
 * production symptom was `TypeError: query.UserCanRun is not a function` on every dashboard tile.
 *
 * The pattern matches V8's TypeError wording for calling a missing method; the unit test pins it
 * against a real V8 error, so a wording change in Node fails there rather than silently here.
 */
export function LooksLikePoisonedEngine(error: string): boolean {
    return /is not a function/i.test(error);
}
