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
  PredictionUnitSpec,
  PredictionUnitColumns,
  FeatureColumnSpec,
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
import { ArtifactUnavailableError, ModelNotScorableError, ModelNeedsTrainingError, ModelNotServableError } from '../model-readiness';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { InMemoryArtifactLoader } from '../artifact-loader';
import type { MJRecordProcessEntity_IRecordProcessChallengerConfig } from '@memberjunction/core-entities';
import {
  ShadowScoringCoordinator,
  type ShadowFeatureValueAuditRecord,
  type ShadowScoreEnvelope,
} from '../shadow-scoring';
import type { ArtifactBytesRead, IMLModelLoader, ISidecarPredictor, MLInferenceDeps } from '../types';
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
import type { IAssemblyMetadata } from '../../feature-assembly/assembly-metadata';
import type { SourceRow } from '../../feature-assembly/data-access';
import { SeriesFeatures } from '../../feature-assembly/as-of/series-features';
import { AsOfFeatureAssembler, type AsOfAssemblyResult } from '../../feature-assembly/as-of/as-of-assembler';
import { RunViewRecordHistoryReader } from '../../feature-assembly/as-of/record-history';
import type { AssemblyEntityInfo } from '../../feature-assembly/assembly-metadata';

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
  /** The registered SHA-256 of the bytes `buildDeps` stores under `file-1`. */
  public ArtifactSha256: string | null = SnapshotHash.Sha256Hex(new TextEncoder().encode('fake-model-bytes'));
  public ArtifactStatus: MJMLModelEntity['ArtifactStatus'] = 'verified';
  public ArtifactCheckedAt: Date | null = null;
  /** What each `Save()` call saw: the status and artifact status it wrote. */
  public Saves: Array<{ Status: MJMLModelEntity['Status']; ArtifactStatus: MJMLModelEntity['ArtifactStatus'] }> = [];
  /** When set, `Save()` fails and `LatestResult.CompleteMessage` carries this message. */
  public SaveFailure: string | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  public async Save(): Promise<boolean> {
    this.Saves.push({ Status: this.Status, ArtifactStatus: this.ArtifactStatus });
    this.LatestResult = this.SaveFailure === null ? null : { CompleteMessage: this.SaveFailure };
    return this.SaveFailure === null;
  }
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
    return { predictions: (req.rows ?? []).map((_r, i) => ({ ...this.scoreFor(i), probabilities: null })), classOrder: null };
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

/**
 * A provider whose only use is the pipeline-row fallback read (`RunView` of `MJ: ML Training Pipelines`): it answers
 * with `rows` and records each read. The one deliberate test-double cast at the seam, shared by every fallback test.
 */
function pipelineRowProvider(rows: Record<string, string>[], reads: string[]): IMetadataProvider {
  const slice = {
    EntityByID: (): undefined => undefined,
    RunView: async (params: RunViewParams): Promise<RunViewResult<Record<string, string>>> => {
      reads.push(`${params.EntityName}|${params.ExtraFilter}`);
      return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    },
  };
  return slice as unknown as IMetadataProvider;
}

const CTX: RecordProcessorContext = {
  ContextUser: undefined as unknown as UserInfo,
  Provider: undefined as unknown as IMetadataProvider,
};

/** A member record carrying its data inline (as the engine pre-loads it). */
function memberRecord(id: string, tenure: number, events: number, city: string): RecordRef {
  return { EntityID: 'ent-members', RecordID: id, Record: { ID: id, tenure, events_at_signup: events, city } };
}

function buildDeps(model: FakeMLModel | null = new FakeMLModel(), trainingRowIds: ReadonlySet<string> = new Set<string>()): {
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
  // The model's training rows (the development rows of its snapshot manifest); none by default.
  const trainingRows = { TrainingRowIDsOf: async (modelId: string) => (modelId === 'model-1' ? trainingRowIds : new Set<string>()) };
  return { deps: { modelLoader: loader, artifactLoader: artifacts, sidecar, pipelineUnits: noUnits, trainingRows }, loader, sidecar, artifacts };
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
    // A model trained without a snapshot has no training rows.
    expect(payload.inTraining).toBe(false);

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
    expect(await artifacts.load('file-1', CTX.ContextUser, pipelineRowProvider([], []))).not.toBeNull();
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

describe('MLModelInferenceProcessor — a model trained before Prediction Units keeps scoring after its pipeline is migrated', () => {
  it('scores a pre-2026-06-27 Lineage (provenance only, no feature graph) on a unit-bound pipeline through the pipeline-row fallback', async () => {
    const legacy = new FakeMLModel();
    // The shape TrainingEngine.buildLineage wrote before 64f92aa3b9 added targetEntityName and featureSteps.
    legacy.Lineage = JSON.stringify({ pipelineId: 'pipe-members', pipelineVersion: 1, sourceBindings: [], asOfStrategy: { Mode: 'none' }, sidecarVersion: null, lockedHoldoutRowCount: 2, trainingRowCount: 8, assembledAt: '2026-05-01T00:00:00.000Z' });
    legacy.Pipeline = null;
    const { deps } = buildDeps(legacy);
    const bound = { PredictionUnitIDOf: async () => 'U-MIGRATED' };
    const proc = new MLModelInferenceProcessor({ modelId: 'model-1', deps: { ...deps, pipelineUnits: bound } }, new TestAssembler(new InMemoryDataAccess()));
    const pipelineQueries: string[] = [];
    const row = { TargetEntity: 'Members', SourceBindings: JSON.stringify([{ Kind: 'Entity', Ref: 'Members' }]), FeatureSteps: JSON.stringify({ Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure', 'events_at_signup', 'city'] }] }), AsOfStrategy: JSON.stringify({ Mode: 'none' }) };
    const provider = pipelineRowProvider([row], pipelineQueries);
    const result = await proc.ProcessRecord(memberRecord('m1', 12, 3, 'NYC'), { ...CTX, Provider: provider });
    expect([result.Status, result.ErrorMessage || null]).toEqual(['Succeeded', null]);
    expect(pipelineQueries).toEqual(["MJ: ML Training Pipelines|ID='pipe-members'"]);
  });

  it('fails loudly for an unreadable Lineage on a unit-bound pipeline, and loads it as legacy on an unbound one', async () => {
    const errors = ConsoleCapture.Errors();
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = new FakeMLModel();
    broken.Lineage = '{not json';
    const { deps } = buildDeps(broken);
    const bound = new MLModelInferenceProcessor({ modelId: 'model-1', deps: { ...deps, pipelineUnits: { PredictionUnitIDOf: async () => 'U-1' } } }, new TestAssembler(new InMemoryDataAccess()));
    await expect(bound.Preflight(CTX)).rejects.toThrow(/model 'model-1' has an unreadable Lineage/);
    const unbound = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler(new InMemoryDataAccess()));
    await expect(unbound.Preflight(CTX)).resolves.toBeUndefined();
    // the unreadable Lineage is reported, and the unbound pipeline's legacy load logs that its fallback read failed
    expect(warnings.mock.calls.map((c) => String(c[0]))).toContain('ResolveOutcomeConfig: failed to parse Lineage JSON');
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("failed to load fallback pipeline 'pipe-members'")]);
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
    const provider = pipelineRowProvider([], pipelineQueries);
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

describe('MLModelInferenceProcessor — lifecycle status gate', () => {
  for (const status of ['Draft', 'Archived'] as const) {
    it(`refuses a ${status} model in Preflight before any record is scored or artifact is downloaded`, async () => {
      const model = new FakeMLModel();
      model.Status = status;
      const { deps, sidecar } = buildDeps(model);
      let artifactLoads = 0;
      deps.artifactLoader = {
        async load(): Promise<ArtifactBytesRead> {
          artifactLoads++;
          return { Kind: 'read', Bytes: new Uint8Array([1, 2, 3]) };
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

  it('refuses a Published series forecaster with ModelNotServableError (/predict does not serve it), not "needs training"', async () => {
    const model = new FakeMLModel();
    model.Status = 'Published';
    model.Lineage = JSON.stringify({ shippedDriver: 'trend_season_ar1' });
    const { deps } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toBeInstanceOf(ModelNotServableError);
  });
});

// ---------------------------------------------------------------------------
// Models trained on a Prediction Unit: assembled as of each row's decision date by the same assembler as training.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The artifact is loaded through the registry: only a verified load scores (S7.1).
// ---------------------------------------------------------------------------

describe('MLModelInferenceProcessor — verified artifact load', () => {
  const otherBytes = new TextEncoder().encode('bytes of another model');

  it('refuses scoring with the artifact refusal and records the artifact status', async () => {
    const savedModel = new FakeMLModel();
    const { deps, sidecar, artifacts } = buildDeps(savedModel);
    artifacts.Set('file-1', otherBytes);
    const processor = buildProcessor(deps);
    await expect(processor.Preflight(CTX)).rejects.toMatchObject({ Refusal: { kind: 'artifact-hash-mismatch' } });
    expect(savedModel.ArtifactStatus).toBe('hash-mismatch');
    expect(savedModel.ArtifactCheckedAt).toBeInstanceOf(Date);
    // The save changed the artifact status only; the lifecycle status is the gate's to write.
    expect(savedModel.Saves).toEqual([{ Status: 'Published', ArtifactStatus: 'hash-mismatch' }]);
    expect(sidecar.Requests).toHaveLength(0);
  });

  it('names both hashes in the refusal, and the model, its file and both hashes in its message', async () => {
    const model = new FakeMLModel();
    const { deps, artifacts } = buildDeps(model);
    artifacts.Set('file-1', otherBytes);
    const refusal = { kind: 'artifact-hash-mismatch', expected: model.ArtifactSha256, actual: SnapshotHash.Sha256Hex(otherBytes) };
    const attempt = buildProcessor(deps).Preflight(CTX);
    await expect(attempt).rejects.toBeInstanceOf(ArtifactUnavailableError);
    await expect(attempt).rejects.toMatchObject({ Refusal: refusal, Source: 'MLModelInferenceProcessor', ModelID: 'model-1', FileID: 'file-1' });
    await expect(attempt).rejects.toThrow(
      `MLModelInferenceProcessor: ML Model 'model-1': its stored model artifact file 'file-1' does not match its registered SHA-256 ` +
        `(registered ${model.ArtifactSha256}, stored bytes hash to ${SnapshotHash.Sha256Hex(otherBytes)})`,
    );
  });

  it('names the model and its file in the missing and unverified messages', async () => {
    const lost = new FakeMLModel();
    lost.ArtifactFileID = 'file-gone';
    await expect(buildProcessor(buildDeps(lost).deps).Preflight(CTX)).rejects.toThrow(
      "MLModelInferenceProcessor: ML Model 'model-1': its model artifact file 'file-gone' is missing from storage",
    );
    const unregistered = new FakeMLModel();
    unregistered.ArtifactSha256 = null;
    await expect(buildProcessor(buildDeps(unregistered).deps).Preflight(CTX)).rejects.toThrow(
      "MLModelInferenceProcessor: ML Model 'model-1' has no registered artifact SHA-256 for its artifact file 'file-1'",
    );
  });

  it('refuses a model whose artifact object is gone as artifact-missing with its file, and records missing', async () => {
    const model = new FakeMLModel();
    model.ArtifactFileID = 'file-gone';
    const { deps, sidecar } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toMatchObject({ Refusal: { kind: 'artifact-missing', fileId: 'file-gone' } });
    expect(model.ArtifactStatus).toBe('missing');
    expect(sidecar.Requests).toHaveLength(0);
  });

  it('refuses a model with no registered hash as artifact-unverified, and records unverified', async () => {
    const model = new FakeMLModel();
    model.ArtifactSha256 = null;
    const { deps } = buildDeps(model);
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toMatchObject({ Refusal: { kind: 'artifact-unverified', modelId: 'model-1' } });
    expect(model.ArtifactStatus).toBe('unverified');
  });

  it('fails every record of a model whose artifact does not verify, without calling the sidecar', async () => {
    const model = new FakeMLModel();
    const { deps, sidecar, artifacts } = buildDeps(model);
    artifacts.Set('file-1', otherBytes);
    const errors = ConsoleCapture.Errors();
    const results = await buildProcessor(deps).ProcessBatch([memberRecord('a', 3, 1, 'NYC')], CTX);
    expect(results.map((r) => r.Status)).toEqual(['Failed']);
    expect(results[0].ErrorMessage).toContain('does not match its registered SHA-256');
    expect(sidecar.Requests).toHaveLength(0);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining('MLModelInferenceProcessor: batch scoring failed:')]);
  });

  it('logs a failed artifact-status save with its CompleteMessage and still refuses with the artifact refusal', async () => {
    const model = new FakeMLModel();
    model.SaveFailure = 'permission denied on MJ: ML Models';
    const { deps, artifacts } = buildDeps(model);
    artifacts.Set('file-1', otherBytes);
    const errors = ConsoleCapture.Errors();
    await expect(buildProcessor(deps).Preflight(CTX)).rejects.toMatchObject({ Refusal: { kind: 'artifact-hash-mismatch' } });
    expect(ConsoleCapture.Lines(errors)).toEqual([
      expect.stringContaining("recording ArtifactStatus 'hash-mismatch' on ML Model 'model-1' failed: permission denied on MJ: ML Models"),
    ]);
  });

  it('scores a verified artifact without writing the model row', async () => {
    const model = new FakeMLModel();
    const { deps } = buildDeps(model);
    const processor = buildProcessor(deps);
    await processor.Preflight(CTX);
    expect((await processor.ProcessBatch([memberRecord('a', 3, 1, 'NYC')], CTX))[0].Status).toBe('Succeeded');
    expect(model.Saves).toEqual([]);
  });
});

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

  /** The unit world a model is trained and scored over: its tables, metadata and unit row (the shared world by default). */
  interface ScoringWorld { readonly Tables: Record<string, SourceRow[]>; readonly Metadata: IAssemblyMetadata; readonly Unit: PredictionUnitColumns }
  const defaultWorld = (): ScoringWorld => ({ Tables: UnitYearsWorld.Tables(), Metadata: UnitYearsWorld.Metadata(), Unit: UnitYearsWorld.UnitColumns() });

  /** The training-side deps over the unit world: the pipeline row, the unit store, the metadata and the tables. */
  function trainingDeps(dataAccess: TableDataAccess, world: ScoringWorld = defaultWorld()): TrainingDeps {
    const pipeline = {
      ID: 'pipe-u', Version: 1, PredictionUnitID: UnitYearsWorld.UnitID, TargetEntity: 'Years', TargetVariable: '__ps_label', ProblemType: 'classification',
      Algorithm: 'xgboost', AlgorithmID: 'algo', Hyperparameters: '{}', SourceBindings: '[]', FeatureSteps: JSON.stringify(steps), AsOfStrategy: null,
      LeakageGuard: JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 }), ValidationStrategy: null, EvaluationProtocolID: null,
    } as unknown as MJMLTrainingPipelineEntity;
    const unused = async (): Promise<never> => { throw new Error('not used by assembly'); };
    return {
      entityFactory: { getEntityObject: unused },
      recordLoader: { loadPipeline: async () => pipeline, resolveAlgorithmIDForDriver: async () => null },
      artifactStore: { save: unused, delete: unused, AssertWritable: unused },
      contextUser: user,
      provider,
      predictionUnits: new FakePredictionUnitStore(world.Unit),
      assemblyMetadata: world.Metadata,
      dataAccess,
    };
  }

  /** The pipeline → unit lookup: `pipe-u` points at the unit world's unit; any other pipeline has none. */
  const pipelineUnits = { PredictionUnitIDOf: async (pipelineId: string) => (pipelineId === 'pipe-u' ? UnitYearsWorld.UnitID : null) };

  /** A Validated unit model whose lineage carries what training stored: the unit, the feature spec and the kept levels. */
  async function unitModel(lineageOverride?: string, lookup: typeof pipelineUnits = pipelineUnits, trainingRowIds: ReadonlySet<string> = new Set<string>(), world: ScoringWorld = defaultWorld()): Promise<{ deps: MLInferenceDeps; sidecar: FakeSidecar; training: Awaited<ReturnType<TrainingEngine['AssembleForTraining']>> }> {
    const dataAccess = new TableDataAccess(world.Tables);
    const training = await new TrainingEngine().AssembleForTraining('pipe-u', trainingDeps(dataAccess, world));
    if (training.Assembled.Status !== 'assembled') throw new Error(`training assembly refused: ${JSON.stringify(training.Assembled.Refusal)}`);
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
    const { deps, sidecar } = buildDeps(model, trainingRowIds);
    return { deps: { ...deps, pipelineUnits: lookup, predictionUnits: new FakePredictionUnitStore(world.Unit), assemblyMetadata: world.Metadata, dataAccess }, sidecar, training };
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
    const trained = new Map(training.Assembled.Rows.map((r) => [r.RowID, r.Values]));
    expect(scored.Rows.map((r) => r.RowID)).toEqual(['y2024-2', 'y2025-2', 'y2025-0']);
    for (const r of scored.Rows) expect(r.Values).toEqual(trained.get(r.RowID));
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

  it('refuses to load a unit pipeline\'s model that has no Lineage, naming the model', async () => {
    const { deps } = await unitModel('');
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps }).Preflight(ctx())).rejects.toThrow(/model 'model-1'/);
  });

  it('loads a legacy-lineage model of a pipeline the migration bound to a unit as a legacy model (it keeps scoring)', async () => {
    const { deps } = await unitModel(JSON.stringify({ pipelineId: 'pipe-u', targetEntityName: 'Years', featureSteps: steps, asOfStrategy: { Mode: 'none' } }));
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps }, new TestAssembler(new InMemoryDataAccess()));
    await expect(processor.Preflight(CTX)).resolves.toBeUndefined();
    await expect(processor.AssembleForScoring([{ ID: 'm1' }], CTX, 'unit-rule')).rejects.toThrow(/not trained on a Prediction Unit/);
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
    // The Lineage's unit marker decides alone; the pipeline's (cleared) binding is not consulted.
    expect(cleared.calls).toEqual([]);
    expect(scored.Status === 'assembled' && training.Assembled.Status === 'assembled' && scored.Rows[0].Values).toEqual(
      training.Assembled.Status === 'assembled' ? training.Assembled.Rows.find((r) => r.RowID === 'y2024-2')?.Values : null,
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
    // A readable Lineage without the unit marker is legacy on its own: the pipeline's binding is not consulted.
    expect(cleared.calls).toEqual([]);
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

  it('marks a record that was a development row of the training snapshot as in training, and a held-out record as not', async () => {
    // The 2024 cycle developed the model; 2025 was its locked holdout. Row ids are compared as UUIDs (case-insensitively).
    const { deps } = await unitModel(undefined, pipelineUnits, new Set(['Y2024-0', 'Y2024-1', 'Y2024-2', 'Y2024-3']));
    const records: RecordRef[] = [{ EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2024-2' }, { EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2025-2' }];
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps });
    const batch = await processor.ProcessBatch(records, ctx(UnitYearsWorld.YearsEntity.ID));
    expect(batch.map((r) => (r.ResultPayload as MLInferenceResultPayload).inTraining)).toEqual([true, false]);
    const single = await processor.ProcessRecord(records[0], ctx(UnitYearsWorld.YearsEntity.ID));
    expect((single.ResultPayload as MLInferenceResultPayload).inTraining).toBe(true);
  });

  /**
   * The shared world with person p1 hard-deleted on `deletedAt`: no People row, and a Delete change row whose
   * FullRecordJSON holds the record as it stood. p1's rows are y2024-1 (decided 2024-12-01) and y2025-1 (2025-12-01).
   * `immutableStatus` declares People.Status not updatable, so it is a stored read (the Delete row is its only source
   * once the row is gone) and the p2 Update row that would contradict that is left out; otherwise Status is replayed.
   */
  function worldWithDeletedPerson(deletedAt: string, immutableStatus: boolean, onUncoveredRow: 'refuse' | 'exclude-and-count'): ScoringWorld {
    const tables = UnitYearsWorld.Tables();
    tables.People = tables.People.filter((p) => p.ID !== 'p1');
    const changes = immutableStatus ? tables['MJ: Record Changes'].filter((c) => c.ID !== 'rc-update-p2') : tables['MJ: Record Changes'];
    tables['MJ: Record Changes'] = [...changes, {
      ID: 'rc-delete-p1', EntityID: UnitYearsWorld.PeopleEntity.ID, Status: 'Complete', RecordID: 'ID|p1', Type: 'Delete', Source: 'Internal',
      ChangedAt: new Date(deletedAt), ChangesJSON: '{}', FullRecordJSON: JSON.stringify({ ID: 'p1', Status: 'Active' }),
    }];
    const people = { ...UnitYearsWorld.PeopleEntity, Fields: UnitYearsWorld.PeopleEntity.Fields.map((f) => (f.Name === 'Status' ? { ...f, AllowUpdateAPI: !immutableStatus } : f)) };
    const byName = new Map([UnitYearsWorld.YearsEntity, people].map((e) => [e.Name, e] as const));
    const unit = { ...UnitYearsWorld.UnitColumns(), ChangeHistoryPolicy: JSON.stringify({ onUncoveredRow, externalSourceRows: 'ineligible' }) };
    return { Tables: tables, Metadata: { Entity: (name: string) => byName.get(name) || null }, Unit: unit };
  }

  it('scores a row whose parent was hard-deleted after its decision date with the value its Delete row holds', async () => {
    const records: RecordRef[] = [{ EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2025-1' }];
    for (const immutableStatus of [true, false]) {
      const { deps, sidecar } = await unitModel(undefined, pipelineUnits, new Set<string>(), worldWithDeletedPerson('2026-02-01T00:00:00Z', immutableStatus, 'refuse'));
      const results = await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).ProcessBatch(records, ctx(UnitYearsWorld.YearsEntity.ID));
      expect(results.map((r) => r.Status)).toEqual(['Succeeded']);
      expect(sidecar.Requests[0].rows).toEqual([{ EventsAttended: UnitYearsWorld.EventsAttended(1, 2025), Status: 'Active' }]);
      if (!immutableStatus) continue;
      const scored = await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'y2025-1' }], ctx(), 'unit-rule');
      expect(scored.Status === 'assembled' && scored.Rows[0].Provenance[1]).toMatchObject({ sourceRef: 'People/p1/Status', sourceVersion: 'rc-delete-p1' });
    }
  });

  it('fails the batch with a typed refusal naming the entity and field when a scored row\'s parent was hard-deleted before its decision date', async () => {
    // Deleted 2025-03-01: training reads y2024-1 and excludes y2025-1 (exclude-and-count); scoring y2025-1 cannot read it.
    const { deps } = await unitModel(undefined, pipelineUnits, new Set<string>(), worldWithDeletedPerson('2025-03-01T00:00:00Z', false, 'exclude-and-count'));
    const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps });
    const assembled = await processor.AssembleForScoring([{ ID: 'y2025-1' }], ctx(), 'unit-rule');
    expect(assembled.Status === 'assembled' && assembled.UncoveredRowsExcluded).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
    const errors = ConsoleCapture.Errors();
    const records: RecordRef[] = [{ EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2024-1' }, { EntityID: UnitYearsWorld.YearsEntity.ID, RecordID: 'y2025-1' }];
    const results = await processor.ProcessBatch(records, ctx(UnitYearsWorld.YearsEntity.ID));
    const refusal = TrainingRefusedError.DescribeTrainingRefusal({ stage: 'assembly', reason: { kind: 'decision-date-before-change-history', entity: 'People', field: 'Status', historyStart: '2023-01-01T00:00:00.000Z', rowsAffected: 1 } });
    expect(results).toEqual([{ Status: 'Failed', ErrorMessage: refusal }, { Status: 'Failed', ErrorMessage: refusal }]);
    expect(ConsoleCapture.Lines(errors)).toEqual([`MLModelInferenceProcessor: batch scoring failed: ${refusal}`]);
  });

  it('fails the run when the training rows cannot be read, naming the cause', async () => {
    const { deps } = await unitModel();
    const failing: MLInferenceDeps = { ...deps, trainingRows: { TrainingRowIDsOf: async () => { throw new Error('Loading the training run of model model-1 failed: timeout'); } } };
    await expect(new MLModelInferenceProcessor({ modelId: 'model-1', deps: failing }).Preflight(ctx(UnitYearsWorld.YearsEntity.ID))).rejects.toThrow('Loading the training run of model model-1 failed: timeout');
  });
});

// ---------------------------------------------------------------------------
// A fixed decision date that advances each run (a pipeline that had no as-of)
// ---------------------------------------------------------------------------

describe('MLModelInferenceProcessor — a fixed decision date that advances each run', () => {
  const TRAIN_DAY = '2026-03-01';
  /** The scoring run, the day after training. */
  const SCORE_INSTANT = new Date('2026-03-02T12:00:00Z');
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
  const ctx: RecordProcessorContext = { ContextUser: user, Provider: provider };

  /** The world's unit with its decision date fixed on the training day and advancing each run, as the migration writes it. */
  function fixedUnit(): ReturnType<typeof UnitYearsWorld.UnitColumns> {
    return {
      ...UnitYearsWorld.UnitColumns(),
      UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: TRAIN_DAY, advance: 'each-run' }, filter: [] }),
      Censoring: JSON.stringify({ rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-04-01' } }),
    };
  }

  /** The world's metadata with `Years.Region` declared updatable (an untracked entity whose stored value can change). */
  function metadataWithUpdatableRegion(): IAssemblyMetadata {
    const years = { ...UnitYearsWorld.YearsEntity, Fields: UnitYearsWorld.YearsEntity.Fields.map((f) => (f.Name === 'Region' ? { ...f, AllowUpdateAPI: true } : f)) };
    const byName = new Map([years, UnitYearsWorld.PeopleEntity].map((e) => [e.Name, e] as const));
    return { Entity: (name: string) => byName.get(name) || null };
  }

  /** A person created the day after training, and that person's membership row. */
  function tablesWithNewPerson(): Record<string, SourceRow[]> {
    const tables = UnitYearsWorld.Tables([...UnitYearsWorld.Years(), { ID: 'y2026-4', PersonID: 'p4', StartDate: '2026-01-01', EventsAttended: 42, Region: 'US', Renewed: false }]);
    tables.People = [...tables.People, { ID: 'p4', Status: 'Active' }];
    tables['MJ: Record Changes'] = [...tables['MJ: Record Changes'], {
      ID: 'rc-create-p4', EntityID: UnitYearsWorld.PeopleEntity.ID, Status: 'Complete', RecordID: 'ID|p4', Type: 'Create', Source: 'Internal',
      ChangedAt: new Date('2026-03-02T06:00:00Z'), ChangesJSON: '{}', FullRecordJSON: JSON.stringify({ ID: 'p4', Status: 'Active' }),
    }];
    return tables;
  }

  /** Train (assemble) on the training day, then return the deps a scoring run over the same world uses. */
  async function trainedOnTrainingDay(steps: FeatureStepGraph, tables: Record<string, SourceRow[]>, metadata: IAssemblyMetadata): Promise<MLInferenceDeps> {
    const dataAccess = new TableDataAccess(tables);
    const units = new FakePredictionUnitStore(fixedUnit());
    const pipeline = {
      ID: 'pipe-u', Version: 1, PredictionUnitID: UnitYearsWorld.UnitID, TargetEntity: 'Years', TargetVariable: '__ps_label', ProblemType: 'classification',
      Algorithm: 'xgboost', AlgorithmID: 'algo', Hyperparameters: '{}', SourceBindings: '[]', FeatureSteps: JSON.stringify(steps), AsOfStrategy: null,
      LeakageGuard: JSON.stringify({ DenyFields: [], SingleFeatureDominanceThreshold: 0.6 }), ValidationStrategy: null, EvaluationProtocolID: null,
    } as unknown as MJMLTrainingPipelineEntity;
    const unused = async (): Promise<never> => { throw new Error('not used by assembly'); };
    const deps: TrainingDeps = {
      entityFactory: { getEntityObject: unused },
      recordLoader: { loadPipeline: async () => pipeline, resolveAlgorithmIDForDriver: async () => null },
      artifactStore: { save: unused, delete: unused, AssertWritable: unused },
      contextUser: user, provider, predictionUnits: units, assemblyMetadata: metadata, dataAccess,
      now: () => new Date(`${TRAIN_DAY}T09:00:00Z`),
    };
    const training = await new TrainingEngine().AssembleForTraining('pipe-u', deps);
    if (training.Assembled.Status !== 'assembled') throw new Error(`training assembly refused: ${JSON.stringify(training.Assembled.Refusal)}`);
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
    const built = buildDeps(model);
    return { ...built.deps, pipelineUnits: { PredictionUnitIDOf: async () => UnitYearsWorld.UnitID }, predictionUnits: units, assemblyMetadata: metadata, dataAccess };
  }

  /** Score `ids` by the unit rule with the clock on the scoring day. */
  async function scoreNextDay(deps: MLInferenceDeps, ids: string[]): Promise<Awaited<ReturnType<MLModelInferenceProcessor['AssembleForScoring']>>> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SCORE_INSTANT);
    try {
      return await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring(ids.map((ID) => ({ ID })), ctx, 'unit-rule');
    } finally {
      vi.useRealTimers();
    }
  }

  it('dates scored rows at the scoring day, so an updatable field of an untracked entity is read as it stands today', async () => {
    const deps = await trainedOnTrainingDay({ Steps: [{ Id: 's1', Kind: 'select', Columns: ['Region'] }] }, UnitYearsWorld.Tables(), metadataWithUpdatableRegion());
    const scored = await scoreNextDay(deps, ['y2026-0', 'y2026-1']);
    expect(scored.Status).toBe('assembled');
    if (scored.Status !== 'assembled') return;
    expect(scored.Rows.map((r) => r.Values)).toEqual([['EU'], ['US']]);
  });

  it('dates scored rows at the scoring day, so a tracked record created after training reads its value, not created-after-decision', async () => {
    const steps: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] }] };
    const deps = await trainedOnTrainingDay(steps, tablesWithNewPerson(), UnitYearsWorld.Metadata());
    const scored = await scoreNextDay(deps, ['y2026-4', 'y2026-2']);
    expect(scored.Status).toBe('assembled');
    if (scored.Status !== 'assembled') return;
    expect(scored.Rows.map((r) => r.Values)).toEqual([['Active'], ['Lapsed']]);
  });
});

// ---------------------------------------------------------------------------
// A unit with a Temporal Spec: the lags scoring reads come from the same periods training reads them from.
// ---------------------------------------------------------------------------

describe('MLModelInferenceProcessor — series history for scoring', () => {
  const months: SourceRow[] = [];
  for (let i = 0; i < 23; i++) months.push({ ID: `m${String(i).padStart(2, '0')}`, SeriesID: 'S1', PeriodDate: new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 10), Y: 100 + i });
  const f = (Name: string, TSType: 'string' | 'number' | 'Date') => ({ Name, SqlType: 'nvarchar', TSType, AllowUpdateAPI: false, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
  const entities: Record<string, AssemblyEntityInfo> = {
    Series: { ID: 'E-S', Name: 'Series', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [f('ID', 'string')] },
    Months: { ID: 'E-M', Name: 'Months', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [f('ID', 'string'), f('SeriesID', 'string'), f('PeriodDate', 'Date'), f('Y', 'number')] },
  };
  const temporal = { timeColumn: 'PeriodDate', horizonPeriods: 1, lags: [1, 12], rollingWindows: [], period: 'month' as const, seasonality: 12 };
  const unit: PredictionUnitSpec = {
    id: 'U', lineageRootId: 'U', version: 1, name: 'monthly forecast',
    rows: { kind: 'grain-x-periods', grainEntity: 'Series', childEntity: 'Months', foreignKey: 'SeriesID', periodDate: 'PeriodDate', filter: [] },
    label: { rule: { kind: 'column', column: 'Y' }, windowDays: 90, gapDays: 0, outcome: { kind: 'forecast', valueKind: 'continuous' }, labelVersion: 1 },
    censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'now' } },
    history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
    groupKey: null, temporal,
    decision: { action: 'forecast', actorRole: 't', capacityPerPeriod: null, period: 'month' },
    incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
  };
  const seams = { DataAccess: new TableDataAccess({ Series: [{ ID: 'S1' }], Months: months }), Metadata: { Entity: (n: string) => entities[n] || null } };
  const lag1 = (h: Awaited<ReturnType<typeof MLModelInferenceProcessor.SeriesHistoryForScoring>>, period: string, assembledAt: Date) =>
    (h === null ? 'no history' : SeriesFeatures.ComputeSeriesFeature(h, 'S1', new Date(period), temporal, { kind: 'lag', index: 0 }, new Date(period), assembledAt).Value);

  it('reads the periods training censored at its cutoff, so a lag whose window has closed reads the last period\'s value', async () => {
    // A fixed cutoff before the last months and a 28-day window: m22 (2026-11) is censored for training, but its window
    // closed 2026-11-29, so the row decided 2026-12-01 reads it.
    const fixed: PredictionUnitSpec = { ...unit, label: { ...unit.label, windowDays: 28 }, censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-06-01' } } };
    const scoringDay = new Date('2026-12-05T00:00:00Z');
    const h = await MLModelInferenceProcessor.SeriesHistoryForScoring(fixed, seams, scoringDay);
    expect(lag1(h, '2026-12-01T00:00:00Z', scoringDay)).toBe(122);
    expect(lag1(h, '2026-11-01T00:00:00Z', scoringDay)).toBe(121);
  });

  it('gives every row training read the same lag training gave it', async () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const read = await new PredictionUnitRowReader().Read(unit, { ...seams, Read: { mode: 'complete' }, Now: now });
    if (read.Status !== 'read') throw new Error('training read refused');
    const training = TrainingEngine.SeriesHistoryFor(unit, read.Rows);
    const scoring = await MLModelInferenceProcessor.SeriesHistoryForScoring(unit, seams, now);
    for (const r of read.Rows) expect(lag1(scoring, (r.Period as Date).toISOString(), now)).toBe(lag1(training, (r.Period as Date).toISOString(), now));
  });

  describe('one read of the unit\'s rows per scoring run', () => {
    /** Counts the complete reads of the unit's row entity (the series history read; a keyed read carries a filter). */
    class CountingDataAccess extends TableDataAccess {
      public CompleteMonthReads = 0;
      /** When set, the next complete read of the row entity fails (a transient read error). */
      public FailNextCompleteRead = false;
      public override async fetchRows(p: FetchRowsParams): Promise<FetchRowsResult> {
        if (p.EntityName === 'Months' && !p.ExtraFilter) {
          this.CompleteMonthReads++;
          if (this.FailNextCompleteRead) {
            this.FailNextCompleteRead = false;
            return { Success: false, Rows: [], TotalRowCount: 0, ErrorMessage: 'connection reset' };
          }
        }
        return super.fetchRows(p);
      }
    }
    const lag = (name: string, index: number): FeatureColumnSpec => ({ name, source: { kind: 'series', feature: { kind: 'lag', index } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });
    const unitColumns: PredictionUnitColumns = {
      ID: unit.id, LineageRootID: unit.lineageRootId, Version: unit.version, Name: unit.name, LabelVersion: 1, LabelWindowDays: unit.label.windowDays, LabelGapDays: unit.label.gapDays, GroupKey: null,
      TemporalSpec: JSON.stringify(temporal), UnitRows: JSON.stringify(unit.rows), LabelRule: JSON.stringify(unit.label.rule), TaskType: JSON.stringify(unit.label.outcome),
      Censoring: JSON.stringify(unit.censoring), ChangeHistoryPolicy: JSON.stringify(unit.history), DecisionSpec: JSON.stringify(unit.decision),
      IncumbentHeuristic: JSON.stringify(unit.incumbent), AuthoredBy: JSON.stringify(unit.authoredBy),
    };
    const scoringCtx: RecordProcessorContext = { ContextUser: { ID: 'user-1' } as UserInfo, Provider: undefined as unknown as IMetadataProvider };
    function seriesModelDeps(dataAccess: CountingDataAccess): MLInferenceDeps {
      const model = new FakeMLModel();
      model.Status = 'Validated';
      model.PipelineID = 'pipe-m';
      model.Lineage = JSON.stringify({
        predictionUnitId: unit.id, predictionUnitVersion: 1, labelVersion: 1, featureSpecVersion: 1, unitRowEntity: 'Months',
        featureSpec: [lag('Lag1', 0), lag('Lag12', 1)], categoryLevels: {}, trainingSnapshotId: 'TS-M', snapshotContentHash: 'b'.repeat(64),
        targetEntityName: 'Months', sourceBindings: [], featureSteps: { Steps: [{ Id: 's1', Kind: 'select', Columns: ['Y'] }] }, asOfStrategy: { Mode: 'none' },
      });
      const { deps } = buildDeps(model);
      return { ...deps, pipelineUnits: { PredictionUnitIDOf: async () => unit.id }, predictionUnits: new FakePredictionUnitStore(unitColumns), assemblyMetadata: seams.Metadata, dataAccess };
    }

    it('reads the unit\'s rows once for every batch of one run, and gives each batch the lags of that read', async () => {
      const dataAccess = new CountingDataAccess({ Series: [{ ID: 'S1' }], Months: months });
      const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps: seriesModelDeps(dataAccess) });
      const first = await processor.AssembleForScoring([{ ID: 'm20' }], scoringCtx, 'unit-rule');
      const second = await processor.AssembleForScoring([{ ID: 'm21' }, { ID: 'm13' }], scoringCtx, 'unit-rule');
      expect(dataAccess.CompleteMonthReads).toBe(1);
      if (first.Status !== 'assembled' || second.Status !== 'assembled') throw new Error('assembly refused');
      // Lag 12 of m13 (2026-02) reads m01 (2025-02), whose window closed 2025-05-02.
      expect(second.Rows.find((r) => r.RowID === 'm13')?.Values).toEqual([null, 101]);
    });

    it('reads them again on the next batch when the run\'s read failed, never keeping the failure', async () => {
      const dataAccess = new CountingDataAccess({ Series: [{ ID: 'S1' }], Months: months });
      dataAccess.FailNextCompleteRead = true;
      const processor = new MLModelInferenceProcessor({ modelId: 'model-1', deps: seriesModelDeps(dataAccess) });
      await expect(processor.AssembleForScoring([{ ID: 'm20' }], scoringCtx, 'unit-rule')).rejects.toThrow(/connection reset/);
      const retried = await processor.AssembleForScoring([{ ID: 'm13' }], scoringCtx, 'unit-rule');
      expect(retried.Status).toBe('assembled');
      expect(dataAccess.CompleteMonthReads).toBe(2);
    });

    it('reads them again for a new run', async () => {
      const dataAccess = new CountingDataAccess({ Series: [{ ID: 'S1' }], Months: months });
      const deps = seriesModelDeps(dataAccess);
      await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'm20' }], scoringCtx, 'unit-rule');
      await new MLModelInferenceProcessor({ modelId: 'model-1', deps }).AssembleForScoring([{ ID: 'm20' }], scoringCtx, 'unit-rule');
      expect(dataAccess.CompleteMonthReads).toBe(2);
    });
  });

  describe('a lag reads a period only once its outcome window had closed by the row\'s decision', () => {
    const now = new Date('2026-11-10T00:00:00Z');
    const lagFeature = (name: string, index: number): FeatureColumnSpec => ({ name, source: { kind: 'series', feature: { kind: 'lag', index } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });
    const features = [lagFeature('Lag1', 0), lagFeature('Lag12', 1)];
    const assemble = async (context: 'train' | 'score', history: Awaited<ReturnType<typeof MLModelInferenceProcessor.SeriesHistoryForScoring>>, rows: readonly UnitRowLike[], assembledAt: Date = now): Promise<AsOfAssemblyResult> =>
      new AsOfFeatureAssembler().Assemble({
        Context: context, Unit: unit, RowEntity: entities.Months, Features: features, SeriesHistory: history, Read: { mode: 'complete' },
        Rows: rows.map((r) => ({ RowID: r.RowID, EntityKey: r.EntityKey, DecisionDate: r.DecisionDate, Period: r.Period })),
        DataAccess: seams.DataAccess, History: new RunViewRecordHistoryReader(seams.DataAccess, { mode: 'complete' }), Metadata: seams.Metadata, AssembledAt: assembledAt,
        CategoryLevels: new Map(),
      });
    type UnitRowLike = { readonly RowID: string; readonly EntityKey: string; readonly DecisionDate: Date; readonly Period: Date | null };

    it('nulls, on a training row, a lag whose period\'s 90-day window closes after the row\'s decision, and keeps one whose window had closed', async () => {
      const read = await new PredictionUnitRowReader().Read(unit, { ...seams, Read: { mode: 'complete' }, Now: now });
      if (read.Status !== 'read') throw new Error('training read refused');
      const out = await assemble('train', TrainingEngine.SeriesHistoryFor(unit, read.Rows), read.Rows);
      if (out.Status !== 'assembled') throw new Error(JSON.stringify(out));
      // m13 (2026-02-01): lag 1 reads m12 (2026-01-01), whose window closes 2026-04-01; lag 12 reads m01 (2025-02-01), closed 2025-05-02.
      expect(out.Rows.find((r) => r.RowID === 'm13')?.Values).toEqual([null, 101]);
    });

    it('scores a training row at the same instant into the identical vector', async () => {
      const read = await new PredictionUnitRowReader().Read(unit, { ...seams, Read: { mode: 'complete' }, Now: now });
      if (read.Status !== 'read') throw new Error('training read refused');
      const trained = await assemble('train', TrainingEngine.SeriesHistoryFor(unit, read.Rows), read.Rows);
      const scored = await assemble('score', await MLModelInferenceProcessor.SeriesHistoryForScoring(unit, seams, now), read.Rows);
      if (trained.Status !== 'assembled' || scored.Status !== 'assembled') throw new Error('assembly refused');
      expect(scored.Rows.map((r) => [r.RowID, r.Values])).toEqual(trained.Rows.map((r) => [r.RowID, r.Values]));
      expect(scored.Rows.some((r) => r.Values[0] !== null)).toBe(false);
    });

    it('nulls, on a row scored ahead of its decision day, a lag whose period\'s window is still open on the scoring day', async () => {
      // Scored 2026-11-10 for a decision on 2027-10-01: lag 12 reads m21 (2026-10-01), whose window closes 2026-12-30,
      // after the scoring day and before the decision. The history keeps m21 (its window is open), but its label is not
      // yet resolved, so the lag must not read it.
      const ahead: UnitRowLike = { RowID: 'f1', EntityKey: 'S1', DecisionDate: new Date('2027-10-01T00:00:00Z'), Period: new Date('2027-10-01T00:00:00Z') };
      const history = await MLModelInferenceProcessor.SeriesHistoryForScoring(unit, seams, now);
      const scored = await assemble('score', history, [ahead]);
      if (scored.Status !== 'assembled') throw new Error(JSON.stringify(scored));
      expect(scored.Rows[0].Values).toEqual([null, null]);
      // Scored on or after the decision day, the same row reads it by the decision-day rule.
      const onTheDay = await assemble('score', history, [ahead], new Date('2027-10-01T09:00:00Z'));
      if (onTheDay.Status !== 'assembled') throw new Error(JSON.stringify(onTheDay));
      expect(onTheDay.Rows[0].Values).toEqual([null, 121]);
    });
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
        return { predictions: (req.rows ?? []).map(() => ({ score: 0.75, class: 'renew', probabilities: null })), classOrder: null };
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

  it('writes the batch\'s champion audit rows before ProcessBatch returns, without waiting for the challengers (P4)', async () => {
    const { deps } = buildDeps();
    const championSaves: string[] = [];
    let challengersFinished = 0;
    /** A Feature Value row whose save takes 30 ms, like a database write. */
    const slowFeatureValue = () => {
      const row: Record<string, unknown> = {
        NewRecord: () => true,
        Save: async () => {
          await new Promise((r) => setTimeout(r, 30));
          if (row['Role'] === 'Champion') {
            championSaves.push(String(row['RecordID']));
          }
          return true;
        },
      };
      return row;
    };
    const emptyRead = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    const provider = {
      GetEntityObject: async <T>() => slowFeatureValue() as T,
      RunView: async () => emptyRead,
      RunViews: async (views: unknown[]) => views.map(() => emptyRead),
    } as unknown as IMetadataProvider;

    const shadowCoordinator = new ShadowScoringCoordinator({
      ChallengerRunner: {
        RunChallenger: async () => {
          await new Promise((r) => setTimeout(r, 300));
          challengersFinished++;
          return { Score: 0.5 };
        },
      },
      AuditSink: { RecordShadowAudit: async () => {} },
    });
    const proc = new MLModelInferenceProcessor(
      { modelId: 'model-1', deps, recordProcessId: 'rp-p4', challengerConfig: { ...challengerConfig, MaxLatencyMs: 1000 }, shadowCoordinator },
      new TestAssembler(new InMemoryDataAccess()),
    );

    const records = [memberRecord('m1', 10, 1, 'NYC'), memberRecord('m2', 20, 2, 'LA'), memberRecord('m3', 30, 3, 'NYC')];
    const startedAt = Date.now();
    const results = await proc.ProcessBatch(records, {
      ContextUser: { ID: 'user-1' } as UserInfo,
      Provider: provider,
      RecordProcessID: 'rp-p4',
      EntityID: 'ent-members',
    });
    const elapsedMs = Date.now() - startedAt;

    expect(results.every((r) => r.Status === 'Succeeded')).toBe(true);
    expect(championSaves.sort()).toEqual(['m1', 'm2', 'm3']);
    // The champion path did not wait for the 300 ms challengers.
    expect(challengersFinished).toBe(0);
    expect(elapsedMs).toBeLessThan(250);

    await shadowCoordinator.FlushInFlight();
    expect(challengersFinished).toBe(3);
  });

  it('logs each batch\'s own dropped challenger count when two runs share one coordinator (low: DroppedCount attribution)', async () => {
    const errorLogs: string[] = [];
    const origConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      errorLogs.push(args.map((a) => String(a)).join(' '));
    };
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      // Champion audit writes take 30 ms, so both runs are awaiting theirs at the same time.
      const slowRow = () => ({ NewRecord: () => true, Save: async () => { await new Promise((r) => setTimeout(r, 30)); return true; } });
      const emptyRead = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
      const provider = {
        GetEntityObject: async <T>() => slowRow() as T,
        RunView: async () => emptyRead,
        RunViews: async (views: unknown[]) => views.map(() => emptyRead),
      } as unknown as IMetadataProvider;
      // One shared coordinator with a single in-flight slot, held until the gate opens.
      const shared = new ShadowScoringCoordinator({
        MaxInFlight: 1,
        ChallengerRunner: { RunChallenger: async () => { await gate; return { Score: 0.5 }; } },
        AuditSink: { RecordShadowAudit: async () => {} },
      });
      const run = (recordProcessId: string, processRunId: string, ids: string[]) =>
        new MLModelInferenceProcessor(
          { modelId: 'model-1', deps: buildDeps().deps, recordProcessId, challengerConfig: { ...challengerConfig, MaxLatencyMs: 5000 }, shadowCoordinator: shared },
          new TestAssembler(new InMemoryDataAccess()),
        ).ProcessBatch(
          ids.map((id, i) => memberRecord(id, 10 + i, 1, 'NYC')),
          { ContextUser: { ID: 'user-1' } as UserInfo, Provider: provider, RecordProcessID: recordProcessId, ProcessRunID: processRunId, EntityID: 'ent-members' },
        );

      // An earlier dispatch holds the only slot, so run A drops all 3 of its challengers and run B, concurrently, both of its 2.
      shared.DispatchShadowScore(
        { RecordID: 'prime', ChallengerConfig: challengerConfig, FrozenFeatures: {}, DispatchedAt: new Date().toISOString() },
      );
      await Promise.all([run('rp-A', 'run-A', ['a1', 'a2', 'a3']), run('rp-B', 'run-B', ['b1', 'b2'])]);

      const dropCounts = errorLogs
        .map((m) => /(\d+) shadow (?:score|challenger) task\(s\) dropped/.exec(m)?.[1])
        .filter((n): n is string => n !== undefined)
        .map(Number);
      expect(dropCounts.sort()).toEqual([2, 3]);
      const dropLogs = errorLogs.filter((m) => m.includes('dropped in this batch'));
      expect(dropLogs.find((m) => m.includes("'rp-A' run 'run-A'"))).toContain(': 3 shadow challenger task(s) dropped');
      expect(dropLogs.find((m) => m.includes("'rp-B' run 'run-B'"))).toContain(': 2 shadow challenger task(s) dropped');
      expect(shared.DroppedCount).toBe(5);
      release?.();
      await shared.FlushInFlight();
    } finally {
      release?.();
      console.error = origConsoleError;
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

    const errors = ConsoleCapture.Errors();
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
    expect(ConsoleCapture.Lines(errors)).toEqual([
      "ShadowScoringCoordinator: challenger failed for record 'mem-real-1' (model='model-challenger-2'): SHADOW_TIMEOUT: Challenger exceeded MaxLatencyMs (20ms)",
    ]);

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
