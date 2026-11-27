/**
 * @fileoverview Collaborator owned by {@link AgentSubAgentHelper} encapsulating related
 * sub-agent execution (`ExecuteRelatedSubAgentStep`), single sub-agent Chat/Consult
 * handling, sub-agent input/output/context mapping, durable task-graph submission
 * (`ExecuteTasksStep`), security envelope derivation, and agent handoff (`ExecuteHandoffStep`).
 *
 * @module @memberjunction/ai-agents
 */

import {
    BuildTaskGraphStartDebug,
    BuildTaskSecurityEnvelope,
    GetTaskGraphSubmitter,
    MergeTaskSecurityEnvelopes,
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type AgentPayloadChangeRequest,
    type AgentSubAgentRequest,
    type ArtifactDirective,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import { IsVerboseLoggingEnabled, LogError, LogStatus } from '@memberjunction/core';
import { MJEnvironmentEntityExtended, type MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import { AgentAudienceReaderIDs } from '../../agent-audience';
import { SanitizeToolName } from '../../native-tools/action-tool-builder';
import { SUB_AGENT_TOOL_PREFIX } from '../../native-tools/control-tools';
import { BuildToolResultTurn } from '../../native-tools/tool-result-turns';
import type { PayloadChangeResultSummary } from '../../PayloadManager';
import {
    FormatSubAgentConsultMessage,
    GetMaxSubAgentConsultRounds,
    type SubAgentConsultRecord,
} from '../../sub-agent-consult';
import type { AgentRunContext } from '../AgentRunContext';
import type { BaseAgentSubAgentHelper } from './BaseAgentSubAgentHelper';

/**
 * Collaborator handling related sub-agent execution, consult/Chat steps, durable task graphs, and handoff.
 */
export class AgentRelatedSubAgentAndTaskGraphHelper {
    public PushSubAgentConversationMessage<SC, SR>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgentEntity: MJAIAgentEntityExtended,
        messageContent: string,
        messageType: 'sub-agent-result' | 'sub-agent-consult',
        isError: boolean
    ): void {
        const metadata: AgentChatMessageMetadata = {
            turnAdded: ctx.PromptTurnCount,
            messageType,
            subAgentName: subAgentRequest.name,
            subAgentId: subAgentEntity.ID,
            expirationTurns: 3,
            expirationMode: 'Remove',
        };

        if (params.messageExpirationOverride) {
            const override = params.messageExpirationOverride;
            if (override.expirationTurns != null) {
                metadata.expirationTurns = override.expirationTurns;
                metadata.expirationMode = override.expirationMode || 'Remove';
                metadata.compactMode = override.compactMode;
                metadata.compactLength = override.compactLength;
                metadata.compactPromptId = override.compactPromptId;
            }
        }

        if (previousDecision?.nativeTurn?.sendResultsNatively && subAgentRequest.toolCallId) {
            ctx.Hooks.PushToolResultTurn(
                params,
                BuildToolResultTurn(
                    [
                        ...ctx.Hooks.PayloadToolResult(previousDecision),
                        {
                            toolCallId: subAgentRequest.toolCallId,
                            toolName: `${SUB_AGENT_TOOL_PREFIX}${SanitizeToolName(subAgentRequest.name)}`,
                            content: messageContent,
                            isError,
                        },
                    ],
                    metadata
                ) as AgentChatMessage
            );
        } else {
            params.conversationMessages.push({
                role: 'user',
                content: messageContent,
                metadata,
            } as AgentChatMessage);
        }
    }

    public async HandleSingleSubAgentChatStep<SC, SR>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentRequest: AgentSubAgentRequest<SC>,
        subAgentEntity: MJAIAgentEntityExtended,
        relationship: MJAIAgentRelationshipEntity | undefined,
        subAgentResult: ExecuteAgentResult<SR>,
        mergedPayload: SR,
        stepEntity: MJAIAgentRunStepEntityExtended,
        outputData: Record<string, unknown>
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const resolvedOption = ctx.Hooks.ResolveSubAgentChatHandlingOption(params.agent, relationship);

        if (subAgentHelper.IsSubAgentConsultActive(ctx, resolvedOption, params)) {
            const round = (ctx.SubAgentConsultRounds.get(subAgentEntity.ID) ?? 0) + 1;
            ctx.SubAgentConsultRounds.set(subAgentEntity.ID, round);
            const maxRounds = params.agent.MaxSubAgentConsultRounds ?? GetMaxSubAgentConsultRounds();

            const childRunId = subAgentResult.agentRun?.ID || '';
            const question = subAgentResult.agentRun?.Message || null;
            const consultRecord: SubAgentConsultRecord = {
                childRunId,
                subAgentId: subAgentEntity.ID,
                subAgentName: subAgentRequest.name,
                round,
                question,
            };
            if (childRunId) {
                ctx.OpenSubAgentConsults.set(childRunId, consultRecord);
            }
            outputData.consult = consultRecord;

            if (round <= maxRounds) {
                outputData.shouldTerminate = false;
                outputData.nextStep = 'retry';

                await ctx.Hooks.FinalizeStepEntity(
                    stepEntity,
                    subAgentResult.success,
                    subAgentResult.agentRun?.ErrorMessage ?? undefined,
                    outputData
                );

                const consultMessage = FormatSubAgentConsultMessage({
                    subAgentName: subAgentRequest.name,
                    round,
                    maxRounds,
                    question,
                    responseForm: subAgentResult.responseForm,
                    childRunId,
                });

                this.PushSubAgentConversationMessage(
                    ctx,
                    params,
                    previousDecision,
                    subAgentRequest,
                    subAgentEntity,
                    consultMessage,
                    'sub-agent-consult',
                    false
                );

                if (ctx.AgentRun) {
                    ctx.AgentRun.FinalPayloadObject = mergedPayload;
                }

                this.WarnIfDiscardingSubAgentArtifactDirective(subAgentResult, subAgentRequest.name);
                return {
                    ...subAgentResult,
                    step: 'Success',
                    errorMessage: undefined,
                    terminate: false,
                    previousPayload: previousDecision?.newPayload,
                    newPayload: mergedPayload,
                    artifactDirective: undefined,
                    payloadArtifactTypeID: undefined,
                    handoff: undefined,
                };
            }
        }

        await ctx.Hooks.FinalizeStepEntity(
            stepEntity,
            subAgentResult.success,
            subAgentResult.agentRun?.ErrorMessage ?? undefined,
            outputData
        );

        const childPayloadArtifactTypeID = relationship
            ? undefined
            : ctx.Hooks.ResolveChildPayloadArtifactTypeID(subAgentResult, subAgentEntity);
        const chatStep: BaseAgentNextStep<SR, SC> = {
            step: 'Chat',
            terminate: true,
            message: subAgentResult.agentRun?.Message || undefined,
            previousPayload: previousDecision?.newPayload,
            newPayload: mergedPayload,
            responseForm: subAgentResult.responseForm,
            actionableCommands: subAgentResult.actionableCommands,
            automaticCommands: subAgentResult.automaticCommands,
            artifactDirective: previousDecision?.artifactDirective ?? subAgentResult.artifactDirective,
            payloadArtifactTypeID: previousDecision?.payloadArtifactTypeID ?? childPayloadArtifactTypeID,
        };

        const effectiveOption = subAgentHelper.EffectiveSubAgentChatHandlingOption(
            ctx,
            params.agent,
            relationship,
            params
        );
        const validatedStep = await ctx.Hooks.ValidateChatNextStep(
            params,
            chatStep,
            mergedPayload,
            ctx.AgentRun!,
            stepEntity!,
            effectiveOption
        );

        if (validatedStep.step === 'Chat' && effectiveOption === 'Consult' && ctx.Depth === 0) {
            await ctx.Hooks.RaiseFeedbackRequest(params, stepEntity, chatStep);
        } else if (validatedStep.step === 'Retry') {
            validatedStep.artifactDirective = previousDecision?.artifactDirective;
            validatedStep.payloadArtifactTypeID = previousDecision?.payloadArtifactTypeID;
            const resultMessage = ctx.Hooks.FormatSubAgentResultAsMarkdown(subAgentRequest.name, subAgentResult);
            this.PushSubAgentConversationMessage(
                ctx,
                params,
                previousDecision,
                subAgentRequest,
                subAgentEntity,
                resultMessage,
                'sub-agent-result',
                !subAgentResult.success
            );
            if (ctx.AgentRun) {
                ctx.AgentRun.FinalPayloadObject = mergedPayload;
            }
        }

        return validatedStep;
    }

    public async ExecuteRelatedSubAgentStep<SC = unknown, SR = unknown>(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams<SC>,
        previousDecision: BaseAgentNextStep<SR, SC>,
        subAgentEntity: MJAIAgentEntityExtended,
        relationship: MJAIAgentRelationshipEntity,
        parentStepId?: string,
        subAgentPayloadOverride?: SR,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<SR, SC>> {
        const subAgentRequest = previousDecision.subAgent as AgentSubAgentRequest<SC>;

        if (params.cancellationToken?.aborted) {
            throw new Error('Cancelled before related sub-agent execution');
        }

        ctx.MessagingHelper.SafeOnProgress(ctx, params, {
            step: 'subagent_execution',
            percentage: 60,
            message: ctx.Hooks.FormatHierarchicalMessage(`Delegating to ${subAgentRequest.name} agent`),
            metadata: {
                agentName: params.agent.Name,
                subAgentName: subAgentRequest.name,
                reason: subAgentRequest.message,
                relationshipType: 'related',
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
            relationshipType: 'related',
        };

        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Sub-Agent',
            stepName: `Execute Related Sub-Agent: ${subAgentRequest.name}`,
            contextUser: params.contextUser,
            targetId: subAgentEntity.ID,
            inputData,
            payloadAtStart: previousDecision.newPayload,
            parentId: parentStepId,
            skills: ctx.Hooks.GetSkillAttributionForSubAgent(subAgentEntity, params.agent),
        });

        ctx.Hooks.IncrementExecutionCount(subAgentEntity.ID);

        try {
            let initialSubAgentPayload: SR | undefined = subAgentPayloadOverride;
            if (!initialSubAgentPayload && relationship.SubAgentInputMapping) {
                const mapped = this.ApplySubAgentInputMapping(
                    ctx,
                    previousDecision.newPayload as Record<string, unknown>,
                    relationship.SubAgentInputMapping
                );
                if (mapped && Object.keys(mapped).length > 0) {
                    initialSubAgentPayload = mapped as SR;

                    if (params.verbose === true || IsVerboseLoggingEnabled()) {
                        LogStatus(
                            `Related sub-agent '${subAgentRequest.name}' receiving mapped payload: ${JSON.stringify(Object.keys(mapped))}`
                        );
                    }
                }
            }

            let contextPaths: string[] = [];
            if (relationship.SubAgentContextPaths) {
                try {
                    contextPaths = JSON.parse(relationship.SubAgentContextPaths);
                } catch (parseError) {
                    const errMsg = parseError instanceof Error ? parseError.message : String(parseError);
                    LogError(`Failed to parse SubAgentContextPaths for sub-agent ${subAgentRequest.name}: ${errMsg}`);
                }
            }

            const contextMessage = this.PrepareRelatedSubAgentContextMessage(
                ctx,
                previousDecision.newPayload as Record<string, unknown>,
                contextPaths,
                params
            );

            if (contextMessage && (params.verbose === true || IsVerboseLoggingEnabled())) {
                LogStatus(
                    `Related sub-agent '${subAgentRequest.name}' receiving context from paths: ${contextPaths.join(', ')}`
                );
            }

            const subAgentResult = await ctx.Hooks.ExecuteSubAgent<SC, SR>(
                params,
                subAgentRequest,
                subAgentEntity,
                stepEntity,
                initialSubAgentPayload,
                contextMessage ?? undefined,
                stepCount
            );

            if (subAgentResult.mediaOutputs?.length) {
                ctx.MediaOutputs.push(...subAgentResult.mediaOutputs);
                const refCount = subAgentResult.mediaOutputs.filter((m) => m.refId).length;
                if (refCount > 0) {
                    ctx.Hooks.LogStatus(
                        `📦 Collected ${refCount} media reference(s) from related sub-agent '${subAgentRequest.name}'`,
                        true
                    );
                }
            }

            if (subAgentResult.fileOutputs?.length) {
                ctx.FileOutputs.push(...subAgentResult.fileOutputs);
                ctx.Hooks.LogStatus(
                    `📄 Collected ${subAgentResult.fileOutputs.length} file output(s) from related sub-agent '${subAgentRequest.name}'`,
                    true
                );
            }

            let mergedPayload = previousDecision.newPayload as SR;
            let currentStepPayloadChangeResult: PayloadChangeResultSummary | undefined = undefined;

            if (subAgentResult.success && relationship.SubAgentOutputMapping) {
                const payloadChange = this.ApplySubAgentOutputMapping<SR>(
                    ctx,
                    subAgentResult.payload as Record<string, unknown>,
                    previousDecision.newPayload as Record<string, unknown>,
                    relationship.SubAgentOutputMapping
                );

                if (payloadChange && payloadChange.updateElements) {
                    const mergeResult = ctx.PayloadManager.applyAgentChangeRequest<SR>(
                        previousDecision.newPayload as SR,
                        payloadChange as AgentPayloadChangeRequest<SR>,
                        {
                            validateChanges: true,
                            logChanges: true,
                            analyzeChanges: true,
                            generateDiff: true,
                            agentName: `${subAgentRequest.name} (related agent mapping)`,
                            verbose: params.verbose === true || IsVerboseLoggingEnabled(),
                        }
                    );

                    mergedPayload = mergeResult.result;
                    currentStepPayloadChangeResult = ctx.PayloadHelper.BuildPayloadChangeResultSummary(
                        ctx,
                        mergeResult
                    );

                    if (mergeResult.warnings.length > 0 && (params.verbose === true || IsVerboseLoggingEnabled())) {
                        LogStatus(`Related sub-agent mapping warnings: ${mergeResult.warnings.join('; ')}`);
                    }
                }
            }

            const subAgentParkedOnWorkflow = subAgentResult.agentRun?.Status === 'Paused';
            const shouldTerminate = subAgentRequest.terminateAfter === true || subAgentParkedOnWorkflow;

            const outputData: Record<string, unknown> = {
                subAgentResult: {
                    success: subAgentResult.success,
                    finalStep: subAgentResult.agentRun?.FinalStep,
                    errorMessage: subAgentResult.agentRun?.ErrorMessage,
                    stepCount: subAgentResult.agentRun?.Steps?.length || 0,
                    hasMergedPayload: !!(
                        relationship.SubAgentOutputMapping && mergedPayload !== previousDecision.newPayload
                    ),
                },
                shouldTerminate,
                nextStep: shouldTerminate ? 'success' : 'retry',
                ...(currentStepPayloadChangeResult && {
                    payloadChangeResult: currentStepPayloadChangeResult,
                }),
            };

            if (stepEntity) {
                stepEntity.PayloadAtEnd = ctx.Hooks.SerializePayloadAtEnd(mergedPayload);
            }

            if (subAgentResult.agentRun?.FinalStep === 'Chat') {
                return await this.HandleSingleSubAgentChatStep(
                    ctx,
                    subAgentHelper,
                    params,
                    previousDecision,
                    subAgentRequest,
                    subAgentEntity,
                    relationship,
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
                    payloadArtifactTypeID: previousDecision?.payloadArtifactTypeID,
                    handoff: undefined,
                };
            }

            const relatedResultMessage = ctx.Hooks.FormatSubAgentResultAsMarkdown(
                subAgentRequest.name,
                subAgentResult
            );
            this.PushSubAgentConversationMessage(
                ctx,
                params,
                previousDecision,
                subAgentRequest,
                subAgentEntity,
                relatedResultMessage,
                'sub-agent-result',
                !subAgentResult.success
            );

            if (ctx.AgentRun) {
                ctx.AgentRun.FinalPayloadObject = mergedPayload;
            }

            if (previousDecision?.taskGraph?.folded === true && subAgentResult.artifactDirective) {
                ctx.LastSubAgentArtifactDirective = subAgentResult.artifactDirective;
            } else if (!previousDecision?.artifactDirective && !shouldTerminate) {
                this.WarnIfDiscardingSubAgentArtifactDirective(subAgentResult, subAgentRequest.name);
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
                    : subAgentResult.agentRun?.ErrorMessage || 'Related sub-agent failed with no error message',
                retryReason: subAgentResult.success
                    ? `Reviewing results from ${subAgentRequest.name}`
                    : `Handling error from ${subAgentRequest.name}`,
                terminate: shouldTerminate,
                previousPayload: previousDecision?.newPayload,
                newPayload: mergedPayload,
                artifactDirective:
                    previousDecision?.artifactDirective ??
                    (shouldTerminate ? subAgentResult.artifactDirective : undefined),
                payloadArtifactTypeID: previousDecision?.payloadArtifactTypeID,
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
                errorMessage: `Related sub-agent execution failed: ${errMsg}`,
                step: 'Failed',
                terminate: false,
                previousPayload: payload,
                newPayload: payload,
            };
        }
    }

    public WarnIfDiscardingSubAgentArtifactDirective(
        subAgentResult: { artifactDirective?: ArtifactDirective },
        subAgentName: string
    ): void {
        const directive = subAgentResult?.artifactDirective;
        if (directive) {
            LogStatus(
                `Sub-agent "${subAgentName}" requested artifact behavior '${directive.behavior}'; not applied — ` +
                    `an artifact directive governs its own agent's payload, and the parent step returns a merged payload`
            );
        }
    }

    public ApplySubAgentOutputMapping<P>(
        ctx: AgentRunContext,
        subAgentResult: Record<string, unknown>,
        parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): AgentPayloadChangeRequest<P> | null {
        return ctx.StepDispatcher.ApplySubAgentOutputMapping(
            subAgentResult,
            parentPayload,
            mappingConfig,
            (obj, path) => ctx.Hooks.GetValueFromPath(obj, path)
        );
    }

    public ApplySubAgentInputMapping(
        ctx: AgentRunContext,
        parentPayload: Record<string, unknown>,
        mappingConfig: string
    ): Record<string, unknown> | null {
        return ctx.StepDispatcher.ApplySubAgentInputMapping(
            parentPayload,
            mappingConfig,
            (obj, path) => ctx.Hooks.GetValueFromPath(obj, path)
        );
    }

    public PrepareRelatedSubAgentContextMessage(
        ctx: AgentRunContext,
        parentPayload: Record<string, unknown>,
        contextPaths: string[],
        params?: ExecuteAgentParams
    ): ChatMessage | null {
        return ctx.StepDispatcher.PrepareRelatedSubAgentContextMessage(
            parentPayload,
            contextPaths,
            params,
            (obj, path) => ctx.Hooks.GetValueFromPath(obj, path)
        );
    }

    public async ExecuteTasksStep(
        ctx: AgentRunContext,
        subAgentHelper: BaseAgentSubAgentHelper,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const graph = previousDecision.taskGraph;
        const rawSpec = graph?.spec;
        if (!rawSpec) {
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: 'A Tasks step reached execution with no task graph attached.',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }
        const spec = subAgentHelper.CanonicalizeTaskGraphSpec(ctx, rawSpec);
        const withheld = ctx.Hooks.TaskGraphRefusal(params, previousDecision);
        if (withheld) {
            return withheld;
        }
        const envelope = this.TaskGraphSecurityEnvelope(ctx, params);
        if ('Refusal' in envelope) {
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: `Task graph not submitted: ${envelope.Refusal}`,
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }
        const securityEnvelope = envelope.Envelope;

        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'TaskGraph',
            stepName: `Task Graph: ${spec.workflowName}`,
            contextUser: params.contextUser,
            inputData: { spec, folded: false },
        });

        const submitter = GetTaskGraphSubmitter();
        if (!submitter) {
            const errorMessage =
                'No task-graph submitter is registered on this host, so the graph could not be made durable. ' +
                'Task graphs require the durable-execution package to be loaded.';
            await ctx.Hooks.FinalizeStepEntity(stepEntity, false, errorMessage, { spec, submitted: false });
            return {
                step: 'Failed',
                terminate: true,
                errorMessage,
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }

        const outcome = await submitter.Submit({
            Spec: spec,
            EnvironmentID: MJEnvironmentEntityExtended.DefaultEnvironmentID,
            ConversationDetailID: params.conversationDetailId ?? null,
            AgentRunID: ctx.AgentRun?.ID ?? null,
            AgentID: params.agent.ID,
            RoutineID: params.routineId ?? null,
            LimitsOverride: params.limitsOverride,
            UserPolicyLimitsOverride: params.userPolicyLimitsOverride,
            EnableGovernance: params.enableRunawayGovernance,
            ParentAgentHierarchy: ctx.AgentHierarchy.length > 0 ? [...ctx.AgentHierarchy] : undefined,
            ReinvokeDepth: ctx.AgentRun?.ContinuationDepth ?? 0,
            Invocation: { Data: params.data, Context: params.context },
            Debug: BuildTaskGraphStartDebug(params.taskGraphDebug),
            ContextUser: params.contextUser,
            Provider: ctx.ProviderToUse,
            ...(securityEnvelope ? { SecurityEnvelope: securityEnvelope } : {}),
        });

        await ctx.Hooks.FinalizeStepEntity(stepEntity, outcome.Success, outcome.ErrorMessage, {
            spec,
            submitted: outcome.Success,
            parentTaskID: outcome.ParentTaskID,
        });

        if (!outcome.Success) {
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: outcome.ErrorMessage || 'Task graph submission failed.',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }

        if (outcome.ParentTaskID) {
            ctx.AwaitingWorkflowTaskID = outcome.ParentTaskID;
        }

        return {
            step: 'Success',
            terminate: true,
            message:
                previousDecision.message ||
                `Started **${spec.workflowName}** — ${spec.tasks.length} task(s) running. ` +
                    `I'll follow up when it finishes.`,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
        };
    }

    public SubAgentTaint(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Pick<ExecuteAgentParams, 'SecurityEnvelope' | 'ParentRunTainted'> {
        const tainted = ctx.IsRunTainted || params.SecurityEnvelope?.IsRunTainted === true;
        if (params.SecurityEnvelope) {
            return { SecurityEnvelope: { ...params.SecurityEnvelope, IsRunTainted: tainted } };
        }
        return tainted ? { ParentRunTainted: true } : {};
    }

    public TaskGraphSecurityEnvelope(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): { Envelope: TaskSecurityEnvelope | undefined } | { Refusal: string } {
        const scope = ctx.Hooks.RunScopeFor(params);
        const derived = BuildTaskSecurityEnvelope({
            BoundActionParams: params.boundActionParams,
            AudienceMode: params.Audience?.Mode,
            AudienceReaderUserIDs: AgentAudienceReaderIDs(params.Audience, params.contextUser?.ID),
            RunScope: {
                PrimaryScopeEntityName: scope.PrimaryScopeEntityName ?? null,
                PrimaryScopeRecordID: scope.PrimaryScopeRecordID,
                SecondaryScopes: scope.SecondaryScopes ?? null,
                ...(scope.SearchScopeIDs ? { SearchScopeIDs: scope.SearchScopeIDs } : {}),
            },
            CallerTenantContext: params.contextUser?.TenantContext,
            IsRunTainted: ctx.IsRunTainted,
        });
        const merged = MergeTaskSecurityEnvelopes(derived, params.SecurityEnvelope);
        return 'Reason' in merged ? { Refusal: merged.Reason } : { Envelope: merged.Envelope };
    }

    public async ExecuteHandoffStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const handoff = previousDecision.handoff;
        const resolved = ctx.ResolvedHandoffTarget;
        if (!handoff || !resolved) {
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: 'A Handoff step reached execution without a validated handoff target.',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }

        if (ctx.Hooks.RunWithholdsHandoff(params)) {
            return {
                step: 'Failed',
                terminate: true,
                errorMessage: 'Handoff is not available on this run.',
                previousPayload: previousDecision.previousPayload,
                newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            };
        }

        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Handoff',
            stepName: `Handoff: ${resolved.name}`,
            targetId: resolved.id,
            contextUser: params.contextUser,
            inputData: {
                agentName: handoff.agentName,
                brief: handoff.brief,
                reason: handoff.reason,
            },
        });

        const chain = [...(params.handoffChain ?? []), params.agent.ID];
        const hop = chain.length;

        await ctx.Hooks.FinalizeStepEntity(stepEntity, true, undefined, {
            HandoffToAgentID: resolved.id,
            TargetAgentName: resolved.name,
            Brief: handoff.brief,
            Reason: handoff.reason,
            Hop: hop,
            Chain: chain,
        });

        ctx.HandoffResult = {
            targetAgentId: resolved.id,
            targetAgentName: resolved.name,
            sourceAgentId: params.agent.ID,
            brief: handoff.brief,
            reason: handoff.reason,
            runStepId: stepEntity.ID,
        };

        return {
            step: 'Success',
            terminate: true,
            message: previousDecision.message || `Transferring you to **${resolved.name}**…`,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
        };
    }

    public async RecordFoldedTaskGraph(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep
    ): Promise<void> {
        const graph = nextStep.taskGraph;
        if (!graph?.folded) return;

        await ctx.Hooks.CreateStepEntity({
            stepType: 'TaskGraph',
            stepName: `Task Graph (folded): ${graph.spec.workflowName}`,
            contextUser: params.contextUser,
            inputData: { spec: graph.spec, folded: true, foldReason: graph.foldReason },
            completed: {
                success: true,
                outputData: {
                    spec: graph.spec,
                    folded: true,
                    foldReason: graph.foldReason,
                    submitted: false,
                },
            },
        });
    }
}
