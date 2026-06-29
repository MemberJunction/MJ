import { describe, it, expect } from 'vitest';
import { qualifyParameterizedQuery, type ParamClassification } from '../Database/materializationAnalysis';

/**
 * Phase 2a — parameterization qualifying core (plan §9 buckets + §10 asymmetric-risk).
 * Pure decision logic over verified per-param classifications; default to NOT materializable.
 */
describe('qualifyParameterizedQuery', () => {
    const out = ['ID', 'Amount', 'ChapterID', 'Region'];

    it('no params → mode None, qualifies', () => {
        const r = qualifyParameterizedQuery({ queryName: 'Q', params: [], outputColumns: out });
        expect(r).toEqual({ qualifies: true, paramMode: 'None', rowFilterColumns: [] });
    });

    it('single row-filter on a present output column → RowFilterBroad + that column', () => {
        const params: ParamClassification[] = [{ name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('RowFilterBroad');
        expect(r.rowFilterColumns).toEqual(['ChapterID']);
    });

    it('multiple row-filters, all columns present → RowFilterBroad with all columns', () => {
        const params: ParamClassification[] = [
            { name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID' },
            { name: 'region', role: 'RowFilter', filterColumn: 'Region' },
        ];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.paramMode).toBe('RowFilterBroad');
        expect(r.rowFilterColumns).toEqual(['ChapterID', 'Region']);
    });

    it('row-filter column matched case-insensitively', () => {
        const params: ParamClassification[] = [{ name: 'c', role: 'RowFilter', filterColumn: 'chapterid' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('RowFilterBroad');
    });

    it('row-filter on a column NOT in the output → refuse (unsound to filter a projected-away column)', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter', filterColumn: 'NotProjected' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/not in the materialized output/i);
    });

    it('row-filter with no resolved column → refuse under uncertainty', () => {
        const params: ParamClassification[] = [{ name: 'x', role: 'RowFilter' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/no filter column/i);
    });

    it('unbounded structural (Bucket 3) → refuse', () => {
        const params: ParamClassification[] = [{ name: 'sql', role: 'Unbounded' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/unbounded|Bucket 3/i);
    });

    it('structural (Bucket 2) refuses by default (per-value cache disabled)', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural', boundedDomain: ['a', 'b'] }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/per-value cache is disabled/i);
    });

    it('structural with bounded domain → PerValueCache when explicitly enabled', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural', boundedDomain: ['a', 'b', 'c'] }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true });
        expect(r.qualifies).toBe(true);
        expect(r.paramMode).toBe('PerValueCache');
    });

    it('structural enabled but with no bounded domain → refuse', () => {
        const params: ParamClassification[] = [{ name: 'reportType', role: 'Structural' }];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/no bounded domain/i);
    });

    it('mix of row-filter and structural params → refuse (not modeled in v1)', () => {
        const params: ParamClassification[] = [
            { name: 'chapterId', role: 'RowFilter', filterColumn: 'ChapterID' },
            { name: 'reportType', role: 'Structural', boundedDomain: ['a'] },
        ];
        const r = qualifyParameterizedQuery({ queryName: 'Q', params, outputColumns: out, allowPerValueCache: true });
        expect(r.qualifies).toBe(false);
        expect(r.reason).toMatch(/mixes row-filter and structural/i);
    });
});
