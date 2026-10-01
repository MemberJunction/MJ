/**
 * Linear-time replacements for regular expressions that CodeQL flags as polynomial
 * (`js/polynomial-redos`) because they run over provider error text we don't control.
 *
 * Each function keeps the exact semantics of the expression it replaces, including that
 * `.` in a JavaScript regex never crosses a line terminator (`\n`, `\r`, `\u2028`, `\u2029`).
 */

/** True for the four characters a regex `.` refuses to match. */
function isLineTerminator(ch: string): boolean {
    return ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';
}

/** Index of the next line terminator at or after `from`, or `text.length` when there is none. */
function lineEndFrom(text: string, from: number): number {
    for (let i = from; i < text.length; i++) {
        if (isLineTerminator(text[i])) {
            return i;
        }
    }
    return text.length;
}

/**
 * True when some line of `text` contains one of `befores` followed, later on the same line,
 * by one of `afters`. Equivalent to `/(?:b1|b2).*(?:a1|a2)/.test(text)`.
 */
export function ContainsInOrderOnOneLine(text: string, befores: readonly string[], afters: readonly string[]): boolean {
    let lineStart = 0;
    while (lineStart <= text.length) {
        const lineEnd = lineEndFrom(text, lineStart);
        const line = text.slice(lineStart, lineEnd);
        for (const before of befores) {
            // The earliest occurrence leaves the most room for an `after`, so it is the only one to check.
            const at = line.indexOf(before);
            if (at < 0) {
                continue;
            }
            for (const after of afters) {
                if (line.indexOf(after, at + before.length) >= 0) {
                    return true;
                }
            }
        }
        lineStart = lineEnd + 1;
    }
    return false;
}

/**
 * The first `{…}` span on one line: from the leftmost `{` that has a `}` after it on the same
 * line, through the last `}` on that line. Equivalent to `text.match(/\{.*\}/)?.[0] ?? null`.
 */
export function FirstBraceSpanOnOneLine(text: string): string | null {
    let searchFrom = 0;
    while (searchFrom < text.length) {
        const open = text.indexOf('{', searchFrom);
        if (open < 0) {
            return null;
        }
        const lineEnd = lineEndFrom(text, open);
        // Search only this line. An unbounded lastIndexOf would scan back through every earlier
        // line on each line with a `{` but no `}`, which is quadratic on multi-line input.
        const line = text.slice(open, lineEnd);
        const close = line.lastIndexOf('}');
        if (close > 0) {
            return line.slice(0, close + 1);
        }
        // No `}` after this `{` on its line, so none after any later `{` on that line either.
        searchFrom = lineEnd + 1;
    }
    return null;
}
