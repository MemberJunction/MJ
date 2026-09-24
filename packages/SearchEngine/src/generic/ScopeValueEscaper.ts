/**
 * @fileoverview Per-lane value escapers — §5.4, "the security core".
 *
 * A scope filter is a string template. Every dimension value that reaches it is interpolated into
 * a syntax with its own quoting rules, and until now nothing escaped anything: an author was
 * expected to remember. That is the wrong default in both directions — it puts the obligation on
 * the person least likely to be thinking about injection, and it fails silently when forgotten.
 *
 * So escaping here is **automatic and keyed off the lane**, with an explicit, greppable opt-out.
 * The renderer escapes every interpolated context value for the lane it is rendering into; an
 * author who genuinely needs a raw value writes `contextRaw.…` instead of `context.…`, which shows
 * up in a grep and in review.
 *
 * WHY DEFAULT-ON IS SAFE TO ADD TO AN EXISTING SYSTEM
 *
 * Because §5.4 also prohibits `freetext` in any filter position, a value that reaches a restricting
 * filter is a uuid, enum, int, iso-date or bool. **None of those grammars can contain a character
 * any of these escapers would change.** So for every legitimate value the escaper is a no-op, and
 * existing templates keep rendering byte-for-byte what they rendered before. The escaper only alters
 * output when a value contains a quote, a backslash or a control character — that is, when something
 * has already gone wrong. That is what makes this deployable without touching a single template.
 *
 * WHY THE EXISTING `json` / `jsoninline` FILTERS CANNOT SERVE
 *
 * They escape `"` and `\` — they do not escape `'`, which is the quote character both the SQL and
 * the OData lanes use. A value passed through `jsoninline` is still perfectly capable of closing a
 * single-quoted SQL literal.
 *
 * @module @memberjunction/search-engine
 */

import { EscapeSQLString } from '@memberjunction/global';

/**
 * The filter dialect a lane consumes, which determines how a value must be escaped.
 *
 * `none` is for positions that are NOT filters — `UserSearchString`, query transforms — where the
 * value becomes search text rather than syntax, and escaping would corrupt the query rather than
 * protect it.
 */
export type ScopeLaneKind = 'sql' | 'odata' | 'json' | 'filter_by' | 'esdsl' | 'path' | 'none';

/**
 * Escape a value for a single-quoted **T-SQL** literal.
 *
 * Doubling `'` is the whole of it — SQL Server has no backslash escape, so a backslash is data.
 * Control characters are stripped rather than encoded: they cannot appear in any permitted value
 * grammar, and leaving them in a predicate invites parser-level surprises.
 */
export function EscapeSqlLiteral(value: string): string {
    return EscapeSQLString(value).replace(/[\b\n\r\t\x1a]/g, '');
}

/**
 * Escape a value for a single-quoted **OData** string literal (Azure AI Search `$filter`).
 *
 * OData v4 also escapes `'` by doubling. Azure additionally treats a backslash as an escape inside
 * some function arguments, so it is doubled too — harmless for values that contain none, which is
 * every legitimate value.
 */
export function EscapeODataLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[\0\b\n\r\t\x1a]/g, '');
}

/**
 * Escape a value for placement inside a double-quoted **JSON** string.
 *
 * Deliberately escapes only what JSON requires, without adding the surrounding quotes: templates
 * write `"{{ context.X }}"` and supply their own. Returning a quoted string here would produce
 * `""value""` in every existing template.
 */
export function EscapeJsonValue(value: string): string {
    // JSON.stringify handles quotes, backslashes, control chars and unicode correctly; strip the
    // quotes it adds so the result drops into an author-supplied pair.
    const quoted = JSON.stringify(value);
    return quoted.slice(1, -1);
}

/**
 * Escape a value for a **Typesense `filter_by`** clause.
 *
 * Neutralises the value delimiter (backtick — Typesense has no documented escape for it, so it is
 * removed) and the boolean operator sequences `&&` / `||`. Everything else is left alone.
 *
 * An earlier version also stripped the character class `[&|:[]()]`, which **corrupted legitimate
 * values**: an `iso-date` dimension carrying a time (`2026-07-28T10:30:00Z`) came back as
 * `2026-07-28T103000Z`, so the filter silently matched nothing. Found by probing the "no-op on
 * legitimate values" claim rather than by review. The contract here mirrors the SQL escaper's:
 * neutralise the delimiter and assume the template quoted the value, exactly as a SQL template must
 * supply its own single quotes.
 */
export function EscapeFilterByLiteral(value: string): string {
    return value.replace(/`/g, '').replace(/&&/g, '').replace(/\|\|/g, '').replace(/[\0\b\n\r\t\x1a]/g, '');
}

/**
 * Escape a value for a **storage path segment** (`FolderPath`).
 *
 * Path traversal is the risk, not quoting: `..` and both separators are removed so a dimension can
 * never climb out of the folder its scope confined it to. This is the one escaper that is NOT a
 * no-op on an otherwise-valid value — a legitimate value simply must not contain a separator.
 */
export function EscapePathSegment(value: string): string {
    return value.replace(/\.\./g, '').replace(/[/\\]/g, '').replace(/[\0\b\n\r\t\x1a]/g, '');
}

/** Escaper for each lane kind. `none`/`esdsl` pass through — see below. */
const ESCAPERS: Record<ScopeLaneKind, (v: string) => string> = {
    sql: EscapeSqlLiteral,
    odata: EscapeODataLiteral,
    json: EscapeJsonValue,
    filter_by: EscapeFilterByLiteral,
    path: EscapePathSegment,
    // Elasticsearch/OpenSearch DSL is JSON, so JSON escaping is the correct rule for it.
    esdsl: EscapeJsonValue,
    // Not a filter position: the value becomes query text, and escaping would corrupt the search.
    none: (v) => v,
};

/**
 * Escape one value for a lane. Non-strings are returned untouched — numbers and booleans have no
 * syntax to break, and re-typing them to strings here would change how templates render them.
 */
export function EscapeScopeValue(value: unknown, kind: ScopeLaneKind): unknown {
    if (typeof value !== 'string') return value;
    return ESCAPERS[kind](value);
}

/**
 * Recursively escape every string inside a context value for a lane.
 *
 * Arrays are mapped element-wise, which is what makes `{{ ids | join("','") }}` safe: each member
 * is escaped before the join, so a member cannot terminate the literal and inject a clause.
 */
export function EscapeScopeValueDeep(value: unknown, kind: ScopeLaneKind): unknown {
    if (Array.isArray(value)) return value.map((v) => EscapeScopeValueDeep(v, kind));
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) out[k] = EscapeScopeValueDeep(v, kind);
        return out;
    }
    return EscapeScopeValue(value, kind);
}

/**
 * Map a lane's existing `IndexType` to the dialect its filter is written in.
 *
 * §5.5 proposed a new `MetadataFilterKind` column for this. It turned out to be unnecessary:
 * `IndexType` already carries the information — every provider dispatches on it to decide whether a
 * lane is even theirs — so a second column would be a redundant field to keep in sync, wrong on
 * every pre-existing row until backfilled, and a new thing for authors to get wrong. Deriving is
 * strictly better. If a deployment ever needs to override the derivation, THEN add the column as an
 * override rather than as the source of truth.
 *
 * `Other` maps to `json` rather than to `none`: an unknown external index is the case we know least
 * about, so it gets escaping rather than a pass. Choosing `none` there would mean the least-understood
 * lane is the only unprotected one.
 */
export function LaneKindForIndexType(indexType: string | null | undefined): ScopeLaneKind {
    switch (indexType) {
        case 'AzureAISearch': return 'odata';
        case 'Typesense': return 'filter_by';
        case 'Elasticsearch':
        case 'OpenSearch': return 'esdsl';
        case 'Vector': return 'json';
        default: return 'json';
    }
}
