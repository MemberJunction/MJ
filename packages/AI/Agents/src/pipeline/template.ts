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
 * If `s` (ignoring outer whitespace) consists of a single `{{ expression }}` placeholder
 * with no nested braces, returns the trimmed inner expression in `O(n)` time; otherwise `null`.
 */
export function ExtractWholeTemplateExpression(s: string): string | null {
    const trimmed = s.trim();
    if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}') || trimmed.length < 4) {
        return null;
    }
    const rawInner = trimmed.slice(2, -2);
    if (rawInner.includes('{{') || rawInner.includes('}')) {
        return null;
    }
    const expr = rawInner.trim();
    return expr.length > 0 ? expr : null;
}

/**
 * Linear `O(n)` scanner that replaces every embedded `{{ expression }}` placeholder in `template`
 * using `replaceExpr(trimmedExpression, rawMatch)`. Malformed or empty placeholders (unclosed `{{`,
 * empty `{{ }}`, or inner `}`) are preserved verbatim without backtracking.
 */
export function ReplaceEmbeddedTemplateExpressions(
    template: string,
    replaceExpr: (expr: string, rawMatch: string) => string
): string {
    if (!template || !template.includes('{{')) {
        return template;
    }
    let result = '';
    let cursor = 0;
    while (cursor < template.length) {
        const openIdx = template.indexOf('{{', cursor);
        if (openIdx === -1) {
            result += template.slice(cursor);
            break;
        }
        const closeIdx = template.indexOf('}}', openIdx + 2);
        if (closeIdx === -1) {
            result += template.slice(cursor);
            break;
        }
        result += template.slice(cursor, openIdx);
        const rawInner = template.slice(openIdx + 2, closeIdx);
        const expr = rawInner.trim();
        const rawMatch = template.slice(openIdx, closeIdx + 2);
        if (expr.length === 0 || rawInner.includes('}')) {
            result += rawMatch;
        } else {
            result += replaceExpr(expr, rawMatch);
        }
        cursor = closeIdx + 2;
    }
    return result;
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
    const wholeExpr = ExtractWholeTemplateExpression(s);
    if (wholeExpr !== null) {
        return ResolvePath(wholeExpr, scope); // raw value
    }
    return ReplaceEmbeddedTemplateExpressions(s, (path) => ValueToText(ResolvePath(path, scope) ?? null));
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
