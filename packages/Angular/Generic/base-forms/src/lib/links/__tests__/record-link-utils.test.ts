import { describe, it, expect } from 'vitest';
import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, KeyValuePair } from '@memberjunction/core';
import {
    ApplyQuickEditToHostRecord,
    ResolveHostNameFieldMap,
    ResolveRecordLinkTarget
} from '../record-link-utils';

const MOCK_ENTITIES = [
    {
        ID: 'ent-org-id',
        Name: 'MJ_BizApps_Common: Organizations',
        DisplayNameOrName: 'Organizations',
        Icon: 'fa-solid fa-building',
        NameField: { Name: 'Name' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, IsVirtual: false },
            { Name: 'Name', IsPrimaryKey: false, IsVirtual: false }
        ]
    },
    {
        ID: 'ent-person-id',
        Name: 'MJ_BizApps_Common: People',
        DisplayNameOrName: 'People',
        Icon: 'fa-solid fa-user',
        NameField: { Name: 'DisplayName' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, IsVirtual: false },
            { Name: 'DisplayName', IsPrimaryKey: false, IsVirtual: false },
            {
                Name: 'CurrentOrganizationID',
                RelatedEntity: 'MJ_BizApps_Common: Organizations',
                RelatedEntityFieldName: 'ID',
                RelatedEntityNameFieldMap: 'CurrentOrganizationName',
                IsVirtual: false
            },
            {
                Name: 'CurrentOrganizationName',
                IsVirtual: true
            },
            {
                Name: 'SourceEntityID',
                IsVirtual: false
            },
            {
                Name: 'SourceRecordID',
                EntityIDFieldName: 'SourceEntityID',
                IsVirtual: false
            }
        ],
        IsFieldReadableByUser: () => true
    }
] as unknown as EntityInfo[];

const MOCK_PROVIDER = {
    Entities: MOCK_ENTITIES,
    CurrentUser: { ID: 'user-1' }
} as unknown as IMetadataProvider;

function makeMockPersonRecord(values: Record<string, unknown>): BaseEntity {
    const state = { ...values };
    return {
        EntityInfo: MOCK_ENTITIES[1],
        ProviderToUse: MOCK_PROVIDER,
        Get: (fieldName: string) => state[fieldName],
        Set: (fieldName: string, value: unknown) => {
            state[fieldName] = value;
        }
    } as unknown as BaseEntity;
}

describe('record-link-utils', () => {
    it('resolves a standard FK target in Field-Driven mode along with its companion virtual display field', () => {
        const record = makeMockPersonRecord({
            ID: 'person-1',
            CurrentOrganizationID: 'org-99',
            CurrentOrganizationName: 'Acme Corp'
        });

        const target = ResolveRecordLinkTarget({
            Record: record,
            FieldName: 'CurrentOrganizationID',
            Provider: MOCK_PROVIDER
        });

        expect(target).not.toBeNull();
        expect(target!.EntityName).toBe('MJ_BizApps_Common: Organizations');
        expect(target!.EntityDisplayName).toBe('Organizations');
        expect(target!.RecordID).toBe('org-99');
        expect(target!.DisplayName).toBe('Acme Corp');
        expect(target!.IsPolymorphic).toBe(false);
        expect(target!.NameFieldMapOnHost).toBe('CurrentOrganizationName');
        expect(target!.PrimaryKey.GetValueByFieldName('ID')).toBe('org-99');
    });

    it('resolves a polymorphic FK target using EntityField.EntityIDFieldName', () => {
        const record = makeMockPersonRecord({
            ID: 'person-1',
            SourceEntityID: 'ent-org-id',
            SourceRecordID: 'org-777'
        });

        const target = ResolveRecordLinkTarget({
            Record: record,
            FieldName: 'SourceRecordID',
            Provider: MOCK_PROVIDER
        });

        expect(target).not.toBeNull();
        expect(target!.IsPolymorphic).toBe(true);
        expect(target!.CompanionEntityFieldName).toBe('SourceEntityID');
        expect(target!.EntityName).toBe('MJ_BizApps_Common: Organizations');
        expect(target!.RecordID).toBe('org-777');
        expect(target!.PrimaryKey.GetValueByFieldName('ID')).toBe('org-777');
    });

    it('resolves a Direct mode target from EntityName and RecordID or PrimaryKey', () => {
        const directById = ResolveRecordLinkTarget({
            EntityName: 'MJ_BizApps_Common: Organizations',
            RecordID: 'org-42',
            DisplayName: 'Globex',
            Provider: MOCK_PROVIDER
        });

        expect(directById).not.toBeNull();
        expect(directById!.EntityName).toBe('MJ_BizApps_Common: Organizations');
        expect(directById!.RecordID).toBe('org-42');
        expect(directById!.DisplayName).toBe('Globex');

        const directByPk = ResolveRecordLinkTarget({
            EntityName: 'MJ_BizApps_Common: Organizations',
            PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'org-88')]),
            Provider: MOCK_PROVIDER
        });
        expect(directByPk).not.toBeNull();
        expect(directByPk!.RecordID).toBe('org-88');
    });

    it('propagates inline Quick Edit name updates back to the host record virtual display field', () => {
        const record = makeMockPersonRecord({
            ID: 'person-1',
            CurrentOrganizationID: 'org-99',
            CurrentOrganizationName: 'Acme Corp'
        });

        const target = ResolveRecordLinkTarget({
            Record: record,
            FieldName: 'CurrentOrganizationID',
            Provider: MOCK_PROVIDER
        });

        const updatedName = ApplyQuickEditToHostRecord(record, target, {
            Name: 'Acme Global Holdings',
            Status: 'Active'
        });

        expect(updatedName).toBe('Acme Global Holdings');
        expect(record.Get('CurrentOrganizationName')).toBe('Acme Global Holdings');
    });

    it('infers a virtual <Base>Name field on the host record when RelatedEntityNameFieldMap is omitted', () => {
        const record = makeMockPersonRecord({
            ID: 'person-1',
            CurrentOrganizationID: 'org-99',
            CurrentOrganizationName: 'Acme Corp'
        });
        const unmappedField = {
            Name: 'CurrentOrganizationID',
            RelatedEntityNameFieldMap: ''
        } as unknown as Parameters<typeof ResolveHostNameFieldMap>[1];

        expect(ResolveHostNameFieldMap(record, unmappedField)).toBe('CurrentOrganizationName');
    });
});
