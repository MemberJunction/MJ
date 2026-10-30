import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJEvaluationProtocolEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';
import {
  TRAINING_RUN_RESULTS_SCHEMA, TrainerContract, TrustVerdicts,
  type CandidateInnerScore, type HoldoutSplit, type ModelingPlanSpec, type PredictionUnitColumns, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { PredictiveStudioPipelineBuilder, RESERVED_CANDIDATE_NAMES, RESERVED_CANDIDATE_PREFIX, type AlgorithmRow } from '../pipeline-builder';
import { TrainingDelegation } from '../../operations/delegation';
import type { TrainModelInput, TrainModelResult } from '../../training/types';
import { TrainerResultFixtures } from '../../training/__tests__/fixtures/trainer-result';
import { UnitYearsWorld } from '../../__tests__/fakes/unit-years-world';

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
  public readonly Pipeline = { ID: 'P-1', Name: '', PredictionUnitID: null as string | null, EvaluationProtocolID: null as string | null, LatestResult: null, NewRecord: () => true, Save: async () => this.save('pipeline', 'P-1') };
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

function completedRun(innerScores: readonly CandidateInnerScore[], finalist: string): MJMLTrainingRunEntity {
  const canned = TrainerResultFixtures.CannedCompleted(RUN_ID, { budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 10, hardStop: true } });
  const result = { ...canned, innerScores, finalist, holdoutAccess: { ...canned.holdoutAccess, finalist }, artifacts: [TrainerResultFixtures.Artifact(finalist, 'f'.repeat(64))] };
  const results: TrainingRunResults = {
    schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
    unitResolution: { rowsRead: 10, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 10, dataCutoff: '2026-01-01' },
    legacy: null, legacyRequest: null, trainer: TrainerContract.ToStoredTrainerResult(result, new Map([[finalist, 'F-1']])), trainerRequest: null, carve: null,
  };
  return { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: JSON.stringify(results) } as unknown as MJMLTrainingRunEntity;
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

  it('trains a pipeline without a Prediction Unit once, without candidates, and names the experiments it did not train', async () => {
    const world = new BuildWorld();
    const calls = spyTraining(world, { ID: RUN_ID, Notes: 'Training completed.', ValidationResults: null } as unknown as MJMLTrainingRunEntity);
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec: plan(['A', 'B', 'C']), provider: world.Provider(), user, autoPublish: false });
    expect(result.success).toBe(true);
    expect(calls).toEqual([{ pipelineId: 'P-1', sidecarVersion: 'predictive-studio-agent' }]);
    expect(world.Saves.map((s) => s.Entity)).toEqual(['pipeline']);
    expect(result.untrainedExperiments).toEqual(['B', 'C']);
    const headline = TrustVerdicts.DeriveTrustVerdict(measuredModel()).headlineMetric;
    expect(result.leaderboard).toEqual([{
      IterationID: RUN_ID, Metric: headline?.value, ModelID: 'M-1', rank: 1, algorithm: 'A', featureSet: 'Pipeline feature set', score: headline?.value,
      metricName: headline?.key, innerLower: null, innerUpper: null, optimistic: false, modelId: 'M-1', isWinner: true,
    }]);
  });

  it('refuses a plan with a bad experiment before any row is written, whichever branch it would take', async () => {
    const world = new BuildWorld();
    const calls = spyTraining(world, { ID: RUN_ID } as unknown as MJMLTrainingRunEntity);
    const spec = plan(['A', 'glm']);
    const result = await new PredictiveStudioPipelineBuilder().Build({ spec, provider: world.Provider(), user, autoPublish: false });
    expect(result.errorMessage).toBe("Experiment label 'glm' is reserved for a baseline member; rename the experiment.");
    expect([world.Saves.length, calls.length]).toEqual([0, 0]);
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
    expect(result.untrainedExperiments).toEqual([]);
    expect(result.leaderboard?.map((r) => [r.rank, r.algorithm, r.score, r.innerLower, r.innerUpper, r.optimistic, r.isWinner, r.modelId])).toEqual([
      [1, 'B', 0.40, 0.38, 0.42, true, false, undefined],
      [2, 'C', 0.41, 0.39, 0.43, true, true, 'M-1'],
      [3, 'A', 0.42, 0.4, 0.44, true, false, undefined],
      [4, 'E', 0.44, 0.42, 0.46, true, false, undefined],
      [5, 'D', 0.45, 0.43, 0.47, true, false, undefined],
    ].map((row) => row.map((v) => (typeof v === 'number' ? expect.closeTo(v, 12) : v))));
    expect(result.leaderboard?.every((r) => r.metricName === 'log-loss')).toBe(true);
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
    expect(JSON.parse(protocol.Holdout) as HoldoutSplit).toEqual({ kind: 'seeded-random', fraction: 0.25 });
    expect(JSON.parse(protocol.Budgets)).toMatchObject({ maxCandidates: 3 });
    expect(protocol.Seed).toBe(0);
    expect(JSON.parse(protocol.AuthoredBy)).toEqual({ kind: 'system', component: 'pipeline-builder' });
  });
});

