/**
 * ps-rig-lifecycle.ts — what every Predictive Studio rig does around its own proof: resolve the driver's ML Algorithm
 * row, give a legacy-shaped pipeline its Prediction Unit and Evaluation Protocol, and delete everything a run created,
 * children first, with every Delete() checked.
 *
 * The unit and protocol are bound by the pipeline migration (`PipelineMigration.EnsurePipelineUnitAndProtocol`), the
 * call the truth-suite harness makes for the containment gates' pipelines; the cleanup is the harness's own
 * (`HarnessCleanup.DeleteRecorded` over a `RunRecords`), which removes scoring bindings and Record Processes, training
 * runs, models, Training Snapshots with their stored files, pipelines, Evaluation Protocols and Prediction Units in
 * foreign-key order. Before that it deletes the per-model scoring Action that promoting a model to Published generates
 * (`Score with <pipeline> v<version>`, its `ModelID` param defaulting to the model's ID) with its params, which the
 * harness cleanup does not know about.
 *
 * Every read and write goes through the provider the caller passes. The in-process rigs pass the server provider; the
 * over-the-wire (`ps-live-*`) rigs pass their `GraphQLDataProvider`, so the unit, protocol and pipeline are saved over
 * GraphQL and validated by the server entities, and cleanup's reads and deletes go over the same wire. Only
 * {@link TrainBoundPipeline} trains in this process; an over-the-wire rig binds with {@link BindUnitAndProtocol} and
 * trains through the `PredictiveStudio.TrainModel` Remote Operation.
 */
import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJActionEntity, MJActionParamEntity, MJMLAlgorithmEntity, MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, GroupByUUID } from '@memberjunction/global';
import { UtcDay } from '@memberjunction/predictive-studio-core';
import { MetadataEntityFactory, PipelineMigration, TrainingDelegation, TrainingEngine } from '@memberjunction/predictive-studio';
import { HarnessCleanup, type RunRecords } from '@memberjunction/predictive-studio-truth-suite';

/** The ML Algorithm row a rig trains with, and whether the rig created it (only then does cleanup delete it). */
export interface RigAlgorithm {
  readonly ID: string;
  readonly Created: boolean;
}

/**
 * The ML Algorithm whose Name or DriverClass is `driverKey`, created when none exists. Matching on either column keeps
 * a second row with the same driver from being created, which would make the builder's algorithm name ambiguous.
 */
export async function EnsureDriverAlgorithm(provider: IMetadataProvider, user: UserInfo, driverKey: string, tag: string): Promise<RigAlgorithm> {
  const key = EscapeSQLString(driverKey);
  const existing = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLAlgorithmEntity, 'ID'>>(
    { EntityName: 'MJ: ML Algorithms', ExtraFilter: `Name='${key}' OR DriverClass='${key}'`, Fields: ['ID'], ResultType: 'simple', MaxRows: 1 },
    user,
  );
  if (!existing.Success) throw new Error(`Reading MJ: ML Algorithms failed: ${existing.ErrorMessage}`);
  if (existing.Results.length > 0) return { ID: existing.Results[0].ID, Created: false };
  const algo = await provider.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
  algo.NewRecord();
  algo.Name = driverKey;
  algo.Description = tag;
  algo.ProblemTypes = 'classification';
  algo.DriverClass = driverKey;
  algo.SupportsFeatureImportance = true;
  algo.Status = 'Active';
  if (!(await algo.Save())) throw new Error(`Creating ML Algorithm '${driverKey}' failed: ${algo.LatestResult?.CompleteMessage}`);
  return { ID: algo.ID, Created: true };
}

/**
 * Binds version 1 of the pipeline's Prediction Unit and Evaluation Protocol through the pipeline migration and records
 * both for cleanup. Throws with the migration's reason unless the pipeline was migrated: a pipeline without a unit and
 * protocol is refused at training (`unit-required`).
 */
export async function BindUnitAndProtocol(provider: IMetadataProvider, user: UserInfo, pipeline: MJMLTrainingPipelineEntity, records: RunRecords): Promise<void> {
  const deps = { Provider: provider, User: user, EntityFactory: new MetadataEntityFactory(provider), Today: UtcDay.UtcDayIso(new Date()) };
  const row = await PipelineMigration.EnsurePipelineUnitAndProtocol(pipeline, deps, false);
  records.RecordPipelineBindings(pipeline);
  if (row.Action !== 'migrated') {
    throw new Error(`Pipeline ${pipeline.ID}: the migration ${row.Action} it (${row.Reason || 'no reason'}), so it has no Prediction Unit and Evaluation Protocol to train under.`);
  }
}

/** One training of a rig's pipeline: the model it shipped, or why it shipped none. */
export interface RigTraining {
  /** The Draft model the run's stored gate decision shipped; null when it shipped none. */
  readonly Model: MJMLModelEntity | null;
  /** The run's stored reason for shipping no model; null when it shipped one. */
  readonly NoModelReason: string | null;
  readonly RunID: string;
}

/**
 * Binds the pipeline's unit and protocol ({@link BindUnitAndProtocol}), trains it in-process through the training
 * engine and records the model it shipped for cleanup.
 */
export async function TrainBoundPipeline(provider: IMetadataProvider, user: UserInfo, pipeline: MJMLTrainingPipelineEntity, records: RunRecords, sidecarVersion: string): Promise<RigTraining> {
  await BindUnitAndProtocol(provider, user, pipeline, records);
  console.log(`  Bound Prediction Unit ${pipeline.PredictionUnitID} and Evaluation Protocol ${pipeline.EvaluationProtocolID}`);
  const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId: pipeline.ID, sidecarVersion }, provider, user);
  if (result.model !== null) records.RecordModel(result.model.ID);
  return { Model: result.model, NoModelReason: result.model === null ? TrainingEngine.NoModelReason(result) : null, RunID: result.run.ID };
}

/**
 * Records the Prediction Unit and Evaluation Protocol of each pipeline (read back by ID), for a rig whose pipelines
 * were created and bound by the product (the Pipeline Builder), not by the rig.
 */
export async function RecordPipelineBindings(provider: IMetadataProvider, user: UserInfo, records: RunRecords, pipelineIds: readonly string[]): Promise<void> {
  if (pipelineIds.length === 0) return;
  const res = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID' | 'EvaluationProtocolID'>>({
    EntityName: 'MJ: ML Training Pipelines',
    ExtraFilter: `ID IN (${pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`,
    Fields: ['ID', 'PredictionUnitID', 'EvaluationProtocolID'],
    ResultType: 'simple',
    BypassCache: true,
  }, user);
  if (!res.Success) throw new Error(`Reading the pipelines' bindings failed: ${res.ErrorMessage}`);
  for (const p of res.Results) {
    records.RecordPipeline(p.ID);
    records.RecordPipelineBindings(p);
  }
}

/** Deletes one loaded row; null when deleted, else the failure line. */
export async function DeleteRow(entityName: string, row: Pick<BaseEntity, 'Delete' | 'LatestResult'> & { readonly ID: string }): Promise<string | null> {
  const id = row.ID; // read before Delete(): a deleted entity object no longer carries its field values
  if (await row.Delete()) return null;
  return `${entityName} ${id}: ${row.LatestResult?.CompleteMessage || 'Delete() returned false'}`;
}

/** The DriverClass of the canonical 'Score Record Set' Action and of every per-model child the promotion gate generates. */
const SCORE_RECORD_SET_DRIVER_CLASS = 'PredictiveStudioScoreRecordSetAction';

/** `Field IN ('a','b')` over IDs, escaped. */
function inList(field: string, ids: Iterable<string>): string {
  return `${field} IN (${[...ids].map((id) => `'${EscapeSQLString(id)}'`).join(',')})`;
}

/** The IDs of the recorded models and of every model trained from a recorded pipeline (the models the harness cleanup deletes). */
async function recordedModelIds(provider: IMetadataProvider, user: UserInfo, records: RunRecords): Promise<string[]> {
  const clauses = [
    ...(records.ModelIDs.Size > 0 ? [inList('ID', records.ModelIDs)] : []),
    ...(records.PipelineIDs.Size > 0 ? [inList('PipelineID', records.PipelineIDs)] : []),
  ];
  if (clauses.length === 0) return [];
  const res = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLModelEntity, 'ID'>>(
    { EntityName: 'MJ: ML Models', ExtraFilter: clauses.join(' OR '), Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
  if (!res.Success) throw new Error(`Reading the recorded models failed: ${res.ErrorMessage}`);
  return res.Results.map((m) => m.ID);
}

/**
 * Deletes the scoring Action the promotion gate generated for each of the models (a child of 'Score Record Set' whose
 * `ModelID` param defaults to the model's ID), its params first. The shared 'Predictive Studio Models' Action Category
 * is left in place. Returns one line per read or delete that failed; an Action keeps its row when a param of it could
 * not be deleted.
 */
export async function DeleteModelScoringActions(provider: IMetadataProvider, user: UserInfo, modelIds: readonly string[]): Promise<string[]> {
  if (modelIds.length === 0) return [];
  const rv = RunView.FromMetadataProvider(provider);
  const bakedParams = await rv.RunView<Pick<MJActionParamEntity, 'ActionID'>>(
    { EntityName: 'MJ: Action Params', ExtraFilter: `Name='ModelID' AND ${inList('DefaultValue', modelIds)}`, Fields: ['ActionID'], ResultType: 'simple', BypassCache: true }, user);
  if (!bakedParams.Success) return [`reading the models' scoring Action params failed: ${bakedParams.ErrorMessage}`];
  if (bakedParams.Results.length === 0) return [];
  const actionIds = bakedParams.Results.map((p) => p.ActionID);
  const actions = await rv.RunView<MJActionEntity>(
    { EntityName: 'MJ: Actions', ExtraFilter: `${inList('ID', actionIds)} AND DriverClass='${SCORE_RECORD_SET_DRIVER_CLASS}' AND ParentID IS NOT NULL`, ResultType: 'entity_object', BypassCache: true }, user);
  if (!actions.Success) return [`reading the models' scoring Actions failed: ${actions.ErrorMessage}`];
  if (actions.Results.length === 0) return [];
  const params = await rv.RunView<MJActionParamEntity>(
    { EntityName: 'MJ: Action Params', ExtraFilter: inList('ActionID', actions.Results.map((a) => a.ID)), ResultType: 'entity_object', BypassCache: true }, user);
  if (!params.Success) return [`reading the models' scoring Action params failed: ${params.ErrorMessage}`];
  const paramsByAction = GroupByUUID(params.Results, (p) => p.ActionID);
  const failures: string[] = [];
  for (const action of actions.Results) {
    const paramFailures = await deleteRows('MJ: Action Params', paramsByAction.Get(action.ID) ?? []);
    failures.push(...paramFailures);
    if (paramFailures.length === 0) failures.push(...(await deleteRows('MJ: Actions', [action])));
  }
  return failures;
}

/** Deletes each row; one failure line per row whose Delete() failed. */
async function deleteRows(entityName: string, rows: ReadonlyArray<Pick<BaseEntity, 'Delete' | 'LatestResult'> & { readonly ID: string }>): Promise<string[]> {
  const failures: string[] = [];
  for (const row of rows) {
    const failure = await DeleteRow(entityName, row);
    if (failure !== null) failures.push(failure);
  }
  return failures;
}

/**
 * Deletes everything the run recorded: the scoring Actions generated for its models ({@link DeleteModelScoringActions}),
 * then the rows themselves, children first (the harness cleanup), then the algorithm when the rig created it. Returns
 * one line per row or stored object that could not be deleted, plus one per recorded ID still left.
 */
export async function DeleteRecordedRows(provider: IMetadataProvider, user: UserInfo, records: RunRecords, algorithm: RigAlgorithm | undefined): Promise<string[]> {
  const actionFailures = await DeleteModelScoringActions(provider, user, await recordedModelIds(provider, user, records));
  const failures = [...actionFailures, ...(await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(provider, user), records))];
  const leftovers: Array<[string, number]> = [
    ['MJ: ML Training Pipelines', records.PipelineIDs.Size], ['MJ: ML Models', records.ModelIDs.Size],
    ['MJ: ML Evaluation Protocols', records.EvaluationProtocolIDs.Size], ['MJ: ML Prediction Units', records.PredictionUnitIDs.Size],
  ];
  for (const [entityName, left] of leftovers) {
    if (left > 0) failures.push(`${left} recorded ${entityName} row(s) were not deleted`);
  }
  failures.push(...(await DeleteCreatedAlgorithm(provider, user, algorithm)));
  return failures;
}

/**
 * Deletes the algorithm row when the rig created it (a reused row is left in place). Returns the failure line, if any:
 * a created row that no longer loads, or whose Delete() fails.
 */
export async function DeleteCreatedAlgorithm(provider: IMetadataProvider, user: UserInfo, algorithm: RigAlgorithm | undefined): Promise<string[]> {
  if (!algorithm?.Created) return [];
  const algo = await provider.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
  if (!(await algo.Load(algorithm.ID))) return [`MJ: ML Algorithms ${algorithm.ID}: the row the rig created no longer loads (${algo.LatestResult?.CompleteMessage || 'not found'})`];
  const failure = await DeleteRow('MJ: ML Algorithms', algo);
  return failure === null ? [] : [failure];
}

/** Prints the cleanup's failures (or that it left nothing) and returns how many there were. */
export function ReportCleanup(failures: readonly string[]): number {
  if (failures.length === 0) {
    console.log('  cleanup deleted every row the run created.');
  } else {
    for (const f of failures) console.log(`  FAIL  cleanup: ${f}`);
  }
  return failures.length;
}
