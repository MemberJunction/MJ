import { describe, it, expect } from 'vitest';
import {
    planPromotions,
    planColumnReclamations,
    inferColumnTypeFromSamples,
    buildOverflowStats,
    sanitizeColumnName,
    type OverflowKeyStats,
    type PromotedColumnState,
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

        it('infers BIGINT for all-integer numbers ONCE the sample is adequate (≥12)', () => {
            const t = inferColumnTypeFromSamples([1, 2, 300, -5, 6, 7, 8, 9, 10, 11, 12, 13]); // 12 integers
            expect(t.SchemaFieldType).toBe('number');
            expect(t.SqlServerType).toBe('BIGINT');
            expect(t.PostgresType).toBe('BIGINT');
        });

        it('#A9: a SMALL all-integer sample stays wide DECIMAL — the tail may carry a decimal a BIGINT would reject', () => {
            const t = inferColumnTypeFromSamples([1, 2, 300, -5]); // 4 integers — below the narrow threshold
            expect(t.SchemaFieldType).toBe('number');
            expect(t.SqlServerType).toBe('DECIMAL(38,10)');   // safe: holds integers AND a later decimal
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
        it('promotes EVERY key on first occurrence — presence-based default (§23)', () => {
            const out = planPromotions([
                stat('Pervasive', 9, 10),   // 0.9 coverage
                stat('Sparse', 1, 10),      // 0.1 coverage — STILL promoted: presence is enough
            ]);
            // Default threshold is 0 (§23): both earn a column; sorted by key for stable output.
            expect(out.map(c => c.Key)).toEqual(['Pervasive', 'Sparse']);
            expect(out.find(c => c.Key === 'Sparse')!.Coverage).toBeCloseTo(0.1);
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
            const out = planPromotions([stat('Count', 12, 12, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])]); // ≥12 → confident BIGINT
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

        it('U3 — LOCKED: plans NOTHING while a full sync is pending, even for a fully-covered key', () => {
            // After a rediscover, promotion is held until a full sync evicts stale overflow keys — so a
            // vanished column can't be phantom-promoted from stale, un-resynced rows.
            expect(planPromotions([stat('WouldPromote', 10, 10)], { LockUntilFullSync: true })).toHaveLength(0);
        });

        it('U3 — UNLOCKED (default / explicit false) preserves current behavior', () => {
            expect(planPromotions([stat('K', 10, 10)]).map(c => c.Key)).toEqual(['K']);
            expect(planPromotions([stat('K', 10, 10)], { LockUntilFullSync: false }).map(c => c.Key)).toEqual(['K']);
        });
    });

    describe('planColumnReclamations (U7 — opt-in reclaim of vanished promoted columns)', () => {
        const col = (ColumnName: string, AllNullAcrossFullSync: boolean, VanishedFromSource: boolean): PromotedColumnState =>
            ({ ColumnName, AllNullAcrossFullSync, VanishedFromSource });

        it('DEFAULT OFF — reclaims nothing, even an all-NULL vanished column (non-destructive by default)', () => {
            expect(planColumnReclamations([col('Gone', true, true)])).toHaveLength(0);
        });

        it('opted-in but NO full sync observed → reclaims nothing (all-NULL is untrustworthy on a partial pass)', () => {
            expect(planColumnReclamations([col('Gone', true, true)], { ReclaimVanishedColumns: true, FullSyncCompleted: false })).toHaveLength(0);
        });

        it('opted-in + full sync: reclaims ONLY a column that is BOTH all-NULL AND vanished from the source', () => {
            const out = planColumnReclamations(
                [
                    col('Gone', true, true),        // reclaimable
                    col('StillNull', true, false),  // all-NULL but source still sends it → KEEP
                    col('HasData', false, true),    // vanished but holds data → KEEP (never drop data)
                ],
                { ReclaimVanishedColumns: true, FullSyncCompleted: true },
            );
            expect(out.map(c => c.ColumnName)).toEqual(['Gone']);
        });

        it('is deterministic — sorted by column name', () => {
            const out = planColumnReclamations(
                [col('Zeta', true, true), col('Alpha', true, true)],
                { ReclaimVanishedColumns: true, FullSyncCompleted: true },
            );
            expect(out.map(c => c.ColumnName)).toEqual(['Alpha', 'Zeta']);
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

// ── RSU-spec stats-driven type inference ───────────────────────────────────────
import { inferColumnTypeFromStats } from '../CustomColumnPromotion';

describe('inferColumnTypeFromStats (RSU spec — width from the TRUE observed maximum)', () => {
    it('widens a string bound to cover a maxLength the capped sample missed', () => {
        // Sample only saw short values; the true longest observed value was 300 chars.
        const t = inferColumnTypeFromStats(['short', 'tiny'], 300);
        expect(t.SchemaFieldType).toBe('string');
        expect(t.MaxLength).toBeGreaterThanOrEqual(600); // generous 2× of the true max
    });

    it('keeps the sample-derived bound when it already covers maxLength', () => {
        const long = 'x'.repeat(200);
        const fromSamples = inferColumnTypeFromStats([long], 150);
        expect(fromSamples.MaxLength).toBeGreaterThanOrEqual(400); // 2× of 200 from the sample
    });

    it('falls to unbounded (MAX/TEXT) when the true max cannot be bounded', () => {
        const t = inferColumnTypeFromStats(['short'], 3000); // 2× = 6000 > 4000 cap
        expect(t.MaxLength).toBeNull();
        expect(t.SqlServerType).toBe('NVARCHAR(MAX)');
    });

    it('non-string inferences are untouched by maxLength', () => {
        const t = inferColumnTypeFromStats([true, false], 999);
        expect(t.SchemaFieldType).toBe('boolean');
        expect(t.MaxLength).toBeNull();
    });
});
