import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import {
  ADVERSE_CLASS_HOLD_REASON, GateRecords, TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, TrainingRunResultsParser, TrustVerdicts,
  type CandidateInnerScore, type StoredGateRecord, type ModelingPlanSpec, type PredictionUnitColumns, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder, RESERVED_CANDIDATE_NAMES, RESERVED_CANDIDATE_PREFIX, type AlgorithmRow } from '../pipeline-builder';
import type { Actor, TransitionRefusal } from '@memberjunction/predictive-studio-core';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import type { EvaluateOutcome, EvaluateSubject, GateContext, PublishOutcome, PublishRequest } from '../../registry/gate-context';
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
/** The StatusReason the gate writes for a kept simple baseline (the stored decision's reason). */
const KEPT_REASON = 'The simple baseline glm beats the flat guess; the trained model does not beat it, so the simple baseline is kept.';
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
        if (name === 'MJ: ML Evaluation Protocols') return world.Protocol;
        if (name === 'MJ: ML Prediction Units') return world.Unit;
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
 * `Stored` holds (what the lifecycle gate saved).
 */
function publishableModel(lineage: string | null = null): { readonly Entity: MJMLModelEntity; readonly Saves: number; readonly Loads: number; Stored: MJMLModelEntity['Status'] } {
  const state = { Saves: 0, Loads: 0, Stored: 'Draft' as MJMLModelEntity['Status'] };
  const entity = {
    ID: 'M-1', Version: 1, Status: 'Draft', StatusReason: null as string | null, HoldoutMetrics: JSON.stringify({ auc: 0.95 }), FeatureImportance: null, Lineage: lineage, LatestResult: null,
    Save: async () => { state.Saves += 1; return true; },
    Load: async () => { state.Loads += 1; entity.Status = state.Stored; entity.StatusReason = state.Stored === 'KeepBaseline' ? KEPT_REASON : null; return true; },
  };
  return {
    Entity: entity as unknown as MJMLModelEntity,
    get Saves() { return state.Saves; },
    get Loads() { return state.Loads; },
    get Stored() { return state.Stored; },
    set Stored(v: MJMLModelEntity['Status']) { state.Stored = v; },
  };
}

/** One gate call the build made: the method, its subject, the initiator and the context user and provider. */
interface GateCall { readonly Method: 'Evaluate' | 'Publish'; readonly Subject: EvaluateSubject | { readonly modelId: string }; readonly Actor: Actor; readonly Ctx: GateContext }

/**
 * A lifecycle gate fake that records every call. Evaluate stores `Validated` (through `onEvaluate`) unless it is built
 * with a refusal; Publish is recorded so a test can pin that the build never calls it.
 */
class RecordingGate extends LifecycleGate {
  public readonly Requests: GateCall[] = [];
  constructor(
    private readonly onEvaluate: (status: 'Validated' | 'KeepBaseline') => void, private readonly refusal?: TransitionRefusal, private readonly to: 'Validated' | 'KeepBaseline' = 'Validated',
  ) { super(); }
  public override async Evaluate(subject: EvaluateSubject, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    this.Requests.push({ Method: 'Evaluate', Subject: subject, Actor: actor, Ctx: ctx });
    if (this.refusal !== undefined) return { Kind: 'refused', Refusal: this.refusal };
    this.onEvaluate(this.to);
    return { Kind: 'evaluated', ModelID: 'M-1', From: 'Draft', To: this.to };
  }
  public override async Publish(request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    this.Requests.push({ Method: 'Publish', Subject: { modelId: request.modelId }, Actor: request.initiator, Ctx: ctx });
    throw new Error('the build must not publish (M4b routes it through the automated publisher)');
  }
}

/** A gate fake for a run with no model row: Evaluate records the run's one run-level refusal (the stored trainer reason). */
class RunRecordingGate extends RecordingGate {
  constructor(private readonly reason: string) { super(() => undefined); }
  public override async Evaluate(subject: EvaluateSubject, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    this.Requests.push({ Method: 'Evaluate', Subject: subject, Actor: actor, Ctx: ctx });
    if (!('trainingRunId' in subject)) throw new Error('a no-model run is evaluated by its training run');
    return { Kind: 'run-recorded', TrainingRunID: subject.trainingRunId, Refusal: { kind: 'gate-no-signal', reason: this.reason }, RefusalRecordID: 'REC-1' };
  }
}

/** The builder evaluating through the given gate. */
class GatedBuilder extends PredictiveStudioPipelineBuilder {
  constructor(private readonly gate: LifecycleGate) { super(); }
  protected override CreateLifecycleGate(): LifecycleGate { return this.gate; }
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

  it("evaluates (never publishes) a model whose run's stored gate decision ships it: Evaluate({ trainingRunId }), the model stays Validated, and the verdict renders from that run", async () => {
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
    // Draft → Validated through the gate, by the run, as the user; nothing publishes until M4b; the builder never saves the model itself.
    expect(promotions.Requests.map((r) => [r.Method, r.Subject, r.Actor, r.Ctx.ContextUser, r.Ctx.Provider])).toEqual([['Evaluate', { trainingRunId: RUN_ID }, { kind: 'human', userId: user.ID }, user, provider]]);
    expect([result.published, result.readyToPublish, result.heldReason, model.Saves, model.Loads, model.Entity.Status]).toEqual([
      false, true, 'Evaluated to Validated through the lifecycle gate — it clears the bar to publish, and is published only when you ask.', 0, 1, 'Validated',
    ]);
    expect(result.trust).toEqual(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: run.ValidationResults, Lineage: null }));
    expect(result.Gate).toEqual({ Outcome: 'model', Reason: gate.reason.text });
    expect(result.trust?.Comparison).toEqual({ Against: 'the flat guess', Shipped: 'B', Value: gate.intervals.modelVsDummy.value, Lower: gate.intervals.modelVsDummy.lower, Upper: gate.intervals.modelVsDummy.upper, Metric: gate.primaryMetric });
  });

  it('a model the gate keeps at KeepBaseline is reported as the kept simple baseline with the stored reason, not as clearing the bar', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; }, undefined, 'KeepBaseline');
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect([result.published, result.readyToPublish, model.Entity.Status, result.heldReason]).toEqual([
      false, true, 'KeepBaseline', `Evaluated to KeepBaseline through the lifecycle gate — the gate kept the simple baseline. ${KEPT_REASON} It is published only when you ask.`,
    ]);
    expect(result.heldReason).not.toContain('clears the bar');
  });

  it('holds a model the lifecycle gate refuses to evaluate, with the refusal as the reason, at the status the gate left it', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const refusal: TransitionRefusal = { kind: 'not-servable', reason: 'ML Model M-1 has no stored gate decision to evaluate' };
    const promotions = new RecordingGate((status) => { model.Stored = status; }, refusal);
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => r.Method)).toEqual(['Evaluate']);
    expect([result.published, result.readyToPublish, model.Saves, model.Entity.Status]).toEqual([false, false, 0, 'Draft']);
    expect(result.heldReason).toBe('Not evaluated — the lifecycle gate refused: The model cannot be served: ML Model M-1 has no stored gate decision to evaluate');
  });

  it('a calibration-held model is evaluated and held', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel(JSON.stringify({ shippedMember: 'B', calibrationHold: { slope: 0.5 } }));
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => [r.Method, r.Subject])).toEqual([['Evaluate', { trainingRunId: RUN_ID }]]);
    expect([result.published, result.readyToPublish, model.Saves, model.Entity.Status]).toEqual([false, false, 0, 'Validated']);
    expect(result.heldReason).toBe('Held — its calibration slope 0.50 is outside 0.8–1.2, so its family is hidden (calibration hold); a hidden family is never published.');
  });

  it("a leakage-flagged model is evaluated through the gate and held from publishing with the gate's StatusReason", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; }, undefined, 'KeepBaseline');
    const run = completedRun([inner('A', 0.42), inner('B', 0.40)], 'B');
    const flagged = { ...run, Notes: 'Training completed. LEAKAGE WARNING: Age alone predicts the target.' } as unknown as MJMLTrainingRunEntity;
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: flagged });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => [r.Method, r.Subject])).toEqual([['Evaluate', { trainingRunId: RUN_ID }]]);
    expect([result.published, result.readyToPublish, result.leakageFlagged, model.Entity.Status, model.Entity.StatusReason]).toEqual([false, false, true, 'KeepBaseline', KEPT_REASON]);
    expect(result.heldReason).toBe('Held for analyst review — training flagged a possible data-leakage issue.');
  });

  it("a leakage-held model whose evaluation the gate refuses carries both the hold and the gate's refusal", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const refusal: TransitionRefusal = { kind: 'not-servable', reason: 'ML Model M-1 has no stored gate decision to evaluate' };
    const promotions = new RecordingGate((status) => { model.Stored = status; }, refusal);
    const run = completedRun([inner('A', 0.42), inner('B', 0.40)], 'B');
    const flagged = { ...run, Notes: 'Training completed. LEAKAGE WARNING: Age alone predicts the target.' } as unknown as MJMLTrainingRunEntity;
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: flagged });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect([result.published, result.readyToPublish, model.Entity.Status]).toEqual([false, false, 'Draft']);
    expect(result.heldReason).toBe('Held for analyst review — training flagged a possible data-leakage issue. — lifecycle gate: Not evaluated — the lifecycle gate refused: The model cannot be served: ML Model M-1 has no stored gate decision to evaluate');
  });

  it('keeps a model that clears the bar in Draft when publishing is off, ready to publish, without asking the lifecycle gate', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
    expect([result.published, result.readyToPublish, promotions.Requests.length, model.Saves, model.Entity.Status]).toEqual([false, true, 0, 0, 'Draft']);
    expect(result.heldReason).toBe(PredictiveStudioPipelineBuilder.KeptInDraftReason);
  });

  it('names the real blocker, not publishing being off, for a calibration-held model built with publishing off', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel(JSON.stringify({ shippedMember: 'B', calibrationHold: { slope: 0.5 } }));
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
    expect([result.published, result.readyToPublish, promotions.Requests.length]).toEqual([false, false, 0]);
    expect(result.heldReason).toBe('Held — its calibration slope 0.50 is outside 0.8–1.2, so its family is hidden (calibration hold); a hidden family is never published.');
  });

  it('reports an evaluated model as ready to publish, not published: neither the build nor anything after it publishes (until M4b)', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: true, initiator: { kind: 'agent', agentRunId: RUN_ID } });
    expect([result.published, result.readyToPublish, model.Entity.Status, promotions.Requests.map((r) => [r.Method, r.Actor])]).toEqual([false, true, 'Validated', [['Evaluate', { kind: 'agent', agentRunId: RUN_ID }]]]);
  });

  it("holds a model whose run's stored gate decision is no-signal, with the stored reason", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42)], 'A');
    const noSignal = { ...storedEnvelope(run), gate: { ...storedGate(run), decision: { outcome: 'no-signal' as const, branch: 'c:no-signal' as const, shipped: null, shippedRole: null, note: null }, reason: { code: 'nothing-beats-dummy' as const, text: 'Neither the model nor any simple baseline beats the flat guess.' } } };
    const model = publishableModel();
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(noSignal) } as unknown as MJMLTrainingRunEntity });
    const refusal: TransitionRefusal = { kind: 'gate-no-signal', reason: 'Neither the model nor any simple baseline beats the flat guess.' };
    const promotions = new RecordingGate((status) => { model.Stored = status; }, refusal);
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => r.Method)).toEqual(['Evaluate']);
    expect([result.published, result.heldReason, model.Saves, model.Entity.Status]).toEqual([
      false, 'Neither the model nor any simple baseline beats the flat guess. — lifecycle gate: Not evaluated — the lifecycle gate refused: The stored gate decision ships nothing: Neither the model nor any simple baseline beats the flat guess.', 0, 'Draft',
    ]);
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

  it("a no-model run gets one run-level refusal record with the trainer's reason", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42)], 'A', 'keep-simple-baseline');
    const noModel = { ...storedEnvelope(run), gate: { ...storedGate(run), decision: { outcome: 'no-signal' as const, branch: 'c:no-signal' as const, shipped: null, shippedRole: null, note: null }, reason: { code: 'nothing-beats-dummy' as const, text: 'Neither the model nor any simple baseline beats the flat guess.' } } };
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: null, run: { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(noModel) } as unknown as MJMLTrainingRunEntity });
    const gate = new RunRecordingGate('Neither the model nor any simple baseline beats the flat guess.');
    const provider = world.Provider();
    const result = await new GatedBuilder(gate).Build({ spec: plan(['A']), provider, user });
    expect(gate.Requests.map((r) => [r.Method, r.Subject, r.Actor, r.Ctx.ContextUser, r.Ctx.Provider])).toEqual([['Evaluate', { trainingRunId: RUN_ID }, { kind: 'human', userId: user.ID }, user, provider]]);
    expect([result.success, result.published, result.modelId, result.model, result.trust]).toEqual([true, false, undefined, undefined, undefined]);
    expect(result.heldReason).toBe('Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.');
    expect(result.leaderboard?.map((r) => r.ModelID)).toEqual([undefined]);
    expect(result.Gate).toEqual({ Outcome: 'no-signal', Reason: 'Neither the model nor any simple baseline beats the flat guess.' });
  });

  it('auto-publish off leaves the model Draft and writes no run-level record', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42)], 'A', 'keep-simple-baseline');
    const noModel = { ...storedEnvelope(run), gate: { ...storedGate(run), decision: { outcome: 'no-signal' as const, branch: 'c:no-signal' as const, shipped: null, shippedRole: null, note: null }, reason: { code: 'nothing-beats-dummy' as const, text: 'Neither the model nor any simple baseline beats the flat guess.' } } };
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: null, run: { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(noModel) } as unknown as MJMLTrainingRunEntity });
    const gate = new RunRecordingGate('Neither the model nor any simple baseline beats the flat guess.');
    const result = await new GatedBuilder(gate).Build({ spec: plan(['A']), provider: world.Provider(), user, autoPublish: false });
    expect([result.success, result.published, gate.Requests.length]).toEqual([true, false, 0]);
    expect(result.heldReason).toBe('Not published — the training run shipped no model: Neither the model nor any simple baseline beats the flat guess.');
  });

  it('binds a default protocol to a unit pipeline before the search trains, with a budget for every candidate', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Unit = { ...world.Unit, UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] }) };
    spyTraining(world, completedRun([inner('A', 0.42), inner('B', 0.40), inner('C', 0.41)], 'B'));
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect(result.success).toBe(true);
    expect(world.Order).toEqual(['save:pipeline', 'save:protocol', 'save:pipeline', 'train']);
    const protocol = world.Protocol as unknown as MJMLEvaluationProtocolEntity;
    expect(world.Pipeline.EvaluationProtocolID).toBe(protocol.ID);
    expect(JSON.parse(protocol.Holdout)).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(JSON.parse(protocol.Budgets)).toMatchObject({ maxCandidates: 3 });
    expect(protocol.Seed).toBe(0);
    expect(JSON.parse(protocol.AuthoredBy)).toEqual({ kind: 'system', component: 'pipeline-builder' });
  });
});

