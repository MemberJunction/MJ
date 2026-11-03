import { describe, it, expect } from 'vitest';
import type { EntityFieldInfo, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJQueryFieldEntity } from '@memberjunction/core-entities';
import {
    BuildColumnsForResult,
    BuildColumnsFromQueryFields,
    EntityLinkRecordKey,
    InferNameFieldLinks,
    type QueryGridColumnConfig
} from './query-grid-types';

/**
 * A record link in a query result should read as the record's name and open the record by its key.
 * A column holding its entity's name field links by the key column when the result carries one.
 */

type FieldShape = Pick<EntityFieldInfo, 'Name' | 'IsPrimaryKey' | 'IsNameField' | 'RelatedEntity'>;
type EntityShape = Pick<EntityInfo, 'ID' | 'Name' | 'Icon' | 'Fields' | 'PrimaryKeys' | 'FirstPrimaryKey'>;

function entity(id: string, name: string, fields: FieldShape[]): EntityInfo {
    const typed = fields as EntityFieldInfo[];
    const shape: EntityShape = { ID: id, Name: name, Icon: 'fa-solid fa-user', Fields: typed, PrimaryKeys: typed.filter(f => f.IsPrimaryKey), FirstPrimaryKey: typed.find(f => f.IsPrimaryKey)! };
    return shape as EntityInfo;
}

const CONTACTS = entity('e-contacts', 'Contacts', [
    { Name: 'ID', IsPrimaryKey: true, IsNameField: false, RelatedEntity: null },
    { Name: 'FullName', IsPrimaryKey: false, IsNameField: true, RelatedEntity: null },
    { Name: 'Email', IsPrimaryKey: false, IsNameField: false, RelatedEntity: null }
]);

const provider = {
    EntityByName: (name: string) => [CONTACTS].find(e => e.Name.toLowerCase() === name.toLowerCase())
} as Pick<IMetadataProvider, 'EntityByName'> as IMetadataProvider;

function queryField(name: string, sequence: number, sourceFieldName: string | null): MJQueryFieldEntity {
    type Shape = Pick<MJQueryFieldEntity, 'Name' | 'Sequence' | 'SQLBaseType' | 'SQLFullType' | 'Description' | 'SourceEntity' | 'SourceEntityID' | 'SourceFieldName'>;
    const shape: Shape = {
        Name: name, Sequence: sequence, SQLBaseType: 'nvarchar', SQLFullType: 'nvarchar(100)', Description: null,
        SourceEntity: sourceFieldName ? 'Contacts' : null, SourceEntityID: sourceFieldName ? 'e-contacts' : null, SourceFieldName: sourceFieldName
    };
    return shape as MJQueryFieldEntity;
}

function column(field: string, sourceFieldName: string | undefined, extra: Partial<QueryGridColumnConfig> = {}): QueryGridColumnConfig {
    return {
        field, title: field, visible: true, sortable: true, resizable: true, reorderable: true,
        sqlBaseType: 'nvarchar', sqlFullType: 'nvarchar', order: 0, isEntityLink: false,
        sourceEntityName: sourceFieldName ? 'Contacts' : undefined, sourceFieldName, ...extra
    };
}

describe('InferNameFieldLinks', () => {
    it('links the name column by the key column when the result carries both', () => {
        const [, name] = InferNameFieldLinks([column('ContactID', 'ID'), column('ContactName', 'FullName')], provider);
        expect(name).toMatchObject({ isEntityLink: true, targetEntityName: 'Contacts', targetEntityId: 'e-contacts', linkKeyField: 'ContactID' });
    });

    it('leaves the name column alone when the result has no key column', () => {
        const [name] = InferNameFieldLinks([column('ContactName', 'FullName')], provider);
        expect(name.isEntityLink).toBe(false);
        expect(name.linkKeyField).toBeUndefined();
    });

    it('does not link a column that is not the name field', () => {
        const [, email] = InferNameFieldLinks([column('ContactID', 'ID'), column('Email', 'Email')], provider);
        expect(email.isEntityLink).toBe(false);
    });

    it('keeps an explicit key field', () => {
        const explicit = column('ContactName', 'FullName', { isEntityLink: true, targetEntityName: 'Contacts', linkKeyField: 'OtherKey' });
        const [, name] = InferNameFieldLinks([column('ContactID', 'ID'), explicit], provider);
        expect(name.linkKeyField).toBe('OtherKey');
    });
});

describe('column builders', () => {
    it('BuildColumnsFromQueryFields links the name field and keeps the key column\'s own link', () => {
        const columns = BuildColumnsFromQueryFields([queryField('ID', 1, 'ID'), queryField('FullName', 2, 'FullName')], provider);
        expect(columns[0]).toMatchObject({ field: 'ID', isEntityLink: true, isPrimaryKey: true });
        expect(columns[0].linkKeyField).toBeUndefined();
        expect(columns[1]).toMatchObject({ field: 'FullName', isEntityLink: true, linkKeyField: 'ID' });
    });

    it('BuildColumnsForResult names the key column as the result spells it', () => {
        const columns = BuildColumnsForResult([{ id: 'c-1', fullname: 'Sample Person' }], [queryField('ID', 1, 'ID'), queryField('FullName', 2, 'FullName')], provider);
        expect(columns[1]).toMatchObject({ field: 'fullname', linkKeyField: 'id' });
    });

    it('BuildColumnsForResult does not link the name when the server left the key out', () => {
        const columns = BuildColumnsForResult([{ FullName: 'Sample Person' }], [queryField('ID', 1, 'ID'), queryField('FullName', 2, 'FullName')], provider);
        expect(columns[0]).toMatchObject({ field: 'FullName', isEntityLink: false });
    });
});

describe('EntityLinkRecordKey', () => {
    it('reads the key field when the column names one', () => {
        expect(EntityLinkRecordKey({ linkKeyField: 'ContactID' }, { ContactID: 'c-1', ContactName: 'Sample Person' }, 'Sample Person')).toBe('c-1');
    });

    it('uses the value itself without a key field', () => {
        expect(EntityLinkRecordKey({}, { ContactID: 'c-1' }, 'c-1')).toBe('c-1');
    });

    it('is null when the key is missing', () => {
        expect(EntityLinkRecordKey({ linkKeyField: 'ContactID' }, { ContactID: null }, 'Sample Person')).toBeNull();
    });
});
