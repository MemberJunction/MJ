/**
 * Runtime check: runs an experiment session in-process over one pipeline under the trainer budgets of the Evaluation
 * Protocol the pipeline is bound to, and prints the session summary as one JSON line, or the typed refusal
 * (`{"refused": …}`) when the pipeline has no protocol (no session row is written then). Experiment sessions are
 * switched off in the product, so this check composes the session's dependencies itself: the production training
 * deps and trainer seam, and a resolver that trains the given pipeline for every experiment once the experiment's
 * algorithm name resolves against `MJ: ML Algorithms` (an unknown name fails that attempt). Training needs the Python
 * sidecar (`PREDICTIVE_STUDIO_SIDECAR_URL`), so the check runs only with `PS_INTEGRATION=1`; without it the script
 * exits 0 after saying so.
 *
 * Usage (from the repo root, against the database the harness resolves):
 *   PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-experiment-budget-check.ts <pipelineId> <algorithmName>…
 *
 * One approved experiment is proposed per algorithm name, in the order given.
 *
 * Exit code: 0 = ran or refused (both printed), 2 = no pipeline ID or algorithm given, 1 = any other error.
 */
import { BootstrapAI } from './lib/ai-bootstrap';
import '@memberjunction/core-entities';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';
import {
  ExperimentBudget,
  ExperimentOrchestrator,
  MetadataExperimentEntityFactory,
  PredictiveStudioPipelineBuilder,
  RunViewEvaluationProtocolStore,
  SystemClock,
  TrainingDelegation,
  TrainingEngineExperimentTrainer,
  TrainingRefusedError,
  type AlgorithmRow,
  type ExperimentDeps,
  type IPipelineResolver,
  type TrainExperimentInput,
} from '@memberjunction/predictive-studio';

/** Trains the one given pipeline for every experiment whose algorithm name is a known `MJ: ML Algorithms` row. */
class FixedPipelineResolver implements IPipelineResolver {
  constructor(private readonly pipelineId: string, private readonly algorithms: readonly AlgorithmRow[]) {}

  /** @throws Error naming the available algorithms when the experiment's algorithm is unknown (a failed attempt) */
  public async resolvePipelineId(input: TrainExperimentInput): Promise<string> {
    PredictiveStudioPipelineBuilder.MatchAlgorithm(input.experiment.AlgorithmName, this.algorithms);
    return this.pipelineId;
  }
}

/** The pipeline row, read as the user. */
async function loadPipeline(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<MJMLTrainingPipelineEntity> {
  const pipeline = await provider.GetEntityObject<MJMLTrainingPipelineEntity>('MJ: ML Training Pipelines', user);
  if (!(await pipeline.Load(pipelineId))) throw new Error(`ML Training Pipeline ${pipelineId} not found`);
  return pipeline;
}

/** Every `MJ: ML Algorithms` row, read once. */
async function loadAlgorithms(provider: IMetadataProvider, user: UserInfo): Promise<AlgorithmRow[]> {
  const res = await RunView.FromMetadataProvider(provider).RunView<AlgorithmRow>({ EntityName: 'MJ: ML Algorithms', Fields: ['ID', 'Name', 'DriverClass'], ResultType: 'simple' }, user);
  if (!res.Success) throw new Error(`Reading MJ: ML Algorithms failed: ${res.ErrorMessage}`);
  return res.Results;
}

/** An approved plan for the pipeline's target with one experiment per algorithm name, in the order given. */
function planFor(pipeline: MJMLTrainingPipelineEntity, algorithmNames: readonly string[]): ModelingPlanSpec {
  return {
    Goal: `Experiment budget check over ${pipeline.Name}`,
    TargetDefinition: { EntityName: pipeline.TargetEntity, TargetVariable: pipeline.TargetVariable || '', ProblemType: 'classification', SuccessMetric: 'AUC' },
    CandidateSources: [],
    CandidateFeatures: [],
    LeakageNotes: [],
    ProposedExperiments: algorithmNames.map((name, i) => ({ Label: `${name} #${i + 1}`, AlgorithmName: name, FeatureSet: [], Rationale: 'budget check', Priority: i + 1 })),
    ValidationStrategy: { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.2 },
    ProposedBudget: {},
    Approved: true,
  };
}

/** Runs the session over the pipeline named on the command line and prints what happened. */
async function main(): Promise<void> {
  const [pipelineId, ...algorithmNames] = process.argv.slice(2);
  if (!pipelineId || algorithmNames.length === 0) {
    console.error('usage: ps-experiment-budget-check.ts <pipelineId> <algorithmName>…');
    process.exit(2);
  }
  if (process.env.PS_INTEGRATION !== '1') {
    console.log('PS_INTEGRATION is not 1: training needs the sidecar, so no session was run.');
    return;
  }
  const { provider, user, pool } = await BootstrapAI();
  try {
    const pipeline = await loadPipeline(pipelineId, provider, user);
    const protocolBudgets = await ExperimentBudget.ProtocolBudgetsFor(pipeline, new RunViewEvaluationProtocolStore(provider, user));
    const resolver = new FixedPipelineResolver(pipelineId, await loadAlgorithms(provider, user));
    const deps: ExperimentDeps = {
      entityFactory: new MetadataExperimentEntityFactory(provider),
      trainer: new TrainingEngineExperimentTrainer(await TrainingDelegation.BuildTrainingDeps(provider, user), resolver),
      clock: new SystemClock(),
      contextUser: user,
      provider,
    };
    const result = await new ExperimentOrchestrator().runSession(planFor(pipeline, algorithmNames), deps, { concurrency: 1, protocolBudgets });
    console.log(JSON.stringify({
      sessionId: result.session.ID, status: result.session.Status, stopReason: result.stopReason, budget: result.session.Budget,
      iterations: result.iterations.map((it) => ({ label: it.Label, status: it.Status, score: it.Score })),
    }));
  } catch (e) {
    if (!(e instanceof TrainingRefusedError)) throw e;
    console.log(JSON.stringify({ refused: e.Refusal }));
  } finally {
    await pool.close();
  }
}

main().catch((e: Error) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
