import { describe, it, expect } from 'vitest';
import {
    UnifiedSearchRequest,
    UnifiedSearchResult,
    UnifiedSearchResponse,
    SearchFilters,
    SearchSourceType,
    FusionMethod
} from '../generic/SearchTypes';

describe('Search Types (Server-Side)', () => {
    describe('UnifiedSearchRequest', () => {
        it('should accept all optional parameters', () => {
            const request: UnifiedSearchRequest = {
                Query: 'customer churn analysis',
                Filters: {
                    EntityNames: ['Contacts', 'Companies'],
                    SourceTypes: ['entity', 'content-item'],
                    Tags: ['important'],
                    DateRange: { Start: new Date('2025-01-01') }
                },
                MaxResults: 50,
                IncludeSources: ['vector', 'fulltext'],
                FusionMethod: 'rrf',
                ContextUser: {} as never // mock user
            };

            expect(request.Query).toBe('customer churn analysis');
            expect(request.Filters?.EntityNames).toHaveLength(2);
            expect(request.MaxResults).toBe(50);
        });

        it('should work with minimal required fields', () => {
            const request: UnifiedSearchRequest = {
                Query: 'test',
                ContextUser: {} as never
            };

            expect(request.Query).toBe('test');
            expect(request.Filters).toBeUndefined();
            expect(request.MaxResults).toBeUndefined();
        });
    });

    describe('SearchFilters', () => {
        it('should support all filter types', () => {
            const filters: SearchFilters = {
                EntityNames: ['Contacts'],
                SourceTypes: ['entity', 'file', 'web-page'],
                ContentTypes: ['text/plain', 'application/pdf'],
                Tags: ['customer', 'vip'],
                DateRange: {
                    Start: new Date('2025-01-01'),
                    End: new Date('2026-01-01')
                }
            };

            expect(filters.SourceTypes).toHaveLength(3);
            expect(filters.DateRange?.Start).toBeDefined();
            expect(filters.DateRange?.End).toBeDefined();
        });
    });

    describe('UnifiedSearchResult', () => {
        it('should contain all result metadata', () => {
            const result: UnifiedSearchResult = {
                ID: 'result-1',
                EntityName: 'Contacts',
                RecordID: 'rec-123',
                SourceType: 'entity',
                Title: 'John Doe',
                Snippet: 'Contact record for John Doe at Acme Corp',
                Score: 0.87,
                ScoreBreakdown: {
                    Vector: 0.9,
                    FullText: 0.82,
                    Entity: 0.7
                },
                Tags: ['customer', 'enterprise'],
                MatchedAt: new Date()
            };

            expect(result.Score).toBe(0.87);
            expect(result.ScoreBreakdown.Vector).toBeGreaterThan(result.ScoreBreakdown.Entity!);
        });
    });

    describe('SearchSourceType', () => {
        it('should accept valid source types', () => {
            const types: SearchSourceType[] = ['vector', 'fulltext', 'entity'];
            expect(types).toHaveLength(3);
        });
    });

    describe('FusionMethod', () => {
        it('should accept valid fusion methods', () => {
            const methods: FusionMethod[] = ['rrf', 'weighted'];
            expect(methods).toHaveLength(2);
        });
    });
});
