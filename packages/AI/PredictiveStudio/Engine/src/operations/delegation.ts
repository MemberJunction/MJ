/**
 * @module operations/delegation
 *
 * Shared **engine-delegation helpers** for the Predictive Studio Remote Operations.
 *
 * The seven Manual-mode Remote Operations and the five Predictive Studio Actions are
 * two thin invocation surfaces over the SAME engine service classes
 * (`TrainingEngine`, `ProductionScoreRecordSetRunner`, `ProductionModelPromotionGate`; experiment
 * sessions are switched off and refuse with `ExperimentSessionsUnavailableError`). Per CLAUDE.md
 * "push improvements to the generic level" and DRY, the production wiring each path
 * needs lives here exactly ONCE, so the Remote Ops and Actions share one delegation
 * path rather than duplicating the deps/seam construction.
 *
 * Each helper takes the already-validated typed input plus the per-execution
 * `provider` + `user` (the ambient Remote Op contract) and returns the engine's
 * native result; the calling operation maps that onto its CodeGen-emitted Output.
 * Keeping the helpers free of any Remote-Op / Action specifics is what lets both
 * surfaces reuse them.
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

import { TrainingEngine } from '../training/training-engine';
import { MetadataEntityFactory, RunViewRecordLoader, MJSidecarTrainer } from '../training/seams';
import { ResolveActiveFileStorageProviderId, BuildArtifactStore } from '../training/artifact-store';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from '../training/types';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';

import { ExperimentOrchestrator } from '../experiment/experiment-orchestrator';
import type { ExperimentRunOptions, ExperimentSessionResult } from '../experiment/types';
import { ExperimentSessionsUnavailableError } from '../actions/run-experiment.deps';

import { ProductionScoreRecordSetRunner } from '../actions/score-record-set.runner';
import { RunViewMLModelLoader, MJSidecarPredictor } from '../scoring/seams';
import { LocalArtifactLoader } from '../scoring/artifact-loader';
import type { MLInferenceDeps } from '../scoring/types';
import type {
  IScoreRecordSetRunner,
  ScoreRecordSetRequest,
  ScoreRecordSetResult,
} from '../actions/score-record-set.action';

import { ProductionModelPromotionGate } from '../actions/promote-model.gate';
import type {
  IModelPromotionGate,
  PromoteModelRequest,
  PromoteModelOutcome,
} from '../actions/promote-model.action';

import type {
  ModelingPlanSpec,
  Budget,
} from '@memberjunction/predictive-studio-core';

// ----- Training ---------------------------------------------------------------

/**
 * Build the {@link TrainingEngine}'s production dependency bundle from a per-call
 * `provider` + `user`. Resolves the active File Storage Provider once and chooses
 * the artifact-store family accordingly (MJ-Files when a provider is active, local
 * disk when none is — see {@link ResolveActiveFileStorageProviderId}). Async so the
 * provider lookup is part of the wiring; the scoring side keys off the SAME
 * decision (the composite loader routes by whether the artifact exists on local
 * disk) so a model never gets trained to one family and scored from another.
 *
 * @param provider the owning provider for data access / multi-provider correctness
 * @param user the acting user threaded through every entity op for isolation/audit
 */
export async function BuildTrainingDeps(provider: IMetadataProvider, user: UserInfo): Promise<TrainingDeps> {
  const entityFactory = new MetadataEntityFactory(provider);
  const providerId = await ResolveActiveFileStorageProviderId(user, provider);
  return {
    entityFactory,
    recordLoader: new RunViewRecordLoader(),
    sidecar: new MJSidecarTrainer(),
    artifactStore: BuildArtifactStore(providerId, entityFactory),
    contextUser: user,
    provider,
    // The Prediction Unit seams read through the same provider and user as every other training read.
    predictionUnits: new RunViewPredictionUnitStore(provider, user),
    assemblyMetadata: new ProviderAssemblyMetadata(provider),
    dataAccess: new RunViewDataAccess(user, provider),
  };
}

/**
 * Train a model by pipeline id, delegating to {@link TrainingEngine.trainModel}
 * with production deps. The `engine` is injectable so unit tests substitute a mock
 * with no live DB / sidecar (mirroring the Action's `createEngine` seam).
 *
 * A refused run throws `TrainingRefusedError` unchanged: the run row already records the
 * refusal, and the operation surfaces its message as the operation's error.
 *
 * @param input the typed training input (pipeline id + optional overrides)
 * @param provider the owning provider
 * @param user the acting user
 * @param engine optional engine override (defaults to a fresh {@link TrainingEngine})
 */
export async function TrainModelViaEngine(
  input: TrainModelInput,
  provider: IMetadataProvider,
  user: UserInfo,
  engine: TrainingEngine = new TrainingEngine(),
): Promise<TrainModelResult> {
  return engine.trainModel(input, await BuildTrainingDeps(provider, user));
}

/**
 * Whether a training run was leakage-flagged. The engine keeps a flagged model in
 * `Draft` and records a plain-language `LEAKAGE WARNING` in the run's `Notes`
 * (§6.4); this reads that single source of truth so the Remote Op and Action agree.
 */
export function WasTrainingLeakageFlagged(result: TrainModelResult): boolean {
  return (result.run.Notes ?? '').includes('LEAKAGE WARNING');
}

// ----- Scoring ----------------------------------------------------------------

/**
 * The production {@link MLInferenceDeps} bundle the scorer runs with — the
 * {@link RunViewMLModelLoader} (loads the `MJ: ML Models` row), the
 * {@link MJSidecarPredictor} (runs `/predict` against the Python sidecar) and the
 * {@link LocalArtifactLoader} (reads the model bytes back by their `MJ: Files` row id,
 * the read-side inverse of `MJFilesArtifactStore`). Shared by {@link BuildScoreRecordSetRunner}
 * (the Score action / Remote Op path) AND the startup work-type registration so a model
 * trained one way is always scored the same way — one source of truth (CLAUDE.md DRY).
 *
 * **Production follow-up**: swap `LocalArtifactLoader` for a provider `GetObject`
 * loader; the id contract (read by File id) is unchanged.
 */
export function BuildProductionMLInferenceDeps(): MLInferenceDeps {
  return { modelLoader: new RunViewMLModelLoader(), sidecar: new MJSidecarPredictor(), artifactLoader: new LocalArtifactLoader() };
}

/**
 * Build the production scoring runner wired with the production {@link MLInferenceDeps}
 * (see {@link BuildProductionMLInferenceDeps}). No provider lookup is needed at score
 * time — the File id IS the artifact key.
 */
export function BuildScoreRecordSetRunner(): ProductionScoreRecordSetRunner {
  return new ProductionScoreRecordSetRunner({ deps: BuildProductionMLInferenceDeps() });
}

/**
 * Score a record set, delegating to the SAME production runner the Score action
 * uses ({@link ProductionScoreRecordSetRunner} → `MLModelInferenceProcessor`). The
 * default runner is wired with the {@link LocalArtifactLoader} so the artifact is
 * read back by its `MJ: Files` row id. The `runner` is injectable for tests.
 *
 * @param request the model id + resolved scope + write-back directive + user/provider
 * @param runner optional runner override (defaults to {@link BuildScoreRecordSetRunner})
 */
export function ScoreRecordSetViaRunner(
  request: ScoreRecordSetRequest,
  runner: IScoreRecordSetRunner = BuildScoreRecordSetRunner(),
): Promise<ScoreRecordSetResult> {
  return runner.run(request);
}

// ----- Experiment -------------------------------------------------------------

/**
 * Start (run) an experiment session. Always refuses with {@link ExperimentSessionsUnavailableError}
 * (no production pipeline resolver exists), before any Experiment, Session or Iteration row is
 * created. The signature is kept for the published callers.
 *
 * @param _plan the approved modeling plan to execute
 * @param _options run tunables (experiment id to attach to, budget override, session name)
 * @param _provider the owning provider
 * @param _user the acting user
 * @param _orchestrator optional orchestrator override
 */
export async function RunExperimentSessionViaOrchestrator(
  _plan: ModelingPlanSpec,
  _options: ExperimentRunOptions,
  _provider: IMetadataProvider,
  _user: UserInfo,
  _orchestrator?: ExperimentOrchestrator,
): Promise<ExperimentSessionResult> {
  throw new ExperimentSessionsUnavailableError();
}

// ----- Promotion --------------------------------------------------------------

/**
 * Transition a model's lifecycle status, delegating to the SAME production gate the
 * Promote action uses ({@link ProductionModelPromotionGate}). The `gate` is
 * injectable for tests.
 *
 * @param request the model id + target status + sign-off + user/provider
 * @param gate optional gate override (defaults to {@link ProductionModelPromotionGate})
 */
export function PromoteModelViaGate(
  request: PromoteModelRequest,
  gate: IModelPromotionGate = new ProductionModelPromotionGate(),
): Promise<PromoteModelOutcome> {
  return gate.promote(request);
}

/** Re-export the orchestrator budget type for the operations that map it. */
export type { Budget };
