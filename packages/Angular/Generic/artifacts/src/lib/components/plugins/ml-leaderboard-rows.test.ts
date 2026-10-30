import { describe, it, expect } from 'vitest';
import { LeaderboardRows } from './ml-leaderboard-rows';

describe('NormalizeLeaderboardRows', () => {
  it('shows the inner-CV interval and never a cvScore, even from an old artifact', () => {
    const rows = LeaderboardRows.NormalizeLeaderboardRows([
      { rank: 1, algorithm: 'glm', score: 0.4, innerLower: 0.38, innerUpper: 0.42, optimistic: true, isWinner: true },
      { rank: 2, algorithm: 'xgb', score: 0.41, cvScore: 0.402 },
    ]);
    expect(rows[0]).toEqual({ rank: 1, algorithm: 'glm', featureSet: '', score: 0.4, interval: [0.38, 0.42], optimistic: true, modelId: null, isWinner: true });
    expect(rows[1]?.interval).toBeNull();
    expect(rows[1]?.isWinner).toBe(false);
    expect(Object.keys(rows[1] ?? {})).not.toContain('cvScore');
  });
  it('reads the canonical Metric first, and never makes an unmeasured rank 1 the winner', () => {
    expect(LeaderboardRows.NormalizeLeaderboardRows([{ Metric: 0.5, score: 0.9 }])[0]?.score).toBe(0.5);
    const unmeasured = LeaderboardRows.NormalizeLeaderboardRows([{ rank: 1, algorithm: 'a', score: null }, { rank: 2, algorithm: 'b', score: 0.7 }]);
    expect(unmeasured.some((r) => r.isWinner)).toBe(false);
    expect(LeaderboardRows.NormalizeLeaderboardRows([{ rank: 1, algorithm: 'a', score: 0.7 }])[0]?.isWinner).toBe(true);
  });
});
