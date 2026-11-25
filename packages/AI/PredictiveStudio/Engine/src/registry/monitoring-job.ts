/**
 * @module registry/monitoring-job
 *
 * Per-model monitoring jobs are data, not metadata (§5.1): the publish transaction creates one `MJ: Scheduled Jobs` row
 * for the published model, of the `Predictive Studio Model Monitoring` type (M3.1's row), configured by the
 * `MonitoringJobSpec` built from the protocol the model was evaluated under, owned by the user the publish ran under,
 * and `Active`, so the scheduler (which loads only `Active` jobs) runs it from the publish on (D4-179). Archiving the
 * model, or a publish that supersedes it, sets its job `Disabled`.
 */
import type { MJMLModelEntity, MJScheduledJobEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { JsonParse, MonitoringJobSpecs, type EvaluationProtocolSpec } from '@memberjunction/predictive-studio-core';

import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

/** The model columns a monitoring job is built from. */
export type MonitoredModelColumns = Pick<MJMLModelEntity, 'ID' | 'Version' | 'PredictionUnitID' | 'FeatureSchema'>;

/** Creating and disabling per-model monitoring jobs. */
export class MonitoringJobs {
  /** The `MJ: Scheduled Job Types` row the jobs are of (M3.1, `metadata/scheduled-job-types/`). */
  public static readonly JOB_TYPE_NAME = 'Predictive Studio Model Monitoring';

  /**
   * Creates the model's `Active` monitoring job (D4-179) and returns its ID. The `Configuration` is
   * `MonitoringJobSpecs.FromProtocol(protocol, model)`, checked against its schema first.
   *
   * @throws Error when the job type is missing, the model has no Prediction Unit, the spec fails its schema, or the save fails
   */
  public static async CreateActive(model: MonitoredModelColumns, protocol: EvaluationProtocolSpec, ctx: RegistryContext): Promise<string> {
    if (!model.PredictionUnitID) throw new Error(`ML Model ${model.ID} has no Prediction Unit, so its monitoring job has no label window to join on`);
    const jobTypeId = await MonitoringJobs.jobTypeId(ctx);
    const spec = MonitoringJobSpecs.FromProtocol(protocol, { ModelID: model.ID, PredictionUnitID: model.PredictionUnitID, FeatureCount: MonitoringJobs.featureCountOf(model) });
    const valid = MonitoringJobSpecs.Validate(spec);
    if (valid.Ok === false) throw new Error(`The monitoring job spec of ML Model ${model.ID} is not valid: ${valid.Errors.join('; ')}`);
    const job = await ctx.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.ContextUser);
    job.NewRecord();
    job.JobTypeID = jobTypeId;
    job.Name = `Predictive Studio model monitoring: v${model.Version} (${model.ID})`;
    job.Description = 'Created Active by the lifecycle gate when the model was published; disabled when the model is archived or superseded.';
    job.CronExpression = spec.schedule.cronExpression;
    job.Timezone = spec.schedule.timezone;
    job.Status = 'Active';
    job.Configuration = JSON.stringify(spec);
    job.OwnerUserID = ctx.ContextUser.ID;
    if (await job.Save()) return job.ID;
    throw new Error(`Saving the monitoring job of ML Model ${model.ID} failed: ${job.LatestResult?.CompleteMessage || 'unknown error'}`);
  }

  /**
   * Sets every `Pending`, `Active` or `Paused` monitoring job of `modelId` to `Disabled` and returns how many it changed.
   *
   * @throws Error when a read or a save fails
   */
  public static async DisableForModel(modelId: string, ctx: RegistryContext): Promise<number> {
    const mine = await MonitoringJobs.openJobsOf(modelId, ctx);
    for (const job of mine) {
      job.Status = 'Disabled';
      if (!(await job.Save())) throw new Error(`Disabling monitoring job ${job.ID} of ML Model ${modelId} failed: ${job.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
    return mine.length;
  }

  /**
   * How many `Pending`, `Active` or `Paused` monitoring jobs `modelId` has (R1's restore creates one only when none is open).
   *
   * @throws Error when a read fails
   */
  public static async OpenJobCount(modelId: string, ctx: RegistryContext): Promise<number> {
    return (await MonitoringJobs.openJobsOf(modelId, ctx)).length;
  }

  /**
   * The `Configuration` (its `MonitoringJobSpec` JSON) of the model's open monitoring job; null when it has none.
   * `PredictiveStudio.RunModelMonitoring` runs a period with it.
   *
   * @throws Error when a read fails, or the model has more than one open job
   */
  public static async OpenJobConfiguration(modelId: string, ctx: RegistryContext): Promise<string | null> {
    const open = await MonitoringJobs.openJobsOf(modelId, ctx);
    if (open.length > 1) throw new Error(`ML Model ${modelId} has ${open.length} open monitoring jobs; exactly one is expected`);
    return open[0]?.Configuration || null;
  }

  /**
   * The `OwnerUserID` of the model's newest monitoring job, of any status: the user its publish ran as (D4-179), whom the
   * registry check notifies about the model (D4-18); null when no monitoring job names the model or it has no owner.
   *
   * @throws Error when a read fails
   */
  public static async OwnerOf(modelId: string, ctx: RegistryContext): Promise<string | null> {
    const jobTypeId = await MonitoringJobs.jobTypeId(ctx);
    const r = await StoredRowReads.Run<Pick<MJScheduledJobEntity, 'ID' | 'Configuration' | 'OwnerUserID'>>(
      { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `JobTypeID='${EscapeSQLString(jobTypeId)}'`, OrderBy: '__mj_CreatedAt DESC', Fields: ['ID', 'Configuration', 'OwnerUserID'], ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the monitoring jobs of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.find((j) => UUIDsEqual(MonitoringJobs.modelIdOf(j.Configuration), modelId))?.OwnerUserID || null;
  }

  /** The model's open monitoring jobs: found by type and status, matched on their configuration's `modelId` with `UUIDsEqual`. */
  private static async openJobsOf(modelId: string, ctx: RegistryContext): Promise<MJScheduledJobEntity[]> {
    const jobTypeId = await MonitoringJobs.jobTypeId(ctx);
    const r = await StoredRowReads.Run<MJScheduledJobEntity>(
      { EntityName: 'MJ: Scheduled Jobs', ExtraFilter: `JobTypeID='${EscapeSQLString(jobTypeId)}' AND Status IN ('Pending','Active','Paused')`, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the monitoring jobs of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.filter((j) => UUIDsEqual(MonitoringJobs.modelIdOf(j.Configuration), modelId));
  }

  private static async jobTypeId(ctx: RegistryContext): Promise<string> {
    const r = await StoredRowReads.Run<Pick<MJScheduledJobTypeEntity, 'ID'>>(
      { EntityName: 'MJ: Scheduled Job Types', ExtraFilter: `Name='${EscapeSQLString(MonitoringJobs.JOB_TYPE_NAME)}'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the '${MonitoringJobs.JOB_TYPE_NAME}' job type failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row) throw new Error(`The '${MonitoringJobs.JOB_TYPE_NAME}' scheduled job type is missing (metadata/scheduled-job-types/)`);
    return row.ID;
  }

  /** How many features the model's stored feature schema lists (0 when it is not a JSON array). */
  private static featureCountOf(model: MonitoredModelColumns): number {
    const json = JsonParse.ParseJsonText(model.FeatureSchema, 'FeatureSchema');
    return json.Ok && Array.isArray(json.Value) ? json.Value.length : 0;
  }

  /** The `modelId` a job's configuration names, or null when it names none. */
  private static modelIdOf(configuration: string | null): string | null {
    const json = JsonParse.ParseJsonText(configuration, 'Configuration');
    return json.Ok && JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, 'modelId') : null;
  }
}
