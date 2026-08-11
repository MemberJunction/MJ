/**
 * @fileoverview Giving a task graph coordinates it never had.
 *
 * **Why this is needed at all.** A `TaskGraphSpec` is a *logical* structure — an agent that emitted
 * one never had an opinion about where the boxes go — and a `Task` row has no geometry columns
 * whatsoever. So anything rendering a graph that was not drawn by hand has nothing to position with,
 * and every node lands on the origin in a single unreadable pile. That is not a canvas bug; the data
 * genuinely does not contain the answer, so something has to compute it.
 *
 * **Why it lives here rather than in the canvas.** Three callers need the same answer and must agree
 * on it: the run visualizer (Task rows, no layout, ever), the editor's auto-arrange (a graph the user
 * never positioned), and Save as Workflow (which has to write `PositionX`/`PositionY` onto the steps
 * it creates, server-side, where no canvas exists). A layout that lived in the browser could not
 * serve the third, and two implementations would drift into disagreeing about the same graph.
 *
 * **The approach** is the standard layered one, minus the parts that buy little here. Task graphs in
 * practice are small — tens of nodes — and shaped like pipelines with occasional forks, so the
 * expensive refinements that matter for hundred-node graphs (iterative crossing minimisation to
 * convergence, priority-based coordinate compaction) are not worth their complexity. What is kept is
 * what makes a graph readable: every edge points the same direction, prerequisites are strictly left
 * of their dependents, and siblings are pulled near the average of their neighbours so edges stay
 * short and crossings stay rare.
 *
 * Pure and dependency-free, like everything else in this folder.
 *
 * @module @memberjunction/ai-core-plus
 */
import { NormalizeDependency, type TaskGraphSpec } from './task-graph-spec';

/** Where a node goes, in canvas units. */
export type GraphNodePosition = { X: number; Y: number };

/** Knobs a caller may want; every one has a sane default. */
export type GraphLayoutOptions = {
    /** Node box width. Drives horizontal spacing. */
    NodeWidth?: number;
    /** Node box height. Drives vertical spacing. */
    NodeHeight?: number;
    /** Gap between one layer and the next. */
    LayerGap?: number;
    /** Gap between siblings within a layer. */
    SiblingGap?: number;
    /**
     * Which way the graph flows.
     *
     * `LR` is the default because a workflow reads as a sequence of steps, and left-to-right is how
     * the flow editor already draws them — a run view that flowed downward would show the same
     * workflow in a different shape than the screen the author drew it on.
     */
    Direction?: 'LR' | 'TB';
    /** Origin offset, so a caller can inset the whole graph from the canvas edge. */
    OriginX?: number;
    OriginY?: number;
};

const DEFAULTS = {
    NodeWidth: 200,
    NodeHeight: 90,
    LayerGap: 90,
    SiblingGap: 34,
    Direction: 'LR' as const,
    OriginX: 40,
    OriginY: 40,
};

/** How many barycenter sweeps to run. Small graphs converge almost immediately. */
const SWEEPS = 4;

/** One prerequisite relationship: `To` waits for `From`. */
export type GraphLayoutEdge = { From: string; To: string };

/** The rectangle a laid-out graph occupies — for fit-to-view and canvas sizing. */
export type GraphLayoutBox = { X: number; Y: number; Width: number; Height: number };

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
 * The same layout from bare ids and edges, for callers that do not have a `TaskGraphSpec`.
 *
 * **This is the form the run views need.** A graph being watched is `Task` rows joined by
 * `TaskDependency` rows — there is no spec anywhere, and reconstructing one just to lay it out would
 * mean inventing kinds and configuration the renderer does not care about. Anything that can produce
 * "these nodes, these prerequisites" gets the same arrangement the editor would draw.
 */
export function LayoutGraphNodes(
    nodeIDs: readonly string[],
    edges: readonly GraphLayoutEdge[],
    options: GraphLayoutOptions = {},
): Map<string, GraphNodePosition> {
    const opts = { ...DEFAULTS, ...options };
    const positions = new Map<string, GraphNodePosition>();
    if (nodeIDs.length === 0) return positions;

    const ids = [...new Set(nodeIDs)];
    const known = new Set(ids);
    const predecessors = buildPredecessorMapFromEdges(ids, edges, known);
    const successors = invert(predecessors, ids);

    const layers = assignLayers(ids, predecessors);
    const ordered = orderWithinLayers(layers, predecessors, successors);

    // Longest column decides the cross-axis extent every other column is centred against, so a
    // two-node layer sits beside the middle of a six-node one rather than at its top edge.
    const tallest = Math.max(...ordered.map((layer) => layer.length));
    const alongStep = (opts.Direction === 'LR' ? opts.NodeWidth : opts.NodeHeight) + opts.LayerGap;
    const acrossSize = opts.Direction === 'LR' ? opts.NodeHeight : opts.NodeWidth;
    const acrossStep = acrossSize + opts.SiblingGap;

    ordered.forEach((layer, layerIndex) => {
        const layerExtent = layer.length * acrossStep - opts.SiblingGap;
        const tallestExtent = tallest * acrossStep - opts.SiblingGap;
        const acrossOffset = (tallestExtent - layerExtent) / 2;

        layer.forEach((tempId, indexInLayer) => {
            const along = layerIndex * alongStep;
            const across = acrossOffset + indexInLayer * acrossStep;
            positions.set(tempId, opts.Direction === 'LR'
                ? { X: opts.OriginX + along, Y: opts.OriginY + across }
                : { X: opts.OriginX + across, Y: opts.OriginY + along });
        });
    });

    return positions;
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

/**
 * A dense rank per node, in the order the graph says its steps come.
 *
 * **What this is for.** A `Task` row has no sequence column, so every consumer listing a graph's
 * steps fell back to creation order — the compiler's walk, which matches neither the order someone
 * drew the steps in nor the order they execute in. A graph that had not started yet therefore listed
 * itself essentially at random, with steps appearing above the steps they depend on.
 *
 * The edges already define a partial order, and — unlike timestamps — it is knowable before anything
 * runs, which is exactly when it is needed. This resolves that partial order into a total one using
 * the same layering the layout uses, so the list order and the left-to-right drawing agree by
 * construction rather than by coincidence.
 *
 * Nodes in the same layer are genuinely concurrent and get consecutive ranks in the layout's own
 * within-layer order; consumers that have real start times break the tie with those instead.
 */
export function RankGraphNodes(
    nodeIDs: readonly string[],
    edges: readonly GraphLayoutEdge[],
): Map<string, number> {
    const ranks = new Map<string, number>();
    if (nodeIDs.length === 0) return ranks;

    const ids = [...new Set(nodeIDs)];
    const known = new Set(ids);
    const predecessors = buildPredecessorMapFromEdges(ids, edges, known);
    const ordered = orderWithinLayers(assignLayers(ids, predecessors), predecessors, invert(predecessors, ids));

    let rank = 0;
    for (const layer of ordered) {
        for (const id of layer) ranks.set(id, rank++);
    }
    return ranks;
}

/**
 * The bounding box a laid-out graph occupies.
 *
 * Saves every caller from recomputing it for fit-to-view, canvas sizing, or centring — and gets the
 * node's own extent right, which a naive min/max over positions alone does not.
 */
export function GraphLayoutBounds(
    positions: ReadonlyMap<string, GraphNodePosition>,
    options: GraphLayoutOptions = {},
): GraphLayoutBox {
    const opts = { ...DEFAULTS, ...options };
    if (positions.size === 0) return { X: 0, Y: 0, Width: 0, Height: 0 };

    const xs = [...positions.values()].map((p) => p.X);
    const ys = [...positions.values()].map((p) => p.Y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
        X: minX,
        Y: minY,
        Width: Math.max(...xs) - minX + opts.NodeWidth,
        Height: Math.max(...ys) - minY + opts.NodeHeight,
    };
}

/**
 * Reads each node's prerequisites, keeping only edges whose endpoints are both in the graph.
 *
 * A dangling reference is dropped rather than treated as a layer constraint: validation reports it
 * as a real error elsewhere, and letting it push a node into a phantom layer would corrupt the
 * drawing of an otherwise fine graph. A self-edge is dropped for the same reason — it constrains a
 * node to sit after itself, which has no solution.
 */
function buildPredecessorMapFromEdges(
    ids: readonly string[],
    edges: readonly GraphLayoutEdge[],
    known: Set<string>,
): Map<string, string[]> {
    const map = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const edge of edges) {
        if (!known.has(edge.From) || !known.has(edge.To) || edge.From === edge.To) continue;
        const preds = map.get(edge.To)!;
        if (!preds.includes(edge.From)) preds.push(edge.From);
    }
    return map;
}

function invert(predecessors: Map<string, string[]>, ids: string[]): Map<string, string[]> {
    const successors = new Map<string, string[]>(ids.map((id) => [id, []]));
    for (const [node, preds] of predecessors) {
        for (const p of preds) successors.get(p)?.push(node);
    }
    return successors;
}

/**
 * Puts each node one layer past its furthest prerequisite.
 *
 * Longest-path rather than shortest: a node must sit to the right of *every* prerequisite, so a step
 * that waits on both a one-hop and a four-hop chain belongs at layer five. Shortest-path would place
 * it at two and draw an edge running backwards, which reads as a loop in a graph that has none.
 *
 * **Cycles cannot hang this.** They are rejected at compile time, but a hand-built spec could still
 * contain one, and a renderer that spun forever on bad input would be worse than one that drew it
 * imperfectly. The pass count is bounded by the node count, after which any node still unresolved is
 * placed at the deepest layer computed so far.
 */
function assignLayers(ids: string[], predecessors: Map<string, string[]>): string[][] {
    const layerOf = new Map<string, number>();

    for (const id of ids) {
        if ((predecessors.get(id) ?? []).length === 0) layerOf.set(id, 0);
    }

    // Relax until stable. Each pass can only push nodes further right, so this terminates.
    for (let pass = 0; pass < ids.length; pass++) {
        let changed = false;
        for (const id of ids) {
            const preds = predecessors.get(id) ?? [];
            if (preds.length === 0) continue;
            const resolved = preds.map((p) => layerOf.get(p)).filter((n): n is number => n !== undefined);
            if (resolved.length !== preds.length) continue; // a prerequisite is not placed yet
            const candidate = Math.max(...resolved) + 1;
            if (layerOf.get(id) !== candidate) {
                layerOf.set(id, candidate);
                changed = true;
            }
        }
        if (!changed) break;
    }

    // Anything still unplaced sits in a cycle. Park it at the end rather than dropping it — a node
    // the user can see and question beats a node that silently vanished from their graph.
    const deepest = layerOf.size > 0 ? Math.max(...layerOf.values()) : 0;
    for (const id of ids) {
        if (!layerOf.has(id)) layerOf.set(id, deepest + 1);
    }

    const layerCount = Math.max(...layerOf.values()) + 1;
    const layers: string[][] = Array.from({ length: layerCount }, () => []);
    // Seeded in the spec's own order, which keeps the result stable across runs.
    for (const id of ids) layers[layerOf.get(id)!].push(id);
    return layers;
}

/**
 * Orders each layer so edges stay short, using the barycenter heuristic.
 *
 * Each node is pulled toward the average position of its neighbours in the adjacent layer, sweeping
 * forward then back a few times. It is not optimal — crossing minimisation is NP-hard — but on
 * pipeline-shaped graphs it reliably produces the arrangement a person would have drawn, and it
 * costs a handful of passes over a few dozen nodes.
 *
 * Nodes with no neighbour in the reference layer keep their current index, so an isolated node does
 * not migrate to the top on every sweep.
 */
function orderWithinLayers(
    layers: string[][],
    predecessors: Map<string, string[]>,
    successors: Map<string, string[]>,
): string[][] {
    const ordered = layers.map((layer) => [...layer]);

    for (let sweep = 0; sweep < SWEEPS; sweep++) {
        const forward = sweep % 2 === 0;
        const range = forward
            ? [...ordered.keys()].slice(1)
            : [...ordered.keys()].slice(0, -1).reverse();

        for (const i of range) {
            const reference = forward ? ordered[i - 1] : ordered[i + 1];
            const indexIn = new Map(reference.map((id, idx) => [id, idx]));
            const neighboursOf = forward ? predecessors : successors;

            const scored = ordered[i].map((id, currentIndex) => {
                const neighbours = (neighboursOf.get(id) ?? [])
                    .map((n) => indexIn.get(n))
                    .filter((n): n is number => n !== undefined);
                const barycenter = neighbours.length > 0
                    ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length
                    : currentIndex;
                return { id, barycenter, currentIndex };
            });

            // Ties break on the existing index, so equal-barycenter siblings keep a stable order
            // instead of swapping on every sweep.
            scored.sort((a, b) => a.barycenter - b.barycenter || a.currentIndex - b.currentIndex);
            ordered[i] = scored.map((s) => s.id);
        }
    }

    return ordered;
}
