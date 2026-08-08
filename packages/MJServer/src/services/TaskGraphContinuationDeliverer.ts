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
import { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { ProviderFactory, TaskContinuationDeliverer, TaskContinuationParams } from '@memberjunction/task-graph';

/** How many per-task lines a posted summary shows before collapsing the rest into a count. */
const MAX_LISTED_TASKS = 20;

/**
 * Posts a finished graph's outcome back into the conversation that asked for it.
 *
 * **Why there is no `Reinvoke` here.** The seam is optional and the dispatcher degrades to
 * `PostMessage`, which is the right behavior for now: a safe reinvoke needs the *new* agent run to
 * remember it was a continuation at depth N, so a graph that run submits inherits depth + 1 and
 * `MAX_REINVOKE_DEPTH` can actually stop the chain. Nothing durable records that today —
 * `TaskGraphService.Submit` reads `ReinvokeDepth` from its caller, and a reinvoked agent has no way
 * to know its own. Shipping `Reinvoke` without it would produce chains whose cap never trips, which
 * is worse than degrading to a message. Closing it is a schema question (a durable
 * continuation-depth marker on the agent run), so it is recorded rather than guessed at.
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
