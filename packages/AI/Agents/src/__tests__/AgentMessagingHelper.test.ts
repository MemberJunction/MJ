/**
 * Dedicated interface-level unit tests for Slice s1:
 *   - BaseAgentMessagingHelper / AgentMessagingHelper
 *   - AgentStoppedRunContinuationHelper
 *   - AgentHelperResolver & AgentHelperCache (incl. @RegisterClass override + code-only seam security)
 *
 * Tests exercise helpers directly against a lightweight mock AgentRunContext with ZERO BaseAgent instantiation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type {
    AgentChatMessage,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentRunStepSaveQueue } from '@memberjunction/ai-core-plus';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import { AgentTreeBudgetTracker } from '../AgentTreeBudgetTracker';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentMessagingHelper } from '../helpers/messaging/AgentMessagingHelper';
import { AgentStoppedRunContinuationHelper } from '../helpers/messaging/AgentStoppedRunContinuationHelper';
import { BaseAgentMessagingHelper } from '../helpers/messaging/BaseAgentMessagingHelper';
import { CarryForwardToolFamily } from '../tool-result-format';

function createMockRunContext(overrides?: Partial<AgentRunContext>): AgentRunContext {
    const budgetTracker = new AgentTreeBudgetTracker();
    const stepSaveQueue = new AgentRunStepSaveQueue();
    const ctx: AgentRunContext = {
        ActiveProvider: {
            GetEntityObject: vi.fn(),
        } as unknown as IMetadataProvider,
        get ProviderToUse() {
            return this.ActiveProvider;
        },
        ExecuteParams: undefined,
        AgentRun: {
            ID: '11111111-1111-4111-8111-111111111111',
            AgentID: '22222222-2222-4222-8222-222222222222',
            Agent: 'TestAgent',
            Status: 'Running',
            Steps: [],
        } as unknown as MJAIAgentRunEntityExtended,
        StepSaveQueue: stepSaveQueue,
        PromptRunner: {} as AIPromptRunner,
        BudgetTracker: budgetTracker,
        FeedbackCoordinator: {
            CreateFeedbackRequest: vi.fn(async () => 'req-123'),
        } as unknown as AgentFeedbackCoordinator,
        AgentHierarchy: ['RootAgent'],
        Depth: 0,
        ParentStepCounts: [],
        AllProgressSteps: [],
        PromptTurnCount: 1,
        LastRecordedPromptStack: null,
        SkillInvocations: [],
        ConversationBranches: [],
        OpenSubAgentConsults: new Map(),
        MessageLifecycleCallback: undefined,
        FeedbackRequestId: undefined,
        Hooks: {
            LogStatus: vi.fn(),
            LogError: vi.fn(),
            FormatHierarchicalMessage: (msg) => msg,
            FitStepName: (_step, name) => name.slice(0, 255),
            BuildHierarchicalStep: (step, parents) =>
                step == null ? undefined : parents.length === 0 ? String(step) : [...parents, step].join('.'),
            CreateStepEntity: vi.fn(),
            FinalizeStepEntity: vi.fn(),
            QueueStepSave: vi.fn(),
            SerializePayloadAtStart: (p) => (p === undefined ? null : JSON.stringify(p)),
            SerializePayloadAtEnd: (p) => (p === undefined ? null : JSON.stringify(p)),
            HasDefaultPayloadSerializers: () => true,
            EnsureTreeBudget: () => ({
                MaxTotalSteps: null,
                MaxTotalTokens: null,
                MaxTotalCost: null,
                MaxWallClockMs: null,
                StartedAtMs: Date.now(),
                StepsExecuted: 0,
                TokensUsed: 0,
                CostUsed: 0,
            }),
            RunPromptExecutionScope: () => ({}),
            RunAudienceAddsReader: () => false,
            MaxStandaloneToolResultChars: () => 100_000,
            CapStandaloneToolResultText: (t) => t,
            FormatSubAgentResultAsMarkdown: (name, res) => `SubAgent ${name}: ${res.success}`,
            BuildActionInvocationMessage: () => 'invoked',
            BuildActionResultsMessage: () => 'results',
            AppendActionResults: vi.fn(),
            ReconcileUnansweredToolCalls: vi.fn(),
            InterceptLargeBinaryContent: (p) => p,
            LoadPriorTurnToolResultSteps: vi.fn(async () => []),
            LoadStoppedRunContinuation: vi.fn(async () => null),
            ApplyStoppedRunContinuation: vi.fn(),
            BuildResumedStoppedRunTurns: vi.fn(() => null),
            BuildStoppedRunTail: vi.fn(() => []),
            RaiseFeedbackRequest: vi.fn(async () => undefined),
            CreateFeedbackRequest: vi.fn(async () => undefined),
        },
        ...overrides,
    };
    return ctx;
}

describe('Slice s1 — AgentMessagingHelper, AgentStoppedRunContinuationHelper & AgentHelperResolver', () => {
    const helper = new AgentMessagingHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('formats hierarchical messages, initialization/prompt progress messages, and step names directly via AgentRunContext', () => {
        const rootCtx = createMockRunContext({ Depth: 0, AgentHierarchy: ['Root'] });
        const subCtx = createMockRunContext({ Depth: 2, AgentHierarchy: ['Root', 'Planner', 'Coder'] });
        const agent = { ID: 'a1', Name: 'Coder' } as MJAIAgentEntityExtended;
        const params = { agent, conversationMessages: [], contextUser: { ID: 'u1' } as UserInfo } as ExecuteAgentParams;

        expect(helper.FormatHierarchicalMessage(rootCtx, 'Running')).toBe('Running');
        expect(helper.FormatHierarchicalMessage(subCtx, 'Running')).toBe('Planner → Coder: Running');
        expect(helper.BuildInitializationProgressMessage(rootCtx, params)).toBe('Getting ready...');
        expect(helper.BuildInitializationProgressMessage(subCtx, params)).toBe('Planner: Starting Coder...');
        expect(helper.BuildPromptProgressMessage(rootCtx, params, null)).toBe('Coder is thinking...');
        expect(helper.BuildPromptProgressMessage(subCtx, params, { step: 'Retry', retryReason: 'Payload change applied', terminate: false } as BaseAgentNextStep)).toBe(
            'Thinking through the next steps...'
        );
        expect(helper.BuildHierarchicalStep(subCtx, 3, [2, 1])).toBe('2.1.3');
        expect(helper.FitStepName(rootCtx, {} as MJAIAgentRunStepEntityExtended, 'x'.repeat(300)).length).toBe(255);
    });

    it('captures append-only prompt message deltas cleanly and strips volatile state messages', () => {
        const ctx = createMockRunContext();
        const m1: AgentChatMessage = { role: 'user', content: 'hello' };
        const volatile: AgentChatMessage = { role: 'user', content: '<mj-runtime-state/>', metadata: { volatileState: true } };
        const m2: AgentChatMessage = { role: 'assistant', content: 'working' };

        const first = helper.CapturePromptStepMessages(ctx, [m1, volatile]);
        expect(first.conversationMessagesDelta).toBeUndefined();
        expect(first.conversationMessages).toEqual([m1]);

        const second = helper.CapturePromptStepMessages(ctx, [m1, m2, volatile]);
        expect(second.conversationMessagesDelta).toBe(true);
        expect(second.conversationMessages).toEqual([m2]);
    });

    it('wraps progress callbacks, records ExtendedProgressStep metadata, and isolates throwing callbacks', () => {
        const ctx = createMockRunContext({ Depth: 1, AgentHierarchy: ['Root', 'Child'], ParentStepCounts: [4] });
        const received: unknown[] = [];
        const wrapped = helper.WrapProgressCallback(ctx, (p) => received.push(p));
        expect(wrapped).toBeDefined();

        wrapped!({ step: 'prompt_execution', message: 'Thinking', metadata: { stepCount: 2 } });
        expect(ctx.AllProgressSteps).toHaveLength(1);
        expect(ctx.AllProgressSteps[0].hierarchicalStep).toBe('4.2');
        expect(received).toHaveLength(1);

        const throwingParams = {
            agent: { ID: 'a1', Name: 'A' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            contextUser: { ID: 'u1' } as UserInfo,
            onProgress: () => {
                throw new Error('socket closed');
            },
        } as ExecuteAgentParams;
        expect(() => helper.SafeOnProgress(ctx, throwingParams, { step: 'prompt_execution', message: 'hi' })).not.toThrow();
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(1);
    });

    it('injects tool/memory/decision messages and caps oversized standalone results', () => {
        const ctx = createMockRunContext({ PromptTurnCount: 3 });
        ctx.Hooks.MaxStandaloneToolResultChars = () => 20;
        const capped = helper.CapStandaloneToolResultText(ctx, 'abcdefghijklmnopqrstuvwxyz0123456789');
        expect(capped).toContain('truncated');

        const params = {
            agent: { ID: 'a1', Name: 'A' } as MJAIAgentEntityExtended,
            conversationMessages: [] as AgentChatMessage[],
            contextUser: { ID: 'u1' } as UserInfo,
        } as ExecuteAgentParams;

        helper.InjectMemoryWriteResultsMessage(ctx, params, [
            { request: { note: 'Remember timezone is CST' }, disposition: 'saved' } as unknown as Parameters<typeof helper.InjectMemoryWriteResultsMessage>[2][number],
        ]);
        expect(params.conversationMessages).toHaveLength(1);
        expect(params.conversationMessages[0].content).toContain('Memory write result:');

        helper.InjectDecisionResultsMessage(ctx, params, [{ id: 'd1', answers: {} } as unknown as Parameters<typeof helper.InjectDecisionResultsMessage>[2][number]]);
        expect(params.conversationMessages).toHaveLength(2);
        expect(params.conversationMessages[1].content).toContain('Decision results:');
    });

    it('builds prior-turn and stopped-run continuation messages while filtering untrusted tool results', () => {
        const msg = AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage(
            [
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
            ],
            10_000
        );
        expect(msg).toContain('search_messages');
        expect(msg).not.toContain('secret injection');

        const messages: AgentChatMessage[] = [
            { role: 'user', content: 'start' },
            { role: 'user', content: 'continue' },
        ];
        const spliced = AgentStoppedRunContinuationHelper.SpliceResumedTurns(
            messages,
            [{ role: 'assistant', content: 'partial work' }],
            messages[1]
        );
        expect(spliced).toBe(true);
        expect(messages.map((m) => m.content)).toEqual([
            'start',
            'partial work',
            AgentStoppedRunContinuationHelper.StoppedRunResumeNotice,
            'continue',
        ]);
    });

    it('resolves default and custom @RegisterClass(BaseAgentMessagingHelper) plugins and blocks code-only seams from metadata', () => {
        const defaultResolved = ResolveAgentHelper({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
        expect(defaultResolved).toBeInstanceOf(AgentMessagingHelper);

        @RegisterClass(BaseAgentMessagingHelper, 'TestCustomMessagingPlugin')
        class TestCustomMessagingPlugin extends AgentMessagingHelper {
            public override FormatHierarchicalMessage(_ctx: AgentRunContext, baseMessage: string): string {
                return `[custom] ${baseMessage}`;
            }
        }
        // Keep reference live so bundler/TS never treats the class as unused.
        expect(TestCustomMessagingPlugin).toBeDefined();

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'messaging', driverClass: 'TestCustomMessagingPlugin', priority: 10 }]);
        const pluginInstance = cache.GetOrResolve({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
        expect(pluginInstance.FormatHierarchicalMessage(createMockRunContext(), 'hi')).toBe('[custom] hi');

        // Security invariant: code-only seams (`limits`, `actionPolicy`) must reject metadata overrides.
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

        // Clean up our test-only registration so global ClassFactory stays spotless.
        const factory = MJGlobal.Instance.ClassFactory as unknown as {
            _registrations: Array<{ Key: string | null }>;
        };
        factory._registrations = factory._registrations.filter((r) => r.Key !== 'TestCustomMessagingPlugin');
    });
});
