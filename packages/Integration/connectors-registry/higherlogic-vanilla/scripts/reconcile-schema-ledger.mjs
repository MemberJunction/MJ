#!/usr/bin/env node
// reconcile-ledger2.mjs — v2: classify by TOP-LEVEL PATH REACHABILITY instead of name-suffix
// guessing. A schema name is "top-level-reachable" if it is ever the direct (or array-item) schema
// of a request body or 200/201/202 response across ANY path operation in the merged spec. Schemas
// that are reachable ONLY as a nested property value inside another schema (never directly returned
// by an endpoint) are property-level value types, not independent record types, regardless of shape.
import { readFileSync, writeFileSync } from 'node:fs';

const specPath = process.argv[2];
const catalogPath = process.argv[3];
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const schemas = spec.components.schemas;

function refName(ref) { return ref ? ref.split('/').pop() : null; }

// Collect every schema name that is DIRECTLY the top-level (or array `.items`) schema of some
// path operation's request body or 2xx response, across ALL doors (not just the door's own primary
// unit) — this captures e.g. AttachmentPost as top-level-reachable via POST /attachments even
// though the "Attachment" door itself wasn't picked up as a distinct coverable/informational unit.
const topLevelReachable = new Set();
function noteSchemaNode(node) {
    if (!node) return;
    if (node['$ref']) { topLevelReachable.add(refName(node['$ref'])); return; }
    if (node.type === 'array' || node.items) { noteSchemaNode(node.items); return; }
    if (node.allOf) { for (const p of node.allOf) noteSchemaNode(p); return; }
    if (node.oneOf) { for (const p of node.oneOf) noteSchemaNode(p); return; }
    if (node.type === 'object' && node.properties?.data) { noteSchemaNode(node.properties.data); return; }
}
for (const pathItem of Object.values(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const op = pathItem[method];
        if (!op) continue;
        for (const code of ['200', '201', '202']) {
            noteSchemaNode(op.responses?.[code]?.content?.['application/json']?.schema);
        }
        const reqSchema = op.requestBody?.content?.['application/json']?.schema;
        if (reqSchema) noteSchemaNode(reqSchema);
    }
}

const allSchemaNames = Object.keys(schemas).sort();
const coverableNames = new Set(catalog.coverable.map((c) => c.name));
const informationalNames = new Set(catalog.informational.map((c) => c.name));

const buckets = { coverable: [], informational: [], topLevelOtherEndpoint: [], nestedValueObject: [], unaccounted: [] };
for (const name of allSchemaNames) {
    if (coverableNames.has(name)) { buckets.coverable.push(name); continue; }
    if (informationalNames.has(name)) { buckets.informational.push(name); continue; }
    if (topLevelReachable.has(name)) { buckets.topLevelOtherEndpoint.push(name); continue; }
    buckets.nestedValueObject.push(name);
}
// Sanity: everything should land in one of the 4 real buckets; "unaccounted" should end up empty.
const sum = Object.values(buckets).reduce((a, b) => a + b.length, 0);

const out = {
    totalSchemas: allSchemaNames.length,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    sumsToTotal: sum === allSchemaNames.length,
    samples: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.slice(0, 15)])),
};
writeFileSync('ledger-output-v2.json', JSON.stringify({ ...out, buckets }, null, 2));
console.log(JSON.stringify(out, null, 2));
