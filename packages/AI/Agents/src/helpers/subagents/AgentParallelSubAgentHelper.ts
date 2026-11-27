/**
 * @fileoverview Collaborator owned by {@link AgentSubAgentHelper} encapsulating sub-agent
 * routing (`ProcessSubAgentStep`), name resolution (`ResolveSubAgentByName` with O(n) UUID
 * indexes), payload cloning, and bounded parallel sub-agent fan-out & deterministic merge.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessage,
    AgentPayloadChangeRequest,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { IsVerboseLoggingEnabled, LogError } from '@memberjunction/core';
import type { MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { GroupByUUID, IndexByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { SanitizeToolName } from '../../native-tools/action-tool-builder';
import { SUB_AGENT_TOOL_PREFIX } from '../../native-tools/control-tools';
import { BuildToolResultTurn } from '../../native-tools/tool-result-turns';
import {
    FormatResponseFormSummary,
    GetMaxSubAgentConsultRounds,
    type SubAgentConsultRecord,
} from '../../sub-agent-consult';
import type { AgentRunContext } from '../AgentRunContext';
import { SafeResolveEffectiveAgentProperties } from '../AgentHelperResolver';
import {
    PARALLEL_SUBAGENT_CONCURRENCY_LIMIT,
    type ParallelSubAgentDispatch,
    type ParallelSubAgentExecution,
} from '../base-agent-types';
import type { BaseAgentSubAgentHelper } from './BaseAgentSubAgentHelper';

/**
 * Collaborator handling sub-agent routing, resolution, and bounded parallel fan-out.
 */
export class AgentParallelSubAgentHelper {
    public async ProcessSubAgentStep<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        if (previousDecision.subAgents && previousDecision.subAgents.length > 0) {
            return await this.ExecuteParallelSubAgents<SC, SR>(
                ctx,
                subAgentHelper,
                params,
                previousDecision.subAgents,
                previousDecision,
                parentStepId,
                subAgentPayloadOverride,
                stepCount
            );
        }

        const requested = ctx.Hooks.GetRequestedSubAgents<SR, SC>(previousDecision);
        const subAgentRequest = (requested[0] ?? previousDecision.subAgent) as AgentSubAgentRequest<SC>;
        const name = subAgentRequest?.name;
        if (!name) {
            return {
                step: 'Failed',
                terminate: false,
                errorMessage: 'Sub-agent name is required',
                previousPayload: previousDecision.newPayload,
                newPayload: previousDecision.newPayload,
            };
        }

        const resolved = ctx.Hooks.ResolveSubAgentByName(params, name, previousDecision.taskGraph?.folded === true);
        if (resolved) {
            const canonicalName = resolved.subAgentEntity.Name || name;
            const canonicalDecision: BaseAgentNextStep<SR, SC> =
                canonicalName !== name
                    ? {
                          ...previousDecision,
                          ...(previousDecision.subAgent
                              ? { subAgent: { ...previousDecision.subAgent, name: canonicalName } }
                              : {}),
                          ...(previousDecision.subAgents
                              ? { subAgents: [{ ...subAgentRequest, name: canonicalName }] }
                              : {}),
                      }
                    : previousDecision;
            if (resolved.relationship) {
                return await ctx.Hooks.ExecuteRelatedSubAgentStep<SC, SR>(
                    params,
                    canonicalDecision,
                    resolved.subAgentEntity,
                    resolved.relationship,
                    parentStepId,
                    subAgentPayloadOverride as SR | undefined,
                    stepCount
                );
            }
            return await ctx.Hooks.ExecuteChildSubAgentStep<SC, SR>(
                params,
                canonicalDecision,
                parentStepId,
                subAgentPayloadOverride,
                stepCount,
                resolved.subAgentEntity
            );
        }

        const availableNames =
            ctx.Hooks.GetEffectiveSubAgentsForValidation(params.agent.ID)
                .map((a) => a.Name)
                .join(', ') || '(none)';
        ctx.Hooks.LogError(
            `Sub-agent '${name}' not found or not active for agent '${params.agent.Name}'. Available sub-agents: ${availableNames}`,
            {
                agent: params.agent,
                category: 'SubAgentExecution',
            }
        );
        ctx.GeneralValidationRetryCount++;
        return {
            step: 'Retry',
            terminate: false,
            errorMessage:
                `Sub-agent '${name}' not found or not active. Available sub-agents: ${availableNames}. ` +
                `Pick one of the available sub-agents, or complete the task another way — do not request '${name}' again.`,
            previousPayload: previousDecision.newPayload,
            newPayload: previousDecision.newPayload,
        };
    }

    public ResolveSubAgentByName(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams,
        name: string,
        allowAnyActiveAgent: boolean = false
    ): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined {
        const normalized = name.trim().toLowerCase();
        const chainIDs =
            typeof AIEngine.Instance.GetAgentInheritanceChain === 'function'
                ? AIEngine.Instance.GetAgentInheritanceChain(params.agent.ID).map((a) => a.ID).reverse()
                : [params.agent.ID];
        const chainIdSet = new UUIDSet(chainIDs);
        const activeAgents = AIEngine.Instance.Agents.filter((a) => a.Status === 'Active');
        const activeChildAgents = activeAgents.filter((a) => a.ParentID != null && chainIdSet.Has(a.ParentID));
        const childAgent =
            activeChildAgents.find((a) => a.Name.trim().toLowerCase() === normalized) ??
            ctx.Hooks.MatchNamedBySanitizedToolName(name, activeChildAgents, true).match;
        if (childAgent) {
            return { subAgentEntity: childAgent };
        }

        // Walk leaf-first across BaseAgentID inheritance chain using O(1) UUID indexes
        const activeRelationshipsByAgent = GroupByUUID(
            AIEngine.Instance.AgentRelationships.filter((ar) => ar.Status === 'Active'),
            (ar) => ar.AgentID
        );
        const activeAgentsById = IndexByUUID(activeAgents, (a) => a.ID);

        const activeRelationships: MJAIAgentRelationshipEntity[] = [];
        const seenSubAgentIds = new Set<string>();
        for (const cid of chainIDs) {
            const rels = activeRelationshipsByAgent.Get(cid) ?? [];
            for (const ar of rels) {
                const key = ar.SubAgentID.toLowerCase();
                if (!seenSubAgentIds.has(key)) {
                    seenSubAgentIds.add(key);
                    activeRelationships.push(ar);
                }
            }
        }
        const relatedPairs: Array<{ agent: MJAIAgentEntityExtended; rel: MJAIAgentRelationshipEntity }> = [];
        for (const rel of activeRelationships) {
            const relatedAgent = activeAgentsById.Get(rel.SubAgentID);
            if (relatedAgent) {
                if (relatedAgent.Name.trim().toLowerCase() === normalized) {
                    return { subAgentEntity: relatedAgent, relationship: rel };
                }
                relatedPairs.push({ agent: relatedAgent, rel });
            }
        }
        const sanitizedRelated = ctx.Hooks.MatchNamedBySanitizedToolName(
            name,
            relatedPairs.map((p) => p.agent),
            true
        ).match;
        if (sanitizedRelated) {
            const matchedPair = relatedPairs.find((p) => UUIDsEqual(p.agent.ID, sanitizedRelated.ID));
            if (matchedPair) {
                return { subAgentEntity: matchedPair.agent, relationship: matchedPair.rel };
            }
        }

        const flowStepPool = subAgentHelper.GetFlowStepSubAgents(ctx, params.agent.ID);
        const flowStepAgent =
            flowStepPool.find((a) => a.Name.trim().toLowerCase() === normalized) ??
            ctx.Hooks.MatchNamedBySanitizedToolName(name, flowStepPool, true).match;
        if (flowStepAgent) {
            return { subAgentEntity: flowStepAgent };
        }

        const effectivePool = ctx.Hooks.GetEffectiveSubAgentsForValidation(params.agent.ID).filter(
            (a) => a.Status === 'Active'
        );
        const effectiveAgent =
            effectivePool.find((a) => a.Name.trim().toLowerCase() === normalized) ??
            ctx.Hooks.MatchNamedBySanitizedToolName(name, effectivePool, true).match;
        if (effectiveAgent) {
            return { subAgentEntity: effectiveAgent };
        }

        if (allowAnyActiveAgent) {
            const anyActiveAgent =
                activeAgents.find((a) => a.Name.trim().toLowerCase() === normalized) ??
                ctx.Hooks.MatchNamedBySanitizedToolName(name, activeAgents, true).match;
            if (anyActiveAgent) {
                return { subAgentEntity: anyActiveAgent };
            }
        }
        return undefined;
    }

    public CloneSubAgentPayload<T>(ctx: AgentRunContext, payload: T): T {
        return ctx.StepDispatcher.CloneSubAgentPayload(payload);
    }

    public PrepareParallelSubAgentDispatch<SC>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams<SC>,
        request: AgentSubAgentRequest<SC>,
        stepCount: number,
        nativeResults: boolean = false
    ): ParallelSubAgentDispatch | undefined {
        const resolved = ctx.Hooks.ResolveSubAgentByName(params, request.name);
        if (!resolved) {
            ctx.Hooks.LogError(
                `Sub-agent '${request.name}' not found or not active for agent '${params.agent.Name}'`,
                {
                    agent: params.agent,
                    category: 'SubAgentExecution',
                }
            );
            return undefined;
        }
        const { subAgentEntity, relationship } = resolved;
        const canonicalRequest: AgentSubAgentRequest<SC> =
            subAgentEntity.Name && request.name !== subAgentEntity.Name
                ? { ...request, name: subAgentEntity.Name }
                : request;

        ctx.MessagingHelper.SafeOnProgress(ctx, params, {
            step: 'subagent_execution',
            message: ctx.Hooks.FormatHierarchicalMessage(`Delegating to parallel sub-agent ${canonicalRequest.name}`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: canonicalRequest.name,
                reason: canonicalRequest.message,
                relationshipType: relationship ? 'related' : 'child',
                stepCount: stepCount + 1,
                hierarchicalStep: ctx.Hooks.BuildHierarchicalStep(stepCount + 1, ctx.ParentStepCounts),
            },
        });

        if (!(nativeResults && canonicalRequest.toolCallId)) {
            params.conversationMessages.push({
                role: 'user',
                content: `[You delegated this task to the parallel sub-agent "${canonicalRequest.name}". Reason: ${canonicalRequest.message}]`,
            });
        }

        return { request: canonicalRequest as AgentSubAgentRequest<unknown>, subAgentEntity, relationship };
    }

    public async BuildSubAgentInputs<SC, SR>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        dispatch: ParallelSubAgentDispatch,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentPayloadOverride: unknown
    ): Promise<{ initialPayload: unknown; contextMessage: ChatMessage | null; upstreamPaths: string[] }> {
        const { subAgentEntity, relationship, request } = dispatch;
        const parentPayload = previousDecision.newPayload;

        if (relationship) {
            let initialPayload: unknown = subAgentPayloadOverride;
            if (!initialPayload && relationship.SubAgentInputMapping) {
                initialPayload = subAgentHelper.ApplySubAgentInputMapping(
                    ctx,
                    parentPayload as Record<string, unknown>,
                    relationship.SubAgentInputMapping
                );
            }
            const contextPaths = this.ParseSubAgentContextPaths(relationship, request.name);
            const contextMessage = subAgentHelper.PrepareRelatedSubAgentContextMessage(
                ctx,
                parentPayload as Record<string, unknown>,
                contextPaths,
                params
            );
            return { initialPayload, contextMessage, upstreamPaths: [] };
        }

        const { downstreamPaths, upstreamPaths } = subAgentHelper.ComputeUpstreamDownstreamPaths(
            ctx,
            params,
            subAgentEntity,
            request
        );
        let initialPayload: unknown = subAgentPayloadOverride;
        if (!initialPayload) {
            initialPayload = await subAgentHelper.ComputeChildSubAgentPayload(
                ctx,
                params,
                subAgentEntity,
                downstreamPaths,
                request as AgentSubAgentRequest<SC>,
                previousDecision
            );
        }
        return {
            initialPayload: ctx.Hooks.CloneSubAgentPayload(initialPayload),
            contextMessage: null,
            upstreamPaths,
        };
    }

    public ParseSubAgentContextPaths(relationship: MJAIAgentRelationshipEntity, subAgentName: string): string[] {
        if (!relationship.SubAgentContextPaths) return [];
        try {
            return JSON.parse(relationship.SubAgentContextPaths);
        } catch (parseError) {
            LogError(
                `Failed to parse SubAgentContextPaths for sub-agent ${subAgentName}: ${(parseError as Error).message}`
            );
            return [];
        }
    }

    public MergeParallelSubAgentResult<SR>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams,
        execution: ParallelSubAgentExecution<SR>,
        runningPayload: SR
    ): { mergedPayload: SR; stepPayloadAtEnd: unknown } {
        if (!execution.result.success) {
            return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
        }

        if (execution.relationship) {
            if (!execution.relationship.SubAgentOutputMapping) {
                return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
            }
            const payloadChange = subAgentHelper.ApplySubAgentOutputMapping<SR>(
                ctx,
                execution.result.payload as Record<string, unknown>,
                runningPayload as Record<string, unknown>,
                execution.relationship.SubAgentOutputMapping
            );
            if (!payloadChange || !payloadChange.updateElements) {
                return { mergedPayload: runningPayload, stepPayloadAtEnd: execution.result.payload };
            }
            const mergeResult = ctx.PayloadManager.applyAgentChangeRequest<SR>(
                runningPayload,
                payloadChange as AgentPayloadChangeRequest<SR>,
                {
                    validateChanges: true,
                    logChanges: true,
                    analyzeChanges: true,
                    generateDiff: true,
                    agentName: `${execution.request.name} (related agent mapping)`,
                    verbose: params.verbose === true || IsVerboseLoggingEnabled(),
                }
            );
            return { mergedPayload: mergeResult.result, stepPayloadAtEnd: execution.result.payload };
        }

        let resultPayloadForMerge = execution.result.payload;
        if (execution.subAgentEntity.PayloadScope) {
            resultPayloadForMerge = ctx.PayloadManager.reversePayloadScope(
                execution.result.payload,
                execution.subAgentEntity.PayloadScope
            ) as SR;
        }
        const mergeResult = ctx.PayloadManager.mergeUpstreamPayload(
            execution.request.name,
            runningPayload,
            resultPayloadForMerge,
            execution.upstreamPaths,
            params.verbose === true || IsVerboseLoggingEnabled()
        );
        return { mergedPayload: mergeResult.result, stepPayloadAtEnd: resultPayloadForMerge };
    }

    public BuildParallelSubAgentSummary<SR>(executions: ParallelSubAgentExecution<SR>[]): string {
        return executions
            .map((execution) => {
                const statusEmoji = execution.result.success ? '✅' : '❌';
                const lines: string[] = [
                    `${statusEmoji} **Sub-Agent: ${execution.request.name}**`,
                    `* Message: "${execution.request.message}"`,
                    `* Status: ${execution.result.agentRun?.FinalStep || 'Failed'}`,
                ];
                const isChat = execution.result.agentRun?.FinalStep === 'Chat';
                const question = execution.result.agentRun?.Message;
                if (execution.consult) {
                    const maxRounds = execution.maxConsultRounds ?? GetMaxSubAgentConsultRounds();
                    lines.push(
                        `* Question (round ${execution.consult.round} of ${maxRounds}): ${question?.trim() ? question : '(no message provided)'}`
                    );
                    const formSummary = FormatResponseFormSummary(execution.result.responseForm);
                    if (formSummary) {
                        lines.push(`* Form:\n${formSummary}`);
                    }
                    lines.push(`* Child run ID: ${execution.consult.childRunId || '(unknown)'}`);
                    lines.push(
                        `* To answer, call ${execution.request.name} again with resumeRunId: "${execution.consult.childRunId}" and your answer as the message.`
                    );
                } else if (isChat && question?.trim()) {
                    lines.push(`* Question: ${question}`);
                }
                if (execution.result.agentRun?.ErrorMessage) {
                    lines.push(`* Error: ${execution.result.agentRun.ErrorMessage}`);
                }
                return lines.join('\n');
            })
            .join('\n\n---\n\n');
    }

    public async RunSingleParallelSubAgent<SC, SR>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        dispatch: ParallelSubAgentDispatch | undefined,
        previousDecision: BaseAgentNextStep<SR, SC>,
        currentPayload: SR,
        parentStepId: string | undefined,
        subAgentPayloadOverride: unknown,
        stepCount: number
    ): Promise<ParallelSubAgentExecution<SR> | undefined> {
        if (!dispatch) return undefined;
        const { request, subAgentEntity, relationship } = dispatch;
        const preDispatchBudget = ctx.Hooks.CheckTreeBudgetLimit(params);
        if (preDispatchBudget.exceeded) {
            const limitReason =
                preDispatchBudget.reason ?? 'Workflow budget exceeded before parallel sub-agent execution';
            const diag = ctx.Hooks.EnsureTreeBudget(params).breachDiagnostic;
            return {
                request,
                result: {
                    success: false,
                    payload: currentPayload,
                    agentRun: {
                        ErrorMessage: limitReason,
                        FinalStep: 'Failed',
                    } as MJAIAgentRunEntityExtended,
                    ...(diag ? { limitExceeded: diag } : {}),
                } as ExecuteAgentResult<SR>,
                subAgentEntity,
                relationship,
                upstreamPaths: [],
            };
        }
        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Parallel Sub-Agent: ${request.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            skills: ctx.Hooks.GetSkillAttributionForSubAgent(subAgentEntity, params.agent),
            inputData: {
                agentName: params.agent.Name,
                subAgentName: request.name,
                message: request.message,
                terminateAfter: request.terminateAfter,
                ...(request.resumeRunId ? { resumeRunId: request.resumeRunId } : {}),
                ...(request.presetName ? { presetName: request.presetName } : {}),
                parentAgentHierarchy: ctx.AgentHierarchy,
                relationshipType: relationship ? 'related' : 'child',
            },
            payloadAtStart: currentPayload,
            parentId: parentStepId,
        });
        ctx.Hooks.IncrementExecutionCount(subAgentEntity.ID);

        const { initialPayload, contextMessage, upstreamPaths } = await this.BuildSubAgentInputs(
            ctx,
            subAgentHelper,
            params,
            dispatch,
            previousDecision,
            subAgentPayloadOverride
        );
        const result = await ctx.Hooks.ExecuteSubAgent(
            params,
            request as AgentSubAgentRequest<SC>,
            subAgentEntity,
            stepEntity,
            initialPayload as SR,
            contextMessage ?? undefined,
            stepCount
        );
        return { request, result, subAgentEntity, relationship, stepEntity, upstreamPaths };
    }

    public SynthesizeUnresolvedSubAgentExecution<SR>(
        request: AgentSubAgentRequest<unknown>,
        runningPayload: SR
    ): ParallelSubAgentExecution<SR> {
        return {
            request,
            result: {
                success: false,
                payload: runningPayload,
                agentRun: {
                    ErrorMessage: `Sub-agent '${request.name}' not found or not active`,
                    FinalStep: 'Failed',
                } as MJAIAgentRunEntityExtended,
            } as ExecuteAgentResult<SR>,
            subAgentEntity: { ID: '', Name: request.name } as MJAIAgentEntityExtended,
            upstreamPaths: [],
        };
    }

    public async MergeParallelExecutionsIntoParent<SC, SR>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        subAgentRequests: AgentSubAgentRequest<SC>[],
        executions: Array<ParallelSubAgentExecution<SR> | undefined>,
        startingPayload: SR
    ): Promise<{ mergedPayload: SR; anyFailure: boolean; allExecutions: ParallelSubAgentExecution<SR>[] }> {
        let mergedPayload = startingPayload;
        let anyFailure = false;
        const allExecutions: ParallelSubAgentExecution<SR>[] = [];
        for (let idx = 0; idx < subAgentRequests.length; idx++) {
            const execution = executions[idx];
            if (!execution) {
                anyFailure = true;
                allExecutions.push(
                    this.SynthesizeUnresolvedSubAgentExecution(
                        subAgentRequests[idx] as AgentSubAgentRequest<unknown>,
                        mergedPayload
                    )
                );
                continue;
            }
            if (!execution.result.success) anyFailure = true;
            if (execution.result.mediaOutputs?.length) ctx.MediaOutputs.push(...execution.result.mediaOutputs);
            if (execution.result.fileOutputs?.length) ctx.FileOutputs.push(...execution.result.fileOutputs);

            if (execution.result.agentRun?.FinalStep === 'Chat') {
                const resolvedOption = ctx.Hooks.ResolveSubAgentChatHandlingOption(
                    params.agent,
                    execution.relationship
                );
                if (subAgentHelper.IsSubAgentConsultActive(ctx, resolvedOption, params)) {
                    const round = (ctx.SubAgentConsultRounds.get(execution.subAgentEntity.ID) ?? 0) + 1;
                    ctx.SubAgentConsultRounds.set(execution.subAgentEntity.ID, round);
                    const maxRounds =
                        SafeResolveEffectiveAgentProperties(params.agent)?.MaxSubAgentConsultRounds ??
                        params.agent.MaxSubAgentConsultRounds ??
                        GetMaxSubAgentConsultRounds();
                    if (round <= maxRounds) {
                        const childRunId = execution.result.agentRun?.ID || '';
                        const question = execution.result.agentRun?.Message || null;
                        const consultRecord: SubAgentConsultRecord = {
                            childRunId,
                            subAgentId: execution.subAgentEntity.ID,
                            subAgentName: execution.request.name,
                            round,
                            question,
                        };
                        if (childRunId) {
                            ctx.OpenSubAgentConsults.set(childRunId, consultRecord);
                        }
                        execution.consult = consultRecord;
                        execution.maxConsultRounds = maxRounds;
                    }
                }
            }

            const { mergedPayload: newMerged, stepPayloadAtEnd } = this.MergeParallelSubAgentResult(
                ctx,
                subAgentHelper,
                params,
                execution,
                mergedPayload
            );
            mergedPayload = newMerged;
            allExecutions.push(execution);
            await this.RecordParallelStepCompletion(ctx, execution, stepPayloadAtEnd);
        }
        return { mergedPayload, anyFailure, allExecutions };
    }

    public async RecordParallelStepCompletion<SR>(
        ctx: AgentRunContext,
        execution: ParallelSubAgentExecution<SR>,
        stepPayloadAtEnd: unknown
    ): Promise<void> {
        if (!execution.stepEntity) return;
        execution.stepEntity.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(stepPayloadAtEnd);
        const shouldTerminate = execution.request.terminateAfter === true && !execution.consult;
        await ctx.Hooks.FinalizeStepEntity(
            execution.stepEntity,
            execution.result.success,
            execution.result.agentRun?.ErrorMessage ?? undefined,
            {
                subAgentResult: {
                    success: execution.result.success,
                    finalStep: execution.result.agentRun?.FinalStep,
                    errorMessage: execution.result.agentRun?.ErrorMessage,
                    stepCount: execution.result.agentRun?.Steps?.length || 0,
                },
                shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(execution.consult && { consult: execution.consult }),
            }
        );
    }

    public async ExecuteParallelSubAgents<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        subAgentRequests: AgentSubAgentRequest<SC>[],
        previousDecision: BaseAgentNextStep<SR, SC>,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const currentPayload = previousDecision.newPayload as SR;

        const nativeResults = previousDecision.nativeTurn?.sendResultsNatively === true;
        const dispatches = subAgentRequests.map((req) =>
            this.PrepareParallelSubAgentDispatch(ctx, params, req, stepCount, nativeResults)
        );

        const executions = await ctx.Hooks.MapWithConcurrency(
            dispatches,
            PARALLEL_SUBAGENT_CONCURRENCY_LIMIT,
            (dispatch) =>
                this.RunSingleParallelSubAgent<SC, SR>(
                    ctx,
                    subAgentHelper,
                    params,
                    dispatch,
                    previousDecision,
                    currentPayload,
                    parentStepId,
                    subAgentPayloadOverride,
                    stepCount
                )
        );

        const { mergedPayload, anyFailure, allExecutions } = await this.MergeParallelExecutionsIntoParent(
            ctx,
            subAgentHelper,
            params,
            subAgentRequests,
            executions,
            currentPayload
        );

        const pairable = nativeResults ? allExecutions.filter((e) => !!e.request.toolCallId) : [];
        const unpairable = allExecutions.filter((e) => !pairable.includes(e));
        if (pairable.length > 0) {
            ctx.Hooks.PushToolResultTurn(
                params,
                BuildToolResultTurn(
                    [
                        ...ctx.Hooks.PayloadToolResult(previousDecision),
                        ...pairable.map((e) => ({
                            toolCallId: e.request.toolCallId as string,
                            toolName: `${SUB_AGENT_TOOL_PREFIX}${SanitizeToolName(e.request.name)}`,
                            content: this.BuildParallelSubAgentSummary([e]),
                            isError: !e.result.success,
                        })),
                    ],
                    undefined
                ) as AgentChatMessage
            );
        }
        if (unpairable.length > 0) {
            params.conversationMessages.push({
                role: 'user',
                content: `Parallel Sub-Agents Completed:\n\n${this.BuildParallelSubAgentSummary(unpairable)}`,
            });
        }

        const postParallelBudgetCheck = ctx.Hooks.CheckTreeBudgetLimit(params);
        const childLimitExceeded = allExecutions.find((e) => Boolean(e.result.limitExceeded))?.result.limitExceeded;
        if (postParallelBudgetCheck.exceeded || childLimitExceeded) {
            const limitReason =
                childLimitExceeded?.Reason ??
                postParallelBudgetCheck.reason ??
                'Workflow budget exceeded during parallel sub-agent execution';
            if (childLimitExceeded && !ctx.Hooks.EnsureTreeBudget(params).breachDiagnostic) {
                ctx.Hooks.EnsureTreeBudget(params).breachDiagnostic = childLimitExceeded;
                ctx.Hooks.EnsureTreeBudget(params).breachedReason = limitReason;
            }
            return {
                step: 'Failed',
                message: limitReason,
                errorMessage: limitReason,
                terminate: true,
                newPayload: mergedPayload,
                previousPayload: previousDecision.newPayload,
            };
        }

        const shouldTerminateParent = allExecutions.some((e) => e.request.terminateAfter === true && !e.consult);
        const subAgentNames = allExecutions.map((e) => e.request.name).join(', ');
        return {
            step: anyFailure ? 'Failed' : shouldTerminateParent ? 'Success' : 'Retry',
            retryReason: anyFailure
                ? `Reviewing results and errors from ${subAgentNames}`
                : `Reviewing results from ${subAgentNames}`,
            terminate: shouldTerminateParent,
            newPayload: mergedPayload,
            previousPayload: previousDecision.newPayload,
        };
    }
}
