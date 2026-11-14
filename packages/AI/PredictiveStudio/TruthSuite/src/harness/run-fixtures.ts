import { randomUUID } from 'node:crypto';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity, PredictiveStudioModelTransition } from '@memberjunction/core-entities';
import { GateRefusals } from '@memberjunction/predictive-studio';
import { EscapeSQLString } from '@memberjunction/global';
import { HarnessDatasets, type DatasetPool } from './datasets';
import { HarnessPipelines, type AlgorithmRow } from './pipelines';
import { HarnessTraining } from './train';
import { HarnessScoring } from './score';
import { HarnessModels } from './promote';
import { HarnessAgent } from './agent';
import { JudgeBridge } from './judge-bridge';
import { HarnessArtifacts } from './artifacts';
import { HarnessCleanup, RunRecords } from './cleanup';
import { HarnessWorldTruth } from './world-truth';
import { HarnessProvenance } from './provenance';
import { HarnessSidecar } from './sidecar';
import { W_WORLD_FEATURES, W_WORLD_DENY_FIELDS } from './w-world';
import type { CandidateModel, LoadedDataset, PipelineSpec, PromoteAttempt, TruthHarness } from './types';

/** What every harness member closes over: one MJAPI connection, one mssql pool, the algorithm catalogue, the run id. */
export interface RunContext {
  readonly Provider: GraphQLDataProvider;
  readonly User: UserInfo;
  readonly Pool: DatasetPool;
  readonly Algorithms: readonly AlgorithmRow[];
  readonly RunID: string;
}

/** One harness and what it holds open: its mssql pool. */
interface HarnessConnection {
  readonly Harness: TruthHarness;
  readonly Pool: DatasetPool;
}

/** A harness bound to one client provider (see {@link RunFixtures.HarnessFor}). */
interface BoundHarness {
  readonly Provider: GraphQLDataProvider;
  readonly Connection: Promise<HarnessConnection>;
}

/** The per-process harness the gates run against, and the fixture models several gates share. */
export class RunFixtures {
  /** Every harness bound since the last cleanup, the current one last; cleanup closes them all. */
  private static bound: BoundHarness[] = [];
  private static w1Draft: Promise<CandidateModel> | null = null;
  private static w1Published: Promise<CandidateModel> | null = null;

  /**
   * The run's harness on a provider the caller already holds (an `mj test` check's client provider), built on first use
   * and shared while the provider stays the same. A different provider gets its own harness, and the fixture models
   * are forgotten: they were recorded on the previous harness, which is still cleaned up by `CleanupRun`.
   */
  public static async HarnessFor(provider: GraphQLDataProvider, user: UserInfo): Promise<TruthHarness> {
    let current = RunFixtures.bound[RunFixtures.bound.length - 1];
    if (current?.Provider !== provider) {
      RunFixtures.w1Draft = null;
      RunFixtures.w1Published = null;
      current = { Provider: provider, Connection: RunFixtures.connect(provider, user) };
      RunFixtures.bound.push(current);
    }
    return (await current.Connection).Harness;
  }

  /**
   * For every harness bound since the last cleanup: look up the pipelines of its agent runs again by their exact names
   * (a run can create them after the client call returned), delete the pipelines and models it recorded with their
   * training runs and scoring bindings through the entity layer, and close its pool. Every step is attempted; throws
   * one error naming each failure. No-op when nothing was bound.
   */
  public static async CleanupRun(user: UserInfo): Promise<void> {
    const bound = RunFixtures.bound;
    RunFixtures.bound = [];
    RunFixtures.w1Draft = null;
    RunFixtures.w1Published = null;
    const failures: string[] = [];
    for (const b of bound) {
      failures.push(...(await RunFixtures.cleanupConnection(b, user)));
    }
    if (failures.length > 0) {
      throw new Error(`truth-suite cleanup left ${failures.length} problem(s): ${failures.join('; ')}`);
    }
  }

  /** Clean up one bound harness; returns one line per failure (never throws). */
  private static async cleanupConnection(b: BoundHarness, user: UserInfo): Promise<string[]> {
    let conn: HarnessConnection;
    try {
      conn = await b.Connection;
    } catch {
      return []; // the harness never connected, so it created and opened nothing
    }
    const h = conn.Harness;
    const failures: string[] = [];
    try {
      const agentPipelines = await HarnessAgent.PipelineIDsNamed(h.Provider, user, h.Created.AgentPipelineNames);
      for (const id of agentPipelines) h.Created.RecordPipeline(id);
      await RunFixtures.recordPipelineBindings(h, user, agentPipelines);
      failures.push(...(await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(h.Provider, user), h.Created)));
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
    try {
      await conn.Pool.close();
    } catch (e) {
      failures.push(`closing the dataset pool: ${e instanceof Error ? e.message : String(e)}`);
    }
    return failures.map((f) => `run ${h.RunID}: ${f}`);
  }

  /**
   * The unit and protocol versions the agent runs' pipelines are bound to (the builder binds them), recorded so cleanup
   * deletes them with their pipelines.
   */
  private static async recordPipelineBindings(h: TruthHarness, user: UserInfo, pipelineIds: readonly string[]): Promise<void> {
    if (pipelineIds.length === 0) return;
    const r = await RunView.FromMetadataProvider(h.Provider).RunView<Pick<MJMLTrainingPipelineEntity, 'PredictionUnitID' | 'EvaluationProtocolID'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID IN (${pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`,
      Fields: ['PredictionUnitID', 'EvaluationProtocolID'], ResultType: 'simple', BypassCache: true,
    }, user);
    if (!r.Success) throw new Error(`reading the agent pipelines' bindings failed: ${r.ErrorMessage}`);
    for (const p of r.Results) h.Created.RecordPipelineBindings(p);
  }

  /** Trains a logistic-regression model on the given dataset (every unit row: a unit pipeline refuses a row cap) and returns its `ModelID`. */
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
    const t = await h.Train(p);
    if (!t.ModelID) throw new Error(`${tag} training failed: ${t.ErrorMessage || 'no model id'}`);
    return t.ModelID;
  }

  /** Memoised W1 s42 Draft logistic-regression model. */
  public static W1S42Model(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Draft ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 draft', w1);
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Draft;
  }

  /**
   * Memoised W1 s42 logistic-regression model that scores: evaluated and then published through the lifecycle gate by
   * the suite user ({@link PublishModel}). W1 s42's stored decision keeps the simple baseline, so `evaluate` alone
   * leaves it `KeepBaseline`, which the scorer refuses; an interactive publish of `KeepBaseline` is allowed (§5.1).
   */
  public static W1S42PublishedModel(h: TruthHarness): Promise<CandidateModel> {
    RunFixtures.w1Published ||= (async (): Promise<CandidateModel> => {
      const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
      const id = await RunFixtures.TrainedModel(h, 'fixture W1 s42 published', w1);
      await RunFixtures.PublishModel(h, id, 'fixture W1 s42 published');
      return h.ReadModel(id);
    })();
    return RunFixtures.w1Published;
  }

  /**
   * `evaluate` through the gate, asserting it applied and reached the training run's stored decision (`Validated` or
   * `KeepBaseline`); throws naming the gate's answer otherwise. Returns the status reached. For a fixture that only
   * inspects the model's status: a model that scores goes on to {@link PublishModel}.
   */
  public static async EvaluateModel(h: TruthHarness, modelId: string, tag: string): Promise<MJMLModelEntity['Status']> {
    const evaluated = await h.Promote(modelId, 'evaluate', `truth suite fixture (${tag}): evaluate`);
    RunFixtures.assertReached(evaluated, 'evaluate', modelId, tag, ['Validated', 'KeepBaseline']);
    return evaluated.Status;
  }

  /** `evaluate`, then `publish` through the gate as the suite user, asserting the model reached `Published`; throws naming the gate's answer otherwise. */
  public static async PublishModel(h: TruthHarness, modelId: string, tag: string): Promise<void> {
    await RunFixtures.EvaluateModel(h, modelId, tag);
    const published = await h.Promote(modelId, 'publish', `truth suite fixture (${tag}): publish so the gate's check can score it`);
    RunFixtures.assertReached(published, 'publish', modelId, tag, ['Published']);
  }

  /** Throws unless the transition applied and left the model in one of `expected`, with the gate's refusal kind and words. */
  private static assertReached(
    attempt: PromoteAttempt, transition: PredictiveStudioModelTransition, modelId: string, tag: string, expected: readonly MJMLModelEntity['Status'][],
  ): void {
    if (attempt.Applied && expected.includes(attempt.Status)) return;
    throw new Error(`${tag}: the ${transition} of ML Model ${modelId} left it ${attempt.Status}, not ${expected.join(' or ')} (the lifecycle gate's answer: ${RunFixtures.GateAnswer(attempt.Refusal)})`);
  }

  /** A gate refusal for a fixture's failure message: its kind and the gate's plain words, or "no refusal". */
  public static GateAnswer(refusal: PromoteAttempt['Refusal']): string {
    return refusal === null ? 'no refusal' : `${refusal.kind}: ${GateRefusals.Describe(refusal)}`;
  }

  /**
   * The harness on a caller's provider: opens the dataset pool, closed again if building the harness fails. Model
   * files need no setup here: training stores them through the provider `PS_STORAGE_PROVIDER` names, whatever its
   * `IsActive` flag.
   */
  private static async connect(provider: GraphQLDataProvider, user: UserInfo): Promise<HarnessConnection> {
    const pool = await HarnessDatasets.OpenDatasetPool();
    try {
      return { Harness: await RunFixtures.harnessFrom(provider, user, pool), Pool: pool };
    } catch (e) {
      await pool.close();
      throw e;
    }
  }

  /** Creates a pipeline and records the unit and protocol the migration bound to it: they are this run's rows too, so cleanup deletes them. */
  private static async createRecordedPipeline(ctx: RunContext, created: RunRecords, spec: PipelineSpec): Promise<MJMLTrainingPipelineEntity> {
    const p = await HarnessPipelines.CreatePipeline(ctx.Provider, ctx.User, ctx.Algorithms, spec);
    created.RecordPipelineBindings(p);
    return p;
  }

  /** One object literal: a TruthHarness member without a line here is a compile error. */
  private static async harnessFrom(provider: GraphQLDataProvider, user: UserInfo, pool: DatasetPool): Promise<TruthHarness> {
    const ctx: RunContext = {
      Provider: provider,
      User: user,
      Pool: pool,
      Algorithms: await HarnessPipelines.LoadAlgorithms(provider, user),
      RunID: process.env.TRUTH_RUN_ID || randomUUID(),
    };
    const created = new RunRecords();
    return created.Recording({
      Provider: provider,
      User: user,
      RunID: ctx.RunID,
      Created: created,
      EnsureLoaded: (ref) => HarnessDatasets.EnsureLoaded(ctx, ref),
      CreatePipeline: (spec) => RunFixtures.createRecordedPipeline(ctx, created, spec),
      Train: (pipeline, opts) => HarnessTraining.Train(ctx, pipeline, opts),
      RunBuilderAgent: (plan) => HarnessAgent.RunBuilderAgent(ctx, plan),
      ReadModel: (modelId) => HarnessModels.ReadModel(ctx, modelId),
      ModelsForPipelineNamePrefix: (prefix) => HarnessModels.ModelsForPipelineNamePrefix(ctx, prefix),
      Promote: (modelId, transition, reason) => HarnessModels.Promote(ctx, modelId, transition, reason),
      Score: (modelId, req) => HarnessScoring.Score(ctx, modelId, req),
      ScoreViaRecordProcess: (modelId, dataset, extraFilter) =>
        HarnessScoring.ScoreViaRecordProcess(ctx, modelId, dataset, extraFilter),
      CountNonNull: (dataset, column) => HarnessDatasets.CountNonNull(ctx, dataset, column),
      ResetColumn: (dataset, column) => HarnessDatasets.ResetColumn(ctx, dataset, column),
      GenerateStory: (modelId) => HarnessAgent.GenerateStory(ctx, modelId),
      Judge: (module, args) => JudgeBridge.Judge(module, args),
      WriteArtifact: (name, data) => HarnessArtifacts.WriteArtifact(name, data),
      ReadWorldTruth: (dataset) => HarnessWorldTruth.ReadWorldTruth(dataset),
      SampleRowIds: (dataset, n, seed) => HarnessProvenance.SampleRowIds(ctx, dataset, n, seed),
      ResolveProvenance: (check) => HarnessProvenance.ResolveProvenance(ctx, check),
      UseSuiteSidecar: () => HarnessSidecar.UseSuiteSidecar(),
    });
  }
}
