/**
 * @fileoverview Nests a child `MJ: AI Agent Run Steps` row per controller/judge prompt the Computer Use
 * engine runs, UNDER a caller-supplied parent step (e.g. the realtime co-agent's "Browser goal: …" step).
 *
 * A single goal-driven Computer Use request fans out into many prompt runs (one controller call per
 * perceive-act step, plus judge calls). Rather than flattening those prompt runs directly under the
 * realtime agent run, the realtime layer creates ONE parent step for the goal and this tracker hangs a
 * child `Prompt` step under it for each prompt — exactly the parent/child (`ParentID`) shape `BaseAgent`
 * uses for loop sub-steps. The field population is delegated to the shared, single-source-of-truth
 * `initAgentRunStep` / `finalizeAgentRunStep` helpers in `@memberjunction/ai-core-plus` (the same ones
 * `BaseAgent` uses) — this class only owns step creation + its own `await Save()` persistence.
 *
 * @module @memberjunction/computer-use-engine
 */

import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { MJAIPromptEntityExtended, finalizeAgentRunStep, initAgentRunStep } from '@memberjunction/ai-core-plus';

/**
 * Creates and finalizes child `Prompt` steps under a parent agent-run step for the prompts a Computer Use
 * goal executes. Constructed only when the run is linked to a parent step (agent run id + parent step id);
 * absent that linkage the engine skips step tracking entirely.
 */
export class AgentRunStepTracker {
    /** Running step-number counter, seeded from the run's existing step count in {@link Init}. */
    private stepCounter = 0;

    /**
     * @param provider The metadata provider used to create step entities.
     * @param contextUser The acting user (steps are owned + audited by them).
     * @param agentRunID The parent `MJ: AI Agent Runs` id every child step belongs to.
     * @param parentStepID The parent step (the goal's step) every child step nests under via `ParentID`.
     */
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser: UserInfo | undefined,
        private readonly agentRunID: string,
        private readonly parentStepID: string,
    ) {}

    /**
     * Seeds the step-number counter from the run's current step count so child steps continue the run's
     * sequence (best-effort; a query failure just starts numbering from the goal's first prompt).
     */
    public async Init(): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView(
                {
                    EntityName: 'MJ: AI Agent Run Steps',
                    ExtraFilter: `AgentRunID='${this.agentRunID.replace(/'/g, "''")}'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                },
                this.contextUser,
            );
            this.stepCounter = result.Success ? (result.Results?.length ?? 0) : 0;
        } catch (err) {
            LogError(`AgentRunStepTracker.Init failed: ${err instanceof Error ? err.message : String(err)}`);
            this.stepCounter = 0;
        }
    }

    /**
     * Creates a `Running` child `Prompt` step for a prompt about to execute, linked to its definition via
     * `TargetID` and nested under the goal's parent step via `ParentID`. Returns the saved step (to finalize
     * later), or `null` when creation failed (step tracking is best-effort and never aborts the goal).
     *
     * @param promptEntity The prompt definition about to run.
     * @returns The saved step entity, or `null` on failure.
     */
    public async BeginPromptStep(promptEntity: MJAIPromptEntityExtended): Promise<MJAIAgentRunStepEntity | null> {
        try {
            const step = await this.provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', this.contextUser);
            step.NewRecord();
            initAgentRunStep(step, {
                AgentRunID: this.agentRunID,
                StepNumber: ++this.stepCounter,
                StepType: 'Prompt',
                StepName: `Prompt: ${promptEntity.Name ?? 'Computer Use'}`,
                TargetID: promptEntity.ID,
                ParentID: this.parentStepID,
            });
            if (await step.Save()) {
                return step;
            }
            LogError(`AgentRunStepTracker.BeginPromptStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        } catch (err) {
            LogError(`AgentRunStepTracker.BeginPromptStep threw: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * Finalizes a child step with its prompt-run id (`TargetLogID`) and outcome. A no-op when `step` is
     * `null` (creation had failed). Best-effort — a save failure is logged, never thrown.
     *
     * @param step The step returned by {@link BeginPromptStep} (or `null`).
     * @param promptRunID The produced `AIPromptRun` id, when known.
     * @param success Whether the prompt succeeded.
     * @param errorMessage Optional failure detail.
     */
    public async EndPromptStep(step: MJAIAgentRunStepEntity | null, promptRunID: string | undefined, success: boolean, errorMessage?: string): Promise<void> {
        if (!step) {
            return;
        }
        try {
            finalizeAgentRunStep(step, { success, errorMessage, targetLogID: promptRunID ?? null });
            if (!(await step.Save())) {
                LogError(`AgentRunStepTracker.EndPromptStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            LogError(`AgentRunStepTracker.EndPromptStep threw: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
