import { randomUUID } from 'node:crypto';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { UserInfo } from '@memberjunction/core';
import { MJAPIConnection } from './connect';
import { HarnessDatasets, type DatasetPool } from './datasets';
import { HarnessPipelines, type AlgorithmRow } from './pipelines';
import { HarnessTraining } from './train';
import { HarnessScoring } from './score';
import { HarnessModels } from './promote';
import { HarnessAgent } from './agent';
import { JudgeBridge } from './judge-bridge';
import { HarnessArtifacts } from './artifacts';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from './w-world';
import type { CandidateModel, LoadedDataset, TruthHarness } from './types';

/** What every harness member closes over: one MJAPI connection, one mssql pool, the algorithm catalogue, the run id. */
export interface RunContext {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly Pool: DatasetPool;
  readonly Algorithms: readonly AlgorithmRow[];
  readonly RunID: string;
}

/** The per-process harness the gates run against, and the fixture models several gates share. */
export class RunFixtures {
  private static harness: Promise<TruthHarness> | null = null;
  private static w1Draft: Promise<CandidateModel> | null = null;
  private static w1Validated: Promise<CandidateModel> | null = null;

  /** The run's harness, built on first use and shared by every gate of the process. */
  public static GetRunHarness(): Promise<TruthHarness> {
    RunFixtures.harness ||= RunFixtures.buildHarness();
    return RunFixtures.harness;
  }

  /** Trains a logistic-regression model on the given dataset (`MaxRows: 1_000_000`) and returns its `ModelID`. */
  public static async TrainedModel(h: TruthHarness, tag: string, dataset: LoadedDataset): Promise<string> {
    const p = await h.CreatePipeline({
      Name: `PSTruth: ${tag} ${h.RunID}`,
      Dataset: dataset,
      Target: 'Renewed',
      ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES],
      Algorithm: 'logistic_regression',
      AsOf: { Mode: 'none' },
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      DenyFields: [...W_WORLD_DENY_FIELDS],
    });
    const t = await h.Train(p, { MaxRows: 1_000_000 });
    if (!t.ModelID) throw new Error(`${tag} training failed: ${t.ErrorMessage || 'no model id'}`);
    return t.ModelID;
  }

  /** Memoised W1 s42 Draft logistic-regression model (`MaxRows: 1_000_000`). */
  public static W1S42Model(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Draft ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 draft', w1);
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Draft;
  }

  /** Memoised W1 s42 Validated logistic-regression model (`MaxRows: 1_000_000`), promoted via `h.Promote`. */
  public static W1S42ValidatedModel(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Validated ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 validated', w1);
      const promoted = await h.Promote(id, 'Validated', 'truth suite fixture: promote');
      if (!promoted.Promoted) throw new Error(`could not promote fixture W1 s42 model (${promoted.Status})`);
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Validated;
  }

  /** One object literal: a TruthHarness member without a line here is a compile error. */
  private static async buildHarness(): Promise<TruthHarness> {
    const { Provider: provider, User: user } = await MJAPIConnection.Connect();
    const ctx: RunContext = {
      Provider: provider,
      User: user,
      Pool: await HarnessDatasets.OpenDatasetPool(),
      Algorithms: await HarnessPipelines.LoadAlgorithms(provider, user),
      RunID: process.env.TRUTH_RUN_ID || randomUUID(),
    };
    return {
      Provider: provider,
      User: user,
      RunID: ctx.RunID,
      EnsureLoaded: (ref) => HarnessDatasets.EnsureLoaded(ctx, ref),
      CreatePipeline: (spec) => HarnessPipelines.CreatePipeline(ctx.Provider, ctx.User, ctx.Algorithms, spec),
      LastTimeIndexDeclared: () => HarnessPipelines.LastTimeIndexDeclared(),
      Train: (pipeline, opts) => HarnessTraining.Train(ctx, pipeline, opts),
      RunBuilderAgent: (plan) => HarnessAgent.RunBuilderAgent(ctx, plan),
      ReadModel: (modelId) => HarnessModels.ReadModel(ctx, modelId),
      ModelsForPipelineNamePrefix: (prefix) => HarnessModels.ModelsForPipelineNamePrefix(ctx, prefix),
      Promote: (modelId, target, reason) => HarnessModels.Promote(ctx, modelId, target, reason),
      Score: (modelId, req) => HarnessScoring.Score(ctx, modelId, req),
      ScoreViaRecordProcess: (modelId, dataset, extraFilter) =>
        HarnessScoring.ScoreViaRecordProcess(ctx, modelId, dataset, extraFilter),
      CountNonNull: (dataset, column) => HarnessDatasets.CountNonNull(ctx, dataset, column),
      ResetColumn: (dataset, column) => HarnessDatasets.ResetColumn(ctx, dataset, column),
      GenerateStory: (modelId) => HarnessAgent.GenerateStory(ctx, modelId),
      Judge: (module, args) => JudgeBridge.Judge(module, args),
      WriteArtifact: (name, data) => HarnessArtifacts.WriteArtifact(name, data),
    };
  }
}
