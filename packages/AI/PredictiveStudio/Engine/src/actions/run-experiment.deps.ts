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
import { ResolveActiveFileStorageProviderId, BuildArtifactStore } from '../training/artifact-store';
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

/** Why experiment sessions are switched off (containment of F-EXP-1). */
export const EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE =
  'Experiment sessions are switched off: the session runner has no way to turn a proposed experiment into a training ' +
  'pipeline, so every iteration failed while the session still reported Completed. Build models with the Model ' +
  'Development Agent (its Pipeline Builder trains the approved experiments) or train a pipeline with Train ML Model.';

/** Thrown when an experiment session is requested while sessions are switched off. */
export class ExperimentSessionsUnavailableError extends Error {
  constructor() {
    super(EXPERIMENT_SESSIONS_UNAVAILABLE_MESSAGE);
    this.name = 'ExperimentSessionsUnavailableError';
  }
}

/** Builds the experiment orchestrator's dependencies (static members on one owner, coding standards §2). */
export class ExperimentDepsBuilder {
  /**
   * Production {@link ExperimentDeps}: refused until a real {@link IPipelineResolver} exists (a later change wires one
   * through {@link ExperimentDepsBuilder.BuildWithResolver}). Refusing here stops both the Action and the Remote Operation
   * before the orchestrator creates any Experiment, Session or Iteration row.
   */
  public static async BuildProductionExperimentDeps(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<ExperimentDeps> {
    throw new ExperimentSessionsUnavailableError();
  }

  /**
   * The orchestrator's dependencies with a caller-supplied pipeline resolver: the production wiring, with `resolver`
   * deciding which pipeline each experiment trains.
   */
  public static async BuildWithResolver(resolver: IPipelineResolver, contextUser: UserInfo, provider: IMetadataProvider): Promise<ExperimentDeps> {
    const entityFactory = new MetadataEntityFactory(provider);
    const providerId = await ResolveActiveFileStorageProviderId(contextUser, provider);
    const trainingDeps: TrainingDeps = {
      entityFactory,
      recordLoader: new RunViewRecordLoader(),
      sidecar: new MJSidecarTrainer(),
      artifactStore: BuildArtifactStore(providerId, entityFactory),
      contextUser,
      provider,
    };
    const trainer = new TrainingEngineExperimentTrainer(trainingDeps, resolver, new TrainingEngine());
    return {
      entityFactory: new MetadataExperimentEntityFactory(provider),
      trainer,
      clock: new SystemClock(),
      contextUser,
      provider,
    };
  }
}
