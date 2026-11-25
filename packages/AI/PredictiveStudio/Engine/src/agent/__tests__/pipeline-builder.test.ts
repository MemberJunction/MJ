/**
 * `PredictiveStudioPipelineBuilder`: its warnings and error handling, and (Task M4b.3) its publish step through
 * `AutomatedPublisher` over the `GateTestStore` world — the real lifecycle gate, the real automated publisher and real
 * notifications; only training is faked ({@link BuilderTrainer}, over `TrainingDelegation.TrainModelViaEngine`). The
 * plan's three cases are verbatim; the cases after them are this task's additions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInfo, WellKnownUserSource, type IMetadataProvider } from '@memberjunction/core';
import { DatabaseProviderStub } from '@memberjunction/unit-testing';
import {
  ResourceTypeEngine, type MJMLModelEntity, type MJMLTrainingPipelineEntity, type MJMLTrainingRunEntity, type MJResourceTypeEntity,
} from '@memberjunction/core-entities';
import { TrainingRunResultsParser, type Actor, type CandidateSpec, type LeakageFlag, type ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioPipelineBuilder } from '../pipeline-builder';
import type { PipelineConfig } from '../modeling-plan-to-pipeline';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeClock, GateTestStore, GateWorld } from '../../__tests__/fakes/gate-test-store';
import { RecordingScoringActions } from '../../__tests__/fakes/scoring-action-fakes';
import { MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders } from '../../__tests__/fakes/storage-fakes';
import type { WorldTrainingOutcome } from '../../__tests__/fakes/world-trainer';
import { TrainingDelegation } from '../../operations/delegation';
import { AutomatedPublisher } from '../../registry/automated-publisher';
import type { GateContext, PublishOutcome } from '../../registry/gate-context';
import { GateRefusals } from '../../registry/gate-refusals';
import { LifecycleGate } from '../../registry/lifecycle-gate';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import type { TrainModelResult } from '../../training/types';

const failingUser = new UserInfo(null, { ID: '6A1D2E3F-0000-4000-8000-0000000000F1', Email: 'test@example.com', Type: 'User' });
/** A provider with no entities: the build fails resolving the plan's target before any row is written. */
const emptyProvider = (): IMetadataProvider => new DatabaseProviderStub();

describe('PredictiveStudioPipelineBuilder warnings and error handling', () => {
  it('preserves warnings on failure path when pipeline creation fails', async () => {
    const errors = ConsoleCapture.Errors();
    const builder = new PredictiveStudioPipelineBuilder();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: {
        EntityName: 'NonExistentEntity',
        TargetVariable: 'Status',
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
      },
      CandidateSources: [{ Kind: 'Entity', Ref: 'NonExistentEntity', Why: 'test' }],
      CandidateFeatures: [
        { Name: 'JobTitleNorm', SourceRef: 'NonExistentEntity', Kind: 'llm-derived', Why: 'unmapped' },
        { Name: 'Age', SourceRef: 'NonExistentEntity', Kind: 'numeric', Why: 'raw' },
      ],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'Exp1', AlgorithmName: 'random_forest', FeatureSet: [], Rationale: 'test', Priority: 1 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };

    const res = await builder.Build({
      spec,
      provider: emptyProvider(),
      user: failingUser,
    });

    expect(res.success).toBe(false);
    expect(res.errorMessage).toContain('NonExistentEntity');
    expect(res.warnings).toBeDefined();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings?.[0]).toEqual({
      FeatureName: 'JobTitleNorm',
      Kind: 'llm-derived',
      Reason: expect.stringMatching(/upstream Feature Pipeline/),
    });
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("PredictiveStudioPipelineBuilder.build failed: Target entity 'NonExistentEntity' was not found in metadata.")]);
  });

  it('records each warning once across the search candidates', async () => {
    const errors = ConsoleCapture.Errors();
    const builder = new PredictiveStudioPipelineBuilder();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: {
        EntityName: 'NonExistentEntity',
        TargetVariable: 'Status',
        ProblemType: 'classification',
        SuccessMetric: 'AUC',
      },
      CandidateSources: [{ Kind: 'Entity', Ref: 'NonExistentEntity', Why: 'test' }],
      CandidateFeatures: [
        { Name: 'JobTitleNorm', SourceRef: 'NonExistentEntity', Kind: 'llm-derived', Why: 'unmapped' },
        { Name: 'EmbeddingCol', SourceRef: 'NonExistentEntity', Kind: 'embedding', Why: 'unmapped' },
        { Name: 'Age', SourceRef: 'NonExistentEntity', Kind: 'numeric', Why: 'raw' },
      ],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'Exp1', AlgorithmName: 'random_forest', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test1', Priority: 1 },
        { Label: 'Exp2', AlgorithmName: 'logistic_regression', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test2', Priority: 2 },
        { Label: 'Exp3', AlgorithmName: 'xgboost', FeatureSet: ['JobTitleNorm', 'EmbeddingCol', 'Age'], Rationale: 'test3', Priority: 3 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };

    const res = await builder.Build({
      spec,
      provider: emptyProvider(),
      user: failingUser,
    });

    // The one pipeline of the search fails on NonExistentEntity before any row is written.
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/^Target entity 'NonExistentEntity' was not found/);
    expect(res.warnings).toBeDefined();
    // Although 3 candidates each had JobTitleNorm and EmbeddingCol, each warning is recorded once
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings?.map((w) => w.FeatureName)).toEqual(['JobTitleNorm', 'EmbeddingCol']);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("PredictiveStudioPipelineBuilder.build failed: Target entity 'NonExistentEntity' was not found in metadata.")]);
  });
});

describe('PredictiveStudioPipelineBuilder — a refused build keeps its reason', () => {
  it('reports the refusal of the one training run with its type and sentence', async () => {
    const errors = ConsoleCapture.Errors();
    const spec: ModelingPlanSpec = {
      Goal: 'Predict cancellations',
      TargetDefinition: { EntityName: 'Members', TargetVariable: 'Status', ProblemType: 'classification', SuccessMetric: 'AUC', AsOfStrategy: { Mode: 'column', Column: 'JoinDate' } },
      CandidateSources: [],
      CandidateFeatures: [],
      LeakageNotes: [],
      ProposedExperiments: [
        { Label: 'A', AlgorithmName: 'random_forest', FeatureSet: [], Rationale: 'a', Priority: 1 },
        { Label: 'B', AlgorithmName: 'xgboost', FeatureSet: [], Rationale: 'b', Priority: 2 },
      ],
      ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
      ProposedBudget: {},
    };
    const res = await new PredictiveStudioPipelineBuilder().Build({ spec, provider: emptyProvider(), user: failingUser });
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/^Training refused: the modeling plan's TargetDefinition\.AsOfStrategy \(Mode='column'\)/);
    const logged = ConsoleCapture.Lines(errors);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^PredictiveStudioPipelineBuilder\.build failed: Training refused: the modeling plan's TargetDefinition\.AsOfStrategy/);
  });
});

// ------------------------------------------------------------------------- the publish step (Task M4b.3) --

/** What the next training of {@link BuilderTrainer} produces. */
interface NextRunSpec {
  /** The stored decision: the finalist ships (`model`), the simple baseline is kept (`keep`), or nothing ships. */
  readonly outcome: WorldTrainingOutcome;
  /** The run's stored leakage audit (`ValidationResults.trainer.leakageFlags`). */
  readonly leakageFlags?: readonly LeakageFlag[];
  /** The stored gate decision's reason text, replacing the one the gate record was built with. */
  readonly reason?: string;
  /** A calibration hold written into the model's lineage (the slope the trainer measured; null = not measured). */
  readonly calibrationSlope?: number | null;
}

/**
 * The file's fake trainer: `TrainingDelegation.TrainModelViaEngine` over the {@link GateWorld}. Each training saves a
 * run row of the world's pipeline, completes it with the queued outcome ({@link NextRun}; default `model`) — the
 * stored results, gate record and, for a run that ships, its Draft model — and returns the run and model rows.
 */
class BuilderTrainer {
  private readonly queued: NextRunSpec[] = [];
  private lastRunId: string | null = null;

  constructor(private readonly world: GateWorld) {}

  /** Queues the next training's outcome. */
  public NextRun(spec: NextRunSpec): void {
    this.queued.push(spec);
  }

  /** The last training's run ID. */
  public LastRunID(): string {
    if (this.lastRunId === null) throw new Error('BuilderTrainer: nothing was trained');
    return this.lastRunId;
  }

  /** Routes the builder's training to this trainer. */
  public Install(): void {
    vi.spyOn(TrainingDelegation, 'TrainModelViaEngine').mockImplementation(async (_input, provider, user) => this.train(provider, user));
  }

  private async train(provider: IMetadataProvider, user: UserInfo): Promise<TrainModelResult> {
    const spec = this.queued.shift() || { outcome: 'model' };
    const run = await provider.GetEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', user);
    run.NewRecord();
    run.PipelineID = GateWorld.PipelineID;
    run.Status = 'Running';
    if (!(await run.Save())) throw new Error(`BuilderTrainer: saving the run failed: ${run.LatestResult?.CompleteMessage || 'unknown error'}`);
    const trained = this.world.TrainRun(run.ID, spec.outcome);
    this.lastRunId = run.ID;
    if (spec.leakageFlags !== undefined && trained.ModelID !== null) this.world.FlagLeakage(trained.ModelID, spec.leakageFlags);
    if (spec.reason !== undefined) this.rewriteReason(run.ID, spec.reason);
    if (spec.calibrationSlope !== undefined && trained.ModelID !== null) this.holdCalibration(trained.ModelID, spec.calibrationSlope);
    if (!(await run.Load(run.ID))) throw new Error(`BuilderTrainer: run ${run.ID} cannot be read back`);
    return { run, model: trained.ModelID === null ? null : await this.loadModel(trained.ModelID, provider, user) };
  }

  private rewriteReason(runId: string, reason: string): void {
    const row = this.world.Store.Row('MJ: ML Training Runs', runId);
    const parsed = TrainingRunResultsParser.ParseTrainingRunResults(row === undefined ? null : String(row['ValidationResults']));
    if (row === undefined || !parsed.Ok || parsed.Value.status !== 'completed' || parsed.Value.gate === null) throw new Error(`BuilderTrainer: run ${runId} stores no gate record`);
    const gate = parsed.Value.gate;
    row['ValidationResults'] = JSON.stringify({ ...parsed.Value, gate: { ...gate, reason: { ...gate.reason, text: reason } } });
  }

  private holdCalibration(modelId: string, slope: number | null): void {
    const row = this.world.Store.Row('MJ: ML Models', modelId);
    if (row === undefined) throw new Error(`BuilderTrainer: no model ${modelId}`);
    row['Lineage'] = JSON.stringify({ shippedMember: 'xgb', calibrationHold: { slope } });
  }

  private async loadModel(modelId: string, provider: IMetadataProvider, user: UserInfo): Promise<MJMLModelEntity> {
    const model = await provider.GetEntityObject<MJMLModelEntity>('MJ: ML Models', user);
    if (!(await model.Load(modelId))) throw new Error(`BuilderTrainer: model ${modelId} cannot be read back`);
    return model;
  }
}

/** A publisher whose first publish applies but whose answer is lost, so the retry reads the applied publish back. */
class RetriedPublisher extends AutomatedPublisher {
  protected override async PublishEvaluated(modelId: string, initiator: Actor, ctx: GateContext): Promise<PublishOutcome> {
    await super.PublishEvaluated(modelId, initiator, ctx);
    return super.PublishEvaluated(modelId, initiator, ctx);
  }
}

/**
 * The builder over the world: the world's pipeline (bound to a protocol, so nothing is bound before training), the
 * world's gate and an automated publisher over it ({@link AutomatedPublisher} unless a test supplies another).
 */
class WorldBuilder extends PredictiveStudioPipelineBuilder {
  constructor(private readonly gate: LifecycleGate, private readonly publisherOf: (gate: LifecycleGate) => AutomatedPublisher = (g) => new AutomatedPublisher(g)) {
    super();
  }
  protected override async createBoundPipeline(
    _spec: ModelingPlanSpec, _config: PipelineConfig, provider: IMetadataProvider, user: UserInfo,
  ): Promise<{ readonly Pipeline: MJMLTrainingPipelineEntity; readonly Candidates: readonly CandidateSpec[] }> {
    const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
    if (!(await pipeline.Load(GateWorld.PipelineID))) throw new Error('WorldBuilder: the world has no pipeline');
    return { Pipeline: pipeline, Candidates: [] };
  }
  protected override CreateLifecycleGate(): LifecycleGate {
    return this.gate;
  }
  protected override CreateAutomatedPublisher(gate: LifecycleGate): AutomatedPublisher {
    return this.publisherOf(gate);
  }
}

const account = new MemoryStorageAccount('pipeline-builder', []);
RegisterMemoryStorage('PS Pipeline Builder Test Storage', account);
const providerRow = ProviderRow(GateWorld.StorageProviderID, 'Pipeline Builder Test Storage', 'PS Pipeline Builder Test Storage', true);

const spec: ModelingPlanSpec = {
  Goal: 'Predict renewal',
  TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
  CandidateSources: [{ Kind: 'Entity', Ref: 'Members', Why: 'the members' }],
  CandidateFeatures: [{ Name: 'Age', SourceRef: 'Members', Kind: 'numeric', Why: 'raw' }],
  LeakageNotes: [],
  ProposedExperiments: [{ Label: 'A', AlgorithmName: 'xgboost', FeatureSet: [], Rationale: 'r', Priority: 1 }],
  ValidationStrategy: { Strategy: 'holdout', LockedHoldoutFraction: 0.2 },
  ProposedBudget: {},
};

let store: GateTestStore;
let world: GateWorld;
let trainer: BuilderTrainer;
let gate: LifecycleGate;
let builder: WorldBuilder;
let provider: IMetadataProvider;
let user: UserInfo;

beforeEach(async () => {
  account.Reset();
  ServeStorageProviders([providerRow]);
  store = new GateTestStore();
  world = new GateWorld(store, account);
  const pipelineRow = store.Row('MJ: ML Training Pipelines', GateWorld.PipelineID);
  if (pipelineRow === undefined) throw new Error('the world has no pipeline row');
  pipelineRow['EvaluationProtocolID'] = '6A1D2E3F-0000-4000-8000-0000000000B1';
  trainer = new BuilderTrainer(world);
  trainer.Install();
  gate = new LifecycleGate(new StorageProviderArtifactLoader(), new FakeClock(), new RecordingScoringActions());
  builder = new WorldBuilder(gate);
  provider = store.Provider();
  user = GateWorld.User;
  const recordsType = await provider.GetEntityObject<MJResourceTypeEntity>('MJ: Resource Types', user);
  recordsType.ID = '6A1D2E3F-0000-4000-8000-00000000C004';
  vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation((name: string) => (name === 'Records' ? recordsType : undefined));
  vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(GateWorld.SystemUser);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PredictiveStudioPipelineBuilder publishes through the automated publisher (the plan\'s cases)', () => {
  it('a flagged winner is refused by the gate and heldReason names the flags', async () => {
    trainer.NextRun({ outcome: 'model', leakageFlags: [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }] });
    const r = await builder.Build({ spec, provider, user, autoPublish: true });
    expect(r).toMatchObject({ published: false });
    expect(r.heldReason).toContain('single-feature-auc');
    expect(store.PublishRecords(r.modelId ?? '')).toEqual([expect.objectContaining({ Kind: 'refusal' })]);
  });
  it('a no-signal run reports the stored reason, has no model and leaves one run-level refusal', async () => {
    trainer.NextRun({ outcome: 'no-signal', reason: 'does not beat the flat guess' });
    const r = await builder.Build({ spec, provider, user, autoPublish: true });
    expect(r).toMatchObject({ published: false, modelId: null });
    expect(store.PublishRecordsOfRun(trainer.LastRunID())).toEqual([expect.objectContaining({ Kind: 'refusal', Purpose: 'evaluate' })]);
    expect(r.heldReason).toContain('does not beat the flat guess');
  });
  it('autoPublish false leaves the model Validated with KeptInDraftReason', async () => {
    trainer.NextRun({ outcome: 'model' });
    const r = await builder.Build({ spec, provider, user, autoPublish: false });
    expect([store.Status(r.modelId ?? ''), r.heldReason]).toEqual(['Validated', PredictiveStudioPipelineBuilder.KeptInDraftReason]);
  });
});

describe('PredictiveStudioPipelineBuilder publishes through the automated publisher (M4b.3 additions)', () => {
  it("publishes a winner the gate clears, as the agent run: one publish record naming the run, the model read back Published, the run's user notified", async () => {
    const agentRun = world.AgentRun(user.ID);
    trainer.NextRun({ outcome: 'model' });
    const r = await builder.Build({ spec, provider, user, initiator: { kind: 'agent', agentRunId: agentRun.ID } });
    expect([r.success, r.published, r.heldReason, r.readyToPublish, r.model?.Status, store.Status(r.modelId || '')]).toEqual([true, true, null, false, 'Published', 'Published']);
    const records = store.PublishRecords(r.modelId || '');
    expect(records.map((rec) => [rec['Kind'], rec['Purpose'], GateTestStore.JsonObjectColumn(rec, 'Initiator')])).toEqual([['publish', 'publish', { kind: 'agent', agentRunId: agentRun.ID }]]);
    expect(store.Notifications(user.ID).map((n) => n['Title'])).toEqual([expect.stringMatching(/^Published automatically: /)]);
  });

  it('autoPublish on without an agent run records the user as the initiator and notifies nobody', async () => {
    trainer.NextRun({ outcome: 'model' });
    const r = await builder.Build({ spec, provider, user });
    expect(r.published).toBe(true);
    expect(store.PublishRecords(r.modelId || '').map((rec) => GateTestStore.JsonObjectColumn(rec, 'Initiator'))).toEqual([{ kind: 'human', userId: user.ID }]);
    expect(store.Notifications(user.ID)).toEqual([]);
  });

  it('a retried build whose publish already applied (already-published) reports published', async () => {
    const retried = new WorldBuilder(gate, (g) => new RetriedPublisher(g));
    trainer.NextRun({ outcome: 'model' });
    const r = await retried.Build({ spec, provider, user });
    expect([r.published, r.heldReason, r.readyToPublish, store.Status(r.modelId || '')]).toEqual([true, null, false, 'Published']);
    expect(store.PublishRecords(r.modelId || '').map((rec) => rec['Kind'])).toEqual(['publish']);
  });

  it('a kept baseline the protocol does not publish automatically is withheld with the recorded refusal', async () => {
    const agentRun = world.AgentRun(user.ID);
    trainer.NextRun({ outcome: 'keep' });
    const r = await builder.Build({ spec, provider, user, initiator: { kind: 'agent', agentRunId: agentRun.ID } });
    const words = GateRefusals.Describe({ kind: 'keep-baseline-not-auto-published' });
    expect([r.published, r.readyToPublish, r.heldReason]).toEqual([false, false, `withheld: ${words}`]);
    expect([store.Status(r.modelId || ''), r.model?.StatusReason]).toEqual(['KeepBaseline', `Automatic publish withheld: ${words}`]);
    expect(store.PublishRecords(r.modelId || '').map((rec) => [rec['Kind'], GateTestStore.JsonObjectColumn(rec, 'Initiator')])).toEqual([['refusal', { kind: 'agent', agentRunId: agentRun.ID }]]);
    expect(store.Notifications(user.ID)).toHaveLength(1);
  });

  it("a no-signal run built by the agent leaves the run-level refusal naming the agent run and notifies the run's user", async () => {
    const agentRun = world.AgentRun(user.ID);
    trainer.NextRun({ outcome: 'no-signal' });
    const r = await builder.Build({ spec, provider, user, initiator: { kind: 'agent', agentRunId: agentRun.ID } });
    expect([r.success, r.published, r.modelId, r.model, r.trust]).toEqual([true, false, null, undefined, undefined]);
    expect(r.heldReason).toBe(`withheld: the training run has no model to publish. ${GateRefusals.Describe({ kind: 'gate-no-signal', reason: r.Gate?.Reason || '' })}`);
    expect(store.PublishRecordsOfRun(trainer.LastRunID()).map((rec) => [rec['Kind'], rec['Purpose'], rec['ModelID'], GateTestStore.JsonObjectColumn(rec, 'Initiator')])).toEqual([
      ['refusal', 'evaluate', null, { kind: 'agent', agentRunId: agentRun.ID }],
    ]);
    expect(store.Notifications(user.ID)).toHaveLength(1);
  });

  it('a calibration-held winner is refused at Evaluate (the gate, not the builder, holds it) and stays Draft', async () => {
    const agentRun = world.AgentRun(user.ID);
    trainer.NextRun({ outcome: 'model', calibrationSlope: 0.5 });
    const r = await builder.Build({ spec, provider, user, initiator: { kind: 'agent', agentRunId: agentRun.ID } });
    expect([r.published, r.readyToPublish, r.heldReason, store.Status(r.modelId || '')]).toEqual([
      false, false, `withheld: ${GateRefusals.Describe({ kind: 'calibration-held', slope: 0.5 })}`, 'Draft',
    ]);
    // The publish attempt's Evaluate refusal is recorded as the attempt's refusal (D4-143); the agent run's user is told.
    expect(store.PublishRecords(r.modelId || '').map((x) => [x['Kind'], x['Purpose'], x['Transient'], GateTestStore.JsonObjectColumn(x, 'Refusal')['kind'], GateTestStore.JsonObjectColumn(x, 'Initiator')])).toEqual([
      ['refusal', 'publish', false, 'calibration-held', { kind: 'agent', agentRunId: agentRun.ID }],
    ]);
    expect(store.Notifications(user.ID)).toHaveLength(1);
  });

  it('autoPublish false: a calibration hold is the gate\'s refusal of the evaluation, the model stays Draft and nothing is recorded or sent', async () => {
    trainer.NextRun({ outcome: 'model', calibrationSlope: null });
    const r = await builder.Build({ spec, provider, user, autoPublish: false });
    expect([r.published, r.readyToPublish, store.Status(r.modelId || '')]).toEqual([false, false, 'Draft']);
    expect(r.heldReason).toBe(`Not evaluated — the lifecycle gate refused: ${GateRefusals.Describe({ kind: 'calibration-held', slope: null })}`);
    expect([store.PublishRecords(r.modelId || ''), store.Notifications(user.ID)]).toEqual([[], []]);
  });

  it('autoPublish false: a kept baseline is evaluated to KeepBaseline, ready to publish, with the stored reason', async () => {
    trainer.NextRun({ outcome: 'keep' });
    const r = await builder.Build({ spec, provider, user, autoPublish: false });
    expect([r.published, r.readyToPublish, store.Status(r.modelId || '')]).toEqual([false, true, 'KeepBaseline']);
    expect(r.heldReason).toBe(PredictiveStudioPipelineBuilder.EvaluatedReason('KeepBaseline', r.Gate?.Reason || null));
    expect(store.PublishRecords(r.modelId || '')).toEqual([]);
  });

  it('autoPublish false with a leakage-flagged winner evaluates it; the flags are the publish\'s to refuse', async () => {
    trainer.NextRun({ outcome: 'model', leakageFlags: [{ kind: 'single-feature-auc', sourceColumn: 'cancelled_flag', heldOutAuc: 0.97 }] });
    const r = await builder.Build({ spec, provider, user, autoPublish: false });
    expect([r.published, r.readyToPublish, r.heldReason, store.Status(r.modelId || '')]).toEqual([false, true, PredictiveStudioPipelineBuilder.KeptInDraftReason, 'Validated']);
  });
});
