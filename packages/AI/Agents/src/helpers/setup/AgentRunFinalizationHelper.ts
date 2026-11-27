/**
 * @fileoverview Collaborator owned by {@link AgentRunSetupHelper} encapsulating run
 * finalization (`FinalizeAgentRun`), failure & cancellation result creation, prompt-run
 * save draining, and watchdog untracking (`ReleaseFinishedRun`).
 *
 * @module @memberjunction/ai-agents
 */

import {
    ToAgentRunFinalStep,
    type BaseAgentNextStep,
    type ExecuteAgentResult,
    type GovernedRunArtifactSummary,
    type MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { LogError, type UserInfo } from '@memberjunction/core';
import { AgentRunWatchdog } from '../../agent-run-watchdog';
import { GovernedArtifactService, MergeTouchedArtifactSummary } from '../../GovernedArtifactService';
import type { AgentRunContext } from '../AgentRunContext';
import { AgentPayloadHelper } from '../payload/AgentPayloadHelper';

/**
 * Collaborator handling terminal run persistence, failure/cancelled results, and artifact summaries.
 */
export class AgentRunFinalizationHelper {
    public async FlushPromptRunnerSaves(ctx: AgentRunContext): Promise<void> {
        const runner = ctx.PromptRunner as
            | {
                  FlushPendingSaves?: () => Promise<void>;
                  WaitForPendingPromptRunSaves?: () => Promise<void>;
              }
            | undefined;
        if (typeof runner?.FlushPendingSaves === 'function') {
            await runner.FlushPendingSaves();
        } else if (typeof runner?.WaitForPendingPromptRunSaves === 'function') {
            await runner.WaitForPendingPromptRunSaves();
        }
    }

    public async CreateFailureResult(
        ctx: AgentRunContext,
        errorMessage: string,
        _contextUser?: UserInfo
    ): Promise<ExecuteAgentResult> {
        const [{ failures }] = await Promise.all([
            ctx.StepSaveQueue.Flush(),
            ctx.Hooks.FlushPromptRunnerSaves(),
        ]);
        if (ctx.AgentRun) {
            ctx.AgentRun.Status = 'Failed';
            ctx.AgentRun.CompletedAt = new Date();
            ctx.AgentRun.Success = false;
            ctx.AgentRun.ErrorMessage =
                failures > 0
                    ? `${errorMessage}\n${failures} step record save(s) failed during this run; see logs for details.`
                    : errorMessage;

            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } =
                ctx.Hooks.PrepareRunForFinalSave(ctx.AgentRun);
            const ok = await ctx.Hooks.TrackScopeFinalSave(scope, () =>
                ctx.AgentRun!.Save({ SaveReturnMode: 'datestamps_only' })
            );
            ctx.Hooks.MarkPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.ReleaseFinishedRun(ctx, ok);
        }

        return {
            success: false,
            ...(!ctx.AgentRun ? { errorMessage } : {}),
            taintedSources: ctx.TaintedSources.length > 0 ? [...ctx.TaintedSources] : undefined,
            agentRun: ctx.AgentRun!,
            ...(ctx.TreeBudget?.breachDiagnostic ? { limitExceeded: ctx.TreeBudget.breachDiagnostic } : {}),
        };
    }

    public async CreateCancelledResult(
        ctx: AgentRunContext,
        message: string,
        contextUser?: UserInfo
    ): Promise<ExecuteAgentResult> {
        if (ctx.TreeBudget?.breachDiagnostic && ctx.Hooks.HasExplicitWorkflowBudgetCaps(ctx.ExecuteParams)) {
            return ctx.Hooks.CreateFailureResult(ctx.TreeBudget.breachDiagnostic.Reason, contextUser);
        }
        const abortReason = ctx.RunAbortController?.signal.reason;
        if (AgentRunWatchdog.IsForceFailedAbortReason(typeof abortReason === 'string' ? abortReason : null)) {
            return ctx.Hooks.CreateFailureResult(abortReason, contextUser);
        }
        const [{ failures }] = await Promise.all([
            ctx.StepSaveQueue.Flush(),
            ctx.Hooks.FlushPromptRunnerSaves(),
        ]);
        if (ctx.AgentRun) {
            ctx.AgentRun.Status = 'Cancelled';
            ctx.AgentRun.CompletedAt = new Date();
            ctx.AgentRun.Success = false;
            ctx.AgentRun.ErrorMessage =
                failures > 0
                    ? `${message}\n${failures} step record save(s) failed during this run; see logs for details.`
                    : message;
            const signalReason = ctx.RunAbortController?.signal.reason;
            ctx.AgentRun.CancellationReason = AgentRunFinalizationHelper.CancellationReasonForAbort(
                typeof signalReason === 'string' ? signalReason : message,
                ctx.AgentTimeoutAbortReason,
                ctx.AgentInactivityAbortReason
            );

            if (!ctx.AgentRun.FinalPayload) {
                const lastPayload = AgentPayloadHelper.LastStepPayload(ctx.AgentRun.Steps);
                if (lastPayload) {
                    ctx.AgentRun.FinalPayload = lastPayload;
                }
            }

            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } =
                ctx.Hooks.PrepareRunForFinalSave(ctx.AgentRun);

            if (typeof ctx.AgentRun.MarkServerCancellation === 'function') {
                ctx.AgentRun.MarkServerCancellation();
            }
            const ok = await ctx.Hooks.TrackScopeFinalSave(scope, () =>
                ctx.AgentRun!.Save({ SaveReturnMode: 'datestamps_only' })
            );
            ctx.Hooks.MarkPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.ReleaseFinishedRun(ctx, ok);
        }

        return {
            success: false,
            taintedSources: ctx.TaintedSources.length > 0 ? [...ctx.TaintedSources] : undefined,
            agentRun: ctx.AgentRun!,
            ...(ctx.TreeBudget?.breachDiagnostic ? { limitExceeded: ctx.TreeBudget.breachDiagnostic } : {}),
        };
    }

    public static CancellationReasonForAbort(
        reason: string | null | undefined,
        timeoutAbortReason: string,
        inactivityAbortReason?: string
    ): NonNullable<MJAIAgentRunEntityExtended['CancellationReason']> {
        if (reason === AgentRunWatchdog.UserCancelAbortReason) {
            return 'User Request';
        }
        if (
            reason &&
            (reason.startsWith(timeoutAbortReason) ||
                (inactivityAbortReason && reason.startsWith(inactivityAbortReason)))
        ) {
            return 'Timeout';
        }
        return 'System';
    }

    public ReleaseFinishedRun(ctx: AgentRunContext, saved: boolean): void {
        if (saved && ctx.AgentRun?.ID && ctx.AgentRun.Status !== 'Running') {
            AgentRunWatchdog.Instance.Untrack(ctx.AgentRun.ID);
        }
    }

    public async FinalizeAgentRun<P>(
        ctx: AgentRunContext,
        finalStep: BaseAgentNextStep,
        payload?: P,
        _contextUser?: UserInfo
    ): Promise<ExecuteAgentResult<P>> {
        const [{ failures }] = await Promise.all([
            ctx.StepSaveQueue.Flush(),
            ctx.Hooks.FlushPromptRunnerSaves(),
        ]);
        if (failures > 0 && ctx.AgentRun) {
            const note = `${failures} step record save(s) failed during this run; see logs for details.`;
            ctx.AgentRun.ErrorMessage = ctx.AgentRun.ErrorMessage ? `${ctx.AgentRun.ErrorMessage}\n${note}` : note;
        }

        const isRootAgent = ctx.Depth === 0;
        const resolvedPayload = (
            payload && isRootAgent ? ctx.Hooks.ResolveMediaPlaceholdersInPayload(payload) : payload
        ) as P | undefined;

        const resolvedActionableCommands = (
            finalStep.actionableCommands && isRootAgent
                ? ctx.Hooks.ResolveMediaPlaceholdersInPayload(finalStep.actionableCommands)
                : finalStep.actionableCommands
        ) as BaseAgentNextStep['actionableCommands'];

        if (ctx.AgentRun) {
            const parkedOnWorkflow =
                !!ctx.AwaitingWorkflowTaskID && (finalStep.step === 'Success' || finalStep.step === 'Chat');
            if (!parkedOnWorkflow) {
                ctx.AgentRun.CompletedAt = new Date();
            }
            ctx.AgentRun.Success = finalStep.step === 'Success' || finalStep.step === 'Chat';
            if (!ctx.AgentRun.Success) {
                const errorText = finalStep.errorMessage || finalStep.message;
                if (errorText) {
                    ctx.AgentRun.ErrorMessage =
                        (ctx.AgentRun.ErrorMessage ? ctx.AgentRun.ErrorMessage + '\n\n' : '') + errorText;
                }
            }
            if (!ctx.AgentRun.Success) {
                ctx.AgentRun.Status = 'Failed';
            } else if (parkedOnWorkflow) {
                ctx.AgentRun.Status = 'Paused';
            } else if (finalStep.step === 'Chat') {
                ctx.AgentRun.Status = 'AwaitingFeedback';
            } else {
                ctx.AgentRun.Status = 'Completed';
            }

            const finalPayloadJson = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            ctx.AgentRun.FinalStep = ToAgentRunFinalStep(finalStep.step);
            ctx.AgentRun.Message = finalStep.message ?? null;

            ctx.AgentRun.FinalPayloadObject = resolvedPayload;
            ctx.AgentRun.FinalPayload = finalPayloadJson;

            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } =
                ctx.Hooks.PrepareRunForFinalSave(ctx.AgentRun);

            const ok = await ctx.Hooks.TrackScopeFinalSave(scope, () =>
                ctx.AgentRun!.Save({ SaveReturnMode: 'datestamps_only' })
            );
            ctx.Hooks.MarkPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.ReleaseFinishedRun(ctx, ok);
            if (!ok) {
                LogError(`Failed to finalize agent run ${ctx.AgentRun.ID}`);
            } else {
                ctx.Hooks.CachePriorTurnToolResults();
            }

            ctx.Hooks.StartPostTurnCompaction();

            ctx.ActionSpilloverManager.Clear();
            if (ctx.ExecuteParams) {
                try {
                    await ctx.Hooks.RunPostRunCompaction(ctx.ExecuteParams, ctx.AgentRun);
                } catch (compactionError) {
                    LogError(
                        `Post-run compaction error for agent run ${ctx.AgentRun.ID} (contained): ` +
                            `${compactionError instanceof Error ? compactionError.message : String(compactionError)}`
                    );
                }
            }
        }

        if (finalStep.promoteMediaOutputs && finalStep.promoteMediaOutputs.length > 0) {
            ctx.Hooks.PromoteMediaOutputs(finalStep.promoteMediaOutputs);
        }

        let resolvedArtifactDirective = finalStep.artifactDirective ?? ctx.LastSubAgentArtifactDirective;
        if (resolvedArtifactDirective?.targetArtifactId) {
            const resolvedUuid = ctx.ArtifactToolManager.ResolveArtifactUuid(
                resolvedArtifactDirective.targetArtifactId
            );
            if (resolvedUuid) {
                resolvedArtifactDirective = {
                    ...resolvedArtifactDirective,
                    targetArtifactId: resolvedUuid,
                };
            }
        }

        const resolvedPayloadArtifactTypeID =
            finalStep.payloadArtifactTypeID ?? ctx.LastSubAgentPayloadArtifactTypeID;

        const touchedMap = new Map<string, GovernedRunArtifactSummary>();
        for (const item of ctx.ArtifactToolManager.GetTouchedArtifacts()) {
            const key = item.ArtifactID.trim().toLowerCase();
            touchedMap.set(key, MergeTouchedArtifactSummary(touchedMap.get(key), item));
        }
        for (const item of GovernedArtifactService.Instance.ConsumeTouchedArtifacts(ctx.AgentRun?.ID)) {
            const key = item.ArtifactID.trim().toLowerCase();
            touchedMap.set(key, MergeTouchedArtifactSummary(touchedMap.get(key), item));
        }
        const touchedArtifacts = touchedMap.size > 0 ? Array.from(touchedMap.values()) : undefined;

        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
            payload: resolvedPayload,
            agentRun: ctx.AgentRun!,
            payloadArtifactTypeID: resolvedPayloadArtifactTypeID,
            responseForm: finalStep.responseForm,
            actionableCommands: resolvedActionableCommands,
            automaticCommands: finalStep.automaticCommands,
            artifactDirective: resolvedArtifactDirective,
            memoryContext:
                ctx.InjectedMemory.notes.length > 0 || ctx.InjectedMemory.examples.length > 0
                    ? ctx.InjectedMemory
                    : undefined,
            mediaOutputs: ctx.MediaOutputs.length > 0 ? ctx.MediaOutputs : undefined,
            fileOutputs: ctx.FileOutputs.length > 0 ? ctx.FileOutputs : undefined,
            feedbackRequestId: ctx.FeedbackRequestId || undefined,
            taintedSources: ctx.TaintedSources.length > 0 ? [...ctx.TaintedSources] : undefined,
            handoff: ctx.HandoffResult || undefined,
            resolvedStorageAccountId: ctx.ResolvedStorageAccountId || undefined,
            limitsSnapshot: ctx.AgentRun?.LimitsDiagnosticsSnapshot ?? undefined,
            ...(touchedArtifacts ? { touchedArtifacts } : {}),
            ...(ctx.TreeBudget?.breachDiagnostic ? { limitExceeded: ctx.TreeBudget.breachDiagnostic } : {}),
        };
    }
}
