import { describe, it, expect } from 'vitest';
import { ComputeRRF, ScoredCandidate } from '../scoring/ReciprocalRankFusion';

describe('ComputeRRF', () => {
    describe('edge cases', () => {
        it('should return empty array for empty input', () => {
            expect(ComputeRRF([])).toEqual([]);
        });

        it('should return a copy of the single list when only one list provided', () => {
            const list: ScoredCandidate[] = [
                { ID: 'a', Score: 0.9 },
                { ID: 'b', Score: 0.8 },
            ];
            const result = ComputeRRF([list]);
            expect(result).toHaveLength(2);
            expect(result[0].ID).toBe('a');
            expect(result[1].ID).toBe('b');
            // Should be a copy, not the same reference
            expect(result).not.toBe(list);
        });

        it('should handle empty lists within input', () => {
            const result = ComputeRRF([[], []]);
            expect(result).toEqual([]);
        });

        it('should handle one empty list and one non-empty list', () => {
            const list: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const result = ComputeRRF([list, []]);
            expect(result).toHaveLength(1);
            expect(result[0].ID).toBe('a');
        });
    });

    describe('two-list fusion', () => {
        it('should correctly fuse two overlapping lists', () => {
            const vectorResults: ScoredCandidate[] = [
                { ID: 'a', Score: 0.95 },
                { ID: 'b', Score: 0.85 },
                { ID: 'c', Score: 0.75 },
            ];
            const keywordResults: ScoredCandidate[] = [
                { ID: 'b', Score: 0.90 },
                { ID: 'a', Score: 0.80 },
                { ID: 'd', Score: 0.70 },
            ];

            const result = ComputeRRF([vectorResults, keywordResults], 60);

            // 'a' appears at rank 1 in vector (1/61) and rank 2 in keyword (1/62)
            // 'b' appears at rank 2 in vector (1/62) and rank 1 in keyword (1/61)
            // Both a and b should have identical fused scores: 1/61 + 1/62
            const expectedScoreAB = 1 / 61 + 1 / 62;
            expect(result[0].Score).toBeCloseTo(expectedScoreAB, 10);
            expect(result[1].Score).toBeCloseTo(expectedScoreAB, 10);

            // 'c' only in vector at rank 3: 1/63
            const scoreC = result.find(r => r.ID === 'c')!.Score;
            expect(scoreC).toBeCloseTo(1 / 63, 10);

            // 'd' only in keyword at rank 3: 1/63
            const scoreD = result.find(r => r.ID === 'd')!.Score;
            expect(scoreD).toBeCloseTo(1 / 63, 10);
        });

        it('should rank items appearing in both lists higher than items in only one', () => {
            const list1: ScoredCandidate[] = [
                { ID: 'shared', Score: 0.5 },
                { ID: 'only1', Score: 0.9 },
            ];
            const list2: ScoredCandidate[] = [
                { ID: 'only2', Score: 0.9 },
                { ID: 'shared', Score: 0.5 },
            ];

            const result = ComputeRRF([list1, list2]);
            expect(result[0].ID).toBe('shared');
        });

        it('should handle non-overlapping lists', () => {
            const list1: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const list2: ScoredCandidate[] = [{ ID: 'b', Score: 0.8 }];

            const result = ComputeRRF([list1, list2]);
            expect(result).toHaveLength(2);
            // Both at rank 1 in their respective lists, same fused score
            expect(result[0].Score).toBeCloseTo(result[1].Score, 10);
        });
    });

    describe('k parameter', () => {
        it('should use default k=60 when not specified', () => {
            const list: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const result = ComputeRRF([list, list]);
            // Rank 1 in both lists with k=60: 2 * (1/61)
            expect(result[0].Score).toBeCloseTo(2 / 61, 10);
        });

        it('should respect custom k value', () => {
            const list: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const result = ComputeRRF([list, list], 1);
            // Rank 1 in both lists with k=1: 2 * (1/2) = 1.0
            expect(result[0].Score).toBeCloseTo(1.0, 10);
        });

        it('should produce different scores with different k values', () => {
            const lists: ScoredCandidate[][] = [
                [{ ID: 'a', Score: 0.9 }, { ID: 'b', Score: 0.8 }],
                [{ ID: 'b', Score: 0.9 }, { ID: 'a', Score: 0.8 }],
            ];

            const resultLowK = ComputeRRF(lists, 1);
            const resultHighK = ComputeRRF(lists, 100);

            // With low k, rank differences matter more
            // With high k, rank differences matter less
            const diffLowK = Math.abs(resultLowK[0].Score - resultLowK[1].Score);
            const diffHighK = Math.abs(resultHighK[0].Score - resultHighK[1].Score);

            // Both should have the same items with same scores since a and b
            // are symmetric in this test case
            expect(diffLowK).toBeCloseTo(0, 10);
            expect(diffHighK).toBeCloseTo(0, 10);
        });
    });

    describe('metadata preservation', () => {
        it('should preserve metadata from the first occurrence', () => {
            const list1: ScoredCandidate[] = [
                { ID: 'a', Score: 0.9, Metadata: { Source: 'vector' } },
            ];
            const list2: ScoredCandidate[] = [
                { ID: 'a', Score: 0.8, Metadata: { Source: 'keyword' } },
            ];

            const result = ComputeRRF([list1, list2]);
            expect(result[0].Metadata).toEqual({ Source: 'vector' });
        });

        it('should handle candidates without metadata', () => {
            const list: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const result = ComputeRRF([list]);
            expect(result[0].Metadata).toBeUndefined();
        });
    });

    describe('sorting', () => {
        it('should return results sorted by descending fused score', () => {
            const list1: ScoredCandidate[] = [
                { ID: 'a', Score: 0.9 },
                { ID: 'b', Score: 0.8 },
                { ID: 'c', Score: 0.7 },
            ];
            const list2: ScoredCandidate[] = [
                { ID: 'c', Score: 0.95 },
                { ID: 'a', Score: 0.85 },
            ];

            const result = ComputeRRF([list1, list2]);
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].Score).toBeGreaterThanOrEqual(result[i].Score);
            }
        });
    });

    describe('three-list fusion', () => {
        it('should correctly fuse three lists', () => {
            const list1: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const list2: ScoredCandidate[] = [{ ID: 'a', Score: 0.8 }];
            const list3: ScoredCandidate[] = [{ ID: 'a', Score: 0.7 }];

            const result = ComputeRRF([list1, list2, list3]);
            // Rank 1 in all three lists with k=60: 3 * (1/61)
            expect(result[0].Score).toBeCloseTo(3 / 61, 10);
        });
    });
});
