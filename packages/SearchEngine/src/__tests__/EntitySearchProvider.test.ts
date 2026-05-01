import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables that can be referenced inside vi.mock factories
const { mockRunViewFn, mockEntities } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
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
    }> = [];
    return { mockRunViewFn, mockEntities };
});

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        get Entities() { return mockEntities; }
        EntityByName(name: string) { return mockEntities.find(e => e.Name === name); }
        // Multi-provider migration: EntitySearchProvider uses this.ProviderToUse, which falls
        // back to Metadata.Provider. Expose a static Provider that returns the same
        // mockEntities list so the search has a metadata catalog to walk.
        static Provider = {
            get Entities() { return mockEntities; },
            EntityByName(name: string) { return mockEntities.find(e => e.Name === name); },
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
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
});
