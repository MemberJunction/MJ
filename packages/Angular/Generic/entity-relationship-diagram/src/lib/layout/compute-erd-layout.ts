/**
 * Pure schema-grouped grid layout for the ERD canvas.
 *
 * Given an array of `ERDNode`s and layout options, this function returns:
 *   - laid-out nodes (x, y, width, height, visibleFields, hasMore)
 *   - edges with orthogonal 3-segment paths
 *   - schema bands (background rectangles per schema)
 *   - total canvas dimensions
 *
 * No Angular, no D3, no side effects — easily unit-tested.
 *
 * Ported from the Claude Design prototype's `layout.js`.  Semantics:
 *   - Entities grouped by schema (nulls go into a `"_"` synthetic schema).
 *   - Per-schema columns: ≤3 entities → 1 col, ≤8 → 2 cols, else 3 cols.
 *   - Band heights aligned to the tallest band for visual coherence.
 *   - Edge routing: exit source on nearer side → horizontal → enter target.
 *   - Self-reference: loop above the source card.
 */

import type { ERDNode, ERDField } from '../interfaces/erd-types';

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export interface LaidOutNode extends ERDNode {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Fields rendered on the card (subset of `fields` based on expansion + keys-only mode). */
    visibleFields: ERDField[];
    /** True when the node has more fields than `visibleFields` shows. */
    hasMore: boolean;
}

export interface LaidOutEdge {
    id: string;
    sourceId: string;
    targetId: string;
    /** Source Y coordinate (row of the source field in the card). */
    sourceY: number;
    /** Polyline points for the edge, screen coordinates. */
    points: Array<[number, number]>;
    /** True when source === target. */
    selfReference: boolean;
    /** True when the edge exits right of the source (vs. left). */
    goingRight: boolean;
    /** The source field that owns the FK. */
    sourceField: ERDField;
}

export interface LaidOutBand {
    schemaName: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ErdLayout {
    nodes: LaidOutNode[];
    edges: LaidOutEdge[];
    bands: LaidOutBand[];
    totalWidth: number;
    totalHeight: number;
}

export interface ErdLayoutOptions {
    /** Width of every node card. Default 220. */
    nodeWidth?: number;
    /** Header row height. Default 36. */
    headerHeight?: number;
    /** Per-field row height. Default 22. */
    fieldHeight?: number;
    /** Reserved footer height for the "+N more" toggle. Default 22. */
    moreToggleHeight?: number;
    /** Horizontal gap between nodes in the same schema. Default 48. */
    nodeGapX?: number;
    /** Vertical gap between nodes in the same schema column. Default 30. */
    nodeGapY?: number;
    /** Gap between schema bands. Default 80. */
    schemaGapX?: number;
    /** Inner horizontal padding inside a band. Default 28. */
    bandPadX?: number;
    /** Height reserved for the band title row. Default 56. */
    bandTitleHeight?: number;
    /** Bottom padding inside a band. Default 28. */
    bandPadBottom?: number;
    /** Outer canvas padding. Default 40. */
    canvasPad?: number;
    /** Set of node IDs currently expanded to show all fields. */
    expandedNodeIds?: ReadonlySet<string>;
    /**
     * When true, all fields are shown on each node regardless of PK/FK status —
     * "+N more" toggle is not drawn.  Default: false.
     */
    showAllFields?: boolean;
    /** Order of schemas from left to right.  Inferred from nodes if not provided. */
    schemaOrder?: ReadonlyArray<string>;
}

// ──────────────────────────────────────────────────────────────────────────
// Implementation
// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_SCHEMA = '_';

/**
 * Compute a schema-grouped grid layout for the given nodes.  Pure function.
 */
export function computeErdLayout(nodes: ERDNode[], options: ErdLayoutOptions = {}): ErdLayout {
    const nodeW = options.nodeWidth ?? 220;
    const headerH = options.headerHeight ?? 36;
    const fieldH = options.fieldHeight ?? 22;
    const moreH = options.moreToggleHeight ?? 22;
    const gapX = options.nodeGapX ?? 48;
    const gapY = options.nodeGapY ?? 30;
    const schemaGap = options.schemaGapX ?? 80;
    const bandPadX = options.bandPadX ?? 28;
    const bandTitleH = options.bandTitleHeight ?? 56;
    const bandPadBottom = options.bandPadBottom ?? 28;
    const canvasPad = options.canvasPad ?? 40;
    const expandedIds = options.expandedNodeIds ?? new Set<string>();
    const showAll = options.showAllFields ?? false;

    // 1. Group by schema.
    const bySchema = new Map<string, ERDNode[]>();
    for (const n of nodes) {
        const s = n.schemaName || DEFAULT_SCHEMA;
        const list = bySchema.get(s);
        if (list) list.push(n);
        else bySchema.set(s, [n]);
    }

    // 2. Determine schema order.
    const schemas = options.schemaOrder?.slice() ?? [...bySchema.keys()].sort();
    for (const [s] of bySchema) {
        if (!schemas.includes(s)) schemas.push(s);
    }

    // 3. Sort entities inside each schema alphabetically by name.
    for (const list of bySchema.values()) {
        list.sort((a, b) => a.name.localeCompare(b.name));
    }

    // 4. Lay out nodes within each band.
    const laidOutNodes: LaidOutNode[] = [];
    const bands: LaidOutBand[] = [];
    let curX = canvasPad;
    let maxBandH = 0;

    for (const schema of schemas) {
        const list = bySchema.get(schema) ?? [];
        if (list.length === 0) continue;

        const cols = colsFor(list.length);
        const bandW = bandPadX * 2 + cols * nodeW + (cols - 1) * gapX;

        // Column-major placement: column i gets every `cols`-th entry.
        const colLists: ERDNode[][] = Array.from({ length: cols }, () => []);
        list.forEach((ent, i) => colLists[i % cols].push(ent));

        const bandStartX = curX + bandPadX;
        const bandStartY = canvasPad + bandTitleH;

        const colHeights: number[] = [];

        colLists.forEach((col, colIdx) => {
            let y = 0;
            for (const ent of col) {
                const expanded = expandedIds.has(ent.id) || showAll;
                const { visibleFields, height } = fieldsForNode(ent, expanded, showAll, headerH, fieldH, moreH);
                laidOutNodes.push({
                    ...ent,
                    x: bandStartX + colIdx * (nodeW + gapX),
                    y: bandStartY + y,
                    width: nodeW,
                    height,
                    visibleFields,
                    hasMore: !expanded && ent.fields.length > visibleFields.length,
                });
                y += height + gapY;
            }
            colHeights.push(y - gapY);
        });

        const bandH = Math.max(...colHeights, 100) + bandTitleH + bandPadBottom;
        bands.push({ schemaName: schema, x: curX, y: canvasPad, width: bandW, height: bandH });
        maxBandH = Math.max(maxBandH, bandH);
        curX += bandW + schemaGap;
    }

    // 5. Align all band heights to the tallest.
    for (const b of bands) b.height = maxBandH;

    const totalWidth = Math.max(curX - schemaGap + canvasPad, canvasPad * 2);
    const totalHeight = canvasPad + maxBandH + canvasPad;

    // 6. Build edges from FK fields.
    const edges = buildEdges(laidOutNodes, headerH, fieldH);

    return { nodes: laidOutNodes, edges, bands, totalWidth, totalHeight };
}

/**
 * Column count for a schema band.  Targets a roughly square aspect ratio,
 * capped at 12 columns so cards remain recognizable when the user zooms
 * out to see the whole band.  A single schema with hundreds of entities
 * would otherwise produce an unreadable vertical strip.
 */
function colsFor(count: number): number {
    if (count <= 3) return 1;
    if (count <= 8) return 2;
    if (count <= 20) return 3;
    if (count <= 40) return 4;
    if (count <= 75) return 6;
    if (count <= 120) return 8;
    if (count <= 200) return 10;
    return 12;
}

/**
 * Return the fields the node will display and the resulting card height.
 *
 * When `showAll` or the node is expanded, every field is shown.  Otherwise
 * only PK + FK fields (classic schema-relationship view).
 */
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
        // Loop above the source card.
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
            id: r.id,
            sourceId: r.sourceId,
            targetId: r.targetId,
            sourceY,
            sourceField: r.sourceField,
            points,
            selfReference: true,
            goingRight: true,
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
        [sx, sourceY],
        [midX, sourceY],
        [midX, ty],
        [tx, ty],
    ];

    return {
        id: r.id,
        sourceId: r.sourceId,
        targetId: r.targetId,
        sourceY,
        sourceField: r.sourceField,
        points,
        selfReference: false,
        goingRight,
    };
}

/** Convert a polyline to an SVG path string. */
export function pointsToPath(points: ReadonlyArray<readonly [number, number]>): string {
    if (!points || points.length === 0) return '';
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) d += ` L${points[i][0]} ${points[i][1]}`;
    return d;
}

/**
 * Return the set of node IDs one hop from the given node (inclusive).
 * Used for focus and hover highlight modes.
 */
export function getNeighbors(nodes: ReadonlyArray<ERDNode>, id: string): Set<string> {
    const result = new Set<string>([id]);
    for (const n of nodes) {
        for (const f of n.fields) {
            if (!f.relatedNodeId) continue;
            if (n.id === id || f.relatedNodeId === id) {
                result.add(n.id);
                result.add(f.relatedNodeId);
            }
        }
    }
    return result;
}
