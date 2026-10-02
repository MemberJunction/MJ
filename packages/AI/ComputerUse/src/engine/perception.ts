/**
 * Formatting what the controller and judge see each step, all bounded so prompt
 * cost stays flat: the indexed interactive-element block, a signal-only digest of
 * browser diagnostics, and a one-line summary of steps that have scrolled out of
 * the verbatim window.
 */

import type { InteractiveElement, BrowserDiagnosticEvent } from '../types/browser.js';
import type { StepRecord } from '../types/judge.js';

// ─── Interactive-Element List ──────────────────────────

/** Default budget for the serialized block — formatting alone is worth a large token cut. */
export const DEFAULT_ELEMENT_LIST_MAX_CHARS = 12_000;

/** Stable identity of an element across steps, for the "new since last step" (`*`) marker. */
function elementKey(el: InteractiveElement): string {
    return `${el.Role}\u0001${el.Name}\u0001${el.Selector}`;
}

/** Render one element's line (without the leading index/`*`, which the caller adds). */
function describeElement(el: InteractiveElement): string {
    const parts: string[] = [];
    if (el.Scrollable) {
        parts.push('|SCROLL|');
    }
    parts.push(el.Role || 'element');
    // Name in quotes; empty name still renders "" so indices stay unambiguous.
    parts.push(`"${el.Name}"`);
    // Inputs: surface the current value (or "(empty)") so the model knows field state.
    if (el.Value !== undefined) {
        parts.push(el.Value.length > 0 ? `= "${el.Value}"` : '(empty)');
    }
    if (el.Disabled) {
        parts.push('(disabled)');
    }
    return parts.join(' ');
}

/**
 * Serialize the interactive-element list for a step. `prevElements` (the prior
 * step's list) drives the `*` "new element" marker; omit it on the first step.
 * Output is capped at `maxChars` — once the budget is hit, remaining elements
 * are dropped and a truncation note is appended (never a silent cap).
 */
export function SerializeInteractiveElements(
    elements: InteractiveElement[],
    prevElements?: InteractiveElement[],
    maxChars: number = DEFAULT_ELEMENT_LIST_MAX_CHARS
): string {
    if (elements.length === 0) {
        return '(no interactive elements detected)';
    }

    const prevKeys = new Set((prevElements ?? []).map(elementKey));
    const lines: string[] = [];
    let used = 0;
    let dropped = 0;

    for (const el of elements) {
        const isNew = prevElements !== undefined && !prevKeys.has(elementKey(el));
        const line = `[${el.Index}]${isNew ? '*' : ''} ${describeElement(el)}`;
        // +1 for the newline join. Keep at least one line even if it alone exceeds budget.
        if (lines.length > 0 && used + line.length + 1 > maxChars) {
            dropped = elements.length - lines.length;
            break;
        }
        lines.push(line);
        used += line.length + 1;
    }

    if (dropped > 0) {
        lines.push(`… ${dropped} more element(s) omitted (list truncated at ${maxChars} chars — scroll or narrow the view)`);
    }
    return lines.join('\n');
}

/** @deprecated Use {@link SerializeInteractiveElements}. */
export function serializeInteractiveElements(
    elements: InteractiveElement[],
    prevElements?: InteractiveElement[],
    maxChars: number = DEFAULT_ELEMENT_LIST_MAX_CHARS
): string {
    return SerializeInteractiveElements(elements, prevElements, maxChars);
}

// ─── Prompt Digests ────────────────────────────────────

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
export function FormatDiagnosticsDigest(
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

/** @deprecated Use {@link FormatDiagnosticsDigest}. */
export function formatDiagnosticsDigest(
    events: readonly BrowserDiagnosticEvent[],
    maxChars: number = DEFAULT_DIGEST_MAX_CHARS
): string {
    return FormatDiagnosticsDigest(events, maxChars);
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
export function SummarizeOlderSteps(steps: StepRecord[]): string {
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

/** @deprecated Use {@link SummarizeOlderSteps}. */
export function summarizeOlderSteps(steps: StepRecord[]): string {
    return SummarizeOlderSteps(steps);
}
