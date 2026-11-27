/**
 * @fileoverview The 14 built-in {@link BaseAgentStepHandler} implementations matching
 * `metadata/agent-step-types/.agent-step-types.json`.
 *
 * Each handler preserves 100% identical validation and execution semantics by delegating
 * through `ctx.Hooks` (so `BaseAgent` subclass overrides continue to intercept cleanly).
 *
 * @module @memberjunction/ai-agents
 */

import {
    GetTaskGraphSubmitter,
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { AgentRunContext } from '../AgentRunContext';
import { BaseAgentStepHandler } from './BaseAgentStepHandler';

@RegisterClass(BaseAgentStepHandler, 'ActionsStepHandler')
export class ActionsStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Actions' as const;
    public override readonly AllowedInUnapprovedPlanMode = false;
    public override readonly CountsAgainstTreeBudget = true;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateActionsNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteActionsStep(
            params,
            previousDecision,
            undefined,
            true,
            stepCount,
            ctx.Hooks.ActionOptionsForAgentType()
        )) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'SubAgentStepHandler')
export class SubAgentStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Sub-Agent' as const;
    public override readonly AllowedInUnapprovedPlanMode = false;
    public override readonly CountsAgainstTreeBudget = true;

    public override async Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (
            nextStep.taskGraph?.folded &&
            nextStep.subAgent?.name &&
            Boolean(GetTaskGraphSubmitter()) &&
            !ctx.Hooks.ResolveSubAgentByName(params, nextStep.subAgent.name)
        ) {
            const activeAgentExists = AIEngine.Instance.Agents.some(
                (a) =>
                    a.Status === 'Active' &&
                    a.Name === nextStep.subAgent!.name &&
                    !UUIDsEqual(a.ID, params.agent.ID)
            );
            if (activeAgentExists) {
                ctx.Hooks.LogStatus(
                    `target is not a sub-agent of ${params.agent.Name}; submitting durably`,
                    false,
                    params
                );
                const unfolded: BaseAgentNextStep<P> = {
                    ...nextStep,
                    step: 'Tasks',
                    subAgent: undefined,
                    taskGraph: {
                        spec: nextStep.taskGraph.spec,
                        folded: false,
                    },
                };
                return ctx.Hooks.ValidateTasksNextStep<P>(params, unfolded, currentPayload, agentRun, currentStep);
            }
        }
        return ctx.Hooks.ValidateSubAgentNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        await ctx.Hooks.RecordFoldedTaskGraph(params, previousDecision);
        const subAgentResult = await ctx.Hooks.ProcessSubAgentStep<P, P>(
            params,
            previousDecision,
            undefined,
            undefined,
            stepCount
        );
        if (ctx.TreeBudget?.breachedReason) {
            const breachedReason = ctx.TreeBudget.breachedReason;
            return {
                ...subAgentResult,
                step: 'Failed',
                terminate: true,
                message: breachedReason,
                errorMessage: breachedReason,
            };
        }
        const afterSubAgent =
            (await ctx.Hooks.FinishAfterSubAgent<P>(params, previousDecision, subAgentResult)) ??
            subAgentResult;
        return ctx.Hooks.SelfCheckSuccess(
            params,
            afterSubAgent,
            afterSubAgent.newPayload ?? subAgentResult.newPayload
        );
    }
}

@RegisterClass(BaseAgentStepHandler, 'RetryStepHandler')
export class RetryStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Retry' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateRetryNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        if (previousDecision.messageIndex !== undefined) {
            const expandFailure = ctx.Hooks.ExecuteExpandMessageStep(
                previousDecision,
                params,
                ctx.PromptTurnCount
            );
            if (expandFailure) {
                params.conversationMessages.push({
                    role: 'user',
                    content: `Message expansion failed: ${expandFailure}`,
                });
            }
        }
        return ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
    }
}

@RegisterClass(BaseAgentStepHandler, 'SuccessStepHandler')
export class SuccessStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Success' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateSuccessNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        if (previousDecision.terminate) {
            return {
                terminate: true,
                step: 'Success',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload,
            };
        }

        const fallbackStep = await ctx.AgentTypeInstance!.HandleStepFallback(
            previousDecision,
            config,
            params,
            previousDecision.newPayload || previousDecision.previousPayload,
            ctx.AgentTypeState
        );

        if (fallbackStep) {
            if (fallbackStep.terminate) {
                const terminationMessage = `Agent completed successfully. Agent type '${config.agentType.Name}' terminated execution.`;
                const stepEntity = await ctx.Hooks.CreateStepEntity({
                    stepType: 'Decision',
                    stepName: terminationMessage,
                    contextUser: params.contextUser,
                    payloadAtStart: fallbackStep.previousPayload,
                    payloadAtEnd: fallbackStep.newPayload,
                });
                await ctx.Hooks.FinalizeStepEntity(stepEntity, true, undefined, {
                    reason: 'Agent type intervention - Success',
                    agentType: config.agentType.Name,
                    decision: 'Success',
                });
            }
            return fallbackStep as BaseAgentNextStep<P>;
        }

        return ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
    }
}

@RegisterClass(BaseAgentStepHandler, 'FailedStepHandler')
export class FailedStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Failed' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateFailedNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        if (previousDecision.terminate) {
            return {
                terminate: true,
                step: 'Failed',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload,
            };
        }

        const fallbackStep = await ctx.AgentTypeInstance!.HandleStepFallback(
            previousDecision,
            config,
            params,
            previousDecision.newPayload || previousDecision.previousPayload,
            ctx.AgentTypeState
        );

        if (fallbackStep) {
            if (fallbackStep.terminate) {
                const errorDetails = fallbackStep.errorMessage || 'No error details provided';
                const terminationMessage = `Agent failed. Agent type '${config.agentType.Name}' terminated execution: ${errorDetails}`;
                const stepEntity = await ctx.Hooks.CreateStepEntity({
                    stepType: 'Decision',
                    stepName: terminationMessage,
                    contextUser: params.contextUser,
                    payloadAtStart: fallbackStep.previousPayload,
                    payloadAtEnd: fallbackStep.newPayload,
                });
                await ctx.Hooks.FinalizeStepEntity(stepEntity, false, errorDetails, {
                    reason: 'Agent type intervention - Failed',
                    agentType: config.agentType.Name,
                    decision: 'Failed',
                });
                if (ctx.AgentRun) {
                    ctx.AgentRun.ErrorMessage = terminationMessage;
                    await ctx.AgentRun.Save();
                }
                ctx.Hooks.LogError(
                    `Agent type '${config.agentType.Name}' handling Failed step with termination`,
                    {
                        agent: params.agent,
                        category: 'AgentExecution',
                        metadata: {
                            errorDetails,
                            agentType: config.agentType.Name,
                        },
                    }
                );
            }
            return fallbackStep as BaseAgentNextStep<P>;
        }

        return ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
    }
}

@RegisterClass(BaseAgentStepHandler, 'ChatStepHandler')
export class ChatStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Chat' as const;
    public override readonly CountsAgainstTreeBudget = false;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateChatNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.MessagingHelper.ExecuteChatStep(ctx, params, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'ForEachStepHandler')
export class ForEachStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'ForEach' as const;

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteForEachLoop(params, config, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'WhileStepHandler')
export class WhileStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'While' as const;

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteWhileLoop(params, config, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'SkillStepHandler')
export class SkillStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Skill' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateSkillNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteSkillStep(params, config, previousDecision, stepCount)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'PlanStepHandler')
export class PlanStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Plan' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidatePlanNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecutePlanStep(params, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'TasksStepHandler')
export class TasksStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Tasks' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateTasksNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteTasksStep(params, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'HandoffStepHandler')
export class HandoffStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Handoff' as const;

    public override Validate<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ValidateHandoffNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteHandoffStep(params, previousDecision)) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'ClientToolsStepHandler')
export class ClientToolsStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'ClientTools' as const;

    public override async Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return (await ctx.Hooks.ExecuteClientToolsStep(
            params,
            config,
            previousDecision,
            stepCount
        )) as BaseAgentNextStep<P>;
    }
}

@RegisterClass(BaseAgentStepHandler, 'DecisionStepHandler')
export class DecisionStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Decision' as const;

    public override Execute<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return ctx.Hooks.ExecuteDecisionStep<P>(params, previousDecision);
    }
}
