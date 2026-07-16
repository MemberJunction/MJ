#!/usr/bin/env node
// extract-integration-config-facts.mjs
//
// Extracts Integration-row / Configuration-level structural facts directly
// from the saved OpenAPI specs (sources/ticketing-oas.json,
// sources/helpcenter-oas.json) so the MetadataWriter's hard-constraint
// claims (universalPK, pagination shape, incremental-export shape, error
// shape) are backed by re-runnable code evidence, not reasoning-only
// citations. Prints structured JSON to stdout.
//
// Usage: node scripts/extract-integration-config-facts.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadOAS(relPath) {
    return JSON.parse(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

function main() {
    const ticketing = loadOAS('sources/ticketing-oas.json');
    const schemas = ticketing.components?.schemas ?? {};
    const params = ticketing.components?.parameters ?? {};

    // 1. universalPK: sample a handful of well-known top-level resource
    //    schemas and check their `id` property type + readOnly flag. Some
    //    schemas (e.g. UserObject) are `anyOf` compositions rather than a
    //    flat `properties` map, so resolve one level of anyOf/allOf $ref
    //    before reading `id`.
    function resolveIdProp(name) {
        const schema = schemas[name];
        if (!schema) return null;
        if (schema.properties?.id) return schema.properties.id;
        const composed = schema.anyOf ?? schema.allOf ?? [];
        for (const branch of composed) {
            const ref = branch.$ref;
            if (ref) {
                const refName = ref.split('/').pop();
                const idProp = schemas[refName]?.properties?.id;
                if (idProp) return idProp;
            }
        }
        return null;
    }
    const pkSamples = ['TicketObject', 'UserObject', 'OrganizationObject', 'GroupObject'];
    const universalPK = pkSamples.map((name) => {
        const idProp = resolveIdProp(name);
        return { schema: name, idType: idProp?.type ?? null, idFormat: idProp?.format ?? null, readOnly: idProp?.readOnly ?? null };
    });
    const universalPKConsistent = universalPK.every((s) => s.idType === 'integer' && s.idFormat === 'int64');
    // Note: `readOnly` is not declared on every resource's id property (e.g.
    // OrganizationObject omits the flag even though its description says
    // "Automatically assigned when the organization is created") -- the
    // TYPE consistency (integer/int64) is the provable cross-resource
    // constant; readOnly presence varies and is reported per-sample, not
    // asserted as a vendor-wide guarantee.

    // 2. Cursor pagination request-param shape.
    const cursorParam = params.CursorPaginationPage;
    const dualParam = params.DualPaginationPage;
    const cursorMeta = schemas.CursorPaginationMeta;
    const offsetObj = schemas.OffsetPaginationObject;

    // 3. Incremental export shapes.
    const incrementalUnixTime = params.OptionalIncrementalUnixTime;
    const incrementalCursorParam = params.IncrementalCursor;
    const cursorExportResponse = schemas.CursorBasedExportIncrementalTicketsResponse;
    const timeExportResponse = schemas.TimeBasedExportIncrementalTicketsResponse;

    // 4. Error shapes.
    const errorSchema = schemas.Error;
    const errorsSchema = schemas.Errors;

    // 5. Bulk "_many" endpoint census.
    const manyPaths = Object.keys(ticketing.paths ?? {}).filter((p) => /_many$/.test(p));

    // 6. Ticket field `removable` custom-field marker.
    const ticketFieldRemovable = schemas.TicketFieldObject?.properties?.removable ?? null;

    // 7. Ticket safe_update / updated_stamp concurrency fields.
    const safeUpdate = schemas.TicketUpdateRequest ?? null;

    const output = {
        universalPK: { samples: universalPK, consistent: universalPKConsistent },
        pagination: {
            cursorParamName: cursorParam?.name ?? null,
            cursorParamStyle: cursorParam?.style ?? null,
            cursorProperties: cursorParam?.schema?.properties ? Object.keys(cursorParam.schema.properties) : [],
            dualParamOneOfCount: dualParam?.schema?.oneOf?.length ?? null,
            cursorMetaLinksProps: cursorMeta?.properties?.links?.properties ? Object.keys(cursorMeta.properties.links.properties) : [],
            cursorMetaMetaProps: cursorMeta?.properties?.meta?.properties ? Object.keys(cursorMeta.properties.meta.properties) : [],
            offsetObjectProps: offsetObj?.properties ? Object.keys(offsetObj.properties) : [],
        },
        incrementalExport: {
            seedParamName: incrementalUnixTime?.name ?? null,
            seedParamDescription: incrementalUnixTime?.description ?? null,
            continuationParamName: incrementalCursorParam?.name ?? null,
            cursorResponseProps: cursorExportResponse?.properties ? Object.keys(cursorExportResponse.properties) : [],
            timeResponseProps: timeExportResponse?.properties ? Object.keys(timeExportResponse.properties) : [],
        },
        errorShapes: {
            errorRequiredFields: errorSchema?.required ?? [],
            errorsWrapperProps: errorsSchema?.properties ? Object.keys(errorsSchema.properties) : [],
        },
        bulkOperations: {
            manyEndpointCount: manyPaths.length,
            sampleManyEndpoints: manyPaths.slice(0, 10),
        },
        customFieldMarker: {
            ticketFieldRemovableDescription: ticketFieldRemovable?.description ?? null,
        },
    };

    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main();
