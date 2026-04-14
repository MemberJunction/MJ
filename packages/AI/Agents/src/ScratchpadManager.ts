/**
 * @fileoverview In-memory scratchpad manager for loop agents.
 *
 * Manages the agent's private working memory (notes + task list) during a single run.
 * Follows the same pattern as PayloadManager — instantiated per agent run,
 * garbage collected when the run ends.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.46.0
 */

import { AgentTask, AgentTaskStatus, AgentScratchpad, ScratchpadSnapshot } from '@memberjunction/ai-core-plus';

/**
 * Manages the agent's ephemeral scratchpad (notes + task list) during a single run.
 *
 * The scratchpad is:
 * - In-memory only — not persisted to DB (snapshots are stored in step InputData/OutputData)
 * - Ephemeral per run — starts empty, garbage collected when the run ends
 * - Private — never shared with parent or sub-agents
 *
 * @example
 * ```typescript
 * const manager = new ScratchpadManager();
 *
 * // Apply changes from LLM response
 * manager.applyScratchpadChanges({
 *     notes: "Found 3 data sources to analyze",
 *     taskList: {
 *         upsert: [
 *             { id: "t1", title: "Analyze sales data", status: "in_progress" },
 *             { id: "t2", title: "Analyze marketing data", status: "pending" }
 *         ]
 *     }
 * });
 *
 * // Get snapshot for step OutputData
 * const snapshot = manager.toJSON();
 *
 * // Get prompt-friendly representation
 * const promptText = manager.toPromptString();
 * ```
 */
export class ScratchpadManager {
    private _notes: string = '';
    private _tasks: AgentTask[] = [];

    // ─── Notes Management ─────────────────────────────────────────────

    /**
     * Replace the current notes content.
     */
    SetNotes(text: string): void {
        this._notes = text ?? '';
    }

    /**
     * Get the current notes content.
     */
    GetNotes(): string {
        return this._notes;
    }

    // ─── Task List Management ─────────────────────────────────────────

    /**
     * Add new tasks or update existing ones (matched by id).
     * If a task with the same id exists, it is replaced entirely.
     */
    UpsertTasks(tasks: AgentTask[]): void {
        if (!tasks || tasks.length === 0) return;

        for (const task of tasks) {
            if (!task.id || !task.title || !task.status) continue;

            const existingIndex = this._tasks.findIndex(t => t.id === task.id);
            if (existingIndex >= 0) {
                this._tasks[existingIndex] = { ...task };
            } else {
                this._tasks.push({ ...task });
            }
        }
    }

    /**
     * Remove tasks by ID.
     */
    RemoveTasks(ids: string[]): void {
        if (!ids || ids.length === 0) return;
        const idSet = new Set(ids);
        this._tasks = this._tasks.filter(t => !idSet.has(t.id));
    }

    /**
     * Return the current task list.
     */
    GetTasks(): AgentTask[] {
        return [...this._tasks];
    }

    /**
     * Return tasks filtered by status.
     */
    GetTasksByStatus(status: AgentTaskStatus): AgentTask[] {
        return this._tasks.filter(t => t.status === status);
    }

    /**
     * Return counts per status.
     */
    GetTaskCounts(): Record<AgentTaskStatus, number> {
        const counts: Record<AgentTaskStatus, number> = {
            pending: 0,
            in_progress: 0,
            completed: 0,
            blocked: 0
        };
        for (const task of this._tasks) {
            if (counts[task.status] !== undefined) {
                counts[task.status]++;
            }
        }
        return counts;
    }

    // ─── Composite Operations ─────────────────────────────────────────

    /**
     * Apply a scratchpad change from the LLM response.
     * Handles both notes and task list changes in one call.
     */
    ApplyScratchpadChanges(scratchpad: AgentScratchpad): void {
        if (!scratchpad) return;

        if (scratchpad.notes !== undefined) {
            this.SetNotes(scratchpad.notes);
        }

        if (scratchpad.taskList) {
            if (scratchpad.taskList.remove && scratchpad.taskList.remove.length > 0) {
                this.RemoveTasks(scratchpad.taskList.remove);
            }
            if (scratchpad.taskList.upsert && scratchpad.taskList.upsert.length > 0) {
                this.UpsertTasks(scratchpad.taskList.upsert);
            }
        }
    }

    /**
     * Enforce the maximum task limit by pruning completed tasks (oldest first).
     * Returns the number of tasks pruned.
     */
    EnforceTaskLimit(maxTasks: number): number {
        if (maxTasks <= 0 || this._tasks.length <= maxTasks) return 0;

        const overCount = this._tasks.length - maxTasks;

        // Find completed tasks in order (oldest = earliest in array)
        const completedIndices: number[] = [];
        for (let i = 0; i < this._tasks.length && completedIndices.length < overCount; i++) {
            if (this._tasks[i].status === 'completed') {
                completedIndices.push(i);
            }
        }

        // Remove completed tasks (reverse order to preserve indices)
        for (let i = completedIndices.length - 1; i >= 0; i--) {
            this._tasks.splice(completedIndices[i], 1);
        }

        return completedIndices.length;
    }

    // ─── Serialization ────────────────────────────────────────────────

    /**
     * Returns a plain object snapshot for persisting in step InputData/OutputData.
     */
    ToJSON(): ScratchpadSnapshot {
        return {
            notes: this._notes,
            tasks: this._tasks.map(t => ({ ...t }))
        };
    }

    /**
     * Generates a compact markdown representation for prompt injection.
     * More token-efficient than raw JSON dump.
     */
    ToPromptString(): string {
        const parts: string[] = [];

        // Notes section
        if (this._notes) {
            parts.push(this._notes);
        } else {
            parts.push('_(no notes yet)_');
        }

        // Task list section
        if (this._tasks.length > 0) {
            const taskLines = this._tasks.map(t => {
                const statusIcon = this.getStatusIcon(t.status);
                const noteSuffix = t.notes ? ` — ${t.notes}` : '';
                return `- ${statusIcon} **${t.id}**: ${t.title}${noteSuffix}`;
            });
            parts.push('\n### Task List\n' + taskLines.join('\n'));
        } else {
            parts.push('\n### Task List\n_(no tasks yet)_');
        }

        return parts.join('\n');
    }

    /**
     * Returns a compact one-line summary of task progress.
     * E.g., "3 of 7 tasks complete, 1 blocked"
     */
    GetTaskSummary(): string {
        if (this._tasks.length === 0) return 'No tasks';

        const counts = this.GetTaskCounts();
        const total = this._tasks.length;
        const parts: string[] = [];

        parts.push(`${counts.completed} of ${total} tasks complete`);
        if (counts.in_progress > 0) parts.push(`${counts.in_progress} in progress`);
        if (counts.blocked > 0) parts.push(`${counts.blocked} blocked`);

        return parts.join(', ');
    }

    /**
     * Returns true if the scratchpad has any content (notes or tasks).
     */
    HasContent(): boolean {
        return this._notes.length > 0 || this._tasks.length > 0;
    }

    /**
     * Reset the scratchpad to empty state.
     */
    Clear(): void {
        this._notes = '';
        this._tasks = [];
    }

    // ─── Private Helpers ──────────────────────────────────────────────

    private getStatusIcon(status: AgentTaskStatus): string {
        switch (status) {
            case 'pending': return '⬜';
            case 'in_progress': return '🔵';
            case 'completed': return '✅';
            case 'blocked': return '🟠';
            default: return '⬜';
        }
    }
}
