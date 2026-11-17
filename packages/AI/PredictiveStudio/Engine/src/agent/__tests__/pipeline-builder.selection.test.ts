/**
 * Test doubles at the framework-class boundary (M4b.3 C7, kept by the controller's ruling). Each cast below stands a
 * plain field bag or stub in for a framework class the builder only reads, because the real class needs a live
 * provider and generated metadata:
 * - `ALGORITHMS as unknown as T[]` (`BuildWorld`'s stub `RunView` answer, the algorithm rows, typed by the caller's T);
 * - `provider as unknown as IMetadataProvider` (the `BuildWorld` stub provider, which implements only what the build calls);
 * - `{ … } as unknown as MJMLModelEntity` / `entity as unknown as MJMLModelEntity` (field-bag model rows for `measuredModel`
 *   and `publishableModel`);
 * - `{ … } as unknown as MJMLTrainingRunEntity` (field-bag training-run rows returned by the training seam's spy);
 * - `world.Protocol as unknown as MJMLEvaluationProtocolEntity` (the protocol field bag the build filled, read back by the assertions).
 * `'Draft' as MJMLModelEntity['Status']` only widens a literal to the entity's status union. The plan-verbatim `??` stay.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UserInfo, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { MJMLEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import {
  ADVERSE_CLASS_HOLD_REASON, GateRecords, JsonParse, TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, TrainingRunResultsParser, TrustVerdicts,
  type CandidateInnerScore, type JsonValue, type StoredGateRecord, type ModelingPlanSpec, type PredictionUnitColumns, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder, RESERVED_CANDIDATE_NAMES, RESERVED_CANDIDATE_PREFIX, type AlgorithmRow } from '../pipeline-builder';
import type { Actor, TransitionRefusal } from '@memberjunction/predictive-studio-core';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { AutomatedPublisher } from '../../registry/automated-publisher';
import { PublishNotifications } from '../../registry/publish-notifications';
import type { EvaluateOutcome, EvaluateSubject, GateContext, PublishOutcome, PublishRequest } from '../../registry/gate-context';
import { TrainingDelegation } from '../../operations/delegation';
import { PipelineMigration } from '../../migration/legacy-pipeline-migration';
import { EvaluationProtocolVersioning } from '../../protocol/protocol-versioning';
import type { TrainModelInput, TrainModelResult } from '../../training/types';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

// Test-double casts: the provider doubles below implement only the members the builder calls (RunView, entity
// lookup), so each is cast to `IMetadataProvider` (`as unknown as`) where it is handed to the builder; a field-bag
// row double is likewise cast to its entity type, and canned view rows to the requested row type. These are the
// file's only casts.
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
 * A lifecycle gate fake that records every call. Evaluate stores `Validated` (through `onStore`) unless it is built
 * with a refusal; Publish stores `Published` and answers `published` (the automated publisher's second call).
 */
class RecordingGate extends LifecycleGate {
  public readonly Requests: GateCall[] = [];
  constructor(
    private readonly onStore: (status: MJMLModelEntity['Status']) => void, private readonly refusal?: TransitionRefusal, private readonly to: 'Validated' | 'KeepBaseline' = 'Validated',
  ) { super(); }
  public override async Evaluate(subject: EvaluateSubject, actor: Actor, ctx: GateContext): Promise<EvaluateOutcome> {
    this.Requests.push({ Method: 'Evaluate', Subject: subject, Actor: actor, Ctx: ctx });
    if (this.refusal !== undefined) return { Kind: 'refused', Refusal: this.refusal };
    this.onStore(this.to);
    return { Kind: 'evaluated', ModelID: 'M-1', From: 'Draft', To: this.to };
  }
  public override async Publish(request: PublishRequest, ctx: GateContext): Promise<PublishOutcome> {
    this.Requests.push({ Method: 'Publish', Subject: { modelId: request.modelId }, Actor: request.initiator, Ctx: ctx });
    this.onStore('Published');
    return { Kind: 'published', Purpose: request.purpose, ModelID: request.modelId, PublishRecordID: 'REC-P', Replaces: null, Approver: 'automated-gate' };
  }
}

/** Notifications that record what the automated publisher would send, and send nothing. */
class RecordingNotifications extends PublishNotifications {
  public readonly Sent: string[] = [];
  public override async Notify(outcome: PublishOutcome): Promise<void> {
    this.Sent.push(outcome.Kind);
  }
  public override async NotifyStoppedAtEvaluate(trainingRunId: string, refusal: TransitionRefusal): Promise<void> {
    this.Sent.push(`stopped ${trainingRunId} ${refusal.kind}`);
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

/**
 * The builder for a test that looks only at the pipeline, its binding and its leaderboard: its gate refuses the
 * evaluation, so the build never reloads the measured model.
 */
const unevaluatedBuilder = (): GatedBuilder => new GatedBuilder(new RecordingGate(() => undefined, { kind: 'not-servable', reason: 'not under test' }));

/** The builder evaluating and publishing through the given gate, its automated publisher's notifications recorded. */
class GatedBuilder extends PredictiveStudioPipelineBuilder {
  public readonly Notifications = new RecordingNotifications();
  constructor(private readonly gate: LifecycleGate) { super(); }
  protected override CreateLifecycleGate(): LifecycleGate { return this.gate; }
  protected override CreateAutomatedPublisher(gate: LifecycleGate): AutomatedPublisher { return new AutomatedPublisher(gate, this.Notifications); }
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

/** A stored JSON column's value; throws naming the column when it does not parse. */
function jsonOf(text: string | null, column: string): JsonValue {
  const parsed = JsonParse.ParseJsonText(text, column);
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

const inner = (candidate: string, value: number): CandidateInnerScore => ({ candidate, inner: TrainerResultFixtures.Mwi('log-loss', value, value - 0.02, value + 0.02, 400), folds: 15, optimistic: true });
const user = new UserInfo(null, { ID: 'U-1', Email: 'selection-tests@example.com', Type: 'User' });

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
    const result = await unevaluatedBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect([result.success, bind.mock.calls.length]).toEqual([true, 1]);
    expect(world.Order).toEqual(['save:pipeline', 'bind:unit', 'save:protocol', 'save:pipeline', 'train']);
    expect(calls[0].candidates?.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('saves the protocol it binds with the promotion setting the caller supplies (OF4-30), and the default one otherwise', async () => {
    const promotions: boolean[] = [];
    for (const protocolPromotion of [undefined, { autoPublishKeepBaseline: true }]) {
      const world = new BuildWorld();
      world.Unit = { ...world.Unit, UnitRows: JSON.stringify({ kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'fixed', date: '2026-10-20', advance: 'each-run' }, filter: [] }) };
      vi.spyOn(PipelineMigration, 'BindMigratedUnit').mockImplementation(async () => {
        world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
        return { Ok: true, UnitID: UnitYearsWorld.UnitID };
      });
      const save = vi.spyOn(EvaluationProtocolVersioning, 'CreateEvaluationProtocolV1');
      spyTraining(world, completedRun([inner('A', 0.42)], 'A'));
      const result = await unevaluatedBuilder().Build({ spec: plan(['A']), provider: world.Provider(), user, autoPublish: false, protocolPromotion });
      expect([result.success, save.mock.calls.length, world.Order.filter((o) => o === 'save:protocol').length]).toEqual([true, 1, 1]);
      promotions.push(save.mock.calls[0][0].promotion.autoPublishKeepBaseline);
      vi.restoreAllMocks();
    }
    expect(promotions).toEqual([false, true]);
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

  it("publishes a model whose run's stored gate decision ships it through the automated publisher: Evaluate({ trainingRunId }) then Publish, as the user, and the verdict renders from that run", async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const run = completedRun([inner('A', 0.42), inner('B', 0.40)], 'B');
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run });
    const provider = world.Provider();
    const builder = new GatedBuilder(promotions);
    const result = await builder.Build({ spec: plan(['A', 'B']), provider, user });
    const gate = storedGate(run);
    // Draft → Validated → Published through the gate, by the run, as the user; the builder never saves the model itself.
    expect(promotions.Requests.map((r) => [r.Method, r.Subject, r.Actor, r.Ctx.ContextUser, r.Ctx.Provider])).toEqual([
      ['Evaluate', { trainingRunId: RUN_ID, AttemptPurpose: 'publish' }, { kind: 'human', userId: user.ID }, user, provider],
      ['Publish', { modelId: 'M-1' }, { kind: 'human', userId: user.ID }, user, provider],
    ]);
    expect([result.published, result.readyToPublish, result.heldReason, model.Saves, model.Loads, model.Entity.Status, builder.Notifications.Sent]).toEqual([
      true, false, null, 0, 1, 'Published', ['published'],
    ]);
    expect(result.trust).toEqual(TrustVerdicts.DeriveTrustVerdict({ ValidationResults: run.ValidationResults, Lineage: null }));
    expect(result.Gate).toEqual({ Outcome: 'model', Reason: gate.reason.text });
    expect(result.trust?.Comparison).toEqual({ Against: 'the flat guess', Shipped: 'B', Value: gate.intervals.modelVsDummy.value, Lower: gate.intervals.modelVsDummy.lower, Upper: gate.intervals.modelVsDummy.upper, Metric: gate.primaryMetric });
  });

  it('a model the gate keeps at KeepBaseline with publishing off is reported as the kept simple baseline with the stored reason, not as clearing the bar', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; }, undefined, 'KeepBaseline');
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
    expect([result.published, result.readyToPublish, model.Entity.Status, result.heldReason]).toEqual([
      false, true, 'KeepBaseline', `Evaluated to KeepBaseline through the lifecycle gate — the gate kept the simple baseline. ${KEPT_REASON} It is published only when you ask.`,
    ]);
    expect(result.heldReason).not.toContain('clears the bar');
  });

  it('withholds a model the lifecycle gate refuses to evaluate, with the refusal as the reason, at the status the gate left it, and notifies the stop', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const refusal: TransitionRefusal = { kind: 'not-servable', reason: 'ML Model M-1 has no stored gate decision to evaluate' };
    const promotions = new RecordingGate((status) => { model.Stored = status; }, refusal);
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const builder = new GatedBuilder(promotions);
    const result = await builder.Build({ spec: plan(['A', 'B']), provider: world.Provider(), user });
    expect(promotions.Requests.map((r) => r.Method)).toEqual(['Evaluate']);
    expect([result.published, result.readyToPublish, model.Saves, model.Entity.Status, builder.Notifications.Sent]).toEqual([false, false, 0, 'Draft', [`stopped ${RUN_ID} not-servable`]]);
    expect(result.heldReason).toBe('withheld: The model cannot be served: ML Model M-1 has no stored gate decision to evaluate');
  });

  it('evaluates a model that clears the bar when publishing is off: Validated, ready to publish, never published', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const builder = new GatedBuilder(promotions);
    const result = await builder.Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
    expect([result.published, result.readyToPublish, promotions.Requests.map((r) => r.Method), model.Saves, model.Entity.Status, builder.Notifications.Sent]).toEqual([false, true, ['Evaluate'], 0, 'Validated', []]);
    expect(result.heldReason).toBe(PredictiveStudioPipelineBuilder.KeptInDraftReason);
  });

  it('publishes as the agent run: both gate calls carry the agent initiator', async () => {
    const world = new BuildWorld();
    world.Pipeline.PredictionUnitID = UnitYearsWorld.UnitID;
    world.Pipeline.EvaluationProtocolID = 'EP-1';
    const model = publishableModel();
    const promotions = new RecordingGate((status) => { model.Stored = status; });
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockResolvedValue({ model: model.Entity, run: completedRun([inner('A', 0.42), inner('B', 0.40)], 'B') });
    const result = await new GatedBuilder(promotions).Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: true, initiator: { kind: 'agent', agentRunId: RUN_ID } });
    expect([result.published, result.readyToPublish, model.Entity.Status, promotions.Requests.map((r) => [r.Method, r.Actor])]).toEqual([
      true, false, 'Published', [['Evaluate', { kind: 'agent', agentRunId: RUN_ID }], ['Publish', { kind: 'agent', agentRunId: RUN_ID }]],
    ]);
  });

  it("withholds a model whose run's stored gate decision is no-signal, with the gate's recorded reason", async () => {
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
      false, 'withheld: The stored gate decision ships nothing: Neither the model nor any simple baseline beats the flat guess.', 0, 'Draft',
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
    const result = await unevaluatedBuilder().Build({ spec: plan(['A', 'B', 'C', 'D', 'E']), provider: world.Provider(), user, autoPublish: false });
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
    const result = await unevaluatedBuilder().Build({ spec: plan(['A', 'B']), provider: world.Provider(), user, autoPublish: false });
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
    const builder = new GatedBuilder(gate);
    const result = await builder.Build({ spec: plan(['A']), provider, user });
    expect(gate.Requests.map((r) => [r.Method, r.Subject, r.Actor, r.Ctx.ContextUser, r.Ctx.Provider])).toEqual([['Evaluate', { trainingRunId: RUN_ID, AttemptPurpose: 'publish' }, { kind: 'human', userId: user.ID }, user, provider]]);
    expect([result.success, result.published, result.modelId, result.model, result.trust, builder.Notifications.Sent]).toEqual([true, false, null, undefined, undefined, [`stopped ${RUN_ID} gate-no-signal`]]);
    expect(result.heldReason).toBe('withheld: the training run has no model to publish. The stored gate decision ships nothing: Neither the model nor any simple baseline beats the flat guess.');
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
    const result = await unevaluatedBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect(result.success).toBe(true);
    expect(world.Order).toEqual(['save:pipeline', 'save:protocol', 'save:pipeline', 'train']);
    const protocol = world.Protocol as unknown as MJMLEvaluationProtocolEntity;
    expect(world.Pipeline.EvaluationProtocolID).toBe(protocol.ID);
    expect(jsonOf(protocol.Holdout, 'Holdout')).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(jsonOf(protocol.Budgets, 'Budgets')).toMatchObject({ maxCandidates: 3 });
    expect(protocol.Seed).toBe(0);
    expect(jsonOf(protocol.AuthoredBy, 'AuthoredBy')).toEqual({ kind: 'system', component: 'pipeline-builder' });
  });
});

