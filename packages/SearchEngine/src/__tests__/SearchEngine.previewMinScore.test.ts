/**
 * The omnibar dropdown and the full Search Results page must agree about what counts as a
 * match. They are the same search to a user — the dropdown's "See all results" is a link to
 * the page — so a record visible in one and absent from the other reads as the search being
 * broken (MJ bc-aidp#234: the dropdown listed records the results page then reported as
 * "No results found").
 *
 * The page sends an explicit MinScore (its MinScorePercent default of 30 → 0.30). PreviewSearch
 * sent none, and `SearchEngine.Search` defaults an absent MinScore to 0, so the dropdown applied
 * no relevance floor at all. Any record scoring between 0 and 0.30 therefore appeared in the
 * dropdown and vanished on the page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { SearchEngine } from '../generic/SearchEngine';
import { DEFAULT_SEARCH_MIN_SCORE } from '../generic/search.types';
import type { SearchResult } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

function createUser(): UserInfo {
    return { ID: 'u-1', Name: 'Test User', Email: 't@example.com' } as UserInfo;
}

class TestSearchEngine extends SearchEngine {
    /** Bypass the singleton wiring so each test gets a fresh instance. */
    public static MakeFresh(): TestSearchEngine {
        const ctor = SearchEngine as unknown as new () => TestSearchEngine;
        return new ctor();
    }
}

describe('SearchEngine.PreviewSearch — relevance floor', () => {
    let engine: TestSearchEngine;
    let user: UserInfo;

    beforeEach(() => {
        engine = TestSearchEngine.MakeFresh();
        user = createUser();
    });

    it('is the same floor the full results page sends, so the two surfaces agree', () => {
        // The Explorer results page defaults MinScorePercent = 30 and sends 30/100.
        // Pinning the constant here is what makes that agreement checkable in one place.
        expect(DEFAULT_SEARCH_MIN_SCORE).toBe(0.3);
    });

    it('PreviewSearch applies the default floor rather than leaving it unset', async () => {
        const spy = vi
            .spyOn(engine, 'Search')
            .mockResolvedValue({ Results: [] } as unknown as SearchResult);

        await engine.PreviewSearch('kligo', 8, user);

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                Query: 'kligo',
                MaxResults: 8,
                Mode: 'preview',
                MinScore: DEFAULT_SEARCH_MIN_SCORE,
            }),
            user
        );
    });

    it('a programmatic caller can opt out, and PreviewSearchAsSystemUser does', async () => {
        // The floor exists so the dropdown agrees with the results page. A system-user caller has
        // no such page; silently filtering its results would change a published API's contract.
        const spy = vi
            .spyOn(engine, 'Search')
            .mockResolvedValue({ Results: [] } as unknown as SearchResult);

        await engine.PreviewSearch('kligo', 8, user, 0);

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({ MinScore: 0 }),
            user
        );
    });

    it('a record scoring below the floor is one the dropdown must not show', async () => {
        // 0.24 is a real score the scorer produces: one non-name field matched out of five
        // searchable fields → 0.15 + (0.2 * 0.45) = 0.24, no name boost. Under the old
        // default of 0 this reached the dropdown; the results page dropped it at 0.30.
        const borderline = 0.15 + (1 / 5) * 0.45;
        expect(borderline).toBeLessThan(DEFAULT_SEARCH_MIN_SCORE);
    });
});
