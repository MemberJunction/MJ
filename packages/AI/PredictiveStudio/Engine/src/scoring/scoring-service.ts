/**
 * @module scoring/scoring-service
 *
 * One `ScoringService` for every scoring path (§5.2, §5.8.3), constructed per call with the caller's context.
 *
 * - {@link ScoringService.Score} is the binding path and the only one that writes: it scores with the binding's
 *   pipeline's Published model (else its model kept serving while Unevaluated, D4-61) as of a date, writes one
 *   `MJ: ML Scoring Runs` row before any record is read, runs checks 1–3 before assembly and 4–6 after it, writes the
 *   scored rows per batch as `Source = 'Model'` Feature Values in one transaction each (a same-day re-run replaces, a new
 *   as-of date adds), copies into `TargetColumn` only where the as-of date is the binding's newest through
 *   {@link BindingHumanValueGuard}, and writes the live challenger's `Role = 'Challenger'` rows under their own run row
 *   in the same transaction (D4-37). Nothing is refreshed: `MJ: Latest Feature Values` is a live view (D-078).
 * - {@link ScoringService.Predict} is the model path; it records its run and writes no Feature Value and no column.
 *
 * A refusal writes the refused run row and nothing else. A batch in which any record fails writes nothing; the run
 * stops there and ends `failed` with counts and first errors, and the batches before it stay (D4-09). A binding
 * withdrawn while the run is in flight stops it the same way at the next batch, with no record counted failed.
 */
import { LogError, RunView, type BaseEntity, type EntityFieldInfo, type EntityInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLScoringRunEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { ModelValueRow, RecordModelValuesParams } from '@memberjunction/feature-pipelines';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import type { HumanValueQuestion } from '@memberjunction/record-set-processor';
import {
  RegistrySchemas,
  UtcDay,
  type PredictResponse,
  type ScoredRow,
  type ScoringRefusal,
  type ScoringRequest,
  type ScoringResult,
  type ScoringRowError,
  type ScoringScope,
  type TaskType,
} from '@memberjunction/predictive-studio-core';

import { PreChangeArtifacts } from '../migration/pre-change-artifacts';
import { ArtifactRegistry } from '../registry/artifact-registry';
import { ProviderTransactions } from '../registry/provider-transactions';
import { PUBLISH_LOCK_QUERIES, PublishLocks } from '../registry/publish-locks';
import { PublishRecords } from '../registry/publish-records';
import { StoredRowReads } from '../registry/stored-row-reads';
import { BindingHumanValueGuard, type BindingGuardSnapshot } from './binding-human-value-guard';
import { FeaturePinCheck } from './feature-pin-check';
import { MatrixToFeatureRows } from './ml-model-inference-processor';
import { ModelNeedsTrainingError, ModelNeedsTrainingMessage } from './model-readiness';
import { ModelValueRows, type ScoredRowContext } from './model-value-rows';
import { ScoringBindings } from './scoring-binding';
import { ScoringChecks, type ScoringAdmission } from './scoring-checks';
import type { ScoringContext } from './scoring-context';
import { SCORING_FIRST_ERRORS_MAX, ScoringRunRecorder, type ScoringRunRequestFields } from './scoring-run-recorder';
import { ScoringSeamDefaults, type IScoringPreparedModel, type ScoringAssembled, type ScoringServiceSeams } from './scoring-seams';

/** What `Predict` returns: the run's result plus the scored rows it did not store. */
export interface ScoringPrediction {
  readonly Result: ScoringResult;
  readonly Rows: readonly ScoredRow[];
}

/** One record's change a dry run's column copy would make (`Column` null for a binding with no column). */
export interface ColumnChangePreview {
  readonly RecordID: string;
  readonly Column: string | null;
  /** The column's value now (`unknown`: the column is config-named, as `HumanValueQuestion.CurrentValue` is). */
  readonly From: unknown; // unknown: a config-named column holds heterogeneous stored values; narrowed at use
  /** The value the copy would write (the scored value, for a binding with no column). */
  readonly To: unknown; // unknown: a config-named column holds heterogeneous stored values; narrowed at use
}

/** A model resolved for a call and how it is admitted. */
interface ResolvedModel {
  readonly Model: MJMLModelEntity;
  readonly Admission: ScoringAdmission;
}

/** A model that passed checks 1–3: its verified artifact hash and its prepared runtime. */
interface ReadyModel extends ResolvedModel {
  readonly Sha256: string;
  readonly Prepared: IScoringPreparedModel;
  readonly Task: TaskType | null;
}

/** The assembled scope of a call that passed checks 1–6. */
interface AssembledScope {
  readonly Ready: ReadyModel;
  /** The records to score: the scope's records less the skipped ones. */
  readonly RecordIDs: readonly string[];
  readonly Assembled: ScoringAssembled | null;
  /** The scope's records the assembly could not cover, each with why; they are counted skipped, never scored. */
  readonly Skipped: readonly ScoringRowError[];
  /** Every record of the scope, scored or skipped. */
  readonly Total: number;
}

/** The live challenger of a binding run: its ready model, its own run row and the run's records it samples. */
interface ChallengerRun {
  readonly Ready: ReadyModel;
  readonly Run: MJMLScoringRunEntity;
  /** The run's records in the challenger's sample. */
  readonly Sampled: ReadonlySet<string>;
  Active: boolean;
  Written: number;
}

/** One batch of assembled rows. */
interface AssembledBatch {
  readonly IDs: readonly string[];
  readonly Rows: ScoringAssembled['Matrix']['rows'];
  readonly Columns: readonly string[];
}

/** One planned column write of a batch. */
interface PlannedCopy {
  readonly Record: BaseEntity;
  readonly RecordID: string;
  readonly From: unknown; // unknown: a config-named column holds heterogeneous stored values; narrowed at use
  readonly To: unknown; // unknown: a config-named column holds heterogeneous stored values; narrowed at use
}

/** A failure of one batch, with the records it names. */
class BatchFailure extends Error {
  constructor(message: string, public readonly Errors: readonly ScoringRowError[]) {
    super(message);
    this.name = 'BatchFailure';
  }
}

/** The binding was withdrawn after the run began: the batch that saw it writes nothing and the run stops there. */
class BindingWithdrawnDuringRun extends Error {
  constructor(bindingId: string) {
    super(`the scoring binding ${bindingId} was withdrawn during the run; the remaining records were not scored`);
    this.name = 'BindingWithdrawnDuringRun';
  }
}

/** The scoring service: constructed per call with the caller's context. */
export class ScoringService {
  private readonly seams: ScoringServiceSeams;
  private preview: ColumnChangePreview[] = [];
  private scoredRows: ScoredRow[] = [];

  /** @param ctx the caller's user, provider, path and options; its `Seams` replace production collaborators */
  constructor(private readonly ctx: ScoringContext) {
    this.seams = ScoringSeamDefaults.Resolve(ctx.Seams);
  }

  /**
   * The binding path, and the only one that writes (D-058, §5.8.3): scores the scope with the binding's pipeline's
   * Published model as of `asOf` (normalised to 00:00 UTC of its date), writes `Source = 'Model'` Feature Values per
   * batch (and the challenger's `Role = 'Challenger'` rows when the binding names one), copies into `TargetColumn` when
   * set. `dryRun` writes nothing but the run row and keeps the column preview ({@link DryRunPreview}).
   */
  public async Score(binding: MJMLModelScoringBindingEntity, scope: ScoringScope, asOf: Date, dryRun: boolean): Promise<ScoringResult> {
    this.preview = [];
    this.scoredRows = [];
    const day = ScoringService.Normalize(asOf);
    const early = await this.refusalBeforeModel(binding, dryRun);
    if (early !== null) return this.refuseWithoutModel(binding, scope, day, dryRun, early);
    const resolved = await this.ResolvePublishedModel(binding);
    if ('kind' in resolved) return this.refuseWithoutModel(binding, scope, day, dryRun, resolved);
    const run = await this.OpenRun(resolved.Model, binding, scope, day, dryRun);
    try {
      return await this.scoreBinding(binding, resolved, run, scope, day, dryRun);
    } catch (e) {
      return this.failOnError(run, resolved.Model, e);
    }
  }

  /**
   * Checks a binding before any record is read, for a caller that scores the binding in batches (a bound Record
   * Process, one {@link Score} per batch): the binding's refusals, the model's resolution and checks 1–3 over `scope`.
   * A refusal writes its refused run row, as {@link Score} would, and is returned; null when the binding may score (no
   * run row is written).
   *
   * @throws ModelNeedsTrainingError when the resolved model has no artifact file (it was never trained)
   */
  public async Admit(binding: MJMLModelScoringBindingEntity, scope: ScoringScope, asOf: Date, dryRun: boolean): Promise<ScoringResult | null> {
    const day = ScoringService.Normalize(asOf);
    const early = await this.refusalBeforeModel(binding, dryRun);
    if (early !== null) return this.refuseWithoutModel(binding, scope, day, dryRun, early);
    const resolved = await this.ResolvePublishedModel(binding);
    if ('kind' in resolved) return this.refuseWithoutModel(binding, scope, day, dryRun, resolved);
    const ready = await this.RunChecksBeforeAssembly(resolved, binding.TargetEntity, scope, day);
    if (!('kind' in ready)) return null;
    const run = await this.OpenRun(resolved.Model, binding, scope, day, dryRun);
    return this.CloseRun(run, ScoringService.refused(run, resolved.Model.ID, ready));
  }

  /**
   * The model path; never writes a Feature Value or a column: Score Record Set without a binding, monitoring's shadow
   * run, parity. On the `monitoring` path every unit model is assembled with its unit rule (each row as of its own
   * decision date, D4-67), and the predecessor of `MonitoredSuccessorID` is admitted (D4-17).
   *
   * @throws ModelNeedsTrainingError when the model is not found (no run row is written: it would name no model)
   */
  public async Predict(request: ScoringRequest): Promise<ScoringPrediction> {
    const model = await this.loadModel(request.ModelID);
    if (model === null) throw new ModelNeedsTrainingError(`ScoringService.Predict: ML Model '${request.ModelID}' not found`);
    const resolved: ResolvedModel = { Model: model, Admission: await this.PredictAdmission(model) };
    const day = ScoringService.Normalize(new Date(request.AsOfDate));
    const fields: ScoringRunRequestFields = { ID: request.ScoringRunID, ReadPolicy: request.Read, RequestedBy: request.RequestedBy };
    const run = await ScoringRunRecorder.Open(model, null, request.Scope, day, request.DryRun, this.ctx, fields);
    try {
      return await this.predictModel(resolved, run, request, day);
    } catch (e) {
      return { Result: await this.failOnError(run, model, e), Rows: [] };
    }
  }

  /**
   * The champion rows this instance's last {@link Score} wrote (or, on a dry run, computed), batch by batch; a failed
   * batch's rows are not among them.
   */
  public ScoredRows(): readonly ScoredRow[] {
    return [...this.scoredRows];
  }

  /** The column changes of this instance's last dry run of {@link Score}; empty after a writing run. */
  public DryRunPreview(): readonly ColumnChangePreview[] {
    return [...this.preview];
  }

  /** 00:00 UTC of `asOf`'s date. @throws for an invalid date */
  public static Normalize(asOf: Date): Date {
    const day = UtcDay.ToUtcDay(asOf);
    if (day === null) throw new Error(`ScoringService: '${String(asOf)}' is not a valid as-of date`);
    return day;
  }

  /**
   * Refuses a caller who does not hold the binding's view authorization (`binding-not-authorized`, D4-60), through
   * `vwUserHeldAuthorizations`, before any Feature Value is read.
   */
  protected async CheckCallerHoldsBinding(binding: MJMLModelScoringBindingEntity): Promise<ScoringRefusal | null> {
    return (await ScoringBindings.CallerHoldsBinding(binding, this.ctx)) ? null : { kind: 'binding-not-authorized', bindingId: binding.ID };
  }

  /**
   * Refuses a run that would write Feature Values when the caller may not write `MJ: Feature Values`
   * (`feature-values-not-writable`, D4-165): it needs create (a new as-of date inserts) and update (a same-as-of re-run
   * replaces its rows in place). A check of the provider's entity permissions, no read, so the run fails closed before
   * its first batch instead of failing in it. An entity the provider does not describe refuses too.
   */
  protected CheckCallerWritesFeatureValues(): ScoringRefusal | null {
    const permissions = this.ctx.Provider.EntityByName('MJ: Feature Values')?.GetUserPermisions(this.ctx.ContextUser);
    if (permissions && permissions.CanCreate && permissions.CanUpdate) return null;
    return { kind: 'feature-values-not-writable', userId: this.ctx.ContextUser.ID };
  }

  /**
   * The pipeline's Published model (newest version), else its model kept serving while Unevaluated — its artifact
   * checked first when the registry job has not reached it yet ({@link MigrateServingArtifact}) — else
   * `no-published-model` (also when the serving model's row is gone after a failed check).
   */
  protected async ResolvePublishedModel(binding: MJMLModelScoringBindingEntity): Promise<ResolvedModel | ScoringRefusal> {
    const pipeline = EscapeSQLString(binding.MLTrainingPipelineID);
    const published = await this.readModels(`PipelineID='${pipeline}' AND Status='Published'`);
    if (published) return { Model: published, Admission: 'published' };
    const serving = await this.readModels(`PipelineID='${pipeline}' AND Status='Unevaluated' AND ServingWhileUnevaluated=1`);
    const checked = serving ? await this.MigrateServingArtifact(serving) : null;
    if (checked) return { Model: checked, Admission: 'serving-while-unevaluated' };
    return { kind: 'no-published-model', pipelineId: binding.MLTrainingPipelineID };
  }

  /**
   * A model served while Unevaluated whose artifact is still `unverified` (registered before the lifecycle gate, not yet
   * reached by the registry job's batch, §5.6 step 3) has it checked and recorded now, as the caller, through the
   * service's artifact loader ({@link PreChangeArtifacts.Migrate}), so serving never waits for the job. A check that
   * cannot finish (storage unreachable, or a caller who may not write the model or the file) is logged and the stored row
   * is read again and returned: the artifact check that follows refuses it `artifact-unverified`, and the job retries it.
   * Null when that row is gone: nothing is served from the object the failed check may have changed.
   */
  protected async MigrateServingArtifact(model: MJMLModelEntity): Promise<MJMLModelEntity | null> {
    if (model.ArtifactStatus !== 'unverified') return model;
    try {
      await PreChangeArtifacts.Migrate(model, this.ctx, this.seams.ArtifactLoader);
    } catch (error) {
      LogError(`ScoringService: checking the pre-change artifact of ML Model ${model.ID} before serving it failed; the registry job retries it: ${error instanceof Error ? error.message : String(error)}`);
      // The check may have changed the object before its save failed: serve the stored row, never an unsaved verification.
      return this.loadModel(model.ID);
    }
    return model;
  }

  /**
   * How `Predict` admits a model: kept serving while Unevaluated; the predecessor of the context's
   * `MonitoredSuccessorID` on the monitoring path, when the successor's latest applied `publish` record replaced it;
   * otherwise as the Published model (check 1 refuses any other status).
   */
  protected async PredictAdmission(model: MJMLModelEntity): Promise<ScoringAdmission> {
    if (model.Status === 'Unevaluated' && model.ServingWhileUnevaluated) return 'serving-while-unevaluated';
    const successor = this.ctx.Path === 'monitoring' ? this.ctx.MonitoredSuccessorID : null;
    if (model.Status !== 'Archived' || !successor) return 'published';
    const replaced = await PublishRecords.FindLatestReplaced(successor, this.ctx);
    return replaced !== null && UUIDsEqual(replaced, model.ID) ? 'predecessor' : 'published';
  }

  /**
   * Pin enforcement (PR 5 G7.6, §5.2.3): a model whose pinned Feature Pipeline version is not the pipeline's Active
   * version, or whose prediction pin's binding serves another Published model now, is refused
   * `feature-version-mismatch` before any record is read. Monitoring's predecessor model is exempt (D5-B3-2): it is
   * scored only to compare it with its successor, on the rows the successor reads, and writes nothing.
   */
  protected async CheckFeaturePins(resolved: ResolvedModel): Promise<ScoringRefusal | null> {
    if (resolved.Admission === 'predecessor') return null;
    return FeaturePinCheck.ForModel(resolved.Model, this.ctx.Provider, this.ctx.ContextUser);
  }

  /** The run row, `running`, before any record is read. */
  protected async OpenRun(model: MJMLModelEntity, binding: MJMLModelScoringBindingEntity | null, scope: ScoringScope, asOf: Date, dryRun: boolean): Promise<MJMLScoringRunEntity> {
    return ScoringRunRecorder.Open(model, binding, scope, asOf, dryRun, this.ctx);
  }

  /**
   * Checks 1–3: status and flags, a verified artifact (then the model is prepared), an as-of date its assembly can
   * serve, and the scope entity. Returns the ready model or the refusal. A non-verified load is recorded on the model
   * (`ArtifactStatus`, `ArtifactCheckedAt`) unless the model is the shadow challenger. First of all, the model's
   * Feature Value pins are compared with the versions in use ({@link CheckFeaturePins}), on every path.
   *
   * @throws ModelNeedsTrainingError when the model has no artifact file (it was never trained)
   */
  protected async RunChecksBeforeAssembly(resolved: ResolvedModel, bindingEntity: string | null, scope: ScoringScope, asOf: Date): Promise<ReadyModel | ScoringRefusal> {
    const model = resolved.Model;
    const pins = await this.CheckFeaturePins(resolved);
    if (pins !== null) return pins;
    const status = ScoringChecks.StatusAndFlags(model, resolved.Admission, resolved.Admission === 'serving-while-unevaluated' ? await this.pipelineLeakageGuard(model.PipelineID) : null);
    if (status !== null) return status;
    if (!model.ArtifactFileID) throw new ModelNeedsTrainingError(`ScoringService: ${ModelNeedsTrainingMessage(model.ID)}`);
    const load = await ArtifactRegistry.ForContext(this.ctx, this.seams.ArtifactLoader).Load(model, this.ctx);
    if (load.Status !== 'verified') {
      // Every scoring loader records what it found; the shadow challenger's load writes no ArtifactStatus of its own.
      if (resolved.Admission !== 'challenger') await ArtifactRegistry.RecordArtifactStatus(model, load, 'ScoringService');
      return ScoringChecks.Artifact(model.ID, load) || { kind: 'artifact-unverified', modelId: model.ID };
    }
    const prepared = await this.seams.Runtime.Prepare(model, load.Bytes, this.ctx);
    const unit = prepared.Loaded.unit;
    const asOfRefusal = ScoringChecks.AsOfSupported(model.ID, unit !== null, asOf, ScoringService.Normalize(this.seams.Clock.Now()));
    if (asOfRefusal !== null) return asOfRefusal;
    const scopeRefusal = ScoringChecks.ScopeEntity(scope.entity, unit !== null ? unit.RowEntity : prepared.Loaded.targetEntityName, bindingEntity);
    if (scopeRefusal !== null) return scopeRefusal;
    return { ...resolved, Sha256: load.Sha256, Prepared: prepared, Task: ScoringService.taskOf(model) };
  }

  /**
   * Assembles the records with PR 3's assembly: a `grain-x-periods` unit with its unit rule (each row dated by its own
   * decision date), every other model with the normalised as-of date (D4-66); on the monitoring path every unit model
   * with its unit rule (D4-67).
   */
  protected async Assemble(ready: ReadyModel, recordIds: readonly string[], keyField: string, asOf: Date, entityName: string): Promise<ScoringAssembled | ScoringRefusal> {
    const unit = ready.Prepared.Loaded.unit;
    const unitRule = unit !== null && (unit.Spec.rows.kind === 'grain-x-periods' || this.ctx.Path === 'monitoring');
    const assembly = await ready.Prepared.Assemble(recordIds, keyField, unitRule ? 'unit-rule' : asOf, entityName, this.ctx);
    if (assembly.Status === 'refused') return { kind: 'assembly-refused', refusal: assembly.Refusal };
    if (assembly.Status === 'missing-columns') return ScoringService.missingColumns(ready.Model, assembly.Columns);
    if (assembly.RowIDs.length + assembly.Skipped.length !== recordIds.length) {
      throw new Error(`ScoringService: assembly returned ${assembly.RowIDs.length} rows and ${assembly.Skipped.length} skipped for ${recordIds.length} records`);
    }
    return assembly;
  }

  /** Checks 4–6 (the complete read is checked by {@link ReadScope} and the assembly): the feature schema, then no empty column. */
  protected RunChecksAfterAssembly(model: MJMLModelEntity, assembled: ScoringAssembled): ScoringRefusal | null {
    return ScoringChecks.FeatureSchema(model, assembled) || ScoringChecks.NoEmptyColumn(assembled);
  }

  /**
   * The scope's record IDs and the scope entity's key field (check 4's complete read: a view or filter read that
   * returns fewer rows than it matched is `assembly-refused` with `truncated-read`).
   */
  protected async ReadScope(scope: ScoringScope): Promise<{ readonly RecordIDs: readonly string[]; readonly KeyField: string } | ScoringRefusal> {
    const entity = this.entityOf(scope.entity);
    const keyField = entity.FirstPrimaryKey.Name; // first-pk-ok: Feature Value RecordIDs are the bare single-column key
    if (scope.kind === 'record-ids') return { RecordIDs: [...new Set(scope.ids.map((id) => id.trim()).filter((id) => id.length > 0))], KeyField: keyField };
    const read = await RunView.FromMetadataProvider(this.ctx.Provider).RunView<Record<string, string>>({
      EntityName: entity.Name, Fields: [keyField], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
      ...(scope.kind === 'view' ? { ViewID: scope.userViewId } : { ExtraFilter: scope.extraFilter }),
    }, this.ctx.ContextUser);
    if (!read.Success) throw new Error(`ScoringService: reading the scope of ${entity.Name} failed: ${read.ErrorMessage}`);
    if (read.TotalRowCount > read.Results.length) return { kind: 'assembly-refused', refusal: { kind: 'truncated-read', entity: entity.Name, rowsExpected: read.TotalRowCount, rowsRead: read.Results.length } };
    return { RecordIDs: read.Results.map((r) => String(r[keyField])), KeyField: keyField };
  }

  /** One sidecar round trip for a batch's matrix rows; any record without a prediction fails the batch. */
  protected async PredictBatch(ready: ReadyModel, run: MJMLScoringRunEntity, rows: ScoringAssembled['Matrix']['rows'], recordIds: readonly string[], columns: readonly string[], asOf: Date): Promise<ScoredRow[]> {
    const loaded = ready.Prepared.Loaded;
    const response: PredictResponse = await this.seams.Sidecar.predict({
      artifact_b64: loaded.artifactB64, fitted_preprocessing: loaded.fittedPreprocessing, feature_schema: loaded.featureSchema,
      rows: MatrixToFeatureRows({ columns: [...columns], rows }, loaded.featureSchema),
    });
    const missing = recordIds.filter((_, i) => response.predictions[i] === undefined);
    if (missing.length > 0) throw new BatchFailure('the sidecar returned no prediction for the record', missing.map((recordId) => ({ recordId, message: 'the sidecar returned no prediction for the record' })));
    const context = this.rowContext(ready, run, asOf, response.classOrder);
    return recordIds.map((id, i) => ModelValueRows.FromPrediction(id, response.predictions[i], loaded.trainingRowIds.Has(id), context));
  }

  /**
   * One batch in one provider transaction. Its first statement reads the binding's stored `Status` under a shared lock
   * held to the batch's commit (`Predictive Studio: Lock Scoring Binding For Batch`, D4-289): a binding withdrawn since
   * the run began stops the run there with nothing written ({@link BindingWithdrawnDuringRun}), and a `Withdraw` that
   * starts while the batch is in flight waits at its status update (the lock's exclusive counterpart) until the batch
   * commits, then clears what it wrote. So no batch writes values or copies after `Withdraw` cleared them, under
   * `READ_COMMITTED_SNAPSHOT` too: the lock read is a locking read, never a row version. Then the column copy is planned
   * (its guard reads the binding's earlier rows), and the champion's rows, the challenger's rows and the column writes
   * follow. A dry run writes nothing, takes no lock, checks the status before its preview, and keeps the preview.
   * Returns the champion rows written.
   */
  protected async WriteBatch(binding: MJMLModelScoringBindingEntity, run: MJMLScoringRunEntity, rows: readonly ScoredRow[], challenger: { readonly Run: MJMLScoringRunEntity; readonly Rows: readonly ScoredRow[] } | null, asOf: Date, dryRun: boolean): Promise<number> {
    if (dryRun) {
      await this.assertNotWithdrawn(binding.ID);
      this.preview.push(...(await this.previewBatch(binding, run, rows, asOf)));
      return 0;
    }
    return ProviderTransactions.Run(this.ctx, `scoring batch of binding '${binding.ID}'`, async () => {
      await this.lockNotWithdrawn(binding.ID);
      const copies = await this.planCopies(binding, run, rows, asOf, true);
      await this.seams.Values.RecordModelValues(this.valuesParams(binding, run, rows, 'Champion', asOf));
      if (challenger !== null) await this.seams.Values.RecordModelValues(this.valuesParams(binding, challenger.Run, challenger.Rows, 'Challenger', asOf));
      await this.CopyToColumn(binding, copies);
      return rows.length;
    });
  }

  /** Saves the planned column writes, each through the target entity (Record Changes keeps the history). */
  protected async CopyToColumn(binding: MJMLModelScoringBindingEntity, copies: readonly PlannedCopy[]): Promise<void> {
    const column = binding.TargetColumn || '';
    for (const copy of copies) {
      copy.Record.Set(column, copy.To); // the column is named by the binding, so no generated property exists for it
      if (!(await copy.Record.Save())) throw new BatchFailure(`copying into ${column} failed`, [{ recordId: copy.RecordID, message: copy.Record.LatestResult?.CompleteMessage || 'unknown error' }]);
    }
  }

  /** Closes the run (and the challenger's) with the result. */
  protected async CloseRun(run: MJMLScoringRunEntity, result: ScoringResult): Promise<ScoringResult> {
    await ScoringRunRecorder.Close(run, result);
    return result;
  }

  // ----- the binding path ------------------------------------------------------------------------------------------

  /** Checks, assembly, the challenger and the batches of a binding run whose run row is open. */
  private async scoreBinding(binding: MJMLModelScoringBindingEntity, resolved: ResolvedModel, run: MJMLScoringRunEntity, scope: ScoringScope, day: Date, dryRun: boolean): Promise<ScoringResult> {
    const scoped = await this.assembleScope(resolved, binding.TargetEntity, scope, day);
    if ('kind' in scoped) return this.CloseRun(run, ScoringService.refused(run, resolved.Model.ID, scoped));
    const challenger = dryRun || scoped.Assembled === null ? null : await this.openChallenger(binding, scope, day, scoped.Assembled, scoped.RecordIDs);
    return this.scoreBatches(binding, scoped, run, challenger, day, dryRun);
  }

  /**
   * Checks 1–3, the scope read, the assembly and checks 4–6; an empty scope assembles nothing. Records the assembly
   * could not cover are carried as skipped, and a scope with none left to score is scored as an empty one.
   */
  private async assembleScope(resolved: ResolvedModel, bindingEntity: string | null, scope: ScoringScope, day: Date): Promise<AssembledScope | ScoringRefusal> {
    const ready = await this.RunChecksBeforeAssembly(resolved, bindingEntity, scope, day);
    if ('kind' in ready) return ready;
    const read = await this.ReadScope(scope);
    if ('kind' in read) return read;
    const total = read.RecordIDs.length;
    if (total === 0) return { Ready: ready, RecordIDs: [], Assembled: null, Skipped: [], Total: 0 };
    const assembled = await this.Assemble(ready, read.RecordIDs, read.KeyField, day, scope.entity);
    if ('kind' in assembled) return assembled;
    if (assembled.RowIDs.length === 0) return { Ready: ready, RecordIDs: [], Assembled: null, Skipped: assembled.Skipped, Total: total };
    const after = this.RunChecksAfterAssembly(ready.Model, assembled);
    return after !== null ? after : { Ready: ready, RecordIDs: assembled.RowIDs, Assembled: assembled, Skipped: assembled.Skipped, Total: total };
  }

  /** The batches: predict, write; the first failing batch ends the run `failed` with the batches before it kept. */
  private async scoreBatches(binding: MJMLModelScoringBindingEntity, scoped: AssembledScope, run: MJMLScoringRunEntity, challenger: ChallengerRun | null, day: Date, dryRun: boolean): Promise<ScoringResult> {
    const total = scoped.Total;
    for (const batch of this.batches(scoped)) {
      try {
        const rows = await this.PredictBatch(scoped.Ready, run, batch.Rows, batch.IDs, batch.Columns, day);
        const mirror = await this.mirrorBatch(challenger, batch, day);
        run.Written += await this.WriteBatch(binding, run, rows, mirror, day, dryRun);
        this.scoredRows.push(...rows);
        if (challenger !== null && mirror !== null) challenger.Written += mirror.Rows.length;
      } catch (e) {
        await this.closeChallenger(challenger);
        // A withdrawal fails no record: the batch wrote nothing, and its records and the rest count as skipped.
        return this.CloseRun(run, ScoringService.failed(run, scoped.Ready.Model, total, e instanceof BindingWithdrawnDuringRun ? [] : batch.IDs, e));
      }
    }
    await this.closeChallenger(challenger);
    return this.CloseRun(run, this.completed(scoped.Ready, run, total, dryRun, run.Written, scoped.Skipped));
  }

  /** The assembled rows in batches of the seams' batch size. */
  private *batches(scoped: AssembledScope): Generator<AssembledBatch> {
    if (scoped.Assembled === null) return;
    const size = this.seams.BatchSize;
    for (let i = 0; i < scoped.RecordIDs.length; i += size) {
      yield { IDs: scoped.RecordIDs.slice(i, i + size), Rows: scoped.Assembled.Matrix.rows.slice(i, i + size), Columns: scoped.Assembled.Matrix.columns };
    }
  }

  /**
   * The challenger's rows of a batch: its sampled records only, scored on the champion's assembled rows; null when the
   * batch has none. A challenger that fails is dropped (its run ends failed), the champion goes on.
   */
  private async mirrorBatch(challenger: ChallengerRun | null, batch: AssembledBatch, day: Date): Promise<{ readonly Run: MJMLScoringRunEntity; readonly Rows: readonly ScoredRow[] } | null> {
    if (challenger === null || !challenger.Active) return null;
    const sampled = ScoringService.sampledBatch(batch, challenger.Sampled);
    if (sampled.IDs.length === 0) return null;
    try {
      return { Run: challenger.Run, Rows: await this.PredictBatch(challenger.Ready, challenger.Run, sampled.Rows, sampled.IDs, sampled.Columns, day) };
    } catch (e) {
      challenger.Active = false;
      LogError(`ScoringService: challenger '${challenger.Ready.Model.ID}' stopped mirroring: ${e instanceof Error ? e.message : String(e)}`);
      await ScoringRunRecorder.Close(challenger.Run, ScoringService.failed(challenger.Run, challenger.Ready.Model, challenger.Sampled.size, sampled.IDs, e));
      return null;
    }
  }

  /** The records of `batch` in `sampled`, with their rows, in the batch's order. Pure. */
  private static sampledBatch(batch: AssembledBatch, sampled: ReadonlySet<string>): AssembledBatch {
    const at = batch.IDs.map((id, i) => (sampled.has(id) ? i : -1)).filter((i) => i >= 0);
    return { IDs: at.map((i) => batch.IDs[i]), Rows: at.map((i) => batch.Rows[i]), Columns: batch.Columns };
  }

  /**
   * The binding's named challenger with its run row, checked as every path is: 1–3 on its own row, then 4–6 against the
   * champion's assembled columns it will be scored on. One that cannot score gets a refused run and mirrors nothing; one
   * whose sample draws none of the run's records opens no run.
   */
  private async openChallenger(binding: MJMLModelScoringBindingEntity, scope: ScoringScope, day: Date, assembled: ScoringAssembled, recordIds: readonly string[]): Promise<ChallengerRun | null> {
    const selection = await this.seams.Challengers.Challenger(binding, day, this.ctx);
    if (selection === null) return null;
    const sampled = new Set(recordIds.filter((id) => selection.Sampled(id)));
    if (sampled.size === 0) return null;
    const model = await this.loadModel(selection.ModelID);
    if (model === null) return null;
    const run = await this.OpenRun(model, binding, scope, day, false);
    const ready = await this.RunChecksBeforeAssembly({ Model: model, Admission: 'challenger' }, binding.TargetEntity, scope, day);
    if ('kind' in ready) return this.refuseChallenger(run, model, ready);
    const after = this.RunChecksAfterAssembly(model, assembled);
    if (after !== null) return this.refuseChallenger(run, model, after);
    return { Ready: ready, Run: run, Sampled: sampled, Active: true, Written: 0 };
  }

  /** Closes a challenger's run refused; it mirrors nothing. */
  private async refuseChallenger(run: MJMLScoringRunEntity, model: MJMLModelEntity, reason: ScoringRefusal): Promise<null> {
    await ScoringRunRecorder.Close(run, ScoringService.refused(run, model.ID, reason));
    return null;
  }

  /** Closes an active challenger's run completed with what it wrote of its sampled records. */
  private async closeChallenger(challenger: ChallengerRun | null): Promise<void> {
    if (challenger === null || !challenger.Active) return;
    await ScoringRunRecorder.Close(challenger.Run, this.completed(challenger.Ready, challenger.Run, challenger.Sampled.size, false, challenger.Written));
  }

  // ----- the column copy -------------------------------------------------------------------------------------------

  /**
   * The column writes of a batch: records whose newest `Champion` row is not later than this as-of date, whose column
   * would change, and whose value is not a person's (unless `OverwriteHumanValues`). With `persist`, a kept person's
   * value is recorded as a Human row and an overwritten one is retired.
   */
  private async planCopies(binding: MJMLModelScoringBindingEntity, run: MJMLScoringRunEntity, rows: readonly ScoredRow[], asOf: Date, persist: boolean): Promise<PlannedCopy[]> {
    const column = binding.TargetColumn;
    const source = binding.TargetColumnSource;
    if (!column || !source || rows.length === 0) return [];
    const entity = this.entityOf(binding.TargetEntity || '');
    const field = entity.Fields.find((f) => f.Name.trim().toLowerCase() === column.trim().toLowerCase());
    const snapshot = await BindingHumanValueGuard.ReadSnapshot(binding, rows.map((r) => r.recordId), this.ctx);
    const newer = ScoringService.recordsWithNewerRows(snapshot, asOf);
    const records = await this.targetRecords(entity, rows.map((r) => r.recordId));
    const out: PlannedCopy[] = [];
    for (const row of rows) {
      const record = records.get(row.recordId.toLowerCase());
      if (!record || newer.has(row.recordId.toLowerCase())) continue;
      const to = ScoringBindings.ColumnValue(ScoringBindings.ResolveCopySource(source, ScoringBindings.ScoredValue(ModelValueRows.FromScoredRow(row, binding, run).Value)), field);
      const from = record.Get(column); // the column is named by the binding, so no generated property exists for it
      if (await this.copyAllowed(binding, snapshot, record, row.recordId, column, from, to, field, persist)) out.push({ Record: record, RecordID: row.recordId, From: from === undefined ? null : from, To: to });
    }
    return out;
  }

  /** Whether the copy writes the record: the value changes and, when the column holds one, it is not a person's to keep. */
  private async copyAllowed(binding: MJMLModelScoringBindingEntity, snapshot: BindingGuardSnapshot, record: BaseEntity, recordId: string, column: string, from: unknown, to: unknown, field: EntityFieldInfo | undefined, persist: boolean): Promise<boolean> { // unknown: a config-named column holds heterogeneous stored values; narrowed at use
    if (from === null || from === undefined || from === '') return to !== null && to !== undefined;
    if (ScoringBindings.IsCopiedValue(from, to)) return false;
    const guard = new BindingHumanValueGuard(binding, { EntityID: binding.TargetEntityID || '', RecordID: recordId, Record: record }, this.ctx, snapshot);
    const question: HumanValueQuestion = {
      FieldName: column, CurrentValue: from, Provider: this.ctx.Provider,
      Resolve: async (value) => ScoringBindings.ColumnValue(value, field), Equals: (stored, resolved) => ScoringBindings.IsCopiedValue(stored, resolved),
    };
    if (!(await guard.IsHumanOwned(question))) return true;
    if (!this.ctx.OverwriteHumanValues) {
      if (persist) await guard.RecordPreserved(column, from, this.ctx.Provider);
      return false;
    }
    if (persist) await guard.RetireHumanValue(column, this.ctx.Provider);
    return true;
  }

  /** A dry run's preview of a batch: the column change per record, or each record's scored value with no column. */
  private async previewBatch(binding: MJMLModelScoringBindingEntity, run: MJMLScoringRunEntity, rows: readonly ScoredRow[], asOf: Date): Promise<ColumnChangePreview[]> {
    if (!binding.TargetColumn || !binding.TargetColumnSource) {
      return rows.map((r) => ({ RecordID: r.recordId, Column: null, From: null, To: ModelValueRows.FromScoredRow(r, binding, run).Value.ValueNumeric }));
    }
    const column = binding.TargetColumn;
    return (await this.planCopies(binding, run, rows, asOf, false)).map((c) => ({ RecordID: c.RecordID, Column: column, From: c.From, To: c.To }));
  }

  /** The records (lower-cased) holding a `Champion` row of the binding dated after `asOf`: a backfill never overwrites them. Pure. */
  private static recordsWithNewerRows(snapshot: BindingGuardSnapshot, asOf: Date): Set<string> {
    return new Set([...snapshot.Champion].filter(([, rows]) => rows.some((r) => ScoringBindings.Time(r.EffectiveAsOf) > asOf.getTime())).map(([key]) => key));
  }

  /** The target records by lower-cased key, as entity objects. One read. */
  private async targetRecords(entity: EntityInfo, recordIds: readonly string[]): Promise<Map<string, BaseEntity>> {
    const key = entity.FirstPrimaryKey.Name; // first-pk-ok: Feature Value RecordIDs are the bare single-column key
    const read = await RunView.FromMetadataProvider(this.ctx.Provider).RunView<BaseEntity>(
      { EntityName: entity.Name, ExtraFilter: `${key} IN (${ScoringService.inList(recordIds)})`, ResultType: 'entity_object', BypassCache: true }, this.ctx.ContextUser);
    if (!read.Success) throw new Error(`ScoringService: reading ${entity.Name} records failed: ${read.ErrorMessage}`);
    return new Map(read.Results.map((r) => [String(r.Get(key)).toLowerCase(), r]));
  }

  // ----- the model path --------------------------------------------------------------------------------------------

  /** Checks, assembly and the predicted batches of a model-path call whose run row is open; nothing is written. */
  private async predictModel(resolved: ResolvedModel, run: MJMLScoringRunEntity, request: ScoringRequest, day: Date): Promise<ScoringPrediction> {
    const scoped = await this.assembleScope(resolved, null, request.Scope, day);
    if ('kind' in scoped) return { Result: await this.CloseRun(run, ScoringService.refused(run, resolved.Model.ID, scoped)), Rows: [] };
    const rows: ScoredRow[] = [];
    for (const batch of this.batches(scoped)) {
      try {
        rows.push(...(await this.PredictBatch(scoped.Ready, run, batch.Rows, batch.IDs, batch.Columns, day)));
      } catch (e) {
        return { Result: await this.CloseRun(run, ScoringService.failed(run, resolved.Model, scoped.Total, batch.IDs, e)), Rows: rows };
      }
    }
    return { Result: await this.CloseRun(run, this.completed(scoped.Ready, run, scoped.Total, request.DryRun, 0, scoped.Skipped)), Rows: rows };
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /**
   * Refusals that need no model: a caller without the binding's authorization (it reads only the held
   * authorizations), then a writing run's caller who may not create Feature Values (no read), then a withdrawn binding.
   * All come before any record or Feature Value is read. Withdrawal is judged on the binding's stored row, not on the
   * caller's object: a caller holding a binding loaded before a withdrawal (a scheduled run in flight, a request racing
   * the withdrawal) must not write after the withdrawal cleared the binding's copies.
   */
  private async refusalBeforeModel(binding: MJMLModelScoringBindingEntity, dryRun: boolean): Promise<ScoringRefusal | null> {
    if (!binding.TargetEntityID || !binding.TargetEntity) throw new Error(`ScoringService: binding '${binding.ID}' has no target entity`);
    const authorization = await this.CheckCallerHoldsBinding(binding);
    if (authorization !== null) return authorization;
    const writable = dryRun ? null : this.CheckCallerWritesFeatureValues();
    if (writable !== null) return writable;
    return (await this.storedBindingStatus(binding.ID)) === 'Withdrawn' ? { kind: 'binding-withdrawn', bindingId: binding.ID } : null;
  }

  /** @throws BindingWithdrawnDuringRun when the binding's stored `Status` is now `Withdrawn` */
  private async assertNotWithdrawn(bindingId: string): Promise<void> {
    if ((await this.storedBindingStatus(bindingId)) === 'Withdrawn') throw new BindingWithdrawnDuringRun(bindingId);
  }

  /**
   * Takes the batch's shared lock on the binding row (held to the transaction's end) and reads its `Status` through it.
   * Must run inside the batch's transaction.
   *
   * @throws BindingWithdrawnDuringRun when the binding's stored `Status` is now `Withdrawn`
   * @throws Error when the query fails or the binding row is gone
   */
  private async lockNotWithdrawn(bindingId: string): Promise<void> {
    const read = await PublishLocks.RunStored(PUBLISH_LOCK_QUERIES.LockScoringBindingForBatch, { BindingID: bindingId }, this.ctx);
    if (!read.Success) throw new Error(`ScoringService: locking binding '${bindingId}' for the batch failed: ${read.ErrorMessage}`);
    const row = read.Results[0];
    if (!row) throw new Error(`ScoringService: binding '${bindingId}' no longer exists`);
    if (row['Status'] === 'Withdrawn') throw new BindingWithdrawnDuringRun(bindingId);
  }

  /**
   * The binding's stored `Status`, read past the cache.
   *
   * @throws Error when the read fails or the binding row is gone (a failed read is not an absent row)
   */
  private async storedBindingStatus(bindingId: string): Promise<MJMLModelScoringBindingEntity['Status']> {
    const read = await StoredRowReads.Run<Pick<MJMLModelScoringBindingEntity, 'ID' | 'Status'>>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${EscapeSQLString(bindingId)}'`, Fields: ['ID', 'Status'], ResultType: 'simple', MaxRows: 1, // pk-filter-ok: MJ core entity keyed by ID
    }, this.ctx);
    if (!read.Success) throw new Error(`ScoringService: reading the status of binding '${bindingId}' failed: ${read.ErrorMessage}`);
    const row = read.Results[0];
    if (!row) throw new Error(`ScoringService: binding '${bindingId}' no longer exists`);
    return row.Status;
  }

  /** A refusal before a model was resolved: one refused run row with no model. */
  private async refuseWithoutModel(binding: MJMLModelScoringBindingEntity, scope: ScoringScope, day: Date, dryRun: boolean, reason: ScoringRefusal): Promise<ScoringResult> {
    const run = await ScoringRunRecorder.Open(null, binding, scope, day, dryRun, this.ctx);
    await ScoringRunRecorder.Close(run, ScoringService.refused(run, null, reason));
    // A model-less run is first saved by Close, so its ID exists only now.
    return ScoringService.refused(run, null, reason);
  }

  /** An unexpected error after the run opened: the run ends failed, nothing of the failing batch kept. */
  private async failOnError(run: MJMLScoringRunEntity, model: MJMLModelEntity, e: unknown): Promise<ScoringResult> {
    LogError(`ScoringService: scoring with model '${model.ID}' failed: ${e instanceof Error ? e.message : String(e)}`);
    return this.CloseRun(run, ScoringService.failed(run, model, run.Total, [], e));
  }

  /** The completed result; `SkippedRecords` only when the assembly skipped any. */
  private completed(ready: ReadyModel, run: MJMLScoringRunEntity, total: number, dryRun: boolean, written: number = run.Written, skipped: readonly ScoringRowError[] = []): ScoringResult {
    const result: ScoringResult = { Status: 'completed', ScoringRunID: run.ID, ModelID: ready.Model.ID, ModelVersion: ready.Model.Version, ArtifactSha256: ready.Sha256, Total: total, Written: written, DryRun: dryRun };
    return skipped.length > 0 ? { ...result, SkippedRecords: [...skipped] } : result;
  }

  /**
   * The check-5 refusal of a scope whose rows lack feature columns the model reads: they are its missing columns (a
   * renamed or dropped column of the scope's entity is never re-read from the training entity).
   */
  private static missingColumns(model: MJMLModelEntity, columns: readonly string[]): ScoringRefusal {
    return { kind: 'feature-schema-mismatch', expectedHash: model.FeatureSchemaHash?.trim() || '', actualHash: '', missingColumns: [...columns], extraColumns: [], typeMismatches: [] };
  }

  /** The refused result. */
  private static refused(run: MJMLScoringRunEntity, modelId: string | null, reason: ScoringRefusal): ScoringResult {
    return { Status: 'refused', ScoringRunID: run.ID, ModelID: modelId, Reason: reason };
  }

  /** The failed result of a failing batch: its records counted failed, their errors (at most 20) stored. */
  private static failed(run: MJMLScoringRunEntity, model: MJMLModelEntity, total: number, batchIds: readonly string[], e: unknown): ScoringResult {
    const message = e instanceof Error ? e.message : String(e);
    const errors = e instanceof BatchFailure ? e.Errors : batchIds.map((recordId) => ({ recordId, message }));
    const firstErrors = errors.length > 0 ? errors.slice(0, SCORING_FIRST_ERRORS_MAX) : [{ recordId: '', message }];
    return { Status: 'failed', ScoringRunID: run.ID, ModelID: model.ID, ModelVersion: model.Version, Total: total, Failed: batchIds.length, FirstErrors: firstErrors };
  }

  /** The Feature Value write of a batch's rows of one role. */
  private valuesParams(binding: MJMLModelScoringBindingEntity, run: MJMLScoringRunEntity, rows: readonly ScoredRow[], role: RecordModelValuesParams['Role'], asOf: Date): RecordModelValuesParams {
    const values: ModelValueRow[] = rows.map((r) => ModelValueRows.FromScoredRow(r, binding, run));
    return {
      MLModelScoringBindingID: binding.ID, EntityID: binding.TargetEntityID || '', FeatureName: binding.FeatureName, Role: role,
      MLModelID: run.ModelID || '', MLScoringRunID: run.ID, EffectiveAsOf: asOf, ProcessRunID: this.ctx.ProcessRunID,
      Rows: values, ContextUser: this.ctx.ContextUser, Provider: this.ctx.Provider,
    };
  }

  /** What a prediction of `ready` is scored against in `run`. */
  private rowContext(ready: ReadyModel, run: MJMLScoringRunEntity, asOf: Date, classOrder: readonly string[] | null): ScoredRowContext {
    const task = ready.Task;
    const fallback = task !== null && (task.kind === 'binary' || task.kind === 'multiclass') ? task.classOrder : ready.Model.ProblemType === 'classification' ? ['0', '1'] : null;
    return {
      ModelID: ready.Model.ID, ModelVersion: ready.Model.Version, ArtifactSha256: ready.Sha256, FeatureSchemaHash: ready.Model.FeatureSchemaHash || '',
      ScoringRunID: run.ID, AsOf: asOf, Task: task, ClassOrder: classOrder || fallback,
    };
  }

  /** The model's task from its `OutputSemantics`; null for a model without one (a pre-change model). */
  private static taskOf(model: MJMLModelEntity): TaskType | null {
    if (!model.OutputSemantics) return null;
    const parsed = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    return parsed.Ok ? parsed.Value.task : null;
  }

  /** The newest model (by version) matching `filter`, read past the cache; null for none. */
  private async readModels(filter: string): Promise<MJMLModelEntity | null> {
    const read = await StoredRowReads.Run<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: filter, OrderBy: 'Version DESC', ResultType: 'entity_object', MaxRows: 1 }, this.ctx);
    if (!read.Success) throw new Error(`ScoringService: reading ML Models failed: ${read.ErrorMessage}`);
    return read.Results[0] || null;
  }

  /** One model by ID, read past the cache; null when it is gone. */
  private async loadModel(modelId: string): Promise<MJMLModelEntity | null> {
    return this.readModels(`ID='${EscapeSQLString(modelId)}'`); // pk-filter-ok: MJ: ML Models is an MJ core entity keyed by ID
  }

  /** The pipeline's stored `LeakageGuard` JSON (check 1's dominance threshold). */
  private async pipelineLeakageGuard(pipelineId: string): Promise<string | null> {
    const read = await StoredRowReads.Run<Pick<MJMLTrainingPipelineEntity, 'ID' | 'LeakageGuard'>>({
      EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID='${EscapeSQLString(pipelineId)}'`, Fields: ['ID', 'LeakageGuard'], ResultType: 'simple', MaxRows: 1, // pk-filter-ok: MJ core entity keyed by ID
    }, this.ctx);
    if (!read.Success) throw new Error(`ScoringService: reading ML Training Pipeline '${pipelineId}' failed: ${read.ErrorMessage}`);
    return read.Results[0]?.LeakageGuard || null;
  }

  /** The provider's entity of that name. @throws when the provider does not describe it */
  private entityOf(name: string): EntityInfo {
    const entity = this.ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`ScoringService: entity '${name}' is not in the provider's metadata`);
    return entity;
  }

  /** IDs as a quoted, escaped `IN (…)` list body (a batch's records: at most the batch size). */
  private static inList(ids: readonly string[]): string {
    return ids.map((id) => `'${EscapeSQLString(id)}'`).join(',');
  }
}
