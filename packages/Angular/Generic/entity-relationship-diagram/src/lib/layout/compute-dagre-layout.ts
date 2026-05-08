/**
 * Classic hierarchical (dagre) ERD layout — the "old school" option.
 *
 * Produces the same `ErdLayout` shape as `compute-erd-layout.ts` so the
 * component's template and CSS render identical cards; only position
 * (x / y) and edge routes differ.  Schema bands are omitted in this mode
 * — the whole point of the hierarchical layout is that the vertical/
 * horizontal axis communicates relationship direction, not schema
 * grouping.
 *
 * Implementation:
 *   1. Measure every card using the same `fieldsForNode` logic the
 *      schema-grid uses, so card dimensions + visible fields match
 *      exactly.
 *   2. Feed nodes + FK edges into dagre with `rankdir: 'LR'` (left-to-
 *      right hierarchy: sources on the left, leaves on the right).
 *   3. Convert dagre's centred coords to top-left card coords.
 *   4. Build orthogonal 3-segment edges (same router the schema-grid
 *      uses) so markers + hit targets match.
 */

import dagre from '@dagrejs/dagre';
import type { ERDNode, ERDField } from '../interfaces/erd-types';
import type { ErdLayout, ErdLayoutOptions, LaidOutNode, LaidOutEdge } from './compute-erd-layout';

// Mirrors the private helper in compute-erd-layout.ts — kept in sync so
// both layouts produce identical card dimensions for the same input.
function fieldsForNode(
    node: ERDNode,
    expanded: boolean,
    showAll: boolean,
    headerH: number,
    fieldH: number,
    moreH: number,
): { visibleFields: ERDField[]; height: number } {
    const visibleFields = expanded || showAll
        ? node.fields
        : node.fields.filter(f => f.isPrimaryKey || !!f.relatedNodeId);

    const hasMore = !expanded && !showAll && node.fields.length > visibleFields.length;
    const rowCount = Math.max(visibleFields.length, 1);
    const height = headerH + rowCount * fieldH + 8 + (hasMore ? moreH : 4);
    return { visibleFields, height };
}

export interface DagreLayoutOptions extends ErdLayoutOptions {
    /** Direction of the hierarchy. Default 'LR' (left-to-right). */
    rankDir?: 'TB' | 'BT' | 'LR' | 'RL';
    /** Horizontal separation between nodes in the same rank. Default 80. */
    nodeSep?: number;
    /** Separation between ranks. Default 120. */
    rankSep?: number;
}

export function computeDagreLayout(nodes: ERDNode[], options: DagreLayoutOptions = {}): ErdLayout {
    if (nodes.length === 0) {
        return { nodes: [], edges: [], bands: [], totalWidth: 0, totalHeight: 0 };
    }

    const nodeW = options.nodeWidth ?? 220;
    const headerH = options.headerHeight ?? 36;
    const fieldH = options.fieldHeight ?? 22;
    const moreH = options.moreToggleHeight ?? 22;
    const canvasPad = options.canvasPad ?? 40;
    const rankDir = options.rankDir ?? 'LR';
    const nodeSep = options.nodeSep ?? 80;
    const rankSep = options.rankSep ?? 120;
    const expandedIds = options.expandedNodeIds ?? new Set<string>();
    const showAll = options.showAllFields ?? false;

    // Step 1: measure cards.
    type Measured = { node: ERDNode; visibleFields: ERDField[]; height: number };
    const measured: Measured[] = nodes.map(n => {
        const expanded = expandedIds.has(n.id) || showAll;
        const { visibleFields, height } = fieldsForNode(n, expanded, showAll, headerH, fieldH, moreH);
        return { node: n, visibleFields, height };
    });

    // Step 2: build dagre graph.
    const g = new dagre.graphlib.Graph<{ label: string }>({ directed: true, multigraph: true });
    g.setGraph({ rankdir: rankDir, nodesep: nodeSep, ranksep: rankSep, marginx: canvasPad, marginy: canvasPad });
    g.setDefaultEdgeLabel(() => ({}));

    for (const m of measured) {
        g.setNode(m.node.id, { width: nodeW, height: m.height });
    }

    const visibleIds = new Set(measured.map(m => m.node.id));
    for (const m of measured) {
        for (const f of m.node.fields) {
            if (!f.relatedNodeId || !visibleIds.has(f.relatedNodeId)) continue;
            // Dagre doesn't love self-loops for ranking; skip — they're still
            // rendered via the edge router below.
            if (f.relatedNodeId === m.node.id) continue;
            g.setEdge(m.node.id, f.relatedNodeId, { fieldName: f.name }, `${m.node.id}--${f.name}--${f.relatedNodeId}`);
        }
    }

    dagre.layout(g);

    // Step 3: convert to LaidOutNode (top-left coords).
    const laidOutNodes: LaidOutNode[] = measured.map(m => {
        const { x: cx, y: cy } = g.node(m.node.id);
        return {
            ...m.node,
            x: cx - nodeW / 2,
            y: cy - m.height / 2,
            width: nodeW,
            height: m.height,
            visibleFields: m.visibleFields,
            hasMore: !showAll && !expandedIds.has(m.node.id) && m.node.fields.length > m.visibleFields.length,
        };
    });

    // Step 4: build edges using the same orthogonal router schema-grid uses.
    const edges = buildEdges(laidOutNodes, headerH, fieldH);

    // Canvas size = graph bounds (dagre already accounted for margin).
    const { width: totalWidth, height: totalHeight } = g.graph() as unknown as { width: number; height: number };

    return {
        nodes: laidOutNodes,
        edges,
        bands: [],
        totalWidth: totalWidth || 0,
        totalHeight: totalHeight || 0,
    };
}

// ──────────────────────────────────────────────────────────────────────────
// Edge routing — same 3/5-segment router as the schema-grid layout.  Kept
// as a local copy to avoid coupling the two files; the output shape of
// `LaidOutEdge` is the public contract.
// ──────────────────────────────────────────────────────────────────────────

function buildEdges(nodes: LaidOutNode[], headerH: number, fieldH: number): LaidOutEdge[] {
    const byId = new Map<string, LaidOutNode>();
    for (const n of nodes) byId.set(n.id, n);

    const edges: LaidOutEdge[] = [];

    for (const src of nodes) {
        for (const f of src.fields) {
            if (!f.relatedNodeId) continue;
            const tgt = byId.get(f.relatedNodeId);
            if (!tgt) continue;

            const fieldIdx = src.visibleFields.findIndex(vf => vf.name === f.name);
            const sourceY = fieldIdx >= 0
                ? src.y + headerH + fieldIdx * fieldH + fieldH / 2
                : src.y + src.height / 2;

            edges.push(routeEdge({
                id: `${src.id}--${f.name}--${tgt.id}`,
                sourceId: src.id,
                targetId: tgt.id,
                sourceY,
                sourceField: f,
                src,
                tgt,
            }));
        }
    }

    return edges;
}

interface RouteInput {
    id: string;
    sourceId: string;
    targetId: string;
    sourceY: number;
    sourceField: ERDField;
    src: LaidOutNode;
    tgt: LaidOutNode;
}

function routeEdge(r: RouteInput): LaidOutEdge {
    const { src, tgt, sourceY } = r;
    const selfReference = src.id === tgt.id;

    if (selfReference) {
        const loopR = 18;
        const sx = src.x + src.width;
        const points: Array<[number, number]> = [
            [sx, sourceY],
            [sx + loopR, sourceY],
            [sx + loopR, src.y - 10],
            [src.x + src.width / 2, src.y - 10],
            [src.x + src.width / 2, src.y],
        ];
        return {
            id: r.id, sourceId: r.sourceId, targetId: r.targetId,
            sourceY, sourceField: r.sourceField, points,
            selfReference: true, goingRight: true,
        };
    }

    const sCenterX = src.x + src.width / 2;
    const tCenterX = tgt.x + tgt.width / 2;
    const goingRight = tCenterX >= sCenterX;
    const sx = goingRight ? src.x + src.width : src.x;
    const tx = goingRight ? tgt.x : tgt.x + tgt.width;
    const ty = tgt.y + 18;
    const midX = goingRight
        ? sx + Math.max(24, (tx - sx) / 2)
        : sx - Math.max(24, (sx - tx) / 2);

    const points: Array<[number, number]> = [
        [sx, sourceY], [midX, sourceY], [midX, ty], [tx, ty],
    ];

    return {
        id: r.id, sourceId: r.sourceId, targetId: r.targetId,
        sourceY, sourceField: r.sourceField, points,
        selfReference: false, goingRight,
    };
}
