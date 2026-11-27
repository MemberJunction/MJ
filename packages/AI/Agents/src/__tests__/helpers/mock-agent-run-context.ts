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
import { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import { AgentDecisionService } from '../../AgentDecisionService';
import type { AgentFeedbackCoordinator } from '../../AgentFeedbackCoordinator';
import { AgentStepDispatcher } from '../../AgentStepDispatcher';
import { AgentTreeBudgetTracker } from '../../AgentTreeBudgetTracker';
import { ArtifactToolManager } from '../../ArtifactToolManager';
import { PayloadManager } from '../../PayloadManager';
import { PipelineToolRegistry } from '../../pipeline';
import { ScratchpadManager } from '../../ScratchpadManager';
import type { AgentHelperSubclassHooks, AgentRunContext } from '../../helpers/AgentRunContext';

export function CreateMockAgentRunContext(
    overrides?: Partial<Omit<AgentRunContext, 'Hooks'>> & { Hooks?: Partial<AgentHelperSubclassHooks> }
): AgentRunContext {
    const budgetTracker = new AgentTreeBudgetTracker();
    const stepSaveQueue = new AgentRunStepSaveQueue();
    const payloadManager = new PayloadManager();
    const stepDispatcher = new AgentStepDispatcher();
    const actionSpilloverManager = new ActionResultSpilloverManager();
    const artifactToolManager = new ArtifactToolManager({
        AgentRunId: '11111111-1111-4111-8111-111111111111',
    });
    const scratchpadManager = new ScratchpadManager();
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
        EmitMessageLifecycleEvent: vi.fn(),
        AreArtifactToolsEnabled: () => false,
        StubToolTurn: (msg, text) => ({ ...msg, content: text }),
        GetNativeControlConfig: () => ({ NativeOnly: false, DualChannel: false, EmitJsonEnvelope: true, SendToolResultsNatively: false }),
        RecordPromptUsageInTreeBudget: vi.fn(),
        FlushPromptRunnerSaves: vi.fn(async () => undefined),
        CalculateTokenStats: () => ({
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalTokensUsed: 0,
            totalCost: 0,
            totalCostRollup: 0,
            totalPromptTokensRollup: 0,
            totalCompletionTokensRollup: 0,
            totalTokensUsedRollup: 0,
        }),
        ApplyTokenStatsToRun: vi.fn(),
        EstimateTokens: (c) => Math.ceil((typeof c === 'string' ? c.length : JSON.stringify(c).length) / 4),
        EstimateConversationTokens: (msgs) => msgs.reduce((s, m) => s + Math.ceil((typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length) / 4), 0),
        HeuristicTokenCount: (t) => Math.ceil(t.length / 4),
        TryGetModelMaxInputTokens: () => null,
        GetModelContextLimit: () => 128_000,
        IsToolResultMessage: (m) => m.role === 'tool',
        IsVolatileResultMessage: () => false,
        ContentToString: (c) => (typeof c === 'string' ? c : JSON.stringify(c)),
        SmartTrimContent: (c) => ({ trimmed: c, strategy: 'none', originalLength: c.length }),
        CompactMessage: vi.fn(async (m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))),
        GetSystemDefaultCompactPromptId: () => '',
        CreateCompactionStep: vi.fn(),
        UpdateCompactionStep: vi.fn(async () => undefined),
        ResolveCompactionBudget: () => ({
            ContextWindowTokens: 128_000,
            TriggerTokens: 100_000,
            TargetTokens: 60_000,
            MaxCompactionTokens: 10_000,
            KeepRecentMessages: 4,
            Enabled: false,
            Source: 'default',
        }),
        RunCrossTurnCompaction: vi.fn(async () => undefined),
        RecordCompactionRunStep: vi.fn(async () => undefined),
        TriggerPostRunMemoryExtraction: vi.fn(async () => undefined),
        CreateMemoryManagerAgent: vi.fn(async () => ({ Execute: vi.fn(async () => ({ success: true, agentRun: {} })) })),
        RecoveryStrategy_DropStaleVolatileState: () => ({ tokensSaved: 0, strategyName: 'DropStaleVolatileState' }),
        RecoveryStrategy_RemoveOldestToolResults: () => ({ tokensSaved: 0, strategyName: 'RemoveOldestToolResults' }),
        RecoveryStrategy_CompactOldToolResults: vi.fn(async () => ({ tokensSaved: 0, strategyName: 'CompactOldToolResults' })),
        RecoveryStrategy_CompactAllToolResults: vi.fn(async () => ({ tokensSaved: 0, strategyName: 'CompactAllToolResults' })),
        RecoveryStrategy_TrimLastUserMessage: () => ({ tokensSaved: 0, strategyName: 'TrimLastUserMessage' }),
        SessionAudienceRefusal: () => null,
        RunScopeFor: () => ({}),
        ActiveSkillIDsForRun: () => [],
        GetEffectiveActionsForValidation: () => [],
        ExecuteSingleAction: vi.fn(async () => ({ Success: true, Message: 'ok', Params: [] })),
        CreateFailureResult: vi.fn(async () => ({ success: false }) as never),
        FinalizeAgentRun: vi.fn(async () => ({ success: true }) as never),
        BuildBridgePrepInput: vi.fn(),
        ResolveRealtimeModel: vi.fn(async () => null),
        ResolveRealtimePlatformCredentials: vi.fn(async () => ({ ResolverFor: () => () => undefined })),
        ResolveRealtimeEffectiveConfig: () => ({}),
        BuildRealtimeSessionDeps: vi.fn(),
        DelegateRealtimeToTarget: vi.fn(async () => ({ CallID: '', Success: false, Output: '' })),
        ResolveRealtimeTargetAgent: () => null,
        ParseDelegateRequestText: (s) => s,
        PersistRealtimeTranscript: vi.fn(async () => null),
        FinalizeRealtimeRecording: vi.fn(async () => undefined),
        ValidateActionInAgent: () => null,
        ValidateSubAgentInAgent: () => null,
        GetAvailableActionsForAgent: () => [],
        ResolveActionEntityForAgent: () => undefined,
        IndexEffectiveAgentActions: () => new Map(),
        MatchNamedBySanitizedToolName: () => ({}),
        ResolveActionTrustLevel: () => 'Trusted',
        RecordTaintedSource: vi.fn(),
        AudienceReadersFor: vi.fn(async () => ({ Readers: [] })),
        ExecuteActionsStep: vi.fn(async () => ({ step: 'Retry' as const, terminate: false, priorStepResult: [] })),
        ProcessSubAgentStep: vi.fn(async () => ({ step: 'Retry' as const, terminate: false })),
        CloneSubAgentPayload: <T>(p: T) => structuredClone(p),
        FormatActionResultsAsMarkdown: () => '',
        CheckInlineLoopIterationGovernance: vi.fn(async () => null),
        BuildPipelineRegistry: () => new PipelineToolRegistry(),
        GetValueFromPath: () => undefined,
        ResolveTemplates: (obj) => obj,
        ResolveValueFromContext: (v) => v,
        ResolveInlineTemplateExpressions: (t) => t,
        ApplyLoopOutputFold: (p) => (p as Record<string, unknown>) ?? {},
        FormatLoopResultsAsMarkdown: () => '',
        ResolveLoopExpirationMetadata: () => ({ turnAdded: 0, messageType: 'loop-result' }),
        ExecuteSingleForEachIteration: vi.fn(async () => ({})),
        ExecuteSingleWhileIteration: vi.fn(async () => ({})),
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
        AgentConfig: undefined,
        LastModelSelectionInfo: undefined,
        ActionSpilloverManager: actionSpilloverManager,
        ArtifactToolManager: artifactToolManager,
        ScratchpadManager: scratchpadManager,
        RealtimeInFlightTurns: new Map(),
        RealtimePersistQueues: new Map(),
        RealtimeRecording: null,
        RealtimeRecordingAccountId: null,
        StepDispatcher: stepDispatcher,
        AgentTypeInstance: undefined,
        ActionResultCrush: undefined,
        PendingLoopCursorToResume: null,
        PausedRunOutcome: null,
        ...restOverrides,
        Hooks: {
            ...defaultHooks,
            ...hookOverrides,
        },
    };
}
