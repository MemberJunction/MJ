/**
 * `ResolvePlatformKey` is THE seam through which runtime code picks a SQL dialect.
 *
 * Before it existed, each caller wrote its own `'sqlserver'` literal — invisible
 * on a SQL Server tenant and silently wrong on every other one. These tests pin
 * the two properties the callers depend on:
 *
 *   1. the answer comes from the provider, not from a literal; and
 *   2. when there is no provider, the answer is the documented historical
 *      default rather than a throw.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_DATABASE_PLATFORM,
    DescribeSQLDialectForPrompt,
    DescribeSQLDialectName,
    ResolvePlatformKey,
    ResolveSQLFormatterLanguage,
} from '../generic/platformSQL';

describe('ResolvePlatformKey', () => {
    it('reads the platform off the provider', () => {
        expect(ResolvePlatformKey({ PlatformKey: 'postgresql' })).toBe('postgresql');
        expect(ResolvePlatformKey({ PlatformKey: 'sqlserver' })).toBe('sqlserver');
    });

    it('does not answer "sqlserver" for a PostgreSQL provider', () => {
        expect(ResolvePlatformKey({ PlatformKey: 'postgresql' })).not.toBe('sqlserver');
    });

    it('falls back to the historical default when no provider is available', () => {
        expect(DEFAULT_DATABASE_PLATFORM).toBe('sqlserver');
        expect(ResolvePlatformKey(undefined)).toBe(DEFAULT_DATABASE_PLATFORM);
        expect(ResolvePlatformKey(null)).toBe(DEFAULT_DATABASE_PLATFORM);
    });

    it('falls back when the provider does not name a platform', () => {
        expect(ResolvePlatformKey({})).toBe(DEFAULT_DATABASE_PLATFORM);
        expect(ResolvePlatformKey({ PlatformKey: null })).toBe(DEFAULT_DATABASE_PLATFORM);
        expect(ResolvePlatformKey({ PlatformKey: '' })).toBe(DEFAULT_DATABASE_PLATFORM);
    });

    it('falls back — rather than throwing downstream — for a platform this build cannot serve', () => {
        expect(ResolvePlatformKey({ PlatformKey: 'mysql' })).toBe(DEFAULT_DATABASE_PLATFORM);
        expect(() => DescribeSQLDialectForPrompt(ResolvePlatformKey({ PlatformKey: 'mysql' }))).not.toThrow();
    });

    it('honours an explicit fallback', () => {
        expect(ResolvePlatformKey(undefined, 'postgresql')).toBe('postgresql');
        expect(ResolvePlatformKey({ PlatformKey: 'sqlserver' }, 'postgresql')).toBe('sqlserver');
    });
});

describe('dialect description helpers', () => {
    it('describes a PostgreSQL tenant without teaching T-SQL', () => {
        const guidance = DescribeSQLDialectForPrompt('postgresql');
        expect(guidance).toContain('PostgreSQL');
        expect(guidance).not.toContain('ISNULL(');
        expect(guidance).not.toContain('GETDATE()');
        expect(guidance).not.toContain('DATEADD(');
        expect(guidance).not.toContain('NEWID()');
    });

    it('describes a SQL Server tenant in T-SQL', () => {
        const guidance = DescribeSQLDialectForPrompt('sqlserver');
        expect(guidance).toContain('ISNULL(');
        expect(guidance).toContain('DATEADD(');
    });

    it('names each platform distinctly', () => {
        expect(DescribeSQLDialectName('postgresql')).toBe('PostgreSQL');
        expect(DescribeSQLDialectName('sqlserver')).toContain('SQL Server');
    });

    it('resolves the sql-formatter language per platform', () => {
        expect(ResolveSQLFormatterLanguage('sqlserver')).toBe('tsql');
        expect(ResolveSQLFormatterLanguage('postgresql')).toBe('postgresql');
    });
});
