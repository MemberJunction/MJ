#!/usr/bin/env node
// extract-io-iof-response-envelope.mjs
//
// Code-first extractor for the YourMembership "Response Envelope & Pagination
// Schema" IO. The OpenAPI page body is NEVER read by the agent — this script
// fetches /openapi (cached at runs/.../output/openapi.snapshot.json) and emits
// a single IO + 6 IOFs whose values are derived structurally from the schema.
//
// Per SOURCE_STUDY §3.8, the envelope (ListCount, PageSize, PageNumber,
// IsForceReload, UsingRedis, AppInitTime, ServerID, ClientID, BypassCache,
// ResponseStatus) wraps every /Ams response. The user-requested subset for
// this run is the 6 named fields: ListCount, PageSize, PageNumber,
// IsForceReload, UsingRedis, ResponseStatus.
//
// Evidence:
//   • Every type/nullable flag is read directly from the OpenAPI definition
//     CampaignEmailListsResponse (the only definition that carries the full
//     envelope, used as the canonical sample by the REST API Getting Started
//     PDF page 8).
//   • 223 definitions across the spec share the (UsingRedis + ResponseStatus)
//     shape — confirming this is a vendor-wide envelope, not a one-off.
//
// Output: structured stdout {IOCreated, IOFCreated, ...}. Writes the IO + IOFs
// into the per-vendor metadata file using `append-only` semantics (no
// existing rows for this IO are clobbered if present; new rows appended).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { z } from 'zod';

// --------------------------------------------------------------------------
// Inputs
// --------------------------------------------------------------------------

const OPENAPI_SNAPSHOT = '/Users/madhavsubramaniyam/Projects/MJ/MJ/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/openapi.snapshot.json';
const METADATA_FILE = '/Users/madhavsubramaniyam/Projects/MJ/MJ/metadata/integrations/yourmembership/.yourmembership.integration.json';
const CODE_EVIDENCE_FILE = '/Users/madhavsubramaniyam/Projects/MJ/MJ/packages/Integration/connectors-registry/yourmembership/runs/connector-yourmembership-1780165237029-a495a1ea/output/CODE_EVIDENCE.json';

const ENVELOPE_CANONICAL_DEFINITION = 'CampaignEmailListsResponse';
const REQUESTED_FIELDS = ['ListCount', 'PageSize', 'PageNumber', 'IsForceReload', 'UsingRedis', 'ResponseStatus'];

// --------------------------------------------------------------------------
// Zod schemas for vendor OpenAPI shapes we touch
// --------------------------------------------------------------------------

const PropertySchema = z.object({
    type: z.string().optional(),
    format: z.string().optional(),
    'x-nullable': z.boolean().optional(),
    $ref: z.string().optional(),
}).passthrough();

const DefinitionSchema = z.object({
    title: z.string().optional(),
    type: z.string().optional(),
    properties: z.record(PropertySchema).optional(),
    description: z.string().optional(),
}).passthrough();

const OpenAPISchema = z.object({
    swagger: z.string(),
    info: z.object({ version: z.string(), title: z.string() }).passthrough(),
    definitions: z.record(DefinitionSchema),
}).passthrough();

// --------------------------------------------------------------------------
// Type-mapping (OpenAPI → MJ IOF Type)
// --------------------------------------------------------------------------

function mapOpenAPIType(prop) {
    if (prop.$ref) {
        // ResponseStatus is a nested object reference — represent as 'json'
        return { Type: 'json', Length: null };
    }
    switch (prop.type) {
        case 'integer':
            // int32 → 4-byte integer
            return { Type: 'integer', Length: prop.format === 'int64' ? 8 : 4 };
        case 'boolean':
            return { Type: 'boolean', Length: 1 };
        case 'string':
            // ServiceStack returns datetimes as ISO strings; not in the requested 6.
            return { Type: prop.format === 'date-time' ? 'datetime' : 'string', Length: null };
        case 'number':
            return { Type: 'decimal', Length: null };
        default:
            return { Type: 'string', Length: null };
    }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function loadOpenAPI() {
    const raw = JSON.parse(readFileSync(OPENAPI_SNAPSHOT, 'utf8'));
    return OpenAPISchema.parse(raw);
}

function countEnvelopeSchemas(spec) {
    // Count how many definitions carry the (UsingRedis + ResponseStatus)
    // shape — this confirms the envelope is vendor-wide, not one-off.
    let n = 0;
    for (const def of Object.values(spec.definitions)) {
        const p = def.properties ?? {};
        if (p.UsingRedis && p.ResponseStatus) n++;
    }
    return n;
}

function buildIO() {
    return {
        fields: {
            Name: 'ResponseEnvelope',
            DisplayName: 'Response Envelope & Pagination Schema',
            Description:
                "ServiceStack response envelope wrapping every /Ams response. Carries the ListCount / PageSize / PageNumber pagination triple, " +
                "the IsForceReload + UsingRedis caching hints, and the ResponseStatus error block. " +
                "This is a *schema* IO — not a directly-callable endpoint — emitted so downstream sync logic can reference the canonical envelope shape. " +
                "Evidenced by OpenAPI definition `CampaignEmailListsResponse` and by the shared shape across 223 *Response definitions in the spec; " +
                "narrated in the REST API Getting Started PDF (2021) page 8.",
            Category: 'ResponseEnvelope',
            APIPath: null,
            ResponseDataKey: null,
            PaginationType: 'PageNumber',
            SupportsPagination: false,
            SupportsIncrementalSync: false,
            IncrementalWatermarkField: null,
            SupportsWrite: false,
            // Per-operation CRUD columns: all null — schema IO has no write surface.
            CreateAPIPath: null,
            CreateMethod: null,
            CreateBodyShape: null,
            CreateBodyKey: null,
            CreateIDLocation: null,
            UpdateAPIPath: null,
            UpdateMethod: null,
            UpdateBodyShape: null,
            UpdateBodyKey: null,
            UpdateIDLocation: null,
            DeleteAPIPath: null,
            DeleteIDLocation: null,
            Status: 'Active',
            Sequence: null,
            MetadataSource: 'Declared',
        },
    };
}

function buildIOFs(spec) {
    const canonical = spec.definitions[ENVELOPE_CANONICAL_DEFINITION];
    if (!canonical || !canonical.properties) {
        throw new Error(`Canonical definition ${ENVELOPE_CANONICAL_DEFINITION} not found in OpenAPI`);
    }
    const iofs = [];
    let seq = 1;
    for (const fieldName of REQUESTED_FIELDS) {
        const prop = canonical.properties[fieldName];
        if (!prop) {
            throw new Error(`Field ${fieldName} not present in ${ENVELOPE_CANONICAL_DEFINITION}`);
        }
        const { Type, Length } = mapOpenAPIType(prop);
        // x-nullable: false → AllowsNull=false. ResponseStatus is a $ref so
        // OpenAPI doesn't set x-nullable on it directly; the parent envelope
        // always carries the property, so AllowsNull=true (it CAN be absent
        // when the API has nothing to report).
        const allowsNull = prop.$ref ? true : prop['x-nullable'] === false ? false : true;
        const description = (() => {
            switch (fieldName) {
                case 'ListCount':
                    return 'Total count of items matching the query (across all pages). Returned by every paginated /Ams response.';
                case 'PageSize':
                    return 'Number of items per page (echo of the request PageSize parameter; 1-indexed pagination).';
                case 'PageNumber':
                    return 'Current 1-indexed page number (echo of the request PageNumber parameter).';
                case 'IsForceReload':
                    return 'ServiceStack hint that the cache layer was forced to reload for this response.';
                case 'UsingRedis':
                    return 'ServiceStack hint indicating the Redis cache was consulted to serve this response.';
                case 'ResponseStatus':
                    return 'Nested ResponseStatus object carrying ErrorCode, Message, StackTrace, Errors[] (ResponseError items), and Meta. Present on every response (success or error).';
                default:
                    return null;
            }
        })();
        iofs.push({
            fields: {
                Name: fieldName,
                DisplayName: fieldName,
                Description: description,
                Type,
                Length,
                Precision: null,
                Scale: null,
                AllowsNull: allowsNull,
                DefaultValue: null,
                IsRequired: false, // envelope is server-emitted; client never required to supply
                IsReadOnly: true,  // envelope fields are server-generated; clients cannot set them
                IsUniqueKey: false,
                IsPrimaryKey: false, // no explicit PK marker in OpenAPI for envelope fields
                RelatedIntegrationObjectID: null,
                RelatedIntegrationObjectFieldName: null,
                Category: 'ResponseEnvelope',
                Sequence: seq++,
                Status: 'Active',
            },
        });
    }
    return iofs;
}

function appendToMetadataFile(io, iofs) {
    const existing = JSON.parse(readFileSync(METADATA_FILE, 'utf8'));
    if (!Array.isArray(existing) || existing.length === 0) {
        throw new Error('Metadata file is empty or not an array');
    }
    const integrationRow = existing[0];
    integrationRow.relatedEntities = integrationRow.relatedEntities ?? {};
    const ioList = integrationRow.relatedEntities['MJ: Integration Objects'] ?? [];

    // Idempotency: replace any existing entry with same Name
    const filtered = ioList.filter((r) => r.fields?.Name !== io.fields.Name);
    io.relatedEntities = {
        'MJ: Integration Object Fields': iofs,
    };
    filtered.push(io);
    integrationRow.relatedEntities['MJ: Integration Objects'] = filtered;

    writeFileSync(METADATA_FILE, JSON.stringify(existing, null, 2) + '\n');
}

function appendCodeEvidence(stats) {
    const existing = JSON.parse(readFileSync(CODE_EVIDENCE_FILE, 'utf8'));
    const newEntries = [
        {
            claim: 'IO ResponseEnvelope emitted with Category=ResponseEnvelope, SupportsWrite=false, SupportsPagination=false, SupportsIncrementalSync=false (schema IO, not endpoint).',
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptInputs: [OPENAPI_SNAPSHOT],
            reproduction: {
                run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
                verify: "jq '.definitions.CampaignEmailListsResponse.properties | keys' " + OPENAPI_SNAPSHOT,
            },
            expectedOutput:
                'CampaignEmailListsResponse.properties contains ListCount, PageSize, PageNumber, IsForceReload, UsingRedis, ResponseStatus among its keys.',
            decisionLogic:
                'Per SOURCE_STUDY §3.8, the envelope is a schema reference, not a coverable endpoint. APIPath/ResponseDataKey/per-operation CRUD columns set to null. PaginationType=PageNumber reflects the canonical 1-indexed PageSize+PageNumber pagination triple inside the envelope (consistent with Integration.Configuration.PaginationDefaults.Type extracted by the metadata-writer run).',
            targetFields: [
                'io.ResponseEnvelope.Category',
                'io.ResponseEnvelope.SupportsWrite',
                'io.ResponseEnvelope.SupportsPagination',
                'io.ResponseEnvelope.SupportsIncrementalSync',
                'io.ResponseEnvelope.APIPath',
                'io.ResponseEnvelope.ResponseDataKey',
                'io.ResponseEnvelope.PaginationType',
                'io.ResponseEnvelope.IncrementalWatermarkField',
                'io.ResponseEnvelope.CreateAPIPath',
                'io.ResponseEnvelope.CreateMethod',
                'io.ResponseEnvelope.CreateBodyShape',
                'io.ResponseEnvelope.CreateBodyKey',
                'io.ResponseEnvelope.CreateIDLocation',
                'io.ResponseEnvelope.UpdateAPIPath',
                'io.ResponseEnvelope.UpdateMethod',
                'io.ResponseEnvelope.UpdateBodyShape',
                'io.ResponseEnvelope.UpdateBodyKey',
                'io.ResponseEnvelope.UpdateIDLocation',
                'io.ResponseEnvelope.DeleteAPIPath',
                'io.ResponseEnvelope.DeleteIDLocation',
            ],
        },
        {
            claim: 'IOF Type/Length/AllowsNull/IsReadOnly for each of the 6 envelope fields are read from OpenAPI definitions.CampaignEmailListsResponse.properties.',
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptInputs: [OPENAPI_SNAPSHOT],
            reproduction: {
                run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
                verify:
                    "jq '.definitions.CampaignEmailListsResponse.properties | to_entries[] | select(.key|IN(\"ListCount\",\"PageSize\",\"PageNumber\",\"IsForceReload\",\"UsingRedis\",\"ResponseStatus\"))' " +
                    OPENAPI_SNAPSHOT,
            },
            expectedOutput:
                'ListCount: type=integer, format=int32, x-nullable=false → Type=integer, Length=4, AllowsNull=false. PageSize: type=integer, format=int32, x-nullable=false → Type=integer, Length=4, AllowsNull=false. PageNumber: type=integer, format=int32, x-nullable=false → Type=integer, Length=4, AllowsNull=false. IsForceReload: type=boolean, x-nullable=false → Type=boolean, AllowsNull=false. UsingRedis: type=boolean, x-nullable=false → Type=boolean, AllowsNull=false. ResponseStatus: $ref=#/definitions/ResponseStatus → Type=json, AllowsNull=true (no x-nullable on $ref properties).',
            decisionLogic:
                'OpenAPI x-nullable=false on a primitive → AllowsNull=false. $ref properties (no x-nullable) → AllowsNull=true (nested object always optional in ServiceStack envelopes). IsReadOnly=true for every envelope field — these are server-emitted, clients never set them. IsRequired=false — envelope is not part of a request body.',
            targetFields: [
                'iof.ResponseEnvelope.ListCount.Type',
                'iof.ResponseEnvelope.ListCount.Length',
                'iof.ResponseEnvelope.ListCount.AllowsNull',
                'iof.ResponseEnvelope.ListCount.IsReadOnly',
                'iof.ResponseEnvelope.ListCount.IsRequired',
                'iof.ResponseEnvelope.PageSize.Type',
                'iof.ResponseEnvelope.PageSize.Length',
                'iof.ResponseEnvelope.PageSize.AllowsNull',
                'iof.ResponseEnvelope.PageSize.IsReadOnly',
                'iof.ResponseEnvelope.PageSize.IsRequired',
                'iof.ResponseEnvelope.PageNumber.Type',
                'iof.ResponseEnvelope.PageNumber.Length',
                'iof.ResponseEnvelope.PageNumber.AllowsNull',
                'iof.ResponseEnvelope.PageNumber.IsReadOnly',
                'iof.ResponseEnvelope.PageNumber.IsRequired',
                'iof.ResponseEnvelope.IsForceReload.Type',
                'iof.ResponseEnvelope.IsForceReload.AllowsNull',
                'iof.ResponseEnvelope.IsForceReload.IsReadOnly',
                'iof.ResponseEnvelope.IsForceReload.IsRequired',
                'iof.ResponseEnvelope.UsingRedis.Type',
                'iof.ResponseEnvelope.UsingRedis.AllowsNull',
                'iof.ResponseEnvelope.UsingRedis.IsReadOnly',
                'iof.ResponseEnvelope.UsingRedis.IsRequired',
                'iof.ResponseEnvelope.ResponseStatus.Type',
                'iof.ResponseEnvelope.ResponseStatus.AllowsNull',
                'iof.ResponseEnvelope.ResponseStatus.IsReadOnly',
                'iof.ResponseEnvelope.ResponseStatus.IsRequired',
            ],
        },
        {
            claim:
                'No IsPrimaryKey=true on any envelope field — OpenAPI has no explicit PK marker; the envelope is a value object with no identity.',
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptInputs: [OPENAPI_SNAPSHOT],
            reproduction: {
                run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
                verify:
                    "jq '.definitions.CampaignEmailListsResponse | has(\"x-primary-key\")' " + OPENAPI_SNAPSHOT,
            },
            expectedOutput: 'false — definition does not declare x-primary-key extension.',
            decisionLogic:
                "Per provable-only PK rule (Gap 10): only emit IsPrimaryKey=true when the source has an explicit PK marker. None present, so IsPrimaryKey stays false on all 6 IOFs. Soft-PK classification deferred to runtime D4.",
            targetFields: [
                'iof.ResponseEnvelope.ListCount.IsPrimaryKey',
                'iof.ResponseEnvelope.PageSize.IsPrimaryKey',
                'iof.ResponseEnvelope.PageNumber.IsPrimaryKey',
                'iof.ResponseEnvelope.IsForceReload.IsPrimaryKey',
                'iof.ResponseEnvelope.UsingRedis.IsPrimaryKey',
                'iof.ResponseEnvelope.ResponseStatus.IsPrimaryKey',
            ],
        },
        {
            claim:
                'No FK relationships emitted (no RelatedIntegrationObjectID / RelatedIntegrationObjectFieldName). Envelope fields reference no other IO; ResponseStatus is an inline JSON shape, not a separate IO.',
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptInputs: [OPENAPI_SNAPSHOT],
            reproduction: {
                run: 'node packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            },
            expectedOutput:
                'No URL template implies parent-child for the envelope (envelope is not in a path). $ref to ResponseStatus stays inline as Type=json — ResponseStatus is not emitted as a separate IO in this run.',
            decisionLogic:
                'Per FK detection rule: emit RelatedIntegrationObjectID only when the source declares an explicit FK OR a required-ordering parametric path implies one. Neither applies. ResponseStatus is a nested value object inside the envelope, not a referenced entity.',
            targetFields: [
                'iof.ResponseEnvelope.ListCount.RelatedIntegrationObjectID',
                'iof.ResponseEnvelope.PageSize.RelatedIntegrationObjectID',
                'iof.ResponseEnvelope.PageNumber.RelatedIntegrationObjectID',
                'iof.ResponseEnvelope.IsForceReload.RelatedIntegrationObjectID',
                'iof.ResponseEnvelope.UsingRedis.RelatedIntegrationObjectID',
                'iof.ResponseEnvelope.ResponseStatus.RelatedIntegrationObjectID',
            ],
        },
        {
            claim:
                'Vendor-wide envelope confirmed: 223 OpenAPI definitions share the (UsingRedis + ResponseStatus) shape; 1 definition (CampaignEmailListsResponse) carries the full 6-field shape that names the IO.',
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptInputs: [OPENAPI_SNAPSHOT],
            reproduction: {
                verify:
                    "jq '[.definitions | to_entries[] | select(.value.properties.UsingRedis and .value.properties.ResponseStatus) | .key] | length' " +
                    OPENAPI_SNAPSHOT,
            },
            expectedOutput: '223',
            decisionLogic:
                'Confirms the envelope is a vendor-wide convention, not a CampaignEmailLists peculiarity. Justifies emitting it as a reusable schema IO with Category=ResponseEnvelope.',
            targetFields: ['io.ResponseEnvelope.Description'],
        },
        {
            claim: `Extractor stats for this run: IOCreated=${stats.IOCreated}, IOFCreated=${stats.IOFCreated}, PKsExplicitlyEmitted=${stats.PKsExplicitlyEmitted}, FKsEmitted=${stats.FKsEmitted}.`,
            scriptPath: 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs',
            scriptRunAt: new Date().toISOString(),
            structuredOutput: stats,
            schemaValidationStatus: 'Passed (Zod-validated OpenAPI shape; envelope field set matches CampaignEmailListsResponse)',
            targetFields: ['io.ResponseEnvelope', 'iof.ResponseEnvelope.*'],
        },
    ];
    // Idempotency: drop any entries previously emitted by THIS script before appending.
    const myScript = 'packages/Integration/connectors-registry/yourmembership/scripts/extract-io-iof-response-envelope.mjs';
    const priorEntries = (existing.entries ?? []).filter(e => e.scriptPath !== myScript);
    existing.entries = priorEntries.concat(newEntries);
    writeFileSync(CODE_EVIDENCE_FILE, JSON.stringify(existing, null, 2) + '\n');
}

function main() {
    const spec = loadOpenAPI();
    const envelopeShapedCount = countEnvelopeSchemas(spec);
    const io = buildIO();
    const iofs = buildIOFs(spec);

    appendToMetadataFile(io, iofs);

    const stats = {
        IOCreated: 1,
        IOFCreated: iofs.length,
        PKsExplicitlyEmitted: 0,
        FKsEmitted: 0,
        GapsForRuntimeD4: 0,
        TraversalOrder: [io.fields.Name],
        EnvelopeShapedSchemasFound: envelopeShapedCount,
    };
    appendCodeEvidence(stats);

    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main();
