import type { SQLParserDialect } from '@memberjunction/sql-dialect';
import { LexSQL, SignificantTokens } from './sqlLexer.js';
import type { SQLLexToken } from './sqlLexer.js';

/**
 * The functions `sql` calls that the dialect forbids in caller-supplied SQL
 * ({@link SQLParserDialect.CallerSQLForbiddenFunctions}), lower case, each once, in the order they
 * first appear. A call is a name, bare, quoted or schema-qualified, directly followed by `(`. A name
 * inside a string literal or a comment is not a call.
 */
export function FindForbiddenFunctionCalls(sql: string, dialect: SQLParserDialect): string[] {
    const patterns = dialect.CallerSQLForbiddenFunctions;
    if (patterns.length === 0) return [];
    const tokens = SignificantTokens(LexSQL(sql, dialect));
    const found: string[] = [];
    tokens.forEach((token, i) => {
        if (!isCallName(token, tokens[i + 1])) return;
        const name = unquote(token.Text).toLowerCase();
        if (patterns.some(pattern => matches(name, pattern)) && !found.includes(name)) found.push(name);
    });
    return found;
}

function isCallName(token: SQLLexToken, next: SQLLexToken | undefined): boolean {
    return (token.Kind === 'word' || token.Kind === 'identifier') && next?.Kind === 'open';
}

/** A name without its identifier quotes (`[x]`, `"x"`, `` `x` ``), with doubled quotes undone. */
function unquote(text: string): string {
    const open = text[0];
    const close = open === '[' ? ']' : open;
    if ((open === '[' || open === '"' || open === '`') && text.endsWith(close) && text.length >= 2) {
        return text.slice(1, -1).split(close + close).join(close);
    }
    return text;
}

/** Whether `name` matches `pattern`: equal, or starting with it when it ends in `*`. */
function matches(name: string, pattern: string): boolean {
    return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}
