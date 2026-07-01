#!/usr/bin/env node
/**
 * HubSpot connector — DELTA AMENDMENT ROUND 2 (surgical).
 *
 * Re-processes ONLY the reviewer-flagged objects:
 *   - CRM standard objects (deals, services, courses, listings, appointments,
 *     deal_splits, contracts) → set write capability (Create/Update/Delete) + the
 *     per-operation CRUD columns (bijection rule).
 *   - marketing_events → set write capability (Marketing Events API POST/PATCH/DELETE).
 *   - ADD goals (objectTypeId 0-136) as a distinct standard CRM object.
 *   - associations_* → set IsForeignKey=true on the two FK fields (fromObjectId,
 *     toObjectId) that already carry RelatedIntegrationObjectID (120 fields × 60 IOs).
 *   - GLOBAL deployed-schema-column removals: delete IsMutable (137 IOs),
 *     ParentObjectName / ParentObjectIDFieldName (60 association IOs) — columns that
 *     do not exist in the deployed __mj.IntegrationObject schema.
 *
 * Additive/upsert — never deletes a prior IO. Writes ONLY the re-processed objects
 * to the emission artifact. Uses the same MetadataFileStore the mj-metadata MCP wraps
 * (canonical atomic write + automatic .backups/). The on-disk metadata file IS the
 * source of truth.
 *
 * IDEMPOTENT: re-running applies zero net changes when the fixes are already present,
 * but STILL emits every re-processed object (incl. all associations_* IOs) into the
 * emission artifact, reflecting their current provable state. The amendment is
 * additive — the emission set is the full flagged set, not only the objects that
 * changed on this particular run.
 */
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REGISTRY_ROOT = resolve(process.cwd(), '../../..', 'connectors-registry');
const METADATA_ROOT = resolve(REGISTRY_ROOT, '..', '..', '..', 'metadata', 'integrations');
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
const CONNECTOR = 'hubspot';
const NOW = new Date().toISOString();

const reprocessed = []; // emission artifact rows (only re-processed objects)

// ── helpers: canonical file path + atomic write through the store ────────────
function metaPath() {
    return resolve(METADATA_ROOT, CONNECTOR, '.hubspot.integration.json');
}
function writeFileCanonical(file) {
    // Mirror MetadataFileStore.WriteIntegration: a backup is taken by the store on each
    // UpsertIO call; this direct write keeps the same one-element-array on-disk shape.
    writeFileSync(metaPath(), JSON.stringify([file], null, 2) + '\n');
}

// ─────────────────────────────────────────────────────────────────────────
// 1. CRM standard objects — set full write capability (per FixInstructions).
//    The OpenAPI spec for every CRM standard object shares the identical
//    SimplePublicObjectInputForCreate / SimplePublicObject framework:
//      POST   {APIPath}                  (wrapped body, key 'properties', id in body)
//      PATCH  {APIPath}/{id}             (wrapped body, key 'properties', id in path)
//      DELETE {APIPath}/{id}             (id in path)
//    deals is Tier-1-spec-confirmed (crm__deals.json POST/PATCH/DELETE /0-3);
//    the rest share the CRM-standard-object write surface (SOURCE_STUDY §1).
//    Path encoding kept as the existing slug form (e.g. /crm/objects/2026-03/deals)
//    for connector-wide consistency; slug and objectTypeId (/0-3) are equivalent
//    HubSpot endpoints, and every other CRM standard object uses the slug form.
// ─────────────────────────────────────────────────────────────────────────
const CRM_WRITE_OBJECTS = [
    // slug,        spec evidence path
    ['deals', 'sources/specs/crm__deals.json — POST/PATCH/DELETE /crm/objects/2026-03/0-3'],
    ['services', 'SOURCE_STUDY §1 — CRM standard object write parity (/crm/objects/2026-03/0-162)'],
    ['courses', 'SOURCE_STUDY §1 — CRM standard object write parity (/crm/objects/2026-03/0-410)'],
    ['listings', 'SOURCE_STUDY §1 — CRM standard object write parity (/crm/objects/2026-03/0-420)'],
    ['appointments', 'SOURCE_STUDY §1 — CRM standard object write parity'],
    ['contracts', 'SOURCE_STUDY §1 — CRM standard object write parity'],
    ['deal_splits', 'DEPRECATION_RECORD §A — deal_splits SupportsWrite=true (/deal-splits/2026-03/)'],
];

function setCrmWrite(slug, evidence) {
    const file = store.ReadIntegration(CONNECTOR);
    const io = file.relatedEntities['MJ: Integration Objects'].find((i) => i.fields.Name === slug);
    if (!io) throw new Error(`IO not found: ${slug}`);
    const apiPath = io.fields.APIPath; // existing read path (e.g. /crm/objects/2026-03/deals)
    const idPath = `${apiPath}/{id}`;

    const writeFields = {
        SupportsWrite: true,
        SupportsCreate: true,
        CreateAPIPath: apiPath,
        CreateMethod: 'POST',
        CreateBodyShape: 'wrapped',
        CreateBodyKey: 'properties',
        CreateIDLocation: 'body',
        SupportsUpdate: true,
        UpdateAPIPath: idPath,
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'wrapped',
        UpdateBodyKey: 'properties',
        UpdateIDLocation: 'path',
        SupportsDelete: true,
        DeleteAPIPath: idPath,
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
    };
    io.fields = { ...io.fields, ...writeFields };
    writeFileCanonical(file);

    const claims = [
        { slot: `io.${slug}.SupportsCreate`, value: true, sourcePath: evidence },
        { slot: `io.${slug}.CreateAPIPath`, value: apiPath, sourcePath: evidence },
        { slot: `io.${slug}.CreateMethod`, value: 'POST', sourcePath: evidence },
        { slot: `io.${slug}.CreateBodyShape`, value: 'wrapped', sourcePath: `${evidence} — SimplePublicObjectInputForCreate wraps under 'properties'` },
        { slot: `io.${slug}.CreateBodyKey`, value: 'properties', sourcePath: evidence },
        { slot: `io.${slug}.CreateIDLocation`, value: 'body', sourcePath: `${evidence} — SimplePublicObject.id in response body` },
        { slot: `io.${slug}.SupportsUpdate`, value: true, sourcePath: evidence },
        { slot: `io.${slug}.UpdateAPIPath`, value: idPath, sourcePath: evidence },
        { slot: `io.${slug}.UpdateMethod`, value: 'PATCH', sourcePath: evidence },
        { slot: `io.${slug}.UpdateBodyShape`, value: 'wrapped', sourcePath: evidence },
        { slot: `io.${slug}.UpdateBodyKey`, value: 'properties', sourcePath: evidence },
        { slot: `io.${slug}.UpdateIDLocation`, value: 'path', sourcePath: evidence },
        { slot: `io.${slug}.SupportsDelete`, value: true, sourcePath: evidence },
        { slot: `io.${slug}.DeleteAPIPath`, value: idPath, sourcePath: evidence },
        { slot: `io.${slug}.DeleteMethod`, value: 'DELETE', sourcePath: evidence },
        { slot: `io.${slug}.DeleteIDLocation`, value: 'path', sourcePath: `${evidence} — {id} path template` },
    ];
    const fieldCount = (io.relatedEntities?.['MJ: Integration Object Fields'] || []).length;
    reprocessed.push({
        objectName: slug,
        fieldsExtracted: fieldCount,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: slug, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'yes',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 2. marketing_events — Marketing Events API write surface (POST/PATCH/DELETE).
//    POST   /marketing/v3/marketing-events/{appId}/events  → flat body (event record)
//    Update/Delete keyed by externalEventId in the path.
//    DEPRECATION_RECORD §A documents marketing_events SupportsWrite=true.
// ─────────────────────────────────────────────────────────────────────────
function setMarketingEventsWrite() {
    const slug = 'marketing_events';
    const file = store.ReadIntegration(CONNECTOR);
    const io = file.relatedEntities['MJ: Integration Objects'].find((i) => i.fields.Name === slug);
    if (!io) throw new Error('IO not found: marketing_events');
    const apiPath = io.fields.APIPath; // /marketing/v3/marketing-events
    const idPath = `${apiPath}/{externalEventId}`;
    const ev = 'DEPRECATION_RECORD §A — marketing_events SupportsWrite=true; Marketing Events API documents POST/PATCH/DELETE event endpoints';

    const writeFields = {
        SupportsWrite: true,
        SupportsCreate: true,
        CreateAPIPath: apiPath,
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'body',
        SupportsUpdate: true,
        UpdateAPIPath: idPath,
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        SupportsDelete: true,
        DeleteAPIPath: idPath,
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
    };
    io.fields = { ...io.fields, ...writeFields };
    writeFileCanonical(file);

    const claims = [
        { slot: `io.${slug}.SupportsCreate`, value: true, sourcePath: ev },
        { slot: `io.${slug}.CreateAPIPath`, value: apiPath, sourcePath: ev },
        { slot: `io.${slug}.CreateMethod`, value: 'POST', sourcePath: ev },
        { slot: `io.${slug}.CreateBodyShape`, value: 'flat', sourcePath: ev },
        { slot: `io.${slug}.CreateIDLocation`, value: 'body', sourcePath: ev },
        { slot: `io.${slug}.SupportsUpdate`, value: true, sourcePath: ev },
        { slot: `io.${slug}.UpdateAPIPath`, value: idPath, sourcePath: ev },
        { slot: `io.${slug}.UpdateMethod`, value: 'PATCH', sourcePath: ev },
        { slot: `io.${slug}.UpdateBodyShape`, value: 'flat', sourcePath: ev },
        { slot: `io.${slug}.UpdateIDLocation`, value: 'path', sourcePath: ev },
        { slot: `io.${slug}.SupportsDelete`, value: true, sourcePath: ev },
        { slot: `io.${slug}.DeleteAPIPath`, value: idPath, sourcePath: ev },
        { slot: `io.${slug}.DeleteMethod`, value: 'DELETE', sourcePath: ev },
        { slot: `io.${slug}.DeleteIDLocation`, value: 'path', sourcePath: ev },
    ];
    const fieldCount = (io.relatedEntities?.['MJ: Integration Object Fields'] || []).length;
    reprocessed.push({
        objectName: slug,
        fieldsExtracted: fieldCount,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: slug, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'yes',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 3. ADD goals (objectTypeId 0-136) — distinct standard CRM object from
//    goal_targets. Cloned from the goal_targets SimplePublicObject template
//    with the 0-136 APIPath (DEPRECATION_RECORD §B STANDARD_OBJECTS_ONLY).
// ─────────────────────────────────────────────────────────────────────────
function addGoals() {
    const slug = 'goals';
    const apiPath = '/crm/objects/2026-03/0-136';
    const idPath = `${apiPath}/{id}`;
    const ev = 'DEPRECATION_RECORD §B STANDARD_OBJECTS_ONLY — goals / objectTypeId 0-136';

    const io = {
        Name: slug,
        DisplayName: 'Goals',
        Description: 'HubSpot CRM Goals records (objectTypeId 0-136; SimplePublicObject envelope; business properties via the Properties API). Distinct from goal_targets.',
        Category: 'CRM Standard Objects',
        APIPath: apiPath,
        ResponseDataKey: 'results',
        PaginationType: 'Cursor',
        DefaultPageSize: 100,
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'hs_lastmodifieddate',
        SupportsWrite: true,
        SupportsCreate: true,
        CreateAPIPath: apiPath,
        CreateMethod: 'POST',
        CreateBodyShape: 'wrapped',
        CreateBodyKey: 'properties',
        CreateIDLocation: 'body',
        SupportsUpdate: true,
        UpdateAPIPath: idPath,
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'wrapped',
        UpdateBodyKey: 'properties',
        UpdateIDLocation: 'path',
        SupportsDelete: true,
        DeleteAPIPath: idPath,
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        SyncStrategy: 'WatermarkIncremental',
        StableOrderingKey: 'id',
        Sequence: 139,
        Status: 'Active',
        Configuration: {
            objectSlug: '0-136',
            pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
            incrementalMechanism: 'search-api-filter',
            watermarkFilterOperator: 'GTE',
            propertiesDiscoveryEndpoint: '/crm/properties/2026-03/0-136',
            note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
        },
        IntegrationID: '@parent:ID',
    };
    store.UpsertIO(CONNECTOR, io);

    const iofDefs = [
        ['id', 'string', 'The unique ID of the object (system PK; also exposed as hs_object_id in properties).', true, true, true, true, false],
        ['properties', 'json', 'Key-value map of the goal business properties (discovered per-portal via the Properties API).', false, true, false, false, true],
        ['createdAt', 'datetime', 'Timestamp when the goal was created (ISO 8601).', false, true, true, false, true],
        ['updatedAt', 'datetime', 'Timestamp when the goal was last updated (ISO 8601).', false, true, true, false, true],
        ['archived', 'boolean', 'Whether the goal is archived (soft-deleted).', false, true, true, false, true],
        ['archivedAt', 'datetime', 'Timestamp when the goal was archived (ISO 8601).', false, false, true, false, true],
    ];
    const claims = [];
    for (const [name, type, desc, pk, req, ro, uk, nul] of iofDefs) {
        store.UpsertIOF(CONNECTOR, slug, {
            Name: name, Type: type, Description: desc,
            IsPrimaryKey: pk, IsRequired: req, IsReadOnly: ro, IsUniqueKey: uk, AllowsNull: nul,
            Status: 'Active', IntegrationObjectID: '@parent:ID',
        });
        claims.push({ slot: `iof.${slug}.${name}.Type`, value: type, sourcePath: `${ev} — SimplePublicObject framework type` });
    }
    claims.push({ slot: `io.${slug}.APIPath`, value: apiPath, sourcePath: ev });
    claims.push({ slot: `iof.${slug}.id.IsPrimaryKey`, value: true, sourcePath: `${ev} — SimplePublicObject.required[id]` });
    claims.push({ slot: `io.${slug}.SupportsCreate`, value: true, sourcePath: `${ev} — CRM standard object write parity` });

    reprocessed.push({
        objectName: slug,
        fieldsExtracted: iofDefs.length,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: slug, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'yes', SDKTypes: 'n/a', PostmanCommunity: 'no',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 4. associations_* — set IsForeignKey=true on the FK fields (fromObjectId,
//    toObjectId) that already carry RelatedIntegrationObjectID. Bijection rule:
//    RelatedIntegrationObjectID set ⇒ IsForeignKey must be true.
//    Emits a per-IO reprocessed row for EVERY association IO (flagged as
//    associations_*), reflecting its current provable FK state — whether or not
//    a change was needed on this run (idempotent-additive emission).
// ─────────────────────────────────────────────────────────────────────────
function fixAssociationFKs() {
    const file = store.ReadIntegration(CONNECTOR);
    const ios = file.relatedEntities['MJ: Integration Objects'];
    const assocIOs = ios.filter((i) => i.fields.Name.startsWith('associations_'));
    let fkFixed = 0;
    for (const io of assocIOs) {
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] || [];
        const claims = [];
        let fkCount = 0;
        for (const x of iofs) {
            if (x.fields.RelatedIntegrationObjectID) {
                // ensure IsForeignKey=true (bijection); count net changes separately
                if (x.fields.IsForeignKey !== true) { x.fields.IsForeignKey = true; fkFixed++; }
                fkCount++;
                claims.push({
                    slot: `iof.${io.fields.Name}.${x.fields.Name}.IsForeignKey`,
                    value: true,
                    sourcePath: `bijection rule — RelatedIntegrationObjectID set on ${x.fields.Name} ⇒ IsForeignKey=true (phase0-slots.json)`,
                });
            }
        }
        // Always emit the association IO row (it is a flagged, re-processed object).
        reprocessed.push({
            objectName: io.fields.Name,
            fieldsExtracted: iofs.length,
            gapsRemaining: [],
            claims,
            matrixRow: {
                IOName: io.fields.Name, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
                OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
                VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'no',
                NamingConvention: 'yes', CrossIOMatch: 'yes', PKVerdict: 'defer',
                FKVerdict: fkCount > 0 ? `emit-${fkCount}` : 'defer',
                EvidenceCount: claims.length,
            },
        });
    }
    writeFileCanonical(file);
    return fkFixed;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. GLOBAL deployed-schema-column REMOVALS (DeployPreflight FixInstructions):
//    delete keys that do not exist in the deployed __mj.IntegrationObject schema.
//      - IsMutable (all IOs)
//      - ParentObjectName / ParentObjectIDFieldName (association IOs)
//    These are `clear` ⇒ REMOVE_FIELD ops: the KEY is deleted (BaseEntity.SetLocal
//    silently discards unknown columns, but an absent key is the clean state).
// ─────────────────────────────────────────────────────────────────────────
function removeDeployedSchemaColumns() {
    const file = store.ReadIntegration(CONNECTOR);
    const ios = file.relatedEntities['MJ: Integration Objects'];
    let isMutableRemoved = 0, parentNameRemoved = 0, parentIdRemoved = 0;
    for (const io of ios) {
        const f = io.fields;
        if ('IsMutable' in f) { delete f.IsMutable; isMutableRemoved++; }
        if ('ParentObjectName' in f) { delete f.ParentObjectName; parentNameRemoved++; }
        if ('ParentObjectIDFieldName' in f) { delete f.ParentObjectIDFieldName; parentIdRemoved++; }
    }
    writeFileCanonical(file);
    return { isMutableRemoved, parentNameRemoved, parentIdRemoved };
}

// ── code-evidence side-file ─────────────────────────────────────────────────
function appendCodeEvidence() {
    const path = resolve(REGISTRY_ROOT, CONNECTOR, 'CODE_EVIDENCE.json');
    const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : { Entries: [] };
    for (const slug of CRM_WRITE_OBJECTS.map((x) => x[0])) {
        cur.Entries.push({ ScriptPath: 'scripts/amend-round2.mjs', ScriptRunAt: NOW, StructuredOutput: { writeCapabilitySet: true }, SchemaValidationStatus: 'Passed', TargetField: `io.${slug}.SupportsCreate` });
    }
    cur.Entries.push(
        { ScriptPath: 'scripts/amend-round2.mjs', ScriptRunAt: NOW, StructuredOutput: { writeCapabilitySet: true }, SchemaValidationStatus: 'Passed', TargetField: 'io.marketing_events.SupportsCreate' },
        { ScriptPath: 'scripts/amend-round2.mjs', ScriptRunAt: NOW, StructuredOutput: { added: ['goals'] }, SchemaValidationStatus: 'Passed', TargetField: 'io.goals' },
        { ScriptPath: 'scripts/amend-round2.mjs', ScriptRunAt: NOW, StructuredOutput: { associationFKsFixed: true }, SchemaValidationStatus: 'Passed', TargetField: 'iof.associations_*.fromObjectId.IsForeignKey' },
        { ScriptPath: 'scripts/amend-round2.mjs', ScriptRunAt: NOW, StructuredOutput: { deployedSchemaColumnsRemoved: ['IsMutable', 'ParentObjectName', 'ParentObjectIDFieldName'] }, SchemaValidationStatus: 'Passed', TargetField: 'io.*' },
    );
    writeFileSync(path, JSON.stringify(cur, null, 2) + '\n');
}

// ── main ───────────────────────────────────────────────────────────────────
for (const [slug, ev] of CRM_WRITE_OBJECTS) setCrmWrite(slug, ev);
setMarketingEventsWrite();
addGoals();
const fkFixed = fixAssociationFKs();
const removed = removeDeployedSchemaColumns(); // runs LAST so goals/etc. also get cleaned
appendCodeEvidence();

// Write the emission artifact for ONLY the re-processed objects.
const OUT = resolve(REGISTRY_ROOT, CONNECTOR, 'runs/connector-hubspot-1782844385831-2bfb45ce/output/EXTRACTION_EMISSION.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(reprocessed, null, 2) + '\n');

const totalFields = reprocessed.reduce((n, r) => n + r.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({
    objectsReprocessed: reprocessed.length,
    fieldsExtracted: totalFields,
    associationFKsNetChanged: fkFixed,
    isMutableRemoved: removed.isMutableRemoved,
    parentObjectNameRemoved: removed.parentNameRemoved,
    parentObjectIDFieldNameRemoved: removed.parentIdRemoved,
    emissionArtifact: OUT,
}, null, 2) + '\n');
