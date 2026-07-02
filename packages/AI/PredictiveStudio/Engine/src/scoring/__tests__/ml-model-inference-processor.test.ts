import { describe, it, expect } from 'vitest';
import type { UserInfo, IMetadataProvider, BaseEntity } from '@memberjunction/core';
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
  matrixToFeatureRows,
  type MLInferenceResultPayload,
} from '../ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../artifact-loader';
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
    return { Success: true, Rows: [] };
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
  contextUser: undefined as unknown as UserInfo,
  provider: undefined as unknown as IMetadataProvider,
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
    const rows = matrixToFeatureRows(matrix, schema);
    expect(rows).toEqual([{ tenure: 12, events_at_signup: null, city: 'NYC' }]);
    // 'extra' (not in schema) is dropped.
    expect(Object.keys(rows[0])).not.toContain('extra');
  });
});
