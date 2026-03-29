import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService, RecentSearch } from '../lib/search.service';
import {
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultGroup,
    SearchFilter
} from '../lib/search-types';

describe('SearchService', () => {
    let service: SearchService;

    beforeEach(() => {
        service = new SearchService();
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
            expect(entityGroup?.Label).toBe('Entity Records');
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
            const sourceFilter = filters.find(f => f.Category === 'Source Type');
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
