#!/usr/bin/env node
/**
 * MJ#4503 gate: no migration may create a fixed-GUID row without first checking
 * whether that row is already there.
 *
 * `mj sync push` and the release Metadata_Sync migrations both create the same
 * records with the same hardcoded GUIDs, and the migration never looks first. On a
 * database where a push ran ahead of the chain, the migration dies on a primary-key
 * violation and the upgrade stops. Guarding the create converges instead: absent ->
 * create, present -> update to the release's content.
 *
 * Modes: (default) check, --fix rewrite in place, --self-test run fixtures.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** A create call, located within its batch. */
const EXEC_RE =
  /EXEC\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?spCreate(\w+)\]?\s+([\s\S]*?);/g;
/** `SET\n  @local = 'literal'` — the emitter splits the assignment across lines. */
const SET_RE = /SET\s*\r?\n?\s*@(\w+)\s*=\s*N?'([0-9A-Fa-f-]{36})'/g;

function sqlFilesUnder(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sqlFilesUnder(p, out);
    else if (e.name.endsWith('.sql')) out.push(p);
  }
  return out;
}

/**
 * The current (non-frozen) era folder — `migrations/v<highest N>` — which is where new
 * migrations land (migrations/CLAUDE.md). Only this era's fixed-GUID creates are offenders:
 * every earlier era is already applied to every existing database, so retrofitting a guard
 * there rewrites a shipped migration's bytes for zero benefit and changes its Flyway checksum
 * on every install (migrations/CLAUDE.md: "rewriting them would change Flyway checksums on
 * every existing database for no benefit"). Resolved by folder number rather than hardcoded
 * so this keeps gating the right migrations once a v7 era opens and v6 goes frozen.
 */
function currentEraDir(migrationsRoot) {
  const eras = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  if (eras.length === 0) throw new Error(`no migrations/vN era folder found under ${migrationsRoot}`);
  return join(migrationsRoot, eras[eras.length - 1]);
}

/**
 * Maps `spCreate<X>` to the table it inserts into, read off the generated proc
 * bodies in migration history.
 *
 * Deliberately NOT derived from the SP-name suffix: CodeGen builds the name as
 * `spCreate${entity.BaseTableCodeName}` and honours a per-entity `spCreate`
 * override, so the suffix is a coincidence that holds today and could stop holding.
 * A guard naming a table that does not exist would break the migration for
 * everyone, which is strictly worse than the bug being fixed.
 */
function buildProcTableMap(rootDir) {
  const PROC_RE =
    /CREATE\s+PROCEDURE\s+\[?(?:\$\{flyway:defaultSchema\}|__mj)\]?\.\[?(spCreate(\w+))\]?([\s\S]{0,8000}?)\bINSERT\s+INTO\s+\[?(?:\$\{flyway:defaultSchema\}|__mj)\]?\.\[([^\]\s]+)\]/gi;
  const map = new Map();
  for (const f of sqlFilesUnder(rootDir)) {
    const sql = readFileSync(f, 'utf8');
    for (const m of sql.matchAll(PROC_RE)) {
      // Only trust a body whose INSERT target matches the proc's own suffix; the
      // regex can overrun a hand-written proc (spCreateUserViewRunWithDetail takes
      // a table-valued parameter and inserts nothing) and capture the NEXT proc's
      // INSERT. Those procs are never called with a fixed @ID, so dropping them
      // costs nothing and removes the only source of a wrong table name.
      if (m[4] === m[2]) map.set(m[1], m[4]);
    }
  }
  return map;
}

/** Rewrites one file. Returns { text, guarded, skipped } — never throws on already-guarded input. */
function guardFile(sql, procTable, label) {
  const batches = sql.split(/^\s*GO\s*$/m);
  const seps = [...sql.matchAll(/^\s*GO\s*$/gm)].map((m) => m[0]);
  let guarded = 0;
  let skipped = 0;

  const rewritten = batches.map((batch) => {
    const locals = new Map([...batch.matchAll(SET_RE)].map((m) => [m[1], m[2].toUpperCase()]));
    const calls = [...batch.matchAll(EXEC_RE)];
    if (calls.length === 0) return batch;

    // The emitter (SQLServerDataProvider.RenderReplaySaveSQL, PR #4519) puts exactly one
    // create call in each GO batch — true for all 567 in migrations/v6. Older hand-written
    // migrations (pre-dating that convention, e.g. a "MANUAL PATCH" block) can pack several
    // into one batch; each is judged independently below rather than assumed away.
    let out = '';
    let cursor = 0;
    for (const m of calls) {
      const entity = m[1];
      const args = m[2];

      const idArg = /@ID\s*=\s*(?:(@\w+)|N?'([0-9A-Fa-f-]{36})')/.exec(args);
      if (!idArg) {
        // no @ID at all — the SP defaults it; nothing to collide with
        out += batch.slice(cursor, m.index + m[0].length);
        cursor = m.index + m[0].length;
        continue;
      }
      const idRef = idArg[1] ?? `'${idArg[2]}'`;
      // idArg[1] carries the leading `@` (e.g. `@ID_8f85b67b`); SET_RE's capture group
      // excludes it (locals keys on `ID_8f85b67b`) — strip it before the lookup.
      const guid = idArg[1] ? locals.get(idArg[1].slice(1)) : idArg[2]?.toUpperCase();
      if (!guid || !GUID.test(guid)) {
        skipped++;
        out += batch.slice(cursor, m.index + m[0].length); // computed @ID — cannot collide deterministically
        cursor = m.index + m[0].length;
        continue;
      }

      if (/IF\s+NOT\s+EXISTS/i.test(batch.slice(cursor, m.index))) {
        out += batch.slice(cursor, m.index + m[0].length); // already guarded
        cursor = m.index + m[0].length;
        continue;
      }

      const table = procTable.get(`spCreate${entity}`);
      if (!table)
        throw new Error(
          `${label}: cannot resolve a table for spCreate${entity}. ` +
            `Refusing to guess — a guard naming the wrong table breaks the migration for every database.`,
        );

      const head = batch.slice(cursor, m.index).trimEnd();
      // Shape matches SQLServerDataProvider.RenderReplaySaveSQL in PR #4519 (Layer 1), so a
      // regenerated file and a freshly emitted one are structurally the same statement.
      const body =
        `\nIF NOT EXISTS (SELECT 1 FROM [\${flyway:defaultSchema}].[${table}] WHERE [ID] = ${idRef})\n` +
        `BEGIN\n    EXEC [\${flyway:defaultSchema}].spCreate${entity} ${args};\nEND\n` +
        `ELSE\n` +
        `BEGIN\n    EXEC [\${flyway:defaultSchema}].spUpdate${entity} ${args};\nEND\n`;
      out += head + body;
      cursor = m.index + m[0].length;
      guarded++;
    }
    out += batch.slice(cursor);
    return out;
  });

  let text = '';
  rewritten.forEach((b, i) => {
    text += b;
    if (i < seps.length) text += seps[i];
  });
  return { text, guarded, skipped };
}

// ─────────────────────────────────────────── modes

function runSelfTest() {
  const dir = join(HERE, 'fixtures', 'guarded-creates');
  const procTable = new Map([['spCreateCredentialType', 'CredentialType']]);
  let failures = 0;

  const input = readFileSync(join(dir, 'unguarded-input.sql'), 'utf8');
  const expected = readFileSync(join(dir, 'unguarded-expected.sql'), 'utf8');
  const got = guardFile(input, procTable, 'unguarded-input.sql');
  if (got.text !== expected) {
    console.error('FAIL: unguarded input did not produce the expected output');
    console.error('--- got ---\n' + got.text + '\n--- expected ---\n' + expected);
    failures++;
  } else if (got.guarded !== 1) {
    console.error(`FAIL: expected 1 guarded call, got ${got.guarded}`);
    failures++;
  }

  const already = readFileSync(join(dir, 'already-guarded.sql'), 'utf8');
  const second = guardFile(already, procTable, 'already-guarded.sql');
  if (second.text !== already || second.guarded !== 0) {
    console.error('FAIL: rewriting an already-guarded file was not a no-op (transform is not idempotent)');
    failures++;
  }

  const unknown = readFileSync(join(dir, 'unknown-sp.sql'), 'utf8');
  try {
    guardFile(unknown, procTable, 'unknown-sp.sql');
    console.error('FAIL: an unresolvable SP should throw, not guess a table');
    failures++;
  } catch (err) {
    if (!/cannot resolve a table/i.test(err.message)) {
      console.error(`FAIL: wrong error for unresolvable SP: ${err.message}`);
      failures++;
    }
  }

  console.log(failures === 0 ? 'self-test: PASS (3 cases)' : `self-test: FAIL (${failures})`);
  return failures === 0 ? 0 : 1;
}

function run(fix) {
  const migRoot = join(REPO, 'migrations');
  // The table map draws on CREATE PROCEDURE bodies from all of migration history — a proc
  // can have been defined in an earlier era and never touched since — but the offender scan
  // below is scoped to the current era only (see currentEraDir).
  const procTable = buildProcTableMap(migRoot);
  const scanRoot = currentEraDir(migRoot);
  let totalGuarded = 0;
  const offenders = [];

  for (const f of sqlFilesUnder(scanRoot)) {
    const sql = readFileSync(f, 'utf8');
    if (!/EXEC\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?spCreate/.test(sql)) continue;
    const rel = relative(REPO, f);
    const res = guardFile(sql, procTable, rel);
    if (res.guarded === 0) continue;
    if (fix) {
      writeFileSync(f, res.text, 'utf8');
      console.log(`guarded ${String(res.guarded).padStart(4)} create(s) in ${rel}`);
      totalGuarded += res.guarded;
    } else {
      offenders.push({ rel, n: res.guarded });
    }
  }

  if (fix) {
    console.log(`\nguarded ${totalGuarded} create call(s)`);
    return 0;
  }
  if (offenders.length === 0) {
    console.log('all fixed-GUID creates in migrations/ are guarded');
    return 0;
  }
  console.error('Unguarded fixed-GUID spCreate calls found (MJ#4503).\n');
  console.error('These insert a hardcoded GUID without checking whether the row is already');
  console.error('there. On any database where `mj sync push` ran before migrating, the');
  console.error('migration dies on a primary-key violation and the upgrade stops.\n');
  for (const o of offenders) console.error(`  ${String(o.n).padStart(4)}  ${o.rel}`);
  console.error('\nFix: node .github/scripts/check-migration-guarded-creates.mjs --fix');
  return 1;
}

const argv = process.argv.slice(2);
process.exit(argv.includes('--self-test') ? runSelfTest() : run(argv.includes('--fix')));
