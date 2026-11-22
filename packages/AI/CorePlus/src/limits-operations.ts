/**
 * @fileoverview Shared strongly-typed Remote Operation contracts and client-callable
 * `BaseRemotableOperation` shells for MemberJunction Execution Limits, Budget Utilization,
 * Progress Diagnostics, and Paused-Run Resume controls.
 *
 * Server implementations live in `@memberjunction/ai-agents` (`LimitsOperations.ts`) and
 * register via `@RegisterClass(BaseRemotableOperation, 'Limits.*')`. Keeping the typed
 * contracts and base operation shells in `@memberjunction/ai-core-plus` allows both server
 * code and browser Angular dashboards (`@memberjunction/ng-dashboards`) to share one
 * zero-`any` typed surface without introducing server dependencies into the browser bundle.
 *
 * @module @memberjunction/ai-core-plus
 */

import {
    BaseRemotableOperation,
    type LimitsKeyPath,
    type LimitsKeyProvenance,
    type LimitsSourceTier,
    type MJLimitsBudgetsConfig,
    type MJLimitsConfig,
    type MJLimitsOverride,
} from '@memberjunction/core';
import type {
    BudgetExtensionGrant,
    FastJudgeDiagnosticEntry,
    ProgressClassification,
    RunawayPauseReason,
} from './runaway-governance';
import type { LimitsDiagnosticsSnapshot } from './limits-diagnostics';

/** Canonical Remote Operation key for querying limits diagnostics and active/paused runs. */
export const LIMITS_GET_DIAGNOSTICS_OPERATION_KEY = 'Limits.GetDiagnostics' as const;

/** Canonical Remote Operation key for approving and resuming a paused agent run. */
export const LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY = 'Limits.ResumePausedRun' as const;

/** Canonical Remote Operation key for non-destructively pausing an active running agent run. */
export const LIMITS_PAUSE_RUN_OPERATION_KEY = 'Limits.PauseRun' as const;

/** Logical configuration category for grouping limits keys in diagnostics UIs. */
export type LimitsConfigCategory =
    | 'Backstops'
    | 'Briefing'
    | 'Budgets'
    | 'ProgressDetector'
    | 'ResourceGuards'
    | 'Tuning';

/** Input payload for `Limits.GetDiagnostics`. */
export interface LimitsGetDiagnosticsInput {
    /** Optional `MJ: AI Agents.ID` to include Tier 3 (`AgentOrWorkflowMetadata`) resolution. */
    AgentID?: string;
    /** Optional `MJ: Users.ID` to include Tier 4 (`UserAgentPolicy`) resolution and user daily ledger. */
    UserID?: string;
    /** Optional Tier 5 (`RunOverride`) preview layer. */
    RunOverride?: MJLimitsOverride;
    /** Maximum recent/active agent runs to inspect (bounded cleanly server-side). */
    MaxRuns?: number;
}

/** Descriptor for one of the 9 approved backstop / Briefing ceiling keys. */
export interface LimitsBackstopDescriptor {
    Key: LimitsKeyPath;
    Label: string;
    Category: 'Backstops' | 'Briefing';
    Unit: 'turns' | 'wakes/hr' | 'iterations' | 'nodes' | 'ms' | 'chars';
    EffectiveValue: number;
    ApprovedDefaultValue: number;
    SourceTier: LimitsSourceTier;
    IsOverridden: boolean;
    Description: string;
}

/** Summary of active budget utilization against resolved ceilings across the 3 scopes. */
export interface LimitsBudgetScopeUtilization {
    Scope: 'PerRun' | 'PerRoutine' | 'PerUserPerDay';
    Label: string;
    MaxCostUsd: number | null;
    ObservedCostUsd: number;
    CostUtilizationPct: number | null;
    MaxWallClockMs: number | null;
    ObservedWallClockMs: number;
    WallClockUtilizationPct: number | null;
    Note: string;
}

/** Combined budget utilization summary returned by `Limits.GetDiagnostics`. */
export interface LimitsBudgetUtilizationSummary {
    ActiveRunCount: number;
    PausedRunCount: number;
    InspectedRunCount: number;
    TotalObservedCostUsd: number;
    TotalObservedTokens: number;
    CountPausedTimeTowardsWallClock: boolean;
    AllowedInFlightOvershootUsd: number;
    AllowedInFlightOvershootMs: number;
    DayBoundaryTimezone: string;
    Scopes: LimitsBudgetScopeUtilization[];
}

/** Diagnostic summary for a single active, paused, or recent agent run. */
export interface LimitsActiveRunDiagnosticSummary {
    AgentRunID: string;
    AgentID: string | null;
    AgentName: string;
    UserID: string | null;
    UserName: string;
    Status: string;
    StartedAtISO: string | null;
    CompletedAtISO: string | null;
    TotalCostUsd: number;
    TotalTokensUsed: number;
    TotalPromptIterations: number;
    HasLimitsSnapshot: boolean;
    OverriddenKeyCount: number;
    ClampedKeyCount: number;
    Snapshot: LimitsDiagnosticsSnapshot | null;
    ProgressClassification: ProgressClassification | null;
    ProgressScore: number | null;
    ProgressReason: string | null;
    FastJudgeEntries: FastJudgeDiagnosticEntry[];
    IsPausedWithCheckpoint: boolean;
    CheckpointID: string | null;
    PauseReason: RunawayPauseReason | null;
    PausedAtISO: string | null;
    PauseSummary: string | null;
    CompletedStepCount: number;
    CompletedPromptTurns: number;
    HumanApprovalStatus: 'Pending' | 'Approved' | 'Rejected' | null;
    CumulativeRunCostUsd: number;
    CumulativeRunWallClockMs: number;
}

/** Tier provenance summary counts for visualizing active overrides across the 5 tiers. */
export interface LimitsTierSummary {
    Tier: LimitsSourceTier;
    Rank: number;
    Description: string;
    WinningKeyCount: number;
    SuppliedKeyCount: number;
}

/** Output payload for `Limits.GetDiagnostics`. */
export interface LimitsGetDiagnosticsOutput {
    ResolvedAtISO: string;
    TierPrecedence: readonly LimitsSourceTier[];
    TierSummaries: LimitsTierSummary[];
    ResolvedLimits: MJLimitsConfig;
    Provenance: Record<LimitsKeyPath, LimitsKeyProvenance>;
    OverriddenKeys: LimitsKeyPath[];
    ClampedKeys: LimitsKeyPath[];
    ApprovedBackstops: LimitsBackstopDescriptor[];
    BudgetUtilization: LimitsBudgetUtilizationSummary;
    ActiveAndRecentRuns: LimitsActiveRunDiagnosticSummary[];
    PausedRuns: LimitsActiveRunDiagnosticSummary[];
}

/** Input payload for `Limits.ResumePausedRun`. */
export interface LimitsResumePausedRunInput {
    AgentRunID: string;
    BudgetExtension?: BudgetExtensionGrant;
    DecisionNotes?: string | null;
    /** When true (default), transitions status back to `Running` via `PrepareResumeFromCheckpoint`. */
    PrepareResume?: boolean;
}

/** Output payload for `Limits.ResumePausedRun`. */
export interface LimitsResumePausedRunOutput {
    Success: boolean;
    AgentRunID: string;
    Status: string;
    CheckpointID: string;
    ApprovalStatus: 'Pending' | 'Approved' | 'Rejected';
    ExtendedBudgets: MJLimitsBudgetsConfig | null;
    PriorCumulativeCostUsd: number;
    PriorCumulativeActiveWallClockMs: number;
    StartingStepCount: number;
    StartingPromptTurns: number;
    Message: string;
}

/** Input payload for `Limits.PauseRun`. */
export interface LimitsPauseRunInput {
    AgentRunID: string;
    Summary?: string;
}

/** Output payload for `Limits.PauseRun`. */
export interface LimitsPauseRunOutput {
    Success: boolean;
    AgentRunID: string;
    Status: string;
    CheckpointID: string | null;
    Message: string;
}

/**
 * Client-callable base class for `Limits.GetDiagnostics`.
 * Server subclass registers `@RegisterClass(BaseRemotableOperation, 'Limits.GetDiagnostics')`.
 */
export class LimitsGetDiagnosticsOperation extends BaseRemotableOperation<
    LimitsGetDiagnosticsInput,
    LimitsGetDiagnosticsOutput
> {
    public readonly OperationKey = LIMITS_GET_DIAGNOSTICS_OPERATION_KEY;
    public readonly RequiredScope = 'limits:read';
    public readonly ExposeAsAgentTool = true;
    public readonly ExposeAsMCPTool = true;
    public readonly ToolDescription =
        'Queries resolved 5-tier execution limits, approved backstops, tier provenance, budget utilization, deterministic progress signals, fast judge diagnostics, and paused runs.';
    public readonly ToolInputSchema = {
        type: 'object',
        properties: {
            AgentID: { type: 'string', description: 'Optional MJ: AI Agents ID for Tier 3 resolution' },
            UserID: { type: 'string', description: 'Optional MJ: Users ID for Tier 4 policy resolution' },
            MaxRuns: { type: 'number', description: 'Maximum recent/active runs to inspect (default 25)' },
        },
    };
}

/**
 * Client-callable base class for `Limits.ResumePausedRun`.
 * Server subclass registers `@RegisterClass(BaseRemotableOperation, 'Limits.ResumePausedRun')`.
 */
export class LimitsResumePausedRunOperation extends BaseRemotableOperation<
    LimitsResumePausedRunInput,
    LimitsResumePausedRunOutput
> {
    public readonly OperationKey = LIMITS_RESUME_PAUSED_RUN_OPERATION_KEY;
    public readonly RequiredScope = 'limits:write';
    public readonly ExposeAsAgentTool = false;
    public readonly ExposeAsMCPTool = false;

    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }
}

/**
 * Client-callable base class for `Limits.PauseRun`.
 * Server subclass registers `@RegisterClass(BaseRemotableOperation, 'Limits.PauseRun')`.
 */
export class LimitsPauseRunOperation extends BaseRemotableOperation<
    LimitsPauseRunInput,
    LimitsPauseRunOutput
> {
    public readonly OperationKey = LIMITS_PAUSE_RUN_OPERATION_KEY;
    public readonly RequiredScope = 'limits:write';
    public readonly ExposeAsAgentTool = false;
    public readonly ExposeAsMCPTool = false;

    public override get DisallowMagicLinkScope(): boolean {
        return true;
    }
}
