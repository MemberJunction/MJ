#!/usr/bin/env node
// Amendment Round 7 payload generator for higherlogic-thrive.
// Surgical per-slot FixInstructions on 4 flagged objects ONLY:
//   EventTypes, ResourceLibraryDocuments, Contacts, Communities.
// No catalog re-walk. Shallow-merge upsert (adds/overwrites listed keys, never deletes others).
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const OUT = new URL('./_amendment-r7/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const w = (name, data) => writeFileSync(new URL(name, OUT), JSON.stringify(data, null, 2) + '\n');
const NOW = new Date().toISOString();

// ---------------------------------------------------------------------------
// IO upserts — 2 APIPath renames + 2 Description corrections (copy-paste fixes).
// ---------------------------------------------------------------------------
const NEW_CONTACTS_DESC =
  'Contact — If no afterContactKey or beforeContactKey is provided, returns the first page of ' +
  'Contacts based on the limit provided, ordered by LastName, FirstName.';
const NEW_COMMUNITIES_DESC = "Community — Returns a list of the Current User's joined Communities.";

const ioItems = [
  { io: { Name: 'EventTypes', APIPath: '/v2.0/Events/GetEventTypes' } },
  { io: { Name: 'ResourceLibraryDocuments', APIPath: '/v2.0/ResourceLibrary/GetLibraryDocuments' } },
  { io: { Name: 'Contacts', Description: NEW_CONTACTS_DESC } },
  { io: { Name: 'Communities', Description: NEW_COMMUNITIES_DESC } },
];

// ---------------------------------------------------------------------------
// Provenance — one entry per corrected slot, citing the real HelpPage operation.
// ---------------------------------------------------------------------------
const P = (p, uf, tf, ex, tier = 2) => ({
  URL: 'file://' + p, AccessedAt: NOW, UsedFor: uf, SourceTier: tier,
  SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement', TargetField: tf, Excerpt: ex,
});
const EV_ET = 'sources/ops/GET-api-v2.0-Events-GetEventTypes.html';
const EV_RLD = 'sources/ops/POST-api-v2.0-ResourceLibrary-GetLibraryDocuments.html';
const EV_C = 'sources/ops/GET-api-v2.0-Contacts-GetMyContactsPage_afterContactKey_beforeContactKey_limit.html';
const EV_COMM = 'sources/ops/GET-api-v2.0-Communities-GetMyCommunities_includeStatistics_includeHiddenCommunities.html';

const prov = [
  P(EV_ET, 'EventTypes.APIPath — corrected to the real list endpoint Events/GetEventTypes',
    'io.EventTypes.APIPath',
    'GET api/v2.0/Events/GetEventTypes — the working tenant-wide event-types list endpoint; /v2.0/EventTypes is not a real HelpPage operation.'),
  P(EV_RLD, 'ResourceLibraryDocuments.APIPath — corrected to the tenant-wide documents feed GetLibraryDocuments',
    'io.ResourceLibraryDocuments.APIPath',
    'POST api/v2.0/ResourceLibrary/GetLibraryDocuments (DaysBack / LibraryKey / MaxRecords filter) — comprehensive documents feed; GetMyLibraryDocuments is scoped to the calling API user only.'),
  P(EV_C, 'Contacts.Description — corrected (was copy-pasted from AutomationRules/GetContactsByRuleScheduleKey)',
    'io.Contacts.Description',
    'GetMyContactsPage: if no afterContactKey or beforeContactKey is provided, returns the first page of Contacts based on the limit provided, ordered by LastName, FirstName.'),
  P(EV_COMM, 'Communities.Description — corrected (was copy-pasted from Communities/Get?communityKey=)',
    'io.Communities.Description',
    "GetMyCommunities: returns a list of the Current User's joined Communities."),
];

w('io-items.json', ioItems);
w('provenance.json', prov);

// ---------------------------------------------------------------------------
// Delta emission artifact — ONLY the 4 re-processed objects.
// fieldsExtracted read from the CURRENT persisted metadata (field COUNT unchanged by these fixes).
// ---------------------------------------------------------------------------
const METAPATH = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-thrive/.higherlogic-thrive.integration.json';
const raw = JSON.parse(readFileSync(METAPATH, 'utf8'));
const root = (Array.isArray(raw) ? raw : [raw])[0];
const ios = root.relatedEntities['MJ: Integration Objects'];
const fieldCount = (n) => (ios.find((o) => o.fields.Name === n)?.relatedEntities?.['MJ: Integration Object Fields']?.length) ?? 0;

const mrow = (name, evCount) => ({
  IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'yes', OpenAPIxPK: 'no',
  OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'yes', SDKTypes: 'n/a',
  PostmanCommunity: 'n/a', NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'emit',
  FKVerdict: 'defer', EvidenceCount: evCount,
});

const emission = [
  { objectName: 'EventTypes', fieldsExtracted: fieldCount('EventTypes'), gapsRemaining: [],
    claims: [{ slot: 'io.EventTypes.APIPath', value: '/v2.0/Events/GetEventTypes', sourcePath: EV_ET }],
    matrixRow: mrow('EventTypes', 1) },
  { objectName: 'ResourceLibraryDocuments', fieldsExtracted: fieldCount('ResourceLibraryDocuments'), gapsRemaining: [],
    claims: [{ slot: 'io.ResourceLibraryDocuments.APIPath', value: '/v2.0/ResourceLibrary/GetLibraryDocuments', sourcePath: EV_RLD }],
    matrixRow: mrow('ResourceLibraryDocuments', 1) },
  { objectName: 'Contacts', fieldsExtracted: fieldCount('Contacts'), gapsRemaining: [],
    claims: [{ slot: 'io.Contacts.Description', value: NEW_CONTACTS_DESC, sourcePath: EV_C }],
    matrixRow: mrow('Contacts', 1) },
  { objectName: 'Communities', fieldsExtracted: fieldCount('Communities'), gapsRemaining: [],
    claims: [{ slot: 'io.Communities.Description', value: NEW_COMMUNITIES_DESC, sourcePath: EV_COMM }],
    matrixRow: mrow('Communities', 1) },
];

const EMIT = new URL('../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/EXTRACTION_EMISSION.json', import.meta.url);
mkdirSync(new URL('../runs/connector-higherlogic-thrive-1783530972914-6940db01/output/', import.meta.url), { recursive: true });
writeFileSync(EMIT, JSON.stringify(emission, null, 2) + '\n');

const totalFields = emission.reduce((s, o) => s + o.fieldsExtracted, 0);
console.log(JSON.stringify({
  ioItems: ioItems.length, prov: prov.length,
  objectsExtracted: emission.length, fieldsExtracted: totalFields,
}, null, 2));
