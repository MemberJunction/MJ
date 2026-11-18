/**
 * @module actions/run-experiment.deps
 *
 * The experiment-session dependency entry points and the refusal raised while
 * {@link ExperimentSessions.Enabled} is off. The session runner cannot yet turn a
 * proposed experiment into a training pipeline (no production
 * {@link IPipelineResolver} exists), so {@link BuildProductionExperimentDeps}
 * refuses with {@link ExperimentSessionsUnavailableError} before the orchestrator
 * creates any Experiment, Session or Iteration row. The published names are kept
 * for their callers.
 */

import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { ExperimentSessions } from '@memberjunction/predictive-studio-core';

import type { IPipelineResolver } from '../experiment/seams';
import type { ExperimentDeps, TrainExperimentInput } from '../experiment/types';

/** Thrown when an experiment session is requested while sessions are switched off. */
export class ExperimentSessionsUnavailableError extends Error {
  /** The refusal message: the same reason the UI shows, from {@link ExperimentSessions.DisabledReason}. */
  public static readonly Message: string = ExperimentSessions.DisabledReason;

  constructor() {
    super(ExperimentSessionsUnavailableError.Message);
    this.name = 'ExperimentSessionsUnavailableError';
  }
}

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
 * Build the production {@link ExperimentDeps}. Always refuses with {@link ExperimentSessionsUnavailableError}
 * (no production pipeline resolver exists), before touching the database.
 *
 * @param _contextUser request user (unused; kept for the published signature)
 * @param _provider optional provider (unused; kept for the published signature)
 */
export async function BuildProductionExperimentDeps(
  _contextUser?: UserInfo,
  _provider?: IMetadataProvider,
): Promise<ExperimentDeps> {
  throw new ExperimentSessionsUnavailableError();
}

/** @deprecated Use {@link BuildProductionExperimentDeps}. */
export async function buildProductionExperimentDeps(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): Promise<ExperimentDeps> {
  return BuildProductionExperimentDeps(contextUser, provider);
}
