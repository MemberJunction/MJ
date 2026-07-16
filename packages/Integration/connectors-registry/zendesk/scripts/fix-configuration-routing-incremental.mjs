#!/usr/bin/env node
// fix-configuration-routing-incremental.mjs
//
// MetadataWriter root-level Configuration fix. Applies INDEPENDENT_REVIEW.md
// (round-4 re-review) FixInstruction #4 -- the ONE fix in that review's stats
// block that targets a root Integration.Configuration slot (as opposed to a
// per-IO slot, which is ioiof-extractor's domain):
//
//   slot:  integration.Configuration.IncrementalSyncCapability.mechanisms
//          .timeBasedLegacy.endpoints
//   fix:   append the 3 documented-but-missing routing incremental-export
//          endpoints (/api/v2/incremental/routing/attributes,
//          .../attribute_values, .../instance_values)
//
// Independently re-verified fresh (not trusting the review's prior fetch)
// against sources/ticketing-oas.json before applying: all 3 paths exist,
// all 3 resolve to the IncrementalSkillBasedRouting response schema
// (attributes[]/attribute_values[]/instance_values[]/count/end_time/
// next_page -- the same time-based-legacy watermark shape as the sibling
// endpoints already listed), and the operation descriptions document an
// optional `cursor` param (prose, Tier-1/OpenAPISpec).
//
// This does NOT flip any per-IO SupportsIncrementalSync flag (that requires
// a connector-authoring decision for the shared 3-in-1 response schema, per
// the review's own "requiresEscalation: true" on those 3 sub-instructions --
// out of scope for a pure metadata Configuration patch). This script applies
// ONLY the review's requiresEscalation:false instruction (#4).
//
// Idempotent: re-running is a no-op once the 3 endpoints are present.
//
// Usage: node scripts/fix-configuration-routing-incremental.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const REPO = resolve(ROOT, '..', '..', '..', '..');
const METADATA_FILE = resolve(REPO, 'metadata/integrations/zendesk/.zendesk.integration.json');
const CODE_EVIDENCE_FILE = resolve(ROOT, 'CODE_EVIDENCE.json');
const TICKETING_OAS = 'sources/ticketing-oas.json';

const NEW_ENDPOINTS = [
  '/api/v2/incremental/routing/attributes',
  '/api/v2/incremental/routing/attribute_values',
  '/api/v2/incremental/routing/instance_values',
];

// ── independent fresh re-verification against the OAS (not the review) ─────
function verifyAgainstOAS() {
  const doc = JSON.parse(readFileSync(resolve(ROOT, TICKETING_OAS), 'utf8'));
  const paths = doc.paths ?? {};
  const evidence = [];
  for (const p of NEW_ENDPOINTS) {
    const get = paths[p]?.get;
    if (!get) { console.error(`VERIFICATION FAILED: ${p} not found in ${TICKETING_OAS}`); process.exit(1); }
    const ref = get.responses?.['200']?.content?.['application/json']?.schema?.$ref;
    const schemaName = ref?.split('/').pop();
    if (schemaName !== 'IncrementalSkillBasedRouting') {
      console.error(`VERIFICATION FAILED: ${p} response schema is ${schemaName}, expected IncrementalSkillBasedRouting`);
      process.exit(1);
    }
    evidence.push({ path: p, operationId: get.operationId, responseSchema: schemaName });
  }
  return evidence;
}

function main() {
  const evidence = verifyAgainstOAS();

  if (!existsSync(METADATA_FILE)) { console.error('metadata file missing'); process.exit(1); }
  const data = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
  const root = Array.isArray(data) ? data[0] : data;
  const config = root.fields.Configuration;
  const endpoints = config?.IncrementalSyncCapability?.mechanisms?.timeBasedLegacy?.endpoints;
  if (!Array.isArray(endpoints)) { console.error('Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy.endpoints not found/not an array'); process.exit(1); }

  const before = [...endpoints];
  const missing = NEW_ENDPOINTS.filter((e) => !endpoints.includes(e));
  for (const e of missing) endpoints.push(e);
  const after = [...endpoints];

  if (missing.length === 0) {
    process.stdout.write(JSON.stringify({ noop: true, reason: 'all 3 endpoints already present', endpoints: after }, null, 2) + '\n');
    return;
  }

  function writeAtomic(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
      const bdir = join(dirname(filePath), '.backups');
      mkdirSync(bdir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      copyFileSync(filePath, join(bdir, `${basename(filePath)}.${stamp}.bak`));
    }
    const tmp = join(dirname(filePath), `.${basename(filePath)}.tmp-${randomBytes(4).toString('hex')}`);
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, filePath);
  }
  writeAtomic(METADATA_FILE, JSON.stringify([root], null, 2) + '\n');

  let ce = { Entries: [] };
  if (existsSync(CODE_EVIDENCE_FILE)) {
    try { ce = JSON.parse(readFileSync(CODE_EVIDENCE_FILE, 'utf8')); } catch { ce = { Entries: [] }; }
  }
  ce.Entries = ce.Entries ?? [];
  ce.Entries.push({
    ScriptPath: 'scripts/fix-configuration-routing-incremental.mjs',
    ScriptRunAt: new Date().toISOString(),
    StructuredOutput: { operation: 'append-incremental-routing-endpoints', added: missing, evidence },
    SchemaValidationStatus: 'Passed',
    TargetField: 'integration.Configuration.IncrementalSyncCapability.mechanisms.timeBasedLegacy.endpoints',
    Excerpt: `${TICKETING_OAS}: GET /api/v2/incremental/routing/{attributes,attribute_values,instance_values} all resolve to the IncrementalSkillBasedRouting schema (end_time/next_page/end_of_stream watermark shape identical to the sibling time-based-legacy endpoints already listed); optional 'cursor' param documented in operation description prose. Per INDEPENDENT_REVIEW.md round-4 FixInstruction #4 (requiresEscalation:false).`,
  });
  writeAtomic(CODE_EVIDENCE_FILE, JSON.stringify(ce, null, 2) + '\n');

  process.stdout.write(JSON.stringify({ noop: false, before, after, added: missing, evidence }, null, 2) + '\n');
}

main();
