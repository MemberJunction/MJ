/**
 * metadata-sync-push.checks.ts — the 'metadata-sync-push' bundle (MSP1–MSP4), mutation tier (IT94).
 *
 * `mj sync push` against the live database, through `PushService`, on throwaway scratch trees:
 *  - MSP1: an atomic push (the default) whose second folder fails rolls back the first folder's
 *    update AND create, and says nothing was saved (#4550 / the 6.1.0 regression).
 *  - MSP2: a record that fails WITHOUT throwing (`status: 'error'`, a missing primary key with
 *    `autoCreateMissingRecords=false`) stops the push and rolls it back; later folders never run.
 *  - MSP3: an Action with nested Action Params — the #4290 graph that used to hang when parent
 *    and child ran on different connections — pushes cleanly in atomic mode.
 *  - MSP4: a push with isolated transactions that fails reports exactly which records stayed
 *    committed, and they really are in the database.
 *
 * Every row the bundle writes is named with the `zzz-it94` prefix. Teardown deletes all of them
 * (Action Params before Actions, then vendors) and removes the scratch directories, even after a
 * failed check.
 */
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BaseEngineRegistry, BaseEntity, RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJActionEntity, MJActionParamEntity, MJAIVendorEntity } from '@memberjunction/core-entities';
import { PushAbortedError, PushService, SyncEngine } from '@memberjunction/metadata-sync';
import type { PushCallbacks, PushOptions } from '@memberjunction/metadata-sync';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

const PREFIX = 'zzz-it94';

interface PushFixture {
    Root: string;
    BaseVendorID: string;
    BaseVendorName: string;
    BaseDescription: string;
}

// Built in Setup, used by every check, removed in Teardown.
let fixture: PushFixture | undefined;

function requireFixture(): PushFixture {
    if (!fixture) {
        throw new Error('metadata-sync-push: Setup did not run (no fixture)');
    }
    return fixture;
}

// ─── Scratch trees ──────────────────────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface ScratchFolder {
    Name: string;
    Entity: string;
    Files: Record<string, JsonValue>;
}

/** Write one push tree: a root `.mj-sync.json`, then one entity folder per entry, in order. */
function writeTree(dir: string, folders: ScratchFolder[], autoCreate: boolean): string {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const root = { version: '1.0.0', push: { autoCreateMissingRecords: autoCreate }, directoryOrder: folders.map((f) => f.Name) };
    fs.writeFileSync(path.join(dir, '.mj-sync.json'), JSON.stringify(root, null, 2));
    for (const folder of folders) {
        const folderDir = path.join(dir, folder.Name);
        fs.mkdirSync(folderDir);
        fs.writeFileSync(path.join(folderDir, '.mj-sync.json'), JSON.stringify({ entity: folder.Entity, filePattern: '**/.*.json' }, null, 2));
        for (const [file, data] of Object.entries(folder.Files)) {
            fs.writeFileSync(path.join(folderDir, file), JSON.stringify(data, null, 2));
        }
    }
    return dir;
}

function vendorRecord(id: string, fields: { [key: string]: JsonValue }): JsonValue {
    return { primaryKey: { ID: id }, fields };
}

/** The S1 shape: folder A updates the base vendor and creates one; folder B fails on the base vendor. */
function s1Tree(dir: string, f: PushFixture, marker: string, newVendorID: string): string {
    return writeTree(dir, [
        {
            Name: 'a-vendors',
            Entity: 'MJ: AI Vendors',
            Files: {
                '.vendors.json': [
                    vendorRecord(f.BaseVendorID, { Name: f.BaseVendorName, Description: marker }),
                    vendorRecord(newVendorID, { Name: `${PREFIX} ${marker} new`, Description: marker }),
                ],
            },
        },
        {
            Name: 'b-vendors',
            Entity: 'MJ: AI Vendors',
            Files: { '.bad.json': vendorRecord(f.BaseVendorID, { Name: null }) },
        },
    ], true);
}

// ─── Push + database helpers ────────────────────────────────────────────────

interface PushRunOutcome {
    Error?: unknown;
    Warnings: string[];
}

async function runPush(user: UserInfo, dir: string, extra: Partial<PushOptions> = {}): Promise<PushRunOutcome> {
    const engine = new SyncEngine(user);
    await engine.initialize();
    const service = new PushService(engine, user);
    const warnings: string[] = [];
    const callbacks: PushCallbacks = { onWarn: (m) => warnings.push(m) };
    try {
        await service.push({ dir, ...extra }, callbacks);
        return { Warnings: warnings };
    } catch (error) {
        return { Error: error, Warnings: warnings };
    }
}

function asAborted(outcome: PushRunOutcome, label: string): PushAbortedError {
    Assert(outcome.Error !== undefined, `${label}: the push was expected to fail, but it succeeded`);
    Assert(outcome.Error instanceof PushAbortedError,
        `${label}: expected a PushAbortedError, got: ${outcome.Error instanceof Error ? outcome.Error.message : String(outcome.Error)}`);
    return outcome.Error as PushAbortedError;
}

async function loadVendor(ctx: IntegrationCheckContext, id: string): Promise<MJAIVendorEntity | undefined> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const result = await rv.RunView<MJAIVendorEntity>(
        { EntityName: 'MJ: AI Vendors', ExtraFilter: `ID='${id}'`, ResultType: 'entity_object', BypassCache: true },
        ctx.User,
    );
    Assert(result.Success, `loading AI Vendor ${id} failed: ${result.ErrorMessage}`);
    return result.Results[0];
}

async function countRows(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<number> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const result = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'count_only', BypassCache: true }, ctx.User);
    Assert(result.Success, `counting ${entityName} failed: ${result.ErrorMessage}`);
    return result.TotalRowCount;
}

async function expectBaseVendorUnchanged(ctx: IntegrationCheckContext, f: PushFixture, label: string): Promise<void> {
    const vendor = await loadVendor(ctx, f.BaseVendorID);
    Assert(vendor !== undefined, `${label}: the base vendor disappeared`);
    AssertEqual(vendor?.Description ?? null, f.BaseDescription, `${label}: base vendor Description after the failed push`);
    AssertEqual(vendor?.Name ?? null, f.BaseVendorName, `${label}: base vendor Name after the failed push`);
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

function recordId(record: BaseEntity): string {
    // A donor with ResultType 'simple' holds plain rows even though the registry types them as entities.
    const row: Record<string, unknown> = record instanceof BaseEntity ? record.GetAll() : (record as unknown as Record<string, unknown>);
    return String(row['ID'] ?? '');
}

/**
 * A push looks existing records up in the in-memory caches other engines already hold. Those
 * engines refresh asynchronously after a save, so a push that starts right after Setup's save could
 * miss the row and try to create it again. Wait until every loaded cache holds it.
 */
async function waitForEngineCaches(entityName: string, id: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const matches = BaseEngineRegistry.Instance.FindCachedEntity(entityName, { unfilteredOnly: true });
        const stale = matches.filter((m) => !m.records.some((r) => UUIDsEqual(recordId(r), id)));
        if (stale.length === 0) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const holders = BaseEngineRegistry.Instance.FindCachedEntity(entityName, { unfilteredOnly: true }).map((m) => m.engineClassName);
    throw new Error(`metadata-sync-push Setup: ${entityName} ${id} did not reach the engine caches (${holders.join(', ')}) within ${timeoutMs}ms`);
}

async function deleteAll<T extends BaseEntity>(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<void> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const result = await rv.RunView<T>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true }, ctx.User);
    if (!result.Success) {
        console.warn(`  ⚠ metadata-sync-push teardown: could not list ${entityName}: ${result.ErrorMessage}`);
        return;
    }
    for (const row of result.Results) {
        if (!(await row.Delete())) {
            console.warn(`  ⚠ metadata-sync-push teardown: could not delete ${entityName} ${row.PrimaryKey.ToString()}: ${row.LatestResult?.CompleteMessage}`);
        }
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('metadata-sync-push', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const vendor = await ctx.Provider.GetEntityObject<MJAIVendorEntity>('MJ: AI Vendors', ctx.User);
        vendor.NewRecord();
        vendor.Name = `${PREFIX} base vendor ${Date.now()}`;
        vendor.Description = 'it94-original';
        if (!(await vendor.Save())) {
            throw new Error(`metadata-sync-push Setup: could not create the base vendor: ${vendor.LatestResult?.CompleteMessage}`);
        }
        await waitForEngineCaches('MJ: AI Vendors', vendor.ID, 20_000);
        fixture = {
            Root: fs.mkdtempSync(path.join(os.tmpdir(), 'mj-it94-')),
            BaseVendorID: vendor.ID,
            BaseVendorName: vendor.Name,
            BaseDescription: 'it94-original',
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await deleteAll<MJActionParamEntity>(ctx, 'MJ: Action Params', `Action LIKE '${PREFIX}%'`);
        await deleteAll<MJActionEntity>(ctx, 'MJ: Actions', `Name LIKE '${PREFIX}%'`);
        await deleteAll<MJAIVendorEntity>(ctx, 'MJ: AI Vendors', `Name LIKE '${PREFIX}%'`);
        if (fixture) {
            fs.rmSync(fixture.Root, { recursive: true, force: true });
        }
        fixture = undefined;
    },
});

// ─── Checks ─────────────────────────────────────────────────────────────────

async function checkMsp1AtomicRollsBackEarlierFolders(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const newVendorID = randomUUID().toUpperCase();
    const dir = s1Tree(path.join(f.Root, 'msp1'), f, 'MSP1', newVendorID);
    const aborted = asAborted(await runPush(ctx.User, dir), 'MSP1');

    Assert(aborted.message.includes('Name cannot be null'), `MSP1: expected folder B's "Name cannot be null" failure, got: ${aborted.message}`);
    Assert(aborted.NothingCommitted, `MSP1: an atomic push must report nothing committed (committed: ${aborted.committedWrites.length})`);
    AssertEqual(aborted.modes.join(','), 'shared', 'MSP1: default write mode');
    await expectBaseVendorUnchanged(ctx, f, 'MSP1');
    AssertEqual(await countRows(ctx, 'MJ: AI Vendors', `ID='${newVendorID}'`), 0, 'MSP1: the vendor created in folder A must be rolled back');

    const restored = fs.readFileSync(path.join(dir, 'a-vendors', '.vendors.json'), 'utf-8');
    Assert(!restored.includes('"sync"'), 'MSP1: folder A\'s file must be restored without the sync blocks the push wrote');
}

async function checkMsp2CountedErrorStopsAndRollsBack(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const missingID = randomUUID().toUpperCase();
    const laterName = `${PREFIX} MSP2 later folder`;
    const dir = writeTree(path.join(f.Root, 'msp2'), [
        {
            Name: 'a-vendors',
            Entity: 'MJ: AI Vendors',
            Files: {
                '.vendors.json': [
                    vendorRecord(f.BaseVendorID, { Name: f.BaseVendorName, Description: 'MSP2' }),
                    vendorRecord(missingID, { Name: `${PREFIX} MSP2 missing`, Description: 'MSP2' }),
                ],
            },
        },
        { Name: 'b-vendors', Entity: 'MJ: AI Vendors', Files: { '.later.json': { fields: { Name: laterName, Description: 'MSP2' } } } },
    ], false);
    const aborted = asAborted(await runPush(ctx.User, dir), 'MSP2');

    Assert(aborted.message.includes('could not be pushed'), `MSP2: expected the counted-error stop, got: ${aborted.message}`);
    await expectBaseVendorUnchanged(ctx, f, 'MSP2');
    AssertEqual(await countRows(ctx, 'MJ: AI Vendors', `Name='${laterName}'`), 0, 'MSP2: the folder after the failed record must never run');
}

async function checkMsp3NestedActionParamsPushAtomically(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const actionID = randomUUID().toUpperCase();
    const actionName = `${PREFIX} MSP3 action ${Date.now()}`;
    const param = (name: string): JsonValue => ({
        primaryKey: { ID: randomUUID().toUpperCase() },
        fields: { ActionID: '@parent:ID', Name: name, Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false, LogValue: false },
    });
    const dir = writeTree(path.join(f.Root, 'msp3'), [
        {
            Name: 'actions',
            Entity: 'MJ: Actions',
            Files: {
                '.action.json': {
                    primaryKey: { ID: actionID },
                    fields: {
                        Name: actionName, Description: 'IT94 nested graph', Type: 'Custom', Status: 'Active',
                        CodeApprovalStatus: 'Approved', CodeLocked: false, ForceCodeGeneration: false,
                    },
                    relatedEntities: { 'MJ: Action Params': [param('FirstParam'), param('SecondParam')] },
                },
            },
        },
    ], true);

    const outcome = await withTimeout(runPush(ctx.User, dir), 60_000, 'MSP3: the nested Action Param push hung (the #4290 deadlock)');
    Assert(outcome.Error === undefined, `MSP3: push failed: ${outcome.Error instanceof Error ? outcome.Error.message : String(outcome.Error)}`);
    AssertEqual(await countRows(ctx, 'MJ: Actions', `ID='${actionID}'`), 1, 'MSP3: the Action exists');
    AssertEqual(await countRows(ctx, 'MJ: Action Params', `ActionID='${actionID}'`), 2, 'MSP3: both nested Action Params exist');
}

async function checkMsp4NonAtomicReportsWhatStayedCommitted(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const newVendorID = randomUUID().toUpperCase();
    const dir = s1Tree(path.join(f.Root, 'msp4'), f, 'MSP4', newVendorID);
    const outcome = await runPush(ctx.User, dir, { isolatedTransactions: true });
    const aborted = asAborted(outcome, 'MSP4');

    AssertEqual(aborted.modes.join(','), 'isolated', 'MSP4: write mode');
    Assert(aborted.message.includes('Name cannot be null'), `MSP4: expected folder B's "Name cannot be null" failure, got: ${aborted.message}`);
    Assert(!aborted.NothingCommitted, 'MSP4: a failed isolated push must not claim nothing was committed');
    const listed = aborted.committedWrites.map((w) => `${w.status} ${w.recordPath}`).sort();
    AssertEqual(listed.join(' | '), 'created MJ: AI Vendors[1] | updated MJ: AI Vendors[0]', 'MSP4: committed records reported');
    Assert(!outcome.Warnings.some((w) => w.includes('rolled back successfully')), 'MSP4: must not print "rolled back successfully"');
    Assert(aborted.totals.created > 0, `MSP4: a failed push still reports its counts (created: ${aborted.totals.created})`);

    const vendor = await loadVendor(ctx, f.BaseVendorID);
    AssertEqual(vendor?.Description ?? null, 'MSP4', 'MSP4: the reported update really is committed');
    AssertEqual(await countRows(ctx, 'MJ: AI Vendors', `ID='${newVendorID}'`), 1, 'MSP4: the reported create really is committed');
}

async function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
        return await Promise.race([work, timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export const MetadataSyncPushChecks: NamedCheck[] = [
    {
        Id: 'metadata-sync-push.MSP1',
        Name: 'MSP1: an atomic push that fails in its second folder rolls back the first folder\'s update and create',
        Fn: checkMsp1AtomicRollsBackEarlierFolders,
        RequiresMutation: true,
    },
    {
        Id: 'metadata-sync-push.MSP2',
        Name: "MSP2: a record that fails without throwing (status: 'error') stops the push and rolls it back",
        Fn: checkMsp2CountedErrorStopsAndRollsBack,
        RequiresMutation: true,
    },
    {
        Id: 'metadata-sync-push.MSP3',
        Name: 'MSP3: an Action with nested Action Params pushes atomically without the #4290 hang',
        Fn: checkMsp3NestedActionParamsPushAtomically,
        RequiresMutation: true,
    },
    {
        Id: 'metadata-sync-push.MSP4',
        Name: 'MSP4: a failed push with isolated transactions lists exactly the records that stayed committed',
        Fn: checkMsp4NonAtomicReportsWhatStayedCommitted,
        RequiresMutation: true,
    },
];

for (const check of MetadataSyncPushChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
