import { describe, it, expect } from 'vitest';
import { ComputeRRF, ScoredCandidate } from '../generic/scoring/ReciprocalRankFusion';

describe('ComputeRRF (canonical)', () => {
    describe('edge cases', () => {
        it('returns empty array for empty input', () => {
            expect(ComputeRRF([])).toEqual([]);
        });

        it('returns a copy of the single list when only one list provided', () => {
            const list: ScoredCandidate[] = [
                { ID: 'a', Score: 0.9 },
                { ID: 'b', Score: 0.8 },
            ];
            const result = ComputeRRF([list]);
            expect(result).toHaveLength(2);
            expect(result[0].ID).toBe('a');
            expect(result).not.toBe(list);
        });

        it('handles empty lists within input', () => {
            expect(ComputeRRF([[], []])).toEqual([]);
        });
    });

    describe('unweighted two-list fusion', () => {
        it('produces the standard RRF score for an overlapping fusion', () => {
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
            const expectedShared = 1 / 61 + 1 / 62;
            expect(result[0].Score).toBeCloseTo(expectedShared, 10);
            expect(result[1].Score).toBeCloseTo(expectedShared, 10);
            expect(result.find(r => r.ID === 'c')!.Score).toBeCloseTo(1 / 63, 10);
            expect(result.find(r => r.ID === 'd')!.Score).toBeCloseTo(1 / 63, 10);
        });

        it('ranks items shared across lists above items in only one', () => {
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
    });

    describe('weighted fusion', () => {
        it('omitting weights gives identical results to passing all-ones', () => {
            const lists: ScoredCandidate[][] = [
                [{ ID: 'a', Score: 0.9 }, { ID: 'b', Score: 0.8 }],
                [{ ID: 'b', Score: 0.9 }, { ID: 'a', Score: 0.8 }],
            ];

            const noWeights = ComputeRRF(lists, 60);
            const allOnes = ComputeRRF(lists, 60, [1.0, 1.0]);

            expect(noWeights.length).toBe(allOnes.length);
            for (let i = 0; i < noWeights.length; i++) {
                expect(noWeights[i].ID).toBe(allOnes[i].ID);
                expect(noWeights[i].Score).toBeCloseTo(allOnes[i].Score, 10);
            }
        });

        it('a heavier weight makes that list dominate the ordering', () => {
            const lexical: ScoredCandidate[] = [
                { ID: 'lex_top', Score: 1.0 },
                { ID: 'shared', Score: 0.5 },
            ];
            const semantic: ScoredCandidate[] = [
                { ID: 'sem_top', Score: 1.0 },
                { ID: 'shared', Score: 0.5 },
            ];

            // The fused score for `shared` is the sum of both lists' contributions,
            // so a weight large enough to overcome that summation (here w > 61, the
            // RRF denominator at rank 1 with k=60) is what flips the ordering.
            const lexicalHeavy = ComputeRRF([lexical, semantic], 60, [100.0, 1.0]);
            expect(lexicalHeavy[0].ID).toBe('lex_top');

            const semanticHeavy = ComputeRRF([lexical, semantic], 60, [1.0, 100.0]);
            expect(semanticHeavy[0].ID).toBe('sem_top');
        });

        it('a weight of zero entirely suppresses a list', () => {
            const keep: ScoredCandidate[] = [{ ID: 'keep', Score: 0.9 }];
            const drop: ScoredCandidate[] = [{ ID: 'drop', Score: 0.9 }];

            const result = ComputeRRF([keep, drop], 60, [1.0, 0]);
            expect(result.map(r => r.ID)).toEqual(['keep']);
        });

        it('a weights array shorter than the number of lists falls back to 1.0 for the tail', () => {
            const list1: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const list2: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];

            // Only one weight supplied → second list should use default 1.0
            const result = ComputeRRF([list1, list2], 60, [2.0]);
            // a appears at rank 1 in both: 2.0 * (1/61) + 1.0 * (1/61)
            expect(result[0].Score).toBeCloseTo(2.0 / 61 + 1.0 / 61, 10);
        });

        it('linearly scales the contribution of a single list', () => {
            const list: ScoredCandidate[] = [{ ID: 'a', Score: 0.9 }];
            const otherList: ScoredCandidate[] = [{ ID: 'b', Score: 0.9 }];

            const baseline = ComputeRRF([list, otherList], 60, [1.0, 1.0]);
            const doubled = ComputeRRF([list, otherList], 60, [2.0, 1.0]);

            // The score for 'a' (only in the weighted list) should exactly double
            const baseA = baseline.find(r => r.ID === 'a')!.Score;
            const doubledA = doubled.find(r => r.ID === 'a')!.Score;
            expect(doubledA).toBeCloseTo(2 * baseA, 10);
        });
    });

    describe('metadata preservation', () => {
        it('preserves metadata from the first occurrence', () => {
            const list1: ScoredCandidate[] = [
                { ID: 'a', Score: 0.9, Metadata: { Source: 'lexical' } },
            ];
            const list2: ScoredCandidate[] = [
                { ID: 'a', Score: 0.8, Metadata: { Source: 'semantic' } },
            ];

            const result = ComputeRRF([list1, list2]);
            expect(result[0].Metadata).toEqual({ Source: 'lexical' });
        });
    });

    describe('sorting', () => {
        it('returns results sorted by descending fused score', () => {
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
});
