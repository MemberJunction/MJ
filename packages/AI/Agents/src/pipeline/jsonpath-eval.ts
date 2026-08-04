/**
 * @fileoverview Eval-free JSONPath subset evaluator.
 *
 * Deliberately constrained: supports root (`$`), member access (`.name` / `["name"]`),
 * array index (`[0]`, negative indexes count from the end), wildcard (`[*]` / `.*`), and
 * recursive descent (`..name`, `..*`). It does NOT support filter or script expressions
 * (`[?(...)]`, `[(...)]`) — those require evaluating arbitrary expressions, and the path
 * here originates from an LLM. Refusing eval is a security decision, not a shortcut.
 *
 * @module @memberjunction/ai-agents
 */

type Selector =
    | { kind: 'member'; name: string }
    | { kind: 'index'; index: number }
    | { kind: 'wildcard' }
    | { kind: 'recursive'; name: string | null }; // name === null => `..*`

/** Parse a JSONPath string into a flat list of selectors. Throws on unsupported syntax. */
export function parseJsonPath(path: string): Selector[] {
    const trimmed = path.trim();
    if (trimmed !== '$' && !trimmed.startsWith('$.') && !trimmed.startsWith('$[')) {
        throw new Error(`JSONPath must start with "$" (got "${path}")`);
    }
    if (/\[\s*[?(]/.test(trimmed)) {
        throw new Error('JSONPath filter/script expressions are not supported');
    }
    const selectors: Selector[] = [];
    let i = 1; // skip leading `$`
    while (i < trimmed.length) {
        i = parseNextSelector(trimmed, i, selectors);
    }
    return selectors;
}

/** Parse one selector starting at `i`; push it onto `out`; return the next index. */
function parseNextSelector(s: string, i: number, out: Selector[]): number {
    if (s[i] === '.' && s[i + 1] === '.') {
        return parseRecursive(s, i + 2, out);
    }
    if (s[i] === '.') {
        return parseDotMember(s, i + 1, out);
    }
    if (s[i] === '[') {
        return parseBracket(s, i + 1, out);
    }
    throw new Error(`Unexpected character "${s[i]}" at position ${i} in JSONPath`);
}

/** `.name` or `.*` */
function parseDotMember(s: string, i: number, out: Selector[]): number {
    if (s[i] === '*') {
        out.push({ kind: 'wildcard' });
        return i + 1;
    }
    const m = /^[^.[]+/.exec(s.slice(i));
    if (!m) {
        throw new Error(`Empty member name at position ${i} in JSONPath`);
    }
    out.push({ kind: 'member', name: m[0] });
    return i + m[0].length;
}

/** `..name` or `..*` */
function parseRecursive(s: string, i: number, out: Selector[]): number {
    if (s[i] === '*') {
        out.push({ kind: 'recursive', name: null });
        return i + 1;
    }
    const m = /^[^.[]+/.exec(s.slice(i));
    if (!m) {
        throw new Error(`Empty member name after ".." at position ${i} in JSONPath`);
    }
    out.push({ kind: 'recursive', name: m[0] });
    return i + m[0].length;
}

/** `[0]`, `[-1]`, `[*]`, `['name']`, `["name"]` */
function parseBracket(s: string, i: number, out: Selector[]): number {
    const close = s.indexOf(']', i);
    if (close < 0) {
        throw new Error('Unterminated "[" in JSONPath');
    }
    const inner = s.slice(i, close).trim();
    if (inner === '*') {
        out.push({ kind: 'wildcard' });
    } else if (/^-?\d+$/.test(inner)) {
        out.push({ kind: 'index', index: parseInt(inner, 10) });
    } else if (/^'.*'$/.test(inner) || /^".*"$/.test(inner)) {
        out.push({ kind: 'member', name: inner.slice(1, -1) });
    } else {
        throw new Error(`Unsupported bracket selector "[${inner}]" in JSONPath`);
    }
    return close + 1;
}

/** Evaluate parsed selectors against a root value, returning all matched values. */
export function evaluateJsonPath(selectors: Selector[], root: unknown): unknown[] {
    return selectors.reduce<unknown[]>((current, selector) => applySelector(selector, current), [root]);
}

/** Apply one selector across the current set of matched values. */
function applySelector(selector: Selector, values: unknown[]): unknown[] {
    switch (selector.kind) {
        case 'member':
            return values.flatMap((v) => memberValues(v, selector.name));
        case 'index':
            return values.flatMap((v) => indexValues(v, selector.index));
        case 'wildcard':
            return values.flatMap(childValues);
        case 'recursive':
            return values.flatMap((v) => recursiveValues(v, selector.name));
    }
}

function memberValues(v: unknown, name: string): unknown[] {
    return isRecord(v) && name in v ? [v[name]] : [];
}

function indexValues(v: unknown, index: number): unknown[] {
    if (!Array.isArray(v)) {
        return [];
    }
    const idx = index < 0 ? v.length + index : index;
    return idx >= 0 && idx < v.length ? [v[idx]] : [];
}

/** Immediate children of an array (elements) or object (values). */
function childValues(v: unknown): unknown[] {
    if (Array.isArray(v)) {
        return v;
    }
    return isRecord(v) ? Object.values(v) : [];
}

/** Recursive descent: every descendant matching `name` (or every descendant when null). */
function recursiveValues(v: unknown, name: string | null): unknown[] {
    const out: unknown[] = [];
    const visit = (node: unknown): void => {
        if (name === null) {
            childValues(node).forEach((c) => {
                out.push(c);
                visit(c);
            });
            return;
        }
        if (isRecord(node) && name in node) {
            out.push(node[name]);
        }
        childValues(node).forEach(visit);
    };
    visit(v);
    return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
