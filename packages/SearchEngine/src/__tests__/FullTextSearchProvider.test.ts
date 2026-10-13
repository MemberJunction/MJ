/**
 * Unit tests for `FullTextSearchProvider`, focused on the two bug-C3 behaviors:
 *
 *   1. MIN_TERM_LENGTH lowered from 3 → 2 so short queries aren't silently dropped.
 *   2. Per-entity candidate depth (`MaxRowsPerEntity`) decoupled from the global `topK`
 *      budget via the tunable `PerEntityFetchDepth`.
 *
 * Both are verified through observable behavior: whether `md.FullTextSearch` is invoked,
 * and the `MaxRowsPerEntity` value passed to it. The provider reads its metadata source
 * from `this.Provider`, which we override per-test with a mock exposing `FullTextSearch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted so it survives the vi.resetModules() re-imports the env-var tests perform.
const { mockLogErrorEx } = vi.hoisted(() => ({ mockLogErrorEx: vi.fn() }));

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        static Provider = {};
    }
    return {
        Metadata: MockMetadata,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogErrorEx: mockLogErrorEx,
    };
});

import { FullTextSearchProvider } from '../generic/FullTextSearchProvider';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

function createMockUser(): UserInfo {
    return { ID: 'user-123', Name: 'Test User', Email: 'test@example.com' } as UserInfo;
}

describe('FullTextSearchProvider', () => {
    let provider: FullTextSearchProvider;
    let contextUser: UserInfo;
    let mockFullTextSearch: ReturnType<typeof vi.fn>;

    const originalDepth = FullTextSearchProvider.PerEntityFetchDepth;

    beforeEach(() => {
        provider = new FullTextSearchProvider();
        contextUser = createMockUser();
        mockFullTextSearch = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        // Override the provider's metadata source with a mock that exposes FullTextSearch.
        provider.Provider = { FullTextSearch: mockFullTextSearch } as unknown as IMetadataProvider;
    });

    afterEach(() => {
        FullTextSearchProvider.PerEntityFetchDepth = originalDepth;
    });

    describe('MIN_TERM_LENGTH boundary (C3)', () => {
        it('rejects a 1-character query — no FullTextSearch call', async () => {
            const results = await provider.Search('U', 10, undefined, contextUser);
            expect(results).toEqual([]);
            expect(mockFullTextSearch).not.toHaveBeenCalled();
        });

        it('accepts a 2-character query — issues the FullTextSearch', async () => {
            await provider.Search('US', 10, undefined, contextUser);
            expect(mockFullTextSearch).toHaveBeenCalledWith(
                expect.objectContaining({ SearchText: 'US' }),
                contextUser
            );
        });
    });

    describe('PerEntityFetchDepth decoupling (C3)', () => {
        const maxRowsPerEntity = (): number =>
            (mockFullTextSearch.mock.calls[0][0] as { MaxRowsPerEntity: number }).MaxRowsPerEntity;

        it('fetches PerEntityFetchDepth per entity when topK/10 is far smaller', async () => {
            // topK=50: old code → max(3, ceil(50/10)=5) = 5. New → min(50, max(15, 5)) = 15.
            await provider.Search('test', 50, undefined, contextUser);
            expect(maxRowsPerEntity()).toBe(15);
        });

        it('never fetches more than topK per entity (small topK caps the depth)', async () => {
            // topK=10: min(10, max(15, 1)) = 10.
            await provider.Search('test', 10, undefined, contextUser);
            expect(maxRowsPerEntity()).toBe(10);
        });

        it('honors a tuned PerEntityFetchDepth (deployment-adjustable static)', async () => {
            FullTextSearchProvider.PerEntityFetchDepth = 25;
            // topK=100: min(100, max(25, ceil(100/10)=10)) = 25.
            await provider.Search('test', 100, undefined, contextUser);
            expect(maxRowsPerEntity()).toBe(25);
        });
    });

    /**
     * PerEntityFetchDepth also accepts a default override from the environment at process start
     * (MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH). The override is read once when the module is
     * evaluated, so each case resets the module registry and re-imports the provider with the env
     * var in place.
     */
    describe('env-var default override', () => {
        const FETCH_KEY = 'MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH';
        const originalFetch = process.env[FETCH_KEY];

        beforeEach(() => {
            mockLogErrorEx.mockClear();
        });

        afterEach(() => {
            if (originalFetch === undefined) {
                delete process.env[FETCH_KEY];
            } else {
                process.env[FETCH_KEY] = originalFetch;
            }
            vi.resetModules();
        });

        async function reimportProvider() {
            vi.resetModules();
            return (await import('../generic/FullTextSearchProvider')).FullTextSearchProvider;
        }

        it('reads PerEntityFetchDepth from MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH', async () => {
            process.env[FETCH_KEY] = '30';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(30);
            expect(mockLogErrorEx).not.toHaveBeenCalled();
        });

        it('falls back to the default for a non-numeric value and warns', async () => {
            process.env[FETCH_KEY] = 'lots';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(15);
            expect(mockLogErrorEx).toHaveBeenCalledWith(
                expect.objectContaining({ severity: 'warning', message: expect.stringContaining(FETCH_KEY) })
            );
        });

        it('falls back to the default when the var is unset — no warning', async () => {
            delete process.env[FETCH_KEY];
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(15);
            expect(mockLogErrorEx).not.toHaveBeenCalled();
        });
    });
});
