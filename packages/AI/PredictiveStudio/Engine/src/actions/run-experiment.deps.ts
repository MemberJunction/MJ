/**
 * @module actions/run-experiment.deps
 *
 * The refusal raised when an experiment session is requested while
 * {@link ExperimentSessions.Enabled} is off. The session runner cannot yet turn a
 * proposed experiment into a training pipeline, so no production experiment
 * dependencies are built; the Run-Experiment action and the Start Experiment Session
 * operation refuse with this error before the orchestrator creates any Experiment,
 * Session or Iteration row.
 */

import { ExperimentSessions } from '@memberjunction/predictive-studio-core';

/** Thrown when an experiment session is requested while sessions are switched off. */
export class ExperimentSessionsUnavailableError extends Error {
  /** The refusal message: the same reason the UI shows, from {@link ExperimentSessions.DisabledReason}. */
  public static readonly Message: string = ExperimentSessions.DisabledReason;

  constructor() {
    super(ExperimentSessionsUnavailableError.Message);
    this.name = 'ExperimentSessionsUnavailableError';
  }
}
