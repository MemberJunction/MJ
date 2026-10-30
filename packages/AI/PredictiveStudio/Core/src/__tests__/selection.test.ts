import { describe, it, expect } from 'vitest';
import type { CandidateInnerScore, MetricKey } from '../index';
import { InnerScoreSelection } from '../selection';

const inner = (candidate: string, metric: MetricKey, value: number, lower: number, upper: number, folds = 15): CandidateInnerScore => ({
  candidate, inner: { metric, value, interval: { level: 0.95, lower, upper }, n: 4000 }, folds, optimistic: true,
});

describe('RankByInnerScore', () => {
  it('ranks a loss ascending, a higher-is-better metric descending, and breaks ties by candidate name', () => {
    expect(InnerScoreSelection.RankByInnerScore([inner('xgb', 'log-loss', 0.41, 0.39, 0.43), inner('glm', 'log-loss', 0.40, 0.38, 0.42), inner('a-rf', 'log-loss', 0.41, 0.40, 0.42)]).map((s) => s.candidate)).toEqual(['glm', 'a-rf', 'xgb']);
    expect(InnerScoreSelection.RankByInnerScore([inner('a', 'auc', 0.7, 0.6, 0.8), inner('b', 'auc', 0.8, 0.7, 0.9)]).map((s) => s.candidate)).toEqual(['b', 'a']);
  });
  it('ranks a closer-to-one metric by its distance from one', () => {
    expect(InnerScoreSelection.RankByInnerScore([inner('far', 'calibration-slope', 1.3, 1.2, 1.4), inner('near', 'calibration-slope', 0.9, 0.8, 1.0)]).map((s) => s.candidate)).toEqual(['near', 'far']);
  });
});

describe('CheckSelection', () => {
  const scores = [inner('glm', 'log-loss', 0.40, 0.38, 0.42), inner('xgb', 'log-loss', 0.41, 0.39, 0.43)];
  it('accepts every candidate scored on every fold and a holdout read once for the finalist, which need not have the best mean', () => {
    expect(InnerScoreSelection.CheckSelection(scores, 'xgb', { count: 1, finalist: 'xgb' })).toEqual({ Ok: true, Finalist: 'xgb' });
  });
  it('refuses a pruned candidate, a missing interval and a holdout read for another candidate', () => {
    expect(InnerScoreSelection.CheckSelection([...scores, inner('rf', 'log-loss', 0.45, 0.43, 0.47, 5)], 'glm', { count: 1, finalist: 'glm' }))
      .toEqual({ Ok: false, Reason: 'candidate-pruned', Detail: 'rf was scored on 5 folds, the others on 15' });
    expect(InnerScoreSelection.CheckSelection([inner('glm', 'log-loss', 0.4, 0.41, 0.42)], 'glm', { count: 1, finalist: 'glm' }))
      .toEqual({ Ok: false, Reason: 'interval-missing', Detail: "glm's inner score has no valid interval around its mean" });
    expect(InnerScoreSelection.CheckSelection([inner('glm', 'log-loss', 0.4, Number.NaN, 0.42)], 'glm', { count: 1, finalist: 'glm' }).Ok).toBe(false);
    expect(InnerScoreSelection.CheckSelection(scores, 'glm', { count: 1, finalist: 'xgb' }))
      .toEqual({ Ok: false, Reason: 'holdout-not-read-once-for-finalist', Detail: 'the holdout was read for xgb, not the finalist glm' });
    expect(InnerScoreSelection.CheckSelection(scores, 'nope', { count: 1, finalist: 'nope' })).toEqual({ Ok: false, Reason: 'finalist-not-a-candidate', Detail: 'finalist nope has no inner score' });
    expect(InnerScoreSelection.CheckSelection([], 'glm', { count: 1, finalist: 'glm' })).toEqual({ Ok: false, Reason: 'missing-inner-scores', Detail: 'the trainer returned no inner-CV scores' });
  });
});

describe('LeaderboardFromInnerScores', () => {
  it('carries the interval, labels every inner score optimistic and marks the finalist', () => {
    expect(InnerScoreSelection.LeaderboardFromInnerScores([inner('xgb', 'log-loss', 0.41, 0.39, 0.43), inner('glm', 'log-loss', 0.40, 0.38, 0.42)], 'glm')).toEqual([
      { Rank: 1, Candidate: 'glm', Metric: 'log-loss', Mean: 0.40, Lower: 0.38, Upper: 0.42, Folds: 15, Optimistic: true, IsFinalist: true },
      { Rank: 2, Candidate: 'xgb', Metric: 'log-loss', Mean: 0.41, Lower: 0.39, Upper: 0.43, Folds: 15, Optimistic: true, IsFinalist: false },
    ]);
  });
  it('marks a finalist below rank 1 when the one-standard-error rule picked it', () => {
    const rows = InnerScoreSelection.LeaderboardFromInnerScores([inner('xgb', 'log-loss', 0.40, 0.38, 0.42), inner('glm', 'log-loss', 0.41, 0.39, 0.43)], 'glm');
    expect(rows.map((r) => [r.Rank, r.Candidate, r.IsFinalist])).toEqual([[1, 'xgb', false], [2, 'glm', true]]);
  });
});
