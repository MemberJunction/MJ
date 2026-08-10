/**
 * Compaction helpers that keep controller/judge prompt cost bounded: a
 * signal-only digest of a step's browser diagnostics, and a one-line summary of
 * steps that have scrolled out of the verbatim window. Both pure.
 */

import type { BrowserDiagnosticEvent } from '../types/browser.js';
import type { StepRecord } from '../types/judge.js';

/** Default diagnostics digest cap, in characters. */
export const DEFAULT_DIGEST_MAX_CHARS = 500;

/** Default number of most-recent steps kept verbatim; older ones are digested. */
export const DEFAULT_MAX_VERBATIM_STEPS = 8;

/** Console warnings are dropped as noise; errors, page errors, failed requests and crashes are kept. */
function isSignal(e: BrowserDiagnosticEvent): boolean {
    if (e.type === 'console') {
        return e.level === 'error';
    }
    return true;
}

/**
 * Digest a step's diagnostics oldest-first, capped to `maxChars` with a trailing
 * ellipsis when truncated. Returns '' when nothing signal-bearing was captured.
 */
export function formatDiagnosticsDigest(
    events: readonly BrowserDiagnosticEvent[],
    maxChars: number = DEFAULT_DIGEST_MAX_CHARS
): string {
    const signal = events.filter(isSignal);
    if (signal.length === 0) {
        return '';
    }

    const lines: string[] = [];
    let used = 0;
    for (const e of signal) {
        const label = e.type === 'console' ? 'console.error' : e.type;
        const line = `${label}: ${e.message}`;
        if (used + line.length + 1 > maxChars) {
            lines.push('…');
            break;
        }
        lines.push(line);
        used += line.length + 1;
    }
    return lines.join('\n');
}

/** Path + query only (origin dropped), for compact per-path counting. */
function compactPath(url: string): string {
    if (!url) return '';
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
    } catch {
        return url;
    }
}

/**
 * Collapse older steps into a one-line digest: step range, per-path visit counts
 * (paths seen more than once are marked `×N`, preserving the loop signal), and an
 * error count. Returns '' for an empty input.
 */
export function summarizeOlderSteps(steps: StepRecord[]): string {
    if (steps.length === 0) {
        return '';
    }
    const pathCounts = new Map<string, number>();
    let errorCount = 0;
    for (const step of steps) {
        const path = compactPath(step.UrlAfter || step.Url);
        if (path) {
            pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
        }
        if (step.Error) {
            errorCount++;
        }
    }
    const paths = [...pathCounts.entries()]
        .map(([p, n]) => (n > 1 ? `${p} (×${n})` : p))
        .join(', ');
    const first = steps[0].StepNumber;
    const last = steps[steps.length - 1].StepNumber;
    const errNote = errorCount > 0 ? `; ${errorCount} error(s)` : '';
    const pathNote = paths ? `visited ${paths}` : 'no navigation';
    return `Steps ${first}–${last} (summarized): ${pathNote}${errNote}`;
}
