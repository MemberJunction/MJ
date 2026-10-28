/**
 * @module training/training-engine
 *
 * The **TrainingEngine** — Predictive Studio's training orchestrator (plan §3 /
 * §4.3 / §4.4 / §6 / §8.2 / §11). It composes the FeatureAssembly executor, the
 * Python sidecar, and artifact storage into one auditable flow that produces an
 * **immutable, versioned `MJ: ML Models`** row plus the `MJ: ML Training Runs`
 * row that recorded the attempt.
 *
 * ## Flow ({@link TrainingEngine.trainModel})
 * 1. Resolve the pipeline (parse its JSON columns via the core type contracts),
 *    then refuse — before any row is written — an unknown `MajorityBaselineRule`
 *    (`InvalidMajorityBaselineRuleError`).
 * 2. Create the training-run row (`Status='Running'`, `StartedAt`). A pipeline
 *    without a Prediction Unit whose AsOfStrategy asks for point-in-time assembly
 *    is refused here (`unit-required`, recorded on the run): that assembly lives
 *    in a Prediction Unit.
 * 3. Assemble the raw matrix + schema + preprocessing ops via FeatureAssembly
 *    (context `'train'`), carrying the label column. The target read is ordered by
 *    the entity's primary key, so the same data always arrives in the same order.
 * 4. **Carve the locked holdout FIRST** (§8.2 — never trained/tuned on) with the
 *    seeded, stratified {@link LockedHoldoutSplitter}; the remaining
 *    `train_test_split`/`kfold`/`holdout` validation is delegated to the sidecar
 *    with the same seed. Build the sidecar `ValidationConfig`.
 * 5. Build the `TrainRequest` and call the sidecar → `TrainResponse`; the locked
 *    holdout is scored exactly once → `HoldoutMetrics`.
 * 6. Persist the artifact to `MJ: Files` via the injected store → `ArtifactFileID`.
 * 7. Create the immutable `MJ: ML Models` row (Status `Draft`).
 * 8. **Leakage guard (§6.4):** single-feature-dominance check; a dominant feature
 *    flags the run, keeps the model `Draft`, and NEVER auto-promotes.
 * 9. Finalize the run (`Completed`/`Failed`, results, costs, notes).
 *
 * A pipeline that points at a Prediction Unit takes the unit path instead: the unit
 * row reader reads every unit row (censored and label-known rows excluded and
 * counted), the target is validated, and the matrix is assembled as of each row's
 * decision date by {@link TrainingEngine.AssembleForTraining} — the same
 * `AsOfFeatureAssembler` the scoring path calls. The assembled rows are then frozen
 * into an immutable Training Snapshot (the trailing fraction of rows, in decision-date
 * order, is the locked holdout; identical content reuses the existing snapshot), and
 * the sidecar is trained from the snapshot's development rows and scores its
 * locked-holdout rows once. A refusal is recorded on the run as a `refused` envelope
 * ({@link TrainingRefusedError}); a completed run references its snapshot and stores
 * the unit resolution counts and the request it trained with, and the model Lineage
 * names the unit version, the typed feature columns, the kept categorical levels
 * scoring reuses, and the snapshot's ID and content hash.
 *
 * Every external dependency is injected (see {@link TrainingDeps}) so the engine
 * is unit-testable with no live database and no live sidecar.
 */

import { LogError, type IMetadataProvider } from '@memberjunction/core';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type TrainResponse,
  type ValidationConfig,
  type MatrixData,
  type SourceBinding,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
  type FittedPreprocessing,
  type FeatureStepGraph,
  type OutcomeConfig,
  resolveOutcomeConfig,
  EvaluationLineage,
  type EvaluationRecord,
  LABEL_COLUMN,
  JsonParse,
  PredictionUnit,
  TaskTypeRules,
  TRAINING_RUN_RESULTS_SCHEMA,
  type PredictionUnitSpec,
  type TrainingRunResults,
  type UnitResolutionCounts,
  type UncoveredRowsCount,
  type FeatureColumnSpec,
  type LegacyRequestConfig,
} from '@memberjunction/predictive-studio-core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, detectSingleFeatureDominance, type DominanceResult } from '../feature-assembly';
import { RunViewDataAccess, type ICountingDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata, type IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { AsOfFeatureAssembler, type AsOfAssembledMatrix, type AsOfAssemblyResult } from '../feature-assembly/as-of/as-of-assembler';
import { FeatureResolver } from '../feature-assembly/as-of/feature-resolution';
import { RunViewRecordHistoryReader } from '../feature-assembly/as-of/record-history';
import { SeriesFeatures, type SeriesHistory, type SeriesPoint } from '../feature-assembly/as-of/series-features';
import { PredictionUnitRowReader, type UnitRow, type UnitRowReadResult } from '../prediction-unit/unit-row-reader';
import { UnitTargetValidator } from '../prediction-unit/target-validation';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { TrainingRefusedError } from './training-refusal';
import { TrailingFractionCarver } from '../snapshot/holdout-carver';
import { TrainingSnapshotBuilder, type BuiltSnapshot } from '../snapshot/snapshot-builder';
import type { ISnapshotFileStore } from '../snapshot/snapshot-file-store';
import type { SnapshotContent } from '../snapshot/snapshot-serialization';
import { RunViewTrainingSnapshotStore } from '../snapshot/training-snapshot-store';
import { SnapshotRetrainer } from '../snapshot/snapshot-retrainer';
import { LockedHoldoutSplitter, DEFAULT_SPLIT_SEED, type LockedHoldoutSplit } from './locked-holdout';
import { TrainRequestBuilder } from './train-request';
import { ComputePricing } from './compute-cost';
import type { TrainModelInput, TrainModelResult, TrainingDeps, ModelTrainingLineage } from './types';
import type { UnitModelLineage } from './unit-model-lineage';

/** Parsed JSON config columns pulled off a `MJ: ML Training Pipelines` row. */
export interface ResolvedPipeline {
  pipeline: MJMLTrainingPipelineEntity;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  targetEntityName: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  targetVariable: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  problemType: ProblemType;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  algorithmDriverKey: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  hyperparameters: Record<string, unknown>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  sourceBindings: SourceBinding[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  featureSteps: FeatureStepGraph;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  asOf: AsOfStrategy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  leakageGuard: LeakageGuard;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  validation: ValidationStrategy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  outcomeConfig: OutcomeConfig;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
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

/**
 * Training orchestrator. Stateless across calls; construct once and reuse. All
 * dependencies are supplied per call via {@link TrainingDeps}.
 */
export class TrainingEngine {
  private readonly assembler: FeatureAssemblyExecutor;
  private readonly unitReader = new PredictionUnitRowReader();

  /**
   * @param assembler optional FeatureAssembly executor override (tests may inject one)
   */
  constructor(assembler?: FeatureAssemblyExecutor) {
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
  }

  /**
   * Train a model end-to-end from a pipeline definition.
   *
   * @param input the pipeline id + optional session-iteration / as-of inputs
   * @param deps the injected dependency bundle (entity factory, loader, sidecar, store)
   * @returns the produced `Draft` model and the `Completed`/`Failed` training run
   */
  public async trainModel(input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {  // case-violation-ok-legacy-back-compat: a subclass overrides this; a stub preserves CALLING the old name but not OVERRIDING it
    // The compute rate is read before anything is written or trained, so a misconfigured rate fails fast.
    const usdPerSecond = ComputePricing.ReadComputeRate();
    const resolved = await this.resolvePipeline(input.pipelineId, deps);
    return resolved.pipeline.PredictionUnitID
      ? this.trainUnitPipeline(resolved, resolved.pipeline.PredictionUnitID, input, deps, usdPerSecond)
      : this.trainLegacyPipeline(resolved, input, deps, usdPerSecond);
  }

  /**
   * Train a pipeline that does not point at a Prediction Unit: the `MajorityBaselineRule` parse runs before the run row
   * is written; a point-in-time AsOfStrategy is refused on the run (`unit-required`); then the target entity is
   * assembled, the locked holdout carved and the sidecar trained.
   */
  private async trainLegacyPipeline(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps, usdPerSecond: number | null): Promise<TrainModelResult> {
    // Validates the evaluation settings (an unknown MajorityBaselineRule is refused) before any row is written.
    const majorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(resolved.validation.MajorityBaselineRule);
    const run = await this.createRunRow(resolved, input, deps);

    try {
      if (resolved.asOf.Mode !== 'none') {
        const why = "point-in-time assembly now lives in a Prediction Unit; this pipeline's AsOfStrategy has no effect without one";
        throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: resolved.pipeline.ID, why } });
      }
      const assembly = await this.assemble(resolved, input, deps);
      const targetIdx = assembly.matrix.columns.indexOf(resolved.targetVariable);
      const cleanRows = targetIdx >= 0
        ? assembly.matrix.rows.filter((r) => r[targetIdx] !== null && r[targetIdx] !== undefined)
        : assembly.matrix.rows;
      const cleanMatrix: MatrixData = { columns: assembly.matrix.columns, rows: cleanRows };
      const split = this.carveLockedHoldout(cleanMatrix, resolved, DEFAULT_SPLIT_SEED);
      const trainRequest = TrainRequestBuilder.Build({
        Algorithm: resolved.algorithmDriverKey,
        ProblemType: resolved.problemType,
        Hyperparameters: resolved.hyperparameters,
        Validation: this.buildValidationConfig(resolved.validation),
        FeatureSchema: assembly.featureSchema,
        Preprocessing: assembly.preprocessing,
        Target: resolved.targetVariable,
        Data: split.Training,
      });

      const response = await deps.sidecar.train(trainRequest, split.LockedHoldout);
      const evaluation = EvaluationLineage.Build(resolved.validation, {
        ValidationOutOfSample: response.validation_out_of_sample === true,
        ImportanceKind: response.feature_importance_kind || null,
        MajorityBaselineRule: majorityBaselineRule,
      });

      const dominance = this.checkLeakage(response, resolved.leakageGuard);
      const model = await this.createModelRow(resolved, input, assembly, split, response, evaluation, deps);
      await this.finalizeRunSuccess(run, model, assembly, resolved, response, dominance, evaluation, usdPerSecond);
      return { model, run };
    } catch (err) {
      await this.recordRunError(run, err, deps);
      throw err;
    }
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
   * Train a pipeline that points at a Prediction Unit. The unit decides the rows, their decision dates and their
   * labels: inputs that would override them (`maxRows`, `labelEventDates`, a point-in-time AsOfStrategy) are refused,
   * censored and label-known rows are excluded and counted, and a target that cannot train a model is refused before
   * the sidecar is called. The matrix is assembled as of each decision date ({@link AssembleForTraining}) and frozen
   * into a Training Snapshot the run references; the sidecar trains from the snapshot's rows. A refusal is recorded on
   * the run row as a `refused` envelope; the counts, the unit's identity and the snapshot are stored on a completed run
   * and its model. Deps without a snapshot file store are incomplete and the run fails before anything is read.
   */
  private async trainUnitPipeline(resolved: ResolvedPipeline, unitId: string, input: TrainModelInput, deps: TrainingDeps, usdPerSecond: number | null): Promise<TrainModelResult> {
    const majorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(resolved.validation.MajorityBaselineRule);
    const run = await this.createRunRow(resolved, input, deps);
    try {
      TrainingEngine.refuseUnitOverrides(input, resolved);
      const snapshotFiles = TrainingEngine.requireSnapshotFiles(deps);
      const unit = await this.loadUnitSpec(unitId, deps);
      const seams = this.unitSeams(deps);
      const unitRead = await this.readUnitRows(unit, seams, deps);
      const validation = UnitTargetValidator.ValidateUnitTargets(unitRead.Rows, unit.label.outcome, unitRead.Counts);
      if (validation.status === 'refused') throw new TrainingRefusedError({ stage: 'unit', reason: validation.reason });

      const assembly = await this.AssembleForTraining(resolved.pipeline.ID, deps, { Resolved: resolved, Unit: unit, UnitRead: unitRead, DataAccess: seams.DataAccess, Metadata: seams.Metadata });
      if (assembly.Assembled.Status === 'refused') throw new TrainingRefusedError({ stage: 'assembly', reason: assembly.Assembled.Refusal });
      const snapshot = await this.freezeSnapshot(resolved, assembly, assembly.Assembled, snapshotFiles, deps);
      run.TrainingSnapshotID = snapshot.Entity.ID;
      const unitResolved: ResolvedPipeline = { ...resolved, targetEntityName: unitRead.RowEntity.Name, targetVariable: LABEL_COLUMN, problemType: TaskTypeRules.LegacyProblemTypeForTask(unit.label.outcome) };
      const lineage = this.unitLineage(unit, resolved, unitRead, assembly.Features, assembly.Assembled.CategoryLevels, snapshot.Entity);
      const model = await this.fitUnitModel(run, unitResolved, input, snapshot.Content, deps, majorityBaselineRule, lineage, unitRead.Counts, assembly.Assembled.UncoveredRowsExcluded, usdPerSecond);
      return { model, run };
    } catch (err) {
      await this.recordRunError(run, err, deps);
      throw err;
    }
  }

  /** The unit decides rows and decision dates, so a capped read, label-event dates and an as-of strategy are refused. */
  private static refuseUnitOverrides(input: TrainModelInput, resolved: ResolvedPipeline): void {
    if (input.maxRows !== null && input.maxRows !== undefined) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'maxRows', why: 'a Prediction Unit pipeline reads every unit row; a capped read is not a complete read' } });
    if (input.labelEventDates) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates', why: 'decision dates come from the Prediction Unit' } });
    if (resolved.asOf.Mode !== 'none') throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'asOf', why: 'decision dates come from the Prediction Unit' } });
  }

  /**
   * The deps' snapshot file store. A unit run trains only from a Training Snapshot, so deps without one are incomplete
   * (a wiring error, not a refusal of the pipeline) and the run fails rather than training from rows nothing recorded.
   */
  private static requireSnapshotFiles(deps: TrainingDeps): ISnapshotFileStore {
    if (!deps.snapshotFiles) {
      throw new Error('TrainingEngine: the training deps are incomplete: a Prediction Unit pipeline trains from a Training Snapshot, and no snapshot file store (snapshotFiles) was supplied');
    }
    return deps.snapshotFiles;
  }

  /**
   * Freeze the assembled rows into a Training Snapshot: each row gets its manifest role from the holdout carver (by
   * default the trailing `LockedHoldoutFraction` of the rows in decision-date order), and identical content reuses the
   * snapshot that already holds it.
   */
  private async freezeSnapshot(
    resolved: ResolvedPipeline, assembly: UnitTrainingAssembly, assembled: AsOfAssembledMatrix, files: ISnapshotFileStore, deps: TrainingDeps,
  ): Promise<BuiltSnapshot> {
    const carver = deps.holdoutCarver || new TrailingFractionCarver(resolved.validation.LockedHoldoutFraction);
    const snapshots = deps.snapshots || new RunViewTrainingSnapshotStore(this.requireProvider(deps), deps.contextUser);
    return new TrainingSnapshotBuilder().Build({
      PipelineID: resolved.pipeline.ID,
      FeatureSpecVersion: resolved.pipeline.Version,
      Unit: assembly.Unit,
      UnitRead: assembly.UnitRead,
      Features: assembly.Features,
      Assembled: assembled,
      Roles: carver.AssignRoles(assembled.Rows),
      EvaluationProtocolID: resolved.pipeline.EvaluationProtocolID || null,
      // The incumbent-score and slice columns serve an evaluation protocol's baselines and slices; this trainer reads neither.
      IncumbentScore: false,
      SliceFields: [],
      Files: files,
      EntityFactory: deps.entityFactory,
      ContextUser: deps.contextUser,
      ExistingByContentHash: (contentHash) => snapshots.FindByContentHash(contentHash),
    });
  }

  /**
   * The request settings a unit run trains with: the algorithm's driver key, the unit's problem type, the pipeline's
   * hyperparameters (a column that is not a JSON object sends none) and its validation.
   */
  private legacyRequestFor(resolved: ResolvedPipeline): LegacyRequestConfig {
    const hyper = JsonParse.ParseJsonText(resolved.pipeline.Hyperparameters || '{}', 'Hyperparameters');
    return {
      algorithm: resolved.algorithmDriverKey,
      problemType: resolved.problemType,
      hyperparameters: hyper.Ok && JsonParse.IsJsonObject(hyper.Value) ? hyper.Value : {},
      validation: this.buildValidationConfig(resolved.validation),
    };
  }

  /**
   * Train through the sidecar from the snapshot's rows (development rows trained on, locked-holdout rows scored once),
   * create the model row and complete the run. The run and model record the split the trainer was sent.
   */
  private async fitUnitModel(
    run: MJMLTrainingRunEntity,
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    content: SnapshotContent,
    deps: TrainingDeps,
    majorityBaselineRule: ReturnType<typeof EvaluationLineage.ParseMajorityBaselineRule>,
    lineage: UnitModelLineage,
    counts: UnitResolutionCounts,
    uncovered: readonly UncoveredRowsCount[],
    usdPerSecond: number | null,
  ): Promise<MJMLModelEntity> {
    const request = this.legacyRequestFor(resolved);
    const { Response: response, Split: split } = await SnapshotRetrainer.TrainOnSnapshot(content, request, deps.sidecar);
    const schema = { featureSchema: [...content.Header.featureSchema] };
    const evaluation = EvaluationLineage.Build(resolved.validation, {
      ValidationOutOfSample: response.validation_out_of_sample === true,
      ImportanceKind: response.feature_importance_kind || null,
      MajorityBaselineRule: majorityBaselineRule,
    });
    const dominance = this.checkLeakage(response, resolved.leakageGuard);
    const model = await this.createModelRow(resolved, input, schema, split, response, evaluation, deps, lineage);
    await this.finalizeUnitRunSuccess(run, model, schema, resolved, response, dominance, evaluation, counts, split, uncovered, request, usdPerSecond);
    return model;
  }

  /**
   * Assemble a unit pipeline's training matrix as of each unit row's decision date: the pipeline's steps resolve into
   * typed columns (the pipeline's LeakageGuard deny lists excluded) and the as-of assembler reads them. This is the one
   * assembly function training uses; the scoring path calls the same assembler with the columns and levels training
   * stored. With `prepared` (a training run) the pipeline, unit and rows already read are reused; without it (a check
   * that only needs the matrix) the pipeline, unit and rows are read here, and a pipeline without a unit is refused
   * (`unit-required`).
   *
   * @param pipelineId the `MJ: ML Training Pipelines` row
   * @param deps the training deps (provider, user and the unit seams; `history` defaults to complete Record Changes reads)
   * @param prepared what a training run has already read
   */
  public async AssembleForTraining(pipelineId: string, deps: TrainingDeps, prepared?: UnitAssemblyInputs): Promise<UnitTrainingAssembly> {
    const inputs = prepared || (await this.prepareUnitAssembly(pipelineId, deps));
    const { Resolved: resolved, Unit: unit, UnitRead: unitRead } = inputs;
    const exclusions = { denyFields: resolved.leakageGuard.DenyFields || [], denySources: resolved.leakageGuard.DenySources || [] };
    const resolution = FeatureResolver.ResolveFeatureColumns(resolved.featureSteps, unit, unitRead.RowEntity, inputs.Metadata, exclusions);
    if (resolution.Status === 'refused') return { Unit: unit, UnitRead: unitRead, Features: [], Assembled: resolution };
    const assembled = await new AsOfFeatureAssembler().Assemble({
      Context: 'train',
      Unit: unit,
      RowEntity: unitRead.RowEntity,
      Rows: unitRead.Rows.map((r) => ({ RowId: r.RowId, EntityKey: r.EntityKey, DecisionDate: r.DecisionDate, Period: r.Period })),
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
   * The series history a unit with a Temporal Spec reads its lags and rolling windows from: the unit rows' labels by
   * entity and period. Null for a unit without one.
   */
  public static SeriesHistoryFor(unit: PredictionUnitSpec, rows: readonly UnitRow[]): SeriesHistory | null {
    const temporal = unit.temporal;
    return temporal ? SeriesFeatures.BuildSeriesHistory(rows.map((r) => TrainingEngine.toPoint(r)), temporal) : null;
  }

  /** A unit row as a series point; a forecast row always has a period and a numeric label once the target is validated. */
  private static toPoint(r: UnitRow): SeriesPoint {
    if (r.Period === null) throw new Error(`TrainingEngine: unit row ${r.RowId} has no period, so it cannot be a series point`);
    if (typeof r.Label !== 'number') throw new Error(`TrainingEngine: unit row ${r.RowId} has the non-numeric label "${r.Label}", so it cannot be a series point`);
    return { EntityKey: r.EntityKey, Period: r.Period, Value: r.Label, RowId: r.RowId };
  }

  /** Read the pipeline, its unit and the unit's rows, for an assembly that is not part of a training run. */
  private async prepareUnitAssembly(pipelineId: string, deps: TrainingDeps): Promise<UnitAssemblyInputs> {
    const resolved = await this.resolvePipeline(pipelineId, deps);
    const unitId = resolved.pipeline.PredictionUnitID;
    if (!unitId) {
      throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-required', pipelineId: resolved.pipeline.ID, why: 'only a pipeline that points at a Prediction Unit is assembled as of decision dates' } });
    }
    const unit = await this.loadUnitSpec(unitId, deps);
    const seams = this.unitSeams(deps);
    const unitRead = await this.readUnitRows(unit, seams, deps);
    return { Resolved: resolved, Unit: unit, UnitRead: unitRead, DataAccess: seams.DataAccess, Metadata: seams.Metadata };
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

  /**
   * Mark a unit run `Completed` with the `completed` envelope: the unit resolution counts, the trainer's metrics and
   * the request settings it trained with. The run's Hyperparameters are the request's, so the run's two records of
   * them cannot disagree.
   */
  private async finalizeUnitRunSuccess(
    run: MJMLTrainingRunEntity,
    model: MJMLModelEntity,
    assembly: Pick<FeatureAssemblyResult, 'featureSchema'>,
    resolved: ResolvedPipeline,
    response: TrainResponse,
    dominance: DominanceResult,
    evaluation: EvaluationRecord,
    counts: UnitResolutionCounts,
    split: LockedHoldoutSplit,
    uncovered: readonly UncoveredRowsCount[],
    request: LegacyRequestConfig,
    usdPerSecond: number | null,
  ): Promise<void> {
    const results: TrainingRunResults = {
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts,
      legacy: { metrics: response.metrics ?? {}, holdoutMetrics: response.holdout_metrics ?? null, trainingRowCount: split.TrainingRowCount, holdoutRowCount: split.HoldoutRowCount },
      legacyRequest: request,
    };
    run.ResultingModelID = model.ID;
    run.FeaturesUsed = JSON.stringify(assembly.featureSchema.map((s) => s.Name));
    run.Hyperparameters = JSON.stringify(request.hyperparameters);
    run.ValidationResults = JSON.stringify(results);
    run.Status = 'Completed';
    run.CompletedAt = new Date();
    TrainingEngine.recordCompute(run, response, usdPerSecond);
    run.Notes = TrainingEngine.withUncoveredNote(this.buildRunNotes(dominance, evaluation), uncovered);
    await this.saveOrThrow(run, 'finalize ML Training Run');
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

  /** Mark the run `Completed`, attach the model + results, and record observations. */
  private async finalizeRunSuccess(
    run: MJMLTrainingRunEntity,
    model: MJMLModelEntity,
    assembly: FeatureAssemblyResult,
    resolved: ResolvedPipeline,
    response: TrainResponse,
    dominance: DominanceResult,
    evaluation: EvaluationRecord,
    usdPerSecond: number | null,
  ): Promise<void> {
    run.ResultingModelID = model.ID;
    run.FeaturesUsed = JSON.stringify(assembly.featureSchema.map((s) => s.Name));
    run.Hyperparameters = JSON.stringify(resolved.hyperparameters);
    run.ValidationResults = JSON.stringify({
      metrics: response.metrics,
      holdoutMetrics: response.holdout_metrics ?? null,
      validationStrategy: resolved.validation,
    });
    run.Status = 'Completed';
    run.CompletedAt = new Date();
    TrainingEngine.recordCompute(run, response, usdPerSecond);
    run.Notes = this.buildRunNotes(dominance, evaluation);
    await this.saveOrThrow(run, 'finalize ML Training Run');
  }

  /**
   * Record the compute a run really used: the sidecar's measured wall-clock training seconds, priced at the configured
   * rate (NULL when no rate is configured), never a constant.
   */
  private static recordCompute(run: MJMLTrainingRunEntity, response: TrainResponse, usdPerSecond: number | null): void {
    run.ComputeSeconds = response.duration_sec;
    run.ComputeCost = ComputePricing.ComputeCostFor(response.duration_sec, usdPerSecond);
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
  private buildRunNotes(dominance: DominanceResult, evaluation: EvaluationRecord): string {
    const base = dominance.Dominant
      ? `LEAKAGE WARNING: one field ("${dominance.TopFeature}") is doing almost all the predicting ` +
        `(${((dominance.TopShare ?? 0) * 100).toFixed(1)}% of total importance, over the ${(dominance.Threshold * 100).toFixed(0)}% threshold). ` +
        `This often means we are accidentally peeking at the answer. The model is kept in Draft and will NOT be ` +
        `auto-promoted: the promotion gate refuses it unless a promote request records a sign-off with a reason.`
      : 'Training completed. No single-feature dominance detected.';
    if (!evaluation.WithheldReason) {
      return base;
    }
    return (
      `${base} Trust withheld — ${evaluation.WithheldReason}: the pipeline declares '${evaluation.TimeIndexColumn}' as its time index, ` +
      'but the model was scored on rows from its own training period, not on later periods.'
    );
  }

  // region: assembly ------------------------------------------------------------

  /** Assemble the raw matrix + schema + preprocessing recipe (train context). */
  private async assemble(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<FeatureAssemblyResult> {
    return this.assembler.assemble({
      targetEntityName: resolved.targetEntityName,
      recordSet: { EntityName: resolved.targetEntityName, OrderBy: this.primaryKeyOrder(resolved.targetEntityName, deps), MaxRows: input.maxRows },
      sources: resolved.sourceBindings,
      steps: resolved.featureSteps,
      asOf: resolved.asOf,
      leakageGuard: resolved.leakageGuard,
      targetVariable: resolved.targetVariable,
      labelEventDates: input.labelEventDates,
      primaryKeyField: input.primaryKeyField,
      context: 'train',
      contextUser: deps.contextUser,
      provider: deps.provider,
    });
  }

  /**
   * The ORDER BY for the training read: the target entity's primary-key columns. Without it an uncapped read (the
   * default) has no ORDER BY at all, so the database may return rows in any order and the seeded holdout carve would
   * pick different rows between runs.
   */
  private primaryKeyOrder(targetEntityName: string, deps: TrainingDeps): string {
    const entity = deps.provider.EntityByName(targetEntityName);
    if (!entity || entity.PrimaryKeys.length === 0) {
      throw new Error(`TrainingEngine: target entity '${targetEntityName}' has no primary key in metadata, so its rows cannot be read in a fixed order.`);
    }
    return entity.PrimaryKeys.map((pk) => pk.Name).join(', ');
  }

  // region: validation + holdout ------------------------------------------------

  /**
   * Carve the locked holdout FIRST (§8.2), before any train/test split: a seeded sample of
   * `LockedHoldoutFraction` of the rows, stratified on the label for classification. The holdout
   * rows are never sent in the training `data`.
   */
  private carveLockedHoldout(matrix: MatrixData, resolved: ResolvedPipeline, seed: number): LockedHoldoutSplit {
    return LockedHoldoutSplitter.Carve(matrix, resolved.validation.LockedHoldoutFraction, resolved.targetVariable, resolved.problemType, seed);
  }

  /**
   * Translate the pipeline's {@link ValidationStrategy} into a sidecar {@link ValidationConfig}. The seed is sent
   * explicitly so the sidecar's splits use the same seed as the locked-holdout carve.
   */
  private buildValidationConfig(validation: ValidationStrategy): ValidationConfig {
    return {
      strategy: validation.Strategy,
      test_size: validation.TestSize,
      k: validation.K,
      random_state: DEFAULT_SPLIT_SEED,
    };
  }

  // region: leakage -------------------------------------------------------------

  /** Run the single-feature-dominance check against the leakage threshold (§6.4). */
  private checkLeakage(response: TrainResponse, guard: LeakageGuard): DominanceResult {
    return detectSingleFeatureDominance(response.feature_importance ?? {}, guard.SingleFeatureDominanceThreshold);
  }

  // region: model persistence ---------------------------------------------------

  /**
   * Persist the artifact, then create the immutable `MJ: ML Models` row in
   * `Draft` (never auto-promoted, even when leakage is clean — promotion is a
   * separate human/agent gate, §6.4 / PS-AGENT-7).
   */
  private async createModelRow(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    assembly: Pick<FeatureAssemblyResult, 'featureSchema'>,
    split: LockedHoldoutSplit,
    response: TrainResponse,
    evaluation: EvaluationRecord,
    deps: TrainingDeps,
    unitLineage: UnitModelLineage | null = null,
  ): Promise<MJMLModelEntity> {
    const version = await deps.recordLoader.nextModelVersion(resolved.pipeline.ID, deps.contextUser, deps.provider);
    const artifactName = `model-${resolved.pipeline.ID}-v${version}.bin`;
    const artifactFileId = await deps.artifactStore.save(decodeArtifact(response.artifact_b64), artifactName, deps.contextUser);

    const model = await deps.entityFactory.getEntityObject<MJMLModelEntity>('MJ: ML Models', deps.contextUser);
    model.PipelineID = resolved.pipeline.ID;
    model.Version = version;
    model.AlgorithmID = resolved.pipeline.AlgorithmID;
    model.ArtifactFileID = artifactFileId;
    model.FittedPreprocessing = JSON.stringify(response.fitted_preprocessing ?? ({} as FittedPreprocessing));
    model.FeatureSchema = JSON.stringify(assembly.featureSchema);
    model.TargetVariable = resolved.targetVariable;
    model.ProblemType = resolved.problemType;
    model.Metrics = JSON.stringify(response.metrics ?? {});
    if (response.holdout_metrics) {
      model.HoldoutMetrics = JSON.stringify(response.holdout_metrics);
    }
    model.FeatureImportance = JSON.stringify(response.feature_importance ?? {});
    model.Lineage = JSON.stringify(this.buildLineage(resolved, input, split, evaluation, unitLineage));
    model.TrainedAt = new Date();
    model.TrainingDurationSec = Math.round(response.duration_sec ?? 0);
    model.TrainingRowCount = response.training_row_count ?? split.TrainingRowCount;
    model.Status = 'Draft';

    await this.saveOrThrow(model, 'create ML Model');
    return model;
  }

  /**
   * Assemble the model lineage blob (provenance, §4.3). This blob must be
   * **self-contained enough to re-assemble features at score time** — the
   * scoring path ({@link MLModelInferenceProcessor}) reconstructs its assembly
   * config from `lineage.targetEntityName` / `sourceBindings` / `featureSteps` /
   * `asOfStrategy` when the pipeline row isn't separately loaded. Omitting
   * `targetEntityName` or `featureSteps` here would leave the model unable to
   * produce any feature columns at inference (train/serve break), so both are
   * persisted alongside the other provenance fields. A unit model adds its {@link UnitModelLineage}.
   */
  private buildLineage(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    split: LockedHoldoutSplit,
    evaluation: EvaluationRecord,
    unitLineage: UnitModelLineage | null,
  ): ModelTrainingLineage & Partial<UnitModelLineage> {
    return {
      ...(unitLineage || {}),
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
