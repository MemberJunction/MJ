import { describe, it, expect } from 'vitest';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
import { CloneContext, RestoreContext } from '../generic/baseEntity';
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
        );
    }
}

describe('BuildRecordChangePayload — CloneContext (§10.3)', () => {
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

    it('throws when both restoreContext and cloneContext are provided', () => {
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
        }).toThrow(/both restoreContext and cloneContext were provided/);
    });

    it('defaults to Internal with null changeContext when neither is provided', () => {
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
    });
});
