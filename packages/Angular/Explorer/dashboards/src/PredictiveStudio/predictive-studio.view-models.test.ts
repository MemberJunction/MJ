import { describe, it, expect } from 'vitest';
import {
  DeriveLeaderboard, FormatMetricValue, GroupIterationsToKanban, ParseMetrics, ParseSessionLeaderboard, PrimaryModelScore,
  ReadStoredGate,
  type PSIterationRow,
} from './predictive-studio.view-models';
import { WidgetFixtures } from './components/evaluation-results/widget-fixtures';

/**
 * The model score the Registry and Production show, for the metric keys a trained model stores: its holdout lists the
 * protocol's primary proper score first (`log-loss`, `brier`, `multiclass-log-loss`, `rmse`, `mae`,
 * `poisson-deviance`, `tweedie-deviance`, `mase`), then the secondary metrics; a kept simple baseline stores the primary
 * only, and the inner-CV mean is in `Metrics`.
 */
describe('PrimaryModelScore over the stored proper scores', () => {
  const score = (holdout: Record<string, number>, metrics: Record<string, number> = {}, ProblemType = 'classification') =>
    PrimaryModelScore({ ProblemType, Metrics: JSON.stringify(metrics), HoldoutMetrics: JSON.stringify(holdout) });

  it('shows the stored primary holdout score of a kept baseline under its own label, for every proper score', () => {
    const cases: [string, string, string][] = [
      ['log-loss', 'LogLoss', 'Log Loss'], ['brier', 'Brier', 'Brier'], ['multiclass-log-loss', 'MulticlassLogLoss', 'Multiclass Log Loss'],
      ['rmse', 'RMSE', 'RMSE'], ['mae', 'MAE', 'MAE'], ['poisson-deviance', 'PoissonDeviance', 'Poisson Deviance'],
      ['tweedie-deviance', 'TweedieDeviance', 'Tweedie Deviance'], ['mase', 'MASE', 'MASE'],
    ];
    for (const [stored, key, label] of cases) {
      expect(score({ [stored]: 0.3674 })).toEqual({ key, label, value: 0.3674 });
    }
  });

  it('prefers the holdout primary to the inner-CV mean of the same metric', () => {
    expect(score({ mase: 0.82 }, { mase: 0.9 }, 'regression')).toEqual({ key: 'MASE', label: 'MASE', value: 0.82 });
  });

  it('keeps showing AUC for a shipped binary model whose holdout carries it', () => {
    expect(score({ 'log-loss': 0.36, auc: 0.71 })?.key).toBe('AUC');
  });

  it('reads every proper-score key and formats it to three decimals', () => {
    const parsed = ParseMetrics(JSON.stringify({ 'multiclass-log-loss': 1.0234, 'poisson-deviance': 2.5, 'tweedie-deviance': 3.25, mase: 0.8 }));
    expect(parsed).toEqual({ MulticlassLogLoss: 1.0234, PoissonDeviance: 2.5, TweedieDeviance: 3.25, MASE: 0.8 });
    expect(FormatMetricValue('MASE', 0.81234)).toBe('0.812');
  });
});

/**
 * The experiment leaderboard and kanban, from the session's stored leaderboard (`MJ: Experiment Sessions.Leaderboard`):
 * each entry names the holdout metric its normalized score was read from, and an entry on the plan's success metric
 * ranks above every entry scored on a fallback proper score (a kept simple baseline).
 */
describe('the experiment leaderboard over the stored session ranking', () => {
  const row = (ID: string, Score: number | null, AlgorithmName: string, Status = 'Completed', Sequence = 1): PSIterationRow =>
    ({ ID, ExperimentSessionID: 's1', Sequence, Label: null, Status, Score, ComputeCost: null, TokensUsed: null, Rationale: null, AlgorithmName });
  // RMSE is the success metric (normalized −12.5, −13); the kept baseline is scored on log-loss (normalized −0.3), a bigger number on another metric.
  const stored = JSON.stringify([
    { IterationID: 'IT-A', Metric: -12.5, ModelID: 'm1', ScoreMetric: 'rmse', OnSuccessMetric: true },
    { IterationID: 'IT-B', Metric: -13, ModelID: 'm2', ScoreMetric: 'rmse', OnSuccessMetric: true },
    { IterationID: 'IT-C', Metric: -0.3, ModelID: 'm3', ScoreMetric: 'log-loss', OnSuccessMetric: false },
  ]);
  const rows = [row('it-c', -0.3, 'GLM', 'Completed', 3), row('it-a', -12.5, 'XGBoost', 'Completed', 1), row('it-b', -13, 'LightGBM', 'Completed', 2)];

  it('reads the stored entries in their stored order, an older entry on the plan success metric', () => {
    const legacy = JSON.stringify([{ IterationID: 'IT-A', Metric: 0.81 }, { IterationID: 7 }, { IterationID: 'IT-B', Metric: 0.8, ScoreMetric: 'auc', OnSuccessMetric: true }]);
    expect(ParseSessionLeaderboard(legacy, 'AUC')).toEqual([
      { IterationID: 'IT-A', Metric: 0.81, ScoreMetric: 'auc', OnSuccessMetric: true },
      { IterationID: 'IT-B', Metric: 0.8, ScoreMetric: 'auc', OnSuccessMetric: true },
    ]);
    expect([ParseSessionLeaderboard(null, 'AUC'), ParseSessionLeaderboard('not json', 'AUC')]).toEqual([[], []]);
  });

  it('ranks every success-metric entry above a fallback entry, whatever the numbers, and labels each with its metric', () => {
    const lb = DeriveLeaderboard(rows, ParseSessionLeaderboard(stored, 'RMSE'));
    expect(lb.map((e) => [e.rank, e.algorithm, e.ScoreMetric, e.Score, e.OnSuccessMetric, e.best === true])).toEqual([
      [1, 'XGBoost', 'rmse', 12.5, true, true],
      [2, 'LightGBM', 'rmse', 13, true, false],
      [3, 'GLM', 'log-loss', 0.3, false, false],
    ]);
  });

  it('leaves out a scored iteration the stored ranking does not hold yet', () => {
    const lb = DeriveLeaderboard([...rows, row('it-d', -11, 'CatBoost', 'Completed', 4)], ParseSessionLeaderboard(stored, 'RMSE'));
    expect(lb.map((e) => e.algorithm)).toEqual(['XGBoost', 'LightGBM', 'GLM']);
  });

  it('badges the stored best, names each card metric, and takes a delta only against the best on the same metric', () => {
    const k = GroupIterationsToKanban(rows, ParseSessionLeaderboard(stored, 'RMSE'));
    const card = (algo: string) => k.Completed.find((c) => c.Algorithm === algo);
    expect([card('XGBoost')?.Status, card('LightGBM')?.Status, card('GLM')?.Status]).toEqual(['Best', 'Completed', 'Completed']);
    expect([card('LightGBM')?.ScoreMetric, card('LightGBM')?.score, card('LightGBM')?.ScoreDelta]).toEqual(['rmse', 13, 'Δ −0.500']);
    expect([card('GLM')?.ScoreMetric, card('GLM')?.score, card('GLM')?.ScoreDelta]).toEqual(['log-loss', 0.3, 'Δ best on log-loss —']);
  });
});

describe('ReadStoredGate', () => {
  it('reads the stored outcome and the reason text of a completed run', () => {
    const base = WidgetFixtures.StoredRunEnvelope();
    if (base.gate === null) throw new Error('the fixture stores a gate');
    const gate = { ...base.gate, reason: { ...base.gate.reason, text: 'glm within margin' } };
    const json = JSON.stringify({ ...base, gate });
    expect(ReadStoredGate(json)).toEqual({ Outcome: 'keep-simple-baseline', Reason: 'glm within margin' });
  });

  it('is null for no record, an unreadable envelope, a failed run, or a run without a gate', () => {
    expect(ReadStoredGate(null)).toBeNull();
    expect(ReadStoredGate('{}')).toBeNull();
    expect(ReadStoredGate(JSON.stringify({ ...WidgetFixtures.StoredRunEnvelope(), status: 'failed' }))).toBeNull();
    expect(ReadStoredGate(WidgetFixtures.StoredRunJson({ gate: null }))).toBeNull();
  });
});
