import type { SQLCTEExtraction } from '../sql-parser.js';

/**
 * Strips leading whitespace and SQL comments (`/* … *\/` and `-- …`) from a string, returning the
 * rest from the first character that is neither.
 */
export function SkipLeadingCommentsAndWhitespace(sql: string): string {
    let i = 0;
    const len = sql.length;
    while (i < len) {
        const ch = sql[i];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
        if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
            i += 2;
            while (i < len - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
            if (i < len - 1) i += 2; else i = len;
            continue;
        }
        if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
            i += 2;
            while (i < len && sql[i] !== '\n') i++;
            continue;
        }
        break;
    }
    return sql.substring(i);
}

/**
 * Splits a leading `WITH` clause by scanning parentheses, for text no parser can read (such as an
 * unbalanced template). Each definition is written `name AS (\n<body>\n)` with the body as it
 * appears in the input; `UsedASTParsing` is false.
 */
export function ExtractCTEsByParenScan(sql: string): SQLCTEExtraction {
    const withStripped = sql.trimStart().replace(/^WITH\s+/i, '');
    const cteDefinitions: string[] = [];
    let pos = 0;
    const len = withStripped.length;

    while (pos < len) {
        pos = skipWhitespace(withStripped, pos);
        if (pos >= len) break;

        const remaining = withStripped.substring(pos);
        const cteHeaderMatch = remaining.match(/^(\[[^\]]+\]|"[^"]+"|[A-Za-z_]\w*)\s+AS\s*\(/i);
        if (!cteHeaderMatch) break;

        const cteName = cteHeaderMatch[1];
        pos += cteHeaderMatch[0].length;

        const bodyStart = pos;
        pos = findMatchingCloseParen(withStripped, pos);
        const cteBody = withStripped.substring(bodyStart, pos);
        cteDefinitions.push(`${cteName} AS (\n${cteBody}\n)`);
        pos++;

        pos = skipWhitespace(withStripped, pos);
        if (pos < len && withStripped[pos] === ',') pos++;
    }

    const mainStatement = withStripped.substring(pos).trim();
    return { CTEDefinitions: cteDefinitions, MainStatement: mainStatement, UsedASTParsing: false };
}

function skipWhitespace(sql: string, pos: number): number {
    while (pos < sql.length && /\s/.test(sql[pos])) pos++;
    return pos;
}

/** The index of the `)` closing the parenthesis opened just before `pos`, skipping strings and comments. */
function findMatchingCloseParen(sql: string, pos: number): number {
    let depth = 1;
    const len = sql.length;

    while (pos < len && depth > 0) {
        const ch = sql[pos];
        if (ch === "'") {
            pos = skipString(sql, pos);
        } else if (ch === '-' && pos + 1 < len && sql[pos + 1] === '-') {
            pos += 2;
            while (pos < len && sql[pos] !== '\n') pos++;
        } else if (ch === '/' && pos + 1 < len && sql[pos + 1] === '*') {
            pos += 2;
            while (pos < len && !(sql[pos] === '*' && pos + 1 < len && sql[pos + 1] === '/')) pos++;
            if (pos < len) pos++;
        } else if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) return pos;
        }
        pos++;
    }

    return pos;
}

/** From an opening `'` at `pos`, the index of the quote that closes it (a doubled `''` is an escaped quote). */
function skipString(sql: string, pos: number): number {
    const len = sql.length;
    pos++;
    while (pos < len) {
        if (sql[pos] === "'") {
            if (pos + 1 < len && sql[pos + 1] === "'") { pos += 2; continue; }
            break;
        }
        pos++;
    }
    return pos;
}
