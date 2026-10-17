/**
 * mj sync push wires size-based SQL-log splitting through PushService (PR #3369):
 * the 90 MiB default reaches the logger, every part reaches the push result, a split is
 * announced with each part listed, and a failed push names a part that exists.
 * The host provider and its logging session are fakes: what is under test is what
 * PushService passes in and reports out, not the splitter (sql-logger.test.ts covers that).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { SqlLoggingOptions } from '@memberjunction/generic-database-provider';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { RecordData, BatchContext, SyncEngine } from '../lib/sync-engine';
import type { EntityConfig } from '../config';
import type { PushCallbacks, PushOptions } from '../services/PushService';

/** Stands in for SqlLoggingSessionImpl: after a split, FilePath is the first part, as in the real one. */
class FakeSession {
    readonly Id = 'fake-session';
    readonly StartTime = new Date();
    StatementCount = 0;
    private parts: string[];

    constructor(private readonly basePath: string, readonly Options: SqlLoggingOptions) {
        this.parts = [basePath];
    }

    get FilePath(): string {
        return this.parts[0];
    }

    get FilePaths(): string[] {
        return [...this.parts];
    }

    /** What a rotation does to the paths: the base file becomes part001 and parts follow it. */
    SplitInto(count: number): void {
        const parsed = path.parse(this.basePath);
        this.parts = Array.from({ length: count }, (_, i) =>
            path.join(parsed.dir, `${parsed.name}.part${String(i + 1).padStart(3, '0')}${parsed.ext}`)
        );
    }

    async Dispose(): Promise<void> {}
}

class Host {
    readonly PlatformKey = 'sqlserver';
    TransactionDepth = 0;
    session: FakeSession | undefined;

    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    IsMetadataDatasetMember(): boolean { return false; }
    async RefreshWithinTransaction(): Promise<boolean> { return true; }
    async Refresh(): Promise<boolean> { return true; }

    async CreateSqlLogger(filePath: string, options: SqlLoggingOptions): Promise<FakeSession> {
        this.session = new FakeSession(filePath, options);
        return this.session;
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
        removeEntityFromCache(): void {}
    },
}));

vi.mock('../lib/entity-subclass-guard', () => ({ DescribeMissingEntitySubclass: () => undefined, describeMissingEntitySubclass: () => undefined }));

vi.mock('../lib/record-dependency-analyzer', async () => {
    const actual = await vi.importActual<typeof import('../lib/record-dependency-analyzer')>('../lib/record-dependency-analyzer');
    class FlatAnalyzer {
        reset(): void {}
        flattenFileRecords(records: RecordData[], entityName: string): FlattenedRecord[] {
            return this.flatten(records, entityName);
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
            return {
                explicitDeletes: new Map(),
                implicitDeletes: new Map(),
                alreadyDeleted: new Map(),
                databaseOnlyReferences: [],
                databaseOnlyDeletions: [],
                reverseDependencies: new Map(),
                deletionLevels: [],
                circularDependencies: [],
                orphanedReferences: [],
            };
        }
    },
}));

import { PushService } from '../services/PushService';
import { PushAbortedError } from '../lib/push-outcome';
import { DEFAULT_SQL_LOG_MAX_FILE_SIZE } from '../config';

/** Each saved record "logs" one statement; `SplitInto` makes the session rotate, `Behavior: 'throw'` fails the push. */
class LoggingProbe extends PushService {
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
        const fields = flattenedRecord.record.fields ?? {};
        const session = host.session;
        if (session) {
            session.StatementCount++;
            if (typeof fields.SplitInto === 'number') {
                session.SplitInto(fields.SplitInto);
            }
        }
        if (fields.Behavior === 'throw') {
            throw new Error('boom');
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
    };
    return stub as unknown as SyncEngine;
}

async function writeFixture(root: string, records: Array<Record<string, unknown>>, sqlLogging: Record<string, unknown>): Promise<void> {
    await fs.writeJson(path.join(root, '.mj-sync.json'), {
        version: '1.0.0',
        push: { autoCreateMissingRecords: true },
        directoryOrder: ['a'],
        sqlLogging: { enabled: true, outputDirectory: './sql-log', ...sqlLogging },
    });
    const dir = path.join(root, 'a');
    await fs.ensureDir(dir);
    await fs.writeJson(path.join(dir, '.mj-sync.json'), { entity: 'Entity a' });
    await fs.writeJson(path.join(dir, '.records.json'), records.map((fields) => ({ fields })));
}

describe('PushService size-splits its SQL log capture (PR #3369)', () => {
    let root: string;
    let service: LoggingProbe;
    let logs: string[];
    const callbacks = (): PushCallbacks => ({ onLog: (message: string) => logs.push(message) });

    beforeEach(async () => {
        host = new Host();
        logs = [];
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-push-sql-parts-'));
        service = new LoggingProbe(makeSyncEngine(), {} as UserInfo);
    });

    afterEach(async () => {
        await fs.remove(root);
    });

    it('passes the 90 MiB default to the logger when maxFileSize is not configured', async () => {
        await writeFixture(root, [{ Name: 'r1' }], {});
        await service.push({ dir: root }, callbacks());

        expect(DEFAULT_SQL_LOG_MAX_FILE_SIZE).toBe(94371840);
        expect(host.session?.Options.maxFileSize).toBe(94371840);
    });

    it('passes a configured maxFileSize of 0 through, which turns splitting off', async () => {
        await writeFixture(root, [{ Name: 'r1' }], { maxFileSize: 0 });
        await service.push({ dir: root }, callbacks());

        expect(host.session?.Options.maxFileSize).toBe(0);
    });

    it('reports one path and prints no split notice when the capture fit in one file', async () => {
        await writeFixture(root, [{ Name: 'r1' }], {});
        const result = await service.push({ dir: root }, callbacks());

        const only = host.session!.FilePath;
        expect(result.sqlLogPaths).toEqual([only]);
        expect(result.sqlLogPath).toBe(only);
        expect(logs.some((line) => line.includes('SQL log split into'))).toBe(false);
    });

    it('reports every part and lists each one, numbered, when the capture split', async () => {
        await writeFixture(root, [{ Name: 'r1' }, { Name: 'r2', SplitInto: 3 }], { maxFileSize: 1024 * 1024 });
        const result = await service.push({ dir: root }, callbacks());

        const parts = host.session!.FilePaths;
        expect(parts).toHaveLength(3);
        expect(parts[0]).toMatch(/\.part001\.sql$/);
        expect(result.sqlLogPaths).toEqual(parts);
        expect(result.sqlLogPath).toBe(parts[0]);

        const notice = logs.indexOf('📝 SQL log split into 3 parts (each ≤ ~1.0 MiB unless a single statement exceeds it):');
        expect(notice).toBeGreaterThanOrEqual(0);
        expect(logs.slice(notice + 1, notice + 4)).toEqual([
            `   1. ${parts[0]}`,
            `   2. ${parts[1]}`,
            `   3. ${parts[2]}`,
        ]);
    });

    it('names the first part on a failed push after a split, not the base path the rotation renamed away', async () => {
        await writeFixture(root, [{ Name: 'r1', SplitInto: 2 }, { Name: 'r2', Behavior: 'throw' }], {});
        const failure = await service.push({ dir: root }, callbacks()).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(PushAbortedError);
        const parts = host.session!.FilePaths;
        expect((failure as PushAbortedError).sqlLogPath).toBe(parts[0]);
        expect(parts[0]).toMatch(/\.part001\.sql$/);
    });
});
