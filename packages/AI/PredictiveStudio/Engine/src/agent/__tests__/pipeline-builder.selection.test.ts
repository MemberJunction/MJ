import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import {
  ADVERSE_CLASS_HOLD_REASON, GateRecords, TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, TrainingRunResultsParser, TrustVerdicts,
  type CandidateInnerScore, type StoredGateRecord, type ModelingPlanSpec, type PredictionUnitColumns, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder, RESERVED_CANDIDATE_NAMES, RESERVED_CANDIDATE_PREFIX, type AlgorithmRow } from '../pipeline-builder';
import type { IModelPromotionGate, PromoteModelOutcome, PromoteModelRequest } from '../../actions/promote-model.action';
import { TrainingDelegation } from '../../operations/delegation';
import { PipelineMigration } from '../../migration/legacy-pipeline-migration';
import type { TrainModelInput, TrainModelResult } from '../../training/types';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

// Test-double casts: the provider doubles below implement only the members the builder calls (RunView, entity
// lookup), so each is cast to `IMetadataProvider` (`as unknown as`) where it is handed to the builder; a field-bag
// row double is likewise cast to its entity type, and canned view rows to the requested row type. These are the
// file's only `unknown` uses.
const source = (file: string): string => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');

const ALGORITHMS: readonly AlgorithmRow[] = [
  { ID: 'A1B2C3D4-0000-4000-8000-000000000001', Name: 'XGBoost', DriverClass: 'xgboost' },
  { ID: 'A1B2C3D4-0000-4000-8000-000000000002', Name: 'Logistic Regression', DriverClass: 'logistic_regression' },
];

describe('PredictiveStudioPipelineBuilder.BuildCandidateSpecs', () => {
  const algorithms = new Map([
    ['xgboost', { ID: 'A1B2C3D4-0000-4000-8000-000000000001', DriverClass: 'xgboost' }],
    ['logistic_regression', { ID: 'A1B2C3D4-0000-4000-8000-000000000002', DriverClass: 'logistic_regression' }],
  ]);
  it('turns every approved experiment into a candidate of one search, not the first three', () => {
    const experiments = ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({
      Label: label, AlgorithmName: i % 2 === 0 ? 'xgboost' : 'logistic_regression', FeatureSet: [], Rationale: 'r', Priority: i,
      Hyperparameters: { max_depth: 3, note: 'x', nested: { a: 1 } },
    }));
    const candidates = PredictiveStudioPipelineBuilder.BuildCandidateSpecs(experiments, algorithms);
    expect(candidates.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect([candidates[1]?.algorithmId, candidates[1]?.driverKey]).toEqual(['A1B2C3D4-0000-4000-8000-000000000002', 'logistic_regression']);
    expect(candidates[0]?.hyperparameters).toEqual({ max_depth: 3, note: 'x' });
  });
  it('refuses a candidate named like a baseline member or with the heuristic prefix, and a label used twice', () => {
    const named = (Label: string) => ({ Label, AlgorithmName: 'xgboost', FeatureSet: [], Rationale: 'r', Priority: 0 });
    expect(() => PredictiveStudioPipelineBuilder.BuildCandidateSpecs([named('glm')], algorithms)).toThrow('reserved');
    expect(() => PredictiveStudioPipelineBuilder.BuildCandidateSpecs([named('heuristic:renewal')], algorithms)).toThrow('reserved');
    expect(() => PredictiveStudioPipelineBuilder.BuildCandidateSpecs([named('A'), named('A')], algorithms)).toThrow("Experiment label 'A' is used by two experiments");
  });
  it('refuses an experiment whose algorithm was not resolved', () => {
    expect(() => PredictiveStudioPipelineBuilder.BuildCandidateSpecs([{ Label: 'A', AlgorithmName: 'svm', FeatureSet: [], Rationale: 'r', Priority: 0 }], algorithms)).toThrow("Algorithm 'svm' was not resolved.");
  });
  it('no longer fabricates a CV score, falls back to 0.85, or drops experiments', () => {
    for (const file of ['pipeline-builder.ts', 'pipeline-builder-agent.ts']) {
      const text = source(file);
      expect(text).not.toMatch(/\* 0\.98/);
      expect(text).not.toMatch(/return 0\.85/);
      expect(text).not.toMatch(/slice\(0, 3\)/);
      expect(text).not.toMatch(/cvScore/);
    }
  });
});

describe('reserved candidate names match the sidecar baseline members', () => {
  it("lists exactly the sidecar's MEMBER_NAMES and HEURISTIC_PREFIX (Sidecar/src/python/app/baselines.py)", () => {
    const python = readFileSync(fileURLToPath(new URL('../../../../Sidecar/src/python/app/baselines.py', import.meta.url)), 'utf8');
    const members = /^DUMMY_MEMBER = "([^"]+)"\nMEMBER_NAMES = frozenset\(\{DUMMY_MEMBER, ([^}]*)\}\)$/m.exec(python);
    const prefix = /^HEURISTIC_PREFIX = "([^"]+)"$/m.exec(python);
    if (members === null || prefix === null) throw new Error('baselines.py no longer declares DUMMY_MEMBER, MEMBER_NAMES and HEURISTIC_PREFIX as this test reads them');
    const sidecarNames = [members[1], ...[...members[2].matchAll(/"([^"]+)"/g)].map((m) => m[1])];
    expect([...RESERVED_CANDIDATE_NAMES].sort()).toEqual(sidecarNames.sort());
    expect(RESERVED_CANDIDATE_PREFIX).toBe(prefix[1]);
  });
});

describe('PredictiveStudioPipelineBuilder.MatchAlgorithm', () => {
  it('matches a name or driver class case- and separator-insensitively, and reads a common short name', () => {
    expect(PredictiveStudioPipelineBuilder.MatchAlgorithm('LogisticRegression', ALGORITHMS)).toEqual({ ID: ALGORITHMS[1].ID, DriverClass: 'logistic_regression' });
    expect(PredictiveStudioPipelineBuilder.MatchAlgorithm('xgb', ALGORITHMS)).toEqual({ ID: ALGORITHMS[0].ID, DriverClass: 'xgboost' });
  });
  it('refuses a name two different rows match, naming both, rather than picking one', () => {
    const rows: readonly AlgorithmRow[] = [...ALGORITHMS, { ID: 'A1B2C3D4-0000-4000-8000-000000000009', Name: 'logistic_regression', DriverClass: 'logistic_regression' }];
    expect(() => PredictiveStudioPipelineBuilder.MatchAlgorithm('logistic_regression', rows)).toThrow(
      "Algorithm 'logistic_regression' matches more than one MJ: ML Algorithms row: 'Logistic Regression' (logistic_regression, a1b2c3d4-0000-4000-8000-000000000002) and 'logistic_regression' (logistic_regression, a1b2c3d4-0000-4000-8000-000000000009); name the algorithm by one of them.",
    );
  });
  it('resolves a row that matches on both its name and its driver class, and lists the algorithms when nothing matches', () => {
    expect(PredictiveStudioPipelineBuilder.MatchAlgorithm('xgboost', ALGORITHMS).ID).toBe(ALGORITHMS[0].ID);
    expect(() => PredictiveStudioPipelineBuilder.MatchAlgorithm('svm', ALGORITHMS)).toThrow("Algorithm 'svm' was not found in MJ: ML Algorithms. Available: XGBoost, Logistic Regression.");
  });
});

// ---- Build: the one training of a plan ------------------------------------------------------------------------------

const RUN_ID = 'B1B2C3D4-0000-4000-8000-0000000000AA';
const plan = (labels: readonly string[]): ModelingPlanSpec => ({
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the members' }],
  CandidateFeatures: [{ Name: 'Age', SourceRef: 'Members', Kind: 'numeric', Why: 'raw' }],
  LeakageNotes: [],
  ProposedExperiments: labels.map((Label, i) => ({ Label, AlgorithmName: i % 2 === 0 ? 'xgboost' : 'logistic_regression', FeatureSet: [], Rationale: 'r', Priority: i + 1 })),
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
});

/** Test doubles at the entity boundary: the builder reads and writes only these typed members. */
interface Saved { readonly Entity: string; readonly ID: string }
class BuildWorld {
  public readonly Saves: Saved[] = [];
  public readonly Order: string[] = [];
  public readonly Pipeline = { ID: 'P-1', Name: '', PredictionUnitID: null as string | null, EvaluationProtocolID: null as string | null, LatestResult: null, NewRecord: () => true, Save: async () => this.save('pipeline', 'P-1'), Delete: async () => this.save('delete:pipeline', 'P-1') };
  public readonly Protocol = { ID: '', LatestResult: null, Save: async () => this.save('protocol', this.Protocol.ID) };
  public Unit: PredictionUnitColumns & { Load: (id: string) => Promise<boolean> } = { ...UnitYearsWorld.UnitColumns(), Load: async () => true };
  private readonly target = { ID: 'E-1', Name: 'Members', BaseView: 'vwMembers', BaseTable: 'Member', SchemaName: 'dbo', Fields: [{ Name: 'Renewed' }, { Name: 'Age' }] };

  private save(entity: string, id: string): boolean {
    this.Saves.push({ Entity: entity, ID: id });
    this.Order.push(`save:${entity}`);
    return true;
  }

  public Provider(): IMetadataProvider {
    const world = this;
    const provider = {
      CurrentUser: { ID: 'U-1' },
      Entities: [world.target],
      EntityByName: (name: string) => (name === 'Members' ? world.target : undefined),
      async GetEntityObject(name: string) {
        if (name === 'MJ: ML Training Pipelines') return world.Pipeline;
        if (name === 'MJ: Evaluation Protocols') return world.Protocol;
        if (name === 'MJ: Prediction Units') return world.Unit;
        throw new Error(`unexpected entity ${name}`);
      },
      async RunView<T>(_params: RunViewParams): Promise<RunViewResult<T>> {
        return { Success: true, Results: ALGORITHMS as unknown as T[], RowCount: ALGORITHMS.length, TotalRowCount: ALGORITHMS.length, ExecutionTime: 0, ErrorMessage: '' };
      },
    };
    return provider as unknown as IMetadataProvider;
  }
}

function measuredModel(): MJMLModelEntity {
  return { ID: 'M-1', Version: 1, Metrics: null, HoldoutMetrics: JSON.stringify({ auc: 0.8 }), ProblemType: 'classification', FeatureImportance: null, Lineage: null } as unknown as MJMLModelEntity;
}

/**
 * A model the builder may publish: it records how many times it was saved and reloaded; a reload reads back the status
 * `Stored` holds (what the promotion gate saved).
 */
function publishableModel(lineage: string | null = null): { readonly Entity: MJMLModelEntity; readonly Saves: number; readonly Loads: number; Stored: MJMLModelEntity['Status'] } {
  const state = { Saves: 0, Loads: 0, Stored: 'Draft' as MJMLModelEntity['Status'] };
  const entity = {
    ID: 'M-1', Version: 1, Status: 'Draft', HoldoutMetrics: JSON.stringify({ auc: 0.95 }), FeatureImportance: null, Lineage: lineage, LatestResult: null,
    Save: async () => { state.Saves += 1; return true; },
    Load: async () => { state.Loads += 1; entity.Status = state.Stored; return true; },
  };
  return {
    Entity: entity as unknown as MJMLModelEntity,
    get Saves() { return state.Saves; },
    get Loads() { return state.Loads; },
    get Stored() { return state.Stored; },
    set Stored(v: MJMLModelEntity['Status']) { state.Stored = v; },
  };
}

/** A promotion gate that records each request; it refuses `refuseAt` with `refusal`, else it promotes and stores the status. */
class RecordingGate implements IModelPromotionGate {
  public readonly Requests: PromoteModelRequest[] = [];
  constructor(private readonly onPromote: (status: PromoteModelRequest['targetStatus']) => void, private readonly refuseAt?: PromoteModelRequest['targetStatus'], private readonly refusal?: PromoteModelOutcome) {}
  public async promote(request: PromoteModelRequest): Promise<PromoteModelOutcome> {
    this.Requests.push(request);
    if (request.targetStatus === this.refuseAt && this.refusal !== undefined) return this.refusal;
    this.onPromote(request.targetStatus);
    return { kind: 'promoted', newStatus: request.targetStatus };
  }
}

/** The builder publishing through the given gate. */
class GatedBuilder extends PredictiveStudioPipelineBuilder {
  constructor(private readonly gate: IModelPromotionGate) { super(); }
  protected override CreatePromotionGate(): IModelPromotionGate { return this.gate; }
}

/**
 * A completed search run whose stored trainer result has these inner scores and finalist, and whose stored gate record
 * ships the finalist (`model`) or keeps the GLM (`keep-simple-baseline`).
 */
function completedRun(innerScores: readonly CandidateInnerScore[], finalist: string, outcome: 'model' | 'keep-simple-baseline' = 'model'): MJMLTrainingRunEntity {
  const budgets = { budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 10, hardStop: true as const } };
  const canned = outcome === 'model' ? TrainerResultFixtures.CannedModelWins(RUN_ID, budgets) : TrainerResultFixtures.CannedCompleted(RUN_ID, budgets);
  const result = { ...TrainerResultFixtures.WithFinalist(canned, finalist, 'f'.repeat(64)), innerScores };
  const gate = GateRecords.BuildStoredGateRecord({ Result: result, Protocol: ProtocolRowFixture.Spec(), Task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, Carve: null });
  if (gate.Ok === false) throw new Error(`completedRun: the gate record was refused: ${gate.Refusal.kind}`);
  const results: TrainingRunResults = {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 10, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 10, dataCutoff: '2026-01-01' },
    trainer: TrainerContract.ToStoredTrainerResult(result, new Map([[finalist, 'F-1']])), trainerRequest: null, carve: null, gate: gate.Record,
  };
  return { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(results) } as unknown as MJMLTrainingRunEntity;
}

/** The completed envelope a run stores. */
function storedEnvelope(run: MJMLTrainingRunEntity): Extract<TrainingRunResults, { status: 'completed' }> {
  const parsed = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
  if (!parsed.Ok || parsed.Value.status !== 'completed') throw new Error('storedEnvelope: not a completed envelope');
  return parsed.Value;
}

/** The gate record a completed run stores. */
function storedGate(run: MJMLTrainingRunEntity): StoredGateRecord {
  const gate = storedEnvelope(run).gate;
  if (gate === null) throw new Error('storedGate: the run stores no gate record');
  return gate;
}

const inner = (candidate: string, value: number): CandidateInnerScore => ({ candidate, inner: TrainerResultFixtures.Mwi('log-loss', value, value - 0.02, value + 0.02, 400), folds: 15, optimistic: true });
const user = { ID: 'U-1' } as UserInfo;

describe('PredictiveStudioPipelineBuilder.Build — one pipeline, one training', () => {
  afterEach(() => vi.restoreAllMocks());

  function spyTraining(world: BuildWorld, run: MJMLTrainingRunEntity): TrainModelInput[] {
    const calls: TrainModelInput[] = [];
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockImplementation(async (input: TrainModelInput): Promise<TrainModelResult> => {
      calls.push(input);
      world.Order.push('train');
      return { model: measuredModel(), run };
    });
    return calls;
  }

  it('binds a migrated Prediction Unit to the new pipeline right after saving it, then its search protocol, and trains every candidate', async () => {
    const world = new BuildWorld();
    world.Unit = { ...world.Unit, UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }) };
    const bind = vi.spyOn(PipelineMigration, 'BindMigratedUnit').mockImplementation(async () => {
      world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
      world.Order.push('bind:unit');
      return { Ok: true, UnitID: UnitYearsWorld.UnitID };
    });
    const calls = spyTraining(world, completedRun([inner('A', 0.42), inner('B', 0.40), inner('C', 0.41)], 'B'));
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect([result.success, bind.mock.calls.length]).toEqual([true, 1]);
    expect(world.Order).toEqual(['save:pipeline', 'bind:unit', 'save:protocol', 'save:pipeline', 'train']);
    expect(calls[0].candidates?.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('refuses a plan whose target the unit mapping would hold, before anything trains, naming the reason, and keeps no pipeline', async () => {
    const errors = ConsoleCapture.Errors();
    const world = new BuildWorld();
    vi.spyOn(PipelineMigration, 'BindMigratedUnit').mockResolvedValue({ Ok: false, Reason: ADVERSE_CLASS_HOLD_REASON });
    const calls = spyTraining(world, { ID: RUN_ID } as unknown as MJMLTrainingRunEntity);
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A']), provider: world.Provider(), user });
    expect([result.success, calls.length, world.Order]).toEqual([false, 0, ['save:pipeline', 'save:delete:pipeline']]);
    expect(result.errorMessage).toBe(`The pipeline gets no Prediction Unit, so it cannot train and was not kept: ${ADVERSE_CLASS_HOLD_REASON}`);
    expect(ConsoleCapture.Lines(errors)).toHaveLength(1);
  });

  it("publishes a model whose run's stored gate decision ships it through the promotion gate, and renders the verdict from that run", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42), inner('B', 0.40)], 'B');
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run });
    const provider = world.Provider();
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider, user });
    const gate = storedGate(run);
    // Draft → Validated → Published through the gate with no sign-off; the builder never saves the model itself.
    expect(promotions.Requests.map((r) => [r.modelId, r.targetStatus, r.signOff, r.contextUser, r.provider])).toEqual([['M-1', 'Validated', false, user, provider], ['M-1', 'Published', false, user, provider]]);
    expect([result.published, result.heldReason, model.Saves, model.Loads, model.Entity.Status]).toEqual([true, null, 0, 1, 'Published']);
    expect(result.trust).toEqual(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: run.ValidationResults, Lineage: null }));
    expect(result.Gate).toEqual({ Outcome: 'model', Reason: gate.reason.text });
    expect(result.trust?.Comparison).toEqual({ Against: 'the flat guess', Shipped: 'B', Value: gate.intervals.modelVsDummy.value, Lower: gate.intervals.modelVsDummy.lower, Upper: gate.intervals.modelVsDummy.upper, Metric: gate.primaryMetric });
  });

  it('holds a model the promotion gate refuses, with the refusal as the reason, at the status the gate left it', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const refusal: PromoteModelOutcome = { kind: 'not-servable', message: "ML Model 'M-1' cannot be published or score records: forecast models are not served by /predict yet." };
    const promotions = new RecordingGate((status) => { model.Stored = status; }, 'Published', refusal);
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => r.targetStatus)).toEqual(['Validated', 'Published']);
    expect([result.published, model.Saves, model.Entity.Status]).toEqual([false, 0, 'Validated']);
    expect(result.heldReason).toBe("Not published — the promotion gate refused to move it to Published: ML Model 'M-1' cannot be published or score records: forecast models are not served by /predict yet.");
  });

  it('holds a calibration-held model with the reason, without asking the promotion gate', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel(JSON.stringify({ shippedMember: 'B', calibrationHold: { slope: 0.5 } }));
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect([result.published, promotions.Requests.length, model.Saves, model.Entity.Status]).toEqual([false, 0, 0, 'Draft']);
    expect(result.heldReason).toBe('Held — its calibration slope 0.50 is outside 0.8–1.2, so its family is hidden (calibration hold); a hidden family is never published.');
  });

  it("holds a model whose run's stored gate decision is no-signal, with the stored reason", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42)], 'A');
    const noSignal = { ...storedEnvelope(run), gate: { ...storedGate(run), decision: { outcome: 'no-signal' as const, branch: 'c:no-signal' as const, shipped: null, shippedRole: null, note: null }, reason: { code: 'nothing-beats-dummy' as const, text: 'Neither the model nor any simple baseline beats the flat guess.' } } };
    const model = publishableModel();
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(noSignal) } as unknown as MJMLTrainingRunEntity });
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A']), provider: world.Provider(), user });
    expect([result.published, result.heldReason, model.Saves]).toEqual([false, 'Neither the model nor any simple baseline beats the flat guess.', 0]);
  });

  it('refuses a plan with a bad experiment before any row is written, whichever branch it would take', async () => {
    const errors = ConsoleCapture.Errors();
    const world = new BuildWorld();
    const calls = spyTraining(world, { ID: RUN_ID } as unknown as MJMLTrainingRunEntity);
    const spec = plan(['A', 'glm']);
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec, provider: world.Provider(), user, autoPublish: false });
    expect(result.errorMessage).toBe("Experiment label 'glm' is reserved for a baseline member; rename the experiment.");
    expect([world.Saves.length, calls.length]).toEqual([0, 0]);
    expect(ConsoleCapture.Lines(errors)).toEqual(["PredictiveStudioPipelineBuilder.build failed: Experiment label 'glm' is reserved for a baseline member; rename the experiment."]);
  });

  it('runs one search over every approved experiment on a unit pipeline and ranks on the stored inner-fold means, the finalist the winner', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const calls = spyTraining(world, completedRun([inner('A', 0.42), inner('B', 0.40), inner('C', 0.41), inner('D', 0.45), inner('E', 0.44)], 'C'));
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B', 'C', 'D', 'E']), provider: world.Provider(), user, autoPublish: false });
    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].candidates?.map((c) => [c.name, c.driverKey])).toEqual([['A', 'xgboost'], ['B', 'logistic_regression'], ['C', 'xgboost'], ['D', 'logistic_regression'], ['E', 'xgboost']]);
    // Only the finalist's row links the model, under both keys (the viewer reads `ModelID` first).
    expect(result.leaderboard?.map((r) => [r.rank, r.algorithm, r.score, r.innerLower, r.innerUpper, r.optimistic, r.isWinner, r.modelId, r.ModelID])).toEqual([
      [1, 'B', 0.40, 0.38, 0.42, true, false, undefined, undefined],
      [2, 'C', 0.41, 0.39, 0.43, true, true, 'M-1', 'M-1'],
      [3, 'A', 0.42, 0.4, 0.44, true, false, undefined, undefined],
      [4, 'E', 0.44, 0.42, 0.46, true, false, undefined, undefined],
      [5, 'D', 0.45, 0.43, 0.47, true, false, undefined, undefined],
    ].map((row) => row.map((v) => (typeof v === 'number' ? expect.closeTo(v, 12) : v))));
    expect(result.leaderboard?.every((r) => r.metricName === 'log-loss')).toBe(true);
  });

  it("links no candidate row to the model when the gate kept a simple baseline (the model is the baseline's, not the finalist's)", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    spyTraining(world, completedRun([inner('A', 0.42), inner('B', 0.40)], 'B', 'keep-simple-baseline'));
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
    expect(result.leaderboard?.map((r) => [r.algorithm, r.isWinner, r.ModelID, r.modelId])).toEqual([['B', true, undefined, undefined], ['A', false, undefined, undefined]]);
    expect(result.Gate?.Outcome).toBe('keep-simple-baseline');
  });

  it('holds a build whose training run shipped no model, with the stored reason, and publishes nothing', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42)], 'A', 'keep-simple-baseline');
    const noModel = { ...storedEnvelope(run), gate: { ...storedGate(run), decision: { outcome: 'no-signal' as const, branch: 'c:no-signal' as const, shipped: null, shippedRole: null, note: null }, reason: { code: 'nothing-beats-dummy' as const, text: 'Neither the model nor any simple baseline beats the flat guess.' } } };
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: null, run: { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(noModel) } as unknown as MJMLTrainingRunEntity });
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A']), provider: world.Provider(), user });
    expect([result.success, result.published, result.modelId, result.model, result.trust]).toEqual([true, false, undefined, undefined, undefined]);
    expect(result.heldReason).toBe('Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.');
    expect(result.leaderboard?.map((r) => r.ModelID)).toEqual([undefined]);
    expect(result.Gate).toEqual({ Outcome: 'no-signal', Reason: 'Neither the model nor any simple baseline beats the flat guess.' });
  });

  it('binds a default protocol to a unit pipeline before the search trains, with a budget for every candidate', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Unit = { ...world.Unit, UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] }) };
    spyTraining(world, completedRun([inner('A', 0.42), inner('B', 0.40), inner('C', 0.41)], 'B'));
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect(result.success).toBe(true);
    expect(world.Order).toEqual(['save:pipeline', 'save:protocol', 'save:pipeline', 'train']);
    const protocol = world.Protocol as unknown as MJEvaluationProtocolEntity;
    expect(world.Pipeline.EvaluationProtocolID).toBe(protocol.ID);
    expect(JSON.parse(protocol.Holdout)).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(JSON.parse(protocol.Budgets)).toMatchObject({ maxCandidates: 3 });
    expect(protocol.Seed).toBe(0);
    expect(JSON.parse(protocol.AuthoredBy)).toEqual({ kind: 'system', component: 'pipeline-builder' });
  });
});

