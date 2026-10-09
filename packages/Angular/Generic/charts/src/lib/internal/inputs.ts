import { ChartIssueLog } from './issue-log';

/**
 * Clamp a numeric input into [min, max]. Out-of-range or non-finite values are
 * a caller bug: logged once per input name, then clamped so the chart still renders.
 * NaN and -Infinity go to `min`; +Infinity goes to `max` when that is finite (an
 * "infinitely large" FillOpacity is opaque, not transparent), else to `min`.
 */
export function ClampInput(name: string, value: number, min: number, max: number, log: ChartIssueLog, context: string): number {
    if (!Number.isFinite(value)) {
        const fallback = value === Infinity && Number.isFinite(max) ? max : min;
        log.Once(`clamp:${name}`, `${context}: ${name} must be a finite number; using ${fallback}.`);
        return fallback;
    }
    if (value < min || value > max) {
        const clamped = Math.min(max, Math.max(min, value));
        log.Once(`clamp:${name}`, `${context}: ${name}=${value} is outside [${min}, ${max}]; clamped to ${clamped}.`);
        return clamped;
    }
    return value;
}

/** Smallest chart height that still fits axes and a legend; smaller `Height` inputs are clamped up. */
export const MinChartHeight = 120;
/** Height used when the consumer does not set `Height`. */
export const DefaultChartHeight = 300;
/** Bounds for `AspectRatio` (width ÷ height): beyond them a chart is a sliver or a wall. */
export const MinAspectRatio = 0.25;
export const MaxAspectRatio = 8;

/**
 * The `Height` input shared by every chart: `'fill'` passes through, a number is clamped to
 * MinChartHeight (and logged), and an unset binding (null/undefined) is the default, silently.
 */
export function ResolveHeightInput(value: number | 'fill' | null | undefined, log: ChartIssueLog, context: string): number | 'fill' {
    if (value === 'fill') {
        return 'fill';
    }
    return value == null ? DefaultChartHeight : ClampInput('Height', value, MinChartHeight, Infinity, log, context);
}

/**
 * The `AspectRatio` input shared by every chart. An unset binding (null/undefined) is "off", silently.
 * A non-number, NaN, infinite or non-positive value cannot size anything, so it is logged once and treated
 * as unset (the chart falls back to `Height`); a finite value outside [MinAspectRatio, MaxAspectRatio] is clamped and logged.
 */
export function ResolveAspectRatioInput(value: number | null | undefined, log: ChartIssueLog, context: string): number | null {
    if (value == null) {
        return null;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        log.Once('aspect-ratio', `${context}: AspectRatio must be a positive finite number (width ÷ height, e.g. [AspectRatio]="16 / 9" and not a string attribute); ignoring ${String(value)}.`);
        return null;
    }
    return ClampInput('AspectRatio', value, MinAspectRatio, MaxAspectRatio, log, context);
}
