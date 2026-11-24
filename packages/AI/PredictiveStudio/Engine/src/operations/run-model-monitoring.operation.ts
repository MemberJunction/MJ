/**
 * @module operations/run-model-monitoring.operation
 *
 * **Run Model Monitoring** Remote Operation — the server body for the Manual-mode `PredictiveStudio.RunModelMonitoring`
 * operation (M6.3). A thin adapter: the model's open monitoring job's `MonitoringJobSpec`, one period (the named one or
 * the last complete one of the job's grain), and {@link PredictiveStudioModelMonitoringJobDriver.MonitorPeriods} as the
 * caller (no scheduled job run is behind the call). Failures throw, so the framework wraps them as an `EXECUTION_ERROR`
 * result preserving the message.
 */
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioRunModelMonitoringOperation,
  type PredictiveStudioMonitoredPeriod,
  type PredictiveStudioRunModelMonitoringInput,
  type PredictiveStudioRunModelMonitoringOutput,
} from '@memberjunction/core-entities';
import { MonitoringResultSchemas, UtcDay } from '@memberjunction/predictive-studio-core';

import { PredictiveStudioModelMonitoringJobDriver, type MonitoredPeriodOutcome } from '../monitoring/monitoring-driver';
import { MonitoringPeriods } from '../monitoring/monitoring-periods';
import { MonitoringJobs } from '../registry/monitoring-job';
import type { RegistryContext } from '../registry/registry-context';

/** One model's monitoring, run now. */
export class ModelMonitoringRun {
  /**
   * Runs the input's period of the model with the spec of its open monitoring job.
   *
   * @throws Error when the model has no open monitoring job, its spec does not parse, or `periodStart` is not the first
   *   day of a period of the job's grain
   */
  public static async Run(input: PredictiveStudioRunModelMonitoringInput, ctx: RegistryContext, driver: PredictiveStudioModelMonitoringJobDriver): Promise<PredictiveStudioRunModelMonitoringOutput> {
    const configuration = await MonitoringJobs.OpenJobConfiguration(input.modelId, ctx);
    if (configuration === null) throw new Error(`ML Model ${input.modelId} has no open monitoring job (it is not Published, or its job was disabled)`);
    const spec = MonitoringResultSchemas.ParseJobSpec(configuration);
    if (spec.Ok === false) throw new Error(`The monitoring job of ML Model ${input.modelId} has no valid MonitoringJobSpec: ${spec.Errors.join('; ')}`);
    const monitoringCtx = driver.ContextFor(ctx.ContextUser, ctx.Provider, null);
    const grain = spec.Value.performance.period;
    const period = input.periodStart ? MonitoringPeriods.Starting(ModelMonitoringRun.day(input.periodStart), grain) : MonitoringPeriods.LastComplete(monitoringCtx.Seams.Clock.Now(), grain);
    const outcome = await driver.MonitorPeriods(spec.Value, [period], monitoringCtx);
    return { modelId: outcome.ModelID, ...(outcome.Skipped ? { skipped: outcome.Skipped } : {}), periods: outcome.Periods.map((p) => ModelMonitoringRun.wire(p)) };
  }

  /** A period outcome on the wire (camelCase; absent members for what was not measured). Pure. */
  private static wire(p: MonitoredPeriodOutcome): PredictiveStudioMonitoredPeriod {
    return {
      period: p.Period, monitoringResultId: p.MonitoringResultID, state: p.State, joinedRows: p.JoinedRows,
      ...(p.Primary ? { primaryValue: p.Primary.value, primaryLower: p.Primary.interval.lower, primaryUpper: p.Primary.interval.upper } : {}),
      driftAlarms: p.DriftAlarms, triggersFired: p.TriggersFired.map((t) => t.kind),
      ...(p.Challenger ? { challengerOutcome: p.Challenger.outcome } : {}),
      ...(p.Challenger && p.Challenger.trainingRunId ? { challengerRunId: p.Challenger.trainingRunId } : {}),
      ...(p.Rollback ? { rollback: p.Rollback } : {}),
      ...(p.ErrorMessage ? { errorMessage: p.ErrorMessage } : {}),
    };
  }

  /** `YYYY-MM-DD` as its UTC day. @throws Error when it is not one */
  private static day(text: string): Date {
    if (!UtcDay.IsIsoDay(text)) throw new Error(`periodStart '${text}' is not a YYYY-MM-DD day`);
    const day = UtcDay.ToUtcDay(text);
    if (day === null) throw new Error(`periodStart '${text}' is not a valid day`);
    return day;
  }
}

/**
 * Server implementation of `PredictiveStudio.RunModelMonitoring`. Extends the CodeGen-emitted
 * {@link PredictiveStudioRunModelMonitoringOperation} base and supplies only the body.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.RunModelMonitoring')
export class PredictiveStudioRunModelMonitoringServerOperation extends PredictiveStudioRunModelMonitoringOperation {
  /** @inheritdoc */
  protected async InternalExecute(input: PredictiveStudioRunModelMonitoringInput, provider: IMetadataProvider, user: UserInfo): Promise<PredictiveStudioRunModelMonitoringOutput> {
    if (!input?.modelId) throw new Error('modelId is required');
    return ModelMonitoringRun.Run(input, { ContextUser: user, Provider: provider }, new PredictiveStudioModelMonitoringJobDriver());
  }
}
