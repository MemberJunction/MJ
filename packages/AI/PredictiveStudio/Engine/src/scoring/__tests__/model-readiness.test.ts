import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { PredictRequest, PredictResponse, FeatureSchemaEntry } from '@memberjunction/predictive-studio-core';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor } from '../ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../artifact-loader';
import {
  ModelHasTrainedArtifact,
  ModelNeedsTrainingMessage,
  ArtifactUnavailableError,
  ModelNeedsTrainingError,
  ModelNotScorableError,
  ModelNotServableError,
  ModelReadiness,
} from '../model-readiness';
import type { AutoTrainRequest, IMLModelLoader, IModelAutoTrainer, ISidecarPredictor, MLInferenceDeps } from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult } from '../../feature-assembly';
import { GateTestStore, GateWorld, type Row } from '../../__tests__/fakes/gate-test-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';

/** The models in these tests are legacy models: their pipelines point at no Prediction Unit. */
const NO_PIPELINE_UNITS = { PredictionUnitIDOf: async (): Promise<string | null> => null };
/** A model trained without a Training Snapshot: no record was a training row. */
const NO_TRAINING_ROWS = { TrainingRowIDsOf: async (): Promise<ReadonlySet<string>> => new Set<string>() };


/**
 * Unit tests for the "needs training" guard and the opt-in train-if-untrained path.
 * No DB, no sidecar — every seam is an in-memory fake.
 */

const SCHEMA: FeatureSchemaEntry[] = [{ Name: 'tenure', Kind: 'numeric' }];

/** The registered SHA-256 of the bytes each test stores under a file id (`setup` stores `file-1`, the auto-trainer `file-trained`). */
const REGISTERED_SHA256: Record<string, string> = {
  'file-1': SnapshotHash.Sha256Hex(new TextEncoder().encode('bytes')),
  'file-trained': SnapshotHash.Sha256Hex(new TextEncoder().encode('trained-bytes')),
  'file-elsewhere': SnapshotHash.Sha256Hex(new TextEncoder().encode('bytes stored on another host')),
};

/** The stored `MJ: ML Models` row of a test model: exactly the columns the processor reads. */
class FakeModel {
  public Status: MJMLModelEntity['Status'] = 'Published';
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
  public ArtifactStatus: MJMLModelEntity['ArtifactStatus'] = 'verified';
  public ArtifactCheckedAt: Date | null = null;
  public ArtifactSha256: string | null;
  constructor(public ID: string, public ArtifactFileID: string | null) {
    this.ArtifactSha256 = ArtifactFileID === null ? null : REGISTERED_SHA256[ArtifactFileID] || null;
  }
  /** The row the store holds for this model. */
  public ToRow(): Row {
    return {
      ID: this.ID, Status: this.Status, FittedPreprocessing: this.FittedPreprocessing, FeatureSchema: this.FeatureSchema, ProblemType: this.ProblemType,
      TargetVariable: this.TargetVariable, Lineage: this.Lineage, ArtifactStatus: this.ArtifactStatus, ArtifactCheckedAt: this.ArtifactCheckedAt,
      ArtifactSha256: this.ArtifactSha256, ArtifactFileID: this.ArtifactFileID,
    };
  }
}

/** The model loader over the store: the model's row as an entity object, read as the run's user on the run's provider. */
class StoreModelLoader implements IMLModelLoader {
  async loadModel(id: string, contextUser: UserInfo | undefined, provider: IMetadataProvider): Promise<MJMLModelEntity | null> {
    const r = await RunView.FromMetadataProvider(provider).RunView<MJMLModelEntity>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(id)}'`, MaxRows: 1, ResultType: 'entity_object' },
      contextUser,
    );
    return r.Results[0] || null;
  }
}

class FakeSidecar implements ISidecarPredictor {
  async predict(req: PredictRequest): Promise<PredictResponse> {
    return { predictions: (req.rows || []).map(() => ({ score: 0.8, class: 'Renewed', probabilities: null })), classOrder: null };
  }
}

class NoDataAccess implements IFeatureDataAccess {
  async fetchRows(_p: FetchRowsParams): Promise<FetchRowsResult> {
    return { Success: true, Rows: [], TotalRowCount: 0 };
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

/** Auto-trainer fake: records the request and "trains" by storing a new model. */
class FakeAutoTrainer implements IModelAutoTrainer {
  public Requests: AutoTrainRequest[] = [];
  constructor(private readonly models: GateTestStore, private readonly artifacts: InMemoryArtifactLoader) {}
  async EnsureTrainedModel(request: AutoTrainRequest): Promise<string> {
    this.Requests.push(request);
    this.models.Insert('MJ: ML Models', new FakeModel('trained-1', 'file-trained').ToRow());
    this.artifacts.Set('file-trained', new TextEncoder().encode('trained-bytes'));
    return 'trained-1';
  }
}

/** The run context of the current test, over the store {@link setup} built. */
let CTX: RecordProcessorContext;

function record(id: string, tenure: number): RecordRef {
  return { EntityID: 'ent', RecordID: id, Record: { ID: id, tenure } };
}

/** A store holding `models`, the run context over it, and the deps the processor reads them through. */
function setup(models: FakeModel[]): { deps: MLInferenceDeps; map: GateTestStore; artifacts: InMemoryArtifactLoader } {
  const map = new GateTestStore();
  for (const m of models) map.Insert('MJ: ML Models', m.ToRow());
  CTX = { ContextUser: GateWorld.User, Provider: map.Provider(), RecordProcessID: 'rp-1' };
  const artifacts = new InMemoryArtifactLoader();
  artifacts.Set('file-1', new TextEncoder().encode('bytes'));
  return { deps: { modelLoader: new StoreModelLoader(), artifactLoader: artifacts, sidecar: new FakeSidecar(), pipelineUnits: NO_PIPELINE_UNITS, trainingRows: NO_TRAINING_ROWS }, map, artifacts };
}

describe('model readiness helpers', () => {
  it('treats a null / blank ArtifactFileID as needing training', () => {
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: null })).toBe(false);
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: '  ' })).toBe(false);
    expect(ModelHasTrainedArtifact({ ID: 'm', ArtifactFileID: 'file-1' })).toBe(true);
  });

  it('produces a plain, actionable message', () => {
    expect(ModelNeedsTrainingMessage('m-1')).toMatch(/needs training/);
  });
});

describe('ModelReadiness.IsServedByPredict (the sidecar /predict serves trainer predictors, not a forecast\'s series forecasters)', () => {
  const shippedBy = (shippedDriver: string) => ({ ID: 'm', Lineage: JSON.stringify({ shippedMember: 'x', shippedDriver }) });

  it('refuses a model whose shipped artifact is a series model or a series baseline', () => {
    for (const driver of ['ar1_const', 'trend_season_ols', 'trend_season_ar1', 'naive', 'seasonal-naive', 'mean']) {
      expect(ModelReadiness.IsServedByPredict(shippedBy(driver))).toBe(false);
    }
  });

  it('serves a tabular driver (a forecast unit\'s tabular finalist too) and a model whose Lineage names no shipped driver', () => {
    expect(ModelReadiness.IsServedByPredict(shippedBy('xgboost'))).toBe(true);
    expect(ModelReadiness.IsServedByPredict(shippedBy('logistic_regression'))).toBe(true);
    expect(ModelReadiness.IsServedByPredict({ ID: 'm', Lineage: null })).toBe(true);
    expect(ModelReadiness.IsServedByPredict({ ID: 'm', Lineage: JSON.stringify({ targetEntityName: 'Members' }) })).toBe(true);
  });

  it('says plainly why such a model cannot be published or score, and the error carries it', () => {
    expect(ModelReadiness.NotServedByPredictMessage('m-1')).toContain("ML Model 'm-1' cannot be published or score records: forecast models are not served by /predict yet");
    const error = new ModelNotServableError('m-1');
    expect([error.ModelID, error.message]).toEqual(['m-1', `MLModelInferenceProcessor: ${ModelReadiness.NotServedByPredictMessage('m-1')}`]);
  });

  it("lists exactly the sidecar's series algorithms and series baseline kinds (Sidecar/src/python/app/temporal.py)", () => {
    const python = readFileSync(fileURLToPath(new URL('../../../../Sidecar/src/python/app/temporal.py', import.meta.url)), 'utf8');
    const algos = /^SERIES_ALGOS: Tuple\[SeriesAlgo, \.\.\.\] = \(([^)]*)\)$/m.exec(python);
    const baselines = /^BaselineKind = Literal\[([^\]]*)\]$/m.exec(python);
    if (algos === null || baselines === null) throw new Error('temporal.py no longer declares SERIES_ALGOS and BaselineKind as this test reads them');
    const quoted = (list: string) => [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect([...ModelReadiness.SeriesForecasterDrivers].sort()).toEqual([...quoted(algos[1]), ...quoted(baselines[1])].sort());
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
    const attempt = proc.Preflight(CTX);
    await expect(attempt).rejects.toBeInstanceOf(ModelNeedsTrainingError);
    await expect(attempt).rejects.toThrow(/needs training/);
  });

  it('refuses a model whose artifact bytes are missing on this server as artifact-missing, not "needs training"', async () => {
    const { deps } = setup([new FakeModel('model-1', 'file-elsewhere')]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler());
    const attempt = proc.Preflight(CTX);
    await expect(attempt).rejects.toBeInstanceOf(ArtifactUnavailableError);
    await expect(attempt).rejects.toMatchObject({ Refusal: { kind: 'artifact-missing', fileId: 'file-elsewhere' } });
    await expect(attempt).rejects.toThrow("MLModelInferenceProcessor: ML Model 'model-1': its model artifact file 'file-elsewhere' is missing from storage");
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
    expect(result).toMatchObject({ Status: 'Succeeded', ResultPayload: { modelId: 'trained-1' } });
  });

  it('trains when no model is configured yet (empty modelId)', async () => {
    const { deps, map, artifacts } = setup([]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: '', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight(CTX);
    expect(trainer.Requests[0].currentModelId).toBeNull();
  });

  it('trains when the configured model\'s artifact is missing (artifact-missing), then scores with the trained model', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', 'file-elsewhere')]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight(CTX);
    expect(trainer.Requests.map((r) => r.currentModelId)).toEqual(['model-1']);
    expect((await proc.ProcessRecord(record('r1', 3), CTX)).Status).toBe('Succeeded');
  });

  it('does not train for an artifact that does not match its registered hash, or has none: a retrain must not paper over either', async () => {
    const swapped = new FakeModel('model-1', 'file-1');
    swapped.ArtifactSha256 = 'f'.repeat(64);
    const unregistered = new FakeModel('model-2', 'file-1');
    unregistered.ArtifactSha256 = null;
    const { deps, map, artifacts } = setup([swapped, unregistered]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    for (const [modelId, kind] of [['model-1', 'artifact-hash-mismatch'], ['model-2', 'artifact-unverified']] as const) {
      const proc = new MLModelInferenceProcessor({ modelId, deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
      await expect(proc.Preflight(CTX)).rejects.toMatchObject({ Refusal: { kind } });
    }
    expect(trainer.Requests).toHaveLength(0);
  });

  it('does not train for a model that is already trained', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', 'file-1')]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight(CTX);
    expect(trainer.Requests).toHaveLength(0);
  });

  it('does not train in a dry run: an untrained model is refused with ModelNeedsTrainingError', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', null)]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
    await expect(proc.Preflight({ ...CTX, DryRun: true })).rejects.toBeInstanceOf(ModelNeedsTrainingError);
    expect(trainer.Requests).toHaveLength(0);
    expect(map.Row('MJ: ML Models', 'trained-1')).toBeUndefined();
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

describe('MLModelInferenceProcessor.Preflight — auto-train reacts to model-not-published (M4b.2)', () => {
  it('a configured model that is not Published and may not score (Archived, KeepBaseline, Unevaluated) triggers auto-train, which retargets the run', async () => {
    for (const status of ['Archived', 'KeepBaseline', 'Unevaluated'] as const) {
      const configured = new FakeModel('model-1', 'file-1');
      configured.Status = status;
      const { deps, map, artifacts } = setup([configured]);
      const trainer = new FakeAutoTrainer(map, artifacts);
      const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain: { pipelineId: 'pipe-1' }, autoTrainer: trainer }, new TestAssembler());
      await proc.Preflight(CTX);
      expect([status, trainer.Requests.map((r) => r.currentModelId)]).toEqual([status, ['model-1']]);
      expect(await proc.ProcessRecord(record('r1', 3), CTX)).toMatchObject({ Status: 'Succeeded', ResultPayload: { modelId: 'trained-1' } });
    }
  });

  it('without auto-train the not-scorable status is refused as before', async () => {
    const configured = new FakeModel('model-1', 'file-1');
    configured.Status = 'Archived';
    const { deps } = setup([configured]);
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler());
    await expect(proc.Preflight(CTX)).rejects.toBeInstanceOf(ModelNotScorableError);
  });

  it('passes the Process Run, the retry window and the withheld-notification flag to the auto-trainer', async () => {
    const { deps, map, artifacts } = setup([new FakeModel('model-1', null)]);
    const trainer = new FakeAutoTrainer(map, artifacts);
    const autoTrain = { pipelineId: 'pipe-1', retryAfterHours: 6, notifyOnWithheld: false };
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps, autoTrain, autoTrainer: trainer }, new TestAssembler());
    await proc.Preflight({ ...CTX, ProcessRunID: 'process-run-1' });
    expect(trainer.Requests).toEqual([
      { pipelineId: 'pipe-1', currentModelId: 'model-1', recordProcessId: 'rp-1', binding: undefined, processRunId: 'process-run-1', retryAfterHours: 6, notifyOnWithheld: false },
    ]);
  });
});
