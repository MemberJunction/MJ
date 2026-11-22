/**
 * @fileoverview Strongly-typed runaway governance contracts and persisted checkpoint
 * helpers shared across `@memberjunction/ai-core-plus` and `@memberjunction/ai-agents`.
 *
 * Covers:
 * - Multi-scope dollar (USD) and wall-clock budget enforcement (`PerRun`, `PerRoutine`, `PerUserPerDay`)
 * - Deterministic 6-signal sliding-window progress detection (`Converging`, `Stalled`, `Ambiguous`)
 * - Bounded sub-200ms fast convergence judge diagnostics
 * - Non-destructive run pause, persisted checkpoint state, owner notification, and human-approved resume
 *
 * @module @memberjunction/ai-core-plus
 */

import { IsPlainObject, SafeJSONParse } from '@memberjunction/global';
import type { ChatMessage } from '@memberjunction/ai';
import type { ScratchpadSnapshot } from './agent-scratchpad';
import type { ForEachOperation, LoopBodyActionStep } from './foreach-operation';
import type { WhileOperation } from './while-operation';
import type { AgentResponseForm } from './response-forms';
import type { MJAIAgentRunEntityExtended } from './MJAIAgentRunEntityExtended';

/** Schema version tag embedded in every persisted {@link RunawayCheckpointState}. */
export const RUNAWAY_CHECKPOINT_SCHEMA_VERSION = 'mj-runaway-checkpoint/v1' as const;

/** Reserved property key under `AIAgentRun.Data` JSON where the resumable checkpoint lives. */
export const RUNAWAY_CHECKPOINT_DATA_KEY = '__runawayCheckpoint' as const;

/** Reserved property key under `AIAgentRun.Data` JSON where progress & fast-judge diagnostics live. */
export const PROGRESS_DIAGNOSTICS_DATA_KEY = '__progressDiagnostics' as const;

/** JSON-compatible scalar value used for strongly-typed checkpoint payloads. */
export type RunawayJsonScalar = string | number | boolean | null;

/** JSON-compatible recursive value used for strongly-typed checkpoint payloads. */
export type RunawayJsonValue =
    | RunawayJsonScalar
    | RunawayJsonValue[]
    | { [key: string]: RunawayJsonValue };

/** JSON-compatible object used for strongly-typed checkpoint payloads. */
export type RunawayJsonObject = { [key: string]: RunawayJsonValue };

/** Serializable runtime input accepted by {@link ToRunawayJsonValue} without `any` or `unknown`. */
export type RunawaySerializable =
    | RunawayJsonValue
    | Date
    | object
    | undefined
    | readonly RunawaySerializable[];

/** The three hierarchical budget scopes enforced by `BudgetEnforcementGuard`. */
export type BudgetScope = 'PerRun' | 'PerRoutine' | 'PerUserPerDay';

/** The measurable budget dimensions enforced across scopes. */
export type BudgetDimension = 'CostUsd' | 'WallClockMs' | 'Tokens';

/** Ordered list of all 6 required budget scope-dimension pairs. */
export const REQUIRED_BUDGET_SCOPE_DIMENSIONS: ReadonlyArray<{
    Scope: BudgetScope;
    Dimension: Exclude<BudgetDimension, 'Tokens'>;
}> = [
    { Scope: 'PerRun', Dimension: 'CostUsd' },
    { Scope: 'PerRun', Dimension: 'WallClockMs' },
    { Scope: 'PerRoutine', Dimension: 'CostUsd' },
    { Scope: 'PerRoutine', Dimension: 'WallClockMs' },
    { Scope: 'PerUserPerDay', Dimension: 'CostUsd' },
    { Scope: 'PerUserPerDay', Dimension: 'WallClockMs' },
] as const;

/** Structured details describing a breached budget scope and dimension. */
export interface BudgetBreachDetail {
    Scope: BudgetScope;
    Dimension: BudgetDimension;
    Limit: number;
    OvershootAllowed: number;
    EffectiveLimit: number;
    Current: number;
    Reason: string;
}

/** A single pause/resume interval recorded for wall-clock accounting. */
export interface BudgetPausedInterval {
    PausedAtMs: number;
    ResumedAtMs?: number | null;
}

/** Cumulative dollar, active wall-clock, and token ledger across pause/resume boundaries. */
export interface CumulativeBudgetLedger {
    RunCostUsd: number;
    RunWallClockMs: number;
    RunTokens: number;
    RoutineCostUsd: number;
    RoutineWallClockMs: number;
    UserDailyCostUsd: number;
    UserDailyWallClockMs: number;
    PausedWallClockMs: number;
    PausedIntervals: BudgetPausedInterval[];
    DayBucketUTC: string;
    DayBoundaryTimezone: string;
    /** Prior-day cost already reflected in historical baseline before today's UTC boundary (CR-20). */
    PriorDayCostBaselineUsd?: number;
    /** Prior-day active wall-clock ms already reflected before today's UTC boundary (CR-20). */
    PriorDayWallClockBaselineMs?: number;
    AsOfISO: string;
}

/** Per-scope budget status summary returned by `BudgetEnforcementGuard`. */
export interface BudgetScopeStatus {
    Scope: BudgetScope;
    CostUsd: number;
    MaxCostUsd: number | null;
    CostExceeded: boolean;
    WallClockMs: number;
    MaxWallClockMs: number | null;
    WallClockExceeded: boolean;
}

/** Full result of evaluating all budget scopes and dimensions. */
export interface BudgetEnforcementResult {
    Exceeded: boolean;
    LedgerUnavailable?: boolean;
    LedgerError?: string;
    Breach?: BudgetBreachDetail;
    Ledger: CumulativeBudgetLedger;
    ScopeStatuses: Record<BudgetScope, BudgetScopeStatus>;
}

/** Deterministic sliding-window progress classification. */
export type ProgressClassification = 'Converging' | 'Stalled' | 'Ambiguous';

/** Quantitative breakdown of all 6 deterministic progress signals over a window. */
export interface ProgressSignalsBreakdown {
    /** Signal 1: total records created or changed in the sliding window. */
    RecordsCreatedOrChangedTotal: number;
    /** Signal 1: records created or changed per iteration in the window. */
    RecordsCreatedOrChangedRate: number;
    /** Signal 2: total tasks closed/completed in the sliding window. */
    TasksClosedTotal: number;
    /** Signal 2: tasks closed per iteration in the window. */
    TasksClosedRate: number;
    /** Signal 3: count of distinct outputs in the sliding window. */
    DistinctOutputsCount: number;
    /** Signal 3: fraction (`0..1`) of distinct outputs over the window. */
    DistinctOutputRatio: number;
    /** Signal 4: n-gram or embedding cosine similarity (`0..1`) over the last k outputs (1 = identical). */
    RepeatedTextSimilarity: number;
    /** Signal 5: total tokens spent across the sliding window. */
    TokensSpentTotal: number;
    /** Signal 5: total unit progress produced across the sliding window. */
    ProgressUnitsTotal: number;
    /** Signal 5: tokens spent per unit of progress (`Infinity` when tokens > 0 and progress == 0). */
    TokensPerProgressUnit: number;
    /** Signal 5: normalized efficiency score (`0..1`, higher is better). */
    TokenEfficiencyScore: number;
    /** Signal 6: variance of output lengths across the window. */
    OutputLengthVariance: number;
    /** Signal 6: net heap memory change in bytes across the window. */
    HeapDeltaBytes: number;
    /** Signal 6: normalized heap growth ratio across the window. */
    HeapGrowthRatio: number;
    /** Signal 6: normalized variance health score (`0..1`, higher is healthier). */
    VarianceHealthScore: number;
    /** Auxiliary: duplicate step signature ratio (`0..1`) in the window. */
    DuplicateStepRatio: number;
    /** Auxiliary: trailing consecutive iterations with zero payload delta and zero hard progress. */
    ZeroPayloadDeltaStreak: number;
    /** Auxiliary: trailing consecutive identical error signatures. */
    RepeatingErrorStreak: number;
}

/** Result of the bounded sub-200ms `FastConvergenceJudge`. */
export interface FastConvergenceJudgeResult {
    Converging: boolean;
    Reason: string;
    LatencyMs: number;
    TimedOut: boolean;
    UsedFallback: boolean;
    Source: 'Model' | 'Fallback' | 'Error';
}

/** Full progress detector evaluation result (optionally enriched with fast judge output). */
export interface ProgressEvaluationResult {
    Checked: boolean;
    WindowSize: number;
    SampleCount: number;
    Classification: ProgressClassification;
    ProgressScore: number;
    Reason: string;
    Signals: ProgressSignalsBreakdown;
    FastJudgeInvoked: boolean;
    FastJudgeResult?: FastConvergenceJudgeResult;
}

/** Diagnostic entry logged onto run diagnostics whenever `FastConvergenceJudge` runs. */
export interface FastJudgeDiagnosticEntry {
    TimestampISO: string;
    Iteration: number;
    Converging: boolean;
    Reason: string;
    LatencyMs: number;
    TimedOut: boolean;
    UsedFallback: boolean;
    Source: FastConvergenceJudgeResult['Source'];
}

/** Aggregated progress diagnostics persisted under `AIAgentRun.Data.__progressDiagnostics`. */
export interface RunProgressDiagnostics {
    LastClassification: ProgressClassification;
    LastScore: number;
    LastReason: string;
    UpdatedAtISO: string;
    FastJudgeEntries: FastJudgeDiagnosticEntry[];
}

/** Why a run was non-destructively paused by runaway governance. */
export type RunawayPauseReason =
    | 'BudgetExceeded'
    | 'ProgressStalled'
    | 'FastJudgeStalled'
    | 'LedgerUnavailable'
    | 'ManualPause';

/** Persisted pending action entry preserved inside {@link PendingStepDecision}. */
export interface PendingActionDecision {
    name: string;
    params: RunawayJsonObject;
    instruction?: string;
}

/** Persisted pending sub-agent invocation preserved inside {@link PendingStepDecision}. */
export interface PendingSubAgentDecision {
    name: string;
    message: string;
    templateParameters?: RunawayJsonObject;
    terminateAfter?: boolean;
}

/** Persisted cursor state for inline `ForEach` / `While` loop resumption across pause boundaries. */
export interface PendingLoopCursorState {
    LoopType: 'ForEach' | 'While';
    ParentStepID: string | null;
    IterationIndex: number;
    CompletedItemResults: RunawayJsonValue[];
    WorkingPayload: RunawayJsonValue;
    DelayBetweenIterationsMs?: number;
    ContinueOnError?: boolean;
}

/** Full structured pending step decision persisted for deterministic zero-replay resumption. */
export interface PendingStepDecision {
    step: string;
    terminate: boolean;
    previousPayload?: RunawayJsonValue;
    newPayload?: RunawayJsonValue;
    message?: string;
    errorMessage?: string;
    retryReason?: string;
    retryInstructions?: string;
    reasoning?: string;
    actions?: PendingActionDecision[];
    subAgent?: PendingSubAgentDecision;
    subAgents?: PendingSubAgentDecision[];
    forEach?: ForEachOperation;
    while?: WhileOperation;
    priorStepResult?: RunawayJsonValue;
    payloadChangeRequest?: RunawayJsonObject;
    LoopCursor?: PendingLoopCursorState;
}

/** Lightweight summary of a completed step retained inside a persisted checkpoint. */
export interface CheckpointStepSummary {
    StepNumber: number;
    StepType: string;
    StepName: string;
    Status: string;
    Success: boolean | null;
    CompletedAtISO?: string | null;
}

/** Structured evidence explaining why the run paused. */
export interface RunawayPauseEvidence {
    BudgetBreach?: BudgetBreachDetail;
    ProgressEvaluation?: ProgressEvaluationResult;
    FastJudgeResult?: FastConvergenceJudgeResult;
    RecentStepSummaries: CheckpointStepSummary[];
}

/** Budget extension granted by a human approver when resuming a paused run. */
export interface BudgetExtensionGrant {
    AdditionalCostUsd?: number;
    AdditionalWallClockMs?: number;
    AdditionalTokens?: number;
    NewPerRunMaxCostUsd?: number | null;
    NewPerRunMaxWallClockMs?: number | null;
    NewPerRoutineMaxCostUsd?: number | null;
    NewPerRoutineMaxWallClockMs?: number | null;
    NewPerUserDailyMaxCostUsd?: number | null;
    NewPerUserDailyMaxWallClockMs?: number | null;
    ResetProgressDetectorWindow?: boolean;
}

/** Human approval record attached to a paused checkpoint prior to resume. */
export interface HumanResumeApproval {
    Status: 'Pending' | 'Approved' | 'Rejected';
    ApprovedByUserID?: string | null;
    ApprovedAtISO?: string | null;
    ApprovalRequestID?: string | null;
    OwnerNotificationID?: string | null;
    DecisionNotes?: string | null;
    BudgetExtension?: BudgetExtensionGrant;
}

/** Serialized checkpoint conversation message preserving turn history without re-execution. */
export interface CheckpointMessageRecord {
    Role: ChatMessage['role'];
    Content: string;
}

/** Complete, persisted, non-destructive resumable checkpoint for a paused agent run. */
export interface RunawayCheckpointState {
    SchemaVersion: typeof RUNAWAY_CHECKPOINT_SCHEMA_VERSION;
    CheckpointID: string;
    AgentRunID: string;
    AgentID: string;
    AgentName: string;
    UserID: string | null;
    RoutineID: string | null;
    PausedAtISO: string;
    PausedAtMs: number;
    PauseReason: RunawayPauseReason;
    Summary: string;
    CompletedStepCount: number;
    CompletedStepIDs: string[];
    CompletedPromptTurns: number;
    CompletedNodeIDs: string[];
    ConversationMessages: CheckpointMessageRecord[];
    InFlightPayload: RunawayJsonValue;
    Scratchpad: ScratchpadSnapshot;
    NextStepSummary: string | null;
    PendingStepDecision?: PendingStepDecision | null;
    LoopCursor?: PendingLoopCursorState | null;
    Evidence: RunawayPauseEvidence;
    CumulativeLedger: CumulativeBudgetLedger;
    HumanApproval: HumanResumeApproval;
}

/** Structured payload emitted to notify the run owner when a run pauses for approval. */
export interface OwnerPauseNotificationPayload {
    RecipientUserID: string | null;
    Title: string;
    Message: string;
    AgentRunID: string;
    AgentID: string;
    AgentName: string;
    CheckpointID: string;
    PauseReason: RunawayPauseReason;
    EvidenceSummary: string;
    CumulativeLedger: CumulativeBudgetLedger;
    ApprovalForm: AgentResponseForm;
    ResourceConfiguration: RunawayJsonObject;
}

/** Target structural subset of `MJAIAgentRunEntityExtended` for checkpoint attachment/extraction. */
export type AgentRunCheckpointTarget = Pick<MJAIAgentRunEntityExtended, 'Data' | 'RunawayCheckpoint'>;

/** Target structural subset of `MJAIAgentRunEntityExtended` for progress diagnostics. */
export type AgentRunProgressDiagnosticsTarget = Pick<MJAIAgentRunEntityExtended, 'Data'>;

function isRunawayObject(value: RunawayJsonValue | undefined): value is RunawayJsonObject {
    return IsPlainObject(value);
}

/**
 * Safely converts an arbitrary runtime value into a JSON-compatible {@link RunawayJsonValue}
 * without using `any` or unsafe casts.
 */
export function ToRunawayJsonValue(value: RunawaySerializable): RunawayJsonValue {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map((item) => ToRunawayJsonValue(item as RunawaySerializable));
    }
    if (typeof value === 'object') {
        const serialized = SafeJSONParse<RunawayJsonValue>(JSON.stringify(value));
        return serialized !== null ? serialized : null;
    }
    return String(value);
}

function isBudgetScope(value: RunawayJsonValue | undefined): value is BudgetScope {
    return value === 'PerRun' || value === 'PerRoutine' || value === 'PerUserPerDay';
}

function isBudgetDimension(value: RunawayJsonValue | undefined): value is BudgetDimension {
    return value === 'CostUsd' || value === 'WallClockMs' || value === 'Tokens';
}

function isProgressClassification(value: RunawayJsonValue | undefined): value is ProgressClassification {
    return value === 'Converging' || value === 'Stalled' || value === 'Ambiguous';
}

function isRunawayPauseReason(value: RunawayJsonValue | undefined): value is RunawayPauseReason {
    return (
        value === 'BudgetExceeded' ||
        value === 'ProgressStalled' ||
        value === 'FastJudgeStalled' ||
        value === 'LedgerUnavailable' ||
        value === 'ManualPause'
    );
}

function parsePausedIntervals(raw: RunawayJsonValue | undefined): BudgetPausedInterval[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const intervals: BudgetPausedInterval[] = [];
    for (const item of raw) {
        if (isRunawayObject(item) && typeof item['PausedAtMs'] === 'number') {
            intervals.push({
                PausedAtMs: item['PausedAtMs'],
                ResumedAtMs: typeof item['ResumedAtMs'] === 'number' ? item['ResumedAtMs'] : null,
            });
        }
    }
    return intervals;
}

function parseCumulativeBudgetLedger(raw: RunawayJsonValue | undefined): CumulativeBudgetLedger | null {
    if (!isRunawayObject(raw)) {
        return null;
    }
    return {
        RunCostUsd: typeof raw['RunCostUsd'] === 'number' ? raw['RunCostUsd'] : 0,
        RunWallClockMs: typeof raw['RunWallClockMs'] === 'number' ? raw['RunWallClockMs'] : 0,
        RunTokens: typeof raw['RunTokens'] === 'number' ? raw['RunTokens'] : 0,
        RoutineCostUsd: typeof raw['RoutineCostUsd'] === 'number' ? raw['RoutineCostUsd'] : 0,
        RoutineWallClockMs: typeof raw['RoutineWallClockMs'] === 'number' ? raw['RoutineWallClockMs'] : 0,
        UserDailyCostUsd: typeof raw['UserDailyCostUsd'] === 'number' ? raw['UserDailyCostUsd'] : 0,
        UserDailyWallClockMs: typeof raw['UserDailyWallClockMs'] === 'number' ? raw['UserDailyWallClockMs'] : 0,
        PausedWallClockMs: typeof raw['PausedWallClockMs'] === 'number' ? raw['PausedWallClockMs'] : 0,
        PausedIntervals: parsePausedIntervals(raw['PausedIntervals']),
        DayBucketUTC: typeof raw['DayBucketUTC'] === 'string' ? raw['DayBucketUTC'] : '',
        DayBoundaryTimezone: typeof raw['DayBoundaryTimezone'] === 'string' ? raw['DayBoundaryTimezone'] : 'UTC',
        ...(typeof raw['PriorDayCostBaselineUsd'] === 'number' && Number.isFinite(raw['PriorDayCostBaselineUsd'])
            ? { PriorDayCostBaselineUsd: raw['PriorDayCostBaselineUsd'] }
            : {}),
        ...(typeof raw['PriorDayWallClockBaselineMs'] === 'number' && Number.isFinite(raw['PriorDayWallClockBaselineMs'])
            ? { PriorDayWallClockBaselineMs: raw['PriorDayWallClockBaselineMs'] }
            : {}),
        AsOfISO: typeof raw['AsOfISO'] === 'string' ? raw['AsOfISO'] : new Date(0).toISOString(),
    };
}

function readNullableNumber(val: RunawayJsonValue | undefined): number | null | undefined {
    if (val === null) return null;
    return typeof val === 'number' ? val : undefined;
}

function parseBudgetExtensionGrant(raw: RunawayJsonValue | undefined): BudgetExtensionGrant | undefined {
    if (!isRunawayObject(raw)) {
        return undefined;
    }
    const out: BudgetExtensionGrant = {};
    if (typeof raw['AdditionalCostUsd'] === 'number') out.AdditionalCostUsd = raw['AdditionalCostUsd'];
    if (typeof raw['AdditionalWallClockMs'] === 'number') out.AdditionalWallClockMs = raw['AdditionalWallClockMs'];
    if (typeof raw['AdditionalTokens'] === 'number') out.AdditionalTokens = raw['AdditionalTokens'];
    const perRunCost = readNullableNumber(raw['NewPerRunMaxCostUsd']);
    if (perRunCost !== undefined) out.NewPerRunMaxCostUsd = perRunCost;
    const perRunWall = readNullableNumber(raw['NewPerRunMaxWallClockMs']);
    if (perRunWall !== undefined) out.NewPerRunMaxWallClockMs = perRunWall;
    const perRoutineCost = readNullableNumber(raw['NewPerRoutineMaxCostUsd']);
    if (perRoutineCost !== undefined) out.NewPerRoutineMaxCostUsd = perRoutineCost;
    const perRoutineWall = readNullableNumber(raw['NewPerRoutineMaxWallClockMs']);
    if (perRoutineWall !== undefined) out.NewPerRoutineMaxWallClockMs = perRoutineWall;
    const perUserCost = readNullableNumber(raw['NewPerUserDailyMaxCostUsd']);
    if (perUserCost !== undefined) out.NewPerUserDailyMaxCostUsd = perUserCost;
    const perUserWall = readNullableNumber(raw['NewPerUserDailyMaxWallClockMs']);
    if (perUserWall !== undefined) out.NewPerUserDailyMaxWallClockMs = perUserWall;
    if (typeof raw['ResetProgressDetectorWindow'] === 'boolean') out.ResetProgressDetectorWindow = raw['ResetProgressDetectorWindow'];
    return out;
}

function parseHumanResumeApproval(raw: RunawayJsonValue | undefined): HumanResumeApproval | null {
    if (!isRunawayObject(raw)) {
        return null;
    }
    const rawStatus = raw['Status'];
    const status: HumanResumeApproval['Status'] =
        rawStatus === 'Approved' || rawStatus === 'Rejected' || rawStatus === 'Pending'
            ? rawStatus
            : 'Pending';
    return {
        Status: status,
        ApprovedByUserID: typeof raw['ApprovedByUserID'] === 'string' ? raw['ApprovedByUserID'] : null,
        ApprovedAtISO: typeof raw['ApprovedAtISO'] === 'string' ? raw['ApprovedAtISO'] : null,
        ApprovalRequestID: typeof raw['ApprovalRequestID'] === 'string' ? raw['ApprovalRequestID'] : null,
        OwnerNotificationID: typeof raw['OwnerNotificationID'] === 'string' ? raw['OwnerNotificationID'] : null,
        DecisionNotes: typeof raw['DecisionNotes'] === 'string' ? raw['DecisionNotes'] : null,
        BudgetExtension: parseBudgetExtensionGrant(raw['BudgetExtension']),
    };
}

function parseStringArray(raw: RunawayJsonValue | undefined): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.filter((item): item is string => typeof item === 'string');
}

function isChatMessageRole(role: RunawayJsonValue | undefined): role is ChatMessage['role'] {
    return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool';
}

function parseCheckpointMessages(raw: RunawayJsonValue | undefined): CheckpointMessageRecord[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const messages: CheckpointMessageRecord[] = [];
    for (const item of raw) {
        if (isRunawayObject(item) && isChatMessageRole(item['Role']) && typeof item['Content'] === 'string') {
            messages.push({ Role: item['Role'], Content: item['Content'] });
        }
    }
    return messages;
}

function parseScratchpadSnapshot(raw: RunawayJsonValue | undefined): ScratchpadSnapshot {
    if (!isRunawayObject(raw)) {
        return { notes: '', tasks: [] };
    }
    const notes = typeof raw['notes'] === 'string' ? raw['notes'] : '';
    const tasks: ScratchpadSnapshot['tasks'] = [];
    if (Array.isArray(raw['tasks'])) {
        for (const t of raw['tasks']) {
            if (isRunawayObject(t) && typeof t['id'] === 'string' && typeof t['title'] === 'string') {
                const status = t['status'];
                const normalizedStatus: ScratchpadSnapshot['tasks'][number]['status'] =
                    status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'blocked'
                        ? status
                        : 'pending';
                tasks.push({
                    id: t['id'],
                    title: t['title'],
                    status: normalizedStatus,
                    ...(typeof t['notes'] === 'string' ? { notes: t['notes'] } : {}),
                });
            }
        }
    }
    return { notes, tasks };
}

function parseLoopCursorState(raw: RunawayJsonValue | undefined): PendingLoopCursorState | null {
    if (!isRunawayObject(raw)) {
        return null;
    }
    const loopType = raw['LoopType'];
    if (loopType !== 'ForEach' && loopType !== 'While') {
        return null;
    }
    const indexVal = raw['IterationIndex'];
    const completedRaw = raw['CompletedItemResults'];
    return {
        LoopType: loopType,
        ParentStepID: typeof raw['ParentStepID'] === 'string' ? raw['ParentStepID'] : null,
        IterationIndex: typeof indexVal === 'number' && Number.isFinite(indexVal) ? Math.max(0, Math.trunc(indexVal)) : 0,
        CompletedItemResults: Array.isArray(completedRaw) ? completedRaw.map((item) => ToRunawayJsonValue(item)) : [],
        WorkingPayload: ToRunawayJsonValue(raw['WorkingPayload']),
        ...(typeof raw['DelayBetweenIterationsMs'] === 'number' ? { DelayBetweenIterationsMs: raw['DelayBetweenIterationsMs'] } : {}),
        ...(typeof raw['ContinueOnError'] === 'boolean' ? { ContinueOnError: raw['ContinueOnError'] } : {}),
    };
}

function parsePendingActionDecisions(raw: RunawayJsonValue | undefined): PendingActionDecision[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const out: PendingActionDecision[] = [];
    for (const item of raw) {
        if (isRunawayObject(item) && typeof item['name'] === 'string') {
            out.push({
                name: item['name'],
                params: isRunawayObject(item['params']) ? item['params'] : {},
                ...(typeof item['instruction'] === 'string' ? { instruction: item['instruction'] } : {}),
            });
        }
    }
    return out;
}

function parsePendingSubAgentDecision(raw: RunawayJsonValue | undefined): PendingSubAgentDecision | undefined {
    if (!isRunawayObject(raw) || typeof raw['name'] !== 'string') {
        return undefined;
    }
    return {
        name: raw['name'],
        message: typeof raw['message'] === 'string' ? raw['message'] : '',
        ...(isRunawayObject(raw['templateParameters']) ? { templateParameters: raw['templateParameters'] } : {}),
        ...(typeof raw['terminateAfter'] === 'boolean' ? { terminateAfter: raw['terminateAfter'] } : {}),
    };
}

function parseStringTemplateParameters(raw: RunawayJsonValue | undefined): Record<string, string> | undefined {
    if (!isRunawayObject(raw)) {
        return undefined;
    }
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof val === 'string') {
            out[key] = val;
        } else if (typeof val === 'number' || typeof val === 'boolean') {
            out[key] = String(val);
        } else if (val !== null && val !== undefined) {
            out[key] = JSON.stringify(val);
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function parseLoopAction(raw: RunawayJsonValue | undefined): ForEachOperation['action'] | undefined {
    if (!isRunawayObject(raw) || typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
        return undefined;
    }
    const rawParams = raw['params'];
    return {
        name: raw['name'],
        params: isRunawayObject(rawParams) ? rawParams : {},
        ...(typeof raw['outputMapping'] === 'string' ? { outputMapping: raw['outputMapping'] } : {}),
    };
}

function parseLoopSteps(raw: RunawayJsonValue | undefined): LoopBodyActionStep[] | undefined {
    if (!Array.isArray(raw)) {
        return undefined;
    }
    const steps: LoopBodyActionStep[] = [];
    for (const item of raw) {
        if (!isRunawayObject(item) || typeof item['name'] !== 'string' || item['name'].trim().length === 0) {
            continue;
        }
        const rawParams = item['params'];
        steps.push({
            ...(typeof item['id'] === 'string' && item['id'].length > 0 ? { id: item['id'] } : {}),
            name: item['name'],
            params: isRunawayObject(rawParams) ? rawParams : {},
            ...(typeof item['condition'] === 'string' ? { condition: item['condition'] } : {}),
            ...(typeof item['outputMapping'] === 'string' ? { outputMapping: item['outputMapping'] } : {}),
        });
    }
    return steps.length > 0 ? steps : undefined;
}

function parseLoopSubAgent(raw: RunawayJsonValue | undefined): ForEachOperation['subAgent'] | undefined {
    if (!isRunawayObject(raw) || typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
        return undefined;
    }
    const templateParameters = parseStringTemplateParameters(raw['templateParameters']);
    const hasContext = Object.prototype.hasOwnProperty.call(raw, 'context') && raw['context'] !== undefined;
    return {
        name: raw['name'],
        message: typeof raw['message'] === 'string' ? raw['message'] : '',
        ...(templateParameters ? { templateParameters } : {}),
        ...(hasContext ? { context: ToRunawayJsonValue(raw['context']) } : {}),
    };
}

function parseLoopPrompt(raw: RunawayJsonValue | undefined): ForEachOperation['prompt'] | undefined {
    if (!isRunawayObject(raw) || typeof raw['name'] !== 'string' || raw['name'].trim().length === 0) {
        return undefined;
    }
    const templateParameters = parseStringTemplateParameters(raw['templateParameters']);
    return {
        name: raw['name'],
        ...(templateParameters ? { templateParameters } : {}),
        ...(typeof raw['outputMapping'] === 'string' ? { outputMapping: raw['outputMapping'] } : {}),
    };
}

function parseForEachOperation(raw: RunawayJsonValue | undefined): ForEachOperation | undefined {
    if (!isRunawayObject(raw) || typeof raw['collectionPath'] !== 'string') {
        return undefined;
    }
    const action = parseLoopAction(raw['action']);
    const steps = parseLoopSteps(raw['steps']);
    const subAgent = parseLoopSubAgent(raw['subAgent']);
    const prompt = parseLoopPrompt(raw['prompt']);
    return {
        collectionPath: raw['collectionPath'],
        ...(typeof raw['itemVariable'] === 'string' ? { itemVariable: raw['itemVariable'] } : {}),
        ...(typeof raw['indexVariable'] === 'string' ? { indexVariable: raw['indexVariable'] } : {}),
        ...(typeof raw['maxIterations'] === 'number' ? { maxIterations: raw['maxIterations'] } : {}),
        ...(typeof raw['continueOnError'] === 'boolean' ? { continueOnError: raw['continueOnError'] } : {}),
        ...(typeof raw['delayBetweenIterationsMs'] === 'number' ? { delayBetweenIterationsMs: raw['delayBetweenIterationsMs'] } : {}),
        ...(raw['executionMode'] === 'sequential' || raw['executionMode'] === 'parallel' ? { executionMode: raw['executionMode'] } : {}),
        ...(typeof raw['maxConcurrency'] === 'number' ? { maxConcurrency: raw['maxConcurrency'] } : {}),
        ...(action ? { action } : {}),
        ...(steps ? { steps } : {}),
        ...(subAgent ? { subAgent } : {}),
        ...(prompt ? { prompt } : {}),
    };
}

function parseWhileOperation(raw: RunawayJsonValue | undefined): WhileOperation | undefined {
    if (!isRunawayObject(raw) || typeof raw['condition'] !== 'string') {
        return undefined;
    }
    const action = parseLoopAction(raw['action']);
    const steps = parseLoopSteps(raw['steps']);
    const subAgent = parseLoopSubAgent(raw['subAgent']);
    const prompt = parseLoopPrompt(raw['prompt']);
    return {
        condition: raw['condition'],
        ...(typeof raw['itemVariable'] === 'string' ? { itemVariable: raw['itemVariable'] } : {}),
        ...(typeof raw['maxIterations'] === 'number' ? { maxIterations: raw['maxIterations'] } : {}),
        ...(typeof raw['continueOnError'] === 'boolean' ? { continueOnError: raw['continueOnError'] } : {}),
        ...(typeof raw['delayBetweenIterationsMs'] === 'number' ? { delayBetweenIterationsMs: raw['delayBetweenIterationsMs'] } : {}),
        ...(action ? { action } : {}),
        ...(steps ? { steps } : {}),
        ...(subAgent ? { subAgent } : {}),
        ...(prompt ? { prompt } : {}),
    };
}

function parsePendingStepDecision(raw: RunawayJsonValue | undefined): PendingStepDecision | null {
    if (!isRunawayObject(raw) || typeof raw['step'] !== 'string') {
        return null;
    }
    const subAgentsRaw = raw['subAgents'];
    let subAgents: PendingSubAgentDecision[] | undefined;
    if (Array.isArray(subAgentsRaw)) {
        const mapped: PendingSubAgentDecision[] = [];
        for (const item of subAgentsRaw) {
            const parsedSub = parsePendingSubAgentDecision(item);
            if (parsedSub) {
                mapped.push(parsedSub);
            }
        }
        subAgents = mapped;
    }
    const parsedForEach = parseForEachOperation(raw['forEach']);
    const parsedWhile = parseWhileOperation(raw['while']);
    return {
        step: raw['step'],
        terminate: raw['terminate'] === true,
        ...(raw['previousPayload'] !== undefined ? { previousPayload: ToRunawayJsonValue(raw['previousPayload']) } : {}),
        ...(raw['newPayload'] !== undefined ? { newPayload: ToRunawayJsonValue(raw['newPayload']) } : {}),
        ...(typeof raw['message'] === 'string' ? { message: raw['message'] } : {}),
        ...(typeof raw['errorMessage'] === 'string' ? { errorMessage: raw['errorMessage'] } : {}),
        ...(typeof raw['retryReason'] === 'string' ? { retryReason: raw['retryReason'] } : {}),
        ...(typeof raw['retryInstructions'] === 'string' ? { retryInstructions: raw['retryInstructions'] } : {}),
        ...(typeof raw['reasoning'] === 'string' ? { reasoning: raw['reasoning'] } : {}),
        ...(parsePendingActionDecisions(raw['actions']) ? { actions: parsePendingActionDecisions(raw['actions']) } : {}),
        ...(parsePendingSubAgentDecision(raw['subAgent']) ? { subAgent: parsePendingSubAgentDecision(raw['subAgent']) } : {}),
        ...(subAgents ? { subAgents } : {}),
        ...(parsedForEach ? { forEach: parsedForEach } : {}),
        ...(parsedWhile ? { while: parsedWhile } : {}),
        ...(raw['priorStepResult'] !== undefined ? { priorStepResult: ToRunawayJsonValue(raw['priorStepResult']) } : {}),
        ...(isRunawayObject(raw['payloadChangeRequest']) ? { payloadChangeRequest: raw['payloadChangeRequest'] } : {}),
        ...(parseLoopCursorState(raw['LoopCursor']) ? { LoopCursor: parseLoopCursorState(raw['LoopCursor'])! } : {}),
    };
}

function parseBudgetBreachDetail(raw: RunawayJsonValue | undefined): BudgetBreachDetail | undefined {
    if (!isRunawayObject(raw) || !isBudgetScope(raw['Scope']) || !isBudgetDimension(raw['Dimension'])) {
        return undefined;
    }
    return {
        Scope: raw['Scope'],
        Dimension: raw['Dimension'],
        Limit: typeof raw['Limit'] === 'number' ? raw['Limit'] : 0,
        OvershootAllowed: typeof raw['OvershootAllowed'] === 'number' ? raw['OvershootAllowed'] : 0,
        EffectiveLimit: typeof raw['EffectiveLimit'] === 'number' ? raw['EffectiveLimit'] : 0,
        Current: typeof raw['Current'] === 'number' ? raw['Current'] : 0,
        Reason: typeof raw['Reason'] === 'string' ? raw['Reason'] : '',
    };
}

function parseCheckpointStepSummaries(raw: RunawayJsonValue | undefined): CheckpointStepSummary[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const summaries: CheckpointStepSummary[] = [];
    for (const item of raw) {
        if (isRunawayObject(item) && typeof item['StepNumber'] === 'number' && typeof item['StepType'] === 'string') {
            summaries.push({
                StepNumber: item['StepNumber'],
                StepType: item['StepType'],
                StepName: typeof item['StepName'] === 'string' ? item['StepName'] : '',
                Status: typeof item['Status'] === 'string' ? item['Status'] : '',
                Success: typeof item['Success'] === 'boolean' ? item['Success'] : null,
                CompletedAtISO: typeof item['CompletedAtISO'] === 'string' ? item['CompletedAtISO'] : null,
            });
        }
    }
    return summaries;
}

function parsePauseEvidence(raw: RunawayJsonValue | undefined): RunawayPauseEvidence {
    if (!isRunawayObject(raw)) {
        return { RecentStepSummaries: [] };
    }
    return {
        BudgetBreach: parseBudgetBreachDetail(raw['BudgetBreach']),
        RecentStepSummaries: parseCheckpointStepSummaries(raw['RecentStepSummaries']),
    };
}

function parseFastJudgeDiagnosticEntries(raw: RunawayJsonValue | undefined): FastJudgeDiagnosticEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const entries: FastJudgeDiagnosticEntry[] = [];
    for (const item of raw) {
        if (isRunawayObject(item) && typeof item['TimestampISO'] === 'string' && typeof item['Reason'] === 'string') {
            const src = item['Source'];
            const source: FastJudgeDiagnosticEntry['Source'] =
                src === 'Model' || src === 'Fallback' || src === 'Error' ? src : 'Fallback';
            entries.push({
                TimestampISO: item['TimestampISO'],
                Iteration: typeof item['Iteration'] === 'number' ? item['Iteration'] : 0,
                Converging: item['Converging'] === true,
                Reason: item['Reason'],
                LatencyMs: typeof item['LatencyMs'] === 'number' ? item['LatencyMs'] : 0,
                TimedOut: item['TimedOut'] === true,
                UsedFallback: item['UsedFallback'] === true,
                Source: source,
            });
        }
    }
    return entries;
}

/**
 * Validates and hydrates an object into {@link RunawayCheckpointState}.
 */
export function ValidateRunawayCheckpoint(raw: RunawayJsonValue | undefined): RunawayCheckpointState | null {
    if (!isRunawayObject(raw) || raw['SchemaVersion'] !== RUNAWAY_CHECKPOINT_SCHEMA_VERSION) {
        return null;
    }
    if (
        typeof raw['CheckpointID'] !== 'string' ||
        typeof raw['AgentRunID'] !== 'string' ||
        typeof raw['AgentID'] !== 'string' ||
        typeof raw['PausedAtISO'] !== 'string' ||
        typeof raw['PausedAtMs'] !== 'number' ||
        !isRunawayPauseReason(raw['PauseReason'])
    ) {
        return null;
    }
    const ledger = parseCumulativeBudgetLedger(raw['CumulativeLedger']);
    const approval = parseHumanResumeApproval(raw['HumanApproval']);
    if (!ledger || !approval) {
        return null;
    }
    const pendingDecision = parsePendingStepDecision(raw['PendingStepDecision']);
    const loopCursor = parseLoopCursorState(raw['LoopCursor']);
    return {
        SchemaVersion: RUNAWAY_CHECKPOINT_SCHEMA_VERSION,
        CheckpointID: raw['CheckpointID'],
        AgentRunID: raw['AgentRunID'],
        AgentID: raw['AgentID'],
        AgentName: typeof raw['AgentName'] === 'string' ? raw['AgentName'] : '',
        UserID: typeof raw['UserID'] === 'string' ? raw['UserID'] : null,
        RoutineID: typeof raw['RoutineID'] === 'string' ? raw['RoutineID'] : null,
        PausedAtISO: raw['PausedAtISO'],
        PausedAtMs: raw['PausedAtMs'],
        PauseReason: raw['PauseReason'],
        Summary: typeof raw['Summary'] === 'string' ? raw['Summary'] : '',
        CompletedStepCount: typeof raw['CompletedStepCount'] === 'number' ? raw['CompletedStepCount'] : 0,
        CompletedStepIDs: parseStringArray(raw['CompletedStepIDs']),
        CompletedPromptTurns: typeof raw['CompletedPromptTurns'] === 'number' ? raw['CompletedPromptTurns'] : 0,
        CompletedNodeIDs: parseStringArray(raw['CompletedNodeIDs']),
        ConversationMessages: parseCheckpointMessages(raw['ConversationMessages']),
        InFlightPayload: ToRunawayJsonValue(raw['InFlightPayload']),
        Scratchpad: parseScratchpadSnapshot(raw['Scratchpad']),
        NextStepSummary: typeof raw['NextStepSummary'] === 'string' ? raw['NextStepSummary'] : null,
        PendingStepDecision: pendingDecision,
        LoopCursor: loopCursor,
        Evidence: parsePauseEvidence(raw['Evidence']),
        CumulativeLedger: ledger,
        HumanApproval: approval,
    };
}

/**
 * Attaches a {@link RunawayCheckpointState} under {@link RUNAWAY_CHECKPOINT_DATA_KEY} inside
 * `AIAgentRun.Data` JSON without clobbering existing caller or diagnostics keys.
 */
export function AttachRunawayCheckpointToRunData(
    existingDataJson: string | null | undefined,
    checkpoint: RunawayCheckpointState,
): string {
    let baseData: Record<string, RunawayJsonValue> = {};
    if (typeof existingDataJson === 'string' && existingDataJson.trim().length > 0) {
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(existingDataJson);
        if (IsPlainObject(parsed)) {
            baseData = { ...parsed };
        }
    }
    baseData[RUNAWAY_CHECKPOINT_DATA_KEY] = ToRunawayJsonValue(checkpoint);
    return JSON.stringify(baseData);
}

/**
 * Extracts a validated {@link RunawayCheckpointState} from an `AIAgentRun.Data` JSON string.
 */
export function ExtractRunawayCheckpointFromRunData(
    dataJson: string | null | undefined,
): RunawayCheckpointState | null {
    if (typeof dataJson !== 'string' || dataJson.trim().length > 0 === false) {
        return null;
    }
    const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(dataJson);
    if (!IsPlainObject(parsed)) {
        return null;
    }
    return ValidateRunawayCheckpoint(parsed[RUNAWAY_CHECKPOINT_DATA_KEY]);
}

/**
 * Attaches a {@link RunawayCheckpointState} to an {@link MJAIAgentRunEntityExtended} instance,
 * updating both its in-memory accessor and its serialized `Data` JSON column.
 */
export function AttachRunawayCheckpointToAgentRun(
    agentRun: AgentRunCheckpointTarget,
    checkpoint: RunawayCheckpointState,
): void {
    agentRun.RunawayCheckpoint = checkpoint;
    agentRun.Data = AttachRunawayCheckpointToRunData(agentRun.Data, checkpoint);
}

/**
 * Reads the {@link RunawayCheckpointState} from an {@link MJAIAgentRunEntityExtended} instance.
 */
export function ExtractRunawayCheckpointFromAgentRun(
    agentRun: AgentRunCheckpointTarget,
): RunawayCheckpointState | null {
    if (agentRun.RunawayCheckpoint) {
        return agentRun.RunawayCheckpoint;
    }
    return ExtractRunawayCheckpointFromRunData(agentRun.Data);
}

/**
 * Appends a {@link FastJudgeDiagnosticEntry} and updates the latest progress classification
 * under {@link PROGRESS_DIAGNOSTICS_DATA_KEY} in `AIAgentRun.Data` JSON.
 */
export function AppendProgressDiagnosticToRunData(
    existingDataJson: string | null | undefined,
    evaluation: ProgressEvaluationResult,
    iteration: number,
    timestampISO: string = new Date().toISOString(),
): string {
    let baseData: Record<string, RunawayJsonValue> = {};
    if (typeof existingDataJson === 'string' && existingDataJson.trim().length > 0) {
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(existingDataJson);
        if (IsPlainObject(parsed)) {
            baseData = { ...parsed };
        }
    }

    const priorRaw = baseData[PROGRESS_DIAGNOSTICS_DATA_KEY];
    const priorEntries = IsPlainObject(priorRaw)
        ? parseFastJudgeDiagnosticEntries(priorRaw['FastJudgeEntries'])
        : [];

    const nextEntries = [...priorEntries];
    if (evaluation.FastJudgeInvoked && evaluation.FastJudgeResult) {
        nextEntries.push({
            TimestampISO: timestampISO,
            Iteration: iteration,
            Converging: evaluation.FastJudgeResult.Converging,
            Reason: evaluation.FastJudgeResult.Reason,
            LatencyMs: evaluation.FastJudgeResult.LatencyMs,
            TimedOut: evaluation.FastJudgeResult.TimedOut,
            UsedFallback: evaluation.FastJudgeResult.UsedFallback,
            Source: evaluation.FastJudgeResult.Source,
        });
    }

    const diagnostics: RunProgressDiagnostics = {
        LastClassification: evaluation.Classification,
        LastScore: evaluation.ProgressScore,
        LastReason: evaluation.Reason,
        UpdatedAtISO: timestampISO,
        FastJudgeEntries: nextEntries,
    };
    baseData[PROGRESS_DIAGNOSTICS_DATA_KEY] = ToRunawayJsonValue(diagnostics);
    return JSON.stringify(baseData);
}

/**
 * Extracts {@link RunProgressDiagnostics} from an `AIAgentRun.Data` JSON string.
 */
export function ExtractProgressDiagnosticsFromRunData(
    dataJson: string | null | undefined,
): RunProgressDiagnostics | null {
    if (typeof dataJson !== 'string' || dataJson.trim().length === 0) {
        return null;
    }
    const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(dataJson);
    if (!IsPlainObject(parsed)) {
        return null;
    }
    const raw = parsed[PROGRESS_DIAGNOSTICS_DATA_KEY];
    if (!IsPlainObject(raw) || !isProgressClassification(raw['LastClassification'])) {
        return null;
    }
    return {
        LastClassification: raw['LastClassification'],
        LastScore: typeof raw['LastScore'] === 'number' ? raw['LastScore'] : 0,
        LastReason: typeof raw['LastReason'] === 'string' ? raw['LastReason'] : '',
        UpdatedAtISO: typeof raw['UpdatedAtISO'] === 'string' ? raw['UpdatedAtISO'] : new Date(0).toISOString(),
        FastJudgeEntries: parseFastJudgeDiagnosticEntries(raw['FastJudgeEntries']),
    };
}
