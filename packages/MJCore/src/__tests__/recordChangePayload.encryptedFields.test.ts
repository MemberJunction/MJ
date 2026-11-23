/**
 * Encrypted fields in Record Changes.
 *
 * A field with `Encrypt` set never appears in clear text in a Record Change: the diff, the change
 * description and the record snapshot carry the encrypted-value sentinel instead.
 */
import { describe, it, expect } from 'vitest';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import { DatabaseProviderBase } from '../generic/databaseProviderBase';
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

    public TestBuildRecordChangePayload(
        newData: Record<string, unknown> | null,
        oldData: Record<string, unknown> | null,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
    ) {
        return this.BuildRecordChangePayload(newData, oldData, '', entityInfo, type, user);
    }
}

const ENTITY_ID = 'entity-integrations';
function integrations(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Integrations', SchemaName: 'dbo', BaseTable: 'Integration', BaseView: 'vwIntegrations', IncludeInAPI: true, AllowCaching: true,
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Integrations', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Integrations', Type: 'nvarchar', Length: 200, AllowUpdateAPI: true },
            { ID: 'f-token', EntityID: ENTITY_ID, Sequence: 3, Name: 'AccessToken', Entity: 'Integrations', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true, Encrypt: true, EncryptionKeyID: 'key-1' },
        ],
    });
}
const user = { ID: 'user-1', Name: 'tester' } as unknown as UserInfo;
const OLD_MARKER = 'old-marker-value';
const NEW_MARKER = 'new-marker-value';

describe('BuildRecordChangePayload and encrypted fields', () => {
    const provider = new ConcreteTestProvider();
    const entity = integrations();

    it('keeps the clear text of an encrypted field out of an update change record', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'r1', Name: 'Svc', AccessToken: NEW_MARKER },
            { ID: 'r1', Name: 'Svc', AccessToken: OLD_MARKER },
            entity, 'Update', user,
        )!;
        for (const text of [payload.changesJSON, payload.changesDescription, payload.fullRecordJSON]) {
            expect(text).not.toContain(OLD_MARKER);
            expect(text).not.toContain(NEW_MARKER);
        }
        expect(JSON.parse(payload.changesJSON).AccessToken).toEqual({ field: 'AccessToken', oldValue: ENCRYPTED_SENTINEL, newValue: ENCRYPTED_SENTINEL });
    });

    it('keeps the clear text of an encrypted field out of a delete snapshot', () => {
        const payload = provider.TestBuildRecordChangePayload(null, { ID: 'r1', Name: 'Svc', AccessToken: OLD_MARKER }, entity, 'Delete', user)!;
        expect(payload.fullRecordJSON).not.toContain(OLD_MARKER);
        expect(JSON.parse(payload.fullRecordJSON).AccessToken).toBe(ENCRYPTED_SENTINEL);
    });

    it('keeps the clear text of an encrypted field out of a create snapshot', () => {
        const payload = provider.TestBuildRecordChangePayload({ ID: 'r1', Name: 'Svc', AccessToken: NEW_MARKER }, null, entity, 'Create', user)!;
        expect(payload.fullRecordJSON).not.toContain(NEW_MARKER);
        expect(JSON.parse(payload.fullRecordJSON).Name).toBe('Svc');
    });
});
