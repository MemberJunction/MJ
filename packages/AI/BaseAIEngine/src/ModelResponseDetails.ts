/**
 * @fileoverview The one way this package reads a prompt run's `ModelSpecificResponseDetails` text: a JSON object, or
 * nothing. Shared by the realtime usage record and the cost lines, which both write keys into the same object and
 * keep every key they do not own. Internal: not exported from the package.
 */
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { IsPlainObject } from '@memberjunction/global';

/** Whether a details value is absent or only whitespace, so a writer may start a new object. */
export function IsBlankModelResponseDetails(text: string | null | undefined): boolean {
    return typeof text !== 'string' || text.trim().length === 0;
}

/**
 * Parses `ModelSpecificResponseDetails` text into a JSON object. `null` for absent, blank, malformed or non-object
 * text; never throws.
 *
 * @param text The column's value.
 */
export function ParseModelResponseDetails(text: string | null | undefined): JSONObject | null {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return null;
    }
    try {
        const parsed = JSON.parse(text) as JSONValue;
        return IsPlainObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * The details object a writer adds its key to: the parsed object, a new one for blank text, or `null` when the text is
 * not a JSON object (a writer never overwrites a value it cannot read).
 *
 * @param text The column's value.
 */
export function ModelResponseDetailsForWrite(text: string | null | undefined): JSONObject | null {
    return IsBlankModelResponseDetails(text) ? {} : ParseModelResponseDetails(text);
}
