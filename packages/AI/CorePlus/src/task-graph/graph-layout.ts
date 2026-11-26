/**
 * @fileoverview Giving a `TaskGraphSpec` coordinates it never had.
 *
 * Delegates the pure layered layout algorithm to `@memberjunction/graph` (`LayoutGraphNodes`)
 * while keeping `TaskGraphSpec`-coupled helpers (`LayoutTaskGraph`, `ResolveTaskGraphPositions`)
 * here in `@memberjunction/ai-core-plus`.
 *
 * @module @memberjunction/ai-core-plus
 */
import {
    LayoutGraphNodes,
    type GraphLayoutEdge,
    type GraphLayoutOptions,
    type GraphNodePosition,
} from '@memberjunction/graph';
import { NormalizeDependency, type TaskGraphSpec } from './task-graph-spec';

/**
 * Computes a position for every node in a spec, keyed by `tempId`.
 *
 * Deterministic: the same graph always produces the same coordinates, which matters because a run
 * view re-projects on every status change and a layout that shifted underneath the user on each poll
 * would be unusable.
 */
export function LayoutTaskGraph(
    spec: TaskGraphSpec,
    options: GraphLayoutOptions = {},
): Map<string, GraphNodePosition> {
    const tasks = spec?.tasks ?? [];
    if (tasks.length === 0) return new Map();

    const edges: GraphLayoutEdge[] = [];
    for (const task of tasks) {
        for (const raw of task.dependsOn ?? []) {
            edges.push({ From: NormalizeDependency(raw).tempId, To: task.tempId });
        }
    }
    return LayoutGraphNodes(tasks.map((t) => t.tempId), edges, options);
}

/**
 * A spec's node positions: the author's arrangement where there is one, a computed layout elsewhere.
 *
 * **Why this is not `LayoutTaskGraph`.** That function lays a spec out from scratch and ignores
 * `node.layout` entirely — correct for a graph an agent emitted, which has no opinion about where
 * the boxes go, and wrong for one compiled from a Flow agent, where every position is something a
 * person dragged into place.
 *
 * **Why it is shared rather than written at each call site.** Two surfaces render a stored graph —
 * the agent run's detail panel, from the spec recorded on the step, and the Workflows run view, from
 * the Task rows — and a viewer that computed its own arrangement would draw the same workflow
 * differently depending on which screen it was opened from. Mixing per-node rather than choosing one
 * source for the whole graph matters too: a workflow whose author positioned some steps and left
 * others keeps the positions they chose.
 *
 * Returning positions is the whole point. A caller that cannot supply them leaves every node at the
 * origin, and a canvas asked to fit a graph whose nodes are all in one place zooms until that single
 * point fills the viewport — which is what a 265% zoom over a four-step workflow actually was.
 */
export function ResolveTaskGraphPositions(
    spec: TaskGraphSpec | null | undefined,
    options: GraphLayoutOptions = {},
): Map<string, GraphNodePosition> {
    const tasks = spec?.tasks ?? [];
    if (tasks.length === 0) return new Map();

    const authored = new Map<string, GraphNodePosition>();
    for (const task of tasks) {
        const { x, y } = task.layout ?? {};
        if (typeof x === 'number' && typeof y === 'number') authored.set(task.tempId, { X: x, Y: y });
    }
    if (authored.size === tasks.length) return authored;

    // Computed over the WHOLE graph, not just the unpositioned nodes: a node's place depends on where
    // it sits in the topology, and laying out a subset would position it as though the rest of the
    // workflow did not exist. The author's positions are then laid back over the top.
    const computed = LayoutTaskGraph(spec!, options);
    for (const [id, position] of authored) computed.set(id, position);
    return computed;
}
