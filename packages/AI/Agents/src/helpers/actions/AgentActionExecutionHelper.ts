/**
 * @fileoverview Focused execution collaborator owned by {@link AgentActionsHelper}
 * encapsulating single-action dispatch, parallel action step orchestration, client-tool
 * step execution, and agent-local native tool step execution.
 *
 * @module @memberjunction/ai-agents
 */

import {
    AgentUserPolicyEngine,
    type AgentAction,
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type AgentClientToolInvocation,
    type AgentConfiguration,
    type AgentPayloadChangeRequest,
    type AgentToolCallRequest,
    type BaseAgentNextStep,
    type ClientToolResultSummary,
    type ExecuteAgentParams,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionOutputTrustLevel, ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import { IsVerboseLoggingEnabled, LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import {
    ActionLifecycleResolver,
    type ResolvedActionExpirationConfig,
} from '../../ActionLifecycleResolver';
import type { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import { BindingsForAction, IsBoundParamName } from '../../bound-action-params';
import { BuildClientToolResultMessage, ResolveClientToolResultMaxChars } from '../../client-tool-results';
import { ClientToolRequestManager } from '../../ClientToolRequestManager';
import type { AgentToolContext, AgentToolDefinition, AgentToolResult } from '../../native-tools/agent-tools';
import { BuildToolResultTurn, type NativeToolResult } from '../../native-tools/tool-result-turns';
import type { AgentRunContext } from '../AgentRunContext';
import {
    CircuitBreakerActionResult,
    type ActionResultSummary,
    type ExecuteSingleActionOptions,
} from '../base-agent-types';
import type { BaseAgentActionsHelper } from './BaseAgentActionsHelper';

/**
 * Execution collaborator owned by {@link AgentActionsHelper}.
 */
export class AgentActionExecutionHelper {
    // -------------------------------------------------------------------------
    // Single-Action Dispatch
    // -------------------------------------------------------------------------

    public async ExecuteSingleAction(
        ctx: AgentRunContext,
        actionsHelper: BaseAgentActionsHelper,
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
        options?: ExecuteSingleActionOptions
    ): Promise<ActionResult> {
        const policy = ctx.ActionPolicyHelper;
        const skipBreaker = options?.skipCircuitBreaker === true;

        const binding = policy.ApplyActionBindings(ctx, params, action, actionEntity, options);
        if (binding.Refusal) {
            return policy.RefuseBoundAction(ctx, params, action, actionEntity, binding.Refusal, options);
        }
        const normalizedParams = ctx.Hooks.NormalizeActionParams(binding.HasBindings ? binding.Params : action.params);

        if (!skipBreaker) {
            const blocked = ctx.Hooks.CheckActionCircuitBreaker(params, action, actionEntity, normalizedParams);
            if (blocked) {
                return blocked;
            }
        }

        const policyBlocked = await ctx.Hooks.CheckUserActionPolicy(
            params,
            action,
            actionEntity,
            contextUser ?? params.contextUser
        );
        if (policyBlocked) {
            return policyBlocked;
        }

        const taintBlocked = policy.CheckTaintedEgress(
            ctx,
            params,
            action,
            actionEntity,
            contextUser ?? params.contextUser
        );
        if (taintBlocked) {
            if (!skipBreaker) {
                actionsHelper.LockOutAction(ctx, action, actionEntity, 'tainted');
            }
            return taintBlocked;
        }

        const audience = await ctx.Hooks.AudienceReadersFor(params);
        if ('Error' in audience) {
            throw new Error(audience.Error);
        }

        const structuralRefusal = policy.CheckStructuralAudienceAction(
            ctx,
            params,
            action,
            actionEntity,
            contextUser,
            skipBreaker
        );
        if (structuralRefusal) {
            return structuralRefusal;
        }

        try {
            const result = await AgentUserPolicyEngine.Instance.RunWithExecutingAgentContext(
                params.agent?.ID ?? '',
                () =>
                    ActionEngineServer.Instance.RunAction({
                        Action: actionEntity,
                        Params: policy.ToActionParams(ctx, binding, actionEntity),
                        ContextUser: contextUser,
                        Filters: [],
                        SkipActionLog: false,
                        Context: policy.StampActionContext(ctx, params),
                        AbortSignal: params.cancellationToken,
                        ...policy.RunBoundDispatchParams(ctx, params, actionEntity, audience.Readers, contextUser),
                    }),
                params.policyCeilingAgentIDs
            );
            actionsHelper.RecordDispatchOutcome(ctx, params, action, actionEntity, result, normalizedParams, skipBreaker);
            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (!skipBreaker) {
                ctx.Hooks.RecordActionFailure(action, actionEntity, errorMsg, normalizedParams);
            }
            ctx.Hooks.LogError(error instanceof Error ? error : errorMsg, {
                category: 'ActionExecution',
                metadata: {
                    actionName: action.name,
                    actionParams: action.params,
                },
            });
            throw new Error(`Error executing actions: ${errorMsg}`);
        }
    }

    // -------------------------------------------------------------------------
    // Parallel Actions Step Orchestration
    // -------------------------------------------------------------------------

    public async ExecuteActionsStep(
        ctx: AgentRunContext,
        actionsHelper: BaseAgentActionsHelper,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage: boolean = true,
        stepCount: number = 0,
        actionOptions?: ExecuteSingleActionOptions
    ): Promise<BaseAgentNextStep> {
        try {
            const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
            const availableForExecution = ctx.Hooks.GetAvailableActionsForAgent(params.agent.ID);
            const actions: AgentAction[] = (previousDecision.actions || []).map((a) => {
                const matched = ctx.Hooks.ResolveActionEntityForAgent(a?.name, availableForExecution, params, false);
                return matched && matched.Name !== a.name ? { ...a, name: matched.Name } : { ...a };
            });

            const preActionBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (preActionBudgetCheck.exceeded) {
                const limitReason = preActionBudgetCheck.reason ?? 'Workflow budget exceeded before action execution';
                return {
                    terminate: true,
                    step: 'Failed',
                    message: limitReason,
                    errorMessage: limitReason,
                    previousPayload: previousDecision?.previousPayload || null,
                    newPayload: currentPayload,
                };
            }
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled before action execution');
            }

            let progressMessage: string;
            if (actions.length === 1) {
                const aa = actions[0];
                progressMessage = `Executing **${aa.name}** action`;

                const shownParams = ctx.ActionPolicyHelper.ShownActionParamEntries(ctx, params, aa);
                if (shownParams.length > 0) {
                    const paramsList = shownParams
                        .map(([key, value]) => {
                            const displayValue = actionsHelper.FormatParamValueForMessage(ctx, value);
                            return `• **${key}**: ${displayValue}`;
                        })
                        .join('\n');
                    progressMessage += ` with parameters:\n${paramsList}`;
                } else {
                    progressMessage += '.';
                }
            } else {
                progressMessage =
                    `Executing **${actions.length} actions** in parallel:\n\n` +
                    actions
                        .map((aa, index) => {
                            let actionText = `${index + 1}. **${aa.name}**`;
                            const shownParams = ctx.ActionPolicyHelper.ShownActionParamEntries(ctx, params, aa);
                            if (shownParams.length > 0) {
                                const paramsList = shownParams
                                    .map(([key, value]) => {
                                        const displayValue = actionsHelper.FormatParamValueForMessage(ctx, value);
                                        return `   • **${key}**: ${displayValue}`;
                                    })
                                    .join('\n');
                                actionText += `\n${paramsList}`;
                            }
                            return actionText;
                        })
                        .join('\n\n');
            }

            ctx.Hooks.SafeOnProgress(params, {
                step: 'action_execution',
                message: ctx.Hooks.FormatHierarchicalMessage(progressMessage),
                metadata: {
                    actionCount: actions.length,
                    actionNames: actions.map((a) => a.name),
                    stepCount: stepCount + 1,
                    hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts),
                },
                displayMode: 'live',
            });

            const actionMessage = ctx.Hooks.BuildActionInvocationMessage(actions, params);

            if (addConversationMessage) {
                if (!previousDecision.nativeTurn?.sendResultsNatively) {
                    params.conversationMessages.push({
                        role: 'user',
                        content: actionMessage,
                    });
                }
            }

            const effectiveActions = ctx.Hooks.GetEffectiveActionsForValidation(params.agent.ID);

            try {
                const prePayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
                await ctx.AgentTypeInstance?.PreProcessActionStep(
                    actions,
                    prePayload,
                    ctx.AgentTypeState,
                    previousDecision,
                    params
                );
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                LogError(`Error in PreProcessActionStep: ${errMsg}`);
            }

            let numActionsProcessed = 0;
            const baseStepNumber = (ctx.AgentRun?.Steps?.length || 0) + 1;

            let lastStep: MJAIAgentRunStepEntityExtended | undefined = undefined;
            const flowStepActions = actionsHelper.GetFlowStepActions(ctx, params.agent.ID);
            const actionPromises = actions.map(async (aa) => {
                let actionEntity = ctx.Hooks.ResolveActionEntityForAgent(aa?.name, effectiveActions, params, false);
                if (!actionEntity && flowStepActions.length > 0) {
                    actionEntity = ctx.Hooks.ResolveActionEntityForAgent(aa?.name, flowStepActions, params, false);
                }
                if (actionEntity && aa.name !== actionEntity.Name) {
                    aa.name = actionEntity.Name;
                }
                if (!actionEntity) {
                    throw new Error(
                        `Action "${aa.name}" Not Found for Agent "${params.agent.Name}". Available actions: ${effectiveActions.map((a) => a.Name).join(', ')}`
                    );
                }

                const boundNames = Object.keys(BindingsForAction(params.boundActionParams, actionEntity.ID) ?? {});
                const actionInputData =
                    boundNames.length > 0
                        ? { actionName: aa.name, actionParams: aa.params, boundParams: boundNames }
                        : { actionName: aa.name, actionParams: aa.params };

                const stepEntity = await ctx.Hooks.CreateStepEntity({
                    stepType: 'Actions',
                    stepName: `Execute Action: ${aa.name}`,
                    contextUser: params.contextUser,
                    targetId: actionEntity.ID,
                    inputData: actionInputData,
                    payloadAtStart: currentPayload,
                    payloadAtEnd: currentPayload,
                    parentId: parentStepId,
                    skills: ctx.Hooks.GetSkillAttributionForAction(actionEntity.ID, params.agent),
                });
                lastStep = stepEntity;
                stepEntity.StepNumber = baseStepNumber + numActionsProcessed++;

                ctx.Hooks.IncrementExecutionCount(actionEntity.ID);

                let actionResult: ActionResult | undefined;
                try {
                    actionResult = await ctx.Hooks.ExecuteSingleAction(params, aa, actionEntity, params.contextUser, {
                        ...actionOptions,
                        StepID: stepEntity.ID,
                    });

                    if (actionResult.LogEntry?.ID) {
                        const logId = actionResult.LogEntry.ID;
                        stepEntity.TargetLogID = logId;
                        ctx.Hooks.QueueStepSave(stepEntity, (s) => {
                            s.TargetLogID = logId;
                        });
                    }

                    const outputData = {
                        actionResult: {
                            success: actionResult.Success,
                            resultCode: actionResult.Result?.ResultCode,
                            message: actionResult.Message,
                            parameters: actionResult.Params,
                        },
                    };

                    await ctx.Hooks.FinalizeStepEntity(
                        stepEntity,
                        actionResult.Success,
                        actionResult.Success ? undefined : actionResult.Message,
                        outputData
                    );

                    return {
                        success: actionResult.Success,
                        result: actionResult,
                        action: aa,
                        actionEntity,
                        stepEntity,
                        error: actionResult.Success ? undefined : actionResult.Message,
                    };
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    await ctx.Hooks.FinalizeStepEntity(stepEntity, false, errMsg);
                    return {
                        success: false,
                        result: actionResult,
                        error: errMsg,
                        action: aa,
                        actionEntity,
                        stepEntity,
                    };
                }
            });

            const actionResults = await Promise.all(actionPromises);

            const postActionBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (postActionBudgetCheck.exceeded) {
                const limitReason = postActionBudgetCheck.reason ?? 'Workflow budget exceeded after action execution';
                return {
                    terminate: true,
                    step: 'Failed',
                    message: limitReason,
                    errorMessage: limitReason,
                    previousPayload: previousDecision?.previousPayload || null,
                    newPayload: currentPayload,
                };
            }
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled after action execution');
            }

            const agentActionsByActionId = ctx.Hooks.IndexEffectiveAgentActions(params.agent.ID);
            const toolsEnabled = ctx.Hooks.AreArtifactToolsEnabled(params);
            const pendingSpilloverInputs: Array<Parameters<ActionResultSpilloverManager['QueueDeferred']>[1]> = [];
            const resolvedExpirationConfigs: ResolvedActionExpirationConfig[] = [];
            const actionSummaries: ActionResultSummary[] = actionResults.map((result) => {
                const actionResult = result.result;
                const isActionSuccess = Boolean(result.success && (actionResult ? actionResult.Success : true));

                const bindings = BindingsForAction(params.boundActionParams, result.actionEntity?.ID ?? '');
                const outputParams =
                    actionResult?.Params?.filter(
                        (p) => (p.Type === 'Both' || p.Type === 'Output') && !IsBoundParamName(p.Name, bindings)
                    ) || [];

                const sanitizedParams = ctx.Hooks.InterceptLargeBinaryContent(outputParams, result.actionEntity);

                const fileOutputs = ctx.Hooks.DetectFileOutputs(outputParams);
                ctx.FileOutputs.push(...fileOutputs);

                const stepNum = result.stepEntity?.StepNumber ?? stepCount + 1;
                const trustLevel = ctx.Hooks.ResolveActionTrustLevel(result.action.name, result.actionEntity, params);
                if (trustLevel === 'Untrusted' || trustLevel === 'SemiTrusted') {
                    ctx.Hooks.RecordTaintedSource(stepNum, `action:${result.action.name}`, trustLevel);
                }

                const expirationConfig = ActionLifecycleResolver.ResolveExpirationConfig(
                    result.actionEntity,
                    params.agent.ID,
                    params,
                    agentActionsByActionId
                );
                if (expirationConfig != null && expirationConfig.ExpirationMode !== 'None') {
                    resolvedExpirationConfigs.push(expirationConfig);
                }
                if (isActionSuccess && addConversationMessage && toolsEnabled) {
                    pendingSpilloverInputs.push({
                        ActionName: result.action.name,
                        OutputParams: sanitizedParams,
                        Message: actionResult?.Message,
                        StepNumber: stepNum,
                        ExpirationConfig: expirationConfig,
                        TrustLevel: trustLevel,
                    });
                }

                return {
                    actionName: result.action.name,
                    success: isActionSuccess,
                    params: sanitizedParams,
                    resultCode:
                        actionResult?.Result?.ResultCode ||
                        actionResult?.ResultCode ||
                        (isActionSuccess ? 'SUCCESS' : 'ERROR'),
                    message: actionResult?.Message || (isActionSuccess ? 'Action completed' : result.error || 'Unknown error'),
                    aiDirectives: trustLevel === 'Untrusted' ? undefined : actionResult?.AIDirectives,
                    breakerReason: actionResult instanceof CircuitBreakerActionResult ? actionResult.Reason : undefined,
                    trustLevel,
                    errorRecovery: actionResult?.ErrorRecovery,
                };
            });

            const failedActions = actionSummaries.filter((a) => !a.success);
            const resultsMessage = ctx.Hooks.BuildActionResultsMessage(actionSummaries);

            const mostRestrictiveExpiration = ActionLifecycleResolver.PickMostRestrictiveExpiration(resolvedExpirationConfigs);
            const metadata: AgentChatMessageMetadata = {
                turnAdded: ctx.PromptTurnCount,
                messageType: 'action-result',
                ...ActionLifecycleResolver.ExpirationToMetadataFields(mostRestrictiveExpiration),
            };
            for (const spilloverInput of pendingSpilloverInputs) {
                ctx.ActionSpilloverManager.QueueDeferred(metadata, spilloverInput, ctx.ArtifactToolManager);
            }

            if (addConversationMessage) {
                const failureGuidance =
                    failedActions.length > 0 && actionOptions?.skipCircuitBreaker !== true
                        ? new Map(failedActions.map((f) => [f, ctx.Hooks.FormatActionFailureDirective(f)] as const))
                        : undefined;
                const answeredNatively = ctx.Hooks.AppendActionResults(
                    params,
                    actionSummaries,
                    resultsMessage,
                    metadata,
                    previousDecision,
                    failureGuidance
                );

                const allDirectives = actionSummaries
                    .filter((a) => a.aiDirectives && a.aiDirectives.length > 0)
                    .flatMap((a) => a.aiDirectives!);
                if (allDirectives.length > 0) {
                    const directiveText = allDirectives
                        .map((d) => `[${d.Priority.toUpperCase()}/${d.Type}] ${d.Message}`)
                        .join('\n\n');
                    params.conversationMessages.push({
                        role: 'user',
                        content: `IMPORTANT — Follow these directives from the action results:\n\n${directiveText}`,
                    });
                }

                const unanswered = failureGuidance ? failedActions.filter((f) => !answeredNatively.has(f)) : [];
                if (failureGuidance && unanswered.length > 0) {
                    const failureText = unanswered.map((f) => failureGuidance.get(f)).join('\n\n');
                    params.conversationMessages.push({
                        role: 'user',
                        content: `IMPORTANT — Action Execution Failure Guidance:\n\n${failureText}`,
                    });
                }
            }

            let finalPayload = currentPayload;

            try {
                const actionResultsOnly = actionResults.map((r) => r.result).filter((r): r is ActionResult => r !== undefined);

                const payloadChangeRequest = await ctx.AgentTypeInstance?.PostProcessActionStep(
                    actionResultsOnly,
                    actions,
                    currentPayload,
                    ctx.AgentTypeState,
                    previousDecision
                );

                if (payloadChangeRequest) {
                    const allowedPaths = params.agent.PayloadSelfWritePaths
                        ? JSON.parse(params.agent.PayloadSelfWritePaths)
                        : ctx.Hooks.GetDefaultPayloadSelfWritePaths();

                    const changeResult = ctx.PayloadManager.applyAgentChangeRequest(currentPayload, payloadChangeRequest, {
                        validateChanges: true,
                        logChanges: true,
                        agentName: params.agent.Name,
                        analyzeChanges: true,
                        generateDiff: true,
                        allowedPaths,
                        verbose: params.verbose === true || IsVerboseLoggingEnabled(),
                    });

                    finalPayload = changeResult.result;
                    if (lastStep) {
                        const serializedEnd = ctx.Hooks.SerializePayloadAtEnd(finalPayload);
                        const endSource = ctx.Hooks.FindPayloadAtEndSource(serializedEnd, lastStep);
                        const payloadAtEnd = endSource ? null : serializedEnd;
                        const payloadAtEndSourceStepId = endSource ? endSource.ID : null;
                        lastStep.PayloadAtEnd = payloadAtEnd;
                        lastStep.PayloadAtEndSourceStepID = payloadAtEndSourceStepId;
                        ctx.Hooks.QueueStepSave(lastStep, (s) => {
                            s.PayloadAtEnd = payloadAtEnd;
                            s.PayloadAtEndSourceStepID = payloadAtEndSourceStepId;
                        });
                    }

                    if (changeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Action post-processing payload warnings: ${changeResult.warnings.join('; ')}`);
                    }
                }
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                LogError(`Error in PostProcessActionStep: ${errMsg}`);
            }

            const finished = await ctx.Hooks.FinishAfterActions(
                params,
                previousDecision,
                actionResults,
                actionSummaries,
                finalPayload,
                parentStepId,
                addConversationMessage
            );
            if (finished) {
                return ctx.Hooks.SelfCheckSuccess(params, finished, finalPayload);
            }

            const failedNoun = failedActions.length === 1 ? 'action' : 'actions';
            const completedNoun = actionSummaries.length === 1 ? 'action' : 'actions';
            return {
                terminate: false,
                step: 'Retry',
                previousPayload: previousDecision?.previousPayload || null,
                newPayload: finalPayload,
                priorStepResult: actionSummaries,
                retryReason:
                    failedActions.length > 0
                        ? `Processing results with ${failedActions.length} failed ${failedNoun}: ${failedActions.map((a) => a.actionName).join(', ')}`
                        : `Analyzing results from ${actionSummaries.length} completed ${completedNoun}`,
            };
        } catch (e) {
            return {
                terminate: false,
                step: 'Retry',
                errorMessage: e instanceof Error ? e.message : e ? String(e) : 'Unknown error executing actions',
                retryReason: 'Error while processing actions, retry',
                newPayload: previousDecision?.newPayload || null,
                previousPayload: previousDecision?.previousPayload || null,
            };
        }
    }

    // -------------------------------------------------------------------------
    // Client Tools Step Execution
    // -------------------------------------------------------------------------

    public DescribeClientToolInvocations(clientTools: AgentClientToolInvocation[]): string {
        return clientTools.length === 1
            ? `I'm invoking the **${clientTools[0].Name}** client tool${clientTools[0].Description ? ` — ${clientTools[0].Description}` : ''}.`
            : `I'm invoking **${clientTools.length} client tools**:\n\n` +
                  clientTools.map((t, i) => `${i + 1}. **${t.Name}**${t.Description ? ` — ${t.Description}` : ''}`).join('\n');
    }

    public async ExecuteClientToolsStep(
        ctx: AgentRunContext,
        actionsHelper: BaseAgentActionsHelper,
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep> {
        const refused = ctx.ActionPolicyHelper.ClientToolsRefusal(ctx, params, previousDecision);
        if (refused) {
            return refused;
        }
        const clientTools: AgentClientToolInvocation[] = previousDecision.clientTools ?? [];
        if (clientTools.length === 0) {
            return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
        }

        if (!params.sessionID) {
            const errorMsg = 'Cannot execute client tools: no sessionID provided in ExecuteAgentParams';
            LogError(errorMsg);
            params.conversationMessages.push({
                role: 'user',
                content: `Client tool execution skipped: ${errorMsg}`,
            });
            return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
        }

        const currentPayload = previousDecision?.newPayload || previousDecision?.previousPayload || params.payload;
        const toolMessage = this.DescribeClientToolInvocations(clientTools);

        params.conversationMessages.push({
            role: 'assistant',
            content: toolMessage,
        });

        ctx.Hooks.SafeOnProgress(params, {
            step: 'action_execution',
            message: ctx.Hooks.FormatHierarchicalMessage(toolMessage),
            metadata: {
                toolCount: clientTools.length,
                toolNames: clientTools.map((t) => t.Name),
                stepCount: stepCount + 1,
                hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts),
            },
            displayMode: 'live',
        });

        const defaultTimeout = params.clientToolTimeoutMs ?? ctx.Hooks.ResolvedLimits(params).ResourceGuards.ClientToolTimeoutMs;

        const results: ClientToolResultSummary[] = [];
        const agentRunID = ctx.AgentRun?.ID ?? 'unknown';
        const toolsByName = new Map(
            actionsHelper
                .ResolveClientToolsForRun(ctx, params.agent, { ...(params.data ?? {}), sessionID: params.sessionID })
                .map((t) => [t.Name.trim().toLowerCase(), t] as const)
        );

        for (const tool of clientTools) {
            const stepEntity = await ctx.Hooks.CreateStepEntity({
                stepType: 'Tool',
                stepName: `Client Tool: ${tool.Name}`,
                inputData: { toolName: tool.Name, params: tool.Params },
                contextUser: params.contextUser,
                payloadAtStart: currentPayload,
                payloadAtEnd: currentPayload,
            });

            const timeoutMs = tool.TimeoutMs ?? defaultTimeout;

            ctx.LivenessWatchdog?.SuspendForExternalWait(`client-tool:${tool.Name}`);
            let response: Awaited<ReturnType<typeof ClientToolRequestManager.Instance.RequestClientTool>>;
            try {
                response = await ClientToolRequestManager.Instance.RequestClientTool(
                    `ct_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    tool.Name,
                    tool.Params,
                    params.sessionID,
                    agentRunID,
                    timeoutMs,
                    tool.Description
                );
            } finally {
                ctx.LivenessWatchdog?.ResumeFromExternalWait(`client-tool:${tool.Name}`);
            }

            await ctx.Hooks.FinalizeStepEntity(stepEntity, response.Success, response.ErrorMessage, {
                result: response.Result,
                media: response.Media?.map((m) => ({
                    mimeType: m.MimeType,
                    bytes: Math.floor((m.Base64.length * 3) / 4),
                    width: m.Width,
                    height: m.Height,
                })),
            });

            const matchedClientToolMeta = toolsByName.get(tool.Name.trim().toLowerCase());
            const resolvedActionTrust = ctx.Hooks.ResolveActionTrustLevel(tool.Name, undefined, params);
            const clientToolTrustLevel: ActionOutputTrustLevel =
                resolvedActionTrust !== 'Trusted' ? resolvedActionTrust : (matchedClientToolMeta?.TrustLevel ?? 'Trusted');
            if (clientToolTrustLevel === 'Untrusted' || clientToolTrustLevel === 'SemiTrusted') {
                ctx.Hooks.RecordTaintedSource(
                    stepEntity?.StepNumber ?? stepCount + 1,
                    `client-tool:${tool.Name}`,
                    clientToolTrustLevel
                );
            }

            results.push({
                ToolName: tool.Name,
                Success: response.Success,
                Result: response.Result,
                Media: response.Media,
                ErrorMessage: response.ErrorMessage,
                TrustLevel: clientToolTrustLevel,
            });
        }

        params.conversationMessages.push(
            BuildClientToolResultMessage(results, ctx.PromptTurnCount, ResolveClientToolResultMaxChars(ctx.AgentTypePromptParams))
        );

        if (previousDecision.terminateAfterExecution) {
            return ctx.Hooks.SelfCheckSuccess(
                params,
                {
                    step: 'Success',
                    terminate: true,
                    message: previousDecision.message || 'Client tools executed successfully.',
                    payloadChangeRequest: previousDecision.payloadChangeRequest,
                    scratchpad: previousDecision.scratchpad,
                    responseForm: previousDecision.responseForm,
                    actionableCommands: previousDecision.actionableCommands,
                    automaticCommands: previousDecision.automaticCommands,
                    artifactDirective: previousDecision.artifactDirective,
                },
                previousDecision.newPayload
            );
        }

        return await ctx.Hooks.ExecutePromptStep(params, config, previousDecision, stepCount);
    }

    // -------------------------------------------------------------------------
    // Agent-Local Native Tools Execution
    // -------------------------------------------------------------------------

    public async ExecuteAgentToolCallsAsSteps<P>(
        ctx: AgentRunContext,
        calls: AgentToolCallRequest[],
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; results: NativeToolResult[] }> {
        let current = payload;
        const results: NativeToolResult[] = [];
        for (const call of calls) {
            if (params.cancellationToken?.aborted) {
                results.push({
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    content: 'Not executed: the run was cancelled.',
                    isError: true,
                });
                continue;
            }
            const outcome = await this.ExecuteAgentToolCallAsStep(ctx, call, current, params);
            current = outcome.payload;
            results.push(outcome.result);
        }
        return { payload: current, results };
    }

    public async ExecuteAgentToolCallAsStep<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; result: NativeToolResult }> {
        const step = await ctx.Hooks.CreateStepEntity({
            stepType: 'Tool',
            stepName: `Agent Tool: ${call.toolName}`,
            contextUser: params.contextUser,
            inputData: { tool: call.toolName, arguments: call.arguments },
            payloadAtStart: payload,
        });
        let outcome: { payload: P; content: string; isError: boolean } = { payload, content: '', isError: true };
        const breakerKey = this.AgentToolBreakerKey(ctx, call);
        try {
            const refusal = breakerKey === null ? null : ctx.AgentToolBreaker.Check(call.toolName, breakerKey);
            if (refusal) {
                ctx.Hooks.LogStatus(`   ⚡ Circuit breaker: agent tool '${call.toolName}' not run (0ms)`, false, params);
                outcome = { payload, content: refusal, isError: true };
            } else {
                outcome = await this.RunAndApplyAgentTool(ctx, call, payload, params);
                this.RecordAgentToolOutcome(ctx, call.toolName, breakerKey, outcome.isError);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Agent '${params.agent?.Name}': applying agent tool '${call.toolName}' failed: ${message}`);
            outcome = {
                payload,
                content: `The tool's change could not be applied: ${message}. Nothing was changed.`,
                isError: true,
            };
            this.RecordAgentToolOutcome(ctx, call.toolName, breakerKey, true);
        } finally {
            step.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(outcome.payload);
            await ctx.Hooks.FinalizeStepEntity(
                step,
                !outcome.isError,
                outcome.isError ? outcome.content : undefined,
                { tool: call.toolName, content: outcome.content, isError: outcome.isError }
            );
        }
        return {
            payload: outcome.payload,
            result: {
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                content: outcome.content,
                isError: outcome.isError,
            },
        };
    }

    public async RunAndApplyAgentTool<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; content: string; isError: boolean }> {
        const ran = await this.RunAgentTool(ctx, call, payload, params);
        const partial = ctx.NativeToolBindings?.get(call.toolName)?.kind === 'payloadChange';
        const applied =
            !ran.IsError && ran.PayloadChange
                ? this.ApplyAgentToolPayloadChange(ctx, payload, ran.PayloadChange, params, partial)
                : { payload, error: undefined };
        return {
            payload: applied.payload,
            content: applied.error ?? ran.Content,
            isError: ran.IsError || applied.error !== undefined,
        };
    }

    public AgentToolBreakerKey(ctx: AgentRunContext, call: AgentToolCallRequest): string | null {
        const binding = ctx.NativeToolBindings?.get(call.toolName);
        if (binding?.kind !== 'agentTool' || binding.definition.UsesCircuitBreaker === false) {
            return null;
        }
        if (ctx.AgentTypeInstance?.UsesActionCircuitBreaker === false) {
            return null;
        }
        return ctx.Hooks.NormalizeActionParams(call.arguments);
    }

    public RecordAgentToolOutcome(
        ctx: AgentRunContext,
        toolName: string,
        breakerKey: string | null,
        isError: boolean
    ): void {
        if (breakerKey === null) {
            return;
        }
        if (isError) {
            ctx.AgentToolBreaker.RecordFailure(toolName, breakerKey);
        } else {
            ctx.AgentToolBreaker.RecordSuccess(toolName);
        }
    }

    public async RunAgentTool<P>(
        ctx: AgentRunContext,
        call: AgentToolCallRequest,
        payload: P,
        params: ExecuteAgentParams
    ): Promise<AgentToolResult<P>> {
        const binding = ctx.NativeToolBindings?.get(call.toolName);
        if (binding?.kind === 'payloadChange') {
            return {
                Content: 'Payload change applied.',
                IsError: false,
                PayloadChange: call.arguments as AgentPayloadChangeRequest<P>,
            };
        }
        if (binding?.kind !== 'agentTool') {
            return { Content: `'${call.toolName}' is not one of this agent's tools.`, IsError: true };
        }
        try {
            const context: AgentToolContext<P> = {
                CurrentPayload: ctx.Hooks.CloneSubAgentPayload(payload),
                Params: params,
                ContextUser: params.contextUser,
            };
            return await (binding.definition as AgentToolDefinition<P>).Execute(call.arguments, context);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`Agent '${params.agent?.Name}': agent tool '${call.toolName}' threw: ${message}`);
            return { Content: `The tool failed: ${message}`, IsError: true };
        }
    }

    public ApplyAgentToolPayloadChange<P>(
        ctx: AgentRunContext,
        payload: P,
        change: AgentPayloadChangeRequest<P>,
        params: ExecuteAgentParams,
        partial = false
    ): { payload: P; error?: string } {
        const allowedPaths = params.agent.PayloadSelfWritePaths
            ? JSON.parse(params.agent.PayloadSelfWritePaths)
            : ctx.Hooks.GetDefaultPayloadSelfWritePaths();
        const changeResult = ctx.PayloadManager.applyAgentChangeRequest(payload, change, {
            validateChanges: true,
            logChanges: true,
            agentName: params.agent.Name,
            allowedPaths,
            verbose: params.verbose === true || IsVerboseLoggingEnabled(),
        });
        const blocked = changeResult.blockedOperations ?? [];
        if (blocked.length > 0) {
            const paths = [...new Set(blocked.map((b) => b.path))].join(', ');
            return partial
                ? { payload: changeResult.result, error: `Applied, except the paths this agent may not write: ${paths}.` }
                : { payload, error: `Not applied: this agent may not write ${paths}. Nothing was changed.` };
        }
        return { payload: changeResult.result };
    }

    public AppendAgentToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        step: BaseAgentNextStep
    ): void {
        const pending = ctx.PendingAgentToolResults;
        ctx.PendingAgentToolResults = undefined;
        if (!pending || pending.results.length === 0) {
            return;
        }
        const metadata: AgentChatMessageMetadata = { turnAdded: ctx.PromptTurnCount, messageType: 'action-result' };
        if (step.nativeTurn?.sendResultsNatively && ctx.LastNativeTurnAppended === step.nativeTurn) {
            ctx.Hooks.PushToolResultTurn(params, BuildToolResultTurn(pending.results, metadata) as AgentChatMessage);
            return;
        }
        const lines = pending.results.map((r) => `### ${r.toolName}${r.isError ? ' (failed)' : ''}\n${r.content}`);
        params.conversationMessages.push({
            role: 'user',
            content: `Tool results:\n\n${lines.join('\n\n')}`,
            metadata,
        } as AgentChatMessage);
    }
}
