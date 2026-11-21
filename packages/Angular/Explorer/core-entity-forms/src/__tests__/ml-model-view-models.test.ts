import { describe, it, expect } from 'vitest';
import {
  ModelImportanceView,
  ParseMetrics,
  ParseFeatureImportance,
  PrimaryModelScore,
  MetricsToDisplay,
  OverfitGap,
  HumanizeFeatureName,
  FormatMetricValue,
  TrainScoreIsInnerCv,
  PS_FEATURE_DOMINANCE_THRESHOLD,
} from '../lib/custom/MLModels/ml-model-view-models';

describe('ml-model-view-models', () => {
  describe('ParseMetrics', () => {
    it('returns empty record for null/undefined/invalid JSON', () => {
      expect(ParseMetrics(null)).toEqual({});
      expect(ParseMetrics(undefined)).toEqual({});
      expect(ParseMetrics('')).toEqual({});
      expect(ParseMetrics('{bad json}')).toEqual({});
    });

    it('parses valid numeric metrics to canonical keys', () => {
      const raw = JSON.stringify({ auc: 0.885, f1: 0.81, accuracy: 0.85, loss: 'not-a-number' });
      const parsed = ParseMetrics(raw);
      expect(parsed.AUC).toBe(0.885);
      expect(parsed.F1).toBe(0.81);
      expect(parsed.Accuracy).toBe(0.85);
      expect(parsed.LogLoss).toBeUndefined();
    });
  });

  describe('ParseFeatureImportance', () => {
    it('handles empty or invalid input', () => {
      expect(ParseFeatureImportance(null)).toEqual([]);
      expect(ParseFeatureImportance('invalid')).toEqual([]);
    });

    it('parses array of feature objects with ranking and dominance warning', () => {
      const input = [
        { feature: 'DaysUntilExpiration', importance: 0.65 },
        { feature: 'TotalSpend', importance: 0.25 },
        { feature: 'LoginCount', importance: 0.10 },
      ];
      const result = ParseFeatureImportance(JSON.stringify(input));
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('DaysUntilExpiration');
      expect(result[0].pct).toBe(100);
      expect(result[0].warning).toBe(true); // >= 0.6 threshold

      expect(result[1].name).toBe('TotalSpend');
      expect(result[1].warning).toBe(false);
    });

    it('parses key-value map format', () => {
      const input = {
        ScoreA: 0.4,
        ScoreB: 0.2,
      };
      const result = ParseFeatureImportance(JSON.stringify(input));
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('ScoreA');
      expect(result[0].warning).toBe(false);
    });
  });

  describe('PrimaryModelScore', () => {
    it('prefers AUC then Accuracy then F1 for classification', () => {
      const model = {
        ProblemType: 'Classification',
        HoldoutMetrics: JSON.stringify({ auc: 0.89 }),
      };
      const score = PrimaryModelScore(model);
      expect(score).not.toBeNull();
      expect(score?.key).toBe('AUC');
      expect(score?.value).toBe(0.89);
    });

    it('prefers R2 then RMSE for regression', () => {
      const model = {
        ProblemType: 'Regression',
        HoldoutMetrics: JSON.stringify({ r2: 0.82 }),
      };
      const score = PrimaryModelScore(model);
      expect(score).not.toBeNull();
      expect(score?.key).toBe('R2');
      expect(score?.value).toBe(0.82);
    });

    it('returns null when no recognized metric', () => {
      expect(PrimaryModelScore({})).toBeNull();
    });
  });

  describe('OverfitGap', () => {
    it('returns positive gap for overfit train > holdout', () => {
      const model = {
        Metrics: JSON.stringify({ auc: 0.95 }),
        HoldoutMetrics: JSON.stringify({ auc: 0.85 }),
      };
      const gap = OverfitGap(model);
      expect(gap).toBeCloseTo(0.10);
    });

    it('returns null when metrics are missing', () => {
      expect(OverfitGap({})).toBeNull();
    });
  });

  describe('HumanizeFeatureName', () => {
    // Pins the published export's output as it is on next: an `Is` prefix is dropped and every word is title-cased.
    it('turns camelCase and snake_case into clean Title Case', () => {
      expect(HumanizeFeatureName('daysUntilExpiration')).toBe('Days Until Expiration');
      expect(HumanizeFeatureName('total_spend_amount')).toBe('Total Spend Amount');
    });

    it('drops a leading Is before a capital and title-cases snake_case words', () => {
      expect(HumanizeFeatureName('IsActive')).toBe('Active');
      expect(HumanizeFeatureName('membership_type')).toBe('Membership Type');
      expect(HumanizeFeatureName('IsAutoRenew=1')).toBe('Auto Renew=1');
      expect(HumanizeFeatureName('')).toBe('');
    });
  });

  describe('MetricsToDisplay', () => {
    it('formats known metrics for tabular/card rendering', () => {
      const metrics = ParseMetrics(JSON.stringify({ auc: 0.885, precision: 0.76 }));
      const displays = MetricsToDisplay(metrics);
      expect(displays.length).toBe(2);
      const auc = displays.find((d) => d.key === 'AUC');
      expect(auc?.label).toBe('AUC (ROC)');
      expect(auc?.value).toBe('0.885');
    });
  });

  describe('ModelImportanceView.DisplayedFeatureImportance', () => {
    const raw = JSON.stringify({ AutoRenew: 1.13, IncomeK: 0.01, Noise1: 0.002 });
    const lineage = (kind: string): string => JSON.stringify({ evaluation: { ImportanceKind: kind } });
    it('shows coefficient importance for logistic regression', () => {
      expect(ModelImportanceView.DisplayedFeatureImportance(lineage('coefficient'), raw).map((b) => b.name)).toEqual(['AutoRenew', 'IncomeK', 'Noise1']);
    });
    it('hides split / impurity importance', () => {
      expect(ModelImportanceView.DisplayedFeatureImportance(lineage('split_or_impurity'), raw)).toEqual([]);
      expect(ModelImportanceView.DisplayedFeatureImportance(null, raw)).toEqual([]);
    });
  });

  describe('PrimaryModelScore over the stored proper scores', () => {
    const score = (holdout: Record<string, number>, metrics: Record<string, number> = {}, ProblemType = 'classification') =>
      PrimaryModelScore({ ProblemType, Metrics: JSON.stringify(metrics), HoldoutMetrics: JSON.stringify(holdout) });

    it('shows the stored primary holdout score of a kept baseline under its own label, for every proper score', () => {
      const cases: [string, string, string][] = [
        ['log-loss', 'LogLoss', 'Log Loss'], ['brier', 'Brier', 'Brier Score'], ['multiclass-log-loss', 'MulticlassLogLoss', 'Multiclass Log Loss'],
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
  });

  describe('TrainScoreIsInnerCv', () => {
    it('is true for a model trained under an Evaluation Protocol, false for an older in-sample model', () => {
      expect(TrainScoreIsInnerCv(JSON.stringify({ evaluationProtocolId: 'EP-1' }))).toBe(true);
      expect([TrainScoreIsInnerCv(JSON.stringify({ evaluation: {} })), TrainScoreIsInnerCv(null), TrainScoreIsInnerCv('not json')]).toEqual([false, false, false]);
    });
  });
});
