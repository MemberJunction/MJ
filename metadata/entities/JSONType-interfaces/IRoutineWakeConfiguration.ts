/**
 * Configuration for autonomous wake conditions and durable entity change watching
 * on `MJ: User Routines` (`UserRoutine.WakeConfiguration`).
 *
 * Evaluated by `WakeGateEvaluator` inside `UserRoutineDispatcherDriver` before invoking
 * the routine's target (Agent, Action, or Prompt) so routines only spend LLM tokens
 * when meaningful state changes or scheduled wake deadlines occur.
 */
export interface IRoutineWakeConfiguration {
    /**
     * Logical workstream or monitor key used by self-scheduling agents (e.g. `"q4-okr-rollup"`,
     * `"chief-of-staff-main"`) to upsert a specific `AgentWake` routine row per workstream.
     */
    workstreamKey?: string;

    /**
     * Human-readable reason the agent scheduled this wake (injected into the wake prompt).
     */
    wakeReason?: string;

    /**
     * Arbitrary JSON state saved by the agent when going to sleep and restored into the
     * conversation/payload when the routine wakes.
     */
    resumeState?: Record<string, unknown>;

    /**
     * Entities watched for durable change detection since `UserRoutine.LastCheckedAt`.
     * Checked via `GetRunViewsDatabaseStatus` (`COUNT(*)` + `MAX(__mj_UpdatedAt)`) and/or
     * `MJ: Record Changes` under the routine owner's `contextUser` security scope.
     */
    watchedEntities?: Array<{
        /** Exact MJ Entity Name (e.g. `"MJ_BizApps_Tasks: Tasks"`, `"MJ_BizApps_Issues: Issues"`). */
        entityName: string;
        /** Optional SQL `ExtraFilter` (validated via `SQLExpressionValidator`) scoping watched rows. */
        extraFilter?: string;
        /** Optional alias used as the key inside `deltas.<alias>` for Tier 1 expressions. */
        alias?: string;
        /** When true, also inspects `MJ: Record Changes` for field-level diffs since `LastCheckedAt`. */
        includeRecordChanges?: boolean;
    }>;

    /**
     * 3-Tier Wake Condition Gate evaluated in order of increasing cost:
     * - Tier 0: Durable watermark / hash comparison (0 tokens)
     * - Tier 1: Deterministic `SafeExpressionEvaluator` boolean expression (0 tokens)
     * - Tier 2: Fast classifier / decision model via `AIDecisionRunner` (~100 tokens)
     * - Tier 3: Full metadata `MJ: AI Prompts` evaluation via `AIPromptRunner`
     */
    wakeGate?: {
        /**
         * When true, skips target execution if watched entities and signals have not changed
         * since `LastCheckedAt` AND any `forceWakeAfterMinutes` deadline has not elapsed.
         */
        skipIfUnchanged?: boolean;

        /**
         * Optional maximum minutes of silence before forcing a wake even if watched entities
         * are unchanged (e.g. `480` for an 8-hour heartbeat).
         */
        forceWakeAfterMinutes?: number;

        /**
         * Tier 1: Deterministic boolean expression evaluated by `SafeExpressionEvaluator`
         * against `{ deltas, totalChangedCount, elapsedMinutes, isScheduledWakeTimeReached, payload }`.
         * When it evaluates to `false`, the wake is skipped with zero LLM cost.
         */
        tier1Expression?: string;

        /**
         * Tier 2: Fast Decision Model question evaluated via `AIDecisionRunner` (`Default Decision` /
         * `Jev` / `Kev`) when Tier 1 passes (or when Tier 1 is omitted).
         */
        tier2Decision?: {
            /** Question posed to the decision model along with the delta summary. */
            question: string;
            /** Decision type (`'Likelihood'` 0-100 or `'Choice'`). Defaults to `'Likelihood'`. */
            type?: 'Likelihood' | 'Choice';
            /** Minimum likelihood score (0-100) required to wake the agent when `type === 'Likelihood'`. */
            wakeIfAtLeast?: number;
            /** Choice options when `type === 'Choice'`. */
            options?: Array<{ key: string; description: string }>;
            /** Option keys that trigger a wake when `type === 'Choice'`. */
            wakeOnChoices?: string[];
            /** Optional extra context instructions for the decision classifier. */
            additionalInstructions?: string;
        };

        /**
         * Tier 3: Optional `MJ: AI Prompts` ID executed via `AIPromptRunner` as the final gate
         * when deeper synthesis is required before waking the full agent.
         */
        tier3WakePromptId?: string;
    };
}
