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
