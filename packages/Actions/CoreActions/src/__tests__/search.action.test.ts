/**
 * The `Search` action (`__Internal_Search`) — its audience contract: an action that declares it can honour
 * `RunActionParams.Audience` must hand the readers to the search engine (which keeps only what every reader may
 * read) and must not show the room `SourceCounts`, which are counted before that filtering. The search names no
 * scope, so there is no per-reader scope gate to run. And its run-scope contract: it takes no tenant, so inside a
 * tenant-scoped agent run it refuses rather than search across tenants.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple, ActionParam } from '@memberjunction/actions-base';
import type { SearchParams, SearchResult } from '@memberjunction/search-engine';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const searchSpy = vi.fn<(params: SearchParams, user: unknown) => Promise<SearchResult>>();

vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Config: vi.fn(async () => {}),
            Search: (params: SearchParams, user: unknown) => searchSpy(params, user),
        },
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: unknown): Promise<unknown> { return null; }
    },
}));

import { SearchAction } from '../custom/search/search.action';

const SOURCE_COUNTS = { Vector: 4, FullText: 1, Entity: 9, Storage: 2 };

function paramsFor(audience?: { Readers: Array<{ ID: string; Name: string; UserRoles: unknown[] }> }): RunActionParams {
    return {
        Action: { Name: 'Search' },
        ContextUser: { ID: 'u1' },
        Params: [{ Name: 'Query', Value: 'refund policy', Type: 'Input' }],
        Filters: [],
        ...(audience ? { Audience: audience } : {}),
    } as unknown as RunActionParams;
}

async function run(params: RunActionParams): Promise<ActionResultSimple> {
    const action = new SearchAction() as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> };
    return action.InternalRunAction(params);
}

const outputNames = (result: ActionResultSimple): string[] => (result.Params ?? []).map((p: ActionParam) => p.Name);

describe('SearchAction', () => {
    beforeEach(() => {
        searchSpy.mockReset();
        searchSpy.mockResolvedValue({ Success: true, Results: [], TotalCount: 0, ElapsedMs: 2, SourceCounts: SOURCE_COUNTS, Providers: [] });
    });

    it('declares that it can honour an audience', () => {
        expect(new SearchAction().SupportsAudience).toBe(true);
    });

    it('without an audience: no Audience on the search, and SourceCounts are returned as before', async () => {
        const result = await run(paramsFor());
        expect(result.Success).toBe(true);
        expect(searchSpy.mock.calls[0][0].Audience).toBeUndefined();
        expect(result.Params?.find(p => p.Name === 'SourceCounts')?.Value).toEqual(SOURCE_COUNTS);
    });

    it('under an audience: passes the readers to the search and withholds SourceCounts', async () => {
        const audience = { Readers: [{ ID: 'reader-a', Name: 'Reader A', UserRoles: [] }] };
        const result = await run(paramsFor(audience));
        expect(result.Success).toBe(true);
        expect(searchSpy.mock.calls[0][0].Audience).toBe(audience);
        expect(outputNames(result)).toEqual(['Results', 'TotalCount', 'ElapsedMs']);
    });

    it('surfaces a search the engine refused (e.g. an invalid audience) as SEARCH_FAILED, with no counts', async () => {
        searchSpy.mockResolvedValue({
            Success: false, Results: [], TotalCount: 0, ElapsedMs: 0, SourceCounts: SOURCE_COUNTS, Providers: [],
            ErrorMessage: 'SearchEngine: invalid Audience — Readers[0] has no ID',
        });
        const result = await run(paramsFor({ Readers: [{ ID: '', Name: 'x', UserRoles: [] }] }));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('SEARCH_FAILED');
        expect(result.Params).toBeUndefined();
    });

    it('passes a null audience on to the engine (which refuses it) instead of searching unbounded, and withholds SourceCounts', async () => {
        const params = { ...paramsFor(), Audience: null } as unknown as RunActionParams;
        const result = await run(params);
        expect(searchSpy.mock.calls[0][0]).toHaveProperty('Audience', null);
        expect(outputNames(result)).not.toContain('SourceCounts');
    });

    describe('inside a tenant-scoped agent run (RunActionParams.RunScope)', () => {
        const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000a7';
        const scoped = (RunScope: Record<string, unknown>): RunActionParams => ({ ...paramsFor(), RunScope }) as unknown as RunActionParams;

        it.each<[string, Record<string, unknown>]>([
            ['a tenant', { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: TENANT, SecondaryScopes: null }],
            ['a secondary dimension', { PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: { Region: 'EMEA' } }],
        ])('refuses when the run carries %s, without searching, and points at Scoped Search', async (_label, runScope) => {
            const result = await run(scoped(runScope));
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('RUN_SCOPE_UNSUPPORTED');
            expect(result.Message).toMatch(/Use the Scoped Search action/);
            expect(searchSpy).not.toHaveBeenCalled();
        });

        it('searches as before in an unscoped run (nulls) and outside a run (no RunScope)', async () => {
            expect((await run(scoped({ PrimaryScopeEntityName: null, PrimaryScopeRecordID: null, SecondaryScopes: null }))).Success).toBe(true);
            expect((await run(paramsFor())).Success).toBe(true);
            expect(searchSpy).toHaveBeenCalledTimes(2);
        });
    });
});
