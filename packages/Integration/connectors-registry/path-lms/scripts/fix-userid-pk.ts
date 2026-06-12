#!/usr/bin/env tsx
// scripts/fix-userid-pk.ts
//
// TARGETED AMENDMENT (deterministic, global): the `*Id`-as-PrimaryKey bug.
//
// For EVERY Integration Object where a non-`id` field whose name ends in "Id"
// (case-insensitive, e.g. userId / orderId / courseId) is marked
// IsPrimaryKey=true AND the object ALSO has a field literally named `id`
// (case-insensitive), the PK is WRONG: row identity is `id`, and the `*Id`
// field is a foreign-key reference (non-unique per row).
//
// Correction, applied via the mj-metadata MCP (surgical per-IOF merge — atomic
// write + automatic .backups/):
//   - set the `id` field IsPrimaryKey=true
//   - set each offending `*Id` field IsPrimaryKey=false (DO NOT touch its
//     IsForeignKey / RelatedIntegrationObjectID — it stays a foreign key)
//
// Genuinely-correct PKs are left alone: an `id` already-PK stays PK; a
// composite / no-`id` table is untouched.
//
// The MCP's upsert_integration_object_field merges by iof.Name (case-insensitive)
// within the named IO, so we pass only {Name, Type, IsPrimaryKey} and every
// other slot on the field is preserved verbatim.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONNECTOR = 'path-lms';

// Walk up from this script's directory until we find the repo root (the dir
// that contains packages/MCP/mj-metadata/dist/server.js). Robust to depth.
function findRepoRoot(start: string): string {
    let dir = start;
    for (let i = 0; i < 12; i++) {
        if (existsSync(resolve(dir, 'packages/MCP/mj-metadata/dist/server.js'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error('Could not locate repo root (packages/MCP/mj-metadata/dist/server.js not found above script).');
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(SCRIPT_DIR);
const MCP_SERVER = resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/server.js');

interface FieldRec { fields: Record<string, unknown> & { Name: string }; }
interface IORec {
    fields: Record<string, unknown> & { Name: string };
    relatedEntities?: { 'MJ: Integration Object Fields'?: FieldRec[] };
}
interface IntegrationFile {
    fields: Record<string, unknown>;
    relatedEntities?: { 'MJ: Integration Objects'?: IORec[] };
}

function endsWithIdNonId(name: string): boolean {
    const lower = name.toLowerCase();
    return lower !== 'id' && lower.endsWith('id');
}

async function connectMCP(): Promise<Client> {
    const transport = new StdioClientTransport({
        command: 'node',
        args: [MCP_SERVER],
        env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: resolve(REPO_ROOT, 'packages/Integration/connectors-registry'),
            MJ_METADATA_ROOT: resolve(REPO_ROOT, 'metadata/integrations'),
        },
    });
    const client = new Client({ name: 'fix-userid-pk', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    return client;
}

function readToolText(res: { content?: Array<{ type: string; text?: string }>; isError?: boolean }): string {
    const t = res.content?.map((c) => c.text ?? '').join('') ?? '';
    if (res.isError) throw new Error(`MCP tool error: ${t}`);
    return t;
}

async function readIntegration(client: Client): Promise<IntegrationFile> {
    const res = await client.callTool({ name: 'read_integration', arguments: { connector: CONNECTOR } });
    const text = readToolText(res as { content?: Array<{ type: string; text?: string }>; isError?: boolean });
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('read_integration returned null/non-object');
    return parsed as IntegrationFile;
}

async function setIOFPrimaryKey(client: Client, ioName: string, field: FieldRec, value: boolean): Promise<void> {
    const Type = typeof field.fields.Type === 'string' ? (field.fields.Type as string) : 'String';
    const res = await client.callTool({
        name: 'upsert_integration_object_field',
        arguments: {
            connector: CONNECTOR,
            ioName,
            iof: { Name: field.fields.Name, Type, IsPrimaryKey: value },
        },
    });
    readToolText(res as { content?: Array<{ type: string; text?: string }>; isError?: boolean });
}

async function main(): Promise<void> {
    const client = await connectMCP();
    const file = await readIntegration(client);
    const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];

    const stats = {
        totalIOs: ios.length,
        iosCorrected: 0,
        idSetToPK: 0,
        starIdClearedFromPK: 0,
        correctedIONames: [] as string[],
        starIdFieldsCleared: [] as Array<{ io: string; field: string }>,
        // Diagnostic: IOs with a *Id-as-PK but NO `id` field — outside this
        // amendment's literal scope. Surfaced for a decision, NOT mutated.
        noIdStarIdPK: [] as Array<{ io: string; pkFields: string[] }>,
    };

    for (const io of ios) {
        const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const idField = fields.find((f) => f.fields.Name.toLowerCase() === 'id');

        const offendingStarIds = fields.filter(
            (f) => endsWithIdNonId(f.fields.Name) && f.fields.IsPrimaryKey === true,
        );

        if (!idField) {
            if (offendingStarIds.length > 0) {
                stats.noIdStarIdPK.push({ io: io.fields.Name, pkFields: offendingStarIds.map((f) => f.fields.Name) });
            }
            continue; // no-`id` / composite table — outside literal amendment scope
        }

        if (offendingStarIds.length === 0) continue; // no bug on this IO

        if (idField.fields.IsPrimaryKey !== true) {
            await setIOFPrimaryKey(client, io.fields.Name, idField, true);
            idField.fields.IsPrimaryKey = true;
            stats.idSetToPK++;
        }

        for (const f of offendingStarIds) {
            await setIOFPrimaryKey(client, io.fields.Name, f, false);
            f.fields.IsPrimaryKey = false;
            stats.starIdClearedFromPK++;
            stats.starIdFieldsCleared.push({ io: io.fields.Name, field: f.fields.Name });
        }

        stats.iosCorrected++;
        stats.correctedIONames.push(io.fields.Name);
    }

    // ── Post-correction verification (fresh re-read) ─────────────────────────
    const after = await readIntegration(client);
    const afterIOs = after.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const verify = {
        totalIOsAfter: afterIOs.length,
        iosWithIdField: 0,
        iosWithIdAsSolePK: 0,
        violations: [] as string[],
    };
    for (const io of afterIOs) {
        const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const idField = fields.find((f) => f.fields.Name.toLowerCase() === 'id');
        if (!idField) continue;
        verify.iosWithIdField++;

        const idIsPK = idField.fields.IsPrimaryKey === true;
        const otherPKs = fields.filter((f) => f.fields.Name.toLowerCase() !== 'id' && f.fields.IsPrimaryKey === true);
        const starIdStillPK = otherPKs.filter((f) => endsWithIdNonId(f.fields.Name));

        if (idIsPK && otherPKs.length === 0) {
            verify.iosWithIdAsSolePK++;
        } else {
            if (!idIsPK) verify.violations.push(`${io.fields.Name}: id NOT marked PK`);
            if (starIdStillPK.length > 0)
                verify.violations.push(`${io.fields.Name}: *Id still PK -> ${starIdStillPK.map((f) => f.fields.Name).join(', ')}`);
            else if (otherPKs.length > 0)
                verify.violations.push(`${io.fields.Name}: non-id PK present (non-*Id) -> ${otherPKs.map((f) => f.fields.Name).join(', ')}`);
        }
    }

    await client.close();

    process.stdout.write(JSON.stringify({ stats, verify }, null, 2) + '\n');

    if (verify.totalIOsAfter !== 84) {
        process.stderr.write(`FATAL: expected 84 IOs, found ${verify.totalIOsAfter}\n`);
        process.exit(2);
    }
    const hardViolations = verify.violations.filter(
        (v) => v.includes('*Id still PK') || v.includes('id NOT marked PK'),
    );
    if (hardViolations.length > 0) {
        process.stderr.write(`FATAL: ${hardViolations.length} hard PK violation(s) remain:\n${hardViolations.join('\n')}\n`);
        process.exit(3);
    }
}

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
