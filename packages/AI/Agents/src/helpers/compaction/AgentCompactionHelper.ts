/**
 * @fileoverview Default `@RegisterClass(BaseAgentCompactionHelper, 'Default')` implementation
 * owning mid-loop expiration/pruning, cross-turn conversation compaction, post-run compaction &
 * memory extraction trigger, single-message compaction (First N Chars / AI Summary), message
 * expansion, and delegation to {@link AgentContextRecoveryHelper}.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s3`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage, ChatMessageContent } from '@memberjunction/ai';
import {
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type AgentConfiguration,
    type AgentPostRunCompactionConfig,
    type AIModelSelectionInfo,
    AIPromptParams,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    initAgentRunStep,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type MJAIPromptEntityExtended,
    ResolvePromptRunUserID,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { PartitionStablePrefix } from '@memberjunction/context-crush';
import { LogError, type UserInfo } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import type { ActionCompactMode } from '../../ActionLifecycleResolver';
import { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import {
    ExtractUntrustedEnvelope,
    ReplaceMediaBlocksWithStubs,
    TruncatePreservingUntrustedEnvelope,
    WrapUntrustedExternalData,
} from '../../client-tool-results';
import {
    ConversationCompactionManager,
    type CompactionOutcome,
    type EffectiveContextBudget,
} from '../../ConversationCompactionManager';
import { CompactToolResultContent, CompactToolResultContentAsync } from '../../native-tools/tool-result-turns';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentStoppedRunContinuationHelper } from '../messaging/AgentStoppedRunContinuationHelper';
import { AgentContextRecoveryHelper } from './AgentContextRecoveryHelper';
import { BaseAgentCompactionHelper, type CompactMessageMetadata } from './BaseAgentCompactionHelper';

/**
 * Default pluggable implementation of {@link BaseAgentCompactionHelper}.
 */
@RegisterClass(BaseAgentCompactionHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentCompactionHelper extends BaseAgentCompactionHelper {
    private readonly _recoveryHelper = new AgentContextRecoveryHelper();

    // --- Delegation to AgentContextRecoveryHelper ---

    public override ContentToString(ctx: AgentRunContext, content: ChatMessageContent): string {
        return this._recoveryHelper.ContentToString(ctx, content);
    }

    public override SmartTrimContent(
        ctx: AgentRunContext,
        content: string,
        maxLength: number = 1000
    ): { trimmed: string; strategy: string; originalLength: number } {
        return this._recoveryHelper.SmartTrimContent(ctx, content, maxLength);
    }

    public override IsToolResultMessage(ctx: AgentRunContext, msg: ChatMessage): boolean {
        return this._recoveryHelper.IsToolResultMessage(ctx, msg);
    }

    public override IsVolatileResultMessage(ctx: AgentRunContext, msg: ChatMessage): boolean {
        return this._recoveryHelper.IsVolatileResultMessage(ctx, msg);
    }

    public override EstimateTokens(ctx: AgentRunContext, content: ChatMessage['content'], modelName?: string): number {
        return this._recoveryHelper.EstimateTokens(ctx, content, modelName);
    }

    public override HeuristicTokenCount(ctx: AgentRunContext, text: string): number {
        return this._recoveryHelper.HeuristicTokenCount(ctx, text);
    }

    public override GetModelContextLimit(ctx: AgentRunContext, modelSelectionInfo?: AIModelSelectionInfo): number {
        return this._recoveryHelper.GetModelContextLimit(ctx, modelSelectionInfo);
    }

    public override TryGetModelMaxInputTokens(ctx: AgentRunContext, modelSelectionInfo: AIModelSelectionInfo): number | null {
        return this._recoveryHelper.TryGetModelMaxInputTokens(ctx, modelSelectionInfo);
    }

    public override EstimateConversationTokens(ctx: AgentRunContext, messages: ChatMessage[]): number {
        return this._recoveryHelper.EstimateConversationTokens(ctx, messages);
    }

    public override RecoveryStrategy_DropStaleVolatileState(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number
    ): { tokensSaved: number; strategyName: string } {
        return this._recoveryHelper.RecoveryStrategy_DropStaleVolatileState(ctx, params, tokensToSave, currentStepCount);
    }

    public override RecoveryStrategy_RemoveOldestToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 5
    ): { tokensSaved: number; strategyName: string } {
        return this._recoveryHelper.RecoveryStrategy_RemoveOldestToolResults(ctx, params, tokensToSave, currentStepCount, minAge);
    }

    public override RecoveryStrategy_CompactOldToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 3
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        return this._recoveryHelper.RecoveryStrategy_CompactOldToolResults(ctx, params, tokensToSave, currentStepCount, minAge);
    }

    public override RecoveryStrategy_CompactAllToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        return this._recoveryHelper.RecoveryStrategy_CompactAllToolResults(ctx, params, tokensToSave);
    }

    public override RecoveryStrategy_TrimLastUserMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number
    ): { tokensSaved: number; strategyName: string } {
        return this._recoveryHelper.RecoveryStrategy_TrimLastUserMessage(ctx, params, tokensToSave);
    }

    public override AttemptContextRecovery<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        payload: P,
        errorMessage: string,
        modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>> {
        return this._recoveryHelper.AttemptContextRecovery(ctx, params, payload, errorMessage, modelSelectionInfo);
    }

    // --- Mid-loop pruning & expiration ---

    public override IsMidLoopCompactionThresholdReached(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        const messages = params?.conversationMessages;
        if (!Array.isArray(messages) || messages.length === 0) {
            return false;
        }
        const budget = ctx.Hooks.ResolveCompactionBudget(params, ctx.AgentConfig);
        if (!budget.TriggerTokens || budget.TriggerTokens <= 0) {
            return false;
        }
        let estimatedTokens = ctx.Hooks.EstimateConversationTokens(messages);
        for (const msg of messages) {
            const toolCalls = (msg as AgentChatMessage).toolCalls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                for (const call of toolCalls) {
                    if (call?.arguments !== undefined) {
                        estimatedTokens += ctx.Hooks.EstimateTokens(JSON.stringify(call.arguments));
                    }
                }
            }
        }
        return estimatedTokens >= budget.TriggerTokens;
    }

    public override async PruneAndCompactExpiredMessages(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        currentTurn: number
    ): Promise<void> {
        const messagesToCompact: Array<{
            index: number;
            message: AgentChatMessage;
            metadata: {
                compactMode: ActionCompactMode;
                compactLength: number;
                compactPromptId: string;
                originalLength: number;
            };
        }> = [];
        const messagesToRemove: number[] = [];

        const { Boundary: stablePrefixBoundary } = PartitionStablePrefix(
            params.conversationMessages,
            (msg) => !ctx.Hooks.IsVolatileResultMessage(msg as ChatMessage)
        );

        for (let i = 0; i < params.conversationMessages.length; i++) {
            const msg = params.conversationMessages[i] as AgentChatMessage;
            if (!msg.metadata?.expirationTurns && msg.metadata?.expirationTurns !== 0) {
                continue;
            }
            if (msg.metadata.expirationMode === 'None') {
                continue;
            }

            const turnAdded = msg.metadata.turnAdded || 0;
            const turnsAlive = currentTurn - turnAdded;

            if (turnsAlive > msg.metadata.expirationTurns) {
                if (i < stablePrefixBoundary) {
                    ctx.Hooks.LogStatus(`[Turn ${currentTurn}] Deferred expiry of cache-stable prefix message at index ${i}`, true, params);
                    continue;
                }

                msg.metadata.isExpired = true;

                if (msg.metadata.expirationMode === 'Remove' && msg.role === 'tool') {
                    const artifactIds = ctx.Hooks.AreArtifactToolsEnabled(params) ? ctx.ActionSpilloverManager.Materialize(msg) : [];
                    const artifactNote = ActionResultSpilloverManager.FormatSpilloverHint(
                        artifactIds,
                        ctx.ArtifactToolManager.HasArtifacts(),
                        'semicolon'
                    );
                    params.conversationMessages[i] = ctx.Hooks.StubToolTurn(
                        msg,
                        `[result expired after ${turnsAlive} turns${artifactNote}]`
                    );
                    ctx.Hooks.EmitMessageLifecycleEvent({
                        type: 'message-expired',
                        turn: currentTurn,
                        messageIndex: i,
                        message: params.conversationMessages[i] as AgentChatMessage,
                        reason: `Expired after ${turnsAlive} turns (limit: ${msg.metadata.expirationTurns}); tool turn stubbed, not removed`,
                    });
                } else if (msg.metadata.expirationMode === 'Remove') {
                    if (ctx.Hooks.AreArtifactToolsEnabled(params)) {
                        ctx.ActionSpilloverManager.Materialize(msg);
                    }
                    messagesToRemove.push(i);
                    ctx.Hooks.EmitMessageLifecycleEvent({
                        type: 'message-expired',
                        turn: currentTurn,
                        messageIndex: i,
                        message: msg,
                        reason: `Expired after ${turnsAlive} turns (limit: ${msg.metadata.expirationTurns})`,
                    });
                } else if (msg.metadata.expirationMode === 'Compact') {
                    const effectiveCompactMode: ActionCompactMode = msg.metadata.compactMode || 'First N Chars';
                    if (!msg.metadata.wasCompacted) {
                        messagesToCompact.push({
                            index: i,
                            message: msg,
                            metadata: {
                                compactMode: effectiveCompactMode,
                                compactLength: msg.metadata.compactLength || 500,
                                compactPromptId: msg.metadata.compactPromptId || '',
                                originalLength:
                                    typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length,
                            },
                        });
                    }
                }
            }
        }

        const preserveOriginal = params.messageExpirationOverride?.preserveOriginalContent !== false;

        for (const item of messagesToCompact) {
            const originalContent = item.message.content;
            if (item.message.role === 'tool') {
                const compactedTurn = await CompactToolResultContentAsync(item.message, (text) =>
                    ctx.Hooks.CompactMessage({ ...item.message, content: text }, { ...item.metadata, originalLength: text.length }, params)
                );
                const saved = ctx.Hooks.EstimateTokens(originalContent) - ctx.Hooks.EstimateTokens(compactedTurn.content);
                const nextMetadata: AgentChatMessageMetadata = {
                    ...item.message.metadata,
                    wasCompacted: true,
                    originalContent: preserveOriginal ? originalContent : undefined,
                    originalLength: item.metadata.originalLength,
                    tokensSaved: saved,
                    canExpand: preserveOriginal,
                };
                ctx.ActionSpilloverManager.TransferPending(item.message.metadata, nextMetadata);
                params.conversationMessages[item.index] = {
                    ...compactedTurn,
                    metadata: nextMetadata,
                };
                ctx.Hooks.EmitMessageLifecycleEvent({
                    type: 'message-compacted',
                    turn: currentTurn,
                    messageIndex: item.index,
                    message: params.conversationMessages[item.index] as AgentChatMessage,
                    reason: `Compacted tool turn per block (saved ${saved} tokens)`,
                    tokensSaved: saved,
                });
                continue;
            }
            const compacted = await ctx.Hooks.CompactMessage(item.message, item.metadata, params);
            const originalTokens = ctx.Hooks.EstimateTokens(originalContent);
            const compactedTokens = ctx.Hooks.EstimateTokens(compacted);
            const tokensSaved = originalTokens - compactedTokens;

            const nextMetadata: AgentChatMessageMetadata = {
                ...item.message.metadata,
                wasCompacted: true,
                originalContent: preserveOriginal ? originalContent : undefined,
                originalLength: item.metadata.originalLength,
                tokensSaved,
                canExpand: preserveOriginal,
            };
            ctx.ActionSpilloverManager.TransferPending(item.message.metadata, nextMetadata);
            params.conversationMessages[item.index] = {
                ...item.message,
                content: compacted,
                metadata: nextMetadata,
            };

            ctx.Hooks.EmitMessageLifecycleEvent({
                type: 'message-compacted',
                turn: currentTurn,
                messageIndex: item.index,
                message: params.conversationMessages[item.index] as AgentChatMessage,
                reason: `Compacted using ${item.metadata.compactMode} (saved ${tokensSaved} tokens)`,
                tokensSaved,
            });
        }

        for (let i = messagesToRemove.length - 1; i >= 0; i--) {
            const index = messagesToRemove[i];
            const removed = params.conversationMessages.splice(index, 1)[0];
            ctx.Hooks.EmitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentTurn,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Removed due to expiration',
            });
        }

        if (params.verbose && (messagesToCompact.length > 0 || messagesToRemove.length > 0)) {
            const totalSaved = messagesToCompact.reduce((sum, item) => {
                const msg = params.conversationMessages[item.index] as AgentChatMessage;
                return sum + (msg.metadata?.tokensSaved || 0);
            }, 0);

            console.log(
                `[Turn ${currentTurn}] Message pruning: ` +
                    `${messagesToCompact.length} compacted (saved ~${totalSaved} tokens), ` +
                    `${messagesToRemove.length} removed`
            );
        }
    }

    // --- Cross-turn conversation compaction ---

    public override ResolveCompactionBudget(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration | undefined
    ): EffectiveContextBudget {
        const modelMax = ctx.LastModelSelectionInfo
            ? ctx.Hooks.TryGetModelMaxInputTokens(ctx.LastModelSelectionInfo)
            : null;
        const budget = ConversationCompactionManager.ResolveEffectiveBudget(params.agent, config?.agentType || null, modelMax);
        if (budget.ClampedToModel) {
            ctx.Hooks.LogStatus(
                `⚠️ [CrossTurnCompaction] Configured ContextWindowMaxTokens exceeds the model's MaxInputTokens — clamped to ${budget.MaxTokens}`,
                true,
                params
            );
        }
        return budget;
    }

    public override async CheckPreTurnCompaction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        config: AgentConfiguration | undefined
    ): Promise<void> {
        if (!params.conversationId || ctx.Depth !== 0 || params.ConversationHistoryFrom) {
            return;
        }
        const budget = ctx.Hooks.ResolveCompactionBudget(params, config);
        if (budget.BoundedBy !== 'Agent' && budget.BoundedBy !== 'AgentType') {
            return;
        }
        const estimatedTokens = ctx.Hooks.EstimateConversationTokens(params.conversationMessages);
        if (estimatedTokens < budget.TriggerTokens) {
            return;
        }
        ctx.Hooks.LogStatus(
            `🗜️ [CrossTurnCompaction] Pre-turn window ~${estimatedTokens} tokens ≥ trigger ${budget.TriggerTokens} — compacting before first prompt`,
            true,
            params
        );
        const outcome = await ctx.Hooks.RunCrossTurnCompaction('pre-turn', params, config, budget);
        if (outcome?.Fired && outcome.BoundarySequence !== undefined && outcome.SummaryText) {
            this.applyCompactionToLiveMessages(params.conversationMessages, outcome.BoundarySequence, outcome.SummaryText);
        }
    }

    public override StartPostTurnCompaction(ctx: AgentRunContext): void {
        const params = ctx.ExecuteParams;
        if (params?.ConversationHistoryFrom) {
            ctx.Hooks.LogStatus('Post-turn compaction skipped — the run has a history floor', true, params);
            return;
        }
        if (
            !params?.conversationId ||
            ctx.Depth !== 0 ||
            !ctx.AgentRun ||
            !AgentStoppedRunContinuationHelper.SettledRunStatuses.includes(ctx.AgentRun.Status)
        ) {
            ctx.Hooks.LogStatus(
                `Post-turn compaction skipped — conversationId=${params?.conversationId ?? 'none'}, ` +
                    `depth=${ctx.Depth}, runStatus=${ctx.AgentRun?.Status ?? 'no run'} ` +
                    `(requires a root run with a conversation, settled as ${AgentStoppedRunContinuationHelper.SettledRunStatuses.join('/')})`,
                true,
                params
            );
            return;
        }
        const config = ctx.AgentConfig;
        const budget = ctx.Hooks.ResolveCompactionBudget(params, config);
        void ctx.Hooks.RunCrossTurnCompaction('post-turn', params, config, budget).catch(error => {
            LogError(`Post-turn cross-turn compaction error (contained): ${error instanceof Error ? error.message : error}`);
        });
    }

    public override async RunCrossTurnCompaction(
        ctx: AgentRunContext,
        phase: 'pre-turn' | 'post-turn',
        params: ExecuteAgentParams,
        config: AgentConfiguration | undefined,
        budget: EffectiveContextBudget
    ): Promise<CompactionOutcome | undefined> {
        if (!params.conversationId || !ctx.AgentRun) {
            return undefined;
        }
        const outcome = await ConversationCompactionManager.CompactIfNeeded({
            ConversationId: params.conversationId,
            BranchID: params.ConversationBranchID ?? null,
            Agent: params.agent,
            AgentType: config?.agentType || null,
            Budget: budget,
            ContextUser: params.contextUser,
            Provider: ctx.ProviderToUse,
            ExecutionScope: ctx.Hooks.RunPromptExecutionScope(params),
            EstimateTokens: (messages) => ctx.Hooks.EstimateConversationTokens(messages),
            Verbose: params.verbose,
            ExcludeDetailIds: params.conversationDetailId ? [params.conversationDetailId] : undefined,
        });

        if (outcome.Fired || outcome.ErrorMessage) {
            await ctx.Hooks.RecordCompactionRunStep(phase, params, budget, outcome);
        }
        return outcome;
    }

    public override async RecordCompactionRunStep(
        ctx: AgentRunContext,
        phase: 'pre-turn' | 'post-turn',
        params: ExecuteAgentParams,
        budget: EffectiveContextBudget,
        outcome: CompactionOutcome
    ): Promise<void> {
        try {
            const stepEntity = await ctx.Hooks.CreateStepEntity({
                stepType: 'Compaction',
                stepName: `Cross-Turn Conversation Compaction (${phase})`,
                contextUser: params.contextUser,
                targetId: outcome.PromptId,
                targetLogId: outcome.PromptRunId,
                inputData: {
                    phase,
                    conversationId: params.conversationId,
                    budget,
                },
                completed: {
                    success: !outcome.ErrorMessage,
                    errorMessage: outcome.ErrorMessage,
                    outputData: {
                        fired: outcome.Fired,
                        boundarySequence: outcome.BoundarySequence,
                        tokensBefore: outcome.TokensBefore,
                        tokensAfter: outcome.TokensAfter,
                        summaryLength: outcome.SummaryText?.length,
                        promptRunId: outcome.PromptRunId,
                        warnings: outcome.Warnings,
                    },
                },
            });
            if (outcome.PromptRun) {
                stepEntity.PromptRun = outcome.PromptRun;
                ctx.Hooks.RecordPromptUsageInTreeBudget(outcome.PromptRun, undefined, params);
            }
            if (phase === 'post-turn') {
                await Promise.all([ctx.StepSaveQueue.Flush(), ctx.Hooks.FlushPromptRunnerSaves()]);
                await this.topUpRunTokenTotalsAfterPostTurnCompaction(ctx, outcome, params.contextUser);
            }
        } catch (error) {
            LogError(
                `Failed to record Compaction run step (compaction itself ${outcome.Fired ? 'succeeded' : 'failed'}): ${error instanceof Error ? error.message : error}`
            );
        }
    }

    private async topUpRunTokenTotalsAfterPostTurnCompaction(
        ctx: AgentRunContext,
        outcome: CompactionOutcome,
        contextUser: UserInfo
    ): Promise<void> {
        if (!outcome.Fired || !outcome.PromptRun || !ctx.AgentRun) {
            return;
        }
        const tokenStats = ctx.Hooks.CalculateTokenStats();
        const runUpdate = await ctx.ActiveProvider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        if (!(await runUpdate.Load(ctx.AgentRun.ID))) {
            LogError(`Post-turn compaction token top-up: failed to load run ${ctx.AgentRun.ID}`);
            return;
        }
        ctx.Hooks.ApplyTokenStatsToRun(runUpdate, tokenStats);
        if (!(await runUpdate.Save())) {
            LogError(
                `Post-turn compaction token top-up: save failed for run ${ctx.AgentRun.ID}: ${runUpdate.LatestResult?.CompleteMessage || 'unknown error'}`
            );
        }
    }

    private applyCompactionToLiveMessages(messages: ChatMessage[], boundarySequence: number, summaryText: string): void {
        const retained: ChatMessage[] = [];
        let summaryInserted = false;
        for (const message of messages) {
            const metadata = (message as AgentChatMessage).metadata;
            const covered =
                metadata?.isConversationSummary === true ||
                (metadata?.sequence !== undefined && metadata.sequence < boundarySequence);
            if (covered) {
                if (!summaryInserted) {
                    const summaryMessage: AgentChatMessage = {
                        role: 'user',
                        content: summaryText,
                        metadata: {
                            isConversationSummary: true,
                            summaryBoundarySequence: boundarySequence,
                            sequence: boundarySequence,
                        },
                    };
                    retained.push(summaryMessage);
                    summaryInserted = true;
                }
            } else {
                retained.push(message);
            }
        }
        messages.length = 0;
        messages.push(...retained);
    }

    // --- Post-run compaction & memory extraction ---

    public override async RunPostRunCompaction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        if (!params?.compactAfterRun) {
            return;
        }

        const rawConfig: AgentPostRunCompactionConfig =
            params.compactAfterRun === true
                ? { enabled: true, messageCountThreshold: 20, extractMemories: true }
                : params.compactAfterRun;

        if (!rawConfig.enabled) {
            return;
        }

        const messageCountThreshold = rawConfig.messageCountThreshold ?? 20;
        const extractMemories = rawConfig.extractMemories ?? true;
        const maxScratchpadNotes = rawConfig.maxScratchpadNotes;
        if (params.onMessageLifecycle && !ctx.MessageLifecycleCallback) {
            ctx.MessageLifecycleCallback = params.onMessageLifecycle;
        }

        try {
            const messages = params.conversationMessages;
            if (Array.isArray(messages) && messages.length >= messageCountThreshold && messages.length >= 3) {
                const totalMessages = messages.length;
                const preserveRecentCount = totalMessages <= 3 ? 1 : totalMessages < 9 ? 2 : 4;
                const compactEndIndex = totalMessages - preserveRecentCount;
                const preserveOriginal = params.messageExpirationOverride?.preserveOriginalContent !== false;
                let compactedCount = 0;
                let totalTokensSaved = 0;

                for (let i = 1; i < compactEndIndex; i++) {
                    const msg = messages[i] as AgentChatMessage;
                    const metaWithLegacyFlag = msg?.metadata as (AgentChatMessageMetadata & { isCompacted?: boolean }) | undefined;
                    if (
                        !msg ||
                        msg.role === 'system' ||
                        metaWithLegacyFlag?.wasCompacted === true ||
                        metaWithLegacyFlag?.isCompacted === true ||
                        metaWithLegacyFlag?.isConversationSummary === true ||
                        metaWithLegacyFlag?.volatileState === true ||
                        Boolean(msg.toolCalls?.length) ||
                        !ctx.Hooks.IsVolatileResultMessage(msg)
                    ) {
                        continue;
                    }

                    const originalContent = msg.content;
                    const originalText = ReplaceMediaBlocksWithStubs(originalContent);
                    const compactMode =
                        msg.metadata?.compactMode || params.messageExpirationOverride?.compactMode || 'First N Chars';
                    const compactLength =
                        msg.metadata?.compactLength || params.messageExpirationOverride?.compactLength || 200;
                    const compactPromptId =
                        msg.metadata?.compactPromptId || params.messageExpirationOverride?.compactPromptId || '';

                    if (msg.role === 'tool') {
                        const compactedTurn = CompactToolResultContent(msg, (t) =>
                            TruncatePreservingUntrustedEnvelope(t, compactLength, (len) => `[compacted from ${len} chars]`)
                        );
                        const saved = Math.max(
                            0,
                            ctx.Hooks.EstimateTokens(originalContent) - ctx.Hooks.EstimateTokens(compactedTurn.content)
                        );
                        messages[i] = {
                            ...compactedTurn,
                            metadata: {
                                ...msg.metadata,
                                wasCompacted: true,
                                originalContent: preserveOriginal ? originalContent : undefined,
                                originalLength: originalText.length,
                                tokensSaved: saved,
                                canExpand: preserveOriginal,
                            },
                        };
                        totalTokensSaved += saved;
                        compactedCount++;
                        ctx.Hooks.EmitMessageLifecycleEvent({
                            type: 'message-compacted',
                            turn: 0,
                            messageIndex: i,
                            message: messages[i] as AgentChatMessage,
                            reason: `Post-run compaction of tool turn (saved ${saved} tokens)`,
                            tokensSaved: saved,
                        });
                        continue;
                    }

                    const compactedContent = await ctx.Hooks.CompactMessage(
                        msg,
                        {
                            compactMode,
                            compactLength,
                            compactPromptId,
                            originalLength: originalText.length,
                            includeArtifactHints: false,
                        },
                        params
                    );

                    const originalTokens = ctx.Hooks.EstimateTokens(originalContent);
                    const compactedTokens = ctx.Hooks.EstimateTokens(compactedContent);
                    const tokensSaved = Math.max(0, originalTokens - compactedTokens);

                    messages[i] = {
                        ...msg,
                        content: compactedContent,
                        metadata: {
                            ...msg.metadata,
                            wasCompacted: true,
                            originalContent: preserveOriginal ? originalContent : undefined,
                            originalLength: originalText.length,
                            tokensSaved,
                            canExpand: preserveOriginal,
                        },
                    };
                    totalTokensSaved += tokensSaved;
                    compactedCount++;

                    ctx.Hooks.EmitMessageLifecycleEvent({
                        type: 'message-compacted',
                        turn: 0,
                        messageIndex: i,
                        message: messages[i] as AgentChatMessage,
                        reason: `Post-run compaction using ${compactMode} (saved ${tokensSaved} tokens)`,
                        tokensSaved,
                    });
                }

                if (compactedCount > 0) {
                    ctx.Hooks.LogStatus(
                        `🗜️ [PostRunCompaction] Compacted ${compactedCount} older message(s) (saved ~${totalTokensSaved} tokens; preserved index 0 and last ${preserveRecentCount} message(s))`,
                        true,
                        params
                    );
                }
            }
        } catch (error) {
            LogError(`Post-run message window compaction failed (contained): ${error instanceof Error ? error.message : String(error)}`);
        }

        if (maxScratchpadNotes !== undefined && maxScratchpadNotes >= 0) {
            try {
                const prunedNotes = ctx.ScratchpadManager.PruneNotes(maxScratchpadNotes);
                const prunedTasks = ctx.ScratchpadManager.EnforceTaskLimit(maxScratchpadNotes);
                if (prunedNotes > 0 || prunedTasks > 0) {
                    ctx.Hooks.LogStatus(
                        `🧹 [PostRunCompaction] Pruned ${prunedNotes} scratchpad note line(s) and ${prunedTasks} completed task(s) (limit: ${maxScratchpadNotes})`,
                        true,
                        params
                    );
                }
            } catch (error) {
                LogError(`Post-run scratchpad pruning failed (contained): ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (extractMemories && agentRun?.Success) {
            try {
                await ctx.Hooks.TriggerPostRunMemoryExtraction(params, agentRun);
            } catch (error) {
                LogError(`Post-run memory extraction failed (contained): ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    public override async TriggerPostRunMemoryExtraction(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<void> {
        const agent = params?.agent;
        if (!agent || (!agent.InjectNotes && !agent.InjectExamples)) {
            return;
        }
        if (agent.DriverClass === 'MemoryManagerAgent' || agent.Name === 'Memory Manager') {
            return;
        }

        const allAgents = AIEngine.Instance?.Agents ?? [];
        const memoryManagerEntity = allAgents.find(
            a => a.Status === 'Active' && (a.DriverClass === 'MemoryManagerAgent' || a.Name === 'Memory Manager')
        );
        if (!memoryManagerEntity || !params.contextUser) {
            return;
        }

        let memoryAgent: { Execute(execParams: ExecuteAgentParams): Promise<unknown> };
        try {
            memoryAgent = await ctx.Hooks.CreateMemoryManagerAgent(memoryManagerEntity);
        } catch (error) {
            LogError(`Post-run MemoryManager not started: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }

        void memoryAgent
            .Execute({
                agent: memoryManagerEntity,
                conversationMessages: [],
                contextUser: params.contextUser,
                provider: params.provider,
                data: {
                    sourceAgentId: agent.ID,
                    sourceAgentRunId: agentRun.ID,
                    conversationId: params.conversationId,
                },
            })
            .catch(error => {
                LogError(`Async post-run MemoryManager execution failed (contained): ${error instanceof Error ? error.message : String(error)}`);
            });
    }

    // --- Single-message compaction & expansion ---

    public override CreateCompactionStep(
        ctx: AgentRunContext,
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        return this._recoveryHelper.CreateCompactionStep(ctx, prompt, message, params);
    }

    public override UpdateCompactionStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<void> {
        return this._recoveryHelper.UpdateCompactionStep(ctx, step, result, message, params);
    }

    public override async CompactMessage(
        ctx: AgentRunContext,
        message: AgentChatMessage,
        metadata: CompactMessageMetadata,
        params: ExecuteAgentParams
    ): Promise<string> {
        const originalContent = ReplaceMediaBlocksWithStubs(message.content);
        const envelope = ExtractUntrustedEnvelope(originalContent);
        const allowArtifactHints = metadata.includeArtifactHints !== false;

        switch (metadata.compactMode) {
            case 'First N Chars': {
                const length = metadata.compactLength;
                const bodyToCompact = envelope ? envelope.UnwrappedText : originalContent;
                if (bodyToCompact.length <= length) {
                    return originalContent;
                }

                const toolsEnabled = allowArtifactHints && ctx.Hooks.AreArtifactToolsEnabled(params);
                if (toolsEnabled) {
                    ctx.ActionSpilloverManager.Materialize(message);
                }

                const expandable = !(message.role === 'tool' && ctx.Hooks.GetNativeControlConfig(params).NativeOnly);
                const artifactHint = toolsEnabled
                    ? ActionResultSpilloverManager.FormatSpilloverHint(
                          message.metadata?.artifactIds,
                          ctx.ArtifactToolManager.HasArtifacts()
                      )
                    : '';
                return this._recoveryHelper.FormatFirstNCharsCompaction(bodyToCompact, envelope, length, expandable, artifactHint);
            }

            case 'AI Summary': {
                try {
                    const promptId = metadata.compactPromptId || ctx.Hooks.GetSystemDefaultCompactPromptId();
                    const prompt = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId));

                    if (!prompt) {
                        console.warn(`Compact prompt ${promptId} not found, falling back to First N Chars`);
                        return ctx.Hooks.CompactMessage(message, { ...metadata, compactMode: 'First N Chars' }, params);
                    }

                    const step = await ctx.Hooks.CreateCompactionStep(prompt, message, params);

                    const promptParams = new AIPromptParams();
                    Object.assign(promptParams, ctx.Hooks.RunPromptExecutionScope(params));
                    promptParams.prompt = prompt;
                    promptParams.data = {
                        originalContent,
                        originalLength: metadata.originalLength,
                        targetLength: metadata.compactLength || 500,
                        messageType: message.metadata?.messageType || 'unknown',
                        turnAdded: message.metadata?.turnAdded || 0,
                    };
                    promptParams.agentId = params.agent.ID;
                    promptParams.UserID =
                        ResolvePromptRunUserID({
                            UserID: params.userId,
                            AgentRun: ctx.AgentRun,
                            ContextUser: params.contextUser,
                        }) ?? undefined;
                    promptParams.onPromptRunCreated = async (promptRunId: string) => {
                        step.TargetLogID = promptRunId;
                        ctx.Hooks.QueueStepSave(step, (s) => {
                            s.TargetLogID = promptRunId;
                        });
                    };

                    const result = await ctx.PromptRunner.ExecutePrompt<{ summary: string }>(promptParams);
                    ctx.Hooks.RecordPromptUsageInTreeBudget(result.promptRun, result, params);
                    await ctx.Hooks.UpdateCompactionStep(step, result, message, params);

                    if (!result.success || !result.result?.summary) {
                        console.warn('AI summary failed, falling back to First N Chars');
                        return ctx.Hooks.CompactMessage(message, { ...metadata, compactMode: 'First N Chars' }, params);
                    }

                    const toolsEnabled = allowArtifactHints && ctx.Hooks.AreArtifactToolsEnabled(params);
                    if (toolsEnabled) {
                        ctx.ActionSpilloverManager.Materialize(message);
                    }
                    const expandable = !(message.role === 'tool' && ctx.Hooks.GetNativeControlConfig(params).NativeOnly);
                    const artifactHint = toolsEnabled
                        ? ActionResultSpilloverManager.FormatSpilloverHint(
                              message.metadata?.artifactIds,
                              ctx.ArtifactToolManager.HasArtifacts()
                          )
                        : '';
                    const rawSummary = ExtractUntrustedEnvelope(result.result.summary)?.UnwrappedText ?? result.result.summary;
                    const renderedSummary = envelope
                        ? WrapUntrustedExternalData(rawSummary, envelope.Source, envelope.TrustLevel)
                        : rawSummary;
                    return `[AI Summary of ${metadata.originalLength} chars.${expandable ? ' Agent can request full expansion if needed.' : ''}${artifactHint}]\n\n${renderedSummary}`;
                } catch (error) {
                    console.error('Error during AI summary:', error);
                    return ctx.Hooks.CompactMessage(message, { ...metadata, compactMode: 'First N Chars' }, params);
                }
            }

            default:
                return originalContent;
        }
    }

    public override GetSystemDefaultCompactPromptId(ctx: AgentRunContext): string {
        return this._recoveryHelper.GetSystemDefaultCompactPromptId(ctx);
    }

    public override ExecuteExpandMessageStep(
        ctx: AgentRunContext,
        request: BaseAgentNextStep,
        params: ExecuteAgentParams,
        currentTurn: number
    ): string | null {
        return this._recoveryHelper.ExecuteExpandMessageStep(ctx, request, params, currentTurn);
    }
}
