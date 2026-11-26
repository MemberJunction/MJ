import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import { BaseEntity, CloneContext, RestoreContext, SyncContext, SerializeSyncChangeContext } from '../generic/baseEntity';
import { EntityInfo, UserInfo } from '../index';

class ConcreteTestProvider extends DatabaseProviderBase {
    public LastSiblingArgs: {
        source?: string;
        changeContext?: string | null;
        integrationID?: string | null;
    } | null = null;

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
    protected BuildSiblingRecordChangeSQL(
        _varName: string,
        _entityInfo: EntityInfo,
        _safeChangesJSON: string,
        _safeChangesDesc: string,
        _safePKValue: string,
        _safeUserId: string,
        source?: string,
        changeContext?: string | null,
        integrationID?: string | null,
    ): string {
        this.LastSiblingArgs = { source, changeContext, integrationID };
        return 'SELECT 1;';
    }
    async ExecuteSQL<T>(): Promise<Array<T>> { return []; }
    async BeginTransaction(): Promise<void> {}
    async CommitTransaction(): Promise<void> {}
    async RollbackTransaction(): Promise<void> {}
    protected async InternalExecuteQueryFromSpec() { throw new Error('Not supported'); }

    public async TestPropagateSibling(
        parentInfo: EntityInfo,
        source: 'Internal' | 'Clone' | 'Sync',
        changeContext: string | null,
        integrationID: string | null,
    ): Promise<void> {
        await this.PropagateRecordChangesToSiblings(
            parentInfo,
            { changesJSON: '{}', changesDescription: 'test' },
            'pk-1',
            'u-1',
            undefined,
            undefined,
            source,
            changeContext,
            integrationID,
        );
    }

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
            false,
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

    it('appends actor attribution to changesDescription when user carries ImpersonationContext (PR #6958)', () => {
        const impersonatedUser = new UserInfo(null, {
            ID: 'TARGET-USER-001',
            Name: 'Bob Analyst',
            Email: 'bob@example.com',
        });
        impersonatedUser.ImpersonationContext = {
            ActorUserID: 'ACTOR-ADMIN-001',
            TargetUserID: 'TARGET-USER-001',
            APIKeyID: 'KEY-IMP-001',
            Mode: 'ActAs',
        };

        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'REC-010', Name: 'Updated During Impersonation' },
            { ID: 'REC-010', Name: 'Before' },
            'REC-010',
            mockEntityInfo,
            'Update',
            impersonatedUser,
        );

        expect(payload).not.toBeNull();
        expect(payload!.changesDescription).toContain(
            '[Impersonated by ActorUserID=ACTOR-ADMIN-001, APIKeyID=KEY-IMP-001, Mode=ActAs]'
        );

        const normalPayload = provider.TestBuildRecordChangePayload(
            { ID: 'REC-011', Name: 'Normal Update' },
            { ID: 'REC-011', Name: 'Before' },
            'REC-011',
            mockEntityInfo,
            'Update',
            mockUser,
        );
        expect(normalPayload).not.toBeNull();
        expect(normalPayload!.changesDescription).not.toContain('Impersonated by');
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

    it('accepts service-account SyncContext without OriginUserEmail and omits empty email in ChangeContext JSON', () => {
        class ConcreteTestEntity extends BaseEntity {}
        const entity = new ConcreteTestEntity(mockEntityInfo);

        const serviceAccountContext: SyncContext = {
            OriginDeploymentID: 'DEPLOY-SERVICE-A',
            PairingID: 'PAIR-SVC-01',
            RunID: 'RUN-SVC-01',
            OriginChangeIDs: ['CHG-SVC-1'],
        };

        expect(() => entity.SetSyncContext(serviceAccountContext)).not.toThrow();
        expect(entity.SyncContext).toEqual(serviceAccountContext);

        const serialized = JSON.parse(SerializeSyncChangeContext(serviceAccountContext));
        expect(serialized).toEqual({
            Version: 1,
            Kind: 'Sync',
            Sync: {
                OriginDeploymentID: 'DEPLOY-SERVICE-A',
                PairingID: 'PAIR-SVC-01',
                RunID: 'RUN-SVC-01',
                OriginChangeIDs: ['CHG-SVC-1'],
            },
        });
        expect('OriginUserEmail' in serialized.Sync).toBe(false);
    });

    it('forwards integrationID through PropagateRecordChangesToSiblings into BuildSiblingRecordChangeSQL', async () => {
        const siblingChild = {
            ID: 'CHILD-ENT-1',
            Name: 'SiblingChild',
            TrackRecordChanges: true,
            ChildEntities: [],
        } as unknown as EntityInfo;
        const overlappingParent = {
            ID: 'PARENT-ENT-1',
            Name: 'OverlappingParent',
            TrackRecordChanges: true,
            ChildEntities: [siblingChild],
        } as unknown as EntityInfo;

        await provider.TestPropagateSibling(
            overlappingParent,
            'Sync',
            SerializeSyncChangeContext(sampleSyncContext),
            sampleSyncContext.IntegrationID ?? null,
        );
        expect(provider.LastSiblingArgs).toEqual({
            source: 'Sync',
            changeContext: SerializeSyncChangeContext(sampleSyncContext),
            integrationID: 'INT-MJ-PEER',
        });
    });
});
