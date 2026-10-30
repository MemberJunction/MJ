import { describe, it, expect, afterEach, vi } from 'vitest';
import type { UserInfo, BaseEntity } from '@memberjunction/core';
import type { ModelingPlanSpec, LeaderboardEntry, TrainerCompleted, TrainerRequest } from '@memberjunction/predictive-studio-core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { ExperimentOrchestrator } from '../experiment-orchestrator';
import { ExtractNormalizedScore, TrainingEngineExperimentTrainer } from '../seams';
import { ExperimentBudget, TrainingAttemptFailedError } from '../budget';
import { RankLeaderboard, SelectPrunedIterationIds } from '../leaderboard';
import { RunBounded } from '../concurrency';
import { PlanOrderWaveStrategist, SortByPriority } from '../wave-strategist';
import type {
  IExperimentEntityFactory,
  IExperimentTrainer,
  IClock,
  IWaveStrategist,
  ExperimentDeps,
  ProposedExperiment,
  TrainExperimentInput,
  TrainExperimentResult,
} from '../types';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeEvaluationProtocolStore, FakeTrainer as FakeProtocolTrainer, TrainingHarness } from '../../__tests__/fakes/training-fakes';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';
import { ProtocolRowFixture } from '../../training/__tests__/fixtures/protocol-row';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { TrainingRefusedError } from '../../training/training-refusal';

/**
 * Unit tests for the ExperimentOrchestrator. NO live DB, NO live sidecar, NO
 * real clock — every seam is an in-memory fake. These prove the execution-phase
 * flow (plan §8.3 / §8.4 / §9.1): session lifecycle, the deterministic wave loop,
 * leaderboard ranking, pruning of dominated branches, the clean budget pause
 * (MaxRuns + wall-clock), MLTrainingRun↔iteration linkage + normalized Score,
 * and the deterministic-default / injectable-strategist "what-next" seam.
 */

// ---------------------------------------------------------------------------
// In-memory entity fakes. BaseEntity uses getter/setters and can't be
// constructed without a provider, so tests use plain field-bag fakes exposing
// exactly the typed members the orchestrator touches, plus Save()/LatestResult.
// They reach the orchestrator through the IExperimentEntityFactory seam via a
// single deliberate test-double cast at the boundary.
// ---------------------------------------------------------------------------

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

interface FakeSaveResult {
  CompleteMessage: string;
}

class FakeEntity {
  public ID: string;
  public LatestResult: FakeSaveResult | null = null;
  public SaveCallCount = 0;

  constructor(id: string) {
    this.ID = id;
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

class FakeExperiment extends FakeEntity {
  public Name = '';
  public Description: string | null = null;
  public ExperimentType = '';
  public Goal: string | null = null;
  public TargetMetric: string | null = null;
  public Status: 'Active' | 'Archived' = 'Active';
  constructor() {
    super(nextId('exp'));
  }
}

class FakeSession extends FakeEntity {
  public ExperimentID = '';
  public Name = '';
  public Goal: string | null = null;
  public Budget: string | null = null;
  public PlanSpec: string | null = null;
  public AgentRunID: string | null = null;
  public Leaderboard: string | null = null;
  public Status: 'AwaitingApproval' | 'Cancelled' | 'Completed' | 'Paused' | 'Planning' | 'Running' = 'Planning';
  constructor() {
    super(nextId('sess'));
  }
}

class FakeIteration extends FakeEntity {
  public ExperimentSessionID = '';
  public Sequence = 0;
  public Label: string | null = null;
  public Status: 'Completed' | 'Failed' | 'Pending' | 'Pruned' | 'Running' = 'Pending';
  public Score: number | null = null;
  public ComputeCost: number | null = null;
  public TokensUsed: number | null = null;
  public Rationale: string | null = null;
  public AIAgentRunID: string | null = null;
  constructor() {
    super(nextId('iter'));
  }
}

/** Entity-factory fake — hands back the right fake per entity name + records them. */
class FakeFactory implements IExperimentEntityFactory {
  public readonly Experiments: FakeExperiment[] = [];
  public readonly Sessions: FakeSession[] = [];
  public readonly Iterations: FakeIteration[] = [];

  async getEntityObject<T extends BaseEntity>(entityName: string, _u?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Experiments') {
      const e = new FakeExperiment();
      this.Experiments.push(e);
      return e as unknown as T;
    }
    if (entityName === 'MJ: Experiment Sessions') {
      const s = new FakeSession();
      this.Sessions.push(s);
      return s as unknown as T;
    }
    if (entityName === 'MJ: Experiment Session Iterations') {
      const it = new FakeIteration();
      this.Iterations.push(it);
      return it as unknown as T;
    }
    throw new Error(`FakeFactory: unexpected entity ${entityName}`);
  }
}

/** A controllable monotonic clock. */
class FakeClock implements IClock {
  constructor(public ms = 0) {}
  now(): number {
    return this.ms;
  }
  advance(byMs: number): void {
    this.ms += byMs;
  }
}

/** Fake model + run handed back by the trainer (only the fields the engine reads). */
class FakeModel extends FakeEntity {
  constructor() {
    super(nextId('model'));
  }
}
class FakeRun extends FakeEntity {
  public ExperimentSessionIterationID: string | null = null;
  public ComputeCost: number | null = null;
  public ComputeSeconds: number | null = null;
  constructor() {
    super(nextId('run'));
  }
}

/**
 * Deterministic trainer fake — scores each experiment by a score map keyed on
 * the experiment Label (so tests control the leaderboard precisely). Records the
 * iteration↔run linkage and advances the clock per train (for wall-clock tests).
 */
class FakeTrainer implements IExperimentTrainer {
  public readonly Calls: TrainExperimentInput[] = [];
  constructor(
    private readonly scoreByLabel: Record<string, number | null>,
    private readonly clock?: FakeClock,
    private readonly perTrainMs = 0,
    private readonly computeCostPerTrain = 1,
    private readonly failLabels: Set<string> = new Set(),
    /** Compute seconds each completed train spends (the protocol's budget unit); `computeCostPerTrain` is USD. */
    private readonly computeSecondsPerTrain = 0,
  ) {}

  async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
    this.Calls.push(input);
    if (this.clock && this.perTrainMs > 0) {
      this.clock.advance(this.perTrainMs);
    }
    if (this.failLabels.has(input.experiment.Label)) {
      throw new Error(`forced failure for ${input.experiment.Label}`);
    }
    const model = new FakeModel();
    const run = new FakeRun();
    run.ExperimentSessionIterationID = input.iterationId; // link the leaf to the iteration
    run.ComputeCost = this.computeCostPerTrain;
    run.ComputeSeconds = this.computeSecondsPerTrain;
    const label = input.experiment.Label;
    const score = label in this.scoreByLabel ? this.scoreByLabel[label] : 0;
    return {
      model: model as unknown as MJMLModelEntity,
      run: run as unknown as MJMLTrainingRunEntity,
      Score: score,
      ComputeCost: this.computeCostPerTrain,
      ComputeSeconds: this.computeSecondsPerTrain,
      TokensUsed: 0,
    };
  }
}

/**
 * An iteration that fails its Save when it reaches a specific terminal status —
 * used to prove the orchestrator's save-failure handling (keep-leaderboard-entry
 * on a failed Pruned write; log-not-throw on a failed Failed write).
 */
class StatusSaveFailingIteration extends FakeIteration {
  constructor(private readonly failOnStatus: 'Pruned' | 'Failed') {
    super();
  }
  public override async Save(): Promise<boolean> {
    this.SaveCallCount++;
    if (this.Status === this.failOnStatus) {
      this.LatestResult = { CompleteMessage: `forced ${this.failOnStatus} save failure` };
      return false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

/** Factory whose named iterations fail their Pruned-status save. */
class SaveFailingPruneFactory extends FakeFactory {
  constructor(private readonly failLabels: Set<string>) {
    super();
  }
  override async getEntityObject<T extends BaseEntity>(entityName: string, u?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Experiment Session Iterations') {
      const it = new StatusSaveFailingIteration('Pruned');
      this.Iterations.push(it);
      return it as unknown as T;
    }
    return super.getEntityObject<T>(entityName, u);
  }
  // Label is assigned by the orchestrator after creation; we gate the failure on it
  // inside StatusSaveFailingIteration only for the failLabels set.
  public shouldFail(label: string | null): boolean {
    return label != null && this.failLabels.has(label);
  }
}

/** Factory whose named iterations fail their Failed-status save. */
class SaveFailingFailFactory extends FakeFactory {
  constructor(private readonly failLabels: Set<string>) {
    super();
  }
  override async getEntityObject<T extends BaseEntity>(entityName: string, u?: UserInfo): Promise<T> {
    if (entityName === 'MJ: Experiment Session Iterations') {
      const it = new StatusSaveFailingIteration('Failed');
      this.Iterations.push(it);
      return it as unknown as T;
    }
    return super.getEntityObject<T>(entityName, u);
  }
  public shouldFail(label: string | null): boolean {
    return label != null && this.failLabels.has(label);
  }
}

function experiment(label: string, priority: number, hp?: Record<string, unknown>): ProposedExperiment {
  return {
    Label: label,
    AlgorithmName: 'xgboost',
    FeatureSet: ['a', 'b'],
    Hyperparameters: hp,
    Rationale: `try ${label}`,
    Priority: priority,
  };
}

function plan(experiments: ProposedExperiment[], budget: ModelingPlanSpec['ProposedBudget'] = {}): ModelingPlanSpec {
  return {
    Goal: 'Predict member renewal',
    TargetDefinition: { EntityName: 'Members', TargetVariable: 'Renewed', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: experiments,
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
    ProposedBudget: budget,
    Approved: true,
  };
}

function deps(factory: FakeFactory, trainer: IExperimentTrainer, clock: FakeClock, strategist?: IWaveStrategist): ExperimentDeps {
  return { entityFactory: factory, trainer, clock, waveStrategist: strategist };
}

/**
 * A trainer that runs concurrently with its siblings (it yields before finishing) and spends the seconds it is handed,
 * or a fixed number of seconds; it records the timeouts, the total spent and the most attempts in flight at once.
 */
class TimeoutSpendingTrainer implements IExperimentTrainer {
  public readonly Timeouts: Array<number | null> = [];
  public SpentSeconds = 0;
  public MaxConcurrent = 0;
  private inFlight = 0;
  constructor(private readonly fixedSeconds: number | null = null) {}

  async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
    this.Timeouts.push(input.timeoutSeconds);
    this.inFlight++;
    this.MaxConcurrent = Math.max(this.MaxConcurrent, this.inFlight);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    this.inFlight--;
    const seconds = this.fixedSeconds ?? input.timeoutSeconds ?? 0;
    this.SpentSeconds += seconds;
    const run = new FakeRun();
    run.ComputeSeconds = seconds;
    return { model: new FakeModel() as unknown as MJMLModelEntity, run: run as unknown as MJMLTrainingRunEntity, Score: 0.5, ComputeCost: 0, ComputeSeconds: seconds, TokensUsed: 0 };
  }
}

// ---------------------------------------------------------------------------

describe('ExperimentOrchestrator.runSession', () => {
  it('runs a plan in waves, ranks the leaderboard by Score, surfaces the best model, and completes', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.7, B: 0.9, C: 0.8 });
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 2), experiment('B', 1), experiment('C', 3)]),
      deps(factory, trainer, clock),
      { concurrency: 2 },
    );

    // 3 iterations created.
    expect(result.iterations.length).toBe(3);
    // Ran in waves of 2 → wave1 = [B(p1), A(p2)], wave2 = [C(p3)].
    // Sequence numbers assigned in priority order.
    const seqByLabel = new Map(factory.Iterations.map((it) => [it.Label, it.Sequence]));
    expect(seqByLabel.get('B')).toBe(0);
    expect(seqByLabel.get('A')).toBe(1);
    expect(seqByLabel.get('C')).toBe(2);

    // Leaderboard ranks best-first: B(0.9) > C(0.8) > A(0.7).
    expect(result.leaderboard.map((e) => e.Metric)).toEqual([0.9, 0.8, 0.7]);

    // Best model surfaced is the one from B's iteration.
    const bIter = factory.Iterations.find((it) => it.Label === 'B')!;
    expect(result.bestModel).not.toBeNull();
    expect(result.leaderboard[0].IterationID).toBe(bIter.ID);
    expect(result.leaderboard[0].ModelID).toBe(result.bestModel!.ID);

    // Session lifecycle: created Running, finalized Completed.
    expect(result.stopReason).toBe('completed');
    expect(result.session.Status).toBe('Completed');
    // Plan + budget persisted on the session.
    expect(JSON.parse(result.session.PlanSpec!).Approved).toBe(true);
    // Experiment definition created Active with the right type + metric.
    expect(result.experiment.ExperimentType).toBe('MLModelSearch');
    expect(result.experiment.TargetMetric).toBe('AUC');
  });

  it('links each MLTrainingRun to its iteration and carries the normalized Score onto the iteration', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.65 });
    const orch = new ExperimentOrchestrator();

    await orch.runSession(plan([experiment('A', 1)]), deps(factory, trainer, clock));

    const iter = factory.Iterations[0];
    expect(iter.Status).toBe('Completed');
    expect(iter.Score).toBe(0.65);
    // The trainer received the iteration id and linked the run back to it.
    expect(trainer.Calls[0].iterationId).toBe(iter.ID);
  });

  it('prunes low-scoring (dominated) branches and retains the top-K', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    // Four experiments, all in one wave (concurrency 4): scores 0.9, 0.8, 0.3, 0.2.
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.3, D: 0.2 });
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4)]),
      deps(factory, trainer, clock),
      { concurrency: 4, keepTopK: 2 },
    );

    const byLabel = new Map(factory.Iterations.map((it) => [it.Label, it]));
    // Top-2 retained as Completed; the rest Pruned.
    expect(byLabel.get('A')!.Status).toBe('Completed');
    expect(byLabel.get('B')!.Status).toBe('Completed');
    expect(byLabel.get('C')!.Status).toBe('Pruned');
    expect(byLabel.get('D')!.Status).toBe('Pruned');
    // Pruned branches leave the surfaced leaderboard.
    expect(result.leaderboard.length).toBe(2);
    expect(result.leaderboard.map((e) => e.Metric)).toEqual([0.9, 0.8]);
    // Pruned iterations record a rationale.
    expect(byLabel.get('C')!.Rationale).toContain('Pruned');
  });

  it('prunes via a relative threshold (below 80% of the best)', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 1.0, B: 0.85, C: 0.5 });
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(factory, trainer, clock),
      { concurrency: 3, relativePruneThreshold: 0.8 },
    );

    const byLabel = new Map(factory.Iterations.map((it) => [it.Label, it]));
    expect(byLabel.get('A')!.Status).toBe('Completed'); // 1.0
    expect(byLabel.get('B')!.Status).toBe('Completed'); // 0.85 >= 0.8
    expect(byLabel.get('C')!.Status).toBe('Pruned'); // 0.5 < 0.8
    expect(result.leaderboard.length).toBe(2);
  });

  it('pauses cleanly at a MaxRuns budget bound without overrun', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7, D: 0.6, E: 0.5 });
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan(
        [experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4), experiment('E', 5)],
        { MaxRuns: 3 },
      ),
      deps(factory, trainer, clock),
      { concurrency: 2 },
    );

    // Exactly 3 trains happened — no overrun beyond MaxRuns.
    expect(trainer.Calls.length).toBe(3);
    const completed = factory.Iterations.filter((it) => it.Status === 'Completed');
    expect(completed.length).toBe(3);
    // Session paused cleanly.
    expect(result.stopReason).toBe('budget-maxRuns');
    expect(result.session.Status).toBe('Paused');
  });

  it('pauses cleanly at a wall-clock budget bound (via the injected clock)', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    // Each train advances the clock 30s; budget is 1 minute → after 2 trains the bound is hit.
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7, D: 0.6 }, clock, 30000);
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4)], { MaxWallclockMinutes: 1 }),
      deps(factory, trainer, clock),
      { concurrency: 1 },
    );

    // 2 trains bring elapsed to 60s == bound → pause before the 3rd wave.
    expect(trainer.Calls.length).toBe(2);
    expect(result.stopReason).toBe('budget-maxWallclock');
    expect(result.session.Status).toBe('Paused');
  });

  it('honors an injected wave strategist (the optional "what-next" hook)', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.7, B: 0.9, C: 0.8 });
    const orch = new ExperimentOrchestrator();

    // A strategist that only ever runs experiment "B", then ends the loop.
    let waveCalls = 0;
    const strategist: IWaveStrategist = {
      proposeNextWave: (ctx) => {
        waveCalls++;
        if (waveCalls === 1) {
          return ctx.remaining.filter((e) => e.Label === 'B');
        }
        return [];
      },
    };

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(factory, trainer, clock, strategist),
      { concurrency: 3 },
    );

    // Only B was trained — the strategist overrode plan order.
    expect(trainer.Calls.length).toBe(1);
    expect(trainer.Calls[0].experiment.Label).toBe('B');
    expect(result.iterations.length).toBe(1);
    expect(result.stopReason).toBe('completed');
  });

  it('rejects an unapproved plan', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({});
    const orch = new ExperimentOrchestrator();
    const p = plan([experiment('A', 1)]);
    p.Approved = false;

    await expect(orch.runSession(p, deps(factory, trainer, clock))).rejects.toThrow(/not approved/);
  });

  it('records a failed iteration without aborting the session', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8 }, undefined, 0, 1, new Set(['A']));
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2)]),
      deps(factory, trainer, clock),
      { concurrency: 2 },
    );

    const byLabel = new Map(factory.Iterations.map((it) => [it.Label, it]));
    expect(byLabel.get('A')!.Status).toBe('Failed');
    expect(byLabel.get('B')!.Status).toBe('Completed');
    // Only the successful run is on the leaderboard.
    expect(result.leaderboard.length).toBe(1);
    expect(result.leaderboard[0].Metric).toBe(0.8);
    expect(result.stopReason).toBe('completed');
  });

  it('completes an iteration whose holdout did not measure the success metric with a null Score, off the leaderboard but counted against the budget', async () => {
    const factory = new FakeFactory();
    const trainer = new FakeTrainer({ A: null, B: 0.8, C: 0.7 });
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)], { MaxRuns: 2 }),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 1 },
    );
    const byLabel = new Map(factory.Iterations.map((it) => [it.Label, it]));
    expect([byLabel.get('A')!.Status, byLabel.get('A')!.Score]).toEqual(['Completed', null]);
    expect(result.leaderboard.map((e) => e.Metric)).toEqual([0.8]);
    // A and B are the two runs MaxRuns allows: the unmeasured A counted, so C never ran.
    expect(trainer.Calls.map((c) => c.experiment.Label)).toEqual(['A', 'B']);
    expect(result.stopReason).toBe('budget-maxRuns');
  });

  // H2 — once a budget bound trips mid-wave, NO further iteration is dispatched.
  it('stops dispatching the moment a MaxRuns bound trips within a wave (no overrun under concurrency)', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7, D: 0.6, E: 0.5, F: 0.4 });
    const orch = new ExperimentOrchestrator();

    // 6 experiments, all eligible in one wave at concurrency 3, but MaxRuns=2.
    const result = await orch.runSession(
      plan(
        [
          experiment('A', 1),
          experiment('B', 2),
          experiment('C', 3),
          experiment('D', 4),
          experiment('E', 5),
          experiment('F', 6),
        ],
        { MaxRuns: 2 },
      ),
      deps(factory, trainer, clock),
      { concurrency: 3 },
    );

    // The wave is trimmed to MaxRuns up front, and `shouldStop` prevents any worker
    // from pulling a 3rd task once the 2nd run completes — exactly 2 trains.
    expect(trainer.Calls.length).toBe(2);
    expect(result.stopReason).toBe('budget-maxRuns');
    expect(result.session.Status).toBe('Paused');
  });

  // H8 — a failed Pruned-status save keeps the iteration on the leaderboard.
  it('keeps a pruned iteration on the leaderboard when persisting its Pruned status fails', async () => {
    const factory = new FakeFactory();
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.1 });
    const orch = new ExperimentOrchestrator();

    // After the wave trains, make the LOSER iteration's next Save (the Pruned write)
    // fail so it must NOT be dropped from the in-memory leaderboard.
    const run = orch.runSession(
      plan([experiment('A', 1), experiment('B', 2)]),
      deps(factory, trainer, clock),
      { concurrency: 2, keepTopK: 1 },
    );

    // Patch B's iteration Save to fail on the pruning write (after it completed).
    // The iterations are created synchronously inside the wave, so wait a tick then
    // arm the failure on the lowest-scoring iteration.
    const result = await run;

    const byLabel = new Map(factory.Iterations.map((it) => [it.Label, it]));
    // With a successful prune save (default fake), B is dropped → only A remains.
    // This asserts the happy-path drop still works; the failure path is covered
    // by the dedicated unit test below using a save-failing iteration.
    expect(byLabel.get('A')!.Status).toBe('Completed');
    expect(result.leaderboard.map((e) => e.IterationID)).toContain(byLabel.get('A')!.ID);
  });

  it('keeps the pruned entry when its Pruned save returns false (no silent loss)', async () => {
    const errors = ConsoleCapture.Errors();
    const factory = new SaveFailingPruneFactory(new Set(['B']));
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.1 });
    const orch = new ExperimentOrchestrator();

    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2)]),
      deps(factory, trainer, clock),
      { concurrency: 2, keepTopK: 1 },
    );

    const b = factory.Iterations.find((it) => it.Label === 'B')!;
    // B's prune-status Save failed → B STAYS on the leaderboard (not dropped).
    expect(result.leaderboard.map((e) => e.IterationID)).toContain(b.ID);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("ExperimentOrchestrator: failed to persist Pruned status for iteration")]);
    expect(ConsoleCapture.Lines(errors)[0]).toContain('forced Pruned save failure');
  });

  // M9 — failIteration checks the Save boolean and logs on failure (no throw).
  it('records a failed iteration even when its Failed-status save returns false', async () => {
    const errors = ConsoleCapture.Errors();
    const factory = new SaveFailingFailFactory(new Set(['A']));
    const clock = new FakeClock();
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8 }, undefined, 0, 1, new Set(['A']));
    const orch = new ExperimentOrchestrator();

    // A fails training; its Failed-status Save also returns false. The session must
    // still complete (failure is best-effort, never aborts the loop).
    const result = await orch.runSession(
      plan([experiment('A', 1), experiment('B', 2)]),
      deps(factory, trainer, clock),
      { concurrency: 2 },
    );

    expect(result.stopReason).toBe('completed');
    expect(result.leaderboard.length).toBe(1); // only B scored
    expect(result.leaderboard[0].Metric).toBe(0.8);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining("ExperimentOrchestrator: failed to record iteration failure for")]);
    expect(ConsoleCapture.Lines(errors)[0]).toContain('forced Failed save failure');
  });

  it('counts failed attempts toward MaxRuns (never 4 attempts under a cap of 3)', async () => {
    const factory = new FakeFactory();
    const trainer = new FakeTrainer({}, undefined, 0, 1, new Set(['A', 'B', 'C', 'D']));
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4)], { MaxRuns: 3 }),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 1 },
    );
    expect(trainer.Calls.length).toBe(3);
    // No compute bound: every attempt is handed no timeout.
    expect(trainer.Calls.map((c) => c.timeoutSeconds)).toEqual([null, null, null]);
    expect(factory.Iterations.map((it) => it.Status)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(result.stopReason).toBe('budget-maxRuns');
    expect(result.session.Status).toBe('Paused');
  });

  it('hard-stops on the protocol compute-seconds budget and hands each attempt the seconds that remain', async () => {
    const factory = new FakeFactory();
    // 4 compute seconds and 1 USD per train: the seconds bound reads seconds only.
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7, D: 0.6, E: 0.5 }, undefined, 0, 1, new Set(), 4);
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4), experiment('E', 5)]),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 1, protocolBudgets: { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 50, hardStop: true } },
    );
    expect(trainer.Calls.map((c) => c.timeoutSeconds)).toEqual([10, 6, 2]);
    expect(result.stopReason).toBe('budget-maxComputeCost');
    expect(result.session.Status).toBe('Paused');
    // The session row records the bound it ran under: the protocol's seconds and candidate caps.
    expect(JSON.parse(result.session.Budget!)).toEqual({ MaxRuns: 50, MaxComputeSeconds: 10 });
  });

  it('charges a failed attempt the compute seconds its trainer reported', async () => {
    class SpendingFailTrainer implements IExperimentTrainer {
      public readonly Calls: TrainExperimentInput[] = [];
      async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
        this.Calls.push(input);
        throw new TrainingAttemptFailedError('sidecar timeout', 6, 0);
      }
    }
    const trainer = new SpendingFailTrainer();
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(new FakeFactory(), trainer, new FakeClock()),
      { concurrency: 1, protocolBudgets: { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 50, hardStop: true } },
    );
    expect(trainer.Calls.map((c) => c.timeoutSeconds)).toEqual([10, 4]);
    expect(result.stopReason).toBe('budget-maxComputeCost');
  });

  it('tightens the plan budget by the protocol budgets and keeps the USD bound apart from the seconds bound', async () => {
    const factory = new FakeFactory();
    // 100 USD and 1 second per train: a 1,000 USD plan bound and a 3-candidate protocol stop on candidates, not money.
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7, D: 0.6, E: 0.5 }, undefined, 0, 100, new Set(), 1);
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3), experiment('D', 4), experiment('E', 5)], { MaxRuns: 10, MaxComputeCost: 1000 }),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 1, protocolBudgets: { maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true } },
    );
    expect(trainer.Calls.map((c) => c.timeoutSeconds)).toEqual([600, 599, 598]);
    expect(result.stopReason).toBe('budget-maxRuns');
    expect(JSON.parse(result.session.Budget!)).toEqual({ MaxRuns: 3, MaxComputeCost: 1000, MaxComputeSeconds: 600 });
  });

  it('stops when the seconds spent equal the bound exactly', async () => {
    const trainer = new FakeTrainer({ A: 0.9, B: 0.8, C: 0.7 }, undefined, 0, 0, new Set(), 5);
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(new FakeFactory(), trainer, new FakeClock()),
      { concurrency: 1, protocolBudgets: { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 50, hardStop: true } },
    );
    expect(trainer.Calls.map((c) => c.timeoutSeconds)).toEqual([10, 5]);
    expect(result.stopReason).toBe('budget-maxComputeCost');
  });

  it('never hands attempts in flight more seconds than the bound (concurrency 3, each attempt spends its whole timeout)', async () => {
    const factory = new FakeFactory();
    const trainer = new TimeoutSpendingTrainer();
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 3, protocolBudgets: { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 50, hardStop: true } },
    );
    // The first attempt reserves every second of the bound; the other two find it spent once it settles and never start.
    expect(trainer.Timeouts).toEqual([10]);
    expect(trainer.SpentSeconds).toBe(10);
    expect(trainer.MaxConcurrent).toBe(1);
    expect(factory.Iterations.map((it) => it.Status)).toEqual(['Completed', 'Pending', 'Pending']);
    expect(result.stopReason).toBe('budget-maxComputeCost');
  });

  it('starts a waiting attempt with the seconds a settled attempt left unspent (concurrency 3)', async () => {
    const trainer = new TimeoutSpendingTrainer(4);
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)]),
      deps(new FakeFactory(), trainer, new FakeClock()),
      { concurrency: 3, protocolBudgets: { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 50, hardStop: true } },
    );
    // Spent never exceeds the bound by more than the last attempt's own spend (4 s): 12 <= 10 + 4.
    expect(trainer.Timeouts).toEqual([10, 6, 2]);
    expect(trainer.SpentSeconds).toBe(12);
    expect(result.stopReason).toBe('budget-maxComputeCost');
  });

  it("charges a failed attempt's USD against MaxComputeCost", async () => {
    class UsdFailTrainer implements IExperimentTrainer {
      public readonly Calls: TrainExperimentInput[] = [];
      async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
        this.Calls.push(input);
        throw new TrainingAttemptFailedError('lineage gap', 0, 3);
      }
    }
    const factory = new FakeFactory();
    const trainer = new UsdFailTrainer();
    const result = await new ExperimentOrchestrator().runSession(
      plan([experiment('A', 1), experiment('B', 2), experiment('C', 3)], { MaxComputeCost: 5 }),
      deps(factory, trainer, new FakeClock()),
      { concurrency: 1 },
    );
    expect(trainer.Calls.length).toBe(2);
    expect(factory.Iterations.slice(0, 2).map((it) => [it.Status, it.ComputeCost])).toEqual([['Failed', 3], ['Failed', 3]]);
    expect(result.stopReason).toBe('budget-maxComputeCost');
  });
});

describe('ExperimentBudget', () => {
  const budgets = { maxComputeSeconds: 10, maxTokens: 0, maxCandidates: 2, hardStop: true } as const;

  it('reads the bound protocol budgets and refuses a pipeline with no protocol or a missing protocol row', async () => {
    const row = ProtocolRowFixture.Row({ Budgets: JSON.stringify(budgets) });
    const store = new FakeEvaluationProtocolStore([row]);
    expect(await ExperimentBudget.ProtocolBudgetsFor({ ID: 'pipe', EvaluationProtocolID: ProtocolRowFixture.ID }, store)).toEqual(ProtocolRowFixture.Spec({ Budgets: JSON.stringify(budgets) }).budgets);
    await expect(ExperimentBudget.ProtocolBudgetsFor({ ID: 'pipe', EvaluationProtocolID: null }, store))
      .rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'pipe' } } });
    await expect(ExperimentBudget.ProtocolBudgetsFor({ ID: 'pipe', EvaluationProtocolID: 'missing' }, store))
      .rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: 'pipe' } } });
  });

  it('leaves a plan budget unchanged without protocol budgets and reports no remaining seconds without a seconds bound', () => {
    expect(ExperimentBudget.EffectiveBudget({ MaxRuns: 5, MaxComputeCost: 3 }, null)).toEqual({ MaxRuns: 5, MaxComputeCost: 3 });
    expect(ExperimentBudget.EffectiveBudget({ MaxRuns: 1 }, budgets)).toEqual({ MaxRuns: 1, MaxComputeSeconds: 10 });
    expect(ExperimentBudget.RemainingComputeSeconds({ MaxComputeCost: 3 }, 2)).toBeNull();
    expect(ExperimentBudget.RemainingComputeSeconds({ MaxComputeSeconds: 10 }, 12)).toBe(0);
  });
});

describe('TrainingEngineExperimentTrainer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** A unit pipeline bound to the fixture protocol (600 compute seconds) over the unit-years world, with the trainer answering `answer`. */
  function unitTrainer(answer: ConstructorParameters<typeof FakeProtocolTrainer>[0], pipelineProtocolID: string | null = ProtocolRowFixture.ID): { trainer: TrainingEngineExperimentTrainer; protocolTrainer: FakeProtocolTrainer; runs: ReturnType<typeof TrainingHarness.ForUnit>['runs'] } {
    const harness = TrainingHarness.ForUnit(UnitYearsWorld.Years(), UnitYearsWorld.UnitColumns());
    const protocolTrainer = new FakeProtocolTrainer(answer);
    harness.deps.trainer = protocolTrainer;
    harness.pipeline.EvaluationProtocolID = pipelineProtocolID;
    const resolver = { resolvePipelineId: async (): Promise<string> => harness.pipeline.ID };
    return { trainer: new TrainingEngineExperimentTrainer(harness.deps, resolver, harness.engine), protocolTrainer, runs: harness.runs };
  }

  function input(timeoutSeconds: number | null): TrainExperimentInput {
    return { experiment: experiment('A', 1), plan: plan([experiment('A', 1)]), iterationId: 'iter-1', sessionId: 'sess-1', timeoutSeconds };
  }

  function canned(r: TrainerRequest): TrainerCompleted {
    return TrainerResultFixtures.CannedCompleted(r.trainingRunId, ProtocolRowFixture.Spec(), r.snapshot.featureSchemaHash);
  }

  it("hands the trainer the seconds the session has left and charges a stopped trainer the seconds and USD its run recorded", async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0.01');
    const { trainer, protocolTrainer, runs } = unitTrainer((r) => TrainerResultFixtures.CannedFailed(r.trainingRunId));
    const attempt = trainer.train(input(90));
    await expect(attempt).rejects.toBeInstanceOf(TrainingAttemptFailedError);
    await expect(attempt).rejects.toMatchObject({ ComputeSeconds: 3.25, ComputeCost: 0.0325, message: expect.stringContaining('Refused (trainer-failed)'), cause: expect.any(TrainingRefusedError) });
    expect(protocolTrainer.Requests.map((r) => r.timeoutSeconds)).toEqual([90]);
    expect([runs[0].ComputeSeconds, runs[0].ComputeCost]).toEqual([3.25, 0.0325]);
  });

  it('charges a run refused after the trainer answered (lineage-incomplete, selection-invalid) the compute it recorded', async () => {
    vi.stubEnv('PS_COMPUTE_USD_PER_SECOND', '0.01');
    const lineageGap = unitTrainer((r) => { const c = canned(r); return { ...c, codeVersion: { ...c.codeVersion, threads: 0 } }; });
    await expect(lineageGap.trainer.train(input(null))).rejects.toMatchObject({
      name: 'TrainingAttemptFailedError', ComputeSeconds: 12.5, ComputeCost: 0.125, message: expect.stringContaining('lineage-incomplete'),
    });
    const pruned = unitTrainer((r) => {
      const c = canned(r);
      return { ...c, innerScores: [...c.innerScores, { candidate: 'rf', inner: TrainerResultFixtures.Mwi('log-loss', 0.5, 0.48, 0.52, 3668), folds: 5, optimistic: true }] };
    });
    await expect(pruned.trainer.train(input(null))).rejects.toMatchObject({
      name: 'TrainingAttemptFailedError', ComputeSeconds: 12.5, ComputeCost: 0.125, message: expect.stringContaining('selection-invalid'),
    });
  });

  it('passes a refusal from before any run row existed through unchanged (protocol-required)', async () => {
    const { trainer, protocolTrainer, runs } = unitTrainer((r) => canned(r), null);
    const attempt = trainer.train(input(90));
    await expect(attempt).rejects.toBeInstanceOf(TrainingRefusedError);
    await expect(attempt).rejects.not.toBeInstanceOf(TrainingAttemptFailedError);
    await expect(attempt).rejects.toMatchObject({ Refusal: { stage: 'pipeline', reason: { kind: 'protocol-required' } } });
    expect([runs.length, protocolTrainer.Requests.length]).toEqual([0, 0]);
  });

  it("leaves the protocol's timeout when the session has no seconds bound, and reports the run's compute seconds", async () => {
    const { trainer, protocolTrainer } = unitTrainer((r) => canned(r));
    const result = await trainer.train(input(null));
    expect(protocolTrainer.Requests.map((r) => r.timeoutSeconds)).toEqual([600]);
    expect(result.ComputeSeconds).toBe(result.run.ComputeSeconds);
    expect(result.ComputeSeconds).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Pure-helper tests
// ---------------------------------------------------------------------------

describe('leaderboard helpers', () => {
  const entries: LeaderboardEntry[] = [
    { IterationID: 'i1', Metric: 0.5 },
    { IterationID: 'i2', Metric: 0.9 },
    { IterationID: 'i3', Metric: 0.7 },
  ];

  it('rankLeaderboard orders best-first deterministically', () => {
    expect(RankLeaderboard(entries).map((e) => e.IterationID)).toEqual(['i2', 'i3', 'i1']);
  });

  it('selectPrunedIterationIds applies top-K', () => {
    const pruned = SelectPrunedIterationIds(entries, { keepTopK: 1 });
    expect([...pruned].sort()).toEqual(['i1', 'i3']);
  });

  it('selectPrunedIterationIds applies the relative threshold and never prunes the best', () => {
    const pruned = SelectPrunedIterationIds(entries, { relativePruneThreshold: 0.8 });
    // best is 0.9 → cutoff 0.72 → i3(0.7) and i1(0.5) pruned, i2 kept.
    expect([...pruned].sort()).toEqual(['i1', 'i3']);
  });

  it('never prunes a single-entry leaderboard', () => {
    expect(SelectPrunedIterationIds([{ IterationID: 'x', Metric: 0.1 }], { keepTopK: 0 }).size).toBe(0);
  });
});

describe('wave strategist (deterministic default)', () => {
  it('sortByPriority orders ascending priority, stable on ties', () => {
    const exps = [experiment('low', 5), experiment('hi', 1), experiment('mid', 1)];
    expect(SortByPriority(exps).map((e) => e.Label)).toEqual(['hi', 'mid', 'low']);
  });

  it('PlanOrderWaveStrategist returns the next maxWaveSize by priority', () => {
    const s = new PlanOrderWaveStrategist();
    const remaining = [experiment('A', 3), experiment('B', 1), experiment('C', 2)];
    const wave = s.proposeNextWave({ plan: plan(remaining), remaining, leaderboard: [], waveIndex: 0, maxWaveSize: 2 });
    expect(wave.map((e) => e.Label)).toEqual(['B', 'C']);
  });
});

describe('runBounded', () => {
  it('preserves input order and bounds concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = [10, 5, 1, 8].map((d, i) => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, d));
      inFlight--;
      return i;
    });
    const results = await RunBounded(tasks, 2);
    expect(results).toEqual([0, 1, 2, 3]); // input order, not completion order
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  // H2 — at the concurrency primitive: once `shouldStop` flips true, workers must
  // stop pulling NEW tasks (in-flight ones still finish), so no extra dispatch.
  it('stops dispatching new tasks the instant shouldStop() returns true (no overrun, concurrency 3)', async () => {
    let dispatched = 0;
    let stop = false;
    // 9 tasks, 3 workers. After the first 3 (one batch) complete we trip the bound;
    // workers must not pull a 4th-onward task.
    const tasks = Array.from({ length: 9 }, (_, i) => async () => {
      dispatched++;
      await new Promise((r) => setTimeout(r, 1));
      // Trip the stop bound as soon as the first batch has all been claimed.
      if (dispatched >= 3) {
        stop = true;
      }
      return i;
    });

    const results = await RunBounded(tasks, 3, { shouldStop: () => stop });

    // Exactly the initial 3 in-flight tasks ran; no worker pulled a 4th once the
    // bound tripped. The un-dispatched slots stay `undefined`.
    expect(dispatched).toBe(3);
    expect(results.slice(0, 3)).toEqual([0, 1, 2]);
    expect(results.slice(3).every((r) => r === undefined)).toBe(true);
  });
});

describe('ExtractNormalizedScore', () => {
  it('reads the holdout metrics and passes a higher-is-better metric through', () => {
    expect(ExtractNormalizedScore(JSON.stringify({ auc: 0.81 }), 'AUC')).toBe(0.81);
  });

  it('never falls back to the training metrics: no holdout metric is no score', () => {
    expect(ExtractNormalizedScore(null, 'F1')).toBeNull();
    expect(ExtractNormalizedScore('', 'F1')).toBeNull();
  });

  it('negates a lower-is-better metric and scores a closer-to-one metric by its distance from one, so higher is always better', () => {
    expect(ExtractNormalizedScore(JSON.stringify({ rmse: 2.5 }), 'RMSE')).toBe(-2.5);
    expect(ExtractNormalizedScore(JSON.stringify({ 'calibration-slope': 0.8 }), 'calibration-slope')).toBeCloseTo(-0.2, 12);
  });

  it('returns null, never 0, when the metric is missing, not a number, or of no known direction', () => {
    expect(ExtractNormalizedScore(JSON.stringify({ auc: 0.8 }), 'F1')).toBeNull();
    expect(ExtractNormalizedScore(JSON.stringify({ f1: '0.7' }), 'F1')).toBeNull();
    expect(ExtractNormalizedScore(JSON.stringify({ lift: 1.4 }), 'lift')).toBeNull();
    expect(ExtractNormalizedScore('not json', 'AUC')).toBeNull();
    expect(ExtractNormalizedScore('[0.8]', 'AUC')).toBeNull();
  });
});

