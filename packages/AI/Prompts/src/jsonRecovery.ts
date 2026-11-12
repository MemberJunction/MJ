/**
 * Recovery for a model reply that holds one complete JSON value followed by stray text (#3065).
 *
 * Models sometimes close a valid JSON object and then keep going: a duplicated closing fragment,
 * a second partial object, or a sentence. `CleanJSON` and JSON5 parse the whole string and fail on
 * that tail. This module finds the first complete top-level object or array and returns it with
 * the tail, so the caller can use the value and log what was dropped. It never repairs unbalanced
 * or truncated input: when the first value does not close, or what closed does not parse, it
 * returns null and the caller's normal error path runs.
 */

/** A JSON value read from the start of a reply, and the text after it. */
export interface LeadingJSONValue {
    /** The parsed value of the first complete top-level object or array. */
    Value: unknown;
    /** Everything after that value. Never empty or whitespace-only. */
    Tail: string;
}

/**
 * The index just past the top-level `{…}` or `[…]` that starts at `start`, or -1 when it never
 * closes. Brackets inside strings, and escaped quotes inside strings, are skipped.
 */
function findValueEnd(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (ch === '\\') {
                i++;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
        } else if (ch === '{' || ch === '[') {
            depth++;
        } else if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) {
                return i + 1;
            }
        }
    }
    return -1;
}

/**
 * Reads the first complete top-level JSON object or array from `text` when non-whitespace text
 * follows it.
 *
 * Leading whitespace is allowed; anything else before the value is not, so prose or a code fence
 * in front is left to `CleanJSON`. Returns null when the text does not start with `{` or `[`, when
 * that value does not close, when the closed span is not valid JSON, or when nothing but
 * whitespace follows it (the plain parse already handles that case).
 *
 * @param text The model's raw reply
 * @returns The value and the dropped tail, or null
 */
export function ExtractLeadingJSONValue(text: string): LeadingJSONValue | null {
    let start = 0;
    while (start < text.length && /\s/.test(text[start])) {
        start++;
    }
    if (text[start] !== '{' && text[start] !== '[') {
        return null;
    }
    const end = findValueEnd(text, start);
    if (end < 0) {
        return null;
    }
    const tail = text.slice(end);
    if (tail.trim().length === 0) {
        return null;
    }
    try {
        return { Value: JSON.parse(text.slice(start, end)), Tail: tail };
    } catch {
        return null;
    }
}
