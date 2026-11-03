/**
 * ps-rig-lifecycle.ts — what every in-process Predictive Studio rig does around its own proof: resolve the driver's
 * ML Algorithm row, give a legacy-shaped pipeline its Prediction Unit and Evaluation Protocol, and delete everything a
 * run created, children first, with every Delete() checked.
 *
 * The unit and protocol are bound by the pipeline migration (`PipelineMigration.EnsurePipelineUnitAndProtocol`), the
 * call the truth-suite harness makes for the containment gates' pipelines; the cleanup is the harness's own
 * (`HarnessCleanup.DeleteRecorded` over a `RunRecords`), which removes scoring bindings and Record Processes, training
 * runs, models, Training Snapshots with their stored files, pipelines, Evaluation Protocols and Prediction Units in
 * foreign-key order.
 */
import { RunView, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLAlgorithmEntity, MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
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

/**
 * Deletes everything the run recorded, children first (the harness cleanup), then the algorithm when the rig created
 * it. Returns one line per row or stored object that could not be deleted, plus one per recorded ID still left.
 */
export async function DeleteRecordedRows(provider: IMetadataProvider, user: UserInfo, records: RunRecords, algorithm: RigAlgorithm | undefined): Promise<string[]> {
  const failures = await HarnessCleanup.DeleteRecorded(HarnessCleanup.EntityStore(provider, user), records);
  const leftovers: Array<[string, number]> = [
    ['MJ: ML Training Pipelines', records.PipelineIDs.Size], ['MJ: ML Models', records.ModelIDs.Size],
    ['MJ: Evaluation Protocols', records.EvaluationProtocolIDs.Size], ['MJ: Prediction Units', records.PredictionUnitIDs.Size],
  ];
  for (const [entityName, left] of leftovers) {
    if (left > 0) failures.push(`${left} recorded ${entityName} row(s) were not deleted`);
  }
  if (algorithm?.Created) {
    const algo = await provider.GetEntityObject<MJMLAlgorithmEntity>('MJ: ML Algorithms', user);
    if (await algo.Load(algorithm.ID)) {
      const failure = await DeleteRow('MJ: ML Algorithms', algo);
      if (failure !== null) failures.push(failure);
    }
  }
  return failures;
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
