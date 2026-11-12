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

/** True for the characters a regex `.` refuses to match. */
function isLineTerminator(ch: string): boolean {
    return ch === '\n' || isNonNewlineTerminator(ch);
}

/**
 * Whether one line of `text` holds `prefix`, then anything, then `suffix`, compared without regard
 * to case. Equivalent to `new RegExp(escape(prefix) + '.*' + escape(suffix), 'i').test(text)` for
 * ASCII `prefix` and `suffix`, in one pass: on each line the earliest `prefix` and the latest
 * `suffix` are the only pair that needs checking.
 */
export function ContainsInOrderOnOneLine(text: string, prefix: string, suffix: string): boolean {
    const lower = text.toLowerCase();
    const p = prefix.toLowerCase();
    const q = suffix.toLowerCase();
    let lineStart = 0;
    while (lineStart <= lower.length) {
        let lineEnd = lineStart;
        while (lineEnd < lower.length && !isLineTerminator(lower[lineEnd])) {
            lineEnd++;
        }
        const line = lower.slice(lineStart, lineEnd);
        const first = line.indexOf(p);
        if (first >= 0 && line.lastIndexOf(q) >= first + p.length) {
            return true;
        }
        lineStart = lineEnd + 1;
    }
    return false;
}

/**
 * Whether a value reads like a template placeholder ("your name here", "insert the date here").
 * Equivalent to `/your .* here|insert .* here/i.test(text)`, in linear time.
 */
export function ContainsPlaceholderPhrase(text: string): boolean {
    return ContainsInOrderOnOneLine(text, 'your ', ' here') || ContainsInOrderOnOneLine(text, 'insert ', ' here');
}
