/**
 * QueryBuilderAgent pretty-prints the SQL it produces. It used to do so with
 * `formatSQL({ language: 'tsql' })` — hardcoded — so a PostgreSQL tenant had its
 * SQL re-formatted against T-SQL rules.
 *
 * The formatter language now comes from the dialect declared by the tenant's own
 * provider. These tests pin that the language is DERIVED, not literal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

const formatMock = vi.fn((sql: string) => `formatted:${sql}`);

vi.mock('sql-formatter', async () => {
    const actual = await vi.importActual<typeof import('sql-formatter')>('sql-formatter');
    return {
        ...actual,
        format: (sql: string, options: { language?: string }) => formatMock(sql, options),
    };
});

import { QueryBuilderAgent } from '../query-builder-agent';

type Formattable = { formatPayloadSql<P>(payload: P): P | null };

function agent(): Formattable {
    return new QueryBuilderAgent() as unknown as Formattable;
}

function stubProvider(platformKey: string): void {
    vi.spyOn(BaseEntity, 'Provider', 'get').mockReturnValue(
        { PlatformKey: platformKey } as unknown as ReturnType<typeof BaseEntity.Provider>,
    );
}

function languageUsed(): string | undefined {
    const options = formatMock.mock.calls.at(-1)?.[1] as { language?: string } | undefined;
    return options?.language;
}

afterEach(() => {
    vi.restoreAllMocks();
    formatMock.mockClear();
});

describe('QueryBuilderAgent SQL formatting language', () => {
    it('formats a PostgreSQL tenant\'s SQL as PostgreSQL, not T-SQL', () => {
        stubProvider('postgresql');

        agent().formatPayloadSql({ metadata: { sql: 'select 1' } });

        expect(formatMock).toHaveBeenCalledTimes(1);
        expect(languageUsed()).toBe('postgresql');
        expect(languageUsed()).not.toBe('tsql');
    });

    it('formats a SQL Server tenant\'s SQL as T-SQL', () => {
        stubProvider('sqlserver');

        agent().formatPayloadSql({ metadata: { sql: 'select 1' } });

        expect(languageUsed()).toBe('tsql');
    });

    it('is derived, not hardcoded — two tenants get two languages', () => {
        const seen: Array<string | undefined> = [];
        for (const platform of ['sqlserver', 'postgresql']) {
            const restore = vi.spyOn(BaseEntity, 'Provider', 'get').mockReturnValue(
                { PlatformKey: platform } as unknown as ReturnType<typeof BaseEntity.Provider>,
            );
            agent().formatPayloadSql({ metadata: { sql: 'select 1' } });
            seen.push(languageUsed());
            restore.mockRestore();
        }
        expect(seen).toEqual(['tsql', 'postgresql']);
    });

    it('falls back to T-SQL when no provider is configured (historical default)', () => {
        vi.spyOn(BaseEntity, 'Provider', 'get').mockImplementation(() => {
            throw new Error('No global object store, so we cant get the static provider');
        });

        // Formatting is cosmetic; a provider-less context must not sink the payload.
        expect(() => agent().formatPayloadSql({ metadata: { sql: 'select 1' } })).not.toThrow();
        expect(languageUsed()).toBe('tsql');
    });

    it('still returns the formatted payload, not just the language choice', () => {
        stubProvider('postgresql');

        const result = agent().formatPayloadSql<{ metadata: { sql: string } }>({ metadata: { sql: 'select 1' } });

        expect(result?.metadata.sql).toBe('formatted:select 1');
    });

    it('leaves a payload with no SQL alone', () => {
        stubProvider('postgresql');

        expect(agent().formatPayloadSql({ metadata: {} })).toBeNull();
        expect(agent().formatPayloadSql({})).toBeNull();
        expect(formatMock).not.toHaveBeenCalled();
    });
});
