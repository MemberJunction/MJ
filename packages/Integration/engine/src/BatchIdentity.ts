/**
 * Within-batch identity: no two records in one batch may share an ExternalID.
 *
 * ExternalID *is* the identity the record map keys on, so two records carrying the same one are two
 * observations of a single source record, never two rows. The write path cannot discover this on its
 * own: it decides insert-vs-update by asking whether the identity already exists in the DATABASE,
 * and for a first-time record neither copy does — so both insert, and the pair re-inserts on every
 * subsequent sync. Nothing downstream can repair it either, because both rows then map to the same
 * ExternalID and no later run can tell which to keep.
 *
 * Measured on a live tenant (2026-08-19): one object held 54,119 rows for 42,519 distinct keys —
 * 11,632 excess. All 11,200 duplicate groups were byte-identical on every captured column AND
 * written inside the same second, i.e. the source itself listed the same element twice within one
 * batch. The whole-batch fingerprint guard nearby catches a batch REPEATED in full (the
 * infinite-loop case); it cannot see duplicates inside a single batch.
 *
 * Last-wins matches upsert semantics: when two entries share an identity but differ, the later
 * entry is the more recent observation of that record's state, which is exactly what a single
 * upsert would have left behind had they arrived in separate batches.
 */

/** Minimal shape needed to de-duplicate: anything carrying an ExternalID. */
export interface HasExternalID {
    ExternalID: string;
}

/** Outcome of a within-batch identity pass. */
export interface BatchIdentityResult<T> {
    /** The batch with duplicate identities collapsed, original order preserved. */
    Records: T[];
    /** How many records were dropped as repeats of an identity already in this batch. */
    Collapsed: number;
    /**
     * Identities that appeared more than once, capped for reporting. Sample only — a batch with
     * thousands of repeats must not put thousands of ids into a run event.
     */
    SampleIDs: string[];
}

/** How many repeated identities to name in the warning. */
const SAMPLE_LIMIT = 5;

/**
 * Collapses records sharing an ExternalID within one batch, keeping the LAST occurrence in its
 * original position. Returns the input array unchanged (same reference) when every identity is
 * already unique, so the ordinary path allocates nothing.
 *
 * A record with an empty or missing ExternalID is passed through untouched: identity-less records
 * are a separate defect with a separate guard, and silently collapsing them here would merge
 * unrelated rows.
 */
export function CollapseDuplicateIdentities<T extends HasExternalID>(records: ReadonlyArray<T>): BatchIdentityResult<T> {
    if (records.length < 2) {
        return { Records: records as T[], Collapsed: 0, SampleIDs: [] };
    }

    // First pass: find which identities repeat, without allocating a copy of the batch.
    const counts = new Map<string, number>();
    let duplicates = 0;
    for (const r of records) {
        const id = r?.ExternalID;
        if (!id) continue;
        const seen = counts.get(id);
        if (seen === undefined) {
            counts.set(id, 1);
        } else {
            counts.set(id, seen + 1);
            duplicates++;
        }
    }
    if (duplicates === 0) {
        return { Records: records as T[], Collapsed: 0, SampleIDs: [] };
    }

    const sample: string[] = [];
    for (const [id, n] of counts) {
        if (n > 1 && sample.length < SAMPLE_LIMIT) sample.push(id);
        if (sample.length >= SAMPLE_LIMIT) break;
    }

    // Second pass: keep the LAST occurrence of each repeated identity, in its original slot.
    const lastIndexByID = new Map<string, number>();
    for (let i = 0; i < records.length; i++) {
        const id = records[i]?.ExternalID;
        if (id) lastIndexByID.set(id, i);
    }
    const out: T[] = [];
    for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const id = r?.ExternalID;
        if (!id || lastIndexByID.get(id) === i) out.push(r);
    }

    return { Records: out, Collapsed: records.length - out.length, SampleIDs: sample };
}
