/**
 * @fileoverview Centralized, strongly-typed `limits` configuration contract and 5-tier
 * hierarchical resolver (`LimitsConfigResolver`).
 *
 * Pure and browser-safe (no Node-specific `fs` / `cosmiconfig` imports): hosts load `mj.config.cjs`
 * outside `@memberjunction/core` and pass its `limits` object into {@link LimitsConfigResolver.Resolve}
 * or register it once at startup via {@link LimitsConfigResolver.RegisterMjConfigLimits}.
 *
 * Precedence order (lowest -> highest):
 * 1. `CodeFallback`
 * 2. `MjConfig` (`mj.config.cjs` `limits` section)
 * 3. `AgentOrWorkflowMetadata` (Agent or workflow metadata overrides)
 * 4. `UserAgentPolicy` (User's agent policy overrides)
 * 5. `RunOverride` (Individual run overrides)
 *
 * @module @memberjunction/core
 */

import { BaseSingleton, IsPlainObject } from '@memberjunction/global';
import { AuthorizationEvaluator } from './authEvaluator';
import type { IMetadataProvider } from './interfaces';
import type { UserInfo } from './securityInfo';

/**
 * Precedence tier identifiers for limits resolution, ordered from lowest (`CodeFallback`)
 * to highest (`RunOverride`).
 */
export type LimitsSourceTier =
    | 'CodeFallback'
    | 'MjConfig'
    | 'AgentOrWorkflowMetadata'
    | 'UserAgentPolicy'
    | 'RunOverride';

/**
 * Canonical 5-tier precedence chain from lowest to highest priority.
 */
export const LIMITS_TIER_PRECEDENCE: readonly LimitsSourceTier[] = [
    'CodeFallback',
    'MjConfig',
    'AgentOrWorkflowMetadata',
    'UserAgentPolicy',
    'RunOverride',
] as const;

/**
 * Fallback action when the sub-200ms fast convergence judge times out, errors, or returns invalid output.
 */
export type FastJudgeFailureFallbackMode = 'ContinueWithWarning' | 'PauseForHuman';

/**
 * Supported execution isolation levels for task graphs and persisted workflows (`AIAgent.Isolation`).
 * Alphabetically ordered union matches CodeGen entity value-list generation.
 */
export type TaskGraphIsolationLevel = 'Container' | 'InProcess' | 'Process' | 'Worker';

/**
 * Ordered list of valid {@link TaskGraphIsolationLevel} values.
 */
export const TASK_GRAPH_ISOLATION_LEVELS: readonly TaskGraphIsolationLevel[] = [
    'InProcess',
    'Worker',
    'Process',
    'Container',
] as const;

/**
 * Runtime type guard verifying whether an untyped value is a valid {@link TaskGraphIsolationLevel}.
 */
export function IsTaskGraphIsolationLevel(value: unknown): value is TaskGraphIsolationLevel {
    return value === 'InProcess' || value === 'Worker' || value === 'Process' || value === 'Container';
}

/**
 * Execution isolation defaults and resource-containment guard settings for task graphs and workflows.
 */
export interface MJLimitsIsolationConfig {
    /** Default isolation mode for task graphs and workflows without an explicit isolation level (`'Worker'`). */
    DefaultIsolation: TaskGraphIsolationLevel;
    /** Default isolation mode applied to newly drafted workflows authored via `Workflow.Draft` (`'Worker'`). */
    DraftDefaultIsolation: TaskGraphIsolationLevel;
    /** V8 max old-generation heap ceiling (MB) passed to `worker_threads` `resourceLimits` in `'Worker'` mode. */
    WorkerMaxOldGenerationSizeMb: number;
    /** V8 max young-generation heap ceiling (MB) passed to `worker_threads` `resourceLimits` in `'Worker'` mode. */
    WorkerMaxYoungGenerationSizeMb: number;
    /** Maximum wall-clock execution timeout (ms) for `'Worker'` mode step execution. */
    WorkerTimeoutMs: number;
    /** OS memory ceiling (MB) enforced for `'Process'` mode (`child_process`) execution. */
    ProcessMaxMemoryMb: number;
    /** Maximum wall-clock execution timeout (ms) for `'Process'` mode (`child_process`) execution. */
    ProcessTimeoutMs: number;
    /** Container memory limit (MB) passed to container runtime (`--memory`) in `'Container'` mode. */
    ContainerMemoryMb: number;
    /** Container CPU quota (logical vCPUs) passed to container runtime (`--cpus`) in `'Container'` mode. */
    ContainerCpuQuota: number;
    /** Maximum wall-clock execution timeout (ms) for `'Container'` mode execution. */
    ContainerTimeoutMs: number;
    /** Default OCI image reference used by the `'Container'` isolation runner. */
    ContainerImage: string;
    /** Container runtime binary (`'docker'` | `'podman'`) used by the `'Container'` isolation runner. */
    ContainerRuntime: string;
}

/**
 * Queue dispatch, bounded `Enqueue` fan-out concurrency, isolated runner backpressure,
 * redelivery retry caps, and caller notification retention limits for queued TaskGraphs.
 */
export interface MJLimitsTaskGraphQueueConfig {
    /** Default WorkQueue topic used when `TaskGraph.Submit` runs with `Dispatch: 'Queue'`. */
    GraphDispatchTopicName: string;
    /** Default WorkQueue topic used by `Enqueue` steps when no explicit topic is supplied. */
    DefaultEnqueueTopicName: string;
    /** Bounded concurrent WorkQueue publish operations permitted during `ForEach` + `Enqueue` fan-out. */
    MaxEnqueuePublishConcurrency: number;
    /** Batch size for WorkQueue publishes inside `ForEach` + `Enqueue` fan-out. */
    EnqueuePublishBatchSize: number;
    /** Bounded concurrent active isolated runners executing queued graph/step work items per host. */
    MaxConcurrentIsolatedRunners: number;
    /** Hard safety ceiling on items emitted by a single `ForEach` + `Enqueue` fan-out. */
    MaxEnqueueItemsPerFanOut: number;
    /** Maximum delivery/retry attempts before a queued step/item transitions to terminal failure. */
    MaxEnqueueRedeliveryAttempts: number;
    /** Maximum publish retry attempts when WorkQueue transport publish fails transiently. */
    EnqueuePublishRetryAttempts: number;
    /** Retention window (ms) for recovering unacknowledged terminal caller notifications across restarts. */
    CallerNotificationRetentionMs: number;
}

/**
 * Dollar USD and wall-clock time budget ceilings for a single scope.
 */
export interface MJLimitsScopeBudget {
    /** Maximum dollar cost in USD for this scope; `null` means no dollar ceiling at this scope. */
    MaxCostUsd: number | null;
    /** Maximum wall-clock duration in milliseconds for this scope; `null` means no time ceiling at this scope. */
    MaxWallClockMs: number | null;
}

/**
 * Budget ceilings for an individual agent or workflow run.
 */
export interface MJLimitsRunScopeBudget extends MJLimitsScopeBudget {
    /** Maximum total tokens (prompt + completion) for a single run; `null` means no token ceiling. */
    MaxTokens: number | null;
}

/**
 * Daily per-user cumulative budget ceilings across all runs.
 */
export interface MJLimitsUserDailyScopeBudget extends MJLimitsScopeBudget {
    /** IANA timezone or `'UTC'` governing the daily reset boundary. */
    DayBoundaryTimezone: string;
}

/**
 * Multi-scope dollar and wall-clock budget configuration and accounting rules.
 */
export interface MJLimitsBudgetsConfig {
    /** Budget ceilings applied to an individual run. */
    PerRun: MJLimitsRunScopeBudget;
    /** Cumulative budget ceilings applied across runs of a routine or scheduled workflow. */
    PerRoutine: MJLimitsScopeBudget;
    /** Cumulative daily budget ceilings applied per user across all runs. */
    PerUserPerDay: MJLimitsUserDailyScopeBudget;
    /** Whether time spent paused awaiting human approval counts toward wall-clock budgets. */
    CountPausedTimeTowardsWallClock: boolean;
    /** Bounded USD tolerance allowed for in-flight billable calls already started before pause. */
    AllowedInFlightOvershootUsd: number;
    /** Bounded wall-clock ms tolerance allowed for in-flight operations before pause. */
    AllowedInFlightOvershootMs: number;
}

/**
 * Deterministic sliding-window progress detector and fast convergence judge thresholds.
 */
export interface MJLimitsProgressDetectorConfig {
    /** Master switch for deterministic sliding-window progress detection. */
    Enabled: boolean;
    /** Number of recent iterations evaluated per sliding progress window. */
    WindowSize: number;
    /** Minimum iterations before progress stall checks trigger. */
    MinIterationsBeforeCheck: number;
    /** Fraction (`0..1`) of repeated identical steps in a window signaling low progress. */
    DuplicateStepRatioThreshold: number;
    /** Consecutive iterations with zero meaningful payload delta before signaling stall. */
    NoPayloadDeltaWindowCount: number;
    /** Consecutive repeating identical error signatures before signaling stall. */
    RepeatingErrorWindowCount: number;
    /** Deterministic progress score (`0..1`) strictly below which a run is treated as stalled. */
    AmbiguityLowScoreThreshold: number;
    /** Deterministic progress score (`0..1`) at or above which a run is clearly making progress. */
    AmbiguityHighScoreThreshold: number;
    /** Whether the sub-200ms fast convergence judge runs when deterministic signals are ambiguous. */
    FastJudgeEnabled: boolean;
    /** Deadline in milliseconds for the fast convergence judge invocation (default `200`). */
    FastJudgeTimeoutMs: number;
    /** Minimum iterations between consecutive fast judge invocations to bound judge cost. */
    FastJudgeMinIntervalIterations: number;
    /** Maximum input characters serialized to the fast judge per invocation. */
    FastJudgeMaxInputChars: number;
    /** Fallback policy when the fast judge times out, errors, or returns invalid output. */
    FastJudgeFailureFallback: FastJudgeFailureFallbackMode;
}

/**
 * Sliding forward-progress liveness watchdog and long-running HTTP transport timeout settings.
 */
export interface MJLimitsLivenessConfig {
    /** Master switch enabling sliding forward-progress liveness monitoring (default `true`). */
    Enabled: boolean;
    /** Sliding inactivity window (ms) without progress before declaring a hung run (default `900_000` = 15m). */
    InactivityTimeoutMs: number;
    /** Absolute outer wall-clock safety ceiling (ms) when no tighter explicit run/policy/workflow cap is set (default `259_200_000` = 72h). */
    OuterMaxWallClockMs: number;
    /** Minimum interval (ms) between streaming-chunk timer resets to avoid hot-loop churn (default `5_000` = 5s). */
    StreamChunkTouchThrottleMs: number;
    /** HTTP headers timeout (ms) for long-running Node `undici` LLM calls (`0` = disabled, rely on `AbortSignal`; default `1_800_000` = 30m). */
    HttpHeadersTimeoutMs: number;
    /** HTTP body timeout (ms) for long-running Node `undici` LLM calls (`0` = disabled, rely on `AbortSignal`; default `0`). */
    HttpBodyTimeoutMs: number;
}

/**
 * Semantic stuck-run detection thresholds (canonical repeated tool-call breaker and read-only spiral wrap-up).
 */
export interface MJLimitsStuckDetectorConfig {
    /** Master switch enabling semantic stuck-run detection (default `true`). */
    Enabled: boolean;
    /** Number of recent tool/action invocations retained in the sliding repetition window (default `10`). */
    WindowSize: number;
    /** Identical canonical tool-call count within {@link WindowSize} triggering correction/escalation (default `3`). */
    IdenticalToolCallThreshold: number;
    /** Consecutive read-only steps without mutation or terminal action before injecting a wrap-up directive (default `30`). */
    ReadOnlyStepThreshold: number;
    /** Additional consecutive read-only steps permitted after a wrap-up directive before non-destructive pause (default `5`). */
    ReadOnlyPostDirectiveGraceSteps: number;
}

/**
 * Bounded resource, retry, depth, and concurrency guard ceilings resolved at current defaults.
 */
export interface MJLimitsResourceGuardsConfig {
    /** Maximum validation retries before forcing failure. */
    MaxValidationRetries: number;
    /** Maximum consecutive failed (non-terminating) steps before forcing termination. */
    MaxConsecutiveFailedSteps: number;
    /** Maximum consecutive unproductive retry steps before forcing termination. */
    MaxConsecutiveUnproductiveRetries: number;
    /** Maximum identical failing step repetitions before forcing termination. */
    MaxRepeatedFailingStep: number;
    /** Maximum consecutive inline read-tool preemptions before honoring terminal step. */
    MaxConsecutiveReadToolPreemptions: number;
    /** Maximum retries for final payload schema validation failures. */
    FinalPayloadValidationMaxRetries: number;
    /** Maximum ancestor chain hops when validating a run's `lastRunId` lineage. */
    MaxRunChainLength: number;
    /** Maximum recursive tree depth loaded for an AI Agent Run tree. */
    MaxAgentRunTreeDepth: number;
    /** Maximum agent-to-agent handoffs permitted within a single user turn. */
    MaxHandoffHops: number;
    /** Default maximum consultation rounds per parent/sub-agent pair. */
    MaxSubAgentConsultRounds: number;
    /** Maximum decision requests answered per agent turn. */
    MaxDecisionRequestsPerTurn: number;
    /** Maximum total decision calls executed per agent turn. */
    MaxDecisionCallsPerTurn: number;
    /** Maximum conversation tool calls executed per LLM turn. */
    MaxConversationToolCallsPerTurn: number;
    /** Maximum consecutive settlement retry passes on a task graph. */
    MaxSettlementRetryPasses: number;
    /** Maximum continuation re-invocation depth across task graphs. */
    MaxReinvokeDepth: number;
    /** Maximum inline provider signal raise attempts per waiting step. */
    MaxProviderRaiseAttempts: number;
    /** Default timeout in milliseconds for client tool executions. */
    ClientToolTimeoutMs: number;
    /** Default deadline in milliseconds for pipeline executions. */
    PipelineDeadlineMs: number;
    /** Maximum stages permitted in a single pipeline execution. */
    MaxPipelineStages: number;
    /** Maximum collection elements expanded by pipeline map stages. */
    MaxMapElements: number;
    /** Default maximum concurrency for parallel ForEach loops. */
    MaxLoopConcurrency: number;
    /** Default maximum consecutive agent turns in realtime voice rooms. */
    MaxRealtimeConsecutiveAgentTurns: number;
}

/**
 * Operational tuning knobs for caching, compaction, candidate narrowing, and batching.
 */
export interface MJLimitsTuningConfig {
    /** Maximum cached preloaded entries per agent. */
    MaxPerAgentCacheEntries: number;
    /** Maximum concurrent client tool sessions tracked in memory. */
    MaxClientToolSessions: number;
    /** Maximum tools retained per client tool session. */
    MaxToolsPerSession: number;
    /** Fallback model context token limit for conversation compaction. */
    CompactionDefaultContextTokens: number;
    /** Default context utilization percentage triggering compaction. */
    CompactionDefaultTriggerPercent: number;
    /** Default target context utilization percentage after compaction. */
    CompactionDefaultTargetPercent: number;
    /** Minimum projected token gain required before running compaction. */
    CompactionMinGainTokens: number;
    /** Minimum message count required before attempting compaction. */
    CompactionMinMessages: number;
    /** Maximum character budget for delta messages during compaction. */
    CompactionMaxDeltaMessageChars: number;
    /** Default maximum skill decision candidates injected into prompt context. */
    MaxSkillDecisionCandidates: number;
    /** Maximum handoff candidates serialized into prompt context. */
    MaxHandoffCandidates: number;
    /** Default maximum entries in QueryCache. */
    QueryCacheDefaultMaxSize: number;
    /** Default cache TTL in minutes for QueryCache. */
    QueryCacheDefaultTtlMinutes: number;
    /** Default maximum tasks retained in an agent scratchpad. */
    ScratchpadMaxTasks: number;
    /** Default maximum items processed per decision request. */
    DecisionsMaxItems: number;
    /** Maximum initial operations accepted in a single artifact batch request. */
    MaxInitialArtifactOperations: number;
    /** Maximum IDs placed in a direct SQL `IN (...)` clause for artifact queries. */
    MaxDirectInIds: number;
    /** Maximum assignable agents offered in workflow draft prompts. */
    MaxAgentsOfferedInDraft: number;
    /** Maximum waiting steps scanned per signal dispatch. */
    MaxStepsPerSignal: number;
}

/**
 * Complete resolved configuration surface for MemberJunction execution limits, backstops,
 * budgets, briefing bounds, progress detection, resource guards, and tuning knobs.
 */
export interface MJLimitsConfig {
    /** Maximum consecutive agent turns in an Agent Channel before pausing for a human. */
    AgentChannelConsecutiveTurns: number;
    /** Maximum peer-agent wakes per hour in an Agent Channel. */
    AgentChannelWakesPerHour: number;
    /** System-wide absolute safety net on prompt iterations per agent run. */
    AgentAbsoluteIterations: number;
    /** Maximum nodes in a model-authored task graph (`MAX_TASKS_PER_AGENT_GRAPH`). */
    MaxTasksPerAgentGraph: number;
    /** Default maximum iterations for While loop operations. */
    WhileLoopMaxIterations: number;
    /** Default maximum iterations for ForEach loop operations. */
    ForEachMaxIterations: number;
    /** Blast-radius ceiling on nodes in any submitted task graph (`MAX_TASKS_PER_GRAPH`). */
    MaxTasksPerGraph: number;
    /** Timeout in milliseconds for each briefing skill contributor action. */
    BriefingContributorTimeoutMs: number;
    /** Maximum serialized character length retained per briefing skill contributor. */
    BriefingMaxContributorChars: number;
    /** Multi-scope dollar and wall-clock budget limits and accounting rules. */
    Budgets: MJLimitsBudgetsConfig;
    /** Deterministic sliding-window progress detector and fast convergence judge thresholds. */
    ProgressDetector: MJLimitsProgressDetectorConfig;
    /** Bounded resource, retry, depth, and concurrency guard ceilings. */
    ResourceGuards: MJLimitsResourceGuardsConfig;
    /** Operational tuning defaults for caching, compaction, candidate caps, and batching. */
    Tuning: MJLimitsTuningConfig;
    /** Task graph and workflow execution isolation defaults and runtime resource ceilings. */
    Isolation: MJLimitsIsolationConfig;
    /** Task graph queue dispatch, bounded fan-out, runner backpressure, and notification retention limits. */
    TaskGraphQueue: MJLimitsTaskGraphQueueConfig;
    /** Sliding forward-progress liveness watchdog and long-running HTTP transport timeout settings. */
    Liveness: MJLimitsLivenessConfig;
    /** Semantic stuck-run detection thresholds (canonical repeated tool-call breaker and read-only spiral). */
    StuckDetector: MJLimitsStuckDetectorConfig;
}

/** Partial override for {@link MJLimitsScopeBudget}. */
export interface MJLimitsScopeBudgetOverride {
    MaxCostUsd?: number | null;
    MaxWallClockMs?: number | null;
}

/** Partial override for {@link MJLimitsRunScopeBudget}. */
export interface MJLimitsRunScopeBudgetOverride extends MJLimitsScopeBudgetOverride {
    MaxTokens?: number | null;
}

/** Partial override for {@link MJLimitsUserDailyScopeBudget}. */
export interface MJLimitsUserDailyScopeBudgetOverride extends MJLimitsScopeBudgetOverride {
    DayBoundaryTimezone?: string;
}

/** Partial override for {@link MJLimitsBudgetsConfig}. */
export interface MJLimitsBudgetsOverride {
    PerRun?: MJLimitsRunScopeBudgetOverride;
    PerRoutine?: MJLimitsScopeBudgetOverride;
    PerUserPerDay?: MJLimitsUserDailyScopeBudgetOverride;
    CountPausedTimeTowardsWallClock?: boolean;
    AllowedInFlightOvershootUsd?: number;
    AllowedInFlightOvershootMs?: number;
}

/** Partial override for {@link MJLimitsProgressDetectorConfig}. */
export interface MJLimitsProgressDetectorOverride {
    Enabled?: boolean;
    WindowSize?: number;
    MinIterationsBeforeCheck?: number;
    DuplicateStepRatioThreshold?: number;
    NoPayloadDeltaWindowCount?: number;
    RepeatingErrorWindowCount?: number;
    AmbiguityLowScoreThreshold?: number;
    AmbiguityHighScoreThreshold?: number;
    FastJudgeEnabled?: boolean;
    FastJudgeTimeoutMs?: number;
    FastJudgeMinIntervalIterations?: number;
    FastJudgeMaxInputChars?: number;
    FastJudgeFailureFallback?: FastJudgeFailureFallbackMode;
}

/** Partial override for {@link MJLimitsResourceGuardsConfig}. */
export type MJLimitsResourceGuardsOverride = Partial<MJLimitsResourceGuardsConfig>;

/** Partial override for {@link MJLimitsTuningConfig}. */
export type MJLimitsTuningOverride = Partial<MJLimitsTuningConfig>;

/** Partial override for {@link MJLimitsIsolationConfig}. */
export type MJLimitsIsolationOverride = Partial<MJLimitsIsolationConfig>;

/** Partial override for {@link MJLimitsTaskGraphQueueConfig}. */
export type MJLimitsTaskGraphQueueOverride = Partial<MJLimitsTaskGraphQueueConfig>;

/** Partial override for {@link MJLimitsLivenessConfig}. */
export type MJLimitsLivenessOverride = Partial<MJLimitsLivenessConfig>;

/** Partial override for {@link MJLimitsStuckDetectorConfig}. */
export type MJLimitsStuckDetectorOverride = Partial<MJLimitsStuckDetectorConfig>;

/**
 * Partial override object accepted by any tier of {@link LimitsConfigResolver}.
 */
export interface MJLimitsOverride {
    AgentChannelConsecutiveTurns?: number;
    AgentChannelWakesPerHour?: number;
    AgentAbsoluteIterations?: number;
    MaxTasksPerAgentGraph?: number;
    WhileLoopMaxIterations?: number;
    ForEachMaxIterations?: number;
    MaxTasksPerGraph?: number;
    BriefingContributorTimeoutMs?: number;
    BriefingMaxContributorChars?: number;
    Budgets?: MJLimitsBudgetsOverride;
    ProgressDetector?: MJLimitsProgressDetectorOverride;
    ResourceGuards?: MJLimitsResourceGuardsOverride;
    Tuning?: MJLimitsTuningOverride;
    Isolation?: MJLimitsIsolationOverride;
    TaskGraphQueue?: MJLimitsTaskGraphQueueOverride;
    Liveness?: MJLimitsLivenessOverride;
    StuckDetector?: MJLimitsStuckDetectorOverride;
}

/**
 * Canonical approved code fallback defaults for all MemberJunction limits and backstops.
 */
export const CODE_FALLBACK_LIMITS: Readonly<MJLimitsConfig> = {
    AgentChannelConsecutiveTurns: 1000,
    AgentChannelWakesPerHour: 600,
    AgentAbsoluteIterations: 100_000,
    MaxTasksPerAgentGraph: 10_000,
    WhileLoopMaxIterations: 1_000_000,
    ForEachMaxIterations: 1_000_000,
    MaxTasksPerGraph: 100_000,
    BriefingContributorTimeoutMs: 10_000,
    BriefingMaxContributorChars: 32_768,
    Budgets: {
        PerRun: {
            MaxCostUsd: null,
            MaxWallClockMs: 7_200_000,
            MaxTokens: null,
        },
        PerRoutine: {
            MaxCostUsd: null,
            MaxWallClockMs: null,
        },
        PerUserPerDay: {
            MaxCostUsd: null,
            MaxWallClockMs: null,
            DayBoundaryTimezone: 'UTC',
        },
        CountPausedTimeTowardsWallClock: false,
        AllowedInFlightOvershootUsd: 0,
        AllowedInFlightOvershootMs: 0,
    },
    ProgressDetector: {
        Enabled: true,
        WindowSize: 10,
        MinIterationsBeforeCheck: 6,
        DuplicateStepRatioThreshold: 0.75,
        NoPayloadDeltaWindowCount: 5,
        RepeatingErrorWindowCount: 4,
        AmbiguityLowScoreThreshold: 0.25,
        AmbiguityHighScoreThreshold: 0.65,
        FastJudgeEnabled: true,
        FastJudgeTimeoutMs: 200,
        FastJudgeMinIntervalIterations: 5,
        FastJudgeMaxInputChars: 8192,
        FastJudgeFailureFallback: 'ContinueWithWarning',
    },
    ResourceGuards: {
        MaxValidationRetries: 10,
        MaxConsecutiveFailedSteps: 10,
        MaxConsecutiveUnproductiveRetries: 10,
        MaxRepeatedFailingStep: 3,
        MaxConsecutiveReadToolPreemptions: 3,
        FinalPayloadValidationMaxRetries: 3,
        MaxRunChainLength: 1000,
        MaxAgentRunTreeDepth: 100,
        MaxHandoffHops: 3,
        MaxSubAgentConsultRounds: 3,
        MaxDecisionRequestsPerTurn: 8,
        MaxDecisionCallsPerTurn: 100,
        MaxConversationToolCallsPerTurn: 8,
        MaxSettlementRetryPasses: 20,
        MaxReinvokeDepth: 5,
        MaxProviderRaiseAttempts: 3,
        ClientToolTimeoutMs: 30_000,
        PipelineDeadlineMs: 120_000,
        MaxPipelineStages: 20,
        MaxMapElements: 1000,
        MaxLoopConcurrency: 10,
        MaxRealtimeConsecutiveAgentTurns: 8,
    },
    Tuning: {
        MaxPerAgentCacheEntries: 200,
        MaxClientToolSessions: 1000,
        MaxToolsPerSession: 200,
        CompactionDefaultContextTokens: 8000,
        CompactionDefaultTriggerPercent: 75,
        CompactionDefaultTargetPercent: 30,
        CompactionMinGainTokens: 500,
        CompactionMinMessages: 4,
        CompactionMaxDeltaMessageChars: 10_000,
        MaxSkillDecisionCandidates: 30,
        MaxHandoffCandidates: 20,
        QueryCacheDefaultMaxSize: 1000,
        QueryCacheDefaultTtlMinutes: 60,
        ScratchpadMaxTasks: 50,
        DecisionsMaxItems: 100,
        MaxInitialArtifactOperations: 100,
        MaxDirectInIds: 2500,
        MaxAgentsOfferedInDraft: 40,
        MaxStepsPerSignal: 1000,
    },
    Isolation: {
        DefaultIsolation: 'Worker',
        DraftDefaultIsolation: 'Worker',
        WorkerMaxOldGenerationSizeMb: 256,
        WorkerMaxYoungGenerationSizeMb: 64,
        WorkerTimeoutMs: 120_000,
        ProcessMaxMemoryMb: 512,
        ProcessTimeoutMs: 300_000,
        ContainerMemoryMb: 512,
        ContainerCpuQuota: 1,
        ContainerTimeoutMs: 300_000,
        ContainerImage: 'node:20-alpine',
        ContainerRuntime: 'docker',
    },
    TaskGraphQueue: {
        GraphDispatchTopicName: 'mj.taskgraph.runs',
        DefaultEnqueueTopicName: 'mj.taskgraph.steps',
        MaxEnqueuePublishConcurrency: 25,
        EnqueuePublishBatchSize: 100,
        MaxConcurrentIsolatedRunners: 16,
        MaxEnqueueItemsPerFanOut: 100_000,
        MaxEnqueueRedeliveryAttempts: 5,
        EnqueuePublishRetryAttempts: 3,
        CallerNotificationRetentionMs: 86_400_000,
    },
    Liveness: {
        Enabled: true,
        InactivityTimeoutMs: 900_000,
        OuterMaxWallClockMs: 259_200_000,
        StreamChunkTouchThrottleMs: 5_000,
        HttpHeadersTimeoutMs: 1_800_000,
        HttpBodyTimeoutMs: 1_800_000,
    },
    StuckDetector: {
        Enabled: true,
        WindowSize: 10,
        IdenticalToolCallThreshold: 3,
        ReadOnlyStepThreshold: 30,
        ReadOnlyPostDirectiveGraceSteps: 5,
    },
};

/**
 * Alias for {@link CODE_FALLBACK_LIMITS} representing the default MemberJunction limits
 * configuration used when `mj.config.cjs` omits a `limits` block.
 */
export const DEFAULT_MJ_LIMITS_CONFIG: Readonly<MJLimitsConfig> = CODE_FALLBACK_LIMITS;

type ResourceGuardKey = keyof MJLimitsResourceGuardsConfig;
type TuningKey = keyof MJLimitsTuningConfig;
type IsolationKey = keyof MJLimitsIsolationConfig;
type TaskGraphQueueKey = keyof MJLimitsTaskGraphQueueConfig;
type LivenessKey = keyof MJLimitsLivenessConfig;
type StuckDetectorKey = keyof MJLimitsStuckDetectorConfig;

export type ResourceGuardKeyPath = `ResourceGuards.${ResourceGuardKey}`;
export type TuningKeyPath = `Tuning.${TuningKey}`;
export type IsolationKeyPath = `Isolation.${IsolationKey}`;
export type TaskGraphQueueKeyPath = `TaskGraphQueue.${TaskGraphQueueKey}`;
export type LivenessKeyPath = `Liveness.${LivenessKey}`;
export type StuckDetectorKeyPath = `StuckDetector.${StuckDetectorKey}`;

/**
 * Union of all canonical dot-separated limit key paths tracked for provenance.
 */
export type LimitsKeyPath =
    | 'AgentChannelConsecutiveTurns'
    | 'AgentChannelWakesPerHour'
    | 'AgentAbsoluteIterations'
    | 'MaxTasksPerAgentGraph'
    | 'WhileLoopMaxIterations'
    | 'ForEachMaxIterations'
    | 'MaxTasksPerGraph'
    | 'BriefingContributorTimeoutMs'
    | 'BriefingMaxContributorChars'
    | 'Budgets.PerRun.MaxCostUsd'
    | 'Budgets.PerRun.MaxWallClockMs'
    | 'Budgets.PerRun.MaxTokens'
    | 'Budgets.PerRoutine.MaxCostUsd'
    | 'Budgets.PerRoutine.MaxWallClockMs'
    | 'Budgets.PerUserPerDay.MaxCostUsd'
    | 'Budgets.PerUserPerDay.MaxWallClockMs'
    | 'Budgets.PerUserPerDay.DayBoundaryTimezone'
    | 'Budgets.CountPausedTimeTowardsWallClock'
    | 'Budgets.AllowedInFlightOvershootUsd'
    | 'Budgets.AllowedInFlightOvershootMs'
    | 'ProgressDetector.Enabled'
    | 'ProgressDetector.WindowSize'
    | 'ProgressDetector.MinIterationsBeforeCheck'
    | 'ProgressDetector.DuplicateStepRatioThreshold'
    | 'ProgressDetector.NoPayloadDeltaWindowCount'
    | 'ProgressDetector.RepeatingErrorWindowCount'
    | 'ProgressDetector.AmbiguityLowScoreThreshold'
    | 'ProgressDetector.AmbiguityHighScoreThreshold'
    | 'ProgressDetector.FastJudgeEnabled'
    | 'ProgressDetector.FastJudgeTimeoutMs'
    | 'ProgressDetector.FastJudgeMinIntervalIterations'
    | 'ProgressDetector.FastJudgeMaxInputChars'
    | 'ProgressDetector.FastJudgeFailureFallback'
    | ResourceGuardKeyPath
    | TuningKeyPath
    | IsolationKeyPath
    | TaskGraphQueueKeyPath
    | LivenessKeyPath
    | StuckDetectorKeyPath;

const RESOURCE_GUARD_KEYS: readonly ResourceGuardKey[] = [
    'MaxValidationRetries',
    'MaxConsecutiveFailedSteps',
    'MaxConsecutiveUnproductiveRetries',
    'MaxRepeatedFailingStep',
    'MaxConsecutiveReadToolPreemptions',
    'FinalPayloadValidationMaxRetries',
    'MaxRunChainLength',
    'MaxAgentRunTreeDepth',
    'MaxHandoffHops',
    'MaxSubAgentConsultRounds',
    'MaxDecisionRequestsPerTurn',
    'MaxDecisionCallsPerTurn',
    'MaxConversationToolCallsPerTurn',
    'MaxSettlementRetryPasses',
    'MaxReinvokeDepth',
    'MaxProviderRaiseAttempts',
    'ClientToolTimeoutMs',
    'PipelineDeadlineMs',
    'MaxPipelineStages',
    'MaxMapElements',
    'MaxLoopConcurrency',
    'MaxRealtimeConsecutiveAgentTurns',
] as const;

const TUNING_KEYS: readonly TuningKey[] = [
    'MaxPerAgentCacheEntries',
    'MaxClientToolSessions',
    'MaxToolsPerSession',
    'CompactionDefaultContextTokens',
    'CompactionDefaultTriggerPercent',
    'CompactionDefaultTargetPercent',
    'CompactionMinGainTokens',
    'CompactionMinMessages',
    'CompactionMaxDeltaMessageChars',
    'MaxSkillDecisionCandidates',
    'MaxHandoffCandidates',
    'QueryCacheDefaultMaxSize',
    'QueryCacheDefaultTtlMinutes',
    'ScratchpadMaxTasks',
    'DecisionsMaxItems',
    'MaxInitialArtifactOperations',
    'MaxDirectInIds',
    'MaxAgentsOfferedInDraft',
    'MaxStepsPerSignal',
] as const;

const ISOLATION_NUMERIC_KEYS: readonly (
    | 'WorkerMaxOldGenerationSizeMb'
    | 'WorkerMaxYoungGenerationSizeMb'
    | 'WorkerTimeoutMs'
    | 'ProcessMaxMemoryMb'
    | 'ProcessTimeoutMs'
    | 'ContainerMemoryMb'
    | 'ContainerCpuQuota'
    | 'ContainerTimeoutMs'
)[] = [
    'WorkerMaxOldGenerationSizeMb',
    'WorkerMaxYoungGenerationSizeMb',
    'WorkerTimeoutMs',
    'ProcessMaxMemoryMb',
    'ProcessTimeoutMs',
    'ContainerMemoryMb',
    'ContainerCpuQuota',
    'ContainerTimeoutMs',
] as const;

const ISOLATION_KEYS: readonly IsolationKey[] = [
    'DefaultIsolation',
    'DraftDefaultIsolation',
    ...ISOLATION_NUMERIC_KEYS,
    'ContainerImage',
    'ContainerRuntime',
] as const;

const TASK_GRAPH_QUEUE_NUMERIC_KEYS: readonly (
    | 'MaxEnqueuePublishConcurrency'
    | 'EnqueuePublishBatchSize'
    | 'MaxConcurrentIsolatedRunners'
    | 'MaxEnqueueItemsPerFanOut'
    | 'MaxEnqueueRedeliveryAttempts'
    | 'EnqueuePublishRetryAttempts'
    | 'CallerNotificationRetentionMs'
)[] = [
    'MaxEnqueuePublishConcurrency',
    'EnqueuePublishBatchSize',
    'MaxConcurrentIsolatedRunners',
    'MaxEnqueueItemsPerFanOut',
    'MaxEnqueueRedeliveryAttempts',
    'EnqueuePublishRetryAttempts',
    'CallerNotificationRetentionMs',
] as const;

const TASK_GRAPH_QUEUE_KEYS: readonly TaskGraphQueueKey[] = [
    'GraphDispatchTopicName',
    'DefaultEnqueueTopicName',
    ...TASK_GRAPH_QUEUE_NUMERIC_KEYS,
] as const;

const LIVENESS_KEYS: readonly LivenessKey[] = [
    'Enabled',
    'InactivityTimeoutMs',
    'OuterMaxWallClockMs',
    'StreamChunkTouchThrottleMs',
    'HttpHeadersTimeoutMs',
    'HttpBodyTimeoutMs',
] as const;

const STUCK_DETECTOR_NUMERIC_KEYS: readonly (
    | 'WindowSize'
    | 'IdenticalToolCallThreshold'
    | 'ReadOnlyStepThreshold'
    | 'ReadOnlyPostDirectiveGraceSteps'
)[] = [
    'WindowSize',
    'IdenticalToolCallThreshold',
    'ReadOnlyStepThreshold',
    'ReadOnlyPostDirectiveGraceSteps',
] as const;

const STUCK_DETECTOR_KEYS: readonly StuckDetectorKey[] = [
    'Enabled',
    ...STUCK_DETECTOR_NUMERIC_KEYS,
] as const;

/**
 * Ordered list of every {@link LimitsKeyPath} covered by {@link LimitsConfigResolver}.
 */
export const LIMITS_KEY_PATHS: readonly LimitsKeyPath[] = [
    'AgentChannelConsecutiveTurns',
    'AgentChannelWakesPerHour',
    'AgentAbsoluteIterations',
    'MaxTasksPerAgentGraph',
    'WhileLoopMaxIterations',
    'ForEachMaxIterations',
    'MaxTasksPerGraph',
    'BriefingContributorTimeoutMs',
    'BriefingMaxContributorChars',
    'Budgets.PerRun.MaxCostUsd',
    'Budgets.PerRun.MaxWallClockMs',
    'Budgets.PerRun.MaxTokens',
    'Budgets.PerRoutine.MaxCostUsd',
    'Budgets.PerRoutine.MaxWallClockMs',
    'Budgets.PerUserPerDay.MaxCostUsd',
    'Budgets.PerUserPerDay.MaxWallClockMs',
    'Budgets.PerUserPerDay.DayBoundaryTimezone',
    'Budgets.CountPausedTimeTowardsWallClock',
    'Budgets.AllowedInFlightOvershootUsd',
    'Budgets.AllowedInFlightOvershootMs',
    'ProgressDetector.Enabled',
    'ProgressDetector.WindowSize',
    'ProgressDetector.MinIterationsBeforeCheck',
    'ProgressDetector.DuplicateStepRatioThreshold',
    'ProgressDetector.NoPayloadDeltaWindowCount',
    'ProgressDetector.RepeatingErrorWindowCount',
    'ProgressDetector.AmbiguityLowScoreThreshold',
    'ProgressDetector.AmbiguityHighScoreThreshold',
    'ProgressDetector.FastJudgeEnabled',
    'ProgressDetector.FastJudgeTimeoutMs',
    'ProgressDetector.FastJudgeMinIntervalIterations',
    'ProgressDetector.FastJudgeMaxInputChars',
    'ProgressDetector.FastJudgeFailureFallback',
    ...RESOURCE_GUARD_KEYS.map((k): ResourceGuardKeyPath => `ResourceGuards.${k}`),
    ...TUNING_KEYS.map((k): TuningKeyPath => `Tuning.${k}`),
    ...ISOLATION_KEYS.map((k): IsolationKeyPath => `Isolation.${k}`),
    ...TASK_GRAPH_QUEUE_KEYS.map((k): TaskGraphQueueKeyPath => `TaskGraphQueue.${k}`),
    ...LIVENESS_KEYS.map((k): LivenessKeyPath => `Liveness.${k}`),
    ...STUCK_DETECTOR_KEYS.map((k): StuckDetectorKeyPath => `StuckDetector.${k}`),
] as const;

/** Primitive value type for an individual resolved limit key. */
export type LimitsScalarValue = number | string | boolean | null;

/**
 * Governance role distinguishing hard safety/quota ceilings (`PolicyCeiling`) from
 * operational defaults/tuning knobs (`OverridableDefault`).
 */
export type LimitsKeyRole = 'PolicyCeiling' | 'OverridableDefault';

/**
 * Per-key resolution provenance record showing the winning value, winning tier, and every tier's input.
 */
export interface LimitsKeyProvenance {
    /** Canonical key path. */
    Key: LimitsKeyPath;
    /** Whether this key acts as an enforced policy ceiling or an overridable operational default. */
    KeyRole: LimitsKeyRole;
    /** Effective resolved value after precedence merging. */
    Value: LimitsScalarValue;
    /** Highest-precedence tier that supplied the effective value. */
    SourceTier: LimitsSourceTier;
    /** True when any tier above `CodeFallback` supplied the winning value. */
    IsOverridden: boolean;
    /** Values supplied at each tier that explicitly specified this key. */
    TierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>>;
    /** True when ceiling enforcement clamped a `RunOverride` down to an enforced lower-tier ceiling. */
    WasClampedByPolicyCeiling: boolean;
}

/**
 * Layer inputs passed to {@link LimitsConfigResolver.Resolve}.
 */
export interface LimitsResolutionInput {
    /** Optional override layer applied to Tier 1 (`CodeFallback`) before higher tiers. */
    CodeFallback?: MJLimitsOverride | null;
    /** Tier 2: Settings loaded from `mj.config.cjs` `limits` object. Omitted (`undefined`) uses registered MjConfig; `null` clears it for this call. */
    MjConfig?: MJLimitsOverride | null;
    /** Tier 3: Agent or workflow metadata overrides. */
    AgentOrWorkflowMetadata?: MJLimitsOverride | null;
    /** Tier 4: User's agent policy overrides. */
    UserAgentPolicy?: MJLimitsOverride | null;
    /** Tier 5: Individual run overrides (highest precedence). */
    RunOverride?: MJLimitsOverride | null;
}

/**
 * Options controlling {@link LimitsConfigResolver.Resolve}.
 */
export interface LimitsResolveOptions {
    /**
     * When true, `RunOverride` cannot raise a numeric ceiling above a tighter finite ceiling set
     * in `UserAgentPolicy` (or replace a finite `UserAgentPolicy` limit with `null`) unless
     * `AllowAuthorizedCeilingOverride` is also true and `ContextUser` passes
     * {@link CanUserRaiseEnforcedLimitsCeilings}.
     */
    EnforceUserPolicyAsCeiling?: boolean;
    /**
     * When true, enforces lower-tier finite `PolicyCeiling` bounds (`CodeFallback`, `MjConfig`,
     * `AgentOrWorkflowMetadata`, `UserAgentPolicy`) against widening by `RunOverride` unless
     * `AllowAuthorizedCeilingOverride` is true and `ContextUser` passes
     * {@link CanUserRaiseEnforcedLimitsCeilings}.
     */
    EnforceConfiguredCeilings?: boolean;
    /**
     * Server-side execution user evaluated when `RunOverride` attempts to raise an enforced
     * `PolicyCeiling`. Missing or unauthorized users fail closed and are clamped to the ceiling.
     */
    ContextUser?: UserInfo | null;
    /**
     * Metadata provider supplying `Authorizations` for {@link CanUserRaiseEnforcedLimitsCeilings}.
     */
    Provider?: IMetadataProvider | null;
    /**
     * When true, allows an authorized `ContextUser` (`Owner`, `System Administrator`, or
     * `AI: Manage Agents`) to raise enforced `PolicyCeiling` values via `RunOverride`.
     */
    AllowAuthorizedCeilingOverride?: boolean;
    /** Optional deterministic timestamp override (ISO-8601) for repeatable snapshots/tests. */
    ResolvedAtISO?: string;
}

/**
 * Full output of {@link LimitsConfigResolver.Resolve}, including resolved values and per-key provenance.
 */
export interface MJLimitsResolutionResult {
    /** Complete resolved limits configuration with all defaults applied. */
    Limits: MJLimitsConfig;
    /** Per-key provenance records keyed by {@link LimitsKeyPath}. */
    Provenance: Record<LimitsKeyPath, LimitsKeyProvenance>;
    /** ISO-8601 timestamp when resolution ran. */
    ResolvedAtISO: string;
    /** Keys whose winning tier is above `CodeFallback`. */
    OverriddenKeys: LimitsKeyPath[];
    /** Keys where `RunOverride` was clamped by `UserAgentPolicy` ceiling enforcement. */
    ClampedKeys: LimitsKeyPath[];
}

/** One validation finding produced by {@link ValidateLimitsConfig}. */
export interface LimitsValidationIssue {
    Key: LimitsKeyPath;
    Message: string;
}

/** Outcome of {@link ValidateLimitsConfig}. */
export interface LimitsValidationResult {
    Valid: boolean;
    Issues: LimitsValidationIssue[];
}

const NUMERIC_CEILING_KEYS: ReadonlySet<LimitsKeyPath> = new Set<LimitsKeyPath>([
    'AgentChannelConsecutiveTurns',
    'AgentChannelWakesPerHour',
    'AgentAbsoluteIterations',
    'MaxTasksPerAgentGraph',
    'WhileLoopMaxIterations',
    'ForEachMaxIterations',
    'MaxTasksPerGraph',
    'BriefingContributorTimeoutMs',
    'BriefingMaxContributorChars',
    'Budgets.PerRun.MaxCostUsd',
    'Budgets.PerRun.MaxWallClockMs',
    'Budgets.PerRun.MaxTokens',
    'Budgets.PerRoutine.MaxCostUsd',
    'Budgets.PerRoutine.MaxWallClockMs',
    'Budgets.PerUserPerDay.MaxCostUsd',
    'Budgets.PerUserPerDay.MaxWallClockMs',
    'Budgets.AllowedInFlightOvershootUsd',
    'Budgets.AllowedInFlightOvershootMs',
    'ProgressDetector.FastJudgeMaxInputChars',
    ...RESOURCE_GUARD_KEYS.map((k): ResourceGuardKeyPath => `ResourceGuards.${k}`),
    ...ISOLATION_NUMERIC_KEYS.map((k): IsolationKeyPath => `Isolation.${k}`),
    ...TASK_GRAPH_QUEUE_NUMERIC_KEYS.map((k): TaskGraphQueueKeyPath => `TaskGraphQueue.${k}`),
    'Liveness.InactivityTimeoutMs',
    'Liveness.OuterMaxWallClockMs',
    'StuckDetector.IdenticalToolCallThreshold',
    'StuckDetector.ReadOnlyStepThreshold',
    'StuckDetector.ReadOnlyPostDirectiveGraceSteps',
]);

/**
 * Explicit classification of every {@link LimitsKeyPath} into `'PolicyCeiling'` (cannot be raised
 * above an enforced ceiling without authorization) vs `'OverridableDefault'` (operational default
 * or tuning setting).
 */
export const LIMITS_KEY_ROLES: Readonly<Record<LimitsKeyPath, LimitsKeyRole>> = Object.fromEntries(
    LIMITS_KEY_PATHS.map((key): [LimitsKeyPath, LimitsKeyRole] => [
        key,
        NUMERIC_CEILING_KEYS.has(key) ? 'PolicyCeiling' : 'OverridableDefault',
    ]),
) as Readonly<Record<LimitsKeyPath, LimitsKeyRole>>;

/**
 * Returns the governance role (`'PolicyCeiling'` vs `'OverridableDefault'`) for a canonical limit key.
 */
export function GetLimitsKeyRole(key: LimitsKeyPath): LimitsKeyRole {
    return LIMITS_KEY_ROLES[key];
}

/**
 * Returns `true` when {@link key} is a numeric policy ceiling that requires authorization to raise
 * above an enforced lower-tier ceiling.
 */
export function IsPolicyCeilingKey(key: LimitsKeyPath): boolean {
    return LIMITS_KEY_ROLES[key] === 'PolicyCeiling';
}

/**
 * Named MJ Authorizations permitted to raise enforced `PolicyCeiling` limits or approve
 * governance pause overrides.
 */
export const LIMITS_CEILING_OVERRIDE_AUTHORIZATIONS: readonly string[] = [
    'System Administrator',
    'AI: Manage Agents',
] as const;

/**
 * Evaluates whether a server-side `ContextUser` is authorized to raise enforced limits ceilings
 * (`Owner` user type or holding `'System Administrator'` / `'AI: Manage Agents'` authorization).
 * Fails closed (`false`) when `user` is missing or lacks required authorization.
 */
export function CanUserRaiseEnforcedLimitsCeilings(
    user?: UserInfo | null,
    provider?: IMetadataProvider | null,
): boolean {
    if (!user) {
        return false;
    }
    const userType = typeof user.Type === 'string' ? user.Type.trim().toLowerCase() : '';
    if (userType === 'owner') {
        return true;
    }
    const authorizations = provider?.Authorizations ?? [];
    const allowedSet = new Set(LIMITS_CEILING_OVERRIDE_AUTHORIZATIONS.map((name) => name.toLowerCase()));
    const evaluator = new AuthorizationEvaluator();
    for (const auth of authorizations) {
        const name = auth.Name?.trim().toLowerCase();
        if (name && allowedSet.has(name) && evaluator.UserCanExecuteWithAncestors(auth, user, authorizations)) {
            return true;
        }
    }
    return false;
}

/** Scalar input value accepted by {@link NormalizeLimitsInput}. */
export type LimitsInputScalar = string | number | boolean | null | undefined;

/** Object input shape accepted by {@link NormalizeLimitsInput}. */
export interface LimitsInputObject {
    [key: string]: LimitsInputValue;
}

/** Strongly-typed recursive input value accepted by {@link NormalizeLimitsInput} without `unknown` or `any`. */
export type LimitsInputValue =
    | LimitsInputScalar
    | LimitsInputObject
    | readonly LimitsInputValue[]
    | MJLimitsOverride
    | object;

function isLimitsInputObject(raw: LimitsInputValue): raw is LimitsInputObject {
    return IsPlainObject(raw);
}

function readObjectProperty(obj: LimitsInputObject, keys: readonly string[]): LimitsInputValue {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return obj[key];
        }
    }
    return undefined;
}

function readFiniteNonNegativeNumber(raw: LimitsInputValue): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        return undefined;
    }
    return raw;
}

function readPositiveInteger(raw: LimitsInputValue): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
        return undefined;
    }
    return Math.trunc(raw);
}

function readNullableNonNegativeNumber(raw: LimitsInputValue): number | null | undefined {
    if (raw === null) {
        return null;
    }
    return readFiniteNonNegativeNumber(raw);
}

function readNullablePositiveInteger(raw: LimitsInputValue): number | null | undefined {
    if (raw === null) {
        return null;
    }
    return readPositiveInteger(raw);
}

function readUnitIntervalNumber(raw: LimitsInputValue): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
        return undefined;
    }
    return raw;
}

function readBoolean(raw: LimitsInputValue): boolean | undefined {
    return typeof raw === 'boolean' ? raw : undefined;
}

function readNonEmptyString(raw: LimitsInputValue): string | undefined {
    if (typeof raw !== 'string') {
        return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readFastJudgeFallback(raw: LimitsInputValue): FastJudgeFailureFallbackMode | undefined {
    if (raw === 'ContinueWithWarning' || raw === 'PauseForHuman') {
        return raw;
    }
    return undefined;
}

function readIsolationLevel(raw: LimitsInputValue): TaskGraphIsolationLevel | undefined {
    return IsTaskGraphIsolationLevel(raw) ? raw : undefined;
}

function normalizeIsolationOverride(raw: LimitsInputValue): MJLimitsIsolationOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsIsolationOverride = {};
    const defaultIso = readIsolationLevel(readObjectProperty(raw, ['DefaultIsolation', 'defaultIsolation']));
    if (defaultIso !== undefined) out.DefaultIsolation = defaultIso;
    const draftIso = readIsolationLevel(readObjectProperty(raw, ['DraftDefaultIsolation', 'draftDefaultIsolation']));
    if (draftIso !== undefined) out.DraftDefaultIsolation = draftIso;
    const numeric = normalizePositiveIntSection(raw, ISOLATION_NUMERIC_KEYS);
    if (numeric) {
        Object.assign(out, numeric);
    }
    const containerImage = readNonEmptyString(readObjectProperty(raw, ['ContainerImage', 'containerImage']));
    if (containerImage !== undefined) out.ContainerImage = containerImage;
    const containerRuntime = readNonEmptyString(readObjectProperty(raw, ['ContainerRuntime', 'containerRuntime']));
    if (containerRuntime !== undefined) out.ContainerRuntime = containerRuntime;
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeTaskGraphQueueOverride(raw: LimitsInputValue): MJLimitsTaskGraphQueueOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsTaskGraphQueueOverride = {};
    const graphTopic = readNonEmptyString(readObjectProperty(raw, ['GraphDispatchTopicName', 'graphDispatchTopicName']));
    if (graphTopic !== undefined) out.GraphDispatchTopicName = graphTopic;
    const stepTopic = readNonEmptyString(readObjectProperty(raw, ['DefaultEnqueueTopicName', 'defaultEnqueueTopicName']));
    if (stepTopic !== undefined) out.DefaultEnqueueTopicName = stepTopic;
    const numeric = normalizePositiveIntSection(raw, TASK_GRAPH_QUEUE_NUMERIC_KEYS);
    if (numeric) {
        Object.assign(out, numeric);
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeLivenessOverride(raw: LimitsInputValue): MJLimitsLivenessOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsLivenessOverride = {};
    const enabled = readBoolean(readObjectProperty(raw, ['Enabled', 'enabled', 'LivenessEnabled', 'livenessEnabled']));
    if (enabled !== undefined) out.Enabled = enabled;
    const inactivity = readPositiveInteger(readObjectProperty(raw, ['InactivityTimeoutMs', 'inactivityTimeoutMs']));
    if (inactivity !== undefined) out.InactivityTimeoutMs = inactivity;
    const outerMax = readPositiveInteger(readObjectProperty(raw, ['OuterMaxWallClockMs', 'outerMaxWallClockMs']));
    if (outerMax !== undefined) out.OuterMaxWallClockMs = outerMax;
    const throttle = readFiniteNonNegativeNumber(readObjectProperty(raw, ['StreamChunkTouchThrottleMs', 'streamChunkTouchThrottleMs']));
    if (throttle !== undefined) out.StreamChunkTouchThrottleMs = Math.trunc(throttle);
    const headersTimeout = readFiniteNonNegativeNumber(readObjectProperty(raw, ['HttpHeadersTimeoutMs', 'httpHeadersTimeoutMs']));
    if (headersTimeout !== undefined) out.HttpHeadersTimeoutMs = Math.trunc(headersTimeout);
    const bodyTimeout = readFiniteNonNegativeNumber(readObjectProperty(raw, ['HttpBodyTimeoutMs', 'httpBodyTimeoutMs']));
    if (bodyTimeout !== undefined) out.HttpBodyTimeoutMs = Math.trunc(bodyTimeout);
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeStuckDetectorOverride(raw: LimitsInputValue): MJLimitsStuckDetectorOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsStuckDetectorOverride = {};
    const enabled = readBoolean(readObjectProperty(raw, ['Enabled', 'enabled']));
    if (enabled !== undefined) out.Enabled = enabled;
    const numeric = normalizePositiveIntSection(raw, STUCK_DETECTOR_NUMERIC_KEYS);
    if (numeric) {
        Object.assign(out, numeric);
    }
    const legacyIdentical = readPositiveInteger(readObjectProperty(raw, ['RepeatedToolCallThreshold', 'repeatedToolCallThreshold']));
    if (out.IdenticalToolCallThreshold === undefined && legacyIdentical !== undefined) {
        out.IdenticalToolCallThreshold = legacyIdentical;
    }
    const legacyReadOnly = readPositiveInteger(readObjectProperty(raw, ['ReadOnlySpiralThreshold', 'readOnlySpiralThreshold']));
    if (out.ReadOnlyStepThreshold === undefined && legacyReadOnly !== undefined) {
        out.ReadOnlyStepThreshold = legacyReadOnly;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeScopeBudgetOverride(raw: LimitsInputValue): MJLimitsScopeBudgetOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsScopeBudgetOverride = {};
    const maxCost = readNullableNonNegativeNumber(readObjectProperty(raw, ['MaxCostUsd', 'maxCostUsd']));
    if (maxCost !== undefined) {
        out.MaxCostUsd = maxCost;
    }
    const maxWall = readNullablePositiveInteger(readObjectProperty(raw, ['MaxWallClockMs', 'maxWallClockMs']));
    if (maxWall !== undefined) {
        out.MaxWallClockMs = maxWall;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeRunScopeBudgetOverride(raw: LimitsInputValue): MJLimitsRunScopeBudgetOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const base = normalizeScopeBudgetOverride(raw) ?? {};
    const out: MJLimitsRunScopeBudgetOverride = { ...base };
    const maxTokens = readNullablePositiveInteger(readObjectProperty(raw, ['MaxTokens', 'maxTokens']));
    if (maxTokens !== undefined) {
        out.MaxTokens = maxTokens;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeUserDailyScopeBudgetOverride(raw: LimitsInputValue): MJLimitsUserDailyScopeBudgetOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const base = normalizeScopeBudgetOverride(raw) ?? {};
    const out: MJLimitsUserDailyScopeBudgetOverride = { ...base };
    const tz = readNonEmptyString(readObjectProperty(raw, ['DayBoundaryTimezone', 'dayBoundaryTimezone']));
    if (tz !== undefined) {
        out.DayBoundaryTimezone = tz;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeBudgetsOverride(raw: LimitsInputValue): MJLimitsBudgetsOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsBudgetsOverride = {};
    const perRun = normalizeRunScopeBudgetOverride(readObjectProperty(raw, ['PerRun', 'perRun']));
    if (perRun) {
        out.PerRun = perRun;
    }
    const perRoutine = normalizeScopeBudgetOverride(readObjectProperty(raw, ['PerRoutine', 'perRoutine']));
    if (perRoutine) {
        out.PerRoutine = perRoutine;
    }
    const perUserPerDay = normalizeUserDailyScopeBudgetOverride(readObjectProperty(raw, ['PerUserPerDay', 'perUserPerDay']));
    if (perUserPerDay) {
        out.PerUserPerDay = perUserPerDay;
    }
    const countPaused = readBoolean(readObjectProperty(raw, ['CountPausedTimeTowardsWallClock', 'countPausedTimeTowardsWallClock']));
    if (countPaused !== undefined) {
        out.CountPausedTimeTowardsWallClock = countPaused;
    }
    const overshootUsd = readFiniteNonNegativeNumber(readObjectProperty(raw, ['AllowedInFlightOvershootUsd', 'allowedInFlightOvershootUsd']));
    if (overshootUsd !== undefined) {
        out.AllowedInFlightOvershootUsd = overshootUsd;
    }
    const overshootMs = readFiniteNonNegativeNumber(readObjectProperty(raw, ['AllowedInFlightOvershootMs', 'allowedInFlightOvershootMs']));
    if (overshootMs !== undefined) {
        out.AllowedInFlightOvershootMs = overshootMs;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeProgressDetectorOverride(raw: LimitsInputValue): MJLimitsProgressDetectorOverride | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: MJLimitsProgressDetectorOverride = {};
    const enabled = readBoolean(readObjectProperty(raw, ['Enabled', 'enabled']));
    if (enabled !== undefined) out.Enabled = enabled;
    const windowSize = readPositiveInteger(readObjectProperty(raw, ['WindowSize', 'windowSize']));
    if (windowSize !== undefined) out.WindowSize = windowSize;
    const minIterations = readPositiveInteger(readObjectProperty(raw, ['MinIterationsBeforeCheck', 'minIterationsBeforeCheck']));
    if (minIterations !== undefined) out.MinIterationsBeforeCheck = minIterations;
    const dupRatio = readUnitIntervalNumber(readObjectProperty(raw, ['DuplicateStepRatioThreshold', 'duplicateStepRatioThreshold']));
    if (dupRatio !== undefined) out.DuplicateStepRatioThreshold = dupRatio;
    const noDelta = readPositiveInteger(readObjectProperty(raw, ['NoPayloadDeltaWindowCount', 'noPayloadDeltaWindowCount']));
    if (noDelta !== undefined) out.NoPayloadDeltaWindowCount = noDelta;
    const repErr = readPositiveInteger(readObjectProperty(raw, ['RepeatingErrorWindowCount', 'repeatingErrorWindowCount']));
    if (repErr !== undefined) out.RepeatingErrorWindowCount = repErr;
    const lowScore = readUnitIntervalNumber(readObjectProperty(raw, ['AmbiguityLowScoreThreshold', 'ambiguityLowScoreThreshold']));
    if (lowScore !== undefined) out.AmbiguityLowScoreThreshold = lowScore;
    const highScore = readUnitIntervalNumber(readObjectProperty(raw, ['AmbiguityHighScoreThreshold', 'ambiguityHighScoreThreshold']));
    if (highScore !== undefined) out.AmbiguityHighScoreThreshold = highScore;
    const fastJudgeEnabled = readBoolean(readObjectProperty(raw, ['FastJudgeEnabled', 'fastJudgeEnabled']));
    if (fastJudgeEnabled !== undefined) out.FastJudgeEnabled = fastJudgeEnabled;
    const fastJudgeTimeoutMs = readPositiveInteger(readObjectProperty(raw, ['FastJudgeTimeoutMs', 'fastJudgeTimeoutMs']));
    if (fastJudgeTimeoutMs !== undefined) out.FastJudgeTimeoutMs = fastJudgeTimeoutMs;
    const minInterval = readPositiveInteger(readObjectProperty(raw, ['FastJudgeMinIntervalIterations', 'fastJudgeMinIntervalIterations']));
    if (minInterval !== undefined) out.FastJudgeMinIntervalIterations = minInterval;
    const maxInputChars = readPositiveInteger(readObjectProperty(raw, ['FastJudgeMaxInputChars', 'fastJudgeMaxInputChars']));
    if (maxInputChars !== undefined) out.FastJudgeMaxInputChars = maxInputChars;
    const fallback = readFastJudgeFallback(readObjectProperty(raw, ['FastJudgeFailureFallback', 'fastJudgeFailureFallback']));
    if (fallback !== undefined) out.FastJudgeFailureFallback = fallback;
    return Object.keys(out).length > 0 ? out : undefined;
}

function normalizePositiveIntSection<K extends string>(
    raw: LimitsInputValue,
    keys: readonly K[],
): Partial<Record<K, number>> | undefined {
    if (!isLimitsInputObject(raw)) {
        return undefined;
    }
    const out: Partial<Record<K, number>> = {};
    for (const key of keys) {
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        const val = readPositiveInteger(readObjectProperty(raw, [key, camel]));
        if (val !== undefined) {
            out[key] = val;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Tolerantly normalizes an untyped `limits` object (from `mj.config.cjs`, agent metadata JSON,
 * or API payloads) into a strongly-typed {@link MJLimitsOverride}. Accepts both PascalCase and
 * camelCase field names plus standard legacy aliases (`ContributorTimeoutMs`, `MaxContributorChars`,
 * `MaxConsecutiveAgentTurns`, `MaxHourlyWakes`, `MAX_TASKS_PER_AGENT_GRAPH`, `MAX_TASKS_PER_GRAPH`,
 * `absoluteMaxIterations`). Invalid or out-of-range values are omitted rather than throwing.
 *
 * @param raw - Raw input object (typically from `mj.config.cjs` `limits` or parsed JSON).
 * @returns Normalized {@link MJLimitsOverride} containing only valid fields.
 */
export function NormalizeLimitsInput(raw: LimitsInputValue): MJLimitsOverride {
    if (!isLimitsInputObject(raw)) {
        return {};
    }
    const out: MJLimitsOverride = {};
    const turns = readPositiveInteger(readObjectProperty(raw, ['AgentChannelConsecutiveTurns', 'agentChannelConsecutiveTurns', 'MaxConsecutiveAgentTurns', 'maxConsecutiveAgentTurns']));
    if (turns !== undefined) out.AgentChannelConsecutiveTurns = turns;
    const wakes = readPositiveInteger(readObjectProperty(raw, ['AgentChannelWakesPerHour', 'agentChannelWakesPerHour', 'MaxHourlyWakes', 'maxHourlyWakes']));
    if (wakes !== undefined) out.AgentChannelWakesPerHour = wakes;
    const iterations = readPositiveInteger(readObjectProperty(raw, ['AgentAbsoluteIterations', 'agentAbsoluteIterations', 'absoluteMaxIterations']));
    if (iterations !== undefined) out.AgentAbsoluteIterations = iterations;
    const agentGraph = readPositiveInteger(readObjectProperty(raw, ['MaxTasksPerAgentGraph', 'maxTasksPerAgentGraph', 'MAX_TASKS_PER_AGENT_GRAPH']));
    if (agentGraph !== undefined) out.MaxTasksPerAgentGraph = agentGraph;
    const whileMax = readPositiveInteger(readObjectProperty(raw, ['WhileLoopMaxIterations', 'whileLoopMaxIterations']));
    if (whileMax !== undefined) out.WhileLoopMaxIterations = whileMax;
    const forEachMax = readPositiveInteger(readObjectProperty(raw, ['ForEachMaxIterations', 'forEachMaxIterations']));
    if (forEachMax !== undefined) out.ForEachMaxIterations = forEachMax;
    const graphCeiling = readPositiveInteger(readObjectProperty(raw, ['MaxTasksPerGraph', 'maxTasksPerGraph', 'MAX_TASKS_PER_GRAPH']));
    if (graphCeiling !== undefined) out.MaxTasksPerGraph = graphCeiling;
    const briefingTimeout = readPositiveInteger(readObjectProperty(raw, ['BriefingContributorTimeoutMs', 'briefingContributorTimeoutMs', 'ContributorTimeoutMs']));
    if (briefingTimeout !== undefined) out.BriefingContributorTimeoutMs = briefingTimeout;
    const briefingChars = readPositiveInteger(readObjectProperty(raw, ['BriefingMaxContributorChars', 'briefingMaxContributorChars', 'MaxContributorChars']));
    if (briefingChars !== undefined) out.BriefingMaxContributorChars = briefingChars;
    const budgets = normalizeBudgetsOverride(readObjectProperty(raw, ['Budgets', 'budgets']));
    if (budgets) out.Budgets = budgets;
    const progressDetector = normalizeProgressDetectorOverride(readObjectProperty(raw, ['ProgressDetector', 'progressDetector']));
    if (progressDetector) out.ProgressDetector = progressDetector;
    const resourceGuards = normalizePositiveIntSection(readObjectProperty(raw, ['ResourceGuards', 'resourceGuards']), RESOURCE_GUARD_KEYS);
    if (resourceGuards) out.ResourceGuards = resourceGuards;
    const tuning = normalizePositiveIntSection(readObjectProperty(raw, ['Tuning', 'tuning']), TUNING_KEYS);
    if (tuning) out.Tuning = tuning;
    const isolation = normalizeIsolationOverride(readObjectProperty(raw, ['Isolation', 'isolation']));
    if (isolation) out.Isolation = isolation;
    const taskGraphQueue = normalizeTaskGraphQueueOverride(readObjectProperty(raw, ['TaskGraphQueue', 'taskGraphQueue']));
    if (taskGraphQueue) out.TaskGraphQueue = taskGraphQueue;
    const liveness = normalizeLivenessOverride(readObjectProperty(raw, ['Liveness', 'liveness']));
    if (liveness) out.Liveness = liveness;
    const stuckDetector = normalizeStuckDetectorOverride(readObjectProperty(raw, ['StuckDetector', 'stuckDetector']));
    if (stuckDetector) out.StuckDetector = stuckDetector;
    return out;
}

function cloneDefaultLimits(): MJLimitsConfig {
    return {
        ...CODE_FALLBACK_LIMITS,
        Budgets: {
            PerRun: { ...CODE_FALLBACK_LIMITS.Budgets.PerRun },
            PerRoutine: { ...CODE_FALLBACK_LIMITS.Budgets.PerRoutine },
            PerUserPerDay: { ...CODE_FALLBACK_LIMITS.Budgets.PerUserPerDay },
            CountPausedTimeTowardsWallClock: CODE_FALLBACK_LIMITS.Budgets.CountPausedTimeTowardsWallClock,
            AllowedInFlightOvershootUsd: CODE_FALLBACK_LIMITS.Budgets.AllowedInFlightOvershootUsd,
            AllowedInFlightOvershootMs: CODE_FALLBACK_LIMITS.Budgets.AllowedInFlightOvershootMs,
        },
        ProgressDetector: { ...CODE_FALLBACK_LIMITS.ProgressDetector },
        ResourceGuards: { ...CODE_FALLBACK_LIMITS.ResourceGuards },
        Tuning: { ...CODE_FALLBACK_LIMITS.Tuning },
        Isolation: { ...CODE_FALLBACK_LIMITS.Isolation },
        TaskGraphQueue: { ...CODE_FALLBACK_LIMITS.TaskGraphQueue },
        Liveness: { ...CODE_FALLBACK_LIMITS.Liveness },
        StuckDetector: { ...CODE_FALLBACK_LIMITS.StuckDetector },
    };
}

function extractTierValue(layer: MJLimitsOverride, key: LimitsKeyPath): LimitsScalarValue | undefined {
    if (key.startsWith('ResourceGuards.')) {
        const subKey = key.slice('ResourceGuards.'.length) as ResourceGuardKey;
        return layer.ResourceGuards?.[subKey];
    }
    if (key.startsWith('Tuning.')) {
        const subKey = key.slice('Tuning.'.length) as TuningKey;
        return layer.Tuning?.[subKey];
    }
    if (key.startsWith('Isolation.')) {
        const subKey = key.slice('Isolation.'.length) as IsolationKey;
        return layer.Isolation?.[subKey];
    }
    if (key.startsWith('TaskGraphQueue.')) {
        const subKey = key.slice('TaskGraphQueue.'.length) as TaskGraphQueueKey;
        return layer.TaskGraphQueue?.[subKey];
    }
    if (key.startsWith('Liveness.')) {
        const subKey = key.slice('Liveness.'.length) as LivenessKey;
        return layer.Liveness?.[subKey];
    }
    if (key.startsWith('StuckDetector.')) {
        const subKey = key.slice('StuckDetector.'.length) as StuckDetectorKey;
        return layer.StuckDetector?.[subKey];
    }
    switch (key) {
        case 'AgentChannelConsecutiveTurns': return layer.AgentChannelConsecutiveTurns;
        case 'AgentChannelWakesPerHour': return layer.AgentChannelWakesPerHour;
        case 'AgentAbsoluteIterations': return layer.AgentAbsoluteIterations;
        case 'MaxTasksPerAgentGraph': return layer.MaxTasksPerAgentGraph;
        case 'WhileLoopMaxIterations': return layer.WhileLoopMaxIterations;
        case 'ForEachMaxIterations': return layer.ForEachMaxIterations;
        case 'MaxTasksPerGraph': return layer.MaxTasksPerGraph;
        case 'BriefingContributorTimeoutMs': return layer.BriefingContributorTimeoutMs;
        case 'BriefingMaxContributorChars': return layer.BriefingMaxContributorChars;
        case 'Budgets.PerRun.MaxCostUsd': return layer.Budgets?.PerRun?.MaxCostUsd;
        case 'Budgets.PerRun.MaxWallClockMs': return layer.Budgets?.PerRun?.MaxWallClockMs;
        case 'Budgets.PerRun.MaxTokens': return layer.Budgets?.PerRun?.MaxTokens;
        case 'Budgets.PerRoutine.MaxCostUsd': return layer.Budgets?.PerRoutine?.MaxCostUsd;
        case 'Budgets.PerRoutine.MaxWallClockMs': return layer.Budgets?.PerRoutine?.MaxWallClockMs;
        case 'Budgets.PerUserPerDay.MaxCostUsd': return layer.Budgets?.PerUserPerDay?.MaxCostUsd;
        case 'Budgets.PerUserPerDay.MaxWallClockMs': return layer.Budgets?.PerUserPerDay?.MaxWallClockMs;
        case 'Budgets.PerUserPerDay.DayBoundaryTimezone': return layer.Budgets?.PerUserPerDay?.DayBoundaryTimezone;
        case 'Budgets.CountPausedTimeTowardsWallClock': return layer.Budgets?.CountPausedTimeTowardsWallClock;
        case 'Budgets.AllowedInFlightOvershootUsd': return layer.Budgets?.AllowedInFlightOvershootUsd;
        case 'Budgets.AllowedInFlightOvershootMs': return layer.Budgets?.AllowedInFlightOvershootMs;
        case 'ProgressDetector.Enabled': return layer.ProgressDetector?.Enabled;
        case 'ProgressDetector.WindowSize': return layer.ProgressDetector?.WindowSize;
        case 'ProgressDetector.MinIterationsBeforeCheck': return layer.ProgressDetector?.MinIterationsBeforeCheck;
        case 'ProgressDetector.DuplicateStepRatioThreshold': return layer.ProgressDetector?.DuplicateStepRatioThreshold;
        case 'ProgressDetector.NoPayloadDeltaWindowCount': return layer.ProgressDetector?.NoPayloadDeltaWindowCount;
        case 'ProgressDetector.RepeatingErrorWindowCount': return layer.ProgressDetector?.RepeatingErrorWindowCount;
        case 'ProgressDetector.AmbiguityLowScoreThreshold': return layer.ProgressDetector?.AmbiguityLowScoreThreshold;
        case 'ProgressDetector.AmbiguityHighScoreThreshold': return layer.ProgressDetector?.AmbiguityHighScoreThreshold;
        case 'ProgressDetector.FastJudgeEnabled': return layer.ProgressDetector?.FastJudgeEnabled;
        case 'ProgressDetector.FastJudgeTimeoutMs': return layer.ProgressDetector?.FastJudgeTimeoutMs;
        case 'ProgressDetector.FastJudgeMinIntervalIterations': return layer.ProgressDetector?.FastJudgeMinIntervalIterations;
        case 'ProgressDetector.FastJudgeMaxInputChars': return layer.ProgressDetector?.FastJudgeMaxInputChars;
        case 'ProgressDetector.FastJudgeFailureFallback': return layer.ProgressDetector?.FastJudgeFailureFallback;
    }
}

function assignResolvedValue(target: MJLimitsConfig, key: LimitsKeyPath, value: LimitsScalarValue): void {
    if (key.startsWith('ResourceGuards.')) {
        const subKey = key.slice('ResourceGuards.'.length) as ResourceGuardKey;
        target.ResourceGuards[subKey] = value as number;
        return;
    }
    if (key.startsWith('Tuning.')) {
        const subKey = key.slice('Tuning.'.length) as TuningKey;
        target.Tuning[subKey] = value as number;
        return;
    }
    if (key.startsWith('Isolation.')) {
        const subKey = key.slice('Isolation.'.length) as IsolationKey;
        if (subKey === 'ContainerImage' || subKey === 'ContainerRuntime') {
            target.Isolation[subKey] = value as string;
        } else if (subKey === 'DefaultIsolation' || subKey === 'DraftDefaultIsolation') {
            target.Isolation[subKey] = value as TaskGraphIsolationLevel;
        } else {
            target.Isolation[subKey] = value as number;
        }
        return;
    }
    if (key.startsWith('TaskGraphQueue.')) {
        const subKey = key.slice('TaskGraphQueue.'.length) as TaskGraphQueueKey;
        if (subKey === 'GraphDispatchTopicName' || subKey === 'DefaultEnqueueTopicName') {
            target.TaskGraphQueue[subKey] = value as string;
        } else {
            target.TaskGraphQueue[subKey] = value as number;
        }
        return;
    }
    if (key.startsWith('Liveness.')) {
        const subKey = key.slice('Liveness.'.length) as LivenessKey;
        if (subKey === 'Enabled') {
            target.Liveness.Enabled = value as boolean;
        } else {
            target.Liveness[subKey] = value as number;
        }
        return;
    }
    if (key.startsWith('StuckDetector.')) {
        const subKey = key.slice('StuckDetector.'.length) as StuckDetectorKey;
        if (subKey === 'Enabled') {
            target.StuckDetector.Enabled = value as boolean;
        } else {
            target.StuckDetector[subKey] = value as number;
        }
        return;
    }
    switch (key) {
        case 'AgentChannelConsecutiveTurns': target.AgentChannelConsecutiveTurns = value as number; break;
        case 'AgentChannelWakesPerHour': target.AgentChannelWakesPerHour = value as number; break;
        case 'AgentAbsoluteIterations': target.AgentAbsoluteIterations = value as number; break;
        case 'MaxTasksPerAgentGraph': target.MaxTasksPerAgentGraph = value as number; break;
        case 'WhileLoopMaxIterations': target.WhileLoopMaxIterations = value as number; break;
        case 'ForEachMaxIterations': target.ForEachMaxIterations = value as number; break;
        case 'MaxTasksPerGraph': target.MaxTasksPerGraph = value as number; break;
        case 'BriefingContributorTimeoutMs': target.BriefingContributorTimeoutMs = value as number; break;
        case 'BriefingMaxContributorChars': target.BriefingMaxContributorChars = value as number; break;
        case 'Budgets.PerRun.MaxCostUsd': target.Budgets.PerRun.MaxCostUsd = value as number | null; break;
        case 'Budgets.PerRun.MaxWallClockMs': target.Budgets.PerRun.MaxWallClockMs = value as number | null; break;
        case 'Budgets.PerRun.MaxTokens': target.Budgets.PerRun.MaxTokens = value as number | null; break;
        case 'Budgets.PerRoutine.MaxCostUsd': target.Budgets.PerRoutine.MaxCostUsd = value as number | null; break;
        case 'Budgets.PerRoutine.MaxWallClockMs': target.Budgets.PerRoutine.MaxWallClockMs = value as number | null; break;
        case 'Budgets.PerUserPerDay.MaxCostUsd': target.Budgets.PerUserPerDay.MaxCostUsd = value as number | null; break;
        case 'Budgets.PerUserPerDay.MaxWallClockMs': target.Budgets.PerUserPerDay.MaxWallClockMs = value as number | null; break;
        case 'Budgets.PerUserPerDay.DayBoundaryTimezone': target.Budgets.PerUserPerDay.DayBoundaryTimezone = value as string; break;
        case 'Budgets.CountPausedTimeTowardsWallClock': target.Budgets.CountPausedTimeTowardsWallClock = value as boolean; break;
        case 'Budgets.AllowedInFlightOvershootUsd': target.Budgets.AllowedInFlightOvershootUsd = value as number; break;
        case 'Budgets.AllowedInFlightOvershootMs': target.Budgets.AllowedInFlightOvershootMs = value as number; break;
        case 'ProgressDetector.Enabled': target.ProgressDetector.Enabled = value as boolean; break;
        case 'ProgressDetector.WindowSize': target.ProgressDetector.WindowSize = value as number; break;
        case 'ProgressDetector.MinIterationsBeforeCheck': target.ProgressDetector.MinIterationsBeforeCheck = value as number; break;
        case 'ProgressDetector.DuplicateStepRatioThreshold': target.ProgressDetector.DuplicateStepRatioThreshold = value as number; break;
        case 'ProgressDetector.NoPayloadDeltaWindowCount': target.ProgressDetector.NoPayloadDeltaWindowCount = value as number; break;
        case 'ProgressDetector.RepeatingErrorWindowCount': target.ProgressDetector.RepeatingErrorWindowCount = value as number; break;
        case 'ProgressDetector.AmbiguityLowScoreThreshold': target.ProgressDetector.AmbiguityLowScoreThreshold = value as number; break;
        case 'ProgressDetector.AmbiguityHighScoreThreshold': target.ProgressDetector.AmbiguityHighScoreThreshold = value as number; break;
        case 'ProgressDetector.FastJudgeEnabled': target.ProgressDetector.FastJudgeEnabled = value as boolean; break;
        case 'ProgressDetector.FastJudgeTimeoutMs': target.ProgressDetector.FastJudgeTimeoutMs = value as number; break;
        case 'ProgressDetector.FastJudgeMinIntervalIterations': target.ProgressDetector.FastJudgeMinIntervalIterations = value as number; break;
        case 'ProgressDetector.FastJudgeMaxInputChars': target.ProgressDetector.FastJudgeMaxInputChars = value as number; break;
        case 'ProgressDetector.FastJudgeFailureFallback': target.ProgressDetector.FastJudgeFailureFallback = value as FastJudgeFailureFallbackMode; break;
    }
}

function shouldClampToPolicyCeiling(
    key: LimitsKeyPath,
    runVal: LimitsScalarValue,
    policyVal: LimitsScalarValue | undefined,
): policyVal is number {
    if (!NUMERIC_CEILING_KEYS.has(key) || typeof policyVal !== 'number' || !Number.isFinite(policyVal)) {
        return false;
    }
    if (runVal === null) {
        return true;
    }
    return typeof runVal === 'number' && Number.isFinite(runVal) && runVal > policyVal;
}

function resolveSingleKey(
    key: LimitsKeyPath,
    defaults: MJLimitsConfig,
    tiers: Record<LimitsSourceTier, MJLimitsOverride | null>,
    enforceUserPolicyCeiling: boolean,
    enforceConfiguredCeilings: boolean,
    callerCanRaiseCeilings: boolean,
): LimitsKeyProvenance {
    const codeFallbackBase = extractTierValue(defaults, key) ?? null;
    const tierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>> = {
        CodeFallback: codeFallbackBase,
    };
    let preRunValue: LimitsScalarValue = codeFallbackBase;
    let preRunTier: LimitsSourceTier = 'CodeFallback';
    let wasClamped = false;

    for (const tier of LIMITS_TIER_PRECEDENCE) {
        if (tier === 'RunOverride') {
            continue;
        }
        const layer = tiers[tier];
        if (!layer) {
            continue;
        }
        const candidate = extractTierValue(layer, key);
        if (candidate !== undefined) {
            tierValues[tier] = candidate;
            if (tier === 'UserAgentPolicy' && !callerCanRaiseCeilings) {
                // F1 org-ceiling invariant: `mj.config.cjs` (MjConfig) sits at the root ceiling
                // of user agent policies; a user's personal policy may only narrow, never raise
                // (or clear to null/unlimited), org ceilings — and when configured ceilings are
                // enforced, cannot raise Agent/Workflow ceilings either.
                const mjConfigVal = tierValues.MjConfig;
                const clampAgainstPreRun =
                    enforceConfiguredCeilings && shouldClampToPolicyCeiling(key, candidate, preRunValue);
                const clampAgainstMjConfig =
                    (enforceConfiguredCeilings || enforceUserPolicyCeiling) &&
                    shouldClampToPolicyCeiling(key, candidate, mjConfigVal);

                if (clampAgainstPreRun || clampAgainstMjConfig) {
                    if (
                        clampAgainstMjConfig &&
                        (!clampAgainstPreRun ||
                            (typeof mjConfigVal === 'number' &&
                                typeof preRunValue === 'number' &&
                                mjConfigVal <= preRunValue))
                    ) {
                        preRunValue = mjConfigVal as number;
                        preRunTier = 'MjConfig';
                    }
                    wasClamped = true;
                    continue;
                }
            }
            preRunValue = candidate;
            preRunTier = tier;
        }
    }

    let winningValue: LimitsScalarValue = preRunValue;
    let sourceTier: LimitsSourceTier = preRunTier;

    const runLayer = tiers.RunOverride;
    const runCandidate = runLayer ? extractTierValue(runLayer, key) : undefined;
    if (runCandidate !== undefined) {
        tierValues.RunOverride = runCandidate;
        winningValue = runCandidate;
        sourceTier = 'RunOverride';

        if (!callerCanRaiseCeilings) {
            if (enforceConfiguredCeilings && shouldClampToPolicyCeiling(key, winningValue, preRunValue)) {
                winningValue = preRunValue;
                sourceTier = preRunTier;
                wasClamped = true;
            } else if (enforceUserPolicyCeiling && tierValues.UserAgentPolicy !== undefined) {
                // Use the effective (possibly MjConfig-clamped) policy ceiling, never the raw unclamped policy value
                const effectivePolicyCeiling =
                    preRunTier === 'MjConfig' || preRunTier === 'UserAgentPolicy'
                        ? preRunValue
                        : tierValues.UserAgentPolicy;
                if (shouldClampToPolicyCeiling(key, winningValue, effectivePolicyCeiling)) {
                    winningValue = effectivePolicyCeiling;
                    sourceTier = preRunTier === 'MjConfig' ? 'MjConfig' : 'UserAgentPolicy';
                    wasClamped = true;
                }
            }
        }
    }

    return {
        Key: key,
        KeyRole: GetLimitsKeyRole(key),
        Value: winningValue,
        SourceTier: sourceTier,
        IsOverridden: sourceTier !== 'CodeFallback',
        TierValues: tierValues,
        WasClampedByPolicyCeiling: wasClamped,
    };
}

/**
 * Validates a resolved {@link MJLimitsConfig} for structural and range invariants.
 *
 * @param config - Resolved limits config to inspect.
 * @returns Validation result with any violated limit keys and descriptions.
 */
export function ValidateLimitsConfig(config: MJLimitsConfig): LimitsValidationResult {
    const issues: LimitsValidationIssue[] = [];
    const positiveIntChecks: Array<[LimitsKeyPath, number]> = [
        ['AgentChannelConsecutiveTurns', config.AgentChannelConsecutiveTurns],
        ['AgentChannelWakesPerHour', config.AgentChannelWakesPerHour],
        ['AgentAbsoluteIterations', config.AgentAbsoluteIterations],
        ['MaxTasksPerAgentGraph', config.MaxTasksPerAgentGraph],
        ['WhileLoopMaxIterations', config.WhileLoopMaxIterations],
        ['ForEachMaxIterations', config.ForEachMaxIterations],
        ['MaxTasksPerGraph', config.MaxTasksPerGraph],
        ['BriefingContributorTimeoutMs', config.BriefingContributorTimeoutMs],
        ['BriefingMaxContributorChars', config.BriefingMaxContributorChars],
        ['ProgressDetector.WindowSize', config.ProgressDetector.WindowSize],
        ['ProgressDetector.MinIterationsBeforeCheck', config.ProgressDetector.MinIterationsBeforeCheck],
        ['ProgressDetector.NoPayloadDeltaWindowCount', config.ProgressDetector.NoPayloadDeltaWindowCount],
        ['ProgressDetector.RepeatingErrorWindowCount', config.ProgressDetector.RepeatingErrorWindowCount],
        ['ProgressDetector.FastJudgeTimeoutMs', config.ProgressDetector.FastJudgeTimeoutMs],
        ['ProgressDetector.FastJudgeMinIntervalIterations', config.ProgressDetector.FastJudgeMinIntervalIterations],
        ['ProgressDetector.FastJudgeMaxInputChars', config.ProgressDetector.FastJudgeMaxInputChars],
        ...RESOURCE_GUARD_KEYS.map((k): [LimitsKeyPath, number] => [`ResourceGuards.${k}`, config.ResourceGuards[k]]),
        ...TUNING_KEYS.map((k): [LimitsKeyPath, number] => [`Tuning.${k}`, config.Tuning[k]]),
        ...ISOLATION_NUMERIC_KEYS.map((k): [LimitsKeyPath, number] => [`Isolation.${k}`, config.Isolation[k]]),
        ...TASK_GRAPH_QUEUE_NUMERIC_KEYS.map((k): [LimitsKeyPath, number] => [`TaskGraphQueue.${k}`, config.TaskGraphQueue[k]]),
        ['Liveness.InactivityTimeoutMs', config.Liveness.InactivityTimeoutMs],
        ['Liveness.OuterMaxWallClockMs', config.Liveness.OuterMaxWallClockMs],
        ...STUCK_DETECTOR_NUMERIC_KEYS.map((k): [LimitsKeyPath, number] => [`StuckDetector.${k}`, config.StuckDetector[k]]),
    ];
    for (const [key, val] of positiveIntChecks) {
        if (!Number.isFinite(val) || val < 1) {
            issues.push({ Key: key, Message: `${key} must be a positive number >= 1.` });
        }
    }
    const nonNegativeLivenessChecks: Array<[LimitsKeyPath, number]> = [
        ['Liveness.StreamChunkTouchThrottleMs', config.Liveness.StreamChunkTouchThrottleMs],
        ['Liveness.HttpHeadersTimeoutMs', config.Liveness.HttpHeadersTimeoutMs],
        ['Liveness.HttpBodyTimeoutMs', config.Liveness.HttpBodyTimeoutMs],
    ];
    for (const [key, val] of nonNegativeLivenessChecks) {
        if (!Number.isFinite(val) || val < 0) {
            issues.push({ Key: key, Message: `${key} must be a non-negative number >= 0.` });
        }
    }
    if (!IsTaskGraphIsolationLevel(config.Isolation.DefaultIsolation)) {
        issues.push({
            Key: 'Isolation.DefaultIsolation',
            Message: 'Isolation.DefaultIsolation must be one of InProcess, Worker, Process, or Container.',
        });
    }
    if (!IsTaskGraphIsolationLevel(config.Isolation.DraftDefaultIsolation)) {
        issues.push({
            Key: 'Isolation.DraftDefaultIsolation',
            Message: 'Isolation.DraftDefaultIsolation must be one of InProcess, Worker, Process, or Container.',
        });
    }
    if (!config.Isolation.ContainerImage || !config.Isolation.ContainerImage.trim()) {
        issues.push({
            Key: 'Isolation.ContainerImage',
            Message: 'Isolation.ContainerImage must be a non-empty string.',
        });
    }
    if (!config.Isolation.ContainerRuntime || !config.Isolation.ContainerRuntime.trim()) {
        issues.push({
            Key: 'Isolation.ContainerRuntime',
            Message: 'Isolation.ContainerRuntime must be a non-empty string.',
        });
    }
    if (!config.TaskGraphQueue.GraphDispatchTopicName || !config.TaskGraphQueue.GraphDispatchTopicName.trim()) {
        issues.push({
            Key: 'TaskGraphQueue.GraphDispatchTopicName',
            Message: 'TaskGraphQueue.GraphDispatchTopicName must be a non-empty string.',
        });
    }
    if (!config.TaskGraphQueue.DefaultEnqueueTopicName || !config.TaskGraphQueue.DefaultEnqueueTopicName.trim()) {
        issues.push({
            Key: 'TaskGraphQueue.DefaultEnqueueTopicName',
            Message: 'TaskGraphQueue.DefaultEnqueueTopicName must be a non-empty string.',
        });
    }
    if (config.MaxTasksPerAgentGraph > config.MaxTasksPerGraph) {
        issues.push({
            Key: 'MaxTasksPerAgentGraph',
            Message: 'MaxTasksPerAgentGraph cannot exceed MaxTasksPerGraph.',
        });
    }
    if (config.ProgressDetector.AmbiguityLowScoreThreshold > config.ProgressDetector.AmbiguityHighScoreThreshold) {
        issues.push({
            Key: 'ProgressDetector.AmbiguityLowScoreThreshold',
            Message: 'AmbiguityLowScoreThreshold cannot exceed AmbiguityHighScoreThreshold.',
        });
    }
    return { Valid: issues.length === 0, Issues: issues };
}

/**
 * 5-tier hierarchical resolver for {@link MJLimitsConfig} backed by `BaseSingleton` so server
 * bootstrap can register `mj.config.cjs` `limits` once across the process without adding Node
 * dependencies to `@memberjunction/core`.
 */
export class LimitsConfigResolver extends BaseSingleton<LimitsConfigResolver> {
    private registeredMjConfigLimits: MJLimitsOverride | null = null;

    public constructor() {
        super();
    }

    /** Returns the process-wide singleton {@link LimitsConfigResolver}. */
    public static get Instance(): LimitsConfigResolver {
        return LimitsConfigResolver.getInstance<LimitsConfigResolver>();
    }

    /**
     * Convenience static entry point delegating to {@link LimitsConfigResolver.Instance.Resolve}.
     */
    public static Resolve(
        input?: LimitsResolutionInput,
        options?: LimitsResolveOptions,
    ): MJLimitsResolutionResult {
        return LimitsConfigResolver.Instance.Resolve(input, options);
    }

    /**
     * Registers Tier 2 (`MjConfig`) limits loaded from `mj.config.cjs` by a host bootstrapper.
     * Pass `null` to clear any registered config.
     */
    public RegisterMjConfigLimits(limits: MJLimitsOverride | LimitsInputObject | null): void {
        if (limits === null) {
            this.registeredMjConfigLimits = null;
            return;
        }
        this.registeredMjConfigLimits = NormalizeLimitsInput(limits);
    }

    /** Returns the currently registered Tier 2 (`MjConfig`) override, or `null` when unset. */
    public GetMjConfigLimits(): MJLimitsOverride | null {
        return this.registeredMjConfigLimits;
    }

    /** Clears any registered Tier 2 (`MjConfig`) override (primarily for unit test isolation). */
    public ClearMjConfigLimits(): void {
        this.registeredMjConfigLimits = null;
    }

    /**
     * Resolves all limit keys across the 5 precedence tiers (`CodeFallback` -> `MjConfig` ->
     * `AgentOrWorkflowMetadata` -> `UserAgentPolicy` -> `RunOverride`), tracking full provenance.
     */
    public Resolve(
        input: LimitsResolutionInput = {},
        options: LimitsResolveOptions = {},
    ): MJLimitsResolutionResult {
        const defaults = cloneDefaultLimits();
        const mjConfigTier =
            input.MjConfig !== undefined ? input.MjConfig : this.registeredMjConfigLimits;

        const tiers: Record<LimitsSourceTier, MJLimitsOverride | null> = {
            CodeFallback: input.CodeFallback ?? null,
            MjConfig: mjConfigTier ?? null,
            AgentOrWorkflowMetadata: input.AgentOrWorkflowMetadata ?? null,
            UserAgentPolicy: input.UserAgentPolicy ?? null,
            RunOverride: input.RunOverride ?? null,
        };

        const resolvedLimits = cloneDefaultLimits();
        const provenanceEntries: Array<[LimitsKeyPath, LimitsKeyProvenance]> = [];
        const overriddenKeys: LimitsKeyPath[] = [];
        const clampedKeys: LimitsKeyPath[] = [];
        const enforceUserPolicyCeiling = options.EnforceUserPolicyAsCeiling === true;
        const enforceConfiguredCeilings = options.EnforceConfiguredCeilings === true;
        const callerCanRaiseCeilings =
            options.AllowAuthorizedCeilingOverride === true &&
            CanUserRaiseEnforcedLimitsCeilings(options.ContextUser, options.Provider);

        for (const key of LIMITS_KEY_PATHS) {
            const keyProvenance = resolveSingleKey(
                key,
                defaults,
                tiers,
                enforceUserPolicyCeiling,
                enforceConfiguredCeilings,
                callerCanRaiseCeilings,
            );
            assignResolvedValue(resolvedLimits, key, keyProvenance.Value);
            provenanceEntries.push([key, keyProvenance]);
            if (keyProvenance.IsOverridden) {
                overriddenKeys.push(key);
            }
            if (keyProvenance.WasClampedByPolicyCeiling) {
                clampedKeys.push(key);
            }
        }

        return {
            Limits: resolvedLimits,
            Provenance: Object.fromEntries(provenanceEntries) as Record<LimitsKeyPath, LimitsKeyProvenance>,
            ResolvedAtISO: options.ResolvedAtISO ?? new Date().toISOString(),
            OverriddenKeys: overriddenKeys,
            ClampedKeys: clampedKeys,
        };
    }

    /**
     * Reads a single resolved limit value from a resolution result by canonical key path.
     */
    public GetLimitValue(result: MJLimitsResolutionResult, key: LimitsKeyPath): LimitsScalarValue {
        return result.Provenance[key].Value;
    }
}
