/**
 * @module operations/delegation
 *
 * Shared **engine-delegation helpers** for the Predictive Studio Remote Operations.
 *
 * The seven Manual-mode Remote Operations and the five Predictive Studio Actions are
 * two thin invocation surfaces over the SAME engine service classes
 * (`TrainingEngine`, `ProductionScoreRecordSetRunner`, `LifecycleGate`; experiment
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

import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, PredictiveStudioModelTransition } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';

import { TrainingEngine } from '../training/training-engine';
import { MetadataEntityFactory, RunViewRecordLoader, MJSidecarTrainer } from '../training/seams';
import { StorageProviderArtifactStore } from '../training/storage-provider-artifact-store';
import { PredictiveStudioStorage } from '../storage/ps-storage-provider';
import type { ITrainerEvaluator, TrainModelInput, TrainModelResult, TrainingDeps } from '../training/types';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { StorageProviderSnapshotFileStore } from '../snapshot/snapshot-file-store';
import { RunViewTrainingSnapshotStore } from '../snapshot/training-snapshot-store';
import { RunViewEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { SnapshotRetrainer, type RetrainResult } from '../snapshot/snapshot-retrainer';

import { ExperimentOrchestrator } from '../experiment/experiment-orchestrator';
import type { ExperimentRunOptions, ExperimentSessionResult } from '../experiment/types';
import { ExperimentSessionsUnavailableError } from '../actions/run-experiment.deps';

import { ProductionScoreRecordSetRunner } from '../actions/score-record-set.runner';
import { RunViewMLModelLoader, MJSidecarPredictor } from '../scoring/seams';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { MLInferenceDeps } from '../scoring/types';
import type {
  IScoreRecordSetRunner,
  ScoreRecordSetRequest,
  ScoreRecordSetResult,
} from '../actions/score-record-set.action';

import { LifecycleGate, LifecycleModelNotFoundError } from '../registry/lifecycle-gate';
import type { GateApplyResult, GateContext, PublishRequest } from '../registry/gate-context';

import type {
  Actor,
  ModelingPlanSpec,
  Budget,
  ListsEveryMember,
  TransitionRefusal,
} from '@memberjunction/predictive-studio-core';

// ----- Training ---------------------------------------------------------------

/**
 * The training delegation every in-process caller uses: one production deps builder, one train-by-pipeline entry
 * point and one retrain-from-snapshot entry point, so the Train operation, the Train action, auto-train, the pipeline
 * builder and the rigs train (and retrain) the same way.
 */
export class TrainingDelegation {
  /**
   * Build the {@link TrainingEngine}'s production dependency bundle from a per-call
   * `provider` + `user`. Trained model files and Training Snapshot files go to the one storage provider
   * `PS_STORAGE_PROVIDER` names (default "Local File System"), each recorded as an `MJ: Files` row; the scoring side
   * reads a model file through the provider its row names ({@link StorageProviderArtifactLoader}). The snapshot store and
   * the artifact store share one {@link PredictiveStudioStorage}, and the engine has the artifact store resolve it before
   * anything of the run is written, so a provider not configured on this server refuses the run before training.
   *
   * The Record Changes history the as-of assembly replays is left to the engine's default: a complete-read
   * `RunViewRecordHistoryReader` over the same `dataAccess`. The locked holdout is always the one the bound protocol
   * declares (date-carved, seeded-random or rolling-origin). Snapshots are found by content hash through the same provider and user. A unit pipeline reads the Evaluation Protocol it is bound to through the
   * same provider and user and trains through the trainer (`MJSidecarTrainer` over the process-shared sidecar).
   *
   * @param provider the owning provider for data access / multi-provider correctness
   * @param user the acting user threaded through every entity op for isolation/audit
   */
  public static async BuildTrainingDeps(provider: IMetadataProvider, user: UserInfo): Promise<TrainingDeps> {
    const entityFactory = new MetadataEntityFactory(provider);
    // One storage resolution for the run's snapshot files and its model files: one provider, resolved once.
    const storage = new PredictiveStudioStorage(provider, user);
    return {
      entityFactory,
      recordLoader: new RunViewRecordLoader(),
      trainer: new MJSidecarTrainer(),
      artifactStore: new StorageProviderArtifactStore(entityFactory, storage),
      contextUser: user,
      provider,
      // The Prediction Unit seams read through the same provider and user as every other training read.
      predictionUnits: new RunViewPredictionUnitStore(provider, user),
      assemblyMetadata: new ProviderAssemblyMetadata(provider),
      dataAccess: new RunViewDataAccess(user, provider),
      snapshotFiles: new StorageProviderSnapshotFileStore(entityFactory, storage),
      snapshots: new RunViewTrainingSnapshotStore(provider, user),
      protocols: new RunViewEvaluationProtocolStore(provider, user),
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
  public static async TrainModelViaEngine(
    input: TrainModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
    engine: TrainingEngine = new TrainingEngine(),
  ): Promise<TrainModelResult> {
    return engine.trainModel(input, await TrainingDelegation.BuildTrainingDeps(provider, user));
  }

  /**
   * Retrain a completed unit run from its Training Snapshot with production deps, delegating to
   * {@link SnapshotRetrainer.Retrain}: the stored files are verified against the snapshot row, the logged request is
   * sent again and the holdout metrics are compared.
   *
   * A retraining reproduces only on the trainer the run was trained on, so a caller outside the server that trained it
   * passes that trainer as `trainer`. Without one, the production deps' trainer is used.
   *
   * @param trainingRunId the `MJ: ML Training Runs` row to retrain
   * @param provider the owning provider
   * @param user the acting user
   * @param trainer optional trainer to retrain on (defaults to the production deps' trainer)
   * @param retrainer optional retrainer override (defaults to a fresh {@link SnapshotRetrainer})
   */
  public static async RetrainFromSnapshotViaEngine(
    trainingRunId: string,
    provider: IMetadataProvider,
    user: UserInfo,
    trainer?: ITrainerEvaluator,
    retrainer: SnapshotRetrainer = new SnapshotRetrainer(),
  ): Promise<RetrainResult> {
    const deps = await TrainingDelegation.BuildTrainingDeps(provider, user);
    return retrainer.Retrain(trainingRunId, trainer ? { ...deps, trainer } : deps);
  }
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
 * {@link StorageProviderArtifactLoader} (reads the model bytes through the storage provider
 * their `MJ: Files` row names, the read-side inverse of `StorageProviderArtifactStore`; it takes
 * the provider per call, so the bundle needs none). Shared by {@link BuildScoreRecordSetRunner}
 * (the Score action / Remote Op path) AND the startup work-type registration so a model
 * trained one way is always scored the same way — one source of truth (CLAUDE.md DRY).
 */
export function BuildProductionMLInferenceDeps(): MLInferenceDeps {
  return { modelLoader: new RunViewMLModelLoader(), sidecar: new MJSidecarPredictor(), artifactLoader: new StorageProviderArtifactLoader() };
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
 * default runner is wired with the {@link StorageProviderArtifactLoader} so the artifact is
 * read through the storage provider its `MJ: Files` row names. The `runner` is injectable for tests.
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

// ----- Lifecycle transitions ---------------------------------------------------

/** Every transition `PredictiveStudio.PromoteModel` and the Promote ML Model action accept. */
const MODEL_TRANSITIONS = ['evaluate', 'publish', 'archive', 'rollback'] as const satisfies readonly PredictiveStudioModelTransition[];
/** Compile-time completeness: a transition added to the operation's input type without listing it here breaks the build. */
const modelTransitionsComplete: ListsEveryMember<PredictiveStudioModelTransition, (typeof MODEL_TRANSITIONS)[number]> = true;
void modelTransitionsComplete;

/** One lifecycle transition a caller asks for: the model, the transition, its reason and sign-off, and who asks. */
export interface ModelTransitionRequest {
  readonly ModelID: string;
  readonly Transition: PredictiveStudioModelTransition;
  /** Required for `archive` and `rollback`; recorded with a `publish`. */
  readonly Reason: string | null;
  /** The approving sign-off record a `publish` consumes, when one is required. */
  readonly SignOffID: string | null;
  /** Who started it: an interactive user is recorded as the approver; any other caller gets the automatic rules. */
  readonly Initiator: Actor;
}

/** What the gate did: applied, with the model's new status; or refused, with the model's status ('' when no model has the ID). */
export type ModelTransitionResult =
  | { readonly Applied: true; readonly Status: MJMLModelEntity['Status'] }
  | { readonly Applied: false; readonly Status: MJMLModelEntity['Status'] | ''; readonly Refusal: TransitionRefusal };

/**
 * The lifecycle-transition delegation the Promote operation and the Promote action share: one mapping of
 * `evaluate | publish | archive | rollback` onto {@link LifecycleGate} (`Evaluate`, `Publish` with purpose `publish` or
 * `rollback`, `Archive`), so both surfaces apply a transition the same way. The gate is injectable for tests.
 */
export class ModelTransitionDelegation {
  /** The transition `raw` names, or null when it names none (case-sensitive: the wire contract is lower case). */
  public static ParseTransition(raw: string | null | undefined): PredictiveStudioModelTransition | null {
    return MODEL_TRANSITIONS.find((t) => t === raw) || null;
  }

  /** The transitions, for messages that list them. */
  public static readonly Transitions: readonly PredictiveStudioModelTransition[] = MODEL_TRANSITIONS;

  /**
   * Apply `request` through the gate on `ctx` (the caller's provider and user, M3's seams).
   *
   * @param gate the lifecycle gate (defaults to the production {@link LifecycleGate})
   */
  public static async Apply(request: ModelTransitionRequest, ctx: GateContext, gate: LifecycleGate = new LifecycleGate()): Promise<ModelTransitionResult> {
    switch (request.Transition) {
      case 'evaluate':
        return ModelTransitionDelegation.evaluate(request, ctx, gate);
      case 'publish':
      case 'rollback':
        return ModelTransitionDelegation.publish(request, request.Transition, ctx, gate);
      case 'archive':
        return ModelTransitionDelegation.archive(request, ctx, gate);
      default: {
        const unknown: never = request.Transition;
        throw new Error(`Unknown lifecycle transition '${String(unknown)}'`);
      }
    }
  }

  private static async evaluate(request: ModelTransitionRequest, ctx: GateContext, gate: LifecycleGate): Promise<ModelTransitionResult> {
    const outcome = await gate.Evaluate({ modelId: request.ModelID }, request.Initiator, ctx);
    if (outcome.Kind === 'evaluated') return { Applied: true, Status: outcome.To };
    return ModelTransitionDelegation.refused(request.ModelID, outcome.Refusal, ctx);
  }

  private static async publish(request: ModelTransitionRequest, purpose: PublishRequest['purpose'], ctx: GateContext, gate: LifecycleGate): Promise<ModelTransitionResult> {
    const publish: PublishRequest = { modelId: request.ModelID, purpose, initiator: request.Initiator, signOffId: request.SignOffID, reason: request.Reason };
    try {
      const outcome = await gate.Publish(publish, ctx);
      if (outcome.Kind === 'withheld') return { Applied: false, Status: outcome.Status, Refusal: outcome.Refusal };
      return { Applied: true, Status: 'Published' };
    } catch (error) {
      if (error instanceof LifecycleModelNotFoundError) return { Applied: false, Status: '', Refusal: error.Refusal };
      throw error;
    }
  }

  private static async archive(request: ModelTransitionRequest, ctx: GateContext, gate: LifecycleGate): Promise<ModelTransitionResult> {
    const result = await gate.Archive(request.ModelID, request.Reason || '', request.Initiator, ctx);
    if (result.Ok === true) return { Applied: true, Status: result.To };
    return ModelTransitionDelegation.refused(request.ModelID, ModelTransitionDelegation.refusalOf(result), ctx);
  }

  /** An archive's refusal as a `TransitionRefusal` (an unverified artifact load is `artifact-unverifiable`). */
  private static refusalOf(result: Extract<GateApplyResult, { readonly Ok: false }>): TransitionRefusal {
    const refusal = result.Refusal;
    return 'kind' in refusal ? refusal : { kind: 'artifact-unverifiable', detail: `the artifact load was ${refusal.Load.Status}` };
  }

  /** A refusal with the model's current status, read once ('' when no model has the ID). */
  private static async refused(modelId: string, refusal: TransitionRefusal, ctx: GateContext): Promise<ModelTransitionResult> {
    return { Applied: false, Status: await ModelTransitionDelegation.currentStatus(modelId, ctx), Refusal: refusal };
  }

  /** The model's persisted status, or '' when the ID is not a UUID or names no model. */
  private static async currentStatus(modelId: string, ctx: GateContext): Promise<MJMLModelEntity['Status'] | ''> {
    if (!IsValidUUID(modelId)) return '';
    const r = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJMLModelEntity, 'ID' | 'Status'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'Status'], MaxRows: 1, ResultType: 'simple', BypassCache: true },
      ctx.ContextUser,
    );
    if (!r.Success) throw new Error(`Reading the status of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    return row !== undefined && UUIDsEqual(row.ID, modelId) ? row.Status : '';
  }
}

/** Re-export the orchestrator budget type for the operations that map it. */
export type { Budget };
