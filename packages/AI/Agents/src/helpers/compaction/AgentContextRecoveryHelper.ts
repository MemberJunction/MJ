/**
 * @fileoverview Cohesive internal collaborator handling context-length overflow recovery
 * strategies, smart content trimming, message classification, and zero-allocation token
 * estimation.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s3`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage, ChatMessageContent } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    AIModelSelectionInfo,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { initAgentRunStep } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { LimitsConfigResolver } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import {
    ExtractUntrustedEnvelope,
    IMAGE_BLOCK_TOKEN_ESTIMATE,
    IsMediaBlock,
    ReplaceMediaBlocksWithStubs,
    TruncatePreservingUntrustedEnvelope,
    type UntrustedEnvelopeMatch,
    WrapUntrustedExternalData,
} from '../../client-tool-results';
import { ConversationToolNames } from '../../ConversationToolManager';
import { CompactToolResultContent } from '../../native-tools/tool-result-turns';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentStoppedRunContinuationHelper } from '../messaging/AgentStoppedRunContinuationHelper';

/**
 * Handles context-length overflow recovery, smart trimming, and token estimation on behalf
 * of {@link AgentCompactionHelper}.
 */
export class AgentContextRecoveryHelper {
    public ContentToString(_ctx: AgentRunContext, content: ChatMessageContent): string {
        return ReplaceMediaBlocksWithStubs(content);
    }

    public SmartTrimContent(
        _ctx: AgentRunContext,
        content: string,
        maxLength: number = 1000
    ): { trimmed: string; strategy: string; originalLength: number } {
        const originalLength = content.length;

        try {
            const data: unknown = JSON.parse(content);

            if (Array.isArray(data)) {
                const itemsToKeep = 10;
                if (data.length > itemsToKeep) {
                    const truncated = data.slice(0, itemsToKeep);
                    const trimmed =
                        JSON.stringify(truncated, null, 2) +
                        `\n\n... (${(data.length - itemsToKeep).toLocaleString()} more items truncated due to context length)`;
                    return {
                        trimmed,
                        strategy: 'JSON array truncation',
                        originalLength,
                    };
                }
            } else if (typeof data === 'object' && data !== null) {
                const truncated: Record<string, unknown> = {};
                let fieldCount = 0;
                const maxFields = 20;

                for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
                    if (fieldCount >= maxFields) {
                        truncated['...'] = `(${Object.keys(data).length - maxFields} more fields truncated)`;
                        break;
                    }
                    if (typeof value === 'string' && value.length > 200) {
                        truncated[key] = value.substring(0, 200) + '... (truncated)';
                    } else if (Array.isArray(value) && value.length > 5) {
                        truncated[key] = [...value.slice(0, 5), `... (${value.length - 5} more items)`];
                    } else {
                        truncated[key] = value;
                    }
                    fieldCount++;
                }

                return {
                    trimmed: JSON.stringify(truncated, null, 2),
                    strategy: 'JSON object field truncation',
                    originalLength,
                };
            }
        } catch {
            // Not JSON, continue to other strategies
        }

        if (content.includes('\n')) {
            const lines = content.split('\n');
            const firstLine = lines[0];
            if (firstLine.includes(',') && lines.length > 1) {
                const rowsToKeep = 10;
                if (lines.length > rowsToKeep + 1) {
                    const header = lines[0];
                    const dataRows = lines.slice(1, rowsToKeep + 1);
                    const trimmed =
                        [header, ...dataRows].join('\n') +
                        `\n... (${(lines.length - rowsToKeep - 1).toLocaleString()} more rows truncated due to context length)`;
                    return {
                        trimmed,
                        strategy: 'CSV row truncation',
                        originalLength,
                    };
                }
            }
        }

        if (content.length > maxLength) {
            return {
                trimmed: content.substring(0, maxLength) + '\n\n... (truncated due to context length)',
                strategy: 'character truncation',
                originalLength,
            };
        }

        return {
            trimmed: content,
            strategy: 'no truncation needed',
            originalLength,
        };
    }

    public IsToolResultMessage(_ctx: AgentRunContext, msg: ChatMessage): boolean {
        const messageType = (msg as AgentChatMessage).metadata?.messageType;
        return (
            messageType === 'action-result' ||
            messageType === 'client-tool-result' ||
            messageType === AgentStoppedRunContinuationHelper.ToolResultMessageType
        );
    }

    public IsVolatileResultMessage(_ctx: AgentRunContext, msg: ChatMessage): boolean {
        const messageType = (msg as AgentChatMessage).metadata?.messageType;
        return (
            messageType === 'action-result' ||
            messageType === 'client-tool-result' ||
            messageType === AgentStoppedRunContinuationHelper.ToolResultMessageType ||
            messageType === 'sub-agent-result' ||
            messageType === 'sub-agent-consult' ||
            messageType === 'loop-result'
        );
    }

    public EstimateTokens(ctx: AgentRunContext, content: ChatMessage['content'], _modelName?: string): number {
        if (typeof content === 'string') {
            return ctx.Hooks.HeuristicTokenCount(content);
        }
        let tokens = 0;
        for (const block of content) {
            tokens += IsMediaBlock(block) ? IMAGE_BLOCK_TOKEN_ESTIMATE : ctx.Hooks.HeuristicTokenCount(block.content);
        }
        return tokens;
    }

    public HeuristicTokenCount(_ctx: AgentRunContext, text: string): number {
        const charCount = text.length;
        let structuralChars = 0;
        let whitespaceChars = 0;

        for (let i = 0; i < charCount; i++) {
            const code = text.charCodeAt(i);
            if (code === 123 || code === 125 || code === 91 || code === 93 || code === 44 || code === 58) {
                structuralChars++;
            } else if (code === 32 || (code >= 9 && code <= 13)) {
                whitespaceChars++;
            } else if (code >= 0x00a0 && /\s/.test(text[i])) {
                whitespaceChars++;
            }
        }

        const effectiveChars = charCount - whitespaceChars * 0.5;
        const baseTokens = effectiveChars / 4;
        const structuralTokens = structuralChars * 0.05;
        return Math.ceil(baseTokens + structuralTokens);
    }

    public GetModelContextLimit(ctx: AgentRunContext, modelSelectionInfo?: AIModelSelectionInfo): number {
        const defaultLimit = LimitsConfigResolver.Resolve().Limits.Tuning.CompactionDefaultContextTokens;
        const known = modelSelectionInfo ? ctx.Hooks.TryGetModelMaxInputTokens(modelSelectionInfo) : null;
        if (known === null) {
            ctx.Hooks.LogStatus(`Could not determine model context limit, using default limit: ${defaultLimit}`, true);
        }
        return known || defaultLimit;
    }

    public TryGetModelMaxInputTokens(ctx: AgentRunContext, modelSelectionInfo: AIModelSelectionInfo): number | null {
        try {
            const modelSelected = modelSelectionInfo.modelSelected;
            const vendorSelected = modelSelectionInfo.vendorSelected;
            if (!modelSelected || !vendorSelected) {
                return null;
            }

            const modelVendors = modelSelected.ModelVendors;
            if (!modelVendors || modelVendors.length === 0) {
                return null;
            }

            const vendorEntry = modelVendors.find((mv: { VendorID: string; MaxInputTokens: number | null }) =>
                UUIDsEqual(mv.VendorID, vendorSelected.ID)
            );
            if (!vendorEntry || !vendorEntry.MaxInputTokens || vendorEntry.MaxInputTokens <= 0) {
                return null;
            }

            ctx.Hooks.LogStatus(
                `Using vendor-specific MaxInputTokens: ${vendorEntry.MaxInputTokens} (Model: ${modelSelected.Name}, Vendor: ${vendorSelected.Name})`,
                true
            );
            return vendorEntry.MaxInputTokens;
        } catch (error) {
            ctx.Hooks.LogStatus(`Error extracting model context limit: ${error}`, true);
            return null;
        }
    }

    public EstimateConversationTokens(ctx: AgentRunContext, messages: ChatMessage[]): number {
        return messages.reduce((total, msg) => total + ctx.Hooks.EstimateTokens(msg.content), 0);
    }

    public FormatFirstNCharsCompaction(
        body: string,
        envelope: UntrustedEnvelopeMatch | null,
        maxChars: number,
        expandable: boolean,
        artifactHint: string
    ): string {
        const truncated = `${body.substring(0, maxChars)}...`;
        const renderedBody = envelope
            ? WrapUntrustedExternalData(truncated, envelope.Source, envelope.TrustLevel)
            : truncated;
        return `${renderedBody}\n\n[Compacted: showing first ${maxChars} of ${body.length} characters.${expandable ? ' Agent can request expansion if needed.' : ''}${artifactHint}]`;
    }

    private formatToolRecoveryTurn(message: AgentChatMessage, maxChars: number, artifactHint: string): AgentChatMessage {
        return CompactToolResultContent(message, (t) =>
            TruncatePreservingUntrustedEnvelope(t, maxChars, (len) => `[compacted from ${len} chars${artifactHint ? `.${artifactHint}` : ''}]`)
        );
    }

    private estimateSpilloverHintText(ctx: AgentRunContext, message: AgentChatMessage, params: ExecuteAgentParams): string {
        if (!ctx.Hooks.AreArtifactToolsEnabled(params)) {
            return '';
        }
        const existingIds = ctx.ArtifactToolManager.HasArtifacts() ? (message.metadata?.artifactIds ?? []) : [];
        const pendingCount = ctx.ActionSpilloverManager.PendingCountFor(message);
        if (existingIds.length === 0 && pendingCount === 0) {
            return '';
        }
        const placeholderIds = Array.from({ length: pendingCount }, (_, idx) => String.fromCharCode(65 + (idx % 26)));
        return ActionResultSpilloverManager.FormatSpilloverHint([...existingIds, ...placeholderIds], true);
    }

    private compactToolTurnForRecovery(
        ctx: AgentRunContext,
        originalMessage: AgentChatMessage,
        maxChars: number,
        originalTokens: number,
        params: ExecuteAgentParams
    ): { compacted: AgentChatMessage; saved: number } | null {
        const toolsEnabled = ctx.Hooks.AreArtifactToolsEnabled(params);
        if (toolsEnabled && ctx.ActionSpilloverManager.HasPending(originalMessage)) {
            const previewHint = this.estimateSpilloverHintText(ctx, originalMessage, params);
            const preview = this.formatToolRecoveryTurn(originalMessage, maxChars, previewHint);
            if (originalTokens - ctx.Hooks.EstimateTokens(preview.content) <= 0) {
                return null;
            }
            ctx.ActionSpilloverManager.Materialize(originalMessage);
        }

        const hint = toolsEnabled
            ? ActionResultSpilloverManager.FormatSpilloverHint(
                  originalMessage.metadata?.artifactIds,
                  ctx.ArtifactToolManager.HasArtifacts()
              )
            : '';
        const compacted = this.formatToolRecoveryTurn(originalMessage, maxChars, hint);
        const saved = originalTokens - ctx.Hooks.EstimateTokens(compacted.content);
        return saved > 0 ? { compacted, saved } : null;
    }

    private wouldUserMessageCompactSaveTokens(
        ctx: AgentRunContext,
        originalMessage: AgentChatMessage,
        originalTokens: number,
        originalContent: string,
        maxChars: number,
        params: ExecuteAgentParams
    ): boolean {
        if (originalTokens > ctx.Hooks.EstimateTokens(originalContent)) {
            return true;
        }
        const envelope = ExtractUntrustedEnvelope(originalContent);
        const body = envelope ? envelope.UnwrappedText : originalContent;
        if (body.length <= maxChars) {
            return false;
        }
        const previewHint = this.estimateSpilloverHintText(ctx, originalMessage, params);
        const preview = this.FormatFirstNCharsCompaction(body, envelope, maxChars, true, previewHint);
        return originalTokens - ctx.Hooks.EstimateTokens(preview) > 0;
    }

    public RecoveryStrategy_DropStaleVolatileState(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number
    ): { tokensSaved: number; strategyName: string } {
        const fragmentIndices = params.conversationMessages
            .map((msg, index) => ((msg as AgentChatMessage).metadata?.volatileState === true ? index : -1))
            .filter(index => index >= 0);
        const stale = fragmentIndices.slice(0, -1);
        if (stale.length === 0) {
            return { tokensSaved: 0, strategyName: 'No stale runtime-state fragments to drop' };
        }

        let tokensSaved = 0;
        const removedIndices: number[] = [];
        for (const index of stale) {
            if (tokensSaved >= tokensToSave) break;
            removedIndices.push(index);
            tokensSaved += ctx.Hooks.EstimateTokens(params.conversationMessages[index].content);
        }

        removedIndices.sort((a, b) => b - a).forEach(index => {
            const removed = params.conversationMessages.splice(index, 1)[0];
            ctx.Hooks.EmitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentStepCount,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Context recovery - stale runtime-state fragment (append-only retention)',
                tokensSaved: ctx.Hooks.EstimateTokens(removed.content),
            });
        });

        ctx.Hooks.LogStatus(
            `Dropped ${removedIndices.length} stale runtime-state fragment(s) (${tokensSaved} tokens); ${fragmentIndices.length - removedIndices.length} retained`,
            true,
            params
        );
        return {
            tokensSaved,
            strategyName: `Dropped ${removedIndices.length} stale runtime-state fragment(s) retained for prefix caching`,
        };
    }

    public RecoveryStrategy_RemoveOldestToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 5
    ): { tokensSaved: number; strategyName: string } {
        let tokensSaved = 0;
        const removedIndices: number[] = [];

        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: ctx.Hooks.EstimateTokens(msg.content),
                isToolResult: ctx.Hooks.IsToolResultMessage(msg),
            }))
            .filter(c => c.isToolResult && c.age >= minAge)
            .sort((a, b) => b.age - a.age);

        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;
            removedIndices.push(candidate.index);
            tokensSaved += candidate.tokens;
            ctx.Hooks.LogStatus(
                `Removing tool-result from ${candidate.age} turns ago (${candidate.tokens} tokens)`,
                true,
                params
            );
        }

        removedIndices.sort((a, b) => b - a).forEach(index => {
            const target = params.conversationMessages[index] as AgentChatMessage;
            const artifactIds = ctx.Hooks.AreArtifactToolsEnabled(params) ? ctx.ActionSpilloverManager.Materialize(target) : [];
            if (target.role === 'tool') {
                const artifactNote = ActionResultSpilloverManager.FormatSpilloverHint(
                    artifactIds,
                    ctx.ArtifactToolManager.HasArtifacts(),
                    'semicolon'
                );
                params.conversationMessages[index] = ctx.Hooks.StubToolTurn(
                    target,
                    `[result expired — stubbed to recover context${artifactNote}]`
                );
                ctx.Hooks.EmitMessageLifecycleEvent({
                    type: 'message-compacted',
                    turn: currentStepCount,
                    messageIndex: index,
                    message: params.conversationMessages[index] as AgentChatMessage,
                    reason: 'Context recovery - tool turn stubbed (a tool turn cannot be removed)',
                    tokensSaved: ctx.Hooks.EstimateTokens(target.content),
                });
                return;
            }
            const removed = params.conversationMessages.splice(index, 1)[0];
            ctx.Hooks.EmitMessageLifecycleEvent({
                type: 'message-removed',
                turn: currentStepCount,
                messageIndex: index,
                message: removed as AgentChatMessage,
                reason: 'Context recovery - oldest tool results',
                tokensSaved: ctx.Hooks.EstimateTokens(removed.content),
            });
        });

        return {
            tokensSaved,
            strategyName: `Removed ${removedIndices.length} old tool-results (${minAge}+ turns)`,
        };
    }

    public async RecoveryStrategy_CompactOldToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge: number = 3
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index,
                age: (msg as AgentChatMessage).metadata?.turnAdded
                    ? currentStepCount - (msg as AgentChatMessage).metadata!.turnAdded
                    : 0,
                tokens: ctx.Hooks.EstimateTokens(msg.content),
                isToolResult: ctx.Hooks.IsToolResultMessage(msg),
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true,
            }))
            .filter(c => c.isToolResult && c.age >= minAge && !c.alreadyCompacted)
            .sort((a, b) => b.age - a.age);

        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            const originalTokens = candidate.tokens;
            const originalMessage = candidate.message as AgentChatMessage;
            const originalContent = ReplaceMediaBlocksWithStubs(originalMessage.content);

            if (originalMessage.role === 'tool') {
                const toolOutcome = this.compactToolTurnForRecovery(ctx, originalMessage, 500, originalTokens, params);
                if (toolOutcome) {
                    params.conversationMessages[candidate.index] = {
                        ...toolOutcome.compacted,
                        metadata: {
                            ...originalMessage.metadata,
                            wasCompacted: true,
                            originalLength: originalContent.length,
                            tokensSaved: toolOutcome.saved,
                        },
                    };
                    tokensSaved += toolOutcome.saved;
                    compactedCount++;
                }
                continue;
            }

            if (!this.wouldUserMessageCompactSaveTokens(ctx, originalMessage, originalTokens, originalContent, 500, params)) {
                continue;
            }

            const compactedContent = await ctx.Hooks.CompactMessage(
                originalMessage,
                {
                    compactMode: 'First N Chars',
                    compactLength: 500,
                    compactPromptId: '',
                    originalLength: originalContent.length,
                },
                params
            );

            const newTokens = ctx.Hooks.EstimateTokens(compactedContent);
            const saved = originalTokens - newTokens;

            if (saved > 0) {
                params.conversationMessages[candidate.index] = {
                    ...originalMessage,
                    content: compactedContent,
                    metadata: {
                        ...originalMessage.metadata,
                        wasCompacted: true,
                        originalLength: originalContent.length,
                        tokensSaved: saved,
                    },
                };
                tokensSaved += saved;
                compactedCount++;
                ctx.Hooks.LogStatus(
                    `Compacted tool-result from ${candidate.age} turns ago (saved ${saved} tokens)`,
                    true,
                    params
                );
            }
        }

        return {
            tokensSaved,
            strategyName: `Compacted ${compactedCount} old tool-results (${minAge}+ turns)`,
        };
    }

    public async RecoveryStrategy_CompactAllToolResults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }> {
        let tokensSaved = 0;
        let compactedCount = 0;

        const candidates = params.conversationMessages
            .map((msg, index) => ({
                message: msg,
                index,
                tokens: ctx.Hooks.EstimateTokens(msg.content),
                isToolResult: ctx.Hooks.IsToolResultMessage(msg),
                alreadyCompacted: (msg as AgentChatMessage).metadata?.wasCompacted === true,
            }))
            .filter(c => c.isToolResult && !c.alreadyCompacted && c.tokens > 200)
            .sort((a, b) => b.tokens - a.tokens);

        for (const candidate of candidates) {
            if (tokensSaved >= tokensToSave) break;

            const originalTokens = candidate.tokens;
            const originalMessage = candidate.message as AgentChatMessage;
            const originalContent = ReplaceMediaBlocksWithStubs(originalMessage.content);

            if (originalMessage.role === 'tool') {
                const toolOutcome = this.compactToolTurnForRecovery(ctx, originalMessage, 200, originalTokens, params);
                if (toolOutcome) {
                    params.conversationMessages[candidate.index] = {
                        ...toolOutcome.compacted,
                        metadata: {
                            ...originalMessage.metadata,
                            wasCompacted: true,
                            originalLength: originalContent.length,
                            tokensSaved: toolOutcome.saved,
                        },
                    };
                    tokensSaved += toolOutcome.saved;
                    compactedCount++;
                }
                continue;
            }

            if (!this.wouldUserMessageCompactSaveTokens(ctx, originalMessage, originalTokens, originalContent, 200, params)) {
                continue;
            }

            const compactedContent = await ctx.Hooks.CompactMessage(
                originalMessage,
                {
                    compactMode: 'First N Chars',
                    compactLength: 200,
                    compactPromptId: '',
                    originalLength: originalContent.length,
                },
                params
            );

            const newTokens = ctx.Hooks.EstimateTokens(compactedContent);
            const saved = originalTokens - newTokens;

            if (saved > 0) {
                params.conversationMessages[candidate.index] = {
                    ...originalMessage,
                    content: compactedContent,
                    metadata: {
                        ...originalMessage.metadata,
                        wasCompacted: true,
                        originalLength: originalContent.length,
                        tokensSaved: saved,
                    },
                };
                tokensSaved += saved;
                compactedCount++;
            }
        }

        return {
            tokensSaved,
            strategyName: `Aggressively compacted ${compactedCount} tool-results`,
        };
    }

    public RecoveryStrategy_TrimLastUserMessage(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        _tokensToSave: number
    ): { tokensSaved: number; strategyName: string } {
        let lastUserMessageIndex = -1;
        for (let i = params.conversationMessages.length - 1; i >= 0; i--) {
            const candidate = params.conversationMessages[i] as AgentChatMessage;
            if (candidate.role === 'user' && candidate.metadata?.volatileState !== true) {
                lastUserMessageIndex = i;
                break;
            }
        }

        if (lastUserMessageIndex === -1) {
            return { tokensSaved: 0, strategyName: 'No user message to trim' };
        }

        const lastUserMessage = params.conversationMessages[lastUserMessageIndex];
        const originalTokens = ctx.Hooks.EstimateTokens(lastUserMessage.content);
        const contentString = ctx.Hooks.ContentToString(lastUserMessage.content);
        const targetChars = 1000;

        if (contentString.length <= targetChars) {
            return { tokensSaved: 0, strategyName: 'User message already short' };
        }

        const trimResult = ctx.Hooks.SmartTrimContent(contentString, targetChars);
        const newContent =
            trimResult.trimmed +
            '\n\n<CONTEXT_LIMIT_REACHED>\n' +
            "Note: The conversation has exceeded the model's context window. " +
            'The remainder of your message was trimmed to fit within the limit. ' +
            'The beginning of your request (shown above) has been preserved.\n' +
            '</CONTEXT_LIMIT_REACHED>';

        const newTokens = ctx.Hooks.EstimateTokens(newContent);
        const saved = originalTokens - newTokens;

        if (saved > 0) {
            params.conversationMessages[lastUserMessageIndex] = {
                ...lastUserMessage,
                content: newContent,
            };
        }

        return {
            tokensSaved: saved,
            strategyName: 'Preserved beginning of user message with context limit marker',
        };
    }

    public async AttemptContextRecovery<P>(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        payload: P,
        errorMessage: string,
        modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>> {
        ctx.Hooks.LogStatus(`⚠️ Context length exceeded - attempting recovery with multi-strategy approach`, true, params);

        const modelLimit = ctx.Hooks.GetModelContextLimit(modelSelectionInfo);
        const currentTokens = ctx.Hooks.EstimateConversationTokens(params.conversationMessages);
        const tokensToSave = currentTokens - Math.floor(modelLimit * 0.9);

        ctx.Hooks.LogStatus(
            `Need to save ~${tokensToSave} tokens (current: ${currentTokens}, limit: ${modelLimit})`,
            true,
            params
        );

        if (tokensToSave <= 0) {
            ctx.Hooks.LogStatus(`Already under context limit, retrying...`, true, params);
            return {
                step: 'Retry' as const,
                retryReason: 'Context recovery - already under limit',
                retryInstructions: 'The context is now within limits.',
                terminate: false,
                previousPayload: payload,
                newPayload: payload,
            };
        }

        const currentPromptTurn = ctx.PromptTurnCount;
        const strategies = [
            () => ctx.Hooks.RecoveryStrategy_DropStaleVolatileState(params, tokensToSave, currentPromptTurn),
            () => ctx.Hooks.RecoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentPromptTurn, 5),
            () => ctx.Hooks.RecoveryStrategy_CompactOldToolResults(params, tokensToSave, currentPromptTurn, 3),
            () => ctx.Hooks.RecoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentPromptTurn, 2),
            () => ctx.Hooks.RecoveryStrategy_CompactAllToolResults(params, tokensToSave),
            () => Promise.resolve(ctx.Hooks.RecoveryStrategy_TrimLastUserMessage(params, tokensToSave)),
        ];

        let tokensSaved = 0;
        const strategiesUsed: string[] = [];

        for (const strategy of strategies) {
            const result = await strategy();
            tokensSaved += result.tokensSaved;
            if (result.tokensSaved > 0) {
                strategiesUsed.push(result.strategyName);
                ctx.Hooks.LogStatus(`${result.strategyName}: saved ${result.tokensSaved} tokens`, true, params);
            }
            if (tokensSaved >= tokensToSave) {
                break;
            }
        }

        if (tokensSaved < tokensToSave * 0.5) {
            ctx.Hooks.LogStatus(
                `❌ Context recovery insufficient: only saved ${tokensSaved}/${tokensToSave} tokens`,
                true,
                params
            );
            return {
                errorMessage: `Context recovery failed: only saved ${tokensSaved}/${tokensToSave} tokens. ${errorMessage}`,
                step: 'Failed' as const,
                terminate: true,
                previousPayload: payload,
                newPayload: payload,
            };
        }

        ctx.Hooks.LogStatus(
            `✅ Context recovery successful: saved ${tokensSaved} tokens using ${strategiesUsed.length} strategies`,
            true,
            params
        );

        const strategyDescriptions = strategiesUsed.map((strategy, index) => `${index + 1}. ${strategy}`).join('\n');

        return {
            step: 'Retry' as const,
            retryReason: `Context recovery successful - ${tokensSaved} tokens freed`,
            retryInstructions: `The conversation exceeded the model's context limit (${modelLimit} tokens). I've applied the following context recovery strategies to free up ${tokensSaved} tokens:

${strategyDescriptions}

The context is now within limits. Please retry your request with the recovered context.`,
            terminate: false,
            previousPayload: payload,
            newPayload: payload,
        };
    }

    public async CreateCompactionStep(
        ctx: AgentRunContext,
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        if (!ctx.AgentRun) {
            throw new Error('Cannot create compaction step: agent run not initialized');
        }

        const step = await (params.provider || ctx.ActiveProvider).GetEntityObject<MJAIAgentRunStepEntityExtended>(
            'MJ: AI Agent Run Steps',
            params.contextUser
        );

        step.NewRecord();
        const stepNumber = (ctx.AgentRun.Steps?.length || 0) + 1;
        initAgentRunStep(step, {
            AgentRunID: ctx.AgentRun.ID,
            StepNumber: stepNumber,
            StepType: 'Compaction',
            StepName: ctx.Hooks.FitStepName(step, ctx.Hooks.FormatHierarchicalMessage('Message Compaction')),
            TargetID: prompt.ID,
            InputData: JSON.stringify({
                stepName: 'Message Compaction',
                description: `Compacting message using AI Summary (${message.metadata?.messageType || 'unknown'} from turn ${message.metadata?.turnAdded || 0})`,
                messageType: message.metadata?.messageType,
                turnAdded: message.metadata?.turnAdded,
                originalLength:
                    message.metadata?.originalLength ||
                    (typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length),
                compactMode: 'AI Summary',
                promptId: prompt.ID,
                promptName: prompt.Name,
            }),
        });

        ctx.StepSaveQueue.Insert(step);
        if (Array.isArray(ctx.AgentRun.Steps)) {
            ctx.AgentRun.Steps.push(step);
        }
        ctx.Hooks.EnsureTreeBudget(ctx.ExecuteParams ?? params).totalSteps += 1;

        return step;
    }

    public async UpdateCompactionStep(
        ctx: AgentRunContext,
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        _params: ExecuteAgentParams
    ): Promise<void> {
        if (result.promptRun?.ID) {
            step.TargetLogID = result.promptRun.ID;
            step.PromptRun = result.promptRun;
        }
        const promptTokens = result.promptTokens || 0;
        const completionTokens = result.completionTokens || 0;
        const outputData = {
            success: result.success,
            summaryLength: result.result?.summary?.length || 0,
            tokensSaved: message.metadata?.tokensSaved || 0,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            cost: result.cost,
        };
        const errorMessage = result.success ? undefined : result.errorMessage || 'AI Summary compaction failed';
        await ctx.Hooks.FinalizeStepEntity(step, result.success, errorMessage, outputData);
    }

    public GetSystemDefaultCompactPromptId(_ctx: AgentRunContext): string {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Compact Agent Message');
        if (!prompt) {
            console.warn('System default compact prompt not found. Ensure "Compact Agent Message" prompt exists.');
            return '';
        }
        return prompt.ID;
    }

    public ExecuteExpandMessageStep(
        ctx: AgentRunContext,
        request: BaseAgentNextStep,
        params: ExecuteAgentParams,
        currentTurn: number
    ): string | null {
        const messageIndex = request.messageIndex;
        const reason = request.expandReason;

        if (messageIndex === undefined || messageIndex < 0 || messageIndex >= params.conversationMessages.length) {
            console.warn(`Cannot expand message: index ${messageIndex} out of bounds`);
            return `message index ${messageIndex} is out of bounds — do not request this expansion again.`;
        }

        const message = params.conversationMessages[messageIndex] as AgentChatMessage;

        if (!message.metadata?.canExpand || !message.metadata?.originalContent) {
            console.warn(`Cannot expand message at index ${messageIndex}: not expandable or no original content`);
            return message.metadata?.isConversationSummary
                ? `message ${messageIndex} is the cross-turn conversation summary and has no expanded form. To read the underlying history, use the conversation history tools (${ConversationToolNames.join(', ')}) instead — do not request expansion of this message again.`
                : `message ${messageIndex} is not expandable (it carries no compacted original content) — do not request this expansion again.`;
        }

        message.content = message.metadata.originalContent;
        message.metadata.wasCompacted = false;
        message.metadata.canExpand = false;
        delete message.metadata.originalContent;

        ctx.Hooks.EmitMessageLifecycleEvent({
            type: 'message-expanded',
            turn: currentTurn,
            messageIndex,
            message,
            reason: reason || 'Agent requested expansion',
        });

        if (params.verbose) {
            console.log(`[Turn ${currentTurn}] Expanded message at index ${messageIndex}`);
        }
        return null;
    }
}
