/**
 * @fileoverview Server-side SVG renderer for MemberJunction Diagrams.
 *
 * Converts a normalized `MJDiagramSpec` (`workflow`, `lifecycle`, `sequence`, or `dataflow`)
 * into a self-contained, themed SVG implementing the MJ Diagram Data Contract v1.
 *
 * @module @memberjunction/ai-diagrams
 */

import dagre from '@dagrejs/dagre';
import {
    MJ_DIAGRAM_CONTRACT_VERSION,
    type MJDiagramCard,
    type MJDiagramEdge,
    type MJDiagramNode,
    type MJDiagramSpec,
} from './spec.js';

const esc = (s: unknown): string =>
    String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/**
 * Character-class width table for accurate server-side SVG label measurement without a DOM.
 */
export function MeasureTextWidth(text: string | undefined, fontSizePx: number): number {
    if (!text) return 0;
    let units = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if ('ilj1.,:;|!\'`'.includes(ch)) units += 0.30;
        else if ('ftr()[]{}'.includes(ch)) units += 0.38;
        else if (ch === ' ') units += 0.28;
        else if ('mw@#%'.includes(ch)) units += 0.82;
        else if ('MW'.includes(ch)) units += 0.88;
        else if (ch >= 'A' && ch <= 'Z') units += 0.68;
        else units += 0.56;
    }
    return Math.ceil(units * fontSizePx);
}

const TOP = 68;
const LEFT = 24;
const LANE_PAD = 28;
const ROW_H = 70;
const GAP_Y = 22;

interface PositionedNode {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    row?: number;
    laneId: string;
}

interface Box extends PositionedNode {
    l: number;
    r: number;
    t: number;
    b: number;
}

interface PositionedLane {
    id: string;
    label: string;
    sublabel?: string;
    role?: string;
    x: number;
    y: number;
    w: number;
    h: number;
    labelW: number;
    vertical?: boolean;
}

interface RoutedEdge extends MJDiagramEdge {
    id: string;
    d: string;
    lx?: number;
    ly?: number;
    anchor?: 'start' | 'middle' | 'end';
    isMain?: boolean;
    order?: number;
}

interface LayoutOutput {
    pos: Record<string, PositionedNode>;
    lanes: PositionedLane[];
    edges: RoutedEdge[];
    width: number;
    bottom: number;
    lifelines?: Array<{ id: string; x: number; y1: number; y2: number }>;
    sequenceDots?: Array<{ x: number; y: number; role?: string }>;
}

function nodeSize(n: MJDiagramNode): { w: number; h: number } {
    const stepExtra = n.step ? 28 : 0;
    const w = Math.max(
        144,
        MeasureTextWidth(n.label, 13.5) + 38 + stepExtra,
        MeasureTextWidth(n.sublabel, 11.5) + 38
    );
    return n.kind === 'decision' ? { w: w + 36, h: 70 } : { w, h: 58 };
}

function toBox(p: PositionedNode): Box {
    return { ...p, l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2, b: p.y + p.h / 2 };
}

type Segment = [number, number, number, number];

function routeOrthogonal(
    s: Box,
    t: Box,
    opts: { sidePort: boolean; channelY: number; gapX?: number; channelOffset: number; clearanceY?: number }
): { d: string; segs: Segment[] } {
    if (t.l - s.r >= 24) {
        const mx = (opts.gapX ?? Math.round((s.r + t.l) / 2)) - (opts.sidePort ? 0 : 12 + opts.channelOffset);
        if (Math.abs(s.y - t.y) < 1) {
            return { d: `M${s.r} ${s.y}H${t.l}`, segs: [[s.r, s.y, t.l, t.y]] };
        }
        if (opts.sidePort) {
            return {
                d: `M${s.r} ${s.y}H${mx}V${t.y}H${t.l}`,
                segs: [[s.r, s.y, mx, s.y], [mx, s.y, mx, t.y], [mx, t.y, t.l, t.y]],
            };
        }
        const sy = t.y > s.y ? s.b : s.t;
        const cy = opts.channelY;
        return {
            d: `M${s.x} ${sy}V${cy}H${mx}V${t.y}H${t.l}`,
            segs: [[s.x, sy, s.x, cy], [s.x, cy, mx, cy], [mx, cy, mx, t.y], [mx, t.y, t.l, t.y]],
        };
    }
    if (s.l - t.r >= 24) {
        const y0 = (opts.clearanceY ?? Math.min(s.t, t.t)) - 16 - opts.channelOffset;
        return {
            d: `M${s.x} ${s.t}V${y0}H${t.x}V${t.t}`,
            segs: [[s.x, s.t, s.x, y0], [s.x, y0, t.x, y0], [t.x, y0, t.x, t.t]],
        };
    }
    const down = t.y > s.y;
    const sy = down ? s.b : s.t;
    const ty = down ? t.t : t.b;
    const my = Math.round((sy + ty) / 2);
    return {
        d: `M${s.x} ${sy}V${my}H${t.x}V${ty}`,
        segs: [[s.x, sy, s.x, my], [s.x, my, t.x, my], [t.x, my, t.x, ty]],
    };
}

function placeEdgeLabel(
    label: string | undefined,
    segs: Segment[],
    boxes: Box[],
    placed: Array<{ x: number; y: number; w: number; h: number }>
): { lx?: number; ly?: number; anchor?: 'start' | 'middle' | 'end' } {
    if (!label) return {};
    const w = MeasureTextWidth(label, 11.5) + 8;
    const h = 15;
    const cands = [...segs]
        .sort(
            (a, b) =>
                (a[1] === a[3] ? 0 : 1) - (b[1] === b[3] ? 0 : 1) ||
                Math.hypot(b[2] - b[0], b[3] - b[1]) - Math.hypot(a[2] - a[0], a[3] - a[1])
        )
        .map(([x1, y1, x2, y2]) =>
            y1 === y2
                ? { lx: Math.round((x1 + x2) / 2), ly: y1 - 7, anchor: 'middle' as const, bx: Math.round((x1 + x2) / 2 - w / 2), by: y1 - 18 }
                : { lx: x1 + 6, ly: Math.round((y1 + y2) / 2 + 4), anchor: 'start' as const, bx: x1 + 4, by: Math.round((y1 + y2) / 2 - 7) }
        );
    const obstacles = [...boxes.map((b) => ({ x: b.l - 4, y: b.t - 4, w: b.w + 8, h: b.h + 8 })), ...placed];
    const hit = (c: { bx: number; by: number }) =>
        obstacles.some((r) => c.bx < r.x + r.w && c.bx + w > r.x && c.by < r.y + r.h && c.by + h > r.y);
    const chosen = cands.find((c) => !hit(c)) ?? cands[0];
    if (!chosen) return {};
    placed.push({ x: chosen.bx, y: chosen.by, w, h });
    return { lx: chosen.lx, ly: chosen.ly, anchor: chosen.anchor };
}

function buildDagreRanking(spec: MJDiagramSpec, rankSep: number): dagre.graphlib.Graph {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 24, ranksep: rankSep });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of spec.nodes) {
        const s = nodeSize(n);
        g.setNode(n.id, { width: s.w, height: s.h });
    }
    for (const e of spec.edges) g.setEdge(e.from, e.to);
    dagre.layout(g);
    return g;
}

function computeExplicitColCenters(
    spec: MJDiagramSpec,
    laneLabelW: number,
    rankSep: number
): Map<number, number> | null {
    if (!spec.nodes.some((n) => typeof n.col === 'number')) return null;
    const cols = [...new Set(spec.nodes.map((n) => n.col ?? 0))].sort((a, b) => a - b);
    const colCenters = new Map<number, number>();
    let curX = LEFT + laneLabelW + 28;
    for (const c of cols) {
        const maxW = Math.max(150, ...spec.nodes.filter((n) => (n.col ?? 0) === c).map((n) => nodeSize(n).w));
        colCenters.set(c, curX + Math.round(maxW / 2));
        curX += maxW + rankSep;
    }
    return colCenters;
}

function placeHorizontalBandNodes(
    spec: MJDiagramSpec,
    g: dagre.graphlib.Graph,
    colCenters: Map<number, number> | null,
    laneLabelW: number
): { pos: Record<string, PositionedNode>; lanes: PositionedLane[]; bottom: number } {
    const minL = Math.min(...spec.nodes.map((n) => g.node(n.id).x - nodeSize(n).w / 2));
    const x0 = LEFT + laneLabelW + 28 - minL;
    const pos: Record<string, PositionedNode> = {};
    const lanes: PositionedLane[] = [];
    let y = TOP;

    for (const lane of spec.lanes) {
        const rows: Array<Array<{ x: number; w: number }>> = [];
        const members = spec.nodes
            .filter((n) => n.lane === lane.id)
            .sort((a, b) => (colCenters && typeof a.col === 'number' && typeof b.col === 'number' ? a.col - b.col : g.node(a.id).x - g.node(b.id).x));

        for (const n of members) {
            const s = nodeSize(n);
            const cx = colCenters && typeof n.col === 'number' ? colCenters.get(n.col)! : Math.round(g.node(n.id).x + x0);
            let row = rows.findIndex((r) => r.every((o) => Math.abs(o.x - cx) > (o.w + s.w) / 2 + 18));
            if (row < 0) {
                rows.push([]);
                row = rows.length - 1;
            }
            rows[row].push({ x: cx, w: s.w });
            pos[n.id] = { id: n.id, ...s, x: cx, y: 0, row, laneId: lane.id };
        }
        const rowCount = Math.max(1, rows.length);
        const h = rowCount * ROW_H + (rowCount - 1) * GAP_Y + 2 * LANE_PAD;
        for (const n of members) {
            pos[n.id].y = y + LANE_PAD + (pos[n.id].row ?? 0) * (ROW_H + GAP_Y) + ROW_H / 2;
        }
        lanes.push({ ...lane, x: LEFT, y, w: 0, h, labelW: laneLabelW });
        y += h;
    }
    return { pos, lanes, bottom: y };
}

function routeHorizontalBandEdges(
    spec: MJDiagramSpec,
    pos: Record<string, PositionedNode>,
    lanes: PositionedLane[]
): RoutedEdge[] {
    const laneById = new Map(lanes.map((l) => [l.id, l]));
    const main = spec.mainPath ?? [];
    const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
    const gapChannels = new Map<number, number>();
    const allBoxes = Object.values(pos).map(toBox);

    return spec.edges.map((e, i) => {
        const s = toBox(pos[e.from]);
        const t = toBox(pos[e.to]);
        const sLane = laneById.get(s.laneId)!;
        const outs = spec.edges.filter((o) => o.from === e.from);
        const mainIdx = main.indexOf(e.from);
        const mainFlag = (mainIdx >= 0 && main[mainIdx + 1] === e.to) || e.role === 'emphasis';
        const sidePort = mainFlag || s.laneId === t.laneId || outs.length === 1;
        const channelY = t.y > s.y ? sLane.y + sLane.h : sLane.y;

        const forwardOuts = outs.map((o) => toBox(pos[o.to]).l).filter((l) => l - s.r >= 24);
        const nextL = forwardOuts.length ? Math.min(...forwardOuts) : Infinity;
        const gapX = Number.isFinite(nextL) ? Math.round((s.r + nextL) / 2) : undefined;
        const gapBucket = gapX !== undefined ? Math.round(gapX / 24) : Math.round(s.r / 24);

        let channelOffset = 0;
        if (!sidePort || s.l - t.r >= 24) {
            const count = gapChannels.get(gapBucket) ?? 0;
            channelOffset = count * 10;
            gapChannels.set(gapBucket, count + 1);
        }

        let clearanceY: number | undefined;
        if (s.l - t.r >= 24) {
            const between = allBoxes.filter((b) => b.laneId === s.laneId && b.x >= Math.min(s.x, t.x) - 10 && b.x <= Math.max(s.x, t.x) + 10);
            clearanceY = Math.min(s.t, t.t, ...between.map((b) => b.t));
        }

        const r = routeOrthogonal(s, t, { sidePort, channelY, gapX, channelOffset, clearanceY });
        const fullLabel = e.data ? (e.label ? `${e.label} [${e.data}]` : `[${e.data}]`) : e.label;
        const lbl = placeEdgeLabel(fullLabel, r.segs, allBoxes, placedLabels);
        return { ...e, id: e.id ?? `e${i + 1}`, d: r.d, isMain: mainFlag, ...lbl };
    });
}

function layoutHorizontalBands(spec: MJDiagramSpec): LayoutOutput {
    const laneLabelW = Math.max(128, ...spec.lanes.map((l) => MeasureTextWidth(l.label.toUpperCase(), 11.5) + 34));
    const maxEdgeLabelW = Math.max(
        0,
        ...spec.edges.map((e) => {
            const txt = e.data ? (e.label ? `${e.label} [${e.data}]` : `[${e.data}]`) : e.label;
            return txt ? MeasureTextWidth(txt, 11.5) : 0;
        })
    );
    const rankSep = Math.max(96, maxEdgeLabelW + 28);
    const g = buildDagreRanking(spec, rankSep);
    const colCenters = computeExplicitColCenters(spec, laneLabelW, rankSep);
    const { pos, lanes, bottom } = placeHorizontalBandNodes(spec, g, colCenters, laneLabelW);

    const right = Math.max(...Object.values(pos).map((p) => p.x + p.w / 2)) + 36;
    for (const l of lanes) l.w = right - LEFT;
    const edges = routeHorizontalBandEdges(spec, pos, lanes);
    return { pos, lanes, edges, width: right + LEFT, bottom };
}

function layoutStageColumns(spec: MJDiagramSpec): LayoutOutput {
    const HEADER_H = 40;
    const COL_PAD_X = 28;
    const STAGE_GAP = 68;
    const pos: Record<string, PositionedNode> = {};
    const lanes: PositionedLane[] = [];
    let curX = LEFT;
    let maxRows = 1;

    const stageMeta = spec.lanes.map((stage) => {
        const members = spec.nodes.filter((n) => n.lane === stage.id);
        const maxNodeW = Math.max(148, MeasureTextWidth(stage.label.toUpperCase(), 11.5) + 40, ...members.map((n) => nodeSize(n).w));
        const colW = maxNodeW + COL_PAD_X * 2;
        maxRows = Math.max(maxRows, members.length, ...members.map((n) => (n.row ?? 0) + 1));
        return { stage, members, colW };
    });

    const bodyH = Math.max(180, maxRows * ROW_H + Math.max(0, maxRows - 1) * GAP_Y + LANE_PAD * 2);
    const totalStageH = HEADER_H + bodyH;

    for (const { stage, members, colW } of stageMeta) {
        const cx = curX + Math.round(colW / 2);
        const count = members.length;
        members.forEach((n, idx) => {
            const s = nodeSize(n);
            const span = count * ROW_H + Math.max(0, count - 1) * GAP_Y;
            const startY = TOP + HEADER_H + Math.round((bodyH - span) / 2) + ROW_H / 2;
            const cy = typeof n.row === 'number' ? TOP + HEADER_H + LANE_PAD + n.row * (ROW_H + GAP_Y) + ROW_H / 2 : startY + idx * (ROW_H + GAP_Y);
            pos[n.id] = { id: n.id, ...s, x: cx, y: cy, laneId: stage.id };
        });
        lanes.push({ ...stage, x: curX, y: TOP, w: colW, h: totalStageH, labelW: colW, vertical: true });
        curX += colW + STAGE_GAP;
    }

    const right = curX - STAGE_GAP;
    const main = spec.mainPath ?? [];
    const placedLabels: Array<{ x: number; y: number; w: number; h: number }> = [];
    const allBoxes = Object.values(pos).map(toBox);

    const edges: RoutedEdge[] = spec.edges.map((e, i) => {
        const s = toBox(pos[e.from]);
        const t = toBox(pos[e.to]);
        const mainIdx = main.indexOf(e.from);
        const mainFlag = e.role === 'emphasis' || (mainIdx >= 0 && main[mainIdx + 1] === e.to);
        const r = routeOrthogonal(s, t, { sidePort: true, channelY: TOP + totalStageH, gapX: Math.round((s.r + t.l) / 2), channelOffset: 0 });
        const fullLabel = e.data ? (e.label ? `${e.label} · ${e.data}` : e.data) : e.label;
        const lbl = placeEdgeLabel(fullLabel, r.segs, allBoxes, placedLabels);
        return { ...e, id: e.id ?? `f${i + 1}`, d: r.d, isMain: mainFlag, ...lbl };
    });

    return { pos, lanes, edges, width: right + LEFT, bottom: TOP + totalStageH };
}

function layoutSequence(spec: MJDiagramSpec): LayoutOutput {
    const hasPhases = Boolean(spec.phases && spec.phases.length > 0);
    const phaseLabelW = hasPhases ? Math.max(116, ...(spec.phases ?? []).map((p) => MeasureTextWidth(p.label.toUpperCase(), 11.5) + 28)) : 0;
    const COL_W = 210;
    const PART_H = 56;
    const MSG_START_Y = TOP + PART_H + 44;
    const MSG_STEP_Y = 52;
    const pos: Record<string, PositionedNode> = {};
    const startX = LEFT + phaseLabelW + (hasPhases ? 20 : 0);

    spec.nodes.forEach((n, idx) => {
        const s = nodeSize(n);
        pos[n.id] = { id: n.id, w: Math.max(s.w, 156), h: PART_H, x: startX + idx * COL_W + Math.round(COL_W / 2), y: TOP + PART_H / 2, laneId: n.id };
    });

    const right = startX + spec.nodes.length * COL_W;
    const lifelineBottom = MSG_START_Y + Math.max(0, spec.edges.length - 1) * MSG_STEP_Y + 36;
    const lanes: PositionedLane[] = (spec.phases ?? []).map((ph) => {
        const y1 = MSG_START_Y + ph.fromMessage * MSG_STEP_Y - 24;
        const y2 = MSG_START_Y + ph.toMessage * MSG_STEP_Y + 20;
        return { id: ph.id, label: ph.label, role: 'default', x: LEFT, y: y1, w: right - LEFT, h: Math.max(40, y2 - y1), labelW: phaseLabelW };
    });
    const lifelines = spec.nodes.map((n) => ({ id: n.id, x: pos[n.id].x, y1: TOP + PART_H, y2: lifelineBottom }));
    const sequenceDots: Array<{ x: number; y: number; role?: string }> = [];

    const edges: RoutedEdge[] = spec.edges.map((e, i) => {
        const sx = pos[e.from].x;
        const tx = pos[e.to].x;
        const y = MSG_START_Y + i * MSG_STEP_Y;
        const dir = tx >= sx ? 1 : -1;
        const x1 = sx + dir * 6;
        const x2 = tx - dir * 6;
        sequenceDots.push({ x: sx, y, role: e.role }, { x: tx, y, role: e.role });
        const stepBadge = `${i + 1}. `;
        return {
            ...e,
            id: e.id ?? `m${i + 1}`,
            d: `M${x1} ${y}H${x2}`,
            lx: Math.round((x1 + x2) / 2),
            ly: y - 8,
            anchor: 'middle',
            isMain: e.role !== 'conditional',
            order: i,
            label: e.label ? `${stepBadge}${e.label}` : `${stepBadge}${e.from} → ${e.to}`,
        };
    });

    return { pos, lanes, edges, width: right + LEFT, bottom: lifelineBottom, lifelines, sequenceDots };
}

const DIAGRAM_CSS = `
.mjd{--bg:var(--mj-bg-surface,#fff);--ink:var(--mj-text-primary,#1f2328);--muted:var(--mj-text-muted,#59636e);--line:var(--mj-border-strong,#8c959f);--grid:var(--mj-border-default,#d1d9e0);--node:var(--mj-bg-surface,#fff);--stroke:var(--mj-border-strong,#8c959f);--lane:var(--mj-bg-surface-card,#f6f8fa);--lane-alt:var(--mj-bg-surface-sunken,#eff2f5);--lane-exc:var(--mj-status-error-bg,#fff5f4);--lane-wait:var(--mj-status-warning-bg,#fffbeb);--accent:var(--mj-brand-primary,#0969da);--accent-tint:color-mix(in srgb,var(--accent) 12%,var(--bg));--success:var(--mj-status-success,#1a7f37);--success-tint:var(--mj-status-success-bg,#dafbe1);--warn:var(--mj-status-warning,#9a6700);--warn-tint:var(--mj-status-warning-bg,#fff8c5);--error:var(--mj-status-error,#cf222e);--error-tint:var(--mj-status-error-bg,#ffebe9);font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.mjd .bg{fill:var(--bg)}
.mjd .title{fill:var(--ink);font-size:18px;font-weight:650}
.mjd .subtitle{fill:var(--muted);font-size:13px}
.mjd .lane rect{fill:var(--lane);stroke:var(--grid)}
.mjd .lane.alt rect{fill:var(--lane-alt)}
.mjd .lane[data-lane-role=exceptions] rect,.mjd .lane[data-lane-role=terminal] rect{fill:var(--lane-exc)}
.mjd .lane[data-lane-role=waiting] rect{fill:var(--lane-wait)}
.mjd .lane line{stroke:var(--grid)}
.mjd .lane text{fill:var(--muted);font-size:11.5px;font-weight:650;letter-spacing:.05em;text-transform:uppercase}
.mjd .lifeline{stroke:var(--grid);stroke-width:1.5;stroke-dasharray:5 5}
.mjd .seq-dot{fill:var(--accent);stroke:var(--bg);stroke-width:1.5}
.mjd .node rect,.mjd .node polygon{fill:var(--node);stroke:var(--stroke);stroke-width:1.25}
.mjd .node[data-main-path] rect,.mjd .node[data-main-path] polygon{fill:var(--accent-tint);stroke:var(--accent);stroke-width:2}
.mjd .node[data-node-kind=success] rect{fill:var(--success-tint);stroke:var(--success);stroke-width:1.75}
.mjd .node[data-node-kind=waiting] rect{fill:var(--warn-tint);stroke:var(--warn);stroke-width:1.75}
.mjd .node[data-node-kind=error] rect{fill:var(--error-tint);stroke:var(--error);stroke-width:1.75}
.mjd .node rect.step-pill,.mjd .node[data-main-path] rect.step-pill,.mjd .node[data-node-kind] rect.step-pill{fill:var(--accent);stroke:none}
.mjd .node .step-txt{fill:var(--bg);font-size:10px;font-weight:700}
.mjd .node .lbl{fill:var(--ink);font-size:13.5px;font-weight:600}
.mjd .node .sub{fill:var(--muted);font-size:11.5px}
.mjd .edge path{fill:none;stroke:var(--line);stroke-width:1.5}
.mjd .edge[data-edge-role=error] path{stroke:var(--error);stroke-dasharray:5 4}
.mjd .edge[data-edge-role=return] path,.mjd .edge[data-edge-role=conditional] path{stroke:var(--line);stroke-dasharray:5 4}
.mjd .edge[data-main-path] path{stroke:var(--accent);stroke-width:2.5}
.mjd .edge[data-edge-role=return][data-main-path] path{stroke:var(--line);stroke-width:1.75;stroke-dasharray:5 4}
.mjd .edge text{fill:var(--muted);font-size:11.5px;paint-order:stroke;stroke:var(--bg);stroke-width:4px;stroke-linejoin:round}
.mjd .mk-line{fill:var(--line)} .mjd .mk-accent{fill:var(--accent)} .mjd .mk-error{fill:var(--error)}
.mjd .card rect{fill:var(--node);stroke:var(--grid)}
.mjd .card .bar{fill:var(--accent);stroke:none}
.mjd .card[data-card-tone=success] .bar{fill:var(--success)}
.mjd .card[data-card-tone=warning] .bar{fill:var(--warn)}
.mjd .card[data-card-tone=error] .bar{fill:var(--error)}
.mjd .card .ct{fill:var(--ink);font-size:13px;font-weight:600}
.mjd .card .cb{fill:var(--muted);font-size:12px}
.mjd .legend text{fill:var(--muted);font-size:11.5px}
`;

function wrapText(text: string, maxChars: number): string[] {
    if (!text) return [];
    const lines: string[] = [];
    let cur = '';
    for (const w of text.split(/\s+/)) {
        if ((cur + ' ' + w).trim().length > maxChars && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = (cur + ' ' + w).trim();
        }
    }
    if (cur) lines.push(cur);
    return lines;
}

function renderLanesSvg(lanes: PositionedLane[], isSequence: boolean): string[] {
    return lanes.map((l, i) => {
        const roleAttr = l.role && l.role !== 'default' ? ` data-lane-role="${esc(l.role)}"` : '';
        if (l.vertical) {
            return (
                `<g class="lane${i % 2 ? ' alt' : ''}" data-lane-id="${esc(l.id)}"${roleAttr}>` +
                `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="8"/>` +
                `<line x1="${l.x}" y1="${l.y + 38}" x2="${l.x + l.w}" y2="${l.y + 38}"/>` +
                `<text x="${l.x + Math.round(l.w / 2)}" y="${l.y + 24}" text-anchor="middle">${esc(l.label)}</text>` +
                `</g>`
            );
        }
        return (
            `<g class="lane${i % 2 ? ' alt' : ''}" data-lane-id="${esc(l.id)}"${roleAttr}>` +
            `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="${isSequence ? 6 : 0}"/>` +
            `<text x="${l.x + 14}" y="${l.y + Math.round(l.h / 2) + 4}">${esc(l.label)}</text>` +
            `<line x1="${l.x + l.labelW}" y1="${l.y}" x2="${l.x + l.labelW}" y2="${l.y + l.h}"/>` +
            `</g>`
        );
    });
}

function renderEdgesSvg(edges: RoutedEdge[], prefix: string): string[] {
    return edges.map((e) => {
        const role = e.role ?? 'default';
        const isMain = Boolean(e.isMain);
        const mk = role === 'error' ? 'error' : isMain && role !== 'return' ? 'accent' : 'line';
        const labelMarkup = e.label && e.lx !== undefined && e.ly !== undefined ? `<text x="${e.lx}" y="${e.ly}" text-anchor="${e.anchor ?? 'middle'}">${esc(e.label)}</text>` : '';
        const orderAttr = e.order !== undefined ? ` data-edge-order="${e.order}"` : '';
        return (
            `<g class="edge" data-edge-id="${esc(e.id)}" data-edge-from="${esc(e.from)}" data-edge-to="${esc(e.to)}" data-edge-role="${esc(role)}"${isMain ? ' data-main-path="true"' : ''}${orderAttr}>` +
            `<path d="${e.d}" marker-end="url(#${esc(prefix)}-mk-${mk})"/>${labelMarkup}</g>`
        );
    });
}

function renderNodesSvg(
    spec: MJDiagramSpec,
    pos: Record<string, PositionedNode>,
    mainSet: Set<string>,
    laneLabels: Record<string, string>
): string[] {
    return spec.nodes.map((n) => {
        const p = toBox(pos[n.id]);
        const kind = n.kind ?? 'task';
        const shape =
            kind === 'decision'
                ? `<polygon points="${p.l},${p.y} ${p.l + 18},${p.t} ${p.r - 18},${p.t} ${p.r},${p.y} ${p.r - 18},${p.b} ${p.l + 18},${p.b}"/>`
                : `<rect x="${p.l}" y="${p.t}" width="${p.w}" height="${p.h}" rx="${kind === 'start' || kind === 'end' ? Math.round(p.h / 2) : 8}"/>`;
        const stepMarkup = n.step
            ? `<rect class="step-pill" x="${p.l + 8}" y="${p.t + 8}" width="22" height="16" rx="8"/><text class="step-txt" x="${p.l + 19}" y="${p.t + 19.5}" text-anchor="middle">${esc(n.step)}</text>`
            : '';
        const textMarkup = n.sublabel
            ? `<text class="lbl" x="${p.x}" y="${p.y - 3}" text-anchor="middle">${esc(n.label)}</text><text class="sub" x="${p.x}" y="${p.y + 14}" text-anchor="middle">${esc(n.sublabel)}</text>`
            : `<text class="lbl" x="${p.x}" y="${p.y + 5}" text-anchor="middle">${esc(n.label)}</text>`;
        const laneId = n.lane ?? spec.lanes[0]?.id ?? '';
        const laneReadable = laneLabels[laneId] ?? laneId;
        const aria = `${n.label}, ${kind}${laneReadable ? `, ${laneReadable}` : ''}`;
        const descMarkup = n.detail ? `<desc>${esc(n.detail)}</desc>` : n.sublabel ? `<desc>${esc(n.sublabel)}</desc>` : '';
        return (
            `<g class="node" data-node-id="${esc(n.id)}" data-node-kind="${esc(kind)}" data-lane="${esc(laneId)}" data-label="${esc(n.label)}"${mainSet.has(n.id) ? ' data-main-path="true"' : ''} tabindex="0" role="button" aria-label="${esc(aria)}">` +
            `${descMarkup}${shape}${stepMarkup}${textMarkup}</g>`
        );
    });
}

function renderSummaryCardsSvg(cards: MJDiagramCard[], y: number): { markup: string[]; nextY: number } {
    if (cards.length === 0) return { markup: [], nextY: y };
    const cw = 310;
    const ch = 74;
    const markup = cards.map((c, i) => {
        const x = LEFT + i * (cw + 16);
        const bodyLines = wrapText(c.body ?? '', 46)
            .slice(0, 2)
            .map((ln, j) => `<text class="cb" x="${x + 18}" y="${y + 44 + j * 16}">${esc(ln)}</text>`)
            .join('');
        const toneAttr = c.tone ? ` data-card-tone="${esc(c.tone)}"` : '';
        return (
            `<g class="card" data-card-id="${esc(c.id)}" data-card-nodes="${esc((c.nodes ?? []).join(' '))}"${toneAttr} tabindex="0" role="button" aria-label="${esc(c.title)}">` +
            `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="8"/>` +
            `<rect class="bar" x="${x}" y="${y}" width="4" height="${ch}" rx="2"/>` +
            `<text class="ct" x="${x + 18}" y="${y + 24}">${esc(c.title)}</text>${bodyLines}</g>`
        );
    });
    return { markup, nextY: y + ch };
}

function renderLegendSvg(kind: MJDiagramSpec['kind'], y: number): string {
    if (kind === 'sequence') {
        return (
            `<g class="legend" transform="translate(${LEFT} ${y})">` +
            `<path d="M0 0H28" stroke="var(--accent)" stroke-width="2.5"/><text x="36" y="4">request / action</text>` +
            `<path d="M150 0H178" stroke="var(--line)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="186" y="4">reply / conditional</text>` +
            `</g>`
        );
    }
    return (
        `<g class="legend" transform="translate(${LEFT} ${y})">` +
        `<path d="M0 0H28" stroke="var(--accent)" stroke-width="2.5"/><text x="36" y="4">main path</text>` +
        `<path d="M120 0H148" stroke="var(--line)" stroke-width="1.5"/><text x="156" y="4">step or branch</text>` +
        `<path d="M270 0H298" stroke="var(--error)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="306" y="4">exception</text>` +
        `</g>`
    );
}

/**
 * Renders a normalized `MJDiagramSpec` into an SVG string adhering to the MJ Diagram Data Contract v1.
 */
export function RenderDiagramSvg(spec: MJDiagramSpec, prefix = 'mjd'): string {
    const layout =
        spec.kind === 'sequence'
            ? layoutSequence(spec)
            : spec.kind === 'dataflow'
              ? layoutStageColumns(spec)
              : layoutHorizontalBands(spec);

    const mainSet = new Set(spec.mainPath ?? (spec.kind === 'sequence' ? spec.nodes.map((n) => n.id) : []));
    const laneLabels = Object.fromEntries(spec.lanes.map((l) => [l.id, l.label]));
    const out: string[] = [
        ...renderLanesSvg(layout.lanes, spec.kind === 'sequence'),
        ...(layout.lifelines ?? []).map((ll) => `<line class="lifeline" x1="${ll.x}" y1="${ll.y1}" x2="${ll.x}" y2="${ll.y2}"/>`),
        ...renderEdgesSvg(layout.edges, prefix),
        ...(layout.sequenceDots ?? []).map((d) => `<circle class="seq-dot" cx="${d.x}" cy="${d.y}" r="4"/>`),
        ...renderNodesSvg(spec, layout.pos, mainSet, laneLabels),
    ];

    const cards = spec.cards ?? [];
    const { markup: cardMarkup, nextY } = renderSummaryCardsSvg(cards, layout.bottom + 28);
    out.push(...cardMarkup);
    const legendY = nextY + 30;
    out.push(renderLegendSvg(spec.kind, legendY));

    const W = Math.max(layout.width, LEFT * 2 + cards.length * 326);
    const H = legendY + 24;
    const mk = (name: string) =>
        `<marker id="${esc(prefix)}-mk-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path class="mk-${name}" d="M0 0L10 5L0 10z"/></marker>`;

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" class="mjd" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-mj-diagram="${MJ_DIAGRAM_CONTRACT_VERSION}" data-mj-kind="${esc(spec.kind)}" role="group" aria-label="${esc(spec.title)}">\n` +
        `<style>${DIAGRAM_CSS}</style><defs>${mk('line')}${mk('accent')}${mk('error')}</defs>\n` +
        `<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>\n` +
        `<text class="title" x="${LEFT}" y="38">${esc(spec.title)}</text>\n` +
        (spec.subtitle ? `<text class="subtitle" x="${LEFT}" y="58">${esc(spec.subtitle)}</text>\n` : '') +
        `${out.join('\n')}\n` +
        `</svg>`
    );
}
