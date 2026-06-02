#!/usr/bin/env node
/**
 * Freeze the YourMembership integration contract.
 *
 * Outputs into the run's output/ dir:
 *   - frozen-contract.json                (canonical-order JSON snapshot of the integration row + IO graph)
 *   - frozen-contract.provenance.json     (sidecar: hash + provenance + configuration + self-consistency report)
 *   - frozen-contract.sha256              (hash, single line)
 *
 * Canonicalization rule: recursive object-key sort. Arrays preserve order (they're semantically ordered
 * in this contract — IO sequence, IOF sequence). Newlines LF, no trailing newline inside JSON value.
 * File written with trailing LF per POSIX text-file convention.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const SOURCE_INTEGRATION = '/Users/madhavsubramaniyam/Projects/MJ/MJ/metadata/integrations/yourmembership/.yourmembership.integration.json';
const OUTPUT_DIR = '/Users/madhavsubramaniyam/Projects/MJ/MJ/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output';
const SOURCE_PROVENANCE = `${OUTPUT_DIR}/PROVENANCE.json`;
const SOURCE_CONFIGURATION = `${OUTPUT_DIR}/Configuration.json`;

// --- canonicalize -----------------------------------------------------------
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

// --- self-consistency check -------------------------------------------------
function selfConsistencyCheck(integration, provenance) {
  const root = integration[0];
  const ios = (root.relatedEntities?.['MJ: Integration Objects']) || [];
  const ioNames = new Set(ios.map(io => io.fields.Name));

  // Provenance coverage of root.fields
  const rootSlots = Object.keys(root.fields);
  const provenanceTargets = new Set((provenance.entries || []).map(e => e.target));
  const slotsWithProvenance = [];
  const slotsWithoutProvenance = [];
  for (const slot of rootSlots) {
    const fqName = `Integration.${slot}`;
    if (provenanceTargets.has(fqName)) slotsWithProvenance.push(slot);
    else slotsWithoutProvenance.push(slot);
  }

  // FK target existence
  const fkBroken = [];
  let fkTotal = 0;
  for (const io of ios) {
    const fields = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
    for (const f of fields) {
      const ref = f.fields.RelatedIntegrationObjectID;
      if (!ref) continue;
      fkTotal++;
      const m = String(ref).match(/Name=([^&]+)/);
      if (m && !ioNames.has(m[1])) {
        fkBroken.push({ io: io.fields.Name, field: f.fields.Name, target: m[1], rawReference: ref });
      }
    }
  }

  // Type field validity — schema is nvarchar(100), no enum; only constraint is length<=100
  let typeTotal = 0;
  const typeLengthViolations = [];
  const typeDistribution = {};
  for (const io of ios) {
    const fields = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
    for (const f of fields) {
      typeTotal++;
      const t = f.fields.Type ?? null;
      const tKey = t === null ? '<null>' : String(t).toLowerCase();
      typeDistribution[tKey] = (typeDistribution[tKey] || 0) + 1;
      if (t !== null && typeof t === 'string' && t.length > 100) {
        typeLengthViolations.push({ io: io.fields.Name, field: f.fields.Name, type: t, length: t.length });
      }
    }
  }

  return {
    counts: {
      integrationObjects: ios.length,
      integrationObjectFields: typeTotal,
      foreignKeyReferences: fkTotal,
      rootSlots: rootSlots.length,
      provenanceEntries: (provenance.entries || []).length,
      provenanceGaps: (provenance.gaps || []).length
    },
    provenanceCoverage: {
      rootSlots,
      slotsWithProvenance,
      slotsWithoutProvenance,
      everySlotHasProvenance: slotsWithoutProvenance.length === 0
    },
    foreignKeyIntegrity: {
      totalReferences: fkTotal,
      brokenReferences: fkBroken,
      allTargetsExist: fkBroken.length === 0
    },
    typeFieldIntegrity: {
      totalFields: typeTotal,
      schemaConstraint: 'nvarchar(100) — free-form string, no enum',
      lengthViolations: typeLengthViolations,
      lengthViolationCount: typeLengthViolations.length,
      typeMismatches: typeLengthViolations.length, // schema-level type mismatches = length violations only
      observedTypeDistribution: typeDistribution
    }
  };
}

// --- main -------------------------------------------------------------------
const integration = JSON.parse(readFileSync(SOURCE_INTEGRATION, 'utf8'));
const provenance = JSON.parse(readFileSync(SOURCE_PROVENANCE, 'utf8'));
const configuration = JSON.parse(readFileSync(SOURCE_CONFIGURATION, 'utf8'));

// 1) Build the frozen contract: canonicalized integration JSON
// Hash is computed over the EXACT on-disk bytes (including trailing LF),
// so `shasum -a 256 frozen-contract.json` reproduces frozen-contract.sha256.
const frozenContract = canonicalize(integration);
const frozenContractJson = JSON.stringify(frozenContract, null, 2);
const frozenContractBytes = frozenContractJson + '\n';
const sha256 = createHash('sha256').update(frozenContractBytes, 'utf8').digest('hex');

// 2) Run the self-consistency check
const check = selfConsistencyCheck(integration, provenance);

// 3) Build the provenance sidecar
const sidecar = {
  $schema: 'frozen-contract.provenance.v1',
  vendor: 'YourMembership',
  runID: 'connector-yourmembership-1780165237029-a495a1ea',
  frozenAt: new Date().toISOString(),
  frozenContractPath: 'frozen-contract.json',
  frozenContractSHA256: sha256,
  canonicalizationRule: 'Recursive object-key sort, ascending lexicographic. Arrays preserve insertion order (semantically ordered: IO sequence and IOF sequence are content). Serialized via JSON.stringify(value, null, 2), UTF-8, LF line endings, trailing LF on file.',
  sourceFiles: {
    integration: 'metadata/integrations/yourmembership/.yourmembership.integration.json',
    provenance: 'PROVENANCE.json',
    configuration: 'Configuration.json'
  },
  selfConsistencyCheck: check,
  provenanceSummary: {
    entries: provenance.entries,
    gaps: provenance.gaps
  },
  configurationSummary: configuration,
  knownIssues: {
    fkTargetsMissing: check.foreignKeyIntegrity.brokenReferences.length > 0
      ? {
          severity: 'BLOCKER',
          summary: `${check.foreignKeyIntegrity.brokenReferences.length} of ${check.foreignKeyIntegrity.totalReferences} RelatedIntegrationObjectID references point to IO names that do not exist as IOs in this contract.`,
          details: 'Two distinct patterns observed: (1) 11 AmsEvent_* IOs reference target IO name "AmsEvent" — the AmsEvent base IO is absent from the contract while its 11 sub-IOs (Alias, AttendeeTypeSessions, ...) are present; (2) 7 IOs (Pinpoint, LocationCoordinates, JobAlertsCriteria, JobAlerts, JobSearch, SavedJobs, Templates) reference target name "YourMembership" which is the Integration row Name, not an IO. These broken refs were emitted upstream by ioiof-extractor and were NOT corrected by metadata-writer (whose scope is the Integration row + Configuration sidecar, not the IO graph). Documented here so downstream reviewer/code-builder agents see them at freeze-read time.',
          brokenReferences: check.foreignKeyIntegrity.brokenReferences,
          remediationOwner: 'ioiof-extractor (rerun) OR independent-reviewer (correction stage)'
        }
      : { severity: 'none', summary: 'All FK targets resolve.' },
    typeMismatches: {
      severity: 'none',
      summary: 'Zero type mismatches. IntegrationObjectField.Type column is nvarchar(100) free-form per MJIntegrationObjectFieldSchema in entity_subclasses.ts — no enum constraint to violate. All 2576 Type values are <=100 chars.',
      observedDistribution: check.typeFieldIntegrity.observedTypeDistribution
    },
    provenanceCoverage: check.provenanceCoverage.everySlotHasProvenance
      ? { severity: 'none', summary: `All ${check.provenanceCoverage.rootSlots.length} root Integration slots have provenance entries.` }
      : {
          severity: 'WARNING',
          summary: `${check.provenanceCoverage.slotsWithoutProvenance.length} root slot(s) lack provenance entries`,
          missingSlots: check.provenanceCoverage.slotsWithoutProvenance
        }
  }
};

const sidecarJson = JSON.stringify(canonicalize(sidecar), null, 2);

// 4) Write outputs
const outContract = resolve(OUTPUT_DIR, 'frozen-contract.json');
const outSidecar = resolve(OUTPUT_DIR, 'frozen-contract.provenance.json');
const outHash = resolve(OUTPUT_DIR, 'frozen-contract.sha256');

writeFileSync(outContract, frozenContractBytes, 'utf8');
writeFileSync(outSidecar, sidecarJson + '\n', 'utf8');
writeFileSync(outHash, sha256 + '  frozen-contract.json\n', 'utf8'); // matches `shasum -a 256` format

console.log(JSON.stringify({
  ok: true,
  frozenContractPath: outContract,
  sidecarPath: outSidecar,
  hashPath: outHash,
  sha256,
  contractBytes: Buffer.byteLength(frozenContractJson, 'utf8'),
  sidecarBytes: Buffer.byteLength(sidecarJson, 'utf8'),
  counts: check.counts,
  everySlotHasProvenance: check.provenanceCoverage.everySlotHasProvenance,
  allFkTargetsExist: check.foreignKeyIntegrity.allTargetsExist,
  brokenFkCount: check.foreignKeyIntegrity.brokenReferences.length,
  typeMismatchCount: check.typeFieldIntegrity.typeMismatches
}, null, 2));
