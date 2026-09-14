/**
 * The dialect briefing an LLM is given must come from the dialect, not from prose.
 *
 * MemberJunction's SQL-writing prompts used to open with "you are the world's
 * greatest expert in Microsoft SQL Server and T-SQL" regardless of what the
 * tenant actually runs. The durable fix is a briefing COMPOSED from each
 * dialect's own primitives, so implementing a dialect is sufficient to get
 * correct guidance — there is no second per-dialect prose table to forget.
 *
 * These tests pin exactly that: PostgreSQL's briefing must contain PostgreSQL
 * syntax and must NOT contain T-SQL syntax.
 */
import { describe, it, expect } from 'vitest';
import { GetDialect, IsSupportedPlatform, SupportedPlatforms } from '../dialectFactory.js';

/**
 * Syntax that is T-SQL-only. Every one of these is something MemberJunction's
 * prompts actually taught unconditionally before the fix, and every one of them
 * is a hard error on PostgreSQL.
 */
const TSQL_ONLY = ['ISNULL(', 'GETDATE()', 'GETUTCDATE()', 'DATEADD(', 'NEWID()', 'SELECT TOP ', 'TOP 10'];

describe('SQLDialect.PromptGuidance', () => {
    describe('SQL Server', () => {
        const guidance = GetDialect('sqlserver').PromptGuidance;

        it('names the platform it is briefing for', () => {
            expect(guidance).toContain('Microsoft SQL Server (T-SQL)');
        });

        it('teaches T-SQL identifier quoting, row limiting and null-coalescing', () => {
            expect(guidance).toContain('[Order Date]');
            expect(guidance).toContain('[sales].[vwOrders]');
            expect(guidance).toContain('TOP 10');
            expect(guidance).toContain('OFFSET 50 ROWS FETCH NEXT 25 ROWS ONLY');
            expect(guidance).toContain('ISNULL(t.Amount, 0)');
            expect(guidance).toContain('GETUTCDATE()');
            expect(guidance).toContain('DATEADD(DAY, -30,');
            expect(guidance).toContain('NEWID()');
        });

        it('teaches T-SQL boolean literals, not PostgreSQL ones', () => {
            expect(guidance).toContain('1 (true)');
            expect(guidance).toContain('0 (false)');
            expect(guidance).not.toContain('true (true)');
        });
    });

    describe('PostgreSQL', () => {
        const guidance = GetDialect('postgresql').PromptGuidance;

        it('names the platform it is briefing for', () => {
            expect(guidance).toContain('PostgreSQL');
            expect(guidance).not.toContain('Microsoft SQL Server');
        });

        it('teaches PostgreSQL identifier quoting, row limiting and null-coalescing', () => {
            expect(guidance).toContain('"Order Date"');
            expect(guidance).toContain('"sales"."vwOrders"');
            expect(guidance).toContain('LIMIT 10');
            expect(guidance).toContain('LIMIT 25 OFFSET 50');
            expect(guidance).toContain('COALESCE(t.Amount, 0)');
            expect(guidance).toContain("NOW() AT TIME ZONE 'UTC'");
            expect(guidance).toContain("INTERVAL '-30 days'");
            expect(guidance).toContain('gen_random_uuid()');
        });

        it('teaches PostgreSQL boolean literals', () => {
            expect(guidance).toContain('true (true)');
            expect(guidance).toContain('false (false)');
        });

        // THE regression this whole change exists to prevent: a PostgreSQL tenant
        // being handed T-SQL and burning LLM turns failing on it.
        it.each(TSQL_ONLY)('must not teach the T-SQL-only construct %s', (construct) => {
            expect(guidance).not.toContain(construct);
        });

        it('must not teach T-SQL bracket quoting', () => {
            expect(guidance).not.toMatch(/\[[A-Za-z_][A-Za-z0-9_ ]*\]/);
        });
    });

    it('gives every supported platform a distinct briefing', () => {
        const guidances = SupportedPlatforms().map(p => GetDialect(p).PromptGuidance);
        expect(guidances.length).toBeGreaterThan(1);
        expect(new Set(guidances).size).toBe(guidances.length);
        for (const g of guidances) {
            expect(g.trim().length).toBeGreaterThan(0);
        }
    });
});

describe('SQLDialect.FormatterLanguage', () => {
    it('is the sql-formatter key for each platform', () => {
        expect(GetDialect('sqlserver').FormatterLanguage).toBe('tsql');
        expect(GetDialect('postgresql').FormatterLanguage).toBe('postgresql');
    });

    it('is distinct per platform, so a formatter cannot silently reuse one dialect', () => {
        const languages = SupportedPlatforms().map(p => GetDialect(p).FormatterLanguage);
        expect(new Set(languages).size).toBe(languages.length);
    });
});

describe('SQLDialect.DisplayName', () => {
    it('is distinct per platform', () => {
        const names = SupportedPlatforms().map(p => GetDialect(p).DisplayName);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('platform registry predicates', () => {
    it('accepts every platform GetDialect can serve', () => {
        for (const platform of SupportedPlatforms()) {
            expect(IsSupportedPlatform(platform)).toBe(true);
            expect(() => GetDialect(platform)).not.toThrow();
        }
    });

    it('rejects platforms this build has no dialect for', () => {
        expect(IsSupportedPlatform('mysql')).toBe(false);
        expect(IsSupportedPlatform('')).toBe(false);
        expect(IsSupportedPlatform(null)).toBe(false);
        expect(IsSupportedPlatform(undefined)).toBe(false);
    });

    it('is not fooled by inherited Object properties', () => {
        expect(IsSupportedPlatform('toString')).toBe(false);
        expect(IsSupportedPlatform('constructor')).toBe(false);
    });
});
