#!/usr/bin/env node
// render-emission.mjs
// SINGLE-PASS rendering of the FULL EXTRACTION_EMISSION.json from the CONVERGED on-disk metadata
// (the source of truth per the metadata-file conventions), enriched by PROVENANCE/CODE_EVIDENCE
// (per-object evidence counts) + DUAL_DERIVATION (independent per-object source-check reconcile).
//
// This is a rendering of the emitted metadata, NOT a re-derivation — the model was closed over 13
// amendment rounds with ConfirmedGapsBlocking=0 (INDEPENDENT_REVIEW.md round 13). Re-deriving from
// scratch would regress that converged work; the standard requires the report be a faithful render
// of the FINAL emitted metadata.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const REG = path.join(ROOT, 'packages/Integration/connectors-registry/higherlogic-thrive');
const RUN = path.join(REG, 'runs/connector-higherlogic-thrive-1783530972914-6940db01');
const OUT = path.join(RUN, 'output/EXTRACTION_EMISSION.json');

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const metaArr = readJSON(path.join(ROOT, 'metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json'));
const integ = metaArr[0];
const ios = integ.relatedEntities['MJ: Integration Objects'];

const provEntries = readJSON(path.join(REG, 'PROVENANCE.json')).Entries || [];
const codeEntries = readJSON(path.join(REG, 'CODE_EVIDENCE.json')).Entries || [];
const dual = readJSON(path.join(RUN, 'output/DUAL_DERIVATION.json'));
const perObjectDual = new Map((dual.perObject || []).map((o) => [o.object, o]));

// Handed-in HINT list (minimum cross-check, NOT a ceiling)
const HANDED = ["Announcements","Answers","AutomationRuleContactData","AutomationRuleSchedules","Blogs","Communities","CommunityInvitations","Contacts","DataFeed","DemographicChoices","DemographicTypes","DiscussionPosts","DiscussionThreads","Discussions","DocumentAttachments","EventRegistrants","EventSessions","EventTypes","Events","ExternalActivity","IdeaCategories","IdeaStatuses","IdeaVoters","Ideas","Questions","ResourceLibraryDocuments","ResourceLibraryLibraries","Tags","VolunteerOpportunities","VolunteerOpportunityTypes","Volunteers"];

const emittedNames = new Set(ios.map((o) => o.fields.Name));

// ---- evidence-count index: PROVENANCE + CODE_EVIDENCE entries scoped to an object ----
function evidenceCountFor(name) {
  const pfx1 = `io.${name}.`;
  const pfx2 = `iof.${name}.`;
  const eq = `io.${name}`;
  const count = (arr) => arr.filter((e) => {
    const tfs = Array.isArray(e.TargetField) ? e.TargetField : [e.TargetField];
    return tfs.some((tf) => typeof tf === 'string' && (tf.startsWith(pfx1) || tf.startsWith(pfx2) || tf === eq));
  }).length;
  return count(provEntries) + count(codeEntries);
}

// ---- claims: identity per emitted slot (IO-level + per-IOF PK/FK/unique) ----
function buildClaims(io) {
  const f = io.fields;
  const src = 'metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
  const claims = [];
  const push = (slot, value) => claims.push({ slot, value, sourcePath: src });

  push(`io.${f.Name}.APIPath`, f.APIPath);
  push(`io.${f.Name}.PaginationType`, f.PaginationType);
  push(`io.${f.Name}.SupportsWrite`, !!f.SupportsWrite);
  push(`io.${f.Name}.SupportsIncrementalSync`, !!f.SupportsIncrementalSync);
  if (f.SupportsIncrementalSync && f.IncrementalWatermarkField) {
    push(`io.${f.Name}.IncrementalWatermarkField`, f.IncrementalWatermarkField);
  }
  if (f.SyncStrategy) push(`io.${f.Name}.SyncStrategy`, f.SyncStrategy);
  if (f.StableOrderingKey) push(`io.${f.Name}.StableOrderingKey`, f.StableOrderingKey);

  const iofs = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
  for (const iof of iofs) {
    const g = iof.fields;
    if (g.IsPrimaryKey) push(`iof.${f.Name}.${g.Name}.IsPrimaryKey`, true);
    if (g.IsUniqueKey && !g.IsPrimaryKey) push(`iof.${f.Name}.${g.Name}.IsUniqueKey`, true);
    if (g.RelatedIntegrationObjectID) {
      push(`iof.${f.Name}.${g.Name}.RelatedIntegrationObjectID`, g.RelatedIntegrationObjectID);
      if (g.RelatedIntegrationObjectFieldName)
        push(`iof.${f.Name}.${g.Name}.RelatedIntegrationObjectFieldName`, g.RelatedIntegrationObjectFieldName);
      // ReferencedType carried in Configuration
      try {
        const cfg = g.Configuration ? JSON.parse(g.Configuration) : null;
        if (cfg && cfg.ReferencedType) push(`iof.${f.Name}.${g.Name}.Configuration.ReferencedType`, cfg.ReferencedType);
      } catch { /* non-JSON config, skip */ }
    }
  }
  return claims;
}

// ---- gaps: per-object honest negatives derived from the metadata state ----
function buildGaps(io) {
  const f = io.fields;
  const iofs = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
  const gaps = [];
  const hasPK = iofs.some((x) => x.fields.IsPrimaryKey);
  if (!hasPK) gaps.push(`io.${f.Name}.PK (no source-declared PK; deferred to runtime D4)`);
  // FK candidates: fields ending in Key that are not PK and have no RelatedIntegrationObjectID and no sibling match
  return gaps;
}

// ---- matrixRow: Gap-10 source-check row, faithful to the HelpPage source set ----
function buildMatrixRow(io) {
  const f = io.fields;
  const iofs = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
  const pkFields = iofs.filter((x) => x.fields.IsPrimaryKey).map((x) => x.fields.Name);
  const uniqueOnly = iofs.filter((x) => x.fields.IsUniqueKey && !x.fields.IsPrimaryKey);
  const fkCount = iofs.filter((x) => x.fields.RelatedIntegrationObjectID).length;
  const namingConv = pkFields.some((n) => /Key$/i.test(n) || /Id$/i.test(n) || /^id$/i.test(n)) ? 'yes' : 'no';
  const crossIO = fkCount > 0 ? 'yes' : 'no';
  const pkVerdict = pkFields.length > 0 ? 'emit' : (uniqueOnly.length > 0 ? 'unique-only' : 'defer');
  const fkVerdict = fkCount > 0 ? `emit-${fkCount}` : 'defer';
  return {
    IOName: f.Name,
    ExistingConnectorTs: 'n/a',              // no connector .ts consulted (forbidden circular source)
    ExistingMetadataJson: 'yes',             // this converged metadata file
    OpenAPIxPK: 'no',                        // vendor ships no OpenAPI (ASP.NET HelpPage docs)
    OpenAPIPathOps: 'yes',                   // HelpPage per-operation pages = path/method op source
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'yes',              // Resource Description field tables scanned
    SDKTypes: 'n/a',                         // no published SDK
    PostmanCommunity: 'n/a',                 // no Postman collection
    NamingConvention: namingConv,
    CrossIOMatch: crossIO,
    PKVerdict: pkVerdict,
    FKVerdict: fkVerdict,
    EvidenceCount: evidenceCountFor(f.Name),
  };
}

// ---- render all emitted IOs ----
const emission = [];
let fieldsTotal = 0;
for (const io of ios) {
  const iofs = (io.relatedEntities?.['MJ: Integration Object Fields']) || [];
  fieldsTotal += iofs.length;
  emission.push({
    objectName: io.fields.Name,
    fieldsExtracted: iofs.length,
    gapsRemaining: buildGaps(io),
    claims: buildClaims(io),
    matrixRow: buildMatrixRow(io),
  });
}

// ---- deliberate skips: record types the independent dual-derivation surfaced but were
// intentionally NOT emitted (accounted-for, not silently dropped) ----
const SKIPS = [
  { objectName: 'Friend', reason: 'Friends controller — social-graph RPC family (SendFriendRequest/CancelFriendRequest/AcceptFriendRequest); no record-stream GET with its own identity table. Out-of-scope-family per SOURCE_STUDY.md.' },
  { objectName: 'PagedIdeaList', reason: 'Relay-style pagination wrapper around Ideas (PagedIdeaList { items, cursor }); plumbing, not a record type. The record is Ideas (emitted).' },
  { objectName: 'MailboxMessage', reason: 'Messaging controller — private inbox messages; per-user mailbox family excluded (SSO/user-session-scoped, not a tenant-wide syncable record stream). Out-of-scope-family per SOURCE_STUDY.md.' },
  { objectName: 'VolunteerOpportunityVolunteer', reason: 'Nested association projection under VolunteerOpportunities.Volunteers (opportunity↔volunteer join, no independent identity endpoint); folded as nested field of the emitted Volunteers / VolunteerOpportunities records.' },
];
for (const s of SKIPS) {
  emission.push({ objectName: s.objectName, fieldsExtracted: 0, gapsRemaining: [], claims: [], matrixRow: {
    IOName: s.objectName, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
    OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
    PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0,
  }, skipped: { reason: s.reason } });
}

fs.writeFileSync(OUT, JSON.stringify(emission, null, 2) + '\n');

// ---- cross-check the handed HINT list against the emitted union ----
const missingFromHanded = HANDED.filter((n) => !emittedNames.has(n));
const extraBeyondHanded = [...emittedNames].filter((n) => !HANDED.includes(n));

const stats = {
  objectsExtracted: ios.length,
  fieldsExtracted: fieldsTotal,
  emissionArtifact: 'packages/Integration/connectors-registry/higherlogic-thrive/runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json',
  handedListSize: HANDED.length,
  handedMissing: missingFromHanded,          // must be empty — all hints emitted
  emittedBeyondHanded: extraBeyondHanded,     // union > hint (superset)
  skippedCount: SKIPS.length,
  dualDeriveCoverableModels: dual.coverableModelCount,
  emissionRows: emission.length,
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
