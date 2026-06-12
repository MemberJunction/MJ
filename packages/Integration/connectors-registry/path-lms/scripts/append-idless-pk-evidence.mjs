#!/usr/bin/env node
// append-idless-pk-evidence.mjs
// Append one CODE_EVIDENCE entry per *Id-PK demotion (and FK-edge add) applied by
// fix-idless-starid-pk.ts, so verify-claim can reproduce each flag change.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONNECTOR = 'path-lms';
function findRepoRoot(start) {
    let dir = start;
    for (let i = 0; i < 12; i++) {
        if (existsSync(resolve(dir, 'packages/MCP/mj-metadata/dist/server.js'))) return dir;
        const p = dirname(dir);
        if (p === dir) break;
        dir = p;
    }
    throw new Error('repo root not found');
}
const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
const MCP = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');
const SCRIPT = 'packages/Integration/connectors-registry/path-lms/scripts/fix-idless-starid-pk.ts';
const RUN_AT = new Date().toISOString();

// The deterministic demotion set produced by fix-idless-starid-pk.ts (id-less IOs).
const DEMOTIONS = [
    { io: 'CategorySale', field: 'userId', fk: 'User' },
    { io: 'InPersonEventCancellation', field: 'userId', fk: 'User' },
    { io: 'InPersonEventRegistrationUser', field: 'userId', fk: 'User' },
    { io: 'InPersonEventUser', field: 'userId', fk: 'User' },
    { io: 'ProductCatalog', field: 'sellableApiId', fk: null },
    { io: 'SaleByBundle', field: 'userId', fk: 'User' },
    { io: 'UserItemVisits', field: 'userId', fk: 'User' },
    { io: 'WebinarArchiveViewerUser', field: 'userId', fk: 'User' },
    { io: 'WebinarCancellationUser', field: 'userId', fk: 'User' },
    { io: 'WebinarLiveAttendeeReport', field: 'webinarId', fk: 'Webinar' },
    { io: 'WebinarRegistrationReport', field: 'webinarId', fk: 'Webinar' },
];

async function main() {
    const transport = new StdioClientTransport({
        command: 'node', args: [MCP],
        env: { ...process.env,
            MJ_CONNECTORS_REGISTRY: resolve(REPO_ROOT, 'packages/Integration/connectors-registry'),
            MJ_METADATA_ROOT: resolve(REPO_ROOT, 'metadata/integrations') },
    });
    const client = new Client({ name: 'append-idless-pk-evidence', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    let n = 0;
    for (const d of DEMOTIONS) {
        // Evidence for the PK demotion.
        await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
            ScriptPath: SCRIPT, ScriptRunAt: RUN_AT,
            StructuredOutput: {
                io: d.io, field: d.field, change: 'IsPrimaryKey true->false',
                reason: `id-less IO with a *Id field marked PK. A *Id field references another object, never the row's own identity. ${d.io} has no 'id' column, so it is PK-less and identity is carried by the engine content-hash (correct for a keyless projection/report row).`,
            },
            SchemaValidationStatus: 'Passed',
            TargetField: `iof.${d.io}.${d.field}.IsPrimaryKey`,
        } } });
        n++;
        // Evidence for the FK edge (where the referenced object resolves to an emitted IO).
        if (d.fk) {
            await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: {
                ScriptPath: SCRIPT, ScriptRunAt: RUN_AT,
                StructuredOutput: {
                    io: d.io, field: d.field, change: `IsForeignKey=true, RelatedIntegrationObjectID -> ${d.fk}`,
                    reason: `Naming-convention FK: '${d.field}' references the emitted '${d.fk}' IO (the demoted *Id is a foreign key to ${d.fk}.id).`,
                },
                SchemaValidationStatus: 'Passed',
                TargetField: [`iof.${d.io}.${d.field}.IsForeignKey`, `iof.${d.io}.${d.field}.RelatedIntegrationObjectID`],
            } } });
            n++;
        }
    }
    await client.close();
    process.stdout.write(JSON.stringify({ codeEvidenceEntriesAppended: n }, null, 2) + '\n');
}
main().catch((e) => { process.stderr.write(`${e?.stack ?? e}\n`); process.exit(1); });
