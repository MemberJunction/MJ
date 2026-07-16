#!/usr/bin/env node
// Amendment Round 3 payload generator for higherlogic-thrive.
// Applies reviewer FixInstructions surgically to 4 flagged objects: Volunteers, Ideas, EventTypes,
// EventRegistrants. Emits MCP batch item arrays (io upserts, iof upserts, provenance) + the delta
// emission artifact. Idempotent (shallow-merge upsert). No catalog re-walk.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r3/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();
const RIO = (t) => `@lookup:MJ: Integration Objects.Name=${t}&IntegrationID=@parent:IntegrationID`;

const METAPATH = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const raw = JSON.parse(readFileSync(METAPATH, 'utf8'));
const root = (Array.isArray(raw) ? raw : [raw])[0];
const ios = root.relatedEntities['MJ: Integration Objects'];
const getIO = (n) => ios.find((o) => o.fields.Name === n);

// ---------------------------------------------------------------------------
// IO upserts (shallow-merge — only listed keys change; never deletes existing keys)
// ---------------------------------------------------------------------------
const ioItems = [];

// FIX 1 — Volunteers.SupportsUpdate downgrade (keeps Create+Delete; SupportsWrite stays true).
// ApproveVolunteerApplication is a narrow approval RPC, not a general field editor.
ioItems.push({ io: {
  Name: 'Volunteers',
  SupportsUpdate: false,
  UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
} });

// FIX 2 — Ideas.SupportsUpdate downgrade (keeps Create; SupportsWrite stays true).
// UpdateIdeaStatus is a status-transition RPC {IdeationKey, IdeationStatusKey}, not a field editor.
ioItems.push({ io: {
  Name: 'Ideas',
  SupportsUpdate: false,
  UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
} });

// FIX 5 — EventTypes fully write-capable (SaveEventType upsert = Create+Update; DeleteEventType = Delete).
// OPERATOR-RESOLVED round 3: CreateAPIPath===UpdateAPIPath is a valid documented upsert surface.
ioItems.push({ io: {
  Name: 'EventTypes',
  SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
  CreateAPIPath: '/v2.0/Events/SaveEventType', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateBodyKey: null, CreateIDLocation: 'body',
  UpdateAPIPath: '/v2.0/Events/SaveEventType', UpdateMethod: 'POST', UpdateBodyShape: 'flat', UpdateBodyKey: null, UpdateIDLocation: 'body',
  DeleteAPIPath: '/v2.0/Events/DeleteEventType?eventTypeKey={id}', DeleteMethod: 'POST', DeleteIDLocation: 'path',
} });

// FIX 6 — EventRegistrants stays READ-ONLY (no capability change). Record the out-of-scope RSVP
// action into its own scoped Configuration (string), preserving existing keys.
// OPERATOR-RESOLVED round 3: RSVP is action-shaped (delete id = parent Event key, not registrant key).
{
  const er = getIO('EventRegistrants');
  const cfg = typeof er.fields.Configuration === 'string'
    ? JSON.parse(er.fields.Configuration)
    : (er.fields.Configuration ?? {});
  cfg.OutOfScopeActions = [
    { action: 'RSVPToEvent', op: 'POST /v2.0/Events/RSVPToEvent?eventKey={id}',
      reason: 'Action-shaped "RSVP to this event" — not generic per-record create; id param is the parent Event key, not a registrant key.' },
    { action: 'RSVP-delete', op: 'DELETE /v2.0/Events/RSVP?eventKey={id}',
      reason: 'Action-shaped "cancel my own RSVP" — delete id param is the PARENT Event key, not the registrant RegistrantKey; generic DeleteRecord(registrantID) would be semantically wrong. Future MJ Action can expose it.' },
  ];
  ioItems.push({ io: { Name: 'EventRegistrants', SupportsWrite: false, Configuration: JSON.stringify(cfg) } });
}

// ---------------------------------------------------------------------------
// IOF upserts (shallow-merge onto existing rows, matched by iof.Name)
// ---------------------------------------------------------------------------
const iofItems = [];

// FIX 3 — Volunteers.ApprovedByContactKey FK -> Contacts (Tier-1 explicit statement)
iofItems.push({ ioName: 'Volunteers', iof: {
  Name: 'ApprovedByContactKey', Type: 'String',
  RelatedIntegrationObjectID: RIO('Contacts'),
  RelatedIntegrationObjectFieldName: 'ContactKey',
  Configuration: { ReferencedType: 'Contacts' },
} });

// FIX 4 — Volunteers.RejectedByContactKey FK -> Contacts (Tier-1 explicit statement)
iofItems.push({ ioName: 'Volunteers', iof: {
  Name: 'RejectedByContactKey', Type: 'String',
  RelatedIntegrationObjectID: RIO('Contacts'),
  RelatedIntegrationObjectFieldName: 'ContactKey',
  Configuration: { ReferencedType: 'Contacts' },
} });

// FIX 5 (cont.) — EventTypes SaveEventType body fields (27). Types read from
// POST-api-v2.0-Events-SaveEventType.html (EventTypePostRequest). All write-body.
const S = 'String', B = 'Boolean', I = 'Integer';
const etFields = [
  ['EventTypeName', S], ['EventTypeDescription', S], ['AllowMultipleRegistrations', B],
  ['AllowMultipleOptions', B], ['AllowMultipleSessions', B], ['AcceptPayment', B], ['IsActive', B],
  ['AllowRegistration', B], ['AllowSameSelections', B], ['ShowAddEditScreenDescription', B],
  ['AllowNonMemberRegistration', B], ['AllowPublicUserRegistration', B], ['AllowEarlyRegistrationRate', B],
  ['AllowLateRegistrationRate', B], ['AddEditScreenDescription', S], ['EventTypeDescriptionWaterMarkText', S],
  ['AllowMultiDay', B], ['AllowPhysicalAddress', B], ['AllowOnlinePhone', B], ['AllowEventLogo', B],
  ['AllowCommunityAdminToUse', B], ['AllowCommunityMemberToUse', B], ['AllowEventVisibilityChanges', B],
  ['SuppressOptionDisplay', B], ['SuppressSessionDisplay', B], ['AllowCredits', B], ['RegistrationProcessOption', I],
];
const humanize = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
// NOTE: NO `Source`/`MetadataSource` key — that column is set by the persistence pipeline, never authored
// (metadata-file-conventions: mj-sync validation errors on stray keys). Existing IOFs carry no Source key.
etFields.forEach(([name, type], i) => {
  iofItems.push({ ioName: 'EventTypes', iof: {
    Name: name, DisplayName: humanize(name),
    Description: `EventTypePostRequest write-body field (${type}); from POST Events/SaveEventType.`,
    Type: type, IsPrimaryKey: false, IsRequired: false, IsReadOnly: false, IsUniqueKey: false,
    AllowsNull: true, Status: 'Active', Sequence: 3 + i,
  } });
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------
const F = (p, uf, tf, ex, es = 'ExplicitStatement') => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: 2,
  SourceCategory: 'OfficialDocs', EvidenceStrength: es, TargetField: tf, Excerpt: ex,
});
const prov = [
  F('sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html',
    'Volunteers.SupportsUpdate downgrade — ApproveVolunteerApplication is an approval RPC, not a field editor',
    'io.Volunteers.SupportsUpdate',
    'ApproveVolunteerApplication body: VolunteerOpportunityKey/ContactKey/LegacyContactKey only — narrow approval side-effect, no general field editor exists for Volunteers.'),
  F('sources/ops/POST-api-v2.0-Ideation-UpdateIdeaStatus.html',
    'Ideas.SupportsUpdate downgrade — UpdateIdeaStatus is a status-transition RPC, not a field editor',
    'io.Ideas.SupportsUpdate',
    'UpdateIdeaStatus body: {IdeationKey, IdeationStatusKey} — narrow status transition; no endpoint edits Title/Description.'),
  F('sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html',
    'Volunteers.ApprovedByContactKey FK -> Contacts (Tier-1 explicit)',
    'iof.Volunteers.ApprovedByContactKey.RelatedIntegrationObjectID',
    'ApprovedByContactKey: ContactKey of the User who approved the application.'),
  F('sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html',
    'Volunteers.RejectedByContactKey FK -> Contacts (Tier-1 explicit)',
    'iof.Volunteers.RejectedByContactKey.RelatedIntegrationObjectID',
    'RejectedByContactKey: UniqueIdentifier for the User who rejected the application.'),
  F('sources/ops/POST-api-v2.0-Events-SaveEventType.html',
    'EventTypes write surface — SaveEventType upsert (Create+Update) + 27-field body',
    'io.EventTypes.SupportsWrite',
    'POST /api/v2.0/Events/SaveEventType — saves an event type; body carries EventTypeKey + EventTypeName + 25 config flags/fields.'),
  F('sources/ops/POST-api-v2.0-Events-DeleteEventType_eventTypeKey.html',
    'EventTypes delete surface — DeleteEventType?eventTypeKey={id}',
    'io.EventTypes.DeleteAPIPath',
    'POST /api/v2.0/Events/DeleteEventType?eventTypeKey={eventTypeKey} — path-templated delete by event type key.'),
  F('sources/ops/POST-api-v2.0-Events-RSVPToEvent_eventKey.html',
    'EventRegistrants kept read-only — RSVP is action-shaped, out-of-scope for generic CRUD',
    'io.EventRegistrants.SupportsWrite',
    'RSVPToEvent / RSVP-delete take the parent eventKey, not a registrant key — action-shaped, recorded as OutOfScopeActions.'),
];

w('io-items.json', ioItems);
w('iof-items.json', iofItems);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact (ONLY the 4 re-processed objects)
// ---------------------------------------------------------------------------
const mrow = (name, over) => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit', FKVerdict: 'defer',
  EvidenceCount: 0, ...over,
});
const emission = [
  { objectName: 'Volunteers', fieldsExtracted: 16, gapsRemaining: [],
    claims: [
      { slot: 'io.Volunteers.SupportsUpdate', value: false, sourcePath: 'sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html' },
      { slot: 'io.Volunteers.SupportsCreate', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Volunteer-VolunteerForOpportunity_volunteerOpportunityKey_comments.html' },
      { slot: 'io.Volunteers.SupportsDelete', value: true, sourcePath: 'sources/ops/DELETE-api-v2.0-Volunteer-WithdrawFromOpportunity_volunteerOpportunityKey_comments.html' },
      { slot: 'iof.Volunteers.ApprovedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html' },
      { slot: 'iof.Volunteers.RejectedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html' },
      { slot: 'iof.Volunteers.CreatedByContactKey.RelatedIntegrationObjectID', value: RIO('Contacts'), sourcePath: 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html' },
      { slot: 'iof.Volunteers.VolunteerOpportunityVolunteerKey.IsPrimaryKey', value: true, sourcePath: 'sources/ops/GET-api-v2.0-Volunteer-GetVolunteerList_volunteerOpportunityKey.html' },
    ],
    matrixRow: mrow('Volunteers', { FKVerdict: 'emit-3', EvidenceCount: 4 }) },
  { objectName: 'Ideas', fieldsExtracted: 10, gapsRemaining: [],
    claims: [
      { slot: 'io.Ideas.SupportsUpdate', value: false, sourcePath: 'sources/ops/POST-api-v2.0-Ideation-UpdateIdeaStatus.html' },
      { slot: 'io.Ideas.SupportsCreate', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Ideation-Post.html' },
    ],
    matrixRow: mrow('Ideas', { FKVerdict: 'defer', EvidenceCount: 2 }) },
  { objectName: 'EventTypes', fieldsExtracted: 2 + etFields.length, gapsRemaining: [],
    claims: [
      { slot: 'io.EventTypes.SupportsWrite', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Events-SaveEventType.html' },
      { slot: 'io.EventTypes.SupportsCreate', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Events-SaveEventType.html' },
      { slot: 'io.EventTypes.SupportsUpdate', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Events-SaveEventType.html' },
      { slot: 'io.EventTypes.SupportsDelete', value: true, sourcePath: 'sources/ops/POST-api-v2.0-Events-DeleteEventType_eventTypeKey.html' },
      { slot: 'io.EventTypes.CreateAPIPath', value: '/v2.0/Events/SaveEventType', sourcePath: 'sources/ops/POST-api-v2.0-Events-SaveEventType.html' },
      { slot: 'io.EventTypes.DeleteAPIPath', value: '/v2.0/Events/DeleteEventType?eventTypeKey={id}', sourcePath: 'sources/ops/POST-api-v2.0-Events-DeleteEventType_eventTypeKey.html' },
      ...etFields.map(([n, t]) => ({ slot: `iof.EventTypes.${n}.Type`, value: t, sourcePath: 'sources/ops/POST-api-v2.0-Events-SaveEventType.html' })),
    ],
    matrixRow: mrow('EventTypes', { FKVerdict: 'defer', EvidenceCount: 2 }) },
  { objectName: 'EventRegistrants', fieldsExtracted: 16, gapsRemaining: ['SupportsWrite (RSVP is action-shaped; recorded as Configuration.OutOfScopeActions)'],
    claims: [
      { slot: 'io.EventRegistrants.SupportsWrite', value: false, sourcePath: 'sources/ops/POST-api-v2.0-Events-RSVPToEvent_eventKey.html' },
    ],
    matrixRow: mrow('EventRegistrants', { FKVerdict: 'defer', EvidenceCount: 1 }) },
];
const EMIT = new URL('../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json', import.meta.url);
writeFileSync(EMIT, JSON.stringify(emission, null, 2) + '\n');

const totalFields = emission.reduce((s, o) => s + o.fieldsExtracted, 0);
console.log(JSON.stringify({ ioItems: ioItems.length, iofItems: iofItems.length, prov: prov.length,
  objectsExtracted: emission.length, fieldsExtracted: totalFields, etFieldCount: etFields.length }, null, 2));
