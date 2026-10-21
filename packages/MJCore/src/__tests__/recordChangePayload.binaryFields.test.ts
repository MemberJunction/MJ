/**
 * Binary fields in Record Changes.
 *
 * A binary field's value is base64 above the database — an embedding, a file, possibly megabytes.
 * The record snapshot (`FullRecordJSON`) keeps it verbatim: restore and the version views read
 * that. The per-field diff (`ChangesJSON`) records its SIZE instead, so a tracked update does not
 * carry the bytes twice more, and the change description stays readable.
 */
import { describe, it, expect } from 'vitest';
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

const ENTITY_ID = 'entity-documents';
/** A real EntityInfo (so FieldByName / IsBinaryFieldType / ReadOnly are production code). */
function documents(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Documents', SchemaName: 'dbo', BaseTable: 'Document', BaseView: 'vwDocuments', IncludeInAPI: true, AllowCaching: true,
        Fields: [
            { ID: 'f-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Documents', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: 'f-name', EntityID: ENTITY_ID, Sequence: 2, Name: 'Name', Entity: 'Documents', Type: 'nvarchar', Length: 200, AllowUpdateAPI: true },
            { ID: 'f-vec', EntityID: ENTITY_ID, Sequence: 3, Name: 'VectorBinary', Entity: 'Documents', Type: 'varbinary', Length: -1, AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'f-json', EntityID: ENTITY_ID, Sequence: 4, Name: 'VectorJSON', Entity: 'Documents', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true },
        ],
    });
}
const user = { ID: 'user-1', Name: 'tester' } as unknown as UserInfo;
const THREE = 'AQID';      // 3 bytes
const FOUR = 'AQIDBA==';   // 4 bytes
const BIG = 'A'.repeat(8192); // 6,144 bytes — a 1,536-dimension float32 vector

describe('DiffObjects and binary fields', () => {
    const provider = new ConcreteTestProvider();
    const entity = documents();

    it('records a changed binary field by size, never by content', () => {
        const changes = provider.DiffObjects({ VectorBinary: THREE }, { VectorBinary: BIG }, entity, "'")!;
        expect(changes.VectorBinary).toEqual({ field: 'VectorBinary', oldValue: '[binary: 3 bytes]', newValue: '[binary: 6,144 bytes]' });
        expect(JSON.stringify(changes)).not.toContain(BIG);
    });

    it('leaves an unchanged binary field out of the diff, as any unchanged field', () => {
        expect(provider.DiffObjects({ Name: 'a', VectorBinary: FOUR }, { Name: 'b', VectorBinary: FOUR }, entity, "'")).toEqual({
            Name: { field: 'Name', oldValue: 'a', newValue: 'b' },
        });
    });

    it('passes null through on either side, so a first embedding and a cleared one are both visible', () => {
        expect(provider.DiffObjects({ VectorBinary: null }, { VectorBinary: FOUR }, entity, "'")!.VectorBinary)
            .toEqual({ field: 'VectorBinary', oldValue: null, newValue: '[binary: 4 bytes]' });
        expect(provider.DiffObjects({ VectorBinary: FOUR }, { VectorBinary: null }, entity, "'")!.VectorBinary)
            .toEqual({ field: 'VectorBinary', oldValue: '[binary: 4 bytes]', newValue: null });
    });

    it('does not touch non-binary fields: the JSON vector column is still diffed verbatim, quotes escaped', () => {
        const changes = provider.DiffObjects({ VectorJSON: "[1,'x']" }, { VectorJSON: '[2]' }, entity, "'")!;
        expect(changes.VectorJSON).toEqual({ field: 'VectorJSON', oldValue: "[1,''x'']", newValue: '[2]' });
    });

    it('yields a readable change description', () => {
        const changes = provider.DiffObjects({ VectorBinary: THREE }, { VectorBinary: FOUR }, entity, "'")!;
        expect(provider.CreateUserDescriptionOfChanges(changes)).toBe('VectorBinary changed from [binary: 3 bytes] to [binary: 4 bytes]');
    });
});

describe('BuildRecordChangePayload and binary fields', () => {
    const provider = new ConcreteTestProvider();
    const entity = documents();

    it('on an update, ChangesJSON carries the size while FullRecordJSON keeps the bytes for restore', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'r1', Name: 'Doc', VectorBinary: BIG, VectorJSON: '[0.1]' },
            { ID: 'r1', Name: 'Doc', VectorBinary: THREE, VectorJSON: '[0.0]' },
            entity, 'Update', user,
        )!;
        expect(payload.changesJSON).toContain('[binary: 6,144 bytes]');
        expect(payload.changesJSON).not.toContain(BIG);
        expect(payload.fullRecordJSON).toContain(`"VectorBinary":"${BIG}"`);
        expect(payload.changesDescription).toContain('VectorBinary changed from [binary: 3 bytes] to [binary: 6,144 bytes]');
    });

    it('on a create, the snapshot keeps the bytes and there is no diff to mask', () => {
        const payload = provider.TestBuildRecordChangePayload(
            { ID: 'r1', Name: 'Doc', VectorBinary: FOUR, VectorJSON: null }, null, entity, 'Create', user,
        )!;
        expect(payload.fullRecordJSON).toContain(`"VectorBinary":"${FOUR}"`);
        expect(payload.changesJSON).toBe('');
    });
});
