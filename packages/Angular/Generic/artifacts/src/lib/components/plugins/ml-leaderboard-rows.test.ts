import { describe, it, expect } from 'vitest';
import { LeaderboardRows } from './ml-leaderboard-rows';

describe('NormalizeLeaderboardRows', () => {
  it('shows the inner-CV interval and never a cvScore, even from an old artifact', () => {
    const rows = LeaderboardRows.NormalizeLeaderboardRows([
      { rank: 1, algorithm: 'glm', score: 0.4, innerLower: 0.38, innerUpper: 0.42, optimistic: true, isWinner: true },
      { rank: 2, algorithm: 'xgb', score: 0.41, cvScore: 0.402 },
    ]);
    expect(rows[0]).toEqual({ rank: 1, algorithm: 'glm', featureSet: '', score: 0.4, metricName: null, interval: [0.38, 0.42], optimistic: true, modelId: null, isWinner: true, optimisticTag: true });
    expect(rows[1]?.interval).toBeNull();
    expect(rows[1]?.optimistic).toBe(false);
    expect(rows[1]?.isWinner).toBe(false);
    expect(Object.keys(rows[1] ?? {})).not.toContain('cvScore');
  });
  it('reads the canonical Metric first, and never makes an unmeasured rank 1 the winner', () => {
    expect(LeaderboardRows.NormalizeLeaderboardRows([{ Metric: 0.5, score: 0.9 }])[0]?.score).toBe(0.5);
    const unmeasured = LeaderboardRows.NormalizeLeaderboardRows([{ rank: 1, algorithm: 'a', score: null }, { rank: 2, algorithm: 'b', score: 0.7 }]);
    expect(unmeasured.some((r) => r.isWinner)).toBe(false);
    expect(LeaderboardRows.NormalizeLeaderboardRows([{ rank: 1, algorithm: 'a', score: 0.7 }])[0]?.isWinner).toBe(true);
  });
  it("carries each row's metric name and tags only the winner's inner-fold score as optimistic", () => {
    const rows = LeaderboardRows.NormalizeLeaderboardRows([
      { rank: 1, algorithm: 'a', score: 0.33, metricName: 'log-loss', optimistic: true, isWinner: false },
      { rank: 2, algorithm: 'b', score: 0.34, metricName: 'log-loss', optimistic: true, isWinner: true },
      { rank: 3, algorithm: 'c', score: 0.8, metricName: 'AUC', isWinner: false },
    ]);
    expect(rows.map((r) => [r.metricName, r.optimisticTag])).toEqual([['log-loss', false], ['log-loss', true], ['AUC', false]]);
    expect(LeaderboardRows.NormalizeLeaderboardRows([{ rank: 1, score: 0.8, metricName: 'AUC', isWinner: true }])[0]?.optimisticTag).toBe(false);
  });
  it("labels the score column with the rows' one metric, Score when they disagree, else the fallback", () => {
    const rows = (names: readonly (string | null)[]) => LeaderboardRows.NormalizeLeaderboardRows(names.map((metricName, i) => ({ rank: i + 1, score: 0.3, metricName })));
    expect(LeaderboardRows.ScoreColumnLabel(rows(['log-loss', 'log-loss']), 'auc')).toBe('log-loss');
    expect(LeaderboardRows.ScoreColumnLabel(rows(['log-loss', 'brier']), 'auc')).toBe('Score');
    expect(LeaderboardRows.RowsDisagreeOnMetric(rows(['log-loss', 'brier']))).toBe(true);
    expect(LeaderboardRows.ScoreColumnLabel(rows([null, null]), 'auc')).toBe('auc');
    expect(LeaderboardRows.RowsDisagreeOnMetric(rows(['log-loss', null]))).toBe(false);
  });
});
