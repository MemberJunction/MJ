/**
 * PushService atomicity: which provider each save runs on, what commits when, and what a
 * failed push says. The database is a fake provider that models physical transactions and
 * savepoints, so "committed" below means "a physical COMMIT happened on some connection".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { RecordData, BatchContext, SyncEngine } from '../lib/sync-engine';
import type { EntityConfig } from '../config';
import type { PushCallbacks, PushOptions, PushRecordError } from '../services/PushService';
import type { SyncStateManager } from '../lib/sync-state-manager';

// ─── Fake database ──────────────────────────────────────────────────────────

type TxEvent = { instance: number; op: 'begin' | 'savepoint' | 'commit' | 'release' | 'rollback' | 'rollback-savepoint' };

class FakeDatabase {
    committed: string[] = [];
    /** Record name after whose save the provider is left at depth > 0, as a stray scope would. */
    leftoverDepthAfter: string | undefined;
    events: TxEvent[] = [];
    independentCreated = 0;
    independentUnavailable = false;
    nextInstance = 0;
}

class FakeDbProvider {
    readonly id: number;
    TransactionDepth = 0;
    private pending: string[] = [];
    readonly PlatformKey = 'sqlserver';

    constructor(private readonly db: FakeDatabase) {
        this.id = db.nextInstance++;
    }

    async BeginTransaction(): Promise<void> {
        this.TransactionDepth++;
        this.db.events.push({ instance: this.id, op: this.TransactionDepth === 1 ? 'begin' : 'savepoint' });
    }

    async CommitTransaction(): Promise<void> {
        this.TransactionDepth--;
        if (this.TransactionDepth > 0) {
            this.db.events.push({ instance: this.id, op: 'release' });
            return;
        }
        this.db.events.push({ instance: this.id, op: 'commit' });
        this.db.committed.push(...this.pending);
        this.pending = [];
    }

    async RollbackTransaction(): Promise<void> {
        this.TransactionDepth--;
        this.db.events.push({ instance: this.id, op: this.TransactionDepth > 0 ? 'rollback-savepoint' : 'rollback' });
        if (this.TransactionDepth === 0) {
            this.pending = [];
        }
    }

    async CreateIndependentInstance(): Promise<FakeDbProvider> {
        if (this.db.independentUnavailable) {
            throw new Error('does not implement CreateIndependentInstance');
        }
        this.db.independentCreated++;
        return new FakeDbProvider(this.db);
    }

    async ReleaseIndependentInstance(): Promise<void> {
        if (this.TransactionDepth > 0) {
            await this.RollbackTransaction();
        }
    }

    /** What BaseEntity.Save does: its own scope (a savepoint when nested), one write, settle. */
    async Save(row: string): Promise<void> {
        await this.BeginTransaction();
        this.pending.push(row);
        await this.CommitTransaction();
    }
}

let db = new FakeDatabase();
let host = new FakeDbProvider(db);

// ─── Module mocks ───────────────────────────────────────────────────────────

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        static get Provider(): FakeDbProvider {
            return host;
        }
    }
    return { ...actual, Metadata: MockMetadata };
});

vi.mock('../lib/provider-utils', async () => {
    const actual = await vi.importActual<typeof import('../lib/provider-utils')>('../lib/provider-utils');
    return { ...actual, getDataProvider: () => host };
});

vi.mock('../lib/sync-metadata-engine', () => ({
    SyncMetadataEngine: class {
        initializeEngine(): void {}
        getCachedFile(): undefined {
            return undefined;
        }
        cacheFile(): void {}
        invalidateCachedFile(): void {}
        setEntityDirs(): void {}
        async Config(): Promise<void> {}
        drainWarnings(): string[] {
            return [];
        }
        getDelegationSummary(): never[] {
            return [];
        }
    },
}));

vi.mock('../lib/entity-subclass-guard', () => ({ describeMissingEntitySubclass: () => undefined }));

// The audit itself is not under test here; what matters is that a file carrying a delete has its
// write deferred to Phase 3. Phase 2 then has nothing to do.
vi.mock('../lib/deletion-auditor', () => ({
    DeletionAuditor: class {
        async auditDeletions() {
            return {
                explicitDeletes: new Map(),
                implicitDeletes: new Map(),
                alreadyDeleted: new Map(),
                databaseOnlyReferences: [],
                databaseOnlyDeletions: [],
                orphanedReferences: [],
                deletionLevels: [],
            };
        }
    },
}));

// One graph per top-level record, all at level 0.
vi.mock('../lib/record-dependency-analyzer', async () => {
    const actual = await vi.importActual<typeof import('../lib/record-dependency-analyzer')>('../lib/record-dependency-analyzer');
    class FlatAnalyzer {
        private all: FlattenedRecord[] = [];

        reset(): void {
            this.all = [];
        }

        flattenFileRecords(records: RecordData[], entityName: string): FlattenedRecord[] {
            const flattened = this.flatten(records, entityName);
            this.all.push(...flattened);
            return flattened;
        }

        analyzeAllDependencies(records: FlattenedRecord[]) {
            return { sortedRecords: records, dependencyLevels: [records], circularDependencies: [] };
        }

        buildReverseDependencyMap(): Map<string, string[]> {
            return new Map();
        }

        reverseTopologicalSort(records: FlattenedRecord[]): FlattenedRecord[][] {
            return [records];
        }

        async analyzeFileRecords(records: RecordData[], entityName: string) {
            const flattened = this.flatten(records, entityName);
            return { sortedRecords: flattened, dependencyLevels: [flattened], circularDependencies: [] };
        }

        private flatten(records: RecordData[], entityName: string): FlattenedRecord[] {
            return records.map((record, i) => ({
                record,
                entityName,
                depth: 0,
                path: `${entityName}[${i}]`,
                dependencies: new Set<string>(),
                id: `${entityName}-${i}`,
                originalIndex: i,
                graphId: typeof record.fields?.Graph === 'string' ? `${entityName}-${record.fields.Graph}` : `${entityName}-g${i}`,
            }));
        }
    }
    return { ...actual, RecordDependencyAnalyzer: FlatAnalyzer };
});

import { PushService } from '../services/PushService';
import { PushAbortedError } from '../lib/push-outcome';

// ─── Push service with scripted records ─────────────────────────────────────

type Behavior = 'create' | 'update' | 'throw' | 'error' | 'defer' | 'defer-fail';

class ScriptedPushService extends PushService {
    processed: string[] = [];
    active = 0;
    maxActive = 0;
    delayMs = 0;

    protected override async processFlattenedRecord(
        flattenedRecord: FlattenedRecord,
        entityDir: string,
        options: PushOptions,
        _batchContext: BatchContext,
        callbacks?: PushCallbacks,
        entityConfig?: EntityConfig,
        allowDefer: boolean = true,
        recordProvider?: IMetadataProvider
    ) {
        const provider = (recordProvider as unknown as FakeDbProvider | undefined) ?? host;
        if (flattenedRecord.record.deleteRecord?.delete === true) {
            return { status: 'deleted' as const, isDeletedRecord: true }; // Phase 2 owns deletes
        }
        const fields = flattenedRecord.record.fields;
        const name = String(fields.Name);
        const behavior = fields.Behavior as Behavior;
        this.processed.push(name);
        this.active++;
        this.maxActive = Math.max(this.maxActive, this.active);
        try {
            if (this.delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.delayMs));
            }
            const writer = options.dryRun ? undefined : provider;
            return await this.runBehavior(behavior, name, writer, flattenedRecord, entityDir, allowDefer, callbacks, entityConfig);
        } finally {
            this.active--;
        }
    }

    private async runBehavior(
        behavior: Behavior,
        name: string,
        provider: FakeDbProvider | undefined,
        flattenedRecord: FlattenedRecord,
        entityDir: string,
        allowDefer: boolean,
        callbacks?: PushCallbacks,
        entityConfig?: EntityConfig
    ) {
        if (behavior === 'throw') {
            throw new Error(`boom at ${name}`);
        }
        if (behavior === 'error') {
            callbacks?.onRecordError?.({ entityName: flattenedRecord.entityName, path: flattenedRecord.path, message: `not found: ${name}` });
            return { status: 'error' as const };
        }
        if (!allowDefer && behavior === 'defer-fail') {
            throw new Error(`deferred lookup still missing for ${name}`);
        }
        await provider?.Save(allowDefer ? name : `${name} (deferred pass)`);
        if (provider && name === db.leftoverDepthAfter) {
            // A subclass that opened a scope and never settled it: the graph drains with depth > 0.
            await provider.BeginTransaction();
        }
        flattenedRecord.record.fields.Pushed = true; // what the file is written back with
        if (allowDefer && (behavior === 'defer' || behavior === 'defer-fail')) {
            return {
                status: 'deferred' as const,
                deferredRecord: { flattenedRecord, entityDir, entityConfig: entityConfig as EntityConfig },
            };
        }
        // The deferred pass updates a row the first pass already created.
        const updated = behavior === 'update' || !allowDefer;
        return { status: updated ? ('updated' as const) : ('created' as const) };
    }
}

function makeSyncEngine(): SyncEngine {
    const stub = {
        setMetadataEngine: vi.fn(),
        getProvider: () => host,
        calculateChecksum: () => 'checksum',
        WarningSink: undefined,
    };
    return stub as unknown as SyncEngine;
}

type FixtureRecord = { Name: string; Behavior: Behavior; Delete?: boolean; Graph?: string };
type Folder = { name: string; records: FixtureRecord[]; isolated?: boolean };

async function writeFixture(root: string, folders: Folder[], rootIsolated?: boolean): Promise<void> {
    const push: Record<string, boolean> = { autoCreateMissingRecords: true };
    if (rootIsolated !== undefined) push.isolatedTransactions = rootIsolated;
    await fs.writeJson(path.join(root, '.mj-sync.json'), { version: '1.0.0', push, directoryOrder: folders.map((f) => f.name) });
    for (const folder of folders) {
        const dir = path.join(root, folder.name);
        await fs.ensureDir(dir);
        const entityConfig: Record<string, unknown> = { entity: `Entity ${folder.name}` };
        if (folder.isolated !== undefined) entityConfig.push = { isolatedTransactions: folder.isolated };
        await fs.writeJson(path.join(dir, '.mj-sync.json'), entityConfig);
        const records = folder.records.map(({ Delete, ...fields }) =>
            Delete ? { fields: { ...fields }, deleteRecord: { delete: true } } : { fields: { ...fields } }
        );
        await fs.writeJson(path.join(dir, '.records.json'), records);
    }
}

function collectCallbacks() {
    const warnings: string[] = [];
    const logs: string[] = [];
    const recordErrors: PushRecordError[] = [];
    const callbacks: PushCallbacks = {
        onWarn: (m) => warnings.push(m),
        onLog: (m) => logs.push(m),
        onError: (m) => logs.push(m),
        onRecordError: (d) => recordErrors.push(d),
        onConfirm: async () => true,
    };
    return { callbacks, warnings, logs, recordErrors };
}

async function readRecords(root: string, folder: string): Promise<Array<{ fields: Record<string, unknown> }>> {
    return fs.readJson(path.join(root, folder, '.records.json'));
}

const ok = (Name: string): { Name: string; Behavior: Behavior } => ({ Name, Behavior: 'create' });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PushService atomicity', () => {
    let root: string;
    let service: ScriptedPushService;

    beforeEach(async () => {
        db = new FakeDatabase();
        host = new FakeDbProvider(db);
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-atomic-'));
        service = new ScriptedPushService(makeSyncEngine(), {} as UserInfo);
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    describe('shared transaction (default)', () => {
        it('runs every save on the host and commits once, at the end', async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), ok('a2')] },
                { name: 'b', records: [{ Name: 'b1', Behavior: 'update' }] },
            ]);
            const result = await service.push({ dir: root }, collectCallbacks().callbacks);

            expect(result).toMatchObject({ created: 2, updated: 1, errors: 0 });
            expect(db.independentCreated).toBe(0);
            const commits = db.events.filter((e) => e.op === 'commit');
            expect(commits).toEqual([{ instance: host.id, op: 'commit' }]);
            expect(db.events[db.events.length - 1]).toEqual({ instance: host.id, op: 'commit' });
            expect(db.committed).toEqual(['a1', 'a2', 'b1']);
            expect(host.TransactionDepth).toBe(0);
        });

        it('runs one graph at a time even with --parallel-batch-size, and says the flag did nothing', async () => {
            service.delayMs = 5;
            await writeFixture(root, [{ name: 'a', records: [ok('a1'), ok('a2'), ok('a3'), ok('a4')] }]);
            const { callbacks, warnings } = collectCallbacks();
            await service.push({ dir: root, parallelBatchSize: 10 }, callbacks);

            expect(service.maxActive).toBe(1);
            expect(warnings.some((w) => /--parallel-batch-size=10 is ignored/.test(w))).toBe(true);
        });

        it('rolls everything back when a record in the second folder throws', async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), { Name: 'a2', Behavior: 'update' }] },
                { name: 'b', records: [{ Name: 'b1', Behavior: 'throw' }] },
            ]);
            const { callbacks, warnings } = collectCallbacks();
            const failure = await service.push({ dir: root }, callbacks).catch((e: unknown) => e);

            expect(failure).toBeInstanceOf(PushAbortedError);
            const aborted = failure as PushAbortedError;
            expect(aborted.message).toBe('boom at b1');
            expect(aborted.NothingCommitted).toBe(true);
            expect(db.committed).toEqual([]);
            expect(db.events.some((e) => e.op === 'commit')).toBe(false);
            expect(host.TransactionDepth).toBe(0);
            expect(warnings).toContain('✓ Database transaction rolled back successfully. Nothing from this push was saved.');
            // Folder a's file is restored: it no longer carries what the push wrote back.
            expect((await readRecords(root, 'a'))[0].fields.Pushed).toBeUndefined();
        });

        it("stops and rolls back on a record that returns status: 'error'", async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), { Name: 'a2', Behavior: 'error' }, ok('a3')] },
                { name: 'b', records: [ok('b1')] },
            ]);
            const { callbacks, recordErrors } = collectCallbacks();
            const failure = await service.push({ dir: root }, callbacks).catch((e: unknown) => e);

            expect(failure).toBeInstanceOf(PushAbortedError);
            expect((failure as Error).message).toMatch(/1 record in \.records\.json could not be pushed/);
            expect(service.processed).not.toContain('a3');
            expect(service.processed).not.toContain('b1');
            expect(db.committed).toEqual([]);
            expect(host.TransactionDepth).toBe(0);
            expect(recordErrors.map((e) => e.message)).toEqual(['not found: a2']);
        });

        it('stops and rolls back when a deferred record fails in Phase 2.5, and reports it once', async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), { Name: 'a2', Behavior: 'defer-fail' }] },
            ]);
            const { callbacks, recordErrors } = collectCallbacks();
            const failure = await service.push({ dir: root }, callbacks).catch((e: unknown) => e);

            expect(failure).toBeInstanceOf(PushAbortedError);
            expect((failure as Error).message).toMatch(/Failed to process deferred record .*deferred lookup still missing for a2/);
            expect(db.committed).toEqual([]);
            expect(host.TransactionDepth).toBe(0);
            expect(recordErrors).toHaveLength(1);
            expect(recordErrors[0].message).toMatch(/Deferred record could not be resolved/);
        });

        it('resolves deferred records inside the same transaction when they succeed', async () => {
            await writeFixture(root, [{ name: 'a', records: [{ Name: 'a1', Behavior: 'defer' }] }]);
            const result = await service.push({ dir: root }, collectCallbacks().callbacks);

            expect(result).toMatchObject({ created: 1, updated: 1, deferred: 1, errors: 0 });
            expect(db.committed).toEqual(['a1', 'a1 (deferred pass)']);
            expect(db.events.filter((e) => e.op === 'commit')).toHaveLength(1);
        });

        it('stores incremental state only after the commit, and not at all when the push fails', async () => {
            const calls: string[] = [];
            const state = {
                hasFileChanged: () => true,
                setFileChecksum: () => calls.push('checksum'),
                setLastPushTimestamp: () => calls.push('timestamp'),
                pruneStaleChecksums: async () => {
                    calls.push('prune');
                    return 0;
                },
                save: async () => {
                    calls.push(`save after ${db.events.filter((e) => e.op === 'commit').length} commit(s)`);
                },
            };
            service.setStateManager(state as unknown as SyncStateManager);

            await writeFixture(root, [{ name: 'a', records: [ok('a1')] }, { name: 'b', records: [{ Name: 'b1', Behavior: 'throw' }] }]);
            await service.push({ dir: root, incremental: true }, collectCallbacks().callbacks).catch(() => undefined);
            expect(calls).toEqual([]);

            await writeFixture(root, [{ name: 'a', records: [ok('a1')] }, { name: 'b', records: [ok('b1')] }]);
            await service.push({ dir: root, incremental: true }, collectCallbacks().callbacks);
            expect(calls).toEqual(['checksum', 'checksum', 'timestamp', 'timestamp', 'prune', 'save after 1 commit(s)']);
        });

        it('keeps counting record errors in a dry run, without a transaction', async () => {
            await writeFixture(root, [{ name: 'a', records: [{ Name: 'a1', Behavior: 'error' }, ok('a2')] }]);
            const result = await service.push({ dir: root, dryRun: true }, collectCallbacks().callbacks);

            expect(result.errors).toBe(1);
            expect(service.processed).toEqual(['a1', 'a2']);
            expect(db.events).toEqual([]);
        });

        it('lets --no-isolated-transactions override an isolated root config', async () => {
            await writeFixture(root, [{ name: 'a', records: [ok('a1')] }], true);
            await service.push({ dir: root, isolatedTransactions: false }, collectCallbacks().callbacks);
            expect(db.independentCreated).toBe(0);
        });

        it('lets an entity directory opt itself in while the rest of the push stays shared', async () => {
            // The mixed shape: metadata stays all-or-nothing, one entity buys parallelism.
            service.delayMs = 5;
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), ok('a2')] },
                { name: 'b', records: [ok('b1'), ok('b2')], isolated: true },
            ]);
            const { callbacks, warnings } = collectCallbacks();
            await service.push({ dir: root }, callbacks);

            // One probe plus one instance per graph in folder b only.
            expect(db.independentCreated).toBe(3);
            const isolatedDir = path.relative(process.cwd(), path.join(root, 'b'));
            expect(warnings.some((w) => w.includes('Isolated transactions') && w.includes(isolatedDir))).toBe(true);
            // Folder a's rows are still in the push transaction: the host commits last.
            expect(db.events[db.events.length - 1]).toEqual({ instance: host.id, op: 'commit' });
        });

        it('rolls back the shared directories when an isolated one has already committed', async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1')], isolated: true },
                { name: 'b', records: [{ Name: 'b1', Behavior: 'update' }] },
                { name: 'c', records: [{ Name: 'c1', Behavior: 'throw' }] },
            ]);
            const { callbacks } = collectCallbacks();
            const failure = await service.push({ dir: root }, callbacks).catch((e: unknown) => e);

            const aborted = failure as PushAbortedError;
            expect(aborted.modes.sort()).toEqual(['isolated', 'shared']);
            // a committed on its own instance; b was in the push transaction and is gone.
            expect(db.committed).toEqual(['a1']);
            expect(aborted.committedWrites.map((w) => w.recordPath)).toEqual(['Entity a[0]']);
            expect(aborted.NothingCommitted).toBe(false);
        });
    });

    describe('isolated transactions (--isolated-transactions)', () => {
        it('runs graphs in parallel on independent instances', async () => {
            service.delayMs = 5;
            await writeFixture(root, [{ name: 'a', records: [ok('a1'), ok('a2'), ok('a3')] }]);
            const { callbacks, warnings } = collectCallbacks();
            await service.push({ dir: root, isolatedTransactions: true }, callbacks);

            expect(service.maxActive).toBe(3);
            // One probe plus one instance per graph.
            expect(db.independentCreated).toBe(4);
            expect(warnings.some((w) => /Isolated transactions/.test(w))).toBe(true);
        });

        it('reports what stayed committed instead of claiming a clean rollback', async () => {
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), { Name: 'a2', Behavior: 'update' }] },
                { name: 'b', records: [{ Name: 'b1', Behavior: 'throw' }] },
            ]);
            const { callbacks, warnings } = collectCallbacks();
            const failure = await service.push({ dir: root, isolatedTransactions: true }, callbacks).catch((e: unknown) => e);

            expect(failure).toBeInstanceOf(PushAbortedError);
            const aborted = failure as PushAbortedError;
            expect(aborted.NothingCommitted).toBe(false);
            expect(aborted.committedWrites.map((w) => `${w.status} ${w.recordPath}`)).toEqual([
                'created Entity a[0]',
                'updated Entity a[1]',
            ]);
            expect(db.committed).toEqual(['a1', 'a2']);
            expect(warnings.join('\n')).not.toMatch(/rolled back successfully/);
            expect(warnings.some((w) => /2 created or updated records in directories using isolated transactions/.test(w))).toBe(true);
            expect(host.TransactionDepth).toBe(0);
            // Folder a's records stay committed, so its written-back file is kept.
            expect((await readRecords(root, 'a'))[0].fields.Pushed).toBe(true);
        });

        it('keeps a deletions file that already committed records, so the next push does not duplicate them', async () => {
            // The file's write is deferred to phase 3 (deletion timestamps), which a failed push
            // never reaches. Its creates are committed all the same, so the file has to keep them.
            await writeFixture(root, [
                { name: 'a', records: [ok('a1'), { Name: 'gone', Behavior: 'create', Delete: true }], isolated: true },
                { name: 'b', records: [{ Name: 'b1', Behavior: 'throw' }] },
            ]);
            const { callbacks } = collectCallbacks();
            await service.push({ dir: root }, callbacks).catch(() => undefined);

            expect(db.committed).toEqual(['a1']);
            const kept = await readRecords(root, 'a');
            expect(kept[0].fields.Pushed).toBe(true);
        });

        it('reports a write that settled even when the graph is rolled back afterwards', async () => {
            // A save that settled its own scope is committed. If the graph later rolls back leftover
            // depth, that earlier row is still there and must stay in the report.
            db.leftoverDepthAfter = 'b1';
            await writeFixture(root, [
                {
                    name: 'a',
                    // One graph, two records: the first settles, the second leaves depth behind.
                    records: [{ ...ok('a1'), Graph: 'shared' }, { Name: 'b1', Behavior: 'update', Graph: 'shared' }],
                    isolated: true,
                },
                { name: 'b', records: [{ Name: 'c1', Behavior: 'throw' }] },
            ]);
            const { callbacks } = collectCallbacks();
            const failure = await service.push({ dir: root }, callbacks).catch((e: unknown) => e);

            const aborted = failure as PushAbortedError;
            expect(aborted.committedWrites.map((w) => w.recordPath)).toContain('Entity a[0]');
            expect(aborted.NothingCommitted).toBe(false);
        });

        it('runs everything in the shared transaction when independent instances are not available', async () => {
            db.independentUnavailable = true;
            await writeFixture(root, [{ name: 'a', records: [ok('a1'), ok('a2')] }]);
            const { callbacks, warnings } = collectCallbacks();
            await service.push({ dir: root, isolatedTransactions: true }, callbacks);

            expect(warnings.some((w) => /every directory runs in the shared/.test(w))).toBe(true);
            expect(db.events.filter((e) => e.op === 'commit')).toEqual([{ instance: host.id, op: 'commit' }]);
        });
    });
});
