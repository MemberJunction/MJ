/**
 * Execution-order sort for agent-run steps.
 *
 * The timeline paints `StartedAt` on every row, but it used to *list* rows by `__mj_CreatedAt`
 * (when the fire-and-forget INSERT committed). Those clocks disagree for fast sibling steps —
 * an Artifact Tool that ran in 1ms, then the next Execute Agent Prompt 2ms later, routinely
 * persisted in the opposite order because different step entities save concurrently. Sorting
 * on persist time therefore showed the tool *after* the prompt that consumed it.
 *
 * `StartedAt` is stamped in memory at create time and is the clock the UI already shows.
 * `StepNumber` is the in-memory sequence and the tie-break when two steps share a millisecond
 * (parallel `Promise.all` tool calls). Unstarted rows (null/invalid `StartedAt`) sort last,
 * matching `get-agent-run-tree.sql` — T-SQL otherwise puts NULLs first.
 */

/** The two fields the execution-order sort reads. Deliberately not the full entity. */
export type AgentRunStepOrderFields = {
    StartedAt?: Date | string | null;
    StepNumber?: number | null;
};

/**
 * Milliseconds of `StartedAt`, or +∞ when the step has not started / cannot be parsed.
 *
 * +∞, not 0: an unstarted row has no place among work that did run, and 0 would pin it at
 * the epoch — the same class of lie the timeline used to render with a max-Date sentinel.
 */
function startedAtMs(value: Date | string | null | undefined): number {
    if (value == null || value === '') return Number.POSITIVE_INFINITY;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Compare two steps by execution order: `StartedAt` ascending, then `StepNumber`. */
export function CompareAgentRunStepsByExecutionOrder(
    a: AgentRunStepOrderFields,
    b: AgentRunStepOrderFields,
): number {
    const byStart = startedAtMs(a.StartedAt) - startedAtMs(b.StartedAt);
    if (byStart !== 0) return byStart;
    return (a.StepNumber ?? 0) - (b.StepNumber ?? 0);
}

/**
 * Returns a new array of steps in execution order. Does not mutate the input — RunView
 * results are shared with other consumers, and a sort in place would reorder their view too.
 */
export function SortAgentRunStepsByExecutionOrder<T extends AgentRunStepOrderFields>(steps: T[]): T[] {
    return [...steps].sort(CompareAgentRunStepsByExecutionOrder);
}
