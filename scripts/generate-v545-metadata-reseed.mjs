#!/usr/bin/env node
/**
 * Generate the v5.45 metadata reseed migration (issue #3253).
 *
 * v5.45's `Metadata_Sync.pg.sql` shipped as a 126-byte marker, so PostgreSQL
 * deployments that migrated through v5.45 — and fresh installs from the v5.46
 * baseline, which was dumped from such a database — are missing that release's
 * curated metadata. This script derives a forward-dated, idempotent reseed
 * migration from the committed ledger. See DEPLOYMENT.md
 * ("How to heal a ledger gap") for why a reseed and not a history rewrite.
 *
 * Derivation (two steps, both reproducible from the repo):
 *
 *   1. Legacy-convert the SQL Server source (the exact path that produced the
 *      healthy v5.44/v5.47/v5.48/v5.49 counterparts):
 *        cp migrations/v5/V202607071019__v5.45.x__Metadata_Sync.sql <scratch>/src/
 *        npx mj migrate convert --source-dir <scratch>/src --output-dir <scratch>/out \
 *          --file V202607071019__v5.45.x__Metadata_Sync.sql
 *   2. Post-process the converted DML with this script:
 *        node scripts/generate-v545-metadata-reseed.mjs \
 *          --converted <scratch>/out/V202607071019__v5.45.x__Metadata_Sync.pg.sql
 *
 * Transform rules (each assertion fails the run loudly rather than emitting a
 * silently-wrong migration):
 *
 *   - CREATE blocks are wrapped in an `IF EXISTS (… WHERE "ID" = …) THEN RETURN`
 *     guard so the reseed no-ops per-row on databases that already have the row
 *     (someone ran `mj sync push`, or a future whole baseline).
 *   - UPDATE blocks whose target row a LATER release's metadata sync re-updated
 *     are DROPPED: those later updates are full-row and already applied on every
 *     database (the rows pre-date v5.45), so replaying v5.45's values would
 *     revert newer state. The supersession set is COMPUTED by scanning every
 *     `*_Metadata_Sync.sql` after v5.45 in `migrations/v5/`, and each drop is
 *     asserted safe: the later update's field set must be a superset of
 *     v5.45's. Remaining updates replay unconditionally (idempotent by value).
 *   - The DELETE (`spDeleteComponentRegistry`) is synthesized from the SS source
 *     with an `IF EXISTS` guard. The converter DOES emit this delete (the sibling
 *     StatementClassifier/ExecBlockRule fix on this branch closed the silent-drop
 *     that lost it) but emits it unguarded, and while that is already safe to
 *     re-run — PG's spDelete no-ops on a missing row — the guarded form makes this
 *     file's idempotency legible without reading the sproc. `assertDeleteParity`
 *     fails the run if the two sources ever disagree on how many deletes exist.
 *   - Expected shape is pinned (161 creates / 13 updates kept / 20 dropped /
 *     1 delete). If a regeneration ever disagrees — e.g. a future release's
 *     sync supersedes more rows — the script fails so a human re-reviews
 *     instead of the committed migration silently changing.
 *
 * SHELF LIFE: this is a ONE-SHOT artifact. `collectLaterSyncTargets` scans the live
 * `migrations/v5` tree, so the supersession set grows with every future metadata sync.
 * The first release that touches one of the 13 replayed rows will trip `assertShape`
 * and the committed migration will no longer regenerate — by design, because at that
 * point the analysis genuinely needs re-review. Do not read "reproduces byte-for-byte"
 * as a permanent property; it is true as of the release that shipped the file, and
 * `pg-migration-reseed-shape.test.mjs` is what guards the artifact after that.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const V45_SOURCE = 'migrations/v5/V202607071019__v5.45.x__Metadata_Sync.sql';
const V45_TIMESTAMP = '202607071019';
/**
 * The stamp must sit after EVERY migration whose PG counterpart is still pending, not just
 * after v5.49's sync. Flyway runs with `outOfOrder: false` (MJCLI config), so a counterpart
 * generated later but stamped earlier cannot be applied to a database that already ran this
 * file. Two v5.50 SS migrations were still awaiting counterparts when this was authored, so
 * the stamp is deliberately later than all of them. Do not move it earlier "to sit with the
 * release"; the ordering it encodes is load-bearing in both directions.
 */
const OUTPUT_NAME = 'V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql';
const OUTPUT_DEFAULT = `migrations-pg/v5/${OUTPUT_NAME}`;

export const EXPECTED = { creates: 161, updatesKept: 13, updatesDropped: 20, deletes: 1 };

// Guarded so the module can be IMPORTED without executing — `findSupersededCreates` is
// exported for unit tests, and without this guard a bare `import` would run the whole
// generation (and process.exit) before any test could call it.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const convertedText = readFileSync(args.converted, 'utf-8');
  const v45SourceText = readFileSync(V45_SOURCE, 'utf-8');

  const blocks = parseConvertedBlocks(convertedText);
  const laterTouches = collectLaterSyncTargets();
  const v45UpdateFields = collectUpdateFieldSets(v45SourceText);

  assertNoSupersededCreates(blocks, laterTouches);

  const out = [];
  const dropped = [];
  let creates = 0;
  let updatesKept = 0;

  for (const block of blocks) {
    if (block.verb === 'Create') {
      out.push(guardCreate(block));
      creates++;
    } else {
      const later = laterTouches.get(`${block.entity}:${block.id}`);
      // Only a later SAVE supersedes an update. If a later release DELETED the row, this
      // update simply no-ops against a row that is gone (PG's spUpdate returns on
      // ROW_COUNT = 0), so replaying it is harmless and dropping it would need a
      // field-superset proof that a deletion cannot supply.
      if (later && later.verb !== 'Delete') {
        assertSupersessionSafe(block, v45UpdateFields, later);
        dropped.push(block);
      } else {
        out.push(`${block.comment}${block.sql}`);
        updatesKept++;
      }
    }
  }

  const deletes = synthesizeDeletes(v45SourceText);
  assertDeleteParity(convertedText, deletes.length);
  out.push(...deletes.map((d) => d.sql));

  assertShape({ creates, updatesKept, updatesDropped: dropped.length, deletes: deletes.length });

  writeFileSync(args.out, assembleMigration(out, dropped, deletes));
  console.log(`Wrote ${args.out}`);
  console.log(
    `  ${creates} guarded creates, ${updatesKept} updates replayed, ` +
      `${dropped.length} superseded updates dropped, ${deletes.length} guarded delete(s)`
  );
}

function parseArgs(argv) {
  const args = { converted: null, out: OUTPUT_DEFAULT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--converted') args.converted = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else fail(`unknown argument: ${argv[i]}`);
  }
  if (!args.converted) fail('usage: generate-v545-metadata-reseed.mjs --converted <legacy-converted.pg.sql> [--out <path>]');
  return args;
}

/**
 * Extract every `-- Save …` + `DO $mj$ … END $mj$;` pair from the legacy
 * converter's output, classified by verb/entity with its target row ID.
 */
function parseConvertedBlocks(text) {
  const blockRe = /(-- Save [^\n]*\n)(DO \$mj\$\n[\s\S]*?\nEND \$mj\$;)/g;
  const blocks = [];
  for (const m of text.matchAll(blockRe)) {
    const [, comment, sql] = m;
    const perform = sql.match(/PERFORM __mj\."sp(Create|Update)(\w+)"/);
    if (!perform) fail(`block without a recognizable PERFORM call:\n${comment}${sql.slice(0, 300)}`);
    const [, verb, entity] = perform;
    const id = sql.match(/p_ID_[0-9a-f]{8} := '([0-9a-fA-F-]{36})';/)?.[1]?.toUpperCase();
    if (!id) fail(`${verb}${entity} block without a literal p_ID assignment:\n${sql.slice(0, 300)}`);
    blocks.push({ comment, sql, verb, entity, id });
  }
  const performTotal = (text.match(/PERFORM __mj\."sp(Create|Update)\w+"/g) ?? []).length;
  if (blocks.length !== performTotal)
    fail(`parsed ${blocks.length} blocks but converted file has ${performTotal} PERFORM calls — parser missed some`);
  return blocks;
}

/**
 * Scan every SS metadata sync AFTER v5.45 for rows it creates, updates, or deletes.
 * Returns Map of "Entity:ID" -> { file, verb, fields } for the LATEST touch of each row.
 *
 * Deletions are included because a create and a delete are equally fatal to reseed over
 * (see `findSupersededCreates`); callers that only care about supersession must filter
 * them out, since a deletion carries no field set to prove a superset against.
 */
function collectLaterSyncTargets() {
  const targets = new Map();
  const files = readdirSync('migrations/v5')
    .filter((f) => /^V\d{12}__.*_Metadata_Sync\.sql$/.test(f))
    .filter((f) => f.slice(1, 13) > V45_TIMESTAMP)
    .sort();
  if (files.length === 0) fail('no metadata syncs after v5.45 found — wrong working directory?');
  for (const file of files) {
    const text = readFileSync(join('migrations/v5', file), 'utf-8');
    for (const block of splitSsBlocks(text)) {
      const exec = block.match(/EXEC \[?\$\{flyway:defaultSchema\}\]?\.\[?sp(Create|Update|Delete)(\w+)/);
      // Saves carry the row id in a `@ID_<hash>` variable; deletions inline it on the EXEC.
      const id = (
        block.match(/@ID_[0-9a-f]{8}\s*=\s*'([0-9a-fA-F-]{36})'/)?.[1] ??
        block.match(/spDelete\w+\]?\s+@ID\s*=\s*N?'([0-9a-fA-F-]{36})'/i)?.[1]
      )?.toUpperCase();
      if (!exec || !id) continue;
      targets.set(`${exec[2]}:${id}`, { file, verb: exec[1], fields: fieldSet(block) });
    }
  }
  return targets;
}

/** Field sets of v5.45's own UPDATE blocks (from the SS source), keyed "Entity:ID". */
function collectUpdateFieldSets(v45Text) {
  const sets = new Map();
  for (const block of splitSsBlocks(v45Text)) {
    const exec = block.match(/EXEC \[?\$\{flyway:defaultSchema\}\]?\.\[?spUpdate(\w+)/);
    const id = block.match(/@ID_[0-9a-f]{8}\s*=\s*'([0-9a-fA-F-]{36})'/)?.[1]?.toUpperCase();
    if (exec && id) sets.set(`${exec[1]}:${id}`, fieldSet(block));
  }
  return sets;
}

function splitSsBlocks(text) {
  return text.split(/\n-- (?=Save |Delete )/);
}

/** Names of the fields an mj-sync SS block assigns (`@Field_ab12cd34 = …`). */
function fieldSet(block) {
  return new Set([...block.matchAll(/@(\w+?)_[0-9a-f]{8}\s*=/g)].map((m) => m[1]));
}

/**
 * Creates whose row a LATER release's sync also touched — every one is unsafe to reseed.
 *
 * The update path drops superseded rows so v5.45's older values never overwrite newer
 * state. A CREATE has the same hazard with no way to resolve it: on a gapped database the
 * row was absent when the later sync ran, and PostgreSQL's generated spUpdateX silently
 * no-ops on a missing row (GET DIAGNOSTICS ROW_COUNT = 0 -> RETURN), so that update
 * vanished without a trace. Creating the row now from v5.45's values would make the loss
 * permanent and invisible. There is no correct automatic fix — the values would have to be
 * merged by hand — so this reports and the caller refuses to generate.
 *
 * A later DELETE is just as fatal and just as invisible: the deletion no-opped on a gapped
 * database because the row was never there, so re-creating it now restores something SQL
 * Server no longer has. Both verbs are therefore reported, and the verb travels with the
 * offender so the failure says which happened.
 *
 * Currently empty for all 161 creates (verified against v5.46-v5.49), which is exactly why
 * it must be asserted rather than assumed: nothing else would notice if that changed.
 *
 * @param {Array<{verb:string, entity:string, id:string}>} blocks
 * @param {Map<string,{file:string, verb:string}>} laterTouches keyed "Entity:ID"
 * @returns {Array<{entity:string, id:string, file:string, verb:string}>}
 */
export function findSupersededCreates(blocks, laterTouches) {
  const offenders = [];
  for (const block of blocks) {
    if (block.verb !== 'Create') continue;
    const later = laterTouches.get(`${block.entity}:${block.id}`);
    if (later) offenders.push({ entity: block.entity, id: block.id, file: later.file, verb: later.verb });
  }
  return offenders;
}

/** Refuse to generate when any create would overwrite or resurrect newer state (see above). */
function assertNoSupersededCreates(blocks, laterTouches) {
  const offenders = findSupersededCreates(blocks, laterTouches);
  if (offenders.length === 0) return;
  fail(
    `cannot reseed ${offenders.length} create(s) — a later release's sync already touched ` +
      `the same row, and that change no-opped silently on gapped PostgreSQL databases, so ` +
      `seeding v5.45's values now would make the divergence permanent:\n` +
      offenders
        .map((o) =>
          o.verb === 'Delete'
            ? `  ${o.entity} ${o.id} (DELETED by ${o.file} — reseeding would resurrect it)`
            : `  ${o.entity} ${o.id} (re-${o.verb.toLowerCase()}d by ${o.file})`
        )
        .join('\n') +
      `\nReconcile by hand before regenerating: drop the create, or merge the newer values into it.`
  );
}

/**
 * Why a v5.45 update may NOT be dropped, or null when dropping it is provably lossless.
 *
 * A drop is only safe when the later full-row update covers every field v5.45 set.
 * Otherwise the uncovered fields are simply lost on gapped databases — the later sync
 * no-opped there (the row did not exist), and skipping v5.45's write means nothing ever
 * supplies them. This is the guard standing between the reseed and silent data loss, so
 * it reports rather than guessing.
 *
 * @returns {{reason:string, missing:string[]}|null}
 */
export function supersessionViolation(block, v45UpdateFields, later) {
  const key = `${block.entity}:${block.id}`;
  const v45Fields = v45UpdateFields.get(key);
  if (!v45Fields) {
    return { reason: `superseded update ${key} not found in the v5.45 SS source`, missing: [] };
  }
  const missing = [...v45Fields].filter((f) => !later.fields.has(f));
  if (missing.length === 0) return null;
  return {
    reason: `cannot drop update ${key}: later sync ${later.file} does not set field(s) ${missing.join(', ')}`,
    missing,
  };
}

/** Refuse to drop an update whose fields the later sync did not fully cover. */
function assertSupersessionSafe(block, v45UpdateFields, later) {
  const violation = supersessionViolation(block, v45UpdateFields, later);
  if (violation) fail(violation.reason);
}

/** Wrap a CREATE block so it no-ops when the row already exists (by primary key). */
function guardCreate(block) {
  // Entity sp suffix == base table name for every CodeGen-generated spCreate.
  const guard =
    `  IF EXISTS (SELECT 1 FROM __mj."${block.entity}" WHERE "ID" = '${block.id}') THEN\n` +
    `    RETURN; -- already seeded (sync-pushed or whole-baseline database)\n` +
    `  END IF;\n`;
  const guarded = block.sql.replace(/\nBEGIN\n/, `\nBEGIN\n${guard}`);
  if (guarded === block.sql) fail(`could not find BEGIN in ${block.verb}${block.entity} ${block.id}`);
  return `${block.comment}${guarded}`;
}

/**
 * Build the guarded DELETE(s) from the SQL Server source, ignoring the converter's own
 * (see `assertDeleteParity`, which keeps the two honest about how many exist).
 *
 * The guard is for the READER, not for correctness: PostgreSQL's generated
 * `spDeleteComponentRegistry` already no-ops on a missing row (`ROW_COUNT = 0 -> RETURN
 * QUERY SELECT NULL`), so the converter's unguarded call would also be safe to re-run.
 * Synthesizing a guarded form makes the idempotency of this file legible on its face
 * rather than dependent on the body of a sproc defined 25,000 lines away in the baseline.
 */
function synthesizeDeletes(v45Text) {
  const deletes = [];
  const re = /EXEC \[?\$\{flyway:defaultSchema\}\]?\.\[?spDelete(\w+?)\]?\s+@ID\s*=\s*'([0-9a-fA-F-]{36})'/g;
  for (const [, entity, rawId] of v45Text.matchAll(re)) {
    const id = rawId.toUpperCase();
    deletes.push({
      entity,
      id,
      sql:
        `-- Delete MJ: ${entity} (guarded form, synthesized from the SQL Server source)\n` +
        `DO $mj$\n` +
        `BEGIN\n` +
        `  IF EXISTS (SELECT 1 FROM __mj."${entity}" WHERE "ID" = '${id}') THEN\n` +
        `    PERFORM __mj."spDelete${entity}"(p_ID := '${id}');\n` +
        `  END IF;\n` +
        `END $mj$;`,
    });
  }
  return deletes;
}

/**
 * The converter emits its own (unguarded) delete, which `parseConvertedBlocks`
 * deliberately ignores — it matches only `-- Save` blocks and only counts
 * spCreate/spUpdate calls. That silent divergence is safe only while the two
 * sources agree on how many deletes exist, so assert it: a converter that stopped
 * emitting the delete (regression) or emitted one we do not synthesize (drift)
 * fails the run instead of quietly shipping a reseed with the wrong delete set.
 */
function assertDeleteParity(convertedText, synthesizedCount) {
  const converted = (convertedText.match(/PERFORM __mj\."spDelete\w+"/g) ?? []).length;
  if (converted !== synthesizedCount)
    fail(
      `delete parity broken — the converted input has ${converted} spDelete call(s) but ` +
        `${synthesizedCount} were synthesized from ${V45_SOURCE}. Reconcile before regenerating: ` +
        `the reseed must carry exactly the deletes the release performed, each IF EXISTS-guarded.`
    );
}

/**
 * Every pinned count that a regeneration moved, as human-readable strings ([] when the
 * shape is unchanged). Separated from the assertion so the pin itself is testable: it is
 * the only thing standing between "a future release quietly changed what this migration
 * seeds" and a human noticing.
 *
 * @returns {string[]}
 */
export function shapeDrift(actual, expected = EXPECTED) {
  return Object.entries(expected)
    .filter(([k, v]) => actual[k] !== v)
    .map(([k, v]) => `${k}: expected ${v}, got ${actual[k]}`);
}

function assertShape(actual) {
  const diffs = shapeDrift(actual);
  if (diffs.length > 0)
    fail(
      `ledger shape changed since this migration was authored — ${diffs.join('; ')}.\n` +
        `The committed reseed must not silently change: re-review the supersession analysis ` +
        `(issue #3253) and update EXPECTED only after confirming the new shape is correct.`
    );
}

function assembleMigration(bodyBlocks, dropped, deletes) {
  const droppedLines = dropped
    .map((b) => `--   ${b.entity} ${b.id}`)
    .join('\n');
  return `-- =============================================================================
-- ${OUTPUT_NAME}
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS (issue #3253):
--   V202607071019__v5.45.x__Metadata_Sync.pg.sql shipped as a 126-byte marker
--   instead of that release's 12,041-line metadata DML, so every PostgreSQL
--   database that migrated through v5.45 — and every fresh install from the
--   v5.46 baseline, which was dumped from such a database — is missing v5.45's
--   curated metadata (AI Skills, API Scopes, External Data Source Types,
--   Entity Permissions, …). The marker and baseline are an immutable deployed
--   ledger, so this forward-dated migration re-seeds the missing rows instead
--   of rewriting history. See DEPLOYMENT.md ("How to heal a ledger gap").
--
-- IDEMPOTENCY (this file runs on EVERY database, gapped or whole):
--   * every CREATE is guarded by an IF EXISTS check on its primary key;
--   * replayed UPDATEs set the same values on already-whole databases (no-op
--     by value);
--   * the DELETE is guarded by IF EXISTS.
--
-- SUPERSEDED UPDATES (deliberately absent): the following ${dropped.length} rows were
--   re-updated (full-row) by a later release's metadata sync, which already
--   applied on all databases — replaying v5.45's older values would revert
--   newer state:
${droppedLines}
--
-- GENERATED by scripts/generate-v545-metadata-reseed.mjs — do not hand-edit;
--   the derivation (legacy converter + post-processing rules + safety
--   assertions) is documented in that script's header.
-- =============================================================================

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

${bodyBlocks.join('\n\n')}
`;
}

function fail(message) {
  console.error(`generate-v545-metadata-reseed: ${message}`);
  process.exit(1);
}
