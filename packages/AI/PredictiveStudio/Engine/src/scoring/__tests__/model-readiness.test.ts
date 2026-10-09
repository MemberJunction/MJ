import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PredictRequest, PredictResponse, FeatureSchemaEntry } from '@memberjunction/predictive-studio-core';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor, type MLInferenceResultPayload } from '../ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../artifact-loader';
import {
  ModelHasTrainedArtifact,
  ModelNeedsTrainingMessage,
  ModelArtifactMissingMessage,
  ModelNeedsTrainingError,
} from '../model-readiness';
import { PipelineAutoTrainer } from '../auto-train';
import type { AutoTrainRequest, IMLModelLoader, IModelAutoTrainer, ISidecarPredictor, MLInferenceDeps } from '../types';
import type { IModelPromotionGate, PromoteModelOutcome, PromoteModelRequest } from '../../actions/promote-model.action';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult } from '../../feature-assembly';

/**
 * Unit tests for the "needs training" guard and the opt-in train-if-untrained path.
 * No DB, no sidecar — every seam is an in-memory fake.
 */

const SCHEMA: FeatureSchemaEntry[] = [{ Name: 'tenure', Kind: 'numeric' }];

/** A model fake exposing exactly what the processor reads. */
class FakeModel {
  public FittedPreprocessing: string | null = '{}';
  public FeatureSchema = JSON.stringify(SCHEMA);
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TargetVariable = 'RenewalOutcome';
  public Lineage: string | null = JSON.stringify({
    targetEntityName: 'Members',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Members' }],
    featureSteps: { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure'] }] },
    asOfStrategy: { Mode: 'none' },
  });
  constructor(public ID: string, public ArtifactFileID: string | null) {}
}

/** Loader fake keyed by model id. */
class MapModelLoader implements IMLModelLoader {
  public Requested: string[] = [];
  constructor(private readonly models: Map<string, FakeModel>) {}
  async loadModel(id: string): Promise<MJMLModelEntity | null> {
    this.Requested.push(id);
    return (this.models.get(id) ?? null) as unknown as MJMLModelEntity | null;
  }
}

class FakeSidecar implements ISidecarPredictor {
  async predict(req: PredictRequest): Promise<PredictResponse> {
    return { predictions: (req.rows ?? []).map(() => ({ score: 0.8, class: 'Renewed' })) };
  }
}

class NoDataAccess implements IFeatureDataAccess {
  async fetchRows(_p: FetchRowsParams): Promise<FetchRowsResult> {
    return { Success: true, Rows: [] };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

class TestAssembler extends FeatureAssemblyExecutor {
  public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
    return super.assemble({ ...params, dataAccess: new NoDataAccess() });
  }
}

/** Auto-trainer fake: records the request and "trains" by registering a new model. */
class FakeAutoTrainer implements IModelAutoTrainer {
  public Requests: AutoTrainRequest[] = [];
  constructor(private readonly models: Map<string, FakeModel>, private readonly artifacts: InMemoryArtifactLoader) {}
  async EnsureTrainedModel(request: AutoTrainRequest): Promise<string> {
    this.Requests.push(request);
    this.models.set('trained-1', new FakeModel('trained-1', 'file-trained'));
    this.artifacts.Set('file-trained', new TextEncoder().encode('trained-bytes'));
    return 'trained-1';
  }
}

const CTX: RecordProcessorContext = {
  contextUser: undefined as unknown as UserInfo,
  provider: undefined as unknown as IMetadataProvider,
  recordProcessID: 'rp-1',
};

function record(id: string, tenure: number): RecordRef {
  return { EntityID: 'ent', RecordID: id, Record: { ID: id, tenure } };
}

function setup(models: FakeModel[]): { deps: MLInferenceDeps; map: Map<string, FakeModel>; artifacts: InMemoryArtifactLoader } {
  const map = new Map(models.map((m) => [m.ID, m]));
  const artifacts = new InMemoryArtifactLoader();
  artifacts.Set('file-1', new TextEncoder().encode('bytes'));
  return { deps: { modelLoader: new MapModelLoader(map), artifactLoader: artifacts, sidecar: new FakeSidecar() }, map, artifacts };
}

describe('model readiness helpers', () => {
  it('treats a null / blank ArtifactFileID as needing training', () => {
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: null })).toBe(false);
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: '  ' })).toBe(false);
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: 'file-1' })).toBe(true);
  });

  it('produces plain, actionable messages', () => {
    expect(ModelNeedsTrainingMessage('m-1')).toMatch(/needs training/);
    expect(ModelArtifactMissingMessage('m-1', 'f-1')).toMatch(/needs training on this server/);
  });
});

describe('MLModelInferenceProcessor.Preflight — needs-training refusal', () => {
  it('passes for a trained model with a loadable artifact', async () => {
    const { deps } = setup([new FakeModel('model-1', 'file-1')]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler());
    await expect(proc.Preflight(CTX)).resolves.toBeUndefined();
  });

  it('refuses a model with no artifact with a ModelNeedsTrainingError', async () => {
    const { deps } = setup([new FakeModel('model-1', null)]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler());
    const err = await proc.Preflight(CTX).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelNeedsTrainingError);
    expect((err as Error).message).toMatch(/needs training/);
  });

  it('refuses a model whose artifact bytes are missing on this server', async () => {
    const { deps } = setup([new FakeModel('model-1', 'file-elsewhere')]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler());
    await expect(proc.Preflight(CTX)).rejects.toThrow(/needs training on this server/);
  });

  it('ignores autoTrain when no trainer is wired (plain refusal)', async () => {
    const { deps } = setup([new FakeModel('model-1', null)]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' } }, new TestAssembler());
    await expect(proc.Preflight(CTX)).rejects.toBeInstanceOf(ModelNeedsTrainingError);
  });
});

describe('MLModelInferenceProcessor.Preflight — opt-in auto-train', () => {
  it('trains, retargets the run at the trained model, and then scores with it', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', null)]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor(
      { modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1', binding: { targetColumn: 'Score' } }, autoTrainer: trainer },
      new TestAssembler(),
    );

    await proc.Preflight(CTX);
    expect(trainer.Requests).toEqual([
      { pipelineId: 'pipe-1', currentModelId: 'model-1', recordProcessId: 'rp-1', binding: { targetColumn: 'Score' } },
    ]);

    const result = await proc.ProcessRecord(record('r1', 3), CTX);
    expect(result.Status).toBe('Succeeded');
    expect((result.ResultPayload as MLInferenceResultPayload).modelId).toBe('trained-1');
  });

  it('trains when no model is configured yet (empty modelId)', async () => {
    const { deps, map, artifacts } = setup([]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: '', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight(CTX);
    expect(trainer.Requests[0].currentModelId).toBeNull();
  });

  it('does not train for a model that is already trained', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', 'file-1')]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight(CTX);
    expect(trainer.Requests).toHaveLength(0);
  });

  it('does not train on a failure that is not "needs training"', async () => {
    const throwingLoader: IMLModelLoader = {
      loadModel: async () => {
        throw new Error('database unavailable');
      },
    };
    const { map, artifacts } = setup([]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const deps: MLInferenceDeps = { modelLoader: throwingLoader, artifactLoader: artifacts, sidecar: new FakeSidecar() };
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await expect(proc.Preflight(CTX)).rejects.toThrow(/database unavailable/);
    expect(trainer.Requests).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// PipelineAutoTrainer — reuse vs train+publish, with the DB-touching steps stubbed.
// ---------------------------------------------------------------------------

class RecordingGate implements IModelPromotionGate {
  public Calls: Array<{ modelId: string; targetStatus: string }> = [];
  constructor(private readonly refuse?: PromoteModelOutcome) {}
  async promote(request: PromoteModelRequest): Promise<PromoteModelOutcome> {
    this.Calls.push({ modelId: request.modelId, targetStatus: request.targetStatus });
    if (this.refuse && request.targetStatus !== 'Archived') return this.refuse;
    return { kind: 'promoted', newStatus: request.targetStatus };
  }
}

class TestableAutoTrainer extends PipelineAutoTrainer {
  public Repointed: string[] = [];
  public TrainCount = 0;
  constructor(gate: IModelPromotionGate, private readonly reusable: string | null) {
    super({
      gate,
      train: async () => {
        this.TrainCount++;
        return { ID: 'new-model', Status: 'Draft' } as unknown as MJMLModelEntity;
      },
    });
  }
  protected override async findReusableModel(): Promise<string | null> {
    return this.reusable;
  }
  protected override async repoint(_r: AutoTrainRequest, modelId: string): Promise<void> {
    this.Repointed.push(modelId);
  }
}

const USER = undefined as unknown as UserInfo;
const PROVIDER = undefined as unknown as IMetadataProvider;
const PIPE = '8A1C44F3-938C-4E65-B6DE-D621BC4C3001';
const OLD = 'E93F0238-6902-4521-87D9-FE9A1201B001';

describe('PipelineAutoTrainer', () => {
  it('trains, publishes (Validated → Published), repoints, and archives the superseded model', async () => {
    const gate = new RecordingGate();
    const trainer = new TestableAutoTrainer(gate, null);
    const id = await trainer.EnsureTrainedModel({ pipelineId: PIPE, currentModelId: OLD, recordProcessId: null }, USER, PROVIDER);
    expect(id).toBe('new-model');
    expect(trainer.TrainCount).toBe(1);
    expect(gate.Calls).toEqual([
      { modelId: 'new-model', targetStatus: 'Validated' },
      { modelId: 'new-model', targetStatus: 'Published' },
      { modelId: OLD, targetStatus: 'Archived' },
    ]);
    expect(trainer.Repointed).toEqual(['new-model']);
  });

  it('reuses an already-published, loadable model instead of retraining', async () => {
    const gate = new RecordingGate();
    const trainer = new TestableAutoTrainer(gate, 'existing-model');
    const id = await trainer.EnsureTrainedModel({ pipelineId: PIPE, currentModelId: null, recordProcessId: null }, USER, PROVIDER);
    expect(id).toBe('existing-model');
    expect(trainer.TrainCount).toBe(0);
    expect(trainer.Repointed).toEqual(['existing-model']);
  });

  it('refuses to publish a leakage-flagged model and says it needs human sign-off', async () => {
    const gate = new RecordingGate({ kind: 'refused-leakage', topFeature: 'cancelled_flag', topShare: 0.95 });
    const trainer = new TestableAutoTrainer(gate, null);
    await expect(
      trainer.EnsureTrainedModel({ pipelineId: PIPE, currentModelId: null, recordProcessId: null }, USER, PROVIDER),
    ).rejects.toThrow(/human sign-off/);
    expect(trainer.Repointed).toHaveLength(0);
  });

  it('rejects a malformed pipeline id before touching anything', async () => {
    const trainer = new TestableAutoTrainer(new RecordingGate(), null);
    await expect(
      trainer.EnsureTrainedModel({ pipelineId: "x' OR 1=1 --", currentModelId: null, recordProcessId: null }, USER, PROVIDER),
    ).rejects.toThrow(/not a valid/);
    expect(trainer.TrainCount).toBe(0);
  });
});
