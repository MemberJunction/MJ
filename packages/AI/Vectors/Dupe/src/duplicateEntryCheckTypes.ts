/**
 * @fileoverview Result types for the entry-time duplicate check,
 * {@link DuplicateRecordDetector.CheckRecordValues}.
 *
 * The check runs while a person enters a new record. It only flags: it never blocks a save and
 * never merges.
 *
 * @module @memberjunction/ai-vector-dupe
 */

/**
 * How an entry-time duplicate check ended.
 * - `Checked`: the check ran. `Candidates` holds the flagged records, and may be empty.
 * - `NotConfigured`: the entity has no Active entity document whose `ReasoningMode` is
 *   `'Decision'` or `'DecisionThenPrompt'`, so the check is off for it. Nothing else ran.
 * - `Failed`: the check could not finish. `ErrorMessage` says why, and nothing is flagged.
 */
export type DuplicateEntryCheckStatus = 'Checked' | 'NotConfigured' | 'Failed';

/** An existing record the check flags as a possible duplicate of the values being entered. */
export interface DuplicateEntryCandidate {
    /**
     * The candidate's primary key as a compact URL segment (`CompositeKey.ToCompactURLSegment`): the
     * bare value for a single-column key, `F1|v1||F2|v2` for a composite one.
     * `CompositeKey.FromURLSegment` reads it back.
     */
    RecordID: string;
    /** The candidate's name-field values, or its key when the person may not read a name. */
    DisplayName: string;
    /** The vector similarity score that surfaced the candidate. */
    VectorScore: number;
    /**
     * The decision's probability that the candidate is the same real-world entity as the values being
     * entered, or null when the decision gave no answer for it (such a candidate is flagged).
     */
    Probability: number | null;
}

/** The outcome of one entry-time duplicate check. */
export interface DuplicateEntryCheckResult {
    /** How the check ended. */
    Status: DuplicateEntryCheckStatus;
    /** Why the check failed, when `Status` is `'Failed'`. */
    ErrorMessage?: string;
    /** The flagged candidates, most probable first. Empty unless `Status` is `'Checked'`. */
    Candidates: DuplicateEntryCandidate[];
    /** How long the check took on the server, in milliseconds. */
    ElapsedMs: number;
}
