/**
 * @fileoverview Projects a `TaskGraphSpec` onto the generic canvas shapes, and back.
 *
 * **Kept pure and separate from the component on purpose.** Everything interesting about rendering a
 * task graph — which node is an entry point, which edge is conditional, how a runtime status maps to
 * a visual one, whether removing a node orphans an edge — is decidable from data alone. Putting it
 * in a component would make it reachable only through a TestBed, and the resulting tests would be
 * about Angular rather than about graphs.
 *
 * **The direction flip, again.** A `TaskGraphSpec` edge points *backwards* (`dependsOn`: "I wait for
 * X"); a canvas connection points *forwards* (source → target). Same edge, opposite authoring
 * convention — the graph is written by whoever knows the prerequisites, the canvas drawn by whoever
 * follows the arrows. This is the second place in the program that inversion appears (Save as
 * Workflow is the first), which is why it is stated rather than left implicit.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import {
    NormalizeDependency,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    type TaskGraphDependency,
} from '@memberjunction/ai-core-plus';
import type { FlowConnection, FlowNode, FlowNodeStatus, FlowNodeTypeConfig } from '@memberjunction/ng-flow-editor';

/** Node types the palette offers. Two, because a task is either an agent's or a person's. */
export const TASK_GRAPH_NODE_TYPES: FlowNodeTypeConfig[] = [
    {
        Type: 'AgentTask',
        Label: 'Agent Step',
        Icon: 'fa-robot',
        Color: '#4A6FA5',
        Category: 'Steps',
        DefaultPorts: [
            { ID: 'in', Direction: 'input', Side: 'top', Multiple: true },
            { ID: 'out', Direction: 'output', Side: 'bottom', Multiple: true },
        ],
    },
    {
        Type: 'HumanTask',
        Label: 'Person Step',
        Icon: 'fa-user-check',
        Color: '#7B1FA2',
        Category: 'Steps',
        DefaultPorts: [
            { ID: 'in', Direction: 'input', Side: 'top', Multiple: true },
            { ID: 'out', Direction: 'output', Side: 'bottom', Multiple: true },
        ],
    },
];

/** Live per-task state for the runtime overlay, keyed by `tempId`. */
export type TaskGraphRuntimeStatus = Record<string, TaskGraphRuntimeState>;

/** What a task is doing right now, in the durable engine's own vocabulary. */
export type TaskGraphRuntimeState =
    | 'Pending'
    | 'In Progress'
    | 'Complete'
    | 'Failed'
    | 'Blocked'
    | 'Cancelled'
    | 'Deferred';

/**
 * Maps a durable task state onto the canvas's visual vocabulary.
 *
 * Two mappings are worth explaining. `Blocked` renders as a **warning**, not an error: nothing went
 * wrong, the graph simply cannot reach it — showing it as a failure would send someone hunting for a
 * bug that does not exist. `Deferred` renders as `pending` because, to the person watching, waiting
 * on a schedule and waiting on a prerequisite look and mean the same thing.
 */
export function RuntimeStateToNodeStatus(state: TaskGraphRuntimeState | undefined): FlowNodeStatus {
    switch (state) {
        case 'In Progress': return 'running';
        case 'Complete':    return 'success';
        case 'Failed':      return 'error';
        case 'Blocked':     return 'warning';
        case 'Cancelled':   return 'disabled';
        case 'Deferred':    return 'pending';
        case 'Pending':     return 'pending';
        default:            return 'default';
    }
}

/** True when the node is a person's step rather than an agent's. */
export function IsHumanTask(node: TaskGraphSpecNode): boolean {
    return !node.agentName;
}

/** Entry points: nodes nothing else has to finish first. Same rule the traversal engine uses. */
export function GetEntryTempIds(spec: TaskGraphSpec): string[] {
    return (spec.tasks ?? []).filter((t) => (t.dependsOn ?? []).length === 0).map((t) => t.tempId);
}

/** Every dependency of a node, in normalized object form. */
export function GetDependencies(node: TaskGraphSpecNode): TaskGraphDependency[] {
    return (node.dependsOn ?? []).map(NormalizeDependency);
}

/** The `tempId`s that depend on `tempId` — i.e. what breaks if it is removed. */
export function GetDependents(spec: TaskGraphSpec, tempId: string): string[] {
    return (spec.tasks ?? [])
        .filter((t) => GetDependencies(t).some((d) => d.tempId === tempId))
        .map((t) => t.tempId);
}

/** Deterministic id for a canvas edge, so re-renders don't churn selection. */
function edgeId(fromTempId: string, toTempId: string): string {
    return `${fromTempId}->${toTempId}`;
}

/**
 * Projects the spec onto canvas nodes.
 *
 * Positions are left at the origin: layout is the canvas's job (Dagre), and a spec carries no
 * geometry precisely because a task graph is a *logical* structure. An agent that emitted one never
 * had an opinion about where the boxes go.
 */
export function SpecToNodes(spec: TaskGraphSpec, runtime?: TaskGraphRuntimeStatus): FlowNode[] {
    const entryIds = new Set(GetEntryTempIds(spec));

    return (spec.tasks ?? []).map((task) => {
        const human = IsHumanTask(task);
        return {
            ID: task.tempId,
            Type: human ? 'HumanTask' : 'AgentTask',
            Label: task.name,
            Subtitle: human ? 'Waiting on a person' : task.agentName,
            Icon: human ? 'fa-user-check' : 'fa-robot',
            Status: RuntimeStateToNodeStatus(runtime?.[task.tempId]),
            StatusMessage: task.description,
            IsStartNode: entryIds.has(task.tempId),
            Position: { X: 0, Y: 0 },
            Ports: [
                { ID: 'in', Direction: 'input', Side: 'top', Multiple: true },
                { ID: 'out', Direction: 'output', Side: 'bottom', Multiple: true },
            ],
            Data: { TempId: task.tempId },
        };
    });
}

/**
 * Projects the spec's dependencies onto canvas connections, reversing their direction.
 *
 * A conditional edge is drawn dashed and labeled with its condition, because the difference between
 * "always" and "only sometimes" is the single most consequential thing about an edge and the one a
 * reader is most likely to miss when scanning a diagram.
 *
 * Edges naming a task that is not in the graph are skipped rather than drawn dangling — the
 * validator reports them as `UnknownDependency`, and rendering a connection to nowhere would be a
 * second, worse way of saying the same thing.
 */
export function SpecToConnections(spec: TaskGraphSpec): FlowConnection[] {
    const known = new Set((spec.tasks ?? []).map((t) => t.tempId));
    const connections: FlowConnection[] = [];

    for (const task of spec.tasks ?? []) {
        for (const dep of GetDependencies(task)) {
            if (!known.has(dep.tempId)) continue;

            const conditional = !!dep.condition?.trim();
            connections.push({
                ID: edgeId(dep.tempId, task.tempId),
                // Reversed: dependsOn points back at the prerequisite, the drawn arrow points forward.
                SourceNodeID: dep.tempId,
                SourcePortID: 'out',
                TargetNodeID: task.tempId,
                TargetPortID: 'in',
                Label: conditional ? 'if' : undefined,
                LabelDetail: dep.condition ?? undefined,
                LabelIcon: conditional ? 'fa-code-branch' : undefined,
                Condition: dep.condition ?? undefined,
                Style: conditional ? 'dashed' : 'solid',
                Data: { FromTempId: dep.tempId, ToTempId: task.tempId },
            });
        }
    }
    return connections;
}

/**
 * Adds a dependency to the spec, returning a NEW spec.
 *
 * Immutable because the component emits the result to a host that may keep it, diff it, or reject
 * it; mutating the input would let a canceled edit leak into the host's copy anyway. A duplicate
 * edge is a no-op rather than an error — dragging the same connection twice is a slip, not a
 * request to corrupt the graph.
 */
export function AddDependency(spec: TaskGraphSpec, fromTempId: string, toTempId: string, condition?: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? []).map((task) => {
            if (task.tempId !== toTempId) return task;
            const existing = GetDependencies(task);
            if (existing.some((d) => d.tempId === fromTempId)) return task;
            const next: TaskGraphDependency | string = condition?.trim()
                ? { tempId: fromTempId, condition }
                : fromTempId;
            return { ...task, dependsOn: [...(task.dependsOn ?? []), next] };
        }),
    };
}

/** Removes a dependency, returning a NEW spec. */
export function RemoveDependency(spec: TaskGraphSpec, fromTempId: string, toTempId: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? []).map((task) =>
            task.tempId !== toTempId
                ? task
                : { ...task, dependsOn: (task.dependsOn ?? []).filter((d) => NormalizeDependency(d).tempId !== fromTempId) },
        ),
    };
}

/**
 * Removes a task AND every edge into it, returning a NEW spec.
 *
 * Severing the inbound edges is not a convenience — leaving them would produce a graph whose
 * `dependsOn` names a task that no longer exists, which the validator rejects as
 * `UnknownDependency`. Deleting a box on a canvas should not make the graph invalid.
 */
export function RemoveTask(spec: TaskGraphSpec, tempId: string): TaskGraphSpec {
    return {
        ...spec,
        tasks: (spec.tasks ?? [])
            .filter((t) => t.tempId !== tempId)
            .map((t) => ({ ...t, dependsOn: (t.dependsOn ?? []).filter((d) => NormalizeDependency(d).tempId !== tempId) })),
    };
}

/** Adds a task, returning a NEW spec. */
export function AddTask(spec: TaskGraphSpec, task: TaskGraphSpecNode): TaskGraphSpec {
    return { ...spec, tasks: [...(spec.tasks ?? []), task] };
}

/** Replaces a task in place by `tempId`, returning a NEW spec. */
export function UpdateTask(spec: TaskGraphSpec, tempId: string, next: TaskGraphSpecNode): TaskGraphSpec {
    return { ...spec, tasks: (spec.tasks ?? []).map((t) => (t.tempId === tempId ? next : t)) };
}

/**
 * Would adding `from → to` create a cycle?
 *
 * Answered before the edge exists, so the canvas can refuse it rather than create an invalid graph
 * and report it afterwards. A self-edge is the degenerate case and is caught first.
 *
 * Iterative rather than recursive: the graph may come from an LLM, and a deeply-chained spec should
 * produce a refusal, not a stack overflow.
 */
export function WouldCreateCycle(spec: TaskGraphSpec, fromTempId: string, toTempId: string): boolean {
    if (fromTempId === toTempId) return true;

    // A cycle appears iff `from` is already reachable from `to` by following dependsOn edges —
    // i.e. `to` already (transitively) waits on `from`.
    const dependenciesOf = new Map<string, string[]>(
        (spec.tasks ?? []).map((t) => [t.tempId, GetDependencies(t).map((d) => d.tempId)]),
    );

    const stack = [...(dependenciesOf.get(fromTempId) ?? [])];
    const seen = new Set<string>();
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (current === toTempId) return true;
        if (seen.has(current)) continue;
        seen.add(current);
        stack.push(...(dependenciesOf.get(current) ?? []));
    }
    return false;
}

/** A unique `tempId` for a newly added task, stable and readable. */
export function NextTempId(spec: TaskGraphSpec, prefix = 'task'): string {
    const taken = new Set((spec.tasks ?? []).map((t) => t.tempId));
    let n = (spec.tasks ?? []).length + 1;
    while (taken.has(`${prefix}${n}`)) n++;
    return `${prefix}${n}`;
}
