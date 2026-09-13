/**
 * The one sentence that says what a discovery's persist stage actually did.
 *
 * A discovery reports its outcome as object counts — "0 objects created, 0 updated" — which is
 * literally true and completely misleading for the commonest run there is. A connector whose objects
 * are PRESUPPOSED (declared in its own metadata) creates no objects on any run: everything it does
 * happens at FIELD level. A live 3-minute PheedLoop discovery that created 69 fields and updated 487
 * reported "0 objects created, 0 updated, 0 unresolved PKs", which every operator reads as "the run
 * did nothing" — and on that run it also silently rewrote 487 declared field definitions.
 *
 * The field counts were already computed, already carried on the same result object, and already
 * logged internally. They were simply not in the sentence. Kept pure and separate so every surface
 * that reports a persist outcome says the same thing, and so it can be pinned without a pipeline.
 */

/** The counts this sentence reads — structural, so a fixture satisfies it without a real persist. */
export type PersistCountsLike = {
    ObjectsCreated: number;
    ObjectsUpdated: number;
    FieldsCreated: number;
    FieldsUpdated: number;
};

/**
 * Renders the counts clause: objects AND fields, always both, in one order.
 *
 * `undefined` means the counts are not available (a pipeline that returned no persist result), which
 * is reported as exactly that rather than as a row of zeros — zeros are a finding, "no result" is not.
 */
export function DescribePersistCounts(counts: PersistCountsLike | undefined): string {
    if (!counts) return 'no persist result reported';
    return (
        `${counts.ObjectsCreated} objects created, ${counts.ObjectsUpdated} updated, ` +
        `${counts.FieldsCreated} fields created, ${counts.FieldsUpdated} updated`
    );
}
