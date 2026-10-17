import { describe, it, expect } from 'vitest';
import { FeatureValuesPanelModel, type FeatureValueRow } from '../lib/panels/feature-values/feature-values.logic';

function row(over: Partial<FeatureValueRow>): FeatureValueRow {
    return {
        ID: 'r1', RecordProcessID: 'p1', RecordProcess: 'Churn Features', FeatureName: 'tenure',
        ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null,
        Source: 'Computed', Confidence: null, PipelineVersion: 1, ComputedAt: '2026-01-01T00:00:00Z',
        Reasoning: null, ProcessRunID: 'run1', ...over,
    };
}

describe('FeatureValuesPanelModel.DisplayValue', () => {
    it('renders number, boolean, date, json and text', () => {
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueNumeric: 12.5 }))).toBe('12.5');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueNumeric: 0 }))).toBe('0');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueBoolean: true }))).toBe('Yes');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueBoolean: false }))).toBe('No');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueDate: '2026-03-04T10:00:00Z' }))).toBe('2026-03-04');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueJSON: '{\n "a": 1,\n "b": [1, 2]\n}' }))).toBe('{"a":1,"b":[1,2]}');
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueText: 'hello' }))).toBe('hello');
    });
    it('normalises 1/0 and "1"/"0" booleans', () => {
        const b = (v: number | string) => FeatureValuesPanelModel.DisplayValue(row({ ValueBoolean: v }));
        expect(b(1)).toBe('Yes');
        expect(b('1')).toBe('Yes');
        expect(b(0)).toBe('No');
        expect(b('0')).toBe('No');
    });
    it('returns empty string for a valueless row', () => {
        expect(FeatureValuesPanelModel.DisplayValue(row({}))).toBe('');
    });
    it('keeps invalid JSON as-is', () => {
        expect(FeatureValuesPanelModel.DisplayValue(row({ ValueJSON: '{oops' }))).toBe('{oops');
    });
});

describe('FeatureValuesPanelModel.HistoryValue', () => {
    it('says "no value" for a valueless row and shows a valued one as DisplayValue does', () => {
        expect(FeatureValuesPanelModel.HistoryValue(row({}))).toBe('no value');
        expect(FeatureValuesPanelModel.HistoryValue(row({ ValueNumeric: 0 }))).toBe('0');
        expect(FeatureValuesPanelModel.HistoryValue(row({ ValueText: '' }))).toBe('');
    });
});

describe('FeatureValuesPanelModel.Latest', () => {
    it('picks the newest valued row per pipeline+feature and skips valueless rows', () => {
        const rows = [
            row({ ID: 'a', ValueNumeric: 1, ComputedAt: '2026-01-01T00:00:00Z' }),
            row({ ID: 'b', ValueNumeric: 2, ComputedAt: '2026-02-01T00:00:00Z' }),
            row({ ID: 'c', ComputedAt: '2026-03-01T00:00:00Z' }),
            row({ ID: 'd', FeatureName: 'plan', ValueText: 'pro' }),
            row({ ID: 'e', RecordProcessID: 'p2', RecordProcess: 'Other', ValueNumeric: 9 }),
        ];
        const cards = FeatureValuesPanelModel.Latest(rows);
        expect(cards.map(c => c.RowID).sort()).toEqual(['b', 'd', 'e']);
        const b = cards.find(c => c.RowID === 'b')!;
        expect(b.DisplayValue).toBe('2');
        expect(b.Pipeline).toBe('Churn Features');
        expect(b.PipelineVersion).toBe(1);
        expect(b.ComputedAt).toBeInstanceOf(Date);
        expect(new Set(cards.map(c => c.Key)).size).toBe(3);
    });
    it('returns no cards for no rows', () => {
        expect(FeatureValuesPanelModel.Latest([])).toEqual([]);
    });
});

describe('FeatureValuesPanelModel.History', () => {
    it('returns the other rows for the same pipeline+feature, newest first, excluding the card row', () => {
        const rows = [
            row({ ID: 'a', ValueNumeric: 1, ComputedAt: '2026-01-01T00:00:00Z' }),
            row({ ID: 'b', ValueNumeric: 2, ComputedAt: '2026-02-01T00:00:00Z' }),
            row({ ID: 'c', ValueNumeric: 3, ComputedAt: '2026-01-15T00:00:00Z' }),
            row({ ID: 'd', FeatureName: 'plan', ValueText: 'pro' }),
        ];
        const card = FeatureValuesPanelModel.Latest(rows).find(c => c.FeatureName === 'tenure')!;
        expect(FeatureValuesPanelModel.History(rows, card).map(r => r.ID)).toEqual(['c', 'a']);
    });
});
