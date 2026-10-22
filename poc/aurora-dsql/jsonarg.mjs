// Converts CodeGen's JSON-arg CRUD functions (fn(p_data jsonb), emitted for entities past PG's
// 100-arg limit) to LANGUAGE sql, reading their definitions and column defaults from the staging
// database. Usage: node jsonarg.mjs <staging-db-name> <out.sql>
import fs from 'node:fs';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const requireFromRepo = createRequire(new URL('../../packages/PostgreSQLDataProvider/', import.meta.url));
const pg = requireFromRepo('pg');

const [database, dest] = process.argv.slice(2);
if (!database || !dest) throw new Error('usage: node jsonarg.mjs <staging-db-name> <out.sql>');

const ID_EXPR = `(p_data->>'ID')::uuid`;

function sqlFunction(name, args, returns, body) {
    return `CREATE OR REPLACE FUNCTION __mj."${name}"(${args}) RETURNS ${returns}\n    LANGUAGE sql\n    AS $fn$\n${body}\n$fn$`;
}

/** `WHEN 'Field' THEN '<cast expr over $1>'` pairs from the create function's CASE. */
function fieldCasts(def) {
    const casts = [...def.matchAll(/^\s+WHEN '(\w+)' THEN '((?:[^']|'')*)'$/gm)].map((m) => ({
        field: m[1],
        expr: m[2].replace(/''/g, "'").replace(/\$1/g, 'p_data'),
    }));
    assert.ok(casts.length > 0, 'no field casts found');
    return casts;
}

function convertCreate(name, def, defaults) {
    const table = /INSERT INTO ("__mj"\."\w+")/.exec(def)[1];
    const view = /RETURN QUERY\s+SELECT \* FROM ("__mj"\."\w+")/.exec(def)[1];
    const casts = fieldCasts(def);
    const cols = ['"ID"', ...casts.map((c) => `"${c.field}"`)];
    const vals = ['p_id', ...casts.map((c) => `CASE WHEN p_data ? '${c.field}' THEN ${c.expr} ELSE ${defaults.get(c.field) ?? 'NULL'} END`)];
    const impl = sqlFunction(`${name}__impl`, 'p_data jsonb, p_id uuid', `SETOF ${view}`,
        `INSERT INTO ${table} (${cols.join(', ')})\nVALUES (${vals.join(',\n        ')});\nSELECT * FROM ${view} WHERE "ID" = p_id;`);
    const outer = sqlFunction(name, 'p_data jsonb', `SETOF ${view}`,
        `SELECT * FROM __mj."${name}__impl"(p_data, COALESCE(${ID_EXPR}, gen_random_uuid()));`);
    return [impl, outer];
}

function convertUpdate(name, def) {
    const m = /(UPDATE "__mj"\."\w+"[\s\S]+?WHERE\s+"ID" = v_id);[\s\S]*RETURN QUERY\s+(SELECT \* FROM "__mj"\."\w+"\s+WHERE "ID" = v_id);/.exec(def);
    assert.ok(m, `${name}: unexpected update shape`);
    const view = /FROM ("__mj"\."\w+")/.exec(m[2])[1];
    const body = `${m[1]};\n${m[2]};`.replace(/\bv_id\b/g, ID_EXPR);
    return [sqlFunction(name, 'p_data jsonb', `SETOF ${view}`, body)];
}

const client = new pg.Client({ host: 'localhost', database });
await client.connect();
try {
    const fns = await client.query(`
        SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = '__mj' AND pg_get_function_arguments(p.oid) = 'p_data jsonb'
          AND p.proname ~ '^sp(Create|Update)' ORDER BY p.proname DESC`);
    const out = [];
    for (const { name, def } of fns.rows) {
        if (name.startsWith('spUpdate')) { out.push(...convertUpdate(name, def)); continue; }
        const table = /INSERT INTO "__mj"\."(\w+)"/.exec(def)[1];
        const cols = await client.query(
            `SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = '__mj' AND table_name = $1`, [table]);
        const defaults = new Map(cols.rows.filter((r) => r.column_default).map((r) => [r.column_name, r.column_default]));
        out.push(...convertCreate(name, def, defaults));
    }
    fs.writeFileSync(dest, out.join(';\n\n') + ';\n');
    console.log(`converted ${fns.rows.length} functions -> ${out.length} statements`);
} finally {
    await client.end();
}
