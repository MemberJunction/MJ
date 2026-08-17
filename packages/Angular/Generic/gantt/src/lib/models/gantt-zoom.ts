import type { ZoomLevel } from 'dhtmlx-gantt';

/**
 * Discrete DHTMLX zoom levels, most-zoomed-in first.
 * `gantt.ext.zoom.zoomIn()` decreases the index; `zoomOut()` increases it.
 */
export const GANTT_ZOOM_LEVEL_NAMES = ['hour', 'day', 'week', 'month', 'quarter', 'year'] as const;

export type GanttZoomLevelName = (typeof GANTT_ZOOM_LEVEL_NAMES)[number];

/** Approximate "percent" for each named level. Week is 100. */
export const GANTT_ZOOM_PERCENT: Record<GanttZoomLevelName, number> = {
    hour: 150,
    day: 125,
    week: 100,
    month: 75,
    quarter: 50,
    year: 33,
};

export function IsGanttZoomLevelName(value: string): value is GanttZoomLevelName {
    return (GANTT_ZOOM_LEVEL_NAMES as readonly string[]).includes(value);
}

export function GanttZoomPercent(level: GanttZoomLevelName): number {
    return GANTT_ZOOM_PERCENT[level];
}

/** Nearest named level for a persisted or caller-supplied percent. */
export function GanttZoomLevelFromPercent(percent: number): GanttZoomLevelName {
    let best: GanttZoomLevelName = 'week';
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const name of GANTT_ZOOM_LEVEL_NAMES) {
        const delta = Math.abs(GANTT_ZOOM_PERCENT[name] - percent);
        if (delta < bestDelta) {
            best = name;
            bestDelta = delta;
        }
    }
    return best;
}

export function NextZoomInLevel(level: GanttZoomLevelName): GanttZoomLevelName | null {
    const index = GANTT_ZOOM_LEVEL_NAMES.indexOf(level);
    return index > 0 ? GANTT_ZOOM_LEVEL_NAMES[index - 1] : null;
}

export function NextZoomOutLevel(level: GanttZoomLevelName): GanttZoomLevelName | null {
    const index = GANTT_ZOOM_LEVEL_NAMES.indexOf(level);
    return index >= 0 && index < GANTT_ZOOM_LEVEL_NAMES.length - 1
        ? GANTT_ZOOM_LEVEL_NAMES[index + 1]
        : null;
}

/**
 * Base class for cancelable Gantt events. Listeners flip `Cancel = true`
 * to halt the default behavior; the matching `After*` event will NOT fire.
 */
export class CancellableGanttEventArgs {
    public Cancel = false;
    public CancelReason?: string;
}

/** Fired before the timeline zoom level changes. Set `Cancel = true` to keep the current level. */
export class BeforeZoomChangeEventArgs extends CancellableGanttEventArgs {
    constructor(
        public readonly FromLevel: GanttZoomLevelName,
        public readonly ToLevel: GanttZoomLevelName,
        public readonly FromPercent: number,
        public readonly ToPercent: number,
    ) {
        super();
    }
}

/** Fired after a zoom change that was not canceled. */
export class AfterZoomChangeEventArgs {
    constructor(
        public readonly Level: GanttZoomLevelName,
        public readonly Percent: number,
        public readonly PreviousLevel: GanttZoomLevelName,
    ) {}
}

export function BuildDefaultGanttZoomLevels(): ZoomLevel[] {
    return [
        {
            name: 'hour',
            scale_height: 50,
            min_column_width: 30,
            scales: [
                { unit: 'day', step: 1, format: '%d %M' },
                { unit: 'hour', step: 1, format: '%H:%i' },
            ],
        },
        {
            name: 'day',
            scale_height: 50,
            min_column_width: 70,
            scales: [
                { unit: 'month', step: 1, format: '%M %Y' },
                { unit: 'day', step: 1, format: '%d' },
            ],
        },
        {
            name: 'week',
            scale_height: 50,
            min_column_width: 50,
            scales: [
                { unit: 'month', step: 1, format: '%M %Y' },
                { unit: 'week', step: 1, format: 'Week #%W' },
            ],
        },
        {
            name: 'month',
            scale_height: 50,
            min_column_width: 90,
            scales: [
                { unit: 'year', step: 1, format: '%Y' },
                { unit: 'month', step: 1, format: '%M' },
            ],
        },
        {
            name: 'quarter',
            scale_height: 50,
            min_column_width: 80,
            scales: [
                { unit: 'year', step: 1, format: '%Y' },
                { unit: 'quarter', step: 1, format: 'Q%q' },
            ],
        },
        {
            name: 'year',
            scale_height: 50,
            min_column_width: 50,
            scales: [{ unit: 'year', step: 1, format: '%Y' }],
        },
    ];
}
