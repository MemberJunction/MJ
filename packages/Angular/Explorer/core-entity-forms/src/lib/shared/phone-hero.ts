/**
 * Helpers for the phone hero pattern (design call 6A): at phone width a form's hero keeps its
 * icon, name, status and primary action, and everything else collapses into one summary line
 * that expands in place. The layout lives in `phone-hero.css`; these build the line's text.
 */

/** Joins the parts that are present with a middle dot; null, undefined, false and blank are skipped. */
export function JoinHeroSummary(parts: ReadonlyArray<string | null | undefined | false>): string {
    return parts
        .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
        .map((p) => p.trim())
        .join(' · ');
}

/** `1 param`, `0 params`, `12 params`. */
export function CountLabel(count: number, singular: string): string {
    return `${count} ${count === 1 ? singular : singular + 's'}`;
}

/** The status a run's phone chip shows; each maps to a `--mj-status-*` token pair in `phone-hero.css`. */
export type RunStatusKindValue = 'running' | 'success' | 'error' | 'info';

/**
 * A run is running until it has completed (the completion time is the authority, not the success
 * flag); a completed run is a success, an error, or plain info when it carries no success flag.
 */
export function RunStatusKind(completed: boolean, success: boolean | null | undefined): RunStatusKindValue {
    if (!completed) return 'running';
    if (success === true) return 'success';
    if (success === false) return 'error';
    return 'info';
}
