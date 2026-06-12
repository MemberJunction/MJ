import { describe, it, expect } from 'vitest';
import {
    planPromotions,
    inferColumnTypeFromSamples,
    buildOverflowStats,
    sanitizeColumnName,
    type OverflowKeyStats,
} from '../CustomColumnPromotion.js';

function stat(key: string, occurrences: number, totalRows: number, sampleValues: unknown[] = ['x']): OverflowKeyStats {
    return { Key: key, Occurrences: occurrences, TotalRows: totalRows, SampleValues: sampleValues };
}

describe('CustomColumnPromotion', () => {
    describe('inferColumnTypeFromSamples', () => {
        it('defaults to a generously-bounded string when there is no evidence', () => {
            const t = inferColumnTypeFromSamples([null, undefined]);
            expect(t.SchemaFieldType).toBe('string');
            expect(t.SqlServerType).toBe('NVARCHAR(255)');
            expect(t.PostgresType).toBe('VARCHAR(255)');
            expect(t.MaxLength).toBe(255);
        });

        it('infers boolean only when every non-null sample is a real boolean', () => {
            expect(inferColumnTypeFromSamples([true, false, true]).SchemaFieldType).toBe('boolean');
            // "true"/"false" strings are NOT coerced to boolean — stays string (safe default).
            expect(inferColumnTypeFromSamples(['true', 'false']).SchemaFieldType).toBe('string');
        });

        it('infers BIGINT for all-integer numbers', () => {
            const t = inferColumnTypeFromSamples([1, 2, 300, -5]);
            expect(t.SchemaFieldType).toBe('number');
            expect(t.SqlServerType).toBe('BIGINT');
            expect(t.PostgresType).toBe('BIGINT');
        });

        it('infers wide DECIMAL for non-integer numbers (no truncation)', () => {
            const t = inferColumnTypeFromSamples([1.5, 2, 3.14159]);
            expect(t.SchemaFieldType).toBe('number');
            expect(t.SqlServerType).toBe('DECIMAL(38,10)');
        });

        it('does NOT treat numeric strings as numbers (stays string)', () => {
            // Numeric-looking strings are ambiguous; provable-only ⇒ keep them string.
            expect(inferColumnTypeFromSamples(['42', '43']).SchemaFieldType).toBe('string');
        });

        it('infers datetime only for ISO-shaped date strings', () => {
            expect(inferColumnTypeFromSamples(['2026-01-15', '2026-06-07T12:30:00Z']).SchemaFieldType).toBe('datetime');
            expect(inferColumnTypeFromSamples(['2026-06-07T12:30:00Z']).SqlServerType).toBe('DATETIMEOFFSET');
            expect(inferColumnTypeFromSamples(['2026-06-07T12:30:00Z']).PostgresType).toBe('TIMESTAMPTZ');
            // A bare year or a number-like string is NOT a date.
            expect(inferColumnTypeFromSamples(['2026']).SchemaFieldType).toBe('string');
            expect(inferColumnTypeFromSamples(['5']).SchemaFieldType).toBe('string');
        });

        it('sizes a string column generously (double the longest observed, floor 255)', () => {
            const longest = 'x'.repeat(400);
            const t = inferColumnTypeFromSamples(['short', longest]);
            expect(t.SchemaFieldType).toBe('string');
            expect(t.MaxLength).toBe(800); // 400 * 2
        });

        it('falls back to MAX/TEXT only when the value genuinely cannot be bounded', () => {
            const huge = 'x'.repeat(3000); // *2 = 6000 > 4000 bounded limit
            const t = inferColumnTypeFromSamples([huge]);
            expect(t.SqlServerType).toBe('NVARCHAR(MAX)');
            expect(t.PostgresType).toBe('TEXT');
            expect(t.MaxLength).toBeNull();
        });

        it('mixed types default to string (the safe choice that holds anything)', () => {
            expect(inferColumnTypeFromSamples([1, 'two', true]).SchemaFieldType).toBe('string');
        });
    });

    describe('planPromotions', () => {
        it('promotes a pervasive key and skips a sparse one', () => {
            const out = planPromotions([
                stat('Pervasive', 9, 10),   // 0.9 coverage
                stat('Sparse', 1, 10),      // 0.1 coverage
            ]);
            expect(out.map(c => c.Key)).toEqual(['Pervasive']);
            expect(out[0].Coverage).toBeCloseTo(0.9);
        });

        it('honors a custom coverage threshold', () => {
            const out = planPromotions([stat('Half', 5, 10)], { CoverageThreshold: 0.6 });
            expect(out).toHaveLength(0);
        });

        it('NEVER re-promotes a key whose column already exists (terminate / convergence)', () => {
            const out = planPromotions(
                [stat('Custom1', 10, 10), stat('AlreadyHere', 10, 10)],
                { ExistingColumnNames: new Set(['alreadyhere']) }, // case-insensitive
            );
            expect(out.map(c => c.Key)).toEqual(['Custom1']);
        });

        it('skips keys when no rows were scanned (no fabrication from nothing)', () => {
            expect(planPromotions([stat('K', 0, 0)])).toHaveLength(0);
        });

        it('is deterministic — output sorted by key', () => {
            const out = planPromotions([stat('Zebra', 10, 10), stat('Apple', 10, 10)]);
            expect(out.map(c => c.Key)).toEqual(['Apple', 'Zebra']);
        });

        it('carries the inferred type onto each candidate', () => {
            const out = planPromotions([stat('Count', 10, 10, [1, 2, 3])]);
            expect(out[0].Inferred.SqlServerType).toBe('BIGINT');
        });

        it('end-to-end: stats from overflow rows → plan', () => {
            const rows = [
                JSON.stringify({ Region: 'West', Score: 5 }),
                JSON.stringify({ Region: 'East', Score: 7 }),
                JSON.stringify({ Region: 'West' }),            // Score missing here
                JSON.stringify({ JunkOnce: 'x' }),             // sparse junk in one row
            ];
            const stats = buildOverflowStats(rows);
            const plan = planPromotions(stats, { CoverageThreshold: 0.5 });
            // Region (4/4) and Score (2/4) clear 0.5; JunkOnce (1/4) does not.
            expect(plan.map(c => c.Key).sort()).toEqual(['Region', 'Score']);
        });
    });

    describe('buildOverflowStats', () => {
        it('tallies occurrences + totalRows over the sampled rows', () => {
            const rows = [
                JSON.stringify({ A: 1, B: 'x' }),
                JSON.stringify({ A: 2 }),
                JSON.stringify({ A: 3, B: 'y' }),
            ];
            const stats = buildOverflowStats(rows);
            const a = stats.find(s => s.Key === 'A')!;
            const b = stats.find(s => s.Key === 'B')!;
            expect(a.Occurrences).toBe(3);
            expect(a.TotalRows).toBe(3);
            expect(b.Occurrences).toBe(2);
            expect(b.TotalRows).toBe(3);
        });

        it('counts a malformed/empty row toward TotalRows but yields no keys from it', () => {
            const rows = ['not json', '', null, JSON.stringify({ A: 1 })];
            const stats = buildOverflowStats(rows);
            expect(stats.find(s => s.Key === 'A')!.TotalRows).toBe(4);
            expect(stats.find(s => s.Key === 'A')!.Occurrences).toBe(1);
        });

        it('ignores null-valued keys (JSON.stringify already drops undefined)', () => {
            const stats = buildOverflowStats([JSON.stringify({ A: null, B: 2 })]);
            expect(stats.map(s => s.Key)).toEqual(['B']);
        });

        it('caps retained sample values per key', () => {
            const rows = Array.from({ length: 50 }, (_, i) => JSON.stringify({ K: i }));
            const stats = buildOverflowStats(rows, 5);
            expect(stats[0].SampleValues).toHaveLength(5);
            expect(stats[0].Occurrences).toBe(50);
        });
    });

    describe('sanitizeColumnName', () => {
        it('replaces invalid characters with underscores', () => {
            expect(sanitizeColumnName('Custom Field!')).toBe('Custom_Field');
            expect(sanitizeColumnName('a.b/c')).toBe('a_b_c');
        });
        it('prefixes a leading digit', () => {
            expect(sanitizeColumnName('123abc')).toBe('c_123abc');
        });
        it('never returns an empty name', () => {
            expect(sanitizeColumnName('***')).toBe('Custom');
        });
    });
});
