/**
 * Dedicated interface-level unit tests for Slice s1:
 *   - BaseAgentMessagingHelper / AgentMessagingHelper
 *   - AgentStoppedRunContinuationHelper
 *   - AgentHelperResolver & AgentHelperCache (incl. @RegisterClass override + code-only seam security)
 *
 * Tests exercise helpers directly against a lightweight mock AgentRunContext with ZERO BaseAgent instantiation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ChatMessage } from '@memberjunction/ai';
import {
    ConversationUtility,
    type AgentChatMessage,
    type AgentDecisionResult,
    type AgentExecutionProgressCallback,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MessageLifecycleEvent,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentLivenessWatchdog } from '../helpers/limits/AgentLivenessWatchdog';
import { AgentMessagingHelper } from '../helpers/messaging/AgentMessagingHelper';
import { AgentStoppedRunContinuationHelper } from '../helpers/messaging/AgentStoppedRunContinuationHelper';
import { BaseAgentMessagingHelper } from '../helpers/messaging/BaseAgentMessagingHelper';
import type { StoredToolResult } from '../ArtifactToolManager';
import type { ConversationToolExecutionResult } from '../ConversationToolManager';
import type { MemoryWriteResult } from '../MemoryWriteManager';
import type { PipelineExecutionResult } from '../pipeline';
import { CarryForwardToolFamily } from '../tool-result-format';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-1', Name: 'Test User', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'Coder',
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

function makeStepEntity(overrides: Partial<MJAIAgentRunStepEntityExtended> = {}): MJAIAgentRunStepEntityExtended {
    const partial: Partial<MJAIAgentRunStepEntityExtended> = {
        ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        StepNumber: 1,
        StepType: 'Prompt',
        Status: 'Completed',
        IsSaved: true,
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        ...overrides,
    };
    return partial as MJAIAgentRunStepEntityExtended;
}

@RegisterClass(BaseAgentMessagingHelper, 'TestCustomMessagingPlugin')
class TestCustomMessagingPlugin extends AgentMessagingHelper {
    public override FormatHierarchicalMessage(_ctx: AgentRunContext, baseMessage: string): string {
        return `[custom] ${baseMessage}`;
    }
}

@RegisterClass(BaseAgentMessagingHelper, 'TestSecondaryMessagingPlugin')
class TestSecondaryMessagingPlugin extends AgentMessagingHelper {
    public override FormatHierarchicalMessage(_ctx: AgentRunContext, baseMessage: string): string {
        return `[secondary] ${baseMessage}`;
    }
}

describe('Slice s1 — AgentMessagingHelper, AgentStoppedRunContinuationHelper & AgentHelperResolver', () => {
    const helper = new AgentMessagingHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentMessagingHelper and throws on unimplemented BaseAgentMessagingHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
        expect(resolved).toBeInstanceOf(AgentMessagingHelper);

        const baseToken = new BaseAgentMessagingHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.FormatHierarchicalMessage(ctx, 'hi')).toThrow(/must be implemented/);
        expect(() => baseToken.BuildHierarchicalStep(ctx, 1, [])).toThrow(/must be implemented/);
        expect(() => baseToken.CapStandaloneToolResultText(ctx, 'abc')).toThrow(/must be implemented/);
    });

    it('formats hierarchical messages at depth 0, depth 1, depth 2+, and empty hierarchy', () => {
        const rootCtx = CreateMockAgentRunContext({ Depth: 0, AgentHierarchy: ['Root'] });
        const depth1Ctx = CreateMockAgentRunContext({ Depth: 1, AgentHierarchy: ['Root', 'Planner'] });
        const depth2Ctx = CreateMockAgentRunContext({ Depth: 2, AgentHierarchy: ['Root', 'Planner', 'Coder'] });
        const emptyHierarchyCtx = CreateMockAgentRunContext({ Depth: 1, AgentHierarchy: ['Root'] });

        expect(helper.FormatHierarchicalMessage(rootCtx, 'Running')).toBe('Running');
        expect(helper.FormatHierarchicalMessage(depth1Ctx, 'Running')).toBe('Planner: Running');
        expect(helper.FormatHierarchicalMessage(depth2Ctx, 'Running')).toBe('Planner → Coder: Running');
        expect(helper.FormatHierarchicalMessage(emptyHierarchyCtx, 'Running')).toBe('Running');
    });

    it('builds initialization progress messages for root, child, and grandchild agents', () => {
        const params = makeParams({ agent: makeAgent({ Name: 'Coder' }) });
        const rootCtx = CreateMockAgentRunContext({ Depth: 0, AgentHierarchy: ['Coder'] });
        const childCtx = CreateMockAgentRunContext({ Depth: 1, AgentHierarchy: ['Root', 'Coder'] });
        const grandChildCtx = CreateMockAgentRunContext({ Depth: 2, AgentHierarchy: ['Root', 'Planner', 'Coder'] });
        const deepCtx = CreateMockAgentRunContext({ Depth: 3, AgentHierarchy: ['Root', 'Lead', 'Planner', 'Coder'] });

        expect(helper.BuildInitializationProgressMessage(rootCtx, params)).toBe('Getting ready...');
        expect(helper.BuildInitializationProgressMessage(childCtx, params)).toBe('Starting Coder...');
        expect(helper.BuildInitializationProgressMessage(grandChildCtx, params)).toBe('Planner: Starting Coder...');
        expect(helper.BuildInitializationProgressMessage(deepCtx, params)).toBe('Lead → Planner: Starting Coder...');
    });

    it('builds prompt progress messages across all previousDecision branches at root and sub-agent depths', () => {
        const params = makeParams({ agent: makeAgent({ Name: 'Coder' }) });
        const rootCtx = CreateMockAgentRunContext({ Depth: 0 });
        const subCtx = CreateMockAgentRunContext({ Depth: 1 });

        expect(helper.BuildPromptProgressMessage(rootCtx, params, null)).toBe('Coder is thinking...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, null)).toBe('Thinking...');

        const payloadApplied: BaseAgentNextStep = { step: 'Retry', retryReason: 'Payload change applied', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, payloadApplied)).toBe('Coder is thinking through the next steps...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, payloadApplied)).toBe('Thinking through the next steps...');

        const recoveryStep: BaseAgentNextStep = { step: 'Retry', retryReason: 'Context recovery freed 400 tokens', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, recoveryStep)).toBe('Coder is thinking...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, recoveryStep)).toBe('Thinking...');

        const actionErrStep: BaseAgentNextStep = { step: 'Retry', retryReason: 'Error while processing actions, retry', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, actionErrStep)).toBe('Recovering from an error and trying another approach...');

        const customReason: BaseAgentNextStep = { step: 'Retry', retryReason: '  Refreshing stale cache  ', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, customReason)).toBe('Refreshing stale cache');

        const withInstructions: BaseAgentNextStep = { step: 'Retry', retryInstructions: 'Check batch 2', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, withInstructions)).toBe('Coder is reviewing batch results...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, withInstructions)).toBe('Reviewing batch results...');

        const bareRetry: BaseAgentNextStep = { step: 'Retry', terminate: false };
        expect(helper.BuildPromptProgressMessage(rootCtx, params, bareRetry)).toBe('Coder is thinking through the next steps...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, bareRetry)).toBe('Thinking through the next steps...');
    });

    it('fits step names to declared or default 255 max length and builds hierarchical step numbers', () => {
        const ctx = CreateMockAgentRunContext();
        const defaultStep = makeStepEntity();
        const customLimitStep = makeStepEntity({
            EntityInfo: { Fields: [{ Name: 'StepName', MaxLength: 10 }] } as MJAIAgentRunStepEntityExtended['EntityInfo'],
        });

        expect(helper.FitStepName(ctx, defaultStep, 'short')).toBe('short');
        const fitted255 = helper.FitStepName(ctx, defaultStep, 'x'.repeat(300));
        expect(fitted255.length).toBe(255);
        expect(fitted255.endsWith('…')).toBe(true);

        const fitted10 = helper.FitStepName(ctx, customLimitStep, '1234567890123');
        expect(fitted10).toBe('123456789…');

        expect(helper.BuildHierarchicalStep(ctx, undefined, [1, 2])).toBeUndefined();
        expect(helper.BuildHierarchicalStep(ctx, 4, [])).toBe('4');
        expect(helper.BuildHierarchicalStep(ctx, 3, [2, 1])).toBe('2.1.3');
    });

    it('derives step reasoning across Failed, Retry, and default steps with fallbacks', () => {
        const ctx = CreateMockAgentRunContext();

        expect(helper.GetNextStepReasoning(ctx, { step: 'Failed', terminate: true, errorMessage: 'DB timeout' })).toBe('DB timeout');
        expect(helper.GetNextStepReasoning(ctx, { step: 'Failed', terminate: true })).toBe('Agent execution failed');
        expect(helper.GetNextStepReasoning(ctx, { step: 'Retry', terminate: false, retryReason: 'Tool returned data' })).toBe('Tool returned data');
        expect(helper.GetNextStepReasoning(ctx, { step: 'Retry', terminate: false })).toBe('Retrying with updated context');
        expect(helper.GetNextStepReasoning(ctx, { step: 'Actions', terminate: false, reasoning: 'Need lookup' })).toBe('Need lookup');
        expect(helper.GetNextStepReasoning(ctx, { step: 'Success', terminate: true })).toBe('Continuing to next step');
    });

    it('captures append-only prompt deltas, strips volatile messages, and emits full stack on mutation or shrink', () => {
        const ctx = CreateMockAgentRunContext();
        const m1: AgentChatMessage = { role: 'user', content: 'hello' };
        const volatile: AgentChatMessage = { role: 'user', content: '<mj-runtime-state/>', metadata: { volatileState: true } };
        const m2: AgentChatMessage = { role: 'assistant', content: 'working', metadata: { turnAdded: 1, wasCompacted: false } };

        const empty = helper.CapturePromptStepMessages(CreateMockAgentRunContext(), undefined);
        expect(empty.conversationMessages).toEqual([]);
        expect(empty.conversationMessagesDelta).toBeUndefined();

        const first = helper.CapturePromptStepMessages(ctx, [m1, volatile]);
        expect(first.conversationMessagesDelta).toBeUndefined();
        expect(first.conversationMessages).toEqual([m1]);

        const second = helper.CapturePromptStepMessages(ctx, [m1, m2, volatile]);
        expect(second.conversationMessagesDelta).toBe(true);
        expect(second.conversationMessages).toEqual([m2]);

        // Mutating metadata.wasCompacted invalidates append-only extension and triggers a full snapshot
        m2.metadata!.wasCompacted = true;
        const mutated = helper.CapturePromptStepMessages(ctx, [m1, m2]);
        expect(mutated.conversationMessagesDelta).toBeUndefined();
        expect(mutated.conversationMessages).toEqual([m1, m2]);

        // Shrinking message stack also emits full stack
        const shrunk = helper.CapturePromptStepMessages(ctx, [m1]);
        expect(shrunk.conversationMessagesDelta).toBeUndefined();
        expect(shrunk.conversationMessages).toEqual([m1]);
    });

    it('wraps progress callbacks with hierarchy metadata and falls back cleanly if enhanced callback throws', () => {
        const ctx = CreateMockAgentRunContext({ Depth: 1, AgentHierarchy: ['Root', 'Child'], ParentStepCounts: [4] });
        expect(helper.WrapProgressCallback(ctx, undefined)).toBeUndefined();

        const received: Array<Parameters<AgentExecutionProgressCallback>[0]> = [];
        const wrapped = helper.WrapProgressCallback(ctx, (p) => received.push(p));
        expect(wrapped).toBeDefined();

        wrapped!({ step: 'prompt_execution', message: 'Thinking', metadata: { stepCount: 2 } });
        expect(ctx.AllProgressSteps).toHaveLength(1);
        expect(ctx.AllProgressSteps[0].hierarchicalStep).toBe('4.2');
        expect(ctx.AllProgressSteps[0].depth).toBe(1);
        expect(received[0].metadata?.agentRun).toBe(ctx.AgentRun);

        // When callback throws on enhanced payload (with agentRun), falls back to raw progress and logs error
        const fallbackReceived: Array<Parameters<AgentExecutionProgressCallback>[0]> = [];
        const flaky = helper.WrapProgressCallback(ctx, (p) => {
            if (p.metadata && 'agentRun' in p.metadata) {
                throw new Error('serialization error');
            }
            fallbackReceived.push(p);
        });
        flaky!({ step: 'action_execution', message: 'Running', metadata: { hierarchicalStep: '4.3' } });
        expect(fallbackReceived).toHaveLength(1);
        expect(fallbackReceived[0].message).toBe('Running');
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(1);
    });

    it('isolates throwing onProgress callbacks in SafeOnProgress and pings LivenessWatchdog with depth-aware kind', () => {
        const controller = new AbortController();
        const watchdog = new AgentLivenessWatchdog({
            AgentName: 'Coder',
            Enabled: true,
            InactivityTimeoutMs: 60_000,
            OuterMaxWallClockMs: 120_000,
            InactivityAbortReasonPrefix: 'Inactivity',
            TimeoutAbortReasonPrefix: 'Timeout',
        });
        watchdog.Start(controller);

        const rootCtx = CreateMockAgentRunContext({ Depth: 0, LivenessWatchdog: watchdog });
        const throwingParams = makeParams({
            onProgress: () => {
                throw new Error('socket closed');
            },
        });

        expect(() => helper.SafeOnProgress(rootCtx, throwingParams, { step: 'prompt_execution', message: 'hi' })).not.toThrow();
        expect(rootCtx.Hooks.LogError).toHaveBeenCalledTimes(1);
        expect(watchdog.GetSnapshot().LastProgressKind).toBe('action-progress');

        const subCtx = CreateMockAgentRunContext({ Depth: 2, LivenessWatchdog: watchdog });
        helper.SafeOnProgress(subCtx, makeParams({ onProgress: vi.fn() }), { step: 'subagent_execution', message: 'sub' });
        expect(watchdog.GetSnapshot().LastProgressKind).toBe('sub-agent-heartbeat');

        watchdog.Stop();
    });

    it('emits lifecycle events when callback is attached and warns only when dropped paths are non-empty', () => {
        const events: MessageLifecycleEvent[] = [];
        const ctx = CreateMockAgentRunContext({
            MessageLifecycleCallback: (evt) => events.push(evt),
        });
        const sampleEvent: MessageLifecycleEvent = {
            type: 'message-expired',
            turn: 2,
            messageIndex: 0,
            message: { role: 'user', content: 'old' },
            reason: 'expired',
        };
        helper.EmitMessageLifecycleEvent(ctx, sampleEvent);
        expect(events).toEqual([sampleEvent]);

        const noCallbackCtx = CreateMockAgentRunContext({ MessageLifecycleCallback: undefined });
        expect(() => helper.EmitMessageLifecycleEvent(noCallbackCtx, sampleEvent)).not.toThrow();

        const params = makeParams();
        helper.WarnAboutDroppedValues(ctx, 'OutputData', [], params);
        expect(ctx.Hooks.LogStatus).not.toHaveBeenCalled();

        helper.WarnAboutDroppedValues(ctx, 'OutputData', ['ctx.connection', 'db.pool'], params);
        expect(ctx.Hooks.LogStatus).toHaveBeenCalledWith(
            expect.stringContaining('2 value(s) were not persistable'),
            true,
            params
        );
    });

    it('converts UI markup only in user messages (string, text blocks, rawContent) and handles empty arrays', () => {
        const ctx = CreateMockAgentRunContext();
        expect(() => helper.ConvertUIMarkupInMessages(ctx, [])).not.toThrow();

        const aliceMention = ConversationUtility.CreateMention('user', '1', 'Alice');
        const bobMention = ConversationUtility.CreateMention('user', '2', 'Bob');
        const docMention = ConversationUtility.CreateMention('entity', '3', 'Doc');
        const rawMention = ConversationUtility.CreateMention('user', '4', 'RawMarkup');

        const messages: ChatMessage[] = [
            {
                role: 'user',
                content: `Hello ${aliceMention}!`,
                metadata: { rawContent: `Raw ${bobMention}` },
            } as AgentChatMessage,
            {
                role: 'user',
                content: [{ type: 'text', content: `Check ${docMention}` }],
            },
            {
                role: 'assistant',
                content: `Keep ${rawMention} untouched`,
            },
        ];

        helper.ConvertUIMarkupInMessages(ctx, messages);
        expect(messages[0].content).not.toContain('"_mode":"mention"');
        expect((messages[0] as AgentChatMessage).metadata?.rawContent).not.toContain('"_mode":"mention"');
        expect(Array.isArray(messages[1].content) && messages[1].content[0].content).not.toContain('"_mode":"mention"');
        expect(messages[2].content).toContain('"_mode":"mention"');
    });

    it('caps standalone tool results only when exceeding MaxStandaloneToolResultChars budget', () => {
        const ctx = CreateMockAgentRunContext();
        expect(helper.MaxStandaloneToolResultChars(ctx)).toBe(100_000);

        ctx.Hooks.MaxStandaloneToolResultChars = () => 20;
        const exact = 'a'.repeat(20);
        expect(helper.CapStandaloneToolResultText(ctx, exact)).toBe(exact);

        const over = 'a'.repeat(21);
        const capped = helper.CapStandaloneToolResultText(ctx, over);
        expect(capped.startsWith(exact)).toBe(true);
        expect(capped).toContain('truncated 1 chars');
    });

    it('injects conversation and artifact tool results with singular/plural headers, errors, and untrusted envelopes', () => {
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 4 });
        const params = makeParams();

        // Empty inputs are no-ops
        helper.InjectConversationToolResultsMessage(ctx, params, []);
        helper.InjectArtifactToolResultsMessage(ctx, params, []);
        expect(params.conversationMessages).toHaveLength(0);

        const convResults: ConversationToolExecutionResult[] = [
            { tool: 'searchConversation', input: { query: 'q' }, durationMs: 5, result: { success: true, data: { count: 2 } } },
            { tool: 'getMessageBySequence', input: { sequence: 9 }, durationMs: 3, result: { success: false, errorMessage: 'Turn not found' } },
        ];
        helper.InjectConversationToolResultsMessage(ctx, params, convResults);
        expect(params.conversationMessages).toHaveLength(1);
        expect(String(params.conversationMessages[0].content)).toContain('Conversation history tool results (2 calls):');
        expect(String(params.conversationMessages[0].content)).toContain('Turn not found');

        const artifactResults: StoredToolResult[] = [
            {
                artifactId: 'art-1',
                tool: 'read_artifact',
                input: { id: 'art-1' },
                trustLevel: 'Untrusted',
                sourceName: 'external-webhook',
                timestamp: new Date(),
                durationMs: 12,
                result: { success: true, data: { body: 'untrusted content' } },
            },
        ];
        helper.InjectArtifactToolResultsMessage(ctx, params, artifactResults);
        expect(params.conversationMessages).toHaveLength(2);
        const artContent = String(params.conversationMessages[1].content);
        expect(artContent).toContain('Artifact tool result:');
        expect(artContent).toContain('external-webhook');
        expect(artContent).toContain('untrusted content');
    });

    it('injects memory writes, pipeline results (success/tainted/failed), decision results, and sub-agent messages', () => {
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 2 });
        const params = makeParams();

        helper.InjectMemoryWriteResultsMessage(ctx, params, []);
        helper.InjectDecisionResultsMessage(ctx, params, []);
        expect(params.conversationMessages).toHaveLength(0);

        const longNote = 'N'.repeat(140);
        const memResults: MemoryWriteResult[] = [
            { disposition: 'written', durationMs: 12, request: { note: longNote, type: 'Context' } },
            { disposition: 'skipped-duplicate', reason: 'Duplicate', durationMs: 5, request: { note: 'Short note', type: 'Preference' } },
        ];
        helper.InjectMemoryWriteResultsMessage(ctx, params, memResults);
        const memContent = String(params.conversationMessages[0].content);
        expect(memContent).toContain('Memory write results (2 writes):');
        expect(memContent).toContain(`${'N'.repeat(120)}…`);
        expect(memContent).toContain('**skipped-duplicate**: Duplicate');

        const okPipeline: PipelineExecutionResult = {
            success: true,
            finalOutput: { rows: 0 },
            steps: [{ index: 0, toolName: 'fetch', providerKind: 'Action', inputSize: 0, outputSize: 10, durationMs: 5, success: true, logRef: { providerKind: 'Action' } }],
            contextBytesSaved: 1024,
            diagnostic: 'filter matched zero rows',
            Taint: { TrustLevel: 'Untrusted', SourceName: 'web-scrape' },
        };
        helper.InjectPipelineResultMessage(ctx, params, okPipeline);
        const pipeOkText = String(params.conversationMessages[1].content);
        expect(pipeOkText).toContain('~1024 bytes saved');
        expect(pipeOkText).toContain('Empty result — filter matched zero rows');
        expect(pipeOkText).toContain('web-scrape');

        const failedPipeline: PipelineExecutionResult = {
            success: false,
            finalOutput: null,
            steps: [{ index: 0, toolName: 'fetch', providerKind: 'Action', inputSize: 0, outputSize: 0, durationMs: 3, success: false, error: 'HTTP 503', logRef: { providerKind: 'Action' } }],
            error: 'HTTP 503',
            contextBytesSaved: 0,
        };
        helper.InjectPipelineResultMessage(ctx, params, failedPipeline);
        expect(String(params.conversationMessages[2].content)).toContain('Pipeline failed');
        expect(String(params.conversationMessages[2].content)).toContain('HTTP 503');

        const decisions: AgentDecisionResult[] = [{ id: 'd1', success: true, answers: { q1: { probability: 0.9 } } }];
        helper.InjectDecisionResultsMessage(ctx, params, decisions);
        expect(String(params.conversationMessages[3].content)).toContain('Decision results:');

        const subMsg = helper.CreateSubAgentResultMessage(
            ctx,
            { name: 'Researcher', message: 'Find docs', terminateAfter: false },
            { success: true, agentRun: ctx.AgentRun! } as ExecuteAgentResult
        );
        expect(subMsg.role).toBe('user');
        expect(subMsg.content).toBe('SubAgent Researcher: true');
    });

    it('resolves step payload deduplication across inline, 1-hop pointers, running steps, and unsaved beforeStep guards', () => {
        const s1 = makeStepEntity({
            ID: '11111111-1111-4111-8111-111111111111',
            StepNumber: 1,
            Status: 'Completed',
            IsSaved: true,
            PayloadAtStart: '{"a":1}',
            PayloadAtEnd: '{"a":2}',
        });
        const s2 = makeStepEntity({
            ID: '22222222-2222-4222-8222-222222222222',
            StepNumber: 2,
            Status: 'Completed',
            IsSaved: true,
            PayloadAtStart: null,
            PayloadAtStartSourceStepID: s1.ID,
            PayloadAtEnd: null,
            PayloadAtEndSourceStepID: s1.ID,
        });
        const s3Running = makeStepEntity({
            ID: '33333333-3333-4333-8333-333333333333',
            StepNumber: 3,
            Status: 'Running',
            IsSaved: false,
            PayloadAtEnd: '{"a":2}',
        });
        const ctx = CreateMockAgentRunContext({
            AgentRun: {
                ID: 'run-1',
                Steps: [s1, s2, s3Running],
            } as MJAIAgentRunEntityExtended,
        });

        expect(helper.FindPayloadAtEndSource(ctx, null)).toBeUndefined();
        expect(helper.FindPayloadAtEndSource(ctx, '{"a":2}')).toBe(s1);
        expect(helper.FindPayloadAtEndSource(ctx, '{"a":999}')).toBeUndefined();
        expect(helper.FindPayloadAtEndSource(ctx, '{"a":2}', s3Running)).toBe(s1);

        // Unsaved source rejected when beforeStep is provided
        const unsavedS1 = makeStepEntity({
            ID: s1.ID,
            StepNumber: 1,
            Status: 'Completed',
            IsSaved: false,
            PayloadAtEnd: '{"a":2}',
        });
        const unsavedCtx = CreateMockAgentRunContext({
            AgentRun: { ID: 'run-2', Steps: [unsavedS1, s3Running] } as MJAIAgentRunEntityExtended,
        });
        expect(helper.FindPayloadAtEndSource(unsavedCtx, '{"a":2}', s3Running)).toBeUndefined();

        expect(helper.ResolveStepPayloadAtStart(ctx, undefined)).toBeNull();
        expect(helper.ResolveStepPayloadAtStart(ctx, s1)).toBe('{"a":1}');
        expect(helper.ResolveStepPayloadAtStart(ctx, s2)).toBe('{"a":2}');
        expect(helper.ResolveStepPayloadAtEnd(ctx, undefined)).toBeNull();
        expect(helper.ResolveStepPayloadAtEnd(ctx, s1)).toBe('{"a":2}');
        expect(helper.ResolveStepPayloadAtEnd(ctx, s2)).toBe('{"a":2}');
    });

    it('creates and finalizes step entities with payload dedup, skill attribution, and OutputData JSON merge', async () => {
        const createdStep = makeStepEntity({
            ID: '44444444-4444-4444-8444-444444444444',
            IsSaved: false,
            OutputData: JSON.stringify({ preExisting: true }),
            PayloadAtEnd: '{"v":1}',
        });
        const priorStep = makeStepEntity({
            ID: '33333333-3333-4333-8333-333333333333',
            Status: 'Completed',
            IsSaved: true,
            PayloadAtEnd: '{"v":1}',
        });
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => createdStep) as IMetadataProvider['GetEntityObject'],
        };
        const queueSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            ActiveProvider: provider as IMetadataProvider,
            AgentRun: {
                ID: '99999999-9999-4999-8999-999999999999',
                Agent: 'Coder',
                Steps: [priorStep],
            } as MJAIAgentRunEntityExtended,
            SkillInvocations: [
                {
                    SkillID: 'sk-1',
                    SkillName: 'SQL',
                    ActivationType: 'auto',
                    Provenance: { AgentAcceptsSkills: 'All', SkillActivationMode: 'Auto', AgentSkillActivationMode: 'Auto', RequestedBy: 'agent-decision' },
                },
            ],
            Hooks: {
                QueueStepSave: queueSpy,
            },
        });

        const step = await helper.CreateStepEntity(ctx, {
            stepType: 'Prompt',
            stepName: 'Turn 1',
            contextUser: makeUser(),
            payloadAtStart: { v: 1 },
            payloadAtEnd: { v: 1 },
            inputData: { promptName: 'Main' },
        });
        expect(step.StepNumber).toBe(2);
        expect(step.PayloadAtStart ?? null).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(priorStep.ID);
        expect(step.Skills).toContain('SQL');
        expect(ctx.AgentRun!.Steps).toContain(step);

        step.PayloadAtEnd = '{"v":1}';
        await helper.FinalizeStepEntity(ctx, step, true, undefined, { extra: 42 });
        expect(step.PayloadAtEnd).toBeNull();
        expect(step.PayloadAtEndSourceStepID).toBe(priorStep.ID);
        expect(JSON.parse(step.OutputData!)).toMatchObject({ preExisting: true, extra: 42 });
        expect(queueSpy).toHaveBeenCalledTimes(1);
    });

    it('executes Chat step and guards RaiseFeedbackRequest by depth, audience, and interactive conversation gates', async () => {
        const createdStep = makeStepEntity();
        const createFeedbackSpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            Depth: 0,
            Hooks: {
                CreateStepEntity: vi.fn(async () => createdStep),
                RaiseFeedbackRequest: (p, s, d) => helper.RaiseFeedbackRequest(ctx, p, s, d),
                CreateFeedbackRequest: createFeedbackSpy,
            },
        });

        // Non-interactive root Chat raises feedback
        const chatRes = await helper.ExecuteChatStep(ctx, makeParams(), {
            step: 'Chat',
            terminate: true,
            message: 'Please clarify region',
            reasoning: 'Ambiguous',
            previousPayload: { a: 1 },
        });
        expect(chatRes.step).toBe('Chat');
        expect(chatRes.terminate).toBe(true);
        expect(chatRes.message).toBe('Please clarify region');
        expect(createFeedbackSpy).toHaveBeenCalledTimes(1);

        // Depth > 0 skips feedback
        const subCtx = CreateMockAgentRunContext({ Depth: 1, Hooks: { CreateFeedbackRequest: createFeedbackSpy } });
        await helper.RaiseFeedbackRequest(subCtx, makeParams(), createdStep, { step: 'Chat', terminate: true });
        expect(createFeedbackSpy).toHaveBeenCalledTimes(1);

        // Audience adding reader skips feedback
        const audCtx = CreateMockAgentRunContext({
            Depth: 0,
            Hooks: { RunAudienceAddsReader: () => true, CreateFeedbackRequest: createFeedbackSpy },
        });
        await helper.RaiseFeedbackRequest(audCtx, makeParams(), createdStep, { step: 'Chat', terminate: true });
        expect(createFeedbackSpy).toHaveBeenCalledTimes(1);

        // Interactive conversation without responseForm or Plan skips feedback
        await helper.RaiseFeedbackRequest(
            ctx,
            makeParams({ conversationDetailId: 'cd-1' }),
            createdStep,
            { step: 'Chat', terminate: true }
        );
        expect(createFeedbackSpy).toHaveBeenCalledTimes(1);

        // Interactive conversation WITH responseForm raises feedback
        await helper.RaiseFeedbackRequest(
            ctx,
            makeParams({ conversationDetailId: 'cd-1' }),
            createdStep,
            { step: 'Chat', terminate: true, responseForm: { questions: [] } }
        );
        expect(createFeedbackSpy).toHaveBeenCalledTimes(2);

        // CreateFeedbackRequest records returned FeedbackRequestId
        await helper.CreateFeedbackRequest(ctx, makeParams(), createdStep, { step: 'Chat', terminate: true });
        expect(ctx.FeedbackRequestId).toBe('req-123');
    });

    it('builds prior-turn and stopped-run summary messages filtering untrusted/malformed entries and enforcing maxChars', () => {
        expect(AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage([], 1000)).toBeNull();

        const msg = AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage(
            [
                { OutputData: 'not valid json{{{' },
                {
                    OutputData: JSON.stringify({
                        toolFamily: CarryForwardToolFamily.Conversation,
                        tool: 'search_messages',
                        input: { query: 'budget' },
                        result: { success: true, data: { hits: 2 } },
                    }),
                },
                {
                    OutputData: JSON.stringify({
                        toolFamily: CarryForwardToolFamily.Artifact,
                        tool: 'read_artifact',
                        input: { id: 'x' },
                        trustLevel: 'Untrusted',
                        result: { success: true, data: { text: 'secret injection' } },
                    }),
                },
                {
                    OutputData: JSON.stringify({
                        toolFamily: CarryForwardToolFamily.Artifact,
                        tool: 'read_artifact',
                        input: { id: 'y' },
                        trustLevel: 'SemiTrusted',
                        result: { success: true, data: { text: 'semi trusted' } },
                    }),
                },
                {
                    OutputData: JSON.stringify({
                        toolFamily: CarryForwardToolFamily.Conversation,
                        tool: 'second_call',
                        input: { query: 'big' },
                        result: { success: true, data: { blob: 'Z'.repeat(500) } },
                    }),
                },
            ],
            250
        );
        expect(msg).toContain('search_messages');
        expect(msg).not.toContain('secret injection');
        expect(msg).not.toContain('semi trusted');
        expect(msg).toContain('1 additional result(s) omitted for size');

        const stoppedSummary = AgentStoppedRunContinuationHelper.BuildStoppedRunResultsMessage(
            [
                {
                    StepNumber: 1,
                    StepName: 'LookupOrder',
                    StepType: 'Actions',
                    InputData: JSON.stringify({ actionName: 'LookupOrder', actionParams: { id: 7 } }),
                    OutputData: JSON.stringify({
                        actionResult: {
                            success: true,
                            parameters: [{ Name: 'Status', Value: 'Shipped', Type: 'Output' }],
                        },
                    }),
                },
                {
                    StepNumber: 2,
                    StepName: 'BadStep',
                    StepType: 'Actions',
                    InputData: 'bad-json',
                    OutputData: '{}',
                },
            ],
            10_000
        );
        expect(stoppedSummary).toContain('LookupOrder');
        expect(stoppedSummary).toContain('Shipped');
    });

    it('splices resumed stopped-run turns, extracts loop turns, and builds stopped-run tails with NOT_EXECUTED gaps', () => {
        const firstStack: AgentChatMessage[] = [{ role: 'user', content: 'start' }];
        const lastStack: AgentChatMessage[] = [
            { role: 'user', content: 'start' },
            { role: 'assistant', content: 'step 1' },
            { role: 'user', content: '<volatile/>', metadata: { volatileState: true } },
        ];
        expect(AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(null, lastStack)).toBeNull();
        expect(AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(firstStack, [{ role: 'user', content: 'mismatch' }])).toBeNull();
        expect(AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(firstStack, lastStack)).toEqual([
            { role: 'assistant', content: 'step 1' },
        ]);

        const messages: AgentChatMessage[] = [
            { role: 'user', content: 'start' },
            { role: 'assistant', content: 'Stopped by user.' },
            { role: 'user', content: 'continue' },
        ];
        expect(AgentStoppedRunContinuationHelper.SpliceResumedTurns(messages, [], messages[1])).toBe(false);
        const spliced = AgentStoppedRunContinuationHelper.SpliceResumedTurns(
            messages,
            [{ role: 'assistant', content: 'partial work' }],
            messages[2]
        );
        expect(spliced).toBe(true);
        expect(messages.map((m) => m.content)).toEqual([
            'start',
            'partial work',
            'Stopped by user.',
            AgentStoppedRunContinuationHelper.StoppedRunResumeNotice,
            'continue',
        ]);

        const appendSpy = vi.fn();
        const reconcileSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                AppendActionResults: appendSpy,
                ReconcileUnansweredToolCalls: reconcileSpy,
            },
        });
        const decision: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            actions: [
                { name: 'DoneAction', params: {} },
                { name: 'InterruptedAction', params: {} },
            ],
        };
        const tail = helper.BuildStoppedRunTail(
            ctx,
            decision,
            [
                {
                    StepNumber: 3,
                    StepType: 'Actions',
                    StepName: 'DoneAction',
                    Status: 'Completed',
                    Success: true,
                    InputData: JSON.stringify({ actionName: 'DoneAction' }),
                    OutputData: JSON.stringify({ actionResult: { success: true, message: 'OK', parameters: [] } }),
                },
            ],
            makeParams()
        );
        expect(tail).toHaveLength(1);
        expect(appendSpy).toHaveBeenCalledTimes(1);
        const summaries = appendSpy.mock.calls[0][1] as Array<{ actionName: string; resultCode: string }>;
        expect(summaries[0]).toMatchObject({ actionName: 'DoneAction', resultCode: 'SUCCESS' });
        expect(summaries[1]).toMatchObject({ actionName: 'InterruptedAction', resultCode: 'NOT_EXECUTED' });
        expect(reconcileSpy).toHaveBeenCalledTimes(1);
    });

    it('resolves @RegisterClass(BaseAgentMessagingHelper) plugins with priority, rejects unknown drivers, and blocks code-only seams', () => {
        expect(TestCustomMessagingPlugin).toBeDefined();
        expect(TestSecondaryMessagingPlugin).toBeDefined();

        // Keyed plugin override via ResolveAgentHelper does not affect default resolution
        const customResolved = ResolveAgentHelper({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
            DriverClass: 'TestCustomMessagingPlugin',
        });
        expect(customResolved).toBeInstanceOf(TestCustomMessagingPlugin);
        expect(customResolved.FormatHierarchicalMessage(CreateMockAgentRunContext(), 'hi')).toBe('[custom] hi');

        // AgentHelperCache selects highest-priority plugin for a seam and caches instance per run
        const cache = new AgentHelperCache();
        cache.ResetForRun([
            { seam: 'messaging', driverClass: 'TestCustomMessagingPlugin', priority: 5 },
            { seam: 'messaging', driverClass: 'TestSecondaryMessagingPlugin', priority: 20 },
        ]);
        const firstInstance = cache.GetOrResolve({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
        const secondInstance = cache.GetOrResolve({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
        expect(firstInstance).toBe(secondInstance);
        expect(firstInstance.FormatHierarchicalMessage(CreateMockAgentRunContext(), 'hi')).toBe('[secondary] hi');

        // Unknown DriverClass fails fast
        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'messaging',
                BaseClass: BaseAgentMessagingHelper,
                DefaultClass: AgentMessagingHelper,
                DriverClass: 'NonExistentMessagingPlugin',
            })
        ).toThrow(/Failed to resolve helper plugin/);

        // Security invariant: code-only seams (`limits`, `actionPolicy`) reject metadata overrides
        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'limits',
                BaseClass: BaseAgentMessagingHelper,
                DefaultClass: AgentMessagingHelper,
                DriverClass: 'TestCustomMessagingPlugin',
            })
        ).toThrow(/code-only/i);

        expect(() =>
            cache.ResetForRun([{ seam: 'actionPolicy', driverClass: 'EvilPolicyOverride' }])
        ).toThrow(/code-only/i);
    });
});
