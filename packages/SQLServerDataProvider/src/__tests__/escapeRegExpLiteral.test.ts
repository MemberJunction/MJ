/**
 * Batch parameter-name escaping (issue #3171).
 *
 * `ExecuteSQLBatchStatic` / `ExecuteSQLBatch` rewrite `@name` placeholders to
 * `@q<N>_name` by interpolating the caller's parameter name into a `RegExp`.
 * Unescaped, a `$` in that name acts as an end-anchor: the pattern matches
 * nothing, the placeholder is never rewritten, and mssql then fails with
 * "Must declare the scalar variable" while `batchParameters` holds the prefixed
 * name. This is the sibling of the `escapeRegExp` fix the same sweep applied in
 * PostgreSQLDataProvider.
 *
 * The escape helper is the tested seam: its only callers sit inside methods that
 * require a live mssql connection, so the rewrite itself cannot be unit-tested
 * without a connection. The end-to-end rewrite is reconstructed here from the
 * same two expressions the caller uses.
 */
import { describe, it, expect } from 'vitest';
import { escapeRegExpLiteral } from '../SQLServerDataProvider';

/** Mirrors the caller: build the pattern, substitute the prefixed name. */
const rewrite = (query: string, key: string, queryIndex = 0): string => {
    const prefixed = `@q${queryIndex}_${key}`;
    return query.replace(new RegExp(`@${escapeRegExpLiteral(key)}\\b`, 'g'), () => prefixed);
};

describe('escapeRegExpLiteral', () => {
    it('escapes every regex metacharacter', () => {
        expect(escapeRegExpLiteral('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'))
            .toBe('a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
    });

    it('leaves an ordinary name untouched', () => {
        expect(escapeRegExpLiteral('CustomerID')).toBe('CustomerID');
    });
});

describe('batch placeholder rewriting — $ in a parameter name (#3171)', () => {
    for (const key of ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b']) {
        it(`rewrites @${key} instead of silently leaving it`, () => {
            const out = rewrite(`SELECT * FROM T WHERE X = @${key} AND Y = 1`, key);
            expect(out).toBe(`SELECT * FROM T WHERE X = @q0_${key} AND Y = 1`);
        });
    }

    it('still rewrites an ordinary parameter name', () => {
        expect(rewrite('WHERE Id = @Id', 'Id')).toBe('WHERE Id = @q0_Id');
    });

    it('still respects the word boundary', () => {
        // @IdType must not be rewritten when only @Id was supplied.
        expect(rewrite('WHERE A = @Id AND B = @IdType', 'Id'))
            .toBe('WHERE A = @q0_Id AND B = @IdType');
    });
});
