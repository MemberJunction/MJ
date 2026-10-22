// pg_dump of a migrated MJ database -> SQL that DSQL accepts. Usage: node prepare.mjs <dump.sql> <out.sql>
//  1. CodeGen CRUD (spCreate/spUpdate/spDelete) -> LANGUAGE sql (crud.mjs)
//  2. Hand-ported helpers from fn_sql_ports.sql replace their plpgsql originals
//  3. Everything else through rewrite.mjs (PK inline, FK NOT VALID, INDEX ASYNC, drop plpgsql/triggers)
import fs from 'node:fs';
import { splitStatements } from './split.mjs';
import { convertCRUD, parseFunction } from './crud.mjs';
import { rewrite } from './rewrite.mjs';

const [src, dest] = process.argv.slice(2);
if (!src || !dest) throw new Error('usage: node prepare.mjs <dump.sql> <out.sql>');

const statements = splitStatements(fs.readFileSync(src, 'utf8'));
const ports = splitStatements(fs.readFileSync(new URL('./fn_sql_ports.sql', import.meta.url), 'utf8'));
const portedNames = new Set(ports.map((s) => /^CREATE FUNCTION (\S+?)\(/.exec(s)[1]));

const updatedAtTables = new Set(statements
    .filter((s) => s.startsWith('CREATE TABLE ') && s.includes('"__mj_UpdatedAt"'))
    .map((s) => /^CREATE TABLE (\S+)/.exec(s)[1].replace(/"/g, "")));

const out = [];
const stats = { crudConverted: 0, crudSkipped: [], ported: 0 };
for (const s of statements) {
    const fn = /LANGUAGE plpgsql/.test(s) ? parseFunction(s) : null;
    if (fn && portedNames.has(fn.name)) { stats.ported++; continue; }
    const crud = fn && /"sp(Create|Update|Delete)/.test(fn.name) ? convertCRUD(s, (t) => updatedAtTables.has(t.replace(/"/g, ""))) : null;
    if (crud) { out.push(...crud); stats.crudConverted++; continue; }
    if (fn && /"sp(Create|Update|Delete)/.test(fn.name)) stats.crudSkipped.push(fn.name);
    // DSQL sequences need a large cache.
    out.push(s.replace(/\bCACHE 1\b/g, 'CACHE 65536'));
}

// Ported helpers go first so views and CRUD bodies that call them resolve.
const final = [...ports, ...rewrite(out)];
fs.writeFileSync(dest, final.join(';\n\n') + ';\n');
console.log(`${statements.length} -> ${final.length} statements; CRUD converted ${stats.crudConverted}, ported ${stats.ported}, CRUD skipped ${stats.crudSkipped.length}:`);
console.log(stats.crudSkipped.join('\n'));
