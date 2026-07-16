#!/usr/bin/env tsx
/**
 * amend-round9-remove-supportsread.ts — MetadataWriter follow-up to the T7 write-only fix (Impexium).
 *
 * CONTEXT: the T7 write-only fix REMOVED the `APIPath` from the 14 write-only IOs (no read/list
 * endpoint documented) — the absent APIPath is the durable write-only signal that T7 reads. A
 * `SupportsRead: false` key was also added, but `SupportsRead` is NOT a deployed
 * `MJ: Integration Objects` column (confirmed: not in the deployed schema; T7 does not read it),
 * so mj-sync validation would error on it as an unrecognized key at HybridE2E push time (mj-sync
 * rejects ANY unrecognized key in a fields object regardless of value — nulling is insufficient).
 *
 * THIS PASS: physically delete the `SupportsRead` key from all 14 write-only IOs via the
 * mj-metadata MCP `delete_integration_object_key` tool. Nothing else is touched — APIPath stays
 * absent, SupportsWrite + Create/Update/Delete per-operation columns are unchanged.
 *
 * The 14 write-only IOs (exact list from the T7 fix):
 *   AwardNominations, ExamScores, EducationCredits, Tasks, Activities, Notes, Categories, Links,
 *   Addresses, Emails, Phones, Notifications, SessionRegistrations, EventAttendance.
 *
 * Verification (fail-loud): before writing, assert each of the 14 IOs currently carries a
 * `SupportsRead` key AND has no `APIPath` key; after writing, re-read and assert the `SupportsRead`
 * key is gone, `APIPath` is still absent, and SupportsWrite + Create/Update/Delete columns are
 * intact — printed to stdout as structured stats.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;

type Fields = Record<string, unknown>;
interface IORow { fields: Fields }
interface Doc { fields: Fields; relatedEntities: { 'MJ: Integration Objects': IORow[] } }

const WRITE_ONLY_IOS = [
    'AwardNominations', 'ExamScores', 'EducationCredits', 'Tasks', 'Activities', 'Notes',
    'Categories', 'Links', 'Addresses', 'Emails', 'Phones', 'Notifications',
    'SessionRegistrations', 'EventAttendance',
] as const;

// Per-operation write columns that MUST remain intact on every write-only IO after the edit.
const WRITE_COLUMNS = [
    'SupportsWrite', 'SupportsCreate', 'SupportsUpdate', 'SupportsDelete',
    'CreateAPIPath', 'CreateMethod', 'UpdateAPIPath', 'UpdateMethod',
    'DeleteAPIPath', 'DeleteMethod',
] as const;

function readIOs(): IORow[] {
    const doc = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Doc[];
    return doc[0].relatedEntities['MJ: Integration Objects'];
}
function findIO(ios: IORow[], name: string): Fields {
    const io = ios.find((o) => (o.fields.Name as string) === name);
    if (!io) throw new Error(`IO ${name} not found in metadata`);
    return io.fields;
}

async function main(): Promise<void> {
    // ── Pre-write verification: every write-only IO carries SupportsRead and no APIPath. ──
    const before = readIOs();
    const totalIOCount = before.length;
    for (const name of WRITE_ONLY_IOS) {
        const f = findIO(before, name);
        if (!('SupportsRead' in f)) throw new Error(`${name}: expected SupportsRead key present before removal, but it is absent`);
        if ('APIPath' in f && f.APIPath != null) throw new Error(`${name}: APIPath unexpectedly present (${String(f.APIPath)}) — T7 fix should have removed it`);
        if (f.SupportsWrite !== true) throw new Error(`${name}: SupportsWrite is not true (${String(f.SupportsWrite)})`);
    }

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'amend-round9-remove-supportsread', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const removed: string[] = [];
    for (const name of WRITE_ONLY_IOS) {
        const res = (await client.callTool({
            name: 'delete_integration_object_key',
            arguments: { connector: CONNECTOR, ioName: name, fieldKey: 'SupportsRead' },
        })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        const text = (res.content ?? []).map((c) => c.text ?? '').join(' ');
        if (res.isError || /No matching/.test(text)) throw new Error(`delete_integration_object_key FAILED for ${name}: ${text}`);
        removed.push(name);
    }

    await client.close();

    // ── Post-write verification: SupportsRead gone, APIPath still absent, write columns intact. ──
    const after = readIOs();
    const stillHasSupportsRead: string[] = [];
    const apiPathReappeared: string[] = [];
    const writeColumnDrift: string[] = [];
    for (const name of WRITE_ONLY_IOS) {
        const bf = findIO(before, name);
        const af = findIO(after, name);
        if ('SupportsRead' in af) stillHasSupportsRead.push(name);
        if ('APIPath' in af && af.APIPath != null) apiPathReappeared.push(name);
        for (const col of WRITE_COLUMNS) {
            if (JSON.stringify(bf[col]) !== JSON.stringify(af[col])) writeColumnDrift.push(`${name}.${col}`);
        }
    }
    const remainingSupportsReadTotal = after.filter((o) => 'SupportsRead' in o.fields).map((o) => o.fields.Name as string);

    const ok = stillHasSupportsRead.length === 0 && apiPathReappeared.length === 0 &&
        writeColumnDrift.length === 0 && after.length === totalIOCount &&
        remainingSupportsReadTotal.length === 0;

    process.stdout.write(JSON.stringify({
        SupportsReadKeysRemoved: removed.length,
        IOsProcessed: removed,
        IOCountBefore: totalIOCount,
        IOCountAfter: after.length,
        StillHasSupportsRead: stillHasSupportsRead,
        AnyIOStillCarryingSupportsRead: remainingSupportsReadTotal,
        APIPathReappeared: apiPathReappeared,
        WriteColumnDrift: writeColumnDrift,
        VerificationPassed: ok,
    }, null, 2) + '\n');

    if (!ok) process.exit(2);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
