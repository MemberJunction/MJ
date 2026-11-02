/**
 * @module training/training-engine
 *
 * The **TrainingEngine** — Predictive Studio's training orchestrator. Every pipeline trains under the Prediction
 * Unit and the Evaluation Protocol version it is bound to, and the run produces an **immutable, versioned
 * `MJ: ML Models`** row (when the gate ships an artifact) plus the `MJ: ML Training Runs` row that recorded the attempt.
 * A pipeline without a Prediction Unit is refused before any run row is written (`unit-required`): the "Migrate
 * Pipelines to Prediction Units and Evaluation Protocols" Action binds one, or holds the pipeline with the reason.
 *
 * A pipeline is trained only under the Evaluation Protocol version its `EvaluationProtocolID` names: a pipeline without one, a missing
 * protocol row, a row that does not parse, or more candidates than the protocol's budget allows are
 * refused before any run row is written, and so is a pipeline that declares a time index
 * (`ValidationStrategy.TimeIndexColumn`) under a protocol whose holdout does not respect time (seeded-random:
 * `time-index-needs-time-holdout`), and so is a pipeline whose stored AsOfStrategy the unit overrides (`input-not-accepted`); deps without a snapshot
 * file store or a trainer fail there too. Only then does an advancing fixed decision date move to the run's day (a new
 * unit version). The protocol row must predate the run row, and a protocol
 * that does not fit the unit is refused on the run. The unit row reader then reads every unit row
 * (censored and label-known rows excluded and counted), the target is validated, and the matrix is
 * assembled as of each row's decision date by {@link TrainingEngine.AssembleForTraining} — the same
 * `AsOfFeatureAssembler` the scoring path calls. The assembled rows are frozen into an immutable
 * Training Snapshot (the locked holdout is the one the protocol declares: a date carve on its cutoff, with
 * rows on or after its `holdoutEnd` left out of the snapshot; a seeded row-hash carve; or a forecast's
 * rolling-origin test periods; identical content reuses the existing snapshot; the protocol decides the
 * incumbent-score and slice columns). The protocol trainer (`TrainingDeps.trainer`) is sent pre-authorised downloads of the
 * snapshot files, its result is recorded on the run (compute, code version), and the gate is decided
 * in TypeScript ({@link GateRecords.BuildStoredGateRecord}): a sidecar decision that differs from the transcription
 * refuses the run (`sidecar-gate-mismatch`). Every returned artifact is stored in `MJ: Files`, and the model row is
 * created from the artifact the decision ships only: the finalist's for `model` (with the trainer's held-out
 * permutation importance), the kept simple baseline member's for `keep-simple-baseline`, and none for `no-signal` or
 * a kept heuristic rule. A single feature dominating the finalist's importance flags the run (a LEAKAGE WARNING note on the
 * run) and the model stays `Draft`. The run stores the trainer's result with its artifacts
 * as file references, never their bytes, the unit resolution counts, the holdout carve's summary, the gate record and
 * the request settings a retrain replays; the model Lineage names the unit version, the typed feature columns, the kept
 * categorical levels scoring reuses, the snapshot's ID and content hash, and the protocol. A refusal
 * is recorded on the run as a `refused` envelope ({@link TrainingRefusedError}); a failed trainer
 * result is a `trainer` refusal.
 *
 * Every external dependency is injected (see {@link TrainingDeps}) so the engine
 * is unit-testable with no live database and no live sidecar.
 */

import { LogError, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type FeatureImportance,
  type SourceBinding,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
  type FeatureStepGraph,
  type OutcomeConfig,
  resolveOutcomeConfig,
  EvaluationLineage,
  type EvaluationRecord,
  LABEL_COLUMN,
  PredictionUnit,
  TaskTypeRules,
  UtcDay,
  TRAINING_RUN_RESULTS_SCHEMA,
  type PredictionUnitSpec,
  type TrainingRunResults,
  type UnitResolutionCounts,
  type UncoveredRowsCount,
  type FeatureColumnSpec,
  type CandidateSpec,
  TrainerContract,
  PREDICTOR_ARTIFACT_FORMAT,
  type EvaluationProtocolSpec,
  type TrainerCompleted,
  type TrainerResult,
  type HoldoutCarveSummary,
  InnerScoreSelection,
  GateRecords,
  GateRules,
  type BaselineResult,
  type BaselineSpec,
  type GateDecision,
  type StoredGateRecord,
  type TaskKind,
  type TaskType,
  type TrainerRequest,
  type ProtocolExclusions,
} from '@memberjunction/predictive-studio-core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';

import { detectSingleFeatureDominance, type DominanceResult } from '../feature-assembly';
import { RunViewDataAccess, type ICountingDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata, type IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { AsOfFeatureAssembler, type AsOfAssembledMatrix, type AsOfAssemblyResult } from '../feature-assembly/as-of/as-of-assembler';
import { FeatureResolver } from '../feature-assembly/as-of/feature-resolution';
import { RunViewRecordHistoryReader } from '../feature-assembly/as-of/record-history';
import { SeriesFeatures, type SeriesHistory, type SeriesPoint } from '../feature-assembly/as-of/series-features';
import { PredictionUnitRowReader, type UnitRow, type UnitRowReadResult } from '../prediction-unit/unit-row-reader';
import { UnitTargetValidator } from '../prediction-unit/target-validation';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { DecisionDateAdvance } from '../prediction-unit/decision-date-advance';
import { TrainingRefusedError } from './training-refusal';
import { HoldoutCarvers } from '../snapshot/holdout-carver';
import { TrainingSnapshotBuilder, type BuiltSnapshot } from '../snapshot/snapshot-builder';
import type { ISnapshotFileStore } from '../snapshot/snapshot-file-store';
import { RunViewTrainingSnapshotStore } from '../snapshot/training-snapshot-store';
import { SnapshotHash } from '../snapshot/snapshot-hash';
import { LockedHoldoutSplitter, type LockedHoldoutSplit } from './locked-holdout';
import { TrainerRequestBuilder } from './trainer-request';
import { TrainerRunRecorder, TrainerLineageRefusedError } from './trainer-result';
import { EvaluationProtocolSpecs, RunViewEvaluationProtocolStore, type LoadedProtocol } from './evaluation-protocol-store';
import { ProtocolSearchGuard } from '../protocol/search-guard';
import { ComputePricing } from './compute-cost';
import type { ITrainerEvaluator, TrainModelInput, TrainModelResult, TrainingDeps, ModelTrainingLineage, TrainerModelLineage } from './types';
import type { UnitModelLineage } from './unit-model-lineage';

/** Parsed JSON config columns pulled off a `MJ: ML Training Pipelines` row. */
export interface ResolvedPipeline {
  pipeline: MJMLTrainingPipelineEntity;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  targetEntityName: string;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  targetVariable: string;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  problemType: ProblemType;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  algorithmDriverKey: string;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  hyperparameters: Record<string, unknown>;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  sourceBindings: SourceBinding[];  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  featureSteps: FeatureStepGraph;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  asOf: AsOfStrategy;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  leakageGuard: LeakageGuard;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  validation: ValidationStrategy;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
  outcomeConfig: OutcomeConfig;  // case-violation-ok-legacy-back-compat: matches the existing interface member casing
}

/** The unit rows a complete read returned. */
export type UnitRowsRead = Extract<UnitRowReadResult, { Status: 'read' }>;

/** What a unit training run already holds when it asks for the matrix, so the assembly does not read it twice. */
export interface UnitAssemblyInputs {
  readonly Resolved: ResolvedPipeline;
  readonly Unit: PredictionUnitSpec;
  readonly UnitRead: UnitRowsRead;
  readonly DataAccess: ICountingDataAccess;
  readonly Metadata: IAssemblyMetadata;
  /**
   * The bound protocol's slice fields. Each must be a column the assembly will write (a feature column, or one of a
   * date column's parts) or a field of every unit row; one that is neither is refused (`unresolved-column`) before the
   * as-of assembly reads anything.
   */
  readonly SliceFields?: readonly string[];
  /**
   * The bound protocol's exclusions (a guard field): the fields and sources that never enter the matrix, together with
   * the pipeline's own `LeakageGuard` deny lists. Null when the pipeline is bound to no protocol (such a pipeline
   * never trains; only its standalone assembly runs).
   */
  readonly ProtocolExclusions: ProtocolExclusions | null;
}

/**
 * A unit pipeline's matrix as training assembles it: the unit, its rows, the typed feature columns (empty when feature
 * resolution refused) and the assembled matrix or the first refusal.
 */
export interface UnitTrainingAssembly {
  readonly Unit: PredictionUnitSpec;
  readonly UnitRead: UnitRowsRead;
  readonly Features: readonly FeatureColumnSpec[];
  readonly Assembled: AsOfAssemblyResult;
}

/** The read seams of the unit path: the request's metadata and counting data access. */
interface UnitSeams { readonly Metadata: IAssemblyMetadata; readonly DataAccess: ICountingDataAccess }

/** How a unit pipeline is trained: the protocol version it is bound to and the trainer it runs on. */
interface ProtocolTraining {
  readonly Protocol: LoadedProtocol;
  readonly Trainer: ITrainerEvaluator;
}

/** What a unit run hands the trainer step once its snapshot is frozen. */
interface TrainerRunInputs {
  readonly Run: MJMLTrainingRunEntity;
  /** The pipeline resolved for the unit (its target entity is the unit's row entity). */
  readonly Resolved: ResolvedPipeline;
  readonly Input: TrainModelInput;
  readonly Unit: PredictionUnitSpec;
  readonly Snapshot: BuiltSnapshot;
  /** The protocol's holdout carve over the snapshot's rows, stored with the run's results. */
  readonly Carve: HoldoutCarveSummary;
  readonly Files: ISnapshotFileStore;
  readonly Training: ProtocolTraining;
  readonly UnitLineage: UnitModelLineage;
  readonly Counts: UnitResolutionCounts;
  readonly Uncovered: readonly UncoveredRowsCount[];
  readonly MajorityBaselineRule: ReturnType<typeof EvaluationLineage.ParseMajorityBaselineRule>;
  readonly UsdPerSecond: number | null;
  readonly Deps: TrainingDeps;
}

/** A frozen Training Snapshot and the holdout carve its manifest roles came from. */
interface FrozenSnapshot {
  readonly Snapshot: BuiltSnapshot;
  readonly Carve: HoldoutCarveSummary;
}

/** What a completed trainer result decides about its run and model (computed once per run). */
interface TrainerOutcome {
  readonly Result: TrainerCompleted;
  /** The candidate the trainer chose; null when its finalist is a baseline. */
  readonly Finalist: CandidateSpec | null;
  /** The held-out permutation importance as the stored share map. */
  readonly Importance: FeatureImportance;
  readonly Evaluation: EvaluationRecord;
  /** The single-feature-dominance check of `Importance` against the pipeline's leakage guard. */
  readonly Dominance: DominanceResult;
}

/** The artifact the gate decision ships: the finalist, or a simple baseline member the trainer fitted. */
interface ShippedArtifact {
  /** The artifact's candidate name: the finalist's, or the member's (`glm`, `oneFeature`, `naive`, `seasonalNaive`). */
  readonly Name: string;
  /** The baseline member that ships; null when the finalist ships. */
  readonly Member: BaselineResult | null;
}

/**
 * Training orchestrator. Stateless across calls; construct once and reuse. All
 * dependencies are supplied per call via {@link TrainingDeps}.
 */
export class TrainingEngine {
  private readonly unitReader = new PredictionUnitRowReader();

  /**
   * Train a model end-to-end from a pipeline definition.
   *
   * @param input the pipeline id + optional session-iteration inputs
   * @param deps the injected dependency bundle (entity factory, loader, trainer, stores)
   * @returns the produced `Draft` model (null when the gate ships nothing) and the training run
   * @throws TrainingRefusedError (`unit-required`) before any run row when the pipeline has no Prediction Unit
   */
  public async trainModel(input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {  // case-violation-ok-legacy-back-compat: a subclass overrides this; a stub preserves CALLING the old name but not OVERRIDING it
    // The compute rate is read before anything is written or trained, so a misconfigured rate fails fast.
    const usdPerSecond = ComputePricing.ReadComputeRate();
    const resolved = await this.resolvePipeline(input.pipelineId, deps);
    if (!resolved.pipeline.PredictionUnitID) throw TrainingEngine.UnitRequired(resolved.pipeline.ID);
    return this.trainUnitPipeline(resolved, resolved.pipeline.PredictionUnitID, input, deps, usdPerSecond);
  }

  /**
   * Moves an advancing fixed decision date to the run's UTC day after every pipeline-stage refusal and deps check
   * (protocol, budget, time index, a stored AsOfStrategy override, snapshot file store, trainer) and before the run row (a new unit
   * version, the pipeline bound to it), so the run reads features as they stand on its own day, its lineage names that
   * version, and a refused pipeline never mints a version. Returns the unit to train under.
   */
  private async advanceDecisionDate(pipeline: MJMLTrainingPipelineEntity, deps: TrainingDeps): Promise<string | null> {
    return DecisionDateAdvance.AdvanceFixedDecisionDate(pipeline, {
      Store: deps.predictionUnits || new RunViewPredictionUnitStore(this.requireProvider(deps), deps.contextUser),
      RunDay: UtcDay.UtcDayIso(deps.now?.() || new Date()),
      Metadata: deps.assemblyMetadata || new ProviderAssemblyMetadata(this.requireProvider(deps)),
      EntityFactory: deps.entityFactory,
      ContextUser: deps.contextUser,
    });
  }

  /**
   * The refusal of a pipeline without a Prediction Unit, raised before any run row is written; the reason names how to
   * bind one (a held pipeline's Description names what to declare).
   */
  public static UnitRequired(pipelineId: string): TrainingRefusedError {
    return new TrainingRefusedError({
      stage: 'pipeline',
      reason: { kind: 'unit-required', pipelineId, why: 'this pipeline has no Prediction Unit; run the "Migrate Pipelines to Prediction Units and Evaluation Protocols" Action or bind a unit (a held pipeline names what to declare in its Description)' },
    });
  }

  /** Record a run that ended in an error: a refusal as the `refused` envelope, any other error as a failure. */
  private async recordRunError(run: MJMLTrainingRunEntity, err: unknown, deps: TrainingDeps): Promise<void> {
    if (err instanceof TrainingRefusedError) {
      await this.finalizeRunRefused(run, err);
    } else {
      await this.finalizeRunFailure(run, err, deps);
    }
  }

  // region: Prediction Unit pipelines -------------------------------------------

  /**
   * Train a pipeline that points at a Prediction Unit. The bound Evaluation Protocol version is resolved first: a
   * missing protocol, more candidates than its budget allows, or a pipeline that declares a time index under a holdout
   * that does not respect time (`time-index-needs-time-holdout`) is refused before any run row is written. The unit
   * decides the rows, their decision dates and their labels: a pipeline whose stored AsOfStrategy would override them
   * is refused (the Train surfaces refuse a row cap and label-event dates by name before training), and deps without a snapshot file store or a trainer
   * fail (a wiring error), both before anything is written. Only then does an advancing fixed decision date move to the
   * run's day (a new unit version), and the run row is written. Censored and label-known rows are excluded and
   * counted, and a protocol that does not fit the unit or a target that cannot train a model is refused before anything
   * is assembled. The matrix is assembled as of each decision date ({@link AssembleForTraining}), frozen into a
   * Training Snapshot the run references, and trained through the protocol trainer. A refusal after the run row exists
   * is recorded on it as a `refused` envelope.
   */
  private async trainUnitPipeline(resolved: ResolvedPipeline, boundUnitId: string, input: TrainModelInput, deps: TrainingDeps, usdPerSecond: number | null): Promise<TrainModelResult> {
    const majorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(resolved.validation.MajorityBaselineRule);
    const { Training: training, SnapshotFiles: snapshotFiles } = await this.requireUnitRunPrerequisites(resolved, input, deps);
    const protocol = training.Protocol;
    // Every pipeline-stage refusal and deps check writes nothing; only a pipeline that passes them all advances its
    // decision date (a new unit version), and the run row follows.
    // `||`: no advance (null) keeps the unit the pipeline is bound to.
    const unitId = (await this.advanceDecisionDate(resolved.pipeline, deps)) || boundUnitId;
    const run = await this.createRunRow(resolved, input, deps);
    try {
      TrainingEngine.refuseProtocolNewerThanRun(protocol, run);
      const unit = await this.loadUnitSpec(unitId, deps);
      // A protocol that does not fit the unit is refused before any row is read or assembled.
      const mismatch = ProtocolSearchGuard.CheckProtocolForUnit(protocol, unit);
      if (mismatch !== null) throw new TrainingRefusedError({ stage: 'pipeline', reason: mismatch });
      const seams = this.unitSeams(deps);
      const unitRead = await this.readUnitRows(unit, seams, deps);
      const validation = UnitTargetValidator.ValidateUnitTargets(unitRead.Rows, unit.label.outcome, unitRead.Counts);
      if (validation.status === 'refused') throw new TrainingRefusedError({ stage: 'unit', reason: validation.reason });

      const assembly = await this.AssembleForTraining(resolved.pipeline.ID, deps, {
        Resolved: resolved, Unit: unit, UnitRead: unitRead, DataAccess: seams.DataAccess, Metadata: seams.Metadata, SliceFields: protocol.Protocol.slices.subgroups,
        ProtocolExclusions: protocol.Protocol.exclusions,
      });
      if (assembly.Assembled.Status === 'refused') throw new TrainingRefusedError({ stage: 'assembly', reason: assembly.Assembled.Refusal });
      const { Snapshot: snapshot, Carve: carve } = await this.freezeSnapshot(resolved, assembly, assembly.Assembled, snapshotFiles, protocol, deps);
      run.TrainingSnapshotID = snapshot.Entity.ID;
      const unitResolved: ResolvedPipeline = { ...resolved, targetEntityName: unitRead.RowEntity.Name, targetVariable: LABEL_COLUMN, problemType: TaskTypeRules.LegacyProblemTypeForTask(unit.label.outcome) };
      const model = await this.trainThroughTrainer({
        Run: run, Resolved: unitResolved, Input: input, Unit: unit, Snapshot: snapshot, Carve: carve, Files: snapshotFiles, Training: training,
        UnitLineage: this.unitLineage(unit, resolved, unitRead, assembly.Features, assembly.Assembled.CategoryLevels, snapshot.Entity),
        Counts: unitRead.Counts, Uncovered: assembly.Assembled.UncoveredRowsExcluded, MajorityBaselineRule: majorityBaselineRule, UsdPerSecond: usdPerSecond, Deps: deps,
      });
      return { model, run };
    } catch (err) {
      await this.recordRunError(run, err, deps);
      throw err;
    }
  }

  /**
   * The checks a unit pipeline passes before anything is written: the bound protocol (missing, or over its budget), a
   * time-indexed pipeline under a holdout that does not respect time (`time-index-needs-time-holdout`), a stored
   * AsOfStrategy that would override the unit, and deps without a snapshot file store or a trainer. Each throws.
   */
  private async requireUnitRunPrerequisites(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<{ Training: ProtocolTraining; SnapshotFiles: ISnapshotFileStore }> {
    const protocol = await this.requireBoundProtocol(resolved, input, deps);
    const timeIndex = ProtocolSearchGuard.CheckTimeIndexHoldout(protocol, resolved.pipeline.ID, resolved.validation.TimeIndexColumn);
    if (timeIndex !== null) throw new TrainingRefusedError({ stage: 'pipeline', reason: timeIndex });
    TrainingEngine.refuseUnitOverrides(resolved);
    const snapshotFiles = TrainingEngine.requireSnapshotFiles(deps);
    return { Training: { Protocol: protocol, Trainer: TrainingEngine.requireTrainer(deps) }, SnapshotFiles: snapshotFiles };
  }

  /**
   * The Evaluation Protocol version the pipeline is bound to, read through `deps.protocols` (default: RunView on the
   * request's provider). No binding, a missing row or more candidates than its budget allows is refused here, before
   * any run row exists, so a refused search leaves none.
   *
   * @throws TrainingRefusedError (`protocol-required`, `too-many-candidates`, `protocol-invalid`)
   */
  private async requireBoundProtocol(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<LoadedProtocol> {
    const store = deps.protocols || new RunViewEvaluationProtocolStore(this.requireProvider(deps), deps.contextUser);
    // `??`: an explicit empty candidate list counts as 0 candidates, as it is sent.
    const requirement = await ProtocolSearchGuard.RequireProtocolForSearch(store, resolved.pipeline, input.candidates?.length ?? 1);
    if (requirement.Ok === false) throw new TrainingRefusedError({ stage: 'pipeline', reason: requirement.Refusal });
    return requirement.Loaded;
  }

  /** A run is judged only under a protocol row that existed before it: both instants come from the database clock. */
  private static refuseProtocolNewerThanRun(protocol: LoadedProtocol, run: MJMLTrainingRunEntity): void {
    const runCreatedAt = run.__mj_CreatedAt;
    if (ProtocolSearchGuard.ProtocolPrecedesRun(protocol.CreatedAt, runCreatedAt)) return;
    throw new TrainingRefusedError({
      stage: 'pipeline',
      reason: { kind: 'protocol-created-after-run', protocolId: protocol.RowID, protocolCreatedAt: protocol.CreatedAt.toISOString(), runCreatedAt: runCreatedAt.toISOString() },
    });
  }

  /** The unit decides decision dates, so a pipeline whose stored AsOfStrategy asks for point-in-time assembly is refused. */
  private static refuseUnitOverrides(resolved: ResolvedPipeline): void {
    if (resolved.asOf.Mode !== 'none') throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf', why: 'decision dates come from the Prediction Unit' } });
  }

  /**
   * The deps' snapshot file store. A unit run trains only from a Training Snapshot, so deps without one are incomplete
   * (a wiring error, not a refusal of the pipeline) and training fails before anything is written, rather than training
   * from rows nothing recorded.
   */
  private static requireSnapshotFiles(deps: TrainingDeps): ISnapshotFileStore {
    if (!deps.snapshotFiles) {
      throw new Error('TrainingEngine: the training deps are incomplete: a Prediction Unit pipeline trains from a Training Snapshot, and no snapshot file store (snapshotFiles) was supplied');
    }
    return deps.snapshotFiles;
  }

  /**
   * The deps' trainer. Every unit run trains only through it, so deps without one are incomplete (a wiring error) and
   * training fails before anything is written.
   */
  private static requireTrainer(deps: TrainingDeps): ITrainerEvaluator {
    if (!deps.trainer) {
      throw new Error('TrainingEngine: the training deps are incomplete: a Prediction Unit pipeline trains through the trainer, and no trainer (trainer) was supplied');
    }
    return deps.trainer;
  }

  /**
   * Freeze the assembled rows into a Training Snapshot: each row gets its manifest role from the carver the bound
   * protocol declares ({@link HoldoutCarvers.CarverForProtocol}); rows the carve
   * leaves out (a date carve's rows on or after `holdoutEnd`) are not in the snapshot. Identical content reuses the
   * snapshot that already holds it. The bound protocol decides the evaluation columns: the incumbent-score column when
   * it declares an incumbent-heuristic baseline and the unit has a rule to score it, and one slice column per subgroup
   * field it declares. Returns the snapshot and the carve's summary.
   *
   * @throws TrainingRefusedError (`carve` stage) when the protocol's holdout cannot be carved from the rows
   */
  private async freezeSnapshot(
    resolved: ResolvedPipeline, assembly: UnitTrainingAssembly, assembled: AsOfAssembledMatrix, files: ISnapshotFileStore,
    loaded: LoadedProtocol, deps: TrainingDeps,
  ): Promise<FrozenSnapshot> {
    const protocol = loaded.Protocol;
    const carve = HoldoutCarvers.CarverForProtocol(protocol, assembly.Unit).AssignRoles(assembled.Rows, new Map(assembly.UnitRead.Rows.map((r) => [r.RowID, r])));
    const snapshots = deps.snapshots || new RunViewTrainingSnapshotStore(this.requireProvider(deps), deps.contextUser);
    const snapshot = await new TrainingSnapshotBuilder().Build({
      PipelineID: resolved.pipeline.ID,
      FeatureSpecVersion: resolved.pipeline.Version,
      Unit: assembly.Unit,
      UnitRead: assembly.UnitRead,
      Features: assembly.Features,
      Assembled: assembled,
      Roles: carve.Roles,
      EvaluationProtocolID: loaded.RowID,
      IncumbentScore: assembly.Unit.incumbent.kind === 'rule' && protocol.baselines.some((b) => b.kind === 'incumbent-heuristic'),
      SliceFields: protocol.slices.subgroups,
      Files: files,
      EntityFactory: deps.entityFactory,
      ContextUser: deps.contextUser,
      ExistingByContentHash: (contentHash) => snapshots.FindByContentHash(contentHash),
    });
    return { Snapshot: snapshot, Carve: carve.Summary };
  }

  /**
   * Train a unit run through the trainer: build the request over the frozen snapshot (the search's candidates, or the
   * pipeline's own algorithm as the single candidate; the timeout is the protocol's compute budget, or less when an
   * enclosing budget has less left), record the result on the run (compute, code version, status), decide the gate
   * and refuse a sidecar decision that differs from it, store every returned artifact in `MJ: Files`, create the model
   * row from the artifact the decision ships (none for `no-signal` or a kept heuristic rule) and complete the run with
   * the stored result (artifacts as file references, never bytes), the holdout carve's summary, the gate record, the
   * request settings a retrain replays and the leakage note of the single-feature-dominance check over the trainer's
   * importance. A failed result is the refusal `trainer-failed` and a result whose code version cannot be recorded is
   * `lineage-incomplete`; both keep the compute they recorded. The gate stage's refusals are stored before any artifact.
   *
   * @returns the model row, or null when the decision ships no artifact
   */
  private async trainThroughTrainer(x: TrainerRunInputs): Promise<MJMLModelEntity | null> {
    const { Run: run, Resolved: resolved, Snapshot: snapshot, Training: training, Deps: deps } = x;
    const candidates = x.Input.candidates || [TrainerRequestBuilder.CandidateFromPipeline(resolved.algorithmDriverKey, resolved.pipeline.AlgorithmID, resolved.algorithmDriverKey, resolved.pipeline.Hyperparameters)];
    const request = await TrainerRequestBuilder.BuildTrainerRequest({
      TrainingRunID: run.ID, Snapshot: snapshot.Entity, Files: x.Files, Protocol: training.Protocol.Protocol, Task: x.Unit.label.outcome,
      Candidates: candidates, TimeoutSeconds: TrainingEngine.TimeoutSecondsFor(training.Protocol.Protocol, x.Input),
    });
    const result = TrainingEngine.recordTrainerResult(run, await training.Trainer.RunTrainer(request), x.UsdPerSecond);
    TrainingEngine.checkAnswerBelongsToRun(run, snapshot, result);
    TrainingEngine.checkSelection(result);
    const gate = TrainingEngine.buildGateRecord(x, result);
    const shipped = TrainingEngine.shippedArtifact(gate.decision, result);
    const fileIds = await this.storeTrainerArtifacts(run, result, deps);
    const outcome = this.trainerOutcome(x, result, candidates);
    const model = shipped === null ? null : await this.createTrainerModelRow(x, outcome, shipped, TrainingEngine.storedFileOf(fileIds, shipped.Name));
    await this.completeTrainerRun(x, request, outcome, gate, fileIds, model);
    return model;
  }

  /**
   * Complete a trainer run: the envelope (the stored result with artifacts as file references, the carve, the gate
   * record and the request settings), the resulting model (null when nothing ships), the features, the hyperparameters
   * (the finalist's, except `{}` when a baseline member is kept: a member has none of its own) and the notes: the
   * trainer's, the gate's reason (saying no model was created when nothing ships) and the leakage note every run carries.
   */
  private async completeTrainerRun(
    x: TrainerRunInputs, request: TrainerRequest, outcome: TrainerOutcome, gate: StoredGateRecord, fileIds: ReadonlyMap<string, string>, model: MJMLModelEntity | null,
  ): Promise<void> {
    const run = x.Run;
    const results: TrainingRunResults = {
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: x.Counts,
      trainer: TrainerContract.ToStoredTrainerResult(outcome.Result, fileIds), trainerRequest: TrainerRequestBuilder.TrainerRequestConfigOf(request),
      carve: x.Carve, gate,
    };
    run.ResultingModelID = model === null ? null : model.ID;
    run.FeaturesUsed = JSON.stringify(x.Snapshot.Content.Header.featureSchema.map((f) => f.Name));
    run.Hyperparameters = JSON.stringify(gate.decision.outcome !== 'keep-simple-baseline' && outcome.Finalist ? outcome.Finalist.hyperparameters : {});
    run.ValidationResults = JSON.stringify(results);
    // The trainer's note, the gate's reason, then the same leakage note every run carries (a dominant feature is a LEAKAGE WARNING).
    const gateNote = model === null ? `No model was created: ${gate.reason.text}` : gate.reason.text;
    const notes = `${run.Notes || ''} ${gateNote} ${this.buildRunNotes(outcome.Dominance, outcome.Evaluation, model !== null)}`.trim();
    run.Notes = TrainingEngine.withUncoveredNote(notes, x.Uncovered);
    await this.saveOrThrow(run, 'finalize ML Training Run');
  }

  /**
   * The run's gate record: the decision TypeScript derives from the trainer's paired intervals under the bound protocol,
   * with its guards. Refused at the `gate` stage when a comparison the gate needs is missing or the sidecar decided
   * differently (`sidecar-gate-mismatch`); runs before anything is stored.
   */
  private static buildGateRecord(x: TrainerRunInputs, result: TrainerCompleted): StoredGateRecord {
    const built = GateRecords.BuildStoredGateRecord({ Result: result, Protocol: x.Training.Protocol.Protocol, Task: x.Unit.label.outcome, Carve: x.Carve });
    if (built.Ok === false) throw new TrainingRefusedError({ stage: 'gate', reason: built.Refusal });
    return built.Record;
  }

  /**
   * The artifact the decision ships: the finalist for `model`, the kept simple baseline member for
   * `keep-simple-baseline`, and nothing for `no-signal` or a kept heuristic rule (a rule, not an artifact: the decision
   * is stored and delivery publishes the rule). Runs before anything is stored.
   *
   * @throws Error when the kept member is not a simple baseline of the result, or the trainer returned no artifact for what ships
   */
  private static shippedArtifact(decision: GateDecision, result: TrainerCompleted): ShippedArtifact | null {
    if (decision.outcome === 'no-signal') return null;
    const member = decision.outcome === 'model' ? null : TrainingEngine.keptMember(decision.shipped, result);
    if (member !== null && member.baseline.kind === 'incumbent-heuristic') return null;
    if (!result.artifacts.some((a) => a.candidate === decision.shipped)) {
      throw new Error(`TrainingEngine: the trainer returned no artifact for the shipped '${decision.shipped}' (returned: ${result.artifacts.map((a) => a.candidate).join(', ') || 'none'})`);
    }
    return { Name: decision.shipped, Member: member };
  }

  /** The simple baseline whose member name the decision kept. */
  private static keptMember(name: string, result: TrainerCompleted): BaselineResult {
    const member = result.baselines.find((b) => b.role === 'simple' && GateRules.BaselineMemberName(b.baseline) === name);
    if (member === undefined) throw new Error(`TrainingEngine: the gate kept '${name}', which is not a simple baseline of the trainer's result`);
    return member;
  }

  /** The stored file of the shipped artifact (checked to be among the returned artifacts before they were stored). */
  private static storedFileOf(fileIds: ReadonlyMap<string, string>, name: string): string {
    const fileId = fileIds.get(name);
    if (fileId === undefined) throw new Error(`TrainingEngine: no stored file for the shipped artifact '${name}'`);
    return fileId;
  }

  /**
   * What a completed trainer result decides about the run and its model, computed once: the finalist candidate, the
   * held-out permutation importance as the stored share map, the evaluation record, and the single-feature-dominance
   * check of that map against the pipeline's leakage guard (the check every run records).
   */
  private trainerOutcome(x: TrainerRunInputs, result: TrainerCompleted, candidates: readonly CandidateSpec[]): TrainerOutcome {
    const importance = TrainerContract.FeatureImportanceOf(result.importance);
    return {
      Result: result,
      Finalist: TrainingEngine.finalistCandidate(candidates, result.finalist),
      Importance: importance,
      Evaluation: EvaluationLineage.Build(x.Resolved.validation, { ValidationOutOfSample: true, ImportanceKind: TrainerContract.ImportanceKindOf(result.importance), MajorityBaselineRule: x.MajorityBaselineRule }),
      Dominance: this.checkLeakage(importance, x.Resolved.leakageGuard),
    };
  }

  /**
   * Why a completed training run shipped no model: the reason of its stored gate decision (`no-signal`, or the unit's
   * existing rule kept), or the run's notes when it stored no gate record.
   */
  public static NoModelReason(result: TrainModelResult): string {
    const gate = GateRecords.ParseStoredGateRecord(result.run.ValidationResults);
    return gate === null ? result.run.Notes || `training run ${result.run.ID} stored no gate decision` : gate.reason.text;
  }

  /**
   * The trainer's timeout: the protocol's compute budget, or the seconds an enclosing budget has left when that is less.
   * `??`: 0 seconds left in an enclosing budget is a real value, and only an absent one leaves the protocol's budget.
   */
  public static TimeoutSecondsFor(protocol: Pick<EvaluationProtocolSpec, 'budgets'>, input: Pick<TrainModelInput, 'timeoutSeconds'>): number {
    return Math.min(protocol.budgets.maxComputeSeconds, input.timeoutSeconds ?? Number.POSITIVE_INFINITY);
  }

  /** The candidate the trainer chose, or null when its finalist is not one of the request's candidates (a baseline). */
  private static finalistCandidate(candidates: readonly CandidateSpec[], finalist: string): CandidateSpec | null {
    return candidates.find((c) => c.name === finalist) || null;
  }

  /**
   * Record the trainer's result on the run and return it when it completed. A failed result is refused as
   * `trainer-failed` and a completed one with lineage gaps as `lineage-incomplete`, each after its compute is recorded.
   */
  private static recordTrainerResult(run: MJMLTrainingRunEntity, result: TrainerResult, usdPerSecond: number | null): TrainerCompleted {
    try {
      TrainerRunRecorder.ApplyTrainerResultToRun(run, result, usdPerSecond);
    } catch (err) {
      if (err instanceof TrainerLineageRefusedError) throw new TrainingRefusedError({ stage: 'trainer', reason: { kind: 'lineage-incomplete', gaps: err.Gaps } });
      throw err;
    }
    if (result.status === 'failed') {
      throw new TrainingRefusedError({ stage: 'trainer', reason: { kind: 'trainer-failed', stage: result.stage, message: result.message, computeSeconds: result.computeSeconds } });
    }
    return result;
  }

  /**
   * Refuse to store an answer that does not belong to this run: it names another training run (IDs compared as UUIDs),
   * an artifact's bytes do not hash to the SHA-256 it states (that hash is what later checks of the artifact trust), or
   * an artifact was built for another feature schema than the snapshot's. Runs before anything is stored.
   *
   * @throws Error naming the mismatch
   */
  private static checkAnswerBelongsToRun(run: MJMLTrainingRunEntity, snapshot: BuiltSnapshot, result: TrainerCompleted): void {
    if (!UUIDsEqual(result.trainingRunId, run.ID)) {
      throw new Error(`TrainingEngine: the trainer answered for training run ${result.trainingRunId}, not ${run.ID}`);
    }
    for (const a of result.artifacts) {
      const actual = SnapshotHash.Sha256Hex(decodeArtifact(a.bytesBase64));
      if (actual !== a.sha256) throw new Error(`TrainingEngine: artifact '${a.candidate}': its bytes hash to ${actual}, not the stated ${a.sha256}`);
      if (a.featureSchemaHash !== snapshot.Entity.FeatureSchemaHash) {
        throw new Error(`TrainingEngine: artifact '${a.candidate}' was built for feature schema ${a.featureSchemaHash}, not the snapshot's ${snapshot.Entity.FeatureSchemaHash}`);
      }
    }
  }

  /**
   * Refuse a trainer report that breaks what the protocol guarantees about its search (`selection-invalid`): every
   * candidate scored on every fold with a valid interval, and the holdout read for the finalist. Runs after the
   * compute is recorded and before anything is stored, so the refused run keeps its compute and stores no artifact.
   */
  private static checkSelection(result: TrainerCompleted): void {
    const selection = InnerScoreSelection.CheckSelection(result.innerScores, result.finalist, result.holdoutAccess);
    if (selection.Ok === false) {
      throw new TrainingRefusedError({ stage: 'trainer', reason: { kind: 'selection-invalid', reason: selection.Reason, detail: selection.Detail } });
    }
  }

  /**
   * Store every returned artifact's decoded bytes as an `MJ: Files` row; the file IDs by candidate. When any save
   * fails, the artifacts already saved are deleted through the same store before the error is rethrown, so a failed run
   * leaves no artifact nothing references.
   */
  private async storeTrainerArtifacts(run: MJMLTrainingRunEntity, result: TrainerCompleted, deps: TrainingDeps): Promise<ReadonlyMap<string, string>> {
    const outcomes = await Promise.allSettled(result.artifacts.map(async (a): Promise<[string, string]> => {
      const fileId = await deps.artifactStore.save(decodeArtifact(a.bytesBase64), `trainer-${run.ID}-${a.candidate}.json`, deps.contextUser);
      return [a.candidate, fileId];
    }));
    const saved = outcomes.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
    const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    if (failure === undefined) return new Map(saved);
    const rollback = await Promise.allSettled(saved.map(([, fileId]) => deps.artifactStore.delete(fileId, deps.contextUser)));
    rollback.forEach((r, k) => {
      if (r.status === 'rejected') LogError(`TrainingEngine: could not delete artifact file ${saved[k][1]} of failed run ${run.ID}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason));
  }

  /**
   * The model row of a trainer run, from the artifact the gate shipped (the trainer's envelope carries its own in-fold
   * encoding, so there is no separate fitted preprocessing), and the split the trainer was sent (the snapshot's manifest
   * roles). For the finalist: its algorithm (the pipeline's when the finalist is not a candidate), its inner score as
   * `Metrics`, the holdout scores as `HoldoutMetrics` and the held-out permutation importance per source column as
   * `FeatureImportance` (`{}` when the trainer measured none, as for a forecast). For a kept baseline member: the
   * catalog algorithm of its driver ({@link shippedAlgorithmId}), its holdout score as `HoldoutMetrics`, and `{}` for
   * `Metrics` and `FeatureImportance` (a baseline has no inner score and no importance of its own).
   */
  private async createTrainerModelRow(x: TrainerRunInputs, outcome: TrainerOutcome, shipped: ShippedArtifact, artifactFileId: string): Promise<MJMLModelEntity> {
    const { Resolved: resolved, Snapshot: snapshot, Deps: deps } = x;
    const result = outcome.Result;
    const content = snapshot.Content;
    const split = LockedHoldoutSplitter.FromManifest(content, content.Header.labelColumn, resolved.problemType);
    const version = await deps.recordLoader.nextModelVersion(resolved.pipeline.ID, deps.contextUser, deps.provider);
    const model = await deps.entityFactory.getEntityObject<MJMLModelEntity>('MJ: ML Models', deps.contextUser);
    model.PipelineID = resolved.pipeline.ID;
    model.Version = version;
    model.AlgorithmID = await this.shippedAlgorithmId(x, outcome, shipped);
    model.ArtifactFileID = artifactFileId;
    model.FittedPreprocessing = '{}';
    model.FeatureSchema = JSON.stringify(content.Header.featureSchema);
    model.TargetVariable = PredictionUnit.DescribeLabelRule(x.Unit);
    model.ProblemType = resolved.problemType;
    const inner = shipped.Member === null ? result.innerScores.find((s) => s.candidate === result.finalist) : undefined;
    model.Metrics = JSON.stringify(inner ? { [inner.inner.metric]: inner.inner.value } : {});
    model.HoldoutMetrics = JSON.stringify(TrainerContract.HoldoutMetricsOf(shipped.Member === null ? result.holdout : { primary: shipped.Member.holdout, secondary: [] }));
    model.FeatureImportance = JSON.stringify(shipped.Member === null ? outcome.Importance : {});
    model.Lineage = JSON.stringify(this.trainerLineage(x, outcome, split, shipped));
    model.TrainedAt = new Date();
    model.TrainingDurationSec = Math.round(result.computeSeconds);
    model.TrainingRowCount = split.TrainingRowCount;
    model.Status = 'Draft';
    await this.saveOrThrow(model, 'create ML Model');
    return model;
  }

  /**
   * The Lineage of a trainer run's model: the keys every model carries (the trainer's sidecar version, the snapshot's
   * split), the unit's, and the protocol it was judged under with its artifact format. Its evaluation record states
   * out-of-sample scoring (the holdout rows are scored once by the shipped artifact, which never trained on them) and the
   * kind of the importance the row stores: the finalist's held-out importance, or none for a kept baseline member (its
   * row stores `{}`). It names what shipped and that artifact's driver.
   */
  private trainerLineage(x: TrainerRunInputs, outcome: TrainerOutcome, split: LockedHoldoutSplit, shipped: ShippedArtifact): ModelTrainingLineage & Partial<UnitModelLineage> & TrainerModelLineage {
    const evaluation: EvaluationRecord = shipped.Member === null ? outcome.Evaluation : { ...outcome.Evaluation, ImportanceKind: 'none' };
    return {
      ...this.buildLineage(x.Resolved, x.Input, split, evaluation, x.UnitLineage),
      sidecarVersion: outcome.Result.codeVersion.sidecarVersion,
      evaluationProtocolId: x.Training.Protocol.RowID,
      artifactFormat: PREDICTOR_ARTIFACT_FORMAT,
      shippedMember: shipped.Name,
      shippedDriver: TrainingEngine.shippedDriver(x, outcome, shipped),
    };
  }

  /**
   * The `MJ: ML Algorithms` row the model row names. The finalist: its candidate's algorithm, or the pipeline's when the
   * finalist is not a candidate. A kept baseline member: the catalog row of its driver; a driver with no catalog row
   * (the baseline-only count and non-negative GLMs, the forecast baselines) names the pipeline's algorithm, and the
   * lineage's `shippedDriver` holds the driver that shipped.
   */
  private async shippedAlgorithmId(x: TrainerRunInputs, outcome: TrainerOutcome, shipped: ShippedArtifact): Promise<string> {
    if (shipped.Member === null) return outcome.Finalist ? outcome.Finalist.algorithmId : x.Resolved.pipeline.AlgorithmID;
    const catalogId = await x.Deps.recordLoader.resolveAlgorithmIDForDriver(TrainingEngine.shippedDriver(x, outcome, shipped), x.Deps.contextUser, x.Deps.provider);
    return catalogId || x.Resolved.pipeline.AlgorithmID;
  }

  /** The driver key of the shipped artifact: the finalist candidate's (the pipeline's when not a candidate), or the kept member's. */
  private static shippedDriver(x: TrainerRunInputs, outcome: TrainerOutcome, shipped: ShippedArtifact): string {
    if (shipped.Member === null) return outcome.Finalist ? outcome.Finalist.driverKey : x.Resolved.algorithmDriverKey;
    return TrainingEngine.MemberDriverKey(shipped.Member.baseline, x.Unit.label.outcome);
  }

  /**
   * The driver a shippable baseline member is fitted with, as the trainer fits it: the GLM and the one-feature baseline
   * use the GLM of the task's family (a forecast's family is its value kind); the forecast baselines are their own
   * series drivers. The dummy and the incumbent heuristic are yardsticks and never ship.
   *
   * @throws Error for a yardstick baseline
   */
  public static MemberDriverKey(spec: BaselineSpec, task: TaskType): string {
    switch (spec.kind) {
      case 'glm':
      case 'one-feature':
        return TrainingEngine.glmDriver[task.kind === 'forecast' ? task.valueKind : task.kind];
      case 'naive':
        return 'naive';
      case 'seasonal-naive':
        return 'seasonal-naive';
      case 'dummy':
      case 'incumbent-heuristic':
        throw new Error(`TrainingEngine: a ${spec.kind} baseline is a yardstick and never ships as an artifact`);
    }
  }

  /** The GLM each task family's GLM baseline fits (the trainer's own table, `baselines.GLM_DRIVER`). */
  private static readonly glmDriver: { readonly [K in Exclude<TaskKind, 'forecast'>]: string } = {
    binary: 'logistic_regression', multiclass: 'logistic_regression', continuous: 'ridge', count: 'poisson_glm', 'non-negative': 'tweedie_glm',
  };

  /**
   * Assemble a unit pipeline's training matrix as of each unit row's decision date: the pipeline's steps resolve into
   * typed columns (the bound protocol's exclusions and the pipeline's LeakageGuard deny lists excluded,
   * {@link EffectiveExclusions}) and the as-of assembler reads them. This is the one
   * assembly function training uses; the scoring path calls the same assembler with the columns and levels training
   * stored. With `prepared` (a training run) the pipeline, unit and rows already read are reused; without it (a check
   * that only needs the matrix) the pipeline, its bound protocol's exclusions, the unit and its rows are read here, and
   * a pipeline without a unit is refused (`unit-required`).
   *
   * @param pipelineId the `MJ: ML Training Pipelines` row
   * @param deps the training deps (provider, user and the unit seams; `history` defaults to complete Record Changes reads)
   * @param prepared what a training run has already read
   */
  public async AssembleForTraining(pipelineId: string, deps: TrainingDeps, prepared?: UnitAssemblyInputs): Promise<UnitTrainingAssembly> {
    const inputs = prepared || (await this.prepareUnitAssembly(pipelineId, deps));
    const { Resolved: resolved, Unit: unit, UnitRead: unitRead } = inputs;
    const exclusions = TrainingEngine.EffectiveExclusions(resolved.leakageGuard, inputs.ProtocolExclusions);
    const resolution = FeatureResolver.ResolveFeatureColumns(resolved.featureSteps, unit, unitRead.RowEntity, inputs.Metadata, exclusions);
    if (resolution.Status === 'refused') return { Unit: unit, UnitRead: unitRead, Features: [], Assembled: resolution };
    // The names the assembly will write (date parts included), so this check accepts exactly what the builder does.
    const columnNames = new Set(AsOfFeatureAssembler.ColumnNamesOf(resolution.Columns));
    const sources = unitRead.Rows.map((r) => r.Source);
    const unresolvedSlice = (inputs.SliceFields || []).find((field) => !TrainingSnapshotBuilder.SliceFieldResolves(field, columnNames, sources));
    if (unresolvedSlice !== undefined) {
      return { Unit: unit, UnitRead: unitRead, Features: [], Assembled: { Status: 'refused', Refusal: { kind: 'unresolved-column', entity: unit.name, field: unresolvedSlice } } };
    }
    const assembled = await new AsOfFeatureAssembler().Assemble({
      Context: 'train',
      Unit: unit,
      RowEntity: unitRead.RowEntity,
      Rows: unitRead.Rows.map((r) => ({ RowID: r.RowID, EntityKey: r.EntityKey, DecisionDate: r.DecisionDate, Period: r.Period })),
      Features: resolution.Columns,
      SeriesHistory: TrainingEngine.SeriesHistoryFor(unit, unitRead.Rows),
      Read: { mode: 'complete' },
      DataAccess: inputs.DataAccess,
      History: deps.history || new RunViewRecordHistoryReader(inputs.DataAccess, { mode: 'complete' }),
      Metadata: inputs.Metadata,
      AssembledAt: deps.now?.() || new Date(),
      ExplicitOps: resolution.ExplicitOps,
    });
    return { Unit: unit, UnitRead: unitRead, Features: resolution.Columns, Assembled: assembled };
  }

  /**
   * The fields and sources kept out of a unit pipeline's matrix: the union of the bound protocol's `exclusions` (a guard
   * field, set only in protocol configuration) and the pipeline's `LeakageGuard` deny lists. A union, so neither list
   * can bring back a column the other keeps out.
   *
   * @param leakageGuard the pipeline's leakage guard
   * @param protocolExclusions the bound protocol's exclusions, or null when the pipeline has no protocol
   */
  public static EffectiveExclusions(leakageGuard: LeakageGuard, protocolExclusions: ProtocolExclusions | null): ProtocolExclusions {
    return {
      denyFields: [...(leakageGuard.DenyFields || []), ...(protocolExclusions ? protocolExclusions.denyFields : [])],
      denySources: [...(leakageGuard.DenySources || []), ...(protocolExclusions ? protocolExclusions.denySources : [])],
    };
  }

  /**
   * The series history a unit with a Temporal Spec reads its lags and rolling windows from: the unit rows' labels by
   * entity and period. Null for a unit without one.
   */
  public static SeriesHistoryFor(unit: PredictionUnitSpec, rows: readonly UnitRow[]): SeriesHistory | null {
    const temporal = unit.temporal;
    return temporal ? SeriesFeatures.BuildSeriesHistory(rows.map((r) => TrainingEngine.toPoint(r)), temporal) : null;
  }

  /** A unit row as a series point; a forecast row always has a period and a numeric label once the target is validated. */
  private static toPoint(r: UnitRow): SeriesPoint {
    if (r.Period === null) throw new Error(`TrainingEngine: unit row ${r.RowID} has no period, so it cannot be a series point`);
    if (typeof r.Label !== 'number') throw new Error(`TrainingEngine: unit row ${r.RowID} has the non-numeric label "${r.Label}", so it cannot be a series point`);
    return { EntityKey: r.EntityKey, Period: r.Period, Value: r.Label, RowID: r.RowID };
  }

  /** Read the pipeline, its unit and the unit's rows, for an assembly that is not part of a training run. */
  private async prepareUnitAssembly(pipelineId: string, deps: TrainingDeps): Promise<UnitAssemblyInputs> {
    const resolved = await this.resolvePipeline(pipelineId, deps);
    const unitId = resolved.pipeline.PredictionUnitID;
    if (!unitId) {
      throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: resolved.pipeline.ID, why: 'only a pipeline that points at a Prediction Unit is assembled as of decision dates' } });
    }
    const protocolExclusions = await this.boundProtocolExclusions(resolved.pipeline, deps);
    const unit = await this.loadUnitSpec(unitId, deps);
    const seams = this.unitSeams(deps);
    const unitRead = await this.readUnitRows(unit, seams, deps);
    return { Resolved: resolved, Unit: unit, UnitRead: unitRead, DataAccess: seams.DataAccess, Metadata: seams.Metadata, ProtocolExclusions: protocolExclusions };
  }

  /**
   * The exclusions of the protocol version the pipeline is bound to, read as a training run reads it; null when the
   * pipeline names no protocol.
   *
   * @throws TrainingRefusedError (`protocol-required`) when the bound row does not exist, (`protocol-invalid`) when it does not parse
   */
  private async boundProtocolExclusions(pipeline: MJMLTrainingPipelineEntity, deps: TrainingDeps): Promise<ProtocolExclusions | null> {
    const protocolId = pipeline.EvaluationProtocolID;
    if (!protocolId) return null;
    const store = deps.protocols || new RunViewEvaluationProtocolStore(this.requireProvider(deps), deps.contextUser);
    const spec = await EvaluationProtocolSpecs.LoadSpec(store, protocolId);
    if (spec === null) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'protocol-required', pipelineId: pipeline.ID } });
    return spec.exclusions;
  }

  /** The unit path reads through the request's provider (never a global RunView) unless the deps supply the seams. */
  private unitSeams(deps: TrainingDeps): UnitSeams {
    return {
      Metadata: deps.assemblyMetadata || new ProviderAssemblyMetadata(this.requireProvider(deps)),
      DataAccess: deps.dataAccess || new RunViewDataAccess(deps.contextUser, this.requireProvider(deps)),
    };
  }

  /** Every unit row, read completely; a refused read is the run's refusal. */
  private async readUnitRows(unit: PredictionUnitSpec, seams: UnitSeams, deps: TrainingDeps): Promise<UnitRowsRead> {
    const unitRead = await this.unitReader.Read(unit, { DataAccess: seams.DataAccess, Metadata: seams.Metadata, Read: { mode: 'complete' }, Now: deps.now?.() || new Date() });
    if (unitRead.Status === 'refused') throw new TrainingRefusedError(unitRead.Refusal);
    return unitRead;
  }

  /** Load the pipeline's unit version and parse it; a missing or unparseable unit is the refusal `unit-invalid`. */
  private async loadUnitSpec(unitId: string, deps: TrainingDeps): Promise<PredictionUnitSpec> {
    const store = deps.predictionUnits || new RunViewPredictionUnitStore(this.requireProvider(deps), deps.contextUser);
    const row = await store.Load(unitId);
    if (!row) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-invalid', unitId, errors: ['not found'] } });
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-invalid', unitId, errors: parsed.Errors } });
    return parsed.Value;
  }

  /** The unit's identity, the typed feature columns, the kept categorical levels and the snapshot, stored in the model Lineage. */
  private unitLineage(
    unit: PredictionUnitSpec, resolved: ResolvedPipeline, unitRead: UnitRowsRead, features: readonly FeatureColumnSpec[], levels: ReadonlyMap<string, readonly string[]>,
    snapshot: MJTrainingSnapshotEntity,
  ): UnitModelLineage {
    return {
      predictionUnitId: unit.id,
      predictionUnitVersion: unit.version,
      labelVersion: unit.label.labelVersion,
      featureSpecVersion: resolved.pipeline.Version,
      unitRowEntity: unitRead.RowEntity.Name,
      featureSpec: [...features],
      categoryLevels: Object.fromEntries([...levels].map(([column, kept]) => [column, [...kept]])),
      trainingSnapshotId: snapshot.ID,
      snapshotContentHash: snapshot.ContentHash,
    };
  }

  /** The provider the unit path's production seams read through; the unit path has no global fallback. */
  private requireProvider(deps: TrainingDeps): IMetadataProvider {
    if (!deps.provider) throw new Error('TrainingEngine: a metadata provider is required for Prediction Unit pipelines');
    return deps.provider;
  }

  /**
   * Record a refused run (best-effort — never masks the refusal): `Failed`, the `refused` envelope in
   * ValidationResults and the refusal sentence in Notes. The caller rethrows the refusal.
   */
  private async finalizeRunRefused(run: MJMLTrainingRunEntity, err: TrainingRefusedError): Promise<void> {
    const results: TrainingRunResults = { schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: err.Refusal };
    run.Status = 'Failed';
    run.CompletedAt = new Date();
    run.ValidationResults = JSON.stringify(results);
    run.Notes = err.message;
    try {
      if (!(await run.Save())) {
        LogError(`TrainingEngine: failed to record the refusal on run ${run.ID}: ${run.LatestResult?.CompleteMessage || 'unknown error'}`);
      }
    } catch (saveErr) {
      LogError(`TrainingEngine: failed to record the refusal on run ${run.ID}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }
  }

  /** Rows excluded because a read field's history did not cover their decision date, named per entity and field. */
  private static withUncoveredNote(notes: string, uncovered: readonly UncoveredRowsCount[]): string {
    if (uncovered.length === 0) return notes;
    return `${notes} Excluded for uncovered history: ${uncovered.map((u) => `${u.entity}.${u.field} ${u.rows}`).join(', ')}.`;
  }

  // region: pipeline resolution -------------------------------------------------

  /** Load the pipeline and parse its JSON config columns into typed shapes. */
  private async resolvePipeline(pipelineId: string, deps: TrainingDeps): Promise<ResolvedPipeline> {
    const pipeline = await deps.recordLoader.loadPipeline(pipelineId, deps.contextUser, deps.provider);
    if (!pipeline) {
      throw new Error(`TrainingEngine: ML Training Pipeline '${pipelineId}' not found.`);
    }
    // `pipeline.Algorithm` is the algorithm's display *Name* (e.g. "XGBoost") from
    // the pipeline view — NOT the sidecar driver key. Resolve the real `DriverClass`
    // (e.g. "xgboost") by id; fall back to the display name only when the loader
    // can't resolve it (e.g. in-memory test fakes that set the driver key directly).
    const resolvedDriverKey =
      (await deps.recordLoader.resolveAlgorithmDriverKey?.(pipeline.AlgorithmID, deps.contextUser, deps.provider)) ??
      pipeline.Algorithm;
    const stepsRaw = parseJson<Record<string, unknown>>(pipeline.FeatureSteps, {});
    const hyperRaw = parseJson<Record<string, unknown>>(pipeline.Hyperparameters, {});
    const explicitOutcome = (stepsRaw.OutcomeConfig ?? stepsRaw.outcomeConfig ?? hyperRaw.OutcomeConfig ?? hyperRaw.outcomeConfig) as OutcomeConfig | undefined;
    const outcomeConfig = explicitOutcome ?? resolveOutcomeConfig(pipeline);

    return {
      pipeline,
      targetEntityName: pipeline.TargetEntity,
      targetVariable: pipeline.TargetVariable,
      problemType: pipeline.ProblemType,
      algorithmDriverKey: resolvedDriverKey,
      hyperparameters: parseJson<Record<string, unknown>>(pipeline.Hyperparameters, {}),
      sourceBindings: parseJson<SourceBinding[]>(pipeline.SourceBindings, []),
      featureSteps: parseJson<FeatureStepGraph>(pipeline.FeatureSteps, { Steps: [] }),
      asOf: parseAsOf(pipeline.AsOfStrategy),
      leakageGuard: parseJson<LeakageGuard>(pipeline.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT }),
      validation: parseJson<ValidationStrategy>(pipeline.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 }),
      outcomeConfig,
    };
  }

  // region: training-run lifecycle ----------------------------------------------

  /** Create the `MJ: ML Training Runs` row in `Running` state with `StartedAt`. */
  private async createRunRow(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<MJMLTrainingRunEntity> {
    const run = await deps.entityFactory.getEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', deps.contextUser);
    run.PipelineID = resolved.pipeline.ID;
    run.AlgorithmID = resolved.pipeline.AlgorithmID;
    if (input.experimentSessionIterationId) {
      run.ExperimentSessionIterationID = input.experimentSessionIterationId;
    }
    if (resolved.pipeline.EvaluationProtocolID) {
      run.EvaluationProtocolID = resolved.pipeline.EvaluationProtocolID;
    }
    run.Hyperparameters = JSON.stringify(resolved.hyperparameters);
    run.Status = 'Running';
    run.StartedAt = new Date();
    await this.saveOrThrow(run, 'create ML Training Run');
    return run;
  }

  /** Record a failed run (best-effort — never masks the original error). */
  private async finalizeRunFailure(run: MJMLTrainingRunEntity, err: unknown, _deps: TrainingDeps): Promise<void> {
    try {
      run.Status = 'Failed';
      run.CompletedAt = new Date();
      run.Notes = `Training failed: ${err instanceof Error ? err.message : String(err)}`;
      await run.Save();
    } catch (saveErr) {
      LogError(`TrainingEngine: failed to record run failure: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }
  }

  /** Compose the plain-language run note, surfacing leakage suspicion loudly (§6.4). */
  private buildRunNotes(dominance: DominanceResult, evaluation: EvaluationRecord, modelCreated: boolean): string {
    const consequence = modelCreated
      ? 'The model is kept in Draft and will NOT be auto-promoted: the promotion gate refuses it unless a promote request records a sign-off with a reason.'
      : 'No model was created from this run, so there is nothing to promote.';
    const base = dominance.Dominant
      ? `LEAKAGE WARNING: one field ("${dominance.TopFeature}") is doing almost all the predicting ` +
        `(${((dominance.TopShare ?? 0) * 100).toFixed(1)}% of total importance, over the ${(dominance.Threshold * 100).toFixed(0)}% threshold). ` +
        `This often means we are accidentally peeking at the answer. ${consequence}`
      : 'Training completed. No single-feature dominance detected.';
    if (!evaluation.WithheldReason) {
      return base;
    }
    return (
      `${base} Trust withheld — ${evaluation.WithheldReason}: the pipeline declares '${evaluation.TimeIndexColumn}' as its time index, ` +
      'but the model was scored on rows from its own training period, not on later periods.'
    );
  }

  // region: leakage -------------------------------------------------------------

  /** Run the single-feature-dominance check against the leakage threshold (§6.4). */
  private checkLeakage(importance: FeatureImportance, guard: LeakageGuard): DominanceResult {
    return detectSingleFeatureDominance(importance, guard.SingleFeatureDominanceThreshold);
  }

  // region: model lineage ----------------------------------------------------------

  /**
   * Assemble the model lineage blob (provenance, §4.3). This blob must be
   * **self-contained enough to re-assemble features at score time** — the
   * scoring path ({@link MLModelInferenceProcessor}) reconstructs its assembly
   * config from `lineage.targetEntityName` / `sourceBindings` / `featureSteps` /
   * `asOfStrategy` when the pipeline row isn't separately loaded. Omitting
   * `targetEntityName` or `featureSteps` here would leave the model unable to
   * produce any feature columns at inference (train/serve break), so both are
   * persisted alongside the other provenance fields, after the model's {@link UnitModelLineage} (every model is trained on a unit).
   */
  private buildLineage(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    split: LockedHoldoutSplit,
    evaluation: EvaluationRecord,
    unitLineage: UnitModelLineage,
  ): ModelTrainingLineage & UnitModelLineage {
    return {
      ...unitLineage,
      pipelineId: resolved.pipeline.ID,
      pipelineVersion: resolved.pipeline.Version,
      targetEntityName: resolved.targetEntityName,
      sourceBindings: resolved.sourceBindings,
      featureSteps: resolved.featureSteps,
      asOfStrategy: resolved.asOf,
      outcomeConfig: resolved.outcomeConfig,
      sidecarVersion: input.sidecarVersion ?? null,
      lockedHoldoutRowCount: split.HoldoutRowCount,
      lockedHoldoutClassCounts: split.HoldoutClassCounts,
      trainingRowCount: split.TrainingRowCount,
      assembledAt: new Date().toISOString(),
      [EvaluationLineage.Key]: evaluation,
    };
  }

  // region: save helper ---------------------------------------------------------

  /**
   * Save a BaseEntity and throw with `LatestResult.CompleteMessage` on failure
   * (Save returns boolean, never throws on logical failure — CLAUDE.md).
   */
  private async saveOrThrow(entity: MJMLModelEntity | MJMLTrainingRunEntity, what: string): Promise<void> {
    const ok = await entity.Save();
    if (!ok) {
      const message = entity.LatestResult?.CompleteMessage ?? 'unknown error';
      throw new Error(`TrainingEngine: failed to ${what}: ${message}`);
    }
  }
}

/** The pipeline's stored AsOfStrategy; one with no `Mode` (a stored `{}`) asks for nothing and reads as `Mode: 'none'`. */
function parseAsOf(raw: string | null | undefined): AsOfStrategy {
  const parsed = parseJson<Partial<AsOfStrategy> | null>(raw, { Mode: 'none' });
  return parsed?.Mode ? (parsed as AsOfStrategy) : { Mode: 'none' };
}

/** Parse a possibly-null JSON column, falling back to a default on null/empty/parse error. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Decode a base64 artifact string into raw bytes (no Buffer dependency leak in types). */
function decodeArtifact(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64 ?? '', 'base64'));
}
