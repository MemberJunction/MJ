#!/usr/bin/env node
/**
 * deploy-preflight.mjs — collapse the serial-rollback tax into ONE pass.
 *
 * `mj sync push --dry-run` validates SHAPE but never SAVES, so it is blind to the entire
 * class of deploy defects that only a REAL push surfaces — and historically each one was
 * discovered one-at-a-time, each costing a full failed-push + fix + re-run cycle (the Neon
 * "leak #13" tax: missing @parent FKs → Description-255 → missing cred-type, four serial
 * rollbacks). This check finds ALL of them deterministically, DB-free, BEFORE any push, and
 * reports every violation at once so they are fixed in a single edit.
 *
 * Usage:  node deploy-preflight.mjs <path-to-.<vendor>.integration.json>
 * Exit:   0 = no ERRORS (warnings allowed); 1 = ERRORS present (do not push); 2 = bad input.
 *
 * It is intentionally conservative + zero-DB: it only flags constraints that are PROVABLE from
 * the metadata + the framework's known column limits / enums / dropped-field set. It never needs
 * credentials, a DB, or a running MJAPI — so it is cheap to run on every build before the push.
 */
import { readFileSync } from 'node:fs';

const PAGINATION_TYPES = new Set(['None', 'Cursor', 'Offset', 'PageNumber']);
const BODY_SHAPES = new Set(['flat', 'wrapped', 'literal']);
const ID_LOCATIONS = new Set(['body', 'header', 'n/a', 'path']);
const METADATA_SOURCES = new Set(['Declared', 'Discovered', 'Custom']);
const STATUS_KNOWN = new Set(['Active', 'Disabled', 'Pending', 'Deprecated', 'Inactive']);
const DESCRIPTION_MAX = 255; // Integration.Description column limit (the proven rollback)
// Fields that exist only in the framework's ideal-but-unmigrated schema → BaseEntity.SetLocal
// silently no-ops them on push. They will NOT persist; semantics belong in Configuration.
const DROPPED_FIELDS = new Set([
  'SupportsCreate', 'SupportsUpdate', 'SupportsDelete', 'SyncStrategy', 'StableOrderingKey',
  'IsMutable', 'IsAppendOnly', 'ContentHashApplicable', 'IncludeInActionGeneration', 'Source',
]);

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function getIOs(root) {
  const intg = Array.isArray(root) ? root[0] : root;
  const re = intg?.relatedEntities ?? {};
  return { intg, ios: re['MJ: Integration Objects'] ?? [] };
}
function iofsOf(io) {
  const re = io?.relatedEntities ?? {};
  return re['MJ: Integration Object Fields'] ?? [];
}
function checkEnum(val, set, label, isErr = true) {
  if (val == null) return;
  if (!set.has(String(val))) (isErr ? err : warn)(`${label} = "${val}" is not a valid value (allowed: ${[...set].join(', ')})`);
}
function checkDropped(fields, label) {
  for (const k of Object.keys(fields ?? {})) {
    if (DROPPED_FIELDS.has(k)) warn(`${label}: field "${k}" is silently dropped on push (not a real column) — move semantics into Configuration`);
  }
}

function main() {
  const path = process.argv[2];
  if (!path) { console.error('usage: deploy-preflight.mjs <.<vendor>.integration.json>'); process.exit(2); }
  let root;
  try { root = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`cannot read/parse ${path}: ${e.message}`); process.exit(2); }

  const { intg, ios } = getIOs(root);
  const f = intg?.fields ?? {};

  // ── Integration row ──
  if (!f.Name) err('Integration.Name is missing');
  if (f.CredentialTypeID == null) err('Integration.CredentialTypeID is missing — the @lookup target must exist at push time, or the push rolls back on "Lookup failed"');
  if (typeof f.Description === 'string' && f.Description.length > DESCRIPTION_MAX)
    err(`Integration.Description is ${f.Description.length} chars (> ${DESCRIPTION_MAX}) — push fails "Description cannot be longer than ${DESCRIPTION_MAX} characters"`);
  checkDropped(f, 'Integration');

  // ── IO rows ──
  let iofTotal = 0;
  for (const io of ios) {
    const io_f = io?.fields ?? {};
    const ioLabel = `IO "${io_f.Name ?? '?'}"`;
    if (io_f.IntegrationID == null) err(`${ioLabel}: missing IntegrationID:@parent:ID → push fails "IntegrationID cannot be null"`);
    if (typeof io_f.Description === 'string' && io_f.Description.length > DESCRIPTION_MAX)
      warn(`${ioLabel}: Description is ${io_f.Description.length} chars (> ${DESCRIPTION_MAX}) — may exceed the column limit`);
    checkEnum(io_f.PaginationType, PAGINATION_TYPES, `${ioLabel}.PaginationType`);
    checkEnum(io_f.CreateBodyShape, BODY_SHAPES, `${ioLabel}.CreateBodyShape`);
    checkEnum(io_f.UpdateBodyShape, BODY_SHAPES, `${ioLabel}.UpdateBodyShape`);
    checkEnum(io_f.CreateIDLocation, ID_LOCATIONS, `${ioLabel}.CreateIDLocation`);
    checkEnum(io_f.UpdateIDLocation, ID_LOCATIONS, `${ioLabel}.UpdateIDLocation`);
    checkEnum(io_f.DeleteIDLocation, ID_LOCATIONS, `${ioLabel}.DeleteIDLocation`);
    checkEnum(io_f.MetadataSource, METADATA_SOURCES, `${ioLabel}.MetadataSource`);
    checkEnum(io_f.Status, STATUS_KNOWN, `${ioLabel}.Status`, false);
    checkDropped(io_f, ioLabel);
    // capability ↔ method/path bijection (a declared capability with no path is a runtime crash)
    if (io_f.SupportsCreate === true && (!io_f.CreateAPIPath || !io_f.CreateMethod)) err(`${ioLabel}: SupportsCreate=true but CreateAPIPath/CreateMethod not set`);
    if (io_f.SupportsUpdate === true && (!io_f.UpdateAPIPath || !io_f.UpdateMethod)) err(`${ioLabel}: SupportsUpdate=true but UpdateAPIPath/UpdateMethod not set`);
    if (io_f.SupportsDelete === true && (!io_f.DeleteAPIPath || !io_f.DeleteMethod)) err(`${ioLabel}: SupportsDelete=true but DeleteAPIPath/DeleteMethod not set`);

    for (const iof of iofsOf(io)) {
      iofTotal++;
      const iof_f = iof?.fields ?? {};
      const fLabel = `${ioLabel} field "${iof_f.Name ?? '?'}"`;
      if (iof_f.IntegrationObjectID == null) err(`${fLabel}: missing IntegrationObjectID:@parent:ID → push fails "IntegrationObjectID cannot be null"`);
      checkEnum(iof_f.MetadataSource, METADATA_SOURCES, `${fLabel}.MetadataSource`);
      checkEnum(iof_f.Status, STATUS_KNOWN, `${fLabel}.Status`, false);
      checkDropped(iof_f, fLabel);
    }
  }

  const summary = { ok: errors.length === 0, integration: f.Name ?? null, ios: ios.length, iofs: iofTotal, errorCount: errors.length, warningCount: warnings.length };
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) { console.log('\nERRORS (block push):'); for (const e of errors) console.log('  ✗ ' + e); }
  if (warnings.length) { console.log('\nWARNINGS:'); for (const w of warnings.slice(0, 50)) console.log('  ! ' + w); if (warnings.length > 50) console.log(`  …+${warnings.length - 50} more`); }
  if (errors.length === 0) console.log('\n✓ deploy-preflight PASSED — no push-blocking defects.');
  process.exit(errors.length ? 1 : 0);
}

main();
