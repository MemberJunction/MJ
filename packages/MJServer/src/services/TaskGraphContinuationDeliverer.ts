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
import { MJAIAgentRunEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRunner } from '@memberjunction/ai-agents';
import { ChatMessageRole } from '@memberjunction/ai';
import type { ProviderFactory, TaskContinuationDeliverer, TaskContinuationParams } from '@memberjunction/task-graph';

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

            const detail = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.contextUser);
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
            }
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

            await new AgentRunner().RunAgent({
                agent,
                conversationMessages: [{ role: ChatMessageRole.user, content: this.renderMessage(params) }],
                contextUser: this.contextUser,
                conversationDetailId: params.ConversationDetailID ?? undefined,
                // The load-bearing value: without it the next graph this run submits restarts the
                // chain at zero and the cap never fires.
                continuationDepth: params.ReinvokeDepth + 1,
            });
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
