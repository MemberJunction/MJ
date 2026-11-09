import { describe, it, expect } from 'vitest';
import type { BaseEntity } from '@memberjunction/core';
import { BuildFormPanelHostProps } from '../form-panel-host-props.builder';
import type { FormContributionRegistration } from '../../panel-slot/form-contribution';

/**
 * A related-grid panel's contract promises `props.related`: the rows that belong to this record
 * and the values that link a new row to it. They come from the record, so the artifact viewer's
 * preview, which has no form, gets them too.
 */

const ORDERS = 'MJ_BizApps_Orders: Order Headers';
const relationship = (join: string) => ({
    RelatedEntity: ORDERS, RelatedEntityJoinField: join, Type: 'One To Many', EntityKeyField: null, Configuration: null,
});

function person(joins: string[]): BaseEntity {
    return {
        EntityInfo: {
            Name: 'MJ_BizApps_Common: People', DisplayName: 'People', NameField: null,
            RelatedEntities: joins.map(relationship),
            FieldByName: () => undefined,
        },
        FirstPrimaryKey: { Name: 'ID', Value: 'p-1', NeedsQuotes: true },
        PrimaryKey: { HasValue: true, KeyValuePairs: [{ FieldName: 'ID', Value: 'p-1' }] },
        Fields: [],
        GetAll: () => ({ ID: 'p-1' }),
        Get: (name: string) => (name === 'ID' ? 'p-1' : null),
    } as unknown as BaseEntity;
}

function claim(join?: string): FormContributionRegistration {
    return {
        Priority: 0, Source: 'metadata', ComponentID: 'c1', Title: 'Orders as cards',
        Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-related', relatedEntity: ORDERS, ...(join ? { relatedJoinField: join } : {}) },
    };
}

const build = (record: BaseEntity, contribution: FormContributionRegistration) => BuildFormPanelHostProps({
    Record: record, FormComponent: null, Contribution: contribution, SectionKey: 'k', Layout: 'accordion', IsExpanded: true,
});

describe('BuildFormPanelHostProps — a related-grid panel with no form', () => {
    it('filters the related rows to this record by the named join field', () => {
        const props = build(person(['BillToPersonID', 'ShipToPersonID']), claim('[ShipToPersonID]'));
        expect(props.related).toEqual({
            entityName: ORDERS,
            joinField: 'ShipToPersonID',
            viewParams: { EntityName: ORDERS, ExtraFilter: "[ShipToPersonID] = 'p-1'", OrderBy: undefined },
            newRecordValues: { ShipToPersonID: 'p-1' },
        });
    });

    it('uses every relationship to the entity when the claim names no join field', () => {
        const props = build(person(['BillToPersonID', 'ShipToPersonID']), claim());
        expect(props.related?.viewParams.ExtraFilter).toBe("[BillToPersonID] = 'p-1' OR [ShipToPersonID] = 'p-1'");
        expect(props.related?.newRecordValues).toEqual({ BillToPersonID: 'p-1', ShipToPersonID: 'p-1' });
    });

    it('reads the permissions as false, since there is no form to grant them', () => {
        const props = build(person(['BillToPersonID']), claim());
        expect(props).toMatchObject({ canEdit: false, canDelete: false, canCreate: false });
        expect(props.related?.viewParams.ExtraFilter).toBe("[BillToPersonID] = 'p-1'");
    });

    it('gives a panel that claims no grid no related props', () => {
        const props = build(person(['BillToPersonID']), {
            Priority: 0, Source: 'metadata', ComponentID: 'c2', Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields' },
        });
        expect(props.related).toBeUndefined();
    });
});
