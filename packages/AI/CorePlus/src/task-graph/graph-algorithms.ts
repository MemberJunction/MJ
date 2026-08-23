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
    | 'Deferred'
    /**
     * A branch that was not taken.
     *
     * Deliberately NOT `Blocked` or `Cancelled`: an exclusive fan-out settles every losing branch,
     * and if that outcome were unsatisfiable then every sequential flow containing a fork would roll
     * its parent up to `Blocked`. Skipped is a NORMAL outcome — terminal, satisfies dependents, and
     * invisible to failure precedence.
     */
    | 'Skipped';

/** Statuses from which a task can never proceed or be retried into eligibility on its own. */
const TERMINAL_STATUSES: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>([
    'Complete',
    'Cancelled',
    'Failed',
    'Skipped',
]);

/**
 * Statuses that permanently prevent a dependent from ever becoming eligible.
 *
 * `Skipped` is deliberately ABSENT. A skipped node is a branch that was not taken, not a failure,
 * and adding it here would make `ComputeTasksToBlock` cascade Blocked down every loser branch —
 * which is precisely the outcome the Skipped status exists to avoid.
 */
const UNSATISFIABLE_STATUSES: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>([
    'Failed',
    'Cancelled',
    'Blocked',
]);

/** A prerequisite is satisfied by completion OR by being skipped. */
const SATISFIES_DEPENDENT: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>([
    'Complete',
    'Skipped',
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
    edges: readonly TaskGraphEdge[],
    handledFailureIDs: ReadonlySet<string> = new Set()
): TaskGraphNode[] {
    const statusById = new Map(nodes.map((n) => [n.id, n.status]));
    const prerequisites = buildDependsOnAdjacency(edges.filter(isGatingEdge));

    return nodes.filter((node) => {
        if (node.status !== 'Pending') return false;
        const deps = prerequisites.get(node.id) ?? [];
        // Skipped satisfies: a join downstream of an exclusive fork is reached by whichever branch
        // ran, and the branches that did not run must not hold it hostage forever.
        //
        // A HANDLED failure satisfies too, and without that a recovery path is unreachable: under
        // `failureSemantics: 'edges'` a Failed origin with a satisfied outgoing edge is not Blocked
        // and not Skipped, so its target was never blocked, never skipped, and never ELIGIBLE. The
        // graph sat In Progress forever. Before the failure-semantics work it at least settled
        // Failed; the recovery machinery turned a wrong answer into no answer, which is worse.
        return deps.every((depId) => {
            const st = statusById.get(depId);
            if (st === undefined) return false;
            return SATISFIES_DEPENDENT.has(st) || (st === 'Failed' && handledFailureIDs.has(depId));
        });
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
    edges: readonly TaskGraphEdge[],
    handledFailureIDs: ReadonlySet<string> = new Set(),
): string[] {
    const statusById = new Map(nodes.map((n) => [n.id, n.status]));
    const dependentsOf = buildDependentsAdjacency(edges.filter(isGatingEdge));

    // Under `failureSemantics: 'edges'`, a Failed step whose outgoing paths produced a satisfied
    // edge is a HANDLED failure — the flow's recovery path ran, so its dependents must not be
    // blocked. An unhandled Failed still seeds, matching the flow engine's "failed with no recovery
    // path" outcome. Under the default 'block' semantics the set is empty and nothing changes.
    const frontier: string[] = nodes
        .filter((n) => UNSATISFIABLE_STATUSES.has(n.status) && !handledFailureIDs.has(n.id))
        .map((n) => n.id);
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

/**
 * The statuses from which a task never moves again.
 *
 * This list is the single definition of "settled" for the whole engine — the parent-write guards,
 * the dispatcher's benign-failure check, and the unsettled sweep all derive from it, so a status
 * added to the union above cannot become terminal in one place and live in another.
 *
 * `Skipped` is here because a branch that was not taken is *finished*, and `Blocked` because a task
 * whose dependencies became unsatisfiable will never be reconsidered — leaving either out lets a
 * later pass move a settled graph back out of a terminal state.
 */
export const TERMINAL_TASK_GRAPH_STATUSES = ['Complete', 'Failed', 'Cancelled', 'Skipped', 'Blocked'] as const;

export type TerminalTaskGraphStatus = typeof TERMINAL_TASK_GRAPH_STATUSES[number];

/**
 * Aggregate outcome of a graph's children, used to set the parent task honestly.
 *
 * A discriminated union rather than a `status` + `isTerminal` pair, because the two fields are not
 * independent: the outcome decides whether the caller settles the parent (a guarded, once-only write
 * that stamps a completion time) or merely advances its progress, and those two writes accept
 * different statuses. Modelled loosely, the caller has to assert its way from one to the other — and
 * an assertion is exactly the thing that keeps being right until the day the rollup grows a case.
 *
 * **The discriminant is a string, not a boolean, and that is not a style choice.** These packages
 * compile under `tsconfig.server.json`, which does not enable `strict` — and with `strictNullChecks`
 * off TypeScript narrows a boolean discriminant in the truthy branch ONLY. `else` would keep the
 * full status union and the compiler would wave through a terminal status reaching the progress
 * write. A string discriminant narrows both ways under every setting.
 */
export type ParentRollup =
    | { status: 'In Progress'; percentComplete: number; outcome: 'active' }
    | { status: TerminalTaskGraphStatus; percentComplete: number; outcome: 'settled' };

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
 * `percentComplete` counts `Complete` and `Skipped` children — a fork's loser branch is *done*, and
 * counting it as outstanding would leave every branching flow stuck below 100%.
 *
 * **`Skipped` is invisible to precedence.** A branch that was not taken says nothing about whether
 * the graph succeeded, so it neither fails nor blocks the parent. Without this, a sequential flow
 * containing a single fork would settle `Blocked` every time.
 *
 * `handledFailureIDs` (spec `failureSemantics: 'edges'`) names Failed children that produced a
 * satisfied outgoing edge — a *recovery path* ran. Those are treated like Skipped for precedence,
 * so a flow that failed a step, recovered, and reached the end settles `Complete`, exactly as the
 * flow engine does today. A Failed child with no recovery path stays a failure.
 */
export function ComputeParentRollup(
    children: readonly TaskGraphNode[],
    handledFailureIDs: ReadonlySet<string> = new Set(),
): ParentRollup {
    if (children.length === 0) {
        return { status: 'Complete', percentComplete: 100, outcome: 'settled' };
    }

    let complete = 0, failed = 0, blocked = 0, cancelled = 0, active = 0, settledAside = 0;
    for (const c of children) {
        switch (c.status) {
            case 'Complete': complete++; break;
            case 'Failed':
                // A handled failure is a branch the flow recovered from, not an outcome.
                if (handledFailureIDs.has(c.id)) settledAside++; else failed++;
                break;
            case 'Blocked': blocked++; break;
            case 'Cancelled': cancelled++; break;
            case 'Skipped': settledAside++; break;
            // Pending / In Progress / Deferred all mean "not settled yet".
            default: active++; break;
        }
    }

    const percentComplete = Math.floor(((complete + settledAside) / children.length) * 100);

    if (active > 0) {
        return { status: 'In Progress', percentComplete, outcome: 'active' };
    }
    if (failed > 0) {
        return { status: 'Failed', percentComplete, outcome: 'settled' };
    }
    if (blocked > 0) {
        return { status: 'Blocked', percentComplete, outcome: 'settled' };
    }
    if (cancelled > 0) {
        return { status: 'Cancelled', percentComplete, outcome: 'settled' };
    }
    return { status: 'Complete', percentComplete: 100, outcome: 'settled' };
}

/**
 * True when a graph can make no further progress on its own: nothing is running, and nothing is
 * eligible to start.
 *
 * Distinguishes "finished" from "wedged". A graph with `Pending` tasks and zero eligible tasks and
 * zero in-flight tasks is deadlocked — previously this exited the execution loop quietly and the
 * parent was marked complete.
 *
 * **Held tasks do not count as eligible.** A task held because its guard could not be evaluated has
 * a live gating edge from a `Complete` origin, so eligibility says yes while the dispatcher refuses
 * to claim it. Counting it made a graph that will wait forever report as healthy, with no
 * diagnostics — the exact silence the hold mechanism exists to break.
 *
 * @param heldTaskIDs tasks the caller is refusing to start this cycle (undecided guards)
 */
export function IsGraphStalled(
    nodes: readonly TaskGraphNode[],
    edges: readonly TaskGraphEdge[],
    heldTaskIDs: ReadonlySet<string> = new Set(),
): boolean {
    const anyActive = nodes.some((n) => n.status === 'In Progress');
    if (anyActive) return false;
    if (ComputeEligibleTasks(nodes, edges).some((n) => !heldTaskIDs.has(n.id))) return false;
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

/**
 * Propagates "not taken" down a losing branch.
 *
 * When an exclusive fan-out picks a winner, the losing targets are seeded here and their exclusive
 * descendants follow. The rule is deliberately conservative: a task is skipped only when it has at
 * least one gating predecessor and **every** gating predecessor is skipped. A join that is also
 * reachable from the winning branch therefore survives — which is the entire point, since a fork
 * that reconverges must still run its join.
 *
 * `Optional` and `Corequisite` edges are ignored, matching `ComputeEligibleTasks`: an edge that does
 * not gate a task starting cannot decide that it never starts.
 *
 * Fixpoint rather than a single forward walk, because a join's fate is only decidable once every one
 * of its gating predecessors is known — a walk in edge order could visit it too early and let a
 * doomed branch through.
 *
 * **Ordering invariant (load-bearing):** the cascade is computed and persisted BEFORE eligibility in
 * every cycle. A task whose gating predecessors are all Skipped is simultaneously *eligible*
 * (Skipped satisfies, §5.2) and *to-be-skipped*; running eligibility first would dispatch the loser
 * branch before anything marked it. Cascade first, always.
 *
 * @param seedSkipIDs tasks already decided to skip this cycle (XOR losers), which may not yet carry
 *                    `Skipped` in `nodes` because the write happens later in the same pass.
 * @returns ids of `Pending` tasks that should become `Skipped`
 */
export function ComputeSkipCascade(
    nodes: readonly TaskGraphNode[],
    edges: readonly TaskGraphEdge[],
    seedSkipIDs: readonly string[] = [],
): string[] {
    const statusById = new Map(nodes.map((n) => [n.id, n.status]));
    const prerequisites = buildDependsOnAdjacency(edges.filter(isGatingEdge));

    const skipped = new Set<string>(seedSkipIDs);
    for (const n of nodes) if (n.status === 'Skipped') skipped.add(n.id);

    // Iterate to a fixpoint: each pass can only add, and there are finitely many nodes, so this
    // terminates in at most one pass per node.
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of nodes) {
            if (skipped.has(node.id)) continue;
            if (statusById.get(node.id) !== 'Pending') continue;

            const deps = prerequisites.get(node.id) ?? [];
            if (deps.length === 0) continue;   // an entry point is never skipped by cascade
            if (deps.every((d) => skipped.has(d))) {
                skipped.add(node.id);
                changed = true;
            }
        }
    }

    // Return only what this call decided — seeds and already-persisted Skipped are the caller's.
    const seeded = new Set(seedSkipIDs);
    return [...skipped].filter((id) => !seeded.has(id) && statusById.get(id) === 'Pending');
}

/** How a conditional edge's expression came out this cycle. */
export type EdgeConditionOutcome = 'satisfied' | 'unsatisfied' | 'unevaluable';

/** An edge with everything `ResolveExclusiveGroups` needs to decide it. */
export type EvaluatedEdge = {
    /** Stable identifier for the edge (the persisted `TaskDependency.ID`). */
    id: string;
    taskId: string;
    dependsOnTaskId: string;
    exclusiveGroup: string;
    originStatus: TaskGraphNodeStatus;
    /** Higher wins. */
    priority: number;
    /** Ascending tiebreak when priorities are equal. */
    sequence: number;
    conditionOutcome: EdgeConditionOutcome;
};

export type ExclusiveGroupResolution = {
    /** Edges that remain live — at most one per decided group. */
    keptEdgeIDs: string[];
    /** Edges that lost their group and must not gate their target. */
    loserEdgeIDs: string[];
    /** Targets of losing edges, seeding {@link ComputeSkipCascade}. */
    skipSeedTaskIDs: string[];
    /** Targets of an UNDECIDED group — neither run nor skipped until a human fixes the condition. */
    holdTaskIDs: string[];
};

/**
 * Resolves exclusive fan-outs: within a group, one branch runs and the rest are skipped.
 *
 * This is what a flow's `sequential` traversal actually is. The old engine took the
 * highest-priority satisfied edge and discarded the rest; expressing that as a dependency *chain*
 * would run branches the author's flow has never run, so it is modelled as an exclusive choice
 * decided at run time instead.
 *
 * Rules, each of which exists because the obvious alternative is wrong:
 *
 * - **Only terminal origins decide.** A group whose origin has not finished is not yet decidable and
 *   resolves to nothing. Recomputing next cycle is free; guessing is not.
 * - **Winner** = highest `priority` among satisfied edges, ties broken by ascending `sequence`.
 *   Sequence exists because compiled edges get fresh UUIDs, and a priority tie (the common case —
 *   the column defaults to 0) would otherwise resolve differently than the engine being replaced.
 * - **No satisfied and none unevaluable ⇒ every edge loses.** The walk simply ends down this fork,
 *   which is what the flow engine does when no outgoing path matches.
 * - **Any unevaluable ⇒ the whole group is UNDECIDED**: no winner, no losers, all targets HOLD.
 *   This is the rule that makes "a broken condition stalls visibly" true. Without it, the kept edges
 *   of a Complete origin are satisfied prerequisites and *every branch of the fork fires at once* —
 *   the worst possible XOR violation, produced by a typo.
 *
 * Deterministic on persisted state, so it is safe to recompute every poll cycle — no per-completion
 * callback, and restart-safe for free.
 *
 * @param terminalDecides which origin statuses may decide a group. `Complete` always; add `Failed`
 *                       under `failureSemantics: 'edges'`, where a failed step's outgoing paths are
 *                       its recovery paths.
 */
/**
 * Which of two competing edges wins: higher priority, then lower sequence, then edge id.
 *
 * **The id is a tiebreak, not a preference** — and without it this ordering is not total. Priority
 * and sequence both default to 0 and `Submit` persists those defaults, so a hand-authored or
 * LLM-authored spec routinely produces a genuine tie; dependencies load with no `ORDER BY`, so the
 * winner was decided by row order, which can differ between polls of the same graph. The worst
 * interleaving is not a wrong branch but NO branch: poll 1 picks `X→B` and skips C; poll 2's row
 * order flips, picks `Y→C` — already Skipped — and skips B. Both branches Skipped, and the graph
 * settles Complete having executed neither.
 *
 * Also used to ask whether an unevaluable edge could have beaten the winner, so the two questions
 * cannot disagree about what "beats" means.
 */
export function CompareEdgePrecedence(a: EvaluatedEdge, b: EvaluatedEdge): number {
    // ORDINAL, NOT COLLATED (R3-7). `localeCompare` with no arguments sorts under the host's ICU
    // locale, and the sign genuinely flips: `'aa070000'` vs `'ab070000'` compares one way under
    // `en` and the other under `da`, where the `aa` digraph collates as `å`. Dependency IDs are
    // UUIDs, so `aa` sequences are routine.
    //
    // Two instances with different `LANG` would then resolve the same `(priority=0, sequence=0)`
    // tie — the persisted default for hand- and LLM-authored specs — DIFFERENTLY, and since this
    // same comparator decides the unevaluable-dominance test, hold-versus-resolve diverges with it.
    // The worst interleaving is R2-5's own catastrophe across instances rather than across polls:
    // both XOR branches Skipped, graph settles Complete having executed neither.
    //
    // R2-5's shipped test runs both input orders in ONE process and cannot see this; Round 2's plan
    // prescribed `localeCompare`, so this corrects the prescription rather than a slip.
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function ResolveExclusiveGroups(
    edges: readonly EvaluatedEdge[],
    terminalDecides: ReadonlySet<TaskGraphNodeStatus> = new Set<TaskGraphNodeStatus>(['Complete']),
): ExclusiveGroupResolution {
    const byGroup = new Map<string, EvaluatedEdge[]>();
    for (const e of edges) {
        const list = byGroup.get(e.exclusiveGroup);
        if (list) list.push(e); else byGroup.set(e.exclusiveGroup, [e]);
    }

    const keptEdgeIDs: string[] = [];
    const loserEdgeIDs: string[] = [];
    const candidateSeeds: string[] = [];
    const holdTaskIDs: string[] = [];
    /** Targets a kept edge points at, anywhere in this resolution. */
    const keptTargets = new Set<string>();

    const loseWholeGroup = (group: readonly EvaluatedEdge[]): void => {
        for (const e of group) { loserEdgeIDs.push(e.id); candidateSeeds.push(e.taskId); }
    };

    for (const group of byGroup.values()) {
        // Every edge in a group leaves the same origin (the validator enforces it), so any member
        // answers "has the origin finished?".
        const originStatus = group[0].originStatus;

        // A FORK ON A STEP THAT WAS ITSELF SKIPPED TAKES NO BRANCH (R2-8).
        //
        // `Skipped` is not in `terminalDecides`, so this group used to fall through as undecided and
        // every edge stayed live — and `Skipped` satisfies prerequisites, so whichever target had
        // its OTHER prerequisites healthy simply ran, chosen by graph accident with its guard never
        // consulted. Ordinary conditional edges out of the same origin ARE decided (`DecideGate`
        // drops them); the exclusive dialect was the one that bypassed the guard.
        //
        // Every branch loses. Join survival already protects a target another live route reaches, so
        // this removes only the routes that genuinely were not taken — which is what the walker
        // concluded by never standing at the origin in the first place.
        if (originStatus === 'Skipped') { loseWholeGroup(group); continue; }

        if (!terminalDecides.has(originStatus)) continue;

        const satisfied = group.filter((e) => e.conditionOutcome === 'satisfied');
        const unevaluable = group.filter((e) => e.conditionOutcome === 'unevaluable');
        const winner = satisfied.length > 0 ? [...satisfied].sort(CompareEdgePrecedence)[0] : null;

        // HOLD ONLY IF A BROKEN GUARD COULD HAVE CHANGED THE ANSWER (R2-3 refinement).
        //
        // Holding on ANY unevaluable member is too blunt: an edge that could never have won tells us
        // nothing about the outcome, and stalling a fork whose winner is already known trades a
        // decided branch for a permanent wait. With nothing satisfied at all, any unevaluable edge
        // could have been the winner, so there is nothing to dominate it and the hold stands.
        if (unevaluable.length > 0 &&
            (!winner || unevaluable.some((u) => CompareEdgePrecedence(u, winner) < 0))) {
            for (const e of group) holdTaskIDs.push(e.taskId);
            continue;
        }

        if (!winner) { loseWholeGroup(group); continue; }

        for (const e of group) {
            if (e.id === winner.id) { keptEdgeIDs.push(e.id); keptTargets.add(e.taskId); }
            else { loserEdgeIDs.push(e.id); candidateSeeds.push(e.taskId); }
        }
    }

    // A LOSING EDGE DOES NOT DECIDE ITS TARGET — it only decides itself.
    //
    // Two edges in one group may point at the SAME task: `AIAgentStepPath` has no
    // Origin+Destination unique constraint, so two conditions routing to one destination is
    // drawable. One wins and one loses, which made the target simultaneously the winner's target
    // and a skip seed — and it was skipped 100% of the time, while the legacy walker ran it.
    //
    // Checked across the whole resolution rather than within the group: a target a winner reaches
    // is live no matter which fork that winner belongs to.
    //
    // This is the cheap half of the invariant. The other half — a route that survives through
    // ORDINARY edges, which this function cannot see — is {@link ConfirmSkipSeeds}.
    const skipSeedTaskIDs = candidateSeeds.filter((id) => !keptTargets.has(id));

    return { keptEdgeIDs, loserEdgeIDs, skipSeedTaskIDs, holdTaskIDs };
}

/**
 * Which skip seeds are real — the ones nothing still reaches.
 *
 * **The invariant.** A task may be marked `Skipped` only when EVERY route into it has been cut.
 * The dispatcher already enforces that for ordinary dropped edges (its `stillReachable` set), and
 * {@link ComputeSkipCascade}'s own contract promises it for joins: *"a join that is also reachable
 * from the winning branch therefore survives — which is the entire point, since a fork that
 * reconverges must still run its join."* Exclusive losers bypassed both and were written `Skipped`
 * directly.
 *
 * The shape that breaks: `A →(cond)→ Review → Publish` and `A →(else)→ Publish`. With the condition
 * true, the losing edge `A→Publish` seeded **Publish** as Skipped while Review was still running.
 * Review then completed, Publish was already terminal, `Skipped` satisfies dependents — and the
 * graph settled **Complete with the publish step never executed**. No error and no stall, which is
 * why it needed a test rather than a bug report.
 *
 * **Why the cascade cannot do this job.** `ComputeSkipCascade` decides over node STATUS — "every
 * gating predecessor is Skipped". A genuine XOR loser's origin is `Complete`, not `Skipped`, so the
 * cascade would refuse every legitimate loser. Seed confirmation is a question about EDGES: is any
 * gating edge into this task still live? The two rules are complementary, and this is the one the
 * cascade is missing.
 *
 * @param seedTaskIDs candidate skips (exclusive losers) this cycle
 * @param liveEdges   edges that survived resolution — losers and definitely-false edges removed
 * @returns the seeds with no live gating route remaining
 */
export function ConfirmSkipSeeds(
    seedTaskIDs: readonly string[],
    liveEdges: readonly TaskGraphEdge[],
): string[] {
    // Only GATING edges keep a task alive, matching ComputeEligibleTasks and ComputeSkipCascade: an
    // edge that does not gate a task starting cannot argue that it will start.
    const reached = new Set(liveEdges.filter(isGatingEdge).map((e) => e.taskId));
    return seedTaskIDs.filter((id) => !reached.has(id));
}
