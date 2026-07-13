import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchFusion, LabeledResultList } from '../generic/SearchFusion';
import { SearchResultItem, SearchScoreBreakdown } from '../generic/search.types';

// Mock the ComputeRRF function from @memberjunction/core.
// Mirrors the real signature `(rankedLists, k?, weights?)` so the per-list
// `weights` argument is honored — without it, weighted-fusion paths would tie
// and fall back to insertion order, masking real weight-plumbing bugs. The
// mock keys off each candidate's `Rank` excess property (test-double convention)
// rather than array position, but the weighting math matches ComputeRRF.
vi.mock('@memberjunction/core', () => ({
    ComputeRRF: vi.fn((
        rankedLists: Array<Array<{ ID: string; Score: number; Rank: number }>>,
        _k = 60,
        weights?: number[]
    ) => {
        const scores = new Map<string, number>();
        for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
            const weight = weights?.[listIdx] ?? 1.0;
            if (weight === 0) continue;
            for (const candidate of rankedLists[listIdx]) {
                const existing = scores.get(candidate.ID) ?? 0;
                // Simplified weighted RRF: weight * 1 / (60 + rank)
                scores.set(candidate.ID, existing + weight * (1.0 / (60 + candidate.Rank)));
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

    // ────────────────────────────────────────────────────────────────
    // Scope-aware fusion (Phase 1B.13 / 1B.19)
    // ────────────────────────────────────────────────────────────────

    describe('Fuse (weighted, non-uniform)', () => {
        it('honors heavy-vector weight when records differ across sources', () => {
            const vector: SearchResultItem[] = [
                makeResult({ EntityName: 'E', RecordID: 'A', Score: 0.9, SourceType: 'vector' }),
            ];
            const entity: SearchResultItem[] = [
                makeResult({ EntityName: 'E', RecordID: 'B', Score: 0.9, SourceType: 'entity' }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: vector },
                { Source: 'entity', Results: entity },
            ];
            const result = fusion.Fuse(lists, 10, { vector: 10, entity: 0.1 });
            expect(result[0].RecordID).toBe('A');
        });

        it('uniform weights behave identically to unweighted fusion (uses mocked ComputeRRF)', () => {
            const vector: SearchResultItem[] = [
                makeResult({ EntityName: 'E', RecordID: 'A', Score: 0.9, SourceType: 'vector' }),
                makeResult({ EntityName: 'E', RecordID: 'B', Score: 0.8, SourceType: 'vector' }),
            ];
            const entity: SearchResultItem[] = [
                makeResult({ EntityName: 'E', RecordID: 'C', Score: 0.7, SourceType: 'entity' }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: vector },
                { Source: 'entity', Results: entity },
            ];
            const unweighted = fusion.Fuse(lists, 10);
            const uniform = fusion.Fuse(lists, 10, { vector: 1, entity: 1 });
            expect(uniform.map(r => r.RecordID)).toEqual(unweighted.map(r => r.RecordID));
        });
    });

    describe('CrossScopeFusion', () => {
        it('returns empty when all scopes are empty', () => {
            expect(fusion.CrossScopeFusion(new Map(), 10)).toEqual([]);
        });

        it('returns the single scope as-is (no fusion needed)', () => {
            const map = new Map<string, SearchResultItem[]>();
            map.set('scope-a', [
                makeResult({ EntityName: 'E', RecordID: '1', Score: 0.9 }),
                makeResult({ EntityName: 'E', RecordID: '2', Score: 0.8 }),
            ]);
            const result = fusion.CrossScopeFusion(map, 10);
            expect(result).toHaveLength(2);
            expect(result[0].RecordID).toBe('1');
        });

        it('boosts records that appear in multiple scopes', () => {
            const map = new Map<string, SearchResultItem[]>();
            map.set('scope-a', [
                makeResult({ EntityName: 'E', RecordID: 'A', Score: 0.9 }),
                makeResult({ EntityName: 'E', RecordID: 'B', Score: 0.8 }),
            ]);
            map.set('scope-b', [
                makeResult({ EntityName: 'E', RecordID: 'B', Score: 0.85 }),
                makeResult({ EntityName: 'E', RecordID: 'C', Score: 0.7 }),
            ]);
            const result = fusion.CrossScopeFusion(map, 10);
            // B appears in both → should rank first
            expect(result[0].RecordID).toBe('B');
            expect(result).toHaveLength(3);
        });

        it('honors per-scope weights (passes the per-scope weights through to RRF in order)', () => {
            const map = new Map<string, SearchResultItem[]>();
            map.set('scope-a', [makeResult({ EntityName: 'E', RecordID: 'A', Score: 0.9 })]);
            map.set('scope-b', [makeResult({ EntityName: 'E', RecordID: 'B', Score: 0.9 })]);
            const heavyB = fusion.CrossScopeFusion(map, 10, { 'scope-a': 0.1, 'scope-b': 10 });
            expect(heavyB[0].RecordID).toBe('B');
        });

        it('truncates to maxResults', () => {
            const map = new Map<string, SearchResultItem[]>();
            map.set('scope-a', [
                makeResult({ EntityName: 'E', RecordID: '1', Score: 0.9 }),
                makeResult({ EntityName: 'E', RecordID: '2', Score: 0.8 }),
                makeResult({ EntityName: 'E', RecordID: '3', Score: 0.7 }),
            ]);
            expect(fusion.CrossScopeFusion(map, 2)).toHaveLength(2);
        });

        it('retains EntityName for records that only live in one scope', () => {
            const map = new Map<string, SearchResultItem[]>();
            map.set('scope-a', [
                makeResult({ EntityName: 'Articles', RecordID: 'r1', Score: 0.9 }),
            ]);
            map.set('scope-b', [
                makeResult({ EntityName: 'Policies', RecordID: 'r2', Score: 0.8 }),
            ]);
            const result = fusion.CrossScopeFusion(map, 10);
            const names = result.map(r => r.EntityName).sort();
            expect(names).toEqual(['Articles', 'Policies']);
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // Tier-1 search edge-case coverage (release-readiness audit)
    // ────────────────────────────────────────────────────────────────────

    describe('Defensive sanitation against malformed provider results', () => {
        it('drops items with NaN Score before fusing', () => {
            const lists: LabeledResultList[] = [
                {
                    Source: 'vector',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: 'good', Score: 0.6 }),
                        makeResult({ EntityName: 'E', RecordID: 'nan', Score: NaN }),
                    ],
                },
                {
                    Source: 'entity',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: 'good', Score: 0.4 }),
                    ],
                },
            ];
            const result = fusion.Fuse(lists, 10);
            const ids = result.map(r => r.RecordID);
            expect(ids).toContain('good');
            expect(ids).not.toContain('nan');
        });

        it('drops items with Infinity Score', () => {
            const lists: LabeledResultList[] = [
                {
                    Source: 'vector',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: 'inf', Score: Infinity }),
                        makeResult({ EntityName: 'E', RecordID: 'ok', Score: 0.5 }),
                    ],
                },
                { Source: 'entity', Results: [] },
            ];
            const result = fusion.Fuse(lists, 10);
            expect(result.map(r => r.RecordID)).toEqual(['ok']);
        });

        it('drops items with empty RecordID', () => {
            const lists: LabeledResultList[] = [
                {
                    Source: 'vector',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: '', Score: 0.9 }),
                        makeResult({ EntityName: 'E', RecordID: 'a', Score: 0.7 }),
                    ],
                },
                { Source: 'entity', Results: [] },
            ];
            const result = fusion.Fuse(lists, 10);
            expect(result.map(r => r.RecordID)).toEqual(['a']);
        });

        it('drops items with non-string RecordID', () => {
            const lists: LabeledResultList[] = [
                {
                    Source: 'vector',
                    Results: [
                        // Cast through unknown to construct a type-incorrect runtime
                        // payload that mirrors what a misbehaving 3rd-party
                        // provider could emit.
                        ({ ...makeResult({ EntityName: 'E', RecordID: 'x', Score: 0.8 }), RecordID: 42 as unknown as string }),
                        makeResult({ EntityName: 'E', RecordID: 'b', Score: 0.5 }),
                    ],
                },
                { Source: 'entity', Results: [] },
            ];
            const result = fusion.Fuse(lists, 10);
            expect(result.map(r => r.RecordID)).toEqual(['b']);
        });

        it('survives a list with only malformed items by treating it as empty', () => {
            const lists: LabeledResultList[] = [
                {
                    Source: 'vector',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: '', Score: NaN }),
                    ],
                },
                {
                    Source: 'entity',
                    Results: [
                        makeResult({ EntityName: 'E', RecordID: 'real', Score: 0.7 }),
                    ],
                },
            ];
            const result = fusion.Fuse(lists, 10);
            // Only the entity list survives sanitation → single-source path
            expect(result).toHaveLength(1);
            expect(result[0].RecordID).toBe('real');
        });
    });

    describe('Single-provider scope (post-fusion-fix regression guard)', () => {
        it('returns vector results unchanged when only Vector contributes', () => {
            // Common production setup: a scope wired only to the Vector
            // provider. We just changed `applyRRF` to merge ScoreBreakdowns
            // for multi-provider hits — verify the single-provider fast
            // path (which doesn't go through applyRRF) still returns the
            // provider's items verbatim.
            const items: SearchResultItem[] = [
                makeResult({ EntityName: 'E', RecordID: 'a', Score: 0.9, SourceType: 'vector', ScoreBreakdown: { Vector: 0.9 } as SearchScoreBreakdown }),
                makeResult({ EntityName: 'E', RecordID: 'b', Score: 0.7, SourceType: 'vector', ScoreBreakdown: { Vector: 0.7 } as SearchScoreBreakdown }),
                makeResult({ EntityName: 'E', RecordID: 'c', Score: 0.5, SourceType: 'vector', ScoreBreakdown: { Vector: 0.5 } as SearchScoreBreakdown }),
            ];
            const lists: LabeledResultList[] = [
                { Source: 'vector', Results: items },
                { Source: 'entity', Results: [] },
            ];
            const result = fusion.Fuse(lists, 10);
            expect(result).toHaveLength(3);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b', 'c']);
            // Source type and breakdown preserved verbatim
            expect(result[0].SourceType).toBe('vector');
            expect((result[0].ScoreBreakdown as { Vector?: number }).Vector).toBe(0.9);
        });

        it('truncates to maxResults in single-provider mode', () => {
            const items: SearchResultItem[] = Array.from({ length: 25 }, (_, i) =>
                makeResult({ EntityName: 'E', RecordID: `r${i}`, Score: 1 - i * 0.01, SourceType: 'entity' })
            );
            const lists: LabeledResultList[] = [
                { Source: 'entity', Results: items },
            ];
            const result = fusion.Fuse(lists, 5);
            expect(result).toHaveLength(5);
            expect(result.map(r => r.RecordID)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
        });
    });
});
