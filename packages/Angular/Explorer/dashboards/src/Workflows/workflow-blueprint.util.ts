/**
 * @fileoverview Pure visual & telemetry helpers for the Workflows catalog and Runs surfaces:
 * - Miniature SVG topology generator for Blueprint Gallery cards
 * - 10-run health spark-barcode & p50 duration aggregator
 * - Synchronized Execution Waterfall / Gantt bar layout
 *
 * Kept pure (no Angular DI / DOM) for fast unit testing.
 *
 * @module @memberjunction/ng-dashboards
 */
import type { MJTaskEntity } from '@memberjunction/core-entities';

export interface BlueprintStepInput {
    ID: string;
    StepType: string;
    LoopType?: string | null;
}

export interface BlueprintPathInput {
    OriginStepID: string;
    DestinationStepID: string;
}

export interface BlueprintSvgNode {
    ID: string;
    X: number;
    Y: number;
    Width: number;
    Height: number;
    Kind: 'action' | 'prompt' | 'agent' | 'human' | 'loop' | 'other';
    IsLoop: boolean;
}

export interface BlueprintSvgEdge {
    ID: string;
    PathD: string;
}

export interface BlueprintSvgLayout {
    ViewBox: string;
    Steps: BlueprintSvgNode[];
    Paths: BlueprintSvgEdge[];
}

export interface RunSparkBar {
    ID: string;
    Status: MJTaskEntity['Status'];
    HeightPct: number;
    Tooltip: string;
}

export interface WorkflowHealthSummary {
    RecentBars: RunSparkBar[];
    HealthPercent: number | null;
    P50Duration: string;
    LastRunStatus: MJTaskEntity['Status'] | null;
    LastRunAt: Date | null;
}

export interface WaterfallStepInput {
    ID: string;
    Name: string;
    Status: string;
    StepType: string | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
}

export interface WaterfallStepBar {
    ID: string;
    Name: string;
    StepType: string;
    Status: string;
    LeftPct: number;
    WidthPct: number;
    DurationLabel: string;
}

/**
 * Generates a compact SVG topology preview (220×72) for a workflow Blueprint Card
 * using topological column placement so loops, branches, and Person gates are legible at a glance.
 */
export function BuildBlueprintSvgLayout(
    steps: readonly BlueprintStepInput[],
    paths: readonly BlueprintPathInput[],
): BlueprintSvgLayout {
    const viewW = 220;
    const viewH = 72;
    if (steps.length === 0) {
        return { ViewBox: `0 0 ${viewW} ${viewH}`, Steps: [], Paths: [] };
    }

    const cappedSteps = steps.slice(0, 12);
    const idSet = new Set(cappedSteps.map((s) => s.ID.toLowerCase()));
    const outgoing = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const s of cappedSteps) {
        const key = s.ID.toLowerCase();
        outgoing.set(key, []);
        inDegree.set(key, 0);
    }
    for (const p of paths) {
        const from = p.OriginStepID.toLowerCase();
        const to = p.DestinationStepID.toLowerCase();
        if (!idSet.has(from) || !idSet.has(to) || from === to) continue;
        outgoing.get(from)!.push(to);
        inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }

    // BFS column assignment
    const colOf = new Map<string, number>();
    const queue: string[] = [];
    for (const s of cappedSteps) {
        const key = s.ID.toLowerCase();
        if ((inDegree.get(key) ?? 0) === 0) {
            colOf.set(key, 0);
            queue.push(key);
        }
    }
    if (queue.length === 0) {
        const firstKey = cappedSteps[0].ID.toLowerCase();
        colOf.set(firstKey, 0);
        queue.push(firstKey);
    }

    let head = 0;
    while (head < queue.length) {
        const curr = queue[head++];
        const currCol = colOf.get(curr) ?? 0;
        for (const next of outgoing.get(curr) ?? []) {
            const candidate = Math.min(5, currCol + 1);
            if (!colOf.has(next)) {
                colOf.set(next, candidate);
                queue.push(next);
            }
        }
    }
    for (const s of cappedSteps) {
        const key = s.ID.toLowerCase();
        if (!colOf.has(key)) colOf.set(key, 0);
    }

    // Group by column
    const cols = new Map<number, BlueprintStepInput[]>();
    for (const s of cappedSteps) {
        const c = colOf.get(s.ID.toLowerCase()) ?? 0;
        const list = cols.get(c) ?? [];
        list.push(s);
        cols.set(c, list);
    }

    const sortedCols = [...cols.keys()].sort((a, b) => a - b);
    const colCount = Math.max(1, sortedCols.length);
    const nodeW = Math.min(28, Math.max(16, Math.floor((viewW - 24) / (colCount * 1.5))));
    const nodeH = 14;
    const xStep = colCount === 1 ? 0 : (viewW - 28 - nodeW) / (colCount - 1);

    const nodes: BlueprintSvgNode[] = [];
    const nodeByKey = new Map<string, BlueprintSvgNode>();

    sortedCols.forEach((colIdx, ci) => {
        const group = cols.get(colIdx) ?? [];
        const x = colCount === 1 ? (viewW - nodeW) / 2 : 14 + ci * xStep;
        const rowSpan = viewH - 16;
        const rowStep = group.length === 1 ? 0 : rowSpan / group.length;
        group.forEach((step, ri) => {
            const y = group.length === 1
                ? (viewH - nodeH) / 2
                : 8 + ri * rowStep + (rowStep - nodeH) / 2;
            const kind = classifyBlueprintStepKind(step);
            const node: BlueprintSvgNode = {
                ID: step.ID,
                X: Math.round(x),
                Y: Math.round(Math.max(6, Math.min(viewH - nodeH - 6, y))),
                Width: nodeW,
                Height: nodeH,
                Kind: kind,
                IsLoop: kind === 'loop',
            };
            nodes.push(node);
            nodeByKey.set(step.ID.toLowerCase(), node);
        });
    });

    const edges: BlueprintSvgEdge[] = [];
    for (const p of paths) {
        const src = nodeByKey.get(p.OriginStepID.toLowerCase());
        const tgt = nodeByKey.get(p.DestinationStepID.toLowerCase());
        if (!src || !tgt) continue;
        const x1 = src.X + src.Width;
        const y1 = src.Y + src.Height / 2;
        const x2 = tgt.X;
        const y2 = tgt.Y + tgt.Height / 2;
        const dx = Math.max(10, Math.abs(x2 - x1) * 0.45);
        edges.push({
            ID: `${src.ID}->${tgt.ID}`,
            PathD: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        });
    }

    return { ViewBox: `0 0 ${viewW} ${viewH}`, Steps: nodes, Paths: edges };
}

function classifyBlueprintStepKind(step: BlueprintStepInput): BlueprintSvgNode['Kind'] {
    if (step.StepType === 'ForEach' || step.StepType === 'While' || step.LoopType) return 'loop';
    if (step.StepType === 'Human') return 'human';
    if (step.StepType === 'Action') return 'action';
    if (step.StepType === 'Prompt') return 'prompt';
    if (step.StepType === 'Sub-Agent') return 'agent';
    return 'other';
}

/**
 * Aggregates recent runs into a 10-run health spark-barcode, success percentage, and p50 duration.
 */
export function BuildRunSparkBars(
    runs: ReadonlyArray<{
        ID: string;
        Status: MJTaskEntity['Status'];
        StartedAt: Date | null;
        CompletedAt: Date | null;
    }>,
): WorkflowHealthSummary {
    if (runs.length === 0) {
        return {
            RecentBars: [],
            HealthPercent: null,
            P50Duration: '—',
            LastRunStatus: null,
            LastRunAt: null,
        };
    }

    const recent = runs.slice(0, 10);
    const durationsMs: number[] = [];
    for (const r of recent) {
        if (r.StartedAt && r.CompletedAt) {
            const ms = Math.max(0, new Date(r.CompletedAt).getTime() - new Date(r.StartedAt).getTime());
            durationsMs.push(ms);
        }
    }
    const maxDur = Math.max(1000, ...durationsMs);

    // Render oldest → newest left-to-right so rightmost bar is the latest run
    const ordered = [...recent].reverse();
    const bars: RunSparkBar[] = ordered.map((r) => {
        const ms = r.StartedAt && r.CompletedAt
            ? Math.max(0, new Date(r.CompletedAt).getTime() - new Date(r.StartedAt).getTime())
            : maxDur * 0.45;
        const heightPct = Math.max(24, Math.min(100, Math.round((ms / maxDur) * 100)));
        return {
            ID: r.ID,
            Status: r.Status,
            HeightPct: heightPct,
            Tooltip: `${r.Status} · ${FormatShortDuration(ms)}`,
        };
    });

    const settled = recent.filter((r) => r.Status === 'Complete' || r.Status === 'Failed' || r.Status === 'Cancelled');
    const completeCount = settled.filter((r) => r.Status === 'Complete').length;
    const healthPercent = settled.length > 0 ? Math.round((completeCount / settled.length) * 100) : null;

    let p50 = '—';
    if (durationsMs.length > 0) {
        const sorted = [...durationsMs].sort((a, b) => a - b);
        const mid = sorted[Math.floor(sorted.length / 2)];
        p50 = FormatShortDuration(mid);
    }

    const latest = recent[0];
    return {
        RecentBars: bars,
        HealthPercent: healthPercent,
        P50Duration: p50,
        LastRunStatus: latest.Status,
        LastRunAt: latest.CompletedAt ?? latest.StartedAt,
    };
}

/**
 * Computes normalized horizontal bars (0–100%) for the Synchronized Execution Waterfall / Gantt drawer.
 */
export function BuildWaterfallBars(steps: readonly WaterfallStepInput[]): WaterfallStepBar[] {
    if (steps.length === 0) return [];
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = 0;
    const now = Date.now();

    for (const s of steps) {
        const start = s.StartedAt ? new Date(s.StartedAt).getTime() : null;
        const end = s.CompletedAt
            ? new Date(s.CompletedAt).getTime()
            : (s.Status === 'In Progress' && start != null ? now : start);
        if (start != null && Number.isFinite(start)) minStart = Math.min(minStart, start);
        if (end != null && Number.isFinite(end)) maxEnd = Math.max(maxEnd, end);
    }

    const span = Number.isFinite(minStart) && maxEnd > minStart ? maxEnd - minStart : 1000;

    return steps.map((s) => {
        const start = s.StartedAt ? new Date(s.StartedAt).getTime() : null;
        const end = s.CompletedAt
            ? new Date(s.CompletedAt).getTime()
            : (s.Status === 'In Progress' && start != null ? now : start);
        if (start == null || !Number.isFinite(minStart)) {
            return {
                ID: s.ID,
                Name: s.Name,
                StepType: s.StepType || 'Step',
                Status: s.Status,
                LeftPct: 0,
                WidthPct: 0,
                DurationLabel: '—',
            };
        }
        const durMs = Math.max(0, (end ?? start) - start);
        const leftPct = Math.max(0, Math.min(96, ((start - minStart) / span) * 100));
        const widthPct = Math.max(3, Math.min(100 - leftPct, (durMs / span) * 100));
        return {
            ID: s.ID,
            Name: s.Name,
            StepType: s.StepType || 'Step',
            Status: s.Status,
            LeftPct: Math.round(leftPct * 10) / 10,
            WidthPct: Math.round(widthPct * 10) / 10,
            DurationLabel: FormatShortDuration(durMs),
        };
    });
}

export function FormatShortDuration(ms: number): string {
    if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
