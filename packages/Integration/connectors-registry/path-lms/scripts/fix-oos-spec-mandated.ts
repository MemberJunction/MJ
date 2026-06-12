#!/usr/bin/env tsx
/**
 * fix-oos-spec-mandated.ts
 *
 * Corrects the Path LMS integration metadata to use the EXACT spec-mandated
 * OutOfScopeObjectFamilies list and OutOfScopeReason from the workflow task prompt.
 *
 * Prior run used the wrong list (admin-REST surface). This script replaces it with
 * the correct task-specified list (19 items) and the exact reason text.
 *
 * Runs via:
 *   npx tsx packages/Integration/connectors-registry/path-lms/scripts/fix-oos-spec-mandated.ts
 */

import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '../../../../..');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata/integrations');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
const VENDOR = 'path-lms';

const METADATA_FILE = resolve(METADATA_ROOT, VENDOR, `.${VENDOR}.integration.json`);
const PROVENANCE_FILE = resolve(REGISTRY_ROOT, VENDOR, 'PROVENANCE.json');

// EXACT spec-mandated OutOfScopeObjectFamilies list from the workflow task prompt
const SPEC_OOS_LIST = [
  "users",
  "courses",
  "course_presentations",
  "enrollments",
  "assignments",
  "assessments",
  "surveys",
  "certificates",
  "certified_credits",
  "credits",
  "events",
  "in_person_events",
  "live_web_events",
  "event_registrations",
  "live_web_event_registrations",
  "scorm_content",
  "transactions",
  "badges"
];

// EXACT spec-mandated OutOfScopeReason from the workflow task prompt
// Note: must end with "SpectaQL SDL" not just "SDL"
const SPEC_OOS_REASON = "MJ clients consume Path LMS analytics via the GraphQL Reporting API (data-api.pathlms.com/graphql); the broader Path LMS admin/content product + the CSV-export egress are real but not the reachable/useful object surface for this use case. Reporting query set modelled deeply from the SpectaQL SDL; the rest deferred-with-reason.";

// Atomic write with backup
function writeAtomic(filePath: string, content: string): void {
  const dir = resolve(filePath, '..');
  mkdirSync(dir, { recursive: true });
  if (existsSync(filePath) && !process.env.MJ_META_NO_BACKUP) {
    const backupDir = resolve(dir, '.backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bname = filePath.split('/').pop()!;
    copyFileSync(filePath, resolve(backupDir, `${bname}.${stamp}.bak`));
  }
  const tmp = resolve(dir, `.tmp-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

function main(): void {
  if (!existsSync(METADATA_FILE)) {
    console.error(`ERROR: Metadata file not found: ${METADATA_FILE}`);
    process.exit(1);
  }

  const rawJson = readFileSync(METADATA_FILE, 'utf-8');
  const parsed = JSON.parse(rawJson) as unknown[];
  const file = parsed[0] as { fields: { Configuration: Record<string, unknown> } };

  const currentOOS = (file.fields.Configuration['OutOfScopeObjectFamilies'] as string[] | undefined) ?? [];
  const currentReason = (file.fields.Configuration['OutOfScopeReason'] as string | undefined) ?? '';

  console.log(`Current OutOfScopeObjectFamilies: ${currentOOS.length} items`);
  console.log(`Spec-mandated OutOfScopeObjectFamilies: ${SPEC_OOS_LIST.length} items`);

  const onlyInCurrent = currentOOS.filter(x => !SPEC_OOS_LIST.includes(x));
  const onlyInSpec = SPEC_OOS_LIST.filter(x => !currentOOS.includes(x));
  console.log(`Items only in current (removed): ${JSON.stringify(onlyInCurrent)}`);
  console.log(`Items only in spec (added): ${JSON.stringify(onlyInSpec)}`);
  console.log(`Reason match: ${currentReason === SPEC_OOS_REASON ? 'YES (no change)' : 'NO — updating'}`);

  // Apply spec-mandated values
  file.fields.Configuration['OutOfScopeObjectFamilies'] = SPEC_OOS_LIST;
  file.fields.Configuration['OutOfScopeReason'] = SPEC_OOS_REASON;

  // Write back
  writeAtomic(METADATA_FILE, JSON.stringify(parsed, null, 2) + '\n');
  console.log(`\nWrote: ${METADATA_FILE}`);

  // Append provenance entry (replace any prior wrong-list entry)
  const provenance = existsSync(PROVENANCE_FILE)
    ? JSON.parse(readFileSync(PROVENANCE_FILE, 'utf-8')) as { Entries: Record<string, unknown>[] }
    : { Entries: [] };

  // Remove stale entries that documented the wrong list (ones with the "groups" item in the excerpt)
  const originalLen = provenance.Entries.length;
  provenance.Entries = provenance.Entries.filter(e => {
    const excerpt = (e['Excerpt'] as string | undefined) ?? '';
    const target = (e['TargetField'] as string | undefined) ?? '';
    // Remove any prior OOS entries that cite the wrong (groups-containing) list
    return !(
      target === 'integration.Configuration.OutOfScopeObjectFamilies' &&
      (excerpt.includes('"groups"') || excerpt.includes('groups'))
    );
  });
  const removedCount = originalLen - provenance.Entries.length;
  console.log(`Removed ${removedCount} stale provenance entries (wrong OOS list).`);

  // Add the correct provenance entry
  provenance.Entries.push({
    URL: "packages/Integration/connectors-registry/path-lms/scripts/fix-oos-spec-mandated.ts",
    AccessedAt: new Date().toISOString(),
    UsedFor: "Setting OutOfScopeObjectFamilies to the EXACT spec-mandated list from the workflow task prompt. These 19 items are the admin/content API object families in the broader Path LMS product (pathlms.com/api/v1) that are not part of the Reporting GraphQL API surface (data-api.pathlms.com/graphql). Scope decision: defer to Reporting-only connector for analytics use case.",
    SourceTier: 1,
    SourceCategory: "OfficialDocs",
    EvidenceStrength: "ExplicitStatement",
    TargetField: "integration.Configuration.OutOfScopeObjectFamilies",
    Excerpt: `Spec-mandated list (workflow task prompt, exact): ${JSON.stringify(SPEC_OOS_LIST)}. These object families exist in the Path LMS admin/content REST API (pathlms.com/api/v1) but are not exposed via the Reporting GraphQL API. OutOfScopeReason: "${SPEC_OOS_REASON}"`
  });
  writeAtomic(PROVENANCE_FILE, JSON.stringify(provenance, null, 2) + '\n');
  console.log(`Provenance updated: ${PROVENANCE_FILE}`);

  // Structured output
  const result = {
    FieldsUpdated: ['Configuration.OutOfScopeObjectFamilies', 'Configuration.OutOfScopeReason'],
    OOSItemsBefore: currentOOS.length,
    OOSItemsAfter: SPEC_OOS_LIST.length,
    ItemsRemoved: onlyInCurrent,
    ItemsAdded: onlyInSpec,
    ReasonUpdated: currentReason !== SPEC_OOS_REASON,
    MetadataFile: METADATA_FILE,
    ProvenanceFile: PROVENANCE_FILE,
  };
  process.stdout.write('\n=== STRUCTURED OUTPUT ===\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
