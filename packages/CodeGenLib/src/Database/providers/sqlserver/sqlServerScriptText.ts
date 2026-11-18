/**
 * Text helpers for T-SQL scripts: batch splitting, naming the object a batch acts on (for failure
 * reports), and normalizing a stored procedure definition so a freshly generated body can be compared
 * with the live `OBJECT_DEFINITION` (#3343, #5636).
 */

/** Splits a script on `GO` separator lines and drops empty batches. */
export function SplitSQLServerBatches(sql: string): string[] {
    return sql
        .split(/^\s*GO\s*$/gim)
        .map(b => b.trim())
        .filter(b => b.length > 0);
}

/**
 * Removes `--` line comments and `/* *\/` block comments, leaving string literals and bracketed
 * identifiers untouched (a `--` inside `'...'` or `[...]` is not a comment).
 */
export function StripSQLServerComments(sql: string): string {
    let out = '';
    let i = 0;
    while (i < sql.length) {
        const ch = sql[i];
        const next = sql[i + 1];
        if (ch === "'") {
            const end = findLiteralEnd(sql, i, "'");
            out += sql.substring(i, end);
            i = end;
        } else if (ch === '[') {
            const end = findLiteralEnd(sql, i, ']');
            out += sql.substring(i, end);
            i = end;
        } else if (ch === '-' && next === '-') {
            const lineEnd = sql.indexOf('\n', i);
            i = lineEnd === -1 ? sql.length : lineEnd;
        } else if (ch === '/' && next === '*') {
            const blockEnd = sql.indexOf('*/', i + 2);
            i = blockEnd === -1 ? sql.length : blockEnd + 2;
            out += ' ';
        } else {
            out += ch;
            i++;
        }
    }
    return out;
}

/** Returns the index just past the literal that opens at `start`; a doubled closer is an escape. */
function findLiteralEnd(sql: string, start: number, closer: string): number {
    let i = start + 1;
    while (i < sql.length) {
        if (sql[i] === closer) {
            if (sql[i + 1] === closer) {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i++;
    }
    return sql.length;
}

const CREATE_PROCEDURE = /\bCREATE\s+(?:OR\s+ALTER\s+)?PROC(?:EDURE)?\b/i;

/**
 * Reduces a stored procedure definition to a canonical form for comparison, or returns `null` when
 * the text holds no `CREATE PROCEDURE`.
 *
 * Accepts either a generated script (header comments, a `DROP PROCEDURE` batch, the `CREATE`
 * batch, permission batches) or a live `OBJECT_DEFINITION`. Only the `CREATE PROCEDURE` batch is
 * kept; comments are removed, everything before `CREATE` is dropped, `CREATE OR ALTER PROC` and
 * `CREATE PROC` are spelled `CREATE PROCEDURE`, whitespace runs collapse to one space and a
 * trailing `;` is dropped. Case is preserved: the same generator produced both sides when nothing
 * drifted, so a case difference is a real difference.
 */
export function NormalizeSQLServerRoutineDefinition(sql: string): string | null {
    if (!sql) {
        return null;
    }
    for (const batch of SplitSQLServerBatches(sql)) {
        const stripped = StripSQLServerComments(batch);
        const match = CREATE_PROCEDURE.exec(stripped);
        if (!match || match.index === undefined) {
            continue;
        }
        const body = stripped.substring(match.index + match[0].length);
        return `CREATE PROCEDURE ${body}`.replace(/\s+/g, ' ').trim().replace(/;+$/, '').trim();
    }
    return null;
}

const OBJECT_DDL = /\b(CREATE(?:\s+OR\s+ALTER)?|ALTER|DROP)\s+(PROCEDURE|PROC|VIEW|FUNCTION|TRIGGER|TABLE|INDEX)\s+(?:IF\s+EXISTS\s+)?([[\]\w.$#@]+)/i;
const GRANT_ON = /\b(GRANT|DENY|REVOKE)\b[\s\S]*?\bON\s+(?:OBJECT::)?([[\]\w.$#@]+)/i;
const EXEC_PROC = /\bEXEC(?:UTE)?\s+([[\]\w.$#@]+)(?:\s+'([^']*)')?/i;

/**
 * Names the object a batch acts on, for failure reports: `CREATE PROCEDURE [s].[spX]`,
 * `GRANT … ON [s].[vwX]`, `EXEC sp_refreshview 's.vwX'`. Falls back to the first 80 characters of
 * the batch with whitespace collapsed.
 */
export function DescribeSQLBatchObject(batch: string): string {
    const text = StripSQLServerComments(batch);
    const ddl = OBJECT_DDL.exec(text);
    if (ddl) {
        return `${ddl[1].replace(/\s+/g, ' ').toUpperCase()} ${ddl[2].toUpperCase()} ${ddl[3]}`;
    }
    const grant = GRANT_ON.exec(text);
    if (grant) {
        return `${grant[1].toUpperCase()} ON ${grant[2]}`;
    }
    const exec = EXEC_PROC.exec(text);
    if (exec) {
        return exec[2] ? `EXEC ${exec[1]} '${exec[2]}'` : `EXEC ${exec[1]}`;
    }
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 80 ? `${flat.substring(0, 80)}…` : flat;
}
