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
            const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', actingUser);
            detail.NewRecord();
            detail.ConversationID = origin.ConversationID;
            detail.BranchID = origin.BranchID;
            detail.Role = 'AI';
            detail.Status = 'Complete';
            detail.HiddenToUser = false;
            detail.Message = this.renderMessage(enrichedParams);

            if (!(await detail.Save())) {
                LogError(
                    `[TaskGraphContinuationDeliverer] Could not post the outcome of "${params.WorkflowName}": ` +
                    `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
                return;
            }

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

            const agent = await provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', this.contextUser);
            if (!(await agent.Load(priorRun.AgentID))) {
                LogError(`[TaskGraphContinuationDeliverer] Agent ${priorRun.AgentID} could not be loaded — posting "${params.WorkflowName}" instead.`);
                await this.PostMessage(params);
                return;
            }

            // Run on the fork of the message that started the graph, as PostMessage posts into it:
            // RunAgent derives the conversation from the detail, but not the fork.
            const origin = params.ConversationDetailID
                ? await this.resolveOrigin(params.ConversationDetailID, provider, priorRun.UserID)
                : null;
            const ownerUserId = priorRun.UserID || origin?.OwnerUserID || this.contextUser.ID;
            const actingUser = this.resolveActingUser(ownerUserId);

            // Create a visible AI reply detail in the conversation for the continuation turn so the
            // synthesized response appears as a new message in the chat transcript.
            let replyDetail: MJConversationDetailEntity | null = null;
            let replySaved = false;
            if (origin?.ConversationID) {
                replyDetail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', actingUser);
                replyDetail.NewRecord();
                replyDetail.ConversationID = origin.ConversationID;
                replyDetail.BranchID = origin.BranchID;
                replyDetail.Role = 'AI';
                replyDetail.Status = 'In-Progress';
                replyDetail.HiddenToUser = false;
                replyDetail.AgentID = agent.ID;
                replyDetail.Message = `⏳ Synthesizing results from **${params.WorkflowName}**...`;
                replySaved = await replyDetail.Save();
            }

            const targetDetailId = (replyDetail && replySaved && replyDetail.ID)
                ? replyDetail.ID
                : (params.ConversationDetailID ?? undefined);

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
                        `Please synthesize these completed workflow step outputs into a clear, direct, comprehensive final response for the user (including any SQL queries, data tables, or executive summaries produced by the steps).`,
                }],
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

                if (
                    succeeded &&
                    result?.payload != null &&
                    replyDetail.ID &&
                    result.artifactDirective?.behavior !== 'suppress' &&
                    typeof runner.ProcessAgentArtifacts === 'function'
                ) {
                    try {
                        await runner.ProcessAgentArtifacts(result, replyDetail.ID, undefined, actingUser, provider);
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
                this.publishCompletion(
                    ownerUserId,
                    targetDetailId ?? params.ConversationDetailID ?? '',
                    params.ConversationDetailID,
                    origin.ConversationID,
                    result?.agentRun?.ID ?? params.SubmittedByAgentRunID,
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

    /** The conversation, fork (null is Main), and owner user of the detail that started the graph; null when it cannot be loaded. */
    private async resolveOrigin(
        conversationDetailID: string,
        provider: IMetadataProvider,
        fallbackOwnerUserId?: string | null,
    ): Promise<{ ConversationID: string; BranchID: string | null; OwnerUserID: string } | null> {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.contextUser);
        if (!(await detail.Load(conversationDetailID))) {
            return null;
        }
        let ownerUserId = fallbackOwnerUserId || detail.UserID || null;
        if (!ownerUserId && detail.ConversationID) {
            ownerUserId = await this.lookupConversationOwnerId(detail.ConversationID, provider);
        }
        return {
            ConversationID: detail.ConversationID,
            BranchID: detail.BranchID ?? null,
            OwnerUserID: ownerUserId || this.contextUser.ID,
        };
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
     * Loads child task `OutputPayload` rows for `params.ParentTaskID` and replaces generic
     * `"output available (N chars)"` summaries with readable output excerpts so both
     * `PostMessage` and `Reinvoke` carry concrete step results into the conversation.
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
            if (!res.Success || !res.Results || res.Results.length === 0) {
                return params;
            }
            const outputById = new Map<string, string>();
            for (const row of res.Results) {
                if (row.ID && row.OutputPayload) {
                    outputById.set(row.ID.toLowerCase(), row.OutputPayload);
                }
            }
            if (outputById.size === 0) {
                return params;
            }
            return {
                ...params,
                Tasks: params.Tasks.map((task) => {
                    const rawOutput = outputById.get(task.TaskID.toLowerCase());
                    if (!rawOutput) {
                        return task;
                    }
                    const isPlaceholderSummary = !task.Summary || task.Summary.startsWith('output available (');
                    if (!isPlaceholderSummary) {
                        return task;
                    }
                    const excerpt = this.extractOutputExcerpt(rawOutput);
                    return excerpt ? { ...task, Summary: excerpt } : task;
                }),
            };
        } catch {
            return params;
        }
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
                if (typeof parsed.title === 'string' && parsed.title.trim()) {
                    sections.push(`Title: ${parsed.title.trim()}`);
                }
                if (typeof parsed.message === 'string' && parsed.message.trim()) {
                    sections.push(parsed.message.trim());
                }
                if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
                    sections.push(parsed.summary.trim());
                }
                if (typeof parsed.request === 'string' && parsed.request.trim()) {
                    sections.push(`SQL / Request:\n\`\`\`sql\n${parsed.request.trim()}\n\`\`\``);
                }
                if (typeof parsed.plan === 'string' && parsed.plan.trim()) {
                    sections.push(parsed.plan.trim());
                }
                if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
                    sections.push(`Sample Rows (${parsed.rows.length} total): ${JSON.stringify(parsed.rows.slice(0, 10))}`);
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
            default: return '•';
        }
    }
}
