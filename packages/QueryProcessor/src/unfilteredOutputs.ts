/**
 * @fileoverview Finds the values a query template writes into SQL without a SQL filter, and decides
 * which of those values are safe to write that way.
 *
 * A query template is rendered by string substitution. `{{ Name | sqlString }}` is safe for any
 * value, because the filter writes the whole SQL literal. `{{ n }}` (and `{{ n | upper }}`, which no
 * SQL filter formats either) writes the value as SQL text: `TOP {{ n }}` with the value
 * `1 UNION SELECT …` becomes part of the statement. This module lets the processor refuse such a
 * value before it renders, for text the query author did not format.
 */
import nunjucks from 'nunjucks';

/** A value a nunjucks parse-tree node holds: a node, a list of nodes, or a literal's value. */
type NodeFieldValue = TemplateNode | NodeFieldValue[] | string | number | boolean | null | undefined;

/** The parts of a nunjucks parse-tree node this analysis reads. `fields` names the node's child properties. */
interface TemplateNode {
    readonly typename: string;
    readonly fields: readonly string[];
    readonly [field: string]: NodeFieldValue | readonly string[];
}

/** The nunjucks template parser. nunjucks exports it as `parser`; its type declarations do not. */
interface NunjucksParser {
    parse(src: string): TemplateNode;
}
const templateParser: NunjucksParser = (nunjucks as unknown as { parser: NunjucksParser }).parser;

/** Nodes whose value is `true` or `false`, whatever their operands hold. */
const BOOLEAN_RESULT_NODES: ReadonlySet<string> = new Set(['Compare', 'Not', 'In', 'Is']);

/** Loop nodes: `for`, `asyncEach` and `asyncAll`. */
const LOOP_NODES: ReadonlySet<string> = new Set(['For', 'AsyncEach', 'AsyncAll']);

/** Filter nodes: `x | f` and its async form. */
const FILTER_NODES: ReadonlySet<string> = new Set(['Filter', 'FilterAsync']);

/** How deep a value's lists and objects are followed before the value is refused. */
const MAX_VALUE_DEPTH = 6;

/**
 * Text that is safe as bare SQL wherever a template writes it: a plain decimal number, or a sort
 * direction. Anything else (a name, a keyword, an operator, a quote, a space) can change what the
 * statement selects, so it needs a SQL filter.
 */
const SAFE_UNFILTERED_TEXT = /^(?:[+-]?\d+(?:\.\d+)?|asc|desc)$/i;

/** Parsed templates by their text. A template is parsed once, however often it renders. */
const analysisCache = new Map<string, ReadonlySet<string>>();
const ANALYSIS_CACHE_LIMIT = 500;

function isNode(value: unknown): value is TemplateNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && typeof (value as { typename?: unknown }).typename === 'string'
        && Array.isArray((value as { fields?: unknown }).fields);
}

/** The node's child field values, in declaration order. */
function childValues(node: TemplateNode): NodeFieldValue[] {
    return node.fields.map((field) => node[field] as NodeFieldValue);
}

/** The name a `Symbol` node reads, or the name of a filter. */
function symbolName(node: NodeFieldValue): string | undefined {
    return isNode(node) && typeof node.value === 'string' ? node.value : undefined;
}

/** What the walk gathers: the names written unfiltered, and what each template variable was set from. */
interface WalkState {
    readonly sqlFilters: ReadonlySet<string>;
    readonly trustedFunctions: ReadonlySet<string>;
    readonly written: Set<string>;
    readonly aliases: Map<string, Set<string>>;
}

/**
 * The names whose values `expression` can evaluate to, when no SQL filter formats the result.
 * A SQL filter's result is formatted SQL, so nothing under it counts. A comparison is a boolean. An
 * inline if evaluates to one of its branches, never to its condition.
 */
function writtenNames(expression: NodeFieldValue, state: WalkState, into: Set<string>): void {
    if (Array.isArray(expression)) {
        expression.forEach((item) => writtenNames(item, state, into));
        return;
    }
    if (!isNode(expression) || BOOLEAN_RESULT_NODES.has(expression.typename)) {
        return;
    }
    if (expression.typename === 'Symbol') {
        const name = symbolName(expression);
        if (name !== undefined) into.add(name);
        return;
    }
    if (FILTER_NODES.has(expression.typename)) {
        const filter = symbolName(expression.name as NodeFieldValue);
        if (filter === undefined || !state.sqlFilters.has(filter)) {
            writtenNames(expression.args as NodeFieldValue, state, into);
        }
        return;
    }
    if (expression.typename === 'FunCall') {
        // A function the server put in scope writes what the server decides; its arguments are its business.
        const callee = symbolName(expression.name as NodeFieldValue);
        if (callee !== undefined && state.trustedFunctions.has(callee)) {
            return;
        }
    }
    if (expression.typename === 'InlineIf') {
        writtenNames(expression.body as NodeFieldValue, state, into);
        writtenNames(expression.else_ as NodeFieldValue, state, into);
        return;
    }
    childValues(expression).forEach((child) => writtenNames(child, state, into));
}

/** Records that each of `targets` (a `set` or loop variable) takes its value from `source`. */
function recordAliases(targets: NodeFieldValue, source: NodeFieldValue, state: WalkState): void {
    const sources = new Set<string>();
    writtenNames(source, state, sources);
    const names = new Set<string>();
    writtenNames(targets, { ...state, sqlFilters: new Set() }, names);
    for (const name of names) {
        const known = state.aliases.get(name) ?? new Set<string>();
        sources.forEach((s) => known.add(s));
        state.aliases.set(name, known);
    }
}

/** Visits every node: gathers what each `{{ }}` writes, and what `set` and loops bind. */
function walk(value: NodeFieldValue, state: WalkState): void {
    if (Array.isArray(value)) {
        value.forEach((item) => walk(item, state));
        return;
    }
    if (!isNode(value)) {
        return;
    }
    if (value.typename === 'Output') {
        writtenNames(value.children as NodeFieldValue, state, state.written);
    } else if (value.typename === 'Set' && value.value) {
        recordAliases(value.targets as NodeFieldValue, value.value as NodeFieldValue, state);
    } else if (LOOP_NODES.has(value.typename)) {
        recordAliases(value.name as NodeFieldValue, value.arr as NodeFieldValue, state);
    }
    childValues(value).forEach((child) => walk(child, state));
}

/** Adds, for every written template variable, the names it was set from, until nothing is added. */
function resolveAliases(state: WalkState): void {
    const pending = [...state.written];
    while (pending.length > 0) {
        const name = pending.pop() as string;
        for (const source of state.aliases.get(name) ?? []) {
            if (!state.written.has(source)) {
                state.written.add(source);
                pending.push(source);
            }
        }
    }
}

/**
 * The names a template writes into its output without a SQL filter: `n` in `{{ n }}`, in
 * `{{ n | default(5) }}`, in `{{ n | upper }}` and in `{{ a if x else n }}`; the list in
 * `{% for i in list %}{{ i }}{% endfor %}`; the source of a `{% set %}` variable written that way.
 * A name that is only tested (`{% if n %}`) or only written through a SQL filter
 * (`{{ n | sqlString }}`) is not included.
 *
 * The result includes template-local names (loop and `set` variables, `loop`); the caller matches
 * names against the values it holds.
 *
 * @param sql the template text
 * @param sqlFilterNames the filters that format a value as SQL (`sqlString`, `sqlNumber`, …)
 * @param trustedFunctionNames functions the server adds to the render's scope; what `{{ fn(a, b) }}`
 *        writes is the function's result, so `a` and `b` are not counted as written
 * @throws when the template does not parse
 */
export function FindUnfilteredOutputNames(
    sql: string,
    sqlFilterNames: ReadonlySet<string>,
    trustedFunctionNames: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
    const key = `${[...sqlFilterNames].sort().join(',')}\n${[...trustedFunctionNames].sort().join(',')}\n${sql}`;
    const cached = analysisCache.get(key);
    if (cached) {
        return cached;
    }
    const state: WalkState = { sqlFilters: sqlFilterNames, trustedFunctions: trustedFunctionNames, written: new Set(), aliases: new Map() };
    walk(templateParser.parse(sql), state);
    resolveAliases(state);
    if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) {
        analysisCache.clear();
    }
    analysisCache.set(key, state.written);
    return state.written;
}

/**
 * Whether a value may be written into SQL without a SQL filter. Numbers and booleans are; text only
 * when it is a plain decimal number or a sort direction (`ASC`, `DESC`); a list or object when
 * everything in it is. `null` and `undefined` write nothing.
 */
export function IsSafeUnfilteredValue(value: unknown, depth: number = 0): boolean {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'bigint') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (typeof value === 'string') {
        return value === '' || SAFE_UNFILTERED_TEXT.test(value);
    }
    if (value instanceof Date) {
        return !Number.isNaN(value.getTime());
    }
    if (typeof value !== 'object' || depth >= MAX_VALUE_DEPTH) {
        return false;
    }
    const members: unknown[] = Array.isArray(value) ? value : Object.values(value);
    return members.every((member) => IsSafeUnfilteredValue(member, depth + 1));
}
