import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state
const {
    mockRunViewFn,
    mockEntities,
    mockTags,
    mockTagSynonyms,
    mockEnsureLoaded
} = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockEnsureLoaded = vi.fn().mockResolvedValue(undefined);
    const mockEntities: Array<{
        Name: string;
        AllowUserSearchAPI: boolean;
        Icon?: string;
        Fields: Array<{
            Name: string;
            IncludeInUserSearchAPI: boolean;
            IsNameField: boolean;
        }>;
    }> = [];
    const mockTags: Array<{
        ID: string;
        Name: string;
        DisplayName?: string;
        Status: string;
    }> = [];
    const mockTagSynonyms: Array<{
        ID: string;
        TagID: string;
        Synonym: string;
    }> = [];
    return {
        mockRunViewFn,
        mockEntities,
        mockTags,
        mockTagSynonyms,
        mockEnsureLoaded
    };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        get Entities() { return mockEntities; }
        EntityByName(name: string) {
            return mockEntities.find(e => e.Name.toLowerCase() === name.toLowerCase());
        }
        static Provider = {
            get Entities() { return mockEntities; },
            EntityByName(name: string) {
                return mockEntities.find(e => e.Name.toLowerCase() === name.toLowerCase());
            }
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn()
    };
});

vi.mock('@memberjunction/tag-engine-base', () => {
    class MockTagEngineBase {
        public static get Instance() {
            return mockTagEngineBaseInstance;
        }
    }
    const mockTagEngineBaseInstance = {
        get Tags() { return mockTags; },
        get TagSynonyms() { return mockTagSynonyms; },
        GetTagByID(id: string) {
            return mockTags.find(t => t.ID.toLowerCase() === id.toLowerCase());
        },
        EnsureLoaded: mockEnsureLoaded,
        Config: vi.fn().mockResolvedValue(undefined)
    };
    return {
        TagEngineBase: MockTagEngineBase
    };
});

import { TagSearchProvider } from '../generic/TagSearchProvider';
import type { UserInfo } from '@memberjunction/core';
import type { SearchProviderConfig } from '../generic/ISearchProvider';

function createMockUser(): UserInfo {
    return {
        ID: 'user-tag-test',
        Name: 'Tag Test User',
        Email: 'tagtest@example.com'
    } as UserInfo;
}

function createConfig(name: string = 'Tags'): SearchProviderConfig {
    return {
        Name: name,
        ProviderConfig: null,
        CredentialID: null,
        MaxResultsOverride: null,
        SupportsPreview: true,
        Priority: 3
    };
}

describe('TagSearchProvider', () => {
    let provider: TagSearchProvider;
    let contextUser: UserInfo;

    beforeEach(() => {
        provider = new TagSearchProvider();
        contextUser = createMockUser();
        mockEntities.length = 0;
        mockTags.length = 0;
        mockTagSynonyms.length = 0;
        mockRunViewFn.mockReset();
        mockEnsureLoaded.mockReset().mockResolvedValue(undefined);

        // Populate default searchable entity
        mockEntities.push({
            Name: 'Products',
            AllowUserSearchAPI: true,
            Icon: 'fa-solid fa-box',
            Fields: [
                { Name: 'ID', IncludeInUserSearchAPI: false, IsNameField: false },
                { Name: 'ProductName', IncludeInUserSearchAPI: true, IsNameField: true }
            ]
        });

        // Populate taxonomy entities that should never return as user search results
        mockEntities.push(
            { Name: 'MJ: Tags', AllowUserSearchAPI: false, Fields: [] },
            { Name: 'MJ: Tagged Items', AllowUserSearchAPI: false, Fields: [] },
            { Name: 'MJ: Tag Synonyms', AllowUserSearchAPI: false, Fields: [] }
        );
    });

    describe('Metadata and Availability', () => {
        it('has SourceType "tag"', () => {
            expect(provider.SourceType).toBe('tag');
        });

        it('is available when tags are present', () => {
            mockTags.push({ ID: 'tag-1', Name: 'Cheddar', Status: 'Active' });
            expect(provider.IsAvailable()).toBe(true);
        });

        it('is not available when tags list is empty', () => {
            mockTags.length = 0;
            expect(provider.IsAvailable()).toBe(false);
        });

        it('calls EnsureLoaded on Initialize and CheckAvailability', async () => {
            await provider.Initialize(createConfig(), contextUser);
            expect(mockEnsureLoaded).toHaveBeenCalledWith(contextUser, expect.anything());

            mockEnsureLoaded.mockClear();
            await provider.CheckAvailability(contextUser);
            expect(mockEnsureLoaded).toHaveBeenCalledWith(contextUser, expect.anything());
        });
    });

    describe('Search Query Filtering & Early Exit', () => {
        it('returns empty array when query is too short or empty', async () => {
            const r1 = await provider.Search('', 10, undefined, contextUser);
            const r2 = await provider.Search('   ', 10, undefined, contextUser);
            const r3 = await provider.Search('a', 10, undefined, contextUser);
            expect(r1).toEqual([]);
            expect(r2).toEqual([]);
            expect(r3).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('returns empty array when topK is 0 or negative', async () => {
            mockTags.push({ ID: 'tag-1', Name: 'Cheddar', Status: 'Active' });
            const r1 = await provider.Search('Cheddar', 0, undefined, contextUser);
            const r2 = await provider.Search('Cheddar', -5, undefined, contextUser);
            expect(r1).toEqual([]);
            expect(r2).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('early exits with empty array and 0 DB queries when no tags match', async () => {
            mockTags.push({ ID: 'tag-1', Name: 'Gouda', Status: 'Active' });
            const results = await provider.Search('UnrelatedTermXYZ', 10, undefined, contextUser);
            expect(results).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });
    });

    describe('Tag Matching & Weight Scaling', () => {
        beforeEach(() => {
            mockTags.push(
                { ID: 't-cheddar', Name: 'Cheddar', DisplayName: 'Sharp Cheddar', Status: 'Active' },
                { ID: 't-brie', Name: 'Brie', Status: 'Active' },
                { ID: 't-inactive', Name: 'OldCheese', Status: 'Inactive' }
            );
            mockTagSynonyms.push(
                { ID: 'syn-1', TagID: 't-cheddar', Synonym: 'Yellow Cheese' }
            );
        });

        it('matches tag exactly and weights results by continuous TaggedItem.Weight', async () => {
            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Tagged Items') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ti-1',
                                TagID: 't-cheddar',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 0.85,
                                Tag: 'Sharp Cheddar'
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            const results = await provider.Search('Cheddar', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            const item = results[0];
            expect(item.RecordID).toBe('prod-100');
            expect(item.EntityName).toBe('Products');
            expect(item.SourceType).toBe('tag');
            expect(item.ResultType).toBe('entity-record');
            // Exact match confidence (1.0) * weight (0.85) = 0.85
            expect(item.Score).toBe(0.85);
            expect(item.ScoreBreakdown.Tag).toBe(0.85);
            expect(item.Snippet).toContain('Tagged with "Sharp Cheddar" (85% relevance)');
            expect(item.Tags).toContain('Sharp Cheddar');
        });

        it('matches tag DisplayName with 1.0 confidence', async () => {
            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Tagged Items') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ti-1',
                                TagID: 't-cheddar',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 0.90,
                                Tag: 'Sharp Cheddar'
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            const results = await provider.Search('Sharp Cheddar', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            expect(results[0].Score).toBe(0.9);
        });

        it('resolves tag synonyms with 1.0 confidence', async () => {
            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Tagged Items') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ti-1',
                                TagID: 't-cheddar',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 1.0,
                                Tag: 'Sharp Cheddar'
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            const results = await provider.Search('Yellow Cheese', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            expect(results[0].RecordID).toBe('prod-100');
            expect(results[0].Score).toBe(1.0);
        });

        it('matches multi-word query against tag token with scaled confidence', async () => {
            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Tagged Items') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ti-1',
                                TagID: 't-cheddar',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 1.0,
                                Tag: 'Sharp Cheddar'
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            // Query "buy cheddar online": "cheddar" is a word token matching tag Name "Cheddar"
            const results = await provider.Search('buy cheddar online', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            // Word token match gives confidence 0.90 * weight 1.0 = 0.90
            expect(results[0].Score).toBe(0.9);
        });

        it('ignores inactive tags', async () => {
            const results = await provider.Search('OldCheese', 10, undefined, contextUser);
            expect(results).toEqual([]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('deduplicates multiple matching tags for the same record and selects maximum score', async () => {
            mockTags.push({ ID: 't-cheese', Name: 'Cheese', Status: 'Active' });

            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Tagged Items') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'ti-1',
                                TagID: 't-cheddar',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 0.9,
                                Tag: 'Sharp Cheddar'
                            },
                            {
                                ID: 'ti-2',
                                TagID: 't-cheese',
                                Entity: 'Products',
                                RecordID: 'prod-100',
                                Weight: 0.5,
                                Tag: 'Cheese'
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            const results = await provider.Search('Cheddar Cheese', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            const item = results[0];
            // Best score wins (0.90 token confidence * 0.90 weight = 0.81 vs 0.90 * 0.5 = 0.45)
            expect(item.Score).toBe(0.81);
            // Both tags recorded
            expect(item.Tags).toContain('Sharp Cheddar');
            expect(item.Tags).toContain('Cheese');
            // Snippet mentions both
            expect(item.Snippet).toContain('Sharp Cheddar');
            expect(item.Snippet).toContain('Cheese');
        });
    });

    describe('Entity Filtering & Scope Constraints', () => {
        beforeEach(() => {
            mockTags.push({ ID: 't-cheddar', Name: 'Cheddar', Status: 'Active' });
            mockEntities.push({
                Name: 'Orders',
                AllowUserSearchAPI: true,
                Fields: []
            });
            mockEntities.push({
                Name: 'InternalLog',
                AllowUserSearchAPI: false, // Unsearchable entity
                Fields: []
            });
        });

        it('filters out records from entities where AllowUserSearchAPI is false', async () => {
            mockRunViewFn.mockImplementation(async () => ({
                Success: true,
                Results: [
                    {
                        ID: 'ti-1',
                        TagID: 't-cheddar',
                        Entity: 'InternalLog',
                        RecordID: 'log-1',
                        Weight: 1.0,
                        Tag: 'Cheddar'
                    },
                    {
                        ID: 'ti-2',
                        TagID: 't-cheddar',
                        Entity: 'Products',
                        RecordID: 'prod-1',
                        Weight: 0.95,
                        Tag: 'Cheddar'
                    }
                ]
            }));

            const results = await provider.Search('Cheddar', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            expect(results[0].EntityName).toBe('Products');
        });

        it('filters by filters.EntityNames when provided', async () => {
            mockRunViewFn.mockImplementation(async () => ({
                Success: true,
                Results: [
                    {
                        ID: 'ti-1',
                        TagID: 't-cheddar',
                        Entity: 'Orders',
                        RecordID: 'order-1',
                        Weight: 0.8,
                        Tag: 'Cheddar'
                    },
                    {
                        ID: 'ti-2',
                        TagID: 't-cheddar',
                        Entity: 'Products',
                        RecordID: 'prod-1',
                        Weight: 0.9,
                        Tag: 'Cheddar'
                    }
                ]
            }));

            const results = await provider.Search(
                'Cheddar',
                10,
                { EntityNames: ['Products'] },
                contextUser
            );
            expect(results).toHaveLength(1);
            expect(results[0].EntityName).toBe('Products');
        });

        it('honors scopeConstraints.Entities', async () => {
            mockRunViewFn.mockImplementation(async () => ({
                Success: true,
                Results: [
                    {
                        ID: 'ti-1',
                        TagID: 't-cheddar',
                        Entity: 'Orders',
                        RecordID: 'order-1',
                        Weight: 0.8,
                        Tag: 'Cheddar'
                    },
                    {
                        ID: 'ti-2',
                        TagID: 't-cheddar',
                        Entity: 'Products',
                        RecordID: 'prod-1',
                        Weight: 0.9,
                        Tag: 'Cheddar'
                    }
                ]
            }));

            const results = await provider.Search(
                'Cheddar',
                10,
                undefined,
                contextUser,
                {
                    Entities: [{ EntityID: 'e-orders', EntityName: 'Orders' }]
                }
            );
            expect(results).toHaveLength(1);
            expect(results[0].EntityName).toBe('Orders');
        });

        it('honors scopeConstraints.QueryTransforms for tag source', async () => {
            mockRunViewFn.mockImplementation(async () => ({
                Success: true,
                Results: [
                    {
                        ID: 'ti-1',
                        TagID: 't-cheddar',
                        Entity: 'Products',
                        RecordID: 'prod-1',
                        Weight: 1.0,
                        Tag: 'Cheddar'
                    }
                ]
            }));

            // Raw query is gibberish, but QueryTransforms['tag'] rewrites to 'Cheddar'
            const results = await provider.Search(
                'gibberish',
                10,
                undefined,
                contextUser,
                {
                    QueryTransforms: { tag: 'Cheddar' }
                }
            );
            expect(results).toHaveLength(1);
            expect(results[0].RecordID).toBe('prod-1');
        });
    });

    describe('MJ: Content Item Tags Integration', () => {
        beforeEach(() => {
            mockTags.push({ ID: 't-cheddar', Name: 'Cheddar', Status: 'Active' });
            mockEntities.push({
                Name: 'MJ: Content Items',
                AllowUserSearchAPI: true,
                Fields: []
            });
        });

        it('queries MJ: Content Item Tags when MJ: Content Items is in searchable scope', async () => {
            mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Content Item Tags') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'cit-1',
                                ItemID: 'content-99',
                                Tag: 'Cheddar',
                                Weight: 0.75
                            }
                        ]
                    };
                }
                return { Success: true, Results: [] };
            });

            const results = await provider.Search('Cheddar', 10, undefined, contextUser);
            expect(results).toHaveLength(1);
            expect(results[0].EntityName).toBe('MJ: Content Items');
            expect(results[0].RecordID).toBe('content-99');
            expect(results[0].Score).toBe(0.75);
            expect(results[0].Snippet).toContain('Tagged with "Cheddar" (75% relevance)');
        });
    });
});
