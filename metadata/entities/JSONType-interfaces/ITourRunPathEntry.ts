/**
 * Entry in the ordered step-traversal array stored on `MJ: Tour Runs.PathTaken`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** TourRun.PathTaken element (`JSONTypeIsArray: true`) — one visited step in a tour run. */
export interface ITourRunPathEntry {
    /** `StepKey` of the step visited. */
    StepKey: string;
    /** ISO-8601 timestamp when the user entered the step. */
    EnteredAt: string;
    /** ISO-8601 timestamp when the user exited the step. */
    ExitedAt?: string;
    /** Step completion outcome recorded on exit. */
    Outcome?: 'Completed' | 'Skipped' | 'Already Known' | 'Done By Agent' | 'Anchor Missing' | 'Dismissed';
    /** Selected choice key when the step was a `Choice` step. */
    ChoiceKey?: string;
}
