/**
 * @fileoverview Pluggable step-handler base class for Extension Point #1 (`BaseAgentStepHandler`).
 *
 * OpenApps and core MemberJunction packages register subclasses with
 * `@RegisterClass(BaseAgentStepHandler, '<DriverClass>')` and link them via
 * `MJ: AI Agent Step Types` (`AIAgentStepType`) or {@link AgentStepTypeRegistry}.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentConfiguration,
    AgentNextStepKey,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { AgentRunContext } from '../AgentRunContext';
import {
    ValidateCustomStepDataAgainstConfigSchema,
    type CustomStepConfigSchemaValidationResult,
} from './CustomStepConfigSchemaValidator';

/**
 * Abstract base class for pluggable agent next-step handlers (Extension Point #1).
 *
 * Every built-in step (`Actions`, `Sub-Agent`, `Retry`, `Success`, `Failed`, `Chat`,
 * `ForEach`, `While`, `Skill`, `Plan`, `Tasks`, `Handoff`, `ClientTools`, `Decision`)
 * and every OpenApp custom step type implements this contract and is resolved via
 * {@link AgentStepTypeRegistry}.
 */
export abstract class BaseAgentStepHandler {
    /**
     * Canonical step key handled by this class (e.g. `'Actions'`, `'Sub-Agent'`, or a
     * custom OpenApp key like `'ApprovalGate'`).
     */
    public abstract readonly StepKey: AgentNextStepKey;

    /**
     * Whether this step type is permitted while Plan Mode is active and not yet approved.
     * Defaults to `false` (fail-closed) so new or mutating custom step types cannot execute
     * before a user approves the agent's plan. Read-only, planning, or conversational steps
     * explicitly override this to `true`.
     */
    public readonly AllowedInUnapprovedPlanMode: boolean = false;

    /**
     * Whether executing this step checks the workflow/tree execution budget before dispatch.
     * Conversational pause steps (`Chat`) set this to `false`.
     */
    public readonly CountsAgainstTreeBudget: boolean = true;

    /**
     * Validates `customStepData` against the step type's `AIAgentStepType.ConfigSchema` JSON Schema
     * before handler validation/execution (`R2-12`). Subclasses may override to extend validation.
     */
    public ValidateConfigSchema(
        configSchemaJson: string | null | undefined,
        customStepData: unknown
    ): CustomStepConfigSchemaValidationResult {
        return ValidateCustomStepDataAgainstConfigSchema(configSchemaJson, customStepData);
    }

    /**
     * Validates a model- or agent-type-emitted next step before execution.
     * Implementations may return the step unchanged, transform it, or return a `'Retry'` / `'Failed'` step.
     */
    public async Validate<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    /**
     * Executes the validated next step and returns the subsequent step decision for the run loop.
     */
    public abstract Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>>;

    /**
     * Optional dynamic prompt-instruction fragment appended for active custom step types.
     * Return `null` when static `AIAgentStepType.PromptInstructions` (or none) should be used.
     */
    public BuildPromptInstructions(_ctx: AgentRunContext, _params: ExecuteAgentParams): string | null {
        return null;
    }
}
