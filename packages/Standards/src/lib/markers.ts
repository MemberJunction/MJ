/**
 * @fileoverview Reviewed-exception markers.
 *
 * Every standard needs an escape hatch, because a gate with no way to say "yes, I know, and it is
 * correct here" gets switched off wholesale the first time it is wrong. The shape of the hatch is
 * what keeps it honest: a marker is a comment on the offending line, so the exception and the thing
 * it excuses are read together, and a reviewer sees both in the diff.
 *
 * @module @memberjunction/standards
 */

/**
 * Does the given 1-based line carry `marker`, on itself or the line directly above?
 *
 * The preceding line counts because a real exception deserves a sentence of explanation, and a
 * trailing comment long enough to hold one is unreadable. Only ONE line above — a wider window
 * would let a marker drift away from the thing it excuses, which is how a suppression outlives the
 * reason for it.
 *
 * `lines` must come from the ORIGINAL source text, not a comment-stripped copy: markers live in
 * comments, so stripping them removes exactly what this reads.
 */
export function HasMarkerNear(lines: string[], lineNumber: number, marker: string): boolean {
    const own = lines[lineNumber - 1] ?? '';
    const above = lineNumber >= 2 ? (lines[lineNumber - 2] ?? '') : '';
    return own.includes(marker) || above.includes(marker);
}
