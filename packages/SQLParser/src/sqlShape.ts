import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { IsKeyword, LexSQL, SignificantTokens } from './sqlLexer.js';
import type { LexDialect, SQLLexToken } from './sqlLexer.js';

/** One common table expression from a leading `WITH` clause, as written. */
export interface LeadingCTEDefinition {
    /** The CTE name exactly as written, including any quoting (`[My CTE]`, `"x"`, `x`). */
    Name: string;
    /** The whole definition as written: name, optional column list, `AS`, and the parenthesized body. */
    Text: string;
    /** The body between the outer parentheses. */
    Body: string;
}

/** A statement's leading `WITH` clause, split by positions in the original text. */
export interface LeadingCTEs {
    /** Whether the clause is `WITH RECURSIVE`. */
    Recursive: boolean;
    /** The CTE definitions, in order. */
    Definitions: LeadingCTEDefinition[];
    /** Everything after the last definition: the statement the CTEs feed. */
    Main: string;
    /** Offset in the original SQL where {@link Main} starts. */
    MainStart: number;
}

/**
 * Splits a statement's leading `WITH` clause into its CTE definitions and the main statement,
 * using positions in the original text, so every part is returned exactly as written. Leading
 * comments are skipped. Returns `null` when the statement does not start with `WITH`, or when the
 * clause cannot be read (an unbalanced parenthesis, a missing `AS`).
 * @deprecated Use `SqlDocument.Parse(sql, dialect).CTEs()` or the `HoistCTEs` transform.
 */
export function SplitLeadingCTEs(sql: string, dialect: LexDialect): LeadingCTEs | null {
    const tokens = WithoutLeadingSemicolons(SignificantTokens(LexSQL(sql, dialect)));
    if (!IsKeyword(tokens[0], 'WITH')) return null;
    let i = 1;
    const recursive = IsKeyword(tokens[i], 'RECURSIVE');
    if (recursive) i++;
    const definitions: LeadingCTEDefinition[] = [];
    for (;;) {
        const definition = readDefinition(sql, tokens, i);
        if (!definition) return null;
        definitions.push(definition.Definition);
        i = definition.Next;
        if (tokens[i]?.Kind !== 'comma') break;
        i++;
    }
    const mainStart = tokens[i]?.Start ?? sql.length;
    return { Recursive: recursive, Definitions: definitions, Main: sql.substring(mainStart), MainStart: mainStart };
}

/** Reads `name [(columns)] AS [[NOT] MATERIALIZED] (body)` starting at significant token `i`. */
function readDefinition(sql: string, tokens: SQLLexToken[], i: number): { Definition: LeadingCTEDefinition; Next: number } | null {
    const name = tokens[i];
    if (!name || (name.Kind !== 'word' && name.Kind !== 'identifier')) return null;
    let j = i + 1;
    if (tokens[j]?.Kind === 'open') j = matchingClose(tokens, j) + 1;
    if (!IsKeyword(tokens[j], 'AS')) return null;
    j++;
    if (IsKeyword(tokens[j], 'NOT')) j++;
    if (IsKeyword(tokens[j], 'MATERIALIZED')) j++;
    if (tokens[j]?.Kind !== 'open') return null;
    const close = matchingClose(tokens, j);
    if (close >= tokens.length) return null;
    return {
        Definition: {
            Name: name.Text,
            Text: sql.substring(name.Start, tokens[close].End),
            Body: sql.substring(tokens[j].End, tokens[close].Start)
        },
        Next: close + 1
    };
}

/** Drops semicolons before the first statement token; `;WITH` is one statement, not two. */
export function WithoutLeadingSemicolons(tokens: SQLLexToken[]): SQLLexToken[] {
    const first = tokens.findIndex(t => t.Kind !== 'semicolon');
    return first <= 0 ? (first === -1 ? [] : tokens) : tokens.slice(first);
}

/** Index of the `close` token matching the `open` at `openIndex`, or `tokens.length` if none. */
function matchingClose(tokens: SQLLexToken[], openIndex: number): number {
    const depth = tokens[openIndex].Depth;
    for (let k = openIndex + 1; k < tokens.length; k++) {
        if (tokens[k].Kind === 'close' && tokens[k].Depth === depth) return k;
    }
    return tokens.length;
}

/** Result of {@link IsReadOnlyQuery}. */
export interface ReadOnlyQueryCheck {
    IsReadOnly: boolean;
    /** Why the statement was refused; `null` when it is a read query. */
    Reason: string | null;
}

/**
 * Whether `sql` is a single read query: one statement, starting with `SELECT` or `WITH` (after
 * comments and opening parentheses), whose CTE bodies and main statement are all reads, and
 * which does not write its result into a table (`SELECT … INTO`). Works from tokens, so it gives
 * the same answer for SQL the AST parser cannot read.
 *
 * This is a statement-kind check, not a sandbox. A read query can still call functions with side
 * effects (`set_config`, `pg_sleep`); running caller-supplied SQL read-only and under a statement
 * timeout is what contains those.
 * This check reads tokens only, so a construct the structural parser cannot read never makes a read query
 * fail it. `SqlDocument.Parse(sql, dialect).IsReadOnly()` is stricter (it also refuses anything it cannot
 * read), and `StrictFragmentValidator.ValidateReadOnlyStatement` is the choice for caller-supplied SQL.
 */
export function IsReadOnlyQuery(sql: string, dialect: SQLParserDialect): ReadOnlyQueryCheck {
    const { Statement: statement, Stacked: stacked } = firstStatement(WithoutLeadingSemicolons(SignificantTokens(LexSQL(sql, dialect))));
    if (stacked) return refuse(STACKED_REASON);
    if (statement.length === 0) return refuse('it is empty');
    const lead = firstWord(statement);
    if (IsKeyword(lead, 'WITH')) return checkWithStatement(sql, dialect);
    if (!IsKeyword(lead, 'SELECT')) return refuse(`it starts with ${lead ? lead.Text.toUpperCase() : 'no keyword'}, not SELECT or WITH`);
    return checkSelect(statement, dialect);
}

function refuse(reason: string): ReadOnlyQueryCheck {
    return { IsReadOnly: false, Reason: reason };
}

const ACCEPT: ReadOnlyQueryCheck = { IsReadOnly: true, Reason: null };

/**
 * The {@link ReadOnlyQueryCheck.Reason} of SQL whose WITH clause the dialect's lexer cannot split
 * into CTEs: it is refused because it cannot be read, not because a write was found in it.
 */
export const UNREADABLE_WITH_CLAUSE_REASON = 'its WITH clause could not be read';

/** The tokens before the first semicolon, and whether anything but semicolons follows it. */
function firstStatement(tokens: SQLLexToken[]): { Statement: SQLLexToken[]; Stacked: boolean } {
    const semicolon = tokens.findIndex(t => t.Kind === 'semicolon');
    if (semicolon === -1) return { Statement: tokens, Stacked: false };
    return {
        Statement: tokens.slice(0, semicolon),
        Stacked: !tokens.slice(semicolon).every(t => t.Kind === 'semicolon')
    };
}

/** The first word, skipping opening parentheses. */
function firstWord(tokens: SQLLexToken[]): SQLLexToken | undefined {
    return tokens.find(t => t.Kind !== 'open');
}

function checkWithStatement(sql: string, dialect: SQLParserDialect): ReadOnlyQueryCheck {
    const ctes = SplitLeadingCTEs(sql, dialect);
    if (!ctes) return refuse(UNREADABLE_WITH_CLAUSE_REASON);
    for (const definition of ctes.Definitions) {
        const body = SignificantTokens(LexSQL(definition.Body, dialect));
        const lead = firstWord(body);
        if (!IsKeyword(lead, 'SELECT') && !IsKeyword(lead, 'WITH') && !IsKeyword(lead, 'VALUES')) {
            return refuse(`its CTE ${definition.Name} is a ${lead ? lead.Text.toUpperCase() : 'empty'} statement, not a read`);
        }
        const bodyCheck = checkSelect(body, dialect);
        if (!bodyCheck.IsReadOnly) {
            return refuse(`its CTE ${definition.Name} ${bodyCheck.Reason === SELECT_INTO_REASON ? 'writes its result into a table (SELECT … INTO)' : 'holds more than one statement'}`);
        }
    }
    const main = SignificantTokens(LexSQL(ctes.Main, dialect)).filter(t => t.Kind !== 'semicolon');
    if (!IsKeyword(firstWord(main), 'SELECT')) {
        const lead = firstWord(main);
        return refuse(`the statement after its WITH clause starts with ${lead ? lead.Text.toUpperCase() : 'nothing'}, not SELECT`);
    }
    return checkSelect(main, dialect);
}

const SELECT_INTO_REASON = 'it writes its result into a table (SELECT … INTO)';
const STACKED_REASON = 'it contains more than one statement';

/**
 * A SELECT is a read unless it writes its rows into a table with a top-level `INTO`, or, on a
 * dialect that needs no separator between statements, a statement keyword at its top level starts
 * a second statement ({@link SQLParserDialect.UnseparatedStatementKeywords}).
 */
function checkSelect(statement: SQLLexToken[], dialect: SQLParserDialect): ReadOnlyQueryCheck {
    const outerDepth = statement.reduce((lowest, t) => Math.min(lowest, t.Depth), Number.POSITIVE_INFINITY);
    if (startsAnotherStatement(statement, outerDepth, dialect)) return refuse(STACKED_REASON);
    const into = statement.find(t => t.Depth === outerDepth && IsKeyword(t, 'INTO'));
    return into ? refuse(SELECT_INTO_REASON) : ACCEPT;
}

/**
 * Whether a bare statement keyword stands at the statement's top level after its first word. A
 * keyword directly followed by `JOIN` is a join hint (`INNER MERGE JOIN`), and a word inside an
 * unrendered template tag (`{% if x %}`) is the template's, not SQL.
 */
function startsAnotherStatement(statement: SQLLexToken[], outerDepth: number, dialect: SQLParserDialect): boolean {
    const keywords = dialect.UnseparatedStatementKeywords ?? [];
    if (keywords.length === 0) return false;
    const starters = new Set(keywords);
    const lead = statement.findIndex(t => t.Kind !== 'open');
    const inTags = templateTagTokens(statement);
    return statement.some((t, i) => i > lead && t.Kind === 'word' && t.Depth === outerDepth && !inTags.has(i)
        && starters.has(t.Text.toUpperCase()) && !IsKeyword(statement[i + 1], 'JOIN'));
}

/** Template tag openers (`{%`, `{{`, `{#`) and the closer each needs (`%}`, `}}`, `#}`). */
const TEMPLATE_TAG_CLOSERS: Readonly<Record<string, string>> = { '%': '%', '{': '}', '#': '#' };

/** The indexes of the tokens inside template tags: a `{` directly followed by `%`, `{` or `#`, up to its closer. */
function templateTagTokens(tokens: SQLLexToken[]): Set<number> {
    const inside = new Set<number>();
    let closer: string | null = null;
    for (let i = 0; i < tokens.length; i++) {
        const next = tokens[i + 1];
        const adjacent = next !== undefined && next.Start === tokens[i].End;
        if (closer === null && tokens[i].Text === '{' && adjacent && next.Text in TEMPLATE_TAG_CLOSERS) {
            closer = TEMPLATE_TAG_CLOSERS[next.Text];
        } else if (closer !== null && tokens[i].Text === closer && adjacent && next.Text === '}') {
            closer = null;
        }
        if (closer !== null) inside.add(i);
    }
    return inside;
}
