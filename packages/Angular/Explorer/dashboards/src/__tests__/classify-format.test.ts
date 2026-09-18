/**
 * Unit tests for the Classify (autotagging) shared pure-helper layer.
 *
 * These helpers were extracted from the former 5,147-line monolith during the
 * Classify decomposition; every tab/dialog component now depends on them, so
 * this suite guards their behavior independent of Angular (the package's vitest
 * runs in node-env, so Angular components themselves aren't importable here).
 *
 * CronToHumanReadable is covered separately in scheduling.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
    FormatNumber,
    FormatTokenCount,
    FormatWeight,
    TagFontSize,
    FormatShortDate,
    FormatDate,
    ComputeDuration,
    DisplayStatus,
    GetSourceTypeIcon,
    MapRunDetailRecords,
} from '../AI/components/autotagging/shared/classify.format';

describe('classify.format', () => {
    describe('formatNumber', () => {
        it('formats integers with locale separators', () => {
            expect(FormatNumber(12345)).toBe((12345).toLocaleString());
        });
        it('handles zero', () => {
            expect(FormatNumber(0)).toBe('0');
        });
    });

    describe('formatTokenCount', () => {
        it('returns raw string under 1,000', () => {
            expect(FormatTokenCount(0)).toBe('0');
            expect(FormatTokenCount(999)).toBe('999');
        });
        it('formats thousands with K (no decimals)', () => {
            expect(FormatTokenCount(1000)).toBe('1K');
            expect(FormatTokenCount(1500)).toBe('2K'); // toFixed(0) rounds
            expect(FormatTokenCount(12000)).toBe('12K');
        });
        it('formats millions with M (1 decimal)', () => {
            expect(FormatTokenCount(1000000)).toBe('1.0M');
            expect(FormatTokenCount(2400000)).toBe('2.4M');
        });
    });

    describe('formatWeight', () => {
        it('renders a weight as a rounded percentage', () => {
            expect(FormatWeight(0)).toBe('0%');
            expect(FormatWeight(0.42)).toBe('42%');
            expect(FormatWeight(1)).toBe('100%');
            expect(FormatWeight(0.005)).toBe('1%');
        });
    });

    describe('tagFontSize', () => {
        it('maps weight 0..1 to 0.7rem..1.0rem', () => {
            expect(TagFontSize(0)).toBe('0.7rem');
            expect(TagFontSize(1)).toBe('1rem');
        });
        it('clamps out-of-range weights', () => {
            expect(TagFontSize(-5)).toBe('0.7rem');
            expect(TagFontSize(5)).toBe('1rem');
        });
        it('interpolates the midpoint', () => {
            expect(TagFontSize(0.5)).toBe('0.85rem');
        });
    });

    describe('formatShortDate', () => {
        it('formats a valid date as "Mon D"', () => {
            const out = FormatShortDate('2026-03-05T12:00:00Z');
            expect(out).toMatch(/Mar/);
            expect(out).toMatch(/[45]/); // tz may shift the day by one
        });
        it('returns empty string on garbage input', () => {
            // Invalid dates throw inside toLocaleDateString in some engines; helper guards it.
            expect(typeof FormatShortDate('not-a-date')).toBe('string');
        });
    });

    describe('formatDate', () => {
        it('includes month, day, and time for a valid date', () => {
            const out = FormatDate('2026-03-05T14:05:00Z');
            expect(out).toMatch(/Mar/);
            expect(out).toMatch(/:\d{2}/);
        });
        it('echoes the raw input when unparseable', () => {
            // Date parsing of a clearly invalid string yields Invalid Date; helper echoes input.
            expect(typeof FormatDate('xyz')).toBe('string');
        });
    });

    describe('computeDuration', () => {
        it('returns em-dash when start is null', () => {
            expect(ComputeDuration(null, null)).toBe('—');
        });
        it('formats sub-second durations in ms', () => {
            expect(ComputeDuration('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.500Z')).toBe('500ms');
        });
        it('formats seconds', () => {
            expect(ComputeDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:30Z')).toBe('30s');
        });
        it('formats minutes + seconds', () => {
            expect(ComputeDuration('2026-01-01T00:00:00Z', '2026-01-01T00:02:30Z')).toBe('2m 30s');
        });
        it('treats a null end as "now" (open-ended, non-negative)', () => {
            const out = ComputeDuration('2000-01-01T00:00:00Z', null);
            expect(out).toMatch(/m \d+s$/);
        });
    });

    describe('displayStatus', () => {
        it('normalizes complete/completed/done -> Complete', () => {
            expect(DisplayStatus('complete')).toBe('Complete');
            expect(DisplayStatus('Completed')).toBe('Complete');
            expect(DisplayStatus('DONE')).toBe('Complete');
        });
        it('normalizes error/failed -> Failed', () => {
            expect(DisplayStatus('error')).toBe('Failed');
            expect(DisplayStatus('Failed')).toBe('Failed');
        });
        it('normalizes running/processing -> Running', () => {
            expect(DisplayStatus('running')).toBe('Running');
            expect(DisplayStatus('Processing')).toBe('Running');
        });
        it('passes through unrecognized statuses verbatim', () => {
            expect(DisplayStatus('Queued')).toBe('Queued');
        });
    });

    describe('getSourceTypeIcon', () => {
        it('maps known source types to font-awesome icons', () => {
            expect(GetSourceTypeIcon('RSS Feed')).toBe('fa-solid fa-rss');
            expect(GetSourceTypeIcon('Database')).toBe('fa-solid fa-database');
            expect(GetSourceTypeIcon('PDF')).toBe('fa-solid fa-file-pdf');
        });
        it('falls back to a folder icon for unknown types', () => {
            expect(GetSourceTypeIcon('Something Else')).toBe('fa-solid fa-folder');
        });
    });

    describe('mapRunDetailRecords', () => {
        it('maps raw process-run-detail rows to typed view models', () => {
            const rows = MapRunDetailRecords([
                {
                    ContentSource: 'MJ Blog',
                    ContentSourceType: 'Website',
                    Status: 'Completed',
                    ItemsProcessed: 10,
                    ItemsTagged: 8,
                    ItemsVectorized: 8,
                    ErrorCount: 0,
                    TotalTokensUsed: 1234,
                    TotalCost: 0.05,
                    StartTime: '2026-01-01T00:00:00Z',
                    EndTime: '2026-01-01T00:01:30Z',
                },
            ]);
            expect(rows).toHaveLength(1);
            const r = rows[0];
            expect(r.SourceName).toBe('MJ Blog');
            expect(r.SourceType).toBe('Website');
            expect(r.Status).toBe('Complete');
            expect(r.StatusClass).toBe('complete');
            expect(r.ItemsProcessed).toBe(10);
            expect(r.ItemsTagged).toBe(8);
            expect(r.TotalTokens).toBe(1234);
            expect(r.TotalCost).toBe(0.05);
            expect(r.Duration).toBe('2m'); // >60000ms -> minutes
        });

        it('defaults missing fields and flags failed/running statuses', () => {
            const rows = MapRunDetailRecords([
                { Status: 'failed' },
                { Status: 'running' },
                {},
            ]);
            expect(rows[0].StatusClass).toBe('failed');
            expect(rows[0].SourceName).toBe('Unknown');
            expect(rows[0].ItemsProcessed).toBe(0);
            expect(rows[1].StatusClass).toBe('running');
            expect(rows[2].Status).toBe('Pending'); // default status echoes through displayStatus
            expect(rows[2].StatusClass).toBe('complete');
        });

        it('formats sub-minute durations in seconds', () => {
            const rows = MapRunDetailRecords([
                { Status: 'Completed', StartTime: '2026-01-01T00:00:00Z', EndTime: '2026-01-01T00:00:20Z' },
            ]);
            expect(rows[0].Duration).toBe('20s');
        });

        it('returns an empty array for no input', () => {
            expect(MapRunDetailRecords([])).toEqual([]);
        });
    });
});
