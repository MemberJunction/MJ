/**
 * @fileoverview The vocabulary two sides of a run must agree on without importing each other:
 * the reasons an agent run's abort signal can carry, and how "the run the user stopped" is
 * recognized in a query.
 *
 * - {@link AgentRunWatchdog} raises the abort; {@link BaseAgent} reads the reason back off the
 *   signal to record `CancellationReason`. The reasons are constants so the two never drift.
 * - `BaseAgent.injectStoppedRunResults` carries a user-stopped predecessor's results forward,
 *   and `RunAIAgentFromConversationDetail` chains the new run to the same predecessor. Both
 *   must pick the same run, so the filter and the recognizer live here and are shared.
 *
 * Value-list literals are typed from the entity unions, so a CHECK-constraint change surfaces
 * here at compile time rather than silently desynchronizing a filter.
 *
 * @module @memberjunction/ai-agents
 */
import type { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';

type AgentRunStatus = MJAIAgentRunEntityExtended['Status'];
type AgentRunCancellationReason = NonNullable<MJAIAgentRunEntityExtended['CancellationReason']>;

/**
 * The abort reason the watchdog raises when a run's row was marked `Cancelled` with
 * `CancellationReason = 'User Request'` (the Stop button). BaseAgent maps it back to the same
 * reason on the run it finalizes, so the row the UI wrote and the row the agent writes agree.
 */
export const USER_CANCEL_ABORT_REASON = 'Cancelled by user request';

/** The abort reason raised for an externally cancelled run whose row carries any other reason. */
export const EXTERNAL_CANCEL_ABORT_REASON = 'Cancelled externally';

/**
 * The prefix of the abort reason BaseAgent's wall-clock guard raises when a run outlives
 * `maxExecutionTimeMs`. The guard appends the agent and the budget after it; a reader checks
 * the prefix, never the wording after it.
 */
export const AGENT_TIMEOUT_ABORT_REASON = 'Agent execution exceeded maxExecutionTimeMs';

/** The run status a stop leaves behind. */
export const CANCELLED_RUN_STATUS: AgentRunStatus = 'Cancelled';

/** The cancellation reason a user's stop writes on the run. */
export const USER_REQUEST_CANCELLATION_REASON: AgentRunCancellationReason = 'User Request';

/**
 * The statuses a conversational turn settles in. `AwaitingFeedback` is included because a Chat
 * final step is the normal per-turn completion for conversational agents.
 * Deliberately `ReadonlyArray<Union>` rather than an `as const` tuple so `.includes(status)`
 * typechecks against the wider entity union while each literal is still checked.
 */
export const SETTLED_AGENT_RUN_STATUSES: ReadonlyArray<AgentRunStatus> = ['Completed', 'AwaitingFeedback'];

/** The minimal run projection {@link IsUserStoppedRun} reads. */
export interface AgentRunStatusRecord {
    Status: string;
    CancellationReason: string | null;
}

/**
 * Builds the `ExtraFilter` that selects, for one agent in one conversation, the root runs that
 * could be the next turn's predecessor: those that settled, and those the user stopped. Ordered
 * newest-first by the caller, the first row decides; a stopped run older than a settled one is
 * history the settled run already built on and is not chained to again.
 */
export function BuildStoppedRunPredecessorFilter(conversationId: string, agentId: string): string {
    const settled = SETTLED_AGENT_RUN_STATUSES.map((s) => `'${s}'`).join(', ');
    return (
        `ConversationID='${conversationId}' AND ParentRunID IS NULL AND AgentID='${agentId}' ` +
        `AND (Status IN (${settled}) OR (Status='${CANCELLED_RUN_STATUS}' AND CancellationReason='${USER_REQUEST_CANCELLATION_REASON}'))`
    );
}

/** True when the run row is one the user stopped: Cancelled, for a user request. */
export function IsUserStoppedRun(run: AgentRunStatusRecord | null | undefined): boolean {
    return !!run && run.Status === CANCELLED_RUN_STATUS && run.CancellationReason === USER_REQUEST_CANCELLATION_REASON;
}
