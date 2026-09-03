import { describe, it, expect } from 'vitest';
import { evaluateFilter } from '../evaluateFilter';
import { parseFilterField, formatFilterField } from '../filter.types';
import { FilterSummary } from '../filterSummary';
import type { CompositeFilterDescriptor } from '../filter.types';

describe('parseFilterField', () => {
    it('treats a bare name as unscoped', () => {
        expect(parseFilterField('Type')).toEqual({ source: null, name: 'Type' });
    });
    it('splits on the first dot', () => {
        expect(parseFilterField('BillToOrganization.Type')).toEqual({
            source: 'BillToOrganization',
            name: 'Type',
        });
    });
    it('keeps extra dots on the field name', () => {
        expect(parseFilterField('Order.Custom.JSON')).toEqual({ source: 'Order', name: 'Custom.JSON' });
    });
});

describe('formatFilterField', () => {
    it('always writes the prefix', () => {
        expect(formatFilterField('BillToOrganization', 'Type')).toBe('BillToOrganization.Type');
    });
});

describe('evaluateFilter', () => {
    const ctx = {
        '': { Type: 'Member', Status: 'Active' },
        BillToOrganization: { Type: 'Member', Status: 'Active' },
        Order: { CompanyID: 'co-1' },
        ShipToPerson: null,
    };

    it('empty group is true', () => {
        expect(evaluateFilter({ logic: 'and', filters: [] }, ctx)).toBe(true);
    });

    it('reads a bare field from the unscoped record', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'Type', operator: 'eq', value: 'Member' }],
        };
        expect(evaluateFilter(f, ctx)).toBe(true);
    });

    it('reads a prefixed field from that source', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
        };
        expect(evaluateFilter(f, ctx)).toBe(true);
    });

    it('missing source record makes equality false', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'ShipToPerson.Email', operator: 'eq', value: 'a@b.c' }],
        };
        expect(evaluateFilter(f, ctx)).toBe(false);
    });

    it('isnull is true when the source record is missing', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'and',
            filters: [{ field: 'ShipToPerson.Email', operator: 'isnull', value: null }],
        };
        expect(evaluateFilter(f, ctx)).toBe(true);
    });

    it('OR / AND groups', () => {
        const f: CompositeFilterDescriptor = {
            logic: 'or',
            filters: [
                { field: 'Order.CompanyID', operator: 'eq', value: 'nope' },
                { field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' },
            ],
        };
        expect(evaluateFilter(f, ctx)).toBe(true);
    });
});

describe('FilterSummary', () => {
    const summary = new FilterSummary({
        sourceLabels: { BillToOrganization: 'Bill-to organization' },
        fields: [{ name: 'Type', displayName: 'Type' }],
    });

    it('writes a compact sentence', () => {
        const text = summary.text({
            logic: 'and',
            filters: [{ field: 'BillToOrganization.Type', operator: 'eq', value: 'Member' }],
        });
        expect(text).toBe('Bill-to organization Type equals Member');
    });

    it('empty filter is empty text', () => {
        expect(summary.text({ logic: 'and', filters: [] })).toBe('');
    });
});
