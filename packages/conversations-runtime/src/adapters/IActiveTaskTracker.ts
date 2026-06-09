/**
 * @fileoverview Active-task tracker adapter — boundary between the runtime's
 * streaming layer and the host's task-tracking UI.
 *
 * `ConversationStreaming` needs to remove a tracked task when its agent run
 * completes (so the "agent is working…" spinner in the conversation list
 * clears). The host's task store — Angular's `ActiveTasksService`, a Redux
 * slice in a React app, anything else — implements this minimal contract.
 *
 * The default {@link NoOpActiveTaskTracker} does nothing, which is fine for
 * server-side / headless callers that don't render a task list.
 *
 * @module @memberjunction/conversations-runtime
 */

/**
 * Minimal contract the streaming layer needs from a task tracker.
 *
 * Kept deliberately narrow — only `RemoveByAgentRunId` is consumed by
 * `ConversationStreaming` today. The host's broader task UI (Angular's
 * `ActiveTasksService` has ~16 methods + multiple observables) stays in
 * the widget; only the methods the runtime calls are exposed here.
 *
 * @example
 * ```typescript
 * // Angular host bootstrap
 * runtime.UseActiveTaskTracker({
 *     RemoveByAgentRunId: (id) => inject(ActiveTasksService).removeByAgentRunId(id),
 * });
 * ```
 */
export interface IActiveTaskTracker {
    /**
     * Remove a tracked task when its agent run completes.
     *
     * @param agentRunId The `MJ: AI Agent Runs` ID whose task should be cleared.
     * @returns `true` if a task was found and removed, `false` if nothing matched.
     */
    RemoveByAgentRunId(agentRunId: string): boolean;
}

/**
 * Default {@link IActiveTaskTracker} that does nothing. Used when no tracker has
 * been registered — fine for headless / server-side consumers that don't render
 * task UI. Returns `false` from `RemoveByAgentRunId` to signal "nothing was
 * tracked," which is the truthful answer in a no-op world.
 */
export class NoOpActiveTaskTracker implements IActiveTaskTracker {
    public RemoveByAgentRunId(_agentRunId: string): boolean {
        return false;
    }
}
