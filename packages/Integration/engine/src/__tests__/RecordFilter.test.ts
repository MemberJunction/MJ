/**
 * Record-level filter on a pull entity map. The case that motivated it: Business Central G/L
 * accounts of type Heading / Total / Begin-Total / End-Total are presentation rows with no postable
 * target, and without a filter each one reaches the write and fails a constraint.
 */
import { describe, it, expect } from 'vitest';
import { ApplyRecordFilter, ParseRecordFilter, RecordPassesFilter } from '../RecordFilter';
import type { ExternalRecord } from '../types';

const rec = (id: string, fields: Record<string, unknown>, isDeleted = false): ExternalRecord =>
    ({ ExternalID: id, ObjectType: 'accounts', Fields: fields, IsDeleted: isDeleted });

const nonPosting = { recordFilter: [{ field: 'accountType', notIn: ['Heading', 'Total', 'Begin-Total', 'End-Total'] }] };

describe('ParseRecordFilter', () => {
    it('returns no conditions when the map declares no filter', () => {
        expect(ParseRecordFilter(null)).toEqual({ Conditions: [], Problems: [] });
        expect(ParseRecordFilter({ partitionReconcile: true })).toEqual({ Conditions: [], Problems: [] });
    });

    it('parses in / notIn conditions', () => {
        const parsed = ParseRecordFilter({ recordFilter: [{ field: 'status', in: ['Active', 1] }, nonPosting.recordFilter[0]] });
        expect(parsed.Problems).toEqual([]);
        expect(parsed.Conditions[0].Field).toBe('status');
        expect([...parsed.Conditions[0].In!]).toEqual(['Active', '1']);
        expect(parsed.Conditions[1].NotIn!.has('Heading')).toBe(true);
    });

    it('reports every malformed condition instead of syncing unfiltered', () => {
        const parsed = ParseRecordFilter({
            recordFilter: [{ field: '', in: ['x'] }, { field: 'a', in: ['x'], notIn: ['y'] }, { field: 'b' }, { field: 'c', in: [] }, 'nope'],
        });
        expect(parsed.Conditions).toEqual([]);
        expect(parsed.Problems).toHaveLength(5);
    });

    it('rejects a filter that is not an array', () => {
        expect(ParseRecordFilter({ recordFilter: { field: 'a', in: ['x'] } }).Problems).toHaveLength(1);
    });
});

describe('RecordPassesFilter / ApplyRecordFilter', () => {
    const conditions = ParseRecordFilter(nonPosting).Conditions;

    it('keeps posting accounts and drops presentation rows', () => {
        const out = ApplyRecordFilter([
            rec('1', { accountType: 'Posting' }),
            rec('2', { accountType: 'Heading' }),
            rec('3', { accountType: 'End-Total' }),
        ], conditions);
        expect(out.Kept.map(r => r.ExternalID)).toEqual(['1']);
        expect(out.Excluded).toBe(2);
    });

    it('keeps a record with no value under notIn, drops it under in', () => {
        expect(RecordPassesFilter(rec('1', {}), conditions)).toBe(true);
        const inOnly = ParseRecordFilter({ recordFilter: [{ field: 'status', in: ['Active'] }] }).Conditions;
        expect(RecordPassesFilter(rec('1', { status: null }), inOnly)).toBe(false);
    });

    it('never filters a delete', () => {
        expect(RecordPassesFilter(rec('2', { accountType: 'Heading' }, true), conditions)).toBe(true);
    });

    it('requires every condition to hold', () => {
        const both = ParseRecordFilter({ recordFilter: [nonPosting.recordFilter[0], { field: 'blocked', in: [false] }] }).Conditions;
        expect(RecordPassesFilter(rec('1', { accountType: 'Posting', blocked: false }), both)).toBe(true);
        expect(RecordPassesFilter(rec('1', { accountType: 'Posting', blocked: true }), both)).toBe(false);
    });

    it('returns the same array untouched when there is no filter', () => {
        const records = [rec('1', {})];
        expect(ApplyRecordFilter(records, []).Kept).toBe(records);
    });
});
