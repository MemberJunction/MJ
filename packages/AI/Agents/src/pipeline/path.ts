/**
 * @fileoverview The one field-path grammar reused across `where`, `select`, `sort`, and `{{...}}`
 * templating. Accepts root-relative paths (`Status`, `Customer.Email`, `Items[*].SKU`) as well as
 * absolute (`$.Results[*].Name`). Built on the eval-free JSONPath evaluator — paths are parsed,
 * never `eval`'d, so LLM-authored paths can't execute code.
 *
 * @module @memberjunction/ai-agents
 */
import { PipeValue } from './pipeline.types';
import { parseJsonPath, evaluateJsonPath } from './jsonpath-eval';

/** Normalize a relative path to absolute JSONPath form. `$`/`$.x` pass through; `x.y` → `$.x.y`. */
function toAbsolute(path: string): string {
    const p = path.trim();
    if (p === '' || p === '$') {
        return '$';
    }
    if (p.startsWith('$')) {
        return p;
    }
    return p.startsWith('[') ? `$${p}` : `$.${p}`;
}

/** All values matching `path` within `value`. */
export function getValues(value: PipeValue, path: string): PipeValue[] {
    return evaluateJsonPath(parseJsonPath(toAbsolute(path)), value) as PipeValue[];
}

/** First value matching `path`, or undefined. Used by where/sort/template (single-valued contexts). */
export function getValue(value: PipeValue, path: string): PipeValue | undefined {
    const vs = getValues(value, path);
    return vs.length > 0 ? vs[0] : undefined;
}

/** Field names available on an object value (for field-listing error messages). */
export function fieldNames(value: PipeValue): string[] {
    if (Array.isArray(value)) {
        // Surface the element fields — that's what `where`/`select` operate on.
        const first = value.find((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
        return first ? Object.keys(first as Record<string, unknown>) : [];
    }
    if (value !== null && typeof value === 'object') {
        return Object.keys(value);
    }
    return [];
}
