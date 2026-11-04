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
