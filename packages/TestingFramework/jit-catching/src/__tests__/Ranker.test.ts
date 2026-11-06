import { describe, it, expect } from 'vitest';
import { RankCatches, SelectReported } from '../ranking/Ranker';
import type { Bucket, Catch } from '../types';

describe('RankCatches / SelectReported (§9.3)', () => {
  const c = (id: string, median: Bucket | null, tp: number | null, boosts: string[], dropped: string | null = null): Catch => ({ ID: id, RunID: 'r', CandidateTestID: id, Verdict: { Label: 'WeakCatch', Timeout: false, Reason: '' }, DroppedByRule: dropped, Boosts: boosts, TPProb: tp, JudgeBuckets: [], Median: median, Rank: null, Reported: false, CommentID: null });
  it('orders by median, then TP Prob, then boosts; dropped catches get no rank', () => {
    const ranked = RankCatches([c('a', 'Medium', 0.9, []), c('b', 'High', 0.1, []), c('c', 'High', 0.1, ['MatchesRisk']), c('d', 'High', 0.5, [], 'PrivateAccess')]);
    expect(ranked.filter((x) => x.Rank !== null).map((x) => [x.ID, x.Rank])).toEqual([['c', 1], ['b', 2], ['a', 3]]);
    expect(ranked.find((x) => x.ID === 'd')?.Rank).toBeNull();
  });
  it('label threshold: median ≥ Medium, at most MaxReported', () => {
    const out = SelectReported(RankCatches([c('a', 'High', 0, []), c('b', 'Medium', 0, []), c('c', 'Low', 0, []), c('d', 'Medium', 0, []), c('e', 'Medium', 0, [])]), { MinMedian: 'Medium', MaxReported: 3 }, 'Label');
    expect(out.filter((x) => x.Reported).map((x) => x.ID)).toEqual(['a', 'b', 'd']);
  });
  it('nightly threshold: High, or Medium with a listed boost', () => {
    const out = SelectReported(RankCatches([c('a', 'High', 0, []), c('b', 'Medium', 0, ['AccessChange']), c('c', 'Medium', 0, ['UnexpectedEmpty'])]), { MinMedian: 'High', MediumWithBoosts: ['AccessChange', 'MatchesRisk'] }, 'Nightly');
    expect(out.filter((x) => x.Reported).map((x) => x.ID)).toEqual(['a', 'b']);
  });
});
