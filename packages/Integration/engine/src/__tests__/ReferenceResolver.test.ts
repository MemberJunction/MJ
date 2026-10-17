/**
 * Reference resolution: a child record names its parent by the source system's id (a Business
 * Central dimension value carries its dimension's BC GUID), and the MJ foreign key needs the parent's
 * MJ id. The swap goes through the parent map's record maps; a miss is an error on that record.
 */
import { describe, it, expect } from 'vitest';
import {
    ApplyResolvedReferences, CollectReferenceValues, DescribeUnresolvedReference, ParseReferenceFields,
    type ReferenceLookups,
} from '../ReferenceResolver';
import type { MappedRecord } from '../types';

const mapped = (id: string, fields: Record<string, unknown>, changeType: MappedRecord['ChangeType'] = 'Create'): MappedRecord => ({
    ExternalRecord: { ExternalID: id, ObjectType: 'dimensionValues', Fields: {} },
    MJEntityName: 'Dimension Values',
    MappedFields: { ...fields },
    ChangeType: changeType,
});

const BC_DEPT = '6F2C1A10-0000-4000-8000-000000000001';
const MJ_DEPT = 'A1B2C3D4-0000-4000-8000-0000000000AA';
const lookups: ReferenceLookups = new Map([['DimensionID', new Map([[BC_DEPT.toLowerCase(), MJ_DEPT]])]]);

describe('ParseReferenceFields', () => {
    it('returns nothing when the map declares no references', () => {
        expect(ParseReferenceFields(null)).toEqual([]);
        expect(ParseReferenceFields({ recordFilter: [] })).toEqual([]);
    });

    it('returns the declared destination fields', () => {
        expect(ParseReferenceFields({ resolveReferences: ['DimensionID'] })).toEqual(['DimensionID']);
    });

    it('throws on a malformed declaration rather than writing external ids into MJ keys', () => {
        expect(() => ParseReferenceFields({ resolveReferences: 'DimensionID' })).toThrow();
        expect(() => ParseReferenceFields({ resolveReferences: [''] })).toThrow();
    });
});

describe('CollectReferenceValues', () => {
    it('dedups case-insensitively and skips empties and deletes', () => {
        const values = CollectReferenceValues([
            mapped('1', { DimensionID: BC_DEPT }),
            mapped('2', { DimensionID: BC_DEPT.toLowerCase() }),
            mapped('3', { DimensionID: '' }),
            mapped('4', { DimensionID: null }),
            mapped('5', { DimensionID: 'other' }, 'Delete'),
        ], 'DimensionID');
        expect(values).toEqual([BC_DEPT]);
    });
});

describe('ApplyResolvedReferences', () => {
    it('swaps the external id for the MJ id, matching case-insensitively', () => {
        const out = ApplyResolvedReferences([mapped('1', { DimensionID: BC_DEPT.toLowerCase(), Code: 'SALES' })], ['DimensionID'], lookups);
        expect(out.Unresolved).toEqual([]);
        expect(out.Resolved[0].MappedFields).toEqual({ DimensionID: MJ_DEPT, Code: 'SALES' });
    });

    it('reports a record whose parent has no record map and leaves it unwritten', () => {
        const out = ApplyResolvedReferences([mapped('1', { DimensionID: 'unknown-guid' })], ['DimensionID'], lookups);
        expect(out.Resolved).toEqual([]);
        expect(out.Unresolved).toHaveLength(1);
        expect(out.Unresolved[0]).toMatchObject({ Field: 'DimensionID', ExternalValue: 'unknown-guid' });
        expect(out.Unresolved[0].Record.MappedFields.DimensionID).toBe('unknown-guid');
    });

    it('does not half-apply a record when a later reference misses', () => {
        const two: ReferenceLookups = new Map([...lookups, ['ParentDimensionValueID', new Map<string, string>()]]);
        const record = mapped('1', { DimensionID: BC_DEPT, ParentDimensionValueID: 'missing' });
        const out = ApplyResolvedReferences([record], ['DimensionID', 'ParentDimensionValueID'], two);
        expect(out.Unresolved[0].Field).toBe('ParentDimensionValueID');
        expect(record.MappedFields.DimensionID).toBe(BC_DEPT);
    });

    it('leaves empty values and deletes alone', () => {
        const out = ApplyResolvedReferences([
            mapped('1', { DimensionID: null }),
            mapped('2', { DimensionID: 'gone' }, 'Delete'),
        ], ['DimensionID'], lookups);
        expect(out.Resolved).toHaveLength(2);
        expect(out.Unresolved).toEqual([]);
    });
});

describe('DescribeUnresolvedReference', () => {
    it('names the field, the value and the parent entity', () => {
        const record = mapped('1', { DimensionID: 'x' });
        const msg = DescribeUnresolvedReference({ Record: record, Field: 'DimensionID', ExternalValue: 'x' }, 'Dimensions');
        expect(msg).toContain('Dimension Values.DimensionID');
        expect(msg).toContain("'x'");
        expect(msg).toContain('Dimensions');
    });
});
