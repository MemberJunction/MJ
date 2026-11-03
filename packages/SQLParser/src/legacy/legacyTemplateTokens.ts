import { SQLServerDialect } from '@memberjunction/sql-dialect';
import type { ParserDialect } from '@memberjunction/sql-dialect';
import { SqlTokens } from '../lexer/sqlTokens.js';
import type { SqlToken } from '../lexer/sqlTokenTypes.js';
import type { MJSQLTextContent, MJToken } from '../mj-ast-types.js';
import { ParseLegacyBlockTag, ParseLegacyCommentTag, ParseLegacyExpressionTag } from './legacyTagContent.js';

/** The SQL rules the dialect-less template helpers read comments and literals with. */
const TEMPLATE_HELPER_DIALECT: ParserDialect = new SQLServerDialect();

/** The closer of each template opener. */
const CLOSERS: Readonly<Record<string, string>> = { '{': '}}', '%': '%}', '#': '#}' };

function sqlText(text: string, start: number, end: number, tokens: MJToken[]): void {
    if (start >= end) return;
    const raw = text.substring(start, end);
    const parsed: MJSQLTextContent = { kind: 'sql_text', text: raw };
    tokens.push({ type: 'SQL_TEXT', start, end, raw, parsed });
}

function tagToken(opener: string, content: string, raw: string, start: number, end: number): MJToken {
    if (opener === '{') return ParseLegacyExpressionTag(content, raw, start, end);
    if (opener === '%') return ParseLegacyBlockTag(content, raw, start, end);
    return ParseLegacyCommentTag(content, raw, start, end);
}

/**
 * The MJ template tokens of a text, found the way the original MJ lexer found them (each opener
 * runs to the first closer after it, anywhere in the text, comments and literals included), with
 * the same token shapes, in linear time. Once an opener finds no closer, later openers of that
 * form are not searched for again: none of them can find one either.
 */
export function LinearLegacyTokenize(text: string): MJToken[] {
    if (!text) return [];
    const tokens: MJToken[] = [];
    const exhausted = new Set<string>();
    let pos = 0;
    let sqlStart = 0;
    while (pos < text.length) {
        const opener = text[pos] === '{' ? text[pos + 1] : undefined;
        const closer = opener === undefined ? undefined : CLOSERS[opener];
        const closeAt = closer === undefined || exhausted.has(closer) ? -1 : text.indexOf(closer, pos + 2);
        if (closer !== undefined && closeAt < 0) exhausted.add(closer);
        if (opener === undefined || closer === undefined || closeAt < 0) {
            pos++;
            continue;
        }
        sqlText(text, sqlStart, pos, tokens);
        const end = closeAt + 2;
        tokens.push(tagToken(opener, text.substring(pos + 2, closeAt), text.substring(pos, end), pos, end));
        pos = end;
        sqlStart = pos;
    }
    sqlText(text, sqlStart, text.length, tokens);
    return tokens;
}

/**
 * The MJ template tokens of a text in the legacy token shapes, found by the MJ Query lexer:
 * a tag inside a SQL comment is inert and stays part of the SQL text, a template string inside a
 * tag can hold a closer, and the whitespace-control dashes of `{{-` / `-}}` are not part of the
 * content. Runs of SQL between tags become `SQL_TEXT` tokens, as before.
 */
export function CommentInertLegacyTokens(text: string): MJToken[] {
    if (!text) return [];
    const tokens: MJToken[] = [];
    let sqlStart = 0;
    for (const token of SqlTokens.Lex(text, TEMPLATE_HELPER_DIALECT).Tokens) {
        if (token.Template === null) continue;
        sqlText(text, sqlStart, token.Span.Start, tokens);
        tokens.push(legacyTag(token));
        sqlStart = token.Span.End;
    }
    sqlText(text, sqlStart, text.length, tokens);
    return tokens;
}

function legacyTag(token: SqlToken): MJToken {
    const info = token.Template;
    const opener = info === null ? '{' : info.Form === 'Expression' ? '{' : info.Form === 'Block' ? '%' : '#';
    return tagToken(opener, info?.Body ?? '', token.Text, token.Span.Start, token.Span.End);
}
