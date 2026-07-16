#!/usr/bin/env node
// Read-only deterministic analysis over the pinned OpenAPI spec + the current (already-fixed)
// metadata file, reproducing the decisions behind the extraction-quality-defect fixes applied via
// mj-metadata MCP tools (FIX A-F). This script makes NO writes itself -- it is evidence: its
// structured stdout output is what CODE_EVIDENCE.json entries cite for each mutation. All actual
// metadata mutations were performed via mj-metadata MCP tool calls (upsert_integration_fields,
// upsert_integration_object_field, delete_integration_object), never hand-edited JSON.
//
// Usage: node fix-extraction-quality-defects.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const OPENAPI_PATH = resolve(ROOT, 'packages/Integration/connectors-registry/constant-contact/sources/openapi.json');
const METADATA_PATH = resolve(ROOT, 'metadata/integrations/constant-contact/.constant-contact.integration.json');

const spec = JSON.parse(readFileSync(OPENAPI_PATH, 'utf8'));
const metaRoot = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
const meta = Array.isArray(metaRoot) ? metaRoot[0] : metaRoot;
const ios = meta.relatedEntities['MJ: Integration Objects'];

function resolveSchema(schema) {
    if (!schema) return null;
    if (schema.$ref) return spec.definitions[schema.$ref.split('/').pop()];
    return schema;
}

// ---- FIX D verification: every IO's declared pagination must match whether its OpenAPI
// list-response schema carries a `_links.next` cursor wrapper. ----
function hasNextLink(apiPath) {
    const methods = spec.paths[apiPath];
    if (!methods) return { hasNext: null, reason: 'path-not-found' };
    const get = methods.get;
    if (!get) return { hasNext: null, reason: 'no-get' };
    const resp200 = get.responses && get.responses['200'];
    const schema = resolveSchema(resp200 && resp200.schema);
    if (!schema) return { hasNext: false, reason: 'no-schema' };
    const linksProp = schema.properties && schema.properties._links;
    if (!linksProp) return { hasNext: false, reason: 'no-_links-prop' };
    const linksResolved = resolveSchema(linksProp);
    const linkProps = (linksResolved && linksResolved.properties) || {};
    return { hasNext: 'next' in linkProps, reason: 'next' in linkProps ? 'has-next' : 'links-no-next' };
}

const paginationMismatches = [];
for (const io of ios) {
    const f = io.fields;
    const { hasNext } = hasNextLink(f.APIPath);
    const declaredPaginated = f.PaginationType !== 'None' || !!f.SupportsPagination;
    if (hasNext === true && !declaredPaginated) paginationMismatches.push({ io: f.Name, issue: 'should-be-paginated' });
    if (hasNext === false && declaredPaginated) paginationMismatches.push({ io: f.Name, issue: 'should-not-be-paginated' });
}

// ---- FIX E verification: contacts/emails watermark must be the RECORD field (updated_at), not
// the filter PARAM name (updated_after/after_date). ----
const watermarkChecks = ['contacts', 'emails'].map((name) => {
    const io = ios.find((i) => i.fields.Name === name);
    const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
    const hasRecordField = iofs.some((f) => f.fields.Name === io.fields.IncrementalWatermarkField);
    return { io: name, IncrementalWatermarkField: io.fields.IncrementalWatermarkField, hasRecordField, incrementalFilterFormat: io.fields.Configuration && io.fields.Configuration.incrementalFilterFormat };
});

// ---- FIX B verification: PK-defer rate across all IOs. ----
let withPk = 0;
const deferred = [];
for (const io of ios) {
    const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
    const hasPk = iofs.some((f) => f.fields.IsPrimaryKey === true);
    if (hasPk) withPk++; else deferred.push(io.fields.Name);
}

// ---- FIX C verification: no half-set FK (RelatedIntegrationObjectID set, IsForeignKey not true). ----
const halfSetFks = [];
for (const io of ios) {
    const iofs = (io.relatedEntities && io.relatedEntities['MJ: Integration Object Fields']) || [];
    for (const f of iofs) {
        if (f.fields.RelatedIntegrationObjectID && f.fields.IsForeignKey !== true) {
            halfSetFks.push({ io: io.fields.Name, field: f.fields.Name });
        }
    }
}

// ---- FIX F verification: activities_contacts_export must be absent. ----
const fileDownloadObjectPresent = ios.some((io) => io.fields.Name === 'activities_contacts_export');

const report = {
    fixA_universalPK: meta.fields.Configuration && meta.fields.Configuration.universalPK,
    fixB_pkDeferRate: { totalIOs: ios.length, withPk, deferredCount: deferred.length, deferRatePct: Math.round((deferred.length / ios.length) * 10000) / 100, deferred },
    fixC_halfSetFksRemaining: halfSetFks,
    fixD_paginationMismatchesRemaining: paginationMismatches,
    fixE_watermarkChecks: watermarkChecks,
    fixF_fileDownloadObjectPresent: fileDownloadObjectPresent,
};

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
