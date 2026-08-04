/**
 * @fileoverview `{{ path }}` templating for `tool` stage params. Resolves against a scope of named
 * bindings: `$` is the current upstream value, plus any `map` element binding (e.g. `row`) or `let`
 * binding. Paths use the shared field-path grammar (no eval).
 *
 * - A param whose value is exactly one `{{ path }}` resolves to the RAW value (object/number/array).
 * - A param with embedded `{{ path }}` inside other text does string interpolation (coerced to text).
 *
 * @module @memberjunction/ai-agents
 */
import { PipeValue } from './pipeline.types';
import { getValue } from './path';
import { valueToText } from './coerce';

/** Binding scope: `$` = current upstream value; other keys = map/let bindings. */
export type TemplateScope = Record<string, PipeValue>;

const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
const EMBEDDED = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Recursively resolve templates in a tool's `with` params object. */
export function resolveParams(params: Record<string, unknown>, scope: TemplateScope): Record<string, unknown> {
    return resolveValue(params, scope) as Record<string, unknown>;
}

function resolveValue(value: unknown, scope: TemplateScope): unknown {
    if (typeof value === 'string') {
        return resolveString(value, scope);
    }
    if (Array.isArray(value)) {
        return value.map((v) => resolveValue(v, scope));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveValue(v, scope)]));
    }
    return value;
}

function resolveString(s: string, scope: TemplateScope): unknown {
    const whole = WHOLE.exec(s);
    if (whole) {
        return resolvePath(whole[1], scope); // raw value
    }
    return s.replace(EMBEDDED, (_m, path) => valueToText(resolvePath(path, scope) ?? null));
}

/** Resolve a scoped path like `row.Email` or `$.Results[0].Name`. Throws on an unknown binding. */
export function resolvePath(path: string, scope: TemplateScope): PipeValue | undefined {
    const trimmed = path.trim();
    const varMatch = /^[A-Za-z_$][A-Za-z0-9_]*/.exec(trimmed);
    if (!varMatch) {
        throw new Error(`Invalid template path "{{${path}}}"`);
    }
    const varName = varMatch[0];
    if (!(varName in scope)) {
        const available = Object.keys(scope).join(', ');
        throw new Error(`Unknown binding "${varName}" in {{${path}}}. Available: ${available}`);
    }
    const root = scope[varName];
    let rest = trimmed.slice(varName.length);
    if (rest.startsWith('.')) {
        rest = rest.slice(1);
    }
    return rest === '' ? root : getValue(root, rest);
}
