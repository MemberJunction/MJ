/**
 * @fileoverview The reasons an agent run's abort signal can carry.
 *
 * {@link AgentRunWatchdog} raises the abort when a run's row is marked Cancelled from outside;
 * BaseAgent's wall-clock guard raises it on timeout; {@link BaseAgent} reads the reason back off
 * the signal to record `CancellationReason`. Constants, so the writer and the reader never drift.
 * What a settled or user-stopped run IS lives on `MJAIAgentRunEntityExtended`, with the entity.
 *
 * @module @memberjunction/ai-agents
 */

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
