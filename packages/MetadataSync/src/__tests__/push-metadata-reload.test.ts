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
    TransactionDepth = 0;
    readonly PlatformKey = 'sqlserver';

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}

    IsMetadataDatasetMember(entityName: string): boolean {
        return entityName.trim().toLowerCase() === 'mj: authorizations';
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

import { PushService } from '../services/PushService';
import { PushAbortedError } from '../lib/push-outcome';

class ReloadProbe extends PushService {
    protected override async processFlattenedRecord(
        flattenedRecord: FlattenedRecord,
        _entityDir: string,
        _options: PushOptions,
        _batchContext: BatchContext,
        _callbacks?: PushCallbacks,
        _entityConfig?: EntityConfig,
        _allowDefer: boolean = true,
        _recordProvider?: IMetadataProvider
    ) {
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
        return { status: 'created' as const };
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

type Folder = { name: string; records: Array<Record<string, unknown>> };

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
        await fs.writeJson(path.join(dir, '.records.json'), folder.records.map((fields) => ({ fields })));
    }
}

describe('PushService reloads metadata between directories (MJ#4836)', () => {
    let root: string;
    let service: ReloadProbe;

    beforeEach(async () => {
        host = new Host();
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
});
