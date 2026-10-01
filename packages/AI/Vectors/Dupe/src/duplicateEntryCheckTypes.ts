/**
 * @fileoverview Options, limits and result types for the entry-time duplicate check,
 * {@link DuplicateRecordDetector.CheckRecordValues}.
 *
 * The check runs while a person enters a new record. It only flags: it never blocks a save and
 * never merges.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import type { DuplicateDetectionOptions } from '@memberjunction/core';

/**
 * The most time one entry-time check may take on the server, in milliseconds. The form stops
 * waiting at its own budget (`DUPLICATE_ENTRY_CHECK_BUDGET_MS` in `@memberjunction/ng-base-forms`,
 * 1500 ms); this is that budget plus a margin for the round trip, so the server stops working on a
 * check soon after the form has given up on it. A check that runs out is `Failed`, and flags
 * nothing.
 */
export const DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS = 2000;

/**
 * The most characters of one field's text the check uses. Longer entered text is cut before the
 * template renders it (so before it is embedded), and every field value in the decision state is
 * cut to it, the candidates' stored values included.
 */
export const DUPLICATE_ENTRY_CHECK_MAX_FIELD_TEXT_LENGTH = 500;

/**
 * The most differing fields the decision state carries. The fields the person entered come first;
 * the rest are dropped.
 */
export const DUPLICATE_ENTRY_CHECK_MAX_DECISION_FIELDS = 40;

/** Options for {@link DuplicateRecordDetector.CheckRecordValues}. */
export interface DuplicateEntryCheckOptions extends DuplicateDetectionOptions {
    /**
     * The check's time budget, in milliseconds. Defaults to
     * {@link DUPLICATE_ENTRY_CHECK_SERVER_BUDGET_MS}. It bounds every step: the template, the
     * embedding, the vector query, both RunViews and the decision call.
     */
    TimeoutMS?: number;
    /** Stops the check when aborted. A stopped check is `Failed` and flags nothing. */
    CancellationToken?: AbortSignal;
}

/**
 * How an entry-time duplicate check ended.
 * - `Checked`: the check ran. `Candidates` holds the flagged records, and may be empty.
 * - `NotConfigured`: the entity has no Active entity document with `EnableLLMReasoning` on whose
 *   `ReasoningMode` is `'Decision'` or `'DecisionThenPrompt'`, so the check is off for it. Nothing
 *   else ran.
 * - `Failed`: the check could not finish, or ran out of its budget. `ErrorMessage` says why, and
 *   nothing is flagged.
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
