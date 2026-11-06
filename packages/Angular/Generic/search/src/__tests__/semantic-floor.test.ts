import { describe, it, expect } from 'vitest';
import { PassesSemanticFloor, SearchResultItem, ScoreBreakdown } from '../lib/search-types';

/**
 * The relevance slider is a cutoff on SEMANTIC similarity only (MJ #4993). Fused `Score` is
 * rank-based (RRF ÷ max), so a hit found by one of N lanes tops out at 1/N; filtering on it
 * hid most results once 3+ lanes returned hits. A text/storage match is never hidden.
 */
function result(breakdown: ScoreBreakdown, score = 0.5): SearchResultItem {
    return {
        ID: 'r', Title: 't', Snippet: '', EntityName: 'People', RecordID: '1',
        SourceType: 'entity', ResultType: 'entity-record', Score: score,
        ScoreBreakdown: breakdown, Tags: [], SourceIcon: '', MatchedAt: new Date(),
    } as SearchResultItem;
}

describe('PassesSemanticFloor', () => {
    it('keeps everything when the cutoff is 0', () => {
        expect(PassesSemanticFloor(result({ Vector: 0.1 }), 0)).toBe(true);
    });

    it('hides a semantic-only result below the cutoff', () => {
        expect(PassesSemanticFloor(result({ Vector: 0.72 }), 0.8)).toBe(false);
    });

    it('keeps a semantic-only result at or above the cutoff', () => {
        expect(PassesSemanticFloor(result({ Vector: 0.8 }), 0.8)).toBe(true);
        expect(PassesSemanticFloor(result({ Vector: 0.86 }), 0.8)).toBe(true);
    });

    it('keeps a keyword match even when its semantic similarity is low', () => {
        expect(PassesSemanticFloor(result({ Vector: 0.4, Entity: 0.59 }), 0.8)).toBe(true);
    });

    it('keeps full-text, storage, tag and keyword-only matches regardless of the cutoff', () => {
        expect(PassesSemanticFloor(result({ Entity: 0.15 }), 0.9)).toBe(true);
        expect(PassesSemanticFloor(result({ FullText: 0.1 }), 0.9)).toBe(true);
        expect(PassesSemanticFloor(result({ Storage: 0.2 }), 0.9)).toBe(true);
        expect(PassesSemanticFloor(result({ Tag: 0.2, Vector: 0.3 }), 0.9)).toBe(true);
    });

    it('ignores the fused Score entirely', () => {
        // A one-lane hit among four lanes has fused Score <= 0.25; it must still show.
        expect(PassesSemanticFloor(result({ Vector: 0.85 }, 0.25), 0.3)).toBe(true);
        expect(PassesSemanticFloor(result({ Entity: 0.59 }, 0.1), 0.3)).toBe(true);
    });

    it('keeps a result with no breakdown at all (nothing to judge it by)', () => {
        expect(PassesSemanticFloor(result({}), 0.8)).toBe(true);
    });
});
