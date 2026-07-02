/**
 * PG CRUD behavioral oracle.
 *
 * For every entity with generated CRUD functions on a PostgreSQL MJ database,
 * exercises the full generated stack END TO END:
 *
 *   spCreate<Entity>(...)  → must return exactly 1 row via the base view,
 *                            echoing every value we passed in
 *   spUpdate<Entity>(...)  → must return the row with the changed value
 *   spDelete<Entity>(...)  → row must be gone from the base table afterwards
 *
 * Everything runs inside a per-entity transaction that is ROLLED BACK, so the
 * target database is never mutated. This catches the class of bug that
 * name-level parity and even view-definition equivalence cannot: a generated
 * function that exists but misbehaves (wrong column mapping, broken default
 * handling — e.g. an SS default function emitted as a string literal — or a
 * view that can't return the row its own spCreate just wrote).
 *
 * Value synthesis:
 *  - NOT NULL FK columns get a FRESH parent row created recursively via the
 *    parent's own spCreate (depth-capped, cycle-detected), falling back to
 *    borrowing an existing row. Fresh parents keep unique (FK,FK) pairs
 *    unique. Nullable FKs are omitted by default.
 *  - Value-list columns use EntityFieldValue metadata.
 *  - Integer args get DISTINCT increasing values (satisfies Min<Max checks).
 *  - On a CHECK-constraint violation the entity is retried with
 *    exactly-one-nullable-FK variants (covers "exactly one principal" checks).
 *  - nchar comparisons are trim-aware (bpchar pads, same as SS nchar);
 *    varbinary round-trips as hex and is only checked non-null.
 *
 * Usage:
 *   ORACLE_DB=pg_metafix node scripts/pg-crud-oracle.mjs [--only "Entity Name"]
 *
 * Env: ORACLE_DB (required), PG_CONTAINER (default postgres-claude),
 *      PG_USER (default mj_admin), PG_PASSWORD (default Claude2Pg99)
 *
 * Output: summary JSON to stdout (exit 1 if any entity fails);
 *         full per-entity report to /tmp/pg-crud-oracle-report.json
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const DB = process.env.ORACLE_DB;
const CONTAINER = process.env.PG_CONTAINER || 'postgres-claude';
const PG_USER = process.env.PG_USER || 'mj_admin';
const PG_PASSWORD = process.env.PG_PASSWORD || 'Claude2Pg99';
const REPORT_PATH = '/tmp/pg-crud-oracle-report.json';
const MAX_PARENT_DEPTH = 4;
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

if (!DB) { console.error('ORACLE_DB env var required'); process.exit(2); }

function psql(sql) {
  return execFileSync('docker', [
    'exec', '-i', '-e', `PGPASSWORD=${PG_PASSWORD}`, CONTAINER,
    'psql', '-U', PG_USER, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-Atq',
  ], { input: sql, maxBuffer: 64 * 1024 * 1024 }).toString();
}

const q = s => s.replace(/'/g, "''");

// ── Bulk metadata load ──────────────────────────────────────────────────────

const entities = JSON.parse(psql(`
SELECT jsonb_agg(jsonb_build_object(
  'id', e."ID", 'name', e."Name", 'baseTable', e."BaseTable",
  'baseView', e."BaseView", 'schema', e."SchemaName",
  'allowCreate', e."AllowCreateAPI"))
FROM __mj."Entity" e WHERE e."VirtualEntity" = FALSE;`));

const fieldsByEntity = JSON.parse(psql(`
SELECT jsonb_object_agg(t.eid, t.fields) FROM (
  SELECT ef."EntityID" AS eid, jsonb_agg(jsonb_build_object(
    'name', ef."Name", 'type', ef."Type", 'length', ef."Length",
    'allowsNull', ef."AllowsNull", 'isPrimaryKey', ef."IsPrimaryKey",
    'relatedEntityId', ef."RelatedEntityID",
    'readOnly', NOT ef."AllowUpdateAPI", 'isVirtual', ef."IsVirtual"
  ) ORDER BY ef."Sequence") AS fields
  FROM __mj."EntityField" ef GROUP BY ef."EntityID"
) t;`));

const valueLists = JSON.parse(psql(`
SELECT COALESCE(jsonb_object_agg(t.k, t.v), '{}'::jsonb) FROM (
  SELECT ef."EntityID" || '|' || ef."Name" AS k, (array_agg(efv."Value" ORDER BY efv."Sequence"))[1] AS v
  FROM __mj."EntityFieldValue" efv JOIN __mj."EntityField" ef ON efv."EntityFieldID" = ef."ID"
  GROUP BY 1
) t;`));

const fns = JSON.parse(psql(`
SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_arguments(p.oid), 'rettype', pg_get_function_result(p.oid)))
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = '__mj' AND (p.proname LIKE 'spCreate%' OR p.proname LIKE 'spUpdate%' OR p.proname LIKE 'spDelete%');`));

const byRet = new Map();
for (const f of fns) {
  const m = f.rettype.match(/SETOF\s+__mj\."(vw[A-Za-z0-9_]+)"/);
  if (!m) continue;
  if (!byRet.has(m[1])) byRet.set(m[1], {});
  const slot = byRet.get(m[1]);
  if (f.name.startsWith('spCreate')) slot.create = f;
  else if (f.name.startsWith('spUpdate')) slot.update = f;
  else if (f.name.startsWith('spDelete')) slot.delete = f;
}
const deleteByName = new Map(fns.filter(f => f.name.startsWith('spDelete')).map(f => [f.name, f]));

function parseArgs(argString) {
  if (!argString.trim()) return [];
  return argString.split(',').map(a => {
    const m = a.trim().match(/^(\S+)\s+(.+?)(\s+DEFAULT\s+.+)?$/i);
    return { name: m[1], type: m[2].trim(), hasDefault: !!m[3] };
  });
}

const entById = new Map(entities.map(e => [e.id, e]));
const borrowCache = new Map();
function borrowParentId(relatedEntityId) {
  if (borrowCache.has(relatedEntityId)) return borrowCache.get(relatedEntityId);
  const rel = entById.get(relatedEntityId);
  let val = null;
  if (rel) {
    try { val = psql(`SELECT "ID" FROM "${rel.schema}"."${rel.baseTable}" LIMIT 1;`).trim() || null; } catch { val = null; }
  }
  borrowCache.set(relatedEntityId, val);
  return val;
}

let counter = 0;
function scalarValue(field, entityId, phase) {
  counter++;
  const listKey = `${entityId}|${field.name}`;
  if (valueLists[listKey] !== undefined) return `'${q(valueLists[listKey])}'`;
  const t = (field.type || '').toLowerCase();
  if (t === 'uniqueidentifier') return `gen_random_uuid()`;
  if (t === 'bit') return phase === 'update' ? 'FALSE' : 'TRUE';
  // small, increasing, distinct-within-entity: satisfies Min<Max-style range
  // checks while staying inside 0-100 percent-style CHECK constraints
  if (['int', 'smallint', 'bigint'].includes(t)) return String((counter % 45) + 1);
  if (['decimal', 'numeric', 'float', 'real', 'money'].includes(t)) return '1';
  if (['datetimeoffset', 'datetime', 'date'].includes(t)) return `now()`;
  const maxChars = field.length > 0 ? Math.floor(field.length / 2) : 100;
  const base = (phase === 'update' ? 'OrcU' : 'OrcC') + counter;
  return `'${base.slice(0, Math.max(1, maxChars))}'`;
}

/**
 * Entities whose required columns have no spCreate parameter on EITHER
 * platform (verified vs the SQL Server baseline): the create proc is not a
 * supported path; rows are managed by CodeGen direct SQL. Always borrow.
 */
const NO_CREATE_PATH = new Set(['MJ: Entities', 'MJ: Entity Fields', 'Entities', 'Entity Fields']);

/**
 * Per-table named-arg overrides for multi-column CHECK constraints that
 * generic synthesis can't satisfy. Each hint mirrors the constraint it
 * exists for — keep the constraint name in the comment.
 */
const ARG_HINTS = {
  // chk_AIModelCost_Currency: 3-char uppercase ISO code
  AIModelCost: { p_currency: `'USD'` },
  // CK_Conversation_ScopeAppBinding: Global scope requires NULL ApplicationID
  Conversation: { p_applicationscope: `'Global'` },
  // CK_EOKRE_MatchMode: direct-match mode = RelatedEntityFieldNames set, transitive quartet NULL
  EntityOrganicKeyRelatedEntity: { p_relatedentityfieldnames: `'ID'` },
  // CK_MagicLinkInvite_UseCount: 0 <= UseCount <= MaxUses
  MagicLinkInvite: { p_usecount: `0`, p_maxuses: `5` },
  // CK__Conversat__Ratin__* : rating range check
  ConversationDetailRating: { p_rating: `5` },
};

/**
 * Builds the spCreate call (plus any prerequisite parent creates) for an
 * entity. Returns { statements: [...], id, provided, ... } or { skip: reason }.
 *
 * opts.parentMode: 'fresh' — create direct parents via their own spCreate
 *                  (keeps unique FK-pair constraints satisfiable);
 *                  'borrow' — reuse existing rows wherever possible.
 *                  Ancestors beyond depth 0 always borrow-first: synthesized
 *                  deep ancestors multiply CHECK-constraint surface for no
 *                  verification benefit.
 * opts.nullables:  'none' (minimal create — how real callers behave),
 *                  'all', or a single field name (exactly-one principals).
 */
function buildCreate(e, depth, visited, opts) {
  if (visited.has(e.id)) return { skip: `fk-cycle:${e.name}` };
  if (depth > MAX_PARENT_DEPTH) return { skip: `fk-depth-exceeded:${e.name}` };
  const crud = byRet.get(e.baseView) || {};
  if (!crud.create) return { skip: `parent-has-no-spCreate:${e.name}` };
  const fields = fieldsByEntity[e.id] || [];
  const fieldByLower = new Map(fields.map(f => [f.name.toLowerCase(), f]));
  const pk = fields.find(f => f.isPrimaryKey);
  if (!pk || (pk.type || '').toLowerCase() !== 'uniqueidentifier' || fields.filter(f => f.isPrimaryKey).length > 1) {
    return { skip: `parent-pk-unsupported:${e.name}` };
  }
  const args = parseArgs(crud.create.args);
  const id = randomUUID();
  const provided = { p_id: { sql: `'${id}'::uuid`, fieldName: pk.name } };
  const statements = [];
  const nextVisited = new Set([...visited, e.id]);

  for (const a of args) {
    if (a.name.endsWith('_clear') || a.name === 'p_id') continue;
    const f = fieldByLower.get(a.name.replace(/^p_/, ''));
    if (!f) {
      if (!a.hasDefault) return { skip: `unmapped-required-arg:${e.name}.${a.name}` };
      continue;
    }
    if (f.relatedEntityId) {
      const include = !f.allowsNull || opts.nullables === 'all' || opts.nullables === f.name;
      if (!include) continue;
      const rel = entById.get(f.relatedEntityId);
      const borrowFirst = depth >= 1 || opts.parentMode === 'borrow' || (rel && NO_CREATE_PATH.has(rel.name));
      let fkVal = null;
      if (borrowFirst) fkVal = borrowParentId(f.relatedEntityId);
      if (!fkVal && rel && !visited.has(rel.id) && !NO_CREATE_PATH.has(rel.name)) {
        const parent = buildCreate(rel, depth + 1, nextVisited, { parentMode: 'borrow', nullables: 'none' });
        if (!parent.skip) {
          statements.push(...parent.statements);
          fkVal = parent.id;
        }
      }
      if (!fkVal && !borrowFirst) fkVal = borrowParentId(f.relatedEntityId);
      if (!fkVal) {
        if (f.allowsNull) continue;
        return { skip: `fk-parent-unbuildable:${e.name}.${f.name}` };
      }
      provided[a.name] = { sql: `'${fkVal}'::uuid`, fieldName: f.name };
      continue;
    }
    // scalar: minimal create omits nullable scalars (dodges multi-column
    // value-combo CHECK constraints, mirrors real caller behavior)
    if (f.allowsNull && a.hasDefault && opts.nullables !== 'all') continue;
    provided[a.name] = { sql: scalarValue(f, e.id, 'create'), fieldName: f.name };
  }

  // apply per-table CHECK-constraint hints (override or add named args)
  const hints = ARG_HINTS[e.baseTable] || {};
  for (const [argName, sql] of Object.entries(hints)) {
    if (args.some(a => a.name === argName)) {
      const f = fieldByLower.get(argName.replace(/^p_/, ''));
      provided[argName] = { sql, fieldName: f ? f.name : argName };
    }
  }

  statements.push(`SELECT count(*) FROM __mj."${crud.create.name}"(${Object.entries(provided).map(([k, v]) => `${k} => ${v.sql}`).join(', ')}) t;`);
  return { statements, id, provided, crud, fields, fieldByLower, pk, args };
}

// ── Run ─────────────────────────────────────────────────────────────────────

const results = { pass: [], skip: [], fail: [] };
const targets = entities.filter(e => !ONLY || e.name === ONLY).sort((a, b) => a.name.localeCompare(b.name));

for (const e of targets) {
  const crud = byRet.get(e.baseView) || {};
  if (!crud.create) {
    results.skip.push({ entity: e.name, reason: e.allowCreate ? 'no-spCreate-found' : 'create-api-disabled' });
    continue;
  }
  if (NO_CREATE_PATH.has(e.name)) {
    results.skip.push({ entity: e.name, reason: 'required-column-has-no-create-param (same shape as SQL Server — not a PG divergence)' });
    continue;
  }

  // attempt strategies in order: minimal create with fresh direct parents,
  // minimal with borrowed parents, then exactly-one-nullable-FK variants
  // (principal-style CHECKs), then everything-provided variants
  const fields = fieldsByEntity[e.id] || [];
  const nullableFkNames = fields.filter(f => f.relatedEntityId && f.allowsNull && !f.isVirtual).map(f => f.name);
  const strategies = [
    { parentMode: 'fresh', nullables: 'none' },
    { parentMode: 'borrow', nullables: 'none' },
    ...nullableFkNames.map(n => ({ parentMode: 'borrow', nullables: n })),
    { parentMode: 'fresh', nullables: 'all' },
    { parentMode: 'borrow', nullables: 'all' },
  ];

  let lastError = null;
  let outcome = null;

  for (const strategy of strategies) {
    const plan = buildCreate(e, 0, new Set(), strategy);
    if (plan.skip) { outcome = { skip: plan.skip }; break; }

    const { statements, id, provided, fieldByLower } = plan;
    // wrap the FINAL create (the entity under test) with the jsonb echo
    statements[statements.length - 1] = statements[statements.length - 1]
      .replace(/^SELECT count\(\*\) FROM /, 'SELECT to_jsonb(t) FROM ');

    const updField = fields.find(f =>
      !f.isPrimaryKey && !f.relatedEntityId && !f.readOnly && !f.isVirtual &&
      (f.type || '').toLowerCase() === 'nvarchar' && (f.length === -1 || f.length >= 12) &&
      valueLists[`${e.id}|${f.name}`] === undefined &&
      plan.args.some(a => a.name === 'p_' + f.name.toLowerCase()));
    counter++;
    const updValue = `OrcUpd${counter}`;
    const updateCall = crud.update && updField
      ? `SELECT to_jsonb(t) FROM __mj."${crud.update.name}"(p_id => '${id}'::uuid, p_${updField.name.toLowerCase()} => '${updValue}') t;`
      : null;
    const delFn = crud.delete || deleteByName.get('spDelete' + crud.create.name.slice('spCreate'.length));
    const deleteCall = delFn ? `SELECT __mj."${delFn.name}"(p_id => '${id}'::uuid);` : null;

    const script = [
      `BEGIN;`,
      `SELECT '<<CREATE>>';`, ...statements.slice(0, -1), statements[statements.length - 1],
      updateCall ? `SELECT '<<UPDATE>>';` : '', updateCall || '',
      deleteCall ? `SELECT '<<DELETE>>';` : '', deleteCall || '',
      deleteCall ? `SELECT '<<GONE>>';` : '',
      deleteCall ? `SELECT count(*)::text FROM "${e.schema}"."${e.baseTable}" WHERE "ID" = '${id}';` : '',
      `ROLLBACK;`,
    ].filter(Boolean).join('\n');

    let out;
    try {
      out = psql(script);
    } catch (err) {
      lastError = String(err.stderr || err).split('\n').filter(l => l.includes('ERROR')).join(' ').slice(0, 400);
      // CHECK/unique/parent-row failures may be satisfiable under another
      // strategy; a real entity-under-test bug fails under ALL of them and is
      // reported with the last error.
      continue;
    }

    // parse output
    const sections = {};
    let cur = null;
    for (const line of out.split('\n')) {
      const m = line.match(/^<<(\w+)>>$/);
      if (m) { cur = m[1]; sections[cur] = []; continue; }
      if (cur && line.trim()) sections[cur].push(line);
    }
    const problems = [];
    const createdRows = (sections.CREATE || []).filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (createdRows.length !== 1) {
      problems.push(`create returned ${createdRows.length} rows (expected 1)`);
    } else {
      const row = createdRows[0];
      for (const [, v] of Object.entries(provided)) {
        if (!(v.fieldName in row)) { problems.push(`create result missing field ${v.fieldName}`); continue; }
        const got = row[v.fieldName];
        const raw = v.sql;
        const f = fieldByLower.get(v.fieldName.toLowerCase());
        const t = (f?.type || '').toLowerCase();
        if (t === 'varbinary') { if (got == null) problems.push(`${v.fieldName}: expected non-null binary`); continue; }
        const trimIfChar = s => t === 'nchar' ? String(s).replace(/\s+$/, '') : String(s);
        if (raw === 'TRUE' && got !== true) problems.push(`${v.fieldName}: expected true got ${JSON.stringify(got)}`);
        else if (raw === 'FALSE' && got !== false) problems.push(`${v.fieldName}: expected false got ${JSON.stringify(got)}`);
        else if (/^'.*'$/.test(raw)) {
          const want = raw.slice(1, -1).replace(/''/g, "'");
          if (trimIfChar(got) !== want) problems.push(`${v.fieldName}: expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
        } else if (raw.endsWith('::uuid')) {
          const want = raw.slice(1, raw.indexOf("'", 1)).toLowerCase();
          if (String(got).toLowerCase() !== want) problems.push(`${v.fieldName}: expected ${want} got ${JSON.stringify(got)}`);
        } else if (/^\d+$/.test(raw) && Number(got) !== Number(raw)) problems.push(`${v.fieldName}: expected ${raw} got ${JSON.stringify(got)}`);
        else if ((raw === 'gen_random_uuid()' || raw === 'now()') && got == null) problems.push(`${v.fieldName}: expected non-null`);
      }
    }
    if (updateCall) {
      const updRows = (sections.UPDATE || []).filter(l => l.startsWith('{')).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (updRows.length !== 1) problems.push(`update returned ${updRows.length} rows (expected 1)`);
      else if (String(updRows[0][updField.name]) !== updValue) problems.push(`update: ${updField.name} expected ${JSON.stringify(updValue)} got ${JSON.stringify(updRows[0][updField.name])}`);
    }
    if (deleteCall) {
      const gone = (sections.GONE || [])[0];
      if (gone !== '0') problems.push(`delete: row still present (count=${gone})`);
    }
    outcome = problems.length ? { fail: { stage: 'verify', problems, strategy } } : { pass: true };
    break;
  }

  if (!outcome) outcome = { fail: { stage: 'execute', error: lastError || 'all strategies exhausted', strategy: 'all-exhausted' } };
  if (outcome.pass) results.pass.push(e.name);
  else if (outcome.skip) results.skip.push({ entity: e.name, reason: outcome.skip });
  else results.fail.push({ entity: e.name, ...outcome.fail });
}

writeFileSync(REPORT_PATH, JSON.stringify(results, null, 1));
const skipByReason = {};
for (const s of results.skip) { const r = s.reason.split(':')[0]; skipByReason[r] = (skipByReason[r] || 0) + 1; }
console.log(JSON.stringify({
  pass: results.pass.length,
  fail: results.fail.length,
  skip: results.skip.length,
  skipByReason,
  failures: results.fail.map(f => ({ entity: f.entity, stage: f.stage, detail: (f.problems || [f.error]).slice(0, 3) })),
  fullReport: REPORT_PATH,
}, null, 1));
process.exit(results.fail.length > 0 ? 1 : 0);
