/**
 * Configuration stored on RecordProcess.ChallengerConfiguration: a shadow challenger that scores a
 * sample of the record process's live invocations against the same frozen feature snapshot as the
 * champion. Challenger scores are written as `Role = 'Challenger'` feature values for comparison and
 * drift monitoring; they never change the business record and never delay or fail the champion.
 *
 * NULL when the record process has no challenger.
 */
export interface IRecordProcessChallengerConfig {
    /** Turns the challenger on or off without deleting its settings. */
    Enabled: boolean;

    /** Fraction of live invocations (0.0 to 1.0) mirrored to the challenger. */
    SampleRate: number;

    /** The kind of challenger: 'ML Model' scores with ChallengerModelID; 'Infer' runs ChallengerPromptID. */
    WorkType: 'ML Model' | 'Infer';

    /** The MJ: ML Models record the challenger scores with, for WorkType 'ML Model'. */
    ChallengerModelID?: string;

    /** The MJ: AI Prompts record the challenger runs, for WorkType 'Infer'. */
    ChallengerPromptID?: string;

    /** Time budget for one challenger score, in milliseconds. A score that takes longer is recorded as timed out. */
    MaxLatencyMs: number;
}
