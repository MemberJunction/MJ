#!/usr/bin/env node
// scripts/fix-t7-writeonly-apipath.mjs
//
// T7 OpenAPIValidation fix for the 14 write-only sub-resource IOs.
// T7 (t7OpenApi.ts:354) treats any non-null `APIPath` as a GET/list route
// (`if (f.APIPath) out.push({..., Method:'GET'})`). These 14 IOs carried their
// POST/PUT create path in APIPath (redundant with CreateAPIPath/UpdateAPIPath),
// but the swagger exposes NO GET for those paths -> T7 RED.
//
// Honest write-only-IO model: APIPath IS the READ/LIST (GET) path by definition.
// A write-only IO must NOT carry it; its writes live in the per-operation write
// columns (already correctly set). So for each of these 14:
//   - remove APIPath  (delete_integration_object_key; the schema won't accept null)
//   - SupportsRead=false (upsert; explicit write-only marker)
// Write columns + SupportsWrite are left UNCHANGED.
//
// Idempotent. Re-derives the swagger method-set per IO (reproducible evidence).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
const CONNECTOR = 'impexium';
const SWAGGER = resolve(HERE, '..', 'sources', 'apiDefinition.swagger.json');
const SERVER = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');

const TARGETS = [
    'AwardNominations', 'ExamScores', 'EducationCredits', 'Tasks', 'Activities',
    'Notes', 'Categories', 'Links', 'Addresses', 'Emails', 'Phones',
    'Notifications', 'SessionRegistrations', 'EventAttendance',
];

const skel = (p) => p.replace(/\{[^}]*\}/g, '{}').toLowerCase().replace(/\/+$/, '');

function buildSwaggerMethodMap() {
    const sw = JSON.parse(readFileSync(SWAGGER, 'utf8'));
    const m = new Map();
    for (const [p, ops] of Object.entries(sw.paths ?? {})) {
        const methods = Object.keys(ops)
            .filter((k) => ['get', 'post', 'put', 'delete', 'patch'].includes(k.toLowerCase()))
            .map((k) => k.toUpperCase());
        const s = skel(p);
        if (!m.has(s)) m.set(s, new Set());
        methods.forEach((x) => m.get(s).add(x));
    }
    return m;
}

async function main() {
    // Load the current metadata IO set (to read each IO's current APIPath + write columns).
    const metaPath = resolve(REPO_ROOT, 'metadata/integrations/impexium/.impexium.integration.json');
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const ios = meta[0].relatedEntities['MJ: Integration Objects'];
    const byName = new Map(ios.map((io) => [io.fields.Name, io.fields]));

    const swMap = buildSwaggerMethodMap();

    // Pre-flight verification: prove each target APIPath is POST/PUT/DELETE-only (no GET).
    const verified = [];
    for (const name of TARGETS) {
        const f = byName.get(name);
        if (!f) throw new Error(`Target IO not found in metadata: ${name}`);
        const ap = f.APIPath;
        if (!ap) { verified.push({ name, alreadyFixed: true }); continue; }
        const methods = swMap.get(skel(ap));
        if (!methods) throw new Error(`${name}: APIPath ${ap} not found in swagger`);
        const arr = [...methods].sort();
        if (methods.has('GET')) {
            throw new Error(`${name}: APIPath ${ap} DOES support GET (${arr.join(',')}) — NOT write-only, refusing to null.`);
        }
        verified.push({
            name, apiPath: ap, swaggerMethods: arr,
            writeColumns: {
                CreateAPIPath: f.CreateAPIPath ?? null, CreateMethod: f.CreateMethod ?? null,
                UpdateAPIPath: f.UpdateAPIPath ?? null, UpdateMethod: f.UpdateMethod ?? null,
                DeleteAPIPath: f.DeleteAPIPath ?? null, DeleteMethod: f.DeleteMethod ?? null,
            },
            SupportsWrite: f.SupportsWrite === true,
        });
    }

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER], cwd: REPO_ROOT });
    const client = new Client({ name: 'fix-t7-writeonly', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const runAt = new Date().toISOString();
    const stats = { apiPathRemoved: 0, supportsReadSet: 0, evidence: 0, alreadyFixed: 0 };

    for (const v of verified) {
        if (v.alreadyFixed) { stats.alreadyFixed++; }
        // 1) Remove the bogus GET path (idempotent: no-op if already absent).
        await client.callTool({
            name: 'delete_integration_object_key',
            arguments: { connector: CONNECTOR, ioName: v.name, fieldKey: 'APIPath' },
        });
        if (!v.alreadyFixed) stats.apiPathRemoved++;

        // 2) Explicit write-only marker.
        await client.callTool({
            name: 'upsert_integration_object',
            arguments: { connector: CONNECTOR, io: { Name: v.name, SupportsRead: false } },
        });
        stats.supportsReadSet++;

        if (v.alreadyFixed) continue;

        // 3) Per-IO CODE_EVIDENCE citing the swagger method set (proves no GET path).
        await client.callTool({
            name: 'append_code_evidence',
            arguments: {
                connector: CONNECTOR,
                entry: {
                    ScriptPath: 'scripts/fix-t7-writeonly-apipath.mjs',
                    ScriptRunAt: runAt,
                    StructuredOutput: {
                        io: v.name,
                        apiPathRemoved: v.apiPath,
                        swaggerPathMethods: v.swaggerMethods,
                        getPresent: false,
                        rationale: `APIPath ${v.apiPath} supports only ${v.swaggerMethods.join('/')} in swagger — no GET/list endpoint; genuine write-only leaf. APIPath removed (write-only IO must not carry a read path); SupportsRead=false. Writes remain via ${Object.entries(v.writeColumns).filter(([, x]) => x).map(([k, x]) => `${k}=${x}`).join(', ')}.`,
                        writeColumnsUnchanged: v.writeColumns,
                        supportsWriteUnchanged: v.SupportsWrite,
                    },
                    SchemaValidationStatus: 'Passed',
                    TargetField: `io.${v.name}.APIPath`,
                },
            },
        });
        stats.evidence++;
    }

    await client.close();
    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
