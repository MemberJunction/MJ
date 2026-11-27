/**
 * Shared test factory creating a lightweight mock `AgentRunContext` for isolated helper unit tests
 * without instantiating `BaseAgent`.
 */
import { vi } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { LimitsConfigResolver } from '@memberjunction/core';
import type {
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentRunStepSaveQueue } from '@memberjunction/ai-core-plus';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AgentDecisionService } from '../../AgentDecisionService';
import type { AgentFeedbackCoordinator } from '../../AgentFeedbackCoordinator';
import { AgentTreeBudgetTracker } from '../../AgentTreeBudgetTracker';
import { PayloadManager } from '../../PayloadManager';
import type { AgentHelperSubclassHooks, AgentRunContext } from '../../helpers/AgentRunContext';

export function CreateMockAgentRunContext(
    overrides?: Partial<Omit<AgentRunContext, 'Hooks'>> & { Hooks?: Partial<AgentHelperSubclassHooks> }
): AgentRunContext {
    const budgetTracker = new AgentTreeBudgetTracker();
    const stepSaveQueue = new AgentRunStepSaveQueue();
    const payloadManager = new PayloadManager();
    const defaultHooks: AgentHelperSubclassHooks = {
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
        CheckMinimumExecutionRequirements: vi.fn(async () => []),
        HandleFinalPayloadValidationFailure: vi.fn(async (_p, step) => step),
        ResolvedLimits: () => LimitsConfigResolver.Resolve().Limits,
        DecisionsEnabled: () => false,
        AttachDecisionPromptRun: vi.fn(),
        ResolveMediaPlaceholdersInPayload: <T>(p: T) => p,
        CheckPayloadChangesWhenOn: vi.fn(async () => undefined),
    };

    const { Hooks: hookOverrides, ...restOverrides } = overrides ?? {};

    return {
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
        MediaOutputs: [],
        PayloadManager: payloadManager,
        AgentDecisionService: {} as AgentDecisionService,
        HeldCompletionChanges: [],
        ValidationRetryCount: 0,
        GeneralValidationRetryCount: 0,
        ...restOverrides,
        Hooks: {
            ...defaultHooks,
            ...hookOverrides,
        },
    };
}
