/**
 * @fileoverview Non-destructive pause, persisted checkpoint state, owner notification,
 * and human-approved resume manager for MemberJunction AI Agents.
 *
 * When a budget ceiling (`PerRun`, `PerRoutine`, `PerUserPerDay` in USD or wall-clock ms)
 * is exceeded or progress detection / the fast convergence judge flags a stall,
 * {@link RunawayCheckpointManager}:
 *  1. Pauses the run non-destructively (`Status = 'Paused'`, `CompletedAt = null`) — never kills or discards work
 *  2. Persists a full {@link RunawayCheckpointState} under `AIAgentRun.Data.__runawayCheckpoint`
 *  3. Emits a structured owner notification (`MJ: User Notifications` + optional `MJ: AI Agent Requests` & callback)
 *  4. Supports human approval + budget extension and clean non-destructive resume preserving completed
 *     steps/turns and cumulative USD & active wall-clock accounting.
 *
 * @module @memberjunction/ai-agents
 */

import { randomUUID } from 'node:crypto';
import {
    IMetadataProvider,
    LogError,
    LogStatus,
    UserInfo,
    type MJLimitsBudgetsConfig,
} from '@memberjunction/core';
import {
    MJAIAgentRequestEntity,
    MJUserNotificationEntity,
} from '@memberjunction/core-entities';
import {
    AttachRunawayCheckpointToAgentRun,
    ExtractRunawayCheckpointFromAgentRun,
    ToRunawayJsonValue,
    type AgentResponseForm,
    type BaseAgentNextStep,
    type BudgetBreachDetail,
    type BudgetExtensionGrant,
    type BudgetPausedInterval,
    type CheckpointMessageRecord,
    type CheckpointStepSummary,
    type CumulativeBudgetLedger,
    type FastConvergenceJudgeResult,
    type ForEachOperation,
    type HumanResumeApproval,
    type MJAIAgentRunEntityExtended,
    type OwnerPauseNotificationPayload,
    type PendingLoopCursorState,
    type PendingStepDecision,
    type ProgressEvaluationResult,
    type RunawayCheckpointState,
    type RunawayJsonObject,
    type RunawayJsonValue,
    type RunawayPauseReason,
    type RunawaySerializable,
    type ScratchpadSnapshot,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import { IsPlainObject, IsValidUUID } from '@memberjunction/global';
import { ApplyBudgetExtensionToBudgets, ComputeDayBoundaryWindow, ComputeTotalPausedMs } from './BudgetEnforcementGuard';

/** Input parameters for {@link RunawayCheckpointManager.PauseRunWithCheckpoint}. */
export interface PauseRunWithCheckpointInput {
    AgentRun: MJAIAgentRunEntityExtended;
    AgentID: string;
    AgentName: string;
    UserID: string | null;
    RoutineID: string | null;
    PauseReason: RunawayPauseReason;
    Summary: string;
    CompletedPromptTurns: number;
    CompletedNodeIDs?: readonly string[];
    ConversationMessages: readonly ChatMessage[];
    InFlightPayload: RunawaySerializable;
    Scratchpad: ScratchpadSnapshot;
    NextStepToResume?: BaseAgentNextStep | null;
    LoopCursor?: PendingLoopCursorState | null;
    BudgetBreach?: BudgetBreachDetail;
    ProgressEvaluation?: ProgressEvaluationResult;
    FastJudgeResult?: FastConvergenceJudgeResult;
    CumulativeLedger: CumulativeBudgetLedger;
    Provider: IMetadataProvider;
    ContextUser?: UserInfo;
    NowMs?: number;
    CreateApprovalRequest?: boolean;
    /** Maximum save attempts for transient persistence failures (defaults to 3). */
    MaxSaveAttempts?: number;
    /** Base retry delay in milliseconds between transient save attempts (defaults to 25ms). */
    SaveRetryDelayMs?: number;
    OnOwnerNotification?: (payload: OwnerPauseNotificationPayload) => Promise<void> | void;
}

/** Result returned by {@link RunawayCheckpointManager.PauseRunWithCheckpoint}. */
export interface PauseRunWithCheckpointResult {
    Checkpoint: RunawayCheckpointState;
    NotificationPayload: OwnerPauseNotificationPayload;
    OwnerNotificationID: string | null;
    ApprovalRequestID: string | null;
    Saved: boolean;
    /** Persistence error detail when `Saved === false`. */
    SaveError?: string | null;
}

/** Input parameters for {@link RunawayCheckpointManager.ApproveCheckpoint}. */
export interface ApproveCheckpointInput {
    AgentRun?: MJAIAgentRunEntityExtended;
    AgentRunID?: string;
    ApprovedByUserID: string;
    BudgetExtension?: BudgetExtensionGrant;
    DecisionNotes?: string | null;
    Provider?: IMetadataProvider;
    ContextUser?: UserInfo;
    NowMs?: number;
}

/** Input parameters for {@link RunawayCheckpointManager.PrepareResumeFromCheckpoint}. */
export interface PrepareResumeFromCheckpointInput {
    AgentRun?: MJAIAgentRunEntityExtended;
    AgentRunID?: string;
    BaseBudgets: MJLimitsBudgetsConfig;
    HumanApprovalOverride?: HumanResumeApproval;
    Provider?: IMetadataProvider;
    ContextUser?: UserInfo;
    NowMs?: number;
}

/** Hydrated context restored by {@link RunawayCheckpointManager.BuildResumePreparation}. */
export interface RestoredCheckpointContext {
    AgentRun: MJAIAgentRunEntityExtended;
    Checkpoint: RunawayCheckpointState;
    ExtendedBudgets: MJLimitsBudgetsConfig;
    RestoredPayload: RunawayJsonValue;
    RestoredScratchpad: ScratchpadSnapshot;
    RestoredMessages: ChatMessage[];
    RestoredNextStep: BaseAgentNextStep | null;
    RestoredLoopCursor: PendingLoopCursorState | null;
    StartingStepCount: number;
    StartingPromptTurns: number;
    PriorCumulativeCostUsd: number;
    PriorCumulativeActiveWallClockMs: number;
    /** Prior-day cost already spent before today's UTC/IANA day boundary when resuming across midnight (CR-20). */
    PriorDayCostBaselineUsd?: number;
    /** Prior-day active wall-clock already elapsed before today's UTC/IANA day boundary (CR-20). */
    PriorDayWallClockBaselineMs?: number;
    PausedIntervals: BudgetPausedInterval[];
    ResetProgressDetectorWindow: boolean;
}

/** Alias representing a non-mutating checkpoint resume preparation built prior to continuation acceptance (CR-14). */
export type RunawayResumePreparation = RestoredCheckpointContext;

/** Retained safe-point checkpoint bundle held in memory while storage persistence recovers. */
export interface PendingRunawayCheckpointPersistence {
    AgentRunID: string;
    AgentRun: MJAIAgentRunEntityExtended;
    Checkpoint: RunawayCheckpointState;
    InFlightPayload: RunawaySerializable;
    NotificationPayload: OwnerPauseNotificationPayload;
    OwnerNotificationID: string | null;
    ApprovalRequestID: string | null;
    Provider: IMetadataProvider;
    ContextUser?: UserInfo;
    TenantScopeKey?: string | null;
    LastSaveError: string | null;
    CreateApprovalRequest?: boolean;
    OwnerNotificationDelivered?: boolean;
    OnOwnerNotification?: (payload: OwnerPauseNotificationPayload) => Promise<void> | void;
}

/** Snapshot of mutable AgentRun fields captured before applying paused state so failed saves roll back cleanly. */
interface AgentRunPriorSnapshot {
    Status: MJAIAgentRunEntityExtended['Status'];
    CompletedAt: MJAIAgentRunEntityExtended['CompletedAt'];
    Success: MJAIAgentRunEntityExtended['Success'];
    ErrorMessage: MJAIAgentRunEntityExtended['ErrorMessage'];
    Message: MJAIAgentRunEntityExtended['Message'];
    FinalPayload: MJAIAgentRunEntityExtended['FinalPayload'];
    FinalPayloadObject: MJAIAgentRunEntityExtended['FinalPayloadObject'];
    Data: MJAIAgentRunEntityExtended['Data'];
    RunawayCheckpoint: MJAIAgentRunEntityExtended['RunawayCheckpoint'];
}

/**
 * Coordinates non-destructive runaway pause, checkpoint persistence, owner notification,
 * human approval, and stateful resume.
 */
export class RunawayCheckpointManager {
    /**
     * Pauses an agent run non-destructively, persists its resumable checkpoint onto the run,
     * saves `Status = 'Paused'`, and emits an owner notification with approval evidence.
     */
    public async PauseRunWithCheckpoint(input: PauseRunWithCheckpointInput): Promise<PauseRunWithCheckpointResult> {
        const nowMs = input.NowMs ?? Date.now();
        const pausedAtISO = new Date(nowMs).toISOString();
        const pausedIntervals = this.openPauseInterval(input.CumulativeLedger.PausedIntervals, nowMs);
        const updatedLedger: CumulativeBudgetLedger = {
            ...input.CumulativeLedger,
            PausedIntervals: pausedIntervals,
            AsOfISO: pausedAtISO,
        };

        const checkpoint = this.buildCheckpointState(input, updatedLedger, nowMs, pausedAtISO);
        const priorRunSnapshot = this.capturePriorSnapshot(input.AgentRun);
        this.applyPausedStateToRun(input.AgentRun, checkpoint, input.InFlightPayload);

        const notificationPayload = this.buildOwnerNotificationPayload(checkpoint);
        const ownerNotificationId = await this.persistOwnerNotification(
            input.Provider,
            input.ContextUser,
            notificationPayload,
        );
        const approvalRequestId = input.CreateApprovalRequest !== false
            ? await this.persistApprovalRequest(input.Provider, input.ContextUser, input.AgentID, input.AgentRun.ID, input.UserID, checkpoint, notificationPayload)
            : null;

        checkpoint.HumanApproval.OwnerNotificationID = ownerNotificationId;
        checkpoint.HumanApproval.ApprovalRequestID = approvalRequestId;
        AttachRunawayCheckpointToAgentRun(input.AgentRun, checkpoint);

        const saveOutcome = await this.trySavePausedAgentRun(
            input.AgentRun,
            priorRunSnapshot,
            input.MaxSaveAttempts ?? 3,
            input.SaveRetryDelayMs ?? 25,
        );

        if (!saveOutcome.Saved) {
            LogError(
                `RunawayCheckpointManager: failed to save paused run ${input.AgentRun.ID} after ${saveOutcome.Attempts} attempt(s): ${saveOutcome.Error ?? 'unspecified error'}`,
            );
            return {
                Checkpoint: checkpoint,
                NotificationPayload: notificationPayload,
                OwnerNotificationID: ownerNotificationId,
                ApprovalRequestID: approvalRequestId,
                Saved: false,
                SaveError: saveOutcome.Error,
            };
        }

        if (input.OnOwnerNotification) {
            await input.OnOwnerNotification(notificationPayload);
        }

        LogStatus(
            `[RunawayCheckpointManager] Run ${input.AgentRun.ID} paused non-destructively (${input.PauseReason}): ${input.Summary}`,
        );

        return {
            Checkpoint: checkpoint,
            NotificationPayload: notificationPayload,
            OwnerNotificationID: ownerNotificationId,
            ApprovalRequestID: approvalRequestId,
            Saved: true,
            SaveError: null,
        };
    }

    /**
     * Builds a safe-point {@link PauseRunWithCheckpointResult} without writing to storage,
     * used as a fail-closed fallback if `PauseRunWithCheckpoint` throws before returning.
     */
    public BuildFallbackCheckpointResult(
        input: PauseRunWithCheckpointInput,
        saveError: string,
    ): PauseRunWithCheckpointResult {
        const nowMs = input.NowMs ?? Date.now();
        const pausedAtISO = new Date(nowMs).toISOString();
        const pausedIntervals = this.openPauseInterval(input.CumulativeLedger.PausedIntervals, nowMs);
        const updatedLedger: CumulativeBudgetLedger = {
            ...input.CumulativeLedger,
            PausedIntervals: pausedIntervals,
            AsOfISO: pausedAtISO,
        };
        const checkpoint = this.buildCheckpointState(input, updatedLedger, nowMs, pausedAtISO);
        const notificationPayload = this.buildOwnerNotificationPayload(checkpoint);
        return {
            Checkpoint: checkpoint,
            NotificationPayload: notificationPayload,
            OwnerNotificationID: null,
            ApprovalRequestID: null,
            Saved: false,
            SaveError: saveError,
        };
    }

    /**
     * Retries persisting a retained in-memory {@link PendingRunawayCheckpointPersistence} safe-point
     * once storage recovers, transitioning the run entity cleanly to `Status = 'Paused'`.
     */
    public async FlushPendingCheckpointPersistence(
        pending: PendingRunawayCheckpointPersistence,
        options?: { MaxSaveAttempts?: number; SaveRetryDelayMs?: number },
    ): Promise<PauseRunWithCheckpointResult> {
        const checkpoint = pending.Checkpoint;
        const priorRunSnapshot = this.capturePriorSnapshot(pending.AgentRun);

        if (!pending.OwnerNotificationID) {
            pending.OwnerNotificationID = await this.persistOwnerNotification(
                pending.Provider,
                pending.ContextUser,
                pending.NotificationPayload,
            );
            checkpoint.HumanApproval.OwnerNotificationID = pending.OwnerNotificationID;
        }
        if (!pending.ApprovalRequestID && pending.CreateApprovalRequest !== false) {
            pending.ApprovalRequestID = await this.persistApprovalRequest(
                pending.Provider,
                pending.ContextUser,
                checkpoint.AgentID,
                pending.AgentRun.ID,
                checkpoint.UserID,
                checkpoint,
                pending.NotificationPayload,
            );
            checkpoint.HumanApproval.ApprovalRequestID = pending.ApprovalRequestID;
        }

        this.applyPausedStateToRun(pending.AgentRun, checkpoint, pending.InFlightPayload);
        const saveOutcome = await this.trySavePausedAgentRun(
            pending.AgentRun,
            priorRunSnapshot,
            options?.MaxSaveAttempts ?? 2,
            options?.SaveRetryDelayMs ?? 10,
        );

        if (!saveOutcome.Saved) {
            pending.LastSaveError = saveOutcome.Error;
            LogError(
                `RunawayCheckpointManager: flush pending checkpoint failed for run ${pending.AgentRun.ID}: ${saveOutcome.Error ?? 'unspecified error'}`,
            );
            return {
                Checkpoint: checkpoint,
                NotificationPayload: pending.NotificationPayload,
                OwnerNotificationID: pending.OwnerNotificationID,
                ApprovalRequestID: pending.ApprovalRequestID,
                Saved: false,
                SaveError: saveOutcome.Error,
            };
        }

        pending.LastSaveError = null;
        if (pending.OnOwnerNotification && !pending.OwnerNotificationDelivered) {
            pending.OwnerNotificationDelivered = true;
            await pending.OnOwnerNotification(pending.NotificationPayload);
        }

        LogStatus(
            `[RunawayCheckpointManager] Flushed pending checkpoint ${checkpoint.CheckpointID} for run ${pending.AgentRun.ID} (${checkpoint.PauseReason}).`,
        );

        return {
            Checkpoint: checkpoint,
            NotificationPayload: pending.NotificationPayload,
            OwnerNotificationID: pending.OwnerNotificationID,
            ApprovalRequestID: pending.ApprovalRequestID,
            Saved: true,
            SaveError: null,
        };
    }

    private capturePriorSnapshot(agentRun: MJAIAgentRunEntityExtended): AgentRunPriorSnapshot {
        return {
            Status: agentRun.Status,
            CompletedAt: agentRun.CompletedAt,
            Success: agentRun.Success,
            ErrorMessage: agentRun.ErrorMessage,
            Message: agentRun.Message,
            FinalPayload: agentRun.FinalPayload,
            FinalPayloadObject: agentRun.FinalPayloadObject,
            Data: agentRun.Data,
            RunawayCheckpoint: agentRun.RunawayCheckpoint,
        };
    }

    private restorePriorSnapshot(agentRun: MJAIAgentRunEntityExtended, prior: AgentRunPriorSnapshot): void {
        agentRun.Status = prior.Status;
        agentRun.CompletedAt = prior.CompletedAt;
        agentRun.Success = prior.Success;
        agentRun.ErrorMessage = prior.ErrorMessage;
        agentRun.Message = prior.Message;
        agentRun.FinalPayloadObject = prior.FinalPayloadObject;
        agentRun.FinalPayload = prior.FinalPayload;
        agentRun.Data = prior.Data;
        agentRun.RunawayCheckpoint = prior.RunawayCheckpoint;
    }

    private async trySavePausedAgentRun(
        agentRun: MJAIAgentRunEntityExtended,
        priorSnapshot: AgentRunPriorSnapshot,
        rawMaxAttempts: number,
        rawBaseDelayMs: number,
    ): Promise<{ Saved: boolean; Attempts: number; Error: string | null }> {
        const maxAttempts = Math.max(1, Math.trunc(rawMaxAttempts));
        const baseDelayMs = Math.max(0, Math.trunc(rawBaseDelayMs));
        let saved = false;
        let lastSaveError: string | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                saved = await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
                if (saved) {
                    lastSaveError = null;
                    break;
                }
                lastSaveError = agentRun.LatestResult?.CompleteMessage || 'Save() returned false';
            } catch (err) {
                saved = false;
                lastSaveError = err instanceof Error ? err.message : String(err);
            }
            if (attempt < maxAttempts && baseDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
            }
        }

        if (!saved) {
            this.restorePriorSnapshot(agentRun, priorSnapshot);
        }
        return { Saved: saved, Attempts: maxAttempts, Error: lastSaveError };
    }

    /**
     * Records human approval and optional budget extension onto a paused run's persisted checkpoint.
     */
    public async ApproveCheckpoint(input: ApproveCheckpointInput): Promise<RunawayCheckpointState> {
        const agentRun = await this.resolveAgentRun(input.AgentRun, input.AgentRunID, input.Provider, input.ContextUser);
        if (agentRun.Status !== 'Paused') {
            throw new Error(`Cannot approve checkpoint on run ${agentRun.ID}: status is '${agentRun.Status}', expected 'Paused'`);
        }

        const checkpoint = ExtractRunawayCheckpointFromAgentRun(agentRun);
        if (!checkpoint) {
            throw new Error(`Run ${agentRun.ID} does not have a persisted RunawayCheckpoint`);
        }

        const nowMs = input.NowMs ?? Date.now();
        const approvedAtISO = new Date(nowMs).toISOString();
        checkpoint.HumanApproval = {
            ...checkpoint.HumanApproval,
            Status: 'Approved',
            ApprovedByUserID: input.ApprovedByUserID,
            ApprovedAtISO: approvedAtISO,
            DecisionNotes: input.DecisionNotes ?? checkpoint.HumanApproval.DecisionNotes ?? null,
            BudgetExtension: input.BudgetExtension ?? checkpoint.HumanApproval.BudgetExtension,
        };
        checkpoint.CumulativeLedger = {
            ...checkpoint.CumulativeLedger,
            PausedIntervals: this.closeOpenPauseInterval(checkpoint.CumulativeLedger.PausedIntervals, nowMs),
            PausedWallClockMs: ComputeTotalPausedMs(
                this.closeOpenPauseInterval(checkpoint.CumulativeLedger.PausedIntervals, nowMs),
                nowMs,
            ),
            AsOfISO: approvedAtISO,
        };

        AttachRunawayCheckpointToAgentRun(agentRun, checkpoint);
        const saved = await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
        if (!saved) {
            throw new Error(`Failed to persist checkpoint approval on run ${agentRun.ID}: ${agentRun.LatestResult?.CompleteMessage ?? 'unspecified error'}`);
        }
        return checkpoint;
    }

    /**
     * Validates human approval, closes any open pause interval, computes extended budgets and
     * day-boundary baselines, and builds a {@link RunawayResumePreparation} WITHOUT mutating
     * `agentRun.Status` to `'Running'` or calling `agentRun.Save()` (CR-14).
     */
    public async BuildResumePreparation(
        input: PrepareResumeFromCheckpointInput,
    ): Promise<RunawayResumePreparation> {
        const agentRun = await this.resolveAgentRun(input.AgentRun, input.AgentRunID, input.Provider, input.ContextUser);
        const extracted = ExtractRunawayCheckpointFromAgentRun(agentRun);
        if (!extracted) {
            throw new Error(`Run ${agentRun.ID} has no persisted RunawayCheckpoint to resume from`);
        }

        const checkpoint: RunawayCheckpointState = {
            ...extracted,
            HumanApproval: { ...extracted.HumanApproval },
            CumulativeLedger: {
                ...extracted.CumulativeLedger,
                PausedIntervals: extracted.CumulativeLedger.PausedIntervals.map((p) => ({ ...p })),
            },
        };

        const effectiveApproval = input.HumanApprovalOverride ?? checkpoint.HumanApproval;
        if (effectiveApproval.Status !== 'Approved') {
            throw new Error(
                `Cannot resume paused run ${agentRun.ID}: human approval status is '${effectiveApproval.Status}'`,
            );
        }

        const nowMs = input.NowMs ?? Date.now();
        const nowISO = new Date(nowMs).toISOString();
        const closedIntervals = this.closeOpenPauseInterval(checkpoint.CumulativeLedger.PausedIntervals, nowMs);
        const resumeDay = ComputeDayBoundaryWindow(nowMs, checkpoint.CumulativeLedger.DayBoundaryTimezone || 'UTC');
        const resumeDayStartMs = Date.parse(resumeDay.DayStartISO);
        const crossedDayBoundary =
            checkpoint.CumulativeLedger.DayBucketUTC !== resumeDay.DayBucketUTC &&
            checkpoint.PausedAtMs < resumeDayStartMs;
        const priorDayCostBaseline = crossedDayBoundary
            ? checkpoint.CumulativeLedger.RunCostUsd
            : checkpoint.CumulativeLedger.PriorDayCostBaselineUsd;
        const priorDayWallBaseline = crossedDayBoundary
            ? checkpoint.CumulativeLedger.RunWallClockMs
            : checkpoint.CumulativeLedger.PriorDayWallClockBaselineMs;
        const existingClaim = effectiveApproval.ResumeClaim ?? checkpoint.HumanApproval.ResumeClaim;
        checkpoint.HumanApproval = {
            ...checkpoint.HumanApproval,
            ...effectiveApproval,
            ResumeClaim: existingClaim ?? {
                ClaimID: randomUUID(),
                Status: 'PendingDispatch',
                ClaimedAtISO: nowISO,
            },
        };
        checkpoint.CumulativeLedger = {
            ...checkpoint.CumulativeLedger,
            PausedIntervals: closedIntervals,
            PausedWallClockMs: ComputeTotalPausedMs(closedIntervals, nowMs),
            DayBucketUTC: resumeDay.DayBucketUTC,
            ...(typeof priorDayCostBaseline === 'number' ? { PriorDayCostBaselineUsd: priorDayCostBaseline } : {}),
            ...(typeof priorDayWallBaseline === 'number' ? { PriorDayWallClockBaselineMs: priorDayWallBaseline } : {}),
            AsOfISO: nowISO,
        };

        const extendedBudgets = ApplyBudgetExtensionToBudgets(
            input.BaseBudgets,
            effectiveApproval.BudgetExtension,
        );

        return {
            AgentRun: agentRun,
            Checkpoint: checkpoint,
            ExtendedBudgets: extendedBudgets,
            RestoredPayload: checkpoint.InFlightPayload,
            RestoredScratchpad: {
                notes: checkpoint.Scratchpad.notes,
                tasks: checkpoint.Scratchpad.tasks.map((t) => ({ ...t })),
            },
            RestoredMessages: this.restoreChatMessages(checkpoint.ConversationMessages),
            RestoredNextStep: this.RestoreNextStepFromDecision(checkpoint.PendingStepDecision),
            RestoredLoopCursor: checkpoint.LoopCursor ?? checkpoint.PendingStepDecision?.LoopCursor ?? null,
            StartingStepCount: checkpoint.CompletedStepCount,
            StartingPromptTurns: checkpoint.CompletedPromptTurns,
            PriorCumulativeCostUsd: checkpoint.CumulativeLedger.RunCostUsd,
            PriorCumulativeActiveWallClockMs: checkpoint.CumulativeLedger.RunWallClockMs,
            ...(typeof priorDayCostBaseline === 'number' ? { PriorDayCostBaselineUsd: priorDayCostBaseline } : {}),
            ...(typeof priorDayWallBaseline === 'number' ? { PriorDayWallClockBaselineMs: priorDayWallBaseline } : {}),
            PausedIntervals: closedIntervals,
            ResetProgressDetectorWindow: effectiveApproval.BudgetExtension?.ResetProgressDetectorWindow !== false,
        };
    }

    /**
     * Persists `Status = 'Running'` and attaches the prepared checkpoint after the continuation
     * dispatcher has accepted ownership (CR-14).
     */
    public async CommitResumeRunningState(input: {
        AgentRun: MJAIAgentRunEntityExtended;
        Preparation: RunawayResumePreparation;
        MarkStarted?: boolean;
        NowMs?: number;
    }): Promise<MJAIAgentRunEntityExtended> {
        const nowISO = new Date(input.NowMs ?? Date.now()).toISOString();
        const existingClaim = input.Preparation.Checkpoint.HumanApproval.ResumeClaim;
        input.Preparation.Checkpoint.HumanApproval = {
            ...input.Preparation.Checkpoint.HumanApproval,
            ResumeClaim: {
                ClaimID: existingClaim?.ClaimID ?? randomUUID(),
                Status: input.MarkStarted ? 'Started' : 'Dispatched',
                ClaimedAtISO: existingClaim?.ClaimedAtISO ?? nowISO,
                DispatchedAtISO: existingClaim?.DispatchedAtISO ?? nowISO,
                ...(input.MarkStarted ? { StartedAtISO: nowISO } : {}),
            },
        };

        input.AgentRun.Status = 'Running';
        input.AgentRun.CompletedAt = null;
        input.AgentRun.ErrorMessage = null;
        AttachRunawayCheckpointToAgentRun(input.AgentRun, input.Preparation.Checkpoint);

        const saved = await input.AgentRun.Save({ SaveReturnMode: 'datestamps_only' });
        if (!saved) {
            throw new Error(
                `Failed to save resumed run ${input.AgentRun.ID}: ${input.AgentRun.LatestResult?.CompleteMessage ?? 'unspecified error'}`,
            );
        }
        return input.AgentRun;
    }

    /**
     * Marks an approved checkpoint's resume claim as `Started` once the worker begins executing,
     * distinguishing in-flight execution from crash-orphaned `PendingDispatch` / `Dispatched` claims (CR-14).
     */
    public async MarkResumeStarted(
        agentRun: MJAIAgentRunEntityExtended,
        nowMs: number = Date.now(),
    ): Promise<void> {
        const checkpoint = ExtractRunawayCheckpointFromAgentRun(agentRun);
        if (!checkpoint || checkpoint.HumanApproval.Status !== 'Approved') {
            return;
        }
        if (checkpoint.HumanApproval.ResumeClaim?.Status === 'Started') {
            return;
        }
        const nowISO = new Date(nowMs).toISOString();
        const existingClaim = checkpoint.HumanApproval.ResumeClaim;
        checkpoint.HumanApproval = {
            ...checkpoint.HumanApproval,
            ResumeClaim: {
                ClaimID: existingClaim?.ClaimID ?? randomUUID(),
                Status: 'Started',
                ClaimedAtISO: existingClaim?.ClaimedAtISO ?? nowISO,
                DispatchedAtISO: existingClaim?.DispatchedAtISO ?? nowISO,
                StartedAtISO: nowISO,
            },
        };
        AttachRunawayCheckpointToAgentRun(agentRun, checkpoint);
        await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
    }

    /**
     * Validates human approval, closes any open pause interval, transitions the run back to
     * `Running`, and restores all completed work and cumulative budget accounting for resume.
     */
    public async PrepareResumeFromCheckpoint(
        input: PrepareResumeFromCheckpointInput,
    ): Promise<RestoredCheckpointContext> {
        const preparation = await this.BuildResumePreparation(input);
        await this.CommitResumeRunningState({
            AgentRun: preparation.AgentRun,
            Preparation: preparation,
            NowMs: input.NowMs,
        });
        return preparation;
    }

    private toTemplateParamsRecord(raw?: RunawayJsonObject): Record<string, string> | undefined {
        if (!raw) {
            return undefined;
        }
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) {
            out[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
        return out;
    }

    /**
     * Converts a {@link PendingStepDecision} persisted in a checkpoint back into a strongly-typed
     * {@link BaseAgentNextStep} so resumed execution continues deterministically without re-prompting.
     */
    public RestoreNextStepFromDecision(decision?: PendingStepDecision | null): BaseAgentNextStep | null {
        if (!decision) {
            return null;
        }
        const restoredSubAgentTpl = this.toTemplateParamsRecord(decision.subAgent?.templateParameters);
        const restored: BaseAgentNextStep = {
            step: decision.step as BaseAgentNextStep['step'],
            terminate: decision.terminate,
            ...(decision.previousPayload !== undefined ? { previousPayload: decision.previousPayload } : {}),
            ...(decision.newPayload !== undefined ? { newPayload: decision.newPayload } : {}),
            ...(decision.message !== undefined ? { message: decision.message } : {}),
            ...(decision.errorMessage !== undefined ? { errorMessage: decision.errorMessage } : {}),
            ...(decision.retryReason !== undefined ? { retryReason: decision.retryReason } : {}),
            ...(decision.retryInstructions !== undefined ? { retryInstructions: decision.retryInstructions } : {}),
            ...(decision.reasoning !== undefined ? { reasoning: decision.reasoning } : {}),
            ...(decision.actions ? {
                actions: decision.actions.map((a) => ({
                    name: a.name,
                    params: a.params,
                })),
            } : {}),
            ...(decision.subAgent ? {
                subAgent: {
                    name: decision.subAgent.name,
                    message: decision.subAgent.message,
                    ...(restoredSubAgentTpl ? { templateParameters: restoredSubAgentTpl } : {}),
                    terminateAfter: Boolean(decision.subAgent.terminateAfter),
                },
            } : {}),
            ...(decision.subAgents ? {
                subAgents: decision.subAgents.map((s) => {
                    const tpl = this.toTemplateParamsRecord(s.templateParameters);
                    return {
                        name: s.name,
                        message: s.message,
                        ...(tpl ? { templateParameters: tpl } : {}),
                        terminateAfter: Boolean(s.terminateAfter),
                    };
                }),
            } : {}),
            ...(decision.forEach ? { forEach: decision.forEach } : {}),
            ...(decision.while ? { while: decision.while } : {}),
            ...(decision.priorStepResult !== undefined ? { priorStepResult: decision.priorStepResult } : {}),
            ...(decision.payloadChangeRequest ? { payloadChangeRequest: decision.payloadChangeRequest as BaseAgentNextStep['payloadChangeRequest'] } : {}),
        };
        return restored;
    }

    private buildCheckpointState(
        input: PauseRunWithCheckpointInput,
        ledger: CumulativeBudgetLedger,
        nowMs: number,
        pausedAtISO: string,
    ): RunawayCheckpointState {
        const steps = input.AgentRun.Steps ?? [];
        const completedSteps = steps.filter((s) => s.Status === 'Completed');
        const stepSummaries: CheckpointStepSummary[] = steps.slice(-20).map((s) => ({
            StepNumber: s.StepNumber,
            StepType: s.StepType,
            StepName: s.StepName,
            Status: s.Status,
            Success: s.Success,
            CompletedAtISO: s.CompletedAt ? new Date(s.CompletedAt).toISOString() : null,
        }));

        const completedStepIds = completedSteps
            .map((s) => s.ID)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        return {
            SchemaVersion: 'mj-runaway-checkpoint/v1',
            CheckpointID: randomUUID(),
            AgentRunID: input.AgentRun.ID,
            AgentID: input.AgentID,
            AgentName: input.AgentName,
            UserID: input.UserID,
            RoutineID: input.RoutineID,
            PausedAtISO: pausedAtISO,
            PausedAtMs: nowMs,
            PauseReason: input.PauseReason,
            Summary: input.Summary,
            CompletedStepCount: Math.max(completedSteps.length, steps.length),
            CompletedStepIDs: completedStepIds,
            CompletedPromptTurns: input.CompletedPromptTurns,
            CompletedNodeIDs: input.CompletedNodeIDs ? [...input.CompletedNodeIDs] : [],
            ConversationMessages: this.serializeMessages(input.ConversationMessages),
            InFlightPayload: ToRunawayJsonValue(input.InFlightPayload),
            Scratchpad: {
                notes: input.Scratchpad.notes,
                tasks: input.Scratchpad.tasks.map((t) => ({ ...t })),
            },
            NextStepSummary: input.NextStepToResume ? `${input.NextStepToResume.step}` : null,
            PendingStepDecision: this.serializePendingStepDecision(input.NextStepToResume, input.LoopCursor),
            LoopCursor: input.LoopCursor ?? null,
            Evidence: {
                BudgetBreach: input.BudgetBreach,
                ProgressEvaluation: input.ProgressEvaluation,
                FastJudgeResult: input.FastJudgeResult,
                RecentStepSummaries: stepSummaries,
            },
            CumulativeLedger: ledger,
            HumanApproval: {
                Status: 'Pending',
            },
        };
    }

    private serializePendingStepDecision(
        nextStep?: BaseAgentNextStep | null,
        loopCursor?: PendingLoopCursorState | null,
    ): PendingStepDecision | null {
        if (!nextStep) {
            return null;
        }
        const rawPayloadChange = nextStep.payloadChangeRequest
            ? ToRunawayJsonValue(nextStep.payloadChangeRequest as RunawaySerializable)
            : null;
        return {
            step: String(nextStep.step),
            terminate: Boolean(nextStep.terminate),
            ...(nextStep.previousPayload !== undefined
                ? { previousPayload: ToRunawayJsonValue(nextStep.previousPayload as RunawaySerializable) }
                : {}),
            ...(nextStep.newPayload !== undefined
                ? { newPayload: ToRunawayJsonValue(nextStep.newPayload as RunawaySerializable) }
                : {}),
            ...(nextStep.message !== undefined ? { message: nextStep.message } : {}),
            ...(nextStep.errorMessage !== undefined ? { errorMessage: nextStep.errorMessage } : {}),
            ...(nextStep.retryReason !== undefined ? { retryReason: nextStep.retryReason } : {}),
            ...(nextStep.retryInstructions !== undefined ? { retryInstructions: nextStep.retryInstructions } : {}),
            ...(nextStep.reasoning !== undefined ? { reasoning: nextStep.reasoning } : {}),
            ...(Array.isArray(nextStep.actions) ? {
                actions: nextStep.actions.map((a) => {
                    const serializedParams = ToRunawayJsonValue(a.params as RunawaySerializable);
                    return {
                        name: a.name,
                        params: IsPlainObject(serializedParams) ? (serializedParams as RunawayJsonObject) : {},
                    };
                }),
            } : {}),
            ...(nextStep.subAgent ? {
                subAgent: {
                    name: nextStep.subAgent.name,
                    message: nextStep.subAgent.message,
                    ...(nextStep.subAgent.templateParameters ? {
                        templateParameters: ((): RunawayJsonObject => {
                            const serialized = ToRunawayJsonValue(nextStep.subAgent!.templateParameters as RunawaySerializable);
                            return IsPlainObject(serialized) ? (serialized as RunawayJsonObject) : {};
                        })(),
                    } : {}),
                    ...(nextStep.subAgent.terminateAfter !== undefined ? { terminateAfter: nextStep.subAgent.terminateAfter } : {}),
                },
            } : {}),
            ...(Array.isArray(nextStep.subAgents) ? {
                subAgents: nextStep.subAgents.map((s) => ({
                    name: s.name,
                    message: s.message,
                    ...(s.templateParameters ? {
                        templateParameters: ((): RunawayJsonObject => {
                            const serialized = ToRunawayJsonValue(s.templateParameters as RunawaySerializable);
                            return IsPlainObject(serialized) ? (serialized as RunawayJsonObject) : {};
                        })(),
                    } : {}),
                    ...(s.terminateAfter !== undefined ? { terminateAfter: s.terminateAfter } : {}),
                })),
            } : {}),
            ...(nextStep.forEach ? { forEach: nextStep.forEach } : {}),
            ...(nextStep.while ? { while: nextStep.while } : {}),
            ...(nextStep.priorStepResult !== undefined
                ? { priorStepResult: ToRunawayJsonValue(nextStep.priorStepResult as RunawaySerializable) }
                : {}),
            ...(IsPlainObject(rawPayloadChange) ? { payloadChangeRequest: rawPayloadChange as RunawayJsonObject } : {}),
            ...(loopCursor ? { LoopCursor: loopCursor } : {}),
        };
    }

    private applyPausedStateToRun(
        agentRun: MJAIAgentRunEntityExtended,
        checkpoint: RunawayCheckpointState,
        inFlightPayload: RunawaySerializable,
    ): void {
        agentRun.Status = 'Paused';
        agentRun.CompletedAt = null;
        agentRun.Success = null;
        agentRun.ErrorMessage = null;
        agentRun.Message = checkpoint.Summary;
        if (inFlightPayload !== undefined) {
            agentRun.FinalPayloadObject = inFlightPayload;
            agentRun.FinalPayload = JSON.stringify(inFlightPayload);
        }
        AttachRunawayCheckpointToAgentRun(agentRun, checkpoint);
    }

    private buildOwnerNotificationPayload(checkpoint: RunawayCheckpointState): OwnerPauseNotificationPayload {
        const evidenceLines = [
            `Run ID: ${checkpoint.AgentRunID}`,
            `Pause Reason: ${checkpoint.PauseReason}`,
            `Summary: ${checkpoint.Summary}`,
            `Completed Steps: ${checkpoint.CompletedStepCount} (Prompt Turns: ${checkpoint.CompletedPromptTurns})`,
            `Cumulative Spend: $${checkpoint.CumulativeLedger.RunCostUsd.toFixed(4)} | Active Time: ${Math.round(checkpoint.CumulativeLedger.RunWallClockMs)}ms`,
        ];
        if (checkpoint.Evidence.BudgetBreach) {
            evidenceLines.push(`Budget Breach: ${checkpoint.Evidence.BudgetBreach.Reason}`);
        }
        if (checkpoint.Evidence.FastJudgeResult) {
            evidenceLines.push(`Fast Judge: ${checkpoint.Evidence.FastJudgeResult.Reason}`);
        }
        const evidenceSummary = evidenceLines.join('\n');

        const approvalForm: AgentResponseForm = {
            title: `Approve & Resume ${checkpoint.AgentName}`,
            description: evidenceSummary,
            submitLabel: 'Approve & Extend Budget',
            questions: [
                {
                    id: 'additionalCostUsd',
                    label: 'Additional USD Budget',
                    type: { type: 'number', min: 0 },
                    required: false,
                },
                {
                    id: 'additionalWallClockMs',
                    label: 'Additional Wall-Clock Time (ms)',
                    type: { type: 'number', min: 0 },
                    required: false,
                },
                {
                    id: 'notes',
                    label: 'Approval Notes',
                    type: { type: 'textarea' },
                    required: false,
                },
            ],
        };

        return {
            RecipientUserID: checkpoint.UserID,
            Title: `Agent '${checkpoint.AgentName}' paused (${checkpoint.PauseReason})`,
            Message: evidenceSummary,
            AgentRunID: checkpoint.AgentRunID,
            AgentID: checkpoint.AgentID,
            AgentName: checkpoint.AgentName,
            CheckpointID: checkpoint.CheckpointID,
            PauseReason: checkpoint.PauseReason,
            EvidenceSummary: evidenceSummary,
            CumulativeLedger: checkpoint.CumulativeLedger,
            ApprovalForm: approvalForm,
            ResourceConfiguration: {
                Type: 'RunawayPauseApproval',
                AgentRunID: checkpoint.AgentRunID,
                CheckpointID: checkpoint.CheckpointID,
                PauseReason: checkpoint.PauseReason,
                RunCostUsd: checkpoint.CumulativeLedger.RunCostUsd,
                RunWallClockMs: checkpoint.CumulativeLedger.RunWallClockMs,
            },
        };
    }

    private async persistOwnerNotification(
        provider: IMetadataProvider,
        contextUser: UserInfo | undefined,
        payload: OwnerPauseNotificationPayload,
    ): Promise<string | null> {
        if (!payload.RecipientUserID) {
            return null;
        }
        try {
            const notification = await provider.GetEntityObject<MJUserNotificationEntity>(
                'MJ: User Notifications',
                contextUser,
            );
            notification.UserID = payload.RecipientUserID;
            notification.Title = payload.Title;
            notification.Message = payload.Message;
            notification.Unread = true;
            if (IsValidUUID(payload.AgentRunID)) {
                notification.ResourceRecordID = payload.AgentRunID;
            }
            notification.ResourceConfiguration = JSON.stringify(payload.ResourceConfiguration);
            const saved = await notification.Save();
            if (!saved) {
                LogError(`RunawayCheckpointManager: notification save failed: ${notification.LatestResult?.CompleteMessage ?? 'unknown'}`);
                return null;
            }
            return notification.ID || null;
        } catch (err) {
            LogError(`RunawayCheckpointManager: notification failed (contained): ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    private async persistApprovalRequest(
        provider: IMetadataProvider,
        contextUser: UserInfo | undefined,
        agentId: string,
        agentRunId: string,
        userId: string | null,
        checkpoint: RunawayCheckpointState,
        notificationPayload: OwnerPauseNotificationPayload,
    ): Promise<string | null> {
        try {
            const request = await provider.GetEntityObject<MJAIAgentRequestEntity>(
                'MJ: AI Agent Requests',
                contextUser,
            );
            request.AgentID = agentId;
            if (IsValidUUID(agentRunId)) {
                request.OriginatingAgentRunID = agentRunId;
            }
            if (userId && IsValidUUID(userId)) {
                request.RequestForUserID = userId;
            }
            request.Status = 'Requested';
            request.Request = notificationPayload.Message;
            request.ResponseSchema = JSON.stringify(notificationPayload.ApprovalForm);
            request.Comments = `CheckpointID=${checkpoint.CheckpointID}`;
            const saved = await request.Save();
            return saved && request.ID ? request.ID : null;
        } catch {
            // Best-effort approval request creation; checkpoint + user notification remain authoritative
            return null;
        }
    }

    private async resolveAgentRun(
        existingRun: MJAIAgentRunEntityExtended | undefined,
        runId: string | undefined,
        provider: IMetadataProvider | undefined,
        contextUser: UserInfo | undefined,
    ): Promise<MJAIAgentRunEntityExtended> {
        if (existingRun) {
            return existingRun;
        }
        if (!runId || !provider) {
            throw new Error('Either AgentRun or both AgentRunID and Provider must be supplied');
        }
        const loaded = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
        const ok = await loaded.Load(runId);
        if (!ok) {
            throw new Error(`Could not load paused MJ: AI Agent Runs record '${runId}'`);
        }
        return loaded;
    }

    private openPauseInterval(existing: readonly BudgetPausedInterval[], pausedAtMs: number): BudgetPausedInterval[] {
        const copy = existing.map((i) => ({ ...i }));
        const hasOpen = copy.some((i) => i.ResumedAtMs === undefined || i.ResumedAtMs === null);
        if (!hasOpen) {
            copy.push({ PausedAtMs: pausedAtMs, ResumedAtMs: null });
        }
        return copy;
    }

    private closeOpenPauseInterval(existing: readonly BudgetPausedInterval[], resumedAtMs: number): BudgetPausedInterval[] {
        return existing.map((i) =>
            i.ResumedAtMs === undefined || i.ResumedAtMs === null
                ? { ...i, ResumedAtMs: resumedAtMs }
                : { ...i },
        );
    }

    private serializeMessages(messages: readonly ChatMessage[]): CheckpointMessageRecord[] {
        return messages.map((m) => ({
            Role: m.role,
            Content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
    }

    private restoreChatMessages(records: readonly CheckpointMessageRecord[]): ChatMessage[] {
        return records.map((r) => ({
            role: r.Role,
            content: r.Content,
        }));
    }
}
