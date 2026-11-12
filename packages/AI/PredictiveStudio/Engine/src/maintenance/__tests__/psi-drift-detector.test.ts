import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import {
  ClassifyPSISeverity,
  ComputeCategoricalFeaturePSI,
  ComputeConfidenceAndChallengerDivergence,
  ComputeNumericFeaturePSI,
  ComputePopulationStabilityIndex,
  DEFAULT_DRIFT_MAX_ROWS,
  DRIFT_SWEEP_BATCH_SIZE,
  EvaluateFeatureAndPredictionDrift,
  LoadFeatureAndPredictionDriftForRecordProcesses,
  LoadFeatureAndPredictionDriftFromFeatureValues,
  PSIDriftDetector,
} from '../psi-drift-detector';
import { RunFeatureValueView, type FeatureValueDoubleRow } from '../../__tests__/feature-value-view-double';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/** A provider whose batched reads answer from `rows` as the database would; records every view it was asked for. */
function featureValueProvider(rows: readonly FeatureValueDoubleRow[], views: RunViewParams[] = []): IMetadataProvider {
  return {
    RunView: async (v: RunViewParams): Promise<RunViewResult> => {
      views.push(v);
      return RunFeatureValueView(rows, v);
    },
    RunViews: async (batch: RunViewParams[]): Promise<RunViewResult[]> => {
      views.push(...batch);
      return batch.map((v) => RunFeatureValueView(rows, v));
    },
  } as Partial<IMetadataProvider> as IMetadataProvider;
}

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

      const metrics = ComputeConfidenceAndChallengerDivergence({ Pairs: pairs, MinSampleSize: 10 });
      expect(metrics.PairCount).toBe(10);
      expect(metrics.ChallengerTimeoutCount).toBe(5);
      expect(metrics.ChallengerFailureCount).toBe(5);
      expect(metrics.AgreementRate).toBeCloseTo(0.5, 5);
      expect(metrics.ChallengerDiverged).toBe(true);
    });

    it('should not treat regression pairs (42.1, 98.7) as agreeing under a >= 0.5 binary cut', () => {
      const metrics = ComputeConfidenceAndChallengerDivergence({
        ProblemType: 'regression',
        MinSampleSize: 2,
        Pairs: [
          { RecordID: 'r1', ChampionScore: 42.1, ChallengerScore: 98.7 },
          { RecordID: 'r2', ChampionScore: 55.0, ChallengerScore: 120.4 },
        ],
      });
      expect(metrics.AgreementRate).toBe(0);
      expect(metrics.ChallengerDiverged).toBe(true);
    });

    it('counts only pairs with both sides toward MinSampleSize: 100 challenger rows with 3 paired are InsufficientData (P3)', () => {
      const pairs = [
        ...Array.from({ length: 3 }, (_, i) => ({ RecordID: `paired-${i}`, ChampionLabel: 'Approve', ChallengerLabel: 'Reject' })),
        // Challenger rows whose champion was not found
        ...Array.from({ length: 97 }, (_, i) => ({ RecordID: `orphan-${i}`, ChallengerLabel: 'Reject' })),
      ];

      const metrics = ComputeConfidenceAndChallengerDivergence({ Pairs: pairs, MinSampleSize: 100 });
      expect(metrics.PairCount).toBe(3);
      expect(metrics.DivergenceInsufficientData).toBe(true);
      expect(metrics.ChallengerDiverged).toBe(false);
      expect(EvaluateFeatureAndPredictionDrift({ ConfidenceAndDivergence: { Pairs: pairs }, MinSampleSize: 100 }).Summary).toContain(
        'DivergenceInsufficientData=true (PairCount=3/100)',
      );
    });

    it('leaves challenger timeouts and errors with no champion out of the agreement rate and the failure counts, as out of the sample size', () => {
      const pairs = [
        ...Array.from({ length: 100 }, (_, i) => ({ RecordID: `paired-${i}`, ChampionLabel: 'Approve', ChallengerLabel: 'Approve' })),
        // Challenger rows whose champion was not found: they compare against nothing.
        ...Array.from({ length: 30 }, (_, i) => ({ RecordID: `orphan-timeout-${i}`, TimedOut: true, ChallengerLatencyMs: 9000 })),
        ...Array.from({ length: 30 }, (_, i) => ({ RecordID: `orphan-error-${i}`, ErrorMessage: 'SHADOW_ERROR: boom' })),
      ];

      const metrics = ComputeConfidenceAndChallengerDivergence({ Pairs: pairs, MinSampleSize: 100 });
      expect(metrics.PairCount).toBe(100);
      expect(metrics.AgreementRate).toBe(1);
      expect(metrics.ChallengerTimeoutCount).toBe(0);
      expect(metrics.ChallengerFailureCount).toBe(0);
      expect(metrics.ChallengerDiverged).toBe(false);
    });

    it('should report DivergenceInsufficientData: true and suppress ChallengerDiverged when pair count is below MinSampleSize (S4)', () => {
      // 10 disagreeing pairs with default MinSampleSize (100)
      const pairs = Array.from({ length: 10 }, (_, i) => ({
        RecordID: `r-${i}`,
        ChampionLabel: 'Approve',
        ChallengerLabel: 'Reject',
      }));

      const metrics = ComputeConfidenceAndChallengerDivergence({ Pairs: pairs });
      expect(metrics.PairCount).toBe(10);
      expect(metrics.AgreementRate).toBe(0);
      expect(metrics.DivergenceInsufficientData).toBe(true);
      expect(metrics.ChallengerDiverged).toBe(false);

      // In EvaluateFeatureAndPredictionDrift, divergence alone below MinSampleSize does not alert
      const report = EvaluateFeatureAndPredictionDrift({
        ConfidenceAndDivergence: { Pairs: pairs },
      });
      expect(report.DivergenceMetrics.DivergenceInsufficientData).toBe(true);
      expect(report.OverallSeverity).toBe('None');
      expect(report.ShouldAlert).toBe(false);
      expect(report.InsufficientData).toBe(true);
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

      const views: RunViewParams[] = [];
      const driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: 'rp-drift-1',
        Provider: featureValueProvider(rows, views),
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(views).toHaveLength(2);
      for (const v of views) {
        expect(v.ExtraFilter).toContain("RecordProcessID = 'rp-drift-1'");
        expect(v.ExtraFilter).toContain("ComputedAt >= '");
      }
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

      const provider = featureValueProvider(rows);

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

    it('filters rows to Source=Pipeline, ignoring human override and imported rows (S6a)', async () => {
      const nowMs = Date.now();
      const rows = [
        // 120 baseline pipeline rows
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `champ-b-${i}`,
          RecordProcessID: 'rp-src',
          RecordID: `rec-b-${i}`,
          FeatureName: 'Score',
          Role: 'Champion' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: 0.2,
          ComputedAt: new Date(nowMs - 20 * 86_400_000 + i * 1000),
        })),
        // 120 evaluation pipeline rows
        ...Array.from({ length: 120 }, (_, i) => ({
          ID: `champ-e-${i}`,
          RecordProcessID: 'rp-src',
          RecordID: `rec-e-${i}`,
          FeatureName: 'Score',
          Role: 'Champion' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: 0.8,
          ComputedAt: new Date(nowMs - 3 * 86_400_000 + i * 1000),
        })),
        // Human override rows that should be excluded
        ...Array.from({ length: 50 }, (_, i) => ({
          ID: `champ-h-${i}`,
          RecordProcessID: 'rp-src',
          RecordID: `rec-h-${i}`,
          FeatureName: 'Score',
          Role: 'Champion' as const,
          Source: 'Human' as const,
          ValueNumeric: 0.99,
          ComputedAt: new Date(nowMs - 2 * 86_400_000 + i * 1000),
        })),
      ];

      const views: RunViewParams[] = [];
      const driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: 'rp-src',
        Provider: featureValueProvider(rows, views),
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(views.map((v) => v.ExtraFilter)).toEqual([
        expect.stringContaining("Source = 'Pipeline'"),
        expect.stringContaining("Source = 'Pipeline'"),
      ]);
      // Human rows are ignored by buildDriftInputFromRows as well
      expect(driftInput.NumericFeatures?.['Score']?.Evaluation).toHaveLength(120);
    });

    it('only pairs challenger rows computed in the evaluation window (S6b)', async () => {
      const nowMs = Date.now();
      const rows = [
        // Champion in evaluation window
        {
          ID: 'champ-eval-1',
          RecordProcessID: 'rp-win',
          RecordID: 'rec-1',
          FeatureName: 'Prediction',
          Role: 'Champion' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: 0.5,
          ComputedAt: new Date(nowMs - 2 * 86_400_000),
        },
        // Challenger computed 25 days ago (in baseline window, outside evaluation window) -> should NOT pair
        {
          ID: 'chall-old',
          RecordProcessID: 'rp-win',
          RecordID: 'rec-1',
          FeatureName: 'Prediction',
          Role: 'Challenger' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: 0.9,
          ComputedAt: new Date(nowMs - 25 * 86_400_000),
        },
        // Challenger computed 2 days ago (in evaluation window) -> SHOULD pair
        {
          ID: 'chall-recent',
          RecordProcessID: 'rp-win',
          RecordID: 'rec-1',
          FeatureName: 'Prediction',
          Role: 'Challenger' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: 0.55,
          ComputedAt: new Date(nowMs - 2 * 86_400_000),
        },
      ];

      const provider = featureValueProvider(rows);

      const driftInput = await LoadFeatureAndPredictionDriftFromFeatureValues({
        RecordProcessID: 'rp-win',
        Provider: provider,
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(driftInput.ConfidenceAndDivergence?.Pairs).toHaveLength(1);
      expect(driftInput.ConfidenceAndDivergence?.Pairs?.[0]?.ChallengerScore).toBe(0.55);
    });

    it('filters by MLModelID when ModelID is provided (S8)', async () => {
      const views: RunViewParams[] = [];
      await LoadFeatureAndPredictionDriftFromFeatureValues({
        ModelID: 'model-ml-target-uuid',
        Provider: featureValueProvider([], views),
        ContextUser: { ID: 'user-1' } as UserInfo,
      });

      expect(views).toHaveLength(2);
      for (const v of views) {
        expect(v.ExtraFilter).toContain("MLModelID = 'model-ml-target-uuid'");
        expect(v.ExtraFilter).not.toContain("AIModelID = 'model-ml-target-uuid'");
      }
    });

    it('chunks record process sweep into batches of DRIFT_SWEEP_BATCH_SIZE (10), two windowed views per process, and flags truncation past MaxRows (S9)', async () => {
      const nowMs = Date.now();
      const champion = (rp: string, i: number, computedAt: number) => ({
        ID: `${rp}-${i}`,
        RecordProcessID: rp,
        RecordID: `rec-${i}`,
        FeatureName: 'Score',
        Role: 'Champion' as const,
        Source: 'Pipeline' as const,
        ValueNumeric: 0.5,
        ComputedAt: new Date(computedAt),
      });
      const rows = [
        ...Array.from({ length: 24 }, (_, p) => champion(`rp-${p}`, 0, nowMs - 2 * 86_400_000)),
        // 60 evaluation-window rows: over MaxRows (50)
        ...Array.from({ length: 60 }, (_, i) => champion('rp-trunc', i, nowMs - 2 * 86_400_000 + i * 1000)),
      ];
      const batchSizes: number[] = [];
      const fakeProvider = {
        RunViews: async (views: RunViewParams[]): Promise<RunViewResult[]> => {
          batchSizes.push(views.length);
          return views.map((v) => RunFeatureValueView(rows, v));
        },
      } as Partial<IMetadataProvider> as IMetadataProvider;

      // 25 processes -> batches of 10, 10, 5 processes (20, 20, 10 views)
      const processIds = [...Array.from({ length: 24 }, (_, i) => `rp-${i}`), 'rp-trunc'];

      const errors = ConsoleCapture.Errors();
      const loads = await LoadFeatureAndPredictionDriftForRecordProcesses(processIds, {
        Provider: fakeProvider,
        ContextUser: { ID: 'user-1' } as UserInfo,
        MaxRows: 50,
      });

      expect(ConsoleCapture.Lines(errors)).toEqual([
        "Drift evaluation for 'rp-trunc' was truncated at MaxRows (50) per window: the oldest rows of a full window were not read.",
      ]);
      expect(loads).toHaveLength(25);
      expect(batchSizes).toEqual([20, 20, 10]);
      expect(loads.filter((l) => l.Input?.Truncated === true).map((l) => l.RecordProcessID)).toEqual(['rp-trunc']);

      const truncLoad = loads.find((l) => l.RecordProcessID === 'rp-trunc');
      expect(truncLoad?.Input?.NumericFeatures?.['Score']?.Evaluation).toHaveLength(50);
      const report = EvaluateFeatureAndPredictionDrift(truncLoad!.Input!);
      expect(report.Truncated).toBe(true);
      expect(report.Summary).toContain('Truncated=true');
    });

    describe("ProblemType from the champion's ML model (M3)", () => {
      const nowMs = Date.now();
      /** A champion at 0.45 and a challenger at 0.55 for each of `count` records of one process and model. */
      function pairedRows(recordProcessID: string, mlModelID: string | null, count: number) {
        return Array.from({ length: count }, (_, i) => [
          {
            ID: `${recordProcessID}-champ-${i}`, RecordProcessID: recordProcessID, RecordID: `rec-${i}`, FeatureName: 'Score',
            Role: 'Champion' as const, Source: 'Pipeline' as const, MLModelID: mlModelID, ValueNumeric: 0.45,
            ComputedAt: new Date(nowMs - 2 * 86_400_000 + i * 1000),
          },
          {
            ID: `${recordProcessID}-chall-${i}`, RecordProcessID: recordProcessID, RecordID: `rec-${i}`, FeatureName: 'Score',
            Role: 'Challenger' as const, Source: 'Pipeline' as const, MLModelID: 'model-challenger', ValueNumeric: 0.55,
            ComputedAt: new Date(nowMs - 2 * 86_400_000 + i * 1000 + 500),
          },
        ]).flat();
      }
      /** Feature Value reads answered from `rows`; `MJ: ML Models` reads answered from `models` (IDs matched case-insensitively). */
      function routedProvider(
        rows: FeatureValueDoubleRow[],
        models: Array<{ ID: string; ProblemType: 'classification' | 'regression' }>,
        modelReads: Array<{ View: RunViewParams; User?: UserInfo }>,
      ): IMetadataProvider {
        const one = (v: RunViewParams, user?: UserInfo): RunViewResult => {
          if (v.EntityName !== 'MJ: ML Models') {
            return RunFeatureValueView(rows, v);
          }
          modelReads.push({ View: v, User: user });
          const filter = String(v.ExtraFilter ?? '').toLowerCase();
          const results = models.filter((m) => filter.includes(`'${m.ID.toLowerCase()}'`));
          return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 1, ErrorMessage: '' };
        };
        return {
          RunView: async (v: RunViewParams, user?: UserInfo) => one(v, user),
          RunViews: async (views: RunViewParams[], user?: UserInfo) => views.map((v) => one(v, user)),
        } as Partial<IMetadataProvider> as IMetadataProvider;
      }
      const caller = { ID: 'user-m3' } as UserInfo;

      it("reads the champion model's ProblemType as the caller, so a regression model's close scores agree", async () => {
        const modelReads: Array<{ View: RunViewParams; User?: UserInfo }> = [];
        const input = await LoadFeatureAndPredictionDriftFromFeatureValues({
          RecordProcessID: 'rp-reg',
          Provider: routedProvider(pairedRows('rp-reg', 'model-reg', 20), [{ ID: 'MODEL-REG', ProblemType: 'regression' }], modelReads),
          ContextUser: caller,
          MinSampleSize: 10,
        });

        expect(modelReads).toHaveLength(1);
        expect(modelReads[0].User).toBe(caller);
        expect(input.ConfidenceAndDivergence?.ProblemType).toBe('regression');
        // Under the classification cut 0.45 vs 0.55 disagree; within the regression tolerance they agree.
        const metrics = ComputeConfidenceAndChallengerDivergence(input.ConfidenceAndDivergence);
        expect(metrics.AgreementRate).toBe(1);
        expect(metrics.ChallengerDiverged).toBe(false);
      });

      it('gives each ML process of a sweep its own ProblemType from one ML Models read, and leaves non-ML processes unset', async () => {
        const rows = [
          ...pairedRows('rp-cls', 'model-cls', 5),
          ...pairedRows('rp-reg', 'model-reg', 5),
          ...pairedRows('rp-infer', null, 5),
        ];
        const modelReads: Array<{ View: RunViewParams; User?: UserInfo }> = [];
        const loads = await LoadFeatureAndPredictionDriftForRecordProcesses(['rp-cls', 'rp-reg', 'rp-infer'], {
          Provider: routedProvider(
            rows,
            [
              { ID: 'model-cls', ProblemType: 'classification' },
              { ID: 'model-reg', ProblemType: 'regression' },
            ],
            modelReads,
          ),
          ContextUser: caller,
        });

        expect(modelReads).toHaveLength(1);
        expect(modelReads[0].View.ExtraFilter).toBe("ID IN ('model-cls', 'model-reg')");
        expect(loads.map((l) => [l.RecordProcessID, l.Input?.ConfidenceAndDivergence?.ProblemType])).toEqual([
          ['rp-cls', 'classification'],
          ['rp-reg', 'regression'],
          ['rp-infer', undefined],
        ]);
      });
    });

    describe('Pairing challengers with champions older than the windows (stable champions)', () => {
      const nowMs = Date.now();
      /**
       * `count` records of one process whose champion was last changed 60 days ago (before both windows; an unchanged
       * champion is not rewritten) and was shadowed by a challenger 2 days ago.
       */
      function stableRows(recordProcessID: string, count: number): FeatureValueDoubleRow[] {
        return Array.from({ length: count }, (_, i) => [
          {
            ID: `${recordProcessID}-champ-${i}`, RecordProcessID: recordProcessID, RecordID: `${recordProcessID}-rec-${i}`,
            FeatureName: 'Score', Role: 'Champion', Source: 'Pipeline', MLModelID: 'model-stable', ValueNumeric: 0.45,
            Confidence: 0.9, ComputedAt: new Date(nowMs - 60 * 86_400_000 + i * 1000),
          },
          {
            ID: `${recordProcessID}-chall-${i}`, RecordProcessID: recordProcessID, RecordID: `${recordProcessID}-rec-${i}`,
            FeatureName: 'Score', Role: 'Challenger', Source: 'Pipeline', MLModelID: 'model-challenger', ValueNumeric: 0.47,
            ComputedAt: new Date(nowMs - 2 * 86_400_000 + i * 1000),
          },
        ]).flat();
      }
      /** Feature Value reads from `rows`, ML Models reads from one regression model; records each batch's views. */
      function provider(rows: FeatureValueDoubleRow[], batches: RunViewParams[][]): IMetadataProvider {
        const one = (v: RunViewParams): RunViewResult => {
          if (v.EntityName === 'MJ: ML Models') {
            const results = String(v.ExtraFilter).includes("'model-stable'") ? [{ ID: 'model-stable', ProblemType: 'regression' }] : [];
            return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 1, ErrorMessage: '' };
          }
          return RunFeatureValueView(rows, v);
        };
        return {
          RunView: async (v: RunViewParams) => one(v),
          RunViews: async (views: RunViewParams[]) => {
            batches.push(views);
            return views.map(one);
          },
        } as Partial<IMetadataProvider> as IMetadataProvider;
      }

      it('pairs every recent challenger with its 60-day-old champion, leaving the PSI windows unchanged', async () => {
        const batches: RunViewParams[][] = [];
        const input = await LoadFeatureAndPredictionDriftFromFeatureValues({
          RecordProcessID: 'rp-stable',
          Provider: provider(stableRows('rp-stable', 120), batches),
          ContextUser: { ID: 'user-1' } as UserInfo,
        });

        // Every challenger is paired, so divergence has its sample.
        const report = EvaluateFeatureAndPredictionDrift(input);
        expect(report.DivergenceMetrics.DivergenceInsufficientData).toBe(false);
        expect(report.InsufficientData).toBe(false);
        expect(report.DivergenceMetrics.PairCount).toBe(120);
        expect(report.DivergenceMetrics.AgreementRate).toBe(1);

        // The old champions pair challengers only: no window holds them.
        expect(input.NumericFeatures).toBeUndefined();
        expect(input.ConfidenceAndDivergence?.BaselineConfidences).toEqual([]);
        const pairs = input.ConfidenceAndDivergence?.Pairs ?? [];
        expect(pairs).toHaveLength(120);
        expect(pairs.every((p) => p.ChampionScore === 0.45 && p.ChallengerScore === 0.47)).toBe(true);
        // Their model gives the ProblemType too.
        expect(input.ConfidenceAndDivergence?.ProblemType).toBe('regression');

        // Windows in one batch, then one batched pairing read as the caller, never a read per record.
        expect(batches.map((b) => b.length)).toEqual([2, 1]);
        expect(batches[1][0].ExtraFilter).toMatch(
          /^RecordProcessID = 'rp-stable' AND Role = 'Champion' AND Source = 'Pipeline' AND FeatureName = 'Score' AND RecordID IN \('rp-stable-rec-0', /,
        );
      });

      it('reads the pairing champions of a whole sweep chunk in one batch, splitting a long RecordID list', async () => {
        const batches: RunViewParams[][] = [];
        const loads = await LoadFeatureAndPredictionDriftForRecordProcesses(['rp-big', 'rp-small'], {
          Provider: provider([...stableRows('rp-big', 1200), ...stableRows('rp-small', 10)], batches),
          ContextUser: { ID: 'user-1' } as UserInfo,
        });

        // Four window views, then one pairing batch: rp-big's 1200 RecordIDs as 500 + 500 + 200, rp-small's 10.
        expect(batches.map((b) => b.length)).toEqual([4, 4]);
        expect(batches[1].map((v) => (String(v.ExtraFilter).match(/'rp-(?:big|small)-rec-\d+'/g) ?? []).length)).toEqual([500, 500, 200, 10]);
        expect(loads.map((l) => l.Input?.ConfidenceAndDivergence?.Pairs?.filter((p) => p.ChampionScore === 0.45).length)).toEqual([1200, 10]);
      });
    });

    describe('MaxRows caps each window separately (P2)', () => {
      const nowMs = Date.now();
      /** `baseline` rows 14-20 days ago at 0.1 and `evaluation` rows in the last 3 days at 0.9, one minute apart. */
      function windowRows(baseline: number, evaluation: number) {
        const row = (id: string, value: number, computedAt: number) => ({
          ID: id,
          RecordProcessID: 'rp-capped',
          RecordID: id,
          FeatureName: 'Score',
          Role: 'Champion' as const,
          Source: 'Pipeline' as const,
          ValueNumeric: value,
          Confidence: 0.9,
          ComputedAt: new Date(computedAt),
        });
        return [
          ...Array.from({ length: baseline }, (_, i) => row(`b-${i}`, 0.1, nowMs - 20 * 86_400_000 + i * 60_000)),
          ...Array.from({ length: evaluation }, (_, i) => row(`e-${i}`, 0.9, nowMs - 3 * 86_400_000 + i * 60_000)),
        ];
      }

      it('keeps the newest MaxRows rows of each window, so a capped process still has an evaluation window', async () => {
        const rows = windowRows(80, 80);
        const errors = ConsoleCapture.Errors();
        const input = await LoadFeatureAndPredictionDriftFromFeatureValues({
          RecordProcessID: 'rp-capped',
          Provider: featureValueProvider(rows),
          ContextUser: { ID: 'user-1' } as UserInfo,
          MaxRows: 50,
          MinSampleSize: 10,
        });

        expect(ConsoleCapture.Lines(errors)).toEqual([
          "Drift evaluation for 'rp-capped' was truncated at MaxRows (50) per window: the oldest rows of a full window were not read.",
        ]);
        expect(input.Truncated).toBe(true);
        expect(input.NumericFeatures?.['Score']?.Baseline).toHaveLength(50);
        expect(input.NumericFeatures?.['Score']?.Evaluation).toHaveLength(50);
        const report = EvaluateFeatureAndPredictionDrift(input);
        expect(report.InsufficientData).toBe(false);
        expect(report.OverallSeverity).toBe('Critical');
      });

      it('does not report truncation when a window holds exactly MaxRows rows', async () => {
        for (const [baseline, evaluation] of [[25, 25], [50, 50], [50, 0]] as const) {
          const input = await LoadFeatureAndPredictionDriftFromFeatureValues({
            RecordProcessID: 'rp-capped',
            Provider: featureValueProvider(windowRows(baseline, evaluation)),
            ContextUser: { ID: 'user-1' } as UserInfo,
            MaxRows: 50,
          });
          expect(input.Truncated, `${baseline} baseline + ${evaluation} evaluation rows`).toBe(false);
          expect(input.NumericFeatures?.['Score']?.Baseline).toHaveLength(baseline);
          expect(input.NumericFeatures?.['Score']?.Evaluation ?? []).toHaveLength(evaluation);
        }
      });

      it('reads the evaluation window from its own start, so rows in a gap after the baseline never count toward its cap', async () => {
        const at = (daysAgo: number, i: number) => nowMs - daysAgo * 86_400_000 + i * 60_000;
        const row = (id: string, value: number, computedAt: number) => ({
          ID: id, RecordProcessID: 'rp-capped', RecordID: id, FeatureName: 'Score', Role: 'Champion' as const,
          Source: 'Pipeline' as const, ValueNumeric: value, Confidence: 0.9, ComputedAt: new Date(computedAt),
        });
        // Baseline ends 10 days ago, evaluation starts 3 days ago: the 60 rows 5-6 days ago are in neither window.
        const rows = [
          ...Array.from({ length: 20 }, (_, i) => row(`b-${i}`, 0.1, at(15, i))),
          ...Array.from({ length: 60 }, (_, i) => row(`gap-${i}`, 0.5, at(6, i))),
          ...Array.from({ length: 20 }, (_, i) => row(`e-${i}`, 0.9, at(2, i))),
        ];
        const views: RunViewParams[] = [];
        const input = await LoadFeatureAndPredictionDriftFromFeatureValues({
          RecordProcessID: 'rp-capped',
          BaselineWindowEnd: new Date(nowMs - 10 * 86_400_000).toISOString(),
          EvaluationWindowStart: new Date(nowMs - 3 * 86_400_000).toISOString(),
          Provider: featureValueProvider(rows, views),
          ContextUser: { ID: 'user-1' } as UserInfo,
          MaxRows: 50,
        });

        expect(input.Truncated).toBe(false);
        expect(input.NumericFeatures?.['Score']?.Evaluation).toHaveLength(20);
        expect(views[1].ExtraFilter).toContain(`ComputedAt >= '${new Date(nowMs - 3 * 86_400_000).toISOString()}'`);
      });

      it('rejects a MaxRows that is not a positive whole number', async () => {
        for (const maxRows of [0, -5, 2.5]) {
          await expect(
            LoadFeatureAndPredictionDriftFromFeatureValues({
              RecordProcessID: 'rp-capped',
              Provider: featureValueProvider([]),
              MaxRows: maxRows,
            }),
          ).rejects.toThrow(/^INVALID_PARAMETER: MaxRows/);
          await expect(
            LoadFeatureAndPredictionDriftForRecordProcesses([], { Provider: featureValueProvider([]), MaxRows: maxRows }),
          ).rejects.toThrow(/^INVALID_PARAMETER: MaxRows/);
        }
      });
    });

    it('compares classification labels for agreement when both champion and challenger have labels (M3)', () => {
      const metrics = ComputeConfidenceAndChallengerDivergence({
        ProblemType: 'classification',
        MinSampleSize: 2,
        Pairs: [
          {
            RecordID: 'r1',
            ChampionScore: 0.9,
            ChampionLabel: 'Approve',
            ChallengerScore: 0.8,
            ChallengerLabel: 'Approve',
          },
          {
            RecordID: 'r2',
            ChampionScore: 0.9,
            ChampionLabel: 'Approve',
            ChallengerScore: 0.85,
            ChallengerLabel: 'Reject',
          },
        ],
      });

      expect(metrics.AgreementRate).toBeCloseTo(0.5, 5);
      expect(metrics.ChallengerDiverged).toBe(true);
    });
  });
});
