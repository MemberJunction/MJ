/**
 * @fileoverview Pure helper for resolving an AI-agent-supplied region
 * identifier to a concrete Venn intersection in the Lists Operations
 * surface.
 *
 * Kept framework-agnostic and side-effect-free so it can be unit-tested in
 * isolation and reused by the agent client-tool handler without dragging in
 * the Angular component. It does NOT mutate, query, or render anything — it
 * only matches a string against an in-memory list of intersections.
 */

/** Minimal shape of a Venn intersection this resolver needs to match on. */
export interface ResolvableVennRegion {
    /** Display label for the region (e.g. "A ∩ B", "Only A"). */
    label: string;
    /** Labels of the operands participating in this region. */
    setLabels: string[];
    /** Number of records in the region. */
    size: number;
}

/**
 * Resolve a raw, untrusted region identifier to one of the available Venn
 * intersections. Matching is tolerant and case-insensitive, tried in
 * priority order:
 *   1. Exact label match.
 *   2. Label match ignoring surrounding whitespace + case.
 *   3. Match against the joined operand set-labels (e.g. "A,B" or "A B").
 *   4. Substring match on the label (last resort, only if unambiguous).
 *
 * Returns the matched region, or `null` when nothing matches or a
 * substring match would be ambiguous (multiple candidates).
 *
 * @param regions - The currently-available intersections.
 * @param query - The agent-supplied region identifier (label or set-label list).
 */
export function resolveVennRegion<T extends ResolvableVennRegion>(
    regions: readonly T[],
    query: string,
): T | null {
    if (!query || regions.length === 0) {
        return null;
    }
    const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const q = norm(query);

    // 1 + 2: exact label match (case / whitespace tolerant).
    const labelMatch = regions.find(r => norm(r.label) === q);
    if (labelMatch) {
        return labelMatch;
    }

    // 3: match against the operand set-labels. Operand labels can contain
    // spaces (e.g. "List A"), so we split the agent input on commas only and
    // compare the operand sets order-independently.
    const queryParts = q.split(',').map(p => p.trim()).filter(Boolean).sort();
    if (queryParts.length > 0) {
        const setLabelMatch = regions.find(r => {
            const parts = r.setLabels.map(norm).sort();
            return parts.length === queryParts.length && parts.every((p, i) => p === queryParts[i]);
        });
        if (setLabelMatch) {
            return setLabelMatch;
        }
    }

    // 4: unambiguous substring match on the label.
    const substringMatches = regions.filter(r => norm(r.label).includes(q));
    if (substringMatches.length === 1) {
        return substringMatches[0];
    }

    return null;
}
