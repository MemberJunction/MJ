/**
 * Linear-time replacements for regular expressions that CodeQL flags as polynomial
 * (`js/polynomial-redos`) because they run over prompt configuration and rendered prompt text.
 *
 * Each function keeps the exact semantics of the expression it replaces.
 */

/** True for the characters a regex `.` refuses to match, other than `\n` (callers split on it). */
function isNonNewlineTerminator(ch: string): boolean {
    return ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

/**
 * Strips leading and trailing spaces and tabs only. Equivalent to `s.replace(/^[ \t]+|[ \t]+$/g, '')`.
 *
 * Deliberately not `String.trim()`: stop sequences can begin or end with a newline (for example
 * `"\n```"`), and trimming it would change which text the stop fires on.
 */
export function TrimSpacesAndTabs(s: string): string {
    let start = 0;
    let end = s.length;
    while (start < end && (s[start] === ' ' || s[start] === '\t')) {
        start++;
    }
    while (end > start && (s[end - 1] === ' ' || s[end - 1] === '\t')) {
        end--;
    }
    return s.slice(start, end);
}

const ENTRY_SEPARATOR = '** — ';

/**
 * The MIME type from one artifact-manifest line of the form `**A** — name [mime]`, or null when the
 * line isn't one. Equivalent to `/^\*\*[A-Z]+\*\* — .+? \[(?<mime>[^\]]+)\]/.exec(line)?.groups?.mime`
 * for a line that contains no `\n`.
 */
export function ParseManifestEntryMime(line: string): string | null {
    if (!line.startsWith('**')) {
        return null;
    }
    let i = 2;
    while (i < line.length && line.charCodeAt(i) >= 65 && line.charCodeAt(i) <= 90) {
        i++;
    }
    if (i === 2 || !line.startsWith(ENTRY_SEPARATOR, i)) {
        return null;
    }
    const nameStart = i + ENTRY_SEPARATOR.length;

    // The lazy `.+?` name cannot cross a line terminator, so no candidate bracket may lie past one.
    let terminator = line.length;
    for (let j = nameStart; j < line.length; j++) {
        if (isNonNewlineTerminator(line[j])) {
            terminator = j;
            break;
        }
    }

    // `.+?` needs at least one name character, so the first candidate ` [` starts after nameStart.
    let from = nameStart + 1;
    while (true) {
        const bracket = line.indexOf(' [', from);
        if (bracket < 0 || bracket >= terminator) {
            return null;
        }
        const mimeStart = bracket + 2;
        const close = line.indexOf(']', mimeStart);
        if (close < 0) {
            // No `]` anywhere after this bracket, so none after any later bracket either.
            return null;
        }
        if (close > mimeStart) {
            return line.slice(mimeStart, close);
        }
        // `[]` is empty: the lazy name grows past it and the next ` [` is tried.
        from = bracket + 1;
    }
}
