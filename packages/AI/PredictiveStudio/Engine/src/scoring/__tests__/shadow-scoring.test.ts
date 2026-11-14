import { describe, expect, it } from 'vitest';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import type {
  MJFeatureValueEntity,
  MJMLModelEntity,
  MJRecordProcessEntity_IRecordProcessChallengerConfig,
} from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse } from '@memberjunction/predictive-studio-core';
import { InMemoryArtifactLoader } from '../artifact-loader';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { ArtifactUnavailableError } from '../model-readiness';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import {
  ChallengerUserRequiredError,
  FeatureValueShadowAuditSink,
  MLModelChallengerScoreRunner,
  ShadowScoringCoordinator,
  type ChallengerScoreOutput,
  type IChallengerScoreRunner,
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
  public MLModelID: string | null = null;
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
    if (
      this.AIModelID &&
      !this.AIModelID.toLowerCase().startsWith('aimodel-') &&
      !this.AIModelID.toLowerCase().startsWith('ai-model-')
    ) {
      this.LatestResult = {
        CompleteMessage: `FK violation: '${this.AIModelID}' is not an MJ: AI Models ID`,
      };
      return false;
    }
    if (
      this.MLModelID &&
      !this.MLModelID.toLowerCase().startsWith('model-') &&
      !this.MLModelID.toLowerCase().startsWith('mlmodel-')
    ) {
      this.LatestResult = {
        CompleteMessage: `FK violation: '${this.MLModelID}' is not an MJ: ML Models ID`,
      };
      return false;
    }
    this.SaveCalled = true;
    return true;
  }
}

describe('ShadowScoringCoordinator', () => {
  const baseConfig: MJRecordProcessEntity_IRecordProcessChallengerConfig = {
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
      ) as MJRecordProcessEntity_IRecordProcessChallengerConfig;
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

      const errors = ConsoleCapture.Errors();
      coordinator.DispatchShadowScore(envelope);
      await coordinator.FlushInFlight();

      expect(ConsoleCapture.Lines(errors)).toEqual([
        "ShadowScoringCoordinator: challenger failed for record 'Rec-Timeout-1' (model='Model-Challenger-V2'): SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (25ms)",
      ]);
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

    it('holds in-flight slots until slow sidecar calls settle so timeouts do not defeat MaxInFlight (S1)', async () => {
      let activeCalls = 0;
      let maxObservedActiveCalls = 0;
      const signals: AbortSignal[] = [];

      // A sidecar call that ignores the abort: it runs 100 ms even though the 15 ms timeout fires first.
      const slowRunner: IChallengerScoreRunner = {
        RunChallenger: async (_env, _user, _provider, signal) => {
          if (signal) {
            signals.push(signal);
          }
          activeCalls++;
          maxObservedActiveCalls = Math.max(maxObservedActiveCalls, activeCalls);
          try {
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
            return { Score: 0.5 };
          } finally {
            activeCalls--;
          }
        },
      };

      const coordinator = new ShadowScoringCoordinator({
        MaxInFlight: 4,
        ChallengerRunner: slowRunner,
      });
      const dispatch = (i: number) =>
        coordinator.DispatchShadowScore({
          RecordID: `rec-${i}`,
          ChallengerConfig: { ...baseConfig, MaxLatencyMs: 15 },
          FrozenFeatures: { x: 1 },
          DispatchedAt: '2026-11-02T12:00:00.000Z',
        });

      const errors = ConsoleCapture.Errors();
      for (let i = 0; i < 4; i++) {
        dispatch(i);
      }
      // The four runners have started, and their timeouts have fired while the calls still run.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(activeCalls).toBe(4);
      expect(signals).toHaveLength(4);
      expect(signals.every((signal) => signal instanceof AbortSignal && signal.aborted)).toBe(true);

      // The slots are still held, so four more are dropped rather than started.
      for (let i = 4; i < 8; i++) {
        dispatch(i);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(coordinator.DroppedCount).toBe(4);
      expect(maxObservedActiveCalls).toBe(4);

      await coordinator.FlushInFlight();
      expect(coordinator.InFlightCount).toBe(0);
      expect(maxObservedActiveCalls).toBe(4);
      // One timeout line per started challenger; the four dropped dispatches never ran.
      expect(ConsoleCapture.Lines(errors).sort()).toEqual(
        [0, 1, 2, 3].map(
          (i) => `ShadowScoringCoordinator: challenger failed for record 'rec-${i}' (model='Model-Challenger-V2'): SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (15ms)`,
        ),
      );
    });

    it('persists champion audit row even when challenger task is dropped by in-flight cap (S5)', async () => {
      let releaseRunner: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        releaseRunner = resolve;
      });

      const createdEntities: SavedFeatureValueDouble[] = [];
      const fakeProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
        EntityByName: () => ({ ID: 'Ent-Members' } as ReturnType<IMetadataProvider['EntityByName']>),
        RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }),
        RunViews: async (views: RunViewParams[]) =>
          views.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' })),
      } as unknown as IMetadataProvider;

      const coordinator = new ShadowScoringCoordinator({
        MaxInFlight: 1,
        ChallengerRunner: {
          RunChallenger: async () => {
            await gate;
            return { Score: 0.8 };
          },
        },
        AuditSink: new FeatureValueShadowAuditSink(),
      });

      const makeEnvelope = (id: string): ShadowScoreEnvelope => ({
        RecordProcessID: 'RP-1',
        EntityID: 'Ent-Members',
        RecordID: id,
        FeatureName: 'Churn',
        ChampionModelID: 'Model-Champ-1',
        ChampionScore: 0.42,
        ChampionConfidence: 0.9,
        ChallengerConfig: { ...baseConfig, MaxLatencyMs: 5000 },
        FrozenFeatures: { x: 1 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      });

      // Dispatch 3 tasks: first occupies the 1 in-flight slot, next 2 are dropped for challenger
      coordinator.DispatchShadowScore(makeEnvelope('rec-1'), { ID: 'user-1' } as UserInfo, fakeProvider);
      coordinator.DispatchShadowScore(makeEnvelope('rec-2'), { ID: 'user-1' } as UserInfo, fakeProvider);
      coordinator.DispatchShadowScore(makeEnvelope('rec-3'), { ID: 'user-1' } as UserInfo, fakeProvider);

      expect(coordinator.DroppedCount).toBe(2);

      releaseRunner?.();
      await coordinator.FlushInFlight();

      // All 3 champion rows must have been persisted despite 2 challenger tasks being dropped
      const championRows = createdEntities.filter((e) => e.Role === 'Champion');
      expect(championRows).toHaveLength(3);
      expect(championRows.map((e) => e.RecordID).sort()).toEqual(['rec-1', 'rec-2', 'rec-3']);
      for (const row of championRows) {
        expect(row.MLModelID).toBe('Model-Champ-1');
        expect(row.AIModelID).toBeNull();
      }
    });
  });

  describe('MLModelChallengerScoreRunner & FeatureValueShadowAuditSink (D1)', () => {
    it('should score frozen features with ChallengerModelID and persist a Role="Challenger" FeatureValue row with ValueKeyHash=null', async () => {
      const capturedRequests: PredictRequest[] = [];
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('challenger-file-1', new TextEncoder().encode('challenger-artifact'));

      const fakeModel: Partial<MJMLModelEntity> = {
        ID: 'Model-Challenger-V2',
        Status: 'Validated',
        ArtifactFileID: 'challenger-file-1',
        ArtifactSha256: SnapshotHash.Sha256Hex(new TextEncoder().encode('challenger-artifact')),
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
            return { predictions: [{ score: 0.87, class: 'renew', probabilities: null }], classOrder: null };
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
        RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }),
        RunViews: async (views: RunViewParams[]) =>
          views.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' })),
      } as unknown as IMetadataProvider;

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
        ChampionConfidence: 0.65,
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      coordinator.DispatchShadowScore(envelope, { ID: 'user-1' } as UserInfo, fakeProvider);
      await coordinator.FlushInFlight();

      expect(capturedRequests).toHaveLength(1);
      expect(capturedRequests[0].rows).toEqual([{ tenure: 18, city: 'NYC' }]);

      expect(createdEntities).toHaveLength(2);
      const championSaved = createdEntities.find((e) => e.Role === 'Champion');
      const challengerSaved = createdEntities.find((e) => e.Role === 'Challenger');

      expect(championSaved).toBeDefined();
      expect(championSaved!.SaveCalled).toBe(true);
      expect(championSaved!.Role).toBe('Champion');
      expect(championSaved!.ValueKeyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(championSaved!.RecordProcessID).toBe('RP-100');
      expect(championSaved!.ProcessRunID).toBe('Run-200');
      expect(championSaved!.EntityID).toBe('Ent-Members');
      expect(championSaved!.RecordID).toBe('Mem-42');
      expect(championSaved!.FeatureName).toBe('Renewed');
      expect(championSaved!.MLModelID).toBe('Model-Champion-V1');
      expect(championSaved!.AIModelID).toBeNull();
      expect(championSaved!.ValueNumeric).toBe(0.65);
      expect(championSaved!.Confidence).toBeCloseTo(0.65, 5);

      expect(challengerSaved).toBeDefined();
      expect(challengerSaved!.NewRecordCalled).toBe(true);
      expect(challengerSaved!.SaveCalled).toBe(true);
      expect(challengerSaved!.Role).toBe('Challenger');
      expect(challengerSaved!.ValueKeyHash).toBeNull();
      expect(challengerSaved!.RecordProcessID).toBe('RP-100');
      expect(challengerSaved!.ProcessRunID).toBe('Run-200');
      expect(challengerSaved!.EntityID).toBe('Ent-Members');
      expect(challengerSaved!.RecordID).toBe('Mem-42');
      expect(challengerSaved!.FeatureName).toBe('Renewed');
      expect(challengerSaved!.MLModelID).toBe('Model-Challenger-V2');
      expect(challengerSaved!.AIModelID).toBeNull();
      expect(challengerSaved!.ValueNumeric).toBe(0.87);
      expect(challengerSaved!.ValueText).toBe('renew');
      expect(challengerSaved!.Confidence).toBeCloseTo(0.87, 5);
    });

    it('saves an ML Model challenger configured with a ChallengerPromptID too with MLModelID only, never an ML Model ID in AIModelID (P12)', async () => {
      const createdEntities: SavedFeatureValueDouble[] = [];
      const fakeProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
        EntityByName: () => ({ ID: 'Ent-Members' }) as ReturnType<IMetadataProvider['EntityByName']>,
      } as unknown as IMetadataProvider;

      const coordinator = new ShadowScoringCoordinator({
        ChallengerRunner: { RunChallenger: async () => ({ Score: 0.7, Label: 'renew' }) },
        AuditSink: new FeatureValueShadowAuditSink(),
      });
      await coordinator.ExecuteChallengerEnvelope(
        {
          RecordProcessID: 'RP-12',
          EntityID: 'Ent-Members',
          RecordID: 'Mem-12',
          FeatureName: 'Renewed',
          ChallengerConfig: { ...baseConfig, ChallengerPromptID: 'Prompt-Leftover-1' },
          FrozenFeatures: { tenure: 3 },
          DispatchedAt: '2026-11-02T12:00:00.000Z',
        },
        { ID: 'user-1' } as UserInfo,
        fakeProvider,
      );

      expect(createdEntities).toHaveLength(1);
      const row = createdEntities[0];
      expect(row.LatestResult).toBeNull();
      expect(row.SaveCalled).toBe(true);
      expect(row.MLModelID).toBe('Model-Challenger-V2');
      expect(row.AIModelID).toBeNull();
      expect(row.PromptID).toBeNull();
    });

    it('re-checks modelLoader.loadModel with each caller contextUser and reloads the artifact when ArtifactFileID changes (R9)', async () => {
      const observedModelLoadUsers: Array<string | undefined> = [];
      const observedArtifactLoads: string[] = [];
      const capturedPredictArtifacts: string[] = [];

      let currentArtifactFileId = 'challenger-artifact-v1';
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('challenger-artifact-v1', new TextEncoder().encode('bytes-v1'));
      artifacts.Set('challenger-artifact-v2', new TextEncoder().encode('bytes-v2'));
      // Each artifact file's registered SHA-256, as the model row that names it records it.
      const registeredSha256: Record<string, string> = {
        'challenger-artifact-v1': SnapshotHash.Sha256Hex(new TextEncoder().encode('bytes-v1')),
        'challenger-artifact-v2': SnapshotHash.Sha256Hex(new TextEncoder().encode('bytes-v2')),
      };

      const deps: MLInferenceDeps = {
        modelLoader: {
          loadModel: async (id, contextUser) => {
            observedModelLoadUsers.push(contextUser?.ID);
            if (id !== 'Model-Challenger-V2') {
              return null;
            }
            return {
              ID: 'Model-Challenger-V2',
              Status: 'Validated',
              ArtifactFileID: currentArtifactFileId,
              ArtifactSha256: registeredSha256[currentArtifactFileId],
              FittedPreprocessing: '{}',
              FeatureSchema: JSON.stringify([{ Name: 'tenure', Kind: 'numeric' }]),
              ProblemType: 'classification',
              TargetVariable: 'Renewed',
            } as MJMLModelEntity;
          },
        },
        artifactLoader: {
          load: async (fileId, contextUser, provider) => {
            observedArtifactLoads.push(fileId);
            return artifacts.load(fileId, contextUser, provider);
          },
        },
        sidecar: {
          predict: async (req: PredictRequest): Promise<PredictResponse> => {
            capturedPredictArtifacts.push(req.artifact_b64);
            return { predictions: [{ score: 0.8, class: 'renew', probabilities: null }], classOrder: null };
          },
        },
      };

      const runner = new MLModelChallengerScoreRunner(deps);
      const envelope: ShadowScoreEnvelope = {
        RecordID: 'Mem-1',
        ChallengerConfig: baseConfig,
        FrozenFeatures: { tenure: 12 },
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      await runner.RunChallenger(envelope, { ID: 'user-A' } as UserInfo);
      await runner.RunChallenger(envelope, { ID: 'user-B' } as UserInfo);

      expect(observedModelLoadUsers).toEqual(['user-A', 'user-B']);
      // Artifact v1 was loaded only once across the two runs because ArtifactFileID did not change
      expect(observedArtifactLoads).toEqual(['challenger-artifact-v1']);

      // Retrain updates ArtifactFileID on the model row
      currentArtifactFileId = 'challenger-artifact-v2';
      await runner.RunChallenger(envelope, { ID: 'user-C' } as UserInfo);

      expect(observedModelLoadUsers).toEqual(['user-A', 'user-B', 'user-C']);
      expect(observedArtifactLoads).toEqual(['challenger-artifact-v1', 'challenger-artifact-v2']);
      expect(capturedPredictArtifacts[0]).toBe(Buffer.from('bytes-v1').toString('base64'));
      expect(capturedPredictArtifacts[2]).toBe(Buffer.from('bytes-v2').toString('base64'));
    });

    it('names the challenger schema columns the champion row lacks, and records the challenger as errored with one SHADOW_ERROR prefix (M4)', async () => {
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('file-1', new TextEncoder().encode('artifact-data'));

      const runner = new MLModelChallengerScoreRunner({
        modelLoader: {
          loadModel: async () =>
            ({
              ID: 'Model-Schema-Strict',
              Status: 'Validated',
              ArtifactFileID: 'file-1',
              ArtifactSha256: SnapshotHash.Sha256Hex(new TextEncoder().encode('artifact-data')),
              FeatureSchema: JSON.stringify([
                { Name: 'income', Kind: 'numeric' },
                { Name: 'credit_score', Kind: 'numeric' },
              ]),
            }) as unknown as MJMLModelEntity,
        },
        artifactLoader: artifacts,
        sidecar: {
          predict: async () => ({ predictions: [{ score: 0.9, probabilities: null }], classOrder: null }),
        },
      });

      const envelope: ShadowScoreEnvelope = {
        RecordID: 'rec-missing-features',
        ChallengerConfig: {
          Enabled: true,
          SampleRate: 1.0,
          WorkType: 'ML Model',
          ChallengerModelID: 'Model-Schema-Strict',
          MaxLatencyMs: 5000,
        },
        FrozenFeatures: { income: 50000 }, // credit_score missing
        DispatchedAt: '2026-11-02T12:00:00.000Z',
      };

      await expect(runner.RunChallenger(envelope, { ID: 'user-1' } as UserInfo)).rejects.toThrow(
        "Challenger model 'Model-Schema-Strict' schema has feature column(s) not in the champion's frozen feature row: credit_score",
      );

      // Recorded as an errored challenger row whose reason carries one SHADOW_ERROR prefix and the column names.
      const createdEntities: SavedFeatureValueDouble[] = [];
      const fakeProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
      } as unknown as IMetadataProvider;
      const errors = ConsoleCapture.Errors();
      await new ShadowScoringCoordinator({ ChallengerRunner: runner, AuditSink: new FeatureValueShadowAuditSink() }).ExecuteChallengerEnvelope(
        { ...envelope, EntityID: 'Ent-Members' },
        { ID: 'user-1' } as UserInfo,
        fakeProvider,
      );
      expect(ConsoleCapture.Lines(errors)).toEqual([
        "ShadowScoringCoordinator: challenger failed for record 'rec-missing-features' (model='Model-Schema-Strict'): Challenger model 'Model-Schema-Strict' schema has feature column(s) not in the champion's frozen feature row: credit_score",
      ]);
      expect(createdEntities.map((e) => e.Reasoning)).toEqual([
        "SHADOW_ERROR: Challenger model 'Model-Schema-Strict' schema has feature column(s) not in the champion's frozen feature row: credit_score",
      ]);
      expect(createdEntities[0].ValueNumeric).toBeNull();
    });

    it('stores a timed-out challenger reason with one SHADOW_TIMEOUT prefix (M4)', async () => {
      const createdEntities: SavedFeatureValueDouble[] = [];
      const fakeProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
      } as unknown as IMetadataProvider;
      const coordinator = new ShadowScoringCoordinator({
        ChallengerRunner: { RunChallenger: async () => new Promise<ChallengerScoreOutput>((resolve) => setTimeout(() => resolve({ Score: 1 }), 60)) },
        AuditSink: new FeatureValueShadowAuditSink(),
      });
      const errors = ConsoleCapture.Errors();
      await coordinator.ExecuteChallengerEnvelope(
        {
          EntityID: 'Ent-Members',
          RecordID: 'rec-slow',
          ChallengerConfig: { ...baseConfig, MaxLatencyMs: 10 },
          FrozenFeatures: {},
          DispatchedAt: '2026-11-02T12:00:00.000Z',
        },
        { ID: 'user-1' } as UserInfo,
        fakeProvider,
      );
      expect(createdEntities.map((e) => e.Reasoning)).toEqual(['SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (10ms)']);
      expect(ConsoleCapture.Lines(errors)).toEqual([
        "ShadowScoringCoordinator: challenger failed for record 'rec-slow' (model='Model-Challenger-V2'): SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (10ms)",
      ]);
    });
  });

  describe('MLModelChallengerScoreRunner loads its artifact through the artifact registry', () => {
    const challengerBytes = new TextEncoder().encode('challenger-artifact');
    const user = { ID: 'user-1' } as UserInfo;
    /** The provider slice the challenger's registry is built over; the in-memory loader never reads it (one deliberate test-double cast). */
    const registryProvider = {} as unknown as IMetadataProvider;

    /** A Validated challenger row that counts its saves, so a test can show the challenger's ArtifactStatus is never written. */
    class ChallengerModelDouble {
      public ID = 'Model-Challenger-V2';
      public Status: MJMLModelEntity['Status'] = 'Validated';
      public ArtifactFileID: string | null = 'challenger-file-1';
      public ArtifactSha256: string | null = SnapshotHash.Sha256Hex(challengerBytes);
      public ArtifactStatus: MJMLModelEntity['ArtifactStatus'] = 'verified';
      public FittedPreprocessing = '{}';
      public FeatureSchema = JSON.stringify([{ Name: 'tenure', Kind: 'numeric' }]);
      public ProblemType: MJMLModelEntity['ProblemType'] = 'classification';
      public TargetVariable = 'Renewed';
      public SaveCount = 0;
      public async Save(): Promise<boolean> {
        this.SaveCount++;
        return true;
      }
    }

    /** The challenger runner over `artifacts`, recording every `/predict` it sends. */
    function challengerRunner(model: ChallengerModelDouble, artifacts: InMemoryArtifactLoader, predicted: PredictRequest[]): MLModelChallengerScoreRunner {
      return new MLModelChallengerScoreRunner({
        // The loader hands back the row double: one deliberate test-double cast at the seam.
        modelLoader: { loadModel: async () => model as unknown as MJMLModelEntity },
        artifactLoader: artifacts,
        sidecar: {
          predict: async (req: PredictRequest): Promise<PredictResponse> => {
            predicted.push(req);
            return { predictions: [{ score: 0.9, class: 'renew', probabilities: null }], classOrder: null };
          },
        },
      });
    }

    const envelope: ShadowScoreEnvelope = {
      RecordProcessID: 'RP-7',
      EntityID: 'Ent-Members',
      EntityName: 'Members',
      RecordID: 'Mem-7',
      FeatureName: 'Renewed',
      ChampionModelID: 'Model-Champion-V1',
      ChallengerConfig: baseConfig,
      FrozenFeatures: { tenure: 4 },
      ChampionScore: 0.4,
      ChampionLabel: 'lapse',
      DispatchedAt: '2026-11-02T12:00:00.000Z',
    };

    it('refuses a challenger whose artifact object is gone with the typed artifact-missing error, naming the challenger, model and file', async () => {
      const model = new ChallengerModelDouble();
      const predicted: PredictRequest[] = [];
      const attempt = challengerRunner(model, new InMemoryArtifactLoader(), predicted).RunChallenger(envelope, user, registryProvider);
      await expect(attempt).rejects.toBeInstanceOf(ArtifactUnavailableError);
      await expect(attempt).rejects.toMatchObject({
        Refusal: { kind: 'artifact-missing', fileId: 'challenger-file-1' }, Source: 'MLModelChallengerScoreRunner', ModelID: 'Model-Challenger-V2', FileID: 'challenger-file-1',
      });
      await expect(attempt).rejects.toThrow("MLModelChallengerScoreRunner: ML Model 'Model-Challenger-V2': its model artifact file 'challenger-file-1' is missing from storage");
      expect(predicted).toHaveLength(0);
      // The challenger is not the served model: its row is never written.
      expect([model.SaveCount, model.ArtifactStatus]).toEqual([0, 'verified']);
    });

    it('refuses a challenger whose stored bytes changed with the typed artifact-hash-mismatch error, naming both hashes', async () => {
      const model = new ChallengerModelDouble();
      const artifacts = new InMemoryArtifactLoader();
      const swapped = new TextEncoder().encode('another model');
      artifacts.Set('challenger-file-1', swapped);
      const predicted: PredictRequest[] = [];
      const attempt = challengerRunner(model, artifacts, predicted).RunChallenger(envelope, user, registryProvider);
      await expect(attempt).rejects.toMatchObject({
        Refusal: { kind: 'artifact-hash-mismatch', expected: SnapshotHash.Sha256Hex(challengerBytes), actual: SnapshotHash.Sha256Hex(swapped) },
        Source: 'MLModelChallengerScoreRunner',
      });
      expect(predicted).toHaveLength(0);
      expect([model.SaveCount, model.ArtifactStatus]).toEqual([0, 'verified']);
    });

    it("keeps the champion's audit row when the challenger's artifact does not verify, and records the challenger as errored", async () => {
      const model = new ChallengerModelDouble();
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('challenger-file-1', new TextEncoder().encode('another model'));
      const createdEntities: SavedFeatureValueDouble[] = [];
      const auditProvider = {
        GetEntityObject: async <T>(): Promise<T> => {
          const entity = new SavedFeatureValueDouble();
          createdEntities.push(entity);
          return entity as T;
        },
        EntityByName: () => ({ ID: 'Ent-Members' }) as ReturnType<IMetadataProvider['EntityByName']>,
        RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }),
        RunViews: async (views: RunViewParams[]) =>
          views.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' })),
      } as unknown as IMetadataProvider;
      const predicted: PredictRequest[] = [];
      const coordinator = new ShadowScoringCoordinator({ ChallengerRunner: challengerRunner(model, artifacts, predicted), AuditSink: new FeatureValueShadowAuditSink() });
      const errors = ConsoleCapture.Errors();

      await coordinator.DispatchShadowScore(envelope, user, auditProvider).ChampionAudit;
      await coordinator.FlushInFlight();

      const champion = createdEntities.find((e) => e.Role === 'Champion');
      const challenger = createdEntities.find((e) => e.Role === 'Challenger');
      expect([champion?.SaveCalled, champion?.MLModelID, champion?.ValueNumeric]).toEqual([true, 'Model-Champion-V1', 0.4]);
      expect(challenger?.ValueNumeric).toBeNull();
      expect(challenger?.Reasoning).toContain("SHADOW_ERROR: MLModelChallengerScoreRunner: ML Model 'Model-Challenger-V2': its stored model artifact file 'challenger-file-1' does not match");
      expect(predicted).toHaveLength(0);
      expect(model.SaveCount).toBe(0);
      expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("challenger failed for record 'Mem-7' (model='Model-Challenger-V2'): MLModelChallengerScoreRunner:")]);
    });

    it('refuses a challenger asked to score without an acting user, naming the challenger, before reading its artifact', async () => {
      const artifacts = new InMemoryArtifactLoader();
      artifacts.Set('challenger-file-1', challengerBytes);
      const predicted: PredictRequest[] = [];
      const attempt = challengerRunner(new ChallengerModelDouble(), artifacts, predicted).RunChallenger(envelope, undefined, registryProvider);
      await expect(attempt).rejects.toBeInstanceOf(ChallengerUserRequiredError);
      await expect(attempt).rejects.toMatchObject({ ChallengerModelID: 'Model-Challenger-V2' });
      expect(predicted).toHaveLength(0);
    });
  });
});
