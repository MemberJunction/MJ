import { describe, it, expect, vi } from 'vitest';
import type { UserInfo, IMetadataProvider, BaseEntity, RunViewParams, RunViewResult } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
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
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import { TrainingEngine } from '../../training/training-engine';
import { TrainingRefusedError } from '../../training/training-refusal';
import type { TrainingDeps } from '../../training/types';
import { TableDataAccess } from '../../__tests__/fakes/table-data-access';
import { FakePredictionUnitStore, UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { PredictionUnitRowReader } from '../../prediction-unit/unit-row-reader';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
} from '../../feature-assembly';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

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
  public PipelineID = 'pipe-members';
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
  artifacts.Set('file-1', new TextEncoder().encode('fake-model-bytes'));
  // The members pipeline has no Prediction Unit: these models are legacy models.
  const noUnits = { PredictionUnitIDOf: async () => null };
  return { deps: { modelLoader: loader, artifactLoader: artifacts, sidecar, pipelineUnits: noUnits }, loader, sidecar, artifacts };
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
    const errors = ConsoleCapture.Errors();
    const { deps } = buildDeps(null);
    const proc = buildProcessor(deps);
    const result = await proc.ProcessRecord(memberRecord('m1', 1, 1, 'NYC'), CTX);
    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toMatch(/not found/);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("MLModelInferenceProcessor: scoring failed for record 'm1': MLModelInferenceProcessor: ML Model 'model-1' not found")]);
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

describe('MatrixToFeatureRows — frozen-schema mapping', () => {
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
    // The empty lineage sends the processor to the pipeline row for its steps; that row has none to offer either.
    const pipelineQueries: string[] = [];
    const provider = {
      RunView: async (params: RunViewParams): Promise<RunViewResult<Record<string, string>>> => {
        pipelineQueries.push(`${params.EntityName}|${params.ExtraFilter}`);
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
      },
    } as unknown as IMetadataProvider;
    const errors = ConsoleCapture.Errors();

    const result = await proc.ProcessRecord(memberRecord('m1', 1, 1, 'NYC'), { ...CTX, Provider: provider });
    expect(result.Status).toBe('Failed');
    expect(result.ErrorMessage).toMatch(/feature assembly produced 0 columns/);
    expect(pipelineQueries).toEqual(["MJ: ML Training Pipelines|ID='pipe-members'"]);
    expect(ConsoleCapture.Lines(errors)).toEqual([
      expect.stringContaining("MLModelInferenceProcessor: scoring failed for record 'm1': MLModelInferenceProcessor: feature assembly produced 0 columns for model 'model-1'"),
    ]);
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
      const errors = ConsoleCapture.Errors();
      const results = await buildProcessor(deps).ProcessBatch([memberRecord('a', 3, 1, 'NYC'), memberRecord('b', 5, 2, 'LA')], CTX);
      expect(results.map((r) => r.Status)).toEqual(['Failed', 'Failed']);
      expect(results[0].ErrorMessage).toContain('cannot score records');
      expect(sidecar.Requests).toHaveLength(0);
      expect(ConsoleCapture.Lines(errors)).toEqual([
        expect.stringContaining(`MLModelInferenceProcessor: batch scoring failed: MLModelInferenceProcessor: ML Model 'model-1' is ${status} and cannot score records`),
      ]);
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

// ---------------------------------------------------------------------------
// Models trained on a Prediction Unit: assembled as of each row's decision date by the same assembler as training.
// ---------------------------------------------------------------------------

describe('MLModelInferenceProcessor — Prediction Unit models', () => {
  const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['EventsAttended'] }, { Id: 's2', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
  const entityIDs: Record<string, string> = { Years: UnitYearsWorld.YearsEntity.ID, People: UnitYearsWorld.PeopleEntity.ID };
  /** The provider slice scoring reads: entity lookups by name and by ID (one deliberate test-double cast at the seam). */
  const provider = {
    EntityByName: (name: string) => (entityIDs[name] ? { ID: entityIDs[name], Name: name } : undefined),
    EntityByID: (id: string) => {
      const name = Object.keys(entityIDs).find((n) => entityIDs[n].toLowerCase() === id.toLowerCase());
      return name ? { ID: entityIDs[name], Name: name } : undefined;
    },
  } as unknown as IMetadataProvider;
  const user = { ID: 'user-1' } as UserInfo;
  const ctx = (entityID?: string): RecordProcessorContext => ({ ContextUser: user, Provider: provider, ...(entityID ? { EntityID: entityID } : {}) });

  /** The training-side deps over the unit world: the pipeline row, the unit store, the metadata and the tables. */
  function trainingDeps(dataAccess: TableDataAccess): TrainingDeps {
    const pipeline = {
      ID: 'pipe-u', Version: 1, PredictionUnitID: UnitYearsWorld.UnitID, TargetEntity: 'Years', TargetVariable: '__ps_label', ProblemType: 'classification',
      Algorithm: 'xgboost', AlgorithmID: 'algo', Hyperparameters: '{}', SourceBindings: '[]', FeatureSteps: JSON.stringify(steps), AsOfStrategy: null,
      LeakageGuard: JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 }), ValidationStrategy: null, EvaluationProtocolID: null,
    } as unknown as MJMLTrainingPipelineEntity;
    const unused = async (): Promise<never> => { throw new Error('not used by assembly'); };
    return {
      entityFactory: { getEntityObject: unused },
      recordLoader: { loadPipeline: async () => pipeline, nextModelVersion: async () => 1 },
      sidecar: { train: unused },
      artifactStore: { save: unused, Delete: unused },
      contextUser: user,
      provider,
      predictionUnits: new FakePredictionUnitStore(UnitYearsWorld.UnitColumns()),
      assemblyMetadata: UnitYearsWorld.Metadata(),
      dataAccess,
    };
  }

  /** The pipeline → unit lookup: `pipe-u` points at the unit world's unit; any other pipeline has none. */
  const pipelineUnits = { PredictionUnitIDOf: async (pipelineId: string) => (pipelineId === 'pipe-u' ? UnitYearsWorld.UnitID : null) };

  /** A Validated unit model whose lineage carries what training stored: the unit, the feature spec and the kept levels. */
  async function unitModel(lineageOverride?: string, lookup: typeof pipelineUnits = pipelineUnits): Promise<{ deps: MLInferenceDeps; sidecar: FakeSidecar; training: Awaited<ReturnType<TrainingEngine['AssembleForTraining']>> }> {
    const dataAccess = new TableDataAccess(UnitYearsWorld.Tables());
    const training = await new TrainingEngine().AssembleForTraining('pipe-u', trainingDeps(dataAccess));
    if (training.Assembled.Status !== 'assembled') throw new Error('training assembly refused');
    const model = new FakeMLModel();
    model.Status = 'Validated';
    model.PipelineID = 'pipe-u';
    model.FeatureSchema = JSON.stringify(training.Assembled.Columns.map((c) => ({ Name: c.Name, Kind: c.Encoding === 'categorical' ? 'categorical' : 'numeric' })));
    model.Lineage = JSON.stringify({
      predictionUnitId: UnitYearsWorld.UnitID, predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'Years',
      featureSpec: training.Features, categoryLevels: Object.fromEntries(training.Assembled.CategoryLevels),
      trainingSnapshotId: 'TS-1', snapshotContentHash: 'a'.repeat(64),
      targetEntityName: 'Years', sourceBindings: [], featureSteps: steps, asOfStrategy: { Mode: 'none' },
    });
    if (lineageOverride !== undefined) model.Lineage = lineageOverride;
    const { deps, sidecar } = buildDeps(model);
    return { deps: { ...deps, pipelineUnits: lookup, predictionUnits: new FakePredictionUnitStore(UnitYearsWorld.UnitColumns()), assemblyMetadata: UnitYearsWorld.Metadata(), dataAccess }, sidecar, training };
  }

  it('refuses in Preflight a scope whose entity is not the unit row entity, as a typed refusal', async () => {
    const { deps } = await unitModel();
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps });
    await expect(processor.Preflight(ctx(UnitYearsWorld.PeopleEntity.ID))).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(processor.Preflight(ctx(UnitYearsWorld.PeopleEntity.ID))).rejects.toMatchObject({ Refusal: { stage: 'assembly', reason: { kind: 'scope-entity-mismatch', modelEntity: 'Years', scopeEntity: 'People' } } });
  });

  it('accepts a scope over the unit row entity (IDs compared case-insensitively)', async () => {
    const { deps } = await unitModel();
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx(UnitYearsWorld.YearsEntity.ID.toLowerCase()))).resolves.toBeUndefined();
  });

  it('assembles the same row values as training for the same record and decision date', async () => {
    const { deps, training } = await unitModel();
    if (training.Assembled.Status !== 'assembled') return;
    const scored = await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'y2024-2' }, { ID: 'y2025-2' }, { ID: 'y2025-0' }], ctx(), 'unit-rule');
    expect(scored.Status).toBe('assembled');
    if (scored.Status !== 'assembled') return;
    const trained = new Map(training.Assembled.Rows.map((r) => [r.RowId, r.Values]));
    expect(scored.Rows.map((r) => r.RowId)).toEqual(['y2024-2', 'y2025-2', 'y2025-0']);
    for (const r of scored.Rows) expect(r.Values).toEqual(trained.get(r.RowId));
    expect(scored.Rows[0].Values[1]).toBe('Active');   // the stored value is Lapsed; on this decision date it was Active
  });

  it('assembles every row as of one given date when a date is passed instead of the unit rule', async () => {
    const { deps } = await unitModel();
    const scored = await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'y2025-2' }], ctx(), new Date('2024-12-31T00:00:00Z'));
    expect(scored.Status === 'assembled' && scored.Rows[0].Values[1]).toBe('Active');
  });

  it('refuses to load a unit pipeline\'s model whose Lineage is not JSON, naming the model (never the current-value path)', async () => {
    const { deps } = await unitModel('{not json');
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx())).rejects.toThrow(/model 'model-1'/);
  });

  it('refuses to load a unit pipeline\'s model whose featureSpec entry has no encoding, naming the entry', async () => {
    const lineage = { predictionUnitId: 'U-1', predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'Years', categoryLevels: {}, featureSpec: [{ name: 'EventsAttended', source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, missing: { impute: 'median', indicator: true, constant: null } }] };
    const { deps } = await unitModel(JSON.stringify(lineage));
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx())).rejects.toThrow(/model 'model-1'.*featureSpec\[0\].*encoding/);
  });

  it('refuses to load a unit pipeline\'s model whose Lineage has no unit part', async () => {
    const { deps } = await unitModel(JSON.stringify({ targetEntityName: 'Years', featureSteps: steps }));
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx())).rejects.toThrow(/model 'model-1'.*predictionUnitId/);
  });

  /** A lookup whose pipelines all have no unit (the unit was cleared after training), counting its calls. */
  const clearedUnits = () => {
    const calls: string[] = [];
    return { calls, lookup: { PredictionUnitIDOf: async (pipelineId: string) => { calls.push(pipelineId); return null; } } };
  };

  it('takes the unit path for a model whose pipeline no longer points at a unit, from the unit its Lineage stored', async () => {
    const cleared = clearedUnits();
    const { deps, training } = await unitModel(undefined, cleared.lookup);
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps });
    await expect(processor.Preflight(ctx(UnitYearsWorld.PeopleEntity.ID))).rejects.toMatchObject({ Refusal: { reason: { kind: 'scope-entity-mismatch' } } });
    const scored = await processor.AssembleForScoring([{ ID: 'y2024-2' }], ctx(), 'unit-rule');
    expect(cleared.calls).toEqual(['pipe-u']);
    expect(scored.Status === 'assembled' && training.Assembled.Status === 'assembled' && scored.Rows[0].Values).toEqual(
      training.Assembled.Status === 'assembled' ? training.Assembled.Rows.find((r) => r.RowId === 'y2024-2')?.Values : null,
    );
  });

  it('fails loudly for a model whose pipeline no longer points at a unit when its Lineage names a unit but is invalid', async () => {
    const cleared = clearedUnits();
    const { deps } = await unitModel(JSON.stringify({ predictionUnitId: 'U-1', featureSpec: [], categoryLevels: {} }), cleared.lookup);
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx())).rejects.toThrow(/model 'model-1'.*predictionUnitVersion/);
  });

  it('loads a model whose pipeline has no unit and whose Lineage names none as a legacy model (no as-of assembly)', async () => {
    const legacy = new FakeMLModel();
    legacy.PipelineID = 'pipe-legacy';
    const { deps } = buildDeps(legacy);
    const cleared = clearedUnits();
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps: { ...deps, pipelineUnits: cleared.lookup } }, new TestAssembler(new InMemoryDataAccess()));
    await expect(processor.Preflight(CTX)).resolves.toBeUndefined();
    expect(cleared.calls).toEqual(['pipe-legacy']);
    await expect(processor.AssembleForScoring([{ ID: 'm1' }], CTX, 'unit-rule')).rejects.toThrow(/not trained on a Prediction Unit/);
  });

  it('dates and keys every scoped row with the unit row rule the training reader uses', async () => {
    const { deps } = await unitModel();
    const spy = vi.spyOn(PredictionUnitRowReader, 'UnitRowRef');
    try {
      await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'y2024-2' }, { ID: 'y2025-0' }], ctx(), 'unit-rule');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('scores a batch through the as-of assembly, sending the as-of values to the sidecar', async () => {
    const { deps, sidecar } = await unitModel();
    const records: RecordRef[] = [{ EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2024-2' }, { EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2025-2' }];
    const results = await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).ProcessBatch(records, ctx(UnitYearsWorld.YearsEntity.ID));
    expect(results.map((r) => r.Status)).toEqual(['Succeeded', 'Succeeded']);
    expect(sidecar.Requests[0].rows).toEqual([{ EventsAttended: 20, Status: 'Active' }, { EventsAttended: 21, Status: 'Lapsed' }]);
  });
});
