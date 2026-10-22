import assert from "node:assert";
// Splits a PostgreSQL script into statements on `;`, ignoring semicolons inside
// comments, quoted strings/identifiers and dollar-quoted bodies.
export function splitStatements(sql) {
    const out = [];
    let start = 0;
    let i = 0;
    const n = sql.length;
    while (i < n) {
        const c = sql[i];
        const next = sql[i + 1];
        if (c === '-' && next === '-') {
            const end = sql.indexOf('\n', i);
            i = end === -1 ? n : end + 1;
        } else if (c === '/' && next === '*') {
            const end = sql.indexOf('*/', i + 2);
            if (end === -1) throw new Error(`unterminated block comment at ${i}`);
            i = end + 2;
        } else if (c === "'" || c === '"') {
            i = skipQuoted(sql, i, c);
        } else if (c === '$') {
            const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i, i + 64));
            if (!tag) { i++; continue; }
            const end = sql.indexOf(tag[0], i + tag[0].length);
            if (end === -1) throw new Error(`unterminated dollar quote ${tag[0]} at ${i}`);
            i = end + tag[0].length;
        } else if (c === ';') {
            pushIfReal(out, sql.slice(start, i));
            start = ++i;
        } else {
            i++;
        }
    }
    pushIfReal(out, sql.slice(start));
    return out;
}

// Doubled quote ('' or "") is an escaped quote; standard_conforming_strings is on, so no backslash escapes.
function skipQuoted(sql, i, q) {
    let j = i + 1;
    while (j < sql.length) {
        if (sql[j] !== q) { j++; continue; }
        if (sql[j + 1] === q) { j += 2; continue; }
        return j + 1;
    }
    throw new Error(`unterminated ${q} quote at ${i}`);
}

function pushIfReal(out, stmt) {
    const body = stmt.replace(/^(\s*(--[^\n]*\n?|\/\*[\s\S]*?\*\/))*\s*/, '').trim();
    if (body) out.push(body);
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const s = splitStatements(`-- a;b\nSELECT 'x;''y';\nCREATE FUNCTION f() AS $$ a; b; $$;\n/* c; */ SELECT "q;" ; `);
    assert.ok(s.length === 3, s);
    assert.ok(s[0] === "SELECT 'x;''y'", s[0]);
    assert.ok(s[1].endsWith('$$ a; b; $$'), s[1]);
    assert.ok(s[2] === 'SELECT "q;"', s[2]);
    console.log('split self-check ok', s.length);
}
