/**
 * @module harness/monitoring
 *
 * `HarnessMonitoring` — the truth harness's monitoring call (M6.3): one period of a Published model through
 * `PredictiveStudio.RunModelMonitoring`, as the gates' user, returned as a {@link MonitoringAttempt} (an operation that
 * fails is an attempt with its message, never a throw).
 */
import { PredictiveStudioRunModelMonitoringOperation } from '@memberjunction/core-entities';
import { UtcDay } from '@memberjunction/predictive-studio-core';

import type { RunContext } from './run-fixtures';
import type { MonitoringAttempt } from './types';

/** The monitoring operation wrapper of the truth harness. */
export class HarnessMonitoring {
  /** Runs `PredictiveStudio.RunModelMonitoring` for the period starting `periodStart` (a UTC day). */
  public static async RunMonitoring(ctx: RunContext, modelId: string, periodStart: Date): Promise<MonitoringAttempt> {
    const r = await new PredictiveStudioRunModelMonitoringOperation().Execute({ modelId, periodStart: UtcDay.UtcDayIso(periodStart) }, { provider: ctx.Provider, user: ctx.User });
    if (!r.Success || !r.Output) return { Ok: false, ErrorMessage: r.ErrorMessage || `RunModelMonitoring failed (${r.ResultCode || 'no result code'})`, Skipped: null, Periods: [] };
    return { Ok: true, ErrorMessage: null, Skipped: r.Output.skipped || null, Periods: r.Output.periods };
  }
}
