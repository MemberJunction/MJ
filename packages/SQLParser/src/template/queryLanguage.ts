/**
 * The fixed vocabulary of the MJ Query language v1: its value types, SQL filters, `Context`
 * tokens and loop members. `guides/MJ_QUERY_LANGUAGE.md` is the specification; this module is
 * its reference data.
 */

/** The MJ type of a query parameter. `unknown` when nothing in the template says. */
export type TemplateParameterType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'unknown';

/** One MJ SQL filter and the parameter type it formats. */
export interface MJQuerySqlFilter {
    readonly Name: string;
    readonly ValueType: Exclude<TemplateParameterType, 'unknown'>;
}

/**
 * The MJ SQL filters. Each one turns a value into safe SQL text for one parameter type. The
 * template also accepts `default`, which supplies a value and formats nothing.
 */
export const MJ_QUERY_SQL_FILTERS: readonly MJQuerySqlFilter[] = Object.freeze([
    { Name: 'sqlString', ValueType: 'string' },
    { Name: 'sqlNumber', ValueType: 'number' },
    { Name: 'sqlDate', ValueType: 'date' },
    { Name: 'sqlBoolean', ValueType: 'boolean' },
    { Name: 'sqlIn', ValueType: 'array' },
    { Name: 'sqlIdentifier', ValueType: 'string' },
    { Name: 'sqlLikeContains', ValueType: 'string' },
    { Name: 'sqlLikeBegins', ValueType: 'string' },
    { Name: 'sqlLikeEnds', ValueType: 'string' },
    { Name: 'sqlNoKeywordsExpression', ValueType: 'string' },
]);

/** The filter that supplies a value when the parameter has none. */
export const DEFAULT_FILTER_NAME = 'default';

/**
 * The `Context` tokens: values the server fills from the context user and the clock, never
 * the caller. The list is closed; it matches `CONTEXT_TOKENS` in `@memberjunction/core`.
 */
export const MJ_QUERY_CONTEXT_TOKENS: readonly string[] = Object.freeze([
    'Context.UserID',
    'Context.UserEmail',
    'Context.UserName',
    'Context.Now',
    'Context.Today',
    'Context.StartOfWeek',
    'Context.StartOfMonth',
    'Context.StartOfQuarter',
    'Context.StartOfYear',
]);

/** The SQL filters a `Context` token's value may go through. User tokens are strings; the rest are dates. */
export function ContextTokenFilters(fullName: string): readonly string[] {
    const userTokens = ['Context.UserID', 'Context.UserEmail', 'Context.UserName'];
    return userTokens.includes(fullName) ? ['sqlString'] : ['sqlDate', 'sqlString'];
}

/** The members of `loop` inside a `{% for %}` body. */
export const MJ_QUERY_LOOP_MEMBERS: readonly string[] = Object.freeze([
    'index', 'index0', 'revindex', 'revindex0', 'first', 'last', 'length',
]);

/** The block tags of the language. Every other tag is refused. */
export const MJ_QUERY_BLOCK_TAGS: readonly string[] = Object.freeze([
    'if', 'elif', 'elseif', 'else', 'endif', 'for', 'endfor', 'set',
]);

/** The SQL filter with this name, or `undefined`. */
export function FindSqlFilter(name: string): MJQuerySqlFilter | undefined {
    return MJ_QUERY_SQL_FILTERS.find(f => f.Name === name);
}
