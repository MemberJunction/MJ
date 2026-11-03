import { describe, it, expect, vi } from 'vitest';
import { EntityFieldInfo } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg so the provider can be constructed without a real database.
vi.mock('pg', () => {
    const mockPool = {
        connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
        query: vi.fn().mockResolvedValue({ rows: [] }),
        end: vi.fn().mockResolvedValue(undefined),
    };
    return { default: { Pool: vi.fn(() => mockPool) } };
});

/**
 * PostgreSQL user search is case-insensitive like SQL Server's default collation (#5833):
 * both the column and the term are lowercased, keeping a prefix search index-seekable with a
 * `LOWER(col) varchar_pattern_ops` expression index.
 */
class SearchProbe extends PostgreSQLDataProvider {
    public Predicate(field: EntityFieldInfo, escapedTerm: string, rawTerm: string): string {
        return this.buildPerFieldSearchPredicate(field, escapedTerm, rawTerm);
    }
    public Column(field: EntityFieldInfo): string {
        return this.buildUserSearchColumnExpression(field);
    }
}

function makeField(opts: { name?: string; type?: string; length?: number; predicate?: string; format?: string | null }): EntityFieldInfo {
    const f = new EntityFieldInfo();
    f.Name = opts.name ?? 'LastName';
    f.Type = opts.type ?? 'nvarchar';
    f.Length = opts.length ?? 200;
    f.IncludeInUserSearchAPI = true;
    f.UserSearchPredicateAPI = opts.predicate ?? 'Contains';
    f.UserSearchParamFormatAPI = opts.format ?? null;
    return f;
}

describe('PostgreSQL user search predicate', () => {
    const p = new SearchProbe();

    it.each([
        ['Exact', ` = LOWER('Smith')`],
        ['BeginsWith', ` LIKE LOWER('Smith%')`],
        ['EndsWith', ` LIKE LOWER('%Smith')`],
        ['Contains', ` LIKE LOWER('%Smith%')`],
    ])('%s lowercases the term', (predicate, expected) => {
        expect(p.Predicate(makeField({ predicate }), 'Smith', 'Smith')).toBe(expected);
    });

    it('lowercases the column for a text field', () => {
        expect(p.Column(makeField({}))).toBe('LOWER("LastName")');
    });

    it('keeps the plain column and the format for a UserSearchParamFormatAPI field', () => {
        const f = makeField({ format: `ILIKE '%{0}%'` });
        expect(p.Column(f)).toBe('"LastName"');
        expect(p.Predicate(f, 'x', 'x')).toBe(`ILIKE '%x%'`);
    });

    it('skips non-text and unbounded fields', () => {
        expect(p.Predicate(makeField({ type: 'int' }), '1', '1')).toBe('');
        expect(p.Column(makeField({ type: 'int' }))).toBe('"LastName"');
        expect(p.Predicate(makeField({ length: -1 }), 'x', 'x')).toBe('');
    });

    it('keeps the escaped LIKE term inside LOWER', () => {
        expect(p.Predicate(makeField({ predicate: 'BeginsWith' }), 'O\\_Brien', "O_Brien")).toBe(` LIKE LOWER('O\\_Brien%')`);
    });
});
