#!/usr/bin/env node
// Amendment Round 12 payload generator for higherlogic-thrive.
// DELTA — surgical per-slot FixInstructions on ONE flagged object: Volunteers.
// No catalog re-walk. IO-level shallow-merge upsert (overwrites listed keys, never deletes an object).
//
// Root cause: Volunteers.SupportsUpdate was set true with UpdateAPIPath ->
// /v2.0/Volunteer/ApproveVolunteerApplication, but ApproveVolunteerApplication is an
// admin approve/reject RPC action, NOT a generic record Update. Its request body
// ({VolunteerOpportunityKey, ContactKey, LegacyContactKey}) matches none of this object's own
// 17 emitted field names (PK = VolunteerOpportunityVolunteerKey; contact ref = VolunteerContactKey),
// and carries no settable field value — only an implicit approve/reject side-effect baked into the
// endpoint name. Same reasoning already applied to Ideas.SupportsUpdate/UpdateIdeaStatus in this
// same emission. Downgrade the Update leg; KEEP SupportsWrite=true because Create
// (VolunteerForOpportunity) and Delete (WithdrawFromOpportunity) remain genuine record CRUD.
//
// Clearing convention mirrors the Ideas precedent: Update* keys stay PRESENT as null (real
// IntegrationObject columns), matching how Ideas represents SupportsUpdate=false.
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./_amendment-r12/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();

const EV_APPROVE = 'sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html';
const EV_CREATE = 'sources/ops/POST-api-v2.0-Volunteer-VolunteerForOpportunity_volunteerOpportunityKey_comments.html';

const OBS =
  'ApproveVolunteerApplication (POST /v2.0/Volunteer/ApproveVolunteerApplication) exists as an ' +
  'admin-approval RPC action on Volunteers but is intentionally NOT modeled as generic Update — its ' +
  'body ({VolunteerOpportunityKey, ContactKey, LegacyContactKey}) doesn\'t match this object\'s field ' +
  'set and carries no settable field value, only an implicit approve/reject side-effect baked into the ' +
  'endpoint name.';

// ---------------------------------------------------------------------------
// IO upsert item — shallow-merge overwrite of the flagged slots on Volunteers.
// SupportsUpdate -> false; Update* leg cleared to null (Ideas precedent);
// SupportsWrite stays true; AdditionalObservations documents the exclusion.
// ---------------------------------------------------------------------------
const ioItem = {
  ioName: 'Volunteers',
  io: {
    Name: 'Volunteers',
    SupportsUpdate: false,
    UpdateAPIPath: null,
    UpdateMethod: null,
    UpdateBodyShape: null,
    UpdateBodyKey: null,
    UpdateIDLocation: null,
    SupportsWrite: true,
    AdditionalObservations: OBS,
  },
};
w('io-items.json', [ioItem]);

// ---------------------------------------------------------------------------
// Provenance — the downgrade + the retained write surface.
// ---------------------------------------------------------------------------
const P = (evRel, uf, tf, ex) => ({
  URL: 'file://packages/Integration/connectors-registry/higherlogic-thrive/' + evRel,
  AccessedAt: NOW, UsedFor: uf, SourceTier: 1, SourceCategory: 'OfficialDocs',
  EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const prov = [
  P(EV_APPROVE,
    'Volunteers.SupportsUpdate downgrade — ApproveVolunteerApplication is an admin approve/reject RPC, not a generic record Update',
    'io.Volunteers.SupportsUpdate',
    'ApproveVolunteerApplicationRequest body ({VolunteerOpportunityKey, ContactKey, LegacyContactKey}) does not match any of Volunteers\' own 17 field names (PK VolunteerOpportunityVolunteerKey; contact ref VolunteerContactKey). No settable field value — an implicit approve/reject side-effect. Update leg cleared; mirrors Ideas.SupportsUpdate downgrade.'),
  P(EV_CREATE,
    'Volunteers.SupportsWrite retained — VolunteerForOpportunity (Create) + WithdrawFromOpportunity (Delete) remain genuine record CRUD',
    'io.Volunteers.SupportsWrite',
    'SupportsWrite stays true: Create (VolunteerForOpportunity) and Delete (WithdrawFromOpportunity) are unambiguous record CRUD; only the Update leg is defective and is downgraded. Do not overcorrect SupportsWrite to false.'),
];
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the re-processed object.
// ---------------------------------------------------------------------------
const emission = [{
  objectName: 'Volunteers',
  fieldsExtracted: 17, // IOF count unchanged by this amendment (IO-level slots only)
  gapsRemaining: [],
  claims: [
    { slot: 'io.Volunteers.SupportsUpdate', value: false, sourcePath: EV_APPROVE },
    { slot: 'io.Volunteers.UpdateAPIPath', value: null, sourcePath: EV_APPROVE },
    { slot: 'io.Volunteers.UpdateMethod', value: null, sourcePath: EV_APPROVE },
    { slot: 'io.Volunteers.UpdateBodyShape', value: null, sourcePath: EV_APPROVE },
    { slot: 'io.Volunteers.UpdateIDLocation', value: null, sourcePath: EV_APPROVE },
    { slot: 'io.Volunteers.SupportsWrite', value: true, sourcePath: EV_CREATE },
    { slot: 'io.Volunteers.AdditionalObservations', value: OBS, sourcePath: EV_APPROVE },
  ],
  matrixRow: {
    IOName: 'Volunteers', ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
    OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
    PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
    FKVerdict: 'emit-N', EvidenceCount: 2,
  },
}];
w('emission.json', emission);

console.log(JSON.stringify({
  ioItems: 1, prov: prov.length,
  objectsExtracted: emission.length,
  fieldsExtracted: emission.reduce((s, o) => s + o.fieldsExtracted, 0),
}, null, 2));
