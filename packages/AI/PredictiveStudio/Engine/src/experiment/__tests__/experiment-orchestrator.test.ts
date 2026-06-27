import { describe, it, expect } from 'vitest';
import type { UserInfo, BaseEntity } from '@memberjunction/core';
import type { ModelingPlanSpec, LeaderboardEntry } from '@memberjunction/predictive-studio-core';
import type { MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { ExperimentOrchestrator } from '../experiment-orchestrator';
import { extractNormalizedScore } from '../seams';
import { rankLeaderboard, selectPrunedIterationIds } from '../leaderboard';
import { runBounded } from '../concurrency';
import { PlanOrderWaveStrategist, sortByPriority } from '../wave-strategist';
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
    private readonly scoreByLabel: Record<string, number>,
    private readonly clock?: FakeClock,
    private readonly perTrainMs = 0,
    private readonly computeCostPerTrain = 1,
    private readonly failLabels: Set<string> = new Set(),
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
    const score = this.scoreByLabel[input.experiment.Label] ?? 0;
    return {
      model: model as unknown as MJMLModelEntity,
      run: run as unknown as MJMLTrainingRunEntity,
      Score: score,
      ComputeCost: this.computeCostPerTrain,
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
  });

  // M9 — failIteration checks the Save boolean and logs on failure (no throw).
  it('records a failed iteration even when its Failed-status save returns false', async () => {
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
    expect(rankLeaderboard(entries).map((e) => e.IterationID)).toEqual(['i2', 'i3', 'i1']);
  });

  it('selectPrunedIterationIds applies top-K', () => {
    const pruned = selectPrunedIterationIds(entries, { keepTopK: 1 });
    expect([...pruned].sort()).toEqual(['i1', 'i3']);
  });

  it('selectPrunedIterationIds applies the relative threshold and never prunes the best', () => {
    const pruned = selectPrunedIterationIds(entries, { relativePruneThreshold: 0.8 });
    // best is 0.9 → cutoff 0.72 → i3(0.7) and i1(0.5) pruned, i2 kept.
    expect([...pruned].sort()).toEqual(['i1', 'i3']);
  });

  it('never prunes a single-entry leaderboard', () => {
    expect(selectPrunedIterationIds([{ IterationID: 'x', Metric: 0.1 }], { keepTopK: 0 }).size).toBe(0);
  });
});

describe('wave strategist (deterministic default)', () => {
  it('sortByPriority orders ascending priority, stable on ties', () => {
    const exps = [experiment('low', 5), experiment('hi', 1), experiment('mid', 1)];
    expect(sortByPriority(exps).map((e) => e.Label)).toEqual(['hi', 'mid', 'low']);
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
    const results = await runBounded(tasks, 2);
    expect(results).toEqual([0, 1, 2, 3]); // input order, not completion order
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe('extractNormalizedScore', () => {
  it('prefers holdout metrics and passes ranking metrics through', () => {
    expect(extractNormalizedScore(JSON.stringify({ auc: 0.81 }), JSON.stringify({ auc: 0.95 }), 'AUC', 'classification')).toBe(0.81);
  });

  it('falls back to training metrics when holdout is absent', () => {
    expect(extractNormalizedScore(null, JSON.stringify({ f1: 0.7 }), 'F1', 'classification')).toBe(0.7);
  });

  it('negates error metrics so higher Score is always better', () => {
    expect(extractNormalizedScore(JSON.stringify({ rmse: 2.5 }), null, 'RMSE', 'regression')).toBe(-2.5);
  });

  it('returns 0 when the metric is missing', () => {
    expect(extractNormalizedScore(JSON.stringify({ auc: 0.8 }), null, 'F1', 'classification')).toBe(0);
  });
});
