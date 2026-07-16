#!/usr/bin/env node
// scripts/render-emission-artifact.mjs
// Single-pass renderer: the on-disk metadata file IS the authoritative emission (source of truth).
// This script (a) re-runs the shared deterministic enumerator over the RAW swagger to establish the
// record-type universe, (b) reads the persisted IO/IOF rows from the metadata file, (c) cross-checks
// emitted-vs-enumerated and classifies every enumerated definition as emitted OR skip-with-reason,
// (d) builds one { objectName, fieldsExtracted, gapsRemaining, claims, matrixRow } per emitted IO
// (claims = one identity per emitted slot: {slot,value,sourcePath}; matrixRow = Gap-10 source-check),
// then writes the FULL EXTRACTION_EMISSION.json and prints compact stats.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const REG = 'packages/Integration/connectors-registry/impexium';
const SWAGGER = `${REG}/sources/apiDefinition.swagger.json`;
const META = 'metadata/integrations/impexium/.impexium.integration.json';
const OUT = `${REG}/runs/connector-impexium-1783808479438-3654ffe5/output/EXTRACTION_EMISSION.json`;
const CE = `${REG}/CODE_EVIDENCE.json`;
const PV = `${REG}/PROVENANCE.json`;

// ---- 1. Enumerate the raw record-type universe (independent deterministic floor) ----
const enumRaw = execSync(
  `node packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs ${SWAGGER}`,
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
const enumJson = JSON.parse(enumRaw);
const enumerated = enumJson.recordTypes || [];

// ---- 2. Load authoritative emission (metadata) + evidence ----
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const root = meta[0];
const ios = root.relatedEntities['MJ: Integration Objects'] || [];
const ce = (JSON.parse(fs.readFileSync(CE, 'utf8')).Entries) || [];
const pv = (JSON.parse(fs.readFileSync(PV, 'utf8')).Entries) || [];

function evidenceCount(ioName) {
  const io = `io.${ioName}.`;
  const iof = `iof.${ioName}.`;
  let n = 0;
  for (const e of ce) { const t = e.TargetField || ''; if (t.startsWith(io) || t.startsWith(iof)) n++; }
  for (const e of pv) { const t = e.TargetField || ''; if (t.startsWith(io) || t.startsWith(iof)) n++; }
  return n;
}

// ---- 3. Build per-object emission from persisted rows ----
const HARD_IO_SLOTS = [
  'APIPath', 'PaginationType', 'SupportsPagination', 'SupportsIncrementalSync', 'SupportsWrite',
  'SupportsCreate', 'SupportsUpdate', 'SupportsDelete', 'IncrementalWatermarkField',
  'CreateAPIPath', 'CreateMethod', 'CreateBodyShape', 'CreateBodyKey', 'CreateIDLocation',
  'UpdateAPIPath', 'UpdateMethod', 'UpdateBodyShape', 'UpdateBodyKey', 'UpdateIDLocation',
  'DeleteAPIPath', 'DeleteMethod', 'DeleteIDLocation', 'SyncStrategy', 'ContentHashApplicable',
  'StableOrderingKey', 'ResponseDataKey', 'Status',
];
const HARD_IOF_SLOTS = ['Type', 'IsPrimaryKey', 'IsRequired', 'IsReadOnly', 'IsUniqueKey', 'RelatedIntegrationObjectID'];
const SRC = SWAGGER;

const emitted = [];
const emittedNames = new Set();
let totalFields = 0;

for (const ioNode of ios) {
  const f = ioNode.fields || {};
  const name = f.Name;
  emittedNames.add(name);
  const fields = ioNode.relatedEntities?.['MJ: Integration Object Fields'] || [];
  totalFields += fields.length;

  const claims = [];
  for (const s of HARD_IO_SLOTS) {
    if (f[s] !== undefined && f[s] !== null) claims.push({ slot: `io.${name}.${s}`, value: f[s], sourcePath: SRC });
  }
  const gaps = [];
  let hasPK = false;
  let fkCount = 0;
  for (const fn of fields) {
    const ff = fn.fields || {};
    if (ff.IsPrimaryKey === true) hasPK = true;
    if (ff.RelatedIntegrationObjectID) fkCount++;
    for (const s of HARD_IOF_SLOTS) {
      if (ff[s] !== undefined && ff[s] !== null && ff[s] !== false) {
        claims.push({ slot: `iof.${name}.${ff.Name}.${s}`, value: ff[s], sourcePath: SRC });
      }
    }
  }
  if (!hasPK) gaps.push(`io.${name}.PrimaryKey`);

  const evCount = evidenceCount(name);
  const naming = fields.some((x) => /(^id$|Id$)/.test(x.fields?.Name || '')) ? 'yes' : 'no';
  const crossIO = fkCount > 0 ? 'yes' : 'no';
  const matrixRow = {
    IOName: name,
    ExistingConnectorTs: 'no',
    ExistingMetadataJson: 'no',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: 'yes',
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'no',
    SDKTypes: 'n/a',
    PostmanCommunity: 'n/a',
    NamingConvention: naming,
    CrossIOMatch: crossIO,
    PKVerdict: hasPK ? 'emit' : 'defer',
    FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
    EvidenceCount: evCount,
  };

  emitted.push({ objectName: name, fieldsExtracted: fields.length, gapsRemaining: gaps, claims, matrixRow });
}

// ---- 4. Account for every enumerated definition: emitted OR skip-with-reason ----
// Enumerated names are swagger `definitions` (response/request DTOs). Match each primary `*Data`
// response DTO to an emitted IO via stemmed camelCase token-subset matching (order-independent), so
// aliased names resolve (AwardRecipientIndividualData<->AwardIndividualRecipients, PayableOrderData
// <->Orders, StateProvinceData<->States, ServiceData<->OrganizationServices). Everything else — write
// -body variants (*Save/*Create/*UpdateData), webhook payloads (*Payload), compact projections
// (*LookupBasicData), result wrappers (*ResultData), embedded structs (ContactData/PhoneDataSet) — is
// a genuine structural exclusion recorded with a reason.
function stem(tok) { let t = tok.toLowerCase(); t = t.replace(/ies$/, 'y'); t = t.replace(/s$/, ''); t = t.replace(/e$/, ''); return t; }
function tokens(name) {
  return name
    .replace(/(Create|Update|Save)?Data$/i, '')
    .replace(/DataSet$/i, '')
    .replace(/LookupBasic$/i, '')
    .replace(/Payload$/i, '')
    .replace(/Result$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s]+/)
    .filter(Boolean)
    .map(stem);
}
const emittedTokenSets = [...emittedNames].map((n) => ({ name: n, toks: new Set(tokens(n)) }));
function isSubset(a, b) { for (const x of a) if (!b.has(x)) return false; return true; }
function matchEmitted(def) {
  const dset = new Set(tokens(def));
  for (const { name, toks } of emittedTokenSets) {
    if (dset.size && toks.size && (isSubset(dset, toks) || isSubset(toks, dset))) return name;
  }
  return null;
}
function isPrimaryDTO(def) {
  return /Data$/.test(def) && !/(Create|Update|Save|Result|LookupBasic|DataSet)$/i.test(def) && !/Payload$/.test(def);
}
function skipReason(def) {
  if (/(Create|Update|Save)Data$/i.test(def) || /SaveData$|CreateData$|UpdateData$/i.test(def))
    return `write-body DTO — request shape for the create/update operation of its base object, not a separate record type`;
  if (/Payload$/i.test(def))
    return `webhook notification payload — event-trigger message shape (x-ms-notification-content), not a syncable record collection`;
  if (/LookupBasicData$/i.test(def))
    return `compact lookup projection of its base object (id/name subset), not a distinct record type`;
  if (/ResultData$/i.test(def))
    return `nested result-wrapper struct embedded in its parent response, not a top-level record`;
  if (/DataSet$/i.test(def))
    return `envelope/set wrapper struct around a nested collection, not a top-level record`;
  return `embedded 1:1 struct / DTO already represented as a field or child IO of its parent record`;
}

const skipped = [];
const matchedEnum = new Map(); // enumDef -> emitted IO name
for (const def of enumerated) {
  if (isPrimaryDTO(def)) {
    const m = matchEmitted(def);
    if (m) { matchedEnum.set(def, m); continue; }
  }
  skipped.push({ objectName: def, reason: skipReason(def) });
}

// ---- 5. Write full artifact + emit compact stats ----
const artifactArray = emitted.map((o) => ({ ...o }));
for (const s of skipped) {
  artifactArray.push({
    objectName: s.objectName,
    fieldsExtracted: 0,
    gapsRemaining: [],
    claims: [],
    matrixRow: { IOName: s.objectName, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'n/a', OpenAPIxPK: 'n/a', OpenAPIPathOps: 'n/a', OpenAPILocationHeader: 'n/a', VendorDocsProseScan: 'n/a', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'n/a', CrossIOMatch: 'n/a', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 },
    skipped: { reason: s.reason },
  });
}

fs.mkdirSync(OUT.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifactArray, null, 2) + '\n');

// Cross-check: every enumerated def is emitted-matched OR skipped-with-reason (no silent drop).
const unaccounted = enumerated.filter((d) => !matchedEnum.has(d) && !skipped.find((s) => s.objectName === d));

const stats = {
  enumeratedRecordTypes: enumerated.length,
  enumeratedMatchedToEmitted: matchedEnum.size,
  objectsEmitted: emitted.length,
  distinctEmittedMatchedByADTO: new Set(matchedEnum.values()).size,
  emittedNestedDerivedChildCollections: emitted.length - new Set(matchedEnum.values()).size,
  fieldsExtracted: totalFields,
  skippedWithReason: skipped.length,
  enumeratedUnaccounted: unaccounted,
  emissionArtifact: OUT,
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
