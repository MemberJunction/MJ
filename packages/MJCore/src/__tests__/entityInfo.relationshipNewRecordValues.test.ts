import { describe, expect, it } from 'vitest';
import { EntityInfo, EntityRelationshipInfo } from '../generic/entityInfo';
import type { BaseEntity } from '../generic/baseEntity';

function parentRecord(id: string): BaseEntity {
    const values: Record<string, unknown> = { ID: id };
    return {
        Get: (name: string) => values[name],
        FirstPrimaryKey: { Name: 'ID', Value: id },
    } as unknown as BaseEntity;
}

function relationship(over: Record<string, unknown>): EntityRelationshipInfo {
    return new EntityRelationshipInfo({
        RelatedEntity: 'MJ_BizApps_Orders: Order Headers',
        RelatedEntityJoinField: 'BillToPersonID',
        EntityKeyField: '',
        Type: 'One to Many',
        ...over,
    });
}

describe('BuildRelationshipNewRecordValues', () => {
    it('sets the single join field from the parent primary key', () => {
        const values = EntityInfo.BuildRelationshipNewRecordValues(
            parentRecord('person-1'),
            relationship({}),
        );
        expect(values).toEqual({ BillToPersonID: 'person-1' });
    });

    it('sets every UI.join.fields FK when the relationship is an OR join', () => {
        const values = EntityInfo.BuildRelationshipNewRecordValues(
            parentRecord('person-1'),
            relationship({
                Configuration: JSON.stringify({
                    UI: { join: { op: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] } },
                }),
            }),
        );
        expect(values).toEqual({
            BillToPersonID: 'person-1',
            ShipToPersonID: 'person-1',
        });
    });

    it('uses EntityKeyField when the parent key is not the first PK', () => {
        const record = {
            Get: (name: string) => (name === 'Code' ? 'ACME' : undefined),
            FirstPrimaryKey: { Name: 'ID', Value: 'uuid-1' },
        } as unknown as BaseEntity;
        const values = EntityInfo.BuildRelationshipNewRecordValues(
            record,
            relationship({
                RelatedEntityJoinField: 'AccountCode',
                EntityKeyField: 'Code',
            }),
        );
        expect(values).toEqual({ AccountCode: 'ACME' });
    });
});

describe('BuildRelationshipNewRecordValuesForJoinFields', () => {
    it('sets every listed field to the parent key', () => {
        const values = EntityInfo.BuildRelationshipNewRecordValuesForJoinFields(
            parentRecord('org-9'),
            ['BillToOrganizationID', 'ShipToOrganizationID'],
        );
        expect(values).toEqual({
            BillToOrganizationID: 'org-9',
            ShipToOrganizationID: 'org-9',
        });
    });

    it('ignores blank join field names', () => {
        const values = EntityInfo.BuildRelationshipNewRecordValuesForJoinFields(
            parentRecord('p'),
            ['  ', 'BillToPersonID', ''],
        );
        expect(values).toEqual({ BillToPersonID: 'p' });
    });
});
