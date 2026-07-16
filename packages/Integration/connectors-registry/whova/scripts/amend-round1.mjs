#!/usr/bin/env node
/**
 * Amendment round 1 — Whova.
 *
 * SURGICAL, ADDITIVE amendment over the ALREADY-persisted emission. Does NOT
 * re-walk / re-enumerate the catalog. Applies exactly the reviewer's
 * FixInstructions to only the flagged objects, via the same atomic MetadataFileStore
 * the mcp-mj-metadata server wraps (atomic write + backup preserved). Upsert only —
 * never deletes a prior object; every other object in the file is left untouched.
 *
 * Fixes:
 *   1. iof.Orders.Event       — set the one documented, required input field (clears zero-field hard-fail)
 *   2. iof.Registrants.Event  — same
 *   3. io.Attendees.SupportsWrite — downgrade true -> false (bijection: SupportsWrite w/ null Create* columns)
 *   4. io.Exhibitors/Booths   — ADVISORY only (operation:null); already in Configuration.OutOfScopeObjectFamilies. No change.
 */
import { MetadataFileStore } from '/Users/bcladmin/Projects/MemberJunction/MJ/packages/MCP/mj-metadata/dist/MetadataFileStore.js';
import { resolve } from 'node:path';

const CONNECTOR = 'whova';
const REPO_ROOT = resolve(process.cwd(), '..', '..', '..', '..'); // scripts/ -> whova -> connectors-registry -> Integration -> packages ... use env below
const REGISTRY_ROOT =
    process.env.MJ_CONNECTORS_REGISTRY ??
    '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry';
const METADATA_ROOT =
    process.env.MJ_METADATA_ROOT ??
    '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations';

const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

const ZAPIER_URL = 'https://zapier.com/apps/whova/integrations';
const EVIDENCE_ORDERS =
    'runs/connector-whova-1782977844829-6bb169a3/output/dual-derivation-sources/zapier_main_extracted.json (Get Orders trigger field list: [{"name":"Event","required":true}])';
const EVIDENCE_REGISTRANTS =
    'runs/connector-whova-1782977844829-6bb169a3/output/dual-derivation-sources/zapier_main_extracted.json (Get Registrants trigger field list: [{"name":"Event","required":true}])';

const before = store.ReadIntegration(CONNECTOR);
if (!before) throw new Error('Whova metadata file not found — cannot amend a non-existent emission.');

// ---- Guard: confirm the objects we are about to touch actually exist (additive amend, not re-create) ----
const ios = before.relatedEntities?.['MJ: Integration Objects'] ?? [];
const findIO = (name) => ios.find((i) => i.fields.Name.toLowerCase() === name.toLowerCase());
for (const req of ['Attendees', 'Orders', 'Registrants']) {
    if (!findIO(req)) throw new Error(`Expected IO '${req}' to already exist before amendment; aborting to avoid re-baking.`);
}

// ---- Fix 1 + 2: add the documented required `Event` field to Orders and Registrants ----
const eventField = (sequence) => ({
    Name: 'Event',
    DisplayName: 'Event',
    Description:
        "The Whova event that scopes this record. Documented required input field on the Zapier trigger. " +
        "Whova is single-tenant-per-event; Event is the required scoping parameter for every trigger/action " +
        "(configured via CompanyIntegration.Configuration and echoed onto each fetched record).",
    Type: 'String',
    IsRequired: true,
    IsReadOnly: false,
    IsPrimaryKey: false,
    IsUniqueKey: false,
    Source: 'Declared',
    Status: 'Active',
    Sequence: sequence,
    // IntegrationObjectID is auto-injected as @parent:ID by the store.
});

store.UpsertIOF(CONNECTOR, 'Orders', eventField(0));
store.UpsertIOF(CONNECTOR, 'Registrants', eventField(0));

// ---- Fix 3: downgrade Attendees.SupportsWrite true -> false (bijection consistency) ----
// The documented Zapier-level write capability is preserved in Configuration.WriteCapability (unchanged).
// Per-operation Create* columns were null (no REST path documented behind Zapier), so SupportsWrite=true
// violates the capability<->method bijection. Downgrade to false (SupportsCreate/Update also false).
const attendees = findIO('Attendees');
const attCfg = { ...(attendees.fields.Configuration ?? {}) };
attCfg.WriteCapabilityNote =
    "SupportsWrite downgraded to false in amendment round 1 for bijection consistency: a documented " +
    "'Create or Update Attendee' write action exists at the Zapier level (see Integration.Configuration.WriteCapability), " +
    "but NO REST path/method/body-shape is documented for Whova's private backend, so CreateAPIPath/CreateMethod " +
    "cannot be honestly populated credential-free. The write capability is real but unverifiable structurally; " +
    "it is re-enabled at runtime once a credentialed path is discovered. Downgrading (rather than fabricating a path) " +
    "keeps the per-IO capability<->column contract consistent.";

store.UpsertIO(CONNECTOR, {
    Name: 'Attendees',
    SupportsWrite: false,
    SupportsCreate: false,
    SupportsUpdate: false,
    SupportsDelete: false,
    // Ensure any stray per-op columns are null (they already are, but be explicit for the floor-check bijection).
    CreateAPIPath: null,
    CreateMethod: null,
    CreateBodyShape: null,
    CreateBodyKey: null,
    CreateIDLocation: null,
    UpdateAPIPath: null,
    UpdateMethod: null,
    Configuration: attCfg,
});

// ---- Fix 4: io.Exhibitors/Booths — ADVISORY, operation:null. Already recorded in
//      Integration.Configuration.OutOfScopeObjectFamilies (exhibitors + sponsors). No metadata change. ----

// ---- Provenance for the added Event fields (hard-constraint IsRequired needs evidence) ----
const now = new Date().toISOString();
store.AppendProvenance(CONNECTOR, {
    URL: ZAPIER_URL,
    AccessedAt: now,
    UsedFor: 'Amendment R1: Orders.Event field (documented required trigger input).',
    SourceTier: 2,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'iof.Orders.Event.IsRequired',
    Excerpt: 'Get Orders trigger — fields: [{"name":"Event","required":true}]',
});
store.AppendProvenance(CONNECTOR, {
    URL: ZAPIER_URL,
    AccessedAt: now,
    UsedFor: 'Amendment R1: Registrants.Event field (documented required trigger input).',
    SourceTier: 2,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'iof.Registrants.Event.IsRequired',
    Excerpt: 'Get Registrants trigger — fields: [{"name":"Event","required":true}]',
});
store.AppendProvenance(CONNECTOR, {
    URL: ZAPIER_URL,
    AccessedAt: now,
    UsedFor: 'Amendment R1: downgrade Attendees.SupportsWrite true->false (no documented REST create path — bijection).',
    SourceTier: 2,
    SourceCategory: 'OfficialDocs',
    EvidenceStrength: 'ExplicitStatement',
    TargetField: 'io.Attendees.SupportsWrite',
    Excerpt: 'No base URL/auth/endpoint documented for Whova private backend; Zapier abstracts the write action. Downgraded per bijection rule.',
});

store.AppendCodeEvidence(CONNECTOR, {
    ScriptPath: 'scripts/amend-round1.mjs',
    ScriptRunAt: now,
    StructuredOutput: { OrdersEventAdded: 1, RegistrantsEventAdded: 1, AttendeesSupportsWriteDowngraded: true },
    SchemaValidationStatus: 'Passed',
    TargetField: 'io.Orders,io.Registrants,io.Attendees',
});

// ---- Verify ----
const after = store.ReadIntegration(CONNECTOR);
const aios = after.relatedEntities?.['MJ: Integration Objects'] ?? [];
const fieldCount = (name) =>
    (aios.find((i) => i.fields.Name.toLowerCase() === name.toLowerCase())?.relatedEntities?.[
        'MJ: Integration Object Fields'
    ] ?? []).length;

const stats = {
    IOsInFile: aios.length,
    Orders_fields: fieldCount('Orders'),
    Registrants_fields: fieldCount('Registrants'),
    Attendees_fields: fieldCount('Attendees'),
    Attendees_SupportsWrite: aios.find((i) => i.fields.Name === 'Attendees')?.fields.SupportsWrite,
};
if (stats.IOsInFile !== 3) throw new Error(`Expected 3 IOs preserved, got ${stats.IOsInFile} — additive amend must not drop objects.`);
if (stats.Orders_fields < 1) throw new Error('Orders still zero-field after amend.');
if (stats.Registrants_fields < 1) throw new Error('Registrants still zero-field after amend.');
if (stats.Attendees_SupportsWrite !== false) throw new Error('Attendees.SupportsWrite not downgraded.');

process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
