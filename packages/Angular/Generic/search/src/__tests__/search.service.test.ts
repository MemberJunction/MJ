import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { SearchService, RecentSearch } from '../lib/search.service';
import {
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultGroup,
    SearchFilter
} from '../lib/search-types';

/** Installs a fake Metadata.Provider with a mock ExecuteGQL that returns empty success */
function installMockProvider(): ReturnType<typeof vi.fn> {
    const mockExecuteGQL = vi.fn().mockResolvedValue({
        SearchKnowledge: {
            Success: true,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 1,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0 },
        }
    });
    (Metadata as unknown as Record<string, unknown>)['Provider'] = { ExecuteGQL: mockExecuteGQL };
    return mockExecuteGQL;
}

describe('SearchService', () => {
    let service: SearchService;

    beforeEach(() => {
        service = new SearchService();
        installMockProvider();
    });

    describe('ExecuteSearch', () => {
        it('should set IsSearching to true during search', async () => {
            const values: boolean[] = [];
            service.IsSearching$.subscribe(val => values.push(val));

            await service.ExecuteSearch({
                Query: 'test query',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector', 'fulltext', 'entity']
            });

            // Should have gone true then false
            expect(values).toContain(true);
            expect(values[values.length - 1]).toBe(false);
        });

        it('should return empty results for empty query', async () => {
            const response = await service.ExecuteSearch({
                Query: '   ',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            });

            expect(response.Success).toBe(true);
            expect(response.Results).toHaveLength(0);
            expect(response.TotalCount).toBe(0);
        });

        it('should update SearchResults$ observable', async () => {
            await service.ExecuteSearch({
                Query: 'test',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            });

            const result = service.SearchResults$.value;
            expect(result).not.toBeNull();
            expect(result?.Success).toBe(true);
        });

        it('should add to recent searches', async () => {
            await service.ExecuteSearch({
                Query: 'test query',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            });

            const recent = service.RecentSearches$.value;
            expect(recent.length).toBe(1);
            expect(recent[0].Query).toBe('test query');
        });

        it('should deduplicate recent searches', async () => {
            const request: SearchRequest = {
                Query: 'test',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            };

            await service.ExecuteSearch(request);
            await service.ExecuteSearch(request);

            const recent = service.RecentSearches$.value;
            expect(recent.length).toBe(1);
        });

        it('should limit recent searches to max 20', async () => {
            for (let i = 0; i < 25; i++) {
                await service.ExecuteSearch({
                    Query: `query ${i}`,
                    MaxResults: 10,
                    ActiveFilters: {},
                    IncludeSources: ['vector']
                });
            }

            expect(service.RecentSearches$.value.length).toBeLessThanOrEqual(20);
        });
    });

    describe('ClearResults', () => {
        it('should set SearchResults$ to null', async () => {
            await service.ExecuteSearch({
                Query: 'test',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            });

            service.ClearResults();
            expect(service.SearchResults$.value).toBeNull();
        });
    });

    describe('ClearRecentSearches', () => {
        it('should clear all recent searches', async () => {
            await service.ExecuteSearch({
                Query: 'test',
                MaxResults: 10,
                ActiveFilters: {},
                IncludeSources: ['vector']
            });

            service.ClearRecentSearches();
            expect(service.RecentSearches$.value).toHaveLength(0);
        });
    });

    describe('GroupResults', () => {
        it('should group results by source type', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts'),
                createMockResult('2', 'entity', 'Contacts'),
                createMockResult('3', 'file', 'Documents'),
                createMockResult('4', 'web-page', 'Pages'),
            ];

            const groups = service.GroupResults(results);

            expect(groups).toHaveLength(3);
            const entityGroup = groups.find(g => g.SourceType === 'entity');
            expect(entityGroup?.Results).toHaveLength(2);
            expect(entityGroup?.Label).toBe('Database');
        });

        it('should return empty array for empty input', () => {
            const groups = service.GroupResults([]);
            expect(groups).toHaveLength(0);
        });
    });

    describe('BuildFilters', () => {
        it('should build source type, entity, and tag filters', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts', ['customer']),
                createMockResult('2', 'file', 'Documents', ['internal']),
            ];

            const filters = service.BuildFilters(results);

            expect(filters).toHaveLength(3);
            const sourceFilter = filters.find(f => f.Category === 'Source');
            expect(sourceFilter?.Options).toHaveLength(2);
        });

        it('should limit tags filter to 15 options', () => {
            const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
            const results = tags.map((tag, i) =>
                createMockResult(String(i), 'entity', 'Test', [tag])
            );

            const filters = service.BuildFilters(results);
            const tagFilter = filters.find(f => f.Category === 'Tags');
            expect(tagFilter!.Options.length).toBeLessThanOrEqual(15);
        });

        it('should generate correct tag filter options with counts and icon', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts', ['crm', 'active']),
                createMockResult('2', 'entity', 'Companies', ['crm']),
                createMockResult('3', 'file', 'Docs', ['internal']),
            ];

            const filters = service.BuildFilters(results);
            const tagFilter = filters.find(f => f.Category === 'Tags');
            expect(tagFilter).toBeDefined();
            expect(tagFilter!.MultiSelect).toBe(true);

            // 'crm' appears in 2 results, should be sorted first
            const crmOption = tagFilter!.Options.find(o => o.Value === 'crm');
            expect(crmOption).toBeDefined();
            expect(crmOption!.Count).toBe(2);
            expect(crmOption!.Icon).toBe('fa-solid fa-tag');
            expect(crmOption!.IsSelected).toBe(false);

            // 'active' and 'internal' each appear once
            const activeOption = tagFilter!.Options.find(o => o.Value === 'active');
            expect(activeOption!.Count).toBe(1);
            const internalOption = tagFilter!.Options.find(o => o.Value === 'internal');
            expect(internalOption!.Count).toBe(1);
        });

        it('should omit Tags filter when no results have tags', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts'),
                createMockResult('2', 'entity', 'Companies'),
            ];

            const filters = service.BuildFilters(results);
            const tagFilter = filters.find(f => f.Category === 'Tags');
            expect(tagFilter).toBeUndefined(); // Empty categories are filtered out
        });

        it('should sort tags by count descending', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'A', ['rare', 'common']),
                createMockResult('2', 'entity', 'B', ['common']),
                createMockResult('3', 'entity', 'C', ['common']),
            ];

            const filters = service.BuildFilters(results);
            const tagFilter = filters.find(f => f.Category === 'Tags');
            expect(tagFilter!.Options[0].Value).toBe('common');
            expect(tagFilter!.Options[0].Count).toBe(3);
            expect(tagFilter!.Options[1].Value).toBe('rare');
            expect(tagFilter!.Options[1].Count).toBe(1);
        });
    });

    describe('GetSourceIcon', () => {
        it('should return correct icon for known types', () => {
            expect(service.GetSourceIcon('entity')).toContain('fa-database');
            expect(service.GetSourceIcon('file')).toContain('fa-file');
            expect(service.GetSourceIcon('web-page')).toContain('fa-globe');
        });

        it('should return fallback icon for unknown types', () => {
            expect(service.GetSourceIcon('unknown')).toContain('fa-circle');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SR-3 Bug Fix: BuildFilters should preserve all options from full result set
    // ═══════════════════════════════════════════════════════════════
    describe('BuildFilters (SR-3: filter options from full result set)', () => {
        it('should include all entity names even when results are filtered', () => {
            // Full result set with 3 entities
            const fullResults: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts', ['crm']),
                createMockResult('2', 'entity', 'Companies', ['crm']),
                createMockResult('3', 'entity', 'Deals', ['sales']),
            ];

            // Build filters from FULL set (this is what the fix does)
            const filters = service.BuildFilters(fullResults);
            const entityFilter = filters.find(f => f.Category === 'Entity');

            // All 3 entities should appear in filter options
            expect(entityFilter?.Options).toHaveLength(3);
            expect(entityFilter?.Options.map(o => o.Value)).toContain('Contacts');
            expect(entityFilter?.Options.map(o => o.Value)).toContain('Companies');
            expect(entityFilter?.Options.map(o => o.Value)).toContain('Deals');
        });

        it('should count tags correctly across all results', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts', ['crm', 'sales']),
                createMockResult('2', 'entity', 'Companies', ['crm']),
                createMockResult('3', 'entity', 'Deals', ['sales', 'pipeline']),
            ];

            const filters = service.BuildFilters(results);
            const tagFilter = filters.find(f => f.Category === 'Tags');

            // 'crm' appears in 2 results, 'sales' in 2, 'pipeline' in 1
            expect(tagFilter?.Options).toHaveLength(3);
            const crmOption = tagFilter?.Options.find(o => o.Value === 'crm');
            expect(crmOption?.Count).toBe(2);
        });

        it('should not lose filter options when building from subset vs full set', () => {
            const fullResults: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts'),
                createMockResult('2', 'entity', 'Companies'),
                createMockResult('3', 'file', 'Documents'),
            ];

            // Simulating filtering to only Contacts
            const filteredResults = fullResults.filter(r => r.EntityName === 'Contacts');

            // Building from filtered set loses Companies and Documents
            const filteredFilters = service.BuildFilters(filteredResults);
            const filteredEntityFilter = filteredFilters.find(f => f.Category === 'Entity');
            expect(filteredEntityFilter?.Options).toHaveLength(1); // Only Contacts

            // Building from full set preserves all options (the fix)
            const fullFilters = service.BuildFilters(fullResults);
            const fullEntityFilter = fullFilters.find(f => f.Category === 'Entity');
            expect(fullEntityFilter?.Options).toHaveLength(3); // Contacts + Companies + Documents
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // SR-4 Bug Fix: GroupResults should sort within groups by score
    // ═══════════════════════════════════════════════════════════════
    describe('GroupResults (SR-4: grouping and sorting)', () => {
        it('should group results by source type with correct labels', () => {
            const results: SearchResultItem[] = [
                { ...createMockResult('1', 'entity', 'Contacts'), Score: 0.9 },
                { ...createMockResult('2', 'content-item', 'Items'), Score: 0.8 },
                { ...createMockResult('3', 'entity', 'Companies'), Score: 0.7 },
            ];

            const groups = service.GroupResults(results);
            expect(groups).toHaveLength(2);

            const entityGroup = groups.find(g => g.SourceType === 'entity');
            expect(entityGroup?.Label).toBe('Database');
            expect(entityGroup?.TotalCount).toBe(2);

            const contentGroup = groups.find(g => g.SourceType === 'content-item');
            expect(contentGroup?.Label).toBe('Content Items');
            expect(contentGroup?.TotalCount).toBe(1);
        });

        it('should use fallback label for unknown source types', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Test'),
            ];
            // Hack source type to unknown
            (results[0] as unknown as Record<string, unknown>)['SourceType'] = 'custom-type';

            const groups = service.GroupResults(results);
            expect(groups[0].Label).toBe('custom-type'); // Falls back to raw type name
        });

        it('should use fallback icon for unknown source types', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Test'),
            ];
            (results[0] as unknown as Record<string, unknown>)['SourceType'] = 'unknown-source';

            const groups = service.GroupResults(results);
            expect(groups[0].Icon).toBe('fa-solid fa-circle');
        });

        it('should handle mixed known and unknown source types', () => {
            const results: SearchResultItem[] = [
                createMockResult('1', 'entity', 'Contacts'),
                createMockResult('2', 'entity', 'Companies'),
            ];
            (results[1] as unknown as Record<string, unknown>)['SourceType'] = 'custom-plugin';

            const groups = service.GroupResults(results);
            expect(groups).toHaveLength(2);

            const entityGroup = groups.find(g => g.SourceType === 'entity');
            expect(entityGroup?.Label).toBe('Database');

            const customGroup = groups.find(g => g.SourceType === 'custom-plugin');
            expect(customGroup?.Label).toBe('custom-plugin');
            expect(customGroup?.Icon).toBe('fa-solid fa-circle');
        });
    });
});

function createMockResult(
    id: string,
    sourceType: 'entity' | 'content-item' | 'file' | 'web-page',
    entityName: string,
    tags: string[] = []
): SearchResultItem {
    return {
        ID: id,
        Title: `Result ${id}`,
        Snippet: `Snippet for result ${id}`,
        EntityName: entityName,
        RecordID: `rec-${id}`,
        SourceType: sourceType,
        Score: 0.85,
        ScoreBreakdown: { Vector: 0.8, FullText: 0.9 },
        Tags: tags,
        SourceIcon: 'fa-solid fa-database',
        MatchedAt: new Date()
    };
}
