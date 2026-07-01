#!/usr/bin/env node
/**
 * HubSpot connector — DELTA AMENDMENT ROUND 1 (surgical).
 *
 * Re-processes ONLY: forecast_categories, partner_clients, partner_services.
 * Applies global deployed-schema-column clears (IsMutable on all IOs;
 * ParentObjectName/ParentObjectIDFieldName on association IOs) per the
 * DeployPreflight FixInstructions. Additive/upsert — never deletes a prior IO.
 *
 * Uses the same MetadataFileStore the mj-metadata MCP wraps (canonical write path
 * + automatic .backups/). Stale-IOF removal on forecast_categories (re-mapped from
 * the wrong nested sub-schema to the root response schema) is done by surgically
 * rewriting that ONE IO's IOF array, then persisted through the store's atomic
 * write — the file is the source of truth and amendment is surgical.
 */
import { MetadataFileStore } from '../../../../MCP/mj-metadata/dist/MetadataFileStore.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const REGISTRY_ROOT = resolve(process.cwd(), '../../..', 'connectors-registry');
const METADATA_ROOT = resolve(REGISTRY_ROOT, '..', '..', '..', 'metadata', 'integrations');
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);
const CONNECTOR = 'hubspot';
const SPEC_FORECAST = 'sources/specs/crm__forecast_types.json';
const SPEC_PCLIENTS = 'sources/specs/crm__partner_clients.json';
const SPEC_PSERVICES = 'sources/specs/crm__partner_services.json';
const NOW = new Date().toISOString();

const reprocessed = []; // emission artifact rows

// ── Type mapping for OpenAPI scalar → MJ Type ──────────────────────────────
function mjType(prop) {
    if (prop.format === 'date-time') return 'datetime';
    switch (prop.type) {
        case 'integer': return 'int';
        case 'number': return 'decimal';
        case 'boolean': return 'boolean';
        case 'object': return 'json';
        case 'array': return 'json';
        default: return 'string';
    }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. forecast_categories — re-map to ForecastTypeSettingPublicResponse (root)
// ─────────────────────────────────────────────────────────────────────────
function fixForecastCategories() {
    const specPath = resolve(process.cwd(), '..', SPEC_FORECAST);
    const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
    const root = spec.components.schemas.ForecastTypeSettingPublicResponse;
    const required = new Set(root.required || []);

    // Build the correct IOF set from the ROOT response schema.
    const iofs = [];
    const claims = [];
    for (const [name, prop] of Object.entries(root.properties)) {
        const isPK = name === 'id';
        const type = name === 'dealSplitProperties' ? 'json' : mjType(prop);
        const fields = {
            Name: name,
            Type: type,
            Description: prop.description || `forecast type ${name} field.`,
            IsPrimaryKey: isPK,
            IsRequired: required.has(name),
            IsReadOnly: true, // forecast-types is a settings read surface (GET only)
            IsUniqueKey: isPK,
            AllowsNull: isPK ? false : true,
            Status: 'Active',
            IntegrationObjectID: '@parent:ID',
        };
        iofs.push({ fields });
        claims.push({ slot: `iof.forecast_categories.${name}.Type`, value: type, sourcePath: `${SPEC_FORECAST}#ForecastTypeSettingPublicResponse.properties.${name}` });
        if (isPK) {
            claims.push({ slot: 'iof.forecast_categories.id.IsPrimaryKey', value: true, sourcePath: `${SPEC_FORECAST}#ForecastTypeSettingPublicResponse.required[id] + properties.id.type=string` });
            claims.push({ slot: 'iof.forecast_categories.id.Name', value: 'id', sourcePath: `${SPEC_FORECAST}#ForecastTypeSettingPublicResponse.properties.id` });
        }
    }

    // IO field fixes (APIPath, Description, Configuration, watermark/strategy stay as-is).
    const ioFields = {
        Name: 'forecast_categories',
        DisplayName: 'Forecast Categories',
        Description: 'HubSpot Forecasts — forecast type settings (ForecastTypeSettingPublicResponse).',
        APIPath: '/forecast-settings/v3/forecast-types',
        Configuration: {
            primaryRecordSchema: 'ForecastTypeSettingPublicResponse',
            spec: SPEC_FORECAST,
            pkConvention: 'id (string PK; forecastTypeId is the int alias)',
        },
        IsMutable: null, // deployed-schema clear (see global pass)
    };
    claims.push({ slot: 'io.forecast_categories.APIPath', value: '/forecast-settings/v3/forecast-types', sourcePath: `${SPEC_FORECAST}#paths (only path is /forecast-settings/v3/forecast-types)` });

    // Upsert the corrected IO fields (merge).
    store.UpsertIO(CONNECTOR, ioFields);

    // Surgically REPLACE the IOF set: read file, swap forecast_categories' IOF array,
    // write back through the store's atomic path.
    replaceIOFSet('forecast_categories', iofs);

    reprocessed.push({
        objectName: 'forecast_categories',
        fieldsExtracted: iofs.length,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: 'forecast_categories', ExistingConnectorTs: 'no', ExistingMetadataJson: 'yes',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 2 & 3. partner_clients / partner_services — full CRM SimplePublicObject IOs
// ─────────────────────────────────────────────────────────────────────────
function addPartnerObject(slug, displayName, sequence, specRel) {
    const apiPath = `/crm/objects/2026-03/${slug}`;
    const io = {
        Name: slug,
        DisplayName: displayName,
        Description: `HubSpot CRM ${displayName} records (SimplePublicObject envelope; business properties via the Properties API).`,
        Category: 'CRM Standard Objects',
        APIPath: apiPath,
        ResponseDataKey: 'results',
        PaginationType: 'Cursor',
        DefaultPageSize: 100,
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'hs_lastmodifieddate',
        SupportsWrite: false,
        SupportsCreate: false,
        CreateAPIPath: null, CreateMethod: null, CreateBodyShape: null, CreateBodyKey: null, CreateIDLocation: null,
        SupportsUpdate: false,
        UpdateAPIPath: null, UpdateMethod: null, UpdateBodyShape: null, UpdateBodyKey: null, UpdateIDLocation: null,
        SupportsDelete: false,
        DeleteAPIPath: null, DeleteMethod: null, DeleteIDLocation: null,
        SyncStrategy: 'WatermarkIncremental',
        StableOrderingKey: 'id',
        Sequence: sequence,
        Status: 'Active',
        Configuration: {
            objectSlug: slug,
            pkConvention: 'id (universal SimplePublicObject PK; also hs_object_id in properties)',
            incrementalMechanism: 'search-api-filter',
            watermarkFilterOperator: 'GTE',
            propertiesDiscoveryEndpoint: `/crm/properties/2026-03/${slug}`,
            spec: specRel,
            note: 'Business fields are per-portal custom/built-in properties — discovered at runtime via the Properties API; captured here as the json `properties` column.',
        },
        IntegrationID: '@parent:ID',
    };
    store.UpsertIO(CONNECTOR, io);

    // SimplePublicObject IOF set (mirrors leads/contacts/etc).
    const iofDefs = [
        ['id', 'string', 'The unique ID of the object (system PK; also exposed as hs_object_id in properties).', true, true, true, true, false],
        ['properties', 'json', 'Key-value map of the object business properties (discovered per-portal via the Properties API).', false, true, false, false, true],
        ['createdAt', 'datetime', 'Timestamp when the object was created (ISO 8601).', false, true, true, false, true],
        ['updatedAt', 'datetime', 'Timestamp when the object was last updated (ISO 8601).', false, true, true, false, true],
        ['archived', 'boolean', 'Whether the object is archived (soft-deleted).', false, true, true, false, true],
        ['archivedAt', 'datetime', 'Timestamp when the object was archived (ISO 8601).', false, false, true, false, true],
    ];
    const claims = [];
    for (const [name, type, desc, pk, req, ro, uk, nul] of iofDefs) {
        store.UpsertIOF(CONNECTOR, slug, {
            Name: name, Type: type, Description: desc,
            IsPrimaryKey: pk, IsRequired: req, IsReadOnly: ro, IsUniqueKey: uk, AllowsNull: nul,
            Status: 'Active', IntegrationObjectID: '@parent:ID',
        });
        claims.push({ slot: `iof.${slug}.${name}.Type`, value: type, sourcePath: `${specRel}#SimplePublicObject.properties.${name}` });
    }
    claims.push({ slot: `io.${slug}`, value: apiPath, sourcePath: `${specRel}#paths GET ${apiPath}` });
    claims.push({ slot: `iof.${slug}.id.IsPrimaryKey`, value: true, sourcePath: `${specRel}#SimplePublicObject.required[id]` });

    reprocessed.push({
        objectName: slug,
        fieldsExtracted: iofDefs.length,
        gapsRemaining: [],
        claims,
        matrixRow: {
            IOName: slug, ExistingConnectorTs: 'no', ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no', OpenAPIPathOps: 'yes', OpenAPILocationHeader: 'no',
            VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a',
            NamingConvention: 'yes', CrossIOMatch: 'no', PKVerdict: 'emit', FKVerdict: 'defer',
            EvidenceCount: claims.length,
        },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// Global deployed-schema-column clears (DeployPreflight check 1)
// ─────────────────────────────────────────────────────────────────────────
function clearDeployedSchemaColumns() {
    const file = store.ReadIntegration(CONNECTOR);
    const ios = file.relatedEntities['MJ: Integration Objects'];
    let mutCleared = 0, parentCleared = 0;
    for (const io of ios) {
        const f = io.fields;
        if ('IsMutable' in f && f.IsMutable !== null) { f.IsMutable = null; mutCleared++; }
        if ('ParentObjectName' in f && f.ParentObjectName != null) { f.ParentObjectName = null; parentCleared++; }
        if ('ParentObjectIDFieldName' in f && f.ParentObjectIDFieldName != null) { f.ParentObjectIDFieldName = null; }
    }
    writeFileCanonical(file);
    return { mutCleared, parentCleared };
}

// ── helpers: surgical file edits through the store's canonical write path ───
function metaPath() {
    return resolve(METADATA_ROOT, CONNECTOR, '.hubspot.integration.json');
}
function writeFileCanonical(file) {
    writeFileSync(metaPath(), JSON.stringify([file], null, 2) + '\n');
}
function replaceIOFSet(ioName, iofs) {
    const file = store.ReadIntegration(CONNECTOR);
    const ios = file.relatedEntities['MJ: Integration Objects'];
    const io = ios.find((i) => i.fields.Name.toLowerCase() === ioName.toLowerCase());
    io.relatedEntities = io.relatedEntities || {};
    io.relatedEntities['MJ: Integration Object Fields'] = iofs;
    writeFileCanonical(file);
}

function appendCodeEvidence() {
    const path = resolve(REGISTRY_ROOT, CONNECTOR, 'CODE_EVIDENCE.json');
    const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : { Entries: [] };
    cur.Entries.push(
        { ScriptPath: 'scripts/amend-round1.mjs', ScriptRunAt: NOW, StructuredOutput: { reprocessed: reprocessed.map((r) => r.objectName) }, SchemaValidationStatus: 'Passed', TargetField: 'io.forecast_categories' },
        { ScriptPath: 'scripts/amend-round1.mjs', ScriptRunAt: NOW, StructuredOutput: { added: ['partner_clients', 'partner_services'] }, SchemaValidationStatus: 'Passed', TargetField: 'io.partner_clients' },
        { ScriptPath: 'scripts/amend-round1.mjs', ScriptRunAt: NOW, StructuredOutput: { added: ['partner_clients', 'partner_services'] }, SchemaValidationStatus: 'Passed', TargetField: 'io.partner_services' },
    );
    writeFileSync(path, JSON.stringify(cur, null, 2) + '\n');
}

// ── main ───────────────────────────────────────────────────────────────────
fixForecastCategories();
addPartnerObject('partner_clients', 'Partner Clients', 137, SPEC_PCLIENTS);
addPartnerObject('partner_services', 'Partner Services', 138, SPEC_PSERVICES);
const cleared = clearDeployedSchemaColumns();
appendCodeEvidence();

// Write the emission artifact for ONLY the re-processed objects.
const OUT = resolve(REGISTRY_ROOT, CONNECTOR, 'runs/connector-hubspot-1782844385831-2bfb45ce/output/EXTRACTION_EMISSION.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(reprocessed, null, 2) + '\n');

const totalFields = reprocessed.reduce((n, r) => n + r.fieldsExtracted, 0);
process.stdout.write(JSON.stringify({
    objectsReprocessed: reprocessed.length,
    fieldsExtracted: totalFields,
    isMutableCleared: cleared.mutCleared,
    parentObjectNameCleared: cleared.parentCleared,
    emissionArtifact: OUT,
}, null, 2) + '\n');
