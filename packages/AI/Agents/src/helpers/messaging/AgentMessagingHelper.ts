/**
 * @fileoverview Default `@RegisterClass(BaseAgentMessagingHelper)` implementation owning
 * logging, progress wrapping, step entity persistence & payload deduplication, message
 * formatting/injection, Chat/HITL feedback steps, and stopped-run continuation delegation.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s1`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage } from '@memberjunction/ai';
import {
    type AgentChatMessage,
    type AgentDecisionResult,
    type AgentExecutionProgressCallback,
    type AgentSubAgentRequest,
    AIPromptParams,
    type BaseAgentNextStep,
    ConversationUtility,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    ExtractPromptResultText,
    finalizeAgentRunStep,
    initAgentRunStep,
    type MessageLifecycleEvent,
    type MJAIAgentRunStepEntityExtended,
    ResolvePromptRunUserID,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { IsVerboseLoggingEnabled, LogError, LogErrorEx, LogStatus, LogStatusEx } from '@memberjunction/core';
import { CopyScalarsAndArrays, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { StoredToolResult } from '../../ArtifactToolManager';
import { WrapUntrustedExternalData } from '../../client-tool-results';
import type { ConversationToolExecutionResult, ConversationToolSummaryHost } from '../../ConversationToolManager';
import type { MemoryWriteResult } from '../../MemoryWriteManager';
import { formatFinalOutput, type PipelineExecutionResult, summarizePipelineStages } from '../../pipeline';
import type { SubAgentConsultRecord } from '../../sub-agent-consult';
import {
    type CarryForwardStepRecord,
    FormatToolErrorSection,
    FormatToolResultSection,
    RenderToolResultData,
    type ToolResultSectionParts,
} from '../../tool-result-format';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentLogErrorOptions,
    CreateStepEntityParams,
    RecordedPromptMessage,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
} from '../base-agent-types';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import { AgentStoppedRunContinuationHelper } from './AgentStoppedRunContinuationHelper';
import { BaseAgentMessagingHelper } from './BaseAgentMessagingHelper';
import { AgentStepTypeRegistry } from '../steps/AgentStepTypeRegistry';

/**
 * Default pluggable implementation of {@link BaseAgentMessagingHelper}.
 */
@RegisterClass(BaseAgentMessagingHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentMessagingHelper extends BaseAgentMessagingHelper {
    private readonly _stoppedRunHelper = new AgentStoppedRunContinuationHelper();

    private static conversationToolResultsHeader(count: number): string {
        return count === 1 ? 'Conversation history tool result:' : `Conversation history tool results (${count} calls):`;
    }

    private static artifactToolResultsHeader(count: number): string {
        return count === 1 ? 'Artifact tool result:' : `Artifact tool results (${count} calls):`;
    }

    // --- Logging, progress & lifecycle events ---

    public override LogStatus(_ctx: AgentRunContext, message: string, verboseOnly: boolean = false, params?: ExecuteAgentParams): void {
        if (verboseOnly) {
            LogStatusEx({
                message,
                verboseOnly: true,
                isVerboseEnabled: () => params?.verbose === true || IsVerboseLoggingEnabled(),
            });
        } else {
            LogStatus(message);
        }
    }

    public override LogError(_ctx: AgentRunContext, error: Error | string, options?: AgentLogErrorOptions): void {
        const errorMessage = error instanceof Error ? error.message : error;
        const errorObj = error instanceof Error ? error : undefined;

        const metadata: Record<string, unknown> = {
            ...options?.metadata,
        };

        if (options?.agent) {
            metadata.agentId = options.agent.ID;
            metadata.agentName = options.agent.Name;
        }

        if (options?.agentType) {
            metadata.agentTypeId = options.agentType.ID;
            metadata.agentTypeName = options.agentType.Name;
        }

        LogErrorEx({
            message: errorMessage,
            error: errorObj,
            category: options?.category || 'BaseAgent',
            severity: options?.severity || 'error',
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });
    }

    public override WrapProgressCallback(
        ctx: AgentRunContext,
        originalCallback?: AgentExecutionProgressCallback
    ): AgentExecutionProgressCallback | undefined {
        if (!originalCallback) return undefined;

        return (progress) => {
            const hierarchicalStep = progress.metadata?.hierarchicalStep as string | undefined
                ?? ctx.Hooks.BuildHierarchicalStep(
                    progress.metadata?.stepCount as number,
                    ctx.ParentStepCounts
                );

            ctx.AllProgressSteps.push({
                ...progress,
                timestamp: new Date(),
                agentHierarchy: ctx.AgentHierarchy || [],
                depth: ctx.Depth || 0,
                hierarchicalStep,
            });

            try {
                const enhancedProgress = {
                    ...progress,
                    metadata: {
                        ...progress.metadata,
                        agentRun: ctx.AgentRun,
                        hierarchicalStep,
                    },
                };
                originalCallback(enhancedProgress);
            } catch (e) {
                ctx.Hooks.LogError(`Failed to enhance progress with agent run: ${e instanceof Error ? e.message : e}`, {
                    category: 'ProgressEnhancement',
                    metadata: {
                        progress,
                        agentRunId: ctx.AgentRun?.ID || 'N/A',
                    },
                });
                originalCallback(progress);
            }
        };
    }

    public override SafeOnProgress(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        progress: Parameters<NonNullable<ExecuteAgentParams['onProgress']>>[0]
    ): void {
        ctx.LivenessWatchdog?.RecordProgress({
            Kind: ctx.Depth > 0 ? 'sub-agent-heartbeat' : 'action-progress',
            Detail: progress.step,
        });
        try {
            params.onProgress?.(progress);
        } catch (e) {
            ctx.Hooks.LogError(`onProgress callback threw and was swallowed: ${e}`, { category: 'ProgressCallback' });
        }
    }

    public override EmitMessageLifecycleEvent(ctx: AgentRunContext, event: MessageLifecycleEvent): void {
        if (ctx.MessageLifecycleCallback) {
            ctx.MessageLifecycleCallback(event);
        }
    }

    public override WarnAboutDroppedValues(
        ctx: AgentRunContext,
        column: string,
        droppedPaths: string[],
        params: ExecuteAgentParams
    ): void {
        if (droppedPaths.length === 0) return;
        ctx.Hooks.LogStatus(
            `⚠️ ${droppedPaths.length} value(s) were not persistable and were left out of ` +
            `${column}: ${droppedPaths.join(', ')}. Class instances, connections and circular ` +
            `references are dropped on purpose — pass plain JSON for anything that must be readable later.`,
            true,
            params
        );
    }

    public override FormatHierarchicalMessage(ctx: AgentRunContext, baseMessage: string): string {
        if (ctx.Depth > 0) {
            const breadcrumb = ctx.AgentHierarchy
                .slice(1)
                .join(' → ');
            return breadcrumb ? `${breadcrumb}: ${baseMessage}` : baseMessage;
        }
        return baseMessage;
    }

    public override BuildInitializationProgressMessage(ctx: AgentRunContext, params: ExecuteAgentParams): string {
        if (ctx.Depth === 0) {
            return 'Getting ready...';
        }
        const startPhrase = `Starting ${params.agent.Name}...`;
        const parentBreadcrumb = ctx.AgentHierarchy.slice(1, -1).join(' → ');
        return parentBreadcrumb ? `${parentBreadcrumb}: ${startPhrase}` : startPhrase;
    }

    public override BuildPromptProgressMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision?: BaseAgentNextStep | null
    ): string {
        if (!previousDecision) {
            return ctx.Depth > 0
                ? 'Thinking...'
                : `${params.agent.Name} is thinking...`;
        }

        const retryReason = previousDecision.retryReason?.trim();
        if (retryReason) {
            if (retryReason === 'Payload change applied') {
                return ctx.Depth > 0
                    ? 'Thinking through the next steps...'
                    : `${params.agent.Name} is thinking through the next steps...`;
            }
            if (retryReason.startsWith('Context recovery')) {
                return ctx.Depth > 0
                    ? 'Thinking...'
                    : `${params.agent.Name} is thinking...`;
            }
            if (retryReason === 'Error while processing actions, retry') {
                return 'Recovering from an error and trying another approach...';
            }
            return retryReason;
        }

        const retryInstructions = previousDecision.retryInstructions?.trim();
        if (retryInstructions) {
            return ctx.Depth > 0
                ? 'Reviewing batch results...'
                : `${params.agent.Name} is reviewing batch results...`;
        }

        return ctx.Depth > 0
            ? 'Thinking through the next steps...'
            : `${params.agent.Name} is thinking through the next steps...`;
    }

    public override FitStepName(_ctx: AgentRunContext, stepEntity: MJAIAgentRunStepEntityExtended, name: string): string {
        const declared = stepEntity.EntityInfo?.Fields?.find((f) => f.Name === 'StepName')?.MaxLength;
        const limit = declared && declared > 0 ? declared : 255;
        return name.length > limit ? `${name.slice(0, limit - 1)}…` : name;
    }

    public override BuildHierarchicalStep(
        _ctx: AgentRunContext,
        currentStep: number | undefined,
        parentSteps: number[]
    ): string | undefined {
        if (currentStep == null) return undefined;
        if (parentSteps.length === 0) {
            return currentStep.toString();
        }
        return [...parentSteps, currentStep].join('.');
    }

    public override GetNextStepReasoning(_ctx: AgentRunContext, nextStep: BaseAgentNextStep): string {
        switch (nextStep.step) {
            case 'Failed':
                return nextStep.errorMessage || 'Agent execution failed';
            case 'Retry':
                return nextStep.retryReason || 'Retrying with updated context';
            default:
                return nextStep.reasoning || 'Continuing to next step';
        }
    }

    // --- Step entity creation, finalization & payload dedup ---

    public override async CreateStepEntity(
        ctx: AgentRunContext,
        params: CreateStepEntityParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        const stepEntity = await ctx.ActiveProvider.GetEntityObject<MJAIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            params.contextUser
        );
        stepEntity.NewRecord();

        const stepNumber = (ctx.AgentRun!.Steps?.length || 0) + 1;
        if (params.targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.targetId)) {
            console.warn(`Invalid target ID format: ${params.targetId}`);
        }

        const payloadAtStart = ctx.Hooks.SerializePayloadAtStart(params.payloadAtStart);
        const payloadAtStartSource = this.findPayloadEndSourceBefore(ctx, payloadAtStart);
        const payloadAtEnd = (
            params.payloadAtEnd !== undefined &&
            params.payloadAtEnd === params.payloadAtStart &&
            ctx.Hooks.HasDefaultPayloadSerializers()
        )
            ? payloadAtStart
            : ctx.Hooks.SerializePayloadAtEnd(params.payloadAtEnd);
        const payloadAtEndSource = this.findPayloadEndSourceBefore(ctx, payloadAtEnd);

        const resolvedStepTypeId =
            params.stepTypeId ??
            AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(params.stepType)?.StepTypeID ??
            undefined;
        initAgentRunStep(stepEntity, {
            AgentRunID: ctx.AgentRun!.ID,
            StepNumber: stepNumber,
            StepType: params.stepType,
            StepTypeID: resolvedStepTypeId,
            StepName: ctx.Hooks.FitStepName(stepEntity, ctx.Hooks.FormatHierarchicalMessage(params.stepName)),
            TargetID: params.targetId,
            TargetLogID: params.targetLogId,
            ParentID: params.parentId,
            PayloadAtStart: payloadAtStartSource ? null : payloadAtStart,
            PayloadAtStartSourceStepID: payloadAtStartSource?.ID ?? null,
            PayloadAtEnd: payloadAtEndSource ? null : payloadAtEnd,
            PayloadAtEndSourceStepID: payloadAtEndSource?.ID ?? null,
            InputData: params.inputData
                ? JSON.stringify({
                      ...params.inputData,
                      context: {
                          agentHierarchy: ctx.AgentHierarchy,
                          depth: ctx.Depth,
                          stepNumber,
                      },
                  })
                : undefined,
        });

        const skillsForStep = params.skills
            ?? (params.stepType === 'Prompt' && ctx.SkillInvocations.length > 0
                ? ctx.SkillInvocations
                : undefined);
        if (skillsForStep && skillsForStep.length > 0) {
            stepEntity.Skills = JSON.stringify(skillsForStep);
        }

        if (params.completed) {
            finalizeAgentRunStep(stepEntity, {
                success: params.completed.success,
                errorMessage: params.completed.errorMessage,
                outputData: params.completed.outputData ? CopyScalarsAndArrays(params.completed.outputData, true) : undefined,
                completedAt: new Date(),
            });
        }

        const parentStepEntity = params.parentId && ctx.AgentRun?.Steps
            ? ctx.AgentRun.Steps.find(s => UUIDsEqual(s.ID, params.parentId))
            : undefined;
        if (payloadAtStartSource && !payloadAtStartSource.IsSaved) {
            ctx.StepSaveQueue.Insert(
                stepEntity,
                [parentStepEntity, payloadAtStartSource],
                (s) => {
                    if (!payloadAtStartSource.IsSaved) {
                        s.PayloadAtStart = payloadAtStart;
                        s.PayloadAtStartSourceStepID = null;
                    }
                }
            );
        } else {
            ctx.StepSaveQueue.Insert(stepEntity, parentStepEntity);
        }

        if (ctx.AgentRun) {
            ctx.AgentRun.Steps.push(stepEntity);
        }

        ctx.BudgetTracker.RecordStepIncrement(ctx.Hooks.EnsureTreeBudget(ctx.ExecuteParams), {
            AgentName: ctx.ExecuteParams?.agent?.Name ?? ctx.AgentRun?.Agent,
            RunID: ctx.AgentRun?.ID,
        });

        return stepEntity;
    }

    private findPayloadEndSourceBefore(
        ctx: AgentRunContext,
        serializedPayload: string | null,
        beforeStep?: MJAIAgentRunStepEntityExtended
    ): MJAIAgentRunStepEntityExtended | undefined {
        if (serializedPayload == null) {
            return undefined;
        }
        const steps = ctx.AgentRun?.Steps ?? [];
        let startIdx = steps.length - 1;
        if (beforeStep) {
            const foundIdx = steps.indexOf(beforeStep);
            if (foundIdx >= 0) {
                startIdx = foundIdx - 1;
            }
        }
        const requireSavedSource = beforeStep != null;
        let candidateStep: MJAIAgentRunStepEntityExtended | undefined;
        for (let i = startIdx; i >= 0; i--) {
            const step = steps[i];
            if (step.Status !== 'Running' && (step.PayloadAtEnd != null || step.PayloadAtEndSourceStepID != null)) {
                candidateStep = step;
                break;
            }
        }
        if (!candidateStep) {
            return undefined;
        }
        if (requireSavedSource && !candidateStep.IsSaved) {
            return undefined;
        }
        const source = candidateStep.PayloadAtEndSourceStepID
            ? steps.find(s => UUIDsEqual(s.ID, candidateStep.PayloadAtEndSourceStepID))
            : candidateStep;
        if (!source) {
            return undefined;
        }
        if (requireSavedSource && !source.IsSaved) {
            return undefined;
        }
        return source.PayloadAtEnd === serializedPayload ? source : undefined;
    }

    public override FindPayloadAtEndSource(
        ctx: AgentRunContext,
        serializedEnd: string | null,
        beforeStep?: MJAIAgentRunStepEntityExtended
    ): MJAIAgentRunStepEntityExtended | undefined {
        return this.findPayloadEndSourceBefore(ctx, serializedEnd, beforeStep);
    }

    public override ResolveStepPayloadAtStart(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined
    ): string | null {
        if (!step) {
            return null;
        }
        if (step.PayloadAtStart != null) {
            return step.PayloadAtStart;
        }
        if (step.PayloadAtStartSourceStepID) {
            const source = ctx.AgentRun?.Steps?.find(s => UUIDsEqual(s.ID, step.PayloadAtStartSourceStepID));
            return source?.PayloadAtEnd ?? null;
        }
        return null;
    }

    public override ResolveStepPayloadAtEnd(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended | undefined
    ): string | null {
        if (!step) {
            return null;
        }
        if (step.PayloadAtEnd != null) {
            return step.PayloadAtEnd;
        }
        if (step.PayloadAtEndSourceStepID) {
            const source = ctx.AgentRun?.Steps?.find(s => UUIDsEqual(s.ID, step.PayloadAtEndSourceStepID));
            return source?.PayloadAtEnd ?? null;
        }
        return null;
    }

    public override CapturePromptStepMessages(
        ctx: AgentRunContext,
        messages: ChatMessage[] | undefined
    ): { conversationMessages: ChatMessage[]; conversationMessagesDelta?: true } {
        const nonVolatile = (messages ?? []).filter(m => (m as AgentChatMessage)?.metadata?.volatileState !== true);
        const previous = ctx.LastRecordedPromptStack;
        const isExtension = previous !== null && AgentMessagingHelper.isAppendOnlyExtension(previous, nonVolatile);
        const recorded: RecordedPromptMessage[] = new Array(nonVolatile.length);
        for (let i = 0; i < nonVolatile.length; i++) {
            if (isExtension && i < previous.length) {
                recorded[i] = previous[i];
            } else {
                const m = nonVolatile[i];
                const meta = (m as AgentChatMessage).metadata;
                recorded[i] = {
                    Message: m,
                    ContentRef: m.content,
                    MetadataRef: meta,
                    WasCompacted: meta?.wasCompacted,
                    CanExpand: meta?.canExpand,
                    IsExpired: meta?.isExpired,
                };
            }
        }
        ctx.LastRecordedPromptStack = recorded;
        if (isExtension) {
            return { conversationMessages: nonVolatile.slice(previous.length), conversationMessagesDelta: true };
        }
        return { conversationMessages: nonVolatile };
    }

    private static isAppendOnlyExtension(previous: RecordedPromptMessage[], current: ChatMessage[]): boolean {
        if (current.length < previous.length) {
            return false;
        }
        for (let i = 0; i < previous.length; i++) {
            const p = previous[i];
            const c = current[i];
            if (c !== p.Message || c.content !== p.ContentRef) {
                return false;
            }
            const meta = (c as AgentChatMessage).metadata;
            if (
                meta !== p.MetadataRef ||
                meta?.wasCompacted !== p.WasCompacted ||
                meta?.canExpand !== p.CanExpand ||
                meta?.isExpired !== p.IsExpired
            ) {
                return false;
            }
        }
        return true;
    }

    public override async FinalizeStepEntity(
        ctx: AgentRunContext,
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: unknown
    ): Promise<void> {
        try {
            let effectiveOutputData: Record<string, unknown> | undefined =
                outputData && typeof outputData === 'object' ? (outputData as Record<string, unknown>) : undefined;
            const existingRawOutputData = stepEntity.OutputData;
            if (existingRawOutputData && effectiveOutputData) {
                try {
                    const parsedExisting = JSON.parse(existingRawOutputData) as Record<string, unknown>;
                    if (parsedExisting && typeof parsedExisting === 'object' && !Array.isArray(parsedExisting)) {
                        effectiveOutputData = {
                            ...parsedExisting,
                            ...effectiveOutputData,
                        };
                    }
                } catch {
                    // Leave effectiveOutputData as-is if existing OutputData is not a JSON object
                }
            }

            const finalizeOpts = {
                success,
                errorMessage,
                outputData: effectiveOutputData
                    ? (CopyScalarsAndArrays(effectiveOutputData, true) as Record<string, unknown>)
                    : undefined,
                completedAt: new Date(),
                targetLogID: stepEntity.TargetLogID ?? undefined,
            };
            const finalPayloadValidationResult = stepEntity.FinalPayloadValidationResult;
            const finalPayloadValidationMessages = stepEntity.FinalPayloadValidationMessages;

            if (stepEntity.PayloadAtEnd != null) {
                const endSource = this.findPayloadEndSourceBefore(ctx, stepEntity.PayloadAtEnd, stepEntity);
                if (endSource) {
                    stepEntity.PayloadAtEnd = null;
                    stepEntity.PayloadAtEndSourceStepID = endSource.ID;
                } else {
                    stepEntity.PayloadAtEndSourceStepID = null;
                }
            }
            const payloadAtEnd = stepEntity.PayloadAtEnd;
            const payloadAtEndSourceStepID = stepEntity.PayloadAtEndSourceStepID ?? null;

            finalizeAgentRunStep(stepEntity, finalizeOpts);

            ctx.Hooks.QueueStepSave(stepEntity, (s) => {
                if (finalizeOpts.outputData === undefined && existingRawOutputData != null) {
                    s.OutputData = existingRawOutputData;
                }
                if (finalPayloadValidationResult !== undefined) {
                    s.FinalPayloadValidationResult = finalPayloadValidationResult;
                }
                if (finalPayloadValidationMessages !== undefined) {
                    s.FinalPayloadValidationMessages = finalPayloadValidationMessages;
                }
                finalizeAgentRunStep(s, finalizeOpts);
                s.PayloadAtEnd = payloadAtEnd;
                s.PayloadAtEndSourceStepID = payloadAtEndSourceStepID;
            });
        } catch (e) {
            LogError(`Failed to update agent run step record: ${(e as Error)?.message ?? e}`, undefined, e);
        }
    }

    public override QueueStepSave(
        ctx: AgentRunContext,
        stepEntity: MJAIAgentRunStepEntityExtended,
        applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void
    ): void {
        ctx.StepSaveQueue.QueueUpdate(stepEntity, applyMutation);
    }

    // --- Message formatting & injection ---

    public override ConvertUIMarkupInMessages(_ctx: AgentRunContext, messages: ChatMessage[]): void {
        if (!messages || messages.length === 0) {
            return;
        }

        for (const message of messages) {
            if (message.role !== 'user') {
                continue;
            }

            if (typeof message.content === 'string') {
                message.content = ConversationUtility.ToPlainText(message.content);
            } else if (Array.isArray(message.content)) {
                for (const block of message.content) {
                    if (block.type === 'text' && typeof block.content === 'string') {
                        block.content = ConversationUtility.ToPlainText(block.content);
                    }
                }
            }

            const agentMessage = message as AgentChatMessage;
            if (typeof agentMessage.metadata?.rawContent === 'string') {
                agentMessage.metadata.rawContent = ConversationUtility.ToPlainText(agentMessage.metadata.rawContent);
            }
        }
    }

    public override MaxStandaloneToolResultChars(_ctx: AgentRunContext): number {
        return 100_000; // ~25k tokens
    }

    public override CapStandaloneToolResultText(ctx: AgentRunContext, text: string): string {
        const budget = ctx.Hooks.MaxStandaloneToolResultChars();
        if (text.length <= budget) {
            return text;
        }
        const omitted = text.length - budget;
        return (
            text.slice(0, budget) +
            `\n\n…[truncated ${omitted.toLocaleString()} chars. This artifact is too large to read whole ` +
            `(~${Math.round(text.length / 4000)}k tokens) — reading it in full overflows the context window. ` +
            `Instead: page it with get_rows(start, count), or run a pipeline that filters/aggregates it ` +
            `server-side (where / select / groupBy → only the small final result returns to you).]`
        );
    }

    public override InjectConversationToolResultsMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        toolResults: ConversationToolExecutionResult[]
    ): void {
        if (toolResults.length === 0) return;
        const header = AgentMessagingHelper.conversationToolResultsHeader(toolResults.length);
        const body = toolResults.map((r, i) => {
            const parts: ToolResultSectionParts = { tool: r.tool, input: r.input, ordinal: i + 1 };
            if (r.result.success) {
                const data = ctx.Hooks.CapStandaloneToolResultText(RenderToolResultData(r.result.data));
                return FormatToolResultSection(parts, data);
            }
            return FormatToolErrorSection(parts, r.result.errorMessage);
        }).join('\n\n');

        const message: AgentChatMessage = {
            role: 'user',
            content: `${header}\n${body}`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    public override InjectArtifactToolResultsMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        toolResults: StoredToolResult[]
    ): void {
        if (toolResults.length === 0) return;
        const header = AgentMessagingHelper.artifactToolResultsHeader(toolResults.length);
        const body = toolResults.map((r, i) => {
            const parts: ToolResultSectionParts = { tool: r.tool, input: r.input, ordinal: i + 1, signaturePrefix: r.artifactId };
            if (r.result.success) {
                const rawData = ctx.Hooks.CapStandaloneToolResultText(RenderToolResultData(r.result.data));
                const section = FormatToolResultSection(parts, rawData);
                return (r.trustLevel === 'Untrusted' || r.trustLevel === 'SemiTrusted')
                    ? WrapUntrustedExternalData(section, r.sourceName ?? `artifact:${r.artifactId}`, r.trustLevel)
                    : section;
            }
            return FormatToolErrorSection(parts, r.result.errorMessage);
        }).join('\n\n');

        const message: AgentChatMessage = {
            role: 'user',
            content: `${header}\n${body}`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    public override InjectMemoryWriteResultsMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        results: MemoryWriteResult[]
    ): void {
        if (results.length === 0) return;
        const header = results.length === 1
            ? 'Memory write result:'
            : `Memory write results (${results.length} writes):`;
        const body = results.map((r, i) => {
            const note = r.request.note.length > 120 ? `${r.request.note.slice(0, 120)}…` : r.request.note;
            return `${i + 1}. "${note}" — **${r.disposition}**${r.reason ? `: ${r.reason}` : ''}`;
        }).join('\n');

        const message: AgentChatMessage = {
            role: 'user',
            content: `${header}\n${body}`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 300,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    public override InjectPipelineResultMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        result: PipelineExecutionResult
    ): void {
        const pipelineTaint = result.Taint;
        const diagnostic = result.success && result.diagnostic
            ? `\n⚠ Empty result — ${result.diagnostic}`
            : '';
        const label = summarizePipelineStages(result.steps);
        const renderedFinalOutput = result.success ? formatFinalOutput(result.finalOutput) : '';
        const formattedFinalOutput = result.success && pipelineTaint
            ? WrapUntrustedExternalData(renderedFinalOutput, pipelineTaint.SourceName, pipelineTaint.TrustLevel)
            : `\`\`\`\n${renderedFinalOutput}\n\`\`\``;
        const content = result.success
            ? `Pipeline result [${label}] (final stage value — intermediate stages stayed out of context, ~${result.contextBytesSaved} bytes saved):\n${formattedFinalOutput}${diagnostic}`
            : `Pipeline failed [${label}].\n${result.error}`;

        const message: AgentChatMessage = {
            role: 'user',
            content,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    public override InjectDecisionResultsMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        results: AgentDecisionResult[]
    ): void {
        if (!results || results.length === 0) return;

        const message: AgentChatMessage = {
            role: 'user',
            // fls-guard: decision outcomes, not entity rows
            content: `Decision results:\n${JSON.stringify(results)}`,
            metadata: {
                turnAdded: ctx.PromptTurnCount,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 3,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
        params.conversationMessages.push(message);
    }

    public override CreateSubAgentResultMessage(
        ctx: AgentRunContext,
        subAgent: AgentSubAgentRequest,
        result: ExecuteAgentResult
    ): ChatMessage {
        return {
            role: 'user',
            content: ctx.Hooks.FormatSubAgentResultAsMarkdown(subAgent.name, result),
        };
    }

    public override BuildConversationSummaryHost(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): ConversationToolSummaryHost {
        return {
            RunSummaryPrompt: async (rangeText: string, lens: string) => {
                const targetName = AgentStoppedRunContinuationHelper.SummarizeRangePromptName.toLowerCase();
                const prompt = AIEngine.Instance.Prompts.find(p => p.Name.trim().toLowerCase() === targetName);
                if (!prompt) {
                    throw new Error(`The '${AgentStoppedRunContinuationHelper.SummarizeRangePromptName}' system prompt is not present in this environment`);
                }
                const promptParams = new AIPromptParams();
                Object.assign(promptParams, ctx.Hooks.RunPromptExecutionScope(params));
                promptParams.prompt = prompt;
                promptParams.data = { lens, messages: rangeText };
                promptParams.agentId = params.agent.ID;
                promptParams.UserID = ResolvePromptRunUserID({
                    UserID: params.userId,
                    AgentRun: ctx.AgentRun,
                    ContextUser: params.contextUser,
                }) ?? undefined;
                const result = await ctx.PromptRunner.ExecutePrompt<string>(promptParams);
                const text = ExtractPromptResultText(result);
                if (!result.success || text.length === 0) {
                    throw new Error(result.errorMessage || 'summarizeRange sub-call returned no content');
                }
                return { text, promptRunId: result.promptRun?.ID };
            },
        };
    }

    // --- Chat & HITL feedback request steps ---

    public override async ExecuteChatStep(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const stepEntity = await ctx.Hooks.CreateStepEntity({
            stepType: 'Chat',
            stepName: 'User Interaction',
            contextUser: params.contextUser,
            completed: {
                success: true,
            },
        });

        await ctx.Hooks.RaiseFeedbackRequest(params, stepEntity, previousDecision);

        return {
            step: 'Chat',
            terminate: true,
            message: previousDecision.message || 'Additional information needed from user',
            priorStepResult: previousDecision.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            responseForm: previousDecision.responseForm,
            actionableCommands: previousDecision.actionableCommands,
            automaticCommands: previousDecision.automaticCommands,
            artifactDirective: previousDecision.artifactDirective,
        };
    }

    public override async RaiseFeedbackRequest(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        decision: BaseAgentNextStep
    ): Promise<void> {
        if (ctx.Depth !== 0) {
            return;
        }
        if (ctx.Hooks.RunAudienceAddsReader(params)) {
            ctx.Hooks.LogStatus('📋 No feedback request raised: the run has an audience, so it is answered in the conversation, not resumed', true, params);
            return;
        }
        const isInteractiveConversation = Boolean(
            params.conversationDetailId ||
            ctx.AgentRun?.ConversationDetailID ||
            ctx.AgentRun?.ConversationID
        );
        const hasStructuredGate = Boolean(decision.responseForm) || String(decision.step) === 'Plan';
        if (isInteractiveConversation && !hasStructuredGate) {
            ctx.Hooks.LogStatus('📋 No feedback request raised: interactive conversation Chat turn without structured responseForm or Plan gate', true, params);
            return;
        }
        await ctx.Hooks.CreateFeedbackRequest(params, stepEntity, decision);
    }

    public override async CreateFeedbackRequest(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        previousDecision: BaseAgentNextStep
    ): Promise<void> {
        await ctx.StepSaveQueue.Settled(stepEntity);
        const requestId = await ctx.FeedbackCoordinator.CreateFeedbackRequest({
            Params: params,
            StepEntity: stepEntity,
            Decision: previousDecision,
            AgentRun: ctx.AgentRun,
            Provider: params.provider || ctx.ActiveProvider,
        });
        if (requestId) {
            ctx.FeedbackRequestId = requestId;
        }
    }

    // --- Delegation to AgentStoppedRunContinuationHelper ---

    public override async InjectPriorTurnToolResults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._stoppedRunHelper.InjectPriorTurnToolResults(ctx, params);
    }

    public override async LoadPriorTurnToolResultSteps(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]> {
        return this._stoppedRunHelper.LoadPriorTurnToolResultSteps(ctx, params);
    }

    public override CachePriorTurnToolResults(ctx: AgentRunContext): void {
        this._stoppedRunHelper.CachePriorTurnToolResults(ctx);
    }

    public override async InjectStoppedRunResults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._stoppedRunHelper.InjectStoppedRunResults(ctx, params);
    }

    public override async LoadStoppedRunContinuation(
        ctx: AgentRunContext,
        params: ExecuteAgentParams
    ): Promise<StoppedRunContinuation | null> {
        return this._stoppedRunHelper.LoadStoppedRunContinuation(ctx, params);
    }

    public override ApplyStoppedRunContinuation(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        continuation: StoppedRunContinuation | null,
        continuationMessage: ChatMessage | undefined
    ): void {
        this._stoppedRunHelper.ApplyStoppedRunContinuation(ctx, params, continuation, continuationMessage);
    }

    public override BuildResumedStoppedRunTurns(
        ctx: AgentRunContext,
        steps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] | null {
        return this._stoppedRunHelper.BuildResumedStoppedRunTurns(ctx, steps, params);
    }

    public override BuildStoppedRunTail(
        ctx: AgentRunContext,
        decision: BaseAgentNextStep | null,
        tailSteps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] {
        return this._stoppedRunHelper.BuildStoppedRunTail(ctx, decision, tailSteps, params);
    }

    public override async LoadOpenConsults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<SubAgentConsultRecord[]> {
        return this._stoppedRunHelper.LoadOpenConsults(ctx, params);
    }

    public override ApplyOpenConsults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        openConsults: SubAgentConsultRecord[],
        continuationMessage: ChatMessage | undefined
    ): void {
        this._stoppedRunHelper.ApplyOpenConsults(ctx, params, openConsults, continuationMessage);
    }
}
