/**
 * @fileoverview MJServer's implementation of the task-graph `TaskContinuationDeliverer` seam.
 *
 * **The dispatcher shipped with nowhere to deliver.** `StartTaskGraphDispatcher` constructed it
 * without a deliverer at all, so a graph that finished logged its outcome, marked itself delivered,
 * and said nothing to the conversation that asked for it. Durable execution nobody hears about is
 * half a promise — the same shape as Phase 2's dispatcher that ran nothing.
 *
 * Posting into a conversation is a host concern by design: the task-graph package must not depend on
 * the conversation layer, and cannot depend on the agent framework at all without a cycle (agents
 * submit graphs). This adapter is where those dependencies are allowed to live.
 *
 * @module @memberjunction/server
 */
import { LogError, LogStatus, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJAIAgentRunEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import type { PubSubEngine } from 'type-graphql';
import type { ProviderFactory, TaskContinuationDeliverer, TaskContinuationParams } from '@memberjunction/task-graph';
import { PublishStatusUpdate } from '../generic/PushStatusResolver.js';

/** How many per-task lines a posted summary shows before collapsing the rest into a count. */
const MAX_LISTED_TASKS = 20;

/**
 * Delivers a finished graph's outcome — as a conversation message, or by starting the submitting
 * agent a fresh turn.
 *
 * **The chain is bounded, and that is what took a schema change to make true.** A graph may declare
 * `continuation: 'reinvoke'`, and the agent it restarts can emit another graph, which can reinvoke
 * again. The guard for that (`MAX_REINVOKE_DEPTH`) shipped in Phase 3, but the number it compared
 * was permanently zero: `TaskGraphService.Submit` reads `ReinvokeDepth` from its caller, and a
 * reinvoked agent had no way to know it *was* a continuation. `AIAgentRun.ContinuationDepth` closes
 * that loop — this stamps depth + 1 on the run it starts, `BaseAgent` passes it into any graph that
 * run submits, and the cap finally compares against something real.
 */
export class TaskGraphContinuationDeliverer implements TaskContinuationDeliverer {
    /**
     * @param providerFactory mints a fresh provider per delivery, for the same reason the dispatcher
     *        does: deliveries run outside any request and concurrently with task execution, so
     *        sharing one provider would share one transaction scope across unrelated work.
     */
    constructor(
        private readonly providerFactory: ProviderFactory,
        private readonly contextUser: UserInfo,
        private readonly pubSub?: PubSubEngine,
    ) {}

    /**
     * Posts the roll-up as an AI-role message in the graph's conversation, on the fork of the
     * message that started the graph (Main when that message is in Main).
     *
     * Never throws. The dispatcher calls this inside the compare-and-swap that marks a completion
     * delivered; an error escaping would either abort that guard or leave the graph looking
     * undelivered and re-notifying on every later sweep.
     */
    public async PostMessage(params: TaskContinuationParams): Promise<void> {
        try {
            if (!params.ConversationDetailID) {
                // A graph submitted headlessly — a schedule, an entity-change trigger, an API call —
                // has no conversation to answer. Not an error; most workflows are in this shape.
                LogStatus(`[TaskGraphContinuationDeliverer] "${params.WorkflowName}" finished with no conversation to post to.`);
                return;
            }

            const provider = await this.providerFactory.CreateProvider();
            const origin = await this.resolveOrigin(params.ConversationDetailID, provider);
            if (!origin) {
                LogError(
                    `[TaskGraphContinuationDeliverer] Conversation detail ${params.ConversationDetailID} could not be loaded — ` +
                    `"${params.WorkflowName}" has nowhere to post its outcome.`
                );
                return;
            }

            const actingUser = this.resolveActingUser(origin.OwnerUserID);
            const enrichedParams = await this.enrichTasksWithOutputs(params, provider);
            const renderedOutcome = this.renderMessage(enrichedParams);

            if (origin.IsLatest) {
                // No intervening messages were sent while the workflow ran: update the originating
                // message in-place so the single conversation turn holds the progress card, step
                // artifacts, and final outcome together.
                origin.OriginDetail.Status = 'Complete';
                origin.OriginDetail.Message = renderedOutcome;
                if (!(await origin.OriginDetail.Save())) {
                    LogError(
                        `[TaskGraphContinuationDeliverer] Could not update in-place outcome of "${params.WorkflowName}": ` +
                        `${origin.OriginDetail.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                    return;
                }
                this.publishCompletion(
                    origin.OwnerUserID,
                    params.ConversationDetailID,
                    params.ConversationDetailID,
                    origin.ConversationID,
                    params.SubmittedByAgentRunID ?? 'task-graph',
                    true,
                );
                return;
            }

            const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', actingUser);
            detail.NewRecord();
            detail.ConversationID = origin.ConversationID;
            detail.BranchID = origin.BranchID;
            detail.ParentID = params.ConversationDetailID;
            detail.Role = 'AI';
            detail.Status = 'Complete';
            detail.HiddenToUser = false;
            detail.Message = renderedOutcome;

            if (!(await detail.Save())) {
                LogError(
                    `[TaskGraphContinuationDeliverer] Could not post the outcome of "${params.WorkflowName}": ` +
                    `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
                return;
            }

            await this.markOriginDetailCompleted(origin.OriginDetail, params.WorkflowName);

            this.publishCompletion(
                origin.OwnerUserID,
                detail.ID || params.ConversationDetailID,
                params.ConversationDetailID,
                origin.ConversationID,
                params.SubmittedByAgentRunID ?? 'task-graph',
                true,
            );
        } catch (e) {
            LogError(`[TaskGraphContinuationDeliverer] Posting the outcome of "${params.WorkflowName}" threw`, undefined, e);
        }
    }

    /**
     * Starts the submitting agent a fresh turn carrying the graph's outcome.
     *
     * Never throws, for the same reason `PostMessage` does not: the dispatcher calls this inside the
     * compare-and-swap that marks a completion delivered.
     *
     * The new run records `ReinvokeDepth + 1` so the chain is bounded. The dispatcher has already
     * refused to call this when the cap is reached — it degrades to `PostMessage` — so arriving here
     * means there is budget left, and stamping the depth is what keeps that true for the next hop.
     */
    public async Reinvoke(params: TaskContinuationParams): Promise<void> {
        try {
            if (!params.SubmittedByAgentRunID) {
                // Nothing to restart. A graph with no submitting run came from a schedule or a
                // trigger, where "continue the conversation" has no meaning.
                LogStatus(`[TaskGraphContinuationDeliverer] "${params.WorkflowName}" asked to reinvoke but records no submitting agent run — posting instead.`);
                await this.PostMessage(params);
                return;
            }

            const provider = await this.providerFactory.CreateProvider();
            const priorRun = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await priorRun.Load(params.SubmittedByAgentRunID))) {
                LogError(`[TaskGraphContinuationDeliverer] Submitting run ${params.SubmittedByAgentRunID} could not be loaded — posting "${params.WorkflowName}" instead.`);
                await this.PostMessage(params);
                return;
            }

            // When a sub-agent (e.g., Workflow Planner) submitted the workflow on behalf of a parent
            // conversation agent (e.g., Sage), walk up `ParentRunID` so the root conversation agent
            // synthesizes the final response to the user.
            let targetRun = priorRun;
            const initialRunId = (priorRun.ID || params.SubmittedByAgentRunID).toLowerCase();
            const visitedRunIDs = new Set<string>([initialRunId]);
            while (targetRun.ParentRunID && !visitedRunIDs.has(targetRun.ParentRunID.toLowerCase()) && visitedRunIDs.size < 10) {
                visitedRunIDs.add(targetRun.ParentRunID.toLowerCase());
                const parentRun = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
                if (await parentRun.Load(targetRun.ParentRunID)) {
                    targetRun = parentRun;
                } else {
                    break;
                }
            }

            const agent = await provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', this.contextUser);
            if (!(await agent.Load(targetRun.AgentID))) {
                LogError(`[TaskGraphContinuationDeliverer] Agent ${targetRun.AgentID} could not be loaded — posting "${params.WorkflowName}" instead.`);
                await this.PostMessage(params);
                return;
            }

            // Run on the fork of the message that started the graph, as PostMessage posts into it:
            // RunAgent derives the conversation from the detail, but not the fork.
            const runUserId = targetRun.UserID || priorRun.UserID;
            const origin = params.ConversationDetailID
                ? await this.resolveOrigin(params.ConversationDetailID, provider, runUserId)
                : null;
            const ownerUserId = runUserId || origin?.OwnerUserID || this.contextUser.ID;
            const actingUser = this.resolveActingUser(ownerUserId);

            // Adaptive delivery:
            // - When the originating workflow message is still the latest message in the conversation
            //   (origin.IsLatest === true), update it in-place so the single turn carries the workflow
            //   progress card, step artifacts, and synthesized narrative together.
            // - When intervening messages were sent while the workflow ran (origin.IsLatest === false),
            //   create a bottom continuation message linked via ParentID = params.ConversationDetailID
            //   and update the originating message's stale "I'll follow up..." copy.
            let replyDetail: MJConversationDetailEntity | null = null;
            let replySaved = false;
            if (origin?.ConversationID) {
                if (origin.IsLatest) {
                    replyDetail = origin.OriginDetail;
                    replySaved = true;
                } else {
                    replyDetail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', actingUser);
                    replyDetail.NewRecord();
                    replyDetail.ConversationID = origin.ConversationID;
                    replyDetail.BranchID = origin.BranchID;
                    replyDetail.ParentID = params.ConversationDetailID;
                    replyDetail.Role = 'AI';
                    replyDetail.Status = 'In-Progress';
                    replyDetail.HiddenToUser = false;
                    replyDetail.AgentID = agent.ID;
                    replyDetail.Message = `⏳ Synthesizing results from **${params.WorkflowName}**...`;
                    replySaved = await replyDetail.Save();
                }
            }

            const targetDetailId = origin?.IsLatest
                ? (params.ConversationDetailID ?? replyDetail?.ID ?? undefined)
                : ((replyDetail && replySaved && replyDetail.ID)
                    ? replyDetail.ID
                    : (params.ConversationDetailID ?? undefined));

            const enrichedParams = await this.enrichTasksWithOutputs(params, provider);
            const renderedContinuationMessage = this.renderMessage(enrichedParams);

            const runner = new AgentRunner(provider);
            const result = await runner.RunAgent({
                agent,
                provider,
                conversationMessages: [{
                    role: ChatMessageRole.user,
                    content:
                        `${renderedContinuationMessage}\n\n` +
                        `Please synthesize ALL workflow steps above into a clear, direct, comprehensive final response for the user (covering every completed step's findings, SQL queries, data tables, strategic analysis, and report summaries, and briefly explaining any conditional steps that were skipped because their prerequisite condition was not met).`,
                }],
                // Prevent the continuation synthesis turn from auto-hydrating an unrelated artifact
                // or prior scratch payload into payload, while still recording LastRunID lineage.
                inputArtifacts: [],
                payload: {},
                lastRunId: targetRun.ID,
                contextUser: actingUser,
                conversationId: origin?.ConversationID ?? undefined,
                conversationDetailId: targetDetailId,
                ConversationBranchID: origin?.BranchID ?? undefined,
                // The load-bearing value: without it the next graph this run submits restarts the
                // chain at zero and the cap never fires.
                continuationDepth: params.ReinvokeDepth + 1,
            });

            if (replyDetail && replySaved) {
                const succeeded = result?.success !== false;
                replyDetail.Status = succeeded ? 'Complete' : 'Error';
                replyDetail.Message = result?.agentRun?.Message || renderedContinuationMessage;
                if (result?.responseForm) {
                    replyDetail.ResponseForm = JSON.stringify(result.responseForm);
                }
                if (result?.actionableCommands && result.actionableCommands.length > 0) {
                    replyDetail.ActionableCommands = JSON.stringify(result.actionableCommands);
                }
                if (result?.automaticCommands && result.automaticCommands.length > 0) {
                    replyDetail.AutomaticCommands = JSON.stringify(result.automaticCommands);
                }
                await replyDetail.Save();

                if (!origin?.IsLatest && origin?.OriginDetail) {
                    await this.markOriginDetailCompleted(origin.OriginDetail, params.WorkflowName);
                }

                const artifactTargetDetailId = targetDetailId ?? replyDetail.ID;
                const hasNonEmptyPayload =
                    result?.payload != null &&
                    (typeof result.payload !== 'object' ||
                        Array.isArray(result.payload) ||
                        Object.keys(result.payload as Record<string, unknown>).length > 0);
                if (
                    succeeded &&
                    hasNonEmptyPayload &&
                    artifactTargetDetailId &&
                    result.artifactDirective?.behavior !== 'suppress' &&
                    typeof runner.ProcessAgentArtifacts === 'function'
                ) {
                    try {
                        await runner.ProcessAgentArtifacts(result, artifactTargetDetailId, undefined, actingUser, provider);
                    } catch (artifactErr) {
                        LogError(
                            `[TaskGraphContinuationDeliverer] Artifact creation for "${params.WorkflowName}" failed (non-fatal)`,
                            undefined,
                            artifactErr,
                        );
                    }
                }
            }

            if (origin) {
                // When updating the originating message in-place (origin.IsLatest === true),
                // keep the completion event pointed at the primary orchestrating run (targetRun.ID)
                // so the message's gear icon opens the full workflow-orchestrating run rather than
                // the 2-step post-workflow synthesis run.
                const completionRunId = origin.IsLatest
                    ? (targetRun.ID || result?.agentRun?.ID || params.SubmittedByAgentRunID)
                    : (result?.agentRun?.ID ?? params.SubmittedByAgentRunID);
                this.publishCompletion(
                    ownerUserId,
                    targetDetailId ?? params.ConversationDetailID ?? '',
                    params.ConversationDetailID,
                    origin.ConversationID,
                    completionRunId,
                    result?.success !== false,
                );
            }
        } catch (e) {
            // FALL BACK, don't just log (C3). Both load-failure paths above already post instead of
            // reinvoking, on the principle that a completed workflow's outcome must reach the user
            // somehow — but a throw out of `RunAgent` skipped that and lost the outcome entirely.
            // The marker has been claimed by the time this runs, so nothing will look at the graph
            // again: the work finished, and the only record of it is a server log line.
            LogError(`[TaskGraphContinuationDeliverer] Reinvoking for "${params.WorkflowName}" threw — posting instead`, undefined, e);
            try {
                await this.PostMessage(params);
            } catch (fallbackError) {
                LogError(`[TaskGraphContinuationDeliverer] The fallback post for "${params.WorkflowName}" also failed`, undefined, fallbackError);
            }
        }
    }

    /**
     * Broadcasts a completion event on `PUSH_STATUS_UPDATES_TOPIC` so open conversation tabs
     * immediately reload both the originating workflow message and the newly posted continuation reply.
     */
    private publishCompletion(
        ownerUserId: string,
        replyDetailId: string,
        originDetailId: string | null,
        conversationId: string,
        agentRunId: string,
        success: boolean,
    ): void {
        if (!this.pubSub || !ownerUserId) return;
        try {
            if (originDetailId && originDetailId !== replyDetailId) {
                PublishStatusUpdate(this.pubSub, {
                    sessionId: '*',
                    ownerUserId,
                    message: JSON.stringify({
                        resolver: 'RunAIAgentResolver',
                        type: 'StreamingContent',
                        status: 'ok',
                        data: {
                            type: 'complete',
                            conversationDetailId: originDetailId,
                            conversationId,
                            agentRunId,
                            success,
                            timestamp: new Date(),
                        },
                    }),
                });
            }
            if (replyDetailId) {
                PublishStatusUpdate(this.pubSub, {
                    sessionId: '*',
                    ownerUserId,
                    message: JSON.stringify({
                        resolver: 'RunAIAgentResolver',
                        type: 'StreamingContent',
                        status: 'ok',
                        data: {
                            type: 'complete',
                            conversationDetailId: replyDetailId,
                            originConversationDetailId: originDetailId,
                            conversationId,
                            agentRunId,
                            success,
                            timestamp: new Date(),
                        },
                    }),
                });
            }
        } catch (err) {
            LogError(`[TaskGraphContinuationDeliverer] Failed to publish completion notification (ignored)`, undefined, err);
        }
    }

    /**
     * The conversation, fork (null is Main), owner user, loaded entity, and whether the originating
     * detail is still the latest visible message in the conversation; null when it cannot be loaded.
     */
    private async resolveOrigin(
        conversationDetailID: string,
        provider: IMetadataProvider,
        fallbackOwnerUserId?: string | null,
    ): Promise<{
        ConversationID: string;
        BranchID: string | null;
        OwnerUserID: string;
        OriginDetail: MJConversationDetailEntity;
        IsLatest: boolean;
    } | null> {
        const initialUser = this.resolveActingUser(fallbackOwnerUserId);
        let detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', initialUser);
        if (!(await detail.Load(conversationDetailID))) {
            return null;
        }
        let ownerUserId = fallbackOwnerUserId || detail.UserID || null;
        if (!ownerUserId && detail.ConversationID) {
            ownerUserId = await this.lookupConversationOwnerId(detail.ConversationID, provider);
        }
        const resolvedOwnerUserId = ownerUserId || this.contextUser.ID;
        const actingUser = this.resolveActingUser(resolvedOwnerUserId);
        // `MJConversationDetailEntityExtended.Save()` refuses writes when the entity's context user
        // is not the conversation owner (`this.contextUser` is the server system user). Re-bind
        // `OriginDetail` to `actingUser` whenever `ownerUserId` was discovered after loading `detail`.
        if (actingUser.ID !== initialUser.ID) {
            const writableDetail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', actingUser);
            if (await writableDetail.Load(conversationDetailID)) {
                detail = writableDetail;
            }
        }
        const branchId = detail.BranchID ?? null;
        const isLatest = detail.ConversationID
            ? await this.isLatestConversationMessage(detail.ConversationID, branchId, conversationDetailID, provider)
            : false;
        return {
            ConversationID: detail.ConversationID,
            BranchID: branchId,
            OwnerUserID: resolvedOwnerUserId,
            OriginDetail: detail,
            IsLatest: isLatest,
        };
    }

    /**
     * Returns `true` when `originDetailId` is the newest visible message on its conversation branch,
     * meaning no intervening messages were posted while the workflow ran in the background.
     */
    private async isLatestConversationMessage(
        conversationId: string,
        branchId: string | null,
        originDetailId: string,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        try {
            const safeConvId = conversationId.replace(/'/g, "''");
            const branchPredicate = branchId
                ? `BranchID='${branchId.replace(/'/g, "''")}'`
                : `BranchID IS NULL`;
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Conversation Details',
                    ExtraFilter: `ConversationID='${safeConvId}' AND ${branchPredicate} AND (HiddenToUser = 0 OR HiddenToUser IS NULL)`,
                    Fields: ['ID'],
                    OrderBy: '__mj_CreatedAt DESC',
                    MaxRows: 1,
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.contextUser,
            );
            if (res.Success && res.Results && res.Results.length > 0 && res.Results[0].ID) {
                return UUIDsEqual(res.Results[0].ID, originDetailId);
            }
        } catch {
            // Fall back to false when RunView is unavailable.
        }
        return false;
    }

    /**
     * Replaces the originating message's stale "I'll follow up when it finishes" copy with a clean
     * completion note when the workflow outcome was delivered in a separate bottom continuation message.
     */
    private async markOriginDetailCompleted(
        originDetail: MJConversationDetailEntity,
        workflowName: string,
    ): Promise<void> {
        try {
            const currentMsg = originDetail.Message || '';
            const completionNote = `*(✅ **${workflowName}** completed — synthesized results posted below.)*`;
            if (!currentMsg.includes(completionNote)) {
                const cleaned = currentMsg
                    .replace(/\s*I['’]ll follow up when it finishes\.?/gi, '')
                    .trim();
                originDetail.Message = cleaned
                    ? `${cleaned}\n\n${completionNote}`
                    : completionNote;
                originDetail.Status = 'Complete';
                await originDetail.Save();
            }
        } catch {
            // Non-fatal if origin detail note update fails.
        }
    }

    /**
     * Looks up the conversation owner's `UserID` from `MJ: Conversations` when the originating
     * `MJ: Conversation Details` row is an AI message (`detail.UserID === null`).
     */
    private async lookupConversationOwnerId(
        conversationId: string,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        try {
            const safeId = conversationId.replace(/'/g, "''");
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string; UserID: string }>(
                {
                    EntityName: 'MJ: Conversations',
                    ExtraFilter: `ID='${safeId}'`,
                    Fields: ['ID', 'UserID'],
                    ResultType: 'simple',
                },
                this.contextUser,
            );
            if (res.Success && res.Results && res.Results.length > 0 && res.Results[0].UserID) {
                return res.Results[0].UserID;
            }
        } catch {
            // Fall back to contextUser when provider is a lightweight test harness without RunView.
        }
        return null;
    }

    /**
     * Resolves the conversation owner's `UserInfo` from `UserCache` so `MJConversationDetailEntityExtended`
     * ownership checks and artifact ownership succeed. Falls back to `this.contextUser` when not cached.
     */
    private resolveActingUser(ownerUserId: string | null | undefined): UserInfo {
        if (!ownerUserId) {
            return this.contextUser;
        }
        try {
            const users = UserCache.Instance?.Users ?? UserCache.Users ?? [];
            const matched = users.find((u) => UUIDsEqual(u.ID, ownerUserId));
            if (matched) {
                return matched;
            }
        } catch {
            // Fall back to contextUser when UserCache is not initialized.
        }
        return this.contextUser;
    }

    /**
     * Loads child task `OutputPayload` rows for `params.ParentTaskID`, strips upstream payload keys
     * inherited unchanged via `TaskGraphDispatcher.applyStepOutputMapping`, and replaces generic
     * `"output available (N chars)"` summaries with readable output excerpts so both `PostMessage`
     * and `Reinvoke` carry each step's own concrete results into the conversation.
     */
    private async enrichTasksWithOutputs(
        params: TaskContinuationParams,
        provider: IMetadataProvider,
    ): Promise<TaskContinuationParams> {
        if (!params.ParentTaskID || params.Tasks.length === 0) {
            return params;
        }
        try {
            const safeParentId = params.ParentTaskID.replace(/'/g, "''");
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string; Name: string; OutputPayload: string | null }>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID='${safeParentId}'`,
                    Fields: ['ID', 'Name', 'OutputPayload'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.contextUser,
            );
            const outputById = new Map<string, string>();
            const nameById = new Map<string, string>();
            for (const row of res.Results ?? []) {
                if (row.ID) {
                    const lower = row.ID.toLowerCase();
                    if (row.Name) {
                        nameById.set(lower, row.Name);
                    }
                    if (row.OutputPayload) {
                        outputById.set(lower, row.OutputPayload);
                    }
                }
            }
            for (const t of params.Tasks) {
                if (t.TaskID && t.Name && !nameById.has(t.TaskID.toLowerCase())) {
                    nameById.set(t.TaskID.toLowerCase(), t.Name);
                }
            }

            const skippedReasonById = await this.resolveSkippedTaskReasons(params, rv, nameById);
            if (outputById.size === 0 && skippedReasonById.size === 0) {
                return params;
            }
            const seenUpstreamKeyValues = new Map<string, string>();
            return {
                ...params,
                Tasks: params.Tasks.map((task) => {
                    const lowerId = task.TaskID.toLowerCase();
                    if (task.Status === 'Skipped' && !task.Summary) {
                        const skipReason = skippedReasonById.get(lowerId);
                        if (skipReason) {
                            return { ...task, Summary: skipReason };
                        }
                    }
                    const rawOutput = outputById.get(lowerId);
                    if (!rawOutput) {
                        return task;
                    }
                    const deltaOutput = this.stripInheritedUpstreamKeys(rawOutput, seenUpstreamKeyValues);
                    const isPlaceholderSummary = !task.Summary || task.Summary.startsWith('output available (');
                    if (!isPlaceholderSummary) {
                        return task;
                    }
                    const excerpt = this.extractOutputExcerpt(deltaOutput);
                    return excerpt ? { ...task, Summary: excerpt } : task;
                }),
            };
        } catch {
            return params;
        }
    }

    /**
     * Resolves a human-readable explanation for each `Skipped` task in `params.Tasks` by inspecting
     * its `MJ: Task Dependencies` (`Condition` and upstream prerequisite status).
     */
    private async resolveSkippedTaskReasons(
        params: TaskContinuationParams,
        rv: RunView,
        nameById: Map<string, string>,
    ): Promise<Map<string, string>> {
        const reasons = new Map<string, string>();
        const skippedTasks = params.Tasks.filter((t) => t.Status === 'Skipped' && Boolean(t.TaskID));
        if (skippedTasks.length === 0) {
            return reasons;
        }
        try {
            const quotedIds = skippedTasks
                .map((t) => `'${t.TaskID.replace(/'/g, "''")}'`)
                .join(',');
            const depRes = await rv.RunView<{
                TaskID: string;
                DependsOnTaskID: string;
                Condition: string | null;
            }>(
                {
                    EntityName: 'MJ: Task Dependencies',
                    ExtraFilter: `TaskID IN (${quotedIds})`,
                    Fields: ['TaskID', 'DependsOnTaskID', 'Condition'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                this.contextUser,
            );
            const statusById = new Map<string, string>();
            for (const t of params.Tasks) {
                if (t.TaskID) {
                    statusById.set(t.TaskID.toLowerCase(), t.Status);
                }
            }
            const depsByTask = new Map<string, Array<{ DependsOnTaskID: string; Condition: string | null }>>();
            for (const dep of depRes.Results ?? []) {
                if (!dep.TaskID) continue;
                const key = dep.TaskID.toLowerCase();
                const list = depsByTask.get(key) ?? [];
                list.push(dep);
                depsByTask.set(key, list);
            }
            for (const skipped of skippedTasks) {
                const lower = skipped.TaskID.toLowerCase();
                const deps = depsByTask.get(lower) ?? [];
                const parts: string[] = [];
                for (const dep of deps) {
                    const prereqKey = dep.DependsOnTaskID?.toLowerCase() ?? '';
                    const prereqName = nameById.get(prereqKey);
                    const prereqStatus = statusById.get(prereqKey);
                    if (dep.Condition && dep.Condition.trim()) {
                        parts.push(
                            prereqName
                                ? `branch condition \`${dep.Condition.trim()}\` on "${prereqName}" evaluated to false`
                                : `branch condition \`${dep.Condition.trim()}\` evaluated to false`,
                        );
                    } else if (prereqStatus === 'Skipped' || prereqStatus === 'Failed') {
                        parts.push(
                            prereqName
                                ? `prerequisite "${prereqName}" was ${prereqStatus}`
                                : `prerequisite task was ${prereqStatus}`,
                        );
                    }
                }
                reasons.set(
                    lower,
                    parts.length > 0
                        ? parts.join('; ')
                        : 'prerequisite branch condition evaluated to false',
                );
            }
        } catch {
            // Optional dependency lookup; return empty map on failure.
        }
        return reasons;
    }

    /**
     * Removes top-level JSON keys from `rawOutput` whose serialized value is identical to an
     * earlier step's output in the same workflow (`TaskGraphDispatcher.applyStepOutputMapping`
     * merges `{ ...payload, ...output }`), while recording this step's keys for downstream steps.
     */
    private stripInheritedUpstreamKeys(
        rawOutput: string,
        seenUpstreamKeyValues: Map<string, string>,
    ): string {
        try {
            const parsed = JSON.parse(rawOutput.trim()) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const delta: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(parsed)) {
                    const serializedVal = JSON.stringify(value);
                    if (seenUpstreamKeyValues.get(key) !== serializedVal) {
                        delta[key] = value;
                    }
                    seenUpstreamKeyValues.set(key, serializedVal);
                }
                if (Object.keys(delta).length > 0) {
                    return JSON.stringify(delta);
                }
            }
        } catch {
            // Non-JSON output; return as-is.
        }
        return rawOutput;
    }

    /**
     * Extracts a human-readable excerpt from a task's serialized `OutputPayload` (up to 2,500 chars).
     */
    private extractOutputExcerpt(rawOutput: string): string {
        const maxChars = 2500;
        const trimmed = rawOutput.trim();
        if (!trimmed) {
            return '';
        }
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const sections: string[] = [];
                const titleText = parsed.title ?? parsed.queryName ?? parsed.savedQueryName;
                if (typeof titleText === 'string' && titleText.trim()) {
                    sections.push(`Title: ${titleText.trim()}`);
                }
                if (typeof parsed.message === 'string' && parsed.message.trim()) {
                    sections.push(parsed.message.trim());
                }
                const summaryText = parsed.summary ?? parsed.description ?? parsed.interpretation;
                if (typeof summaryText === 'string' && summaryText.trim()) {
                    sections.push(summaryText.trim());
                }
                if (typeof parsed.explanation === 'string' && parsed.explanation.trim()) {
                    sections.push(`Explanation: ${parsed.explanation.trim()}`);
                }
                if (typeof parsed.analysis === 'string' && parsed.analysis.trim()) {
                    sections.push(`Analysis: ${parsed.analysis.trim()}`);
                }
                const sqlText = parsed.request ?? parsed.sql;
                if (typeof sqlText === 'string' && sqlText.trim()) {
                    sections.push(`SQL / Request:\n\`\`\`sql\n${sqlText.trim()}\n\`\`\``);
                }
                if (typeof parsed.plan === 'string' && parsed.plan.trim()) {
                    sections.push(parsed.plan.trim());
                }

                // Nested synthesis object (e.g., Research Agent / Query Strategist)
                const synthesis = (typeof parsed.synthesis === 'object' && parsed.synthesis !== null && !Array.isArray(parsed.synthesis))
                    ? (parsed.synthesis as Record<string, unknown>)
                    : undefined;
                if (synthesis) {
                    if (typeof synthesis.executiveSummary === 'string' && synthesis.executiveSummary.trim()) {
                        sections.push(`Executive Summary: ${synthesis.executiveSummary.trim()}`);
                    }
                    if (Array.isArray(synthesis.keyFindings) && synthesis.keyFindings.length > 0) {
                        sections.push(`Key Findings: ${JSON.stringify(synthesis.keyFindings.slice(0, 10))}`);
                    }
                    if (Array.isArray(synthesis.recommendations) && synthesis.recommendations.length > 0) {
                        sections.push(`Recommendations: ${JSON.stringify(synthesis.recommendations.slice(0, 10))}`);
                    }
                }

                // Nested report object (e.g., Research Report Writer)
                const report = (typeof parsed.report === 'object' && parsed.report !== null && !Array.isArray(parsed.report))
                    ? (parsed.report as Record<string, unknown>)
                    : undefined;
                if (report) {
                    if (typeof report.name === 'string' && report.name.trim()) {
                        sections.push(`Report Title: ${report.name.trim()}`);
                    }
                    if (typeof report.description === 'string' && report.description.trim()) {
                        sections.push(`Report Summary: ${report.description.trim()}`);
                    }
                    if (typeof report.html === 'string' && report.html.trim()) {
                        const plainReportText = report.html
                            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (plainReportText) {
                            sections.push(`Report Excerpt: ${plainReportText.slice(0, 1000)}`);
                        }
                    }
                }

                // Action output fields (Result / result / output / value)
                const actionOutput = parsed.Result ?? parsed.result ?? parsed.output ?? parsed.value;
                if (actionOutput !== undefined && actionOutput !== null) {
                    const formattedActionOutput = typeof actionOutput === 'string'
                        ? actionOutput.trim()
                        : JSON.stringify(actionOutput);
                    if (formattedActionOutput) {
                        sections.push(`Result: ${formattedActionOutput}`);
                    }
                }

                if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
                    sections.push(`Sample Rows (${parsed.rows.length} total): ${JSON.stringify(parsed.rows.slice(0, 10))}`);
                }

                if (parsed.decisions !== undefined && parsed.decisions !== null && sections.length === 0) {
                    sections.push(`Decisions: ${JSON.stringify(parsed.decisions)}`);
                }

                if (sections.length > 0) {
                    const combined = sections.join('\n\n');
                    return combined.length > maxChars ? `${combined.slice(0, maxChars)}…` : combined;
                }
            }
        } catch {
            // Fall through to raw string truncation when OutputPayload is not JSON.
        }
        return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars)}…` : trimmed;
    }

    /**
     * Renders the outcome as Markdown.
     *
     * Per-task lines rather than one aggregate status: a graph where nine of ten steps succeeded is a
     * materially different message from one that failed outright, and the roll-up alone cannot say
     * which step went wrong. Long graphs truncate so a fifty-step workflow does not bury the
     * conversation — the task rows remain the complete record.
     */
    private renderMessage(params: TaskContinuationParams): string {
        const lines = [`**${params.WorkflowName}** finished.`, '', params.Summary];

        if (params.Tasks.length > 0) {
            lines.push('');
            for (const task of params.Tasks.slice(0, MAX_LISTED_TASKS)) {
                const detail = task.ErrorMessage ?? task.Summary;
                lines.push(`- ${this.statusIcon(task.Status)} **${task.Name}** — ${task.Status}${detail ? `: ${detail}` : ''}`);
            }
            if (params.Tasks.length > MAX_LISTED_TASKS) {
                lines.push(`- …and ${params.Tasks.length - MAX_LISTED_TASKS} more`);
            }
        }

        return lines.join('\n');
    }

    private statusIcon(status: string): string {
        switch (status) {
            case 'Complete': return '✅';
            case 'Failed': return '❌';
            case 'Cancelled': return '⊘';
            case 'Skipped': return '⏭️';
            default: return '•';
        }
    }
}
