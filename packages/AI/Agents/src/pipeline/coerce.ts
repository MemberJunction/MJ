/**
 * @fileoverview Value↔text coercion at the pipeline edges. Within a pipeline values stay
 * structured; we only stringify (a) for the final result returned to the LLM, (b) for a text
 * interpolation, or (c) when an action param needs a string.
 *
 * @module @memberjunction/ai-agents
 */
import { PipeValue } from './pipeline.types';

/** Default max characters of the final value returned to the LLM before truncation. */
export const FINAL_OUTPUT_LIMIT = 8000;
/** Max characters of a per-step debug preview. */
export const PREVIEW_LIMIT = 500;

/** Compact text form: strings pass through raw; null/undefined → ''; everything else → compact JSON. */
export function valueToText(v: PipeValue): string {
    if (v == null) {
        return '';
    }
    return typeof v === 'string' ? v : JSON.stringify(v);
}

/** Byte size of a value's serialized form (for logging / context-saved accounting). */
export function sizeOf(v: PipeValue): number {
    return Buffer.byteLength(valueToText(v), 'utf8');
}

/** Truncated debug preview of a value. */
export function previewOf(v: PipeValue): string {
    const text = valueToText(v);
    return text.length <= PREVIEW_LIMIT ? text : `${text.slice(0, PREVIEW_LIMIT)}…`;
}

/**
 * Render the final value for the LLM: strings raw, everything else pretty JSON, truncated with an
 * explicit note (never silently). A short type/shape tag prefixes structured values so the agent
 * knows what it got without the full payload.
 */
export function formatFinalOutput(v: PipeValue, limit: number = FINAL_OUTPUT_LIMIT): string {
    const body = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    const tag = shapeTag(v);
    const head = tag ? `${tag}\n` : '';
    if (body.length <= limit) {
        return head + body;
    }
    return `${head}${body.slice(0, limit)}\n…[truncated ${body.length - limit} chars — narrow the pipeline (select/first/count) to return less]`;
}

/**
 * When a stage filters a non-empty array down to empty, describe the input so the agent can
 * self-correct a wrong field name / value casing instead of blindly retrying: lists each field
 * with its distinct values present (capped). E.g. "matched 0 of 150 items. Values present:
 * status=[Open, Pending, Closed]; priority=[Low, Medium, High, Critical]".
 */
export function describeEmptyMatch(input: PipeValue): string {
    if (!Array.isArray(input) || input.length === 0) {
        return '';
    }
    const sample = input.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x)) as
        | Record<string, PipeValue>
        | undefined;
    if (!sample) {
        return `matched 0 of ${input.length} items.`;
    }
    const fields = Object.keys(sample).slice(0, 8);
    const parts = fields.map((f) => {
        const values = [
            ...new Set(
                (input as Record<string, PipeValue>[])
                    .map((r) => r?.[f])
                    .filter((v) => v != null)
                    .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))),
            ),
        ].slice(0, 6);
        return `${f}=[${values.join(', ')}]`;
    });
    return `matched 0 of ${input.length} items. Field values present — ${parts.join('; ')}. Check your field names/values (case-sensitive) against these.`;
}

/** A one-line shape hint, e.g. `[array: 50 items]` or `[object: ID, Name, Status]`. */
export function shapeTag(v: PipeValue): string {
    if (Array.isArray(v)) {
        const sample = v.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
        const keys = sample ? Object.keys(sample as Record<string, unknown>).slice(0, 8).join(', ') : '';
        return `[array: ${v.length} item(s)${keys ? `, fields: ${keys}` : ''}]`;
    }
    if (v !== null && typeof v === 'object') {
        return `[object: ${Object.keys(v).slice(0, 12).join(', ')}]`;
    }
    return '';
}
