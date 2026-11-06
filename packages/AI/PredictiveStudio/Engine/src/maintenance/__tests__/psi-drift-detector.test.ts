import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  ClassifyPSISeverity,
  ComputeCategoricalFeaturePSI,
  ComputeConfidenceAndChallengerDivergence,
  ComputeNumericFeaturePSI,
  ComputePopulationStabilityIndex,
  EvaluateFeatureAndPredictionDrift,
  LoadFeatureAndPredictionDriftFromFeatureValues,
  PSIDriftDetector,
} from '../psi-drift-detector';

describe('psi-drift-detector', () => {
  describe('ComputePopulationStabilityIndex and ClassifyPSISeverity', () => {
    it('should return near-zero PSI and None severity for identical distributions', () => {
      const bins = [100, 150, 200, 150, 100];
      const psi = ComputePopulationStabilityIndex(bins, bins);
      expect(psi).toBeCloseTo(0, 6);
      expect(ClassifyPSISeverity(psi)).toBe('None');
    });

    it('should classify moderate shift as Warning and large shift as Critical', () => {
      const base = [250, 250, 250, 250];
      const moderate = [330, 270, 220, 180];
      const modPsi = ComputePopulationStabilityIndex(base, moderate);
      expect(modPsi).toBeGreaterThanOrEqual(0.05);

      const severe = [50, 50, 100, 800];
      const critPsi = ComputePopulationStabilityIndex(base, severe);
      expect(critPsi).toBeGreaterThanOrEqual(0.25);
      expect(ClassifyPSISeverity(critPsi)).toBe('Critical');
    });
  });

  describe('Minimum sample size and PSIDriftDetector retrain threshold (D6)', () => {
    it('should return InsufficientData: true and Severity: None for 20 baseline and 20 evaluation observations from N(0,1)', () => {
      // Deterministic standard-normal quantile draws (N = 20 < default MinSampleSize = 100)
      const base20 = [
        -1.96, -1.53, -1.22, -0.99, -0.79, -0.62, -0.46, -0.31, -0.16, -0.02,
        0.12, 0.27, 0.42, 0.58, 0.75, 0.94, 1.16, 1.44, 1.81, 2.33,
      ];
      const eval20 = [
        -2.05, -1.48, -1.18, -0.95, -0.74, -0.57, -0.41, -0.26, -0.11, 0.04,
        0.18, 0.33, 0.49, 0.65, 0.83, 1.02, 1.25, 1.54, 1.91, 2.41,
      ];

      const result = ComputeNumericFeaturePSI('SmallSampleFeature', base20, eval20);
      expect(result.InsufficientData).toBe(true);
      expect(result.Severity).toBe('None');
      expect(result.PSI).toBe(0);
    });

    it('should set drifted: false on Warning severity and drifted: true only on Critical severity in PSIDriftDetector.detectDrift', async () => {
      const warnDetector = new PSIDriftDetector(() => ({
        PrebinnedFeatures: {
          ScoreBand: {
            BaselineProportions: [0.40, 0.35, 0.25],
            EvaluationProportions: [0.25, 0.35, 0.40],
            BaselineSampleCount: 500,
            EvaluationSampleCount: 500,
          },
        },
      }));
      const warnResult = await warnDetector.detectDrift({ modelId: 'model-warn' });
      expect(warnResult.score).toBeGreaterThanOrEqual(0.10);
      expect(warnResult.score).toBeLessThan(0.25);
      expect(warnResult.drifted).toBe(false);

      const critDetector = new PSIDriftDetector(() => ({
        PrebinnedFeatures: {
          ScoreBand: {
            BaselineProportions: [0.70, 0.20, 0.10],
            EvaluationProportions: [0.10, 0.20, 0.70],
            BaselineSampleCount: 500,
            EvaluationSampleCount: 500,
          },
        },
      }));
      const critResult = await critDetector.detectDrift({ modelId: 'model-crit' });
      expect(critResult.score).toBeGreaterThanOrEqual(0.25);
      expect(critResult.drifted).toBe(true);
    });
  });

  describe('Baseline quantile binning with outliers (D7)', () => {
    it('should detect Critical drift (PSI > 1.0) when baseline has 999 U(0,1) values plus one outlier at 1000 and evaluation has 1000 U(0,0.1) values', () => {
      const baseline: number[] = [];
      for (let i = 0; i < 999; i++) {
        baseline.push(i / 999);
      }
      baseline.push(1000);

      const evaluation: number[] = [];
      for (let i = 0; i < 1000; i++) {
        evaluation.push((i / 1000) * 0.1);
      }

      const result = ComputeNumericFeaturePSI('OutlierResilientFeature', baseline, evaluation, 10);
      expect(result.InsufficientData).toBe(false);
      expect(result.PSI).toBeGreaterThan(1.0);
      expect(result.Severity).toBe('Critical');
    });
  });

  describe('Missing / NaN surge detection (D8)', () => {
    it('should return Severity: Critical and EvaluationMissingRate: 1 when 200 finite baseline numbers are compared against 200 NaNs', () => {
      const baseline = Array.from({ length: 200 }, (_, i) => i * 0.5);
      const evaluation = Array.from({ length: 200 }, () => Number.NaN);

      const result = ComputeNumericFeaturePSI('UpstreamBrokenFeature', baseline, evaluation);
      expect(result.BaselineMissingRate).toBe(0);
      expect(result.EvaluationMissingRate).toBe(1);
      expect(result.MissingRateDelta).toBe(1);
      expect(result.Severity).toBe('Critical');
      expect(result.PSI).toBeGreaterThanOrEqual(0.25);
    });

    it('should return Severity: Critical and EvaluationMissingRate: 1 when categorical evaluation values are all null', () => {
      const baseline = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 'Gold' : 'Silver'));
      const evaluation = Array.from({ length: 200 }, () => null);

      const result = ComputeCategoricalFeaturePSI('Tier', baseline, evaluation);
      expect(result.BaselineMissingRate).toBe(0);
      expect(result.EvaluationMissingRate).toBe(1);
      expect(result.Severity).toBe('Critical');
    });
  });

  describe('Champion-vs-Challenger timeout accounting and regression score agreement (D11)', () => {
    it('should count TimedOut pairs against AgreementRate denominator and flag ChallengerDiverged: true', () => {
      const pairs = [
        ...Array.from({ length: 5 }, (_, i) => ({
          RecordID: `ok-${i}`,
          ChampionLabel: 'Renew',
          ChallengerLabel: 'Renew',
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          RecordID: `timeout-${i}`,
          ChampionLabel: 'Renew',
          TimedOut: true,
        })),
      ];

      const metrics = ComputeConfidenceAndChallengerDivergence({ Pairs: pairs });
      expect(metrics.PairCount).toBe(10);
      expect(metrics.ChallengerTimeoutCount).toBe(5);
      expect(metrics.ChallengerFailureCount).toBe(5);
      expect(metrics.AgreementRate).toBeCloseTo(0.5, 5);
      expect(metrics.ChallengerDiverged).toBe(true);
    });

    it('should not treat regression pairs (42.1, 98.7) as agreeing under a >= 0.5 binary cut', () => {
      const metrics = ComputeConfidenceAndChallengerDivergence({
        ProblemType: 'regression',
        Pairs: [
          { RecordID: 'r1', ChampionScore: 42.1, ChallengerScore: 98.7 },
          { RecordID: 'r2', ChampionScore: 55.0, ChallengerScore: 120.4 },
        ],
      });
      expect(metrics.AgreementRate).toBe(0);
      expect(metrics.ChallengerDiverged).toBe(true);
    });
  });

  describe('Threshold validation and PrebinnedFeatures sample counts (D12)', () => {
    it('should throw INVALID_PARAMETER when WarningPSIThreshold >= CriticalPSIThreshold or Epsilon is out of range', () => {
      expect(() =>
        EvaluateFeatureAndPredictionDrift({
          WarningPSIThreshold: 0.30,
          CriticalPSIThreshold: 0.20,
        }),
      ).toThrow(/INVALID_PARAMETER/);

      expect(() =>
        EvaluateFeatureAndPredictionDrift({
          WarningPSIThreshold: -0.1,
          CriticalPSIThreshold: 0.25,
        }),
      ).toThrow(/INVALID_PARAMETER/);

      expect(() =>
        EvaluateFeatureAndPredictionDrift({
          Epsilon: 0,
        }),
      ).toThrow(/INVALID_PARAMETER/);
    });

    it('should report explicit BaselineSampleCount and EvaluationSampleCount on PrebinnedFeatures', () => {
      const report = EvaluateFeatureAndPredictionDrift({
        PrebinnedFeatures: {
          DecileHist: {
            BaselineProportions: [0.25, 0.25, 0.25, 0.25],
            EvaluationProportions: [0.25, 0.25, 0.25, 0.25],
            BaselineSampleCount: 1200,
            EvaluationSampleCount: 800,
          },
        },
      });
      expect(report.FeatureResults[0]?.BaselineSampleCount).toBe(1200);
      expect(report.FeatureResults[0]?.EvaluationSampleCount).toBe(800);
      expect(report.FeatureResults[0]?.InsufficientData).toBe(false);
    });
  });

  describe('LoadFeatureAndPredictionDriftFromFeatureValues (D9, R4)', () => {
    it('should load Champion and Challenger rows from MJ: Feature Values via RunView with a ComputedAt >= baselineStart filter and split 28d baseline vs 7d evaluation windows', async () => {
      const nowMs = Date.now();
      const fourteenDaysAgoMs = nowMs - 14 * 86_400_000;
      const twoDaysAgoMs = nowMs - 2 * 86_400_000;

      const rows = [
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `champ-base-${i}`,
          RecordProcessID: 'rp-drift-1',
          ProcessRunID: 'run-base',
          EntityID: 'ent-1',
          RecordID: `rec-${i}`,
          FeatureName: 'ChurnScore',
          Role: 'Champion' as const,
          AIModelID: 'model-1',
          ValueNumeric: (i % 10) / 10,
          ValueText: null,
          Confidence: 0.88,
          Reasoning: null,
          ComputedAt: new Date(fourteenDaysAgoMs + i * 60_000),
        })),
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `champ-eval-${i}`,
          RecordProcessID: 'rp-drift-1',
          ProcessRunID: 'run-eval',
          EntityID: 'ent-1',
          RecordID: `rec-eval-${i}`,
          FeatureName: 'ChurnScore',
          Role: 'Champion' as const,
          AIModelID: 'model-1',
          ValueNumeric: 0.9,
          ValueText: null,
          Confidence: 0.52,
          Reasoning: null,
          ComputedAt: new Date(twoDaysAgoMs + i * 60_000),
        })),
        {
          ID: 'chall-1',
          RecordProcessID: 'rp-drift-1',
          ProcessRunID: 'run-eval',
          EntityID: 'ent-1',
          RecordID: 'rec-eval-0',
          FeatureName: 'ChurnScore',
          Role: 'Challenger' as const,
          AIModelID: 'model-2',
          ValueNumeric: null,
          ValueText: null,
          Confidence: null,
          Reasoning: 'SHADOW_TIMEOUT: exceeded 200ms',
          ComputedAt: new Date(twoDaysAgoMs),
        },
      ];

      let capturedFilter = '';
      const provider = {
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
          capturedFilter = String(params.ExtraFilter ?? '');
          return {
            Success: true,
            Results: rows,
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        },
      } as Pick<IMetadataProvider, 'RunView'> as IMetadataProvider;

      const driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: 'rp-drift-1',
        Provider: provider,
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(capturedFilter).toContain("RecordProcessID = 'rp-drift-1'");
      expect(capturedFilter).toContain("ComputedAt >= '");
      expect(driftInput.NumericFeatures?.['ChurnScore']?.Baseline).toHaveLength(120);
      expect(driftInput.NumericFeatures?.['ChurnScore']?.Evaluation).toHaveLength(120);
      expect(driftInput.ConfidenceAndDivergence?.Pairs).toHaveLength(1);
      expect(driftInput.ConfidenceAndDivergence?.Pairs?.[0]?.TimedOut).toBe(true);

      const report = EvaluateFeatureAndPredictionDrift(driftInput);
      expect(report.OverallSeverity).toBe('Critical');
      expect(report.ShouldAlert).toBe(true);
    });

    it('reports InsufficientData=true and OverallSeverity="None" when all 200 rows fall inside the last 24h evaluation window with an empty baseline window (R4)', async () => {
      const nowMs = Date.now();
      const twelveHoursAgoMs = nowMs - 12 * 3_600_000;

      // All 200 rows are within the last 24 hours: first 100 are 0.1, next 100 are 0.9.
      // Under a naive 50/50 median split this would falsely report Critical drift,
      // whereas under the 28d baseline / 7d evaluation window the baseline window is empty -> InsufficientData=true.
      const rows = Array.from({ length: 200 }, (_, i) => ({
        ID: `champ-recent-${i}`,
        RecordProcessID: 'rp-recent-only',
        ProcessRunID: 'run-recent',
        EntityID: 'ent-1',
        RecordID: `rec-recent-${i}`,
        FeatureName: 'ChurnScore',
        Role: 'Champion' as const,
        AIModelID: 'model-1',
        ValueNumeric: i < 100 ? 0.1 : 0.9,
        ValueText: null,
        Confidence: 0.9,
        Reasoning: null,
        ComputedAt: new Date(twelveHoursAgoMs + i * 1_000),
      }));

      const provider = {
        RunView: async (): Promise<RunViewResult> => ({
          Success: true,
          Results: rows,
          RowCount: rows.length,
          TotalRowCount: rows.length,
          ExecutionTime: 1,
          ErrorMessage: '',
        }),
      } as Pick<IMetadataProvider, 'RunView'> as IMetadataProvider;

      const driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: 'rp-recent-only',
        Provider: provider,
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(driftInput.NumericFeatures?.['ChurnScore']?.Baseline).toHaveLength(0);
      expect(driftInput.NumericFeatures?.['ChurnScore']?.Evaluation).toHaveLength(200);

      const report = EvaluateFeatureAndPredictionDrift(driftInput);
      expect(report.InsufficientData).toBe(true);
      expect(report.OverallSeverity).toBe('None');
      expect(report.ShouldAlert).toBe(false);
    });
  });
});
