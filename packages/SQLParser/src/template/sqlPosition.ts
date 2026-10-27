import type { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';

/** Upper-case keywords that start a clause of a statement. */
const CLAUSE_KEYWORDS: ReadonlySet<string> = new Set([
    'SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'JOIN', 'ON', 'APPLY', 'USING', 'WITH', 'UNION', 'EXCEPT',
    'INTERSECT', 'MINUS', 'VALUES', 'SET', 'INTO', 'LIMIT', 'OFFSET', 'FETCH', 'QUALIFY', 'WINDOW', 'RETURNING', 'OPTION',
]);

/** Keywords directly before a table source. */
const TABLE_INTRODUCERS: ReadonlySet<string> = new Set(['FROM', 'JOIN', 'APPLY']);

/** Clauses in which a comma separates table sources. */
const TABLE_LIST_CLAUSES: ReadonlySet<string> = new Set(['FROM', 'JOIN', 'ON', 'APPLY', 'USING']);

/** Tokens a backward scan for SQL skips: whitespace, comments and block tags, which render no SQL text of their own. */
function isSkippable(token: SqlToken): boolean {
    return token.Kind === 'Whitespace' || token.Kind === 'Comment' || token.Kind === 'TemplateComment' || token.Kind === 'TemplateBlock';
}

/** The index of the nearest token before `index` that renders SQL, or -1. */
export function PrecedingSignificantIndex(tokens: SqlTokens, index: number): number {
    let i = index - 1;
    while (i >= 0 && isSkippable(tokens.Tokens[i])) i--;
    return i;
}

/** The upper-case keyword of a word token, or `null`. */
export function KeywordOf(token: SqlToken | undefined): string | null {
    return token !== undefined && token.Kind === 'Word' ? token.Text.toUpperCase() : null;
}

/**
 * The nearest clause keyword before `index` at the same parenthesis depth, or `null` when the
 * scan leaves the enclosing parentheses first.
 */
export function EnclosingClauseKeyword(tokens: SqlTokens, index: number): { Keyword: string; Index: number } | null {
    const depth = tokens.Tokens[index]?.Depth ?? 0;
    for (let i = index - 1; i >= 0; i--) {
        const token = tokens.Tokens[i];
        if (token.Depth < depth) return null;
        if (token.Depth > depth) continue;
        const keyword = KeywordOf(token);
        if (keyword !== null && CLAUSE_KEYWORDS.has(keyword)) return { Keyword: keyword, Index: i };
    }
    return null;
}

/**
 * Whether the token at `index` stands where a table source goes: right after FROM, JOIN or
 * APPLY, or after a comma in a FROM / JOIN list.
 */
export function IsTableSourcePosition(tokens: SqlTokens, index: number): boolean {
    const before = PrecedingSignificantIndex(tokens, index);
    if (before < 0) return false;
    const token = tokens.Tokens[before];
    const keyword = KeywordOf(token);
    if (keyword !== null) return TABLE_INTRODUCERS.has(keyword);
    if (token.Kind !== 'Punctuation' || token.Text !== ',') return false;
    const clause = EnclosingClauseKeyword(tokens, before);
    return clause !== null && TABLE_LIST_CLAUSES.has(clause.Keyword);
}
