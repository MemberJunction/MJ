#!/usr/bin/env tsx
// scripts/fix-idless-starid-pk.ts
//
// TARGETED AMENDMENT (deterministic, global) — the KEYLESS-type wrong-PK class.
//
// Companion to fix-userid-pk.ts, which handled the case where an `id`-bearing IO
// wrongly marked a `*Id` field as PrimaryKey (fix: id → PK, *Id → not-PK).
//
// THIS script handles the OTHER class T3 flagged (11 PK-drifts): an IO that has
// NO `id` field but marks a `*Id`-style field (name ends in "Id", case-insensitive,
// e.g. userId / webinarId / sellableApiId) as IsPrimaryKey=true. A `*Id` field is a
// REFERENCE to ANOTHER object (a foreign key), never the row's own identity. On an
// id-less projection/report row there is no own-identity column — the engine's
// content-hash must carry identity. We must NOT fabricate an `id`.
//
// Rule, applied GLOBALLY (script discovers the set; the T3 list is only a cross-check):
//   For every IO with NO `id` field, for every `*Id` (non-`id`) field marked
//   IsPrimaryKey=true:
//     - set IsPrimaryKey=false (demote);
//     - if the referenced object resolves to an EMITTED IO (userId→User,
//       webinarId→Webinar, <base>Id→Capitalized<Base>), set IsForeignKey=true +
//       RelatedIntegrationObjectID=@lookup → that IO;
//     - if the referenced object is NOT an emitted IO, just demote (plain field).
//   The IO becomes PK-less → content-hash identity (correct for a keyless row).
//
// Surgical: the MCP's upsert_integration_object_field merges by iof.Name within the
// named IO, so we pass {Name, Type, IsPrimaryKey, [IsForeignKey, RelatedIntegrationObjectID]}
// and every other slot on the field (Description, AllowsNull, Configuration, …) is
// preserved verbatim. No other field/IO is touched.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONNECTOR = 'path-lms';

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

// Derive the referenced object's BASE name from a `<base>Id` field name.
//   userId        -> User
//   webinarId     -> Webinar
//   sellableApiId -> SellableApi
// Strip a trailing "Id" (the last two chars, case-insensitive) and capitalize.
function referencedObjectBase(fieldName: string): string {
    const base = fieldName.slice(0, fieldName.length - 2); // drop trailing "Id"
    if (base.length === 0) return base;
    return base.charAt(0).toUpperCase() + base.slice(1);
}

// Resolve a `*Id` field to an EMITTED IO name (case-insensitive). Tries the
// capitalized base, then a few well-known mappings. Returns the exact emitted
// IO name (canonical casing) or null if no emitted IO matches.
function resolveFKTarget(fieldName: string, emittedByLower: Map<string, string>): string | null {
    const base = referencedObjectBase(fieldName);
    // 1. exact base match (User, Webinar)
    const exact = emittedByLower.get(base.toLowerCase());
    if (exact) return exact;
    return null;
}

function lookupRef(target: string): string {
    return `@lookup:MJ: Integration Objects.Name=${target}&IntegrationID=@parent:ID`;
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
    const client = new Client({ name: 'fix-idless-starid-pk', version: '1.0' }, { capabilities: {} });
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

// Surgical merge: demote PK and (optionally) attach FK in ONE upsert. Preserves
// every other slot via the MCP's shallow field-merge by Name.
async function applyFix(
    client: Client,
    ioName: string,
    field: FieldRec,
    fkTarget: string | null,
): Promise<void> {
    const Type = typeof field.fields.Type === 'string' ? (field.fields.Type as string) : 'String';
    const iof: Record<string, unknown> = { Name: field.fields.Name, Type, IsPrimaryKey: false };
    if (fkTarget) {
        iof.IsForeignKey = true;
        iof.RelatedIntegrationObjectID = lookupRef(fkTarget);
    }
    const res = await client.callTool({
        name: 'upsert_integration_object_field',
        arguments: { connector: CONNECTOR, ioName, iof },
    });
    readToolText(res as { content?: Array<{ type: string; text?: string }>; isError?: boolean });
}

async function main(): Promise<void> {
    const client = await connectMCP();
    const file = await readIntegration(client);
    const ios = file.relatedEntities?.['MJ: Integration Objects'] ?? [];

    // Map of lowercased IO name -> canonical IO name, for FK target resolution.
    const emittedByLower = new Map<string, string>();
    for (const io of ios) emittedByLower.set(io.fields.Name.toLowerCase(), io.fields.Name);

    const stats = {
        totalIOs: ios.length,
        starIdsDemoted: 0,
        fkEdgesAdded: 0,
        becamePKless: 0,
        demotions: [] as Array<{ io: string; field: string; fkTarget: string | null }>,
        pklessIOs: [] as string[],
    };

    for (const io of ios) {
        const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const hasId = fields.some((f) => f.fields.Name.toLowerCase() === 'id');
        if (hasId) continue; // id-bearing IOs are handled by fix-userid-pk.ts — out of scope here.

        const offendingStarIds = fields.filter(
            (f) => endsWithIdNonId(f.fields.Name) && f.fields.IsPrimaryKey === true,
        );
        if (offendingStarIds.length === 0) continue; // no bug on this id-less IO.

        for (const f of offendingStarIds) {
            const fkTarget = resolveFKTarget(f.fields.Name, emittedByLower);
            await applyFix(client, io.fields.Name, f, fkTarget);
            f.fields.IsPrimaryKey = false;
            stats.starIdsDemoted++;
            if (fkTarget) stats.fkEdgesAdded++;
            stats.demotions.push({ io: io.fields.Name, field: f.fields.Name, fkTarget });
        }

        // After demotion, does this id-less IO have any PK left?
        const remainingPKs = fields.filter((f) => f.fields.IsPrimaryKey === true);
        if (remainingPKs.length === 0) {
            stats.becamePKless++;
            stats.pklessIOs.push(io.fields.Name);
        }
    }

    // ── Post-correction verification (fresh re-read from disk) ───────────────
    const after = await readIntegration(client);
    const afterIOs = after.relatedEntities?.['MJ: Integration Objects'] ?? [];
    const verify = {
        totalIOsAfter: afterIOs.length,
        idBearingIOs: 0,
        idBearingWithIdSolePK: 0,
        idlessIOs: 0,
        idlessWithStarIdPK_violations: [] as string[],
        idBearingPKViolations: [] as string[],
    };
    for (const io of afterIOs) {
        const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        const idField = fields.find((f) => f.fields.Name.toLowerCase() === 'id');
        const pks = fields.filter((f) => f.fields.IsPrimaryKey === true);
        if (idField) {
            verify.idBearingIOs++;
            const idIsPK = idField.fields.IsPrimaryKey === true;
            const nonIdPKs = pks.filter((f) => f.fields.Name.toLowerCase() !== 'id');
            if (idIsPK && nonIdPKs.length === 0) verify.idBearingWithIdSolePK++;
            else verify.idBearingPKViolations.push(
                `${io.fields.Name}: id-bearing IO PK set is not {id} -> [${pks.map((f) => f.fields.Name).join(', ')}]`,
            );
        } else {
            verify.idlessIOs++;
            const starIdStillPK = pks.filter((f) => endsWithIdNonId(f.fields.Name));
            if (starIdStillPK.length > 0)
                verify.idlessWithStarIdPK_violations.push(
                    `${io.fields.Name}: *Id still PK on id-less IO -> ${starIdStillPK.map((f) => f.fields.Name).join(', ')}`,
                );
        }
    }

    await client.close();

    process.stdout.write(JSON.stringify({ stats, verify }, null, 2) + '\n');

    if (verify.totalIOsAfter !== 84) {
        process.stderr.write(`FATAL: expected 84 IOs, found ${verify.totalIOsAfter}\n`);
        process.exit(2);
    }
    if (verify.idlessWithStarIdPK_violations.length > 0) {
        process.stderr.write(
            `FATAL: ${verify.idlessWithStarIdPK_violations.length} id-less IO(s) STILL retain a *Id PrimaryKey:\n` +
            verify.idlessWithStarIdPK_violations.join('\n') + '\n',
        );
        process.exit(3);
    }
    if (verify.idBearingPKViolations.length > 0) {
        process.stderr.write(
            `FATAL: ${verify.idBearingPKViolations.length} id-bearing IO(s) no longer have id as sole PK ` +
            `(this script must not have touched them):\n` + verify.idBearingPKViolations.join('\n') + '\n',
        );
        process.exit(4);
    }
}

main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
});
