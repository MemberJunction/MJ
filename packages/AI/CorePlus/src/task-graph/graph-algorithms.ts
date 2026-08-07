/**
 * @fileoverview Pure graph algorithms for task-graph orchestration.
 *
 * Deliberately dependency-free: these operate on plain `{ id, status }` / `{ taskId, dependsOnTaskId }`
 * shapes rather than on `BaseEntity` instances, so they can be unit-tested exhaustively without a
 * database and reused unchanged by every executor.
 *
 * They are consumed by the durable `TaskGraphDispatcher`
 * (`@memberjunction/task-graph`) consumes the same functions rather than reimplementing eligibility
 * and propagation. That is the point of factoring them out now — the plan's Phase 1 note that "the
 * eligibility logic carries into the dispatcher unchanged" only holds if the logic has no host
 * coupling to begin with.
 *
 * @module @memberjunction/ai-core-plus
 */

/**
 * Statuses a task row can hold. Mirrors the `CK_Task_Status` check constraint on `MJ: Tasks`.
 * Restated here (rather than derived from the entity) so this module stays free of entity imports.
 */
export type TaskGraphNodeStatus =
    | 'Pending'
    | 'In Progress'
    | 'Complete'
    | 'Cancelled'
    | 'Failed'
    | 'Blocked'
    | 'Deferred';

/** Statuses from which a task can never proceed or be retried into eligibility on its own. */
const TERMINAL_STATUSES: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>([
    'Complete',
    'Cancelled',
    'Failed',
]);

/** Statuses that permanently prevent a dependent from ever becoming eligible. */
const UNSATISFIABLE_STATUSES: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>([
    'Failed',
    'Cancelled',
    'Blocked',
]);

/** The minimum a graph algorithm needs to know about a task. */
export type TaskGraphNode = {
    id: string;
    status: TaskGraphNodeStatus;
};

/**
 * A dependency edge: `taskId` cannot start until `dependsOnTaskId` is satisfied.
 *
 * `dependencyType` follows `CK_TaskDependency_Type`. Only `Prerequisite` gates eligibility in
 * Phase 1 — `Optional` and `Corequisite` are carried through so Phase 4's join semantics (OR-join
 * and co-scheduling) can be layered on without changing the edge shape.
 */
export type TaskGraphEdge = {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType?: 'Prerequisite' | 'Corequisite' | 'Optional';
};

/** Result of a cycle check. `path` is the cycle in traversal order, repeating the entry node last. */
export type CycleDetectionResult =
    | { hasCycle: false }
    | { hasCycle: true; path: string[] };

/**
 * Detects a dependency cycle using an iterative depth-first search.
 *
 * Iterative rather than recursive on purpose: a deep or adversarial graph would blow the call stack,
 * and this runs on submitted (potentially LLM-authored) input.
 *
 * Nodes referenced only by edges are still traversed, so a cycle among unknown ids is still caught —
 * validation of unresolvable references is a separate concern (see {@link FindUnknownDependencyRefs}).
 *
 * @returns the first cycle found, or `{ hasCycle: false }`
 */
export function DetectCycle(nodes: readonly TaskGraphNode[], edges: readonly TaskGraphEdge[]): CycleDetectionResult {
    const adjacency = buildDependsOnAdjacency(edges);

    // Every id that appears anywhere, so edge-only ids are traversed too.
    const allIds = new Set<string>(nodes.map((n) => n.id));
    for (const e of edges) {
        allIds.add(e.taskId);
        allIds.add(e.dependsOnTaskId);
    }

    const UNVISITED = 0, IN_PROGRESS = 1, DONE = 2;
    const state = new Map<string, number>();
    for (const id of allIds) state.set(id, UNVISITED);

    for (const start of allIds) {
        if (state.get(start) !== UNVISITED) continue;

        // Explicit stack of (node, index into its neighbour list) plus the current DFS path.
        const stack: Array<{ id: string; next: number }> = [{ id: start, next: 0 }];
        const path: string[] = [start];
        state.set(start, IN_PROGRESS);

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
            const neighbours = adjacency.get(frame.id) ?? [];

            if (frame.next >= neighbours.length) {
                state.set(frame.id, DONE);
                stack.pop();
                path.pop();
                continue;
            }

            const neighbour = neighbours[frame.next++];
            const neighbourState = state.get(neighbour) ?? UNVISITED;

            if (neighbourState === IN_PROGRESS) {
                // Found a back-edge: slice the path from where the neighbour first appears.
                const cycleStart = path.indexOf(neighbour);
                return { hasCycle: true, path: [...path.slice(cycleStart), neighbour] };
            }
            if (neighbourState === UNVISITED) {
                state.set(neighbour, IN_PROGRESS);
                stack.push({ id: neighbour, next: 0 });
                path.push(neighbour);
            }
        }
    }

    return { hasCycle: false };
}

/**
 * Returns dependency edges whose `taskId` or `dependsOnTaskId` is not among the known nodes.
 *
 * A graph with dangling references executes with holes, so submission should reject rather than
 * silently skip — the failure mode this replaces.
 */
export function FindUnknownDependencyRefs(
    nodes: readonly TaskGraphNode[],
    edges: readonly TaskGraphEdge[]
): TaskGraphEdge[] {
    const known = new Set(nodes.map((n) => n.id));
    return edges.filter((e) => !known.has(e.taskId) || !known.has(e.dependsOnTaskId));
}

/**
 * Computes which tasks are eligible to start right now.
 *
 * A task is eligible when it is `Pending` and every one of its `Prerequisite` dependencies is
 * `Complete`. Non-prerequisite edges do not gate in Phase 1.
 *
 * Note this returns *all* currently-eligible tasks rather than one — the caller decides how many to
 * launch concurrently. That is what makes wave parallelization possible without changing this
 * function, and what the durable dispatcher reuses for its claim loop.
 */
export function ComputeEligibleTasks(
    nodes: readonly TaskGraphNode[],
    edges: readonly TaskGraphEdge[]
): TaskGraphNode[] {
    const statusById = new Map(nodes.map((n) => [n.id, n.status]));
    const prerequisites = buildDependsOnAdjacency(edges.filter(isGatingEdge));

    return nodes.filter((node) => {
        if (node.status !== 'Pending') return false;
        const deps = prerequisites.get(node.id) ?? [];
        return deps.every((depId) => statusById.get(depId) === 'Complete');
    });
}

/**
 * Computes the transitive set of tasks that must become `Blocked` because a dependency can never
 * be satisfied.
 *
 * Walks *forward* from unsatisfiable tasks (`Failed` / `Cancelled` / already `Blocked`) to their
 * dependents, and onward. Without this, a failed dependency leaves its dependents `Pending`
 * forever and the graph silently stalls.
 *
 * Only tasks currently `Pending` are returned — work already running, complete, or terminal is left
 * alone, so this is safe to call repeatedly.
 *
 * @returns ids of tasks that should be transitioned to `Blocked`
 */
export function ComputeTasksToBlock(
    nodes: readonly TaskGraphNode[],
    edges: readonly TaskGraphEdge[]
): string[] {
    const statusById = new Map(nodes.map((n) => [n.id, n.status]));
    const dependentsOf = buildDependentsAdjacency(edges.filter(isGatingEdge));

    const frontier: string[] = nodes.filter((n) => UNSATISFIABLE_STATUSES.has(n.status)).map((n) => n.id);
    const toBlock = new Set<string>();
    const seen = new Set<string>(frontier);

    while (frontier.length > 0) {
        const current = frontier.pop()!;
        for (const dependent of dependentsOf.get(current) ?? []) {
            if (seen.has(dependent)) continue;
            seen.add(dependent);
            // Only Pending work gets blocked; anything else is already decided or in flight.
            if (statusById.get(dependent) === 'Pending') {
                toBlock.add(dependent);
                // Its own dependents are transitively unreachable too.
                frontier.push(dependent);
            }
        }
    }

    return [...toBlock];
}

/** Aggregate outcome of a graph's children, used to set the parent task honestly. */
export type ParentRollup = {
    status: TaskGraphNodeStatus;
    percentComplete: number;
    isTerminal: boolean;
};

/**
 * Rolls child task outcomes up into the parent's status and progress.
 *
 * Replaces the previous behavior of unconditionally marking the parent `Complete` at 100%, which
 * reported success for graphs that had actually failed or stalled.
 *
 * Precedence once no work remains in flight: any `Failed` → `Failed`; else any `Blocked` → `Blocked`;
 * else any `Cancelled` → `Cancelled`; else `Complete`. While work remains, the parent is
 * `In Progress`. An empty graph is `Complete` — vacuously true, and it keeps a degenerate submission
 * from hanging.
 *
 * `percentComplete` counts only `Complete` children, so a half-failed graph never reads as 100%.
 */
export function ComputeParentRollup(children: readonly TaskGraphNode[]): ParentRollup {
    if (children.length === 0) {
        return { status: 'Complete', percentComplete: 100, isTerminal: true };
    }

    let complete = 0, failed = 0, blocked = 0, cancelled = 0, active = 0;
    for (const c of children) {
        switch (c.status) {
            case 'Complete': complete++; break;
            case 'Failed': failed++; break;
            case 'Blocked': blocked++; break;
            case 'Cancelled': cancelled++; break;
            // Pending / In Progress / Deferred all mean "not settled yet".
            default: active++; break;
        }
    }

    const percentComplete = Math.floor((complete / children.length) * 100);

    if (active > 0) {
        return { status: 'In Progress', percentComplete, isTerminal: false };
    }
    if (failed > 0) {
        return { status: 'Failed', percentComplete, isTerminal: true };
    }
    if (blocked > 0) {
        return { status: 'Blocked', percentComplete, isTerminal: true };
    }
    if (cancelled > 0) {
        return { status: 'Cancelled', percentComplete, isTerminal: true };
    }
    return { status: 'Complete', percentComplete: 100, isTerminal: true };
}

/**
 * True when a graph can make no further progress on its own: nothing is running, and nothing is
 * eligible to start.
 *
 * Distinguishes "finished" from "wedged". A graph with `Pending` tasks and zero eligible tasks and
 * zero in-flight tasks is deadlocked — previously this exited the execution loop quietly and the
 * parent was marked complete.
 */
export function IsGraphStalled(nodes: readonly TaskGraphNode[], edges: readonly TaskGraphEdge[]): boolean {
    const anyActive = nodes.some((n) => n.status === 'In Progress');
    if (anyActive) return false;
    if (ComputeEligibleTasks(nodes, edges).length > 0) return false;
    return nodes.some((n) => n.status === 'Pending');
}

/** True when every task has reached a terminal status. */
export function IsGraphSettled(nodes: readonly TaskGraphNode[]): boolean {
    return nodes.every((n) => TERMINAL_STATUSES.has(n.status) || n.status === 'Blocked');
}

// ────────────────────────────────────────────────────────────────────────────────
// internals
// ────────────────────────────────────────────────────────────────────────────────

/** Only `Prerequisite` edges gate eligibility. An absent type defaults to `Prerequisite`. */
function isGatingEdge(edge: TaskGraphEdge): boolean {
    return (edge.dependencyType ?? 'Prerequisite') === 'Prerequisite';
}

/** taskId -> the ids it depends on. */
function buildDependsOnAdjacency(edges: readonly TaskGraphEdge[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const e of edges) {
        const list = map.get(e.taskId);
        if (list) list.push(e.dependsOnTaskId);
        else map.set(e.taskId, [e.dependsOnTaskId]);
    }
    return map;
}

/** dependsOnTaskId -> the ids that depend on it. */
function buildDependentsAdjacency(edges: readonly TaskGraphEdge[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const e of edges) {
        const list = map.get(e.dependsOnTaskId);
        if (list) list.push(e.taskId);
        else map.set(e.dependsOnTaskId, [e.taskId]);
    }
    return map;
}
