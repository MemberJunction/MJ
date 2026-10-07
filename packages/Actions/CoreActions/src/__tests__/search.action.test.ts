/**
 * The `Search` action (`__Internal_Search`) — its audience contract: an action that declares it can honour
 * `RunActionParams.Audience` must hand the readers to the search engine (which keeps only what every reader may
 * read) and must not show the room `SourceCounts`, which are counted before that filtering. The search names no
 * scope, so there is no per-reader scope gate to run.
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

vi.mock('@memberjunction/core', () => ({
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
});
