import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { InMemoryArtifactLoader } from '../artifact-loader';
import {
  FeatureValueShadowAuditSink,
  MLModelChallengerScoreRunner,
  ShadowScoringCoordinator,
  type ChallengerScoreOutput,
  type IChallengerScoreRunner,
  type IRecordProcessChallengerConfig,
  type IShadowScoreAuditSink,
  type IShadowWorkQueuePublisher,
  type ShadowFeatureValueAuditRecord,
  type ShadowScoreEnvelope,
} from '../shadow-scoring';
import type { MLInferenceDeps } from '../types';

class SavedFeatureValueDouble {
  public EntityID = '';
  public RecordID = '';
  public FeatureName = '';
  public Role: 'Champion' | 'Challenger' = 'Champion';
  public Source: 'Pipeline' | 'Human' | 'Imported' = 'Pipeline';
  public ValueKeyHash: string | null = 'non-null-default';
  public RecordProcessID: string | null = null;
  public ProcessRunID: string | null = null;
  public AIModelID: string | null = null;
  public PromptID: string | null = null;
  public ValueNumeric: number | null = null;
  public ValueText: string | null = null;
  public Confidence: number | null = null;
  public Reasoning: string | null = null;
  public ComputedAt: Date = new Date(0);
  public NewRecordCalled = false;
  public SaveCalled = false;
  public LatestResult: { CompleteMessage: string } | null = null;

  public NewRecord(): boolean {
    this.NewRecordCalled = true;
    return true;
  }

  public async Save(): Promise<boolean> {
    this.SaveCalled = true;
    return true;
  }
}

describe('ShadowScoringCoordinator', () => {
  const baseConfig: IRecordProcessChallengerConfig = {
    Enabled: true,
    SampleRate: 1.0,
    WorkType: 'ML Model',
    ChallengerModelID: 'Model-Challenger-V2',
    MaxLatencyMs: 50,
  };

  describe('ShouldSample', () => {
    it('should sample according to Enabled, SampleRate, and Challenger target using the injected Rng (D12, D14)', () => {
      let rngValue = 0.25;
      const coordinator = new ShadowScoringCoordinator({
        Rng: () => rngValue,
      });

      expect(coordinator.ShouldSample(undefined)).toBe(false);
      expect(coordinator.ShouldSample(null)).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, Enabled: false })).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0 })).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: -0.5 })).toBe(false);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: Number.NaN })).toBe(false);
      // D12: non-number SampleRate (e.g. string '0.5' from unvalidated JSON) must be rejected
      const invalidSampleRateConfig = JSON.parse(
        JSON.stringify({ ...baseConfig, SampleRate: '0.5' }),
      ) as IRecordProcessChallengerConfig;
      expect(coordinator.ShouldSample(invalidSampleRateConfig)).toBe(false);
      // Missing both ChallengerModelID and ChallengerPromptID must not sample
      expect(
        coordinator.ShouldSample({
          ...baseConfig,
          ChallengerModelID: undefined,
          ChallengerPromptID: undefined,
        }),
      ).toBe(false);

      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 1 })).toBe(true);
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0.5 })).toBe(true);

      rngValue = 0.75;
      expect(coordinator.ShouldSample({ ...baseConfig, SampleRate: 0.5 })).toBe(false);
    });
  });

  describe('DispatchShadowScore & ExecuteChallengerEnvelope', () => {
    it('should default ExecuteInProcessWhenPublished to false when WorkQueuePublisher is supplied so challenger is not double-run (D5)', async () => {
      const publishedEnvelopes: ShadowScoreEnvelope[] = [];
      let inProcessRunnerCalls = 0;

      const publisher: IShadowWorkQueuePublisher = {
        PublishShadowItem: async (env) => {
          publishedEnvelopes.push(env);
        },
      };
      const runner: IChallengerScoreRunner = {
        RunChallenger: async (): Promise<ChallengerScoreOutput> => {
          inProcessRunnerCalls++;
          return { Score: 0.91 };
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        WorkQueuePublisher: publisher,
        ChallengerRunner: runner,
      });

      const envelope: ShadowScoreEnvelope = {
        RecordProcessID: 'RP-001',
        EntityName: 'MJ: Members',
        RecordID: 'Rec-101',
        ChampionModelID: 'Model-Champion-V1',
        ChallengerConfig: baseConfig,
        FrozenFeatures: { tenure_months: 24, events_attended: 5 },
        ChampionScore: 0.75,
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(publishedEnvelopes).toHaveLength(1);
      expect(inProcessRunnerCalls).toBe(0);
    });

    it('should run in-process when no WorkQueuePublisher is supplied (or when ExecuteInProcessWhenPublished is true) and freeze features', async () => {
      const auditRecords: ShadowFeatureValueAuditRecord[] = [];
      const runner: IChallengerScoreRunner = {
        RunChallenger: async (env): Promise<ChallengerScoreOutput> => {
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
        ChallengerRunner: runner,
        AuditSink: sink,
      });

      const envelope: ShadowScoreEnvelope = {
        RecordProcessID: 'RP-001',
        EntityID: 'Ent-001',
        EntityName: 'MJ: Members',
        RecordID: 'Rec-101',
        FeatureName: 'Renewed',
        ChampionModelID: 'Model-Champion-V1',
        ChallengerConfig: baseConfig,
        FrozenFeatures: { tenure_months: 24, events_attended: 5 },
        ChampionScore: 0.75,
        ChampionLabel: 'HighRenewal',
        ChampionConfidence: 0.75,
        ChampionLatencyMs: 12,
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].Role).toBe('Challenger');
      expect(auditRecords[0].ModelID).toBe('Model-Challenger-V2');
      expect(auditRecords[0].NumericValue).toBe(0.82);
      expect(auditRecords[0].TextValue).toBe('HighRenewal');
      expect(auditRecords[0].Confidence).toBe(0.88);
      expect(auditRecords[0].TimedOut).toBe(false);
      expect(auditRecords[0].FrozenFeatures).toEqual({ tenure_months: 24, events_attended: 5 });
    });

    it('should defer runner execution to a later tick so a 300ms synchronous prefix in the runner never delays DispatchShadowScore (D4)', async () => {
      let runnerExecuted = false;
      const syncBlockingRunner: IChallengerScoreRunner = {
        RunChallenger: async () => {
          const end = Date.now() + 300;
          while (Date.now() < end) {
            // Intentional 300 ms synchronous CPU spin before any await
          }
          runnerExecuted = true;
          return { Score: 0.42 };
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        ChallengerRunner: syncBlockingRunner,
      });

      const envelope: ShadowScoreEnvelope = {
        RecordID: 'Rec-Sync-Block',
        ChallengerConfig: { ...baseConfig, MaxLatencyMs: 1000 },
        FrozenFeatures: { f1: 1 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      const callStart = Date.now();
      coordinator.DispatchShadowScore(envelope);
      const callerElapsedMs = Date.now() - callStart;

      // DispatchShadowScore must return immediately before the 300 ms synchronous spin executes
      expect(callerElapsedMs).toBeLessThan(50);
      expect(runnerExecuted).toBe(false);

      await coordinator.FlushInFlight();
      expect(runnerExecuted).toBe(true);
    });

    it('should abort the challenger via AbortSignal and record TimedOut=true when MaxLatencyMs expires (D4)', async () => {
      const auditRecords: ShadowFeatureValueAuditRecord[] = [];
      let observedSignalAborted = false;

      const slowRunner: IChallengerScoreRunner = {
        RunChallenger: async (_env, _user, _provider, signal) => {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 200);
            signal?.addEventListener(
              'abort',
              () => {
                observedSignalAborted = signal.aborted;
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          if (signal?.aborted) {
            throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
          }
          return { Score: 0.5 };
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        ChallengerRunner: slowRunner,
        AuditSink: {
          RecordShadowAudit: async (rec) => {
            auditRecords.push(rec);
          },
        },
      });

      const envelope: ShadowScoreEnvelope = {
        RecordID: 'Rec-Timeout-1',
        ChallengerConfig: { ...baseConfig, MaxLatencyMs: 25 },
        FrozenFeatures: { f1: 10 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(observedSignalAborted).toBe(true);
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0].Role).toBe('Challenger');
      expect(auditRecords[0].TimedOut).toBe(true);
      expect(auditRecords[0].ErrorMessage).toContain('SHADOW_TIMEOUT');
      expect(auditRecords[0].NumericValue).toBeNull();
    });

    it('should cap concurrent in-flight shadow tasks at MaxInFlight and increment DroppedCount when full (D4)', async () => {
      let releaseRunners: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        releaseRunners = resolve;
      });
      let executedCount = 0;

      const coordinator = new ShadowScoringCoordinator({
        MaxInFlight: 2,
        ChallengerRunner: {
          RunChallenger: async () => {
            executedCount++;
            await gate;
            return { Score: 0.5 };
          },
        },
      });

      const makeEnvelope = (id: string): ShadowScoreEnvelope => ({
        RecordID: id,
        ChallengerConfig: { ...baseConfig, MaxLatencyMs: 2000 },
        FrozenFeatures: { x: 1 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      });

      coordinator.DispatchShadowScore(makeEnvelope('r1'));
      coordinator.DispatchShadowScore(makeEnvelope('r2'));
      coordinator.DispatchShadowScore(makeEnvelope('r3'));
      coordinator.DispatchShadowScore(makeEnvelope('r4'));

      expect(coordinator.InFlightCount).toBe(2);
      expect(coordinator.DroppedCount).toBe(2);

      releaseRunners?.();
      await coordinator.FlushInFlight();

      expect(coordinator.InFlightCount).toBe(0);
      expect(executedCount).toBe(2);
    });
  });

  describe('MLModelChallengerScoreRunner & FeatureValueShadowAuditSink (D1)', () => {
    it('should score frozen features with ChallengerModelID and persist a Role="Challenger" FeatureValue row with ValueKeyHash=null', async () => {
      const capturedRequests: PredictRequest[] = [];
      const artifacts = new InMemoryArtifactLoader();
      artifacts.set('challenger-file-1', new TextEncoder().encode('challenger-artifact'));

      const fakeModel: Partial<MJMLModelEntity> = {
        ID: 'Model-Challenger-V2',
        Status: 'Validated',
        ArtifactFileID: 'challenger-file-1',
        FittedPreprocessing: JSON.stringify({ 'scale.tenure': { mean: 10, std: 2 } }),
        FeatureSchema: JSON.stringify([
          { Name: 'tenure', Kind: 'numeric' },
          { Name: 'city', Kind: 'categorical' },
        ]),
        ProblemType: 'classification',
        TargetVariable: 'Renewed',
      };

      const deps: MLInferenceDeps = {
        modelLoader: {
          loadModel: async (id) => (id === 'Model-Challenger-V2' ? (fakeModel as MJMLModelEntity) : null),
        },
        artifactLoader: artifacts,
        sidecar: {
          predict: async (req: PredictRequest): Promise<PredictResponse> => {
            capturedRequests.push(req);
            return { predictions: [{ score: 0.87, class: 'renew' }] };
          },
        },
      };

      const createdEntities: SavedFeatureValueDouble[] = [];
      const fakeProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
        EntityByName: () => ({ ID: 'Ent-Members' } as ReturnType<IMetadataProvider['EntityByName']>),
      } as Pick<IMetadataProvider, 'GetEntityObject' | 'EntityByName'> as IMetadataProvider;

      const coordinator = new ShadowScoringCoordinator({
        ChallengerRunner: new MLModelChallengerScoreRunner(deps),
        AuditSink: new FeatureValueShadowAuditSink(),
      });

      const envelope: ShadowScoreEnvelope = {
        RecordProcessID: 'RP-100',
        ProcessRunID: 'Run-200',
        EntityID: 'Ent-Members',
        EntityName: 'Members',
        RecordID: 'Mem-42',
        FeatureName: 'Renewed',
        ChampionModelID: 'Model-Champion-V1',
        ChallengerConfig: baseConfig,
        FrozenFeatures: { tenure: 18, city: 'NYC', ignored_extra: 'drop' },
        ChampionScore: 0.65,
        ChampionLabel: 'renew',
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope, {} as UserInfo, fakeProvider);
      await coordinator.FlushInFlight();

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0].rows).toEqual([{ tenure: 18, city: 'NYC' }]);

      expect(createdEntities).toHaveLength(1);
      const saved = createdEntities[0];
      expect(saved.NewRecordCalled).toBe(true);
      expect(saved.SaveCalled).toBe(true);
      expect(saved.Role).toBe('Challenger');
      expect(saved.ValueKeyHash).toBeNull();
      expect(saved.RecordProcessID).toBe('RP-100');
      expect(saved.ProcessRunID).toBe('Run-200');
      expect(saved.EntityID).toBe('Ent-Members');
      expect(saved.RecordID).toBe('Mem-42');
      expect(saved.FeatureName).toBe('Renewed');
      expect(saved.AIModelID).toBe('Model-Challenger-V2');
      expect(saved.ValueNumeric).toBe(0.87);
      expect(saved.ValueText).toBe('renew');
      expect(saved.Confidence).toBeCloseTo(0.87, 5);
    });
  });
});
