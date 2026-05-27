/**
 * @module base-form-builder-code-agent
 *
 * Abstract base class for **code-based** (non-LLM) Form Builder sub-agents
 * — currently just the Builder, but kept as a base so any future
 * code-driven sub-agent (e.g. a Migrator or Linter pass) can plug in
 * without duplicating boilerplate.
 *
 * Mirrors `BaseDatabaseDesignerCodeAgent` — same helpers, same shape,
 * same `stepCount: 1` contract.
 */

import { BaseAgent } from '@memberjunction/ai-agents';
import type { BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { Metadata } from '@memberjunction/core';
import type { MJAIAgentRunStepEntityExtended } from '@memberjunction/ai-core-plus';

export abstract class BaseFormBuilderCodeAgent extends BaseAgent {
    /**
     * Build a terminal **Success** result for a code-based agent step.
     * `stepCount: 1` — code agents bypass the LLM loop entirely.
     */
    protected buildCodeSuccess<P>(
        newPayload: P,
        reasoning: string,
    ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: {
                terminate: true,
                step: 'Success',
                reasoning,
                newPayload,
            },
            stepCount: 1,
        };
    }

    /**
     * Build a terminal **Failure** result. Always populates `reasoning`,
     * `message`, AND `errorMessage` from the same string so every consumer
     * sees a usable error without coalescing logic.
     */
    protected buildCodeFailure<P>(
        reasoning: string,
        newPayload?: P,
    ): { finalStep: BaseAgentNextStep<P>; stepCount: number } {
        return {
            finalStep: {
                terminate: true,
                step: 'Failed',
                reasoning,
                message: reasoning,
                errorMessage: reasoning,
                newPayload,
            },
            stepCount: 1,
        };
    }

    /**
     * Create an `MJ: AI Agent Run Steps` row for observability — used by
     * the lint-fix retry loop so each attempt shows up in the run trace.
     * Returns the entity (so the caller can later finalize it via
     * `finalizeRunStep`), or null if no agent-run context is available.
     */
    protected async createRunStep(
        params: ExecuteAgentParams,
        stepNumber: number,
        stepType: 'Prompt' | 'Decision' | 'Validation' | 'Actions',
        stepName: string,
        inputData?: Record<string, unknown>,
        targetID?: string,
    ): Promise<MJAIAgentRunStepEntityExtended | null> {
        const agentRunID = params.parentRun?.ID;
        if (!agentRunID) return null;
        try {
            const md: IMetadataProvider = (params.provider ?? new Metadata()) as unknown as IMetadataProvider;
            const step = await md.GetEntityObject<MJAIAgentRunStepEntityExtended>(
                'MJ: AI Agent Run Steps', params.contextUser as UserInfo);
            step.AgentRunID = agentRunID;
            step.StepNumber = stepNumber;
            step.StepType = stepType;
            step.StepName = stepName;
            step.Status = 'Running';
            step.StartedAt = new Date();
            if (targetID) step.TargetID = targetID;
            if (inputData) step.InputData = JSON.stringify(inputData, null, 2);
            const ok = await step.Save();
            return ok ? step : null;
        } catch {
            return null;
        }
    }

    /**
     * Close a previously-created agent run step with status + output. No-op
     * when the step entity is null (no run-context).
     */
    protected async finalizeRunStep(
        step: MJAIAgentRunStepEntityExtended | null,
        success: boolean,
        outputData?: Record<string, unknown>,
        targetLogID?: string,
        errorMessage?: string,
    ): Promise<void> {
        if (!step) return;
        try {
            step.Status = success ? 'Completed' : 'Failed';
            step.Success = success;
            step.CompletedAt = new Date();
            if (outputData) step.OutputData = JSON.stringify(outputData, null, 2);
            if (targetLogID) step.TargetLogID = targetLogID;
            if (errorMessage) step.ErrorMessage = errorMessage;
            await step.Save();
        } catch {
            // best-effort — observability shouldn't break the agent path
        }
    }
}
