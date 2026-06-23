import { describe, it, expect, vi } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg so we can instantiate the provider without a real DB
vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

/**
 * Tests for translateTSQLDateFunctions — the runtime backstop that rewrites the
 * SQL Server date/time functions hand-written into ExtraFilter/OrderBy clauses
 * into PostgreSQL equivalents. PG has no GETUTCDATE/GETDATE/DATEADD and there is
 * no shim function, so without this an untranslated clause errors with
 * `function getutcdate() does not exist`.
 */
describe('PostgreSQLDataProvider.translateTSQLDateFunctions', () => {
    const provider = new PostgreSQLDataProvider();
    const t = (sql: string) => provider.translateTSQLDateFunctions(sql);

    describe('zero-arg now() variants', () => {
        it('translates GETUTCDATE()', () => {
            expect(t('ExpiresAt > GETUTCDATE()')).toBe("ExpiresAt > (NOW() AT TIME ZONE 'UTC')");
        });

        it('translates GETDATE()', () => {
            expect(t('ActiveAt <= GETDATE()')).toBe('ActiveAt <= CURRENT_TIMESTAMP');
        });

        it('translates SYSDATETIMEOFFSET()', () => {
            expect(t('x = SYSDATETIMEOFFSET()')).toBe('x = NOW()');
        });

        it('is case-insensitive and tolerates inner whitespace', () => {
            expect(t('getutcdate(  )')).toBe("(NOW() AT TIME ZONE 'UTC')");
        });

        it('does not touch a column whose name merely starts with the token (no parens)', () => {
            expect(t('GetdateColumn > 5')).toBe('GetdateColumn > 5');
        });
    });

    describe('DATEADD', () => {
        it('translates DATEADD(day, -7, GETUTCDATE())', () => {
            expect(t('StartedAt >= DATEADD(day, -7, GETUTCDATE())'))
                .toBe("StartedAt >= ((NOW() AT TIME ZONE 'UTC') + (-7) * INTERVAL '1 day')");
        });

        it('translates DATEADD with a non-literal numeric expression', () => {
            expect(t('Created < DATEADD(day, -30, GETUTCDATE())'))
                .toBe("Created < ((NOW() AT TIME ZONE 'UTC') + (-30) * INTERVAL '1 day')");
        });

        it('maps common datepart abbreviations', () => {
            expect(t('a > DATEADD(hh, -1, GETDATE())'))
                .toBe("a > (CURRENT_TIMESTAMP + (-1) * INTERVAL '1 hour')");
            expect(t('a > DATEADD(mm, 3, GETDATE())'))
                .toBe("a > (CURRENT_TIMESTAMP + (3) * INTERVAL '1 month')");
        });

        it('leaves an unknown datepart verbatim (provable-only — no guessing)', () => {
            // quarter has no direct PG INTERVAL unit -> left as-is
            expect(t('a > DATEADD(quarter, -1, GETDATE())'))
                .toBe('a > DATEADD(quarter, -1, CURRENT_TIMESTAMP)');
        });

        it('handles a nested DATEADD in the expression arg', () => {
            expect(t('DATEADD(day, 1, DATEADD(hour, 2, GETUTCDATE()))'))
                .toBe("(((NOW() AT TIME ZONE 'UTC') + (2) * INTERVAL '1 hour') + (1) * INTERVAL '1 day')");
        });
    });

    describe('safety', () => {
        it('returns empty/blank input unchanged', () => {
            expect(t('')).toBe('');
        });

        it('leaves a clause with no T-SQL date funcs unchanged', () => {
            expect(t("Status = 'Active' AND Name LIKE '%foo%'"))
                .toBe("Status = 'Active' AND Name LIKE '%foo%'");
        });

        it('does not corrupt single-quoted string literals containing commas/parens', () => {
            expect(t("Note = 'a, b (c)' AND t > GETUTCDATE()"))
                .toBe("Note = 'a, b (c)' AND t > (NOW() AT TIME ZONE 'UTC')");
        });
    });
});
