/**
 * @fileoverview Base implementation for AI Agents in the MemberJunction framework.
 *
 * `BaseAgent` is the public execution facade for all MJ agents (Loop, Flow, Harness,
 * Realtime, and custom driver subclasses). Its implementation is decomposed into 13
 * strongly-typed, pluggable `BaseAgent*Helper` seams resolved through
 * `MJGlobal.Instance.ClassFactory` (`@RegisterClass`), sharing live per-run state via
 * `AgentRunContext` and preserving backwards-compatible `v6.x` protected hooks through
 * `BaseAgentContextBase` / `BaseAgentDeprecatedDelegates`.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage, ChatMessageContent, IRealtimeSession } from '@memberjunction/ai';
import type {
    AgentAction,
    AgentChatMessage,
    AgentTaintedSource,
    AgentTreeBudget,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    FileOutputRef,
    MediaOutput,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    RunawayJsonObject,
    SkillAvailabilityPurpose,
    StopContinuationMode,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    CODE_FALLBACK_LIMITS,
    LimitsConfigResolver,
    Metadata,
    ServerOperationScopeManager,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import type {
    ConversationBranchRow,
    MJAIAgentConfigurationEntity,
    MJAISkillEntity,
} from '@memberjunction/core-entities';
import {
    ActiveRunGovernanceRegistry,
    type ResumeContinuationDispatcher,
} from './ActiveRunGovernanceRegistry';
import type { ActionResultSpilloverManager } from './ActionResultSpilloverManager';
import type { BaseAgentType } from './agent-types/base-agent-type';
import type { ArtifactToolManager } from './ArtifactToolManager';
import type { PauseRunWithCheckpointResult } from './RunawayCheckpointManager';
import type { ScratchpadManager } from './ScratchpadManager';
import type { CarryForwardStepRecord, StoppedRunStepRecord } from './tool-result-format';
import {
    ACTION_FAILURE_BUDGET,
    CircuitBreakerActionResult,
    IDENTICAL_FAILURE_THRESHOLD,
    NON_RETRYABLE_RESULT_CODES,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
    type ActionCircuitBreakerReason,
    type ActionFailureClass,
    type ActionResultCrushConfig,
    type ActionResultSummary,
    type ExecuteSingleActionOptions,
    type GuardrailVerdict,
    type StoppedRunStackStepRecord,
} from './helpers/base-agent-types';
import { BaseAgentContextBase } from './helpers/compat/BaseAgentContextBase';
import { AgentHelperResolutionError, ResolveAgentHelperPluginsForRun } from './helpers/AgentHelperResolver';
import { BaseAgentMessagingHelper } from './helpers/messaging/BaseAgentMessagingHelper';
import { AgentMessagingHelper } from './helpers/messaging/AgentMessagingHelper';
import { AgentStoppedRunContinuationHelper } from './helpers/messaging/AgentStoppedRunContinuationHelper';
import { BaseAgentPayloadHelper } from './helpers/payload/BaseAgentPayloadHelper';
import { AgentPayloadHelper } from './helpers/payload/AgentPayloadHelper';
import { BaseAgentCompactionHelper } from './helpers/compaction/BaseAgentCompactionHelper';
import { AgentCompactionHelper } from './helpers/compaction/AgentCompactionHelper';
import { BaseAgentRealtimeHelper } from './helpers/realtime/BaseAgentRealtimeHelper';
import { AgentRealtimeHelper } from './helpers/realtime/AgentRealtimeHelper';
import { BaseAgentIterationHelper } from './helpers/iteration/BaseAgentIterationHelper';
import { AgentIterationHelper } from './helpers/iteration/AgentIterationHelper';
import { BaseAgentSkillsHelper } from './helpers/skills/BaseAgentSkillsHelper';
import { AgentSkillsHelper } from './helpers/skills/AgentSkillsHelper';
import { BaseAgentLimitsHelper } from './helpers/limits/BaseAgentLimitsHelper';
import { AgentLimitsHelper } from './helpers/limits/AgentLimitsHelper';
import type { LivenessProgressKind } from './helpers/limits/AgentLivenessWatchdog';
import { BaseAgentActionPolicyHelper } from './helpers/actions/BaseAgentActionPolicyHelper';
import { AgentActionPolicyHelper } from './helpers/actions/AgentActionPolicyHelper';
import { BaseAgentActionsHelper } from './helpers/actions/BaseAgentActionsHelper';
import { AgentActionsHelper } from './helpers/actions/AgentActionsHelper';
import { BaseAgentPromptHelper } from './helpers/prompt/BaseAgentPromptHelper';
import { AgentPromptHelper } from './helpers/prompt/AgentPromptHelper';
import { AgentNativeToolsAndPrefixCacheHelper } from './helpers/prompt/AgentNativeToolsAndPrefixCacheHelper';
import { BaseAgentSubAgentHelper } from './helpers/subagents/BaseAgentSubAgentHelper';
import { AgentSubAgentHelper } from './helpers/subagents/AgentSubAgentHelper';
import { BaseAgentStepExecutionHelper } from './helpers/steps/BaseAgentStepExecutionHelper';
import { AgentStepExecutionHelper } from './helpers/steps/AgentStepExecutionHelper';
import { BaseAgentRunSetupHelper } from './helpers/setup/BaseAgentRunSetupHelper';
import { AgentRunSetupHelper } from './helpers/setup/AgentRunSetupHelper';
import { AgentRunFinalizationHelper } from './helpers/setup/AgentRunFinalizationHelper';

// Same-package exports kept on ./base-agent for internal/direct-path import compatibility.
export {
    ACTION_FAILURE_BUDGET,
    CircuitBreakerActionResult,
    IDENTICAL_FAILURE_THRESHOLD,
    NON_RETRYABLE_RESULT_CODES,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
};
export type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionResultCrushConfig,
    ActionResultSummary,
    ExecuteSingleActionOptions,
    StoppedRunStackStepRecord,
};

/**
 * Base implementation for AI Agents in the MemberJunction framework.
 *
 * Orchestrates hierarchical prompt composition, action/sub-agent/skill/task-graph/handoff
 * execution, runaway governance, and run persistence by delegating across 13 pluggable
 * `BaseAgent*Helper` seams resolved through `MJGlobal.Instance.ClassFactory`.
 */
export class BaseAgent extends BaseAgentContextBase {
    // =========================================================================
    // Public & Protected Static Constants & Utility Methods
    // =========================================================================

    /** Abort reason prefix distinguishing wall-clock timeout aborts from caller cancellations. */
    public static readonly AgentTimeoutAbortReason = 'Agent execution exceeded maxExecutionTimeMs';
    /** Abort reason prefix distinguishing sliding-liveness inactivity aborts from caller cancellations. */
    public static readonly AgentInactivityAbortReason = 'Agent execution stalled with no progress signal';

    public static readonly DefaultStopContinuationMode: StopContinuationMode =
        AgentStoppedRunContinuationHelper.DefaultStopContinuationMode;
    public static readonly StoppedRunResumeNotice: string =
        AgentStoppedRunContinuationHelper.StoppedRunResumeNotice;
    protected static readonly maxStoppedRunResultChars: number =
        AgentStoppedRunContinuationHelper.MaxStoppedRunResultChars;
    public static readonly CarryForwardToolFamilies: readonly string[] =
        AgentStoppedRunContinuationHelper.CarryForwardToolFamilies;
    public static readonly SummarizeRangePromptName: string =
        AgentStoppedRunContinuationHelper.SummarizeRangePromptName;

    /** Longest time (ms) a catalog-narrowing decision may take before failing open. */
    private static readonly CATALOG_NARROWING_TIMEOUT_MS = 30000;
    /** Maximum concurrent decision calls executed in one agent turn. */
    private static readonly DECISION_CONCURRENCY = 8;

    private static get MAX_VALIDATION_RETRIES(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxValidationRetries;
    }

    private static get MAX_CONSECUTIVE_FAILED_STEPS(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxConsecutiveFailedSteps;
    }

    private static get MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxConsecutiveUnproductiveRetries;
    }

    protected static get DEFAULT_ABSOLUTE_MAX_ITERATIONS(): number {
        return LimitsConfigResolver.Resolve().Limits.AgentAbsoluteIterations;
    }

    /** Registers (or clears with `null`) the continuation dispatcher invoked when a paused run resumes. */
    public static RegisterResumeContinuationDispatcher(dispatcher: ResumeContinuationDispatcher | null): void {
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(dispatcher);
    }

    /** Resumes a paused run from its persisted checkpoint on a fresh `BaseAgent` (or subclass) instance. */
    public static async ResumePausedRun<C = RunawayJsonObject, R = RunawayJsonObject>(
        agentInstance: BaseAgent,
        params: ExecuteAgentParams<C>
    ): Promise<ExecuteAgentResult<R>> {
        return agentInstance.ResumePausedRun<C, R>(params);
    }

    /** Maps an abort signal reason string to the run's schema `CancellationReason` value. */
    public static CancellationReasonForAbort(
        reason: string | null | undefined
    ): NonNullable<MJAIAgentRunEntityExtended['CancellationReason']> {
        return AgentRunFinalizationHelper.CancellationReasonForAbort(
            reason,
            BaseAgent.AgentTimeoutAbortReason,
            BaseAgent.AgentInactivityAbortReason
        );
    }

    /** Returns the serialized payload recorded at the end of the latest step that captured one, or `null`. */
    public static LastStepPayload(
        steps:
            | ReadonlyArray<{
                  ID?: string;
                  StepNumber: number;
                  PayloadAtStart?: string | null;
                  PayloadAtEnd: string | null;
                  PayloadAtStartSourceStepID?: string | null;
                  PayloadAtEndSourceStepID?: string | null;
              }>
            | null
            | undefined
    ): string | null {
        return AgentPayloadHelper.LastStepPayload(steps);
    }

    public static ExtractStoppedRunLoopTurns(
        firstStack: AgentChatMessage[] | null,
        lastStack: AgentChatMessage[] | null
    ): AgentChatMessage[] | null {
        return AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(firstStack, lastStack);
    }

    public static SpliceResumedTurns(
        messages: ChatMessage[],
        resumed: AgentChatMessage[],
        continuationMessage: ChatMessage | undefined
    ): boolean {
        return AgentStoppedRunContinuationHelper.SpliceResumedTurns(messages, resumed, continuationMessage);
    }

    public static BuildStoppedRunResultsMessage(
        steps: ReadonlyArray<StoppedRunStepRecord>,
        maxChars: number
    ): string | null {
        return AgentStoppedRunContinuationHelper.BuildStoppedRunResultsMessage(steps, maxChars);
    }

    public static BuildPriorTurnRunFilter(
        conversationId: string,
        agentId: string,
        branchId: string | null,
        branches: ReadonlyArray<ConversationBranchRow>,
        statusList: string
    ): string {
        return AgentStoppedRunContinuationHelper.BuildPriorTurnRunFilter(
            conversationId,
            agentId,
            branchId,
            branches,
            statusList
        );
    }

    public static BuildPriorTurnToolResultsMessage(
        steps: CarryForwardStepRecord[],
        maxChars: number
    ): string | null {
        return AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage(steps, maxChars);
    }

    /** Static pass-through preserving `BaseAgent.messageFingerprint` reflection & spy contracts in tests. */
    private static messageFingerprint(m: ChatMessage): string {
        return AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(m);
    }

    // =========================================================================
    // Public & Protected Execution Entry Points
    // =========================================================================

    /** Executes an AI agent using hierarchical prompt composition and pluggable helper seams. */
    public async Execute<C = unknown, R = unknown>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        // Clear any prior run reference BEFORE helper plugin reset so a failure during
        // ResetForRun on a reused BaseAgent instance never returns a stale previous agentRun.
        this._agentRun = null;
        try {
            // Reset per-run helper bindings BEFORE resolving any helper seam so per-agent
            // helperPlugins apply on Run 1 and never leak across runs on a reused instance.
            const plugins = ResolveAgentHelperPluginsForRun(params.agent, params.helperPlugins);
            this.helperCache.ResetForRun(plugins.length > 0 ? plugins : undefined);
            return await ServerOperationScopeManager.Instance.RunAsServerWork(() => this.executeRun<C, R>(params));
        } catch (error) {
            if (error instanceof AgentHelperResolutionError) {
                return {
                    success: false,
                    errorMessage: error.message,
                    agentRun: this._agentRun as unknown as MJAIAgentRunEntityExtended,
                } as ExecuteAgentResult<R>;
            }
            throw error;
        }
    }

    /** Resumes a paused agent run non-destructively from its persisted checkpoint. */
    public async ResumePausedRun<C = RunawayJsonObject, R = RunawayJsonObject>(
        params: ExecuteAgentParams<C>
    ): Promise<ExecuteAgentResult<R>> {
        if (!params.resumeCheckpointRunId) {
            throw new Error('ResumePausedRun requires ExecuteAgentParams.resumeCheckpointRunId');
        }
        return this.Execute<C, R>(params);
    }

    /** Executes a single action through the MemberJunction Actions framework with full policy/circuit-breaker enforcement. */
    public override ExecuteSingleAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
        options?: ExecuteSingleActionOptions
    ): Promise<ActionResult> {
        return this.getActionsHelper().ExecuteSingleAction(
            this.getRunContext(),
            params,
            action,
            actionEntity,
            contextUser,
            options
        );
    }

    /** Opens a raw bridged {@link IRealtimeSession} for voice/video transports. */
    public StartBridgeRealtimeSession(params: ExecuteAgentParams): Promise<IRealtimeSession> {
        const plugins = ResolveAgentHelperPluginsForRun(params.agent, params.helperPlugins);
        this.helperCache.ResetForRun(plugins.length > 0 ? plugins : undefined);
        return this.getRealtimeHelper().StartBridgeRealtimeSession(this.getRunContext(), params);
    }

    /** Ends an active conversation-scoped skill (`MJ: Conversation Skills`). */
    public EndConversationSkill(conversationId: string, skillId: string, contextUser?: UserInfo): Promise<void> {
        return this.getSkillsHelper().EndConversationSkill(this.getRunContext(), conversationId, skillId, contextUser);
    }

    /** Flushes any in-memory safe-point checkpoint retained after an earlier save failure. */
    public override FlushPendingCheckpointPersistence(
        agentRunId?: string,
        provider?: IMetadataProvider | null
    ): Promise<PauseRunWithCheckpointResult | null> {
        return this.getLimitsHelper().FlushPendingCheckpointPersistence(this.getRunContext(), agentRunId, provider);
    }

    /** Awaits any in-flight timed-out FastConvergenceJudge evaluations and flushes late saves. */
    public WaitForPendingFastJudgeEvaluations(): Promise<boolean> {
        return this.getLimitsHelper().WaitForPendingFastJudgeEvaluations(this.getRunContext());
    }

    /** Flushes any pending durable late-settlement FastConvergenceJudge saves. */
    public FlushPendingLateFastJudgeSaves(): Promise<boolean> {
        return this.getLimitsHelper().FlushPendingLateFastJudgeSaves(this.getRunContext());
    }

    /** Returns configuration presets registered for the given agent. */
    public GetConfigurationPresets(agentId: string, activeOnly: boolean = true): MJAIAgentConfigurationEntity[] {
        return AIEngine.Instance.GetAgentConfigurationPresets(agentId, activeOnly);
    }

    /** Returns the default configuration preset for the given agent, if any. */
    public GetDefaultConfigurationPreset(agentId: string): MJAIAgentConfigurationEntity | undefined {
        return AIEngine.Instance.GetDefaultAgentConfigurationPreset(agentId);
    }

    /** Promotes media outputs from a step or sub-agent onto the current run's media outputs. */
    public override PromoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        this.getPayloadHelper().PromoteMediaOutputs(this.getRunContext(), mediaOutputs);
    }

    /** Lowercase alias for {@link PromoteMediaOutputs}. */
    public promoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        this.PromoteMediaOutputs(mediaOutputs);
    }

    // =========================================================================
    // Public & Protected State Accessors
    // =========================================================================

    /** Shared cumulative root-tree budget for this run and its descendant sub-agents. */
    public get TreeBudget(): AgentTreeBudget | undefined { return this._treeBudget; }
    /** True when the current run has ingested at least one Untrusted or SemiTrusted source. */
    public override get IsRunTainted(): boolean { return this._taintedSources.length > 0; }
    /** Read-only view of all Untrusted and SemiTrusted sources ingested during this run. */
    public get TaintedSources(): ReadonlyArray<AgentTaintedSource> { return this._taintedSources; }
    /** Active `MJ: AI Agent Runs` entity for the run in progress. */
    public get AgentRun(): MJAIAgentRunEntityExtended | null { return this._agentRun; }
    /** Resolved `BaseAgentType` instance for the executing agent. */
    public override get AgentTypeInstance(): BaseAgentType { return this._agentTypeInstance; }
    /** Accumulated promoted and intercepted media outputs for this run (defensive copy). */
    public get MediaOutputs(): MediaOutput[] { return [...this._mediaOutputs]; }
    /** Current FinalPayloadValidation retry counter. */
    public get ValidationRetryCount(): number { return this._validationRetryCount; }

    /** Active per-request metadata provider (preserving server-side provider isolation). */
    protected override get ProviderToUse(): IMetadataProvider {
        return this._activeProvider ?? Metadata.Provider; // global-provider-ok: fallback when ExecuteAgentParams.provider is omitted
    }
    /** Agent-type-specific execution state object. */
    protected override get AgentTypeState(): unknown { return this._agentTypeState; }
    /** Resolved FileStorageAccount ID for this run's file artifacts. */
    protected get ResolvedStorageAccountId(): string | null { return this._resolvedStorageAccountId; }
    /** Depth of this agent in the execution hierarchy (`0` = root). */
    protected get Depth(): number { return this._depth; }
    /** Agent name hierarchy from root to current agent. */
    protected get AgentHierarchy(): readonly string[] { return this._agentHierarchy; }
    /** Parent step counts used to format hierarchical step labels. */
    protected get ParentStepCounts(): readonly number[] { return this._parentStepCounts; }
    /** Accumulated file outputs produced during this run. */
    protected get FileOutputs(): FileOutputRef[] { return this._fileOutputs; }
    /** Protected accessor for the run's scratchpad manager. */
    protected get scratchpadManager(): ScratchpadManager { return this._scratchpadManager; }
    /** Protected accessor for the run's artifact workspace tool manager. */
    protected get ArtifactManager(): ArtifactToolManager { return this._artifactToolManager; }
    /** Protected accessor for the run's action-result spillover manager. */
    protected get ActionSpilloverManager(): ActionResultSpilloverManager { return this._actionSpilloverManager; }
    /** Active run's `AIPromptExecutionScope`, or `undefined` before execution begins. */
    protected get RunExecutionScope(): typeof this._runExecutionScope { return this._runExecutionScope; }
    /** Skills activated so far in this run, in activation order. */
    protected get ActivatedSkillIDs(): readonly string[] { return this._activatedSkillIDs; }

    /** Engine-default wall-clock timeout applied when `ExecuteAgentParams.maxExecutionTimeMs` is unset. */
    protected override get DefaultAgentTimeoutMS(): number {
        const resolved = LimitsConfigResolver.Resolve().Limits.Budgets.PerRun.MaxWallClockMs;
        if (typeof resolved === 'number' && resolved > 0) {
            return resolved;
        }
        return CODE_FALLBACK_LIMITS.Budgets.PerRun.MaxWallClockMs ?? Number.MAX_SAFE_INTEGER;
    }

    /** True when a subclass overrides `DefaultAgentTimeoutMS` above `BaseAgent.prototype`. */
    protected override get HasCustomDefaultAgentTimeout(): boolean {
        let proto: object | null = Object.getPrototypeOf(this);
        while (proto && proto !== BaseAgent.prototype) {
            if (Object.prototype.hasOwnProperty.call(proto, 'DefaultAgentTimeoutMS')) {
                return true;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }

    /**
     * Whether `AgentRunSetupHelper` should automatically suspend the sliding inactivity watchdog
     * while a subclass `executeAgentInternal` override runs. Defaults to `true` when overridden;
     * `BaseAgent`'s default `ExecuteAgentInternal` immediately resumes supervision when called
     * via `super.executeAgentInternal(...)`, so wrapper subclasses keep full 15-minute supervision.
     * Override to `false` to enforce strict inactivity timeouts even inside custom non-delegating loops.
     */
    protected get autoSuspendLivenessDuringExecuteInternal(): boolean {
        let proto: object | null = Object.getPrototypeOf(this);
        while (proto && proto !== BaseAgent.prototype) {
            if (Object.prototype.hasOwnProperty.call(proto, 'executeAgentInternal')) {
                return true;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return false;
    }

    /** True when a subclass overrides `executeAgentInternal` and opts into auto-suspend. */
    protected override get HasCustomExecuteAgentInternal(): boolean {
        return this.autoSuspendLivenessDuringExecuteInternal;
    }

    /**
     * Records forward progress on the active run's sliding liveness watchdog so custom
     * `BaseAgent` subclasses (`executePrompt` / `executeAgentInternal` overrides) can reset the
     * inactivity timer during long operations. Safe no-op outside `Execute()`.
     */
    protected recordLivenessProgress(kind: LivenessProgressKind = 'action-progress', detail?: string): void {
        this._livenessWatchdog?.RecordProgress({ Kind: kind, Detail: detail });
    }

    /**
     * Suspends the sliding inactivity timer on the active run's liveness watchdog while awaiting an
     * externally-bounded operation (outer wall-clock safety ceiling remains active). Always pair
     * with {@link resumeLivenessWatchdog} in a `finally` block.
     */
    protected suspendLivenessWatchdog(waitId: string, reason?: string): void {
        this._livenessWatchdog?.SuspendForExternalWait(waitId, reason);
    }

    /** Resumes the sliding inactivity timer after a wait started by {@link suspendLivenessWatchdog}. */
    protected resumeLivenessWatchdog(waitId: string): void {
        this._livenessWatchdog?.ResumeFromExternalWait(waitId);
    }

    // =========================================================================
    // Permanent Protected Extension Hooks
    // =========================================================================

    /** Application-layer policy filter on skills admitted by MJ gates. */
    protected override filterAvailableSkills(
        skills: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        return this.getSkillsHelper().FilterAvailableSkills(this.getRunContext(), skills, purpose, agent, contextUser);
    }

    /** Enforces cost, token, iteration, time, and self-check guardrails. */
    protected override checkExecutionGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getLimitsHelper().CheckExecutionGuardrails(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
    }

    /** Checks whether run or tree-level execution guardrails have been exceeded. */
    protected override hasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<GuardrailVerdict> {
        return this.getLimitsHelper().HasExceededAgentRunGuardrails(this.getRunContext(), params, agentRun);
    }

    /** Bumps the per-item execution counter checked against min/max guardrails. */
    protected override incrementExecutionCount(itemId: string): void {
        this.getLimitsHelper().IncrementExecutionCount(this.getRunContext(), itemId);
    }

    /** Maps an array through an async worker with bounded concurrency. */
    protected override mapWithConcurrency<T, R>(
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        return this.getIterationHelper().MapWithConcurrency(this.getRunContext(), items, limit, worker);
    }

    /** Converts `ChatMessageContent` into a media-stubbed string. */
    protected override contentToString(content: ChatMessageContent): string {
        return this.getCompactionHelper().ContentToString(this.getRunContext(), content);
    }

    /** Prunes and compacts expired messages in the conversation window. */
    protected override pruneAndCompactExpiredMessages(params: ExecuteAgentParams, currentTurn: number): Promise<void> {
        return this.getCompactionHelper().PruneAndCompactExpiredMessages(this.getRunContext(), params, currentTurn);
    }

    // =========================================================================
    // Static-Bridge Hooks for BaseAgentContextBase
    // =========================================================================

    protected override getCatalogNarrowingTimeoutMs(): number { return BaseAgent.CATALOG_NARROWING_TIMEOUT_MS; }
    protected override getDecisionConcurrency(): number { return BaseAgent.DECISION_CONCURRENCY; }
    protected override getMaxConsecutiveFailedSteps(): number { return BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS; }
    protected override getMaxConsecutiveUnproductiveRetries(): number { return BaseAgent.MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES; }
    protected override getAgentTimeoutAbortReason(): string { return BaseAgent.AgentTimeoutAbortReason; }
    protected override getAgentInactivityAbortReason(): string { return BaseAgent.AgentInactivityAbortReason; }
    protected override invokeMessageFingerprint(m: ChatMessage): string { return BaseAgent.messageFingerprint(m); }

    // =========================================================================
    // Pluggable Helper Seam Resolvers (13 Seams via ClassFactory)
    // =========================================================================

    protected override getMessagingHelper(): BaseAgentMessagingHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'messaging', BaseClass: BaseAgentMessagingHelper, DefaultClass: AgentMessagingHelper });
    }

    protected override getPayloadHelper(): BaseAgentPayloadHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'payload', BaseClass: BaseAgentPayloadHelper, DefaultClass: AgentPayloadHelper });
    }

    protected override getCompactionHelper(): BaseAgentCompactionHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'compaction', BaseClass: BaseAgentCompactionHelper, DefaultClass: AgentCompactionHelper });
    }

    protected override getRealtimeHelper(): BaseAgentRealtimeHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'realtime', BaseClass: BaseAgentRealtimeHelper, DefaultClass: AgentRealtimeHelper });
    }

    protected override getIterationHelper(): BaseAgentIterationHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'iteration', BaseClass: BaseAgentIterationHelper, DefaultClass: AgentIterationHelper });
    }

    protected override getSkillsHelper(): BaseAgentSkillsHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'skills', BaseClass: BaseAgentSkillsHelper, DefaultClass: AgentSkillsHelper });
    }

    protected override getLimitsHelper(): BaseAgentLimitsHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'limits', BaseClass: BaseAgentLimitsHelper, DefaultClass: AgentLimitsHelper });
    }

    protected override getActionPolicyHelper(): BaseAgentActionPolicyHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'actionPolicy', BaseClass: BaseAgentActionPolicyHelper, DefaultClass: AgentActionPolicyHelper });
    }

    protected override getActionsHelper(): BaseAgentActionsHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'actions', BaseClass: BaseAgentActionsHelper, DefaultClass: AgentActionsHelper });
    }

    protected override getPromptHelper(): BaseAgentPromptHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'prompt', BaseClass: BaseAgentPromptHelper, DefaultClass: AgentPromptHelper });
    }

    protected override getSubAgentHelper(): BaseAgentSubAgentHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'subAgents', BaseClass: BaseAgentSubAgentHelper, DefaultClass: AgentSubAgentHelper });
    }

    protected override getStepExecutionHelper(): BaseAgentStepExecutionHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'steps', BaseClass: BaseAgentStepExecutionHelper, DefaultClass: AgentStepExecutionHelper });
    }

    protected override getRunSetupHelper(): BaseAgentRunSetupHelper {
        return this.helperCache.GetOrResolve({ SeamKey: 'setup', BaseClass: BaseAgentRunSetupHelper, DefaultClass: AgentRunSetupHelper });
    }
}
