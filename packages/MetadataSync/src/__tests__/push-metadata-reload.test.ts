/**
 * mj sync push reloads metadata inside its transaction between directories (MJ#4836).
 * The host provider is a fake: what is under test is when PushService calls
 * RefreshWithinTransaction and Refresh, not the database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { RecordData, BatchContext, SyncEngine } from '../lib/sync-engine';
import type { EntityConfig } from '../config';
import type { PushCallbacks, PushOptions } from '../services/PushService';

class Host {
    events: string[] = [];
    /** Entity names passed to IsMetadataDatasetMember, in call order. */
    membershipChecks: string[] = [];
    TransactionDepth = 0;
    readonly PlatformKey = 'sqlserver';

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    IsMetadataDatasetMember(entityName: string): boolean {
        this.membershipChecks.push(entityName);
        const name = entityName.trim().toLowerCase();
        return name === 'mj: authorizations' || name === 'mj: entities';
    }

    async RefreshWithinTransaction(): Promise<boolean> {
        this.events.push('refresh');
        return true;
    }

    async Refresh(): Promise<boolean> {
        this.events.push('pool-refresh');
        return true;
    }
}

let host = new Host();
/** When set, the deletion-auditor mock reports this one record for Phase 2. */
let plannedDeletion: FlattenedRecord | undefined;

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        static get Provider(): Host {
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
        getCachedFile(): undefined { return undefined; }
        cacheFile(): void {}
        invalidateCachedFile(): void {}
        setEntityDirs(): void {}
        async Config(): Promise<void> {}
        drainWarnings(): string[] { return []; }
        getDelegationSummary(): never[] { return []; }
        removeEntityFromCache(): void {}
    },
}));

vi.mock('../lib/entity-subclass-guard', () => ({ describeMissingEntitySubclass: () => undefined }));

vi.mock('../lib/record-dependency-analyzer', async () => {
    const actual = await vi.importActual<typeof import('../lib/record-dependency-analyzer')>('../lib/record-dependency-analyzer');
    class FlatAnalyzer {
        private all: FlattenedRecord[] = [];
        reset(): void { this.all = []; }
        flattenFileRecords(records: RecordData[], entityName: string): FlattenedRecord[] {
            const flattened = this.flatten(records, entityName);
            this.all.push(...flattened);
            return flattened;
        }
        analyzeAllDependencies(records: FlattenedRecord[]) {
            return { sortedRecords: records, dependencyLevels: [records], circularDependencies: [] };
        }
        buildReverseDependencyMap(): Map<string, string[]> { return new Map(); }
        reverseTopologicalSort(records: FlattenedRecord[]): FlattenedRecord[][] { return [records]; }
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
                graphId: `${entityName}-g${i}`,
            }));
        }
    }
    return { ...actual, RecordDependencyAnalyzer: FlatAnalyzer };
});

vi.mock('../lib/deletion-auditor', () => ({
    DeletionAuditor: class {
        async auditDeletions() {
            const record = plannedDeletion;
            return {
                explicitDeletes: new Map(record ? [[record.id, record]] : []),
                implicitDeletes: new Map(),
                alreadyDeleted: new Map(),
                databaseOnlyReferences: [],
                databaseOnlyDeletions: [],
                reverseDependencies: new Map(),
                deletionLevels: record ? [[record]] : [],
                circularDependencies: [],
                orphanedReferences: [],
            };
        }
    },
}));

import { PushService } from '../services/PushService';
import { PushAbortedError } from '../lib/push-outcome';

class ReloadProbe extends PushService {
    protected override async processFlattenedRecord(
        flattenedRecord: FlattenedRecord,
        entityDir: string,
        _options: PushOptions,
        _batchContext: BatchContext,
        _callbacks?: PushCallbacks,
        entityConfig?: EntityConfig,
        allowDefer: boolean = true,
        _recordProvider?: IMetadataProvider
    ) {
        if (flattenedRecord.record.deleteRecord?.delete === true) {
            return { status: 'skipped' as const }; // Phase 2 owns deletes
        }
        const name = String(flattenedRecord.record.fields?.Name ?? '');
        host.events.push(`save:${name}`);
        // A nested relatedEntities row is recorded under its own entity name, not the directory's.
        if (flattenedRecord.record.fields?.TouchesMetadata === true) {
            this.changeDetails.push({
                entityName: 'MJ: Authorizations',
                primaryKey: 'ID: new',
                Operation: 'created',
                fields: [],
            });
        }
        if (flattenedRecord.record.fields?.Behavior === 'throw') {
            throw new Error(`boom at ${name}`);
        }
        if (flattenedRecord.record.fields?.Behavior === 'defer') {
            if (allowDefer) {
                return {
                    status: 'deferred' as const,
                    deferredRecord: { flattenedRecord, entityDir, entityConfig: entityConfig as EntityConfig },
                };
            }
            return { status: 'updated' as const };
        }
        return { status: 'created' as const };
    }
}

function makeSyncEngine(): SyncEngine {
    const stub = {
        setMetadataEngine: vi.fn(),
        getProvider: () => host,
        calculateChecksum: () => 'checksum',
        WarningSink: undefined,
        getEntityInfo: () => ({ PrimaryKeys: [{ Name: 'ID' }] }),
        loadEntity: async () => ({
            Get: () => 'id-1',
            Delete: async () => {
                host.events.push('delete:metadata');
                return true;
            },
        }),
    };
    return stub as unknown as SyncEngine;
}

type Folder = { name: string; records: Array<Record<string, unknown>>; includeDelete?: boolean };

async function writeFixture(root: string, folders: Folder[]): Promise<void> {
    await fs.writeJson(path.join(root, '.mj-sync.json'), {
        version: '1.0.0',
        push: { autoCreateMissingRecords: true },
        directoryOrder: folders.map((folder) => folder.name),
    });
    for (const folder of folders) {
        const dir = path.join(root, folder.name);
        await fs.ensureDir(dir);
        await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: `Entity ${folder.name}` });
        const rows: unknown[] = folder.records.map((fields) => ({ fields }));
        if (folder.includeDelete) {
            rows.push({
                primaryKey: { ID: 'del-1' },
                fields: { Name: 'gone' },
                deleteRecord: { delete: true },
            });
        }
        await fs.writeJson(path.join(dir, '.records.json'), rows);
    }
}

describe('PushService reloads metadata between directories (MJ#4836)', () => {
    let root: string;
    let service: ReloadProbe;

    beforeEach(async () => {
        host = new Host();
        plannedDeletion = undefined;
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-reload-'));
        service = new ReloadProbe(makeSyncEngine(), {} as UserInfo);
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it('reloads once after a directory writes MJ: Authorizations, before the next directory saves', async () => {
        await writeFixture(root, [
            { name: 'a', records: [{ Name: 'a1', TouchesMetadata: true }] },
            { name: 'b', records: [{ Name: 'b1' }] },
        ]);
        await service.push({ dir: root }, {});

        const secondSave = host.events.indexOf('save:b1');
        expect(host.events.slice(0, secondSave)).toEqual(['save:a1', 'refresh']);
        expect(host.events.filter((event) => event === 'refresh')).toEqual(['refresh']);
        expect(host.events).not.toContain('pool-refresh');
    });

    it('does not reload when the push touches no metadata entity', async () => {
        await writeFixture(root, [
            { name: 'a', records: [{ Name: 'a1' }] },
            { name: 'b', records: [{ Name: 'b1' }] },
        ]);
        await service.push({ dir: root }, {});

        expect(host.events).toEqual(['save:a1', 'save:b1']);
    });

    it('does not reload on a dry run, even when a directory would write metadata', async () => {
        await writeFixture(root, [
            { name: 'a', records: [{ Name: 'a1', TouchesMetadata: true }] },
            { name: 'b', records: [{ Name: 'b1' }] },
        ]);
        await service.push({ dir: root, dryRun: true }, {});

        expect(host.events.filter((event) => event === 'refresh')).toEqual([]);
        expect(host.events).not.toContain('pool-refresh');
        expect(host.events).toContain('save:a1');
        expect(host.events).toContain('save:b1');
    });

    it('reloads from the pool after a rollback, so uncommitted metadata is dropped', async () => {
        await writeFixture(root, [
            { name: 'a', records: [{ Name: 'a1', TouchesMetadata: true }] },
            { name: 'b', records: [{ Name: 'b1', Behavior: 'throw' }] },
        ]);
        const failure = await service.push({ dir: root }, {}).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(PushAbortedError);
        const secondSave = host.events.indexOf('save:b1');
        expect(host.events.slice(0, secondSave)).toEqual(['save:a1', 'refresh']);
        expect(host.events).toContain('pool-refresh');
        expect(host.events.indexOf('pool-refresh')).toBeGreaterThan(secondSave);
    });

    it('does not reload again at the start of Phase 2, and reloads before Phase 2.5 when a later deletion touches metadata', async () => {
        plannedDeletion = {
            record: {
                primaryKey: { ID: 'del-1' },
                fields: { Name: 'gone' },
                deleteRecord: { delete: true },
            },
            entityName: 'MJ: Entities',
            depth: 0,
            path: 'MJ: Entities[0]',
            dependencies: new Set<string>(),
            id: 'del-1',
            originalIndex: 0,
            graphId: 'del-g0',
        };
        await writeFixture(root, [
            {
                name: 'a',
                includeDelete: true,
                records: [
                    { Name: 'a1', TouchesMetadata: true },
                    { Name: 'later', Behavior: 'defer' },
                ],
            },
        ]);
        await service.push({ dir: root }, {});

        // One refresh after the directory. None before the deletion. One more after it,
        // before the deferred pass — and that check is the deletion, not the directory write.
        expect(host.events).toEqual([
            'save:a1',
            'save:later',
            'refresh',
            'delete:metadata',
            'refresh',
            'save:later',
        ]);
        expect(host.membershipChecks).toEqual(['MJ: Authorizations', 'MJ: Entities']);
    });
});
