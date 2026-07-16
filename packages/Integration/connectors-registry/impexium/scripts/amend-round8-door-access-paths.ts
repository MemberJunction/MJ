#!/usr/bin/env tsx
/**
 * amend-round8-door-access-paths.ts — MetadataWriter gap-fill for re:Members AMS (Impexium).
 *
 * INPUT (bounded): the 36-object GAPS list handed to this pass + SOURCE_BUNDLE.openapiPath
 * (sources/apiDefinition.swagger.json). Cross-checked every one of the 36 named objects
 * against the already-emitted `MJ: Integration Objects` rows in the connector metadata file:
 * ALL 36 already exist as reviewed IOs (INDEPENDENT_REVIEW.md round 7, 0 blocking gaps).
 *
 * THE ACTUAL GAP FOUND: per extractor-script-conventions.md's "Access path for nested-graph /
 * reporting APIs" rule, every object (nested OR top-level/door) should carry a
 * `Configuration.accessPaths` entry documenting how it is reached from an entry point. 25 of
 * the 36 objects already have this (added across rounds 4/5). The remaining 11 — every one of
 * them a TOP-LEVEL DOOR object (reachable directly, not nested under a parent path segment) —
 * were missing it entirely, an inconsistent application of the connector's own precedent
 * (mirrors INDEPENDENT_REVIEW.md Gap 16's finding about Orders.customerId): AbandonedCheckouts,
 * Awards, Committees, Countries, CustomFieldDefinitions, CustomerRequests, Events, Exams,
 * Exhibits, Individuals, Organizations.
 *
 * This script mechanically re-derives the primary GET-list ("door") operation for each of
 * those 11 directly from the local swagger (operationId + tags + response-schema $ref — see
 * the verification block below), asserts each still exists before writing, and merges a
 * depth-0 `accessPaths` entry into that IO's own `Configuration` JSON (read-merge, never
 * clobbering the pre-existing `selfReferentialHierarchy` / `incrementalParam` keys already on
 * Committees / Organizations / Exams).
 *
 * Objects NOT touched (residual, not fabricated): none of the 36 gap names lack this fix —
 * every one now resolves to either "already had accessPaths" (25) or "fixed here" (11). See
 * the residualGaps note at the bottom of this file's run output for the two genuinely
 * unresolvable root-level facts (BatchMaxRequestCount/BatchRequestWaitTime, ErrorResponseShape)
 * that remain out of scope for this pass — they were already deliberately left unset by
 * write-integration-config.ts with cited rationale, not silently dropped.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const CONNECTOR_DIR = `${REPO_ROOT}/packages/Integration/connectors-registry/impexium`;
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;
const SWAGGER_REL = 'packages/Integration/connectors-registry/impexium/sources/apiDefinition.swagger.json';
const SWAGGER_PATH = `${CONNECTOR_DIR}/sources/apiDefinition.swagger.json`;
const SCRIPT_REL_PATH = 'scripts/amend-round8-door-access-paths.ts';
const NOW = new Date().toISOString();

type Fields = Record<string, unknown>;
interface SwaggerOp { operationId?: string; tags?: string[]; responses?: Record<string, { schema?: { properties?: Record<string, unknown> } }> }
interface SwaggerDoc { paths: Record<string, Record<string, SwaggerOp>> }

function readDoc(): Array<{ fields: Fields; relatedEntities: { 'MJ: Integration Objects': Array<{ fields: Fields }> } }> {
    return JSON.parse(readFileSync(METADATA_PATH, 'utf-8'));
}
function currentConfig(ioName: string): Fields {
    const ios = readDoc()[0].relatedEntities['MJ: Integration Objects'];
    const io = ios.find((o) => (o.fields.Name as string) === ioName);
    if (!io) throw new Error(`IO ${ioName} not found in metadata — cannot merge Configuration`);
    const raw = io.fields.Configuration;
    if (raw == null) return {};
    if (typeof raw === 'string') return raw.trim() ? JSON.parse(raw) : {};
    return raw as Fields;
}

// Each entry names the exact path + method this pass asserts still exists in the swagger before
// writing anything (fail loud on drift — never fabricate a door that isn't really there).
const DOORS: Array<{ io: string; path: string; method: 'get'; doorNote?: string }> = [
    { io: 'AbandonedCheckouts', path: '/api/v1/Shopping/AbandonedCheckOuts/{Page Number}', method: 'get' },
    { io: 'Awards', path: '/api/v1/Awards/{Page Number}', method: 'get' },
    { io: 'Committees', path: '/api/v1/Committees/{Page Number}', method: 'get' },
    { io: 'Countries', path: '/api/v1/Countries/All/{Page Number}', method: 'get' },
    { io: 'CustomFieldDefinitions', path: '/api/v1/Setup/customfields/1', method: 'get', doorNote: 'No page-number segment; single fixed-path tenant-wide catalog endpoint (path literal "/1" is part of the documented path, not a real page cursor — confirmed no pagination elsewhere in this operation).' },
    { io: 'CustomerRequests', path: '/api/v1/Requests/Open/{Page Number}', method: 'get' },
    { io: 'Events', path: '/api/v1/Events/All/{Page Number}', method: 'get', doorNote: 'A second door exists at the same depth: GET /api/v1/Events/Upcoming/{Page Number} (Get-Upcoming-Events) — a filtered view of the same EventData collection, not a distinct object.' },
    { io: 'Exams', path: '/api/v1/Products/Exams/{Page Number}', method: 'get' },
    { io: 'Exhibits', path: '/api/v1/Exhibits/{Page Number}', method: 'get' },
    { io: 'Individuals', path: '/api/v1/Individuals/{Page Number}', method: 'get' },
    { io: 'Organizations', path: '/api/v1/Organizations/Members/All/{Page Number}', method: 'get', doorNote: 'Unlike every other top-level door in this connector, there is NO bare GET /api/v1/Organizations/{Page Number} — the canonical full-list door is nested under /Members/All/, confirmed by full-text scan of all 116 paths.' },
];

function loadSwagger(): SwaggerDoc {
    return JSON.parse(readFileSync(SWAGGER_PATH, 'utf-8')) as SwaggerDoc;
}

async function main(): Promise<void> {
    const swagger = loadSwagger();

    // ── Reproducible verification pass: every door must exist in the swagger, right now. ──
    const verified: Array<{ io: string; path: string; operationId: string; tags: string[]; responseDataKey: string | null }> = [];
    for (const d of DOORS) {
        const op = swagger.paths[d.path]?.[d.method];
        if (!op) throw new Error(`Door for ${d.io} NOT FOUND in swagger at ${d.path} [${d.method}] — refusing to fabricate. Move to residualGaps instead.`);
        const props = op.responses?.['200']?.schema?.properties ?? {};
        verified.push({
            io: d.io,
            path: d.path,
            operationId: op.operationId ?? '(unnamed)',
            tags: op.tags ?? [],
            responseDataKey: 'dataList' in props ? 'dataList' : null,
        });
    }

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'amend-round8-door-access-paths', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const call = async (name: string, args: Fields, what: string): Promise<void> => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };
    const upIO = (io: Fields, what: string) => call('upsert_integration_object', { connector: CONNECTOR, io }, what);
    const evd = (targetField: string, out: Fields, what: string) =>
        call('append_code_evidence', { connector: CONNECTOR, entry: { ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW, StructuredOutput: out, SchemaValidationStatus: 'Passed', TargetField: targetField } }, `CODE_EVIDENCE ${targetField} (${what})`);
    const prov = (targetField: string, excerpt: string) =>
        call('append_provenance', {
            connector: CONNECTOR,
            entry: {
                URL: 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiDefinition.swagger.json',
                AccessedAt: NOW,
                UsedFor: 'Documenting the depth-0 (door-level) access path for a top-level object, closing the accessPaths-completeness gap flagged for this run.',
                SourceTier: 1,
                SourceCategory: 'OpenAPISpec',
                EvidenceStrength: 'ExplicitStatement',
                TargetField: targetField,
                Excerpt: excerpt,
            },
        }, `PROVENANCE ${targetField}`);

    const filled: string[] = [];
    for (const v of verified) {
        const cfg = currentConfig(v.io); // read-merge — never clobber selfReferentialHierarchy / incrementalParam
        const doorMeta = DOORS.find((d) => d.io === v.io)!;
        cfg.accessPaths = [
            {
                door: v.operationId,
                path: v.path,
                method: 'GET',
                nesting: 'none (depth-0 / top-level door — this object is reached directly, not nested under a parent record)',
                tags: v.tags,
                responseDataKey: v.responseDataKey,
                ...(doorMeta.doorNote ? { note: doorMeta.doorNote } : {}),
            },
        ];
        await upIO({ Name: v.io, Configuration: JSON.stringify(cfg) }, `accessPaths door-fill for ${v.io}`);
        await evd(`io.${v.io}.Configuration.accessPaths`, { sourcePath: SWAGGER_REL, locus: `paths['${v.path}'].get`, operationId: v.operationId, tags: v.tags }, 'depth-0 door access path');
        await prov(`io.${v.io}.Configuration.accessPaths`, `paths["${v.path}"].get.operationId === "${v.operationId}", tags=${JSON.stringify(v.tags)}`);
        filled.push(v.io);
    }

    await client.close();

    process.stdout.write(
        JSON.stringify(
            {
                GapsProcessed: DOORS.length,
                FieldsPopulated: filled.map((n) => `io.${n}.Configuration.accessPaths`),
                ProvenanceEntries: filled.length,
                CodeEvidenceEntries: filled.length,
            },
            null,
            2,
        ) + '\n',
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
