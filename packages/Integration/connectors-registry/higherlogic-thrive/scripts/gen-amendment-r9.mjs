#!/usr/bin/env node
// Amendment Round 9 payload generator for higherlogic-thrive.
// Surgical per-slot FixInstructions on 3 flagged objects ONLY: Volunteers, DemographicChoices, EventSessions.
// No catalog re-walk. Shallow-merge upsert (adds/overwrites listed keys, never deletes others);
// FK clears use delete_integration_object_field (physical key removal — nulling is insufficient).
//
//   1) Volunteers.SupportsWrite — no-op record-scope decision (OPERATOR-RESOLVED, FINAL/standing,
//      reaffirming round 4/7/8): remains fully read-only. VolunteerForOpportunity/
//      ApproveVolunteerApplication/WithdrawFromOpportunity are identity-implicit RPC actions whose
//      response resource is the PARENT VolunteerOpportunity, not a distinct keyed registration
//      record — out-of-scope for generic per-record CRUD (same shape/resolution as EventRegistrants,
//      round 3). Upsert the confirming (already-false) values so provenance records the reaffirmation.
//   2) DemographicChoices.DemographicTypeKey — ADD scalar FK field flattened from the response's
//      nested DemographicType.DemographicTypeKey → DemographicTypes (pattern mirrors
//      BlogComments.ItemKey / DocumentAttachments.DocumentKey).
//   3) Volunteers.VolunteerContactKey — ADD scalar FK field flattened from the response's nested
//      VolunteerContact.ContactKey → Contacts (consistent with the 4 other ContactKey FKs on this IO).
//   4) EventSessions.EventSessionCategoryKey — CLEAR the incorrect self-referencing FK
//      (EventSessions). Identifies a session-category/track grouping; no EventSessionCategories object
//      exists in the 34-leaf taxonomy to target, so leave it FK-less (matching sibling CategoryKey).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r9/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();

const METAPATH =
  '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const raw = JSON.parse(readFileSync(METAPATH, 'utf8'));
const root = (Array.isArray(raw) ? raw : [raw])[0];
const ios = root.relatedEntities['MJ: Integration Objects'];
const ioByName = (n) => ios.find((o) => o.fields.Name === n);
const fieldCount = (n) => ioByName(n)?.relatedEntities?.['MJ: Integration Object Fields']?.length ?? 0;

const RIO = (target) => `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:IntegrationID`;

// ---------------------------------------------------------------------------
// (1) Volunteers — reaffirm read-only (values already current; explicit no-op upsert).
// ---------------------------------------------------------------------------
const VOL_WRITE = {
  SupportsWrite: false,
  SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
  SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
  SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
};

const ioItems = [
  { io: { Name: 'Volunteers', ...VOL_WRITE } },
];

// ---------------------------------------------------------------------------
// (2)+(3) New scalar-FK fields (shallow-merge; adds the new IOF rows).
// ---------------------------------------------------------------------------
const iofItems = [
  {
    ioName: 'DemographicChoices',
    iof: {
      Name: 'DemographicTypeKey',
      DisplayName: 'Demographic Type Key',
      Description: 'FK to DemographicTypes — flattened from the response\'s nested DemographicType.DemographicTypeKey.',
      Type: 'String',
      IsPrimaryKey: false, IsRequired: false, IsReadOnly: false, IsUniqueKey: false, AllowsNull: true,
      Status: 'Active', Sequence: 4,
      RelatedIntegrationObjectID: RIO('DemographicTypes'),
      RelatedIntegrationObjectFieldName: 'DemographicTypeKey',
      Configuration: { ReferencedType: 'DemographicTypes' },
    },
  },
  {
    ioName: 'Volunteers',
    iof: {
      Name: 'VolunteerContactKey',
      DisplayName: 'Volunteer Contact Key',
      Description: 'FK to Contacts — flattened from the response\'s nested VolunteerContact.ContactKey (the volunteering member).',
      Type: 'String',
      IsPrimaryKey: false, IsRequired: false, IsReadOnly: false, IsUniqueKey: false, AllowsNull: true,
      Status: 'Active', Sequence: 17,
      RelatedIntegrationObjectID: RIO('Contacts'),
      RelatedIntegrationObjectFieldName: 'ContactKey',
      Configuration: { ReferencedType: 'Contacts' },
    },
  },
];

// ---------------------------------------------------------------------------
// (4) EventSessions.EventSessionCategoryKey — CLEAR the incorrect self-FK.
//     Physically delete the three FK-related keys (null is insufficient for mj-sync validation).
// ---------------------------------------------------------------------------
const iofFieldDeletes = [
  { ioName: 'EventSessions', iofName: 'EventSessionCategoryKey', fieldKey: 'RelatedIntegrationObjectID' },
  { ioName: 'EventSessions', iofName: 'EventSessionCategoryKey', fieldKey: 'RelatedIntegrationObjectFieldName' },
  { ioName: 'EventSessions', iofName: 'EventSessionCategoryKey', fieldKey: 'Configuration' },
];

// ---------------------------------------------------------------------------
// Provenance — one entry per corrected/reaffirmed slot.
// ---------------------------------------------------------------------------
const P = (p, uf, tf, ex, tier = 2) => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: tier,
  SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const EV_VOL_A = 'sources/ops/POST-api-v2.0-Volunteer-VolunteerForOpportunity_volunteerOpportunityKey_comments.html';
const EV_VOL_B = 'sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html';
const EV_VOL_C = 'sources/ops/DELETE-api-v2.0-Volunteer-WithdrawFromOpportunity_volunteerOpportunityKey_comments.html';
const EV_DEMO = 'sources/ops/GET-api-v2.0-Demographics-GetDemographicChoices_demographicTypeKey.html';
const EV_VOLLIST = 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html';
const EV_SESSION = 'sources/ops/GET-api-v2.0-EventSessions-GetSession_sessionKey.html';

const prov = [
  P(EV_VOL_A,
    'Volunteers.SupportsWrite — reaffirm read-only (VolunteerForOpportunity is an identity-implicit RPC action on the parent VolunteerOpportunity, not per-record CRUD)',
    'io.Volunteers.SupportsWrite',
    'POST VolunteerForOpportunity/{volunteerOpportunityKey}: enrolls the CURRENT user; response resource is the parent VolunteerOpportunity, not a distinct keyed registration record — out-of-scope for generic per-record Create. FINAL standing operator decision.'),
  P(EV_VOL_B,
    'Volunteers.SupportsUpdate — reaffirm read-only (ApproveVolunteerApplication is an identity-implicit RPC action, not per-record Update)',
    'io.Volunteers.SupportsUpdate',
    'POST ApproveVolunteerApplication: admin approval action; no distinct keyed registration record returned — not generic per-record Update.'),
  P(EV_VOL_C,
    'Volunteers.SupportsDelete — reaffirm read-only (WithdrawFromOpportunity is an identity-implicit RPC action, not per-record Delete)',
    'io.Volunteers.SupportsDelete',
    'DELETE WithdrawFromOpportunity/{volunteerOpportunityKey}: withdraws the CURRENT user; identity-implicit action, not a keyed per-record Delete. Same shape/resolution as EventRegistrants (round 3).'),
  P(EV_DEMO,
    'DemographicChoices.DemographicTypeKey — scalar FK flattened from nested DemographicType.DemographicTypeKey → DemographicTypes',
    'iof.DemographicChoices.DemographicTypeKey.RelatedIntegrationObjectID',
    'GetDemographicChoices response nests DemographicType { DemographicTypeKey }; flattened to a scalar FK field targeting DemographicTypes (pattern mirrors BlogComments.ItemKey / DocumentAttachments.DocumentKey).'),
  P(EV_VOLLIST,
    'Volunteers.VolunteerContactKey — scalar FK flattened from nested VolunteerContact.ContactKey → Contacts',
    'iof.Volunteers.VolunteerContactKey.RelatedIntegrationObjectID',
    'GetVolunteerList response nests VolunteerContact { ContactKey } (the volunteering member); flattened to a scalar FK targeting Contacts, consistent with the 4 other ContactKey FKs on this IO.'),
  P(EV_SESSION,
    'EventSessions.EventSessionCategoryKey — CLEAR incorrect self-FK; identifies a session-category/track grouping, no EventSessionCategories object to target',
    'iof.EventSessions.EventSessionCategoryKey.RelatedIntegrationObjectID',
    'EventSessionCategoryKey names a session-category/track grouping, NOT another EventSession record. No EventSessionCategories object exists in the 34-leaf taxonomy; leave FK-less (matching sibling CategoryKey, already unresolved).'),
];

w('io-items.json', ioItems);
w('iof-items.json', iofItems);
w('iof-field-deletes.json', iofFieldDeletes);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the 3 re-processed objects.
// Field counts reflect POST-amendment state (+1 for the two new-field adds).
// ---------------------------------------------------------------------------
const mrow = (name, evCount, pk = 'emit', fk = 'emit-N') => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: pk,
  FKVerdict: fk, EvidenceCount: evCount,
});

const emission = [
  {
    objectName: 'Volunteers',
    fieldsExtracted: fieldCount('Volunteers') + 1, // + VolunteerContactKey
    gapsRemaining: ['SupportsWrite (VolunteerForOpportunity/ApproveVolunteerApplication/WithdrawFromOpportunity are out-of-scope identity-implicit RPC ACTIONS, not generic per-record CRUD — operator-resolved read-only, FINAL/standing)'],
    claims: [
      { slot: 'io.Volunteers.SupportsWrite', value: false, sourcePath: EV_VOL_A },
      { slot: 'io.Volunteers.SupportsCreate', value: false, sourcePath: EV_VOL_A },
      { slot: 'io.Volunteers.SupportsUpdate', value: false, sourcePath: EV_VOL_B },
      { slot: 'io.Volunteers.SupportsDelete', value: false, sourcePath: EV_VOL_C },
      { slot: 'iof.Volunteers.VolunteerContactKey', value: RIO('Contacts'), sourcePath: EV_VOLLIST },
    ],
    matrixRow: mrow('Volunteers', 4, 'emit', 'emit-5'),
  },
  {
    objectName: 'DemographicChoices',
    fieldsExtracted: fieldCount('DemographicChoices') + 1, // + DemographicTypeKey
    gapsRemaining: [],
    claims: [
      { slot: 'iof.DemographicChoices.DemographicTypeKey', value: RIO('DemographicTypes'), sourcePath: EV_DEMO },
    ],
    matrixRow: mrow('DemographicChoices', 1, 'emit', 'emit-1'),
  },
  {
    objectName: 'EventSessions',
    fieldsExtracted: fieldCount('EventSessions'),
    gapsRemaining: ['EventSessionCategoryKey (session-category/track grouping; no EventSessionCategories object in taxonomy — left FK-less)'],
    claims: [
      { slot: 'iof.EventSessions.EventSessionCategoryKey.RelatedIntegrationObjectID', value: null, sourcePath: EV_SESSION },
    ],
    matrixRow: mrow('EventSessions', 1, 'emit', 'emit-1'),
  },
];

const EMIT = new URL(
  '../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json',
  import.meta.url,
);
mkdirSync(new URL('../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/', import.meta.url), { recursive: true });
writeFileSync(EMIT, JSON.stringify(emission, null, 2) + '\n');

const totalFields = emission.reduce((s, o) => s + o.fieldsExtracted, 0);
console.log(JSON.stringify({
  ioItems: ioItems.length, iofItems: iofItems.length, iofFieldDeletes: iofFieldDeletes.length, prov: prov.length,
  objectsExtracted: emission.length, fieldsExtracted: totalFields,
}, null, 2));
