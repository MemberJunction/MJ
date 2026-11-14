import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, EntityFieldInfo } from '../generic/entityInfo';
import { IMetadataProvider } from '../generic/interfaces';

describe('EntityInfo lazy Fields construction (Wave 5.4)', () => {
    const rawFields = [
        {
            ID: 'f1',
            EntityID: 'e1',
            Name: 'ID',
            Type: 'uniqueidentifier',
            IsPrimaryKey: true,
            IsUnique: true,
            Sequence: 1,
            Status: 'Active',
            IsVirtual: false,
        },
        {
            ID: 'f2',
            EntityID: 'e1',
            Name: 'Name',
            Type: 'nvarchar',
            IsNameField: true,
            Sequence: 2,
            Status: 'Active',
            IsVirtual: false,
        },
        {
            ID: 'f3',
            EntityID: 'e1',
            Name: 'Amount',
            Type: 'float',
            Sequence: 3,
            Status: 'Active',
            IsVirtual: true,
            IsFloat: true,
        },
        {
            ID: 'f4',
            EntityID: 'e1',
            Name: 'ParentID',
            Type: 'uniqueidentifier',
            RelatedEntityID: 'e2',
            Sequence: 4,
            Status: 'Deprecated',
            IsVirtual: false,
        },
        {
            ID: 'f5',
            EntityID: 'e1',
            Name: 'Secret',
            Type: 'nvarchar',
            Encrypt: true,
            Sequence: 5,
            Status: 'Active',
            IsVirtual: false,
        },
        {
            ID: 'f6',
            EntityID: 'e1',
            Name: 'CreatedDate',
            Type: 'datetimeoffset',
            Sequence: 6,
            Status: 'Active',
            IsVirtual: false,
            IncludeInUserSearchAPI: true,
        },
        {
            ID: 'f7',
            EntityID: 'e1',
            Name: 'Avatar',
            Type: 'varbinary',
            Sequence: 7,
            Status: 'Active',
            IsVirtual: false,
        },
    ];

    const entityInit = {
        ID: 'e1',
        Name: 'TestEntity',
        SchemaName: 'dbo',
        BaseTable: 'TestEntity',
        EntityFields: rawFields,
        EntityRelationships: [
            { ID: 'r1', EntityID: 'e1', RelatedEntityID: 'e2', Type: 'One To Many' },
            { ID: 'r2', EntityID: 'e1', RelatedEntityID: 'e3', Type: 'Many To Many' },
        ],
    };

    it('does NOT construct EntityFieldInfo instances when new EntityInfo runs', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const internals = entity as unknown as { _fields: EntityFieldInfo[]; _rawFields: unknown[] };
        expect(internals._fields.length).toBe(0);
        expect(internals._rawFields).not.toBeNull();
        expect(internals._rawFields.length).toBe(rawFields.length);
    });

    it('materializes EntityFieldInfo instances cleanly on first .Fields access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const fields = entity.Fields;
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(fields.length).toBe(rawFields.length);
        expect(fields[0]).toBeInstanceOf(EntityFieldInfo);
        expect(fields[0].Name).toBe('ID');

        const internals = entity as unknown as { _rawFields: unknown[] | null };
        expect(internals._rawFields).toBeNull(); // raw array freed

        // Referential stability
        expect(entity.Fields).toBe(fields);
    });

    it('materializes fields cleanly on .FirstPrimaryKey access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const pk = entity.FirstPrimaryKey;
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(pk).toBeDefined();
        expect(pk.Name).toBe('ID');
        expect(pk.IsPrimaryKey).toBe(true);
    });

    it('materializes fields cleanly on .PrimaryKeys access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const pks = entity.PrimaryKeys;
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(pks.length).toBe(1);
        expect(pks[0].Name).toBe('ID');
    });

    it('materializes fields cleanly on .NameField access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const nf = entity.NameField;
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(nf).toBeDefined();
        expect(nf?.Name).toBe('Name');
    });

    it('materializes fields cleanly on FieldByName access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const f = entity.FieldByName('secret');
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(f).toBeDefined();
        expect(f?.Name).toBe('Secret');
        expect(f?.Encrypt).toBe(true);
    });

    it('materializes fields cleanly on FieldByCodeName access', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        const f = entity.FieldByCodeName('createddate');
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(f).toBeDefined();
        expect(f?.Name).toBe('CreatedDate');
    });

    it('materializes fields cleanly on UniqueKeys, ForeignKeys, EncryptedFields, DatetimeFields, BinaryFields', () => {
        const e1 = new EntityInfo(entityInit);
        expect(e1.UniqueKeys.map(f => f.Name)).toEqual(['ID']);
        expect(e1.IsFieldsLoaded).toBe(true);

        const e2 = new EntityInfo(entityInit);
        expect(e2.ForeignKeys.map(f => f.Name)).toEqual(['ParentID']);
        expect(e2.IsFieldsLoaded).toBe(true);

        const e3 = new EntityInfo(entityInit);
        expect(e3.EncryptedFields.map(f => f.Name)).toEqual(['Secret']);
        expect(e3.IsFieldsLoaded).toBe(true);

        const e4 = new EntityInfo(entityInit);
        expect(e4.DatetimeFields.map(f => f.Name)).toEqual(['CreatedDate']);
        expect(e4.IsFieldsLoaded).toBe(true);

        const e5 = new EntityInfo(entityInit);
        expect(e5.BinaryFields.map(f => f.Name)).toEqual(['Avatar']);
        expect(e5.HasBinaryFields).toBe(true);
        expect(e5.IsFieldsLoaded).toBe(true);
    });

    it('computes HasInactiveFields and HasSearchFields correctly on lazy hydration', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        expect(entity.HasInactiveFields).toBe(true); // ParentID is Deprecated
        expect(entity.IsFieldsLoaded).toBe(true);

        const entity2 = new EntityInfo(entityInit);
        expect(entity2.HasSearchFields).toBe(true); // CreatedDate has IncludeInUserSearchAPI
        expect(entity2.IsFieldsLoaded).toBe(true);
    });

    it('computes HasIdField, VirtualCount, and FloatCount lazily without eager construction', () => {
        const entity = new EntityInfo(entityInit);
        expect(entity.IsFieldsLoaded).toBe(false);

        // Relationships are counted eagerly without triggering field hydration
        expect(entity.OneToManyCount).toBe(1);
        expect(entity.ManyToManyCount).toBe(1);
        expect(entity.IsFieldsLoaded).toBe(false);

        // HasIdField triggers field hydration and returns true
        expect(entity.HasIdField).toBe(true);
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(entity.VirtualCount).toBe(1); // Amount is virtual
        expect(entity.FloatCount).toBe(1); // Amount is float
    });

    it('marks fields loaded immediately when initialized without fields or empty fields', () => {
        const e1 = new EntityInfo({ ID: 'eEmpty', Name: 'Empty' });
        expect(e1.IsFieldsLoaded).toBe(true);
        expect(e1.Fields.length).toBe(0);

        const e2 = new EntityInfo({ ID: 'eEmpty2', Name: 'Empty2', EntityFields: [] });
        expect(e2.IsFieldsLoaded).toBe(true);
        expect(e2.Fields.length).toBe(0);
    });

    it('propagates owning metadata provider to EntityFieldInfo instances on lazy materialization', () => {
        const mockProvider = {} as unknown as IMetadataProvider;
        const entity = new EntityInfo(entityInit, mockProvider);
        expect(entity.IsFieldsLoaded).toBe(false);

        const fields = entity.Fields;
        expect(fields.length).toBeGreaterThan(0);
        for (const f of fields) {
            expect(f.OwningProvider).toBe(mockProvider);
        }
    });

    it('handles pre-instantiated EntityFieldInfo elements passed in EntityFields', () => {
        const preInstantiated = rawFields.map(f => new EntityFieldInfo(f));
        const entity = new EntityInfo({
            ID: 'ePre',
            Name: 'PreInstantiated',
            EntityFields: preInstantiated,
        });

        expect(entity.IsFieldsLoaded).toBe(false);
        const fields = entity.Fields;
        expect(entity.IsFieldsLoaded).toBe(true);
        expect(fields.length).toBe(preInstantiated.length);
        expect(fields[0]).toBe(preInstantiated[0]);
    });
});
