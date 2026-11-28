/**
 * @fileoverview Backing per-run state container extended by `BaseAgentDeprecatedDelegatesCore`
 * and `BaseAgent`.
 *
 * Holding per-run instance fields on this abstract base class preserves 100% own-property
 * layout on every `BaseAgent` instance (e.g. `agent['_agentRun']`, `agent['_promptTurnCount']`)
 * while allowing `BaseAgentContextBase` to wire `AgentRunContext` cleanly without circular
 * imports or `any` casts, keeping `base-agent.ts` focused and well under 1,000 lines.
 *
 * @internal
 * @module @memberjunction/ai-agents
 */

import type { ActionRunScope, MJActionEntityExtended } from '@memberjunction/actions-base';
import {
    AgentRunStepSaveQueue,
    type AgentChatMessage,
    type AgentConfiguration,
    type AgentHandoffResult,
    type AgentRunAudience,
    type AgentSkillInvocation,
    type AgentTaintedSource,
    type AgentTreeBudget,
    type AIModelSelectionInfo,
    type AIPromptExecutionScope,
    type ArtifactDirective,
    type BaseAgentNextStep,
    type BudgetCostEvent,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type FileOutputRef,
    type MediaOutput,
    type MessageLifecycleCallback,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type PendingLoopCursorState,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import {
    Metadata,
    type IMetadataProvider,
    type MJLimitsBudgetsConfig,
    type MJLimitsResolutionResult,
    type UserInfo,
} from '@memberjunction/core';
import type {
    ConversationBranchRow,
    MJAIAgentExampleEntity,
    MJAIAgentNoteEntity,
    MJAIAgentUserPolicyEntity,
    MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import { ActionResultSpilloverManager } from '../../ActionResultSpilloverManager';
import type { AgentPreExecutionRAGResult } from '../../agent-pre-execution-rag';
import type { BaseAgentType } from '../../agent-types/base-agent-type';
import { AgentContextAssembler } from '../../AgentContextAssembler';
import { AgentDecisionService } from '../../AgentDecisionService';
import { AgentFeedbackCoordinator } from '../../AgentFeedbackCoordinator';
import { AgentStepDispatcher } from '../../AgentStepDispatcher';
import { AgentTreeBudgetTracker } from '../../AgentTreeBudgetTracker';
import { ArtifactToolManager, type ActiveRunTaint } from '../../ArtifactToolManager';
import { BudgetEnforcementGuard } from '../../BudgetEnforcementGuard';
import type { CatalogNarrowingOutcome } from '../../catalog-narrowing';
import { ConversationToolManager } from '../../ConversationToolManager';
import { DeterministicProgressDetector } from '../../DeterministicProgressDetector';
import { FastConvergenceJudge, type FastJudgeUsageSettlement } from '../../FastConvergenceJudge';
import { MemoryWriteManager } from '../../MemoryWriteManager';
import { AgentToolCircuitBreaker } from '../../native-tools/agent-tool-circuit-breaker';
import type { NativeToolBinding } from '../../native-tools/control-tools';
import type { NativeControlConfig } from '../../native-tools/native-control-config';
import type { NativeToolResult } from '../../native-tools/tool-result-turns';
import { PayloadManager } from '../../PayloadManager';
import type { RealtimeRecordingController } from '../../realtime/realtime-recording-capture';
import {
    RunawayCheckpointManager,
    type PendingRunawayCheckpointPersistence,
    type RestoredCheckpointContext,
} from '../../RunawayCheckpointManager';
import { ScratchpadManager } from '../../ScratchpadManager';
import type { SelfCheckLinkRow } from '../../self-check';
import type { SubAgentConsultRecord } from '../../sub-agent-consult';
import { AgentHelperCache } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import {
    ACTION_FAILURE_BUDGET,
    IDENTICAL_FAILURE_THRESHOLD,
    type ActionFailureHistoryEntry,
    type ActionResultCrushConfig,
    type BaseIterationContext,
    type CooperativePauseState,
    type ExtendedProgressStep,
    type HeldCompletionChange,
    type HeldDecisionRequests,
    type PausedRunOutcome,
    type RecordedPromptMessage,
    type ResolvedHandoffTarget,
    type RunLateJudgeScope,
    type RuntimeStateDeliveryCache,
} from '../base-agent-types';
import type { AgentLivenessWatchdog } from '../limits/AgentLivenessWatchdog';
import { AgentStuckDetector } from '../limits/AgentStuckDetector';

/**
 * Abstract base owning all mutable per-run state fields and lazy collaborator singletons
 * for `BaseAgent` instances.
 */
export abstract class BaseAgentStateBase {
    protected abstract logStatus(message: string, verboseOnly?: boolean, params?: ExecuteAgentParams): void;
    protected abstract GetHighestRunTaint(): ActiveRunTaint;
    protected abstract handleLateFastJudgeUsage(settlement: FastJudgeUsageSettlement): void;

    protected _helperCache: AgentHelperCache | undefined;
    protected _cachedRunContext: AgentRunContext | undefined;

    protected get helperCache(): AgentHelperCache {
        return (this._helperCache ??= new AgentHelperCache());
    }

    protected _promptRunner: AIPromptRunner = new AIPromptRunner();
    protected _stepSaveQueue = new AgentRunStepSaveQueue();
    protected _activeProvider: IMetadataProvider = Metadata.Provider; // global-provider-ok: default until Execute() captures per-request provider
    protected _executeParams: ExecuteAgentParams | undefined;
    protected _treeBudget: AgentTreeBudget | undefined;

    private __budgetTracker?: AgentTreeBudgetTracker;
    protected get _budgetTracker(): AgentTreeBudgetTracker {
        return (this.__budgetTracker ??= new AgentTreeBudgetTracker());
    }

    private __feedbackCoordinator?: AgentFeedbackCoordinator;
    protected get _feedbackCoordinator(): AgentFeedbackCoordinator {
        return (this.__feedbackCoordinator ??= new AgentFeedbackCoordinator({
            OnLogStatus: (message, isVerboseOnly, params) => this.logStatus(message, isVerboseOnly, params),
        }));
    }

    private __contextAssembler?: AgentContextAssembler;
    protected get _contextAssembler(): AgentContextAssembler {
        return (this.__contextAssembler ??= new AgentContextAssembler());
    }

    private __stepDispatcher?: AgentStepDispatcher;
    protected get _stepDispatcher(): AgentStepDispatcher {
        return (this.__stepDispatcher ??= new AgentStepDispatcher());
    }

    private __budgetEnforcementGuard?: BudgetEnforcementGuard;
    protected get _budgetEnforcementGuard(): BudgetEnforcementGuard {
        return (this.__budgetEnforcementGuard ??= new BudgetEnforcementGuard());
    }

    private __progressDetector?: DeterministicProgressDetector;
    protected get _progressDetector(): DeterministicProgressDetector {
        return (this.__progressDetector ??= new DeterministicProgressDetector());
    }

    protected __fastConvergenceJudge?: FastConvergenceJudge;
    protected get _fastConvergenceJudge(): FastConvergenceJudge {
        return (this.__fastConvergenceJudge ??= new FastConvergenceJudge(
            undefined,
            (settlement) => this.handleLateFastJudgeUsage(settlement)
        ));
    }

    private __checkpointManager?: RunawayCheckpointManager;
    protected get _checkpointManager(): RunawayCheckpointManager {
        return (this.__checkpointManager ??= new RunawayCheckpointManager());
    }

    protected _activeLimitsResolution: MJLimitsResolutionResult | null = null;
    protected _activeBudgets: MJLimitsBudgetsConfig | null = null;
    protected _resolvedUserPolicy: MJAIAgentUserPolicyEntity | null = null;
    protected _resumedCheckpointContext: RestoredCheckpointContext | null = null;
    protected _pendingLoopCursorToResume: PendingLoopCursorState | null = null;
    protected _cooperativePauseState: CooperativePauseState | null = null;
    protected _checkpointStepCostBaseline: number = 0;
    protected _priorNonStepCostUsd: number = 0;
    protected _priorNonStepTokensUsed: number = 0;
    protected _fastJudgeCostUsd: number = 0;
    protected _fastJudgeTokensUsed: number = 0;
    protected readonly _reconciledFastJudgeInvocationIds = new Set<string>();
    protected _currentLateJudgeScope: RunLateJudgeScope | null = null;
    protected readonly _trackedLateJudgeScopes = new Set<RunLateJudgeScope>();
    protected _priorDayCostBaselineUsd: number | undefined = undefined;
    protected _priorDayWallClockBaselineMs: number | undefined = undefined;
    protected _lastObservedDaySnapshot: { DayBucketUTC: string; CostUsd: number; WallClockMs: number } | null = null;
    protected _budgetCostEvents: BudgetCostEvent[] = [];
    protected _budgetDayBaselines: Record<string, number> = {};
    protected _lastRecordedCostUsd: number = 0;
    protected static readonly REMOTE_PAUSE_POLL_INTERVAL_MS = 2_000; // 2s minimum interval between cross-server DB checks for cooperative pause requests
    protected _lastRemotePausePollMs: number = 0;
    protected _pendingCheckpointPersistence: PendingRunawayCheckpointPersistence | null = null;
    protected _pausedRunOutcome: PausedRunOutcome | null = null;

    protected _agentConfig: AgentConfiguration | undefined;
    protected _lastModelSelectionInfo: AIModelSelectionInfo | undefined;
    protected _lastVolatileStateMessage: AgentChatMessage | undefined;
    protected _heldCompletionChanges: HeldCompletionChange[] = [];
    protected _lastSentFingerprints: string[] | undefined;
    protected _lastSentPrefix: string | undefined;
    protected _resolvedTrailingStateMode: boolean | undefined;
    protected _turn1InsertionIndex: number = -1;

    protected _fatalActionFailures: Set<string> = new Set();
    protected _audienceLockedActions: Set<string> = new Set();
    protected _taintLockedActions: Set<string> = new Set();
    protected _audienceReaders: UserInfo[] | undefined;
    protected _audienceSource: AgentRunAudience | undefined;
    protected _runScope: ActionRunScope | undefined;
    protected _taintedSources: AgentTaintedSource[] = [];
    protected _actionSpilloverManager: ActionResultSpilloverManager = new ActionResultSpilloverManager();
    protected _actionFailureHistory: Map<string, ActionFailureHistoryEntry> = new Map();
    protected _agentToolBreaker = new AgentToolCircuitBreaker(IDENTICAL_FAILURE_THRESHOLD, ACTION_FAILURE_BUDGET);

    protected _agentTypeState: unknown = null;
    protected _agentTypeInstance!: BaseAgentType;
    protected _executionCounts: Map<string, number> = new Map();
    protected _messageLifecycleCallback: MessageLifecycleCallback | undefined;
    protected _generalValidationRetryCount: number = 0;

    protected _agentRun: MJAIAgentRunEntityExtended | null = null;
    protected _runAbortController: AbortController | null = null;
    protected _livenessWatchdog: AgentLivenessWatchdog | null = null;
    protected readonly _stuckDetector: AgentStuckDetector = new AgentStuckDetector();
    protected _awaitingWorkflowTaskID: string | null = null;
    protected _feedbackRequestId: string | null = null;
    protected _handoffResult: AgentHandoffResult | null = null;
    protected _resolvedHandoffTarget: ResolvedHandoffTarget | null = null;
    protected _resolvedStorageAccountId: string | null = null;
    protected _lastSubAgentArtifactDirective: ArtifactDirective | undefined = undefined;
    protected _lastSubAgentPayloadArtifactTypeID: string | undefined = undefined;

    /** Minimum serialized action result character count before applying context-crush summarization. */
    protected static readonly ACTION_RESULT_CRUSH_THRESHOLD = 600;
    protected _agentHierarchy: string[] = [];
    protected _iterationContext: BaseIterationContext | null = null;
    protected _depth: number = 0;
    protected _parentStepCounts: number[] = [];
    protected _allProgressSteps: ExtendedProgressStep[] = [];
    protected _subAgentRuns: ExecuteAgentResult[] = [];
    protected _mediaOutputs: MediaOutput[] = [];
    protected _fileOutputs: FileOutputRef[] = [];

    protected _payloadManager: PayloadManager = new PayloadManager();
    protected _scratchpadManager: ScratchpadManager = new ScratchpadManager();
    protected _artifactToolManager: ArtifactToolManager = new ArtifactToolManager({
        getRunTaint: () => this.GetHighestRunTaint(),
    });
    protected _agentDecisionService: AgentDecisionService = new AgentDecisionService();
    protected _nativeToolBindings: ReadonlyMap<string, NativeToolBinding> | undefined;
    protected _pendingAgentToolResults: { results: NativeToolResult[] } | undefined;
    protected _conversationToolTurn: { turn: number; count: number } | undefined;
    protected _nativeControl: { source: string | null; config: NativeControlConfig } | undefined;
    protected _lastNativeTurnAppended: BaseAgentNextStep['nativeTurn'] | undefined;
    protected _conversationToolManager: ConversationToolManager = new ConversationToolManager();
    protected _conversationBranches: ConversationBranchRow[] = [];
    protected _memoryWriteManager: MemoryWriteManager = new MemoryWriteManager();

    protected _effectiveActions: MJActionEntityExtended[] = [];
    protected _effectiveSubAgents: MJAIAgentEntityExtended[] = [];
    protected _effectiveCatalogComputed = false;
    protected _agentTypePromptParams: Record<string, unknown> | undefined;
    protected _catalogNarrowing: CatalogNarrowingOutcome | undefined;
    protected _openingRequest: string = '';
    protected _runExecutionScope: AIPromptExecutionScope | undefined;
    protected _isOpeningTurn: boolean = false;
    protected _heldDecisions: HeldDecisionRequests | undefined;

    protected _activatedSkillIDs: string[] = [];
    protected _conversationSkillIDs: string[] = [];
    protected _skillInvocations: AgentSkillInvocation[] = [];

    protected _planModeActive: boolean = false;
    protected _planApproved: boolean = false;
    protected _promptTurnCount: number = 0;
    protected _lastRecordedPromptStack: RecordedPromptMessage[] | null = null;
    protected _actionResultCrush: ActionResultCrushConfig | undefined = undefined;
    protected _dynamicActionLimits: Record<string, number> = {};
    protected _validationRetryCount: number = 0;
    protected _subAgentConsultRounds: Map<string, number> = new Map();
    protected _openSubAgentConsults: Map<string, SubAgentConsultRecord> = new Map();
    protected _loggedConsultUnsupportedAgentType: boolean = false;
    protected _contextRecoveryAttempts: number = 0;
    protected readonly MAX_RECOVERY_ATTEMPTS: number = 1;

    protected realtimeInFlightTurns: Map<string, { id: string; open: boolean }> = new Map();
    protected realtimePersistQueues: Map<string, Promise<void>> = new Map();
    protected realtimeRecording: RealtimeRecordingController | null = null;
    protected realtimeRecordingAccountId: string | null = null;

    protected _injectedMemory: { notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] } = {
        notes: [],
        examples: [],
    };
    protected _injectedRAG: AgentPreExecutionRAGResult | null = null;

    protected _lastRuntimeStateDeliveryCache: RuntimeStateDeliveryCache | null = null;
    protected _cachedTemplatesArrayRef: MJTemplateEntityExtended[] | null = null;
    protected _templateByIdMap: Map<string, MJTemplateEntityExtended> | null = null;
    protected _templateEngineConfiguredForRun = false;

    protected _selfCheckAttemptsByRun = new Map<string, number>();
    protected _selfCheckLinkByAgent = new Map<string, SelfCheckLinkRow | null>();
}
