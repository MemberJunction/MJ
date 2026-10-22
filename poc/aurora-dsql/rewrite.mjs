// Rewrites the MJ PG baseline into what DSQL accepts. Usage: node rewrite.mjs <baseline.sql> <out.sql>
//  - PK / UNIQUE constraints folded into CREATE TABLE (DSQL can't add them later)
//  - FKs added as ALTER TABLE ... NOT VALID (no ONLY)
//  - indexes as CREATE [UNIQUE] INDEX ASYNC, without USING btree
//  - drops what DSQL can't run at all: plpgsql functions, triggers, extensions, SET, GRANT, COMMENT
import fs from 'node:fs';
import assert from 'node:assert';
import { splitStatements } from './split.mjs';

const DROP = [/^CREATE EXTENSION/, /^SET /, /^GRANT /, /^COMMENT ON /, /^CREATE TRIGGER/, /LANGUAGE plpgsql/];
const TABLE = /^CREATE TABLE (\S+) \(/;
const ADD_CONSTRAINT = /^ALTER TABLE (?:ONLY )?(\S+)\s+ADD CONSTRAINT (.+)$/s;
const INDEX = /^CREATE (UNIQUE )?INDEX (\S+) ON (?:ONLY )?(\S+) USING btree (.+)$/s;

export function rewrite(statements) {
    const inline = new Map();
    for (const s of statements) {
        const m = ADD_CONSTRAINT.exec(s);
        if (m && /\b(PRIMARY KEY|UNIQUE)\b/.test(m[2])) inline.set(m[1], [...(inline.get(m[1]) ?? []), m[2]]);
    }
    const out = [];
    for (const s of statements) {
        if (DROP.some((re) => re.test(s))) continue;
        const t = TABLE.exec(s);
        if (t && inline.has(t[1])) {
            assert.ok(s.endsWith(')'), `CREATE TABLE ${t[1]} does not end with )`);
            out.push(`${s.slice(0, -1).trimEnd()},\n    CONSTRAINT ${inline.get(t[1]).join(',\n    CONSTRAINT ')}\n)`);
            continue;
        }
        const c = ADD_CONSTRAINT.exec(s);
        if (c && /\b(PRIMARY KEY|UNIQUE)\b/.test(c[2])) continue;
        if (c && /FOREIGN KEY/.test(c[2])) { out.push(`ALTER TABLE ${c[1]} ADD CONSTRAINT ${c[2]} NOT VALID`); continue; }
        const ix = INDEX.exec(s);
        if (ix) { out.push(`CREATE ${ix[1] ?? ''}INDEX ASYNC ${ix[2]} ON ${ix[3]} ${ix[4]}`); continue; }
        out.push(s);
    }
    return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const [src, dest] = process.argv.slice(2);
    const before = splitStatements(fs.readFileSync(src, 'utf8'));
    const after = rewrite(before);
    fs.writeFileSync(dest, after.join(';\n\n') + ';\n');
    const tables = after.filter((s) => TABLE.test(s));
    assert.ok(tables.every((s) => /PRIMARY KEY/.test(s)), 'a table is missing its PK');
    console.log(`${before.length} -> ${after.length} statements; ${tables.length} tables, all with PK`);
}
