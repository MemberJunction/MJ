import { describe, it, expect } from 'vitest';
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
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';

import { MLModelInferenceProcessor } from '../ml-model-inference-processor';
import { InMemoryArtifactLoader } from '../artifact-loader';
import type { IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../types';
import { FeatureAssemblyExecutor } from '../../feature-assembly';
import type {
  IFeatureDataAccess,
  FetchRowsParams,
  FetchRowsResult,
  DatedSourceSpec,
  SourceRow,
} from '../../feature-assembly';

/**
 * The as-of **round-trip** proof: dated sources declared once on the training pipeline
 * (`MLTrainingPipeline.DatedSources`) are frozen into the model's `Lineage` by
 * `TrainingEngine`, and the scoring path reads them straight back out. Before this,
 * `MLModelInferenceProcessor` could only receive them from its constructor — so a model
 * trained WITH as-of features scored WITHOUT them (silently: the columns came back as
 * `null` and the sidecar imputed them), the exact train/serve skew §6.2 exists to prevent.
 *
 * These tests assemble the same records through BOTH paths against the SAME dated rows
 * and assert the as-of columns are identical.
 */

// ---------------------------------------------------------------------------
// Shared fixture: 3 members, activities of varying dates, one as-of aggregate.
// ---------------------------------------------------------------------------

/** The pipeline's `DatedSources` JSON — the single declaration both paths derive from. */
const PIPELINE_DATED_SOURCES: DatedSourceSpec[] = [
  {
    EntityName: 'Activities',
    ForeignKeyField: 'MemberID',
    DateField: 'ActivityDate',
    Features: [
      { OutputColumn: 'activity_count_asof', Aggregate: 'count', EmitPresence: true },
      { OutputColumn: 'days_since_last_activity', Aggregate: 'recency' },
    ],
  },
];

const AS_OF: AsOfStrategy = { Mode: 'column', Column: 'DecisionDate' };

const STEPS: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure'] }] };

const SOURCE_BINDINGS: SourceBinding[] = [{ Kind: 'Entity', Ref: 'Members' }];

/** Post-assembly feature schema (train-time order), frozen onto the model. */
const FROZEN_SCHEMA: FeatureSchemaEntry[] = [
  { Name: 'tenure', Kind: 'numeric' },
  { Name: 'activity_count_asof', Kind: 'numeric' },
  { Name: 'activity_count_asof__present', Kind: 'numeric' },
  { Name: 'days_since_last_activity', Kind: 'numeric' },
];

const MEMBERS: SourceRow[] = [
  { ID: 'm1', tenure: 10, DecisionDate: '2026-06-01T00:00:00Z' },
  { ID: 'm2', tenure: 4, DecisionDate: '2026-06-01T00:00:00Z' },
  // m3 has NO activities at all — proves the presence mask survives the round-trip.
  { ID: 'm3', tenure: 7, DecisionDate: '2026-06-01T00:00:00Z' },
];

const ACTIVITIES: SourceRow[] = [
  { ID: 'a1', MemberID: 'm1', ActivityDate: '2026-05-20T00:00:00Z' },
  { ID: 'a2', MemberID: 'm1', ActivityDate: '2026-05-28T00:00:00Z' },
  // After the decision date — must be excluded by the as-of filter on BOTH paths.
  { ID: 'a3', MemberID: 'm1', ActivityDate: '2026-07-01T00:00:00Z' },
  { ID: 'a4', MemberID: 'm2', ActivityDate: '2026-01-15T00:00:00Z' },
];

/** Serves `Members` / `Activities` from the fixture above. */
class FixtureDataAccess implements IFeatureDataAccess {
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    if (params.EntityName === 'Activities') {
      return { Success: true, Rows: ACTIVITIES };
    }
    if (params.EntityName === 'Members') {
      return { Success: true, Rows: MEMBERS };
    }
    return { Success: true, Rows: [] };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

/** Assembler that always injects the fixture data access. */
class TestAssembler extends FeatureAssemblyExecutor {
  public override assemble(params: Parameters<FeatureAssemblyExecutor['assemble']>[0]) {
    return super.assemble({ ...params, dataAccess: new FixtureDataAccess() });
  }
}

/**
 * The model as `TrainingEngine` would have written it: `Lineage.datedSources` holds
 * exactly what the pipeline declared. `datedSourcesOverride` lets a test simulate a
 * LEGACY lineage (trained before the field existed) by omitting the key.
 */
class FakeMLModel {
  public ID = 'model-asof';
  public ArtifactFileID: string | null = 'file-1';
  public FittedPreprocessing: string | null = '{}';
  public FeatureSchema = JSON.stringify(FROZEN_SCHEMA);
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TargetVariable = 'Renewed';
  public Pipeline: string | null = 'Members';
  public Lineage: string | null;

  constructor(datedSources: DatedSourceSpec[] | undefined = PIPELINE_DATED_SOURCES) {
    this.Lineage = JSON.stringify({
      targetEntityName: 'Members',
      sourceBindings: SOURCE_BINDINGS,
      featureSteps: STEPS,
      asOfStrategy: AS_OF,
      ...(datedSources ? { datedSources } : {}),
    });
  }
}

class FakeModelLoader implements IMLModelLoader {
  constructor(private readonly model: FakeMLModel) {}
  async loadModel(): Promise<MJMLModelEntity | null> {
    return this.model as unknown as MJMLModelEntity;
  }
}

/** Sidecar fake — captures the rows it is asked to score; that IS the assertion surface. */
class CapturingSidecar implements ISidecarPredictor {
  public Requests: PredictRequest[] = [];
  async predict(req: PredictRequest): Promise<PredictResponse> {
    this.Requests.push(req);
    return { predictions: (req.rows ?? []).map(() => ({ score: 0.5 })) };
  }
}

const CTX: RecordProcessorContext = {
  contextUser: undefined as unknown as UserInfo,
  provider: undefined as unknown as IMetadataProvider,
};

function memberRecord(row: SourceRow): RecordRef {
  return { EntityID: 'ent-members', RecordID: String(row.ID), Record: { ...row } };
}

function buildProcessor(
  model: FakeMLModel,
  constructorDatedSources?: DatedSourceSpec[],
): { processor: MLModelInferenceProcessor; sidecar: CapturingSidecar } {
  const sidecar = new CapturingSidecar();
  const artifacts = new InMemoryArtifactLoader();
  artifacts.set('file-1', new TextEncoder().encode('fake-model-bytes'));
  const deps: MLInferenceDeps = { modelLoader: new FakeModelLoader(model), artifactLoader: artifacts, sidecar };
  const processor = new MLModelInferenceProcessor(
    { modelId: model.ID, deps, datedSources: constructorDatedSources },
    new TestAssembler(),
  );
  return { processor, sidecar };
}

/** Assemble the fixture the way TrainingEngine does — as-of sources straight off the pipeline. */
async function assembleAtTrainTime(datedSources: DatedSourceSpec[]) {
  return new TestAssembler().assemble({
    targetEntityName: 'Members',
    records: MEMBERS,
    sources: SOURCE_BINDINGS,
    steps: STEPS,
    asOf: AS_OF,
    leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 },
    datedSources,
    primaryKeyField: 'ID',
    context: 'train',
    contextUser: CTX.contextUser,
    provider: CTX.provider,
  });
}

/** Score every fixture member and return the per-record feature maps the sidecar saw. */
async function scoreAll(
  processor: MLModelInferenceProcessor,
  sidecar: CapturingSidecar,
): Promise<Array<Record<string, string | number | boolean | null>>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];
  for (const m of MEMBERS) {
    const result = await processor.ProcessRecord(memberRecord(m), CTX);
    expect(result.Status).toBe('Succeeded');
    const req = sidecar.Requests[sidecar.Requests.length - 1];
    out.push(req.rows[0]);
  }
  return out;
}

describe('as-of dated sources round-trip (pipeline → Lineage → scoring)', () => {
  it('scores with the as-of sources frozen on the model, with NO constructor option', async () => {
    const { processor, sidecar } = buildProcessor(new FakeMLModel());
    const rows = await scoreAll(processor, sidecar);

    // m1: two activities on/before 2026-06-01 (the third is after → excluded).
    expect(rows[0]['activity_count_asof']).toBe(2);
    expect(rows[0]['activity_count_asof__present']).toBe(1);
    // m2: one activity, 2026-01-15.
    expect(rows[1]['activity_count_asof']).toBe(1);
    expect(rows[1]['activity_count_asof__present']).toBe(1);
    // m3: none at all — a real zero, distinguishable via the presence mask.
    expect(rows[2]['activity_count_asof']).toBe(0);
    expect(rows[2]['activity_count_asof__present']).toBe(0);
  });

  it('produces IDENTICAL as-of values at train time and at score time', async () => {
    const train = await assembleAtTrainTime(PIPELINE_DATED_SOURCES);
    const { processor, sidecar } = buildProcessor(new FakeMLModel());
    const scored = await scoreAll(processor, sidecar);

    const asOfColumns = FROZEN_SCHEMA.map((f) => f.Name).filter((n) => n !== 'tenure');
    expect(asOfColumns.length).toBeGreaterThan(0);

    for (let r = 0; r < MEMBERS.length; r++) {
      for (const col of asOfColumns) {
        const trainIdx = train.matrix.columns.indexOf(col);
        expect(trainIdx, `train matrix is missing '${col}'`).toBeGreaterThanOrEqual(0);
        expect(scored[r][col], `record ${r} column '${col}' skewed train→score`).toBe(train.matrix.rows[r][trainIdx]);
      }
    }
  });

  it('prefers the frozen lineage over a divergent constructor option', async () => {
    // A caller passing a DIFFERENT spec must not be able to change what the model scores on.
    const divergent: DatedSourceSpec[] = [
      {
        EntityName: 'Activities',
        ForeignKeyField: 'MemberID',
        DateField: 'ActivityDate',
        // Same output column, WRONG aggregate — if this won, m1 would score 1 (exists), not 2.
        Features: [{ OutputColumn: 'activity_count_asof', Aggregate: 'exists' }],
      },
    ];
    const { processor, sidecar } = buildProcessor(new FakeMLModel(), divergent);
    const rows = await scoreAll(processor, sidecar);
    expect(rows[0]['activity_count_asof']).toBe(2);
  });

  it('falls back to the constructor option for a LEGACY lineage with no datedSources', async () => {
    // Models trained before `MLTrainingPipeline.DatedSources` existed have no key in their
    // lineage blob — the caller-supplied spec is the only source, and must still work.
    const { processor, sidecar } = buildProcessor(new FakeMLModel(undefined), PIPELINE_DATED_SOURCES);
    const rows = await scoreAll(processor, sidecar);
    expect(rows[0]['activity_count_asof']).toBe(2);
    expect(rows[2]['activity_count_asof__present']).toBe(0);
  });

  it('ignores a malformed datedSources blob rather than throwing', async () => {
    const model = new FakeMLModel();
    model.Lineage = JSON.stringify({
      targetEntityName: 'Members',
      sourceBindings: SOURCE_BINDINGS,
      featureSteps: STEPS,
      asOfStrategy: AS_OF,
      datedSources: [{ EntityName: 'Activities' }, 'not-an-object', null],
    });
    const { processor, sidecar } = buildProcessor(model);
    const rows = await scoreAll(processor, sidecar);
    // No usable spec survived the narrowing and none was supplied → the column is absent
    // from the assembled matrix, so `matrixToFeatureRows` emits null for the frozen column.
    expect(rows[0]['activity_count_asof']).toBeNull();
  });
});
