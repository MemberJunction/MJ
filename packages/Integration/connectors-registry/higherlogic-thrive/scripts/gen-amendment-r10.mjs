#!/usr/bin/env node
// Amendment Round 10 payload generator for higherlogic-thrive.
// DELTA — surgical per-slot FixInstructions on ONE flagged object: Volunteers.
// No catalog re-walk. Shallow-merge upsert (adds/overwrites listed keys, never deletes others).
//
// OPERATOR-RESOLVED (round 10) — REVERSES the round 4/8/9 read-only decision. After 3 independent
// rounds, the operator confirmed the Volunteer write endpoints are real, unambiguous, working
// endpoints. Volunteers is now WRITE-CAPABLE (Create/Update/Delete), with the idiosyncratic shapes:
//   - Create: POST VolunteerForOpportunity — both params are query-string, NO JSON body → BodyShape
//             'literal' (the sanctioned escape hatch); response resource is the parent
//             VolunteerOpportunity (no distinct child ID) → IDLocation 'n/a'. code-builder overrides
//             CreateRecord and synthesizes identity from the input composite (VolunteerOpportunityKey
//             + ContactKey) — a real, stable natural key.
//   - Update: POST ApproveVolunteerApplication — flag in URI, target identity (VolunteerOpportunityKey
//             + ContactKey/LegacyContactKey) carried in the request body → BodyShape 'flat',
//             IDLocation 'body' (same idiosyncrasy as ExternalActivity.Update).
//   - Delete: DELETE WithdrawFromOpportunity — identity substituted into the query-string template →
//             IDLocation 'path', DeleteMethod 'DELETE'.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r10/', import.meta.url);
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
// (1) Volunteers — flip to WRITE-CAPABLE with the confirmed per-operation shapes.
//     CreateBodyKey / UpdateBodyKey stay null (Create=literal, Update=flat — neither is 'wrapped').
// ---------------------------------------------------------------------------
const VOL_WRITE = {
  SupportsWrite: true,
  SupportsCreate: true,
  CreateAPIPath: '/v2.0/Volunteer/VolunteerForOpportunity?volunteerOpportunityKey={volunteerOpportunityKey}&comments={comments}',
  CreateMethod: 'POST',
  CreateBodyShape: 'literal',
  CreateBodyKey: null,
  CreateIDLocation: 'n/a',
  SupportsUpdate: true,
  UpdateAPIPath: '/v2.0/Volunteer/ApproveVolunteerApplication?sendEmailNotifications={sendEmailNotifications}',
  UpdateMethod: 'POST',
  UpdateBodyShape: 'flat',
  UpdateBodyKey: null,
  UpdateIDLocation: 'body',
  SupportsDelete: true,
  DeleteAPIPath: '/v2.0/Volunteer/WithdrawFromOpportunity?volunteerOpportunityKey={volunteerOpportunityKey}&comments={comments}',
  DeleteMethod: 'DELETE',
  DeleteIDLocation: 'path',
};

const ioItems = [
  { io: { Name: 'Volunteers', ...VOL_WRITE } },
];

// ---------------------------------------------------------------------------
// Provenance — one entry per corrected slot group (co-stated per HTTP operation).
// ---------------------------------------------------------------------------
const P = (p, uf, tf, ex, tier = 1) => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: tier,
  SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const EV_CREATE = 'sources/ops/POST-api-v2.0-Volunteer-VolunteerForOpportunity_volunteerOpportunityKey_comments.html';
const EV_UPDATE = 'sources/ops/POST-api-v2.0-Volunteer-ApproveVolunteerApplication_sendEmailNotifications.html';
const EV_DELETE = 'sources/ops/DELETE-api-v2.0-Volunteer-WithdrawFromOpportunity_volunteerOpportunityKey_comments.html';

const prov = [
  P(EV_CREATE,
    'Volunteers Create — confirmed POST VolunteerForOpportunity (query-string params, no JSON body → literal; response is parent VolunteerOpportunity → IDLocation n/a; identity synthesized from VolunteerOpportunityKey+ContactKey composite)',
    ['io.Volunteers.SupportsWrite', 'io.Volunteers.SupportsCreate', 'io.Volunteers.CreateAPIPath', 'io.Volunteers.CreateMethod', 'io.Volunteers.CreateBodyShape', 'io.Volunteers.CreateIDLocation'],
    'POST /v2.0/Volunteer/VolunteerForOpportunity?volunteerOpportunityKey={key}&comments={comments}: enrolls a volunteer; both parameters are query-string (no request body). OPERATOR-RESOLVED (round 10, reversing 4/8/9): confirmed real, unambiguous, working endpoint across 3 independent rounds.'),
  P(EV_UPDATE,
    'Volunteers Update — confirmed POST ApproveVolunteerApplication (flag in URI, target identity in body → flat/body)',
    ['io.Volunteers.SupportsUpdate', 'io.Volunteers.UpdateAPIPath', 'io.Volunteers.UpdateMethod', 'io.Volunteers.UpdateBodyShape', 'io.Volunteers.UpdateIDLocation'],
    'POST /v2.0/Volunteer/ApproveVolunteerApplication?sendEmailNotifications={flag}: body model ApproveVolunteerApplicationRequest posted directly (flat); target identity (VolunteerOpportunityKey + ContactKey/LegacyContactKey) carried in the body (same idiosyncrasy as ExternalActivity.Update).'),
  P(EV_DELETE,
    'Volunteers Delete — confirmed DELETE WithdrawFromOpportunity (identity in query-string template → path)',
    ['io.Volunteers.SupportsDelete', 'io.Volunteers.DeleteAPIPath', 'io.Volunteers.DeleteMethod', 'io.Volunteers.DeleteIDLocation'],
    'DELETE /v2.0/Volunteer/WithdrawFromOpportunity?volunteerOpportunityKey={key}&comments={comments}: withdraws a volunteer; identity substituted into the query-string template (path). Confirmed real, unambiguous DELETE endpoint.'),
];

w('io-items.json', ioItems);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the re-processed object (Volunteers).
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
    fieldsExtracted: fieldCount('Volunteers'),
    gapsRemaining: [],
    claims: [
      { slot: 'io.Volunteers.SupportsWrite', value: true, sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.SupportsCreate', value: true, sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.CreateAPIPath', value: VOL_WRITE.CreateAPIPath, sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.CreateMethod', value: 'POST', sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.CreateBodyShape', value: 'literal', sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.CreateIDLocation', value: 'n/a', sourcePath: EV_CREATE },
      { slot: 'io.Volunteers.SupportsUpdate', value: true, sourcePath: EV_UPDATE },
      { slot: 'io.Volunteers.UpdateAPIPath', value: VOL_WRITE.UpdateAPIPath, sourcePath: EV_UPDATE },
      { slot: 'io.Volunteers.UpdateMethod', value: 'POST', sourcePath: EV_UPDATE },
      { slot: 'io.Volunteers.UpdateBodyShape', value: 'flat', sourcePath: EV_UPDATE },
      { slot: 'io.Volunteers.UpdateIDLocation', value: 'body', sourcePath: EV_UPDATE },
      { slot: 'io.Volunteers.SupportsDelete', value: true, sourcePath: EV_DELETE },
      { slot: 'io.Volunteers.DeleteAPIPath', value: VOL_WRITE.DeleteAPIPath, sourcePath: EV_DELETE },
      { slot: 'io.Volunteers.DeleteMethod', value: 'DELETE', sourcePath: EV_DELETE },
      { slot: 'io.Volunteers.DeleteIDLocation', value: 'path', sourcePath: EV_DELETE },
    ],
    matrixRow: mrow('Volunteers', 3, 'emit', 'emit-5'),
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
}, null, 2));
