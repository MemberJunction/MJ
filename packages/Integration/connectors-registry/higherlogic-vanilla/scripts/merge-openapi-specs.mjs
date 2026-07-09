#!/usr/bin/env node
// merge-specs.mjs — union two live/embedded Vanilla API v2 OpenAPI v3 specs captured from two
// different public Vanilla-hosted communities (open.vanillaforums.com's live unauthenticated
// endpoint, and success.vanillaforums.com's KB-embedded snapshot). Different communities have
// different addons enabled (Knowledge Base/Articles, AI settings, analytics dashboards are only
// on the success KB instance; appeals/authenticator-types/data-sources/discussions-poll are only
// on the open instance) — the UNION is the fuller in-scope universe, per the no-artificial-ceiling
// rule. Where both specs define the same path or schema name, prefer the richer (more properties /
// more responses) definition rather than blindly picking one file.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , pathA, pathB, outPath] = process.argv;
const specA = JSON.parse(readFileSync(pathA, 'utf8')); // open.vanillaforums.com (live fetch)
const specB = JSON.parse(readFileSync(pathB, 'utf8')); // success.vanillaforums.com (KB-embedded)

function richerSchema(a, b) {
    const ac = a && a.properties ? Object.keys(a.properties).length : (a?.allOf ? a.allOf.length : 0);
    const bc = b && b.properties ? Object.keys(b.properties).length : (b?.allOf ? b.allOf.length : 0);
    return bc > ac ? b : a;
}
function richerPathItem(a, b) {
    const ac = Object.keys(a || {}).length;
    const bc = Object.keys(b || {}).length;
    return bc > ac ? { ...a, ...b } : { ...b, ...a }; // union methods, prefer richer's method defs on conflict
}

const mergedPaths = { ...specA.paths };
for (const [p, item] of Object.entries(specB.paths)) {
    mergedPaths[p] = mergedPaths[p] ? richerPathItem(mergedPaths[p], item) : item;
}

const schemasA = specA.components?.schemas ?? {};
const schemasB = specB.components?.schemas ?? {};
const mergedSchemas = { ...schemasA };
for (const [name, schema] of Object.entries(schemasB)) {
    mergedSchemas[name] = mergedSchemas[name] ? richerSchema(mergedSchemas[name], schema) : schema;
}

const merged = {
    openapi: specA.openapi,
    info: { ...specA.info, title: 'Vanilla API (merged: open.vanillaforums.com U success.vanillaforums.com)' },
    servers: [...(specA.servers ?? []), ...(specB.servers ?? [])],
    paths: mergedPaths,
    components: { ...specA.components, schemas: mergedSchemas },
};

writeFileSync(outPath, JSON.stringify(merged, null, 2), 'utf8');
console.log(JSON.stringify({
    specA_paths: Object.keys(specA.paths).length,
    specA_schemas: Object.keys(schemasA).length,
    specB_paths: Object.keys(specB.paths).length,
    specB_schemas: Object.keys(schemasB).length,
    merged_paths: Object.keys(mergedPaths).length,
    merged_schemas: Object.keys(mergedSchemas).length,
}, null, 2));
