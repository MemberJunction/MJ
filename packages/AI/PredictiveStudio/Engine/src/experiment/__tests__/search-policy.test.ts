import { describe, it, expect } from 'vitest';
import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type {
  MJExperimentEntity,
  MJExperimentSessionEntity,
  MJExperimentSessionIterationEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import {
  type EqualCostComparison,
  type LeaderboardEntry,
  type ModelingPlanSpec,
  type SearchStrategy,
  type TrainerCompleted,
} from '@memberjunction/predictive-studio-core';
import { ExperimentOrchestrator, SearchPolicyRefusedError, type ISearchComparisonStore } from '../experiment-orchestrator';
import { SeededRandomWaveStrategist } from '../random-strategist';
import { PlanOrderWaveStrategist } from '../wave-strategist';
import type {
  ExperimentDeps,
  IClock,
  IExperimentEntityFactory,
  IExperimentTrainer,
  IWaveStrategist,
  ProposedExperiment,
  TrainExperimentInput,
  TrainExperimentResult,
} from '../types';

const COMPARISON_ID = 'A1111111-1111-4111-8111-111111111111';

class FakeEntity {
  public ID = '';
  public PrimaryKey = { KeyValuePairs: [] };
  public LatestResult: { CompleteMessage: string; Message: string } | null = null;
  public IsSaved = false;
  public async Save(): Promise<boolean> {
    this.IsSaved = true;
    return true;
  }
}

class FakeExperiment extends FakeEntity {
  public Name = '';
  public Description: string | null = null;
  public ExperimentType = 'MLModelSearch';
  public TargetMetric: string | null = null;
  public Goal: string | null = null;
  public Status: string | null = null;
}

class FakeSession extends FakeEntity {
  public ExperimentID = '';
  public Name: string | null = null;
  public Goal: string | null = null;
  public Budget: string | null = null;
  public Status = 'Pending';
  public PlanSpec: string | null = null;
  public Leaderboard: string | null = null;
  public AgentRunID: string | null = null;
}

class FakeIteration extends FakeEntity {
  public ExperimentSessionID = '';
  public Sequence = 0;
  public ExperimentSpec: string | null = null;
  public Hypothesis: string | null = null;
  public TrainingRunID: string | null = null;
  public ModelID: string | null = null;
  public Score: number | null = null;
  public Status = 'Pending';
}

class FakeFactory implements IExperimentEntityFactory {
  public Sessions: FakeSession[] = [];
  public Iterations: FakeIteration[] = [];
  private seq = 0;

  public async getEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
    this.seq++;
    if (entityName === 'MJ: Experiments') {
      const e = new FakeExperiment();
      e.ID = `EXP-${this.seq}`;
      return e as unknown as T;
    }
    if (entityName === 'MJ: Experiment Sessions') {
      const s = new FakeSession();
      s.ID = `SES-${this.seq}`;
      this.Sessions.push(s);
      return s as unknown as T;
    }
    if (entityName === 'MJ: Experiment Session Iterations') {
      const it = new FakeIteration();
      it.ID = `IT-${this.seq}`;
      this.Iterations.push(it);
      return it as unknown as T;
    }
    throw new Error(`Unexpected entity: ${entityName}`);
  }
}

class FakeClock implements IClock {
  private ms = 1_000_000;
  public now(): number {
    return this.ms;
  }
}

class RecordingTrainer implements IExperimentTrainer {
  public Calls: TrainExperimentInput[] = [];
  private seq = 0;

  public async train(input: TrainExperimentInput): Promise<TrainExperimentResult> {
    this.seq++;
    this.Calls.push(input);
    const run = {
      ID: `RUN-${this.seq}`,
      TrainingSummary: JSON.stringify({}),
      ComputeCost: 1,
      ComputeSeconds: 5,
      TokensUsed: 0,
    } as unknown as MJMLTrainingRunEntity;
    const model = {
      ID: `MOD-${this.seq}`,
      HoldoutMetrics: JSON.stringify({ roc_auc: 0.75 }),
    } as unknown as MJMLModelEntity;
    return {
      model,
      run,
      Score: 0.75,
      ScoreMetric: 'roc_auc',
      ComputeCost: 1,
      ComputeSeconds: 5,
      TokensUsed: 0,
    };
  }
}

class InMemoryComparisonStore implements ISearchComparisonStore {
  public constructor(private readonly comparisons: readonly EqualCostComparison[]) {}

  public async LoadComparison(comparisonId: string): Promise<EqualCostComparison | null> {
    return this.comparisons.find((c) => c.ID.toUpperCase() === comparisonId.toUpperCase()) ?? null;
  }
}

function makeComparison(overrides: Partial<EqualCostComparison> = {}): EqualCostComparison {
  return {
    ID: COMPARISON_ID,
    Method: 'bayesian',
    ComputeBudgetSecondsPerArm: 120,
    Datasets: [
      { Dataset: 'W1-signal', Seeds: [42, 43, 44] },
      { Dataset: 'C1', Seeds: [1, 2, 3] },
    ],
    PairedDifference: {
      'W1-signal': { value: 0.08, ci: [0.05, 0.11], beats: true },
      'C1': { value: 0.04, ci: [0.02, 0.06], beats: true },
    },
    LowerBoundMin: 0.02,
    Passed: true,
    ...overrides,
  };
}

function exp(label: string, priority: number): ProposedExperiment {
  return {
    Label: label,
    Algorithm: 'logistic_regression',
    FeatureSteps: [],
    Hyperparameters: { C: priority },
    Priority: priority,
    Hypothesis: `Test ${label}`,
  };
}

function makePlan(experiments: ProposedExperiment[]): ModelingPlanSpec {
  return {
    Goal: 'Predict churn',
    TargetDefinition: {
      EntityName: 'Members',
      TargetVariable: 'Churned',
      ProblemType: 'classification',
      SuccessMetric: 'roc_auc',
    },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: experiments,
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 },
    ProposedBudget: {},
    Approved: true,
  };
}

function makeDeps(
  factory: IExperimentEntityFactory,
  trainer: IExperimentTrainer,
  clock: IClock,
  waveStrategist?: IWaveStrategist,
): ExperimentDeps {
  return {
    entityFactory: factory,
    trainer,
    clock,
    waveStrategist,
    contextUser: { ID: 'USR-1' } as unknown as UserInfo,
  };
}

describe('B4 ExperimentOrchestrator SearchPolicy — Attacks 1 & 2', () => {
  it('Attack 1: refuses guided search with missing comparison or LowerBoundMin = 0 before any training runs; accepts passing comparison', async () => {
    const orch = new ExperimentOrchestrator();
    const guided: SearchStrategy = { kind: 'guided', method: 'bayesian', equalCostComparisonId: COMPARISON_ID };
    const guidedStrategist: IWaveStrategist = {
      proposeNextWave: (ctx) => ctx.remaining.slice(0, 1),
    };

    // Missing comparison row -> refused before session or training run
    const f1 = new FakeFactory();
    const t1 = new RecordingTrainer();
    const missingErr = await orch
      .runSession(makePlan([exp('A', 1), exp('B', 2)]), makeDeps(f1, t1, new FakeClock(), guidedStrategist), {
        searchStrategy: guided,
        searchComparisonStore: new InMemoryComparisonStore([]),
      })
      .catch((e: unknown) => e);
    expect(missingErr).toBeInstanceOf(SearchPolicyRefusedError);
    expect((missingErr as SearchPolicyRefusedError).Refusal).toEqual({
      kind: 'guided-without-comparison',
      method: 'bayesian',
    });
    expect(t1.Calls.length).toBe(0);
    expect(f1.Sessions.length).toBe(0);

    // LowerBoundMin = 0 -> refused strictly (> 0, not >= 0) before any training runs
    const f2 = new FakeFactory();
    const t2 = new RecordingTrainer();
    const zeroErr = await orch
      .runSession(makePlan([exp('A', 1), exp('B', 2)]), makeDeps(f2, t2, new FakeClock(), guidedStrategist), {
        searchStrategy: guided,
        searchComparisonStore: new InMemoryComparisonStore([makeComparison({ LowerBoundMin: 0, Passed: false })]),
      })
      .catch((e: unknown) => e);
    expect(zeroErr).toBeInstanceOf(SearchPolicyRefusedError);
    expect((zeroErr as SearchPolicyRefusedError).Refusal).toEqual({
      kind: 'comparison-not-passed',
      comparisonId: COMPARISON_ID,
      lowerBoundMin: 0,
    });
    expect(t2.Calls.length).toBe(0);
    expect(f2.Sessions.length).toBe(0);

    // Passing comparison row -> accepted
    const f3 = new FakeFactory();
    const t3 = new RecordingTrainer();
    const ok = await orch.runSession(makePlan([exp('A', 1), exp('B', 2)]), makeDeps(f3, t3, new FakeClock(), guidedStrategist), {
      searchStrategy: guided,
      searchComparisonStore: new InMemoryComparisonStore([makeComparison()]),
    });
    expect(ok.stopReason).toBe('completed');
    expect(t3.Calls.length).toBe(2);
  });

  it('Attack 2: refuses any injected IWaveStrategist other than SeededRandomWaveStrategist under random/default protocol before any training runs', async () => {
    const orch = new ExperimentOrchestrator();
    const candidates = [exp('A', 1), exp('B', 2), exp('C', 3)];

    // Anonymous custom strategist under default random protocol -> refused
    const f1 = new FakeFactory();
    const t1 = new RecordingTrainer();
    const customStrategist: IWaveStrategist = {
      proposeNextWave: (ctx) => ctx.remaining.slice(0, 1),
    };
    const err1 = await orch.runSession(makePlan(candidates), makeDeps(f1, t1, new FakeClock(), customStrategist)).catch((e: unknown) => e);
    expect(err1).toBeInstanceOf(SearchPolicyRefusedError);
    expect((err1 as SearchPolicyRefusedError).Refusal.kind).toBe('strategist-not-random');
    expect(t1.Calls.length).toBe(0);
    expect(f1.Sessions.length).toBe(0);

    // PlanOrderWaveStrategist injected under explicit random protocol -> refused
    const f2 = new FakeFactory();
    const t2 = new RecordingTrainer();
    const err2 = await orch
      .runSession(makePlan(candidates), makeDeps(f2, t2, new FakeClock(), new PlanOrderWaveStrategist()), {
        searchStrategy: { kind: 'random', candidates: 3 },
      })
      .catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(SearchPolicyRefusedError);
    expect((err2 as SearchPolicyRefusedError).Refusal).toEqual({
      kind: 'strategist-not-random',
      strategist: 'PlanOrderWaveStrategist',
    });
    expect(t2.Calls.length).toBe(0);
  });

  it('Attack 2: default SeededRandomWaveStrategist stores seed on session, reproduces identically for same seed, and draws different orders for different seeds', async () => {
    const orch = new ExperimentOrchestrator();
    const space = [exp('C01', 1), exp('C02', 2), exp('C03', 3), exp('C04', 4), exp('C05', 5), exp('C06', 6), exp('C07', 7), exp('C08', 8)];

    const f1 = new FakeFactory();
    const t1 = new RecordingTrainer();
    const r1 = await orch.runSession(makePlan(space), makeDeps(f1, t1, new FakeClock()), {
      concurrency: 3,
      searchSeed: 101,
      searchStrategy: { kind: 'random', candidates: 6 },
    });

    const f2 = new FakeFactory();
    const t2 = new RecordingTrainer();
    const r2 = await orch.runSession(makePlan(space), makeDeps(f2, t2, new FakeClock()), {
      concurrency: 3,
      searchSeed: 202,
      searchStrategy: { kind: 'random', candidates: 6 },
    });

    const f3 = new FakeFactory();
    const t3 = new RecordingTrainer();
    await orch.runSession(makePlan(space), makeDeps(f3, t3, new FakeClock()), {
      concurrency: 3,
      searchSeed: 101,
      searchStrategy: { kind: 'random', candidates: 6 },
    });

    const order1 = t1.Calls.map((c) => c.experiment.Label);
    const order2 = t2.Calls.map((c) => c.experiment.Label);
    const order3 = t3.Calls.map((c) => c.experiment.Label);

    expect(order1).toHaveLength(6);
    expect(order2).toHaveLength(6);
    expect(order1).toEqual(order3);
    expect(order1).not.toEqual(order2);

    // Seed stored on the session PlanSpec JSON
    const savedSpec1 = JSON.parse(r1.session.PlanSpec!) as { SearchSeed?: number };
    const savedSpec2 = JSON.parse(r2.session.PlanSpec!) as { SearchSeed?: number };
    expect(savedSpec1.SearchSeed).toBe(101);
    expect(savedSpec2.SearchSeed).toBe(202);

    // Direct SeededRandomWaveStrategist check with injected SeededRandomWaveStrategist allowed under random
    const s = new SeededRandomWaveStrategist(101);
    const drawn = s.proposeNextWave({
      plan: makePlan(space),
      remaining: space,
      leaderboard: [] as Array<LeaderboardEntry & { ScoreMetric: string; OnSuccessMetric: boolean }>,
      waveIndex: 0,
      maxWaveSize: 4,
    });
    expect(drawn).toHaveLength(4);
  });
});

// Keep TrainerCompleted imported only if needed later? Not needed here, ensure unused imports stay zero.
export type _UnusedGuard = TrainerCompleted | MJExperimentEntity | MJExperimentSessionEntity | MJExperimentSessionIterationEntity;
