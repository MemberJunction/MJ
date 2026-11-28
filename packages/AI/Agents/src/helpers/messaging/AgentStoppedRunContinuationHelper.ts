/**
 * @fileoverview Cohesive internal collaborator handling prior-turn tool-result carry-forward,
 * user-stopped run continuation (full-stack resume & summary fallback), and open sub-agent
 * consultation reloading.
 *
 * Extracted cleanly from `BaseAgent` (Slice `s1`) with zero runtime behavior changes.
 *
 * @module @memberjunction/ai-agents
 */

import type { ActionParam } from '@memberjunction/actions-base';
import { ActionEngineServer } from '@memberjunction/actions';
import type { ChatMessage } from '@memberjunction/ai';
import {
    type AgentAction,
    type AgentChatMessage,
    type AgentChatMessageMetadata,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type StopContinuationMode,
} from '@memberjunction/ai-core-plus';
import { RunView, ValidateDecisionReadResult } from '@memberjunction/core';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import { IsValidUUID } from '@memberjunction/global';
import { BuildAssistantToolCallTurn } from '../../native-tools/tool-result-turns';
import { PriorTurnToolResultCache } from '../../prior-turn-tool-result-cache';
import {
    CanAgentOwnSubAgentConsults,
    FormatReloadedConsultsMessage,
    LoadOpenSubAgentConsults,
    type SubAgentConsultRecord,
} from '../../sub-agent-consult';
import {
    CarryForwardToolFamily,
    type CarryForwardStepRecord,
    type CarryForwardToolStepOutput,
    FormatToolResultSection,
    RenderToolResultData,
    type StoppedRunStepRecord,
} from '../../tool-result-format';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ActionResultSummary,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
} from '../base-agent-types';

/**
 * Handles prior-turn tool-result carry-forward, user-stopped run full-stack / summary resume,
 * and open sub-agent consultation reloading on behalf of {@link AgentMessagingHelper}.
 */
export class AgentStoppedRunContinuationHelper {
    /** The mode a run uses when the caller does not set `ExecuteAgentParams.stopContinuationMode`. */
    public static readonly DefaultStopContinuationMode: StopContinuationMode = 'full_stack';

    /**
     * Placed just before the user's new message when a stopped run's stack is resumed, so the model
     * knows the turns above it were interrupted and what follows is how to continue.
     */
    public static readonly StoppedRunResumeNotice =
        '[Note: The user stopped the previous execution at this point. The instruction that follows is the continuation request.]';

    /** Result code and message for an action the stopped run requested but never ran. */
    private static readonly stoppedBeforeRunResultCode = 'NOT_EXECUTED';
    private static readonly stoppedBeforeRunMessage = 'Not executed: the user stopped the run before this action finished.';

    /** Budget for the stopped-run carry-forward message (~7k tokens). */
    public static readonly MaxStoppedRunResultChars = 28_000;

    /** Tool families whose step results are eligible for prior-turn carry-forward. */
    public static readonly CarryForwardToolFamilies: readonly string[] = Object.values(CarryForwardToolFamily);

    /** Run statuses that count as a successfully settled root turn. */
    public static readonly SettledRunStatuses: ReadonlyArray<MJAIAgentRunEntityExtended['Status']> =
        MJAIAgentRunEntityExtended.SettledStatuses;

    /** Single source of truth for prior-turn carry-forward DB query and cache population. */
    public static readonly CarryForwardPredicate = {
        stepType: 'Tool',
        stepStatus: 'Completed',
        runStatuses: AgentStoppedRunContinuationHelper.SettledRunStatuses,
    } as const satisfies {
        stepType: MJAIAgentRunStepEntityExtended['StepType'];
        stepStatus: MJAIAgentRunStepEntityExtended['Status'];
        runStatuses: ReadonlyArray<MJAIAgentRunEntityExtended['Status']>;
    };

    /** Single source of truth for stopped-run summary step query and filter. */
    public static readonly StoppedRunCarryForwardPredicate = {
        stepTypes: ['Actions', 'Tool'],
        stepStatus: 'Completed',
    } as const satisfies {
        stepTypes: ReadonlyArray<MJAIAgentRunStepEntityExtended['StepType']>;
        stepStatus: MJAIAgentRunStepEntityExtended['Status'];
    };

    /** An action parameter's direction, as the action executor stamps it. */
    private static readonly actionOutputParamType: ActionParam['Type'] = 'Output';

    /** A stopped-run result section is never cut below this many characters, whatever the budget. */
    private static readonly minStoppedRunSectionChars = 1_500;

    /** Display name of the seeded system prompt behind `summarizeRange`'s recursive sub-call. */
    public static readonly SummarizeRangePromptName = 'Summarize Conversation Range';

    /** `messageType` marker stamped on injected tool-result messages. */
    public static readonly ToolResultMessageType = 'tool-result' as const;

    public async InjectPriorTurnToolResults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        if (!params.conversationId || ctx.Depth !== 0 || params.ConversationHistoryFrom || ctx.Hooks.RunAudienceAddsReader(params)) {
            return;
        }
        try {
            const steps = await ctx.Hooks.LoadPriorTurnToolResultSteps(params);
            const body = AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage(
                steps,
                ctx.Hooks.MaxStandaloneToolResultChars()
            );
            if (!body) {
                return;
            }
            params.conversationMessages.push(this.buildCarryForwardMessage(body));
            ctx.Hooks.LogStatus(`[PriorTurnToolResults] Carried ${steps.length} tool result(s) forward from the previous run`, true, params);
        } catch (error) {
            ctx.Hooks.LogStatus(`[PriorTurnToolResults] Skipped (contained error): ${error instanceof Error ? error.message : error}`, true, params);
        }
    }

    public async InjectStoppedRunResults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        const continuationMessage = params.conversationMessages[params.conversationMessages.length - 1];
        const continuation = await ctx.Hooks.LoadStoppedRunContinuation(params);
        ctx.Hooks.ApplyStoppedRunContinuation(params, continuation, continuationMessage);
    }

    public async LoadStoppedRunContinuation(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<StoppedRunContinuation | null> {
        if (!params.conversationId || ctx.Depth !== 0 || params.ConversationHistoryFrom) {
            return null;
        }
        try {
            const runId = params.lastRunId
                ? await this.userStoppedRunIdIfStopped(ctx, params.lastRunId, params)
                : await this.findUserStoppedPredecessorRunId(ctx, params);
            if (!runId) {
                return null;
            }
            const mode = params.stopContinuationMode ?? AgentStoppedRunContinuationHelper.DefaultStopContinuationMode;
            const steps = mode === 'full_stack'
                ? await this.loadStoppedRunStack(ctx, runId, params)
                : await this.loadStoppedRunResultSteps(ctx, runId, params);
            return { RunID: runId, Mode: mode, Steps: steps };
        } catch (error) {
            ctx.Hooks.LogStatus(`[StoppedRunResults] Skipped (contained error): ${error instanceof Error ? error.message : error}`, true, params);
            return null;
        }
    }

    public ApplyStoppedRunContinuation(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        continuation: StoppedRunContinuation | null,
        continuationMessage: ChatMessage | undefined
    ): void {
        if (!continuation) {
            return;
        }
        try {
            if (continuation.Mode === 'full_stack' && this.tryResumeStoppedRunStack(ctx, params, continuation, continuationMessage)) {
                return;
            }
            const steps = continuation.Steps.filter(AgentStoppedRunContinuationHelper.isCarriedForwardResultStep);
            const body = AgentStoppedRunContinuationHelper.BuildStoppedRunResultsMessage(
                steps,
                AgentStoppedRunContinuationHelper.MaxStoppedRunResultChars
            );
            if (!body) {
                return;
            }
            params.conversationMessages.push(this.buildCarryForwardMessage(body));
            ctx.Hooks.LogStatus(`[StoppedRunResults] Carried ${steps.length} completed step result(s) forward from stopped run ${continuation.RunID}`, true, params);
        } catch (error) {
            ctx.Hooks.LogStatus(`[StoppedRunResults] Skipped (contained error): ${error instanceof Error ? error.message : error}`, true, params);
        }
    }

    public async LoadOpenConsults(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<SubAgentConsultRecord[]> {
        if (!params.lastRunId || !IsValidUUID(params.lastRunId) || !CanAgentOwnSubAgentConsults(params.agent)) {
            return [];
        }
        try {
            const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
            const runResult = await rv.RunView<{
                ID: string;
                FinalStep: string | null;
                Status: string;
                CancellationReason: string | null;
            }>({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${params.lastRunId}'`,
                MaxRows: 1,
                Fields: ['ID', 'FinalStep', 'Status', 'CancellationReason'],
                ResultType: 'simple',
                BypassCache: true,
            }, params.contextUser);

            const priorRun = runResult.Success ? runResult.Results?.[0] : undefined;
            if (
                !priorRun ||
                priorRun.FinalStep !== 'Chat' ||
                MJAIAgentRunEntityExtended.IsUserStopped(priorRun.Status, priorRun.CancellationReason)
            ) {
                return [];
            }

            return await LoadOpenSubAgentConsults(ctx.ProviderToUse, params.lastRunId, params.contextUser);
        } catch (error) {
            ctx.Hooks.LogStatus(
                `[SubAgentConsult] Skipped loading open consults (contained error): ${error instanceof Error ? error.message : error}`,
                true,
                params
            );
            return [];
        }
    }

    public ApplyOpenConsults(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        openConsults: SubAgentConsultRecord[],
        continuationMessage: ChatMessage | undefined
    ): void {
        if (!openConsults || openConsults.length === 0) {
            return;
        }
        try {
            for (const consult of openConsults) {
                if (consult.childRunId) {
                    ctx.OpenSubAgentConsults.set(consult.childRunId, consult);
                }
            }
            const content = FormatReloadedConsultsMessage(openConsults);
            if (!content) {
                return;
            }
            const metadata: AgentChatMessageMetadata = {
                turnAdded: 0,
                messageType: 'sub-agent-consult',
                ...(openConsults.length === 1
                    ? {
                          subAgentName: openConsults[0].subAgentName,
                          subAgentId: openConsults[0].subAgentId,
                      }
                    : {}),
                expirationTurns: 3,
                expirationMode: 'Remove',
            };
            const consultReminder: AgentChatMessage = {
                role: 'user',
                content,
                metadata,
            };

            const at = continuationMessage ? params.conversationMessages.indexOf(continuationMessage) : -1;
            if (at >= 0) {
                params.conversationMessages.splice(at, 0, consultReminder);
            } else {
                let lastUserIdx = -1;
                for (let i = params.conversationMessages.length - 1; i >= 0; i--) {
                    if (params.conversationMessages[i].role === 'user') {
                        lastUserIdx = i;
                        break;
                    }
                }
                if (lastUserIdx >= 0) {
                    params.conversationMessages.splice(lastUserIdx, 0, consultReminder);
                } else {
                    params.conversationMessages.push(consultReminder);
                }
            }
            ctx.Hooks.LogStatus(
                `[SubAgentConsult] Reloaded ${openConsults.length} open consult(s) from prior run ${params.lastRunId}`,
                true,
                params
            );
        } catch (error) {
            ctx.Hooks.LogStatus(
                `[SubAgentConsult] Skipped applying open consults (contained error): ${error instanceof Error ? error.message : error}`,
                true,
                params
            );
        }
    }

    private tryResumeStoppedRunStack(
        ctx: AgentRunContext,
        params: ExecuteAgentParams,
        continuation: StoppedRunContinuation,
        continuationMessage: ChatMessage | undefined
    ): boolean {
        try {
            const resumed = ctx.Hooks.BuildResumedStoppedRunTurns(continuation.Steps, params);
            if (resumed && AgentStoppedRunContinuationHelper.SpliceResumedTurns(params.conversationMessages, resumed, continuationMessage)) {
                ctx.Hooks.LogStatus(`[StoppedRunResume] Resumed ${resumed.length} message(s) from stopped run ${continuation.RunID}`, true, params);
                return true;
            }
            ctx.Hooks.LogStatus(`[StoppedRunResume] Stack of stopped run ${continuation.RunID} could not be resumed; carrying its results as a summary`, true, params);
        } catch (error) {
            ctx.Hooks.LogStatus(`[StoppedRunResume] Resume failed (${error instanceof Error ? error.message : error}); carrying its results as a summary`, true, params);
        }
        return false;
    }

    public BuildResumedStoppedRunTurns(
        ctx: AgentRunContext,
        steps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] | null {
        const prompts = steps.filter(s => s.StepType === 'Prompt');
        if (prompts.length === 0) {
            return null;
        }
        const firstStack = AgentStoppedRunContinuationHelper.readPromptStepStack(prompts[0]);
        if (!firstStack?.length) {
            return null;
        }
        const lastPrompt = prompts[prompts.length - 1];
        let fullAt = prompts.length - 1;
        while (fullAt > 0 && AgentStoppedRunContinuationHelper.isPromptStepDelta(prompts[fullAt])) {
            fullAt--;
        }
        const loopTurns = AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(
            firstStack,
            AgentStoppedRunContinuationHelper.readPromptStepStack(prompts[fullAt])
        );
        if (!loopTurns) {
            return null;
        }
        for (const prompt of prompts.slice(fullAt + 1)) {
            const delta = AgentStoppedRunContinuationHelper.readPromptStepStack(prompt);
            if (!delta) {
                return null;
            }
            loopTurns.push(...delta.filter(m => m.metadata?.volatileState !== true));
        }
        const decision = lastPrompt.Status === 'Completed'
            ? AgentStoppedRunContinuationHelper.readPromptStepDecision(lastPrompt)
            : null;
        const tail = ctx.Hooks.BuildStoppedRunTail(decision, steps.filter(s => s.StepNumber > lastPrompt.StepNumber), params);
        return [...loopTurns, ...tail].map(AgentStoppedRunContinuationHelper.restampResumedTurn);
    }

    public static ExtractStoppedRunLoopTurns(
        firstStack: AgentChatMessage[] | null,
        lastStack: AgentChatMessage[] | null
    ): AgentChatMessage[] | null {
        if (!firstStack?.length || !lastStack?.length) {
            return null;
        }
        const key = (m: ChatMessage): string => `${m.role}\u0000${JSON.stringify(m.content)}`;
        const startKey = key(firstStack[firstStack.length - 1]);
        const expectedAt = firstStack.length - 1;
        const at = lastStack[expectedAt] && key(lastStack[expectedAt]) === startKey
            ? expectedAt
            : lastStack.map(key).lastIndexOf(startKey);
        if (at < 0) {
            return null;
        }
        return lastStack.slice(at + 1).filter(m => m.metadata?.volatileState !== true);
    }

    public static SpliceResumedTurns(
        messages: ChatMessage[],
        resumed: AgentChatMessage[],
        continuationMessage: ChatMessage | undefined
    ): boolean {
        const at = continuationMessage ? messages.indexOf(continuationMessage) : -1;
        if (at < 0 || continuationMessage?.role !== 'user') {
            return false;
        }
        const notice: AgentChatMessage = { role: 'user', content: AgentStoppedRunContinuationHelper.StoppedRunResumeNotice };
        const previous = messages[at - 1] as AgentChatMessage | undefined;
        const stoppedReplyAt = previous?.role === 'assistant' && !previous.toolCalls?.length ? at - 1 : at;
        messages.splice(at, 0, notice);
        messages.splice(stoppedReplyAt, 0, ...resumed);
        return true;
    }

    public BuildStoppedRunTail(
        ctx: AgentRunContext,
        decision: BaseAgentNextStep | null,
        tailSteps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] {
        const tail: AgentChatMessage[] = [];
        if (!decision) {
            return tail;
        }
        const scratch: ExecuteAgentParams = { ...params, conversationMessages: tail };
        const native = decision.nativeTurn?.sendResultsNatively === true;
        if (native && decision.nativeTurn) {
            tail.push(BuildAssistantToolCallTurn(decision.nativeTurn) as AgentChatMessage);
        }
        if (decision.step === 'Actions' && decision.actions?.length) {
            if (!native) {
                tail.push({ role: 'user', content: ctx.Hooks.BuildActionInvocationMessage(decision.actions, params) });
            }
            const summaries = this.summarizeStoppedRunActions(ctx, decision.actions, tailSteps);
            ctx.Hooks.AppendActionResults(scratch, summaries, ctx.Hooks.BuildActionResultsMessage(summaries), undefined, decision);
        } else {
            const results = AgentStoppedRunContinuationHelper.BuildStoppedRunResultsMessage(
                tailSteps.filter(AgentStoppedRunContinuationHelper.isCarriedForwardResultStep),
                AgentStoppedRunContinuationHelper.MaxStoppedRunResultChars
            );
            if (results) {
                tail.push(this.buildCarryForwardMessage(results));
            }
        }
        ctx.Hooks.ReconcileUnansweredToolCalls(scratch);
        return tail;
    }

    private summarizeStoppedRunActions(
        ctx: AgentRunContext,
        requested: AgentAction[],
        tailSteps: StoppedRunStackStepRecord[]
    ): ActionResultSummary[] {
        const completed = tailSteps.filter(s => s.StepType === 'Actions' && s.Status === 'Completed');
        const used = new Set<StoppedRunStackStepRecord>();
        return requested.map(action => {
            const step = completed.find(s => !used.has(s) && AgentStoppedRunContinuationHelper.readStoppedActionName(s) === action.name);
            const summary = step ? this.summarizeStoppedActionStep(ctx, action.name, step) : null;
            if (!step || !summary) {
                return {
                    actionName: action.name,
                    success: false,
                    params: [],
                    resultCode: AgentStoppedRunContinuationHelper.stoppedBeforeRunResultCode,
                    message: AgentStoppedRunContinuationHelper.stoppedBeforeRunMessage,
                };
            }
            used.add(step);
            return summary;
        });
    }

    private summarizeStoppedActionStep(
        ctx: AgentRunContext,
        actionName: string,
        step: StoppedRunStackStepRecord
    ): ActionResultSummary | null {
        let output: { actionResult?: { success?: boolean; resultCode?: string; message?: string; parameters?: ActionParam[] } };
        try {
            output = step.OutputData ? JSON.parse(step.OutputData) : {};
        } catch {
            return null;
        }
        const result = output.actionResult;
        if (!result) {
            return null;
        }
        const success = result.success === true;
        const outputParams = (result.parameters ?? []).filter(p => p.Type === 'Both' || p.Type === 'Output');
        const actionEntity = ActionEngineServer.Instance.Actions?.find(a => a.Name === actionName);
        return {
            actionName,
            success,
            params: ctx.Hooks.InterceptLargeBinaryContent(outputParams, actionEntity),
            resultCode: result.resultCode || (success ? 'SUCCESS' : 'ERROR'),
            message: result.message || (success ? 'Action completed' : 'Unknown error'),
        };
    }

    private static readPromptStepStack(step: StoppedRunStackStepRecord): AgentChatMessage[] | null {
        try {
            const input: { conversationMessages?: AgentChatMessage[] } = step.InputData ? JSON.parse(step.InputData) : {};
            return Array.isArray(input.conversationMessages) ? input.conversationMessages : null;
        } catch {
            return null;
        }
    }

    private static isPromptStepDelta(step: StoppedRunStackStepRecord): boolean {
        try {
            const input: { conversationMessagesDelta?: boolean } = step.InputData ? JSON.parse(step.InputData) : {};
            return input.conversationMessagesDelta === true;
        } catch {
            return false;
        }
    }

    private static readPromptStepDecision(step: StoppedRunStackStepRecord): BaseAgentNextStep | null {
        try {
            const output: { nextStep?: BaseAgentNextStep } = step.OutputData ? JSON.parse(step.OutputData) : {};
            return output.nextStep ?? null;
        } catch {
            return null;
        }
    }

    private static readStoppedActionName(step: StoppedRunStackStepRecord): string | null {
        try {
            const input: { actionName?: string } = step.InputData ? JSON.parse(step.InputData) : {};
            return input.actionName ?? null;
        } catch {
            return null;
        }
    }

    private static restampResumedTurn(message: AgentChatMessage): AgentChatMessage {
        return message.metadata?.turnAdded !== undefined
            ? { ...message, metadata: { ...message.metadata, turnAdded: 0 } }
            : message;
    }

    private static isCarriedForwardResultStep(step: StoppedRunStackStepRecord): boolean {
        const types: ReadonlyArray<string> = AgentStoppedRunContinuationHelper.StoppedRunCarryForwardPredicate.stepTypes;
        return types.includes(step.StepType) &&
            step.Status === AgentStoppedRunContinuationHelper.StoppedRunCarryForwardPredicate.stepStatus &&
            step.Success === true;
    }

    private buildCarryForwardMessage(content: string): AgentChatMessage {
        return {
            role: 'user',
            content,
            metadata: {
                turnAdded: 0,
                messageType: AgentStoppedRunContinuationHelper.ToolResultMessageType,
                expirationTurns: 2,
                expirationMode: 'Compact',
                compactMode: 'First N Chars',
                compactLength: 500,
                compactPromptId: '',
            },
        };
    }

    private async findUserStoppedPredecessorRunId(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
        const newest = await rv.RunView<{ ID: string; Status: string; CancellationReason: string | null }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: MJAIAgentRunEntityExtended.BuildStoppedPredecessorFilter(
                params.conversationId!, params.agent.ID, params.ConversationBranchID ?? null, ctx.ConversationBranches
            ),
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            SkipTotalRowCount: true,
            Fields: ['ID', 'Status', 'CancellationReason'],
            ResultType: 'simple',
            BypassCache: true,
        }, params.contextUser);
        const run = newest.Success ? newest.Results?.[0] : undefined;
        return run && MJAIAgentRunEntityExtended.IsUserStopped(run.Status, run.CancellationReason) ? run.ID : null;
    }

    private async userStoppedRunIdIfStopped(ctx: AgentRunContext, runId: string, params: ExecuteAgentParams): Promise<string | null> {
        if (!IsValidUUID(runId)) {
            return null;
        }
        const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
        const result = await rv.RunView<{ ID: string; Status: string; CancellationReason: string | null }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${runId}'`,
            MaxRows: 1,
            SkipTotalRowCount: true,
            Fields: ['ID', 'Status', 'CancellationReason'],
            ResultType: 'simple',
            BypassCache: true,
        }, params.contextUser);
        const run = result.Success ? result.Results?.[0] : undefined;
        return run && MJAIAgentRunEntityExtended.IsUserStopped(run.Status, run.CancellationReason) ? run.ID : null;
    }

    private async loadStoppedRunStack(
        ctx: AgentRunContext,
        runId: string,
        params: ExecuteAgentParams
    ): Promise<StoppedRunStackStepRecord[]> {
        const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
        const steps = await rv.RunView<StoppedRunStackStepRecord>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runId}'`,
            OrderBy: 'StepNumber ASC',
            Fields: ['StepNumber', 'StepType', 'StepName', 'Status', 'Success', 'InputData', 'OutputData'],
            ResultType: 'simple',
            BypassCache: true,
            IgnoreMaxRows: true,
        }, params.contextUser);
        const validated = ValidateDecisionReadResult(steps, {
            EntityName: 'MJ: AI Agent Run Steps',
            OperationName: 'BaseAgent.loadStoppedRunStack',
        });
        if ('Error' in validated) {
            if (validated.Truncated) {
                throw validated.Error;
            }
            return [];
        }
        return validated.Results;
    }

    private async loadStoppedRunResultSteps(
        ctx: AgentRunContext,
        runId: string,
        params: ExecuteAgentParams
    ): Promise<StoppedRunStackStepRecord[]> {
        const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
        const predicate = AgentStoppedRunContinuationHelper.StoppedRunCarryForwardPredicate;
        const steps = await rv.RunView<StoppedRunStackStepRecord>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${runId}' AND StepType IN (${predicate.stepTypes.map(t => `'${t}'`).join(', ')}) ` +
                `AND Status='${predicate.stepStatus}' AND Success=1`,
            OrderBy: 'StepNumber ASC',
            Fields: ['StepNumber', 'StepType', 'StepName', 'Status', 'Success', 'InputData', 'OutputData'],
            ResultType: 'simple',
            BypassCache: true,
            IgnoreMaxRows: true,
        }, params.contextUser);
        const validated = ValidateDecisionReadResult(steps, {
            EntityName: 'MJ: AI Agent Run Steps',
            OperationName: 'BaseAgent.loadStoppedRunResultSteps',
        });
        if ('Error' in validated) {
            if (validated.Truncated) {
                throw validated.Error;
            }
            return [];
        }
        return validated.Results;
    }

    public static BuildStoppedRunResultsMessage(steps: ReadonlyArray<StoppedRunStepRecord>, maxChars: number): string | null {
        const sections: string[] = [];
        const perSectionMax = Math.max(
            AgentStoppedRunContinuationHelper.minStoppedRunSectionChars,
            Math.floor(maxChars / Math.max(steps.length, 1))
        );
        let usedChars = 0;
        let dropped = 0;
        for (const step of steps) {
            const section = AgentStoppedRunContinuationHelper.renderStoppedRunStep(step);
            if (!section) {
                continue;
            }
            const capped = section.length > perSectionMax
                ? `${section.slice(0, perSectionMax)}\n[truncated]`
                : section;
            if (usedChars + capped.length > maxChars && sections.length > 0) {
                dropped++;
                continue;
            }
            usedChars += capped.length;
            sections.push(capped);
        }
        if (sections.length === 0) {
            return null;
        }
        const header = 'Your previous turn was stopped by the user before it finished. The actions and tools listed below ' +
            'were ALREADY EXECUTED in that turn and their results are still valid. Treat each entry as a result you already ' +
            'have: do not run the action or call a tool again for it, and do not invoke the action names below as tools. ' +
            'Continue from where the stopped turn left off rather than starting over.';
        const droppedNote = dropped > 0 ? `\n\n[${dropped} additional result(s) omitted for size; re-call those if needed]` : '';
        return `${header}\n${sections.join('\n\n')}${droppedNote}`;
    }

    private static renderStoppedRunStep(step: StoppedRunStepRecord): string | null {
        if (step.StepType === 'Tool') {
            return AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage([{ OutputData: step.OutputData }], Number.MAX_SAFE_INTEGER)
                ?.split('\n').slice(1).join('\n') || null;
        }
        if (step.StepType !== 'Actions' || !step.InputData || !step.OutputData) {
            return null;
        }
        let input: { actionName?: string; actionParams?: unknown };
        let output: { actionResult?: { success?: boolean; message?: string; parameters?: Array<{ Name: string; Value: unknown; Type: string }> } };
        try {
            input = JSON.parse(step.InputData);
            output = JSON.parse(step.OutputData);
        } catch {
            return null;
        }
        const result = output.actionResult;
        if (!input.actionName || result?.success !== true) {
            return null;
        }
        const outputs: Record<string, unknown> = {};
        for (const param of result.parameters ?? []) {
            if (param.Type === AgentStoppedRunContinuationHelper.actionOutputParamType && param.Value !== undefined && param.Value !== null) {
                outputs[param.Name] = param.Value;
            }
        }
        const body = Object.keys(outputs).length > 0 ? RenderToolResultData(outputs) : (result.message ?? '');
        if (!body) {
            return null;
        }
        return `### Already executed: action "${input.actionName}" with params ${JSON.stringify(input.actionParams ?? {})}\n` +
            `Result:\n\`\`\`json\n${body}\n\`\`\``;
    }

    public static BuildPriorTurnRunFilter(
        conversationId: string,
        agentId: string,
        branchId: string | null,
        branches: ReadonlyArray<ConversationBranchRow>,
        statusList: string
    ): string {
        return `ConversationID='${conversationId}' AND Status IN (${statusList}) AND ParentRunID IS NULL AND AgentID='${agentId}'`
            + ` AND ${MJAIAgentRunEntityExtended.BuildReplyOnBranchPathFilter(conversationId, branchId, branches)}`;
    }

    public async LoadPriorTurnToolResultSteps(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]> {
        const branchId = params.ConversationBranchID ?? null;
        const cached = PriorTurnToolResultCache.Instance.Get(params.conversationId!, params.agent.ID, branchId);
        if (cached) {
            ctx.Hooks.LogStatus(`[PriorTurnToolResults] Prior-run tool results served from cache (${cached.length} step(s), no DB lookup)`, true, params);
            return cached;
        }

        const predicate = AgentStoppedRunContinuationHelper.CarryForwardPredicate;
        const statusList = predicate.runStatuses.map(s => `'${s}'`).join(', ');
        const rv = RunView.FromMetadataProvider(ctx.ProviderToUse);
        const priorRun = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: AgentStoppedRunContinuationHelper.BuildPriorTurnRunFilter(
                params.conversationId!,
                params.agent.ID,
                branchId,
                ctx.ConversationBranches,
                statusList
            ),
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            SkipTotalRowCount: true,
            Fields: ['ID'],
            ResultType: 'simple',
        }, params.contextUser);
        const priorRunId = priorRun.Success ? priorRun.Results?.[0]?.ID : undefined;
        if (!priorRunId) {
            return [];
        }

        const steps = await rv.RunView<CarryForwardStepRecord>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `AgentRunID='${priorRunId}' AND StepType='${predicate.stepType}' AND Status='${predicate.stepStatus}'`,
            OrderBy: 'StartedAt ASC',
            Fields: ['OutputData'],
            ResultType: 'simple',
            IgnoreMaxRows: true,
        }, params.contextUser);
        const validated = ValidateDecisionReadResult(steps, {
            EntityName: 'MJ: AI Agent Run Steps',
            OperationName: 'BaseAgent.loadPriorTurnToolResultSteps',
        });
        if ('Error' in validated) {
            if (validated.Truncated) {
                throw validated.Error;
            }
            return [];
        }
        return validated.Results;
    }

    public CachePriorTurnToolResults(ctx: AgentRunContext): void {
        const predicate = AgentStoppedRunContinuationHelper.CarryForwardPredicate;
        const conversationId = ctx.ExecuteParams?.conversationId;
        if (!conversationId || ctx.Depth !== 0 || !ctx.AgentRun
            || !predicate.runStatuses.includes(ctx.AgentRun.Status)) {
            return;
        }
        const records: CarryForwardStepRecord[] = (ctx.AgentRun.Steps || [])
            .filter(s => s.StepType === predicate.stepType && s.Status === predicate.stepStatus)
            .map(s => ({ OutputData: s.OutputData || null }));
        PriorTurnToolResultCache.Instance.Set(
            conversationId,
            ctx.AgentRun.AgentID,
            ctx.ExecuteParams?.ConversationBranchID ?? null,
            records,
            ctx.AgentRun.ConversationDetailID ?? null
        );
    }

    public static BuildPriorTurnToolResultsMessage(
        steps: CarryForwardStepRecord[],
        maxChars: number
    ): string | null {
        const sections: string[] = [];
        let usedChars = 0;
        let dropped = 0;
        for (const step of steps) {
            if (!step.OutputData) continue;
            let parsed: Partial<CarryForwardToolStepOutput>;
            try {
                parsed = JSON.parse(step.OutputData);
            } catch {
                continue;
            }
            if (!parsed.toolFamily || !AgentStoppedRunContinuationHelper.CarryForwardToolFamilies.includes(parsed.toolFamily)) continue;
            if (typeof parsed.tool !== 'string' || parsed.tool.length === 0) continue;
            if (parsed.result?.success !== true) continue;
            if (parsed.trustLevel === 'Untrusted' || parsed.trustLevel === 'SemiTrusted') continue;

            const section = FormatToolResultSection(
                { tool: parsed.tool, input: parsed.input },
                RenderToolResultData(parsed.result.data)
            );
            if (usedChars + section.length > maxChars && sections.length > 0) {
                dropped++;
                continue;
            }
            const capped = section.length > maxChars
                ? `${section.slice(0, maxChars)}\n[truncated]`
                : section;
            usedChars += capped.length;
            sections.push(capped);
        }
        if (sections.length === 0) {
            return null;
        }
        const header = 'Tool results from your previous turn (still valid — reuse instead of re-calling):';
        const droppedNote = dropped > 0 ? `\n\n[${dropped} additional result(s) omitted for size — re-call those tools if needed]` : '';
        return `${header}\n${sections.join('\n\n')}${droppedNote}`;
    }
}
