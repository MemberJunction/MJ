/**
 * @fileoverview Adapters that turn each capability's native result into a structured {@link PipeValue}.
 * The whole point of the object model: do NOT stringify here — emit the structure so downstream
 * operators can bind to properties.
 *
 * @module @memberjunction/ai-agents
 */
import { ActionResult } from '@memberjunction/actions-base';
import { PipeValue } from '../pipeline.types';

/**
 * Structure an Action's output as a value: one output param → its value; many → an object keyed by
 * name; none → the Message. String values that are clearly JSON are parsed so structured operators
 * work on real action payloads (e.g. a RunView that returns its rows as a JSON string).
 */
export function structureActionResult(result: ActionResult): PipeValue {
    const outputs = (result.Params ?? []).filter((p) => p.Type === 'Output');
    if (outputs.length === 1) {
        return coerceMaybeJson(outputs[0].Value);
    }
    if (outputs.length > 1) {
        return outputs.reduce<{ [k: string]: PipeValue }>((acc, p) => {
            acc[p.Name] = coerceMaybeJson(p.Value);
            return acc;
        }, {});
    }
    return result.Message ?? null;
}

/**
 * Structure arbitrary artifact-tool `data` as a value. `get_full` returns a
 * `{ content, encoding, sizeBytes }` envelope — unwrap it to the real content (parsing JSON text)
 * so a `get_full` source composes directly with the operators (`where`/`select`/…). Other tools
 * return their data directly.
 */
export function structureArtifactData(data: unknown): PipeValue {
    if (isGetFullEnvelope(data)) {
        const env = data as { content: unknown; encoding?: string };
        if (typeof env.content === 'string' && env.encoding !== 'base64') {
            return coerceMaybeJson(env.content);
        }
        return env.content as PipeValue; // base64/binary — leave as-is
    }
    const rows = unwrapRowsEnvelope(data);
    if (rows !== undefined) {
        return rows;
    }
    return coerceMaybeJson(data);
}

/**
 * Tabular artifact tools (`get_rows` on CSV / Excel / Data Snapshot / Search Result Set) wrap their
 * rows in an envelope — `{ rows: [...], total, ... }`. Object-aware operators (`where`/`select`/
 * `distinct`/`sort`) need a bare array, so unwrap to the rows array directly: the agent shouldn't
 * have to know the envelope shape and lead every tabular pipeline with `{ "jsonpath": "$.rows[*]" }`.
 *
 * Pagination metadata (`total`/`totalRows`/`truncated`) is intentionally dropped from the pipe — the
 * agent controls paging via the tool's own `start`/`count` params, not by reading it back mid-flow.
 *
 * Returns `undefined` (not unwrapped) when `data` isn't a rows-envelope, so the caller falls through.
 */
function unwrapRowsEnvelope(data: unknown): PipeValue | undefined {
    if (
        data !== null &&
        typeof data === 'object' &&
        !Array.isArray(data) &&
        Array.isArray((data as Record<string, unknown>).rows)
    ) {
        return (data as Record<string, PipeValue>).rows;
    }
    return undefined;
}

function isGetFullEnvelope(d: unknown): boolean {
    return (
        d !== null &&
        typeof d === 'object' &&
        !Array.isArray(d) &&
        'content' in (d as object) &&
        'sizeBytes' in (d as object)
    );
}

/** Pass values through; parse strings that look like JSON objects/arrays so operators can bind. */
function coerceMaybeJson(v: unknown): PipeValue {
    if (typeof v !== 'string') {
        return v as PipeValue;
    }
    const t = v.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
        try {
            return JSON.parse(t) as PipeValue;
        } catch {
            return v;
        }
    }
    return v;
}
