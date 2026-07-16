#!/usr/bin/env node
// enumerate-zendesk-catalog.mjs
//
// Zendesk-specific record-type enumerator. The shared floor enumerator
// (enumerate-catalog.mjs) counts every `components.schemas` entry (622-625
// across the two OAS files) — that is the mechanical anchor
// (EnumerationStdoutCount), but for a REST/OpenAPI vendor the raw schema list
// over-counts: it includes per-operation request-body variants
// (TicketCreateRequest), response envelopes (TicketResponse),
// pagination/cursor/meta objects, and error shapes that are NOT independent
// syncable tables — they are shapes OF a single resource.
//
// This script derives the REST "resource" grain instead: it walks every GET
// list endpoint (`paths`), finds the top-level array property in its 200
// response (the ResponseDataKey), and treats the array's item schema as the
// coverable record type ("leaf"). When multiple paths share the same
// ResponseDataKey (a canonical collection root PLUS one or more nested/
// incremental/autocomplete variants of the same object), the CANONICAL
// (shortest, non-incremental, non-autocomplete, non-templated) path is kept
// as the primary APIPath and every other path is recorded as an
// "alsoAccessibleVia" access-path variant — this is what feeds the
// access-path / nesting documentation, not a second leaf.
//
// Every schema NOT reached this way is accounted for in a ledger bucket
// (request-wrapper / response-wrapper / param-object / error-shape) so
// |schemas| == |leaves-as-item-types| + |ledger buckets| (with a residual
// bucket for schemas that are neither — named record shapes with no list
// endpoint, e.g. single-record GET-only resources) — full accounting, no
// silent drop.
//
// Usage: node enumerate-zendesk-catalog.mjs <oas.json> [<oas.json> ...]

import { readFileSync } from 'node:fs';

function resolveRef(doc, ref) {
    if (!ref || !ref.startsWith('#/')) return null;
    const parts = ref.slice(2).split('/');
    let cur = doc;
    for (const p of parts) {
        cur = cur?.[p];
        if (cur === undefined) return null;
    }
    return cur;
}

function schemaName(ref) {
    if (!ref) return null;
    const m = ref.match(/\/([^/]+)$/);
    return m ? m[1] : null;
}

function findArrayProperty(doc, schema, depth = 0) {
    if (!schema || depth > 3) return null;
    if (schema.$ref) return findArrayProperty(doc, resolveRef(doc, schema.$ref), depth + 1);
    if (schema.allOf) {
        for (const s of schema.allOf) {
            const r = findArrayProperty(doc, s, depth + 1);
            if (r) return r;
        }
    }
    if (schema.type === 'array') return { key: null, itemSchema: schema.items };
    if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            let resolved = propSchema;
            if (resolved.$ref) resolved = resolveRef(doc, resolved.$ref) ?? resolved;
            if (resolved.type === 'array') return { key, itemSchema: resolved.items };
        }
    }
    return null;
}

function itemSchemaTypeName(doc, itemSchema) {
    if (!itemSchema) return null;
    if (itemSchema.$ref) return schemaName(itemSchema.$ref);
    return null;
}

function segments(path) {
    return path.split('/').filter(Boolean);
}
function isTemplateVar(seg) {
    return /^\{.*\}$/.test(seg);
}

// Lower score = more canonical. Penalize incremental/autocomplete/search
// prefixes, nesting depth, and template-var count.
function pathScore(meaningfulSegs) {
    let score = meaningfulSegs.length;
    for (const s of meaningfulSegs) {
        if (isTemplateVar(s)) score += 3;
        if (['incremental', 'autocomplete', 'search', 'count_many'].includes(s)) score += 10;
    }
    return score;
}

function enumerate(files) {
    const allSchemaNames = new Set();
    const consumedSchemaNames = new Set();
    const leaves = new Map(); // objectName -> best record
    const variantsByObject = new Map(); // objectName -> [{path, tags}]

    for (const file of files) {
        const doc = JSON.parse(readFileSync(file, 'utf8'));
        for (const name of Object.keys(doc.components?.schemas ?? {})) allSchemaNames.add(name);

        for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
            const get = pathItem.get;
            if (!get) continue;
            const ok200 = get.responses?.['200'] ?? get.responses?.['200 OK'];
            const content = ok200?.content?.['application/json'];
            const schema = content?.schema;
            if (!schema) continue;
            const found = findArrayProperty(doc, schema);
            if (!found) continue;

            const segs = segments(pathTemplate);
            const meaningful = segs.filter((s) => !['api', 'v2'].includes(s));
            let objectName = found.key;
            if (!objectName) {
                const lastReal = [...meaningful].reverse().find((s) => !isTemplateVar(s));
                objectName = lastReal ?? meaningful[meaningful.length - 1];
            }
            if (!objectName) continue;

            const templateVarIdx = meaningful.findIndex((s) => isTemplateVar(s));
            let parentObjectName = null;
            let parentIdField = null;
            let hierarchyPath = null;
            if (templateVarIdx > 0) {
                parentObjectName = meaningful[templateVarIdx - 1];
                parentIdField = meaningful[templateVarIdx].replace(/[{}]/g, '');
                hierarchyPath = meaningful.join('/');
            }

            const itemTypeName = itemSchemaTypeName(doc, found.itemSchema);
            if (itemTypeName) consumedSchemaNames.add(itemTypeName);

            const score = pathScore(meaningful);
            if (!variantsByObject.has(objectName)) variantsByObject.set(objectName, []);
            variantsByObject.get(objectName).push({ path: pathTemplate, tags: get.tags ?? [], score });

            const existing = leaves.get(objectName);
            if (!existing || score < existing.score) {
                leaves.set(objectName, {
                    objectName,
                    listPath: pathTemplate,
                    responseDataKey: found.key,
                    itemSchemaName: itemTypeName,
                    tags: get.tags ?? [],
                    sourceFile: file,
                    parentObjectName,
                    parentIdField,
                    hierarchyPath,
                    operationId: get.operationId,
                    score,
                });
            }
        }
    }

    const ledger = { requestWrapper: [], responseWrapper: [], paramOrErrorOrMisc: [] };
    for (const name of allSchemaNames) {
        if (consumedSchemaNames.has(name)) continue;
        if (leaves.has(name)) continue;
        if (/Request$/i.test(name) || /CreateMany|UpdateMany|BulkCreate|BulkUpdate/i.test(name)) {
            ledger.requestWrapper.push(name);
        } else if (/Response$/i.test(name) || /Envelope$/i.test(name)) {
            ledger.responseWrapper.push(name);
        } else {
            ledger.paramOrErrorOrMisc.push(name);
        }
    }

    const fullLeaves = [...leaves.values()]
        .sort((a, b) => a.objectName.localeCompare(b.objectName))
        .map((l) => ({ ...l, variants: (variantsByObject.get(l.objectName) ?? []).map((v) => v.path) }));

    return {
        leaves: fullLeaves,
        totalSchemas: allSchemaNames.size,
        consumedAsLeafItemType: consumedSchemaNames.size,
        ledgerCounts: {
            requestWrapper: ledger.requestWrapper.length,
            responseWrapper: ledger.responseWrapper.length,
            paramOrErrorOrMisc: ledger.paramOrErrorOrMisc.length,
        },
        ledger,
    };
}

const files = process.argv.slice(2);
if (files.length === 0) {
    process.stderr.write('usage: node enumerate-zendesk-catalog.mjs <oas.json> [<oas.json> ...]\n');
    process.exit(2);
}
const result = enumerate(files);
process.stdout.write(JSON.stringify({
    leafCount: result.leaves.length,
    leaves: result.leaves.map((l) => l.objectName),
    fullLeaves: result.leaves,
    totalSchemas: result.totalSchemas,
    consumedAsLeafItemType: result.consumedAsLeafItemType,
    ledgerCounts: result.ledgerCounts,
    ledger: result.ledger,
}, null, 2) + '\n');
