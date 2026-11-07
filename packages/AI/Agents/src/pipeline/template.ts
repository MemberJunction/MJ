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
import { GetValue } from './path';
import { ValueToText } from './coerce';

/** Binding scope: `$` = current upstream value; other keys = map/let bindings. */
export type TemplateScope = Record<string, PipeValue>;

/**
 * The path written inside one `{{ … }}` span, given the text between the braces (never empty, never
 * containing `}`). Matches what the old `\{\{\s*([^}]+?)\s*\}\}` capture held: the text trimmed, or
 * its last character when it is all whitespace.
 */
function placeholderPath(inner: string): string {
    const trimmed = inner.trim();
    return trimmed.length > 0 ? trimmed : inner.slice(-1);
}

/**
 * The path of a param that is exactly one `{{ path }}` (surrounding whitespace allowed), or null.
 * Index checks rather than a regex, so a long run of whitespace or braces costs linear time
 * (CodeQL js/polynomial-redos).
 */
function wholePlaceholderPath(s: string): string | null {
    const t = s.trim();
    if (t.length < 5 || !t.startsWith('{{') || !t.endsWith('}}')) {
        return null;
    }
    const inner = t.slice(2, -2);
    return inner.includes('}') ? null : placeholderPath(inner);
}

/**
 * Replace every embedded `{{ path }}` span, left to right. A span opens at `{{` and closes at the
 * first `}` after it, which must be the first of `}}`; the text between is at least one character.
 * The position of the next `}` is remembered across candidate openings, so text full of `{{` with
 * no closing brace is scanned once (CodeQL js/polynomial-redos).
 */
function replaceEmbeddedPlaceholders(s: string, replace: (path: string) => string): string {
    let out = '';
    let copied = 0;
    let nextClose = -1;
    let open = s.indexOf('{{');
    while (open !== -1) {
        if (nextClose < open + 2) {
            nextClose = s.indexOf('}', open + 2);
            if (nextClose === -1) {
                break;
            }
        }
        if (nextClose > open + 2 && s[nextClose + 1] === '}') {
            out += s.slice(copied, open) + replace(placeholderPath(s.slice(open + 2, nextClose)));
            copied = nextClose + 2;
            open = s.indexOf('{{', copied);
        } else {
            open = s.indexOf('{{', open + 1);
        }
    }
    return out + s.slice(copied);
}

/** Recursively resolve templates in a tool's `with` params object. */
export function ResolveParams(params: Record<string, unknown>, scope: TemplateScope): Record<string, unknown> {
    return resolveValue(params, scope) as Record<string, unknown>;
}

/** @deprecated Use {@link ResolveParams}. */
export function resolveParams(params: Record<string, unknown>, scope: TemplateScope): Record<string, unknown> {
    return ResolveParams(params, scope);
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
    const whole = wholePlaceholderPath(s);
    if (whole !== null) {
        return ResolvePath(whole, scope); // raw value
    }
    return replaceEmbeddedPlaceholders(s, (path) => ValueToText(ResolvePath(path, scope) ?? null));
}

/** Resolve a scoped path like `row.Email` or `$.Results[0].Name`. Throws on an unknown binding. */
export function ResolvePath(path: string, scope: TemplateScope): PipeValue | undefined {
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
    return rest === '' ? root : GetValue(root, rest);
}

/** @deprecated Use {@link ResolvePath}. */
export function resolvePath(path: string, scope: TemplateScope): PipeValue | undefined {
    return ResolvePath(path, scope);
}
