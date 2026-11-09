import { ResolveColor } from './colors';
import { ChartIssueLog } from './issue-log';

/** The log/context prefix every chart uses, e.g. `bar chart "Score bands"`. */
export function ChartContext(kind: string, ariaLabel: string): string {
    return `${kind} chart "${ariaLabel || 'Chart'}"`;
}

/**
 * Resolves each series/slice to a fill token and logs a rejected caller color once per
 * (index, value). `nameOf` is a callback so callers need not materialise a name array.
 */
export function ResolveFills(
    items: ReadonlyArray<{ Color?: string }>,
    nameOf: (index: number) => string,
    kind: 'series' | 'slice',
    log: ChartIssueLog,
    context: string,
): string[] {
    return items.map((item, i) => {
        const resolved = ResolveColor(item.Color, i);
        if (resolved.Rejected !== null) {
            log.Once(`color:${i}:${resolved.Rejected}`, `${context}: ${kind} "${nameOf(i)}" Color "${resolved.Rejected}" is not a var(--token); using ${resolved.Fill}.`);
        }
        return resolved.Fill;
    });
}

/** Logs once that a chart has no AriaLabel (screen readers fall back to "Chart"). */
export function LogMissingAriaLabel(ariaLabel: string, log: ChartIssueLog, context: string): void {
    if (!ariaLabel) {
        log.Once('aria-label', `${context}: AriaLabel is missing; screen readers will announce "Chart".`);
    }
}

/** Logs once when a documented size cap is exceeded; the chart still renders. `detail` is the chart's own sentence. */
export function LogSoftCap(exceeded: boolean, detail: string, log: ChartIssueLog, context: string): void {
    if (exceeded) {
        log.Once('size-cap', `${context}: ${detail}`);
    }
}
