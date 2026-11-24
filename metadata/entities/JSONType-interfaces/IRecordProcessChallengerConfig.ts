/**
 * Configuration stored on RecordProcess.ChallengerConfiguration: a shadow challenger that scores a
 * sample of the record process's records against the same feature snapshot as the champion. It never
 * changes the business record and never fails the champion.
 *
 * - 'ML Model': read only for a process a scoring binding names. The binding run scores the sampled records
 *   with ChallengerModelID and writes them as Source = 'Model', Role = 'Challenger' feature values under the
 *   challenger's own scoring run, in the champion batch's transaction. An unbound process mirrors nothing.
 * - 'Infer': the prompt challenger of an Infer process, run in the background on a sample of invocations.
 *
 * NULL when the record process has no challenger. A stored 'ML Model' configuration that carries MaxLatencyMs
 * (or MaxInFlight, which this interface does not name) is read without error; an 'ML Model' challenger ignores both.
 */
export interface IRecordProcessChallengerConfig {
    /** Turns the challenger on or off without deleting its settings. */
    Enabled: boolean;

    /**
     * Fraction of records (0.0 to 1.0) mirrored to the challenger; 1 or more mirrors every record. An 'ML Model'
     * challenger draws each record deterministically from the binding, the record and the as-of date.
     */
    SampleRate: number;

    /** The kind of challenger: 'ML Model' scores with ChallengerModelID; 'Infer' runs ChallengerPromptID. */
    WorkType: 'ML Model' | 'Infer';

    /** The MJ: ML Models record the challenger scores with, for WorkType 'ML Model'. */
    ChallengerModelID?: string;

    /** The MJ: AI Prompts record the challenger runs, for WorkType 'Infer'. */
    ChallengerPromptID?: string;

    /**
     * Time budget for one 'Infer' challenger prompt run, in milliseconds; a run that takes longer is recorded as timed
     * out. An 'ML Model' challenger scores inside the champion's batch and has no time budget: it does not read this.
     */
    MaxLatencyMs?: number;
}
