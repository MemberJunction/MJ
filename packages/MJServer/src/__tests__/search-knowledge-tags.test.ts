import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for SearchKnowledgeResolver — the thin wrapper that delegates
 * to SearchEngine.Instance.Search() and maps results to GraphQL types.
 *
 * The actual search logic (providers, fusion, enrichment, permissions)
 * is tested in the @memberjunction/search-engine package.
 */

// ── Mocks ──────────────────────────────────────────────────────────────

const { mockSearch, mockPreviewSearch, mockResolveEffectivePermission, mockLogForbiddenSearch } =
    vi.hoisted(() => ({
        mockSearch: vi.fn(),
        mockPreviewSearch: vi.fn(),
        mockResolveEffectivePermission: vi.fn(),
        mockLogForbiddenSearch: vi.fn(),
    }));

// `SearchKnowledgeResolver` obtains its permission resolver through the pluggable seam —
// `GetSearchScopePermissionResolver()` — so this mock has to provide that accessor even though
// no test below currently reaches it: every case here passes `undefined` for scope IDs, and
// `rejectForbiddenScopes` is guarded by `if (scopeIDs && scopeIDs.length)`.
//
// It is here because of how this omission fails. The missing export is simply `undefined`,
// calling it throws a TypeError, and the resolver's catch-all reports a result code unrelated
// to the thing under test — the same trap that made 11 failures in the CoreActions suite read
// like a permissions regression. The first person to add a test case WITH scope IDs would pay
// that diagnosis cost again, for no reason.
//
// The default is permissive (applied in beforeEach, so it survives a reset as well as a clear)
// so such a test exercises its own subject rather than tripping over an unconfigured double.
// Override `mockResolveEffectivePermission` in the test to drive the denial paths.
vi.mock('@memberjunction/search-engine', () => ({
    SearchEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Search: (...args: unknown[]) => mockSearch(...args),
            PreviewSearch: (...args: unknown[]) => mockPreviewSearch(...args),
            // Called only on the denial branch, to log a Status='Forbidden' execution row.
            LogForbiddenSearch: (...args: unknown[]) => mockLogForbiddenSearch(...args),
        }
    },
    GetSearchScopePermissionResolver: () => ({
        ResolveEffectivePermission: (...args: unknown[]) => mockResolveEffectivePermission(...args),
    }),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual };
});

// Mock type-graphql to avoid reflect-metadata dependency
vi.mock('type-graphql', () => {
    const noop = () => () => undefined;
    const passthrough = () => (target: unknown) => target;
    return {
        Resolver: passthrough,
        Mutation: noop,
        Query: noop,
        Subscription: noop,
        Arg: noop,
        Args: noop,
        Ctx: noop,
        ObjectType: passthrough,
        InputType: passthrough,
        ArgsType: passthrough,
        Field: noop,
        Float: Number,
        Int: Number,
        ID: String,
        Authorized: noop,
        PubSub: noop,
        Root: noop,
    };
});

// ── Import after mocks ─────────────────────────────────────────────────

import { SearchKnowledgeResolver } from '../resolvers/SearchKnowledgeResolver.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function createResolver(): SearchKnowledgeResolver {
    const resolver = new SearchKnowledgeResolver();
    // Mock GetUserFromPayload to return a fake user
    (resolver as Record<string, unknown>)['GetUserFromPayload'] = vi.fn().mockReturnValue({
        ID: 'test-user-id',
        Email: 'test@test.com',
        Name: 'Test User'
    });
    return resolver;
}

function createMockSearchResult(overrides: Record<string, unknown> = {}) {
    return {
        Success: true,
        Results: [
            {
                ID: 'result-1',
                EntityName: 'Contacts',
                RecordID: 'abc-123',
                SourceType: 'entity',
                ResultType: 'entity-record',
                Title: 'John Smith',
                Snippet: 'A contact record',
                Score: 0.85,
                ScoreBreakdown: { Entity: 0.85 },
                Tags: ['VIP'],
                EntityIcon: 'fa-solid fa-user',
                RecordName: 'John Smith',
                MatchedAt: new Date(),
            }
        ],
        TotalCount: 1,
        ElapsedMs: 42,
        SourceCounts: { Vector: 0, FullText: 0, Entity: 1, Storage: 0 },
        ...overrides
    };
}

const fakeContext = { userPayload: { email: 'test@test.com' } };

// ── Tests ───────────────────────────────────────────────────────────────

describe('SearchKnowledgeResolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveEffectivePermission.mockResolvedValue({
            Allowed: true, Level: 'Search', Source: 'DirectGrant',
            Reason: 'test double', toSqlPredicate: () => '1=1',
        });
        mockLogForbiddenSearch.mockResolvedValue(undefined);
    });

    // ── Scope authorization ────────────────────────────────────────────
    //
    // This is the branch `rejectForbiddenScopes` guards, and it had no coverage at all — every
    // other case here passes `undefined` for scope IDs, so the whole authorization path was
    // unexercised. These two tests are also what make the resolver entry in the module mock
    // above load-bearing rather than decorative: remove it and both fail.
    describe('scope authorization', () => {
        it('runs the search when every requested scope resolves to Allowed', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValue(createMockSearchResult());

            const result = await resolver.SearchKnowledge(
                'test', 20, undefined, undefined, ['scope-a', 'scope-b'], undefined, undefined,
                fakeContext as never);

            expect(result.Success).toBe(true);
            expect(mockSearch).toHaveBeenCalled();
            // One resolution per requested scope — the check is per-scope, not per-call.
            expect(mockResolveEffectivePermission).toHaveBeenCalledTimes(2);
        });

        it('REFUSES the whole call on the first denied scope, and never reaches the search', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValue(createMockSearchResult());
            mockResolveEffectivePermission.mockResolvedValue({
                Allowed: false, Level: 'None', Source: 'NoGrant',
                Reason: 'no grant for this scope', toSqlPredicate: () => '1=0',
            });

            const result = await resolver.SearchKnowledge(
                'test', 20, undefined, undefined, ['scope-a'], undefined, undefined,
                fakeContext as never);

            expect(result.Success).toBe(false);
            // The point of the branch: a forbidden scope aborts rather than being silently
            // dropped, because dropping it masks bugs in scope authoring.
            expect(mockSearch).not.toHaveBeenCalled();
            expect(mockLogForbiddenSearch).toHaveBeenCalled();
        });
    });

    describe('SearchKnowledge mutation', () => {
        it('should delegate to SearchEngine.Instance.Search()', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult());

            const result = await resolver.SearchKnowledge('test query', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            expect(mockSearch).toHaveBeenCalledOnce();
            expect(result.Success).toBe(true);
            expect(result.TotalCount).toBe(1);
            expect(result.Results).toHaveLength(1);
        });

        it('should pass query and maxResults to SearchEngine', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult());

            await resolver.SearchKnowledge('cheese', 50, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            const searchParams = mockSearch.mock.calls[0][0];
            expect(searchParams.Query).toBe('cheese');
            expect(searchParams.MaxResults).toBe(50);
        });

        it('should pass filters when provided', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult());

            const filters = { EntityNames: ['Contacts'], SourceTypes: undefined, Tags: ['VIP'] };
            await resolver.SearchKnowledge('test', 20, filters as never, undefined, undefined, undefined, undefined, fakeContext as never);

            const searchParams = mockSearch.mock.calls[0][0];
            expect(searchParams.Filters).toEqual({
                EntityNames: ['Contacts'],
                SourceTypes: undefined,
                Tags: ['VIP']
            });
        });

        it('should pass minScore when provided', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult());

            await resolver.SearchKnowledge('test', 20, undefined, 0.5, undefined, undefined, undefined, fakeContext as never);

            const searchParams = mockSearch.mock.calls[0][0];
            expect(searchParams.MinScore).toBe(0.5);
        });

        it('should map result fields correctly', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult());

            const result = await resolver.SearchKnowledge('test', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            const item = result.Results[0];
            expect(item.ID).toBe('result-1');
            expect(item.EntityName).toBe('Contacts');
            expect(item.RecordID).toBe('abc-123');
            expect(item.Title).toBe('John Smith');
            expect(item.Score).toBe(0.85);
            expect(item.Tags).toEqual(['VIP']);
            expect(item.EntityIcon).toBe('fa-solid fa-user');
        });

        it('should map source counts correctly', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult({
                SourceCounts: { Vector: 5, FullText: 3, Entity: 10, Storage: 0 }
            }));

            const result = await resolver.SearchKnowledge('test', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            expect(result.SourceCounts.Vector).toBe(5);
            expect(result.SourceCounts.FullText).toBe(3);
            expect(result.SourceCounts.Entity).toBe(10);
        });

        it('should pass empty query through to SearchEngine (validation happens there)', async () => {
            const resolver = createResolver();
            mockSearch.mockResolvedValueOnce(createMockSearchResult({ Success: false, ErrorMessage: 'Query cannot be empty' }));

            const result = await resolver.SearchKnowledge('   ', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            expect(mockSearch).toHaveBeenCalled();
            expect(result.Success).toBe(false);
        });

        it('should return error when user cannot be determined', async () => {
            const resolver = new SearchKnowledgeResolver();
            (resolver as Record<string, unknown>)['GetUserFromPayload'] = vi.fn().mockReturnValue(null);

            const result = await resolver.SearchKnowledge('test', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('current user');
        });

        it('should handle SearchEngine errors gracefully', async () => {
            const resolver = createResolver();
            mockSearch.mockRejectedValueOnce(new Error('Connection failed'));

            const result = await resolver.SearchKnowledge('test', 20, undefined, undefined, undefined, undefined, undefined, fakeContext as never);

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Connection failed');
        });
    });

    describe('PreviewSearch mutation', () => {
        it('should delegate to SearchEngine.Instance.PreviewSearch()', async () => {
            const resolver = createResolver();
            mockPreviewSearch.mockResolvedValueOnce(createMockSearchResult());

            const result = await resolver.PreviewSearch('test', 8, fakeContext as never);

            expect(mockPreviewSearch).toHaveBeenCalledOnce();
            expect(mockPreviewSearch).toHaveBeenCalledWith('test', 8, expect.anything());
            expect(result.Success).toBe(true);
        });

        it('should default maxResults to 8', async () => {
            const resolver = createResolver();
            mockPreviewSearch.mockResolvedValueOnce(createMockSearchResult());

            await resolver.PreviewSearch('test', 8, fakeContext as never);

            expect(mockPreviewSearch).toHaveBeenCalledWith('test', 8, expect.anything());
        });
    });
});
