import { describe, it, expect } from 'vitest';
import { CompositeFilter } from '../compositeFilter';
import { FormatFilterField, ParseFilterField } from '../filter.types';
import type { CompositeFilterDescriptor } from '../filter.types';

describe('ParseFilterField', () => {
    it('treats a bare name as unscoped', () => {
        expect(ParseFilterField('Type')).toEqual({ Source: null, Name: 'Type' });
    });
    it('splits on the first dot', () => {
        expect(ParseFilterField('BillToOrganization.Type')).toEqual({
            Source: 'BillToOrganization',
            Name: 'Type',
        });
    });
    it('keeps extra dots on the field name', () => {
        expect(ParseFilterField('Order.Custom.JSON')).toEqual({ Source: 'Order', Name: 'Custom.JSON' });
    });
});

describe('FormatFilterField', () => {
    it('always writes the prefix', () => {
        expect(FormatFilterField('BillToOrganization', 'Type')).toBe('BillToOrganization.Type');
        expect(CompositeFilter.FormatFilterField('BillToOrganization', 'Type')).toBe('BillToOrganization.Type');
    });
});

describe('CompositeFilter.Evaluate', () => {
    const ctx = {
        '': { Type: 'Member', Status: 'Active' },
        BillToOrganization: { Type: 'Member', Status: 'Active' },
        Order: { CompanyID: 'co-1' },
        ShipToPerson: null,
    };

    it('empty group is true', () => {
        expect(new CompositeFilter({ logic: 'and', filters: [] }).Evaluate(ctx)).toBe(true);
        expect(CompositeFilter.FromJSON(null).Evaluate(ctx)).toBe(true);
    });

    it('reads a bare field from the unscoped record', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'Type', operator: 'eq', value: 'Member' }],
        };
        expect(CompositeFilter.FromDescriptor(f).Evaluate(ctx)).toBe(true);
    });

    it('reads a prefixed field from that source', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
        };
        expect(CompositeFilter.FromJSON(JSON.stringify(f)).Evaluate(ctx)).toBe(true);
    });

    it('missing source record makes equality false', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'ShipToPerson.Email', operator: 'eq', value: 'a@b.c' }],
        };
        expect(new CompositeFilter(f).Evaluate(ctx)).toBe(false);
    });

    it('isnull is true when the source record is missing', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'ShipToPerson.Email', operator: 'isnull', value: null }],
        };
        expect(new CompositeFilter(f).Evaluate(ctx)).toBe(true);
    });

    it('OR / AND groups', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'or',
            filters: [
                { field: 'Order.CompanyID', operator: 'eq', value: 'nope' },
                { field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' },
            ],
        };
        expect(new CompositeFilter(f).Evaluate(ctx)).toBe(true);
    });

    it('Add builds a filter without a descriptor', () => {
        const filter = new CompositeFilter();
        filter.Add({ field: 'Type', operator: 'eq', value: 'Member' });
        expect(filter.Evaluate(ctx)).toBe(true);
        expect(filter.ToDescriptor().filters).toHaveLength(1);
    });
});

describe('CompositeFilter summary', () => {
    const filter = CompositeFilter.FromDescriptor({
        logic: 'and',
        filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
    });
    const options = {
        SourceLabels: { BillToOrganization: 'Bill-to organization' },
        Fields: [{ Name: 'Type', DisplayName: 'Type' }],
    };

    it('writes a compact sentence', () => {
        expect(filter.SummaryText(options)).toBe('Bill-to organization Type equals Member');
    });

    it('empty filter is empty text', () => {
        expect(new CompositeFilter().SummaryText(options)).toBe('');
    });
});
