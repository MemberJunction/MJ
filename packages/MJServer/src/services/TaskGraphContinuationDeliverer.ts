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
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ConversationEngine, MJAIAgentRunEntity, MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import type { ChatMessage } from '@memberjunction/ai';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import type { ProviderFactory, TaskContinuationDeliverer, TaskContinuationParams } from '@memberjunction/task-graph';
import { PubSubManager } from '../generic/PubSubManager.js';
import { BROADCAST_SESSION_ID, PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';

/** How many per-task lines a posted summary shows before collapsing the rest into a count. */
const MAX_LISTED_TASKS = 20;

/** How far up `ParentRunID` a reinvoke looks for the conversation's root agent. */
const MAX_PARENT_HOPS = 20;

/** How many recent conversation messages a follow-up turn is given, on top of the outcome. */
const FOLLOW_UP_HISTORY_MESSAGES = 20;

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
    ) {}

    /**
     * Posts the roll-up as an AI-role message in the graph's conversation.
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
            const conversationID = await this.resolveConversationID(params.ConversationDetailID, provider);
            if (!conversationID) {
                LogError(
                    `[TaskGraphContinuationDeliverer] Conversation detail ${params.ConversationDetailID} could not be loaded — ` +
                    `"${params.WorkflowName}" has nowhere to post its outcome.`
                );
                return;
            }

            const owner = await this.resolveOwner(provider, conversationID);
            const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', owner);
            detail.NewRecord();
            detail.ConversationID = conversationID;
            detail.Role = 'AI';
            detail.Status = 'Complete';
            detail.HiddenToUser = false;
            detail.Message = this.renderMessage(params);

            if (!(await detail.Save())) {
                LogError(
                    `[TaskGraphContinuationDeliverer] Could not post the outcome of "${params.WorkflowName}": ` +
                    `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`
                );
                return;
            }
            this.announce(owner.ID, conversationID, detail.ID, null, true);
        } catch (e) {
            LogError(`[TaskGraphContinuationDeliverer] Posting the outcome of "${params.WorkflowName}" threw`, undefined, e);
        }
    }

    /**
     * Starts the conversation's agent a fresh turn carrying the graph's outcome, and lands that
     * turn's reply in the conversation.
     *
     * Never throws, for the same reason `PostMessage` does not: the dispatcher calls this inside the
     * compare-and-swap that marks a completion delivered.
     *
     * **Three things this used to get wrong, each of which lost the result on its own.**
     *
     * 1. It ran the agent through `RunAgent`, which executes a turn but writes nothing to any
     *    conversation. The follow-up ran, composed its reply, and the reply lived only on the run
     *    record. The conversation still showed "I'll follow up when it finishes." It now creates
     *    the reply detail first and runs through `RunAgentInConversation`, the path that writes the
     *    final message, response form and artifacts onto that detail.
     * 2. It reinvoked whichever run submitted the graph. When a sub-agent (the Workflow Planner)
     *    submitted, the follow-up went to the sub-agent as a root run, with none of the
     *    conversation's configuration. It now walks `ParentRunID` to the root — the agent the user
     *    is actually talking to — and reuses that run's `ConfigurationID`, so the same model set
     *    that answered the user answers the follow-up.
     * 3. The message it carried listed each task as "output available (N chars)" and nothing else.
     *    See {@link TaskContinuationParams.Tasks}: the outputs now ride along, and the message
     *    says to present them.
     *
     * The new run records `ReinvokeDepth + 1` so the chain is bounded. The dispatcher has already
     * refused to call this when the cap is reached — it degrades to `PostMessage` — so arriving here
     * means there is budget left, and stamping the depth is what keeps that true for the next hop.
     */
    public async Reinvoke(params: TaskContinuationParams): Promise<void> {
        let reply: MJConversationDetailEntity | null = null;
        try {
            if (!params.SubmittedByAgentRunID) {
                // Nothing to restart. A graph with no submitting run came from a schedule or a
                // trigger, where "continue the conversation" has no meaning.
                LogStatus(`[TaskGraphContinuationDeliverer] "${params.WorkflowName}" asked to reinvoke but records no submitting agent run — posting instead.`);
                await this.PostMessage(params);
                return;
            }

            const provider = await this.providerFactory.CreateProvider();
            const submittingRun = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await submittingRun.Load(params.SubmittedByAgentRunID))) {
                LogError(`[TaskGraphContinuationDeliverer] Submitting run ${params.SubmittedByAgentRunID} could not be loaded — posting "${params.WorkflowName}" instead.`);
                await this.PostMessage(params);
                return;
            }

            const rootRun = await this.resolveRootRun(provider, submittingRun);

            const agent = await provider.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents', this.contextUser);
            if (!(await agent.Load(rootRun.AgentID))) {
                LogError(`[TaskGraphContinuationDeliverer] Agent ${rootRun.AgentID} could not be loaded — posting "${params.WorkflowName}" instead.`);
                await this.PostMessage(params);
                return;
            }

            const runner = new AgentRunner();
            const turnFor = (contextUser: UserInfo) => ({
                agent,
                conversationMessages: [{ role: ChatMessageRole.user, content: this.renderReinvokeMessage(params) }],
                contextUser,
                // The conversation's own model configuration, so the follow-up is answered by the
                // same model set as the turn that submitted the graph rather than the global default.
                configurationId: rootRun.ConfigurationID ?? undefined,
                // The load-bearing value: without it the next graph this run submits restarts the
                // chain at zero and the cap never fires.
                continuationDepth: params.ReinvokeDepth + 1,
            });

            if (!params.ConversationDetailID) {
                // Headless submitter: there is no conversation for a reply to land in, but the agent
                // may still have something to do with the outcome (a scheduled agent that files a
                // report, say). Run the turn without a conversation, as before.
                await runner.RunAgent(turnFor(this.contextUser));
                return;
            }

            const conversationID = await this.resolveConversationID(params.ConversationDetailID, provider);
            if (!conversationID) {
                LogError(`[TaskGraphContinuationDeliverer] Conversation detail ${params.ConversationDetailID} could not be loaded — "${params.WorkflowName}" has nowhere to land its follow-up.`);
                return;
            }

            // The follow-up is the OWNER's turn, run as the owner. A conversation detail may only be
            // written by the conversation's owner or a grantee (`MJConversationDetailEntityExtended`
            // enforces this server-side), and the dispatcher's own user is neither — every save
            // failed, silently, and the outcome never arrived. Running the turn as the owner also
            // means the agent sees the owner's data, exactly as it did on the turn that submitted.
            const owner = await this.resolveOwner(provider, conversationID, rootRun.UserID);
            const turn = turnFor(owner);

            // The reply is created BEFORE the turn runs, in the state the UI shows for a turn in
            // flight. `RunAgentInConversation` streams progress onto it and writes the final message.
            reply = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', owner);
            reply.NewRecord();
            reply.ConversationID = conversationID;
            reply.Role = 'AI';
            reply.Status = 'In-Progress';
            reply.HiddenToUser = false;
            reply.AgentID = agent.ID;
            reply.Message = `Presenting the results of **${params.WorkflowName}**…`;
            if (!(await reply.Save())) {
                LogError(`[TaskGraphContinuationDeliverer] Could not create the follow-up message for "${params.WorkflowName}": ${reply.LatestResult?.CompleteMessage ?? 'unknown error'} — posting instead.`);
                reply = null;
                await this.PostMessage(params);
                return;
            }

            // The follow-up is a turn IN the conversation and gets the conversation: the request the
            // user made, the plan they approved, and everything else a normal turn would see. Without
            // it the agent was handed the outcome alone, "present it in the form they asked for" had
            // nothing to point at, and every follow-up chose its own shape — a table one run, a
            // bulleted list the next.
            const history = await this.loadHistory(provider, owner, conversationID, reply.ID);
            const outcome = await runner.RunAgentInConversation(
                { ...turn, conversationMessages: [...history, ...turn.conversationMessages], conversationDetailId: reply.ID },
                { conversationId: conversationID, conversationDetailId: reply.ID, createArtifacts: true },
            );
            this.announce(owner.ID, conversationID, reply.ID, outcome.agentResult.agentRun?.ID ?? null, outcome.agentResult.success);
        } catch (e) {
            // FALL BACK, don't just log (C3). A completed workflow's outcome must reach the user
            // somehow. The marker has been claimed by the time this runs, so nothing will look at
            // the graph again: the work finished, and without this the only record of it is a
            // server log line. If the reply detail already exists, the plain outcome goes onto it
            // rather than into a second message.
            LogError(`[TaskGraphContinuationDeliverer] Reinvoking for "${params.WorkflowName}" threw — posting the outcome instead`, undefined, e);
            try {
                if (reply) {
                    reply.Message = this.renderMessage(params);
                    reply.Status = 'Complete';
                    if (!(await reply.Save())) {
                        LogError(`[TaskGraphContinuationDeliverer] The fallback write for "${params.WorkflowName}" also failed: ${reply.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                    this.announce(reply.ContextCurrentUser?.ID ?? null, reply.ConversationID, reply.ID, null, true);
                } else {
                    await this.PostMessage(params);
                }
            } catch (fallbackError) {
                LogError(`[TaskGraphContinuationDeliverer] The fallback post for "${params.WorkflowName}" also failed`, undefined, fallbackError);
            }
        }
    }

    /**
     * Tells the user's live sessions that a message landed in the conversation.
     *
     * The client refreshes a conversation when it hears that a turn completed, but it is addressed
     * by the session that started the turn — and nothing started this one. Without this the
     * follow-up sat in the database until the user reloaded. Published as a broadcast to the
     * owner's sessions in the same shape the run resolver uses, so the client needs no new
     * vocabulary; it only has to accept a completion for a message it has not seen yet.
     *
     * Never throws: an announcement failing must not undo a delivery that succeeded.
     */
    private announce(ownerUserID: string | null, conversationID: string, conversationDetailID: string, agentRunID: string | null, success: boolean): void {
        if (!ownerUserID) {
            LogStatus(`[TaskGraphContinuationDeliverer] Follow-up ${conversationDetailID} posted, but the run records no user to notify.`);
            return;
        }
        try {
            PubSubManager.Instance.Publish(PUSH_STATUS_UPDATES_TOPIC, {
                sessionId: BROADCAST_SESSION_ID,
                ownerUserId: ownerUserID,
                message: JSON.stringify({
                    resolver: 'RunAIAgentResolver',
                    type: 'ExecutionProgress',
                    status: 'ok',
                    data: { type: 'complete', agentRunId: agentRunID ?? '', conversationDetailId: conversationDetailID, conversationId: conversationID, success },
                }),
            });
        } catch (e) {
            LogError(`[TaskGraphContinuationDeliverer] Could not announce follow-up ${conversationDetailID}`, undefined, e);
        }
    }

    /**
     * The conversation's recent messages, shaped the way every other turn sees them, minus the
     * reply being written. Loaded through the same engine helpers as the run resolver so the two
     * cannot drift. A failure to load is logged and yields no history: a follow-up that presents
     * the outcome without context is still far better than one that never arrives.
     */
    private async loadHistory(provider: IMetadataProvider, owner: UserInfo, conversationID: string, replyID: string): Promise<ChatMessage[]> {
        try {
            const rows = await ConversationEngine.LoadWindowRowsFresh(conversationID, owner, provider);
            const window = ConversationEngine.AssembleContextWindow(rows, {
                excludeDetailIds: [replyID],
                maxTailMessages: FOLLOW_UP_HISTORY_MESSAGES,
            });
            // Never hand back something the caller cannot spread: an engine that answers with no
            // window is the same as no history.
            return Array.isArray(window) ? (window as ChatMessage[]) : [];
        } catch (e) {
            LogError(`[TaskGraphContinuationDeliverer] Could not load conversation ${conversationID} for the follow-up — running on the outcome alone`, undefined, e);
            return [];
        }
    }

    /**
     * The user a follow-up runs and writes as: the conversation's owner.
     *
     * `preferredUserID` (the root run's user) is tried first, then `MJ: Conversations.UserID`.
     * Either must resolve to a cached user; otherwise the dispatcher's own user is returned, with a
     * log line, so a delivery still attempts rather than silently doing nothing — it will be
     * refused by the entity's write gate, but visibly.
     */
    private async resolveOwner(provider: IMetadataProvider, conversationID: string, preferredUserID?: string | null): Promise<UserInfo> {
        const byID = (id: string | null | undefined): UserInfo | undefined =>
            id ? UserCache.Instance.Users.find((u) => UUIDsEqual(u.ID, id)) : undefined;

        const preferred = byID(preferredUserID);
        if (preferred) return preferred;

        const conversation = await provider.GetEntityObject<MJConversationEntity>('MJ: Conversations', this.contextUser);
        if (await conversation.Load(conversationID)) {
            const owner = byID(conversation.UserID);
            if (owner) return owner;
        }

        LogError(`[TaskGraphContinuationDeliverer] No cached user owns conversation ${conversationID} (run user ${preferredUserID ?? 'none'}) — acting as ${this.contextUser.Name ?? this.contextUser.ID}.`);
        return this.contextUser;
    }

    /**
     * The root of the submitting run's chain: the agent the user is talking to.
     *
     * A sub-agent that submits a graph is not the conversation's agent, and reinvoking it as a
     * root run hands the follow-up to the wrong party with the wrong configuration. Bounded, and
     * tolerant of a parent that will not load: the deepest run that did load is used.
     */
    private async resolveRootRun(provider: IMetadataProvider, run: MJAIAgentRunEntity): Promise<MJAIAgentRunEntity> {
        let current = run;
        for (let hop = 0; hop < MAX_PARENT_HOPS && current.ParentRunID; hop++) {
            const parent = await provider.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
            if (!(await parent.Load(current.ParentRunID))) {
                LogError(`[TaskGraphContinuationDeliverer] Parent run ${current.ParentRunID} could not be loaded — continuing from ${current.ID}.`);
                break;
            }
            current = parent;
        }
        return current;
    }

    /** The outcome plus the instruction that turns a status report into a delivered result. */
    private renderReinvokeMessage(params: TaskContinuationParams): string {
        return [
            this.renderMessage(params),
            '',
            'Present these results to the user now, in full and in the form they asked for in their request above — ' +
            'if they asked for a table, give exactly the columns they named, in that order, one row per item, with no extra columns; ' +
            'if a value is missing, say so in the cell rather than dropping the row. ' +
            'Do not ask whether they want to see them, do not summarize them away, and do not start the workflow again.',
        ].join('\n');
    }

    /** The conversation a detail belongs to. */
    private async resolveConversationID(conversationDetailID: string, provider: IMetadataProvider): Promise<string | null> {
        const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.contextUser);
        return (await detail.Load(conversationDetailID)) ? detail.ConversationID : null;
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
                if (task.Output) {
                    // The output itself, not a reference to it — see TaskContinuationParams.Tasks.
                    lines.push('', `Output of **${task.Name}**:`, '', task.Output, '');
                }
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
