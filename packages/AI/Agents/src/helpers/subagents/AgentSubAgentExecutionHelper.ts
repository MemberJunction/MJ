/**
 * @fileoverview Collaborator owned by {@link AgentSubAgentHelper} encapsulating sub-agent
 * conversation window preparation, `ExecuteSubAgent` invocation & preset resolution,
 * child sub-agent payload scoping/upstream merge, and `ExecuteChildSubAgentStep`.
 *
 * @module @memberjunction/ai-agents
 */

import {
    WithoutHostOnlyAgentRunDataKeys,
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type AgentPayloadChangeRequest,
    type AgentSubAgentRequest,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { IsVerboseLoggingEnabled, LogError, LogStatus } from '@memberjunction/core';
import type { MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import _ from 'lodash';
import { AgentRunner } from '../../AgentRunner';
import type { PayloadChangeResultSummary } from '../../PayloadManager';
import type { SubAgentConsultRecord } from '../../sub-agent-consult';
import type { AgentRunContext } from '../AgentRunContext';
import type { BaseAgentSubAgentHelper } from './BaseAgentSubAgentHelper';

/**
 * Collaborator handling sub-agent message preparation, runner invocation, and child sub-agent steps.
 */
export class AgentSubAgentExecutionHelper {
    public MakeToolTurnsSelfConsistent(window: ChatMessage[]): ChatMessage[] {
        const declared = new Set<string>();
        const resolved = new Set<string>();
        for (const message of window) {
            const typed = message as AgentChatMessage;
            if (typed.role === 'assistant') {
                for (const call of typed.toolCalls ?? []) {
                    if (call.id) declared.add(call.id);
                }
            }
            if (typed.role === 'tool' && Array.isArray(typed.content)) {
                for (const block of typed.content) {
                    if (block.type === 'tool_result' && block.toolCallId) resolved.add(block.toolCallId);
                }
            }
        }
        const kept: ChatMessage[] = [];
        for (const message of window) {
            const typed = message as AgentChatMessage;
            if (typed.role === 'tool') {
                const blocks = Array.isArray(typed.content) ? typed.content : [];
                const pairable = blocks.some(
                    (b) => b.type === 'tool_result' && b.toolCallId && declared.has(b.toolCallId)
                );
                if (!pairable) continue;
            }
            if (typed.role === 'assistant' && typed.toolCalls?.length) {
                const answered = typed.toolCalls.every((call) => call.id && resolved.has(call.id));
                if (!answered) {
                    const { toolCalls: _dropped, reasoning: _reasoning, ...rest } = typed;
                    kept.push({
                        ...rest,
                        content: typed.content || '[tool call omitted for context management]',
                    } as ChatMessage);
                    continue;
                }
            }
            kept.push(message);
        }
        return kept;
    }

    public PrepareSubAgentMessages(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended,
        contextMessage?: ChatMessage,
        consultQuestion?: string | null
    ): ChatMessage[] {
        const engine = AIEngine.Instance;
        let messages: ChatMessage[] = [];

        const chainIDs =
            typeof engine.GetAgentInheritanceChain === 'function'
                ? engine.GetAgentInheritanceChain(params.agent.ID).map((a) => a.ID).reverse()
                : [params.agent.ID];
        const relByAgentId = new Map<string, MJAIAgentRelationshipEntity>();
        for (const r of engine.AgentRelationships) {
            if (UUIDsEqual(r.SubAgentID, subAgent.ID)) {
                const key = r.AgentID.toLowerCase();
                if (!relByAgentId.has(key)) {
                    relByAgentId.set(key, r);
                }
            }
        }
        let relationship: MJAIAgentRelationshipEntity | undefined;
        for (const cid of chainIDs) {
            relationship = relByAgentId.get(cid.toLowerCase());
            if (relationship) {
                break;
            }
        }

        const messageMode = relationship?.MessageMode || subAgent.MessageMode || 'None';
        const maxMessages = relationship?.MaxMessages || subAgent.MaxMessages || null;

        const history = params.conversationMessages
            .filter((m) => (m as AgentChatMessage).metadata?.volatileState !== true)
            .map((m) => this.CloneMessageForSubAgent(m));

        switch (messageMode) {
            case 'None':
                break;

            case 'All':
                messages = [...history];
                break;

            case 'Latest':
                if (maxMessages && maxMessages > 0) {
                    messages = ctx.Hooks.MakeToolTurnsSelfConsistent(history.slice(-maxMessages));
                } else {
                    messages = [...history];
                }
                break;

            case 'Bookend':
                if (maxMessages && maxMessages > 2 && history.length > maxMessages) {
                    const firstTwo = history.slice(0, 2);
                    const remaining = history.slice(-(maxMessages - 2));
                    const omittedCount = history.length - maxMessages;

                    messages = ctx.Hooks.MakeToolTurnsSelfConsistent([
                        ...firstTwo,
                        {
                            role: 'system',
                            content: `[${omittedCount} messages omitted for context management]`,
                        },
                        ...remaining,
                    ]);
                } else {
                    messages = [...history];
                }
                break;

            default:
                break;
        }

        if (contextMessage) {
            messages.push(contextMessage);
        }

        if (consultQuestion) {
            messages.push({
                role: 'assistant',
                content: consultQuestion,
            });
        }

        if (subAgentRequest.message) {
            messages.push({
                role: 'user',
                content: subAgentRequest.message,
            });
        }

        return messages;
    }

    public CloneMessageForSubAgent(msg: ChatMessage): ChatMessage {
        const agentMsg = msg as AgentChatMessage;
        if (!agentMsg.metadata) {
            return { ...msg };
        }
        const meta = agentMsg.metadata;
        const clonedMeta: AgentChatMessageMetadata = {
            ...meta,
            ...(meta.artifactIds ? { artifactIds: [...meta.artifactIds] } : {}),
        };
        return {
            ...agentMsg,
            metadata: clonedMeta,
        };
    }

    public async ExecuteSubAgent<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgent: MJAIAgentEntityExtended,
        stepEntity: MJAIAgentRunStepEntityExtended,
        payload?: SR,
        contextMessage?: ChatMessage,
        stepCount: number = 0
    ): Promise<ExecuteAgentResult<SR>> {
        try {
            const preSubAgentBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (preSubAgentBudgetCheck.exceeded) {
                const reason = preSubAgentBudgetCheck.reason ?? 'Workflow budget exceeded before sub-agent execution';
                const diag = ctx.Hooks.EnsureTreeBudget(params).breachDiagnostic;
                ctx.Hooks.LogStatus(`⛔ Skipping sub-agent '${subAgentRequest.name}': ${reason}`, false, params);
                return {
                    success: false,
                    agentRun: { ErrorMessage: reason, FinalStep: 'Failed' } as MJAIAgentRunEntityExtended,
                    ...(diag ? { limitExceeded: diag } : {}),
                } as ExecuteAgentResult<SR>;
            }
            ctx.Hooks.LogStatus(`🤖 Executing sub-agent '${subAgentRequest.name}'`, true, params);

            const runner = new AgentRunner(params.provider || ctx.ActiveProvider);

            const requestedResumeRunId = subAgentRequest.resumeRunId?.trim() || undefined;
            let matchedConsult: SubAgentConsultRecord | undefined;
            if (requestedResumeRunId) {
                matchedConsult = Array.from(ctx.OpenSubAgentConsults.values()).find(
                    (c) => UUIDsEqual(c.childRunId, requestedResumeRunId) && UUIDsEqual(c.subAgentId, subAgent.ID)
                );
                if (matchedConsult) {
                    ctx.OpenSubAgentConsults.delete(matchedConsult.childRunId);
                } else {
                    ctx.Hooks.LogError(
                        `ExecuteSubAgent: ignoring unknown or mismatched resumeRunId '${requestedResumeRunId}' for sub-agent '${subAgent.Name}'`,
                        {
                            agent: params.agent,
                            category: 'SubAgentExecution',
                            metadata: {
                                subAgentName: subAgent.Name,
                                resumeRunId: requestedResumeRunId,
                            },
                        }
                    );
                }
            }
            const verifiedResumeRunId = matchedConsult?.childRunId;

            const subAgentMessages = ctx.Hooks.PrepareSubAgentMessages(
                params,
                subAgentRequest,
                subAgent,
                contextMessage,
                matchedConsult?.question
            );

            ctx.Hooks.LogStatus(`📨 Sub-agent message: "${subAgentRequest.message}"`, true, params);
            const templateParameters = this.SubAgentTemplateParameters(ctx, params, subAgentRequest);
            if (templateParameters) {
                ctx.Hooks.LogStatus(`📎 Template parameters: ${JSON.stringify(templateParameters)}`, true, params);
            }
            if (params.effortLevel !== undefined && params.effortLevel !== null) {
                ctx.Hooks.LogStatus(
                    `🎯 Propagating effort level ${params.effortLevel} to sub-agent '${subAgentRequest.name}'`,
                    true,
                    params
                );
            }

            const parentStepCountsToPass = [...ctx.ParentStepCounts, stepCount + 1];

            const subAgentActionChanges = ctx.Hooks.FilterActionChangesForSubAgent(params.actionChanges);
            const subAgentSubAgentChanges = ctx.Hooks.FilterSubAgentChangesForSubAgent(params.subAgentChanges);

            const subAgentContext = subAgentRequest.context !== undefined ? subAgentRequest.context : params.context;
            const resolvedConfig = this.ResolveSubAgentConfiguration(ctx, params, subAgentRequest, subAgent);
            if (resolvedConfig.presetId && stepEntity) {
                const parsedInput = stepEntity.InputData
                    ? (JSON.parse(stepEntity.InputData) as Record<string, unknown>)
                    : {};
                parsedInput.presetName = resolvedConfig.presetName;
                parsedInput.presetId = resolvedConfig.presetId;
                const updatedInputJson = JSON.stringify(parsedInput);
                stepEntity.InputData = updatedInputJson;
                ctx.Hooks.QueueStepSave(stepEntity, (s) => {
                    s.InputData = updatedInputJson;
                });
            }

            const result = await runner.RunAgent<SC, SR>({
                agent: subAgent,
                conversationMessages: subAgentMessages,
                contextUser: params.contextUser,
                cancellationToken: params.cancellationToken,
                onProgress: params.onProgress,
                onStreaming: params.onStreaming,
                parentAgentHierarchy: ctx.AgentHierarchy,
                parentDepth: ctx.Depth,
                parentStepCounts: parentStepCountsToPass,
                parentRun: ctx.AgentRun ?? undefined,
                parentActivatedSkillIDs: ctx.Hooks.ActiveSkillIDsForRun(params),
                policyCeilingAgentIDs: ctx.Hooks.CollectPolicyAgentChain(params),
                payload: verifiedResumeRunId ? undefined : payload,
                ...(verifiedResumeRunId ? { lastRunId: verifiedResumeRunId, autoPopulateLastRunPayload: true } : {}),
                configurationId: resolvedConfig.configurationId,
                effortLevel: params.effortLevel,
                apiKeys: params.apiKeys,
                CredentialScope: params.CredentialScope,
                Audience: params.Audience,
                inputArtifacts: ctx.ArtifactToolManager.ExportInputArtifacts(params.inputArtifacts) ?? [],
                data: {
                    ...params.data,
                    ...templateParameters,
                },
                TrustReservedRunData: params.TrustReservedRunData,
                context: subAgentContext,
                verbose: params.verbose,
                treeBudget: ctx.Hooks.EnsureTreeBudget(params),
                workflowMaxCostUsd: params.workflowMaxCostUsd,
                workflowMaxDurationMs: params.workflowMaxDurationMs,
                workflowStartedAtMs: params.workflowStartedAtMs,
                actionChanges: subAgentActionChanges,
                subAgentChanges: subAgentSubAgentChanges,
                boundActionParams: params.boundActionParams,
                PrimaryScopeEntityName: params.PrimaryScopeEntityName,
                PrimaryScopeRecordID: params.PrimaryScopeRecordID,
                companyId: params.companyId,
                SecondaryScopes: params.SecondaryScopes,
                SearchScopeIDs: params.SearchScopeIDs,
                ...subAgentHelper.SubAgentTaint(ctx, params),
                conversationDetailId: params.conversationDetailId,
                onAgentRunCreated: async (agentRunId: string) => {
                    stepEntity.TargetLogID = agentRunId;
                    ctx.Hooks.QueueStepSave(stepEntity, (s) => {
                        s.TargetLogID = agentRunId;
                    });
                },
            });

            ctx.Hooks.AbsorbSubAgentTaint(subAgentRequest.name, result, stepEntity?.StepNumber ?? stepCount + 1);
            if (result.touchedArtifacts?.length) {
                ctx.ArtifactToolManager.AbsorbTouchedArtifacts(result.touchedArtifacts);
            }

            if (result.limitExceeded) {
                const sharedBudget = ctx.Hooks.EnsureTreeBudget(params);
                if (!sharedBudget.breachDiagnostic) {
                    sharedBudget.breachDiagnostic = result.limitExceeded;
                }
                if (!sharedBudget.breachedReason) {
                    sharedBudget.breachedReason = result.limitExceeded.Reason;
                }
            }

            if (result.success) {
                ctx.Hooks.LogStatus(`✅ Sub-agent '${subAgentRequest.name}' completed successfully`, true, params);
            } else {
                ctx.Hooks.LogStatus(
                    `Sub-agent '${subAgentRequest.name}' failed: ${result.agentRun?.ErrorMessage || 'Unknown error'}`
                );
            }

            return result;
        } catch (error) {
            ctx.Hooks.LogError(error, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    message: subAgentRequest.message,
                },
            });
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Error executing sub-agent: ${message}`);
        }
    }

    public ResolveSubAgentConfiguration(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest,
        subAgent: MJAIAgentEntityExtended
    ): { configurationId: string | undefined; presetName?: string; presetId?: string } {
        if (subAgentRequest.presetName != null && subAgentRequest.presetName.trim() !== '') {
            const preset = AIEngine.Instance.FindActiveAgentConfigurationPreset(subAgent.ID, subAgentRequest.presetName);
            if (preset) {
                return {
                    configurationId: preset.AIConfigurationID ?? undefined,
                    presetName: preset.Name,
                    presetId: preset.ID,
                };
            }
            ctx.Hooks.LogStatus(
                `⚠️ Sub-agent '${subAgent.Name}' has no active preset matching '${subAgentRequest.presetName}'; falling through.`,
                false,
                params
            );
        }

        const isDirectChild = subAgent.ParentID != null && UUIDsEqual(subAgent.ParentID, params.agent.ID);
        if (!isDirectChild) {
            const relationship = AIEngine.Instance.AgentRelationships.find(
                (r) =>
                    UUIDsEqual(r.AgentID, params.agent.ID) &&
                    UUIDsEqual(r.SubAgentID, subAgent.ID) &&
                    r.Status === 'Active'
            );
            if (relationship?.ConfigurationPresetID) {
                const preset = AIEngine.Instance.AgentConfigurations.find((p) =>
                    UUIDsEqual(p.ID, relationship.ConfigurationPresetID)
                );
                if (preset && preset.Status === 'Active' && UUIDsEqual(preset.AgentID, subAgent.ID)) {
                    return {
                        configurationId: preset.AIConfigurationID ?? undefined,
                        presetName: preset.Name,
                        presetId: preset.ID,
                    };
                }
                ctx.Hooks.LogStatus(
                    `⚠️ Sub-agent relationship for '${subAgent.Name}' references preset '${relationship.ConfigurationPresetID}' which is missing, inactive, or belongs to another agent; inheriting parent configuration.`,
                    false,
                    params
                );
            }
        }

        return { configurationId: params.configurationId };
    }

    public SubAgentTemplateParameters(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        subAgentRequest: AgentSubAgentRequest
    ): Record<string, unknown> | undefined {
        if (!subAgentRequest.templateParameters) {
            return undefined;
        }
        const { Data, StrippedKeys } = WithoutHostOnlyAgentRunDataKeys(subAgentRequest.templateParameters);
        if (StrippedKeys.length > 0) {
            ctx.Hooks.LogStatus(
                `🔒 Ignored host-only key(s) ${StrippedKeys.join(', ')} in the template parameters for sub-agent '${subAgentRequest.name}': ` +
                    `a sub-agent inherits its parent run's scope, agent-type parameters, conversation and browser context; the model cannot set them.`,
                false,
                params
            );
        }
        return Data;
    }

    public FormatSubAgentResultAsMarkdown(
        ctx: AgentRunContext,
        subAgentName: string,
        result: ExecuteAgentResult
    ): string {
        return ctx.StepDispatcher.FormatSubAgentResultAsMarkdown(subAgentName, result);
    }

    public ComputeUpstreamDownstreamPaths<SC = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        subAgentEntity: MJAIAgentEntityExtended,
        subAgentRequest: AgentSubAgentRequest<SC>
    ): { downstreamPaths: string[]; upstreamPaths: string[] } {
        let downstreamPaths: string[] = ['*'];
        let upstreamPaths: string[] = ['*'];

        try {
            if (subAgentEntity.PayloadDownstreamPaths) {
                downstreamPaths = JSON.parse(subAgentEntity.PayloadDownstreamPaths);
            }
            if (subAgentEntity.PayloadUpstreamPaths) {
                upstreamPaths = JSON.parse(subAgentEntity.PayloadUpstreamPaths);
            }
        } catch (parseError) {
            const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
            ctx.Hooks.LogError(`Failed to parse payload paths for sub-agent ${subAgentRequest.name}: ${errMsg}`, {
                category: 'SubAgentExecution',
                metadata: {
                    agentName: params.agent.Name,
                    subAgentName: subAgentRequest.name,
                    subAgentId: subAgentEntity.ID,
                    downstreamPaths: subAgentEntity.PayloadDownstreamPaths,
                    upstreamPaths: subAgentEntity.PayloadUpstreamPaths,
                },
            });
        }

        return { downstreamPaths, upstreamPaths };
    }

    public async ComputeChildSubAgentPayload<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        subAgentEntity: MJAIAgentEntityExtended,
        downstreamPaths: string[],
        subAgentRequest: AgentSubAgentRequest<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>
    ): Promise<unknown> {
        const downstreamPayload = ctx.PayloadManager.extractDownstreamPayload(
            subAgentRequest.name,
            previousDecision?.newPayload,
            downstreamPaths
        );

        let scopedPayload: unknown = downstreamPayload;
        if (subAgentEntity.PayloadScope) {
            scopedPayload = ctx.PayloadManager.applyPayloadScope(
                downstreamPayload,
                subAgentEntity.PayloadScope
            ) as Partial<SR>;
            if (scopedPayload === null) {
                const errorMessage = `Critical: Failed to extract payload scope '${subAgentEntity.PayloadScope}' for sub-agent '${subAgentRequest.name}'. The specified path does not exist in the payload.`;
                ctx.Hooks.LogError(errorMessage, {
                    category: 'SubAgentExecution',
                    metadata: {
                        agentName: params.agent.Name,
                        subAgentName: subAgentRequest.name,
                        payloadScope: subAgentEntity.PayloadScope,
                        availableKeys: Object.keys((downstreamPayload as Record<string, unknown>) || {}),
                    },
                });
                throw new Error(errorMessage);
            }
        }
        return scopedPayload;
    }

    public async ExecuteChildSubAgentStep<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        previousDecision?: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount: number = 0,
        resolvedSubAgentEntity?: MJAIAgentEntityExtended
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision?.subAgent as AgentSubAgentRequest<SC>;
        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before sub-agent execution');
        }

        ctx.MessagingHelper.SafeOnProgress(ctx, params, {
            step: 'subagent_execution',
            message: ctx.Hooks.FormatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                stepCount: stepCount + 1,
                hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts),
            },
        });

        if (!(previousDecision?.nativeTurn?.sendResultsNatively && subAgentRequest.toolCallId)) {
            params.conversationMessages.push({
                role: 'user',
                content: `[You delegated this task to the "${subAgentRequest.name}" agent. Reason: ${subAgentRequest.message}]`,
            });
        }

        const inputData = {
            agentName: params.agent.Name,
            subAgentName: subAgentRequest.name,
            message: subAgentRequest.message,
            terminateAfter: subAgentRequest.terminateAfter,
            ...(subAgentRequest.resumeRunId ? { resumeRunId: subAgentRequest.resumeRunId } : {}),
            ...(subAgentRequest.presetName ? { presetName: subAgentRequest.presetName } : {}),
            parentAgentHierarchy: ctx.AgentHierarchy,
        };

        const subAgentEntity =
            resolvedSubAgentEntity ??
            AIEngine.Instance.Agents.find(
                (a) =>
                    a.Name === subAgentRequest.name &&
                    UUIDsEqual(a.ParentID, params.agent.ID) &&
                    a.Status === 'Active'
            ) ??
            ctx.Hooks.GetEffectiveSubAgentsForValidation(params.agent.ID).find(
                (a) => a.Name.trim().toLowerCase() === subAgentRequest.name?.trim().toLowerCase()
            );
        if (!subAgentEntity) {
            throw new Error(`Sub-agent '${subAgentRequest.name}' not found`);
        }
        if (subAgentEntity.Status !== 'Active') {
            throw new Error(`Sub-agent '${subAgentRequest.name}' is not Active (Status='${subAgentEntity.Status}')`);
        }
        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Sub-Agent: ${subAgentRequest.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            inputData,
            payloadAtStart: previousDecision?.newPayload,
            parentId: parentStepId,
            skills: ctx.Hooks.GetSkillAttributionForSubAgent(subAgentEntity, params.agent),
        });

        ctx.Hooks.IncrementExecutionCount(subAgentEntity.ID);

        try {
            const { downstreamPaths, upstreamPaths } = this.ComputeUpstreamDownstreamPaths(
                ctx,
                params,
                subAgentEntity,
                subAgentRequest
            );
            let scopedPayload: unknown = null;
            if (!subAgentPayloadOverride) {
                scopedPayload = await this.ComputeChildSubAgentPayload<SC, SR>(
                    ctx,
                    params,
                    subAgentEntity,
                    downstreamPaths,
                    subAgentRequest,
                    previousDecision
                );
            } else {
                scopedPayload = subAgentPayloadOverride;
            }

            const subAgentResult = await ctx.Hooks.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                scopedPayload as SR,
                undefined,
                stepCount
            );

            let mergedPayload = previousDecision?.newPayload as SR;
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;
            if (subAgentResult.success) {
                let resultPayloadForMerge = subAgentResult.payload;
                if (subAgentEntity.PayloadScope) {
                    resultPayloadForMerge = ctx.PayloadManager.reversePayloadScope(
                        subAgentResult.payload,
                        subAgentEntity.PayloadScope
                    ) as SR;
                }

                const mergeTargetPayload =
                    previousDecision?.artifactDirective?.behavior === 'create-new' ||
                    (subAgentRequest.terminateAfter && subAgentResult.artifactDirective?.behavior === 'create-new')
                        ? ({} as SR)
                        : (previousDecision?.newPayload as SR);

                const mergeResult = ctx.PayloadManager.mergeUpstreamPayload(
                    subAgentRequest.name,
                    mergeTargetPayload,
                    resultPayloadForMerge,
                    upstreamPaths,
                    params.verbose === true || IsVerboseLoggingEnabled()
                );

                mergedPayload = mergeResult.result;

                const newElements: Record<string, unknown> = {};
                const updateElements: Record<string, unknown> = {};
                const removeElements: Record<string, string> = {};
                const prevPayloadObj = (previousDecision?.newPayload || {}) as Record<string, unknown>;
                const mergedPayloadObj = (mergedPayload || {}) as Record<string, unknown>;
                const originalKeys = Object.keys(prevPayloadObj);
                const mergedKeys = Object.keys(mergedPayloadObj);

                for (const key of mergedKeys) {
                    if (!(key in prevPayloadObj)) {
                        newElements[key] = mergedPayloadObj[key];
                    } else if (!_.isEqual(prevPayloadObj[key], mergedPayloadObj[key])) {
                        updateElements[key] = mergedPayloadObj[key];
                    }
                }

                for (const key of originalKeys) {
                    if (!(key in mergedPayloadObj)) {
                        removeElements[key] = '_DELETE_';
                    }
                }

                if (
                    Object.keys(newElements).length > 0 ||
                    Object.keys(updateElements).length > 0 ||
                    Object.keys(removeElements).length > 0
                ) {
                    const mergeChangeRequest: AgentPayloadChangeRequest<SR> = {
                        newElements: newElements as Partial<SR>,
                        updateElements: updateElements as Partial<SR>,
                        removeElements: removeElements as Partial<SR>,
                    };
                    const mergeAnalysis = ctx.PayloadManager.applyAgentChangeRequest<SR>(
                        previousDecision?.previousPayload as SR,
                        mergeChangeRequest,
                        {
                            validateChanges: false,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (upstream merge)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled(),
                        }
                    );

                    currentStepPayloadChangeResult = ctx.PayloadHelper.BuildPayloadChangeResultSummary(
                        ctx,
                        mergeAnalysis
                    );

                    if (mergeResult.blockedOperations && mergeResult.blockedOperations.length > 0) {
                        if (!currentStepPayloadChangeResult.payloadValidation) {
                            currentStepPayloadChangeResult.payloadValidation = {};
                        }
                        currentStepPayloadChangeResult.payloadValidation.upstreamMergeViolations = {
                            subAgentName: subAgentRequest.name,
                            attemptedOperations: mergeResult.blockedOperations,
                            authorizedPaths: upstreamPaths,
                            timestamp: new Date().toISOString(),
                        };
                    }

                    if (mergeAnalysis.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Sub-agent merge warnings: ${mergeAnalysis.warnings.join('; ')}`);
                    }
                }
            } else {
                const msg = `Sub-agent '${subAgentRequest.name}' execution failed: ${subAgentResult.agentRun?.ErrorMessage || 'Unknown error'}`;
                LogError(msg);
                stepEntity.Success = false;
                stepEntity.ErrorMessage = msg;
            }

            if (subAgentResult.agentRun?.ID) {
                stepEntity.TargetLogID = subAgentResult.agentRun.ID;
                stepEntity.SubAgentRun = subAgentResult.agentRun;
            }

            if (stepEntity) {
                const canReuseStartPayload =
                    mergedPayload === previousDecision?.newPayload &&
                    !currentStepPayloadChangeResult &&
                    ctx.Hooks.HasDefaultPayloadSerializers();
                stepEntity.PayloadAtEnd =
                    (canReuseStartPayload ? ctx.MessagingHelper.ResolveStepPayloadAtStart(ctx, stepEntity) : null) ??
                    ctx.Hooks.SerializePayloadAtEnd(mergedPayload);
            }

            if (params.cancellationToken?.aborted) {
                await ctx.Hooks.FinalizeStepEntity(stepEntity, false, 'Cancelled during sub-agent execution');
                throw new Error('Cancelled during sub-agent execution');
            }

            ctx.SubAgentRuns.push(subAgentResult);

            if (subAgentResult.mediaOutputs?.length) {
                ctx.MediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter((m) => m.refId).length;
                if (refCount > 0) {
                    ctx.Hooks.LogStatus(
                        `📦 Collected ${refCount} media reference(s) from sub-agent '${subAgentRequest.name}'`,
                        true
                    );
                }
            }

            if (subAgentResult.fileOutputs?.length) {
                ctx.FileOutputs.push(...subAgentResult.fileOutputs);
                ctx.Hooks.LogStatus(
                    `📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from sub-agent '${subAgentRequest.name}'`,
                    true
                );
            }

            const subAgentParkedOnWorkflow = subAgentResult.agentRun?.Status === 'Paused';
            const shouldTerminate = Boolean(subAgentRequest.terminateAfter) || subAgentParkedOnWorkflow;

            const outputData: Record<string, unknown> = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                },
                shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult,
                }),
            };

            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                return await subAgentHelper.HandleSingleSubAgentChatStep(
                    ctx,
                    params,
                    previousDecision as BaseAgentNextStep<SR, SC>,
                    subAgentRequest,
                    subAgentEntity,
                    undefined,
                    subAgentResult,
                    mergedPayload,
                    stepEntity,
                    outputData
                );
            }

            await ctx.Hooks.FinalizeStepEntity(
                stepEntity,
                subAgentResult.success,
                subAgentResult.agentRun?.ErrorMessage ?? undefined,
                outputData
            );

            const childPayloadArtifactTypeID = ctx.Hooks.ResolveChildPayloadArtifactTypeID(
                subAgentResult,
                subAgentEntity
            );

            if (subAgentParkedOnWorkflow) {
                ctx.AwaitingWorkflowTaskID = ctx.Hooks.ExtractSubAgentWorkflowTaskID(subAgentResult.agentRun);
                if (ctx.AgentRun) {
                    ctx.AgentRun.FinalPayloadObject = mergedPayload;
                }
                return {
                    ...subAgentResult,
                    step: 'Success',
                    terminate: true,
                    message: subAgentResult.agentRun?.Message || undefined,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload,
                    responseForm: subAgentResult.responseForm,
                    actionableCommands: subAgentResult.actionableCommands,
                    automaticCommands: subAgentResult.automaticCommands,
                    artifactDirective: previousDecision?.artifactDirective ?? subAgentResult.artifactDirective,
                    payloadArtifactTypeID: previousDecision?.payloadArtifactTypeID ?? childPayloadArtifactTypeID,
                    handoff: undefined,
                };
            }

            const resultMessage = ctx.Hooks.FormatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);
            subAgentHelper.PushSubAgentConversationMessage(
                ctx,
                params,
                previousDecision as BaseAgentNextStep<SR, SC>,
                subAgentRequest,
                subAgentEntity,
                resultMessage,
                'sub-agent-result',
                !subAgentResult.success
            );

            if (ctx.AgentRun) {
                ctx.AgentRun.FinalPayloadObject = mergedPayload;
            }

            if (previousDecision?.taskGraph?.folded === true) {
                if (subAgentResult.artifactDirective) {
                    ctx.LastSubAgentArtifactDirective = subAgentResult.artifactDirective;
                }
                if (childPayloadArtifactTypeID) {
                    ctx.LastSubAgentPayloadArtifactTypeID = childPayloadArtifactTypeID;
                }
            } else if (!previousDecision?.artifactDirective && !shouldTerminate) {
                subAgentHelper.WarnIfDiscardingSubAgentArtifactDirective(ctx, subAgentResult, subAgentRequest.name);
            }
            const postChildBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
            if (postChildBudgetCheck.exceeded || subAgentResult.limitExceeded) {
                const limitReason =
                    subAgentResult.limitExceeded?.Reason ??
                    postChildBudgetCheck.reason ??
                    'Workflow budget exceeded during sub-agent execution';
                return {
                    ...subAgentResult,
                    step: 'Failed',
                    terminate: true,
                    message: limitReason,
                    errorMessage: limitReason,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload,
                    artifactDirective: previousDecision?.artifactDirective,
                    payloadArtifactTypeID: previousDecision?.payloadArtifactTypeID,
                    handoff: undefined,
                };
            }
            return {
                ...subAgentResult,
                step: subAgentResult.success ? 'Success' : 'Failed',
                message: shouldTerminate
                    ? (subAgentResult.agentRun?.Message ?? previousDecision?.message)
                    : previousDecision?.message,
                errorMessage: subAgentResult.success
                    ? undefined
                    : subAgentResult.agentRun?.ErrorMessage || 'Sub-agent failed with no error message',
                retryReason: subAgentResult.success
                    ? `Reviewing results from ${subAgentRequest.name}`
                    : `Handling error from ${subAgentRequest.name}`,
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload,
                artifactDirective:
                    previousDecision?.artifactDirective ??
                    (shouldTerminate ? subAgentResult.artifactDirective : undefined),
                payloadArtifactTypeID:
                    previousDecision?.payloadArtifactTypeID ?? (shouldTerminate ? childPayloadArtifactTypeID : undefined),
                handoff: undefined,
            };
        } catch (error) {
            const existingEnd = ctx.MessagingHelper.ResolveStepPayloadAtEnd(ctx, stepEntity);
            const payload = existingEnd ? JSON.parse(existingEnd) : (previousDecision?.newPayload || params.payload);
            const errMsg = error instanceof Error ? error.message : String(error);

            stepEntity.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(payload);
            stepEntity.PayloadAtEndSourceStepID = null;
            await ctx.Hooks.FinalizeStepEntity(stepEntity, false, errMsg);

            return {
                errorMessage: `Sub-agent execution failed: ${errMsg}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload,
            };
        }
    }

    public ExtractSubAgentWorkflowTaskID(subAgentRun: MJAIAgentRunEntityExtended | undefined): string {
        if (subAgentRun?.Steps) {
            for (let i = subAgentRun.Steps.length - 1; i >= 0; i--) {
                const rawOutput = subAgentRun.Steps[i]?.OutputData;
                if (!rawOutput) continue;
                try {
                    const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
                    const candidate = parsed.parentTaskID ?? parsed.parentTaskId;
                    if (typeof candidate === 'string' && candidate.length > 0) {
                        return candidate;
                    }
                } catch {
                    // Ignore non-JSON step output
                }
            }
        }
        return subAgentRun?.ID || 'sub-agent-workflow';
    }
}
