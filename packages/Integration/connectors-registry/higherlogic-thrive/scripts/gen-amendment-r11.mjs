#!/usr/bin/env node
// Amendment Round 11 payload generator for higherlogic-thrive.
// DELTA — surgical per-slot FixInstructions on 5 flagged objects:
//   Blogs, ResourceLibraryDocuments, Ideas, VolunteerOpportunities, Events.
// No catalog re-walk. Field-level shallow-merge upsert (adds/overwrites listed keys, never deletes).
//
// Root cause (all 5): documented nested SINGLE-OBJECT references (ContactConcise / Community /
// IdeaStatus) were dropped from the emitted IOF sets instead of being FLATTENED into scalar FK
// fields — the convention the connector applies correctly on Announcements.CreatedByContactKey /
// Announcements.CommunityKey / DiscussionPosts.ContactKey. Categories/array child-collections stay
// excluded (correctly); only the scalar single-object refs are flattened here.
//   - Blogs:                    +CreatedByContactKey (Author→Contacts), +CommunityKey (Community→Communities)
//   - ResourceLibraryDocuments: +CreatedByContactKey (CreatedByContact→Contacts)
//   - Ideas:                    +CommunityKey (Community→Communities), +IdeaStatusKey (Status→IdeaStatuses),
//                               +AuthorContactKey (Author→Contacts)
//   - VolunteerOpportunities:   +CommunityKey (Community→Communities)
//   - Events:                   WIRE existing CommunityKey (field present but FK linkage unset) →
//                               RelatedIntegrationObjectID + RelatedIntegrationObjectFieldName +
//                               Configuration.ReferencedType (bijection with Announcements/DiscussionPosts).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r11/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();

const METAPATH =
  '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const raw = JSON.parse(readFileSync(METAPATH, 'utf8'));
const root = (Array.isArray(raw) ? raw : [raw])[0];
const ios = root.relatedEntities['MJ: Integration Objects'];
const ioByName = (n) => ios.find((o) => o.fields.Name === n);
const iofsOf = (n) => ioByName(n)?.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
const fieldCount = (n) => iofsOf(n).length;
const maxSeq = (n) => iofsOf(n).reduce((m, f) => Math.max(m, f.fields.Sequence ?? 0), 0);

const lookup = (target) =>
  `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:IntegrationID`;

// Flattened-FK IOF factory — mirrors Announcements.CreatedByContactKey / CommunityKey shape.
const fkField = ({ name, display, desc, target, relField, refType, flattenedFrom, seq }) => ({
  Name: name,
  DisplayName: display,
  Description: desc,
  Type: 'String',
  IsRequired: false,
  IsReadOnly: true,
  IsPrimaryKey: false,
  IsUniqueKey: false,
  RelatedIntegrationObjectID: lookup(target),
  RelatedIntegrationObjectFieldName: relField,
  AllowsNull: true,
  Status: 'Active',
  Sequence: seq,
  Configuration: { ReferencedType: refType, flattenedFrom },
  IntegrationObjectID: '@parent:ID',
});

// ---------------------------------------------------------------------------
// IOF upsert items — one { ioName, iof } per new/wired field.
// ---------------------------------------------------------------------------
const B = maxSeq('Blogs');
const R = maxSeq('ResourceLibraryDocuments');
const I = maxSeq('Ideas');
const V = maxSeq('VolunteerOpportunities');

const iofItems = [
  // Blogs
  { ioName: 'Blogs', iof: fkField({
      name: 'CreatedByContactKey', display: 'Created By Contact Key',
      desc: 'The primary key of the contact who authored the blog (flattened from the Author ContactConcise reference).',
      target: 'Contacts', relField: 'ContactKey', refType: 'Contacts',
      flattenedFrom: 'Author (ContactConcise)', seq: B + 1 }) },
  { ioName: 'Blogs', iof: fkField({
      name: 'CommunityKey', display: 'Community Key',
      desc: 'If the blog is associated to a community, the primary key of that community (flattened from the Community reference).',
      target: 'Communities', relField: 'CommunityKey', refType: 'Communities',
      flattenedFrom: 'Community (Community)', seq: B + 2 }) },
  // ResourceLibraryDocuments
  { ioName: 'ResourceLibraryDocuments', iof: fkField({
      name: 'CreatedByContactKey', display: 'Created By Contact Key',
      desc: 'The primary key of the contact who created the document (flattened from the CreatedByContact ContactConcise reference).',
      target: 'Contacts', relField: 'ContactKey', refType: 'Contacts',
      flattenedFrom: 'CreatedByContact (ContactConcise)', seq: R + 1 }) },
  // Ideas
  { ioName: 'Ideas', iof: fkField({
      name: 'CommunityKey', display: 'Community Key',
      desc: 'If the idea is associated to a community, the primary key of that community (flattened from the Community reference).',
      target: 'Communities', relField: 'CommunityKey', refType: 'Communities',
      flattenedFrom: 'Community (Community)', seq: I + 1 }) },
  { ioName: 'Ideas', iof: fkField({
      name: 'IdeaStatusKey', display: 'Idea Status Key',
      desc: 'The primary key of the idea status (flattened from the Status IdeaStatus reference).',
      target: 'IdeaStatuses', relField: 'StatusKey', refType: 'IdeaStatuses',
      flattenedFrom: 'Status (IdeaStatus)', seq: I + 2 }) },
  { ioName: 'Ideas', iof: fkField({
      name: 'AuthorContactKey', display: 'Author Contact Key',
      desc: 'The primary key of the contact who authored the idea (flattened from the Author ContactConcise reference).',
      target: 'Contacts', relField: 'ContactKey', refType: 'Contacts',
      flattenedFrom: 'Author (ContactConcise)', seq: I + 3 }) },
  // VolunteerOpportunities
  { ioName: 'VolunteerOpportunities', iof: fkField({
      name: 'CommunityKey', display: 'Community Key',
      desc: 'If the volunteer opportunity is linked to a specific community, the primary key of that community (flattened from the Community reference).',
      target: 'Communities', relField: 'CommunityKey', refType: 'Communities',
      flattenedFrom: 'Community (Community)', seq: V + 1 }) },
  // Events — WIRE the existing CommunityKey field (shallow-merge adds the FK keys, keeps the rest).
  { ioName: 'Events', iof: {
      Name: 'CommunityKey',
      RelatedIntegrationObjectID: lookup('Communities'),
      RelatedIntegrationObjectFieldName: 'CommunityKey',
      IsReadOnly: true,
      Configuration: { ReferencedType: 'Communities', flattenedFrom: 'Community (Community)' },
    } },
];

w('iof-items.json', iofItems);

// ---------------------------------------------------------------------------
// Provenance — one entry per flattened/wired FK field.
// ---------------------------------------------------------------------------
const P = (evRel, uf, tf, ex) => ({
  URL: 'file://packages/Integration/connectors-registry/higherlogic-thrive/' + evRel,
  AccessedAt: NOW, UsedFor: uf, SourceTier: 1, SourceCategory: 'OfficialDocs',
  EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const EV_BLOG = 'sources/ops/GET-api-v2.0-Blogs-GetBlog_blogKey.html';
const EV_RLD = 'sources/ops/GET-api-v2.0-ResourceLibrary-GetLibraryDocument_documentKey_paginateComments_commentLimit.html';
const EV_IDEA = 'sources/ops/GET-api-v2.0-Ideation-IdeaDetails_ideationKey.html';
const EV_VOL = 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerOpportunityList.html';
const EV_EVT = 'sources/ops/GET-api-v2.0-Events-GetEvent_eventKey.html';

const prov = [
  P(EV_BLOG, 'Blogs.CreatedByContactKey — flattened from documented Author (ContactConcise) reference',
    'iof.Blogs.CreatedByContactKey.RelatedIntegrationObjectID',
    'Blog Resource Description documents "Author: ContactConcise"; flattened to a scalar FK → Contacts.ContactKey per the connector convention (Announcements/DiscussionPosts).'),
  P(EV_BLOG, 'Blogs.CommunityKey — flattened from documented Community reference',
    'iof.Blogs.CommunityKey.RelatedIntegrationObjectID',
    'Blog Resource Description documents "Community: Community"; flattened to a scalar FK → Communities.CommunityKey.'),
  P(EV_RLD, 'ResourceLibraryDocuments.CreatedByContactKey — flattened from documented CreatedByContact (ContactConcise) reference',
    'iof.ResourceLibraryDocuments.CreatedByContactKey.RelatedIntegrationObjectID',
    'Document Resource Description documents "CreatedByContact: ContactConcise"; flattened to a scalar FK → Contacts.ContactKey.'),
  P(EV_IDEA, 'Ideas.CommunityKey — flattened from documented Community reference',
    'iof.Ideas.CommunityKey.RelatedIntegrationObjectID',
    'Idea Resource Description documents "Community: the community the idea has been associated"; flattened to a scalar FK → Communities.CommunityKey.'),
  P(EV_IDEA, 'Ideas.IdeaStatusKey — flattened from documented Status (IdeaStatus) reference',
    'iof.Ideas.IdeaStatusKey.RelatedIntegrationObjectID',
    'Idea Resource Description documents "Status: IdeaStatus"; flattened to a scalar FK → IdeaStatuses.StatusKey.'),
  P(EV_IDEA, 'Ideas.AuthorContactKey — flattened from documented Author (ContactConcise) reference',
    'iof.Ideas.AuthorContactKey.RelatedIntegrationObjectID',
    'Idea Resource Description documents "Author: the author of the idea (ContactConcise)"; flattened to a scalar FK → Contacts.ContactKey.'),
  P(EV_VOL, 'VolunteerOpportunities.CommunityKey — flattened from documented Community reference',
    'iof.VolunteerOpportunities.CommunityKey.RelatedIntegrationObjectID',
    'VolunteerOpportunity Resource Description documents "Community: If the Volunteer Opportunity is linked to a specific Community... Community data for that Community"; flattened to a scalar FK → Communities.CommunityKey.'),
  P(EV_EVT, 'Events.CommunityKey — wire existing field to documented Community reference',
    'iof.Events.CommunityKey.RelatedIntegrationObjectID',
    'Event model documents a Community association; the CommunityKey field was flattened but its FK linkage (RelatedIntegrationObjectID/Configuration.ReferencedType) was unset — wired here to Communities.CommunityKey (bijection with Announcements.CommunityKey / DiscussionPosts.CommunityKey).'),
];
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the 5 re-processed objects.
// ---------------------------------------------------------------------------
const mrow = (name, evCount) => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
  FKVerdict: 'emit-N', EvidenceCount: evCount,
});

// fieldsExtracted computed AFTER the upsert (post-file counts include the added fields).
const addedByObj = { Blogs: 2, ResourceLibraryDocuments: 1, Ideas: 3, VolunteerOpportunities: 1, Events: 0 };
const objMeta = {
  Blogs: { claims: [
      { slot: 'iof.Blogs.CreatedByContactKey.RelatedIntegrationObjectID', value: lookup('Contacts'), sourcePath: EV_BLOG },
      { slot: 'iof.Blogs.CommunityKey.RelatedIntegrationObjectID', value: lookup('Communities'), sourcePath: EV_BLOG },
    ], ev: 2 },
  ResourceLibraryDocuments: { claims: [
      { slot: 'iof.ResourceLibraryDocuments.CreatedByContactKey.RelatedIntegrationObjectID', value: lookup('Contacts'), sourcePath: EV_RLD },
    ], ev: 1 },
  Ideas: { claims: [
      { slot: 'iof.Ideas.CommunityKey.RelatedIntegrationObjectID', value: lookup('Communities'), sourcePath: EV_IDEA },
      { slot: 'iof.Ideas.IdeaStatusKey.RelatedIntegrationObjectID', value: lookup('IdeaStatuses'), sourcePath: EV_IDEA },
      { slot: 'iof.Ideas.AuthorContactKey.RelatedIntegrationObjectID', value: lookup('Contacts'), sourcePath: EV_IDEA },
    ], ev: 3 },
  VolunteerOpportunities: { claims: [
      { slot: 'iof.VolunteerOpportunities.CommunityKey.RelatedIntegrationObjectID', value: lookup('Communities'), sourcePath: EV_VOL },
    ], ev: 1 },
  Events: { claims: [
      { slot: 'iof.Events.CommunityKey.RelatedIntegrationObjectID', value: lookup('Communities'), sourcePath: EV_EVT },
    ], ev: 1 },
};

const emission = Object.keys(objMeta).map((name) => ({
  objectName: name,
  fieldsExtracted: fieldCount(name) + addedByObj[name], // post-upsert count
  gapsRemaining: [],
  claims: objMeta[name].claims,
  matrixRow: mrow(name, objMeta[name].ev),
}));

w('emission.json', emission);

console.log(JSON.stringify({
  iofItems: iofItems.length, prov: prov.length,
  objectsExtracted: emission.length,
  fieldsExtracted: emission.reduce((s, o) => s + o.fieldsExtracted, 0),
  added: addedByObj,
}, null, 2));
