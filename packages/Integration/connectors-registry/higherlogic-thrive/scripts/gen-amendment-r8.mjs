#!/usr/bin/env node
// Amendment Round 8 payload generator for higherlogic-thrive.
// Surgical per-slot FixInstructions on 2 flagged objects ONLY: CommunityMembers, Volunteers.
// No catalog re-walk. Shallow-merge upsert (adds/overwrites listed keys, never deletes others).
//
//   1) CommunityMembers — record the Offset pagination param names (StartRecord/EndRecord)
//      into Configuration.paginationDetail.params (was []). PaginationType=Offset is already
//      correct; this only fills the specific param names.
//   2) Volunteers — no-op record-scope decision (OPERATOR-RESOLVED, reaffirming round 4):
//      remains fully read-only. VolunteerForOpportunity/ApproveVolunteerApplication/
//      WithdrawFromOpportunity are identity-implicit RPC actions whose response resource is the
//      PARENT VolunteerOpportunity, not a distinct keyed registration record — out-of-scope for
//      generic per-record CRUD (same shape/resolution as EventRegistrants, round 3). Upsert the
//      confirming values (already false) so provenance records the reaffirmed decision.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r8/', import.meta.url);
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

// ---------------------------------------------------------------------------
// (1) CommunityMembers — fill Offset pagination param names, preserving the rest of Configuration.
// ---------------------------------------------------------------------------
const cmCfg = JSON.parse(ioByName('CommunityMembers').fields.Configuration);
cmCfg.paginationDetail = { ...(cmCfg.paginationDetail ?? { type: 'Offset' }), params: ['StartRecord', 'EndRecord'] };
const CM_CONFIG_STR = JSON.stringify(cmCfg);

// ---------------------------------------------------------------------------
// (2) Volunteers — reaffirm read-only (values already current; explicit no-op upsert).
// ---------------------------------------------------------------------------
const VOL_WRITE = {
  SupportsWrite: false,
  SupportsCreate: false, CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
  SupportsUpdate: false, UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
  SupportsDelete: false, DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
};

const ioItems = [
  { io: { Name: 'CommunityMembers', Configuration: CM_CONFIG_STR } },
  { io: { Name: 'Volunteers', ...VOL_WRITE } },
];

// ---------------------------------------------------------------------------
// Provenance — one entry per corrected/reaffirmed slot.
// ---------------------------------------------------------------------------
const P = (p, uf, tf, ex, tier = 2) => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: tier,
  SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const EV_CM = 'sources/ops/POST-api-v2.0-Communities-GetCommunityMembers.html';
const EV_VOL_A = 'sources/ops/POST-api-v2.0-Volunteer-VolunteerForOpportunity_volunteerOpportunityKey_comments.html';
const EV_VOL_B = 'sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html';
const EV_VOL_C = 'sources/ops/DELETE-api-v2.0-Volunteer-WithdrawFromOpportunity_volunteerOpportunityKey_comments.html';

const prov = [
  P(EV_CM,
    'CommunityMembers.Configuration.paginationDetail.params — recorded the Offset pagination param names',
    'io.CommunityMembers.Configuration.paginationDetail.params',
    'GetCommunityMembers paginates by StartRecord / EndRecord offset window (SOURCE_STUDY.md line 155). PaginationType=Offset; param names StartRecord,EndRecord.'),
  P(EV_VOL_A,
    'Volunteers.SupportsWrite — reaffirm read-only (VolunteerForOpportunity is an identity-implicit RPC action on the parent VolunteerOpportunity, not per-record CRUD)',
    'io.Volunteers.SupportsWrite',
    'POST VolunteerForOpportunity/{volunteerOpportunityKey}: enrolls the CURRENT user; response resource is the parent VolunteerOpportunity, not a distinct keyed registration record — out-of-scope for generic per-record Create.'),
  P(EV_VOL_B,
    'Volunteers.SupportsWrite — reaffirm read-only (ApproveVolunteerApplication is an identity-implicit RPC action, not per-record Update)',
    'io.Volunteers.SupportsUpdate',
    'POST ApproveVolunteerApplication: admin approval action; no distinct keyed registration record returned — not generic per-record Update.'),
  P(EV_VOL_C,
    'Volunteers.SupportsWrite — reaffirm read-only (WithdrawFromOpportunity is an identity-implicit RPC action, not per-record Delete)',
    'io.Volunteers.SupportsDelete',
    'DELETE WithdrawFromOpportunity/{volunteerOpportunityKey}: withdraws the CURRENT user; identity-implicit action, not a keyed per-record Delete. Same shape/resolution as EventRegistrants (round 3).'),
];

w('io-items.json', ioItems);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the 2 re-processed objects.
// ---------------------------------------------------------------------------
const mrow = (name, evCount, fkVerdict = 'defer') => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
  FKVerdict: fkVerdict, EvidenceCount: evCount,
});

const emission = [
  {
    objectName: 'CommunityMembers', fieldsExtracted: fieldCount('CommunityMembers'), gapsRemaining: [],
    claims: [{
      slot: 'io.CommunityMembers.Configuration.paginationDetail.params',
      value: ['StartRecord', 'EndRecord'], sourcePath: EV_CM,
    }],
    matrixRow: mrow('CommunityMembers', 1),
  },
  {
    objectName: 'Volunteers', fieldsExtracted: fieldCount('Volunteers'),
    gapsRemaining: ['SupportsWrite (RPC-action endpoints are out-of-scope per-object ACTIONS, not generic CRUD — operator-resolved read-only)'],
    claims: [
      { slot: 'io.Volunteers.SupportsWrite', value: false, sourcePath: EV_VOL_A },
      { slot: 'io.Volunteers.SupportsCreate', value: false, sourcePath: EV_VOL_A },
      { slot: 'io.Volunteers.SupportsUpdate', value: false, sourcePath: EV_VOL_B },
      { slot: 'io.Volunteers.SupportsDelete', value: false, sourcePath: EV_VOL_C },
    ],
    matrixRow: mrow('Volunteers', 3),
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
  ioItems: ioItems.length, prov: prov.length,
  objectsExtracted: emission.length, fieldsExtracted: totalFields,
  cmConfig: CM_CONFIG_STR,
}, null, 2));
