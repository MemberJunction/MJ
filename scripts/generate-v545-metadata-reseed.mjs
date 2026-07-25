#!/usr/bin/env node
/**
 * Generate the v5.45 metadata reseed migration (issue #3253).
 *
 * v5.45's `Metadata_Sync.pg.sql` shipped as a 126-byte marker, so PostgreSQL
 * deployments that migrated through v5.45 — and fresh installs from the v5.46
 * baseline, which was dumped from such a database — are missing that release's
 * curated metadata. This script derives a forward-dated, idempotent reseed
 * migration from the committed ledger. See plans/adr/0001-forward-dated-reseed-
 * for-ledger-gaps.md for why a reseed (and not a history rewrite).
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
 *     that lost it), but it emits it UNGUARDED — and this file must be idempotent
 *     on databases that are already whole. So the converter's delete is ignored
 *     and a guarded one is synthesized instead; `assertDeleteParity` below fails
 *     the run if those two ever disagree in count.
 *   - Expected shape is pinned (161 creates / 13 updates kept / 20 dropped /
 *     1 delete). If a regeneration ever disagrees — e.g. a future release's
 *     sync supersedes more rows — the script fails so a human re-reviews
 *     instead of the committed migration silently changing.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const V45_SOURCE = 'migrations/v5/V202607071019__v5.45.x__Metadata_Sync.sql';
const V45_TIMESTAMP = '202607071019';
const OUTPUT_DEFAULT = 'migrations-pg/v5/V202607241200__v5.50.x__Reseed_v545_Metadata.pg-only.sql';

const EXPECTED = { creates: 161, updatesKept: 13, updatesDropped: 20, deletes: 1 };

main();

function main() {
  const args = parseArgs(process.argv.slice(2));
  const convertedText = readFileSync(args.converted, 'utf-8');
  const v45SourceText = readFileSync(V45_SOURCE, 'utf-8');

  const blocks = parseConvertedBlocks(convertedText);
  const supersededByLater = collectLaterSyncTargets();
  const v45UpdateFields = collectUpdateFieldSets(v45SourceText);

  const out = [];
  const dropped = [];
  let creates = 0;
  let updatesKept = 0;

  for (const block of blocks) {
    if (block.verb === 'Create') {
      out.push(guardCreate(block));
      creates++;
    } else {
      const later = supersededByLater.get(`${block.entity}:${block.id}`);
      if (later) {
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
 * Scan every SS metadata sync AFTER v5.45 for rows it creates/updates.
 * Returns Map of "Entity:ID" -> { file, fields } for the LATEST touch of each row.
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
      const exec = block.match(/EXEC \[?\$\{flyway:defaultSchema\}\]?\.\[?sp(Create|Update)(\w+)/);
      const id = block.match(/@ID_[0-9a-f]{8}\s*=\s*'([0-9a-fA-F-]{36})'/)?.[1]?.toUpperCase();
      if (!exec || !id) continue;
      targets.set(`${exec[2]}:${id}`, { file, fields: fieldSet(block) });
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
 * A drop is only safe when the later full-row update covers every field v5.45
 * set — otherwise skipping v5.45 would lose a field the later sync never wrote.
 */
function assertSupersessionSafe(block, v45UpdateFields, later) {
  const key = `${block.entity}:${block.id}`;
  const v45Fields = v45UpdateFields.get(key);
  if (!v45Fields) fail(`superseded update ${key} not found in the v5.45 SS source`);
  const missing = [...v45Fields].filter((f) => !later.fields.has(f));
  if (missing.length > 0)
    fail(`cannot drop update ${key}: later sync ${later.file} does not set field(s) ${missing.join(', ')}`);
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
 * Build the guarded DELETE(s) from the SQL Server source. The converter emits its
 * own delete, but unguarded — useless for a migration that must no-op on databases
 * that already lack the row — so the authoritative version is synthesized here and
 * the converter's is ignored (see `assertDeleteParity`).
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

function assertShape(actual) {
  const diffs = Object.entries(EXPECTED)
    .filter(([k, v]) => actual[k] !== v)
    .map(([k, v]) => `${k}: expected ${v}, got ${actual[k]}`);
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
-- V202607241200__v5.50.x__Reseed_v545_Metadata.pg-only.sql
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
--   of rewriting history. See plans/adr/0001-forward-dated-reseed-for-ledger-gaps.md.
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
