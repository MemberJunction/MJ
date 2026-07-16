#!/usr/bin/env node
/**
 * Amendment R1 — write ONLY the re-processed objects to the emission artifact.
 * Reads the AMENDED metadata file (source of truth) so the emission mirrors what
 * was actually persisted, then writes the 4 flagged dispositions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const META = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/whova/.whova.integration.json';
const OUT =
    '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/whova/runs/connector-whova-1782977844829-6bb169a3/output/EXTRACTION_EMISSION.json';

const ZAPIER = 'https://zapier.com/apps/whova/integrations';
const EVID =
    'runs/connector-whova-1782977844829-6bb169a3/output/dual-derivation-sources/zapier_main_extracted.json';

const file = JSON.parse(readFileSync(META, 'utf8'))[0];
const ios = file.relatedEntities['MJ: Integration Objects'];
const getIO = (n) => ios.find((i) => i.fields.Name === n);
const fieldsOf = (io) => (io.relatedEntities?.['MJ: Integration Object Fields'] ?? []).map((x) => x.fields);

const baseMatrix = (name, pkVerdict, evidenceCount, fkVerdict = 'defer') => ({
    IOName: name,
    ExistingConnectorTs: 'n/a',
    ExistingMetadataJson: 'n/a',
    OpenAPIxPK: 'no',
    OpenAPIPathOps: 'no',
    OpenAPILocationHeader: 'no',
    VendorDocsProseScan: 'yes',
    SDKTypes: 'n/a',
    PostmanCommunity: 'n/a',
    NamingConvention: 'no',
    CrossIOMatch: 'no',
    PKVerdict: pkVerdict,
    FKVerdict: fkVerdict,
    EvidenceCount: evidenceCount,
});

// ---- Attendees (SupportsWrite downgraded) ----
const attendees = getIO('Attendees');
const attFlds = fieldsOf(attendees);
const attendeesEmission = {
    objectName: 'Attendees',
    fieldsExtracted: attFlds.length,
    gapsRemaining: [
        'IntegrationObjectField.IsPrimaryKey (no documented id/PK for Attendees; Email is a unique key. Deferred to runtime D4 SoftPKClassifier per Gap 10.)',
        'Write path (CreateAPIPath/CreateMethod) undocumented — SupportsWrite downgraded to false in R1 for bijection consistency; re-enabled at runtime once a credentialed REST path is discovered. Documented Zapier-level write capability preserved in Integration.Configuration.WriteCapability.',
    ],
    claims: [
        { slot: 'IntegrationObject.Name', value: 'Attendees', sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsWrite', value: false, sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsCreate', value: false, sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsIncrementalSync', value: false, sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.SupportsPagination', value: false, sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.PaginationType', value: 'None', sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.Status', value: 'Active', sourcePath: ZAPIER },
        ...attFlds.flatMap((f) => [
            { slot: `IntegrationObjectField.${f.Name}.Type`, value: f.Type, sourcePath: `${ZAPIER}/salesforce` },
            { slot: `IntegrationObjectField.${f.Name}.IsRequired`, value: f.IsRequired, sourcePath: `${ZAPIER}/salesforce` },
            ...(f.IsUniqueKey ? [{ slot: `IntegrationObjectField.${f.Name}.IsUniqueKey`, value: true, sourcePath: 'PROVENANCE.json' }] : []),
        ]),
    ],
    matrixRow: baseMatrix('Attendees', 'defer', 11),
};

// ---- Orders (Event field added) ----
const orders = getIO('Orders');
const ordFlds = fieldsOf(orders);
const ordersEmission = {
    objectName: 'Orders',
    fieldsExtracted: ordFlds.length,
    gapsRemaining: [
        'IntegrationObjectField.* (output/response payload) — no output/response field schema published for the Zapier "Get Orders" trigger; per-order response fields resolved at runtime via DiscoverFields (provable-only forbids fabrication). The one documented, required INPUT field (Event) is now emitted.',
    ],
    claims: [
        { slot: 'IntegrationObject.Name', value: 'Orders', sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsWrite', value: false, sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsIncrementalSync', value: false, sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.PaginationType', value: 'None', sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.Status', value: 'Active', sourcePath: ZAPIER },
        { slot: 'IntegrationObjectField.Event.Type', value: 'String', sourcePath: `${EVID} (Get Orders trigger field list)` },
        { slot: 'IntegrationObjectField.Event.IsRequired', value: true, sourcePath: `${EVID} (Get Orders trigger field list: Event required:true)` },
    ],
    matrixRow: baseMatrix('Orders', 'defer', 2),
};

// ---- Registrants (Event field added) ----
const registrants = getIO('Registrants');
const regFlds = fieldsOf(registrants);
const registrantsEmission = {
    objectName: 'Registrants',
    fieldsExtracted: regFlds.length,
    gapsRemaining: [
        'IntegrationObjectField.* (output/response payload) — no output/response field schema published for the Zapier "Get Registrants" trigger; registrant response fields are per-event custom registration-question responses (no fixed schema) resolved at runtime (custom-column capture territory). The one documented, required INPUT field (Event) is now emitted.',
    ],
    claims: [
        { slot: 'IntegrationObject.Name', value: 'Registrants', sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsWrite', value: false, sourcePath: ZAPIER },
        { slot: 'IntegrationObject.SupportsIncrementalSync', value: false, sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.PaginationType', value: 'None', sourcePath: 'PROVENANCE.json' },
        { slot: 'IntegrationObject.Status', value: 'Active', sourcePath: ZAPIER },
        { slot: 'IntegrationObjectField.Event.Type', value: 'String', sourcePath: `${EVID} (Get Registrants trigger field list)` },
        { slot: 'IntegrationObjectField.Event.IsRequired', value: true, sourcePath: `${EVID} (Get Registrants trigger field list: Event required:true)` },
    ],
    matrixRow: baseMatrix('Registrants', 'defer', 2),
};

// ---- Exhibitors/Booths — ADVISORY, operation:null. Skipped-with-reason (already in
//      Integration.Configuration.OutOfScopeObjectFamilies as exhibitors + sponsors). ----
const exhibitorsEmission = {
    objectName: 'Exhibitors/Booths',
    fieldsExtracted: 0,
    gapsRemaining: [],
    claims: [],
    matrixRow: baseMatrix('Exhibitors/Booths', 'defer', 0),
    skipped: {
        reason:
            'Documented-only object family (booth/exhibitor + sponsor custom-form fields) with ZERO discovered programmatic surface — no Zapier trigger/action or credential-free API door exists to attach an IO to (SOURCE_STUDY §1.5/§5; DUAL_DERIVATION.json objectsMissing). Recorded in Integration.Configuration.OutOfScopeObjectFamilies (Family: exhibitors, Family: sponsors) rather than silently dropped. Reviewer classified ADVISORY (operation:null); no IO emitted per the "never hardcode a catalog where the source exposes no reachable door" discovery rule.',
    },
};

// Emission for the amendment = ONLY the re-processed objects.
const emission = [attendeesEmission, ordersEmission, registrantsEmission, exhibitorsEmission];

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(emission, null, 2) + '\n', 'utf8');

const objectsExtracted = emission.filter((e) => !e.skipped).length;
const fieldsExtracted = emission.reduce((s, e) => s + e.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({ objectsExtracted, fieldsExtracted, wrote: OUT }, null, 2) + '\n');
