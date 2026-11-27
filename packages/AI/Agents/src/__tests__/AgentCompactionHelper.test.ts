import { describe, expect, it, vi } from 'vitest';
import type { AgentChatMessage, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { AgentCompactionHelper } from '../helpers/compaction/AgentCompactionHelper';
import { BaseAgentCompactionHelper } from '../helpers/compaction/BaseAgentCompactionHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentCompactionHelper (Slice s3)', () => {
    it('resolves default AgentCompactionHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'compaction',
            BaseClass: BaseAgentCompactionHelper,
            DefaultClass: AgentCompactionHelper,
        });
        expect(helper).toBeInstanceOf(AgentCompactionHelper);
    });

    it('estimates tokens deterministically for English prose and JSON/code strings', () => {
        const helper = new AgentCompactionHelper();
        const ctx = CreateMockAgentRunContext();

        const proseTokens = helper.HeuristicTokenCount(ctx, 'The quick brown fox jumps over the lazy dog.');
        const jsonTokens = helper.HeuristicTokenCount(ctx, '{"records":[{"id":"abc-123","status":"active","count":42}]}');

        expect(proseTokens).toBeGreaterThan(0);
        expect(jsonTokens).toBeGreaterThan(0);
        expect(helper.EstimateTokens(ctx, '')).toBe(0);
    });

    it('smart-trims large JSON arrays and objects while preserving structure', () => {
        const helper = new AgentCompactionHelper();
        const ctx = CreateMockAgentRunContext();

        const bigArray = JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ id: i, label: `item-${i}` })));
        const trimmedArray = helper.SmartTrimContent(ctx, bigArray, 500);
        expect(trimmedArray.strategy).toBe('JSON array truncation');
        expect(trimmedArray.trimmed).toContain('15 more items truncated');

        const longProse = 'a'.repeat(2500);
        const trimmedProse = helper.SmartTrimContent(ctx, longProse, 400);
        expect(trimmedProse.trimmed.length).toBeLessThan(longProse.length);
    });

    it('expands a compacted expandable message and emits message-expanded lifecycle event', () => {
        const helper = new AgentCompactionHelper();
        const emitSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                EmitMessageLifecycleEvent: emitSpy,
            },
        });

        const msg: AgentChatMessage = {
            role: 'user',
            content: '[Compacted preview]',
            metadata: {
                wasCompacted: true,
                canExpand: true,
                originalContent: 'Full original message payload',
                turnAdded: 1,
            },
        };
        const params = {
            conversationMessages: [msg],
        } as unknown as ExecuteAgentParams;
        const step: BaseAgentNextStep = {
            step: 'ExpandMessage',
            messageIndex: 0,
            expandReason: 'Need full details',
            terminate: false,
            previousPayload: {},
            newPayload: {},
        };

        const err = helper.ExecuteExpandMessageStep(ctx, step, params, 3);
        expect(err).toBeNull();
        expect(msg.content).toBe('Full original message payload');
        expect(msg.metadata?.wasCompacted).toBe(false);
        expect(msg.metadata?.canExpand).toBe(false);
        expect(msg.metadata?.originalContent).toBeUndefined();
        expect(emitSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'message-expanded',
                turn: 3,
                messageIndex: 0,
                reason: 'Need full details',
            })
        );
    });

    it('returns model-facing guidance when asked to expand a non-expandable or out-of-bounds message', () => {
        const helper = new AgentCompactionHelper();
        const ctx = CreateMockAgentRunContext();
        const summaryMsg: AgentChatMessage = {
            role: 'user',
            content: 'Summary of earlier turns',
            metadata: {
                isConversationSummary: true,
                canExpand: false,
            },
        };
        const params = {
            conversationMessages: [summaryMsg],
        } as unknown as ExecuteAgentParams;

        const outOfBounds = helper.ExecuteExpandMessageStep(
            ctx,
            { step: 'ExpandMessage', messageIndex: 5, terminate: false, previousPayload: {}, newPayload: {} },
            params,
            2
        );
        expect(outOfBounds).toContain('out of bounds');

        const summaryErr = helper.ExecuteExpandMessageStep(
            ctx,
            { step: 'ExpandMessage', messageIndex: 0, terminate: false, previousPayload: {}, newPayload: {} },
            params,
            2
        );
        expect(summaryErr).toContain('cross-turn conversation summary');
    });

    it('compacts First N Chars messages cleanly and preserves short messages', async () => {
        const helper = new AgentCompactionHelper();
        const ctx = CreateMockAgentRunContext();
        const params = { conversationMessages: [] } as unknown as ExecuteAgentParams;

        const shortMsg: AgentChatMessage = { role: 'user', content: 'Short text' };
        const unchanged = await helper.CompactMessage(
            ctx,
            shortMsg,
            { compactMode: 'First N Chars', compactLength: 100, compactPromptId: '', originalLength: 10 },
            params
        );
        expect(unchanged).toBe('Short text');

        const longMsg: AgentChatMessage = { role: 'user', content: 'X'.repeat(400) };
        const compacted = await helper.CompactMessage(
            ctx,
            longMsg,
            { compactMode: 'First N Chars', compactLength: 80, compactPromptId: '', originalLength: 400 },
            params
        );
        expect(compacted).toContain('X'.repeat(80));
        expect(compacted).toContain('showing first 80 of 400 characters');
    });

    it('evaluates mid-loop compaction threshold using resolved budget and toolCall arguments', () => {
        const helper = new AgentCompactionHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveCompactionBudget: () => ({
                    ContextWindowTokens: 1000,
                    TriggerTokens: 20,
                    TargetTokens: 10,
                    MaxCompactionTokens: 10,
                    KeepRecentMessages: 2,
                    Enabled: true,
                    Source: 'agent',
                }),
            },
        });

        const belowParams = {
            conversationMessages: [{ role: 'user', content: 'hi' }],
        } as unknown as ExecuteAgentParams;
        expect(helper.IsMidLoopCompactionThresholdReached(ctx, belowParams)).toBe(false);

        const aboveParams = {
            conversationMessages: [{ role: 'user', content: 'a'.repeat(200) }],
        } as unknown as ExecuteAgentParams;
        expect(helper.IsMidLoopCompactionThresholdReached(ctx, aboveParams)).toBe(true);
    });
});
