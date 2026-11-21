import { describe, it, expect } from 'vitest';
import { EntityFieldInfo } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

/** Exposes the protected per-field predicate builder. */
class Probe extends PostgreSQLDataProvider {
    public Predicate(field: EntityFieldInfo, escapedTerm: string, rawSafeTerm: string): string {
        return this.buildPerFieldSearchPredicate(field, escapedTerm, rawSafeTerm);
    }
}

const textField = (predicate: string): EntityFieldInfo =>
    new EntityFieldInfo({ Name: 'Name', Type: 'nvarchar', Length: 200, UserSearchParamFormatAPI: null, UserSearchPredicateAPI: predicate });

describe('PostgreSQL user search predicates', () => {
    const probe = new Probe();

    it.each([
        ['Contains', " ILIKE '%acme%'"],
        ['BeginsWith', " ILIKE 'acme%'"],
        ['EndsWith', " ILIKE '%acme'"],
        ['Exact', " ILIKE 'acme'"],
    ])('%s matches case-insensitively, as SQL Server does', (predicate, expected) => {
        expect(probe.Predicate(textField(predicate), 'acme', 'acme')).toBe(expected);
    });
});
