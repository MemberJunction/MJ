/**
 * Dedicated interface-level unit tests for Slice s3 (`BaseAgentCompactionHelper` / `AgentCompactionHelper`
 * & `AgentContextRecoveryHelper`).
 * Exercises token estimation, smart trimming, mid-loop expiration/pruning, single-message compaction,
 * expansion, multi-strategy overflow recovery, cross-turn & post-run compaction, and replacement-helper plugins.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    AgentChatMessage,
    AIModelSelectionInfo,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
    MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import { DEFAULT_NATIVE_CONTROL_CONFIG } from '../native-tools/native-control-config';
import type { CompactionOutcome } from '../ConversationCompactionManager';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentCompactionHelper } from '../helpers/compaction/AgentCompactionHelper';
import { BaseAgentCompactionHelper } from '../helpers/compaction/BaseAgentCompactionHelper';
import { WrapUntrustedExternalData } from '../client-tool-results';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-1', Name: 'Compaction Tester', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: 'a-1',
        Name: 'CompactionAgent',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

function makeAgentRun(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    const partial: Partial<MJAIAgentRunEntityExtended> = {
        ID: 'r1',
        Status: 'Running',
        Steps: [],
        ...overrides,
    };
    return partial as MJAIAgentRunEntityExtended;
}

function makePromptRunResult<T>(overrides: Partial<AIPromptRunResult<T>>): AIPromptRunResult<T> {
    const partial: Partial<AIPromptRunResult<T>> = {
        success: true,
        ...overrides,
    };
    return partial as AIPromptRunResult<T>;
}

function makeStepEntity(overrides: Partial<MJAIAgentRunStepEntityExtended> = {}): MJAIAgentRunStepEntityExtended {
    const partial: Partial<MJAIAgentRunStepEntityExtended> = {
        ID: 'step-comp-1',
        StepNumber: 1,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        ...overrides,
    };
    return partial as MJAIAgentRunStepEntityExtended;
}

@RegisterClass(BaseAgentCompactionHelper, 'TestCustomCompactionHelper')
class TestCustomCompactionHelper extends AgentCompactionHelper {
    public override HeuristicTokenCount(_ctx: AgentRunContext, text: string): number {
        return text.length;
    }
}

describe('AgentCompactionHelper (Slice s3)', () => {
    const helper = new AgentCompactionHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentCompactionHelper and throws on unimplemented BaseAgentCompactionHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'compaction',
            BaseClass: BaseAgentCompactionHelper,
            DefaultClass: AgentCompactionHelper,
        });
        expect(resolved).toBeInstanceOf(AgentCompactionHelper);

        const baseToken = new BaseAgentCompactionHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.HeuristicTokenCount(ctx, 'hello')).toThrow(/must be implemented/);
        expect(() => baseToken.SmartTrimContent(ctx, 'hello')).toThrow(/must be implemented/);
        expect(() => baseToken.IsMidLoopCompactionThresholdReached(ctx, makeParams())).toThrow(/must be implemented/);
    });

    it('supports custom @RegisterClass(BaseAgentCompactionHelper) replacement override via ResolveAgentHelper and AgentHelperCache', () => {
        expect(TestCustomCompactionHelper).toBeDefined();
        const resolved = ResolveAgentHelper({
            SeamKey: 'compaction',
            BaseClass: BaseAgentCompactionHelper,
            DefaultClass: AgentCompactionHelper,
            DriverClass: 'TestCustomCompactionHelper',
        });
        expect(resolved).toBeInstanceOf(TestCustomCompactionHelper);
        expect(resolved.HeuristicTokenCount(CreateMockAgentRunContext(), 'abcdef')).toBe(6);

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'compaction', driverClass: 'TestCustomCompactionHelper' }]);
        expect(
            cache.GetOrResolve({
                SeamKey: 'compaction',
                BaseClass: BaseAgentCompactionHelper,
                DefaultClass: AgentCompactionHelper,
            })
        ).toBeInstanceOf(TestCustomCompactionHelper);
    });

    it('estimates tokens deterministically for prose, JSON, empty text, multimodal image blocks, and conversation arrays', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                HeuristicTokenCount: (t) => helper.HeuristicTokenCount(ctx, t),
                EstimateTokens: (c) => helper.EstimateTokens(ctx, c),
            },
        });

        expect(helper.EstimateTokens(ctx, '')).toBe(0);
        const proseTokens = helper.HeuristicTokenCount(ctx, 'The quick brown fox jumps over the lazy dog.');
        const jsonTokens = helper.HeuristicTokenCount(ctx, '{"records":[{"id":"abc-123","status":"active","count":42}]}');
        expect(proseTokens).toBeGreaterThan(0);
        expect(jsonTokens).toBeGreaterThan(0);

        const multimodalTokens = helper.EstimateTokens(ctx, [
            { type: 'text', content: 'Look at this image' },
            { type: 'image_url', content: 'data:image/png;base64,AAAA' },
        ]);
        expect(multimodalTokens).toBeGreaterThan(helper.EstimateTokens(ctx, 'Look at this image'));

        const convoTokens = helper.EstimateConversationTokens(ctx, [
            { role: 'user', content: 'Hello world' },
            { role: 'assistant', content: 'Hi there!' },
        ]);
        expect(convoTokens).toBe(helper.EstimateTokens(ctx, 'Hello world') + helper.EstimateTokens(ctx, 'Hi there!'));
    });

    it('converts multimodal ContentToString and classifies tool-result and volatile-result messages accurately', () => {
        const ctx = CreateMockAgentRunContext();

        expect(helper.ContentToString(ctx, 'plain text')).toBe('plain text');
        const stubbed = helper.ContentToString(ctx, [
            { type: 'text', content: 'Caption' },
            { type: 'image_url', content: 'data:image/png;base64,AAA' },
        ]);
        expect(stubbed).toContain('Caption');

        const actionMsg: AgentChatMessage = { role: 'user', content: 'a', metadata: { messageType: 'action-result' } };
        const clientToolMsg: AgentChatMessage = { role: 'user', content: 'b', metadata: { messageType: 'client-tool-result' } };
        const toolResultMsg: AgentChatMessage = { role: 'user', content: 'c', metadata: { messageType: 'tool-result' } };
        const subAgentMsg: AgentChatMessage = { role: 'user', content: 'd', metadata: { messageType: 'sub-agent-result' } };
        const loopMsg: AgentChatMessage = { role: 'user', content: 'e', metadata: { messageType: 'loop-result' } };
        const plainMsg: AgentChatMessage = { role: 'user', content: 'f' };

        expect(helper.IsToolResultMessage(ctx, actionMsg)).toBe(true);
        expect(helper.IsToolResultMessage(ctx, clientToolMsg)).toBe(true);
        expect(helper.IsToolResultMessage(ctx, toolResultMsg)).toBe(true);
        expect(helper.IsToolResultMessage(ctx, subAgentMsg)).toBe(false);
        expect(helper.IsToolResultMessage(ctx, plainMsg)).toBe(false);

        expect(helper.IsVolatileResultMessage(ctx, actionMsg)).toBe(true);
        expect(helper.IsVolatileResultMessage(ctx, subAgentMsg)).toBe(true);
        expect(helper.IsVolatileResultMessage(ctx, loopMsg)).toBe(true);
        expect(helper.IsVolatileResultMessage(ctx, plainMsg)).toBe(false);
    });

    it('smart-trims large JSON arrays, JSON objects, CSV tables, long prose, and preserves short text', () => {
        const ctx = CreateMockAgentRunContext();

        const bigArray = JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ id: i, label: `item-${i}` })));
        const trimmedArray = helper.SmartTrimContent(ctx, bigArray, 500);
        expect(trimmedArray.strategy).toBe('JSON array truncation');
        expect(trimmedArray.trimmed).toContain('15 more items truncated');

        const bigObj: Record<string, unknown> = { longStr: 'Z'.repeat(300), arr: [1, 2, 3, 4, 5, 6, 7] };
        for (let i = 0; i < 25; i++) bigObj[`k${i}`] = i;
        const trimmedObj = helper.SmartTrimContent(ctx, JSON.stringify(bigObj), 500);
        expect(trimmedObj.strategy).toBe('JSON object field truncation');
        expect(trimmedObj.trimmed).toContain('more fields truncated');
        expect(trimmedObj.trimmed).toContain('... (truncated)');
        expect(trimmedObj.trimmed).toContain('2 more items');

        const csvLines = ['id,name,val', ...Array.from({ length: 15 }, (_, i) => `${i},n${i},${i * 10}`)];
        const trimmedCsv = helper.SmartTrimContent(ctx, csvLines.join('\n'), 500);
        expect(trimmedCsv.strategy).toBe('CSV row truncation');
        expect(trimmedCsv.trimmed).toContain('5 more rows truncated');

        const longProse = 'a'.repeat(2500);
        const trimmedProse = helper.SmartTrimContent(ctx, longProse, 400);
        expect(trimmedProse.strategy).toBe('character truncation');
        expect(trimmedProse.trimmed.length).toBeLessThan(longProse.length);

        const shortText = 'short text';
        const noTrim = helper.SmartTrimContent(ctx, shortText, 400);
        expect(noTrim.strategy).toBe('no truncation needed');
        expect(noTrim.trimmed).toBe(shortText);
    });

    it('resolves vendor-specific MaxInputTokens and falls back cleanly in GetModelContextLimit', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                TryGetModelMaxInputTokens: (info) => helper.TryGetModelMaxInputTokens(ctx, info),
            },
        });
        const vendorId = '11111111-1111-4111-8111-111111111111';
        const matchInfo: Partial<AIModelSelectionInfo> = {
            modelSelected: {
                Name: 'Claude',
                ModelVendors: [{ VendorID: vendorId.toUpperCase(), MaxInputTokens: 200_000 }],
            } as AIModelSelectionInfo['modelSelected'],
            vendorSelected: { ID: vendorId, Name: 'Anthropic' } as AIModelSelectionInfo['vendorSelected'],
        };

        expect(helper.TryGetModelMaxInputTokens(ctx, matchInfo as AIModelSelectionInfo)).toBe(200_000);
        expect(helper.GetModelContextLimit(ctx, matchInfo as AIModelSelectionInfo)).toBe(200_000);

        const missingVendor: Partial<AIModelSelectionInfo> = {
            modelSelected: { Name: 'Claude', ModelVendors: [{ VendorID: 'other-id', MaxInputTokens: 0 }] } as AIModelSelectionInfo['modelSelected'],
            vendorSelected: { ID: vendorId, Name: 'Anthropic' } as AIModelSelectionInfo['vendorSelected'],
        };
        expect(helper.TryGetModelMaxInputTokens(ctx, missingVendor as AIModelSelectionInfo)).toBeNull();
        expect(helper.GetModelContextLimit(ctx, undefined)).toBeGreaterThan(0);
    });

    it('evaluates mid-loop compaction threshold including toolCalls arguments and zero/empty boundary cases', () => {
        const zeroBudgetCtx = CreateMockAgentRunContext({
            Hooks: {
                ResolveCompactionBudget: () => ({
                    MaxTokens: 1000,
                    TriggerTokens: 0,
                    TargetTokens: 0,
                    KeepRecentMessages: 2,
                    BoundedBy: 'Model',
                    ClampedToModel: false,
                }),
            },
        });
        expect(helper.IsMidLoopCompactionThresholdReached(zeroBudgetCtx, makeParams())).toBe(false);
        expect(
            helper.IsMidLoopCompactionThresholdReached(zeroBudgetCtx, makeParams({ conversationMessages: [{ role: 'user', content: 'x'.repeat(500) }] }))
        ).toBe(false);

        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveCompactionBudget: () => ({
                    MaxTokens: 1000,
                    TriggerTokens: 25,
                    TargetTokens: 10,
                    KeepRecentMessages: 2,
                    BoundedBy: 'Agent',
                    ClampedToModel: false,
                }),
            },
        });

        expect(helper.IsMidLoopCompactionThresholdReached(ctx, makeParams({ conversationMessages: [{ role: 'user', content: 'hi' }] }))).toBe(false);
        expect(
            helper.IsMidLoopCompactionThresholdReached(
                ctx,
                makeParams({
                    conversationMessages: [
                        {
                            role: 'assistant',
                            content: 'ok',
                            toolCalls: [{ id: 'tc1', name: 'Search', arguments: { query: 'q'.repeat(120) } }],
                        } as AgentChatMessage,
                    ],
                })
            )
        ).toBe(true);
    });

    it('prunes expired Remove messages, stubs expired tool turns, and defers cache-stable prefix messages', async () => {
        const emitted: Array<{ type: string; messageIndex: number }> = [];
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsVolatileResultMessage: (m) => helper.IsVolatileResultMessage(ctx, m),
                EmitMessageLifecycleEvent: (evt) => emitted.push({ type: evt.type, messageIndex: evt.messageIndex }),
            },
        });

        // Index 0 is stable (non-volatile), so even if expired it is deferred; index 1 & 2 are volatile
        const messages: AgentChatMessage[] = [
            { role: 'user', content: 'original user prompt', metadata: { turnAdded: 1, expirationTurns: 1, expirationMode: 'Remove' } },
            { role: 'user', content: 'expired action', metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Remove' } },
            { role: 'tool', content: 'big tool payload', metadata: { turnAdded: 1, messageType: 'tool-result', expirationTurns: 1, expirationMode: 'Remove' } },
            { role: 'user', content: 'never expires', metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'None' } },
        ];
        const params = makeParams({ conversationMessages: messages });

        await helper.PruneAndCompactExpiredMessages(ctx, params, 5);
        // Index 0 retained (deferred), index 1 removed, index 2 stubbed in place (now index 1), index 3 untouched (now index 2)
        expect(params.conversationMessages).toHaveLength(3);
        expect(params.conversationMessages[0].content).toBe('original user prompt');
        expect(String(params.conversationMessages[1].content)).toContain('[result expired after 4 turns');
        expect(params.conversationMessages[2].content).toBe('never expires');
        expect(emitted.some(e => e.type === 'message-removed')).toBe(true);
        expect(emitted.some(e => e.type === 'message-expired')).toBe(true);
    });

    it('compacts expired Compact messages in PruneAndCompactExpiredMessages honoring preserveOriginalContent=false', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsVolatileResultMessage: (m) => helper.IsVolatileResultMessage(ctx, m),
                CompactMessage: (m, meta, p) => helper.CompactMessage(ctx, m, meta, p),
            },
        });
        const messages: AgentChatMessage[] = [
            { role: 'user', content: 'User query' },
            {
                role: 'user',
                content: 'A'.repeat(400),
                metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', compactLength: 50 },
            },
            {
                role: 'user',
                content: 'already compacted',
                metadata: { turnAdded: 1, messageType: 'action-result', expirationTurns: 1, expirationMode: 'Compact', wasCompacted: true },
            },
        ];
        const params = makeParams({
            conversationMessages: messages,
            messageExpirationOverride: { preserveOriginalContent: false },
        });

        await helper.PruneAndCompactExpiredMessages(ctx, params, 5);
        const compacted = params.conversationMessages[1] as AgentChatMessage;
        expect(compacted.metadata?.wasCompacted).toBe(true);
        expect(compacted.metadata?.canExpand).toBe(false);
        expect(compacted.metadata?.originalContent).toBeUndefined();
        expect(String(compacted.content)).toContain('showing first 50 of 400 characters');
        expect(params.conversationMessages[2].content).toBe('already compacted');
    });

    it('compacts First N Chars preserving short text, untrusted envelopes, and NativeOnly tool non-expandability', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetNativeControlConfig: () => ({ ...DEFAULT_NATIVE_CONTROL_CONFIG, NativeOnly: true }),
            },
        });
        const params = makeParams();

        const shortMsg: AgentChatMessage = { role: 'user', content: 'Short text' };
        expect(
            await helper.CompactMessage(ctx, shortMsg, { compactMode: 'First N Chars', compactLength: 100, compactPromptId: '', originalLength: 10 }, params)
        ).toBe('Short text');

        const wrappedUntrusted = WrapUntrustedExternalData('U'.repeat(300), 'ext-api', 'Untrusted');
        const compactedUntrusted = await helper.CompactMessage(
            ctx,
            { role: 'user', content: wrappedUntrusted },
            { compactMode: 'First N Chars', compactLength: 60, compactPromptId: '', originalLength: wrappedUntrusted.length },
            params
        );
        expect(compactedUntrusted).toContain('ext-api');
        expect(compactedUntrusted).toContain('showing first 60 of 300 characters');
        expect(compactedUntrusted).toContain('Agent can request expansion');

        const nativeToolCompacted = await helper.CompactMessage(
            ctx,
            { role: 'tool', content: 'T'.repeat(300) },
            { compactMode: 'First N Chars', compactLength: 50, compactPromptId: '', originalLength: 300 },
            params
        );
        expect(nativeToolCompacted).not.toContain('Agent can request expansion');
    });

    it('handles CompactMessage in AI Summary mode for success and fallbacks (missing prompt, failed run, thrown error)', async () => {
        const promptId = '11111111-1111-4111-8111-111111111111';
        const mockPrompt = { ID: promptId, Name: 'Compact Agent Message' } as MJAIPromptEntityExtended;
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([mockPrompt]);

        const executePromptSpy = vi.fn(async (): Promise<AIPromptRunResult<{ summary: string }>> =>
            makePromptRunResult<{ summary: string }>({
                success: true,
                result: { summary: 'Concise summary text' },
                promptRun: { ID: 'pr-1' } as MJAIPromptRunEntityExtended,
            })
        );

        const promptRunner: Partial<AIPromptRunner> = {
            ExecutePrompt: executePromptSpy as AIPromptRunner['ExecutePrompt'],
        };

        const ctx = CreateMockAgentRunContext({
            PromptRunner: promptRunner as AIPromptRunner,
            Hooks: {
                CreateCompactionStep: vi.fn(async () => makeStepEntity()),
                UpdateCompactionStep: vi.fn(async () => undefined),
                CompactMessage: (m, meta, p) => helper.CompactMessage(ctx, m, meta, p),
            },
        });
        const params = makeParams();
        const msg: AgentChatMessage = { role: 'user', content: 'X'.repeat(400) };

        expect(helper.GetSystemDefaultCompactPromptId(ctx)).toBe(promptId);

        // Success path
        const aiSummary = await helper.CompactMessage(
            ctx,
            msg,
            { compactMode: 'AI Summary', compactLength: 80, compactPromptId: promptId, originalLength: 400 },
            params
        );
        expect(aiSummary).toContain('[AI Summary of 400 chars.');
        expect(aiSummary).toContain('Concise summary text');

        // Fallback when prompt ID not found
        const missingPromptFallback = await helper.CompactMessage(
            ctx,
            msg,
            { compactMode: 'AI Summary', compactLength: 80, compactPromptId: '99999999-9999-4999-8999-999999999999', originalLength: 400 },
            params
        );
        expect(missingPromptFallback).toContain('showing first 80 of 400 characters');

        // Fallback when PromptRunner throws
        executePromptSpy.mockRejectedValueOnce(new Error('LLM timeout'));
        const thrownFallback = await helper.CompactMessage(
            ctx,
            msg,
            { compactMode: 'AI Summary', compactLength: 80, compactPromptId: promptId, originalLength: 400 },
            params
        );
        expect(thrownFallback).toContain('showing first 80 of 400 characters');
    });

    it('creates and updates compaction run steps and throws if AgentRun is uninitialized', async () => {
        const noRunCtx = CreateMockAgentRunContext({ AgentRun: null });
        const prompt = { ID: 'p-1', Name: 'Compact Prompt' } as MJAIPromptEntityExtended;
        await expect(
            helper.CreateCompactionStep(noRunCtx, prompt, { role: 'user', content: 'data' }, makeParams())
        ).rejects.toThrow(/agent run not initialized/);

        const stepEntity = makeStepEntity();
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => stepEntity) as IMetadataProvider['GetEntityObject'],
        };
        const treeBudget: ReturnType<AgentRunContext['Hooks']['EnsureTreeBudget']> = {
            totalSteps: 0,
            totalTokens: 0,
            totalCost: 0,
            startedAtMs: Date.now(),
        };
        const finalizeSpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            ActiveProvider: provider as IMetadataProvider,
            Hooks: {
                EnsureTreeBudget: () => treeBudget,
                FinalizeStepEntity: finalizeSpy,
            },
        });

        const created = await helper.CreateCompactionStep(ctx, prompt, { role: 'user', content: 'hello' }, makeParams());
        expect(created.StepType).toBe('Compaction');
        expect(treeBudget.totalSteps).toBe(1);

        await helper.UpdateCompactionStep(
            ctx,
            created,
            makePromptRunResult<{ summary: string }>({
                success: false,
                errorMessage: 'bad output',
                promptTokens: 100,
                completionTokens: 20,
                cost: 0.01,
                promptRun: { ID: 'pr-9' } as MJAIPromptRunEntityExtended,
            }),
            { role: 'user', content: 'hello', metadata: { tokensSaved: 50 } },
            makeParams()
        );
        expect(created.TargetLogID).toBe('pr-9');
        expect(finalizeSpy).toHaveBeenCalledWith(created, false, 'bad output', expect.objectContaining({ totalTokens: 120 }));
    });

    it('expands compacted messages and returns model-facing guidance for invalid, non-expandable, and summary indices', () => {
        const emitSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({ Hooks: { EmitMessageLifecycleEvent: emitSpy } });

        const expandable: AgentChatMessage = {
            role: 'user',
            content: '[Compacted preview]',
            metadata: { wasCompacted: true, canExpand: true, originalContent: 'Full original payload', turnAdded: 1 },
        };
        const summaryMsg: AgentChatMessage = {
            role: 'user',
            content: 'Summary of earlier turns',
            metadata: { isConversationSummary: true, canExpand: false },
        };
        const plainMsg: AgentChatMessage = { role: 'user', content: 'Regular message' };
        const params = makeParams({ conversationMessages: [expandable, summaryMsg, plainMsg] });

        expect(
            helper.ExecuteExpandMessageStep(ctx, { step: 'ExpandMessage', messageIndex: 0, expandReason: 'Need details', terminate: false }, params, 3)
        ).toBeNull();
        expect(expandable.content).toBe('Full original payload');
        expect(expandable.metadata?.wasCompacted).toBe(false);
        expect(expandable.metadata?.canExpand).toBe(false);
        expect(expandable.metadata?.originalContent).toBeUndefined();
        expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'message-expanded', turn: 3, messageIndex: 0 }));

        expect(helper.ExecuteExpandMessageStep(ctx, { step: 'ExpandMessage', messageIndex: 5, terminate: false }, params, 3)).toContain('out of bounds');
        expect(helper.ExecuteExpandMessageStep(ctx, { step: 'ExpandMessage', messageIndex: -1, terminate: false }, params, 3)).toContain('out of bounds');
        expect(helper.ExecuteExpandMessageStep(ctx, { step: 'ExpandMessage', messageIndex: 1, terminate: false }, params, 3)).toContain('cross-turn conversation summary');
        expect(helper.ExecuteExpandMessageStep(ctx, { step: 'ExpandMessage', messageIndex: 2, terminate: false }, params, 3)).toContain('not expandable');
    });

    it('drops stale volatileState fragments while retaining the latest fragment and honoring tokensToSave', () => {
        const ctx = CreateMockAgentRunContext();
        const singleParams = makeParams({
            conversationMessages: [{ role: 'user', content: 'state-1', metadata: { volatileState: true } } as AgentChatMessage],
        });
        expect(helper.RecoveryStrategyDropStaleVolatileState(ctx, singleParams, 500, 2).tokensSaved).toBe(0);

        const multiParams = makeParams({
            conversationMessages: [
                { role: 'user', content: 'S'.repeat(400), metadata: { volatileState: true } } as AgentChatMessage,
                { role: 'user', content: 'S'.repeat(400), metadata: { volatileState: true } } as AgentChatMessage,
                { role: 'user', content: 'latest-state', metadata: { volatileState: true } } as AgentChatMessage,
            ],
        });
        const res = helper.RecoveryStrategyDropStaleVolatileState(ctx, multiParams, 50, 5);
        expect(res.tokensSaved).toBeGreaterThanOrEqual(50);
        // Only 1 stale fragment dropped because 100 tokens >= 50 tokensToSave; latest retained
        expect(multiParams.conversationMessages).toHaveLength(2);
        expect(multiParams.conversationMessages[multiParams.conversationMessages.length - 1].content).toBe('latest-state');
    });

    it('removes oldest tool results respecting minAge and stubs role=tool messages instead of splicing them', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsToolResultMessage: (m) => helper.IsToolResultMessage(ctx, m),
            },
        });
        const params = makeParams({
            conversationMessages: [
                { role: 'user', content: 'R'.repeat(400), metadata: { turnAdded: 1, messageType: 'action-result' } } as AgentChatMessage,
                { role: 'tool', content: 'T'.repeat(400), metadata: { turnAdded: 2, messageType: 'tool-result' } } as AgentChatMessage,
                { role: 'user', content: 'recent', metadata: { turnAdded: 9, messageType: 'action-result' } } as AgentChatMessage,
            ],
        });

        const res = helper.RecoveryStrategyRemoveOldestToolResults(ctx, params, 500, 10, 5);
        expect(res.tokensSaved).toBeGreaterThan(0);
        // Index 0 spliced, index 1 stubbed (now index 0), index 2 kept (now index 1)
        expect(params.conversationMessages).toHaveLength(2);
        expect(String(params.conversationMessages[0].content)).toContain('stubbed to recover context');
        expect(params.conversationMessages[1].content).toBe('recent');
    });

    it('compacts old and all large tool results in recovery strategies while skipping already-compacted entries', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsToolResultMessage: (m) => helper.IsToolResultMessage(ctx, m),
                CompactMessage: (m, meta, p) => helper.CompactMessage(ctx, m, meta, p),
            },
        });
        const params = makeParams({
            conversationMessages: [
                { role: 'user', content: 'O'.repeat(2000), metadata: { turnAdded: 1, messageType: 'action-result' } } as AgentChatMessage,
                { role: 'user', content: 'C'.repeat(2000), metadata: { turnAdded: 1, messageType: 'action-result', wasCompacted: true } } as AgentChatMessage,
                { role: 'user', content: 'R'.repeat(2000), metadata: { turnAdded: 9, messageType: 'action-result' } } as AgentChatMessage,
            ],
        });

        const oldRes = await helper.RecoveryStrategyCompactOldToolResults(ctx, params, 1000, 10, 3);
        expect(oldRes.tokensSaved).toBeGreaterThan(0);
        expect((params.conversationMessages[0] as AgentChatMessage).metadata?.wasCompacted).toBe(true);
        // Recent message untouched by old-tool strategy
        expect((params.conversationMessages[2] as AgentChatMessage).metadata?.wasCompacted).toBeUndefined();

        const allRes = await helper.RecoveryStrategyCompactAllToolResults(ctx, params, 1000);
        expect(allRes.tokensSaved).toBeGreaterThan(0);
        expect((params.conversationMessages[2] as AgentChatMessage).metadata?.wasCompacted).toBe(true);
    });

    it('trims the last non-volatile user message in RecoveryStrategyTrimLastUserMessage and handles short/absent messages', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                SmartTrimContent: (c, max) => helper.SmartTrimContent(ctx, c, max),
            },
        });

        expect(helper.RecoveryStrategyTrimLastUserMessage(ctx, makeParams({ conversationMessages: [{ role: 'assistant', content: 'hi' }] }), 500).tokensSaved).toBe(0);
        expect(helper.RecoveryStrategyTrimLastUserMessage(ctx, makeParams({ conversationMessages: [{ role: 'user', content: 'short' }] }), 500).tokensSaved).toBe(0);

        const params = makeParams({
            conversationMessages: [
                { role: 'user', content: 'L'.repeat(5000) },
                { role: 'user', content: 'V'.repeat(5000), metadata: { volatileState: true } } as AgentChatMessage,
            ],
        });
        const res = helper.RecoveryStrategyTrimLastUserMessage(ctx, params, 500);
        expect(res.tokensSaved).toBeGreaterThan(0);
        expect(String(params.conversationMessages[0].content)).toContain('<CONTEXT_LIMIT_REACHED>');
        // Trailing volatile state message was skipped as target
        expect(params.conversationMessages[1].content).toBe('V'.repeat(5000));
    });

    it('orchestrates AttemptContextRecovery for under-limit, successful recovery, and insufficient recovery failure', async () => {
        const payload = { step: 1 };

        // Already under limit
        const underCtx = CreateMockAgentRunContext({
            Hooks: {
                GetModelContextLimit: () => 10_000,
                EstimateConversationTokens: () => 500,
            },
        });
        const underRes = await helper.AttemptContextRecovery(underCtx, makeParams(), payload, 'too long');
        expect(underRes.step).toBe('Retry');
        expect(underRes.retryReason).toContain('already under limit');

        // Successful recovery (>= 50% of tokensToSave)
        const okCtx = CreateMockAgentRunContext({
            Hooks: {
                GetModelContextLimit: () => 1000,
                EstimateConversationTokens: () => 1200, // need 300 tokens saved (1200 - 900)
                RecoveryStrategyDropStaleVolatileState: () => ({ tokensSaved: 200, strategyName: 'DropStale' }),
                RecoveryStrategyRemoveOldestToolResults: () => ({ tokensSaved: 150, strategyName: 'RemoveOldest' }),
            },
        });
        const okRes = await helper.AttemptContextRecovery(okCtx, makeParams(), payload, 'too long');
        expect(okRes.step).toBe('Retry');
        expect(okRes.retryReason).toContain('350 tokens freed');

        // Insufficient recovery (< 50% of tokensToSave)
        const failCtx = CreateMockAgentRunContext({
            Hooks: {
                GetModelContextLimit: () => 1000,
                EstimateConversationTokens: () => 1200, // need 300, only save 50
                RecoveryStrategyDropStaleVolatileState: () => ({ tokensSaved: 50, strategyName: 'DropStale' }),
            },
        });
        const failRes = await helper.AttemptContextRecovery(failCtx, makeParams(), payload, 'context overflow');
        expect(failRes.step).toBe('Failed');
        expect(failRes.terminate).toBe(true);
        expect(failRes.errorMessage).toContain('Context recovery failed');
    });

    it('guards CheckPreTurnCompaction and StartPostTurnCompaction and splices summary on fired pre-turn compaction', async () => {
        const runCrossTurnSpy = vi.fn(async (): Promise<CompactionOutcome | undefined> => ({
            Fired: true,
            BoundarySequence: 3,
            SummaryText: 'Summary up to seq 3',
            TokensBefore: 200,
            TokensAfter: 50,
            Warnings: [],
        }));
        const ctx = CreateMockAgentRunContext({
            Depth: 0,
            Hooks: {
                ResolveCompactionBudget: () => ({
                    MaxTokens: 500,
                    TriggerTokens: 50,
                    TargetTokens: 20,
                    KeepRecentMessages: 1,
                    BoundedBy: 'Agent',
                    ClampedToModel: false,
                }),
                RunCrossTurnCompaction: runCrossTurnSpy,
            },
        });

        // Skips when no conversationId
        await helper.CheckPreTurnCompaction(ctx, makeParams(), { success: true });
        expect(runCrossTurnSpy).not.toHaveBeenCalled();

        // Fires when conversationId present and tokens >= TriggerTokens; replaces messages with sequence < 3
        const liveMessages: AgentChatMessage[] = [
            { role: 'user', content: 'A'.repeat(200), metadata: { sequence: 1 } },
            { role: 'assistant', content: 'B'.repeat(200), metadata: { sequence: 2 } },
            { role: 'user', content: 'latest question', metadata: { sequence: 3 } },
        ];
        await helper.CheckPreTurnCompaction(ctx, makeParams({ conversationId: 'conv-1', conversationMessages: liveMessages }), { success: true });
        expect(runCrossTurnSpy).toHaveBeenCalledTimes(1);
        expect(liveMessages).toHaveLength(2);
        expect(liveMessages[0].content).toBe('Summary up to seq 3');
        expect(liveMessages[0].metadata?.isConversationSummary).toBe(true);
        expect(liveMessages[1].content).toBe('latest question');

        // StartPostTurnCompaction skips unsettled run and history floor, fires on Completed root run
        const unsettledCtx = CreateMockAgentRunContext({
            Depth: 0,
            ExecuteParams: makeParams({ conversationId: 'conv-1' }),
            AgentRun: makeAgentRun({ Status: 'Running' }),
            Hooks: { RunCrossTurnCompaction: runCrossTurnSpy },
        });
        helper.StartPostTurnCompaction(unsettledCtx);
        expect(runCrossTurnSpy).toHaveBeenCalledTimes(1);

        const settledCtx = CreateMockAgentRunContext({
            Depth: 0,
            ExecuteParams: makeParams({ conversationId: 'conv-1' }),
            AgentRun: makeAgentRun({ Status: 'Completed' }),
            Hooks: { RunCrossTurnCompaction: runCrossTurnSpy },
        });
        helper.StartPostTurnCompaction(settledCtx);
        expect(runCrossTurnSpy).toHaveBeenCalledTimes(2);
    });

    it('runs RunPostRunCompaction (window compaction, scratchpad pruning, memory extraction) and guards MemoryManager recursion', async () => {
        const triggerMemorySpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                IsVolatileResultMessage: (m) => helper.IsVolatileResultMessage(ctx, m),
                CompactMessage: (m, meta, p) => helper.CompactMessage(ctx, m, meta, p),
                TriggerPostRunMemoryExtraction: triggerMemorySpy,
            },
        });
        ctx.ScratchpadManager.SetNotes('n1\nn2\nn3\nn4');

        // Disabled -> no-op
        await helper.RunPostRunCompaction(ctx, makeParams({ compactAfterRun: { enabled: false } }), { Success: true } as MJAIAgentRunEntityExtended);
        expect(triggerMemorySpy).not.toHaveBeenCalled();

        // Enabled with 5 messages (preserveRecentCount = 2 -> indices 1, 2 eligible)
        const msgs: AgentChatMessage[] = [
            { role: 'user', content: 'first' },
            { role: 'user', content: 'M'.repeat(400), metadata: { messageType: 'action-result' } },
            { role: 'user', content: 'non-volatile middle' },
            { role: 'assistant', content: 'recent 1' },
            { role: 'user', content: 'recent 2' },
        ];
        await helper.RunPostRunCompaction(
            ctx,
            makeParams({
                conversationMessages: msgs,
                compactAfterRun: { enabled: true, messageCountThreshold: 4, maxScratchpadNotes: 2, extractMemories: true },
            }),
            { ID: 'run-1', Success: true } as MJAIAgentRunEntityExtended
        );
        expect(msgs[1].metadata?.wasCompacted).toBe(true);
        expect(msgs[2].metadata?.wasCompacted).toBeUndefined();
        expect(triggerMemorySpy).toHaveBeenCalledTimes(1);

        // TriggerPostRunMemoryExtraction skips MemoryManagerAgent itself and agents without InjectNotes/InjectExamples
        const createMemSpy = vi.fn();
        const memCtx = CreateMockAgentRunContext({ Hooks: { CreateMemoryManagerAgent: createMemSpy } });
        await helper.TriggerPostRunMemoryExtraction(
            memCtx,
            makeParams({ agent: makeAgent({ InjectNotes: false, InjectExamples: false }) }),
            { ID: 'r1' } as MJAIAgentRunEntityExtended
        );
        await helper.TriggerPostRunMemoryExtraction(
            memCtx,
            makeParams({ agent: makeAgent({ DriverClass: 'MemoryManagerAgent', InjectNotes: true }) }),
            { ID: 'r1' } as MJAIAgentRunEntityExtended
        );
        expect(createMemSpy).not.toHaveBeenCalled();
    });
});
