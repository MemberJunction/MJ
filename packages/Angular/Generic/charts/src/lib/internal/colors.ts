/** Spec §4 rule 1: a caller color must be exactly `var(--token-name)`. */
const TokenColorPattern = /^var\(--[A-Za-z0-9-]+\)$/;

/** Number of categorical tokens `--mj-viz-1 … --mj-viz-10`. */
export const VizPaletteSize = 10;

/** The default fill for series/slice `index` — keyed to the input index so colors are stable. */
export function DefaultVizColor(index: number): string {
    return `var(--mj-viz-${(index % VizPaletteSize) + 1})`;
}

export interface ResolvedColor {
    Fill: string;
    /** The caller's value when it was rejected, so the caller of this function can log it. */
    Rejected: string | null;
}

/**
 * Pure: decides the fill for one series/slice. Logging a rejection is the component's job.
 * The parameter is typed `string`, but the value can come from untyped JSON, so a non-string
 * (e.g. a number) is rejected like any other bad color rather than crashing on `.trim()`.
 */
export function ResolveColor(color: string | null | undefined, index: number): ResolvedColor {
    // null is reachable from JSON / untyped data; it means "no color", exactly like undefined.
    if (color === undefined || color === null) {
        return { Fill: DefaultVizColor(index), Rejected: null };
    }
    if (typeof color === 'string' && TokenColorPattern.test(color.trim())) {
        return { Fill: color.trim(), Rejected: null };
    }
    return { Fill: DefaultVizColor(index), Rejected: String(color) };
}
