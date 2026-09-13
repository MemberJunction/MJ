import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock variables that can be referenced inside vi.mock factories. mockLogErrorEx is
// hoisted (not an inline vi.fn()) so it survives the vi.resetModules() re-imports the env-var
// tests perform — the mock factory re-runs but keeps handing back this same stable spy.
const { mockRunViewFn, mockEntities, mockLogErrorEx } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockLogErrorEx = vi.fn();
    const mockEntities: Array<{
        Name: string;
        AllowUserSearchAPI: boolean;
        Icon?: string;
        Fields: Array<{
            Name: string;
            IncludeInUserSearchAPI: boolean;
            IsNameField: boolean;
            Sequence?: number;
        }>;
        NameField?: { Name: string };
        /** Primary key column(s). Defaults to a single `ID` when omitted (see MockMetadata). */
        PrimaryKeys?: Array<{ Name: string }>;
    }> = [];
    return { mockRunViewFn, mockEntities, mockLogErrorEx };
});

vi.mock('@memberjunction/core', async () => {
    // The real CompositeKey: the provider now builds each result's RecordID from the entity's
    // primary-key metadata through it, and that serialization is what these tests assert on.
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    // Entities the tests push without an explicit PrimaryKeys get the common single `ID` key.
    const withDefaultPK = (e: (typeof mockEntities)[number] | undefined) =>
        e ? { ...e, PrimaryKeys: e.PrimaryKeys ?? [{ Name: 'ID' }] } : undefined;
    class MockMetadata {
        get Entities() { return mockEntities; }
        EntityByName(name: string) { return withDefaultPK(mockEntities.find(e => e.Name === name)); }
        // Multi-provider migration: EntitySearchProvider uses this.ProviderToUse, which falls
        // back to Metadata.Provider. Expose a static Provider that returns the same
        // mockEntities list so the search has a metadata catalog to walk.
        static Provider = {
            get Entities() { return mockEntities; },
            EntityByName(name: string) { return withDefaultPK(mockEntities.find(e => e.Name === name)); },
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        CompositeKey: actual.CompositeKey,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogErrorEx: mockLogErrorEx,
    };
});

import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import type { UserInfo } from '@memberjunction/core';

/**
 * Creates a minimal mock UserInfo for test usage.
 */
function createMockUser(): UserInfo {
    return {
        ID: 'user-123',
        Name: 'Test User',
        Email: 'test@example.com',
    } as UserInfo;
}

describe('EntitySearchProvider', () => {
    let provider: EntitySearchProvider;
    let contextUser: UserInfo;

    beforeEach(() => {
        provider = new EntitySearchProvider();
        contextUser = createMockUser();
        mockEntities.length = 0;
        mockRunViewFn.mockReset();
    });

    describe('IsAvailable', () => {
        it('should always return true', () => {
            expect(provider.IsAvailable()).toBe(true);
        });
    });

    describe('SourceType', () => {
        it('should be "entity"', () => {
            expect(provider.SourceType).toBe('entity');
        });
    });

    describe('Search', () => {
        it('should return empty array when no searchable entities exist', async () => {
            // No entities with AllowUserSearchAPI=true
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: false,
                Fields: [],
            });

            const results = await provider.Search('test', 10, undefined, contextUser);
            expect(results).toEqual([]);
        });

        it('should call RunView with UserSearchString for searchable entities', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Test Person' }],
            });

            await provider.Search('Test', 10, undefined, contextUser);

            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    EntityName: 'People',
                    UserSearchString: 'Test',
                    ResultType: 'simple',
                }),
                contextUser
            );
        });

        it('should score name field matches with a boost (score >= 0.50)', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    { Name: 'Email', IncludeInUserSearchAPI: true, IsNameField: false },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Alice Smith', Email: 'other@test.com' }],
            });

            const results = await provider.Search('Alice', 10, undefined, contextUser);

            expect(results).toHaveLength(1);
            // Name field match gets nameBoost of 0.35, so score should be >= 0.50
            expect(results[0].Score).toBeGreaterThanOrEqual(0.50);
        });

        it('should score non-name field matches lower than name field matches', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    { Name: 'Email', IncludeInUserSearchAPI: true, IsNameField: false },
                    { Name: 'Notes', IncludeInUserSearchAPI: true, IsNameField: false },
                ],
                NameField: { Name: 'Name' },
            });

            // First call: match in name field
            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'matching query', Email: 'other@test.com', Notes: 'nothing here' }],
            });

            const nameResults = await provider.Search('matching', 10, undefined, contextUser);

            // Reset and test non-name match
            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'rec-2', Name: 'no match here', Email: 'matching@query.com', Notes: 'nothing here' }],
            });

            const emailResults = await provider.Search('matching', 10, undefined, contextUser);

            expect(nameResults[0].Score).toBeGreaterThan(emailResults[0].Score);
        });

        it('should increase score with more field matches', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    { Name: 'Email', IncludeInUserSearchAPI: true, IsNameField: false },
                    { Name: 'Notes', IncludeInUserSearchAPI: true, IsNameField: false },
                ],
                NameField: { Name: 'Name' },
            });

            // Match in one non-name field
            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'no match', Email: 'test@example.com', Notes: 'nothing' }],
            });

            const oneFieldResults = await provider.Search('test', 10, undefined, contextUser);

            // Match in two non-name fields
            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: [{ ID: 'rec-2', Name: 'no match', Email: 'test@example.com', Notes: 'test notes' }],
            });

            const twoFieldResults = await provider.Search('test', 10, undefined, contextUser);

            expect(twoFieldResults[0].Score).toBeGreaterThan(oneFieldResults[0].Score);
        });

        it('should filter by EntityNames when provided', async () => {
            mockEntities.push(
                {
                    Name: 'People',
                    AllowUserSearchAPI: true,
                    Fields: [
                        { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    ],
                    NameField: { Name: 'Name' },
                },
                {
                    Name: 'Companies',
                    AllowUserSearchAPI: true,
                    Fields: [
                        { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    ],
                    NameField: { Name: 'Name' },
                }
            );

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Test' }],
            });

            await provider.Search('Test', 10, { EntityNames: ['People'] }, contextUser);

            // Should only have been called once (for People, not Companies)
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({ EntityName: 'People' }),
                contextUser
            );
        });

        it('should handle RunView errors gracefully and return empty array', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: false,
                ErrorMessage: 'Database connection failed',
                Results: [],
            });

            const results = await provider.Search('test', 10, undefined, contextUser);
            expect(results).toEqual([]);
        });

        it('should handle RunView throwing an exception gracefully', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockRejectedValue(new Error('Network error'));

            const results = await provider.Search('test', 10, undefined, contextUser);
            expect(results).toEqual([]);
        });

        it('should set SourceType to "entity" on all results', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Alice' }],
            });

            const results = await provider.Search('Alice', 10, undefined, contextUser);
            for (const r of results) {
                expect(r.SourceType).toBe('entity');
            }
        });

        it('should set ResultType to "entity-record" on all results', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Alice' }],
            });

            const results = await provider.Search('Alice', 10, undefined, contextUser);
            for (const r of results) {
                expect(r.ResultType).toBe('entity-record');
            }
        });

        it('should populate ScoreBreakdown.Entity on results', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'rec-1', Name: 'Alice' }],
            });

            const results = await provider.Search('Alice', 10, undefined, contextUser);
            expect(results[0].ScoreBreakdown.Entity).toBeDefined();
            expect(results[0].ScoreBreakdown.Entity).toBe(results[0].Score);
        });

        it('should use heuristic title fields when no IsNameField is set', async () => {
            mockEntities.push({
                Name: 'Documents',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Title', IncludeInUserSearchAPI: true, IsNameField: false },
                    { Name: 'Body', IncludeInUserSearchAPI: true, IsNameField: false },
                ],
            });

            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'doc-1', Title: 'My Document', Body: 'Some content here' }],
            });

            const results = await provider.Search('document', 10, undefined, contextUser);
            expect(results[0].Title).toBe('My Document');
        });
    });

    /**
     * RecordID is a compact CompositeKey segment built from the entity's REAL primary key
     * column(s) — the bare value for a single-column key, "F1|v1||F2|v2" for a composite one.
     * Reading `record.ID` yielded '' for every entity whose key isn't called ID, and SearchFusion
     * drops empty RecordIDs, so this lane silently contributed nothing for those entities.
     */
    describe('Search — RecordID honors the entity primary key', () => {
        it('uses the value of a single primary key that is not named ID', async () => {
            mockEntities.push({
                Name: 'Individuals',
                AllowUserSearchAPI: true,
                PrimaryKeys: [{ Name: 'individual_id' }],
                Fields: [{ Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 }],
                NameField: { Name: 'Name' },
            });
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ individual_id: 'ind-42', Name: 'Ada Lovelace' }],  // no ID column at all
            });

            const results = await provider.Search('Ada', 10, undefined, contextUser);

            expect(results).toHaveLength(1);
            expect(results[0].RecordID).toBe('ind-42');
            expect(results[0].ID).toBe('ind-42');
        });

        it('emits the full prefixed segment for a composite primary key', async () => {
            mockEntities.push({
                Name: 'Order Lines',
                AllowUserSearchAPI: true,
                PrimaryKeys: [{ Name: 'OrderID' }, { Name: 'LineNo' }],
                Fields: [{ Name: 'Description', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 }],
                NameField: { Name: 'Description' },
            });
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ OrderID: 'o1', LineNo: 3, Description: 'Widget' }],
            });

            const results = await provider.Search('Widget', 10, undefined, contextUser);

            expect(results).toHaveLength(1);
            expect(results[0].RecordID).toBe('OrderID|o1||LineNo|3');
        });

        it('still emits the bare value for the common single ID key', async () => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [{ Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 }],
                NameField: { Name: 'Name' },
            });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'rec-1', Name: 'Test Person' }] });

            const results = await provider.Search('Test', 10, undefined, contextUser);

            expect(results[0].RecordID).toBe('rec-1');
        });
    });

    /**
     * Tier-1 release-readiness: SQL LIKE wildcard sanitation.
     *
     * The downstream `GenericDatabaseProvider.createViewUserSearchSQL`
     * builds `LIKE '%${input}%'` clauses with only single-quote escaping —
     * unstripped LIKE wildcards (`%`, `_`, `[`, `]`) would either match
     * everything (`Query="%"`) or trigger character-class parsing
     * (`Query="[abc]"`). EntitySearchProvider strips those characters
     * before passing the string to RunView.
     */
    describe('Search — LIKE wildcard sanitation', () => {
        const seedSearchableEntity = (): void => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        };

        it('strips lone `%` from the query and returns empty (does not match every row)', async () => {
            seedSearchableEntity();
            await provider.Search('%', 10, undefined, contextUser);
            // Sanitized to empty → short-circuit, no RunView call
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('strips lone `_` from the query and returns empty', async () => {
            seedSearchableEntity();
            await provider.Search('___', 10, undefined, contextUser);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('strips `[` and `]` (LIKE character-class brackets) from the query', async () => {
            seedSearchableEntity();
            await provider.Search('[abc]', 10, undefined, contextUser);
            expect(mockRunViewFn).toHaveBeenCalled();
            const passedSearchString = (mockRunViewFn.mock.calls[0][0] as { UserSearchString: string }).UserSearchString;
            expect(passedSearchString).toBe('abc');
        });

        it('strips embedded `%` from a query while preserving the literal text', async () => {
            seedSearchableEntity();
            await provider.Search('100% match', 10, undefined, contextUser);
            const passedSearchString = (mockRunViewFn.mock.calls[0][0] as { UserSearchString: string }).UserSearchString;
            // `%` removed; whitespace collapsed
            expect(passedSearchString).toBe('100 match');
        });

        it('handles a query with all wildcard chars by returning empty', async () => {
            seedSearchableEntity();
            await provider.Search('%_[]%', 10, undefined, contextUser);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('does not modify queries without wildcard characters', async () => {
            seedSearchableEntity();
            await provider.Search('normal query text', 10, undefined, contextUser);
            const passedSearchString = (mockRunViewFn.mock.calls[0][0] as { UserSearchString: string }).UserSearchString;
            expect(passedSearchString).toBe('normal query text');
        });
    });

    /**
     * Bug C3 — minimum term length lowered from 3 to 2 so legitimate short queries
     * ("US", "AI", product codes, initials) are searchable. Single characters remain
     * rejected (a `LIKE '%x%'` fan-out across every entity is a full-DB scan with no
     * relevance). Verified via observable behavior: below-threshold queries short-circuit
     * before any RunView call.
     */
    describe('Search — MIN_TERM_LENGTH boundary (C3)', () => {
        const seedSearchableEntity = (): void => {
            mockEntities.push({
                Name: 'People',
                AllowUserSearchAPI: true,
                Fields: [
                    { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                ],
                NameField: { Name: 'Name' },
            });
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        };

        it('rejects a 1-character query (below threshold) — no RunView call', async () => {
            seedSearchableEntity();
            const results = await provider.Search('U', 10, undefined, contextUser);
            expect(results).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('accepts a 2-character query (at threshold) — issues the RunView', async () => {
            seedSearchableEntity();
            await provider.Search('US', 10, undefined, contextUser);
            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({ EntityName: 'People', UserSearchString: 'US' }),
                contextUser
            );
        });
    });

    /**
     * Bug C3 — per-entity candidate depth is decoupled from the global `topK` budget.
     * Previously `perEntityLimit = max(3, ceil(topK / entityCount))`, so widening the entity
     * fan-out shrank each entity's slice toward the floor of 3 and real matches beyond row 3
     * were never fetched. Now each entity fetches up to `PerEntityFetchDepth` candidates (but
     * never more than `topK`, since the fused set is capped at `topK` anyway). We assert on the
     * `MaxRows` passed to each per-entity RunView.
     */
    describe('Search — PerEntityFetchDepth decoupling (C3)', () => {
        const seedEntities = (count: number): void => {
            for (let i = 0; i < count; i++) {
                mockEntities.push({
                    Name: `Entity${i}`,
                    AllowUserSearchAPI: true,
                    Fields: [
                        { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 },
                    ],
                    NameField: { Name: 'Name' },
                });
            }
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
        };

        const maxRowsFor = (callIndex: number): number =>
            (mockRunViewFn.mock.calls[callIndex][0] as { MaxRows: number }).MaxRows;

        const originalDepth = EntitySearchProvider.PerEntityFetchDepth;
        afterEach(() => {
            EntitySearchProvider.PerEntityFetchDepth = originalDepth;
        });

        it('fetches PerEntityFetchDepth per entity even when topK/entityCount is far smaller', async () => {
            // 5 entities, topK=50: old code → max(3, ceil(50/5)=10) = 10 per entity.
            // New code → min(50, max(15, 10)) = 15 per entity (the fan-out no longer starves entities).
            seedEntities(5);
            await provider.Search('test', 50, undefined, contextUser);

            expect(mockRunViewFn).toHaveBeenCalledTimes(5);
            for (let i = 0; i < 5; i++) {
                expect(maxRowsFor(i)).toBe(15);
            }
        });

        it('never fetches more than topK per entity (small topK caps the depth)', async () => {
            // 5 entities, topK=10: min(10, max(15, ceil(10/5)=2)) = 10. Depth is capped at topK.
            seedEntities(5);
            await provider.Search('test', 10, undefined, contextUser);

            expect(mockRunViewFn).toHaveBeenCalledTimes(5);
            for (let i = 0; i < 5; i++) {
                expect(maxRowsFor(i)).toBe(10);
            }
        });

        it('honors a tuned PerEntityFetchDepth (deployment-adjustable static)', async () => {
            EntitySearchProvider.PerEntityFetchDepth = 30;
            // 5 entities, topK=100: min(100, max(30, ceil(100/5)=20)) = 30.
            seedEntities(5);
            await provider.Search('test', 100, undefined, contextUser);

            for (let i = 0; i < 5; i++) {
                expect(maxRowsFor(i)).toBe(30);
            }
        });
    });

    /**
     * Per-entity hard timeout is a deployment-adjustable public static (PerEntityTimeoutMS).
     * A single slow entity must not hold the whole fan-out hostage: after the timeout its
     * result promise resolves to [] and the other entities' results still land.
     */
    describe('Search — PerEntityTimeoutMS (deployment-adjustable static)', () => {
        const originalTimeout = EntitySearchProvider.PerEntityTimeoutMS;
        afterEach(() => {
            EntitySearchProvider.PerEntityTimeoutMS = originalTimeout;
            vi.useRealTimers();
        });

        it('defaults to 3000ms', () => {
            expect(EntitySearchProvider.PerEntityTimeoutMS).toBe(3000);
        });

        it('drops a slow entity after the tuned timeout while fast entities still land', async () => {
            vi.useFakeTimers();
            EntitySearchProvider.PerEntityTimeoutMS = 3_000;

            const nameField = { Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true, Sequence: 1 };
            mockEntities.push(
                { Name: 'Fast', AllowUserSearchAPI: true, Fields: [nameField], NameField: { Name: 'Name' } },
                { Name: 'Slow', AllowUserSearchAPI: true, Fields: [nameField], NameField: { Name: 'Name' } },
            );

            mockRunViewFn.mockImplementation((params: { EntityName: string }) => {
                if (params.EntityName === 'Fast') {
                    return Promise.resolve({ Success: true, Results: [{ ID: 'f1', Name: 'Findable' }] });
                }
                // Slow entity: RunView never resolves within the timeout window.
                return new Promise(() => { /* never resolves */ });
            });

            const searchPromise = provider.Search('Find', 10, undefined, contextUser);
            // Advance past PerEntityTimeoutMS so the slow entity's race resolves to [].
            await vi.advanceTimersByTimeAsync(3_000);
            const results = await searchPromise;

            expect(results.map(r => r.EntityName)).toEqual(['Fast']);
        });
    });

    /**
     * Both deployment-adjustable statics also accept a default override from the environment at
     * process start (MJ_SEARCH_PER_ENTITY_FETCH_DEPTH / MJ_SEARCH_PER_ENTITY_TIMEOUT_MS). The
     * override is read once when the module is evaluated, so each case resets the module registry
     * and re-imports the provider with the env var in place.
     */
    describe('env-var default overrides', () => {
        const FETCH_KEY = 'MJ_SEARCH_PER_ENTITY_FETCH_DEPTH';
        const TIMEOUT_KEY = 'MJ_SEARCH_PER_ENTITY_TIMEOUT_MS';
        const originalFetch = process.env[FETCH_KEY];
        const originalTimeout = process.env[TIMEOUT_KEY];

        beforeEach(() => {
            mockLogErrorEx.mockClear();
        });

        afterEach(() => {
            restoreEnv(FETCH_KEY, originalFetch);
            restoreEnv(TIMEOUT_KEY, originalTimeout);
            vi.resetModules();
        });

        async function reimportProvider() {
            vi.resetModules();
            return (await import('../generic/EntitySearchProvider')).EntitySearchProvider;
        }

        it('reads PerEntityFetchDepth from MJ_SEARCH_PER_ENTITY_FETCH_DEPTH', async () => {
            process.env[FETCH_KEY] = '42';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(42);
            expect(mockLogErrorEx).not.toHaveBeenCalled();
        });

        it('reads PerEntityTimeoutMS from MJ_SEARCH_PER_ENTITY_TIMEOUT_MS', async () => {
            process.env[TIMEOUT_KEY] = '15000';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityTimeoutMS).toBe(15000);
        });

        it('floors a fractional override', async () => {
            process.env[TIMEOUT_KEY] = '2500.9';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityTimeoutMS).toBe(2500);
        });

        it('falls back to the default for a non-numeric value and warns', async () => {
            process.env[TIMEOUT_KEY] = 'soon';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityTimeoutMS).toBe(3000);
            expect(mockLogErrorEx).toHaveBeenCalledWith(
                expect.objectContaining({ severity: 'warning', message: expect.stringContaining(TIMEOUT_KEY) })
            );
        });

        it('falls back to the default for a non-positive value and warns', async () => {
            process.env[FETCH_KEY] = '0';
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(15);
            expect(mockLogErrorEx).toHaveBeenCalledWith(
                expect.objectContaining({ severity: 'warning', message: expect.stringContaining(FETCH_KEY) })
            );
        });

        it('falls back to the default when the var is unset — no warning', async () => {
            delete process.env[FETCH_KEY];
            delete process.env[TIMEOUT_KEY];
            const Provider = await reimportProvider();
            expect(Provider.PerEntityFetchDepth).toBe(15);
            expect(Provider.PerEntityTimeoutMS).toBe(3000);
            expect(mockLogErrorEx).not.toHaveBeenCalled();
        });
    });
});

/**
 * Restore an env var to a prior value, deleting it when it was previously unset.
 */
function restoreEnv(key: string, priorValue: string | undefined): void {
    if (priorValue === undefined) {
        delete process.env[key];
    } else {
        process.env[key] = priorValue;
    }
}
