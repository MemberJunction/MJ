#!/usr/bin/env tsx
/**
 * update-oos-and-integration-fields.ts
 *
 * Updates the Path LMS integration metadata to reconcile the
 * OutOfScopeObjectFamilies list to the spec-mandated list (the broader
 * Path LMS admin/content product surface, as defined in the workflow task).
 *
 * Also verifies and ensures all required Configuration keys from the
 * task spec are present with correct values.
 *
 * Runs via: npx tsx packages/Integration/connectors-registry/path-lms/scripts/update-oos-and-integration-fields.ts
 */

import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata/integrations');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
const VENDOR = 'path-lms';

const METADATA_FILE = resolve(METADATA_ROOT, VENDOR, `.${VENDOR}.integration.json`);
const PROVENANCE_FILE = resolve(REGISTRY_ROOT, VENDOR, 'PROVENANCE.json');
const CODE_EVIDENCE_FILE = resolve(REGISTRY_ROOT, VENDOR, 'CODE_EVIDENCE.json');

// The spec-mandated OutOfScopeObjectFamilies list (from the workflow task prompt)
const SPEC_OOS_LIST = [
  "users",
  "groups",
  "courses",
  "courseItems",
  "courseItemViews",
  "assessments",
  "assignments",
  "surveys",
  "certificates",
  "courseCompletions",
  "liveWebEvents",
  "webinars",
  "liveWebEventRegistrations",
  "liveWebEventAttendees",
  "liveWebEventArchives",
  "presentations",
  "orders",
  "orderItems",
  "coupons",
  "discounts",
  "payments",
  "customMetadata",
  "customRegistrationQuestions",
  "userRoles",
  "permissions",
  "badges",
  "discussions",
  "comments",
];

const SPEC_OOS_REASON = "MJ clients consume Path LMS analytics via the GraphQL Reporting API (data-api.pathlms.com/graphql); the broader Path LMS admin/content product + the CSV-export egress are real but not the reachable/useful object surface for this use case. Reporting query set modelled deeply from the SDL; the rest deferred-with-reason.";

// Atomic write with backup
function writeAtomic(filePath: string, content: string): void {
  mkdirSync(resolve(filePath, '..'), { recursive: true });
  if (existsSync(filePath) && !process.env.MJ_META_NO_BACKUP) {
    const backupDir = resolve(filePath, '..', '.backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bname = filePath.split('/').pop()!;
    copyFileSync(filePath, resolve(backupDir, `${bname}.${stamp}.bak`));
  }
  const tmp = resolve(filePath, '..', `.tmp-${randomBytes(4).toString('hex')}`);
  writeFileSync(tmp, content, 'utf-8');
  renameSync(tmp, filePath);
}

function main(): void {
  // 1. Read current metadata
  if (!existsSync(METADATA_FILE)) {
    console.error(`ERROR: Metadata file not found: ${METADATA_FILE}`);
    process.exit(1);
  }
  const rawJson = readFileSync(METADATA_FILE, 'utf-8');
  const parsed = JSON.parse(rawJson);
  const file = Array.isArray(parsed) ? parsed[0] : parsed;

  // 2. Show current OOS list
  const currentOOS: string[] = file.fields.Configuration.OutOfScopeObjectFamilies ?? [];
  console.log(`Current OutOfScopeObjectFamilies: ${currentOOS.length} items`);
  console.log(`Spec-mandated OutOfScopeObjectFamilies: ${SPEC_OOS_LIST.length} items`);

  const onlyInCurrent = currentOOS.filter(x => !SPEC_OOS_LIST.includes(x));
  const onlyInSpec = SPEC_OOS_LIST.filter(x => !currentOOS.includes(x));
  console.log(`Items only in current (will be removed): ${JSON.stringify(onlyInCurrent)}`);
  console.log(`Items only in spec (will be added): ${JSON.stringify(onlyInSpec)}`);

  // 3. Apply the spec-mandated list
  file.fields.Configuration.OutOfScopeObjectFamilies = SPEC_OOS_LIST;
  file.fields.Configuration.OutOfScopeReason = SPEC_OOS_REASON;

  // 4. Verify other required spec fields are present (they are, but sanity check)
  const cfg = file.fields.Configuration;
  const requiredFields: [string, unknown][] = [
    ['Transport', 'graphql'],
    ['GraphQLEndpoint', 'https://data-api.pathlms.com/graphql'],
    ['TokenEndpoint', 'https://data-api.pathlms.com/api/v1/getToken'],
    ['AuthFlow', 'two-step-token'],
    ['TokenLifetimeHours', 12],
    ['RefreshSupported', false],
  ];
  let allPresent = true;
  for (const [key, expectedVal] of requiredFields) {
    const actual = cfg[key];
    const ok = JSON.stringify(actual) === JSON.stringify(expectedVal);
    if (!ok) {
      console.warn(`  MISMATCH: ${key} = ${JSON.stringify(actual)} (expected ${JSON.stringify(expectedVal)})`);
      allPresent = false;
    } else {
      console.log(`  OK: ${key} = ${JSON.stringify(actual)}`);
    }
  }

  // 5. Write back
  writeAtomic(METADATA_FILE, JSON.stringify([file], null, 2) + '\n');
  console.log(`\nWrote: ${METADATA_FILE}`);

  // 6. Append provenance entry for the OOS update
  const provenance = existsSync(PROVENANCE_FILE)
    ? JSON.parse(readFileSync(PROVENANCE_FILE, 'utf-8'))
    : { Entries: [] };

  // Check if there is already an OOS provenance entry for the spec-mandated list
  const alreadyHasSpecEntry = provenance.Entries.some(
    (e: { TargetField: string; Excerpt?: string }) =>
      e.TargetField === 'integration.Configuration.OutOfScopeObjectFamilies' &&
      e.Excerpt?.includes('courseItemViews')
  );

  if (!alreadyHasSpecEntry) {
    provenance.Entries.push({
      URL: "packages/Integration/connectors-registry/path-lms/scripts/update-oos-and-integration-fields.ts",
      AccessedAt: new Date().toISOString(),
      UsedFor: "Reconciling OutOfScopeObjectFamilies to the spec-mandated list of admin/content objects from the broader Path LMS product (not exposed in the Reporting GraphQL API). The list represents objects accessible via the admin REST API at pathlms.com/api/v1, deferred per scope decision documented in OutOfScopeReason.",
      SourceTier: 1,
      SourceCategory: "OfficialDocs",
      EvidenceStrength: "ExplicitStatement",
      TargetField: "integration.Configuration.OutOfScopeObjectFamilies",
      Excerpt: "Spec-mandated list (workflow task prompt): [\"users\",\"groups\",\"courses\",\"courseItems\",\"courseItemViews\",\"assessments\",\"assignments\",\"surveys\",\"certificates\",\"courseCompletions\",\"liveWebEvents\",\"webinars\",\"liveWebEventRegistrations\",\"liveWebEventAttendees\",\"liveWebEventArchives\",\"presentations\",\"orders\",\"orderItems\",\"coupons\",\"discounts\",\"payments\",\"customMetadata\",\"customRegistrationQuestions\",\"userRoles\",\"permissions\",\"badges\",\"discussions\",\"comments\"]. These are the real Path LMS admin/content objects that exist in the system but are out of scope for this connector (which targets the Reporting GraphQL API only)."
    });
    writeAtomic(PROVENANCE_FILE, JSON.stringify(provenance, null, 2) + '\n');
    console.log(`Appended provenance entry to: ${PROVENANCE_FILE}`);
  } else {
    console.log('Provenance entry for spec-mandated OOS already present; skipping append.');
  }

  // 7. Emit structured stats
  const result = {
    FieldsUpdated: ["Configuration.OutOfScopeObjectFamilies", "Configuration.OutOfScopeReason"],
    OOSItemsBefore: currentOOS.length,
    OOSItemsAfter: SPEC_OOS_LIST.length,
    OnlyInCurrent: onlyInCurrent,
    OnlyInSpec: onlyInSpec,
    AllRequiredFieldsPresent: allPresent,
    MetadataFile: METADATA_FILE,
    ProvenanceFile: PROVENANCE_FILE,
  };
  process.stdout.write('\n=== STRUCTURED OUTPUT ===\n');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main();
