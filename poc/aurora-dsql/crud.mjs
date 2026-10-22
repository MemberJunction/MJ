// Converts CodeGen's PL/pgSQL CRUD functions (spCreate*/spUpdate*/spDelete*) into LANGUAGE sql
// equivalents that DSQL accepts, keeping each function's exact signature so MJ's named-arg calls
// (`SELECT * FROM fn(p_x => $1, ...)`) still bind. Anything outside the generated shapes is
// reported and skipped, never guessed at.
import assert from 'node:assert';

const FN_HEADER = /^CREATE (?:OR REPLACE )?FUNCTION (\S+?)\(([\s\S]*?)\) RETURNS ([\s\S]+?)\s+LANGUAGE plpgsql\s+AS (\$\w*\$)([\s\S]*)\4$/;

/** Splits "a type DEFAULT x, b type" on top-level commas. */
function splitArgs(argList) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of argList) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

const argName = (arg) => arg.split(/\s+/)[0];

export function parseFunction(stmt) {
    const m = FN_HEADER.exec(stmt);
    if (!m) return null;
    return { name: m[1], args: m[2], returns: m[3].trim(), body: m[5] };
}

/** `SETOF __mj."vwX"` from the plpgsql function's `RETURNS SETOF ...` / `RETURNS TABLE(...)`. */
function sqlFunction(name, args, returns, body) {
    return `CREATE FUNCTION ${name}(${args}) RETURNS ${returns}\n    LANGUAGE sql\n    AS $fn$\n${body.trim()}\n$fn$`;
}

function convertCreate(fn) {
    const assign = /v_new_id := COALESCE\((p_\w+), gen_random_uuid\(\)\);/.exec(fn.body);
    const insert = /(INSERT INTO [\s\S]+?);\s*RETURN QUERY\s+(SELECT [\s\S]+?);\s*END;\s*$/.exec(fn.body);
    if (!assign || !insert || /\bIF\b|\bEXECUTE\b/.test(fn.body)) return null;
    const pk = assign[1];
    const sub = (s) => s.replace(/\bv_new_id\b/g, pk);
    const implName = fn.name.replace(/"$/, '__impl"');
    const impl = sqlFunction(implName, fn.args, fn.returns, `${sub(insert[1])};\n${sub(insert[2])};`);
    const callArgs = splitArgs(fn.args).map(argName)
        .map((a) => (a === pk ? `${a} => COALESCE(${a}, gen_random_uuid())` : `${a} => ${a}`));
    const outer = sqlFunction(fn.name, fn.args, fn.returns, `SELECT * FROM ${implName}(${callArgs.join(', ')});`);
    return [impl, outer];
}

function convertUpdate(fn, hasUpdatedAt) {
    const m = /(UPDATE \S+\s+SET[\s\S]+?)(\s+WHERE[\s\S]+?);\s*GET DIAGNOSTICS[\s\S]*?RETURN QUERY\s+(SELECT [\s\S]+?);\s*END;\s*$/.exec(fn.body);
    if (!m || /\bEXECUTE\b/.test(fn.body)) return null;
    const table = /^UPDATE (\S+)/.exec(m[1])[1];
    const stamp = hasUpdatedAt(table) && !/"__mj_UpdatedAt"\s*=/.test(m[1]) ? `,\n        "__mj_UpdatedAt" = now()` : '';
    return [sqlFunction(fn.name, fn.args, fn.returns, `${m[1]}${stamp}${m[2]};\n${m[3]};`)];
}

// FOR v_rec IN SELECT <cols> FROM <t> WHERE <cond> LOOP <stmt>; END LOOP;
const CASCADE_LOOP = /FOR v_rec IN\s+(SELECT [\s\S]+?)\s+LOOP\s+(?:--[^\n]*\n\s*)*([\s\S]+?);\s*END LOOP;/g;

function convertCascade(selectSQL, stmt) {
    const perform = /^PERFORM (\S+\([\s\S]*\))$/.exec(stmt.trim());
    if (perform) return `SELECT ${perform[1]} FROM (${selectSQL}) v_rec`;
    const nullify = /^UPDATE (\S+)\s+SET ([\s\S]+?)\s+WHERE "(\w+)" = v_rec\."\3"$/.exec(stmt.trim());
    if (nullify) return `UPDATE ${nullify[1]} SET ${nullify[2]} WHERE "${nullify[3]}" IN (SELECT "${nullify[3]}" FROM (${selectSQL}) v_rec)`;
    return null;
}

function convertDelete(fn) {
    // The main statement is the DELETE/UPDATE after the last cascade loop.
    const afterLoops = fn.body.slice(fn.body.lastIndexOf('END LOOP;') + 1);
    const main = /((?:DELETE FROM|UPDATE) [\s\S]+?);\s*GET DIAGNOSTICS/.exec(afterLoops);
    if (!main || /\bEXECUTE\b/.test(fn.body)) return null;
    const cascades = [];
    for (const loop of fn.body.matchAll(CASCADE_LOOP)) {
        const sql = convertCascade(loop[1], loop[2]);
        if (!sql) return null;
        cascades.push(sql);
    }
    // plpgsql returned the keys when a row was affected and NULL keys otherwise; RETURNING in a
    // CTE gives the same answer without branching.
    const keys = splitArgs(fn.args).map(argName);
    const deleted = `WITH d AS (${main[1]} RETURNING *) SELECT ${keys.map((k) => `(SELECT ${k} FROM d LIMIT 1)`).join(', ')}`;
    return [sqlFunction(fn.name, fn.args, fn.returns, [...cascades, deleted].map((s) => `${s};`).join('\n'))];
}

/** Returns the replacement statements for a CRUD function, or null when it isn't a known shape. */
export function convertCRUD(stmt, hasUpdatedAt) {
    const fn = parseFunction(stmt);
    if (!fn) return null;
    const bare = fn.name.replace(/^.*\./, '').replace(/"/g, '');
    if (bare.startsWith('spCreate')) return convertCreate(fn);
    if (bare.startsWith('spUpdate')) return convertUpdate(fn, hasUpdatedAt);
    if (bare.startsWith('spDelete')) return convertDelete(fn);
    return null;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    const create = `CREATE FUNCTION __mj."spCreateT"(p_id uuid DEFAULT NULL::uuid, p_name character varying DEFAULT NULL::character varying) RETURNS SETOF __mj."vwTs"
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."T" ("ID", "Name") VALUES (v_new_id, p_name);

    RETURN QUERY
    SELECT * FROM __mj."vwTs"
    WHERE "ID" = v_new_id;
END;
$$`;
    const [impl, outer] = convertCRUD(create, () => true);
    assert.ok(impl.includes('VALUES (p_id, p_name);') && impl.includes('WHERE "ID" = p_id;'), impl);
    assert.ok(outer.includes('p_id => COALESCE(p_id, gen_random_uuid()), p_name => p_name'), outer);
    console.log('crud self-check ok');
}
