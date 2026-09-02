/**
 * @module actions/run-experiment.deps
 *
 * Builds the production {@link ExperimentDeps} bundle for the
 * {@link PredictiveStudioRunExperimentAction}. Kept out of the action so the
 * action stays thin (validate → delegate → map) and so the wiring is
 * independently readable.
 *
 * The orchestrator's per-iteration {@link IExperimentTrainer} bridges to the
 * {@link TrainingEngine}, which trains by **pipeline id**. Mapping a plan's proposed experiment
 * (algorithm × feature set × hyperparameters) to a concrete `MJ: ML Training Pipelines` id is an
 * {@link IPipelineResolver}; production now wires {@link MaterializingPipelineResolver}, which
 * reuses an existing pipeline whose whole configuration matches and materializes one when none
 * does. {@link UnresolvedPipelineResolver} remains exported for callers that deliberately want the
 * mapping to be someone else's decision.
 */

import { LogStatus } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

import { TrainingEngine } from '../training/training-engine';
import { MetadataEntityFactory, RunViewRecordLoader, MJSidecarTrainer } from '../training/seams';
import { resolveActiveFileStorageProviderId, buildArtifactStore } from '../training/artifact-store';
import type { TrainingDeps } from '../training/types';
import {
  SystemClock,
  MetadataExperimentEntityFactory,
  TrainingEngineExperimentTrainer,
  type IPipelineResolver,
} from '../experiment/seams';
import type { ExperimentDeps, IWaveStrategist, TrainExperimentInput } from '../experiment/types';
import { ComponentCombinationWaveStrategist } from '../experiment/component-combination-wave-strategist';
import { ComponentEngineProfileSource } from '../components/graph-resolver';
import { MLComponentEngine } from '../components/ml-component-engine';
import { MetadataComponentMaterializer } from '../components/materialization-seam';
import { MetadataTrainComponentGraphResolver } from '../components/train-graph-seam';
import { LocalArtifactLoader } from '../scoring/artifact-loader';
import { MaterializingPipelineResolver, type IPipelineMaterializer } from '../experiment/materializing-pipeline-resolver';
import { createTrainingPipeline } from '../agent/create-pipeline';
import type { PipelineConfig } from '../agent/modeling-plan-to-pipeline';

/**
 * A clear-failing default {@link IPipelineResolver}. The strategy for turning a
 * proposed experiment into a `MJ: ML Training Pipelines` id (reuse vs. materialize)
 * is owned by the higher layer; until one is wired, attempting to execute an
 * experiment session in production surfaces an actionable error rather than
 * silently training the wrong pipeline.
 */
export class UnresolvedPipelineResolver implements IPipelineResolver {
  public async resolvePipelineId(input: TrainExperimentInput): Promise<string> {
    throw new Error(
      `Run Experiment Session: no pipeline resolver is configured for experiment '${input.experiment.Label}'. ` +
        'Supply a production IPipelineResolver (the experiment → pipeline materialization strategy) by constructing ' +
        'ExperimentDeps in the higher layer and passing them via the action.',
    );
  }
}

/**
 * Build the production {@link ExperimentDeps} from the request user/provider. The
 * training-side bundle (entity factory + record loader + sidecar + artifact store)
 * is composed here and handed to the {@link TrainingEngineExperimentTrainer} so
 * each iteration trains through the real {@link TrainingEngine}.
 *
 * The artifact store is built the same way the standalone training path builds it:
 * resolve the active `MJ: File Storage Providers` id (see
 * {@link resolveActiveFileStorageProviderId}) and stamp it on the store, which
 * creates a real `MJ: Files` row and writes the bytes to local disk keyed by that
 * id (dev / on-prem). Async so the provider lookup is part of the wiring.
 *
 * @param contextUser request user — threaded for isolation/audit
 * @param provider optional provider for multi-provider correctness
 */
export async function buildProductionExperimentDeps(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): Promise<ExperimentDeps> {
  const entityFactory = new MetadataEntityFactory(provider);
  const providerId = await resolveActiveFileStorageProviderId(contextUser, provider);
  const trainingDeps: TrainingDeps = {
    entityFactory,
    recordLoader: new RunViewRecordLoader(),
    sidecar: new MJSidecarTrainer(),
    artifactStore: buildArtifactStore(providerId, entityFactory),
    contextUser,
    provider,
    // Project every trained model into the component graph (root `MJ: ML Components` row +
    // bindings onto real MJ entities/fields). Best-effort by contract — never fails a train.
    componentMaterializer: new MetadataComponentMaterializer(),
    // Only a pipeline with a ComponentGraph consults this; without it such a pipeline refuses to
    // train rather than quietly falling back to its root estimator.
    componentGraphResolver: new MetadataTrainComponentGraphResolver(new LocalArtifactLoader()),
  };

  const trainer = new TrainingEngineExperimentTrainer(
    trainingDeps,
    new MaterializingPipelineResolver(new PipelineBuilderMaterializer()),
    new TrainingEngine(),
  );

  return {
    entityFactory: new MetadataExperimentEntityFactory(provider),
    trainer,
    clock: new SystemClock(),
    contextUser,
    provider,
    waveStrategist: await buildCombinationStrategist(contextUser, provider),
  };
}

/**
 * The production wave strategist — the component-combination search.
 *
 * It had none, so `ExperimentOrchestrator` always fell through to `PlanOrderWaveStrategist`, which
 * sorts the agent's proposals and slices them. Every session therefore ran the plan and stopped:
 * the search half of the design loop was built, tested, and unreachable.
 *
 * Substituting it is safe because it is a strict SUPERSET of plan order — explicitly proposed
 * experiments are always dispatched first and are never displaced by a generated one. Generation
 * only begins once the plan is exhausted, which is precisely where plan order gave up.
 *
 * The component tree is loaded here so the search knows what each family's knobs are. If that load
 * fails the strategist is still returned: `profileFor` finds no type, yields no knobs, and the
 * session behaves EXACTLY as it does today. A missing tree costs exploration, never correctness.
 */
async function buildCombinationStrategist(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): Promise<IWaveStrategist> {
  try {
    await MLComponentEngine.Instance.Config(false, contextUser, provider);
  } catch (err) {
    LogStatus(
      `PredictiveStudio: the component tree could not be loaded, so the combination search has no ` +
        `hyperparameter knobs to vary and the session will run the plan as proposed ` +
        `(${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  return new ComponentCombinationWaveStrategist(new ComponentEngineProfileSource());
}

/**
 * Production {@link IPipelineMaterializer} — creates the pipeline through the SAME
 * {@link createTrainingPipeline} helper an agent build uses, so a pipeline born in an experiment
 * session is indistinguishable from one built directly and both inherit its plan validation (real
 * entity, real target column, real feature columns, real algorithm).
 */
export class PipelineBuilderMaterializer implements IPipelineMaterializer {
  /** @inheritdoc */
  public async materialize(config: PipelineConfig, provider: IMetadataProvider, user: UserInfo): Promise<string> {
    const pipeline = await createTrainingPipeline(config, provider, user);
    return pipeline.ID;
  }
}
