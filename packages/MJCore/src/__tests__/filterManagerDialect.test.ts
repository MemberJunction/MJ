/**
 * RunQuerySQLFilterManager renders its database-dependent filters through the current platform's
 * dialect, and exposes that dialect so other code renders values the same way.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RunQuerySQLFilterManager } from '../generic/runQuerySQLFilterImplementations';

afterEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
});

describe('RunQuerySQLFilterManager.Dialect', () => {
    it('follows SetPlatform', () => {
        expect(RunQuerySQLFilterManager.Instance.Dialect.PlatformKey).toBe('sqlserver');
        RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
        expect(RunQuerySQLFilterManager.Instance.Dialect.PlatformKey).toBe('postgresql');
    });

    it('renders filters the way its dialect does', () => {
        for (const platform of ['sqlserver', 'postgresql'] as const) {
            const manager = RunQuerySQLFilterManager.Instance;
            manager.SetPlatform(platform);
            const dialect = manager.Dialect;
            expect(manager.executeFilter('sqlBoolean', true)).toBe(dialect.BooleanLiteral(true));
            expect(manager.executeFilter('sqlIdentifier', 'Name')).toBe(dialect.QuoteIdentifier('Name'));
            expect(manager.executeFilter('sqlString', '日本')).toBe(`${dialect.StringLiteralPrefix('日本')}'日本'`);
            expect(manager.executeFilter('sqlLikeContains', 'a_b')).toBe(`'%${dialect.EscapeLikePattern('a_b')}%'`);
        }
    });
});

describe('sqlDate', () => {
    it('writes the same quoted ISO literal on every dialect, through the dialect writer', () => {
        const date = new Date('2024-01-15T08:30:00.000Z');
        for (const key of ['sqlserver', 'postgresql', 'mysql', 'snowflake', 'databricks'] as const) {
            const filter = RunQuerySQLFilterManager.Instance.GetFiltersForDialect(key).find(f => f.name === 'sqlDate');
            expect(filter?.implementation?.(date)).toBe("'2024-01-15T08:30:00.000Z'");
            expect(filter?.implementation?.('2024-01-15T08:30:00Z')).toBe("'2024-01-15T08:30:00.000Z'");
            expect(filter?.implementation?.(date.getTime())).toBe("'2024-01-15T08:30:00.000Z'");
            expect(filter?.implementation?.('')).toBe('NULL');
            expect(() => filter?.implementation?.('not a date')).toThrow(/Invalid date/);
        }
    });
});
