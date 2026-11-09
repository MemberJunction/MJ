import { describe, it, expect, vi } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type {
  PredictRequest,
  PredictResponse,
  FeatureSchemaEntry,
  SourceBinding,
  AsOfStrategy,
  FeatureStepGraph,
} from '@memberjunction/predictive-studio-core';
import type {
  RecordProcessorContext,
  RecordRef,
} from '@memberjunction/record-set-processor-base';

import {
  MLModelInferenceProcessor,
  MatrixToFeatureRows,
  type MLInferenceResultPayload,
} from '../ml-model-inference-processor';
import { ModelNotScorableError, ModelNeedsTrainingError } from '../model-readiness';
import { InMemoryArtifactLoader } from '../artifact-loader';
import type { MJRecordProcessEntity_IRecordProcessChallengerConfig } from '@memberjunction/core-entities';
import {
  ShadowScoringCoordinator,
  type ShadowFeatureValueAuditRecord,
  type ShadowScoreEnvelope,
} from '../shadow-scoring';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
} from '../../feature-assembly';

/**
 * Unit tests for the MLModelInferenceProcessor (scoring). NO live DB, NO live
 * sidecar — every seam is an in-memory fake. These tests prove the per-record
 * scoring flow (plan §10): warm model + artifact load → transform-only feature
 * assembly using the model's FROZEN schema + fitted preprocessing (never re-fit)
 * → sidecar `/predict` → per-record RecordResult; write-back via the substrate's
 * WriteBackProcessor wrapper; and warm artifact reuse across a batch.
 */

// ---------------------------------------------------------------------------
// In-memory fakes. The processor only ever reads the strongly-typed members
// below off the model entity; the IMLModelLoader seam hands back the fake via a
// single deliberate test-double cast at the boundary.
// ---------------------------------------------------------------------------

const FROZEN_SCHEMA: FeatureSchemaEntry[] = [
  { Name: 'tenure', Kind: 'numeric' },
  { Name: 'events_at_signup', Kind: 'numeric' },
  { Name: 'city', Kind: 'categorical' },
];

const FROZEN_PREPROCESSING = { 'standardize.tenure': { mean: 5, std: 2.5 }, 'onehot.city': { vocab: ['NYC', 'LA'] } };

/** A model fake exposing exactly the fields the processor reads. */
class FakeMLModel {
  public ID = 'model-1';
  public Status: MJMLModelEntity['Status'] = 'Published';
  public ArtifactFileID: string | null = 'file-1';
  public FittedPreprocessing: string | null = JSON.stringify(FROZEN_PREPROCESSING);
  public FeatureSchema = JSON.stringify(FROZEN_SCHEMA);
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TargetVariable = 'Renewed';
  public Pipeline: string | null = 'Members';
  public Lineage: string | null = JSON.stringify({
    targetEntityName: 'Members',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Members' }] satisfies SourceBinding[],
    featureSteps: {
      Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure', 'events_at_signup', 'city'] }],
    } satisfies FeatureStepGraph,
    asOfStrategy: { Mode: 'none' } satisfies AsOfStrategy,
  });
}

/** Model-loader fake — returns the configured model (or null) and counts loads. */
class FakeModelLoader implements IMLModelLoader {
  public LoadCount = 0;
  constructor(private readonly model: FakeMLModel | null) {}
  async loadModel(_id: string, _u?: UserInfo, _p?: IMetadataProvider): Promise<MJMLModelEntity | null> {
    this.LoadCount++;
    return this.model as unknown as MJMLModelEntity | null;
  }
}

/** Sidecar fake — captures the request, returns canned predictions (one per row). */
class FakeSidecar implements ISidecarPredictor {
  public Requests: PredictRequest[] = [];
  constructor(private readonly scoreFor: (i: number) => { score: number; class?: string } = (i) => ({ score: 0.5 + i * 0.1, class: i % 2 === 0 ? 'renew' : 'lapse' })) {}
  async predict(req: PredictRequest): Promise<PredictResponse> {
    this.Requests.push(req);
    return { predictions: (req.rows ?? []).map((_r, i) => this.scoreFor(i)) };
  }
}

/** In-memory feature data access (the processor passes rows inline, so unused). */
class InMemoryDataAccess implements IFeatureDataAccess {
  async fetchRows(_params: FetchRowsParams): Promise<FetchRowsResult> {
    return { Success: true, Rows: [], TotalRowCount: 0 };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

/** Assembler that always supplies the in-memory data access. */
class TestAssembler extends FeatureAssemblyExecutor {
  constructor(private readonly dataAccess: IFeatureDataAccess) {
    super();
  }
  public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
    return super.assemble({ ...params, dataAccess: this.dataAccess });
  }
}

const CTX: RecordProcessorContext = {
  ContextUser: undefined as unknown as UserInfo,
  Provider: undefined as unknown as IMetadataProvider,
};

/** A member record carrying its data inline (as the engine pre-loads it). */
function memberRecord(id: string, tenure: number, events: number, city: string): RecordRef {
  return { EntityID: 'ent-members', RecordID: id, Record: { ID: id, tenure, events_at_signup: events, city } };
}

function buildDeps(model: FakeMLModel | null = new FakeMLModel()): {
  deps: MLInferenceDeps;
  loader: FakeModelLoader;
  sidecar: FakeSidecar;
  artifacts: InMemoryArtifactLoader;
} {
  const loader = new FakeModelLoader(model);
  const sidecar = new FakeSidecar();
  const artifacts = new InMemoryArtifactLoader();
  artifacts.set('file-1', new TextEncoder().encode('fake-model-bytes'));
  return { deps: { modelLoader: loader, artifactLoader: artifacts, sidecar }, loader, sidecar, artifacts };
}

function buildProcessor(deps: MLInferenceDeps): MLModelInferenceProcessor {
  return new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler(new InMemoryDataAccess()));
}

describe('MLModelInferenceProcessor.ProcessRecord — per-record scoring', () => {
  it('returns a prediction (score + class) shaped to the model FeatureSchema, passing frozen preprocessing', async () => {
    const { deps, sidecar, artifacts } = buildDeps();
    const proc = buildProcessor(deps);

    const result = await proc.ProcessRecord(memberRecord('m1', 12, 3, 'NYC'), CTX);

    expect(result.Status).toBe('Succeeded');
    const payload = result.ResultPayload as MLInferenceResultPayload;
    expect(payload.modelId).toBe('model-1');
    expect(payload.target).toBe('Renewed');
    expect(payload.problemType).toBe('classification');
    expect(typeof payload.score).toBe('number');
    expect(payload.class).toBe('renew');

    // --- The sidecar got ONE row, shaped to the model's frozen schema ---
    expect(sidecar.Requests.length).toBe(1);
    const req = sidecar.Requests[0];
    expect(req.rows.length).toBe(1);
    expect(Object.keys(req.rows[0])).toEqual(['tenure', 'events_at_signup', 'city']); // frozen schema order
    expect(req.rows[0]).toEqual({ tenure: 12, events_at_signup: 3, city: 'NYC' });

    // --- Frozen preprocessing + schema + artifact travel UNCHANGED (transform-only, never re-fit) ---
    expect(req.fitted_preprocessing).toEqual(FROZEN_PREPROCESSING);
    expect(req.feature_schema).toEqual(FROZEN_SCHEMA);
    expect(req.artifact_b64).toBe(Buffer.from('fake-model-bytes').toString('base64'));
    // The artifact loader held the exact bytes the model referenced.
    expect(await artifacts.load('file-1')).not.toBeNull();
  });

  it('scores several records and aligns predictions per record', async () => {
    const { deps, sidecar } = buildDeps();
    const proc = buildProcessor(deps);

    const r1 = await proc.ProcessRecord(memberRecord('m1', 1, 1, 'NYC'), CTX);
    const r2 = await proc.ProcessRecord(memberRecord('m2', 9, 2, 'LA'), CTX);

    expect(r1.Status).toBe('Succeeded');
    expect(r2.Status).toBe('Succeeded');
    expect((r1.ResultPayload as MLInferenceResultPayload).class).toBe('renew');
    expect((r2.ResultPayload as MLInferenceResultPayload).class).toBe('renew');
    // 2 separate sidecar calls (1 row each)
    expect(sidecar.Requests.length).toBe(2);
    expect(sidecar.Requests[0].rows[0]).toEqual({ tenure: 1, events_at_signup: 1, city: 'NYC' });
    expect(sidecar.Requests[1].rows[0]).toEqual({ tenure: 9, events_at_signup: 2, city: 'LA' });
  });

  it('fails the record (not throws) when the model is not found', async () => {
    const { deps } = buildDeps(null);
    const proc = buildProcessor(deps);
    const result = await proc.ProcessRecord(memberRecord('m1', 1, 1, 'NYC'), CTX);
    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toMatch(/not found/);
  });
});

describe('MLModelInferenceProcessor.ProcessBatch — warm artifact reuse', () => {
  it('loads the model + artifact ONCE and reuses it across the whole batch', async () => {
    const { deps, loader, sidecar } = buildDeps();
    const proc = buildProcessor(deps);

    const records = [
      memberRecord('m1', 1, 1, 'NYC'),
      memberRecord('m2', 5, 2, 'LA'),
      memberRecord('m3', 9, 3, 'NYC'),
    ];
    const results = await proc.ProcessBatch(records, CTX);

    expect(results.length).toBe(3);
    expect(results.every((r) => r.Status === 'Succeeded')).toBe(true);
    // The model was loaded exactly once (warm) for the entire batch.
    expect(loader.LoadCount).toBe(1);
    // A single sidecar call carried all 3 rows, in record order, frozen-schema shaped.
    expect(sidecar.Requests.length).toBe(1);
    expect(sidecar.Requests[0].rows).toEqual([
      { tenure: 1, events_at_signup: 1, city: 'NYC' },
      { tenure: 5, events_at_signup: 2, city: 'LA' },
      { tenure: 9, events_at_signup: 3, city: 'NYC' },
    ]);
  });

  it('loads the model once even across many sequential single-record calls (warm cache)', async () => {
    const { deps, loader } = buildDeps();
    const proc = buildProcessor(deps);
    for (let i = 0; i < 5; i++) {
      await proc.ProcessRecord(memberRecord(`m${i}`, i, 1, 'NYC'), CTX);
    }
    expect(loader.LoadCount).toBe(1);
  });
});

describe('matrixToFeatureRows — frozen-schema mapping', () => {
  it('maps a row-major matrix to schema-ordered objects, dropping extras and null-filling missing', () => {
    const matrix = { columns: ['city', 'tenure', 'extra'], rows: [['NYC', 12, 'ignore-me']] };
    const schema: FeatureSchemaEntry[] = [
      { Name: 'tenure', Kind: 'numeric' },
      { Name: 'events_at_signup', Kind: 'numeric' }, // missing from matrix → null
      { Name: 'city', Kind: 'categorical' },
    ];
    const rows = MatrixToFeatureRows(matrix, schema);
    expect(rows).toEqual([{ tenure: 12, events_at_signup: null, city: 'NYC' }]);
    // 'extra' (not in schema) is dropped.
    expect(Object.keys(rows[0])).not.toContain('extra');
  });
});

describe('MLModelInferenceProcessor — empty feature assembly guardrail', () => {
  it('refuses to score and fails the record when feature assembly produces 0 columns for a model with schema features', async () => {
    const emptyLineageModel = new FakeMLModel();
    emptyLineageModel.Lineage = JSON.stringify({
      targetEntityName: 'Members',
      sourceBindings: [],
      featureSteps: { Steps: [] },
      asOfStrategy: { Mode: 'none' },
    });
    // FeatureSchema expects features, but lineage featureSteps is empty
    emptyLineageModel.FeatureSchema = JSON.stringify([
      { Name: 'tenure', Kind: 'numeric' },
      { Name: 'city', Kind: 'categorical' },
    ]);

    const { deps } = buildDeps(emptyLineageModel);
    const proc = buildProcessor(deps);

    const result = await proc.ProcessRecord(memberRecord('m1', 1, 1, 'NYC'), CTX);
    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toMatch(/feature assembly produced 0 columns/);
  });
});

describe('MLModelInferenceProcessor — lifecycle status gate (W1 → S7.3, F-SCO-1)', () => {
  for (const status of ['Draft', 'Archived'] as const) {
    it(`refuses a ${status} model in Preflight before any record is scored or artifact is downloaded`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps, sidecar } = buildDeps(model);
      let artifactLoads = 0;
      deps.artifactLoader = {
        async load(): Promise<Uint8Array | null> {
          artifactLoads++;
          return new Uint8Array([1, 2, 3]);
        },
      };
      const processor = buildProcessor(deps);
      await expect(processor.Preflight(CTX)).rejects.toBeInstanceOf(ModelNotScorableError);
      await expect(processor.Preflight(CTX)).rejects.toThrow(`is ${status} and cannot score records`);
      expect(artifactLoads).toBe(0);
      expect(sidecar.Requests).toHaveLength(0);
    });

    it(`fails every record of a ${status} model without calling the sidecar`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps, sidecar } = buildDeps(model);
      const results = await buildProcessor(deps).ProcessBatch([memberRecord('a', 3, 1, 'NYC'), memberRecord('b', 5, 2, 'LA')], CTX);
      expect(results.map((r) => r.Status)).toEqual(['Failed', 'Failed']);
      expect(results[0].ErrorMessage).toContain('cannot score records');
      expect(sidecar.Requests).toHaveLength(0);
    });
  }

  for (const status of ['Validated', 'Published'] as const) {
    it(`scores a ${status} model`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps } = buildDeps(model);
      const processor = buildProcessor(deps);
      await processor.Preflight(CTX);
      const results = await processor.ProcessBatch([memberRecord('a', 3, 1, 'NYC')], CTX);
      expect(results[0].Status).toBe('Succeeded');
    });
  }

  it('a Draft model with no artifact still reports "needs training" (the status check runs after the artifact checks, D2-C3)', async () => {
    const model = new FakeMLModel();
    model.Status = 'Draft';
    model.ArtifactFileID = null;
    const { deps } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toBeInstanceOf(ModelNeedsTrainingError);
  });

  it('refuses an Archived model with ModelNotScorableError even when its artifact was purged (F1)', async () => {
    const model = new FakeMLModel();
    model.Status = 'Archived';
    model.ArtifactFileID = null;
    const { deps } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toBeInstanceOf(ModelNotScorableError);
  });
});

describe('MLModelInferenceProcessor — shadow scoring integration (D3, D10, D13)', () => {
  const challengerConfig: MJRecordProcessEntity_IRecordProcessChallengerConfig = {
    Enabled: true,
    SampleRate: 1.0,
    WorkType: 'ML Model',
    ChallengerModelID: 'model-challenger-2',
    MaxLatencyMs: 50,
  };

  it('converts MatrixToFeatureRows exactly ONCE for an N-record batch and maps each record to its own feature row (D3, D13)', async () => {
    const { deps } = buildDeps();
    const publishedEnvelopes: ShadowScoreEnvelope[] = [];
    const shadowCoordinator = new ShadowScoringCoordinator({
      WorkQueuePublisher: {
        PublishShadowItem: async (env) => {
          publishedEnvelopes.push(env);
        },
      },
    });

    const proc = new MLModelInferenceProcessor(
      {
        modelId: 'model-1',
        deps,
        recordProcessId: 'rp-batch-1',
        challengerConfig,
        shadowCoordinator,
      },
      new TestAssembler(new InMemoryDataAccess()),
    );

    const spy = vi.spyOn(MLModelInferenceProcessor, 'MatrixToFeatureRows');
    try {
      const records = [
        memberRecord('m1', 10, 1, 'NYC'),
        memberRecord('m2', 20, 2, 'LA'),
        memberRecord('m3', 30, 3, 'NYC'),
        memberRecord('m4', 40, 4, 'LA'),
      ];
      const results = await proc.ProcessBatch(records, { ...CTX, RecordProcessID: 'rp-batch-1' });
      await shadowCoordinator.FlushInFlight();

      expect(results).toHaveLength(4);
      expect(results.every((r) => r.Status === 'Succeeded')).toBe(true);
      // D3: MatrixToFeatureRows must be called once for the batch, not once + N times
      expect(spy).toHaveBeenCalledTimes(1);

      // D13: Each record in the batch gets its own row-aligned FrozenFeatures
      expect(publishedEnvelopes).toHaveLength(4);
      expect(publishedEnvelopes.map((e) => e.RecordID)).toEqual(['m1', 'm2', 'm3', 'm4']);
      expect(publishedEnvelopes[0].FrozenFeatures).toEqual({ tenure: 10, events_at_signup: 1, city: 'NYC' });
      expect(publishedEnvelopes[1].FrozenFeatures).toEqual({ tenure: 20, events_at_signup: 2, city: 'LA' });
      expect(publishedEnvelopes[2].FrozenFeatures).toEqual({ tenure: 30, events_at_signup: 3, city: 'NYC' });
      expect(publishedEnvelopes[3].FrozenFeatures).toEqual({ tenure: 40, events_at_signup: 4, city: 'LA' });
    } finally {
      spy.mockRestore();
    }
  });

  it('checks ShouldSample BEFORE constructing envelopes and skips shadow dispatch completely when DryRun is true (D3, D13)', async () => {
    const { deps } = buildDeps();
    let dispatchCalls = 0;
    const shadowCoordinator = new ShadowScoringCoordinator({
      Rng: () => 0.99, // above SampleRate 0.10 -> not sampled
      WorkQueuePublisher: {
        PublishShadowItem: async () => {
          dispatchCalls++;
        },
      },
    });

    const procUnsampled = new MLModelInferenceProcessor(
      {
        modelId: 'model-1',
        deps,
        challengerConfig: { ...challengerConfig, SampleRate: 0.1 },
        shadowCoordinator,
      },
      new TestAssembler(new InMemoryDataAccess()),
    );

    await procUnsampled.ProcessRecord(memberRecord('m1', 12, 3, 'NYC'), CTX);
    await shadowCoordinator.FlushInFlight();
    expect(dispatchCalls).toBe(0);

    // Now with SampleRate 1.0 but DryRun = true -> must skip shadow dispatch
    const alwaysSampleCoordinator = new ShadowScoringCoordinator({
      WorkQueuePublisher: {
        PublishShadowItem: async () => {
          dispatchCalls++;
        },
      },
    });
    const procDryRun = new MLModelInferenceProcessor(
      {
        modelId: 'model-1',
        deps,
        challengerConfig,
        shadowCoordinator: alwaysSampleCoordinator,
      },
      new TestAssembler(new InMemoryDataAccess()),
    );

    const dryResult = await procDryRun.ProcessRecord(memberRecord('m1', 12, 3, 'NYC'), {
      ...CTX,
      DryRun: true,
    });
    await alwaysSampleCoordinator.FlushInFlight();
    expect(dryResult.Status).toBe('Succeeded');
    expect(dispatchCalls).toBe(0);
  });

  it('records per-record amortized champion latency in ProcessBatch rather than full batch latency (D10)', async () => {
    const { deps } = buildDeps();
    deps.sidecar = {
      predict: async (req: PredictRequest): Promise<PredictResponse> => {
        await new Promise((r) => setTimeout(r, 80));
        return { predictions: (req.rows ?? []).map(() => ({ score: 0.75, class: 'renew' })) };
      },
    };

    const publishedEnvelopes: ShadowScoreEnvelope[] = [];
    const shadowCoordinator = new ShadowScoringCoordinator({
      WorkQueuePublisher: {
        PublishShadowItem: async (env) => {
          publishedEnvelopes.push(env);
        },
      },
    });

    const proc = new MLModelInferenceProcessor(
      {
        modelId: 'model-1',
        deps,
        challengerConfig,
        shadowCoordinator,
      },
      new TestAssembler(new InMemoryDataAccess()),
    );

    const batchSize = 4;
    const records = Array.from({ length: batchSize }, (_, i) => memberRecord(`m${i}`, 10 + i, 2, 'NYC'));
    const startedAt = Date.now();
    await proc.ProcessBatch(records, CTX);
    const totalWallMs = Date.now() - startedAt;
    await shadowCoordinator.FlushInFlight();

    expect(publishedEnvelopes).toHaveLength(batchSize);
    for (const env of publishedEnvelopes) {
      expect(env.ChampionLatencyMs).toBeDefined();
      // Per-record latency is batch time / 4, strictly less than half the total batch wall-clock duration
      expect(env.ChampionLatencyMs!).toBeLessThan(totalWallMs * 0.6);
      expect(env.ChampionLatencyMs!).toBeGreaterThan(0);
    }
  });

  it('never fails the champion or mutates the target business entity when the challenger times out or throws (D13)', async () => {
    const { deps } = buildDeps();
    const auditRecords: ShadowFeatureValueAuditRecord[] = [];
    const shadowCoordinator = new ShadowScoringCoordinator({
      ChallengerRunner: {
        RunChallenger: async (env) => {
          // Challenger attempts to mutate FrozenFeatures and then times out
          expect(Object.isFrozen(env.FrozenFeatures)).toBe(true);
          await new Promise((r) => setTimeout(r, 120));
          throw new Error('Challenger exploded');
        },
      },
      AuditSink: {
        RecordShadowAudit: async (rec) => {
          auditRecords.push(rec);
        },
      },
    });

    const proc = new MLModelInferenceProcessor(
      {
        modelId: 'model-1',
        deps,
        challengerConfig: { ...challengerConfig, MaxLatencyMs: 20 },
        shadowCoordinator,
      },
      new TestAssembler(new InMemoryDataAccess()),
    );

    // Pass a real business entity double into ProcessRecord and verify the processor + challenger leave it untouched
    const businessEntityFields = {
      ID: 'mem-real-1',
      tenure: 15,
      events_at_signup: 4,
      city: 'NYC',
      RenewalProbability: 0.11,
      RenewalStatus: 'Existing',
    };
    let setCalledOnBusinessEntity = false;
    const businessEntityDouble = {
      GetAll: () => ({ ...businessEntityFields }),
      Set: () => {
        setCalledOnBusinessEntity = true;
      },
    };

    const championResult = await proc.ProcessRecord(
      {
        EntityID: 'ent-members',
        RecordID: 'mem-real-1',
        Record: businessEntityDouble,
      },
      CTX,
    );

    expect(championResult.Status).toBe('Succeeded');
    const payload = championResult.ResultPayload as MLInferenceResultPayload;
    expect(payload.score).toBeCloseTo(0.5, 5);
    expect(payload.class).toBe('renew');

    await shadowCoordinator.FlushInFlight();

    // Challenger timed out and was recorded as Role = 'Challenger'
    expect(auditRecords).toHaveLength(1);
    expect(auditRecords[0].Role).toBe('Challenger');
    expect(auditRecords[0].TimedOut).toBe(true);

    // Target business entity was never mutated by the processor or the shadow challenger
    expect(setCalledOnBusinessEntity).toBe(false);
    expect(businessEntityFields).toEqual({
      ID: 'mem-real-1',
      tenure: 15,
      events_at_signup: 4,
      city: 'NYC',
      RenewalProbability: 0.11,
      RenewalStatus: 'Existing',
    });
  });

  it('skips challengerConfig with WorkType !== "ML Model" and logs a single error on construction instead of per record (R7)', async () => {
    const { deps } = buildDeps();
    const errorLogs: string[] = [];
    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map((a) => String(a)).join(' '));
    };

    try {
      let publishedCount = 0;
      const shadowCoordinator = new ShadowScoringCoordinator({
        WorkQueuePublisher: {
          PublishShadowItem: async () => {
            publishedCount++;
          },
        },
      });

      const proc = new MLModelInferenceProcessor(
        {
          modelId: 'model-1',
          deps,
          recordProcessId: 'rp-mismatched-wt',
          challengerConfig: {
            Enabled: true,
            SampleRate: 1.0,
            WorkType: 'Infer',
            ChallengerPromptID: 'prompt-challenger-1',
            ChallengerModelID: 'model-challenger-ignored',
            MaxLatencyMs: 50,
          },
          shadowCoordinator,
        },
        new TestAssembler(new InMemoryDataAccess()),
      );

      expect(errorLogs.filter((m) => m.includes('WorkType')).length).toBe(1);

      await proc.ProcessRecord(memberRecord('m1', 10, 1, 'NYC'), CTX);
      await proc.ProcessRecord(memberRecord('m2', 20, 2, 'LA'), CTX);
      await proc.ProcessRecord(memberRecord('m3', 30, 3, 'NYC'), CTX);
      await shadowCoordinator.FlushInFlight();

      expect(publishedCount).toBe(0);
      expect(errorLogs.filter((m) => m.includes('WorkType')).length).toBe(1);
    } finally {
      console.error = origConsoleError;
    }
  });
});
