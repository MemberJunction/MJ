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
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** A create call, located within its batch. */
const EXEC_RE =
  /EXEC\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?spCreate(\w+)\]?\s+([\s\S]*?);/g;
/**
 * A literal GUID assigned to a local, in ANY T-SQL syntax.
 *
 * Deliberately keyed on the assignment itself rather than on the keyword that introduces it.
 * `SET @x = '…'`, `SELECT @x = '…'`, `DECLARE @x UNIQUEIDENTIFIER = '…'` and the
 * comma-continued `DECLARE @a … = '…', @b … = '…'` list all end in `@name = '<36 chars>'`, so
 * one pattern covers every shape including ones nobody has written yet.
 *
 * This replaced an ENUMERATION of two syntaxes, which is worth recording because the
 * enumeration had already failed once. The inline-DECLARE form was originally missing, and a
 * create using it fell through to the computed-@ID branch and was reported as "cannot collide
 * deterministically" — the opposite of the truth, since the GUID is right there and collides
 * every time. That was fixed by adding a second entry to the list; `SELECT @x = '…'`, equally
 * ordinary T-SQL, then re-opened the identical hole one keyword over. An unrecognised syntax
 * does not read as "unknown" here, it reads as "computed, therefore harmless", which resolves
 * to a PASS on exactly the migration this gate exists to reject. Enumerations of syntax are
 * the wrong shape for that decision; a test of the value is not re-openable.
 *
 * The optional identifier between the name and the `=` is the DECLARE form's type, so
 * `DECLARE @x UNIQUEIDENTIFIER = '…'` and `DECLARE @x NVARCHAR(50) = '…'` both match while a
 * comparison like `[ID] = @x AND Foo = '…'` does not (two identifiers intervene, not one).
 *
 * CONVERT/CAST wrappers are admitted because they are still a literal identity. A subquery is
 * not: `= (SELECT …'guid'…)` does not match, and is genuinely computed.
 *
 * The UNIQUEIDENTIFIER anchor the DECLARE form used to carry is gone on purpose. Its stated
 * job was to stop an NVARCHAR initialiser holding 36 GUID-shaped characters being mistaken for
 * an identity — but this map is only ever consulted for the local a create passes as its @ID,
 * and a value passed as @ID IS the identity whatever the local was declared as. (The one
 * `SELECT @x = '<guid>'` in this repo's own history, migrations/v2/V202506251213, declares the
 * local NVARCHAR(50) and uses it as an id — precisely the case the anchor would have missed.)
 */
const ASSIGN_GUID_RE =
  /@(\w+)(?:\s+[A-Za-z_]\w*(?:\s*\([^)]*\))?)?\s*=\s*(?:CONVERT\s*\([^,()]+,\s*|CAST\s*\(\s*)?N?'([0-9A-Fa-f-]{36})'/gi;

function sqlFilesUnder(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sqlFilesUnder(p, out);
    else if (e.name.endsWith('.sql')) out.push(p);
  }
  return out;
}

/**
 * The oldest era this MJ#4503 gate covers. Earlier eras (v2–v5) are already applied to every
 * existing database, so retrofitting a guard there rewrites a shipped migration's bytes for
 * zero benefit and changes its Flyway checksum on every install (migrations/CLAUDE.md:
 * "rewriting them would change Flyway checksums on every existing database for no benefit").
 * It is also the era the gate's own ground truth was measured against: exactly 567 fixed-GUID
 * creates, all in migrations/v6.
 */
const OLDEST_GUARDED_ERA = 6;

/**
 * Every era folder from OLDEST_GUARDED_ERA through the newest one that exists, oldest first —
 * not just the newest. Scanning only the newest would drop the era below it out of the gate the
 * moment a new one opens (once v7 exists, a fixed-GUID create backported into a v6 file would
 * pass silently), and the newest era needs covering from the day it opens, even before it holds
 * a single migration of its own. Resolved by folder number rather than hardcoded past
 * OLDEST_GUARDED_ERA so this keeps gating the right migrations once v7 opens and v6 freezes.
 */
function guardedEraDirs(migrationsRoot) {
  const eras = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^v\d+$/.test(e.name))
    .map((e) => Number(e.name.slice(1)))
    .filter((n) => n >= OLDEST_GUARDED_ERA)
    .sort((a, b) => a - b);
  if (eras.length === 0)
    throw new Error(`no migrations/vN era folder >= v${OLDEST_GUARDED_ERA} found under ${migrationsRoot}`);
  return eras.map((n) => join(migrationsRoot, `v${n}`));
}

/**
 * Maps `spCreate<X>` to the table it inserts into, read off the generated proc
 * bodies in migration history.
 *
 * Fail-closed by construction, not name-suffix derivation: the `m[4] === m[2]` check below
 * only accepts a proc body whose INSERT target matches the proc's own name suffix exactly, so
 * a proc's real table can never differ from what's stored here — but the reverse also holds,
 * and matters: a proc whose real table is genuinely NOT its suffix (or whose body this regex
 * mismatched, e.g. a hand-written proc with a differently-shaped body) gets no entry at all,
 * not a wrong one. guardFile's lookup then finds nothing and throws "cannot resolve a table"
 * rather than guessing. That is the intended tradeoff: a guard naming a table that does not
 * exist would break the migration for everyone, which is strictly worse than a call the tool
 * refuses to guard until someone adds it by hand.
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

/**
 * Every literal-GUID assignment to a local in this batch, in source order, whatever syntax
 * introduced it. Order matters because a batch may assign the same local twice — the value a
 * call sees is the LAST assignment that precedes it, which `localGuidAt` below resolves.
 */
function literalGuidAssignments(batch) {
  const found = [];
  for (const m of batch.matchAll(ASSIGN_GUID_RE))
    found.push({ at: m.index, name: m[1], guid: m[2].toUpperCase() });
  return found.sort((a, b) => a.at - b.at);
}

/** The GUID a local holds at offset `before`, or undefined if it is never literally assigned there. */
function localGuidAt(assignments, name, before) {
  let guid;
  for (const a of assignments) {
    if (a.at >= before) break;
    if (a.name === name) guid = a.guid;
  }
  return guid;
}

/**
 * Inner text of the balanced parenthesised group starting at `from` (which must index a
 * '('), or null when the parens never balance. Single-quoted literals are skipped so a '('
 * inside a Description cannot throw off the count; T-SQL escapes an embedded quote by
 * doubling it, which this reads as close-then-reopen — identical for balance purposes.
 */
function readParenGroup(text, from) {
  if (text[from] !== '(') return null;
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return text.slice(from + 1, i);
  }
  return null;
}

function escapeForRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when `head` — the text between the previous statement and this create — contains an
 * `IF NOT EXISTS` that tests THIS create's identity.
 *
 * Signal: the `@ID` reference the create itself passes, matched inside the EXISTS
 * predicate's own parentheses (`… WHERE [ID] = @ID_x`). That is the strongest signal
 * available, because it is the exact value the INSERT would use — a predicate testing it is
 * by construction testing the row that would collide. Two weaker signals were rejected:
 *   - "any IF NOT EXISTS earlier in the batch" (what this used to do) is not a signal at
 *     all. 38 of 64 v6 migrations contain that string for unrelated reasons — a sys.columns
 *     probe before an ALTER TABLE is the common one — so an unguarded fixed-GUID create
 *     sitting after one passed the gate silently, not even counted as skipped.
 *   - the table name alone still admits a guard on row A followed by a create of row B in
 *     the same table, which is exactly the shape that collides.
 *
 * BOTH halves are required, because a row's identity is (table, ID) and checking either one
 * alone leaves the other open. The id alone admits a predicate that tests the right id
 * against the WRONG table — which is not a weaker guard but no guard at all: that predicate
 * can never be true of the row about to be inserted, so `IF NOT EXISTS` always passes, the
 * create always runs, and it collides exactly as MJ#4503 describes. Worse than an unguarded
 * create, because the gate then reports it as guarded and --fix declines to repair it.
 * `buildProcTableMap` already refuses to GUESS a table for the same reason; this is the same
 * refusal on the reading side.
 *
 * Fail-closed: a guard this cannot tie to the create is treated as absent. The cost of a
 * false alarm is an author restating the guard in the canonical emitted shape; the cost of
 * a false pass is MJ#4503 shipping again.
 */
function isGuardedFor(head, idRef, table) {
  const ref = idRef.startsWith('@') ? `${escapeForRegExp(idRef)}\\b` : `N?${escapeForRegExp(idRef)}`;
  const idTest = new RegExp(`\\[?ID\\]?\\s*=\\s*${ref}`, 'i');
  // An optional schema qualifier, bracketed or bare, so a hand-written `FROM __mj.Foo` and
  // the emitted `FROM [${flyway:defaultSchema}].[Foo]` are both recognised.
  const tableTest = new RegExp(
    `\\bFROM\\s+(?:(?:\\[[^\\]]+\\]|[^\\s.\\[\\]]+)\\s*\\.\\s*)?\\[?${escapeForRegExp(table)}\\]?(?!\\w)`,
    'i',
  );
  for (const m of head.matchAll(/IF\s+NOT\s+EXISTS\s*(?=\()/gi)) {
    const predicate = readParenGroup(head, m.index + m[0].length);
    if (predicate !== null && idTest.test(predicate) && tableTest.test(predicate)) return true;
  }
  return false;
}

/** Rewrites one file. Returns { text, guarded, skipped } — never throws on already-guarded input. */
function guardFile(sql, procTable, label) {
  const batches = sql.split(/^\s*GO\s*$/m);
  const seps = [...sql.matchAll(/^\s*GO\s*$/gm)].map((m) => m[0]);
  let guarded = 0;
  let skipped = 0;

  const rewritten = batches.map((batch) => {
    const assignments = literalGuidAssignments(batch);
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

      // Postcondition on the capture itself: EXEC_RE's non-greedy match stops at the FIRST
      // ';', which is the wrong boundary if that ';' sits inside a string literal (a
      // Description, prompt template or JSON value) rather than terminating the statement.
      // Detect it by requiring unescaped single quotes to balance — T-SQL escapes a literal
      // quote as '' , so those pairs are stripped before counting — and refuse to guess a
      // repaired boundary; a truncated capture re-emitted into the guard would produce an
      // unterminated string inside BOTH BEGIN blocks plus dangling text after END.
      const unescaped = args.replace(/''/g, '');
      if ((unescaped.match(/'/g) ?? []).length % 2 !== 0) {
        const fragment = args.length > 160 ? `${args.slice(0, 160)}…` : args;
        throw new Error(
          `${label}: EXEC capture for spCreate${entity} has an unbalanced quote — the capture ` +
            `likely ended at a ';' inside a string literal instead of the statement's real ` +
            `terminator. Fragment: ${fragment}`,
        );
      }

      const idArg = /@ID\s*=\s*(?:(@\w+)|N?'([0-9A-Fa-f-]{36})')/.exec(args);
      if (!idArg) {
        // A POSITIONAL invocation carries @ID as its first argument, so no `@ID =` exists to
        // match and the named-parameter branch below can never see it. Refuse rather than pass:
        // "no named @ID" is evidence about this tool's reach, not about the call's identity, and
        // reading it as "the SP defaults it" is the same unrecognised-input-reads-as-safe
        // mistake that let SELECT-assigned literals through.
        if (args.trim() !== '' && !/@\w+\s*=/.test(args))
          throw new Error(
            `${label}: spCreate${entity} is called with positional arguments, so its @ID cannot be ` +
              `located. Refusing to certify a create whose identity this tool cannot read — ` +
              `rewrite the call with named parameters (@ID = …).`,
          );
        // Genuinely no @ID among the named arguments: the SP defaults it, nothing to collide with.
        out += batch.slice(cursor, m.index + m[0].length);
        cursor = m.index + m[0].length;
        continue;
      }
      const idRef = idArg[1] ?? `'${idArg[2]}'`;
      // idArg[1] carries the leading `@` (e.g. `@ID_8f85b67b`); the assignment regexes'
      // capture group excludes it (they key on `ID_8f85b67b`) — strip it before the lookup.
      const guid = idArg[1]
        ? localGuidAt(assignments, idArg[1].slice(1), m.index)
        : idArg[2]?.toUpperCase();
      if (!guid || !GUID.test(guid)) {
        skipped++;
        out += batch.slice(cursor, m.index + m[0].length); // computed @ID — cannot collide deterministically
        cursor = m.index + m[0].length;
        continue;
      }

      // Resolved BEFORE the guard check, not after: recognising an existing guard needs the
      // table just as much as emitting a new one does, and without it the check can only
      // verify half of the row's identity.
      const table = procTable.get(`spCreate${entity}`);
      if (!table)
        throw new Error(
          `${label}: cannot resolve a table for spCreate${entity}. ` +
            `Refusing to guess — a guard naming the wrong table breaks the migration for every database.`,
        );

      if (isGuardedFor(batch.slice(cursor, m.index), idRef, table)) {
        out += batch.slice(cursor, m.index + m[0].length); // already guarded, on THIS id AND this table
        cursor = m.index + m[0].length;
        continue;
      }

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
  // spCreateFooBar -> Foo is a deliberate suffix mismatch (case 5): proves guardFile emits
  // whatever table the map says, not a name derived from the SP suffix.
  const procTable = new Map([
    ['spCreateCredentialType', 'CredentialType'],
    ['spCreateFooBar', 'Foo'],
  ]);
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

  // Case 4 — C1: a ';' inside a string literal (e.g. a Description) must not silently
  // truncate the capture; the unbalanced-quote postcondition has to catch it and throw.
  const unbalanced = readFileSync(join(dir, 'unbalanced-quote.sql'), 'utf8');
  try {
    guardFile(unbalanced, procTable, 'unbalanced-quote.sql');
    console.error('FAIL: a ";" inside a string literal should throw on an unbalanced quote');
    failures++;
  } catch (err) {
    if (!/unbalanced quote/i.test(err.message)) {
      console.error(`FAIL: wrong error for unbalanced-quote input: ${err.message}`);
      failures++;
    }
  }

  // Case 5 — M2: the guard must name the table the procTable map says, not one derived from
  // the SP name's suffix (spCreateFooBar here resolves to [Foo], not [FooBar]).
  const suffixInput = readFileSync(join(dir, 'suffix-mismatch-input.sql'), 'utf8');
  const suffixExpected = readFileSync(join(dir, 'suffix-mismatch-expected.sql'), 'utf8');
  const suffixGot = guardFile(suffixInput, procTable, 'suffix-mismatch-input.sql');
  if (suffixGot.text !== suffixExpected || suffixGot.guarded !== 1) {
    console.error('FAIL: suffix-mismatch input did not resolve to the mapped (non-suffix) table');
    console.error('--- got ---\n' + suffixGot.text + '\n--- expected ---\n' + suffixExpected);
    failures++;
  }

  // Case 6 — M3: a GO batch with more than one create call (the pre-emitter "MANUAL PATCH"
  // shape) must guard each call independently rather than crash or guard only the first.
  const multiInput = readFileSync(join(dir, 'multi-call-batch-input.sql'), 'utf8');
  const multiExpected = readFileSync(join(dir, 'multi-call-batch-expected.sql'), 'utf8');
  const multiGot = guardFile(multiInput, procTable, 'multi-call-batch-input.sql');
  if (multiGot.text !== multiExpected || multiGot.guarded !== 2) {
    console.error('FAIL: multi-call batch did not guard both calls independently');
    console.error('--- got ---\n' + multiGot.text + '\n--- expected ---\n' + multiExpected);
    failures++;
  }

  // Case 7 — the gate's worst failure mode: an IF NOT EXISTS that guards something ELSE
  // (a sys.columns probe ahead of an ALTER TABLE) sitting in the same batch, ahead of an
  // unguarded fixed-GUID create. This used to read as "already guarded" and the call was
  // not even counted as skipped — MJ#4503 could ship again, silently, through any
  // hand-written migration. The unrelated probe must survive the rewrite untouched.
  const unrelatedInput = readFileSync(join(dir, 'unrelated-guard-input.sql'), 'utf8');
  const unrelatedExpected = readFileSync(join(dir, 'unrelated-guard-expected.sql'), 'utf8');
  const unrelatedGot = guardFile(unrelatedInput, procTable, 'unrelated-guard-input.sql');
  if (unrelatedGot.text !== unrelatedExpected || unrelatedGot.guarded !== 1 || unrelatedGot.skipped !== 0) {
    console.error('FAIL: an unrelated IF NOT EXISTS was accepted as this create\'s guard');
    console.error('--- got ---\n' + unrelatedGot.text + '\n--- expected ---\n' + unrelatedExpected);
    failures++;
  }
  // …and the real guard, once added, must still be recognised despite the unrelated probe
  // preceding it — otherwise --fix would double-wrap on its next run.
  const unrelatedAgain = guardFile(unrelatedExpected, procTable, 'unrelated-guard-expected.sql');
  if (unrelatedAgain.text !== unrelatedExpected || unrelatedAgain.guarded !== 0) {
    console.error('FAIL: the emitted guard was not recognised when an unrelated IF NOT EXISTS precedes it');
    failures++;
  }

  // Case 8 — `DECLARE @ID_x UNIQUEIDENTIFIER = '<fixed>'`. The identity is literal, so the
  // create collides; before the inline-initialiser form was parsed it fell through to the
  // computed-@ID branch and was reported as "cannot collide deterministically" — false, and
  // the gate exited 0 on it. skipped must be 0 here, not 1.
  const inlineInput = readFileSync(join(dir, 'inline-declare-input.sql'), 'utf8');
  const inlineExpected = readFileSync(join(dir, 'inline-declare-expected.sql'), 'utf8');
  const inlineGot = guardFile(inlineInput, procTable, 'inline-declare-input.sql');
  if (inlineGot.text !== inlineExpected || inlineGot.guarded !== 1 || inlineGot.skipped !== 0) {
    console.error(
      `FAIL: inline DECLARE initialiser not recognised as a fixed GUID (guarded=${inlineGot.guarded}, skipped=${inlineGot.skipped})`,
    );
    console.error('--- got ---\n' + inlineGot.text + '\n--- expected ---\n' + inlineExpected);
    failures++;
  }

  // Case 9 — a guard that tests the right ID against the WRONG table. A row's identity is
  // (table, ID); checking the ID alone accepts a predicate that can never be true of the row
  // about to be inserted, so the create always runs and collides exactly as MJ#4503 describes.
  // That is strictly worse than an unguarded create, because the gate reports it as guarded
  // and --fix then declines to repair it.
  const crossInput = readFileSync(join(dir, 'cross-table-guard-input.sql'), 'utf8');
  const crossExpected = readFileSync(join(dir, 'cross-table-guard-expected.sql'), 'utf8');
  const crossGot = guardFile(crossInput, procTable, 'cross-table-guard-input.sql');
  if (crossGot.text !== crossExpected || crossGot.guarded !== 1 || crossGot.skipped !== 0) {
    console.error(
      `FAIL: a guard on a DIFFERENT table was accepted as this create's guard (guarded=${crossGot.guarded}, skipped=${crossGot.skipped})`,
    );
    console.error('--- got ---\n' + crossGot.text + '\n--- expected ---\n' + crossExpected);
    failures++;
  }
  // …and the real guard, once added, must still be recognised despite the cross-table probe
  // above it — otherwise --fix would double-wrap on its next run.
  const crossAgain = guardFile(crossExpected, procTable, 'cross-table-guard-expected.sql');
  if (crossAgain.text !== crossExpected || crossAgain.guarded !== 0) {
    console.error('FAIL: the emitted guard was not recognised when a cross-table IF NOT EXISTS precedes it');
    failures++;
  }

  // Case 10 — `SELECT @x = '<guid>'`. Same literal, third T-SQL syntax. Before the detector was
  // made syntax-agnostic this reported "computed @ID — cannot collide deterministically", exited
  // 0, and --fix declined to repair it: the identical false negative Case 8 records for the
  // inline-DECLARE form, one keyword over. guarded must be 1 and skipped must be 0.
  const selInput = readFileSync(join(dir, 'select-assigned-input.sql'), 'utf8');
  const selGot = guardFile(selInput, procTable, 'select-assigned-input.sql');
  if (selGot.guarded !== 1 || selGot.skipped !== 0) {
    console.error(
      `FAIL: SELECT-assigned literal GUID not recognised (guarded=${selGot.guarded}, skipped=${selGot.skipped})`,
    );
    failures++;
  }

  // Case 11 — a positional call carries its id as argument one, so no `@ID =` exists to match.
  // "No named @ID" must not be read as "the SP defaults it"; the tool cannot see the id, so it
  // must refuse rather than pass silently. A throw is the refusal — the same shape as an
  // unresolvable table.
  const posInput = readFileSync(join(dir, 'positional-call-input.sql'), 'utf8');
  try {
    guardFile(posInput, procTable, 'positional-call-input.sql');
    console.error('FAIL: a positional spCreate call passed through without the id being examined');
    failures++;
  } catch (err) {
    if (!/positional/i.test(err.message)) {
      console.error(`FAIL: wrong error for a positional call: ${err.message}`);
      failures++;
    }
  }

  console.log(failures === 0 ? 'self-test: PASS (11 cases)' : `self-test: FAIL (${failures})`);
  return failures === 0 ? 0 : 1;
}

function run(fix) {
  const migRoot = join(REPO, 'migrations');
  if (!existsSync(migRoot)) throw new Error(`MJ#4503 gate: no migrations/ directory found at ${migRoot}`);
  // The table map draws on CREATE PROCEDURE bodies from all of migration history — a proc
  // can have been defined in an earlier era and never touched since — but the offender scan
  // below is scoped to the guarded eras only (see guardedEraDirs).
  const procTable = buildProcTableMap(migRoot);
  const scanRoots = guardedEraDirs(migRoot);
  let totalGuarded = 0;
  let totalSkipped = 0;
  const offenders = [];
  // Every file's result is computed — and every throw (an unresolvable SP, an unbalanced
  // quote) raised — before any write below, so a failure partway through leaves every file on
  // disk untouched instead of a half-rewritten tree with no record of what changed.
  const pending = [];

  for (const scanRoot of scanRoots) {
    for (const f of sqlFilesUnder(scanRoot)) {
      const sql = readFileSync(f, 'utf8');
      if (!/EXEC\s+\[?\$\{flyway:defaultSchema\}\]?\.\[?spCreate/.test(sql)) continue;
      const rel = relative(REPO, f);
      const res = guardFile(sql, procTable, rel);
      totalSkipped += res.skipped;
      if (res.guarded === 0) continue;
      if (fix) pending.push({ f, rel, res });
      else offenders.push({ rel, n: res.guarded });
    }
  }

  const eraLabel = scanRoots.map((r) => relative(REPO, r)).join(', ');
  const skippedNote =
    totalSkipped > 0
      ? ` (${totalSkipped} computed-@ID create(s) skipped — cannot collide deterministically)`
      : '';

  if (fix) {
    for (const { f, rel, res } of pending) {
      writeFileSync(f, res.text, 'utf8');
      console.log(`guarded ${String(res.guarded).padStart(4)} create(s) in ${rel}`);
      totalGuarded += res.guarded;
    }
    console.log(`\nguarded ${totalGuarded} create call(s)${skippedNote}`);
    return 0;
  }
  if (offenders.length === 0) {
    console.log(`all fixed-GUID creates in ${eraLabel} are guarded${skippedNote}`);
    return 0;
  }
  console.error('Unguarded fixed-GUID spCreate calls found (MJ#4503).\n');
  console.error('These insert a hardcoded GUID without checking whether the row is already');
  console.error('there. On any database where `mj sync push` ran before migrating, the');
  console.error('migration dies on a primary-key violation and the upgrade stops.\n');
  for (const o of offenders) console.error(`  ${String(o.n).padStart(4)}  ${o.rel}`);
  if (totalSkipped > 0)
    console.error(`\n${totalSkipped} computed-@ID create(s) also seen — skipped, cannot collide deterministically.`);
  console.error('\nFix: node .github/scripts/check-migration-guarded-creates.mjs --fix');
  return 1;
}

const argv = process.argv.slice(2);
process.exit(argv.includes('--self-test') ? runSelfTest() : run(argv.includes('--fix')));
