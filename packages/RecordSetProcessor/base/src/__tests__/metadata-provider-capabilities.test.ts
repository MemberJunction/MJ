import { describe, it, expect } from 'vitest';
import {
    DatabaseProviderBase,
    type DatabasePlatform,
    type ExecuteSQLOptions,
    type IMetadataProvider,
    type PostCommitHookToken,
    type QueryParameterInfo,
    type SQLDialect,
    type SaveSQLResult,
} from '@memberjunction/core';
import { MetadataProviderCapabilities } from '../metadata-provider-capabilities';

class FakeDatabaseProvider extends DatabaseProviderBase {
    public CreatedInstances = 0;
    public ReleasedInstances = 0;
    private epoch: number | null = null;

    public override get PlatformKey(): DatabasePlatform { return 'sqlserver'; }
    public override get Dialect(): SQLDialect { throw new Error('unused'); }
    protected override get UUIDFunctionPattern(): RegExp { return /^$/; }
    protected override get DefaultFunctionPattern(): RegExp { return /^$/; }
    public override async ExecuteSQL<T>(_q?: string, _p?: unknown[], _o?: ExecuteSQLOptions): Promise<Array<T>> { return []; }
    public override async BeginTransaction(): Promise<void> { this.epoch = 1; }
    public override async CommitTransaction(): Promise<void> { this.epoch = null; }
    public override async RollbackTransaction(): Promise<void> { this.epoch = null; }
    public override CapturePostCommitToken(): PostCommitHookToken | null {
        return { Epoch: this.epoch };
    }
    protected override async GenerateSaveSQL(): Promise<SaveSQLResult> { return { fullSQL: '' }; }
    protected override GenerateDeleteSQL(): string { return ''; }
    protected override BuildChildDiscoverySQL(): string { return ''; }
    protected override BuildHardLinkDependencySQL(): string { return ''; }
    protected override BuildSoftLinkDependencySQL(): string { return ''; }
    protected override async GetViewDefinition(): Promise<string | null> { return null; }
    protected override async GetScopedRecordPermission(): Promise<string | null> { return null; }
    protected override async GetStoredProcedureParameters(): Promise<QueryParameterInfo[]> { return []; }
    public override async CreateIndependentInstance(): Promise<DatabaseProviderBase> {
        this.CreatedInstances++;
        const instance = new FakeDatabaseProvider();
        instance.ReleaseIndependentInstance = async () => {
            this.ReleasedInstances++;
        };
        return instance;
    }
}

describe('MetadataProviderCapabilities', () => {
    it('identifies transactional vs non-transactional providers', () => {
        const dbProvider = new FakeDatabaseProvider();
        const clientProvider = {} as IMetadataProvider;
        expect(MetadataProviderCapabilities.IsTransactionalProvider(dbProvider)).toBe(true);
        expect(MetadataProviderCapabilities.IsTransactionalProvider(clientProvider)).toBe(false);
    });

    it('runs isolated work on an independent instance for DatabaseProviderBase when not in a transaction, and releases it', async () => {
        const dbProvider = new FakeDatabaseProvider();
        let seenProvider: IMetadataProvider | undefined;
        const result = await MetadataProviderCapabilities.RunIsolated(dbProvider, async (unit) => {
            seenProvider = unit;
            return 'done';
        });
        expect(result).toBe('done');
        expect(seenProvider).not.toBe(dbProvider);
        expect(dbProvider.CreatedInstances).toBe(1);
        expect(dbProvider.ReleasedInstances).toBe(1);
    });

    it('reuses the caller provider when already inside a transaction or on a non-DatabaseProviderBase', async () => {
        const dbProvider = new FakeDatabaseProvider();
        await dbProvider.BeginTransaction();
        let seenInTx: IMetadataProvider | undefined;
        await MetadataProviderCapabilities.RunIsolated(dbProvider, async (unit) => {
            seenInTx = unit;
        });
        expect(seenInTx).toBe(dbProvider);
        expect(dbProvider.CreatedInstances).toBe(0);
        await dbProvider.CommitTransaction();

        const clientProvider = {} as IMetadataProvider;
        let seenClient: IMetadataProvider | undefined;
        await MetadataProviderCapabilities.RunIsolated(clientProvider, async (unit) => {
            seenClient = unit;
        });
        expect(seenClient).toBe(clientProvider);
    });
});
