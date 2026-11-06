import { describe, expect, it } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import {
  ShadowScoringCoordinator,
  type ChallengerScoreOutput,
  type IChallengerScoreRunner,
  type IRecordProcessChallengerConfig,
  type IShadowScoreAuditSink,
  type IShadowWorkQueuePublisher,
  type ShadowFeatureValueAuditRecord,
  type ShadowScoreEnvelope,
} from '../scoring/shadow-scoring';
import {
  ClassifyPSISeverity,
  ComputeCategoricalFeaturePSI,
  ComputeConfidenceAndChallengerDivergence,
  ComputeNumericFeaturePSI,
  ComputePopulationStabilityIndex,
  EvaluateFeatureAndPredictionDrift,
  PSIDriftDetector,
} from '../maintenance/psi-drift-detector';
import {
  EvaluateFeatureAndPredictionDriftAction,
  type IDriftAlertEmitter,
} from '../actions/evaluate-drift.action';

class TestableEvaluateDriftAction extends EvaluateFeatureAndPredictionDriftAction {
  public async Run(params: RunActionParams) {
    return this.InternalRunAction(params);
  }
}

describe('ShadowScoringCoordinator & PSI Drift Detection (WS-4.4)', () => {
  describe('ShadowScoringCoordinator', () => {
    const baseConfig: IRecordProcessChallengerConfig = {
      Enabled: true,
      SampleRate: 1.0,
      WorkType: 'ML Model',
      ChallengerModelID: 'Model-Challenger-V2',
      MaxLatencyMs: 50,
    };

    it('should sample according to Enabled and SampleRate using the injected RNG', () => {
      let rngValue = 0.25;
      const coordinator = new ShadowScoringCoordinator({
        rng: () => rngValue,
      });

      expect(coordinator.ShouldSample(undefined)).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, Enabled: false })).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0 })).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 1 })).toBe(true);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0.5 })).toBe(true);

      rngValue = 0.75;
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0.5 })).toBe(false);
    });

    it('should publish sampled envelopes to WorkQueue and persist Role="Challenger" audit rows without mutating frozen features', async () => {
      const publishedEnvelopes: ShadowScoreEnvelope[] = [];
      const auditRecords: ShadowFeatureValueAuditRecord[] = [];

      const publisher: IShadowWorkQueuePublisher = {
        PublishShadowItem: async (env) => {
          publishedEnvelopes.push(env);
        },
      };
      const runner: IChallengerScoreRunner = {
        RunChallenger: async (env): Promise<ChallengerScoreOutput> => {
          // Verify frozen features cannot be mutated by challenger
          expect(Object.isFrozen(env.FrozenFeatures)).toBe(true);
          return {
            Score: 0.82,
            Label: 'HighRenewal',
            Confidence: 0.88,
          };
        },
      };
      const sink: IShadowScoreAuditSink = {
        RecordShadowAudit: async (rec) => {
          auditRecords.push(rec);
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        workQueuePublisher: publisher,
        challengerRunner: runner,
        auditSink: sink,
      });

      const originalBusinessEntity = { ID: 'Rec-101', RenewalScore: 0.75, Tier: 'Gold' };
      const envelope: ShadowScoreEnvelope = {
        RecordProcessID: 'RP-001',
        EntityName: 'MJ: Members',
        RecordID: originalBusinessEntity.ID,
        ChampionModelID: 'Model-Champion-V1',
        ChallengerConfig: baseConfig,
        FrozenFeatures: { tenure_months: 24, events_attended: 5 },
        ChampionScore: originalBusinessEntity.RenewalScore,
        ChampionLabel: 'HighRenewal',
        ChampionConfidence: 0.75,
        ChampionLatencyMs: 12,
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(publishedEnvelopes).toHaveLength(1);
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].Role).toBe('Challenger');
      expect(auditRecords[0].ModelID).toBe('Model-Challenger-V2');
      expect(auditRecords[0].NumericValue).toBe(0.82);
      expect(auditRecords[0].TextValue).toBe('HighRenewal');
      expect(auditRecords[0].TimedOut).toBe(false);
      expect(auditRecords[0].FrozenFeatures).toEqual({ tenure_months: 24, events_attended: 5 });
      // Champion business entity record remains untouched
      expect(originalBusinessEntity.RenewalScore).toBe(0.75);

      // Verify executeInProcessWhenPublished: false publishes to WorkQueue without running in-process
      const queueOnlyPublished: ShadowScoreEnvelope[] = [];
      let inProcessRunnerCalls = 0;
      const queueOnlyCoordinator = new ShadowScoringCoordinator({
        workQueuePublisher: {
          PublishShadowItem: async (env) => {
            queueOnlyPublished.push(env);
          },
        },
        challengerRunner: {
          RunChallenger: async () => {
            inProcessRunnerCalls++;
            return { Score: 0.9 };
          },
        },
        executeInProcessWhenPublished: false,
      });

      queueOnlyCoordinator.DispatchShadowScore(envelope);
      await queueOnlyCoordinator.FlushInFlight();
      expect(queueOnlyPublished).toHaveLength(1);
      expect(inProcessRunnerCalls).toBe(0);
    });

    it('should isolate challenger timeout (MaxLatencyMs) and challenger errors so champion never fails', async () => {
      const auditRecords: ShadowFeatureValueAuditRecord[] = [];
      const slowRunner: IChallengerScoreRunner = {
        RunChallenger: async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return { Score: 0.5 };
        },
      };
      const sink: IShadowScoreAuditSink = {
        RecordShadowAudit: async (rec) => {
          auditRecords.push(rec);
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        challengerRunner: slowRunner,
        auditSink: sink,
      });

      const envelope: ShadowScoreEnvelope = {
        RecordID: 'Rec-Timeout-1',
        ChallengerConfig: { ...baseConfig, MaxLatencyMs: 25 },
        FrozenFeatures: { f1: 10 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].Role).toBe('Challenger');
      expect(auditRecords[0].TimedOut).toBe(true);
      expect(auditRecords[0].ErrorMessage).toContain('SHADOW_TIMEOUT');
      expect(auditRecords[0].NumericValue).toBeNull();
    });
  });

  describe('Population Stability Index (PSI) & Drift Math', () => {
    it('should compute PSI = 0 for identical distributions and handle zero-count bins via Laplace smoothing', () => {
      const identical = ComputePopulationStabilityIndex([100, 200, 300, 400], [10, 20, 30, 40]);
      expect(identical).toBeCloseTo(0, 6);
      expect(ClassifyPSISeverity(identical)).toBe('None');

      // Zero-count bin in evaluation distribution does not produce NaN or Infinity
      const withZeroBin = ComputePopulationStabilityIndex([0.25, 0.25, 0.25, 0.25], [0.50, 0.50, 0, 0]);
      expect(Number.isFinite(withZeroBin)).toBe(true);
      expect(withZeroBin).toBeGreaterThan(0.25);
      expect(ClassifyPSISeverity(withZeroBin)).toBe('Critical');
    });

    it('should classify Warning (0.10 <= PSI < 0.25) and Critical (PSI >= 0.25) shifts accurately', () => {
      // Moderate shift: [0.40, 0.30, 0.20, 0.10] -> [0.25, 0.30, 0.25, 0.20]
      // PSI = (0.25-0.40)*ln(0.25/0.40) + 0 + (0.25-0.20)*ln(0.25/0.20) + (0.20-0.10)*ln(0.20/0.10)
      //     = (-0.15)*(-0.4700) + 0.05*(0.2231) + 0.10*(0.6931) = 0.0705 + 0.01115 + 0.06931 = 0.1510
      const moderatePsi = ComputePopulationStabilityIndex(
        [0.40, 0.30, 0.20, 0.10],
        [0.25, 0.30, 0.25, 0.20],
      );
      expect(moderatePsi).toBeGreaterThanOrEqual(0.10);
      expect(moderatePsi).toBeLessThan(0.25);
      expect(ClassifyPSISeverity(moderatePsi)).toBe('Warning');

      // Numeric feature shift test
      const baseNumeric = [10, 12, 15, 18, 20, 22, 25, 28, 30, 35, 38, 40];
      const driftedNumeric = [35, 36, 37, 38, 39, 40, 42, 45, 50, 55, 60, 65];
      const numResult = ComputeNumericFeaturePSI('annual_spend', baseNumeric, driftedNumeric, 4);
      expect(numResult.PSI).toBeGreaterThanOrEqual(0.25);
      expect(numResult.Severity).toBe('Critical');

      // Categorical feature shift test
      const baseCat = ['Gold', 'Gold', 'Silver', 'Silver', 'Bronze'];
      const evalCat = ['Bronze', 'Bronze', 'Bronze', 'Bronze', 'Gold'];
      const catResult = ComputeCategoricalFeaturePSI('tier', baseCat, evalCat);
      expect(catResult.PSI).toBeGreaterThanOrEqual(0.25);
      expect(catResult.Severity).toBe('Critical');
    });

    it('should detect confidence-floor degradation and champion-vs-challenger divergence', () => {
      const metrics = ComputeConfidenceAndChallengerDivergence({
        BaselineConfidences: [0.85, 0.88, 0.90, 0.82],
        EvaluationConfidences: [0.52, 0.55, 0.48, 0.75],
        ConfidenceFloor: 0.60,
        MaxBelowFloorRate: 0.20,
        Pairs: [
          { ChampionScore: 0.80, ChallengerScore: 0.35, ChampionLabel: 'Renew', ChallengerLabel: 'Churn', ChampionLatencyMs: 20, ChallengerLatencyMs: 80 },
          { ChampionScore: 0.75, ChallengerScore: 0.40, ChampionLabel: 'Renew', ChallengerLabel: 'Churn', ChampionLatencyMs: 25, ChallengerLatencyMs: 90 },
          { ChampionScore: 0.20, ChallengerScore: 0.22, ChampionLabel: 'Churn', ChallengerLabel: 'Churn', ChampionLatencyMs: 20, ChallengerLatencyMs: 75 },
        ],
        MinAgreementRate: 0.85,
        MaxMeanAbsoluteScoreDelta: 0.15,
        MaxP95LatencyRatio: 3.0,
      });

      expect(metrics.ConfidenceDegraded).toBe(true);
      expect(metrics.BelowFloorRate).toBeCloseTo(0.75, 4);
      expect(metrics.AgreementRate).toBeCloseTo(1 / 3, 4);
      expect(metrics.ChallengerDiverged).toBe(true);
    });

    it('should integrate with PSIDriftDetector for MaintenanceEngine', async () => {
      const detector = new PSIDriftDetector(async (modelId) => ({
        ModelID: modelId,
        PrebinnedFeatures: {
          engagement_score: {
            BaselineProportions: [0.5, 0.3, 0.2],
            EvaluationProportions: [0.1, 0.2, 0.7],
          },
        },
      }));

      const res = await detector.detectDrift({ modelId: 'Model-123' });
      expect(res.drifted).toBe(true);
      expect(res.score).toBeGreaterThan(0.25);
      expect(res.detail).toContain('OverallSeverity=Critical');
    });
  });

  describe('EvaluateFeatureAndPredictionDriftAction', () => {
    it('should evaluate drift, populate output parameters, and invoke IDriftAlertEmitter when ShouldAlert is true', async () => {
      const action = new TestableEvaluateDriftAction();
      let emittedReportSummary = '';

      const emitter: IDriftAlertEmitter = {
        EmitDriftAlert: async (report) => {
          emittedReportSummary = report.Summary;
          return { AlertID: 'Alert-Req-999', Emitted: true };
        },
      };
      action.SetAlertEmitter(emitter);

      const actionParams: ActionParam[] = [
        { Name: 'ModelID', Type: 'Input', Value: 'Model-Prod-1' },
        { Name: 'RecordProcessID', Type: 'Input', Value: 'RP-Prod-1' },
        {
          Name: 'PrebinnedFeatures',
          Type: 'Input',
          Value: {
            login_frequency: {
              BaselineProportions: [0.45, 0.35, 0.20],
              EvaluationProportions: [0.10, 0.25, 0.65],
            },
          },
        },
      ];

      const runParams: RunActionParams = {
        Action: {} as RunActionParams['Action'],
        ContextUser: {} as RunActionParams['ContextUser'],
        Filters: [],
        Params: actionParams,
      };

      const result = await action.Run(runParams);
      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(emittedReportSummary).toContain('OverallSeverity=Critical');

      const findOut = (name: string) => actionParams.find((p) => p.Name === name)?.Value;
      expect(findOut('OverallSeverity')).toBe('Critical');
      expect(findOut('ShouldAlert')).toBe(true);
      expect(findOut('AlertEmitted')).toBe(true);
      expect(findOut('AlertID')).toBe('Alert-Req-999');
    });
  });
});
