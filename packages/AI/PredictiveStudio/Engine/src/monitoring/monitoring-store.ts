/**
 * @module monitoring/monitoring-store
 *
 * The monitoring job's production collaborators (M6.3), each on the job's provider as the job's user:
 *
 * | Seam | Production |
 * |---|---|
 * | {@link RunViewMonitoringStore} | `RunView` reads of models, units, bindings, `MJ: Feature Values`, publish records and period rows; the unit rows and their outcomes through PR 3's `PredictionUnitRowReader`; the training snapshot's matrix and the period's assembled rows for drift; the period row's upsert |
 * | {@link ScoringServiceMonitoringScorer} | `ScoringService.Predict` on the `monitoring` path, dry run |
 * | {@link SidecarMonitoringDrift} | the shared `MLSidecar`'s `/monitor/drift` |
 * | {@link AutomatedMonitoringPublisher} | the training engine (single-flight) and `AutomatedPublisher.EvaluateAndPublish` |
 * | {@link LifecycleMonitoringGate} | `LifecycleGate.Publish` |
 * | {@link ParityMonitoringCheck} | `ParityCheck.Sample` → `Recompute` → `Compare` |
 * | {@link UserNotificationMonitoringNotifier} | one `MJ: User Notifications` row |
 */
import { randomUUID } from 'node:crypto';
import type { MJFeatureValueEntity, MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLModelScoringBindingEntity, MJMLMonitoringResultEntity, MJUserNotificationEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID } from '@memberjunction/global';
import {
  JsonParse,
  MonitoringResultSchemas,
  PredictionUnit,
  RegistrySchemas,
  UtcDay,
  type Actor,
  type MetricWithInterval,
  type MonitorDriftRequest,
  type MonitorDriftResponse,
  type PredictionUnitSpec,
  type ScoredRow,
  type TaskType,
} from '@memberjunction/predictive-studio-core';

import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { RunViewDataAccess } from '../feature-assembly/data-access';
import { PredictionUnitRowReader, type UnitRow } from '../prediction-unit/unit-row-reader';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { ArtifactRegistry } from '../registry/artifact-registry';
import { AutomatedPublisher } from '../registry/automated-publisher';
import type { EvaluateOutcome, PublishOutcome, PublishRequest } from '../registry/gate-context';
import { GateContexts } from '../registry/gate-seams';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { RecordNotificationLinks } from '../registry/record-notification-links';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import { ScoringBindings } from '../scoring/scoring-binding';
import { PipelineAutoTrainer } from '../scoring/auto-train';
import { ParityCheck } from '../scoring/parity-check';
import type { ScoringContext } from '../scoring/scoring-context';
import { ScoringSeamDefaults, type ChallengerSelection } from '../scoring/scoring-seams';
import { ScoringService } from '../scoring/scoring-service';
import { MLSidecarProvider } from '../sidecar-provider';
import { SnapshotFiles } from '../snapshot/snapshot-serialization';
import { SnapshotManifest } from '../snapshot/snapshot-manifest';
import { StorageProviderSnapshotFileStore } from '../snapshot/snapshot-file-store';
import { RunViewTrainingSnapshotStore } from '../snapshot/training-snapshot-store';
import { MetadataEntityFactory } from '../training/seams';
import { ChallengerProtocol } from './challenger-protocol';
import type {
  DriftInputValues,
  IMonitoringDrift,
  IMonitoringGate,
  IMonitoringNotifier,
  IMonitoringParity,
  IMonitoringPublisher,
  IMonitoringScorer,
  IMonitoringStore,
  ModelPrediction,
  MonitoredBinding,
  MonitoredModel,
  MonitoredUnit,
  MonitoringPeriod,
  MonitoringSeams,
  PeriodGrain,
  PeriodRowWrite,
  Predecessor,
  RealisedOutcome,
  ShadowScoring,
  StoredPeriodRow,
  UnitRowInPeriod,
} from './monitoring-seams';

/** The period rows' entity. */
const RESULTS = 'MJ: ML Monitoring Results';

/** The stored rows monitoring reads and the period row it writes, over `RunView` and entity saves. */
export class RunViewMonitoringStore implements IMonitoringStore {
  /** @inheritdoc */
  public async LoadModel(modelId: string, ctx: RegistryContext): Promise<MJMLModelEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, ResultType: 'entity_object', MaxRows: 1 }, ctx); // pk-filter-ok: MJ core entity keyed by ID
    if (!r.Success) throw new Error(`Monitoring: reading ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** @inheritdoc */
  public TaskOf(model: MonitoredModel): TaskType {
    const parsed = RegistrySchemas.ParseOutputSemantics(model.OutputSemantics);
    if (parsed.Ok === false) throw new Error(`Monitoring: ML Model ${model.ID} has no readable OutputSemantics: ${parsed.Errors.join('; ')}`);
    return parsed.Value.task;
  }

  /** @inheritdoc */
  public async LoadUnit(unitId: string, ctx: RegistryContext): Promise<MonitoredUnit> {
    const row = await new RunViewPredictionUnitStore(ctx.Provider, ctx.ContextUser).Load(unitId);
    if (row === null) throw new Error(`Monitoring: Prediction Unit ${unitId} not found`);
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new Error(`Monitoring: Prediction Unit ${unitId} does not parse: ${parsed.Errors.join('; ')}`);
    return { ID: row.ID, Spec: parsed.Value, LabelWindowDays: row.LabelWindowDays, LabelGapDays: row.LabelGapDays, RowEntity: PredictionUnit.UnitRowEntityName(parsed.Value.rows) };
  }

  /**
   * @inheritdoc — the oldest `Active` binding when the pipeline has several; else the newest `Withdrawn` one with rows in
   * the period. A withdrawn binding whose view authorization the job's user does not hold is returned without probing its
   * rows (that user cannot see whether it scored the period), so the join records the missing authorization (D4-157).
   */
  public async BindingOf(pipelineId: string, modelId: string, period: MonitoringPeriod, ctx: RegistryContext): Promise<MonitoredBinding | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID' | 'Status'>>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `MLTrainingPipelineID='${EscapeSQLString(pipelineId)}'`,
      Fields: ['ID', 'MLTrainingPipelineID', 'Status'], OrderBy: '__mj_CreatedAt ASC', ResultType: 'simple',
    }, ctx);
    if (!r.Success) throw new Error(`Monitoring: reading the scoring bindings of pipeline ${pipelineId} failed: ${r.ErrorMessage}`);
    const active = r.Results.find((b) => b.Status === 'Active');
    if (active) return { ID: active.ID, MLTrainingPipelineID: active.MLTrainingPipelineID };
    for (const withdrawn of r.Results.filter((b) => b.Status === 'Withdrawn').reverse()) {
      if (!(await this.HoldsBindingView(withdrawn.ID, ctx))) return { ID: withdrawn.ID, MLTrainingPipelineID: withdrawn.MLTrainingPipelineID };
      if ((await this.ModelRows(modelId, withdrawn.ID, 'Champion', period, ctx)).length > 0) return { ID: withdrawn.ID, MLTrainingPipelineID: withdrawn.MLTrainingPipelineID };
    }
    return null;
  }

  /** @inheritdoc — the binding's `ViewAuthorizationID` read, then `ScoringBindings.CallerHoldsBinding` as the context user. */
  public async HoldsBindingView(bindingId: string, ctx: RegistryContext): Promise<boolean> {
    const r = await StoredRowReads.Run<Pick<MJMLModelScoringBindingEntity, 'ID' | 'ViewAuthorizationID'>>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${EscapeSQLString(bindingId)}'`, // pk-filter-ok: MJ core entity keyed by ID
      Fields: ['ID', 'ViewAuthorizationID'], MaxRows: 1, ResultType: 'simple',
    }, ctx);
    if (!r.Success) throw new Error(`Monitoring: reading scoring binding ${bindingId} failed: ${r.ErrorMessage}`);
    const binding = r.Results[0];
    return binding !== undefined && ScoringBindings.CallerHoldsBinding(binding, ctx);
  }

  /** @inheritdoc — of several rows of one record in the period, the one with the latest `EffectiveAsOf`. */
  public async ModelRows(modelId: string, bindingId: string, role: 'Champion' | 'Challenger', period: MonitoringPeriod, ctx: RegistryContext): Promise<ModelPrediction[]> {
    const r = await StoredRowReads.Run<Pick<MJFeatureValueEntity, 'RecordID' | 'EffectiveAsOf' | 'InTraining' | 'ValueNumeric' | 'ValueJSON'>>({
      EntityName: 'MJ: Feature Values',
      ExtraFilter: `Source='Model' AND Role='${role}' AND MLModelID='${EscapeSQLString(modelId)}' AND MLModelScoringBindingID='${EscapeSQLString(bindingId)}'`
        + ` AND EffectiveAsOf >= '${UtcDay.UtcDayIso(period.Start)}' AND EffectiveAsOf < '${UtcDay.UtcDayIso(period.End)}'`,
      Fields: ['RecordID', 'EffectiveAsOf', 'InTraining', 'ValueNumeric', 'ValueJSON'], OrderBy: 'EffectiveAsOf ASC', ResultType: 'simple', IgnoreMaxRows: true,
    }, ctx);
    if (!r.Success) throw new Error(`Monitoring: reading the ${role} rows of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    const latest = new Map<string, ModelPrediction>();
    for (const row of r.Results) {
      if (row.EffectiveAsOf === null || row.ValueNumeric === null) continue;
      latest.set(row.RecordID.toLowerCase(), {
        RecordID: row.RecordID, EffectiveAsOf: new Date(row.EffectiveAsOf), InTraining: row.InTraining === true, Score: row.ValueNumeric,
        Probabilities: RunViewMonitoringStore.probabilitiesOf(row.ValueJSON),
      });
    }
    return [...latest.values()];
  }

  /** @inheritdoc */
  public async UnitRowsInPeriod(unit: MonitoredUnit, period: MonitoringPeriod, now: Date, ctx: RegistryContext): Promise<UnitRowInPeriod[]> {
    const rows = await RunViewMonitoringStore.readUnit(unit, now, true, ctx);
    return rows.filter((r) => r.DecisionDate >= period.Start && r.DecisionDate < period.End).map((r) => ({ RecordID: r.RowID, DecisionDate: r.DecisionDate }));
  }

  /** @inheritdoc — the unit's rows read as of `now` (censoring rows whose window has not closed), with their labels. */
  public async Outcomes(unit: MonitoredUnit, recordIds: readonly string[], now: Date, ctx: RegistryContext): Promise<readonly RealisedOutcome[]> {
    const wanted = IndexByUUID(recordIds, (id) => id);
    const rows = await RunViewMonitoringStore.readUnit(unit, now, false, ctx);
    return rows.filter((r) => wanted.Has(r.RowID)).map((r) => ({ RecordID: r.RowID, DecisionDate: r.DecisionDate, Label: r.Label, GroupKey: r.GroupKey }));
  }

  /** @inheritdoc */
  public async ReferenceScore(modelId: string, ctx: RegistryContext): Promise<MetricWithInterval | null> {
    const record = await RunViewMonitoringStore.latestPublish(modelId, ctx);
    const evidence = record === null ? null : record.EvidenceObject;
    return evidence === null ? null : evidence.holdoutPrimary;
  }

  /** @inheritdoc */
  public async EarlierPeriods(modelId: string, grain: PeriodGrain, before: Date, ctx: RegistryContext): Promise<StoredPeriodRow[]> {
    const r = await StoredRowReads.Run<MJMLMonitoringResultEntity>({
      EntityName: RESULTS, ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND PeriodGrain='${EscapeSQLString(grain)}' AND Period < '${UtcDay.UtcDayIso(before)}'`,
      OrderBy: 'Period ASC', ResultType: 'entity_object', IgnoreMaxRows: true,
    }, ctx);
    if (!r.Success) throw new Error(`Monitoring: reading the period rows of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results.map((row) => RunViewMonitoringStore.storedRow(row));
  }

  /** @inheritdoc */
  public async Predecessor(modelId: string, ctx: RegistryContext): Promise<Predecessor | null> {
    const record = await RunViewMonitoringStore.latestPublish(modelId, ctx);
    if (record === null || !record.ReplacesModelID) return null;
    return { ModelID: record.ReplacesModelID, Model: await this.LoadModel(record.ReplacesModelID, ctx) };
  }

  /** @inheritdoc */
  public async ArtifactVerified(model: MonitoredModel, ctx: RegistryContext): Promise<{ readonly Verified: boolean; readonly Reason: string }> {
    if (!model.ArtifactFileID) return { Verified: false, Reason: 'the model has no stored artifact file' };
    const load = await ArtifactRegistry.ForContext(ctx, ScoringSeamDefaults.Resolve(undefined).ArtifactLoader).Load(model, ctx);
    return { Verified: load.Status === 'verified', Reason: `the stored artifact loads ${load.Status}` };
  }

  /** @inheritdoc */
  public async Challenger(binding: MonitoredBinding, asOf: Date, ctx: RegistryContext): Promise<ChallengerSelection | null> {
    return ScoringSeamDefaults.Resolve(undefined).Challengers.Challenger(await RunViewMonitoringStore.LoadBinding(binding.ID, ctx), asOf, ctx);
  }

  /**
   * The binding row by ID (the scoring paths read the full entity).
   *
   * @throws Error when the read fails or the binding is gone
   */
  public static async LoadBinding(bindingId: string, ctx: RegistryContext): Promise<MJMLModelScoringBindingEntity> {
    const r = await StoredRowReads.Run<MJMLModelScoringBindingEntity>({ EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `ID='${EscapeSQLString(bindingId)}'`, ResultType: 'entity_object', MaxRows: 1 }, ctx); // pk-filter-ok: MJ core entity keyed by ID
    if (!r.Success) throw new Error(`Monitoring: reading scoring binding ${bindingId} failed: ${r.ErrorMessage}`);
    const row = r.Results[0];
    if (!row) throw new Error(`Monitoring: scoring binding ${bindingId} is gone`);
    return row;
  }

  /**
   * @inheritdoc — the reference is every numeric feature column of the model's training snapshot matrix; the period's
   * values are the same columns of the period's records assembled by the model's own assembly, each as of its decision
   * date (the scoring path's assembly, so training and monitoring read one feature definition).
   */
  public async DriftInputs(model: MonitoredModel, unit: MonitoredUnit, recordIds: readonly string[], ctx: RegistryContext): Promise<DriftInputValues[]> {
    if (!model.TrainingSnapshotID || recordIds.length === 0) return [];
    const entity = await this.LoadModel(model.ID, ctx);
    if (entity === null) throw new Error(`Monitoring: ML Model ${model.ID} is gone`);
    const reference = await RunViewMonitoringStore.referenceColumns(model, ctx);
    const current = await RunViewMonitoringStore.periodColumns(entity, unit, recordIds, ctx);
    return [...reference.entries()].filter(([name]) => current.has(name)).map(([name, values]) => ({ Name: name, Reference: values, Current: current.get(name) || [] }));
  }

  /** @inheritdoc */
  public async WritePeriod(write: PeriodRowWrite, ctx: RegistryContext): Promise<string> {
    const existing = await StoredRowReads.Run<MJMLMonitoringResultEntity>({
      EntityName: RESULTS,
      ExtraFilter: `ModelID='${EscapeSQLString(write.ModelID)}' AND PeriodGrain='${EscapeSQLString(write.Period.Grain)}' AND Period='${UtcDay.UtcDayIso(write.Period.Start)}'`,
      ResultType: 'entity_object', MaxRows: 1,
    }, ctx);
    if (!existing.Success) throw new Error(`Monitoring: reading the period row of ML Model ${write.ModelID} failed: ${existing.ErrorMessage}`);
    let row = existing.Results[0];
    if (!row) {
      row = await ctx.Provider.GetEntityObject<MJMLMonitoringResultEntity>(RESULTS, ctx.ContextUser);
      row.NewRecord();
      row.ModelID = write.ModelID;
      row.PeriodGrain = write.Period.Grain;
      row.Period = write.Period.Start;
    }
    RunViewMonitoringStore.apply(row, write);
    if (await row.Save()) return row.ID;
    throw new Error(`Monitoring: saving the ${UtcDay.UtcDayIso(write.Period.Start)} period row of ML Model ${write.ModelID} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /**
   * The unit's rows through PR 3's reader, read completely as of `now` with the unit's censoring cutoff moved to `now`
   * (a training cutoff froze the snapshot; monitoring reads every label known by now); `keepOpen` keeps rows whose
   * window is still open.
   */
  private static async readUnit(unit: MonitoredUnit, now: Date, keepOpen: boolean, ctx: RegistryContext): Promise<readonly UnitRow[]> {
    const cutoff: PredictionUnitSpec['censoring']['cutoff'] = { kind: 'now' };
    const spec: PredictionUnitSpec = { ...unit.Spec, censoring: { ...unit.Spec.censoring, cutoff } };
    const read = await new PredictionUnitRowReader().Read(spec, {
      DataAccess: new RunViewDataAccess(ctx.ContextUser, ctx.Provider), Metadata: new ProviderAssemblyMetadata(ctx.Provider), Read: { mode: 'complete' }, Now: now, KeepOpenWindows: keepOpen,
    });
    if (read.Status === 'refused') throw new Error(`Monitoring: reading Prediction Unit ${unit.ID}'s rows was refused: ${JSON.stringify(read.Refusal)}`);
    return read.Rows;
  }

  /** The model's newest applied `publish` record (any purpose); null when it has none. */
  private static async latestPublish(modelId: string, ctx: RegistryContext): Promise<MJMLModelPublishRecordEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelPublishRecordEntity>({
      EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}' AND Kind='publish'`, OrderBy: 'RecordedAt DESC', ResultType: 'entity_object', MaxRows: 1,
    }, ctx);
    if (!r.Success) throw new Error(`Monitoring: reading the publish records of ML Model ${modelId} failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }

  /** The class probabilities a `Model` row's `ValueJSON` stores (`{ Probabilities: { class: p } }`); null for a regression. */
  private static probabilitiesOf(valueJson: string | null): Readonly<Record<string, number>> | null {
    if (valueJson === null) return null;
    const json = JsonParse.ParseJsonText(valueJson, 'ValueJSON');
    if (!json.Ok || !JsonParse.IsJsonObject(json.Value)) return null;
    const p = JsonParse.JsonObjectField(json.Value, 'Probabilities');
    if (p === null) return null;
    const out: Record<string, number> = {};
    for (const key of Object.keys(p)) {
      const v = JsonParse.JsonNumber(p, key);
      if (v !== null) out[key] = v;
    }
    return out;
  }

  /** A stored period row as the triggers read it back. @throws when a stored JSON column does not parse */
  private static storedRow(row: MJMLMonitoringResultEntity): StoredPeriodRow {
    const ok = <T>(r: { readonly Ok: true; readonly Value: T } | { readonly Ok: false; readonly Errors: readonly string[] }): T => {
      if (r.Ok === false) throw new Error(`Monitoring: the period row ${row.ID} does not parse: ${r.Errors.join('; ')}`);
      return r.Value;
    };
    return {
      Period: new Date(row.Period), State: row.State,
      Primary: row.PrimaryScore === null ? null : ok(MonitoringResultSchemas.ParsePrimaryScore(row.PrimaryScore)),
      Calibration: row.Calibration === null ? null : ok(MonitoringResultSchemas.ParseCalibration(row.Calibration)),
      TriggersFired: ok(MonitoringResultSchemas.ParseTriggersFired(row.TriggersFired)),
    };
  }

  /** Sets every measured column of the period row from the write (the JSON columns as their stored camelCase JSON). */
  private static apply(row: MJMLMonitoringResultEntity, w: PeriodRowWrite): void {
    const json = <T>(v: T | null): string | null => (v === null ? null : JSON.stringify(v));
    row.ScheduledJobRunID = w.ScheduledJobRunID;
    row.State = w.State;
    row.ScoredRows = w.ScoredRows;
    row.JoinedRows = w.JoinedRows;
    row.ExcludedInTrainingRows = w.ExcludedInTrainingRows;
    row.PrimaryScore = json(w.Primary);
    row.PrimaryValue = w.Primary === null ? null : w.Primary.value;
    row.PrimaryLower = w.Primary === null ? null : w.Primary.interval.lower;
    row.PrimaryUpper = w.Primary === null ? null : w.Primary.interval.upper;
    row.TrackedMetrics = json(w.Tracked);
    row.Calibration = json(w.Calibration);
    row.DriftLook = json(w.DriftLook);
    row.DriftAlarms = JSON.stringify(w.DriftAlarms);
    row.Parity = json(w.Parity);
    row.TriggersFired = JSON.stringify(w.TriggersFired);
    row.ChallengerRunID = w.ChallengerRunID;
    row.ChallengerResult = json(w.Challenger);
    row.RollbackCheck = json(w.Rollback);
    row.ErrorMessage = w.ErrorMessage;
  }

  /** The training snapshot matrix's numeric feature columns (booleans as 0/1), by column name. */
  private static async referenceColumns(model: MonitoredModel, ctx: RegistryContext): Promise<Map<string, number[]>> {
    const snapshotId = model.TrainingSnapshotID || '';
    const snapshot = await new RunViewTrainingSnapshotStore(ctx.Provider, ctx.ContextUser).LoadSnapshot(snapshotId);
    if (snapshot === null) throw new Error(`Monitoring: the Training Snapshot ${snapshotId} of ML Model ${model.ID} is gone`);
    const files = StorageProviderSnapshotFileStore.ForProviderName(new MetadataEntityFactory(ctx.Provider), ctx.Provider, ctx.ContextUser);
    const [matrix, manifest, provenance] = await Promise.all([files.Get(snapshot.MatrixFileID), files.Get(snapshot.RowManifestFileID), files.Get(snapshot.ProvenanceFileID)]);
    SnapshotManifest.VerifiedSha256('matrix', matrix, snapshot.MatrixSha256);
    const content = SnapshotFiles.ParseSnapshotFiles(matrix, manifest, provenance);
    const features = new Set(content.Header.featureColumns.map((c) => c.name));
    const out = new Map<string, number[]>();
    content.Header.columns.forEach((name, i) => {
      if (!features.has(name)) return;
      out.set(name, RunViewMonitoringStore.numeric(content.Rows.map((r) => r[i])));
    });
    return out;
  }

  /** The period's records assembled by the model's own assembly as of each row's decision date, by column name. */
  private static async periodColumns(model: MJMLModelEntity, unit: MonitoredUnit, recordIds: readonly string[], ctx: RegistryContext): Promise<Map<string, number[]>> {
    const scoringCtx: ScoringContext = { ContextUser: ctx.ContextUser, Provider: ctx.Provider, Path: 'monitoring', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null };
    const seams = ScoringSeamDefaults.Resolve(undefined);
    const load = await ArtifactRegistry.ForContext(ctx, seams.ArtifactLoader).Load(model, ctx);
    if (load.Status !== 'verified') throw new Error(`Monitoring: ML Model ${model.ID}'s artifact loads ${load.Status}, so its period inputs cannot be assembled`);
    const prepared = await seams.Runtime.Prepare(model, load.Bytes, scoringCtx);
    const entity = ctx.Provider.EntityByName(unit.RowEntity);
    if (!entity) throw new Error(`Monitoring: entity '${unit.RowEntity}' is not in the provider's metadata`);
    const assembly = await prepared.Assemble(recordIds, entity.FirstPrimaryKey.Name, 'unit-rule', unit.RowEntity, scoringCtx); // first-pk-ok: Feature Value RecordIDs are the bare single-column key
    if (assembly.Status !== 'assembled') throw new Error(`Monitoring: assembling ML Model ${model.ID}'s period inputs ended ${assembly.Status}`);
    const out = new Map<string, number[]>();
    assembly.Matrix.columns.forEach((name, i) => out.set(name, RunViewMonitoringStore.numeric(assembly.Matrix.rows.map((r) => r[i]))));
    return out;
  }

  /** The finite numbers of a column (booleans as 0/1); text and empty cells are left out. */
  private static numeric(cells: readonly (string | number | boolean | null | undefined | Date)[]): number[] {
    const out: number[] = [];
    for (const c of cells) {
      if (typeof c === 'boolean') out.push(c ? 1 : 0);
      else if (typeof c === 'number' && Number.isFinite(c)) out.push(c);
    }
    return out;
  }
}

/** Shadow scoring through `ScoringService.Predict` on the `monitoring` path: a dry run, nothing written. */
export class ScoringServiceMonitoringScorer implements IMonitoringScorer {
  /** @inheritdoc — one `Predict` per decision day, so each row is scored as of its own decision date. */
  public async Shadow(model: MonitoredModel, unit: MonitoredUnit, rows: readonly UnitRowInPeriod[], predecessorOf: string | null, ctx: RegistryContext): Promise<ShadowScoring> {
    const scoringCtx: ScoringContext = {
      ContextUser: ctx.ContextUser, Provider: ctx.Provider, Path: 'monitoring', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null, MonitoredSuccessorID: predecessorOf,
    };
    const requestedBy: Actor = { kind: 'system', component: 'monitoring' };
    const predictions: ModelPrediction[] = [];
    let last = '';
    for (const [day, ids] of ScoringServiceMonitoringScorer.byDay(rows)) {
      const p = await new ScoringService(scoringCtx).Predict({
        ScoringRunID: randomUUID().toUpperCase(), ModelID: model.ID, EntityMapping: null, AsOfDate: day, Read: { mode: 'complete' }, DryRun: true,
        Scope: { kind: 'record-ids', entity: unit.RowEntity, ids }, RequestedBy: requestedBy,
      });
      last = p.Result.ScoringRunID;
      if (p.Result.Status !== 'completed') {
        return { ScoringRunID: p.Result.ScoringRunID, Status: p.Result.Status, Reason: JSON.stringify(p.Result.Status === 'refused' ? p.Result.Reason : p.Result.FirstErrors), Predictions: [] };
      }
      predictions.push(...p.Rows.map((r) => ScoringServiceMonitoringScorer.prediction(r)));
    }
    return { ScoringRunID: last, Status: 'completed', Reason: null, Predictions: predictions };
  }

  /** The rows' record IDs grouped by decision day (ISO instant of 00:00 UTC), in day order. */
  private static byDay(rows: readonly UnitRowInPeriod[]): [string, string[]][] {
    const groups = new Map<string, string[]>();
    for (const r of [...rows].sort((a, b) => a.DecisionDate.getTime() - b.DecisionDate.getTime())) {
      const day = `${UtcDay.UtcDayIso(r.DecisionDate)}T00:00:00.000Z`;
      groups.set(day, [...(groups.get(day) || []), r.RecordID]);
    }
    return [...groups.entries()];
  }

  /** A scored row as a monitoring prediction: the adverse probability (or point) and the class probabilities. */
  private static prediction(r: ScoredRow): ModelPrediction {
    const output = r.output;
    if (output.kind === 'value') return { RecordID: r.recordId, EffectiveAsOf: new Date(r.asOfDate), InTraining: r.inTraining, Score: output.point, Probabilities: null };
    return {
      RecordID: r.recordId, EffectiveAsOf: new Date(r.asOfDate), InTraining: r.inTraining, Score: output.adverseProbability,
      Probabilities: Object.fromEntries(output.classOrder.map((c, i) => [c, output.probabilities[i]])),
    };
  }
}

/** Procedure M through the shared sidecar's `/monitor/drift`. */
export class SidecarMonitoringDrift implements IMonitoringDrift {
  /** @inheritdoc */
  public async MonitorDrift(request: MonitorDriftRequest): Promise<MonitorDriftResponse> {
    const sidecar = MLSidecarProvider.Instance.GetSidecar();
    await sidecar.Start();
    return sidecar.MonitorDrift(request);
  }
}

/** The challenger's training (single-flight, on a fresh snapshot) and its publish through `AutomatedPublisher`. */
export class AutomatedMonitoringPublisher implements IMonitoringPublisher {
  /** @inheritdoc */
  public async PrepareChallenger(pipelineId: string, initiator: Actor, now: Date, ctx: RegistryContext): Promise<string | null> {
    return ChallengerProtocol.Prepare(pipelineId, initiator, now, ctx);
  }

  /** @inheritdoc */
  public async Train(pipelineId: string, ctx: RegistryContext): Promise<{ readonly TrainingRunID: string; readonly ModelID: string | null }> {
    return PipelineAutoTrainer.TrainThroughEngine(pipelineId, ctx.Provider, ctx.ContextUser);
  }

  /** @inheritdoc */
  public async EvaluateAndPublish(trainingRunId: string, initiator: Actor, ctx: RegistryContext): Promise<PublishOutcome | EvaluateOutcome> {
    return new AutomatedPublisher().EvaluateAndPublish(trainingRunId, initiator, GateContexts.ForRequest(ctx));
  }
}

/** The rollback's publish through the lifecycle gate. */
export class LifecycleMonitoringGate implements IMonitoringGate {
  /** @inheritdoc */
  public async Publish(request: PublishRequest, ctx: RegistryContext): Promise<PublishOutcome> {
    return new LifecycleGate().Publish(request, GateContexts.ForRequest(ctx));
  }
}

/** M5's parity check: sample, recompute on the `parity` path, compare. */
export class ParityMonitoringCheck implements IMonitoringParity {
  /** @inheritdoc */
  public async Check(binding: MonitoredBinding, n: number, seed: number, tolerance: number, ctx: RegistryContext): Promise<{ readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean }> {
    const scoringCtx: ScoringContext = { ContextUser: ctx.ContextUser, Provider: ctx.Provider, Path: 'parity', OverwriteHumanValues: false, ProcessRunID: null, ScheduledJobRunID: null };
    const sample = await ParityCheck.Sample(await RunViewMonitoringStore.LoadBinding(binding.ID, ctx), n, seed, scoringCtx);
    if (sample.Rows.length === 0) return { Sampled: 0, MaxAbsDifference: 0, Passed: true };
    const recomputed = await ParityCheck.Recompute(sample, scoringCtx);
    return ParityCheck.Compare(sample.Rows, recomputed.Rows, tolerance);
  }
}

/** One `MJ: User Notifications` row, linked to the model's record. */
export class UserNotificationMonitoringNotifier implements IMonitoringNotifier {
  /** @inheritdoc */
  public async Notify(userId: string, title: string, message: string, modelId: string, ctx: RegistryContext): Promise<void> {
    const row = await ctx.Provider.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications', ctx.ContextUser);
    row.NewRecord();
    row.UserID = userId;
    row.Title = title;
    row.Message = message;
    row.Unread = true;
    row.ResourceTypeID = await RecordNotificationLinks.RecordsResourceTypeID(ctx.Provider, ctx.ContextUser, 'Predictive Studio monitoring', 'monitoring notification');
    row.ResourceRecordID = modelId;
    row.ResourceConfiguration = JSON.stringify({ Entity: 'MJ: ML Models', RecordID: modelId });
    if (!(await row.Save())) throw new Error(`Monitoring: saving the notification to user ${userId} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
  }
}

/** Resolves the monitoring seams over the production defaults. */
export class MonitoringSeamDefaults {
  /** `partial` with every collaborator it leaves out set to its production implementation. */
  public static Resolve(partial: Partial<MonitoringSeams>): MonitoringSeams {
    return {
      Store: partial.Store || new RunViewMonitoringStore(),
      Scorer: partial.Scorer || new ScoringServiceMonitoringScorer(),
      Drift: partial.Drift || new SidecarMonitoringDrift(),
      Publisher: partial.Publisher || new AutomatedMonitoringPublisher(),
      Gate: partial.Gate || new LifecycleMonitoringGate(),
      Parity: partial.Parity || new ParityMonitoringCheck(),
      Notifier: partial.Notifier || new UserNotificationMonitoringNotifier(),
      Clock: partial.Clock || { Now: () => new Date() },
    };
  }
}
