/**
 * @fileoverview Decoding a JSON document that a model sent as a string-typed tool argument.
 *
 * Some tool arguments are declared as JSON strings on purpose (see `complete_task.payloadChangeRequest`
 * in control-tools.ts), which leaves the model writing JSON inside a string. Long documents come back
 * with a recurring defect: part-way through, usually right after a long string value such as a SQL
 * query, the model keeps writing the document's own layout as escape sequences — `"…ASC"\n    }\n  }\n}`
 * — as if it were still inside that string. Gemini 3.8 Flash did exactly this on a forced final
 * `complete_task` turn, and the run failed with a finished, correct answer in hand.
 *
 * A backslash is never valid JSON outside a string, so turning `\n`, `\r` and `\t` there back into
 * the whitespace they stand for cannot change the meaning of a document that was already valid.
 * Nothing else is repaired: a document that still does not parse is reported with the parser's own
 * message, so the model learns where it went wrong.
 */

/** The result of decoding a JSON argument: the parsed value, or why it could not be parsed. */
export type JSONArgumentDecodeResult =
    | { Success: true; Value: unknown; Repaired: boolean }
    | { Success: false; Error: string };

/** Escapes a model writes for layout, mapped to the whitespace they stand for. */
const LAYOUT_ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t' };

/**
 * Parses `text` as JSON, repairing layout escapes written outside string literals if the plain parse
 * fails.
 *
 * @param text the argument as the model sent it
 * @returns the parsed value, with `Repaired` true when the repair was needed; or the original parse error
 */
export function DecodeJSONArgument(text: string): JSONArgumentDecodeResult {
    let originalError: string;
    try {
        return { Success: true, Value: JSON.parse(text), Repaired: false };
    } catch (error: unknown) {
        originalError = error instanceof Error ? error.message : String(error);
    }

    const repaired = RepairLayoutEscapesOutsideStrings(text);
    if (repaired !== text) {
        try {
            return { Success: true, Value: JSON.parse(repaired), Repaired: true };
        } catch {
            // Fall through: report the error the model's own text produced, not the repair's.
        }
    }
    return { Success: false, Error: originalError };
}

/**
 * Replaces `\n`, `\r` and `\t` escape sequences that sit outside JSON string literals with the
 * whitespace they stand for. Escapes inside strings, and every other character, are left alone.
 *
 * @param text JSON text, possibly with layout written as escape sequences
 * @returns the text with those escapes outside strings turned into whitespace
 */
export function RepairLayoutEscapesOutsideStrings(text: string): string {
    let output = '';
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            output += char;
            if (char === '\\' && i + 1 < text.length) {
                output += text[++i];
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        const layout = char === '\\' ? LAYOUT_ESCAPES[text[i + 1]] : undefined;
        if (layout !== undefined) {
            output += layout;
            i++;
            continue;
        }
        if (char === '"') {
            inString = true;
        }
        output += char;
    }
    return output;
}
