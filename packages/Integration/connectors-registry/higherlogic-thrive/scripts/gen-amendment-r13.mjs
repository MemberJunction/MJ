#!/usr/bin/env node
// Amendment Round 13 — DELTA, surgical per-slot FixInstructions on FOUR flagged objects:
//   1. RegistrantClasses  — emit the dropped, documented, in-scope taxonomy leaf (emit-with-gap-noted)
//   2. BlogComments.ItemKey — retarget FK Configuration.ReferencedType DataFeed -> Blogs (name-collision fix)
//   3. Comments.ItemKey    — clear the (polymorphic, unresolvable) FK: DataFeed is not a valid target
//   4. CommunityMembers    — add missing co-primary CommunityKey (composite PK + Communities FK)
//
// No catalog re-walk. All writes go through the mj-metadata MCP (shallow-merge upsert / key-delete),
// never a direct file edit. Only the four flagged objects are touched; every other object is left
// exactly as persisted (upsert is idempotent, never deletes a prior object).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const CONNECTOR = 'higherlogic-thrive';
const NOW = new Date().toISOString();
const REG = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-thrive';
const EMISSION_OUT =
  '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-thrive/runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json';

// ---- evidence file paths (relative to connector root, for provenance URLs) ----
const EV_REG = 'sources/ops/GET-api-v2.0-RegistrantClass-GetRegistrantClasses_Active.html';
const EV_STUDY = 'SOURCE_STUDY.md';

// ---------------------------------------------------------------------------
// Fix 1 — RegistrantClasses IO (emit-with-gap-noted). Mirrors EventSessions'
// read-only/PaginationType:None/FullPullHashDiff shape. The vendor doc-generation
// bug substitutes HttpResponseMessage for the RegistrantClass response model, so
// there is NO documented response field set and NO write endpoint to recover one
// from (unlike EventTypes, recovered from SaveEventType). PK is DEFERRED (not
// fabricated) to runtime D4. A single convention-inferred identity field
// (RegistrantClassKey, per the vendor-wide <SingularName>Key motif) is emitted,
// honestly marked non-PK + inference noted, to keep the IO non-empty and syncable.
// ---------------------------------------------------------------------------
const REG_CONFIG = JSON.stringify({
  accessPath: { door: 'RegistrantClass/GetRegistrantClasses', path: '/v2.0/RegistrantClass/GetRegistrantClasses', nesting: [], door_args: ['Active'], fieldOp: 'api/v2.0/RegistrantClass/GetRegistrantClasses' },
  sourceModel: 'RegistrantClass',
  fieldListGap: 'vendor doc-generation bug substitutes HttpResponseMessage for the RegistrantClass response model; no documented response field set and no write endpoint to recover one from. Consistent with EventTypes (pre-recovery) and EventSessions/Questions (kept alive despite comparable/worse gaps).',
});
const REG_DESC =
  'RegistrantClass — field-list gap (vendor doc-generation placeholder; response model shows as HttpResponseMessage). ' +
  'Read-only list (GET RegistrantClass/GetRegistrantClasses, Active bool filter). PK deferred to runtime D4.';

const regIO = {
  Name: 'RegistrantClasses',
  DisplayName: 'Registrant Classes',
  Description: REG_DESC,
  APIPath: '/v2.0/RegistrantClass/GetRegistrantClasses',
  SupportsWrite: false,
  SupportsIncrementalSync: false,
  Category: 'RegistrantClass',
  PaginationType: 'None',
  SupportsPagination: false,
  SyncStrategy: 'FullPullHashDiff',
  ContentHashApplicable: true,
  StableOrderingKey: null,
  Status: 'Active',
  Configuration: REG_CONFIG,
  IntegrationID: '@parent:ID',
  AdditionalObservations:
    'RegistrantClasses was documented as an in-scope taxonomy leaf (SOURCE_STUDY.md §1 line 168, §5 scope decision) ' +
    'and is a confirmed live controller (RegistrantClass, 1 of 25). It is emitted-with-gap-noted rather than dropped, ' +
    'consistent with EventTypes/Questions/EventSessions. The single RegistrantClassKey field is convention-inferred ' +
    '(vendor-wide <SingularName>Key motif) because the doc-generation bug hides the real response model; IsPrimaryKey ' +
    'is deferred (not fabricated) pending runtime D4.',
};
const regIOF = {
  Name: 'RegistrantClassKey',
  DisplayName: 'Registrant Class Key',
  Description: 'Convention-inferred identity (vendor-wide <SingularName>Key motif); response model undocumented due to the doc-generation bug. IsPrimaryKey deferred to runtime D4 — NOT fabricated as a PK here.',
  Type: 'String',
  IsRequired: false,
  IsReadOnly: true,
  IsPrimaryKey: false,
  IsUniqueKey: false,
  AllowsNull: true,
  Status: 'Active',
  Sequence: 1,
  IntegrationObjectID: '@parent:ID',
};

// ---------------------------------------------------------------------------
// Fix 2 — BlogComments.ItemKey — retarget the FK to Blogs. The @lookup already
// points at Blogs; only Configuration.ReferencedType was stale at DataFeed (a
// same-field-name cross-IO collision: DataFeed's own PK is also named ItemKey).
// Also correct RelatedIntegrationObjectFieldName to Blogs' real PK (BlogKey).
// Shallow-merge overwrites Configuration + RelatedIntegrationObjectFieldName only.
// ---------------------------------------------------------------------------
const blogCommentsItemKey = {
  Name: 'ItemKey',
  Type: 'String',
  RelatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Blogs&IntegrationID=@parent:IntegrationID',
  RelatedIntegrationObjectFieldName: 'BlogKey',
  Configuration: { ReferencedType: 'Blogs' },
};

// ---------------------------------------------------------------------------
// Fix 4 — CommunityMembers — add the missing co-primary CommunityKey, flattened
// from the nested Community object per GetCommunityMembers' response shape.
// Mirrors DemographicChoices.DemographicTypeKey / Volunteers.VolunteerContactKey.
// Composite PK (CommunityKey, ContactKey); CommunityKey is also an FK -> Communities.
// ---------------------------------------------------------------------------
const communityKeyIOF = {
  Name: 'CommunityKey',
  DisplayName: 'Community Key',
  Description: 'Unique Identifier of the Community this membership belongs to. Co-primary with ContactKey (composite PK); flattened from the nested Community object in GetCommunityMembers.',
  Type: 'String',
  IsRequired: true,
  IsReadOnly: true,
  IsPrimaryKey: true,
  IsUniqueKey: false,
  RelatedIntegrationObjectID: '@lookup:MJ: Integration Objects.Name=Communities&IntegrationID=@parent:IntegrationID',
  RelatedIntegrationObjectFieldName: 'CommunityKey',
  AllowsNull: false,
  Status: 'Active',
  Sequence: 35,
  Configuration: { ReferencedType: 'Communities' },
  IntegrationObjectID: '@parent:ID',
};

// ---------------------------------------------------------------------------
// Provenance entries — one per hard-constraint slot touched.
// ---------------------------------------------------------------------------
const P = (evRel, uf, tf, ex, strength = 'ExplicitStatement') => ({
  URL: 'file://packages/Integration/connectors-registry/higherlogic-thrive/' + evRel,
  AccessedAt: NOW, UsedFor: uf, SourceTier: 1, SourceCategory: 'OfficialDocs',
  EvidenceStrength: strength, TargetField: tf, Excerpt: ex,
});
const prov = [
  P(EV_REG,
    'RegistrantClasses IO emission — documented in-scope leaf, live controller, emit-with-gap-noted',
    'io.RegistrantClasses.APIPath',
    'GET RegistrantClass/GetRegistrantClasses (Active bool filter). One of 25 confirmed live controllers (PROVENANCE line 111). SOURCE_STUDY.md line 168 (COVERABLE table) + line 203 (read-only) + §5 scope decision list it as an in-scope taxonomy leaf. Kept alive with gap noted, mirroring EventTypes/Questions/EventSessions.'),
  P(EV_STUDY,
    'RegistrantClasses PK deferred — field-level GAP, doc-generation bug hides the response model',
    'io.RegistrantClasses.Configuration',
    'SOURCE_STUDY.md line 168: PK "unknown — field-level GAP". Lines 372-375: RegistrantClasses has NO documented fields at all; the doc-generation bug substitutes HttpResponseMessage. RegistrantClassKey is convention-inferred (vendor-wide <SingularName>Key motif); IsPrimaryKey deferred to runtime D4, not fabricated.',
    'ImpliedFromExample'),
  P(EV_STUDY,
    'BlogComments.ItemKey FK retargeted DataFeed -> Blogs (same-field-name cross-IO collision fix)',
    'iof.BlogComments.ItemKey.Configuration.ReferencedType',
    'SOURCE_STUDY.md line 161 (BlogComments leaf row): itemKey=BlogKey->Blogs. DataFeed was a false match because DataFeed\'s own PK field is coincidentally also named ItemKey. RelatedIntegrationObjectFieldName corrected to Blogs\' real PK (BlogKey).'),
  P(EV_STUDY,
    'Comments.ItemKey FK cleared — polymorphic parent, no single resolvable target (access-path only)',
    'iof.Comments.ItemKey.Configuration.ReferencedType',
    'SOURCE_STUDY.md Patterns §8 / line 160: generic Comments/GetComments itemKey is polymorphic across blogs, library documents, ideas, etc. -> polymorphic parent (access-path). No single resolvable FK target; DataFeed was not even a plausible target. FK reference cleared.'),
  P(EV_STUDY,
    'CommunityMembers.CommunityKey added — restores documented composite PK + Communities FK',
    'iof.CommunityMembers.CommunityKey.IsPrimaryKey',
    'SOURCE_STUDY.md line 155 (CommunityMembers leaf row): PK = (CommunityKey,ContactKey) pair; nested Community->Communities. CommunityKey flattened from the nested Community object per GetCommunityMembers, mirroring DemographicChoices.DemographicTypeKey / Volunteers.VolunteerContactKey. Co-primary with ContactKey; FK -> Communities (PK CommunityKey).'),
];

// ---------------------------------------------------------------------------
// Apply via MCP + write delta emission artifact.
// ---------------------------------------------------------------------------
const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/server.js'],
  env: { ...process.env },
});
const client = new Client({ name: 'amendment-r13-cli', version: '1.0' }, { capabilities: {} });
await client.connect(transport);

const log = [];
async function call(name, args) {
  const r = await client.callTool({ name, arguments: { connector: CONNECTOR, ...args } });
  const text = r.content?.[0]?.text ?? '';
  if (r.isError) { log.push(`ERR ${name}: ${text}`); throw new Error(`${name}: ${text}`); }
  log.push(`OK ${name}: ${text}`);
}

try {
  // Fix 1 — RegistrantClasses IO + its single identity field
  await call('upsert_integration_object', { io: regIO });
  await call('upsert_integration_object_field', { ioName: 'RegistrantClasses', iof: regIOF });

  // Fix 2 — BlogComments.ItemKey retarget
  await call('upsert_integration_object_field', { ioName: 'BlogComments', iof: blogCommentsItemKey });

  // Fix 3 — Comments.ItemKey clear FK (physically remove the dangling FK keys;
  // upsert cannot delete keys, and mj-sync validation errors on null-valued unknown intent,
  // so the coherent "clear" is to remove Configuration + the dangling RelatedIntegrationObjectFieldName).
  await call('delete_integration_object_field', { ioName: 'Comments', iofName: 'ItemKey', fieldKey: 'Configuration' });
  await call('delete_integration_object_field', { ioName: 'Comments', iofName: 'ItemKey', fieldKey: 'RelatedIntegrationObjectFieldName' });

  // Fix 4 — CommunityMembers add CommunityKey
  await call('upsert_integration_object_field', { ioName: 'CommunityMembers', iof: communityKeyIOF });

  // Provenance
  for (const entry of prov) await call('append_provenance', { entry });
} finally {
  await client.close();
}

// ---- delta emission artifact — ONLY the re-processed objects ----
const emission = [
  {
    objectName: 'RegistrantClasses',
    fieldsExtracted: 1,
    gapsRemaining: ['iof.RegistrantClasses.*.field-set (doc-generation bug hides response model)', 'io.RegistrantClasses.PK (deferred to runtime D4)'],
    claims: [
      { slot: 'io.RegistrantClasses.APIPath', value: '/v2.0/RegistrantClass/GetRegistrantClasses', sourcePath: EV_REG },
      { slot: 'io.RegistrantClasses.PaginationType', value: 'None', sourcePath: EV_REG },
      { slot: 'io.RegistrantClasses.SupportsWrite', value: false, sourcePath: EV_REG },
      { slot: 'io.RegistrantClasses.Configuration', value: REG_CONFIG, sourcePath: EV_STUDY },
      { slot: 'iof.RegistrantClasses.RegistrantClassKey.IsPrimaryKey', value: false, sourcePath: EV_STUDY },
    ],
    matrixRow: {
      IOName: 'RegistrantClasses', ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no',
      OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
      PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'defer',
      FKVerdict: 'defer', EvidenceCount: 2,
    },
  },
  {
    objectName: 'BlogComments',
    fieldsExtracted: 6,
    gapsRemaining: [],
    claims: [
      { slot: 'iof.BlogComments.ItemKey.Configuration.ReferencedType', value: 'Blogs', sourcePath: EV_STUDY },
      { slot: 'iof.BlogComments.ItemKey.RelatedIntegrationObjectID', value: '@lookup:MJ: Integration Objects.Name=Blogs&IntegrationID=@parent:IntegrationID', sourcePath: EV_STUDY },
      { slot: 'iof.BlogComments.ItemKey.RelatedIntegrationObjectFieldName', value: 'BlogKey', sourcePath: EV_STUDY },
    ],
    matrixRow: {
      IOName: 'BlogComments', ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
      OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
      PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
      FKVerdict: 'emit-N', EvidenceCount: 1,
    },
  },
  {
    objectName: 'Comments',
    fieldsExtracted: 6,
    gapsRemaining: ['iof.Comments.ItemKey FK target (polymorphic parent — access-path only, no single resolvable target)'],
    claims: [
      { slot: 'iof.Comments.ItemKey.Configuration.ReferencedType', value: null, sourcePath: EV_STUDY },
      { slot: 'iof.Comments.ItemKey.RelatedIntegrationObjectFieldName', value: null, sourcePath: EV_STUDY },
    ],
    matrixRow: {
      IOName: 'Comments', ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
      OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
      PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit',
      FKVerdict: 'defer', EvidenceCount: 1,
    },
  },
  {
    objectName: 'CommunityMembers',
    fieldsExtracted: 35,
    gapsRemaining: [],
    claims: [
      { slot: 'iof.CommunityMembers.CommunityKey.IsPrimaryKey', value: true, sourcePath: EV_STUDY },
      { slot: 'iof.CommunityMembers.CommunityKey.RelatedIntegrationObjectID', value: '@lookup:MJ: Integration Objects.Name=Communities&IntegrationID=@parent:IntegrationID', sourcePath: EV_STUDY },
      { slot: 'iof.CommunityMembers.CommunityKey.Configuration.ReferencedType', value: 'Communities', sourcePath: EV_STUDY },
    ],
    matrixRow: {
      IOName: 'CommunityMembers', ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
      OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
      PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
      FKVerdict: 'emit-N', EvidenceCount: 1,
    },
  },
];
mkdirSync(EMISSION_OUT.substring(0, EMISSION_OUT.lastIndexOf('/')), { recursive: true });
writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2) + '\n');

// also persist the payload/log under the amendment dir for auditability
const AMEND = new URL('./_amendment-r13/', import.meta.url);
mkdirSync(AMEND, { recursive: true });
writeFileSync(new URL('mcp-log.txt', AMEND), log.join('\n') + '\n');
writeFileSync(new URL('provenance.json', AMEND), JSON.stringify(prov, null, 2) + '\n');
writeFileSync(new URL('emission.json', AMEND), JSON.stringify(emission, null, 2) + '\n');

console.log(JSON.stringify({
  mcpCalls: log.length,
  objectsExtracted: emission.length,
  fieldsExtracted: emission.reduce((s, o) => s + o.fieldsExtracted, 0),
  provenance: prov.length,
}, null, 2));
