/**
 * The reserved `Context` object in a saved query's template.
 *
 * A query template can read `{{ Context.UserID }}`, `{{ Context.Today }}` and the other
 * {@link CONTEXT_TOKENS} by their short names. The server fills the object from the context user,
 * the clock and the run's time zone; no caller value can set it. A value is worked out only when
 * the template reads it, so a template that never reads `Context` renders exactly as before.
 */

import { UUIDSet } from '@memberjunction/global';
import { CONTEXT_TOKENS, ContextToken, PropertyResolutionContext, ResolveContextToken } from './contextTokens';

/** The name of the reserved object in a query template, and the parameter name it reserves. */
export const QUERY_CONTEXT_NAME = 'Context';

/** The `Context` object for one render, and what the render read from it. */
export interface QueryTemplateContext {
    /** Goes into the render context as `Context`. Each member is worked out when first read. */
    Context: Readonly<Record<string, string>>;
    /** The members read so far, with their values. A cached result depends on exactly these. */
    ReadValues(): Record<string, string>;
}

/**
 * Builds the `Context` object a query template renders with. The clock is read once, so every
 * date member of one render agrees. A member that cannot be worked out (no context user, a user
 * with no email, an invalid time zone) throws the resolver's error when the template reads it, and
 * only then: a template that never reads `Context` is unaffected.
 */
export function BuildQueryTemplateContext(ctx: PropertyResolutionContext): QueryTemplateContext {
    const pinned: PropertyResolutionContext = { ...ctx, Now: ctx.Now ?? new Date() };
    const read: Record<string, string> = {};
    const context: Record<string, string> = {};
    for (const token of CONTEXT_TOKENS) {
        const member = memberName(token);
        Object.defineProperty(context, member, {
            enumerable: true,
            get: (): string => {
                if (!(member in read)) {
                    read[member] = ResolveContextToken(token, undefined, pinned);
                }
                return read[member];
            },
        });
    }
    return { Context: Object.freeze(context), ReadValues: () => ({ ...read }) };
}

/** Template tags: `{{ … }}` output and `{% … %}` statements. Comments (`{# … #}`) never read a value. */
const TEMPLATE_TAG = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
const CONTEXT_WORD = /\bContext\b/g;
const CONTEXT_MEMBER = /\bContext\s*\.\s*([A-Za-z_]\w*)/g;

/**
 * The context tokens a query template may read: each `Context.<Name>` named in a template tag,
 * or every token when a tag reads `Context` some other way (`Context['UserID']`,
 * `{% set c = Context %}`). Text outside template tags is SQL and never counts.
 * @returns the tokens, in {@link CONTEXT_TOKENS} order; empty when no tag mentions `Context`
 */
export function FindTemplateContextTokens(sql: string | null | undefined): ContextToken[] {
    const named = new Set<string>();
    let mentions = 0;
    let namedMentions = 0;
    for (const tag of (sql ?? '').match(TEMPLATE_TAG) ?? []) {
        mentions += (tag.match(CONTEXT_WORD) ?? []).length;
        for (const match of tag.matchAll(CONTEXT_MEMBER)) {
            named.add(match[1]);
            namedMentions++;
        }
    }
    if (namedMentions < mentions) {
        return [...CONTEXT_TOKENS];
    }
    return CONTEXT_TOKENS.filter(token => named.has(memberName(token)));
}

/**
 * The context tokens a saved query may read, with every query it composes: a composed query's
 * SQL is rendered with the outer query's `Context`.
 * @param queryID the query to start from
 * @param sqlTextsOf a query's SQL texts — its base SQL and each dialect variant — by query ID
 * @param composedIDsOf the IDs of the queries a query composes (its `MJ: Query Dependencies`)
 */
export function FindQueryContextTokens(
    queryID: string,
    sqlTextsOf: (id: string) => ReadonlyArray<string | null | undefined>,
    composedIDsOf: (id: string) => ReadonlyArray<string>
): ContextToken[] {
    const found = new Set<ContextToken>();
    const visited = new UUIDSet();
    const pending = [queryID];
    while (pending.length > 0) {
        const id = pending.pop()!;
        if (visited.Has(id)) {
            continue;
        }
        visited.Add(id);
        for (const sql of sqlTextsOf(id)) {
            FindTemplateContextTokens(sql).forEach(t => found.add(t));
        }
        pending.push(...composedIDsOf(id));
    }
    return CONTEXT_TOKENS.filter(t => found.has(t));
}

/**
 * What a cached query result depends on through `Context`: each token the query reads, worked out
 * now, by member name. A token that cannot be worked out is recorded as null (the run itself then
 * fails, so nothing is cached under it).
 * @returns null when the query reads `Context.Now`: a result that depends on the instant it ran is
 *   never reused
 */
export function QueryContextCacheValues(tokens: ReadonlyArray<ContextToken>, ctx: PropertyResolutionContext): Record<string, string | null> | null {
    if (tokens.includes('Context.Now')) {
        return null;
    }
    const values: Record<string, string | null> = {};
    for (const token of tokens) {
        try {
            values[memberName(token)] = ResolveContextToken(token, undefined, ctx);
        } catch {
            values[memberName(token)] = null;
        }
    }
    return values;
}

/** `Context.UserID` → `UserID`. */
function memberName(token: ContextToken): string {
    return token.slice(QUERY_CONTEXT_NAME.length + 1);
}
