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
 * Complete resolved configuration surface for MemberJunction execution limits, backstops,
 * budgets, briefing bounds, and progress detection.
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
};

/**
 * Alias for {@link CODE_FALLBACK_LIMITS} representing the default MemberJunction limits
 * configuration used when `mj.config.cjs` omits a `limits` block.
 */
export const DEFAULT_MJ_LIMITS_CONFIG: Readonly<MJLimitsConfig> = CODE_FALLBACK_LIMITS;

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
    | 'ProgressDetector.FastJudgeFailureFallback';

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
] as const;

/** Primitive value type for an individual resolved limit key. */
export type LimitsScalarValue = number | string | boolean | null;

/**
 * Per-key resolution provenance record showing the winning value, winning tier, and every tier's input.
 */
export interface LimitsKeyProvenance {
    /** Canonical key path. */
    Key: LimitsKeyPath;
    /** Effective resolved value after precedence merging. */
    Value: LimitsScalarValue;
    /** Highest-precedence tier that supplied the effective value. */
    SourceTier: LimitsSourceTier;
    /** True when any tier above `CodeFallback` supplied the winning value. */
    IsOverridden: boolean;
    /** Values supplied at each tier that explicitly specified this key. */
    TierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>>;
    /** True when `EnforceUserPolicyAsCeiling` clamped a `RunOverride` down to the policy ceiling. */
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
     * in `UserAgentPolicy` (or replace a finite `UserAgentPolicy` limit with `null`).
     */
    EnforceUserPolicyAsCeiling?: boolean;
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
]);

function readObjectProperty(obj: Record<string, unknown>, keys: readonly string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            return obj[key];
        }
    }
    return undefined;
}

function readFiniteNonNegativeNumber(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        return undefined;
    }
    return raw;
}

function readPositiveInteger(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
        return undefined;
    }
    return Math.trunc(raw);
}

function readNullableNonNegativeNumber(raw: unknown): number | null | undefined {
    if (raw === null) {
        return null;
    }
    return readFiniteNonNegativeNumber(raw);
}

function readNullablePositiveInteger(raw: unknown): number | null | undefined {
    if (raw === null) {
        return null;
    }
    return readPositiveInteger(raw);
}

function readUnitIntervalNumber(raw: unknown): number | undefined {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
        return undefined;
    }
    return raw;
}

function readBoolean(raw: unknown): boolean | undefined {
    return typeof raw === 'boolean' ? raw : undefined;
}

function readNonEmptyString(raw: unknown): string | undefined {
    if (typeof raw !== 'string') {
        return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function readFastJudgeFallback(raw: unknown): FastJudgeFailureFallbackMode | undefined {
    if (raw === 'ContinueWithWarning' || raw === 'PauseForHuman') {
        return raw;
    }
    return undefined;
}

function normalizeScopeBudgetOverride(raw: unknown): MJLimitsScopeBudgetOverride | undefined {
    if (!IsPlainObject(raw)) {
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

function normalizeRunScopeBudgetOverride(raw: unknown): MJLimitsRunScopeBudgetOverride | undefined {
    if (!IsPlainObject(raw)) {
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

function normalizeUserDailyScopeBudgetOverride(raw: unknown): MJLimitsUserDailyScopeBudgetOverride | undefined {
    if (!IsPlainObject(raw)) {
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

function normalizeBudgetsOverride(raw: unknown): MJLimitsBudgetsOverride | undefined {
    if (!IsPlainObject(raw)) {
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

function normalizeProgressDetectorOverride(raw: unknown): MJLimitsProgressDetectorOverride | undefined {
    if (!IsPlainObject(raw)) {
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

/**
 * Tolerantly normalizes an untyped `limits` object (from `mj.config.cjs`, agent metadata JSON,
 * or API payloads) into a strongly-typed {@link MJLimitsOverride}. Accepts both PascalCase and
 * camelCase field names plus standard legacy aliases (`ContributorTimeoutMs`, `MaxContributorChars`,
 * `MaxConsecutiveAgentTurns`, `MaxHourlyWakes`, `MAX_TASKS_PER_AGENT_GRAPH`, `MAX_TASKS_PER_GRAPH`,
 * `absoluteMaxIterations`). Invalid or out-of-range values are omitted rather than throwing.
 *
 * @param raw - Raw untyped input object (typically from `mj.config.cjs` `limits` or parsed JSON).
 * @returns Normalized {@link MJLimitsOverride} containing only valid fields.
 */
export function NormalizeLimitsInput(raw: unknown): MJLimitsOverride {
    if (!IsPlainObject(raw)) {
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
    };
}

function extractTierValue(layer: MJLimitsOverride, key: LimitsKeyPath): LimitsScalarValue | undefined {
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
    enforcePolicyCeiling: boolean,
): LimitsKeyProvenance {
    const codeFallbackBase = extractTierValue(defaults, key) ?? null;
    const tierValues: Partial<Record<LimitsSourceTier, LimitsScalarValue>> = {
        CodeFallback: codeFallbackBase,
    };
    let winningValue: LimitsScalarValue = codeFallbackBase;
    let sourceTier: LimitsSourceTier = 'CodeFallback';

    for (const tier of LIMITS_TIER_PRECEDENCE) {
        const layer = tiers[tier];
        if (!layer) {
            continue;
        }
        const candidate = extractTierValue(layer, key);
        if (candidate !== undefined) {
            tierValues[tier] = candidate;
            winningValue = candidate;
            sourceTier = tier;
        }
    }

    let wasClamped = false;
    if (enforcePolicyCeiling && sourceTier === 'RunOverride') {
        const policyVal = tierValues.UserAgentPolicy;
        if (shouldClampToPolicyCeiling(key, winningValue, policyVal)) {
            winningValue = policyVal;
            sourceTier = 'UserAgentPolicy';
            wasClamped = true;
        }
    }

    return {
        Key: key,
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
    ];
    for (const [key, val] of positiveIntChecks) {
        if (!Number.isFinite(val) || val < 1) {
            issues.push({ Key: key, Message: `${key} must be a positive number >= 1.` });
        }
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
    public RegisterMjConfigLimits(limits: MJLimitsOverride | Record<string, unknown> | null): void {
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
        const enforceCeiling = options.EnforceUserPolicyAsCeiling === true;

        for (const key of LIMITS_KEY_PATHS) {
            const keyProvenance = resolveSingleKey(key, defaults, tiers, enforceCeiling);
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
