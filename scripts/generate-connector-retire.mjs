#!/usr/bin/env node
/**
 * RELEASE B (subtractive) generator. Produces the artifacts that retire the seeded vendor
 * connector metadata from MJ core — now that connectors live in MemberJunction/Integrations
 * and seed their own metadata on install:
 *
 *  1. Top-level `deleteRecord` files (the version-controlled, operator-applied cleanup, mirroring
 *     the Betty / old-nimble precedent), in reverse-FK order:
 *       metadata/integration-object-deletes/.connector-iof.deletes.json   (all active IOF)
 *       metadata/integration-object-deletes/.connector-io.deletes.json    (all active IO)
 *       metadata/integration-deletes/.connector-integration.deletes.json  (all active Integration)
 *  2. A forward-fix migration that nets the same rows out of a FRESH install (which replays the
 *     baseline seeds) — but GUARDED so it never deletes a row an existing install is actually using
 *     (anything referenced by CompanyIntegration). Idempotent, reverse-FK order.
 *
 * Records already tagged deleteRecord (Betty, old-nimble) are skipped — not re-deleted, not moved.
 *
 * Run from the repo root:  node scripts/generate-connector-retire.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const META = join(REPO_ROOT, 'metadata');
const INTEG_DIR = join(META, 'integrations');
const MIGRATION = join(REPO_ROOT, 'migrations', 'v5', 'V202606221600__v5.43.x__Retire_Connector_Integration_Seed.sql');

/** Collect every integration metadata file: root dotfiles + workshop subdirs (excluding already-deleted Betty). */
function integrationFiles() {
  const out = [];
  for (const f of readdirSync(INTEG_DIR)) {
    const p = join(INTEG_DIR, f);
    if (f.startsWith('.') && f.endsWith('.json') && !['.integrations.json', '.mj-sync.json', '.betty.json'].includes(f)) out.push(p);
    else if (!f.startsWith('.') && statSync(p).isDirectory()) {
      const m = readdirSync(p).find((x) => x.endsWith('.integration.json'));
      if (m) out.push(join(p, m));
    }
  }
  return out;
}

const isDeleted = (rec) => rec?.deleteRecord?.delete === true;
const delRec = (fields, id) => ({ fields: { Name: fields?.Name ?? null }, primaryKey: { ID: id }, deleteRecord: { delete: true } });

const integrations = [];       // ID-bearing Integration deleteRecord entries (mj-sync push)
const ios = [];                // ID-bearing IO deleteRecord entries
const iofs = [];               // ID-bearing IOF deleteRecord entries
const classNames = new Set();  // EVERY active connector ClassName (the migration's robust key)

for (const file of integrationFiles()) {
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  const recs = Array.isArray(raw) ? raw : [raw];
  for (const integ of recs) {
    if (!integ?.fields?.ClassName || isDeleted(integ)) continue;
    classNames.add(integ.fields.ClassName);
    // deleteRecord files require a primaryKey; older DB-seeded connectors have one,
    // newer workshop-authored ones may not (never pushed). The migration below covers
    // all by ClassName regardless, so missing-PK connectors are not lost.
    const integId = integ.primaryKey?.ID;
    if (integId) integrations.push(delRec(integ.fields, integId));
    for (const io of integ.relatedEntities?.['MJ: Integration Objects'] ?? []) {
      if (isDeleted(io) || !io.primaryKey?.ID) continue;
      ios.push(delRec(io.fields, io.primaryKey.ID));
      for (const iof of io.relatedEntities?.['MJ: Integration Object Fields'] ?? []) {
        if (isDeleted(iof) || !iof.primaryKey?.ID) continue;
        iofs.push(delRec(iof.fields, iof.primaryKey.ID));
      }
    }
  }
}

const writeJson = (p, obj) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8'); };

// 1. deleteRecord files — one entity per directory (mj-sync requirement). Reverse-FK order is
//    enforced by the DeletionAuditor + the directoryOrder below: IOF -> IO -> Integration.
const iofDeletesDir = join(META, 'integration-object-field-deletes'); // MJ: Integration Object Fields
const objDeletesDir = join(META, 'integration-object-deletes');       // MJ: Integration Objects (existing)
const integDeletesDir = join(META, 'integration-deletes');            // MJ: Integrations
writeJson(join(iofDeletesDir, '.connector-iof.deletes.json'), iofs);
writeJson(join(objDeletesDir, '.connector-io.deletes.json'), ios);
writeJson(join(integDeletesDir, '.connector-integration.deletes.json'), integrations);
if (!existsSync(join(iofDeletesDir, '.mj-sync.json')))
  writeJson(join(iofDeletesDir, '.mj-sync.json'), { entity: 'MJ: Integration Object Fields', filePattern: '**/.*.json', defaults: {} });
if (!existsSync(join(integDeletesDir, '.mj-sync.json')))
  writeJson(join(integDeletesDir, '.mj-sync.json'), { entity: 'MJ: Integrations', filePattern: '**/.*.json', defaults: {} });

// Ensure the three delete dirs are in the root metadata directoryOrder (after 'integrations').
const rootSyncPath = join(META, '.mj-sync.json');
const rootSync = JSON.parse(readFileSync(rootSyncPath, 'utf-8'));
if (Array.isArray(rootSync.directoryOrder)) {
  const want = ['integration-object-field-deletes', 'integration-object-deletes', 'integration-deletes'];
  const after = rootSync.directoryOrder.indexOf('integrations');
  const missing = want.filter((d) => !rootSync.directoryOrder.includes(d));
  if (missing.length) {
    rootSync.directoryOrder.splice(after + 1, 0, ...missing);
    writeJson(rootSyncPath, rootSync);
    console.log(`Added to directoryOrder: ${missing.join(', ')}`);
  }
}

// 2. Guarded, idempotent forward-fix migration — keyed on the stable ClassName so it
//    covers EVERY seeded connector regardless of whether its metadata carried a primaryKey.
const classList = [...classNames].sort().map((c) => `        '${c.replace(/'/g, "''")}'`).join(',\n');
const sql = `-- RELEASE B (subtractive): retire the seeded vendor connector catalog from MJ core.
-- Vendor connectors now live in MemberJunction/Integrations and seed their own
-- Integration / IntegrationObject / IntegrationObjectField rows on install. This nets the
-- baseline-seeded rows out of a FRESH install while LEAVING ALONE anything an existing
-- install is actually using (referenced by CompanyIntegration), so upgrades never lose data.
-- Keyed on Integration.ClassName (stable across seeds), reverse-FK order, idempotent.
--
-- NOTE: must ship only AFTER MemberJunction/Integrations is published and the additive
-- release A (multi-app + connector-profile install) is live. See PR for sequencing.

-- The set of seeded vendor-connector Integration IDs that NO company is using.
DECLARE @Unused TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @Unused (ID)
SELECT i.ID
FROM [\${flyway:defaultSchema}].[Integration] i
WHERE i.ClassName IN (
${classList}
)
AND NOT EXISTS (
    SELECT 1 FROM [\${flyway:defaultSchema}].[CompanyIntegration] ci WHERE ci.IntegrationID = i.ID
);

-- IntegrationObjectField rows of unused integrations' objects.
DELETE iof
FROM [\${flyway:defaultSchema}].[IntegrationObjectField] iof
INNER JOIN [\${flyway:defaultSchema}].[IntegrationObject] io ON io.ID = iof.IntegrationObjectID
WHERE io.IntegrationID IN (SELECT ID FROM @Unused);

-- IntegrationObject rows of unused integrations.
DELETE io
FROM [\${flyway:defaultSchema}].[IntegrationObject] io
WHERE io.IntegrationID IN (SELECT ID FROM @Unused);

-- The unused Integration rows themselves.
DELETE i
FROM [\${flyway:defaultSchema}].[Integration] i
WHERE i.ID IN (SELECT ID FROM @Unused);
`;
mkdirSync(dirname(MIGRATION), { recursive: true });
writeFileSync(MIGRATION, sql, 'utf-8');

console.log(`Connector ClassNames (migration covers all): ${classNames.size}`);
console.log(`deleteRecord entries — Integrations: ${integrations.length}  IntegrationObjects: ${ios.length}  IntegrationObjectFields: ${iofs.length}`);
console.log(`\nWrote:\n  ${iofDeletesDir}/.connector-iof.deletes.json\n  ${objDeletesDir}/.connector-io.deletes.json\n  ${integDeletesDir}/.connector-integration.deletes.json\n  ${MIGRATION}`);
