/**
 * @fileoverview Type definitions for the agent scratchpad system.
 *
 * The scratchpad provides loop agents with private, ephemeral working memory
 * for organizing thoughts and tracking work during complex workflows.
 * Unlike payload (which represents shared working data), the scratchpad is
 * purely internal: a place for the agent to think, plan, and track progress.
 *
 * The scratchpad has two sections:
 * 1. **Notes** — free-form text for reasoning, intermediate conclusions, reminders
 * 2. **Task List** — structured tracking of work items with status
 *
 * Scratchpad data is:
 * - Ephemeral per run (starts empty, disappears when the run ends)
 * - Injected into the prompt each turn (like payload)
 * - Visible in the agent's own run log for debugging/audit
 * - Never shared with parent or sub-agents
 * - Persisted as snapshots in step InputData/OutputData for training data and audit
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.46.0
 */

/**
 * Represents a single task in the agent's internal task list.
 *
 * Tasks use simple sequential IDs (e.g., "t1", "t2") since the full task list
 * is injected every turn, making collisions unlikely. The agent manages task
 * ordering by list position.
 *
 * @example
 * ```typescript
 * const task: AgentTask = {
 *     id: "t1",
 *     title: "Analyze sales data for Q4",
 *     status: "in_progress",
 *     notes: "Found 3 anomalies in December revenue figures"
 * };
 * ```
 */
export interface AgentTask {
    /**
     * Simple agent-assigned identifier (e.g., "t1", "t2", "t3").
     * Used to match tasks for upsert/remove operations.
     */
    id: string;

    /**
     * Brief description of the work item.
     */
    title: string;

    /**
     * Current status of the task.
     */
    status: 'pending' | 'in_progress' | 'completed' | 'blocked';

    /**
     * Optional context, blockers, or results for this task.
     */
    notes?: string;
}

/**
 * Valid status values for an AgentTask.
 */
export type AgentTaskStatus = AgentTask['status'];

/**
 * Describes changes to the task list within a scratchpad update.
 *
 * @example
 * ```typescript
 * const changes: TaskListChanges = {
 *     upsert: [
 *         { id: "t1", title: "Analyze sales data", status: "completed", notes: "Done" },
 *         { id: "t4", title: "Write summary report", status: "pending" }
 *     ],
 *     remove: ["t2"]  // Remove task t2
 * };
 * ```
 */
export interface TaskListChanges {
    /**
     * Add new tasks or update existing ones (matched by id).
     * If a task with the same id already exists, it is replaced entirely.
     */
    upsert?: AgentTask[];

    /**
     * Remove tasks by ID.
     */
    remove?: string[];
}

/**
 * The agent's private working memory — not shared with parent or sub-agents.
 *
 * Processed inline on the same turn as other response fields (zero turn cost).
 * Follows the same pattern as `payloadChangeRequest`.
 *
 * @example
 * ```typescript
 * // In a LoopAgentResponse:
 * {
 *     taskComplete: false,
 *     message: "Starting analysis of 5 data sources",
 *     scratchpad: {
 *         notes: "User wants YoY comparison. Sales DB has data back to 2019.",
 *         taskList: {
 *             upsert: [
 *                 { id: "t1", title: "Analyze sales data", status: "in_progress" },
 *                 { id: "t2", title: "Analyze marketing data", status: "pending" }
 *             ]
 *         }
 *     }
 * }
 * ```
 */
export interface AgentScratchpad {
    /**
     * Free-form text for reasoning notes, intermediate conclusions,
     * reminders for future turns, or any internal context the agent wants
     * to persist across iterations. No hard character limit — the agent
     * is prompted to be mindful of token cost.
     */
    notes?: string;

    /**
     * Structured task tracking with upsert/remove operations.
     * Maximum task count is configurable via AgentTypePromptParams (default: 50).
     */
    taskList?: TaskListChanges;
}

/**
 * Snapshot of scratchpad state for persistence in step InputData/OutputData.
 * This is the serialized form — notes as a string, tasks as a flat array.
 */
export interface ScratchpadSnapshot {
    /**
     * Current notes text, or empty string if no notes.
     */
    notes: string;

    /**
     * Current task list as a flat array.
     */
    tasks: AgentTask[];
}
