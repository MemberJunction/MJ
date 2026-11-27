/**
 * @fileoverview Default pluggable implementation of {@link BaseAgentStepExecutionHelper}.
 *
 * Encapsulates the iterative execution loop (`ExecuteAgentInternal`), step dispatch
 * (`ExecuteNextStep`), post-prompt step processing (`ProcessNextStep`), Plan Mode
 * approval steps, and delegates step validation / error classification to
 * {@link AgentStepValidationHelper}.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessage,
    AgentConfiguration,
    AgentPayloadChangeRequest,
    AgentResponseForm,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ActiveRunGovernanceRegistry } from '../../ActiveRunGovernanceRegistry';
import { COMPLETE_TASK_TOOL } from '../../native-tools/control-tools';
import { BuildToolResultTurn, type NativeToolResult } from '../../native-tools/tool-result-turns';
import { IsPromptTurnStep, RepeatedFailingStepTracker } from '../../repeated-failing-step';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentPayloadHelper } from '../payload/AgentPayloadHelper';
import { AgentStepValidationHelper } from './AgentStepValidationHelper';
import { BaseAgentStepExecutionHelper } from './BaseAgentStepExecutionHelper';

/**
 * Default pluggable step-execution helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentStepExecutionHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentStepExecutionHelper extends BaseAgentStepExecutionHelper {
    private readonly _validation = new AgentStepValidationHelper();

    public override async ExecuteAgentInternal<P = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<P> | null =
            (ctx.ResumedCheckpointContext?.RestoredNextStep as BaseAgentNextStep<P> | null) ?? null;
        ctx.PendingLoopCursorToResume = ctx.ResumedCheckpointContext?.RestoredLoopCursor ?? null;
        if (ctx.ResumedCheckpointContext) {
            ctx.ResumedCheckpointContext.RestoredNextStep = null;
        }
        let stepCount = ctx.ResumedCheckpointContext?.StartingStepCount ?? 0;
        let consecutiveFailedSteps = 0;
        let consecutiveUnproductiveRetries = 0;
        let previousTokensTotal = ctx.Hooks.CalculateTokenStats().TotalTokens;
        const repeatedFailures =
            ctx.AgentTypeInstance?.UsesActionCircuitBreaker === false ? null : new RepeatedFailingStepTracker();

        while (continueExecution) {
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }
            if (
                ctx.PendingCheckpointPersistence ||
                ctx.PausedRunOutcome ||
                ActiveRunGovernanceRegistry.Instance.IsPausePersistencePending(ctx.AgentRun?.ID, ctx.ActiveProvider)
            ) {
                continueExecution = false;
                break;
            }

            const preStepPayload = (currentNextStep?.newPayload ?? currentNextStep?.previousPayload ?? params.payload) as P;
            const allowRemotePausePoll = stepCount > 0 || ctx.PromptTurnCount > 0 || Boolean(ctx.ResumedCheckpointContext);
            const preCoopPaused = await ctx.Hooks.CheckAndPauseOnCooperativeRequest(
                params,
                preStepPayload,
                currentNextStep,
                undefined,
                allowRemotePausePoll
            );
            if (preCoopPaused) {
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: preStepPayload,
                        newPayload: preStepPayload,
                        message: preCoopPaused.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }
            const preStepPaused = await ctx.Hooks.CheckAndPauseOnBudgetBreach(params, preStepPayload, currentNextStep);
            if (preStepPaused) {
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: preStepPayload,
                        newPayload: preStepPayload,
                        message: preStepPaused.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }

            if (params.messageExpirationOverride || ctx.Hooks.IsMidLoopCompactionThresholdReached(params)) {
                await ctx.Hooks.PruneAndCompactExpiredMessages(params, ctx.PromptTurnCount);
            }

            ctx.Hooks.LogStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const prevCompletedTasksCount = ctx.ScratchpadManager.GetTaskCounts().completed;
            const prevConsultRoundsTotal = ctx.Hooks.GetTotalSubAgentConsultRounds();
            const executedDecision = currentNextStep;
            const nextStep = await ctx.Hooks.ExecuteNextStep<P>(params, config, currentNextStep, stepCount);
            stepCount++;

            if (nextStep.step === 'Failed' && params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            if (nextStep.promoteMediaOutputs && nextStep.promoteMediaOutputs.length > 0) {
                ctx.Hooks.PromoteMediaOutputs(nextStep.promoteMediaOutputs);
            }

            if (nextStep.step === 'Failed' && !nextStep.terminate) {
                consecutiveFailedSteps++;
                const maxConsecutiveFailed = ctx.MaxConsecutiveFailedSteps;
                if (consecutiveFailedSteps >= maxConsecutiveFailed) {
                    ctx.Hooks.LogError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive failed steps ` +
                            `(${maxConsecutiveFailed}). Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveFailures: consecutiveFailedSteps,
                                lastError: nextStep.errorMessage,
                            },
                        }
                    );
                    nextStep.terminate = true;
                    nextStep.errorMessage =
                        `Agent terminated after ${consecutiveFailedSteps} consecutive failed steps. ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else if (nextStep.step !== 'Failed') {
                consecutiveFailedSteps = 0;
            }

            if (repeatedFailures && executedDecision && !IsPromptTurnStep(executedDecision) && !nextStep.terminate) {
                ctx.Hooks.CheckRepeatedFailingStep(params, repeatedFailures, executedDecision, nextStep);
            }

            const isUnproductiveRetry = nextStep.step === 'Retry' && !nextStep.terminate && !!nextStep.errorMessage;
            if (isUnproductiveRetry) {
                consecutiveUnproductiveRetries++;
                const maxUnproductiveRetries = ctx.MaxConsecutiveUnproductiveRetries;
                if (consecutiveUnproductiveRetries >= maxUnproductiveRetries) {
                    ctx.Hooks.LogError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive unproductive retries ` +
                            `(${maxUnproductiveRetries}). The model is repeatedly returning output ` +
                            `that cannot be parsed or validated. Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveUnproductiveRetries,
                                lastError: nextStep.errorMessage,
                            },
                        }
                    );
                    nextStep.step = 'Failed';
                    nextStep.terminate = true;
                    nextStep.errorMessage =
                        `Agent terminated after ${consecutiveUnproductiveRetries} consecutive unproductive retries ` +
                        `(model repeatedly returned output that could not be parsed or validated). ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else {
                consecutiveUnproductiveRetries = 0;
            }

            if (ctx.PausedRunOutcome) {
                const pausePayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: pausePayload,
                        newPayload: pausePayload,
                        message: ctx.PausedRunOutcome.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }
            if (nextStep.terminate) {
                continueExecution = false;
                ctx.Hooks.SkipHeldDecisions(params, 'the run ended after the step that carried them');
                ctx.Hooks.LogStatus(
                    `🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`,
                    true,
                    params
                );
            } else {
                const tokenStatsNow = ctx.Hooks.CalculateTokenStats();
                const tokensDelta = Math.max(0, tokenStatsNow.TotalTokens - previousTokensTotal);
                previousTokensTotal = tokenStatsNow.TotalTokens;

                const postCoopPayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                const postCoopPaused = await ctx.Hooks.CheckAndPauseOnCooperativeRequest(
                    params,
                    postCoopPayload,
                    nextStep
                );
                if (postCoopPaused) {
                    return {
                        finalStep: {
                            step: 'Success',
                            terminate: true,
                            previousPayload: postCoopPayload,
                            newPayload: postCoopPayload,
                            message: postCoopPaused.PauseResult.Checkpoint.Summary,
                        },
                        stepCount,
                    };
                }

                const isPromptFailureOrParseRetry =
                    isUnproductiveRetry || (nextStep.step === 'Failed' && !nextStep.terminate && consecutiveFailedSteps > 0);
                const isConsultContinuation = ctx.Hooks.GetTotalSubAgentConsultRounds() > prevConsultRoundsTotal;
                const postStepPaused = await ctx.Hooks.EvaluateRunawayGovernanceAfterStep(
                    params,
                    nextStep,
                    stepCount,
                    prevCompletedTasksCount,
                    tokensDelta,
                    isPromptFailureOrParseRetry,
                    isConsultContinuation
                );
                if (postStepPaused) {
                    const pausePayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                    return {
                        finalStep: {
                            step: 'Success',
                            terminate: true,
                            previousPayload: pausePayload,
                            newPayload: pausePayload,
                            message: postStepPaused.PauseResult.Checkpoint.Summary,
                        },
                        stepCount,
                    };
                }

                currentNextStep = nextStep;
                if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                    currentNextStep.newPayload = currentNextStep.previousPayload;
                }
                ctx.Hooks.LogStatus(
                    `➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`,
                    true,
                    params
                );
            }

            currentNextStep = nextStep;
            if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                currentNextStep.newPayload = currentNextStep.previousPayload;
            }
        }

        return { finalStep: currentNextStep!, stepCount };
    }

    public override async ExecuteNextStep<P = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        const currentPayload = (previousDecision?.newPayload ?? previousDecision?.previousPayload ?? params.payload) as P;
        if (previousDecision?.step !== 'Chat' && previousDecision?.terminate !== true) {
            const treeBudgetResult = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (treeBudgetResult.exceeded) {
                ctx.Hooks.LogStatus(`⛔ Execution guardrail exceeded: ${treeBudgetResult.reason}`, false, params);
                return {
                    ...(previousDecision ?? {}),
                    step: 'Failed',
                    terminate: true,
                    previousPayload: currentPayload,
                    newPayload: currentPayload,
                    message: treeBudgetResult.reason,
                    errorMessage: treeBudgetResult.reason,
                };
            }
        }

        if (!previousDecision) {
            const initialStep = await ctx.AgentTypeInstance!.DetermineInitialStep<P>(
                params,
                params.payload,
                ctx.AgentTypeState
            );
            if (initialStep?.step !== 'Failed') {
                await this.RecordExecutionRouting(ctx, params);
            }

            if (initialStep) {
                return initialStep;
            }

            return await ctx.Hooks.ExecutePromptStep<P>(params, config, undefined, stepCount);
        }

        const customNextStep = await ctx.AgentTypeInstance!.PreProcessNextStep(
            params,
            previousDecision,
            previousDecision.newPayload || previousDecision.previousPayload,
            ctx.AgentTypeState
        );

        if (customNextStep) {
            return customNextStep as BaseAgentNextStep<P>;
        }

        switch (previousDecision.step) {
            case 'Retry':
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
                return await ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
            case 'Sub-Agent': {
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
            case 'Actions':
                return (await ctx.Hooks.ExecuteActionsStep(
                    params,
                    previousDecision,
                    undefined,
                    true,
                    stepCount,
                    ctx.Hooks.ActionOptionsForAgentType()
                )) as BaseAgentNextStep<P>;
            case 'Skill' as typeof previousDecision.step:
                return (await ctx.Hooks.ExecuteSkillStep(
                    params,
                    config,
                    previousDecision,
                    stepCount
                )) as BaseAgentNextStep<P>;
            case 'Plan' as typeof previousDecision.step:
                return (await ctx.Hooks.ExecutePlanStep(params, previousDecision)) as BaseAgentNextStep<P>;
            case 'Tasks' as typeof previousDecision.step:
                return (await ctx.Hooks.ExecuteTasksStep(params, previousDecision)) as BaseAgentNextStep<P>;
            case 'Handoff' as typeof previousDecision.step:
                return (await ctx.Hooks.ExecuteHandoffStep(params, previousDecision)) as BaseAgentNextStep<P>;
            case 'ClientTools' as typeof previousDecision.step:
                return (await ctx.Hooks.ExecuteClientToolsStep(
                    params,
                    config,
                    previousDecision,
                    stepCount
                )) as BaseAgentNextStep<P>;
            case 'Decision' as typeof previousDecision.step:
                return await ctx.Hooks.ExecuteDecisionStep<P>(params, previousDecision);
            case 'Chat':
                return (await ctx.MessagingHelper.ExecuteChatStep(ctx, params, previousDecision)) as BaseAgentNextStep<P>;
            case 'Success':
                if (previousDecision.terminate) {
                    return {
                        terminate: true,
                        step: 'Success',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload,
                    };
                } else {
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
                    } else {
                        return await ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
                    }
                }
            case 'Failed':
                if (previousDecision.terminate) {
                    return {
                        terminate: true,
                        step: 'Failed',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload,
                    };
                } else {
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
                    } else {
                        return await ctx.Hooks.ExecutePromptStep<P>(params, config, previousDecision, stepCount);
                    }
                }
            case 'ForEach':
                return (await ctx.Hooks.ExecuteForEachLoop(params, config, previousDecision)) as BaseAgentNextStep<P>;
            case 'While':
                return (await ctx.Hooks.ExecuteWhileLoop(params, config, previousDecision)) as BaseAgentNextStep<P>;
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    public override async RecordExecutionRouting(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        const routing = ctx.AgentTypeInstance!.DescribeExecutionRouting(ctx.AgentTypeState);
        if (!routing) return;

        ctx.Hooks.LogStatus(`🧭 ${routing.StepName}: ${routing.Reason}`, true, params);
        await ctx.Hooks.CreateStepEntity({
            stepType: 'Decision',
            stepName: routing.StepName,
            contextUser: params.contextUser,
            completed: { success: true, outputData: { ...routing.Detail, reason: routing.Reason } },
        });
    }

    public override ValidateNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override ValidatePlanNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidatePlanNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override ValidateFailedNextStep<P>(_ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateFailedNextStep(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override ValidateRetryNextStep<P>(_ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateRetryNextStep(params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override ValidateChatNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended, chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption']): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateChatNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep, chatHandlingOption);
    }

    public override IsFatalPromptError(_ctx: AgentRunContext, promptResult: AIPromptRunResult): boolean {
        return this._validation.IsFatalPromptError(promptResult);
    }

    public override IsConfigurationError(ctx: AgentRunContext, errorMessage: string, config?: AgentConfiguration): { isConfigError: boolean; detailedMessage: string } {
        return this._validation.IsConfigurationError(ctx, errorMessage, config);
    }

    public override async ProcessNextStep<P>(
        ctx: AgentRunContext,
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        _agentType: MJAIAgentTypeEntity,
        _promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        const heldCompletionChange = AgentPayloadHelper.CarriesCompletionChange(nextStep)
            ? nextStep.payloadChangeRequest
            : undefined;
        const validatedNextStep = await ctx.Hooks.ValidateNextStep<P>(
            params,
            nextStep,
            currentPayload,
            ctx.AgentRun!,
            currentStep
        );

        const guardrailCheckedStep = this.NoteHeldCompletionChange(
            ctx,
            heldCompletionChange,
            await ctx.Hooks.CheckExecutionGuardrails<P>(
                params,
                validatedNextStep,
                currentPayload,
                ctx.AgentRun!,
                currentStep
            )
        );

        ctx.Hooks.LogStatus(
            `📌 Next step determined: ${guardrailCheckedStep.step}${guardrailCheckedStep.terminate ? ' (terminating)' : ''}`,
            true,
            params
        );

        ctx.Hooks.AppendNativeAssistantTurn(params, guardrailCheckedStep);
        ctx.Hooks.AppendAgentToolResults(params, guardrailCheckedStep);

        if (
            guardrailCheckedStep.step === 'Retry' &&
            guardrailCheckedStep.payloadToolCallId &&
            guardrailCheckedStep.nativeTurn?.sendResultsNatively
        ) {
            const toolName = this.NativeToolNameForCall(ctx, guardrailCheckedStep, guardrailCheckedStep.payloadToolCallId);
            const refusedCompletion = toolName === COMPLETE_TASK_TOOL;
            const feedback =
                guardrailCheckedStep.retryInstructions ||
                (refusedCompletion ? guardrailCheckedStep.message || guardrailCheckedStep.errorMessage : undefined);
            ctx.Hooks.PushToolResultTurn(
                params,
                BuildToolResultTurn(
                    [
                        {
                            toolCallId: guardrailCheckedStep.payloadToolCallId,
                            toolName,
                            content:
                                feedback || (refusedCompletion ? 'The task is not complete yet.' : 'Payload change applied.'),
                            isError: refusedCompletion,
                        },
                    ],
                    { turnAdded: ctx.PromptTurnCount, messageType: 'action-result' }
                ) as AgentChatMessage
            );
        } else if (
            guardrailCheckedStep.step === 'Success' &&
            guardrailCheckedStep.payloadToolCallId &&
            guardrailCheckedStep.nativeTurn?.sendResultsNatively
        ) {
            ctx.Hooks.PushToolResultTurn(
                params,
                BuildToolResultTurn(
                    [
                        {
                            toolCallId: guardrailCheckedStep.payloadToolCallId,
                            toolName: this.NativeToolNameForCall(
                                ctx,
                                guardrailCheckedStep,
                                guardrailCheckedStep.payloadToolCallId
                            ),
                            content: 'Task complete.',
                            isError: false,
                        },
                    ],
                    { turnAdded: ctx.PromptTurnCount, messageType: 'action-result' }
                ) as AgentChatMessage
            );
        } else if (guardrailCheckedStep.step === 'Retry') {
            const reason =
                guardrailCheckedStep.retryInstructions || guardrailCheckedStep.message || guardrailCheckedStep.errorMessage;
            if (reason && !this.AnswerNativeRetryTurn(ctx, params, guardrailCheckedStep, reason)) {
                params.conversationMessages.push({
                    role: 'user',
                    content: `Retrying due to: ${reason}`,
                });
            }
        }

        return guardrailCheckedStep;
    }

    public override NoteHeldCompletionChange<P>(
        ctx: AgentRunContext,
        heldChange: AgentPayloadChangeRequest<P> | undefined,
        step: BaseAgentNextStep<P>
    ): BaseAgentNextStep<P> {
        if (!heldChange || step.step === 'Success') {
            return step;
        }
        const native =
            !!step.payloadToolCallId &&
            this.NativeToolNameForCall(ctx, step, step.payloadToolCallId) === COMPLETE_TASK_TOOL;
        const call = native ? 'complete_task call' : 'completion';
        const note =
            `The payloadChangeRequest sent with this ${call} was not applied yet: it is held, and the payload you see ` +
            `from now on includes it. It is applied together with your next ${call}. In that ${call}, send only the ` +
            `corrections, not the whole change again.`;
        const field = step.retryInstructions ? 'retryInstructions' : step.message ? 'message' : 'errorMessage';
        const { payloadChangeRequest: _held, ...rest } = step;
        return { ...rest, [field]: step[field] ? `${step[field]}\n\n${note}` : note };
    }

    public override AnswerNativeRetryTurn(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep,
        reason: string
    ): boolean {
        const turn = step.nativeTurn;
        const messages = params.conversationMessages;
        const at = turn?.sendResultsNatively ? ctx.ActionsHelper.LastToolCallTurnIndex(messages) : -1;
        if (!turn || at < 0) {
            return false;
        }
        const answered = ctx.ActionsHelper.ToolCallIdsAnsweredAfter(messages, at);
        const calls = turn.toolCalls.filter((call) => !!call.id && !answered.has(call.id));
        if (calls.length === 0) {
            return false;
        }
        ctx.Hooks.InsertToolResultsAfterCallTurn(
            messages,
            at,
            BuildToolResultTurn(
                calls.map((call) => ({
                    toolCallId: call.id,
                    toolName: call.name,
                    content: `Not executed. ${reason}`,
                    isError: true,
                })),
                { turnAdded: ctx.PromptTurnCount, messageType: 'action-result' }
            ) as AgentChatMessage
        );
        return true;
    }

    public override DeclineTerminalAfterFailedWrite<P>(
        ctx: AgentRunContext,
        step: BaseAgentNextStep<P>,
        results: NativeToolResult[]
    ): BaseAgentNextStep<P> {
        const terminal = (step.step === 'Success' || step.step === 'Chat') && step.nativeTurn;
        if (!terminal || !results.some((r) => r.isError && step.agentToolCalls?.some((c) => c.toolCallId === r.toolCallId))) {
            return step;
        }
        const call = step.nativeTurn?.toolCalls.find((c) => {
            const kind = ctx.NativeToolBindings?.get(c.name)?.kind;
            return kind === 'complete' || kind === 'askUser';
        });
        if (call?.id) {
            results.push({
                toolCallId: call.id,
                toolName: call.name,
                isError: true,
                content: `Not executed. A write on this turn failed (see its result). Fix it, then call ${call.name} again.`,
            });
        }
        return {
            ...step,
            step: 'Retry',
            terminate: false,
            payloadToolCallId: undefined,
            message: undefined,
            responseForm: undefined,
            retryInstructions: undefined,
        };
    }

    public override NativeToolNameForCall(_ctx: AgentRunContext, step: BaseAgentNextStep, toolCallId: string): string {
        return step.nativeTurn?.toolCalls.find((c) => c.id === toolCallId)?.name ?? 'payload_change_request';
    }

    public override async ExecutePlanStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const planText = previousDecision.planDetails?.plan ?? '';

        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Plan',
            stepName: 'Plan Presented for Approval',
            contextUser: params.contextUser,
            inputData: { plan: planText },
            completed: {
                success: true,
                outputData: { plan: planText },
            },
        });

        const responseForm = ctx.Hooks.BuildPlanApprovalForm(planText);
        const planPresentation: BaseAgentNextStep = {
            step: 'Plan' as BaseAgentNextStep['step'],
            terminate: true,
            message: previousDecision.message || 'Please review the proposed plan before I proceed.',
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            responseForm,
        };

        await ctx.Hooks.RaiseFeedbackRequest(params, stepEntity, planPresentation);

        return {
            step: 'Chat',
            terminate: true,
            message: planPresentation.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            responseForm,
        };
    }

    public override BuildPlanApprovalForm(ctx: AgentRunContext, planText: string): AgentResponseForm {
        return ctx.FeedbackCoordinator.BuildPlanApprovalForm(planText);
    }

    public override ResolveChildPayloadArtifactTypeID<R>(
        _ctx: AgentRunContext,
        subAgentResult: ExecuteAgentResult<R>,
        subAgentEntity?: MJAIAgentEntityExtended
    ): string | undefined {
        if (subAgentResult.payloadArtifactTypeID) {
            return subAgentResult.payloadArtifactTypeID;
        }
        if (subAgentEntity?.ArtifactCreationMode === 'Never') {
            return undefined;
        }
        return subAgentEntity?.DefaultArtifactTypeID || undefined;
    }
}
