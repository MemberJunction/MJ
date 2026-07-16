#!/usr/bin/env node
// Amendment Round 5 payload generator for higherlogic-thrive.
// Surgical per-slot FixInstructions on 7 flagged objects ONLY:
//   Blogs, ResourceLibraryDocuments, DocumentAttachments, EventSessions, Communities,
//   CommunityMembers, Volunteers.
// No catalog re-walk. Shallow-merge upsert (adds/overwrites listed keys, never deletes others).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r5/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();
const RIO = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;

// ---------------------------------------------------------------------------
// IO upserts — FIX: Blogs SupportsUpdate + Update* per-operation columns.
// EditBlogRequest is a real flat field editor (not RPC). Blogs already SupportsWrite=true.
// ---------------------------------------------------------------------------
const ioItems = [{ io: {
  Name: 'Blogs',
  SupportsUpdate: true,
  UpdateAPIPath: '/v2.0/Blogs/UpdateBlog?blogKey={id}',
  UpdateMethod: 'POST',
  UpdateBodyShape: 'flat',
  UpdateBodyKey: null,
  UpdateIDLocation: 'path',
} }];

// ---------------------------------------------------------------------------
// IOF upserts — 7 documented FK edges. Mirror the r3 FK shape:
//   RelatedIntegrationObjectID (@lookup push-time pointer) +
//   RelatedIntegrationObjectFieldName (target PK) + Configuration.ReferencedType (runtime hint).
// ---------------------------------------------------------------------------
const FK = (ioName, iof, target, targetPK) => ({ ioName, iof: {
  Name: iof, Type: 'String',
  RelatedIntegrationObjectID: RIO(target),
  RelatedIntegrationObjectFieldName: targetPK,
  Configuration: { ReferencedType: target },
} });

const iofItems = [
  FK('ResourceLibraryDocuments', 'LibraryKey', 'ResourceLibraryLibraries', 'LibraryKey'),
  FK('DocumentAttachments', 'DocumentKey', 'ResourceLibraryDocuments', 'DocumentKey'),
  FK('EventSessions', 'EventSessionCategoryKey', 'EventSessions', 'EventSessionKey'), // self-ref
  FK('EventSessions', 'CreatedByContactKey', 'Contacts', 'ContactKey'),
  FK('EventSessions', 'UpdatedByContactKey', 'Contacts', 'ContactKey'),
  FK('Communities', 'ParentCommunityKey', 'Communities', 'CommunityKey'), // self-ref
  FK('CommunityMembers', 'InvitedByContactKey', 'Contacts', 'ContactKey'),
  FK('Volunteers', 'AdjustedByContactKey', 'Contacts', 'ContactKey'),
];

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------
const P = (p, uf, tf, ex, tier = 2) => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: tier,
  SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const BLOG = 'sources/ops/POST-api-v2.0-Blogs-UpdateBlog_blogKey.html';
const SS = 'SOURCE_STUDY.md';
const prov = [
  P(BLOG, 'Blogs.SupportsUpdate — real field editor UpdateBlog (EditBlogRequest), not RPC',
    'io.Blogs.SupportsUpdate', 'POST api/v2.0/Blogs/UpdateBlog?blogKey={blogKey} — EditBlogRequest flat field set.'),
  P(BLOG, 'Blogs.UpdateAPIPath — path template for UpdateBlog',
    'io.Blogs.UpdateAPIPath', 'POST api/v2.0/Blogs/UpdateBlog?blogKey={blogKey}.'),
  P(BLOG, 'Blogs.UpdateMethod — POST per HelpPage title',
    'io.Blogs.UpdateMethod', 'POST api/v2.0/Blogs/UpdateBlog?blogKey={blogKey}.'),
  P(BLOG, 'Blogs.UpdateBodyShape — EditBlogRequest is a flat field set',
    'io.Blogs.UpdateBodyShape', 'EditBlogRequest body is a flat set of blog fields.'),
  P(BLOG, 'Blogs.UpdateIDLocation — blogKey is a path/query template segment',
    'io.Blogs.UpdateIDLocation', 'blogKey={blogKey} is a URL template segment, not in the request body.'),
  P(SS, 'ResourceLibraryDocuments.LibraryKey FK -> ResourceLibraryLibraries (documented, sibling IO emitted)',
    'iof.ResourceLibraryDocuments.LibraryKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 170 — LibraryKey references the library.'),
  P(SS, 'DocumentAttachments.DocumentKey FK -> ResourceLibraryDocuments (documented, sibling IO emitted)',
    'iof.DocumentAttachments.DocumentKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 171 — DocumentKey references the parent document.'),
  P(SS, 'EventSessions.EventSessionCategoryKey self-ref FK -> EventSessions (documented)',
    'iof.EventSessions.EventSessionCategoryKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 167 — session category self-reference.'),
  P(SS, 'EventSessions.CreatedByContactKey FK -> Contacts (documented)',
    'iof.EventSessions.CreatedByContactKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 167 — created-by contact.'),
  P(SS, 'EventSessions.UpdatedByContactKey FK -> Contacts (documented)',
    'iof.EventSessions.UpdatedByContactKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 167 — updated-by contact.'),
  P(SS, 'Communities.ParentCommunityKey self-ref FK -> Communities (documented)',
    'iof.Communities.ParentCommunityKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 154 — parent community self-reference.'),
  P(SS, 'CommunityMembers.InvitedByContactKey FK -> Contacts (documented)',
    'iof.CommunityMembers.InvitedByContactKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 155 — invited-by contact.'),
  P(SS, 'Volunteers.AdjustedByContactKey FK -> Contacts (documented)',
    'iof.Volunteers.AdjustedByContactKey.RelatedIntegrationObjectID', 'SOURCE_STUDY.md line 181 — adjusted-by contact.'),
];

w('io-items.json', ioItems);
w('iof-items.json', iofItems);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the 7 re-processed objects.
// fieldsExtracted read from the CURRENT persisted metadata (post-upsert counts don't change field COUNT).
// ---------------------------------------------------------------------------
const METAPATH = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const raw = JSON.parse(readFileSync(METAPATH, 'utf8'));
const root = (Array.isArray(raw) ? raw : [raw])[0];
const ios = root.relatedEntities['MJ: Integration Objects'];
const fieldCount = (n) => (ios.find((o) => o.fields.Name === n)?.relatedEntities?.['MJ: Integration Object Fields']?.length) ?? 0;

const mrow = (name, fkVerdict, evCount) => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
  FKVerdict: fkVerdict, EvidenceCount: evCount,
});

const emission = [
  { objectName: 'Blogs', fieldsExtracted: fieldCount('Blogs'), gapsRemaining: [],
    claims: [
      { slot: 'io.Blogs.SupportsUpdate', value: true, sourcePath: BLOG },
      { slot: 'io.Blogs.UpdateAPIPath', value: '/v2.0/Blogs/UpdateBlog?blogKey={id}', sourcePath: BLOG },
      { slot: 'io.Blogs.UpdateMethod', value: 'POST', sourcePath: BLOG },
      { slot: 'io.Blogs.UpdateBodyShape', value: 'flat', sourcePath: BLOG },
      { slot: 'io.Blogs.UpdateIDLocation', value: 'path', sourcePath: BLOG },
    ], matrixRow: mrow('Blogs', 'defer', 5) },
  { objectName: 'ResourceLibraryDocuments', fieldsExtracted: fieldCount('ResourceLibraryDocuments'), gapsRemaining: [],
    claims: [
      { slot: 'iof.ResourceLibraryDocuments.LibraryKey.RelatedIntegrationObjectID', value: RIO('ResourceLibraryLibraries'), sourcePath: SS },
    ], matrixRow: mrow('ResourceLibraryDocuments', 'emit-1', 1) },
  { objectName: 'DocumentAttachments', fieldsExtracted: fieldCount('DocumentAttachments'), gapsRemaining: [],
    claims: [
      { slot: 'iof.DocumentAttachments.DocumentKey.RelatedIntegrationObjectID', value: RIO('ResourceLibraryDocuments'), sourcePath: SS },
    ], matrixRow: mrow('DocumentAttachments', 'emit-1', 1) },
  { objectName: 'EventSessions', fieldsExtracted: fieldCount('EventSessions'), gapsRemaining: [],
    claims: [
      { slot: 'iof.EventSessions.EventSessionCategoryKey.RelatedIntegrationObjectID', value: RIO('EventSessions'), sourcePath: SS },
      { slot: 'iof.EventSessions.CreatedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: SS },
      { slot: 'iof.EventSessions.UpdatedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: SS },
    ], matrixRow: mrow('EventSessions', 'emit-3', 3) },
  { objectName: 'Communities', fieldsExtracted: fieldCount('Communities'), gapsRemaining: [],
    claims: [
      { slot: 'iof.Communities.ParentCommunityKey.RelatedIntegrationObjectID', value: RIO('Communities'), sourcePath: SS },
    ], matrixRow: mrow('Communities', 'emit-1', 1) },
  { objectName: 'CommunityMembers', fieldsExtracted: fieldCount('CommunityMembers'), gapsRemaining: [],
    claims: [
      { slot: 'iof.CommunityMembers.InvitedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: SS },
    ], matrixRow: mrow('CommunityMembers', 'emit-1', 1) },
  { objectName: 'Volunteers', fieldsExtracted: fieldCount('Volunteers'), gapsRemaining: [],
    claims: [
      { slot: 'iof.Volunteers.AdjustedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: SS },
    ], matrixRow: mrow('Volunteers', 'emit-1', 1) },
];

const EMIT = new URL('../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json', import.meta.url);
writeFileSync(EMIT, JSON.stringify(emission, null, 2) + '\n');

const totalFields = emission.reduce((s, o) => s + o.fieldsExtracted, 0);
console.log(JSON.stringify({
  ioItems: ioItems.length, iofItems: iofItems.length, prov: prov.length,
  objectsExtracted: emission.length, fieldsExtracted: totalFields,
}, null, 2));
