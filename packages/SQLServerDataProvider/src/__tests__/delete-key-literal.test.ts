import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityFieldInfo, EntityFieldTSType, EntityInfo, UserInfo } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';

type DeleteSQLGenerator = {
    GetDeleteSQLWithDetails(entity: BaseEntity, user: UserInfo): { fullSQL: string; simpleSQL: string };
    GetLogRecordChangeSQL(
        newData: unknown,
        oldData: unknown,
        entityName: string,
        recordID: unknown,
        entityInfo: EntityInfo,
        type: 'Create' | 'Update' | 'Delete',
        user: UserInfo,
        wrapRecordIdInQuotes: boolean,
    ): string | null;
};

const USER = { ID: 'user-1' } as UserInfo;
const UUID_KEY = '11111111-1111-1111-1111-111111111111';

/** A provider with the state these builders read and nothing else. */
function createGenerator(): DeleteSQLGenerator {
    const generator = Object.create(SQLServerDataProvider.prototype);
    Object.defineProperty(generator, 'Entities', { value: [] });
    Object.defineProperty(generator, 'MJCoreSchemaName', { value: '__mj' });
    generator.getAllEntityColumnsSQL = () => 'ID uniqueidentifier';
    generator.BuildRecordChangePayload = () => ({
        type: 'Delete',
        userID: USER.ID,
        changesJSON: '{}',
        changesDescription: 'deleted',
        fullRecordJSON: '{}',
    });
    return generator as DeleteSQLGenerator;
}

function keyField(name: string, tsType: EntityFieldTSType): EntityFieldInfo {
    return { Name: name, CodeName: name, TSType: tsType, NeedsQuotes: tsType === EntityFieldTSType.String, UnicodePrefix: '', SQLFullType: 'uniqueidentifier' } as EntityFieldInfo;
}

/** An entity holding the key exactly as a caller supplied it, which is what `PrimaryKey` returns after a load. */
function createEntity(fields: EntityFieldInfo[], values: unknown[], trackRecordChanges = false): BaseEntity {
    const pairs = fields.map((f, i) => ({ FieldName: f.Name, Value: values[i] }));
    return {
        EntityInfo: { Name: 'Widgets', SchemaName: 'dbo', BaseTableCodeName: 'T', spDelete: 'spDeleteT', Fields: fields, TrackRecordChanges: trackRecordChanges },
        PrimaryKey: {
            KeyValuePairs: pairs,
            ToConcatenatedString: () => pairs.map((p) => `${p.FieldName}|${p.Value}`).join('||'),
        },
        PrimaryKeys: fields.map((f) => ({ Name: f.Name, CodeName: f.CodeName, EntityFieldInfo: f })),
        GetAll: () => ({}),
    } as unknown as BaseEntity;
}

describe('SQLServerDataProvider delete key values', () => {
    it('renders a plain string key', () => {
        const entity = createEntity([keyField('ID', EntityFieldTSType.String)], [UUID_KEY]);
        expect(createGenerator().GetDeleteSQLWithDetails(entity, USER).simpleSQL).toBe(`EXEC [dbo].[spDeleteT] @ID='${UUID_KEY}'`);
    });

    it('escapes a quote in a string key', () => {
        const entity = createEntity([keyField('ID', EntityFieldTSType.String)], [`${UUID_KEY}'x`]);
        expect(createGenerator().GetDeleteSQLWithDetails(entity, USER).simpleSQL).toBe(`EXEC [dbo].[spDeleteT] @ID='${UUID_KEY}''x'`);
    });

    it('renders a numeric key as a number', () => {
        const entity = createEntity([keyField('ID', EntityFieldTSType.Number)], [5]);
        expect(createGenerator().GetDeleteSQLWithDetails(entity, USER).simpleSQL).toBe('EXEC [dbo].[spDeleteT] @ID=5');
    });

    it('refuses a non-numeric value for a numeric key', () => {
        const entity = createEntity([keyField('ID', EntityFieldTSType.Number)], ['5 x']);
        expect(() => createGenerator().GetDeleteSQLWithDetails(entity, USER)).toThrow('Invalid non-numeric value provided for numeric field ID');
    });

    it('renders every field of a composite key', () => {
        const fields = [keyField('A', EntityFieldTSType.Number), keyField('B', EntityFieldTSType.String)];
        const entity = createEntity(fields, [1, `it's`]);
        expect(createGenerator().GetDeleteSQLWithDetails(entity, USER).simpleSQL).toBe(`EXEC [dbo].[spDeleteT] @A=1, @B='it''s'`);
    });

    it('escapes a quote in the key of the record change statement', () => {
        const entity = createEntity([keyField('ID', EntityFieldTSType.String)], [`${UUID_KEY}'x`], true);
        const { fullSQL } = createGenerator().GetDeleteSQLWithDetails(entity, USER);
        expect(fullSQL).toContain(`@ID='${UUID_KEY}''x'`);
        expect(fullSQL).toContain(`@RecordID='ID|${UUID_KEY}''x'`);
    });
});

describe('SQLServerDataProvider record change key', () => {
    const entityInfo = {} as EntityInfo;

    it('escapes a quote in a quoted record ID', () => {
        const sql = createGenerator().GetLogRecordChangeSQL(null, {}, 'Widgets', `ID|it's`, entityInfo, 'Delete', USER, true);
        expect(sql).toContain(`@RecordID='ID|it''s'`);
    });

    it('leaves a plain record ID unchanged', () => {
        const sql = createGenerator().GetLogRecordChangeSQL(null, {}, 'Widgets', `ID|${UUID_KEY}`, entityInfo, 'Delete', USER, true);
        expect(sql).toContain(`@RecordID='ID|${UUID_KEY}'`);
    });
});
