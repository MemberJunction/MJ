#!/usr/bin/env node
/**
 * PG migration CONTENT check — the sibling of check-pg-migration-parity.mjs.
 *
 * WHY THIS EXISTS
 * ---------------
 * check-pg-migration-parity.mjs asserts a `.pg.sql` counterpart EXISTS. Nothing
 * asserts it contains anything. That gap has shipped a broken release:
 *
 *   v5.45  V202607071019__v5.45.x__Metadata_Sync.sql   12,041 lines
 *          V202607071019__v5.45.x__Metadata_Sync.pg.sql   126 BYTES (2 comments)
 *
 * PostgreSQL deployments migrating through v5.45 silently received none of that
 * release's curated metadata. Every automated check passed, because the check
 * everyone treats as authoritative — a clean `mj migrate` on a fresh PG database —
 * is structurally incapable of catching it: EMPTY SQL APPLIES CLEANLY.
 *
 * The same failure recurred during the v5.49.0 build: `mj migrate convert` emitted
 * three header-only stubs and one file containing six bare `;` where six
 * CREATE INDEX statements belonged, while reporting `unhandled stmts: 0` and
 * exiting 0. It was caught by hand-diffing line counts. This script is that diff,
 * made non-optional.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not judge SQL correctness — `mj migrate` on a fresh DB does that, and
 * does it well. This only answers "did the converter silently drop everything?"
 *
 * INTENTIONALLY-EMPTY COUNTERPARTS
 * --------------------------------
 * Some counterparts are legitimately empty. In v5.49.0 two were: the SS migration
 * altered `spUpdateExistingEntityFieldsFromSchema`, which PostgreSQL maintains in
 * TypeScript (CodeGenLib/.../postgresql/metadataSupportObjects.ts), not in a
 * migration. A blunt "empty = fail" rule would cry wolf and be disabled inside two
 * releases.
 *
 * So the rule is not "is this empty?" but "is this empty AND undocumented?".
 * An intentionally-empty counterpart must declare itself:
 *
 *     -- PG-EMPTY-BY-DESIGN: <reason>
 *
 * That converts a convention a reviewer might notice into a postcondition that
 * cannot be skipped, while leaving the judgement itself with the human.
 *
 * USAGE
 *   node scripts/check-pg-migration-content.mjs              # check the repo
 *   node scripts/check-pg-migration-content.mjs --self-test  # validate the detector
 *
 * EXIT  0 = clean · 1 = suspect counterpart(s) · 2 = usage error
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SS_DIR = 'migrations/v5';
const PG_DIR = 'migrations-pg/v5';

/**
 * A source this small can legitimately FUSE to a single PG statement — e.g. the
 * committed v5.39 pair where an IF EXISTS guard + sp_dropextendedproperty +
 * sp_addextendedproperty (4 SS statements) correctly becomes one COMMENT ON TABLE.
 * The floor applies ONLY to the pg=1 band. A counterpart with ZERO content
 * statements is suspect at ANY source size: fusion can shrink output, but never
 * to nothing. Empirically (all 193 committed pairs as of v5.49.0): every real
 * escape scored pg=0; every legitimately-thin counterpart scored pg=1 with ss<=4.
 */
export const SOURCE_STATEMENT_FLOOR = 5;
/** At/below this many real statements, a counterpart is "effectively empty". */
export const PG_EMPTY_CEILING = 1;

const DESIGN_TOKEN = /^\s*--\s*PG-EMPTY-BY-DESIGN:\s*\S/m;

/**
 * Grandfathered counterparts — a RATCHET, not an amnesty.
 *
 * These predate the PG-EMPTY-BY-DESIGN convention and CANNOT be retrofitted:
 * committed `.pg.sql` files are byte-for-byte immutable because Flyway checksums
 * them, so editing one breaks `mj migrate` on every deployment that already applied
 * it. The reason therefore lives here instead of in the file.
 *
 * Anything NOT on this list must be fixed or must declare itself. Do not add
 * entries to silence a new failure — that is the exact reflex this script exists
 * to prevent. Add one only for a file that is genuinely immutable AND genuinely
 * correct, with the reason written out.
 */
const GRANDFATHERED = new Map([
  ['V202605281538__v5.38.x__Fix_AllowUpdateAPI_On_Virtual_Transition',
   'Correctly empty. Alters spUpdateExistingEntityFieldsFromSchema, which PostgreSQL ' +
   'maintains in CodeGenLib/.../postgresql/metadataSupportObjects.ts, not in a migration.'],

  ['V202607071019__v5.45.x__Metadata_Sync',
   'NOT correct — a real, shipped gap (issue #3253). The converter emitted a 126-byte ' +
   'reseed marker for 12,041 lines of metadata DML. Immutable now; healed forward by ' +
   'V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql (see ' +
   'DEPLOYMENT.md ("How to heal a ledger gap")).'],

  ['V202607202000__v5.49.x__SS_Materialize_Catalog_Views_spUpdateExistingEntityFields',
   'Correctly empty — same proc/TypeScript split as the v5.38 entry above. Committed ' +
   'before this check existed; PG side landed in metadataSupportObjects.ts via d23aa8952c.'],

  ['V202607202100__v5.49.x__SoftPK_Guard_Materialized_spUpdateExistingEntityFieldsFromSchema',
   'Correctly empty — same proc/TypeScript split. The U2 soft-PK guard is present in ' +
   'metadataSupportObjects.ts with matching semantics.'],

  ['V202607202110__v5.49.x__Fix_ConversationDetail_Sequence_Deadlock',
   'Correctly empty — PostgreSQL never had the AFTER-trigger deadlock the SS migration ' +
   'fixes; its trigger is already BEFORE ROW + pg_advisory_xact_lock. The file carries a ' +
   'prose explanation but predates the machine-readable token.'],
]);

/**
 * Delete-parity ratchet — the 10 metadata syncs whose record deletions never reached
 * PostgreSQL (196 deletions, v5.9 through v5.45; issue #3253). Every one is a committed,
 * Flyway-checksummed `.pg.sql` and therefore immutable — the gap is healed forward, not
 * by editing history. v5.45's ComponentRegistry row is removed by
 * V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql; the other 195 targets were
 * verified absent from the fresh-install path.
 *
 * The converter now converts all 196 (StatementClassifier's bare-EXEC carve-out plus
 * ExecBlockRule.splitIntoBlocks), so any NEW release must have parity. Do not add
 * entries here to silence a failure — a new gap means the converter dropped a statement.
 */
const DELETE_PARITY_GRANDFATHERED = new Map([
  ['V202603081507__v5.9.x__Metadata_Sync', '1 deletion lost'],
  ['V202603161414__v5.12.x__Metadata_Sync', '23 deletions lost'],
  ['V202603192021__v5.14.x__Metadata_Sync', '149 deletions lost'],
  ['V202603221948__v5.15.x__Metadata_Sync', '7 deletions lost'],
  ['V202604031940__v5.23.x__Metadata_Sync', '7 deletions lost'],
  ['V202604221600__v5.29.x__Metadata_Sync', '1 deletion lost'],
  ['V202605021448__v5.31.x__Metadata_Sync', '2 deletions lost'],
  ['V202605201903__v5.35.x__Metadata_Sync', '1 deletion lost'],
  ['V202605291451__v5.38.x__Metadata_Sync', '4 deletions lost'],
  ['V202607071019__v5.45.x__Metadata_Sync', '1 deletion lost — healed by the v5.50 reseed'],
]);

/**
 * Boilerplate every converted file carries. These are real statements but say
 * nothing about whether the migration's CONTENT survived, so they don't count.
 */
const BOILERPLATE = [
  /^\s*CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS/i,
  /^\s*CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS/i,
  /^\s*SET\s+search_path/i,
  /^\s*SET\s+standard_conforming_strings/i,
];

/**
 * Count statements that carry actual migration content.
 *
 * Deliberately counts STATEMENTS, not lines: the v5.49 `Backfill_Missing_FK_Auto_Indexes`
 * failure emitted six bare `;` — 23 lines of "output" carrying zero statements. A
 * line-count heuristic scores that 23 and waves it through; this scores it 0.
 *
 * KNOWN HEURISTIC EDGES (accepted — this is a magnitude detector, not a parser):
 * - `--` or `/*` inside a string literal is mis-stripped as a comment. Worst case a
 *   statement is miscounted, never zeroed, so the empty-vs-nonempty verdict holds.
 * - The SS side assumes `;`-terminated statements. A T-SQL file written with bare
 *   `GO` batches and no semicolons under-counts (each batch scores as one trailing
 *   block at most). MJ migrations are semicolon-terminated by convention; if that
 *   ever changes, revisit this before trusting the ss counts.
 */
export function countContentStatements(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const lines = withoutBlockComments
    .split('\n')
    .map((l) => l.replace(/--.*$/, '').trim())
    .filter(Boolean);

  let count = 0;
  let buffer = '';
  for (const line of lines) {
    buffer += (buffer ? ' ' : '') + line;
    if (!line.endsWith(';')) continue;

    const stmt = buffer.trim();
    buffer = '';
    if (stmt === ';') continue;                              // a bare `;` is not content
    if (BOILERPLATE.some((re) => re.test(stmt))) continue;   // header scaffolding
    count++;
  }
  if (buffer.trim()) count++;                                // trailing unterminated block
  return count;
}

/** @returns {{verdict:'ok'|'documented'|'suspect', ssStmts:number, pgStmts:number}} */
export function classify(ssSql, pgSql) {
  const ssStmts = countContentStatements(ssSql);
  const pgStmts = countContentStatements(pgSql);
  const ok = { verdict: 'ok', ssStmts, pgStmts };
  const emptyVerdict = { verdict: DESIGN_TOKEN.test(pgSql) ? 'documented' : 'suspect', ssStmts, pgStmts };

  if (ssStmts === 0) return ok;                        // comment-only source: nothing to preserve
  if (pgStmts === 0) return emptyVerdict;              // fusion never reaches zero — suspect at ANY source size
  if (pgStmts > PG_EMPTY_CEILING) return ok;
  if (ssStmts <= SOURCE_STATEMENT_FLOOR) return ok;    // pg=1 from a thin source: plausible statement fusion
  return emptyVerdict;                                 // pg=1 from a big source: near-empty, must declare
}

/**
 * mj-sync emits a record DELETION as a bare, single-argument sp call — on the SS side
 * `EXEC [schema].[spDeleteX] @ID = '<uuid>'`, on the PG side
 * `PERFORM schema."spDeleteX"(p_ID := '<uuid>')`. Requiring that one ID argument is what
 * separates a data deletion from everything else named spDelete: CodeGen's maintenance
 * procs (spDeleteUnneededEntityFields) take no ID, and CREATE/DROP FUNCTION statements
 * define the sproc rather than call it. None of those are counted.
 *
 * DELIBERATELY NOT END-ANCHORED, unlike the sibling pattern in StatementClassifier that
 * decides whether the converter handles a batch. That one requires the argument to be the
 * end of the batch, so a trailing comment or a second parameter makes the converter fall
 * back to skipping the statement silently. This one still counts those, which is what
 * turns a silent drop into a failed build. Aligning the two regexes would feel tidier and
 * would delete the safety net: the gate must be able to see deletions the converter cannot.
 */
const SS_SYNC_DELETE = /EXEC\s+\[?[\w${}:]+\]?\s*\.\s*\[?spDelete\w+\]?\s+@ID\s*=\s*N?'[0-9a-fA-F-]{36}'/gi;
const PG_SYNC_DELETE = /PERFORM\s+[\w"]+\s*\.\s*"spDelete\w+"\s*\(\s*p_ID\s*:=\s*'[0-9a-fA-F-]{36}'/gi;

/**
 * Character ranges occupied by comments, skipping over string literals.
 *
 * Being literal-aware is load-bearing rather than fastidious. Metadata syncs carry prompt
 * and component source inside string literals, and 7 of the 49 have unbalanced `/*` vs
 * `*​/` counts because of it. A regex strip pairs a `/*` living inside a literal with a
 * `*​/` from a real comment further down and removes everything between. Since the SS and
 * PG texts differ, that can drop a deletion from one side only (a false failure) or from
 * both (silently hiding a real gap, which is the exact thing this gate exists to catch).
 * Scanning is the only way to tell a comment from text that merely looks like one.
 *
 * Returns ranges instead of stripped text on purpose: the caller only needs to know
 * whether a match landed in a comment, and building a cleaned copy of every migration
 * costs several seconds across the repo for a string nothing reads.
 */
function commentRanges(sql) {
  const ranges = [];
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }   // doubled-quote escape
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const start = i;
      while (i < n && sql[i] !== '\n') i++;
      ranges.push([start, i]);
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(i + 2, n);                                            // unterminated runs to EOF
      ranges.push([start, i]);
      continue;
    }
    i++;
  }
  return ranges;
}

/**
 * Count mj-sync record deletions on each side of a counterpart pair.
 *
 * WHY A DEDICATED CHECK: `classify` is a magnitude detector — it answers "did the
 * converter drop EVERYTHING?". A metadata sync with 194 saves and 1 deletion that loses
 * only the deletion still scores hundreds of statements on both sides and sails through.
 * That is precisely what happened: 196 deletions across 10 releases (v5.9–v5.45) reached
 * ZERO committed PG counterparts, invisible to every automated check (issue #3253). Size
 * diffing cannot see one missing statement; counting the statements can.
 *
 * @returns {{ss:number, pg:number, matched:boolean}}
 */
export function deleteParity(ssSql, pgSql) {
  const ss = countSyncDeletes(ssSql, SS_SYNC_DELETE);
  const pg = countSyncDeletes(pgSql, PG_SYNC_DELETE);
  return { ss, pg, matched: ss === pg };
}

/**
 * Count deletions that are real code rather than commented-out text.
 *
 * The `spDelete` pre-test skips the character scan for migrations that mention no sproc
 * deletion at all, which is most of them. It cannot change a result: a file with no
 * `spDelete` token has nothing for the pattern to match, comments or not.
 */
function countSyncDeletes(sql, pattern) {
  if (!/spDelete/i.test(sql)) return 0;
  const ranges = commentRanges(sql);
  let count = 0;
  for (const m of sql.matchAll(pattern)) {
    if (!ranges.some(([start, end]) => m.index >= start && m.index < end)) count++;
  }
  return count;
}

/**
 * Reduce per-pair deletion counts to the ones that must FAIL the gate.
 *
 * Parity is an equality, not a floor: a counterpart that gained a deletion the source
 * never had would remove a row SQL Server keeps, diverging the two platforms just as
 * badly as losing one.
 *
 * @param {Array<{stem:string, ss:number, pg:number}>} entries every checked pair
 * @param {Iterable<string>} grandfatheredStems immutable pairs that already shipped gapped
 * @returns {Array<{stem:string, ss:number, pg:number}>}
 */
export function deleteParityGaps(entries, grandfatheredStems) {
  const shielded = new Set(grandfatheredStems);
  return entries.filter((e) => e.ss !== e.pg && !shielded.has(e.stem));
}

/**
 * Same ratchet-hygiene job as `staleGrandfatherWarnings`, for the delete-parity map.
 *
 * The two stale cases need different advice and must not be collapsed. "The gap is gone,
 * remove the entry" is wrong when the truth is that the pair was never checked, because
 * no `.pg.sql` counterpart exists for it yet — that entry is still doing its job, or is a
 * typo, and either way the fix is not deletion.
 *
 * @param {Iterable<string>} grandfatheredStems
 * @param {Map<string,{ss:number, pg:number}>} parityByStem every checked pair
 * @returns {string[]} one warning per stale entry
 */
export function staleDeleteGrandfatherWarnings(grandfatheredStems, parityByStem) {
  const warnings = [];
  for (const stem of grandfatheredStems) {
    const parity = parityByStem.get(stem);
    if (parity === undefined) {
      warnings.push(
        `stale DELETE_PARITY_GRANDFATHERED entry "${stem}" — no committed counterpart pair ` +
        `matches it (file renamed/removed, or a typo in the entry). Remove or correct the entry.`,
      );
    } else if (parity.ss === parity.pg) {
      warnings.push(
        `stale DELETE_PARITY_GRANDFATHERED entry "${stem}" — it no longer has a deletion gap ` +
        `(source ${parity.ss}, counterpart ${parity.pg}), so the entry shields nothing. Remove it.`,
      );
    }
  }
  return warnings;
}

/**
 * The GRANDFATHERED map is load-bearing — the gate is green partly because of it.
 * An entry whose stem no longer matches a checked pair (renamed/removed file, or a
 * typo when the entry was added), or whose pair no longer classifies as suspect, is
 * dead weight that silently misstates what the map shields. Warn, don't fail:
 * committed `.pg.sql` files are immutable, so a stale entry can't mask a NEW escape
 * (an unmatched suspect still fails loudly) — it can only lie about history.
 *
 * @param {Iterable<string>} grandfatheredStems
 * @param {Map<string,string>} verdictByStem verdict for every checked pair
 * @returns {string[]} one warning per stale entry
 */
export function staleGrandfatherWarnings(grandfatheredStems, verdictByStem) {
  const warnings = [];
  for (const stem of grandfatheredStems) {
    if (!verdictByStem.has(stem)) {
      warnings.push(
        `stale GRANDFATHERED entry "${stem}" — no committed counterpart pair matches it ` +
        `(file renamed/removed, or a typo in the entry). Remove or correct the entry.`,
      );
    } else if (verdictByStem.get(stem) !== 'suspect') {
      warnings.push(
        `stale GRANDFATHERED entry "${stem}" — it no longer classifies as suspect ` +
        `(verdict: ${verdictByStem.get(stem)}), so the entry shields nothing. Remove it.`,
      );
    }
  }
  return warnings;
}

function runCheck() {
  if (!existsSync(SS_DIR) || !existsSync(PG_DIR)) {
    console.error(`Run from the repo root — ${SS_DIR} / ${PG_DIR} not found.`);
    return 2;
  }

  const suspects = [];
  const verdictByStem = new Map();
  // Every checked pair, not only those with deletions: a grandfathered entry whose gap
  // closed and one whose counterpart does not exist yet are different situations needing
  // different advice, and recording only the gapped pairs makes them indistinguishable.
  const parityByStem = new Map();
  let checked = 0;
  let documented = 0;
  let grandfathered = 0;

  for (const f of readdirSync(SS_DIR).filter((f) => /^V\d{12}__.*\.sql$/.test(f)).sort()) {
    const stem = basename(f, '.sql');
    const pgPath = join(PG_DIR, `${stem}.pg.sql`);
    if (!existsSync(pgPath)) continue;   // existence is check-pg-migration-parity.mjs's job

    checked++;
    const ssSql = readFileSync(join(SS_DIR, f), 'utf8');
    const pgSql = readFileSync(pgPath, 'utf8');
    const { verdict, ssStmts, pgStmts } = classify(ssSql, pgSql);
    const { ss, pg } = deleteParity(ssSql, pgSql);
    parityByStem.set(stem, { ss, pg });
    verdictByStem.set(stem, verdict);
    if (verdict === 'documented') {
      documented++;
      console.log(`ok (documented no-op): ${stem}`);
    } else if (verdict === 'suspect') {
      if (GRANDFATHERED.has(stem)) {
        grandfathered++;
        console.log(`ok (grandfathered)   : ${stem}`);
      } else {
        suspects.push({ stem, ssStmts, pgStmts });
      }
    }
  }

  for (const w of staleGrandfatherWarnings(GRANDFATHERED.keys(), verdictByStem)) {
    console.warn(`WARNING: ${w}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::${w}`);
  }

  const deleteCounts = [...parityByStem].map(([stem, p]) => ({ stem, ...p }));
  const withDeletions = deleteCounts.filter((e) => e.ss > 0 || e.pg > 0).length;
  const deleteGaps = deleteParityGaps(deleteCounts, DELETE_PARITY_GRANDFATHERED.keys());
  for (const w of staleDeleteGrandfatherWarnings(DELETE_PARITY_GRANDFATHERED.keys(), parityByStem)) {
    console.warn(`WARNING: ${w}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::${w}`);
  }

  if (deleteGaps.length > 0) {
    console.error(`\nPG delete parity FAILED — ${deleteGaps.length} counterpart(s) disagree on record deletions:\n`);
    for (const g of deleteGaps) {
      console.error(`  ${g.stem}`);
      console.error(`      source performs ${g.ss} mj-sync deletion(s); PG counterpart performs ${g.pg}.`);
    }
    console.error(`
mj-sync emits deletions as bare 'EXEC [schema].[spDeleteX] @ID = ...' batches. The legacy
converter used to skip those silently — 196 deletions across v5.9-v5.45 reached zero PG
counterparts before anyone noticed (issue #3253). A size diff cannot see one missing
statement, so this counts them instead.

Re-convert the counterpart. If the deletion genuinely does not apply to PostgreSQL, port it
by hand as a guarded block and say why in the migration:

    DO $mj$ BEGIN
      IF EXISTS (SELECT 1 FROM __mj."<Table>" WHERE "ID" = '<uuid>') THEN
        PERFORM __mj."spDelete<Table>"(p_ID := '<uuid>');
      END IF;
    END $mj$;
`);
  }

  if (suspects.length === 0 && deleteGaps.length === 0) {
    console.log(
      `PG content OK — ${checked} counterpart(s) checked, ` +
      `${documented} documented no-op(s), ${grandfathered} grandfathered, 0 suspect. ` +
      `Delete parity OK — ${withDeletions} pair(s) with deletions, ` +
      `${DELETE_PARITY_GRANDFATHERED.size} grandfathered, 0 mismatched.`,
    );
    return 0;
  }
  if (suspects.length === 0) return 1;

  console.error(`\nPG content FAILED — ${suspects.length} counterpart(s) look silently emptied:\n`);
  for (const s of suspects) {
    console.error(`  ${s.stem}`);
    console.error(`      source has ${s.ssStmts} content statement(s); PG counterpart has ${s.pgStmts}.`);
  }
  console.error(`
This is the failure mode that shipped in v5.45 (see the header of this script) and
recurred during the v5.49.0 build. The converter can report success while writing
nothing, and a clean 'mj migrate' cannot detect it because empty SQL applies fine.

For each file above, do ONE of:

  1. Re-convert / hand-author the missing DDL. Check git history first — feature PRs
     sometimes authored a counterpart that was later deleted by policy:
         git log --all --oneline --diff-filter=A -- '*<Name>.pg.sql'

  2. If the counterpart is CORRECTLY empty (e.g. PostgreSQL maintains that routine in
     TypeScript, or never had the defect the SS migration fixes), declare it in the file:
         -- PG-EMPTY-BY-DESIGN: <why, and what carries the change instead>
`);
  return 1;
}

// ── Self-test ───────────────────────────────────────────────────────────────────
// Fixtures are the REAL shapes seen in production, not invented ones.
function selfTest() {
  let fail = 0;
  const assert = (expected, ss, pg, label) => {
    const { verdict } = classify(ss, pg);
    if (verdict === expected) {
      console.log(`ok   (${expected.padEnd(10)}): ${label}`);
    } else {
      console.log(`FAIL (expected ${expected}, got ${verdict}): ${label}`);
      fail = 1;
    }
  };

  const HEADER = `-- ============================================================================
-- MemberJunction PostgreSQL Migration — X.sql
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;
`;

  const REAL_SOURCE = Array.from(
    { length: 12 },
    (_, i) => `CREATE INDEX IX_${i} ON __mj.T${i} (C${i});`,
  ).join('\n');

  // ── Must FLAG ──
  assert('suspect', REAL_SOURCE, HEADER + '\n-- X.sql — no DDL to translate.\n',
    'header-only stub ("no DDL to translate") [v5.49 Fix_ConversationDetail_Sequence_Deadlock]');

  assert('suspect', REAL_SOURCE, HEADER + '\n;\n\n;\n\n;\n\n;\n\n;\n\n;\n',
    'bare semicolons, no statements [v5.49 Backfill_Missing_FK_Auto_Indexes]');

  assert('suspect',
    Array.from({ length: 400 }, (_, i) => `EXEC __mj.spCreateThing @ID='${i}';`).join('\n'),
    '-- Metadata_Sync.sql — no DDL to translate.\n-- Metadata is re-seeded via `mj sync push` against PG.\n',
    '126-byte reseed marker [v5.45 Metadata_Sync — actually shipped]');

  assert('suspect', REAL_SOURCE, HEADER,
    'header only, nothing after it at all');

  assert('suspect', REAL_SOURCE,
    HEADER + '\n/* CREATE INDEX IX_0 ON __mj.T0 (C0); */\n',
    'content present but entirely commented out');

  assert('suspect',
    Array.from({ length: 5 }, (_, i) => `CREATE INDEX IX_${i} ON __mj.T${i} (C${i});`).join('\n'),
    HEADER,
    '5-statement source emptied — small backfills are exactly the shape that gets silently dropped');

  assert('suspect', 'ALTER TABLE __mj.T ADD C INT NULL;', HEADER,
    'single-statement source emptied — fusion can shrink output but never to zero');

  // ── Must NOT flag ──
  assert('documented', REAL_SOURCE,
    HEADER + '\n-- PG-EMPTY-BY-DESIGN: PG maintains this proc in metadataSupportObjects.ts.\n',
    'intentionally empty WITH the declaration token');

  assert('documented', 'ALTER TABLE __mj.T ADD C INT NULL;',
    HEADER + '\n-- PG-EMPTY-BY-DESIGN: PG maintains this proc in metadataSupportObjects.ts.\n',
    'tiny source, intentionally empty WITH the declaration token');

  assert('ok', REAL_SOURCE,
    HEADER + Array.from({ length: 12 }, (_, i) =>
      `CREATE INDEX IF NOT EXISTS "IX_${i}" ON __mj."T${i}" USING btree ("C${i}");`).join('\n'),
    'genuine full conversion');

  assert('ok', 'ALTER TABLE __mj.T ADD C INT NULL;',
    HEADER + 'ALTER TABLE __mj."T" ADD COLUMN "C" INT NULL;\n',
    'tiny source converted 1:1 — must not false-positive on a legitimately thin migration');

  assert('ok',
    'IF EXISTS (SELECT 1 FROM x) BEGIN EXEC sp_dropextendedproperty @a = 1; END;\nEXEC sp_addextendedproperty @a = 1;\nGO',
    HEADER + 'COMMENT ON TABLE __mj."T" IS \'text\';\n',
    'thin source FUSED to one statement [committed v5.39 extended-property pair] — pg=1 band keeps the floor');

  assert('ok', REAL_SOURCE,
    HEADER + '\nDO $mj$\nDECLARE p_ID UUID;\nBEGIN\n  p_ID := gen_random_uuid();\n  PERFORM __mj."spCreateThing"(p_ID := p_ID);\nEND $mj$;\n',
    'multi-line DO $mj$ block counts as content [v5.49 Metadata_Sync, correct output]');

  assert('ok', REAL_SOURCE,
    HEADER + '\n-- a comment ending in a semicolon;\nCREATE INDEX "IX_a" ON __mj."T" ("C");\nCREATE INDEX "IX_b" ON __mj."T" ("D");\n',
    'comment ending in `;` must not be miscounted as a statement');

  if (fail) {
    console.log('\nSELF-TEST FAILED');
    return 1;
  }
  console.log('\nSELF-TEST PASSED');
  return 0;
}

// ── Entry point ─────────────────────────────────────────────────────────────────
// Guarded so the module can be IMPORTED without executing. `classify` and
// `countContentStatements` are exported for unit tests; without this guard a bare
// `import` would run the full repo check and call process.exit, making them
// unreachable to any test that imports them.
function main() {
  const arg = process.argv[2] ?? '';
  if (arg === '--self-test') return selfTest();
  if (arg === '-h' || arg === '--help') {
    console.log('usage: node scripts/check-pg-migration-content.mjs [--self-test]');
    return 0;
  }
  if (arg === '') return runCheck();
  console.error(`unknown argument: ${arg}`);
  return 2;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main());
