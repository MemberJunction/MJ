/**
 * "Run Ad-hoc Query" must derive its SQL dialect from the provider that will
 * execute the SQL — never from a literal.
 *
 * The defect: `resolveCompositionTokens` called
 * `QueryCompositionEngine.ResolveComposition(sql, 'sqlserver', user)`. The CTE
 * assembly is emitted in the named platform's syntax, so on a PostgreSQL tenant
 * every composed ad-hoc query came back as T-SQL and failed at the database.
 *
 * The row cap (`ensureRowLimit`) was ALREADY dialect-aware. It is pinned here
 * too, precisely so this change cannot regress it while fixing the neighbour.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';
import { BaseEntity } from '@memberjunction/core';
import { QueryCompositionEngine, QueryPagingEngine } from '@memberjunction/generic-database-provider';
import { RunAdhocQueryAction } from '../custom/data/run-adhoc-query.action';

/** The private surface under test, exposed without weakening the class's own types. */
type AdhocInternals = {
    resolveCompositionTokens(sql: string, params: RunActionParams): string;
    ensureRowLimit(query: string, maxRows: number): string;
    resolvePlatform(): string;
};

function internals(): AdhocInternals {
    return new RunAdhocQueryAction() as unknown as AdhocInternals;
}

/** Stands in for the tenant's data provider; only `PlatformKey` is read. */
function stubProvider(platformKey: string): void {
    vi.spyOn(BaseEntity, 'Provider', 'get').mockReturnValue(
        { PlatformKey: platformKey } as unknown as typeof BaseEntity.Provider,
    );
}

const COMPOSED_SQL = 'SELECT * FROM {{query:"Demos/AI Agent Run Cost Summary"}} base';

const EMPTY_PARAMS = { Params: [], ContextUser: { ID: 'u1' } } as unknown as RunActionParams;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RunAdhocQueryAction platform resolution', () => {
    it('reports the provider\'s platform', () => {
        stubProvider('postgresql');
        expect(internals().resolvePlatform()).toBe('postgresql');

        vi.restoreAllMocks();
        stubProvider('sqlserver');
        expect(internals().resolvePlatform()).toBe('sqlserver');
    });

    it('falls back to SQL Server when no provider is configured', () => {
        vi.spyOn(BaseEntity, 'Provider', 'get').mockImplementation(() => {
            throw new Error('No global object store, so we cant get the static provider');
        });
        // The fallback must NOT be a throw. `BaseEntity.Provider` throws outright
        // when there is no global object store, and composition resolution never
        // read the provider before this change — it must not start failing in
        // provider-less contexts (tests, CLI).
        expect(() => internals().resolvePlatform()).not.toThrow();
        expect(internals().resolvePlatform()).toBe('sqlserver');
    });
});

describe('composition tokens are resolved for the tenant\'s platform', () => {
    it('passes the PostgreSQL platform through to ResolveComposition', () => {
        stubProvider('postgresql');
        const spy = vi
            .spyOn(QueryCompositionEngine.prototype, 'ResolveComposition')
            .mockReturnValue({ ResolvedSQL: 'resolved' } as ReturnType<QueryCompositionEngine['ResolveComposition']>);

        const out = internals().resolveCompositionTokens(COMPOSED_SQL, EMPTY_PARAMS);

        expect(out).toBe('resolved');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][1]).toBe('postgresql');
    });

    it('passes the SQL Server platform through to ResolveComposition', () => {
        stubProvider('sqlserver');
        const spy = vi
            .spyOn(QueryCompositionEngine.prototype, 'ResolveComposition')
            .mockReturnValue({ ResolvedSQL: 'resolved' } as ReturnType<QueryCompositionEngine['ResolveComposition']>);

        internals().resolveCompositionTokens(COMPOSED_SQL, EMPTY_PARAMS);

        expect(spy.mock.calls[0][1]).toBe('sqlserver');
    });

    it('never hardcodes a platform — the two tenants get different answers', () => {
        const seen: string[] = [];
        vi.spyOn(QueryCompositionEngine.prototype, 'ResolveComposition').mockImplementation(
            ((_sql: string, platform: string) => {
                seen.push(platform);
                return { ResolvedSQL: 'resolved' };
            }) as unknown as QueryCompositionEngine['ResolveComposition'],
        );

        for (const platform of ['sqlserver', 'postgresql']) {
            const restore = vi.spyOn(BaseEntity, 'Provider', 'get').mockReturnValue(
                { PlatformKey: platform } as unknown as typeof BaseEntity.Provider,
            );
            internals().resolveCompositionTokens(COMPOSED_SQL, EMPTY_PARAMS);
            restore.mockRestore();
        }

        expect(seen).toEqual(['sqlserver', 'postgresql']);
    });

    it('leaves SQL without composition tokens untouched, on either platform', () => {
        const spy = vi.spyOn(QueryCompositionEngine.prototype, 'ResolveComposition');
        stubProvider('postgresql');

        const plain = 'SELECT ID FROM vwUsers';
        expect(internals().resolveCompositionTokens(plain, EMPTY_PARAMS)).toBe(plain);
        expect(spy).not.toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────────────────────────────
// Already-correct behaviour, pinned so the fix above cannot regress it.
// ────────────────────────────────────────────────────────────────────────────
describe('row cap stays dialect-aware (no regression)', () => {
    it('caps with TOP on SQL Server', () => {
        stubProvider('sqlserver');
        const capped = internals().ensureRowLimit('SELECT ID, Name FROM vwUsers', 100);
        expect(capped).toMatch(/TOP\s+100/i);
        expect(capped).not.toMatch(/LIMIT\s+100/i);
    });

    it('caps with LIMIT on PostgreSQL', () => {
        stubProvider('postgresql');
        const capped = internals().ensureRowLimit('SELECT ID, Name FROM vwUsers', 100);
        expect(capped).toMatch(/LIMIT\s+100/i);
        expect(capped).not.toMatch(/TOP\s+100/i);
    });

    it('keeps SELECT DISTINCT valid on SQL Server (DISTINCT before TOP)', () => {
        stubProvider('sqlserver');
        const capped = internals().ensureRowLimit('SELECT DISTINCT Country FROM vwUsers', 50);
        expect(capped).toMatch(/SELECT\s+DISTINCT\s+TOP\s+50/i);
    });

    it('keeps SELECT DISTINCT valid on PostgreSQL', () => {
        stubProvider('postgresql');
        const capped = internals().ensureRowLimit('SELECT DISTINCT Country FROM vwUsers', 50);
        expect(capped).toMatch(/SELECT\s+DISTINCT/i);
        expect(capped).toMatch(/LIMIT\s+50/i);
    });
});

// ────────────────────────────────────────────────────────────────────────────
// The `ensureRowLimit` SAFETY NET — the `catch` arm, not the `try` arm.
//
// The suite above exercises the AST path (`QueryPagingEngine.WrapWithMaxRows`),
// which was already dialect-aware. The `catch` arm beneath it was NOT: it
// emitted `TOP` unconditionally. It is reached precisely when the AST path could
// not understand the SQL — so on a PostgreSQL tenant, a query that merely
// confused the parser came back as SQL that could not parse at all.
//
// An earlier audit retired this finding on the strength of the try arm being
// correct. These tests force the catch arm specifically so that cannot recur.
// ────────────────────────────────────────────────────────────────────────────
describe('row cap safety net (WrapWithMaxRows throws) is dialect-aware too', () => {
    /** Forces the `catch` arm by making the AST row-cap path fail. */
    function breakTheASTPath(): void {
        vi.spyOn(QueryPagingEngine, 'WrapWithMaxRows').mockImplementation(() => {
            throw new Error('AST parse failed');
        });
    }

    it('appends LIMIT on PostgreSQL instead of emitting T-SQL TOP', () => {
        breakTheASTPath();
        stubProvider('postgresql');
        const capped = internals().ensureRowLimit('SELECT ID, Name FROM vwUsers', 100);
        expect(capped).toMatch(/LIMIT\s+100\s*$/i);
        expect(capped).not.toMatch(/\bTOP\b/i);
    });

    it('still emits TOP on SQL Server', () => {
        breakTheASTPath();
        stubProvider('sqlserver');
        const capped = internals().ensureRowLimit('SELECT ID, Name FROM vwUsers', 100);
        expect(capped).toMatch(/SELECT\s+TOP\s+100\s/i);
        expect(capped).not.toMatch(/\bLIMIT\b/i);
    });

    it('keeps SELECT DISTINCT valid on PostgreSQL', () => {
        breakTheASTPath();
        stubProvider('postgresql');
        const capped = internals().ensureRowLimit('SELECT DISTINCT Country FROM vwUsers', 50);
        expect(capped).toBe('SELECT DISTINCT Country FROM vwUsers LIMIT 50');
    });

    it('is a no-op when the PostgreSQL query already carries a LIMIT', () => {
        breakTheASTPath();
        stubProvider('postgresql');
        const query = 'SELECT ID FROM vwUsers ORDER BY ID LIMIT 5';
        expect(internals().ensureRowLimit(query, 100)).toBe(query);
    });

    it('does not double-cap a SQL Server query that already carries a LIMIT', () => {
        // A LIMIT on a SQL Server tenant is not ours to fix, but capping it with
        // TOP on top would produce SQL that is wrong in a second way.
        breakTheASTPath();
        stubProvider('sqlserver');
        const query = 'SELECT ID FROM vwUsers LIMIT 5';
        expect(internals().ensureRowLimit(query, 100)).toBe(query);
    });

    it('is still a no-op when the query already carries TOP or OFFSET/FETCH', () => {
        breakTheASTPath();
        for (const platform of ['postgresql', 'sqlserver']) {
            for (const query of [
                'SELECT TOP 5 ID FROM vwUsers',
                'SELECT ID FROM vwUsers ORDER BY ID OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY',
            ]) {
                vi.restoreAllMocks();
                breakTheASTPath();
                stubProvider(platform);
                expect(internals().ensureRowLimit(query, 100), `${platform} / ${query}`).toBe(query);
            }
        }
    });

    it('puts LIMIT before nothing — a trailing semicolon is stripped first', () => {
        breakTheASTPath();
        stubProvider('postgresql');
        expect(internals().ensureRowLimit('SELECT ID FROM vwUsers;', 100)).toBe('SELECT ID FROM vwUsers LIMIT 100');
        expect(internals().ensureRowLimit('SELECT ID FROM vwUsers ;  ', 100)).toBe('SELECT ID FROM vwUsers LIMIT 100');
        expect(internals().ensureRowLimit('SELECT ID FROM vwUsers\n', 100)).toBe('SELECT ID FROM vwUsers LIMIT 100');
    });

    it('falls back to SQL Server when there is no provider at all', () => {
        breakTheASTPath();
        vi.spyOn(BaseEntity, 'Provider', 'get').mockImplementation(() => {
            throw new Error('No global object store, so we cant get the static provider');
        });
        const capped = internals().ensureRowLimit('SELECT ID FROM vwUsers', 100);
        expect(capped).toMatch(/SELECT\s+TOP\s+100\s/i);
    });
});
