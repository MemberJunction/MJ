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
export type RunawayPauseReason = 'BudgetExceeded' | 'ProgressStalled' | 'FastJudgeStalled';

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

/**
 * Safely converts an arbitrary runtime value into a JSON-compatible {@link RunawayJsonValue}
 * without using `any` or unsafe casts.
 */
export function ToRunawayJsonValue(value: unknown): RunawayJsonValue {
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
        return value.map((item) => ToRunawayJsonValue(item));
    }
    if (typeof value === 'object') {
        const serialized = SafeJSONParse<RunawayJsonValue>(JSON.stringify(value));
        return serialized !== null ? serialized : null;
    }
    return String(value);
}

function isBudgetScope(value: unknown): value is BudgetScope {
    return value === 'PerRun' || value === 'PerRoutine' || value === 'PerUserPerDay';
}

function isBudgetDimension(value: unknown): value is BudgetDimension {
    return value === 'CostUsd' || value === 'WallClockMs' || value === 'Tokens';
}

function isProgressClassification(value: unknown): value is ProgressClassification {
    return value === 'Converging' || value === 'Stalled' || value === 'Ambiguous';
}

function isRunawayPauseReason(value: unknown): value is RunawayPauseReason {
    return value === 'BudgetExceeded' || value === 'ProgressStalled' || value === 'FastJudgeStalled';
}

function parsePausedIntervals(raw: unknown): BudgetPausedInterval[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const intervals: BudgetPausedInterval[] = [];
    for (const item of raw) {
        if (IsPlainObject(item) && typeof item['PausedAtMs'] === 'number') {
            intervals.push({
                PausedAtMs: item['PausedAtMs'],
                ResumedAtMs: typeof item['ResumedAtMs'] === 'number' ? item['ResumedAtMs'] : null,
            });
        }
    }
    return intervals;
}

function parseCumulativeBudgetLedger(raw: unknown): CumulativeBudgetLedger | null {
    if (!IsPlainObject(raw)) {
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
        AsOfISO: typeof raw['AsOfISO'] === 'string' ? raw['AsOfISO'] : new Date(0).toISOString(),
    };
}

function readNullableNumber(val: unknown): number | null | undefined {
    if (val === null) return null;
    return typeof val === 'number' ? val : undefined;
}

function parseBudgetExtensionGrant(raw: unknown): BudgetExtensionGrant | undefined {
    if (!IsPlainObject(raw)) {
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

function parseHumanResumeApproval(raw: unknown): HumanResumeApproval | null {
    if (!IsPlainObject(raw)) {
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

function parseStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.filter((item): item is string => typeof item === 'string');
}

function isChatMessageRole(role: unknown): role is ChatMessage['role'] {
    return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool';
}

function parseCheckpointMessages(raw: unknown): CheckpointMessageRecord[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const messages: CheckpointMessageRecord[] = [];
    for (const item of raw) {
        if (IsPlainObject(item) && isChatMessageRole(item['Role']) && typeof item['Content'] === 'string') {
            messages.push({ Role: item['Role'], Content: item['Content'] });
        }
    }
    return messages;
}

function parseScratchpadSnapshot(raw: unknown): ScratchpadSnapshot {
    if (!IsPlainObject(raw)) {
        return { notes: '', tasks: [] };
    }
    const notes = typeof raw['notes'] === 'string' ? raw['notes'] : '';
    const tasks: ScratchpadSnapshot['tasks'] = [];
    if (Array.isArray(raw['tasks'])) {
        for (const t of raw['tasks']) {
            if (IsPlainObject(t) && typeof t['id'] === 'string' && typeof t['title'] === 'string') {
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

function parseBudgetBreachDetail(raw: unknown): BudgetBreachDetail | undefined {
    if (!IsPlainObject(raw) || !isBudgetScope(raw['Scope']) || !isBudgetDimension(raw['Dimension'])) {
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

function parseCheckpointStepSummaries(raw: unknown): CheckpointStepSummary[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const summaries: CheckpointStepSummary[] = [];
    for (const item of raw) {
        if (IsPlainObject(item) && typeof item['StepNumber'] === 'number' && typeof item['StepType'] === 'string') {
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

function parsePauseEvidence(raw: unknown): RunawayPauseEvidence {
    if (!IsPlainObject(raw)) {
        return { RecentStepSummaries: [] };
    }
    return {
        BudgetBreach: parseBudgetBreachDetail(raw['BudgetBreach']),
        RecentStepSummaries: parseCheckpointStepSummaries(raw['RecentStepSummaries']),
    };
}

function parseFastJudgeDiagnosticEntries(raw: unknown): FastJudgeDiagnosticEntry[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const entries: FastJudgeDiagnosticEntry[] = [];
    for (const item of raw) {
        if (IsPlainObject(item) && typeof item['TimestampISO'] === 'string' && typeof item['Reason'] === 'string') {
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
export function ValidateRunawayCheckpoint(raw: unknown): RunawayCheckpointState | null {
    if (!IsPlainObject(raw) || raw['SchemaVersion'] !== RUNAWAY_CHECKPOINT_SCHEMA_VERSION) {
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
