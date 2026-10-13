import { CancellableGanttEventArgs } from './gantt-zoom';

export const GANTT_DEFAULT_GRID_WIDTH = 340;
export const GANTT_MIN_GRID_WIDTH = 160;
export const GANTT_MAX_GRID_WIDTH = 720;

/** Fired before the user starts dragging the grid/timeline splitter. */
export class BeforeGridResizeEventArgs extends CancellableGanttEventArgs {
    constructor(public readonly CurrentWidth: number) {
        super();
    }
}

/** Fired after the grid/timeline splitter is released. */
export class AfterGridResizeEventArgs {
    constructor(
        public readonly Width: number,
        public readonly PreviousWidth: number,
    ) {}
}

/** Fired before the user starts dragging a grid column border. */
export class BeforeColumnResizeEventArgs extends CancellableGanttEventArgs {
    constructor(
        public readonly ColumnName: string,
        public readonly CurrentWidth: number,
    ) {
        super();
    }
}

/** Fired after a grid column is resized. */
export class AfterColumnResizeEventArgs {
    constructor(
        public readonly ColumnName: string,
        public readonly Width: number,
        public readonly ColumnWidths: Record<string, number>,
    ) {}
}

export function ClampGanttGridWidth(width: number): number {
    if (!Number.isFinite(width)) {
        return GANTT_DEFAULT_GRID_WIDTH;
    }
    return Math.min(GANTT_MAX_GRID_WIDTH, Math.max(GANTT_MIN_GRID_WIDTH, Math.round(width)));
}

export function SanitizeColumnWidths(raw: Record<string, number> | null | undefined): Record<string, number> {
    const out: Record<string, number> = {};
    if (!raw) {
        return out;
    }
    for (const [name, width] of Object.entries(raw)) {
        if (!name || !Number.isFinite(width) || width < 40) {
            continue;
        }
        out[name] = Math.round(width);
    }
    return out;
}
