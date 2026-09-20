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

/**
 * T-SQL states its procedure-call grammar as one production:
 *
 *     EXEC[UTE] [ @return_status = ] [ [ [ server. ] database. ] schema. ] module [ arguments ]
 *
 * This file used to model that with TWO regexes — a strict one that --fix re-emits from, and a
 * loose "backstop" meant to be strictly broader, so that anything the strict one could not parse
 * raised instead of vanishing. Separating recognition from parsing was the right idea; a regex
 * could not deliver it. The backstop was itself one spelling of the grammar (EXEC, at most one
 * optional qualifier, spCreate<X>), so every production it did not spell was invisible to BOTH
 * patterns at once — and invisible does not read as "unknown", it reads as "no create here".
 *
 * That is one failure mode, found six times: no trailing ';', then `EXEC [__mj]`, then a guard
 * block closed before the create, then a foreign-key column passing as the primary key, then
 * `EXEC @rc =`, then a three-part name. Patching the sixth leaves the seventh, because the
 * enumeration is of an infinite set.
 *
 * Two matchers obliged to agree about a grammar will eventually disagree, so there is now one.
 * The walk below CONSUMES the productions — the optional return-status assignment, the optional
 * qualifier chain, the module name — instead of matching a rendering of them. Case, whitespace,
 * brackets, EXEC vs EXECUTE, `@rc =` and n-part names stop being shapes to enumerate; they are
 * one production read correctly. Anything the walk resolves to a create but cannot parse is
 * refused by name, never skipped.
 *
 * The other half matters as much: ordinary calls must stay silent. `EXEC sp_executesql`,
 * `EXEC (@sql)`, a return-status call to a proc that is not a create, and a module named by a
 * variable are all simply not creates. A gate that raises on everyday T-SQL is a gate nobody
 * keeps green, and a gate nobody keeps green has stopped being a gate.
 */
const EXEC_KEYWORD_RE = /\bEXEC(?:UTE)?\b/gi;
const CREATE_MODULE_RE = /^spCreate\w+$/i;
const KNOWN_SCHEMA_RE = /^\[?(?:\$\{flyway:defaultSchema\}|__mj)\]?$/;
/** A name part that is not bracketed: everything up to the next delimiter T-SQL could use. */
const BARE_NAME_PART_RE = /^[^\s.\[\];,()=]+/;

/**
 * Reads the qualifier chain and module name beginning at `from`, e.g. `[db].[schema].[spCreateX]`.
 * Returns each part with its offsets so a rewrite can reuse the author's own spelling, and the
 * offset just past the name. Null when no name starts here at all.
 */
function readDottedName(code, from) {
  const parts = [];
  let i = skipSpace(code, from);
  for (;;) {
    const start = i;
    if (code[i] === '[') {
      const close = code.indexOf(']', i + 1);
      if (close === -1) break;
      i = close + 1;
    } else {
      const bare = BARE_NAME_PART_RE.exec(code.slice(i));
      if (!bare) break;
      i += bare[0].length;
    }
    parts.push({ text: code.slice(start, i).replace(/^\[|\]$/g, ''), start, end: i });
    const afterDot = skipSpace(code, i);
    if (code[afterDot] !== '.') break;
    i = skipSpace(code, afterDot + 1);
  }
  return parts.length === 0 ? null : { parts, end: parts[parts.length - 1].end };
}

function skipSpace(code, i) {
  while (i < code.length && /\s/.test(code[i])) i++;
  return i;
}

/**
 * Every spCreate invocation in `code`, in source order, each either parsed or refused.
 *
 * Takes both maskings of the same batch, and they are not interchangeable:
 *   - `code` has comments AND string literals masked, and is what the walk READS. An EXEC inside
 *     a block comment is prose and an EXEC inside a dynamic-SQL string is data; this tool may
 *     rewrite neither, so neither is a call.
 *   - `withStrings` has only comments masked, and is used for ONE thing: locating the ';'. Read
 *     there, a ';' inside a Description ends the capture early — which is wrong, and is exactly
 *     what the unbalanced-quote postcondition downstream exists to catch and refuse. Finding the
 *     real terminator here instead would silently retire that refusal, so the boundary is
 *     deliberately taken from the same text the rewrite is sliced from.
 * Both maskings are length-preserving, so every offset indexes the original batch too.
 */
function findCreateCalls(code, withStrings) {
  const found = [];
  for (const kw of code.matchAll(EXEC_KEYWORD_RE)) {
    let i = skipSpace(code, kw.index + kw[0].length);
    if (code[i] === '(') continue; // EXEC (@sql) — dynamic SQL, not a module call

    // `EXEC @x = proc` assigns the return status; `EXEC @x` names the module THROUGH a variable,
    // which no static tool can resolve and which is therefore passed over rather than refused.
    let returnStatus = null;
    if (code[i] === '@') {
      const local = /^@\w+/.exec(code.slice(i));
      if (!local) continue;
      const eq = skipSpace(code, i + local[0].length);
      if (code[eq] !== '=' || code[eq + 1] === '=') continue;
      returnStatus = local[0];
      i = skipSpace(code, eq + 1);
    }

    const name = readDottedName(code, i);
    if (!name) continue;
    const module = name.parts[name.parts.length - 1];
    if (!CREATE_MODULE_RE.test(module.text)) continue; // not a create — nothing to guard

    const call = { at: kw.index, keyword: kw[0], returnStatus, module: module.text };
    const qualifiers = name.parts.slice(0, -1);
    if (qualifiers.length === 0) {
      found.push({ ...call, refusal: 'is called with no schema qualifier, so the table it writes cannot be named' });
      continue;
    }
    if (qualifiers.length > 1) {
      found.push({
        ...call,
        refusal:
          `is called through a multi-part name (${name.parts.map((p) => p.text).join('.')}). A guard for it ` +
          `would have to read the table in that other database, which this tool has never emitted — and a ` +
          `guard reading the wrong database is one that is never true`,
      });
      continue;
    }
    const schema = code.slice(qualifiers[0].start, qualifiers[0].end);
    if (!KNOWN_SCHEMA_RE.test(schema)) {
      found.push({ ...call, refusal: `is called through schema ${schema}, which this gate does not know` });
      continue;
    }
    // The statement runs to its terminator, located in `withStrings` — see the docblock: the
    // capture must end where the REWRITE's slice would end, so that a ';' inside a string literal
    // still trips the unbalanced-quote postcondition rather than being quietly stepped over.
    const argsStart = skipSpace(code, name.end);
    const semi = withStrings.indexOf(';', argsStart);
    if (semi === -1) {
      found.push({
        ...call,
        refusal:
          `has no ';' terminator. T-SQL treats the terminator as optional, but without one the ` +
          `statement's end cannot be located, and guessing a boundary would re-emit a truncated ` +
          `call into both guard branches`,
      });
      continue;
    }
    found.push({
      ...call,
      schemaStart: qualifiers[0].start,
      schemaEnd: qualifiers[0].end,
      argsStart,
      end: semi + 1,
    });
  }
  return found;
}
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

/**
 * A copy of `sql` with comment bodies blanked out, character for character, so offsets into the
 * result are offsets into the original. Optionally blanks single-quoted string literals too.
 *
 * Exists because every pattern in this file used to read raw text, which cannot tell a statement
 * from a sentence about one. That is not hypothetical: an early recogniser brought the whole gate
 * down on migrations/v6/V202608301800, whose block comment explains a deprecation by quoting
 * `EXEC spCreateAIModelCost`. Prose is not code. Neither is a commented-out statement, and
 * reading one as a guard would be a fail-open of exactly the kind this gate exists to close.
 *
 * `blankStrings` is on for RECOGNITION — an EXEC inside a dynamic-SQL string is data this tool
 * must not rewrite and must not raise over — and off for the two reads that need the literals
 * themselves: the fixed GUID a create passes as its @ID lives inside one, and so does the ';'
 * that the unbalanced-quote postcondition exists to catch.
 *
 * Bracketed identifiers are stepped over rather than blanked: they are code, but a `'` or `--`
 * inside one starts neither a string nor a comment.
 */
function maskInertText(sql, { blankStrings = false } = {}) {
  const out = sql.split('');
  const n = sql.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? n : nl;
      blank(i, end);
      i = end;
    } else if (two === '/*') {
      // T-SQL nests block comments, so count depth rather than scanning for the first '*/'.
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        const pair = sql.slice(j, j + 2);
        if (pair === '/*') {
          depth++;
          j += 2;
        } else if (pair === '*/') {
          depth--;
          j += 2;
        } else j++;
      }
      blank(i, j);
      i = j;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] !== "'") j++;
        else if (sql[j + 1] === "'") j += 2; // doubled quote: an escaped ' inside the literal
        else {
          j++;
          break;
        }
      }
      if (blankStrings) blank(i, j);
      i = j;
    } else if (sql[i] === '[') {
      const close = sql.indexOf(']', i + 1);
      i = close === -1 ? n : close + 1;
    } else i++;
  }
  return out.join('');
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
/**
 * True when an `IF NOT EXISTS (…)` whose predicate ends at `from` actually governs the statement
 * that the head ends with — i.e. the create sits in the branch the IF controls.
 *
 * Without this, isGuardedFor answered a strictly weaker question: "does a matching predicate
 * appear anywhere earlier in this batch?" An IF whose BEGIN/END block closes before the create
 * governs a PRINT and nothing else, so the create runs unconditionally — the same collision as no
 * guard at all, reported as guarded and left alone by --fix.
 *
 * Counting BEGIN/END depth over the whole tail is NOT enough, and the difference is the point:
 * `IF … BEGIN PRINT END BEGIN <create> END` leaves depth at 1 while the create sits in a bare
 * block the IF never opened. So the walk starts at the block this IF opened and fails the moment
 * that specific block closes.
 *
 * BEGIN TRANSACTION opens no block an END closes, so it is not read as one. A stray `END` from a
 * CASE drives the depth negative and the guard is refused — the fail-closed direction, matching
 * the rest of this file: a false alarm costs one restatement, a false pass costs MJ#4503 again.
 */
const BLOCK_BEGIN_SRC = String.raw`BEGIN\b(?!\s+(?:TRAN|TRANSACTION|DISTRIBUTED)\b)`;
const BLOCK_OPENER_RE = new RegExp(String.raw`^\s*` + BLOCK_BEGIN_SRC, 'i');
const BLOCK_EDGE_RE = new RegExp(String.raw`\b(?:(${BLOCK_BEGIN_SRC})|(END\b))`, 'gi');

function governsStatementAfter(head, from) {
  // String literals blanked as well as comments: `PRINT 'THE END'` must not close a block.
  const tail = maskInertText(head.slice(from), { blankStrings: true });
  const opener = BLOCK_OPENER_RE.exec(tail);
  // No block: the IF governs exactly the next statement, so the create has to BE that statement.
  if (!opener) return tail.trim() === '';
  let depth = 1;
  for (const edge of tail.slice(opener[0].length).matchAll(BLOCK_EDGE_RE)) {
    depth += edge[1] ? 1 : -1;
    if (depth <= 0) return false; // the block this IF opened closed before reaching the create
  }
  return true;
}

function isGuardedFor(head, idRef, table) {
  const ref = idRef.startsWith('@') ? `${escapeForRegExp(idRef)}\\b` : `N?${escapeForRegExp(idRef)}`;
  // Left-anchored so the column is the primary key itself and not merely a name ENDING in it.
  // Unanchored, the `ID]` closing `[EntityID]` satisfied this, which made EntityID, CategoryID,
  // TemplateID and ApplicationID all read as primary-key guards — and a predicate on a foreign
  // key answers a different question than "does THIS row already exist". A leading `.` or space
  // is still fine, so `[T].[ID]`, `T.ID` and a bare `ID` all still match.
  const idTest = new RegExp(`(?<![\\w\\]])\\[?ID\\]?\\s*=\\s*${ref}`, 'i');
  // An optional schema qualifier, bracketed or bare, so a hand-written `FROM __mj.Foo` and
  // the emitted `FROM [${flyway:defaultSchema}].[Foo]` are both recognised.
  const tableTest = new RegExp(
    `\\bFROM\\s+(?:(?:\\[[^\\]]+\\]|[^\\s.\\[\\]]+)\\s*\\.\\s*)?\\[?${escapeForRegExp(table)}\\]?(?!\\w)`,
    'i',
  );
  for (const m of head.matchAll(/IF\s+NOT\s+EXISTS\s*(?=\()/gi)) {
    const open = m.index + m[0].length;
    const predicate = readParenGroup(head, open);
    if (predicate === null || !idTest.test(predicate) || !tableTest.test(predicate)) continue;
    // readParenGroup returns the text BETWEEN the parens, so the ')' sits at
    // open + 1 + predicate.length and the governed span starts one past it.
    if (governsStatementAfter(head, open + predicate.length + 2)) return true;
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
    // Two maskings of the same batch, and slice the ORIGINAL for anything re-emitted — every
    // masking is length-preserving, so an offset is valid in all three. `codeOnly` hides string
    // literals as well as comments and is what the walk reads; `code` keeps the literals, because
    // the @ID GUID lives inside one and so does the ';' the quote postcondition catches.
    const code = maskInertText(batch);
    const codeOnly = maskInertText(batch, { blankStrings: true });
    const assignments = literalGuidAssignments(code);
    const calls = findCreateCalls(codeOnly, code);

    // Before anything else: a create the walk resolved but could not parse is refused BY NAME.
    // Raised ahead of the `calls.length === 0` return below, because a batch whose only create is
    // unparseable would otherwise return silently — which is how every fail-open shape in this
    // file's history presented itself: not as a wrong answer, but as no answer at all.
    for (const call of calls) {
      if (!call.refusal) continue;
      throw new Error(
        `${label}: ${call.module} ${call.refusal}. Refusing to certify a create this tool cannot read.`,
      );
    }

    if (calls.length === 0) return batch;

    // The emitter (SQLServerDataProvider.RenderReplaySaveSQL, PR #4519) puts exactly one
    // create call in each GO batch — true for all 567 in migrations/v6. Older hand-written
    // migrations (pre-dating that convention, e.g. a "MANUAL PATCH" block) can pack several
    // into one batch; each is judged independently below rather than assumed away.
    let out = '';
    let cursor = 0;
    for (const m of calls) {
      // Sliced from `batch`, never from either masking: a blanked comment or string inside an
      // argument list would otherwise be re-emitted blanked into both guard branches.
      const schema = batch.slice(m.schemaStart, m.schemaEnd);
      const args = batch.slice(m.argsStart, m.end - 1);
      // The proc's own spelling is reused rather than rebuilt from a canonical prefix: the
      // author's `[__mj]`, `EXECUTE` and `@rc =` are all preserved for the same reason, and a
      // rewrite that normalises what it did not have to is a silent change nobody asked for.
      const createName = m.module;
      const updateName = `spUpdate${m.module.slice('spCreate'.length)}`;
      // `EXEC @rc = …` captures the proc's return status. It must appear in BOTH branches, or
      // the ELSE path quietly stops setting the local the author is about to read.
      const invoke = (proc) => `${m.keyword} ${m.returnStatus ? `${m.returnStatus} = ` : ''}${schema}.${proc} ${args};`;

      // Postcondition on the capture itself: the terminator scan stops at the FIRST
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
          `${label}: EXEC capture for ${createName} has an unbalanced quote — the capture ` +
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
            `${label}: ${createName} is called with positional arguments, so its @ID cannot be ` +
              `located. Refusing to certify a create whose identity this tool cannot read — ` +
              `rewrite the call with named parameters (@ID = …).`,
          );
        // Genuinely no @ID among the named arguments: the SP defaults it, nothing to collide with.
        out += batch.slice(cursor, m.end);
        cursor = m.end;
        continue;
      }
      const idRef = idArg[1] ?? `'${idArg[2]}'`;
      // idArg[1] carries the leading `@` (e.g. `@ID_8f85b67b`); the assignment regexes'
      // capture group excludes it (they key on `ID_8f85b67b`) — strip it before the lookup.
      const guid = idArg[1]
        ? localGuidAt(assignments, idArg[1].slice(1), m.at)
        : idArg[2]?.toUpperCase();
      if (!guid || !GUID.test(guid)) {
        skipped++;
        out += batch.slice(cursor, m.end); // computed @ID — cannot collide deterministically
        cursor = m.end;
        continue;
      }

      // Resolved BEFORE the guard check, not after: recognising an existing guard needs the
      // table just as much as emitting a new one does, and without it the check can only
      // verify half of the row's identity.
      const table = procTable.get(createName);
      if (!table)
        throw new Error(
          `${label}: cannot resolve a table for ${createName}. ` +
            `Refusing to guess — a guard naming the wrong table breaks the migration for every database.`,
        );

      if (isGuardedFor(code.slice(cursor, m.at), idRef, table)) {
        out += batch.slice(cursor, m.end); // already guarded, on THIS id AND this table
        cursor = m.end;
        continue;
      }

      const head = batch.slice(cursor, m.at).trimEnd();
      // Shape matches SQLServerDataProvider.RenderReplaySaveSQL in PR #4519 (Layer 1), so a
      // regenerated file and a freshly emitted one are structurally the same statement.
      // `schema` is the create's own spelling, reused verbatim rather than normalised to the
      // placeholder: rewriting a hand-written [__mj] into [${flyway:defaultSchema}] would be a
      // silent semantic change the author never asked for. All 567 shipped creates spell it with
      // the placeholder, so this is byte-identical for every one of them.
      const body =
        `\nIF NOT EXISTS (SELECT 1 FROM ${schema}.[${table}] WHERE [ID] = ${idRef})\n` +
        `BEGIN\n    ${invoke(createName)}\nEND\n` +
        `ELSE\n` +
        `BEGIN\n    ${invoke(updateName)}\nEND\n`;
      out += head + body;
      cursor = m.end;
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

  // Case 12 — a create with NO statement terminator. T-SQL does not require one, so this is a
  // legal fixed-GUID create; the strict matcher ended its capture at the first ';' and therefore
  // matched nothing at all, which the gate reported as "all guarded". A create never seen is
  // the worst of the fail-open shapes because --fix cannot repair what it cannot find. Where the
  // statement ends is genuinely unknowable without a terminator, and guessing the boundary is
  // what the unbalanced-quote postcondition already refuses to do — so refuse, as with a
  // positional call or an unresolvable table.
  const nosemiInput = readFileSync(join(dir, 'no-semicolon-input.sql'), 'utf8');
  try {
    guardFile(nosemiInput, procTable, 'no-semicolon-input.sql');
    console.error('FAIL: a create with no statement terminator passed through unseen');
    failures++;
  } catch (err) {
    if (!/terminator/i.test(err.message)) {
      console.error(`FAIL: wrong error for a create with no terminator: ${err.message}`);
      failures++;
    }
  }

  // Case 13 — `EXEC [__mj].[spCreateX]`, the direct-schema form. Repo vocabulary (two v2
  // migrations use it), fully parseable, and accepted everywhere else in this file:
  // buildProcTableMap's PROC_RE and isGuardedFor's tableTest both take `__mj` or the
  // placeholder. Only the strict matcher did not, so the call was invisible to the gate and to
  // --fix. It
  // must be guarded like any other — and the guard must keep the author's own schema spelling
  // rather than silently rewriting it to the placeholder.
  const directInput = readFileSync(join(dir, 'direct-schema-input.sql'), 'utf8');
  const directExpected = readFileSync(join(dir, 'direct-schema-expected.sql'), 'utf8');
  const directGot = guardFile(directInput, procTable, 'direct-schema-input.sql');
  if (directGot.text !== directExpected || directGot.guarded !== 1 || directGot.skipped !== 0) {
    console.error(
      `FAIL: direct-schema create not guarded (guarded=${directGot.guarded}, skipped=${directGot.skipped})`,
    );
    console.error('--- got ---\n' + directGot.text + '\n--- expected ---\n' + directExpected);
    failures++;
  }

  // Case 14 — the walk must read CODE, not prose. A migration that merely mentions
  // `EXEC spCreateX` in a comment, or carries one inside a dynamic-SQL string, has no create
  // there to guard. Found the honest way: an early recogniser scanned raw text and
  // brought the whole gate down on migrations/v6/V202608301800, which discusses
  // `EXEC spCreateAIModelCost` in a block comment explaining a deprecation. A fail-closed gate
  // still has to be able to tell a statement from a sentence, or it is simply broken.
  //
  // The dynamic-SQL line counts as NOTHING, and that is a change worth recording. It used to
  // count as one skip, because the strict parser read strings-intact text while the backstop
  // masked them — so the same bytes were "not a call" to one matcher and "a call with a computed
  // @ID" to the other. That disagreement is the whole defect this walk removes, and the skip was
  // a symptom of it: a skip is printed in the gate's own output ("N computed-@ID create(s)
  // skipped — cannot collide deterministically"), so reporting a string literal there was the
  // gate stating something untrue about the tree. Recognition is now one text — comments and
  // strings both masked — and a literal is data in both directions.
  const commentedInput = readFileSync(join(dir, 'commented-create-input.sql'), 'utf8');
  const commentedGot = guardFile(commentedInput, procTable, 'commented-create-input.sql');
  if (commentedGot.text !== commentedInput || commentedGot.guarded !== 0 || commentedGot.skipped !== 0) {
    console.error(
      `FAIL: a create named only in comments/strings was treated as real (guarded=${commentedGot.guarded}, skipped=${commentedGot.skipped}, rewritten=${commentedGot.text !== commentedInput})`,
    );
    failures++;
  }

  // Case 15 — the guard's block is closed BEFORE the create. isGuardedFor asked only whether a
  // matching IF NOT EXISTS appeared earlier in the batch, never whether the create sits inside
  // it, so an IF governing an unrelated PRINT certified the create that followed it. The create
  // then runs unconditionally: same collision, and the gate calls it guarded.
  const earlyInput = readFileSync(join(dir, 'guard-closed-early-input.sql'), 'utf8');
  const earlyExpected = readFileSync(join(dir, 'guard-closed-early-expected.sql'), 'utf8');
  const earlyGot = guardFile(earlyInput, procTable, 'guard-closed-early-input.sql');
  if (earlyGot.text !== earlyExpected || earlyGot.guarded !== 1 || earlyGot.skipped !== 0) {
    console.error(
      `FAIL: a guard whose block closed before the create was accepted (guarded=${earlyGot.guarded}, skipped=${earlyGot.skipped})`,
    );
    console.error('--- got ---\n' + earlyGot.text + '\n--- expected ---\n' + earlyExpected);
    failures++;
  }
  // …and the emitted guard must still be recognised with that closed block sitting above it,
  // or --fix would wrap it again on its next run.
  const earlyAgain = guardFile(earlyExpected, procTable, 'guard-closed-early-expected.sql');
  if (earlyAgain.text !== earlyExpected || earlyAgain.guarded !== 0) {
    console.error('FAIL: the emitted guard was not recognised when a closed IF block precedes it');
    failures++;
  }

  // Case 16 — right table, right value, WRONG column. `idTest` was unanchored on the left, so
  // the `ID]` ending `[EntityID]` satisfied it; in MJ that makes EntityID, CategoryID,
  // TemplateID and ApplicationID all read as primary-key guards. A predicate on a foreign key
  // answers a different question than "does THIS row exist", which is the only one that matters.
  const wrongColInput = readFileSync(join(dir, 'wrong-column-guard-input.sql'), 'utf8');
  const wrongColExpected = readFileSync(join(dir, 'wrong-column-guard-expected.sql'), 'utf8');
  const wrongColGot = guardFile(wrongColInput, procTable, 'wrong-column-guard-input.sql');
  if (wrongColGot.text !== wrongColExpected || wrongColGot.guarded !== 1 || wrongColGot.skipped !== 0) {
    console.error(
      `FAIL: a guard on a column that merely ENDS in "ID" was accepted (guarded=${wrongColGot.guarded}, skipped=${wrongColGot.skipped})`,
    );
    console.error('--- got ---\n' + wrongColGot.text + '\n--- expected ---\n' + wrongColExpected);
    failures++;
  }
  const wrongColAgain = guardFile(wrongColExpected, procTable, 'wrong-column-guard-expected.sql');
  if (wrongColAgain.text !== wrongColExpected || wrongColAgain.guarded !== 0) {
    console.error('FAIL: the emitted guard was not recognised when a foreign-key probe precedes it');
    failures++;
  }

  // Case 17 — `EXEC @rc = <proc>`, the return-status form. T-SQL's call grammar is
  // EXEC[UTE] [ @return_status = ] [[[server.]database.]schema.]procedure, and the recogniser
  // modelled only the last two productions, so the assignment prefix put the create outside
  // every pattern in this file at once: the gate printed "all guarded" and --fix reported
  // nothing to repair. Detection alone is not the fix — the prefix has to survive into BOTH
  // branches, or the ELSE quietly stops capturing the status the author asked for.
  const rcInput = readFileSync(join(dir, 'return-status-input.sql'), 'utf8');
  const rcExpected = readFileSync(join(dir, 'return-status-expected.sql'), 'utf8');
  const rcGot = guardFile(rcInput, procTable, 'return-status-input.sql');
  if (rcGot.text !== rcExpected || rcGot.guarded !== 1 || rcGot.skipped !== 0) {
    console.error(
      `FAIL: return-status create not guarded (guarded=${rcGot.guarded}, skipped=${rcGot.skipped})`,
    );
    console.error('--- got ---\n' + rcGot.text + '\n--- expected ---\n' + rcExpected);
    failures++;
  }
  const rcAgain = guardFile(rcExpected, procTable, 'return-status-expected.sql');
  if (rcAgain.text !== rcExpected || rcAgain.guarded !== 0) {
    console.error('FAIL: the emitted return-status guard was not recognised on a second --fix');
    failures++;
  }

  // Case 18 — the return-status prefix with every other axis at its non-canonical end at once:
  // EXECUTE rather than EXEC, `[__mj]` rather than the placeholder. Each was closed in its own
  // round; a recogniser can handle each alone and still miss them combined, which is the whole
  // reason this is pinned rather than argued. All three spellings are the author's and must
  // come back out unchanged.
  const rcxInput = readFileSync(join(dir, 'return-status-execute-direct-input.sql'), 'utf8');
  const rcxExpected = readFileSync(join(dir, 'return-status-execute-direct-expected.sql'), 'utf8');
  const rcxGot = guardFile(rcxInput, procTable, 'return-status-execute-direct-input.sql');
  if (rcxGot.text !== rcxExpected || rcxGot.guarded !== 1 || rcxGot.skipped !== 0) {
    console.error(
      `FAIL: EXECUTE/@rc/__mj create not guarded with its own spellings preserved (guarded=${rcxGot.guarded}, skipped=${rcxGot.skipped})`,
    );
    console.error('--- got ---\n' + rcxGot.text + '\n--- expected ---\n' + rcxExpected);
    failures++;
  }
  const rcxAgain = guardFile(rcxExpected, procTable, 'return-status-execute-direct-expected.sql');
  if (rcxAgain.text !== rcxExpected || rcxAgain.guarded !== 0) {
    console.error('FAIL: the emitted EXECUTE/@rc guard was not recognised on a second --fix');
    failures++;
  }

  // Case 19 — a three-part name, the other half of the same grammar production the
  // return-status prefix sits in. One qualifier level was admitted, so `db.schema.spCreateX`
  // matched nothing and passed silently. Refuse rather than guard: the guard's SELECT would
  // have to name the table in that other database, which this tool has never emitted, and a
  // guard reading the wrong database is one that is never true — the cross-table failure of
  // Case 9 with a wider blast radius.
  const multipartInput = readFileSync(join(dir, 'multipart-name-input.sql'), 'utf8');
  try {
    guardFile(multipartInput, procTable, 'multipart-name-input.sql');
    console.error('FAIL: a multi-part-named create passed through unexamined');
    failures++;
  } catch (err) {
    if (!/multi-part/i.test(err.message)) {
      console.error(`FAIL: wrong error for a multi-part-named create: ${err.message}`);
      failures++;
    }
  }

  // Case 20 — the counterweight, and a regression guard rather than a new behaviour: the walk
  // inspects EVERY EXEC in every migration now, not only ones already shaped like a create, so
  // the cost of closing the shape holes is paid here. `EXEC sp_executesql`, `EXEC (@sql)`, a
  // return-status call to a non-create proc, and a module name held in a variable must all pass
  // over in silence. Noisy-closed is still broken: a gate that raises on ordinary T-SQL is one
  // nobody can keep green, and a gate nobody keeps green stops being a gate.
  const nonCreateInput = readFileSync(join(dir, 'non-create-execs-input.sql'), 'utf8');
  try {
    const nonCreateGot = guardFile(nonCreateInput, procTable, 'non-create-execs-input.sql');
    if (nonCreateGot.text !== nonCreateInput || nonCreateGot.guarded !== 0 || nonCreateGot.skipped !== 0) {
      console.error(
        `FAIL: ordinary non-create EXECs were not left alone (guarded=${nonCreateGot.guarded}, skipped=${nonCreateGot.skipped}, rewritten=${nonCreateGot.text !== nonCreateInput})`,
      );
      failures++;
    }
  } catch (err) {
    console.error(`FAIL: ordinary non-create EXECs raised: ${err.message}`);
    failures++;
  }

  console.log(failures === 0 ? 'self-test: PASS (20 cases)' : `self-test: FAIL (${failures})`);
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
      // Deliberately broader than the walk itself — the bare identifier, with no call grammar
      // around it. A pre-filter narrower than the detector is a fail-open hole in its own right:
      // it decides a file is uninteresting before anything has looked at it, which is precisely
      // how every shape in this file's history escaped. Cheap, and it can only over-admit.
      if (!/spCreate/i.test(sql)) continue;
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
