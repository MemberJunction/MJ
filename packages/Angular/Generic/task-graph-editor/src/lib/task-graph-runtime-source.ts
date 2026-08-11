/**
 * @fileoverview Turning live `MJ: Tasks` rows into the canvas's runtime overlay.
 *
 * **Why this is a pure mapper and not a subscription.** A `widgets`-layer component must not own a
 * data subscription: it cannot know which provider it is on, whose rows it may read, or when the
 * host wants to start and stop watching. The host owns the subscription — it already has the
 * `BaseEntity` event stream or a `RunView` — and passes the rows here to be shaped for the canvas.
 *
 * That split is also what makes the runtime overlay work for **both** provenances. A durable graph
 * is watched through `MJ: Tasks` rows; an in-run flow through `AIAgentRunStep` rows. Different
 * sources, same shape by the time they reach the canvas, so one renderer serves both — which is the
 * whole point of the convergence.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import type { TaskGraphRuntimeState, TaskGraphRuntimeStatus } from './task-graph-canvas-adapter';

/** The minimum a row must expose to drive the overlay. Structural, so any source can satisfy it. */
export type TaskGraphRuntimeRow = {
    /** Correlates the row back to a spec node. See {@link BuildRuntimeStatus} for how. */
    ID: string;
    Name: string;
    Status: string;
};

/**
 * Shapes live rows into the canvas's `RuntimeStatus` map.
 *
 * **Correlation is by name, with an ID fallback, and that ordering is deliberate.** A submitted
 * graph's Task rows carry database IDs, while the spec on the canvas carries producer-assigned
 * `tempId`s — the two never match, because the producer could not know real IDs at authoring time.
 * The task's *name* is the only value that survives submission unchanged, so it is the join key. An
 * ID match is still honored first for the case where a host is showing a graph whose `tempId`s
 * genuinely are row IDs — which is exactly what `ConvertAgentSpecToTaskGraph` produces.
 *
 * Rows that match nothing are skipped rather than guessed at: a wrong node lighting up green is
 * worse than a node that stays grey, because the first is believed.
 */
export function BuildRuntimeStatus(
    rows: readonly TaskGraphRuntimeRow[],
    specTempIdsByName: ReadonlyMap<string, string>,
    knownTempIds: ReadonlySet<string>,
): TaskGraphRuntimeStatus {
    const status: TaskGraphRuntimeStatus = {};

    for (const row of rows) {
        const tempId = knownTempIds.has(row.ID) ? row.ID : specTempIdsByName.get(row.Name);
        if (!tempId) continue;
        status[tempId] = NormalizeRuntimeState(row.Status);
    }
    return status;
}

/**
 * Coerces a row's status string into the canvas vocabulary.
 *
 * Unknown values fall back to `Pending` rather than throwing. A status the UI has not heard of is a
 * schema that moved ahead of the client — which must degrade to "we don't know yet", not to a blank
 * canvas or an exception in a render path.
 */
export function NormalizeRuntimeState(status: string | null | undefined): TaskGraphRuntimeState {
    switch (status) {
        case 'In Progress':
        case 'Complete':
        case 'Failed':
        case 'Blocked':
        case 'Cancelled':
        case 'Deferred':
        case 'Pending':
            return status;
        default:
            return 'Pending';
    }
}

/** Index of task name → `tempId`, for the name-based correlation above. */
export function BuildNameIndex(tasks: readonly { tempId: string; name: string }[]): Map<string, string> {
    // Last writer wins on a duplicate name. Names are not unique in a spec — only `tempId` is — so
    // a duplicated name is inherently ambiguous; picking one deterministically beats dropping both.
    return new Map(tasks.map((t) => [t.name, t.tempId]));
}

/** True once every task has reached a state nothing will move it out of. */
export function IsRuntimeSettled(status: TaskGraphRuntimeStatus, tempIds: readonly string[]): boolean {
    const terminal = new Set<TaskGraphRuntimeState>(['Complete', 'Failed', 'Cancelled']);
    return tempIds.length > 0 && tempIds.every((id) => terminal.has(status[id] ?? 'Pending'));
}

/** A one-line progress summary, for hosts that show one beside the canvas. */
export function SummarizeRuntime(status: TaskGraphRuntimeStatus, tempIds: readonly string[]): string {
    const counts = new Map<TaskGraphRuntimeState, number>();
    for (const id of tempIds) {
        const state = status[id] ?? 'Pending';
        counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    const parts = [...counts.entries()].map(([state, n]) => `${n} ${state.toLowerCase()}`);
    return `${tempIds.length} step${tempIds.length === 1 ? '' : 's'} — ${parts.join(', ')}`;
}
