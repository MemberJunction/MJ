#!/usr/bin/env node
// rebuild-emission-artifact.mjs
//
// PURPOSE: The on-disk metadata file (.zendesk.integration.json) is the SOURCE OF TRUTH
// (99 IOs, ~1181 IOFs, converged: ConfirmedGapsBlocking=0). A prior amendment round (round 4)
// CLOBBERED the run's EXTRACTION_EMISSION.json down to only the 3 objects it touched — the
// classic additive-not-subtractive amendment defect. This script rebuilds the FULL 99-object
// emission artifact by:
//   1. Reading the on-disk metadata as the authoritative object/field/flag source.
//   2. Overlaying the rich per-object claims[]/matrixRow/gapsRemaining previously built
//      (backup 99-object emission + the 3 freshest round-4 objects).
//   3. Setting fieldsExtracted per object to the ACTUAL current metadata IOF count
//      (so objects whose field-set grew after the backup — schedules, schedule_holidays —
//       reflect on-disk reality, not the stale backup count).
// It EMITS every object (union), never the 3-object subset. No metadata is mutated here;
// this rebuilds only the derived emission artifact that must mirror the metadata.

import { readFileSync, writeFileSync } from 'node:fs';

const REG = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/zendesk';
const RUN = `${REG}/runs/connector-zendesk-1783120273097-639b6951/output`;
const METADATA = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/zendesk/.zendesk.integration.json';
const BACKUP = `${RUN}/.backups/EXTRACTION_EMISSION.json.2026-07-04T01-15-38-013Z.bak`;
const CURRENT = `${RUN}/EXTRACTION_EMISSION.json`;      // the clobbered 3-object file (freshest for its 3)
const TARGET = `${RUN}/EXTRACTION_EMISSION.json`;

const md = JSON.parse(readFileSync(METADATA, 'utf8'))[0];
const ios = md.relatedEntities['MJ: Integration Objects'];

// prior rich emission (99 objects) keyed by name; current 3 override for freshness
const priorByName = {};
for (const o of JSON.parse(readFileSync(BACKUP, 'utf8'))) priorByName[o.objectName] = o;
for (const o of JSON.parse(readFileSync(CURRENT, 'utf8'))) priorByName[o.objectName] = o; // round-4 freshest for its 3

// Advisory gap the reviewer deferred to connector-authoring (shared IncrementalSkillBasedRouting
// response schema): surface it on the 3 routing IOs so it is not lost, without flipping a flag
// whose per-object watermark can't be cleanly proven from the shared schema.
const ROUTING_ADVISORY = new Set(['routing_attributes', 'routing_attribute_values', 'routing_instance_values']);
const ROUTING_GAP = 'SupportsIncrementalSync (advisory): /api/v2/incremental/routing/* endpoint documented (end_time watermark) but shared multi-object response schema requires a connector-authoring decision before flagging; config IncrementalSyncCapability.endpoints already lists it';

const emission = [];
let totalFields = 0;
const allGaps = new Set();

for (const io of ios) {
    const f = io.fields;
    const name = f.Name;
    const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
    const fieldCount = fields.length;
    totalFields += fieldCount;

    const prior = priorByName[name] ?? {};
    const gaps = new Set(prior.gapsRemaining ?? []);
    if (ROUTING_ADVISORY.has(name)) gaps.add(ROUTING_GAP);
    for (const g of gaps) allGaps.add(`${name}: ${g}`);

    // matrixRow: keep prior; ensure IOName + PKVerdict/FKVerdict/EvidenceCount are present & consistent
    const pkField = fields.find((x) => x.fields?.IsPrimaryKey === true || x.fields?.IsPrimaryKey === 'true');
    const fkCount = fields.filter((x) => x.fields?.RelatedIntegrationObjectID).length;
    const matrixRow = prior.matrixRow ?? {
        IOName: name, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no',
        OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
        VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
        NamingConvention: 'yes', CrossIOMatch: fkCount > 0 ? 'yes' : 'no',
        PKVerdict: pkField ? 'emit' : 'defer', FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
        EvidenceCount: (prior.claims ?? []).length || 1,
    };
    matrixRow.IOName = name; // guarantee alignment

    emission.push({
        objectName: name,
        fieldsExtracted: fieldCount,           // ACTUAL on-disk count (source of truth)
        gapsRemaining: [...gaps],
        claims: prior.claims ?? [],
        matrixRow,
    });
}

emission.sort((a, b) => a.objectName.localeCompare(b.objectName));
writeFileSync(TARGET, JSON.stringify(emission, null, 2) + '\n');

const stats = {
    objectsExtracted: emission.length,
    fieldsExtracted: totalFields,
    totalClaims: emission.reduce((s, o) => s + o.claims.length, 0),
    objectsWithGaps: emission.filter((o) => o.gapsRemaining.length).length,
    gapsRemaining: [...allGaps],
};
process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
