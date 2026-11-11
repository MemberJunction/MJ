import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import { CloneContext, RestoreContext, SyncContext, SerializeSyncChangeContext } from '../generic/baseEntity';
import { EntityInfo, UserInfo } from '../index';

class ConcreteTestProvider extends DatabaseProviderBase {
    protected get UUIDFunctionPattern(): RegExp { return /^\s*newid\s*\(\s*\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^\s*getdate\s*\(\s*\)$/i; }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, obj: string): string { return `[${schema}].[${obj}]`; }
    protected BuildChildDiscoverySQL(): string { return ''; }
    protected BuildHardLinkDependencySQL(): string { return ''; }
    protected BuildSoftLinkDependencySQL(): string { return ''; }
    protected async GenerateSaveSQL() { return { fullSQL: '' }; }
    protected GenerateDeleteSQL() { return { fullSQL: '' }; }
    protected BuildRecordChangeSQL() { return null; }
    protected BuildSiblingRecordChangeSQL(): string { return ''; }
    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec() { throw new Error('Not supported'); }

    // Exposure for testing protected method
    public TestBuildRecordChangePayload(
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        recordID: string,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
        restoreContext?: RestoreContext | null,
        quoteToEscape: string = "'",
        cloneContext?: CloneContext | null,
        syncContext?: SyncContext | null,
    ) {
        return this.BuildRecordChangePayload(
            newData,
            oldData,
            recordID,
            entityInfo,
            type,
            user,
            restoreContext,
            quoteToEscape,
            cloneContext,
            syncContext,
        );
    }
}

describe('BuildRecordChangePayload — CloneContext & SyncContext (§10.3)', () => {
    const provider = new ConcreteTestProvider();
    const mockEntityInfo = {
        ID: 'ENT-001',
        Name: 'TestEntity',
        BaseTable: 'TestEntity',
        FieldByName: (name: string) => ({ Name: name, CodeName: name }),
    } as unknown as EntityInfo;

    const mockUser = {
        ID: 'USER-001',
        Name: 'testuser',
        Email: 'test@example.com',
    } as unknown as UserInfo;

    const sampleCloneContext: CloneContext = {
        CloneLogID: 'CLONE-LOG-001',
        SourceEntityName: 'TestEntity',
        SourceRecordID: 'REC-001',
        RootEntityName: 'TestEntity',
        RootSourceRecordID: 'REC-001',
        RootTargetRecordID: 'REC-002',
        Depth: 0,
        Route: 'RootSave',
        FieldChangeSummary: [{ Kind: 'Carried', Fields: ['Name', 'Description'] }],
        Reason: 'Cloning user test',
    };

    const sampleRestoreContext: RestoreContext = {
        SourceChangeID: 'CHANGE-999',
        Reason: 'Reverting accidental delete',
    };

    const sampleSyncContext: SyncContext = {
        OriginDeploymentID: 'DEPLOY-PEER-A',
        PairingID: 'PAIR-001',
        RunID: 'RUN-001',
        OriginChangeIDs: ['CHG-101', 'CHG-102'],
        OriginUserEmail: 'alice@example.com',
        IntegrationID: 'INT-MJ-PEER',
    };

    it('sets Source to "Clone" and serializes structured ChangeContext JSON', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'REC-002', Name: 'Cloned' },
            null,
            'REC-002',
            mockEntityInfo,
            'Create',
            mockUser,
            null,
            "'",
            sampleCloneContext,
        );

        expect(payload).not.toBeNull();
        expect(payload!.source).toBe('Clone');
        expect(payload!.changeContext).not.toBeNull();

        const parsed = JSON.parse(payload!.changeContext!);
        expect(parsed).toEqual({
            Version: 1,
            Kind: 'Clone',
            Clone: sampleCloneContext,
        });
    });

    it('sets Source to "Sync", populates integrationID, and serializes structured Sync ChangeContext JSON', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'REC-003', Name: 'Synced' },
            null,
            'REC-003',
            mockEntityInfo,
            'Create',
            mockUser,
            null,
            "'",
            null,
            sampleSyncContext,
        );

        expect(payload).not.toBeNull();
        expect(payload!.source).toBe('Sync');
        expect(payload!.integrationID).toBe('INT-MJ-PEER');
        expect(payload!.changeContext).toBe(SerializeSyncChangeContext(sampleSyncContext));

        const parsed = JSON.parse(payload!.changeContext!);
        expect(parsed).toEqual({
            Version: 1,
            Kind: 'Sync',
            Sync: {
                OriginDeploymentID: 'DEPLOY-PEER-A',
                PairingID: 'PAIR-001',
                RunID: 'RUN-001',
                OriginChangeIDs: ['CHG-101', 'CHG-102'],
                OriginUserEmail: 'alice@example.com',
            },
        });
    });

    it('throws when multiple contexts (restoreContext, cloneContext, syncContext) are provided', () => {
        expect(() => {
            provider.TestBuildRecordChangePayload(
                { ID: 'REC-002' },
                null,
                'REC-002',
                mockEntityInfo,
                'Create',
                mockUser,
                sampleRestoreContext,
                "'",
                sampleCloneContext,
            );
        }).toThrow(/mutually exclusive/);

        expect(() => {
            provider.TestBuildRecordChangePayload(
                { ID: 'REC-002' },
                null,
                'REC-002',
                mockEntityInfo,
                'Create',
                mockUser,
                null,
                "'",
                sampleCloneContext,
                sampleSyncContext,
            );
        }).toThrow(/mutually exclusive/);
    });

    it('defaults to Internal with null changeContext when none is provided', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'REC-002' },
            null,
            'REC-002',
            mockEntityInfo,
            'Create',
            mockUser,
            null,
            "'",
            null,
        );

        expect(payload).not.toBeNull();
        expect(payload!.source).toBe('Internal');
        expect(payload!.changeContext).toBeNull();
        expect(payload!.integrationID).toBeNull();
    });
});
