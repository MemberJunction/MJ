import { describe, it, expect } from 'vitest';
import { BuildContentHashPrefetchFilter, QuoteTextLiteral, type SqlQuoter } from '../prefetchFilter.js';

// Dialect stand-ins mirroring the real providers (see MJCore databaseProviderBase.test.ts):
// SQL Server brackets identifiers, PostgreSQL double-quotes them; both single-quote string literals
// with '' escaping.
const sqlServer: SqlQuoter = {
    QuoteIdentifier: (n) => `[${n}]`,
    QuoteStringLiteral: (v) => `'${v.replace(/'/g, "''")}'`,
};
const postgres: SqlQuoter = {
    QuoteIdentifier: (n) => `"${n}"`,
    QuoteStringLiteral: (v) => `'${v.replace(/'/g, "''")}'`,
};

describe('buildContentHashPrefetchFilter (MJ#3047 — reserved-word PK content-hash prefetch)', () => {
    describe('the bug: a reserved-word PK column must be quoted', () => {
        it('SQL Server: `key` PK is bracketed — NOT a bare `key IN (...)` (which the DB rejects)', () => {
            const filter = BuildContentHashPrefetchFilter(['key'], ['custom_objects-1', 'custom_objects-2'], sqlServer);
            expect(filter).toBe("[key] IN ('custom_objects-1','custom_objects-2')");
            // Regression guard: the pre-fix code emitted `key IN (...)` (unquoted) → syntax error on the
            // reserved word → prefetch swallowed the error → content-hash idempotency silently disabled.
            expect(filter).not.toMatch(/(^|[^[\w])key\s+IN/i);
        });

        it('PostgreSQL: `key` PK is double-quoted (dialect-aware — no SS brackets on PG)', () => {
            const filter = BuildContentHashPrefetchFilter(['key'], ['a'], postgres);
            expect(filter).toBe('"key" IN (\'a\')');
        });
    });

    describe('non-reserved single PK still works (no regression)', () => {
        it('quotes a normal `id` PK + its value literals', () => {
            expect(BuildContentHashPrefetchFilter(['id'], ['1', '2'], sqlServer)).toBe("[id] IN ('1','2')");
        });
        it('escapes single quotes in value literals', () => {
            expect(BuildContentHashPrefetchFilter(['id'], ["O'Brien"], sqlServer)).toBe("[id] IN ('O''Brien')");
        });
    });

    describe('composite PK: every identifier AND value is quoted', () => {
        it('builds an OR of AND-ed per-record clauses, all quoted', () => {
            const filter = BuildContentHashPrefetchFilter(['user', 'order'], ['u1|o1', 'u2|o2'], sqlServer);
            expect(filter).toBe(
                "([user] = 'u1' AND [order] = 'o1') OR ([user] = 'u2' AND [order] = 'o2')",
            );
            // `user` and `order` are BOTH reserved words — proves the composite path quotes them too.
            expect(filter).not.toMatch(/(^|[^[\w])(user|order)\s*=/i);
        });

        it('tolerates a missing composite part (treats it as empty)', () => {
            expect(BuildContentHashPrefetchFilter(['a', 'b'], ['x'], postgres)).toBe(
                '("a" = \'x\' AND "b" = \'\')',
            );
        });
    });
});

describe('quoteTextLiteral (SQL Server varchar-literal truncation)', () => {
    // The quoters above deliberately carry no PlatformKey — see the last test.
    const ss: SqlQuoter = { ...sqlServer, PlatformKey: 'sqlserver' };
    const pg: SqlQuoter = { ...postgres, PlatformKey: 'postgresql' };

    it('SQL Server: prefixes N so the literal is nvarchar, matching the column', () => {
        // Verified live on SQL_Latin1_General_CP1_CI_AS: the bare form reads as
        // 'ünïcödé-O-???' and matches zero rows; the N-prefixed form matches the stored row.
        expect(QuoteTextLiteral('ünïcödé-Ω-日本語', ss)).toBe("N'ünïcödé-Ω-日本語'");
    });

    it('PostgreSQL: no prefix — its literals are already Unicode and it has no N form', () => {
        expect(QuoteTextLiteral('ünïcödé-Ω-日本語', pg)).toBe("'ünïcödé-Ω-日本語'");
    });

    it('still escapes embedded apostrophes on both platforms', () => {
        expect(QuoteTextLiteral("O'Brien", ss)).toBe("N'O''Brien'");
        expect(QuoteTextLiteral("O'Brien", pg)).toBe("'O''Brien'");
    });

    it('leaves plain ASCII alone apart from the prefix (no behaviour change for the common case)', () => {
        expect(QuoteTextLiteral('EXT-000001', ss)).toBe("N'EXT-000001'");
        expect(QuoteTextLiteral('EXT-000001', pg)).toBe("'EXT-000001'");
    });

    it('falls back to the plain literal when the quoter reports no platform', () => {
        // A hand-rolled quoter (or a future dialect) must not silently get SQL Server syntax.
        expect(QuoteTextLiteral('x', sqlServer)).toBe("'x'");
    });
});
