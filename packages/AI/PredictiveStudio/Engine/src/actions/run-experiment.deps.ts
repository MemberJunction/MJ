/**
 * @module actions/run-experiment.deps
 *
 * Builds the production {@link ExperimentDeps} bundle for the
 * {@link PredictiveStudioRunExperimentAction}. Kept out of the action so the
 * action stays thin (validate → delegate → map) and so the wiring is
 * independently readable.
 *
 * The orchestrator's per-iteration {@link IExperimentTrainer} bridges to the
 * {@link TrainingEngine}, which trains by **pipeline id**. Mapping a plan's
 * proposed experiment (algorithm × feature set × hyperparameters) to a concrete
 * `MJ: ML Training Pipelines` id is an {@link IPipelineResolver} — a materialization
 * strategy that belongs to the higher layer that owns pipeline definitions. The
 * Engine package therefore supplies a clear-failing default resolver; production
 * callers inject a real one (and a real artifact loader) by constructing the deps
 * themselves and passing them via the action's `buildDeps` override.
 */

import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

import { TrainingEngine } from '../training/training-engine';
import { MetadataEntityFactory, RunViewRecordLoader, MJSidecarTrainer } from '../training/seams';
import { MJFilesArtifactStore } from '../training/artifact-store';
import type { TrainingDeps } from '../training/types';
import {
  SystemClock,
  MetadataExperimentEntityFactory,
  TrainingEngineExperimentTrainer,
  type IPipelineResolver,
} from '../experiment/seams';
import type { ExperimentDeps, TrainExperimentInput } from '../experiment/types';

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
 * @param contextUser request user — threaded for isolation/audit
 * @param provider optional provider for multi-provider correctness
 */
export function buildProductionExperimentDeps(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): ExperimentDeps {
  const entityFactory = new MetadataEntityFactory(provider);
  const trainingDeps: TrainingDeps = {
    entityFactory,
    recordLoader: new RunViewRecordLoader(),
    sidecar: new MJSidecarTrainer(),
    artifactStore: new MJFilesArtifactStore(entityFactory),
    contextUser,
    provider,
  };

  const trainer = new TrainingEngineExperimentTrainer(
    trainingDeps,
    new UnresolvedPipelineResolver(),
    new TrainingEngine(),
  );

  return {
    entityFactory: new MetadataExperimentEntityFactory(provider),
    trainer,
    clock: new SystemClock(),
    contextUser,
    provider,
  };
}
