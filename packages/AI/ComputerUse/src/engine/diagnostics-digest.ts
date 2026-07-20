/**
 * Compact browser-diagnostics digest for the controller/judge prompt (CU-A7).
 *
 * The adapter buffers console errors, page errors, failed requests, and crashes;
 * the engine drains them per step. This turns a step's raw events into a short,
 * capped, signal-only digest so a blank page whose console says `ChunkLoadError`
 * — or whose network log shows `POST /graphql net::ERR_ABORTED` — becomes
 * *explainable to the agent and judge*, instead of both staring at blank pixels.
 *
 * Pure so the filtering + capping is unit-testable.
 */

import type { BrowserDiagnosticEvent } from '../types/browser.js';

/** Default digest cap (chars) — keep prompt cost bounded (~a few lines). */
export const DEFAULT_DIGEST_MAX_CHARS = 500;

/**
 * Keep only signal-bearing events: console *errors* (warnings are dropped as
 * noise), page errors, failed requests, and crashes.
 */
function isSignal(e: BrowserDiagnosticEvent): boolean {
    if (e.type === 'console') {
        return e.level === 'error';
    }
    return true;
}

/**
 * Build a compact digest of a step's diagnostics, or '' when there's nothing
 * signal-bearing. Oldest-first (matching capture order), capped to `maxChars`
 * with a trailing ellipsis when truncated.
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
