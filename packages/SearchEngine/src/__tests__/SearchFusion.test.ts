import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchFusion, LabeledResultList } from '../generic/SearchFusion';
import { SearchResultItem, SearchScoreBreakdown } from '../generic/search.types';

// Mock the ComputeRRF function from @memberjunction/core
vi.mock('@memberjunction/core', () => ({
    ComputeRRF: vi.fn((rankedLists: Array<Array<{ ID: string; Score: number; Rank: number }>>) => {
        // Simple mock: merge all candidates, sum scores for duplicates, sort desc
        const scores = new Map<string, number>();
        for (const list of rankedLists) {
            for (const candidate of list) {
                const existing = scores.get(candidate.ID) ?? 0;
                // Simplified RRF: 1 / (60 + rank)
                scores.set(candidate.ID, existing + 1.0 / (60 + candidate.Rank));
            }
        }
        return Array.from(scores.entries())
            .map(([ID, Score]) => ({ ID, Score, Rank: 0 }))
            .sort((a, b) => b.Score - a.Score);
    })
}));

/**
 * Helper to create a SearchResultItem with sensible defaults.
 */
function makeResult(overrides: Partial<SearchResultItem> & { RecordID: string; EntityName: string }): SearchResultItem {
    return {
        ID: overrides.ID ?? `test-${overrides.EntityName}-${overrides.RecordID}`,
        EntityName: overrides.EntityName,
        RecordID: overrides.RecordID,
        SourceType: overrides.SourceType ?? 'entity',
        ResultType: overrides.ResultType ?? 'entity-record',
        Title: overrides.Title ?? `Title ${overrides.RecordID}`,
        Snippet: overrides.Snippet ?? '',
        Score: overrides.Score ?? 0.5,
        ScoreBreakdown: overrides.ScoreBreakdown ?? {},
        Tags: overrides.Tags ?? [],
        MatchedAt: overrides.MatchedAt ?? new Date('2025-01-01'),
    };
}

describe('SearchFusion', () => {
    let fusion: SearchFusion;

    beforeEach(() => {
        fusion = new SearchFusion();
    });

    describe('Fuse', () => {
        it('should return empty array when all lists are empty', () => {
            const lists: LabeledResultList[] = [
                { Source: 'entity', Results: [] },
                { Source: 'vector', Results: [] },
            ];
            const result = fusion.Fuse(lists, 10);
            expect(result).toEqual([]);
        });

        it('should return empty array when no lists provided', () => {
            const result = fusion.Fuse([], 10);
            expect(result).toEqual([]);
        });

        it('should return single source results as-is without normalization', () => {
            const items: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '1', Score: 0.45 }),
                makeResult({ EntityName: 'People', RecordID: '2', Score: 0.30 }),
                makeResult({ EntityName: 'People', RecordID: '3', Score: 0.20 }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: items },
                { Source: 'entity', Results: [] },
            ];

            const result = fusion.Fuse(lists, 10);

            // Single source: returned as-is, scores unchanged
            expect(result).toHaveLength(3);
            expect(result[0].Score).toBe(0.45);
            expect(result[1].Score).toBe(0.30);
            expect(result[2].Score).toBe(0.20);
        });

        it('should respect maxResults when single source has more results', () => {
            const items: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '1', Score: 0.9 }),
                makeResult({ EntityName: 'People', RecordID: '2', Score: 0.8 }),
                makeResult({ EntityName: 'People', RecordID: '3', Score: 0.7 }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'entity', Results: items },
            ];

            const result = fusion.Fuse(lists, 2);
            expect(result).toHaveLength(2);
            expect(result[0].RecordID).toBe('1');
            expect(result[1].RecordID).toBe('2');
        });

        it('should apply RRF when multiple sources have results', () => {
            const vectorResults: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: 'a', Score: 0.9, SourceType: 'vector' }),
                makeResult({ EntityName: 'People', RecordID: 'b', Score: 0.8, SourceType: 'vector' }),
            ];
            const entityResults: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: 'c', Score: 0.7, SourceType: 'entity' }),
                makeResult({ EntityName: 'People', RecordID: 'a', Score: 0.6, SourceType: 'entity' }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: vectorResults },
                { Source: 'entity', Results: entityResults },
            ];

            const result = fusion.Fuse(lists, 10);

            // RRF was applied: results should have RRF scores
            expect(result.length).toBeGreaterThan(0);
            // Record 'a' appears in both lists so should have higher fused score
            const recordA = result.find(r => r.RecordID === 'a');
            expect(recordA).toBeDefined();
        });

        it('should limit fused results to maxResults', () => {
            const vectorResults: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '1', Score: 0.9, SourceType: 'vector' }),
                makeResult({ EntityName: 'People', RecordID: '2', Score: 0.8, SourceType: 'vector' }),
                makeResult({ EntityName: 'People', RecordID: '3', Score: 0.7, SourceType: 'vector' }),
            ];
            const entityResults: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '4', Score: 0.6, SourceType: 'entity' }),
                makeResult({ EntityName: 'People', RecordID: '5', Score: 0.5, SourceType: 'entity' }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: vectorResults },
                { Source: 'entity', Results: entityResults },
            ];

            const result = fusion.Fuse(lists, 3);
            expect(result.length).toBeLessThanOrEqual(3);
        });
    });

    describe('Deduplicate', () => {
        it('should return all results when no duplicates exist', () => {
            const results: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '1', Score: 0.9 }),
                makeResult({ EntityName: 'People', RecordID: '2', Score: 0.8 }),
                makeResult({ EntityName: 'Companies', RecordID: '1', Score: 0.7 }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped).toHaveLength(3);
        });

        it('should merge duplicate EntityName+RecordID and prefer entity source', () => {
            const results: SearchResultItem[] = [
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.4,
                    SourceType: 'vector',
                    Title: 'Vector Title',
                    ScoreBreakdown: { Vector: 0.4 },
                }),
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.6,
                    SourceType: 'entity',
                    Title: 'Entity Title',
                    ScoreBreakdown: { Entity: 0.6 },
                }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped).toHaveLength(1);
            // Should prefer the entity source (richer metadata)
            expect(deduped[0].SourceType).toBe('entity');
            expect(deduped[0].Title).toBe('Entity Title');
        });

        it('should use max score from both sources after merge', () => {
            const results: SearchResultItem[] = [
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.8,
                    SourceType: 'vector',
                    ScoreBreakdown: { Vector: 0.8 },
                }),
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.5,
                    SourceType: 'entity',
                    ScoreBreakdown: { Entity: 0.5 },
                }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped).toHaveLength(1);
            expect(deduped[0].Score).toBe(0.8);
        });

        it('should merge ScoreBreakdown from both sources', () => {
            const results: SearchResultItem[] = [
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.4,
                    SourceType: 'vector',
                    ScoreBreakdown: { Vector: 0.4 },
                }),
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.6,
                    SourceType: 'entity',
                    ScoreBreakdown: { Entity: 0.6 },
                }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped[0].ScoreBreakdown.Vector).toBe(0.4);
            expect(deduped[0].ScoreBreakdown.Entity).toBe(0.6);
        });

        it('should override overall Score when ScoreBreakdown value is higher', () => {
            const results: SearchResultItem[] = [
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.3,
                    SourceType: 'entity',
                    ScoreBreakdown: { Entity: 0.7 },
                }),
            ];

            const deduped = fusion.Deduplicate(results);
            // ScoreBreakdown.Entity (0.7) > Score (0.3), so Score should be updated
            expect(deduped[0].Score).toBe(0.7);
        });

        it('should not increase Score when ScoreBreakdown values are lower', () => {
            const results: SearchResultItem[] = [
                makeResult({
                    EntityName: 'People',
                    RecordID: '1',
                    Score: 0.9,
                    SourceType: 'entity',
                    ScoreBreakdown: { Entity: 0.5 },
                }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped[0].Score).toBe(0.9);
        });

        it('should sort results by score descending after dedup', () => {
            const results: SearchResultItem[] = [
                makeResult({ EntityName: 'A', RecordID: '1', Score: 0.3, ScoreBreakdown: { Entity: 0.3 } }),
                makeResult({ EntityName: 'B', RecordID: '2', Score: 0.9, ScoreBreakdown: { Entity: 0.9 } }),
                makeResult({ EntityName: 'C', RecordID: '3', Score: 0.6, ScoreBreakdown: { Vector: 0.6 } }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped[0].Score).toBe(0.9);
            expect(deduped[1].Score).toBe(0.6);
            expect(deduped[2].Score).toBe(0.3);
        });

        it('should return empty array for empty input', () => {
            const deduped = fusion.Deduplicate([]);
            expect(deduped).toEqual([]);
        });

        it('should treat same RecordID in different entities as distinct', () => {
            const results: SearchResultItem[] = [
                makeResult({ EntityName: 'People', RecordID: '1', Score: 0.8 }),
                makeResult({ EntityName: 'Companies', RecordID: '1', Score: 0.7 }),
            ];

            const deduped = fusion.Deduplicate(results);
            expect(deduped).toHaveLength(2);
        });
    });
});
