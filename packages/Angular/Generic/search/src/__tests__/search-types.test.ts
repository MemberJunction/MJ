import { describe, it, expect } from 'vitest';
import {
    SearchResultItem,
    SearchResultGroup,
    SearchFilter,
    SearchFilterOption,
    SearchRequest,
    SearchResponse,
    SearchResultSelectedEvent,
    SearchFilterChangeEvent,
    SearchExecutedEvent,
    ScoreBreakdown
} from '../lib/search-types';

describe('Search Types', () => {
    describe('SearchResultItem', () => {
        it('should be constructable with all required fields', () => {
            const item: SearchResultItem = {
                ID: 'test-1',
                Title: 'Test Result',
                Snippet: 'A snippet of matching text',
                EntityName: 'Contacts',
                RecordID: 'rec-123',
                SourceType: 'entity',
                ResultType: 'entity-record',
                Score: 0.85,
                ScoreBreakdown: { Vector: 0.8, FullText: 0.9 },
                Tags: ['customer', 'active'],
                SourceIcon: 'fa-solid fa-database',
                MatchedAt: new Date()
            };

            expect(item.ID).toBe('test-1');
            expect(item.Score).toBe(0.85);
            expect(item.Tags).toHaveLength(2);
            expect(item.SourceType).toBe('entity');
            expect(item.ResultType).toBe('entity-record');
        });
    });

    describe('SearchResultGroup', () => {
        it('should group results by source type', () => {
            const group: SearchResultGroup = {
                Label: 'Entity Records',
                Icon: 'fa-solid fa-database',
                SourceType: 'entity',
                Results: [],
                TotalCount: 0
            };

            expect(group.SourceType).toBe('entity');
            expect(group.Results).toHaveLength(0);
        });
    });

    describe('SearchFilter', () => {
        it('should support multi-select filter options', () => {
            const filter: SearchFilter = {
                Category: 'Source Type',
                Options: [
                    { Label: 'Entities', Value: 'entity', Count: 5, IsSelected: true },
                    { Label: 'Files', Value: 'file', Count: 3, IsSelected: false }
                ],
                MultiSelect: true
            };

            expect(filter.MultiSelect).toBe(true);
            expect(filter.Options).toHaveLength(2);
            expect(filter.Options[0].IsSelected).toBe(true);
        });
    });

    describe('SearchRequest', () => {
        it('should support filter configuration', () => {
            const request: SearchRequest = {
                Query: 'test query',
                MaxResults: 25,
                ActiveFilters: {
                    'Source Type': ['entity', 'file'],
                    'Entity': ['Contacts']
                },
                IncludeSources: ['vector', 'fulltext']
            };

            expect(request.ActiveFilters['Source Type']).toHaveLength(2);
            expect(request.IncludeSources).not.toContain('entity');
        });
    });

    describe('SearchResponse', () => {
        it('should include source counts', () => {
            const response: SearchResponse = {
                Success: true,
                Results: [],
                Groups: [],
                Filters: [],
                TotalCount: 42,
                ElapsedMs: 150,
                SourceCounts: { Vector: 20, FullText: 15, Entity: 7, Storage: 0 },
                Providers: []
            };

            expect(response.Success).toBe(true);
            expect(response.SourceCounts.Vector + response.SourceCounts.FullText + response.SourceCounts.Entity).toBe(42);
        });

        it('should support error state', () => {
            const response: SearchResponse = {
                Success: false,
                Results: [],
                Groups: [],
                Filters: [],
                TotalCount: 0,
                ElapsedMs: 0,
                SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
                Providers: [],
                ErrorMessage: 'Search service unavailable'
            };

            expect(response.Success).toBe(false);
            expect(response.ErrorMessage).toBeDefined();
        });
    });

    describe('ScoreBreakdown', () => {
        it('should support partial score sources', () => {
            const breakdown: ScoreBreakdown = {
                Vector: 0.92
            };

            expect(breakdown.Vector).toBe(0.92);
            expect(breakdown.FullText).toBeUndefined();
            expect(breakdown.Entity).toBeUndefined();
        });
    });
});
