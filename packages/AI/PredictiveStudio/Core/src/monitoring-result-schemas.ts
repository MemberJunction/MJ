/**
 * @module monitoring-result-schemas
 *
 * Reading back the JSON columns of `MJ: ML Monitoring Results` the monitoring job needs from earlier periods (M6.3):
 * the primary score and the calibration report (a retrain trigger's streak spans periods) and the triggers fired (a
 * challenger waits while its trigger stays fired, D4-11), plus the job's own `MonitoringJobSpec` from its scheduled
 * job's `Configuration`. Each reader checks the stored text with its schema, so a malformed value is a named failure,
 * never a cast.
 */
import { z } from 'zod';

import type { MetricWithInterval } from './evaluation-protocol';
import { JsonParse, type ParseResult } from './json-value';
import type { MonitoringTriggerFired } from './monitoring-contracts';
import { MonitoringJobSpecs, type MonitoringJobReadSpec } from './monitoring-job-specs';
import type { CalibrationReport } from './trainer-contract';
import { TrainerResultSchemas } from './trainer-result-schemas';

const triggersFired = z.array(z.object({ kind: z.enum(['outcome-degradation', 'calibration-drift']), reason: z.string() }).strict());

/** The stored-column readers of the monitoring job. */
export class MonitoringResultSchemas {
  /** A stored `PrimaryScore` (a `MetricWithInterval`). */
  public static ParsePrimaryScore(text: string | null): ParseResult<MetricWithInterval> {
    return MonitoringResultSchemas.parse(text, 'PrimaryScore', TrainerResultSchemas.MetricWithInterval);
  }

  /** A stored `Calibration` (a `CalibrationReport`). */
  public static ParseCalibration(text: string | null): ParseResult<CalibrationReport> {
    return MonitoringResultSchemas.parse(text, 'Calibration', TrainerResultSchemas.CalibrationReport);
  }

  /** A stored `TriggersFired` (an array of `{ kind, reason }`). */
  public static ParseTriggersFired(text: string | null): ParseResult<MonitoringTriggerFired[]> {
    return MonitoringResultSchemas.parse(text, 'TriggersFired', triggersFired);
  }

  /**
   * A monitoring job's `Configuration` text as what the job reads of its `MonitoringJobSpec`: parsed, then checked with
   * `MonitoringJobSpecs.ValidateJson`'s strict schema.
   */
  public static ParseJobSpec(text: string | null): ParseResult<MonitoringJobReadSpec> {
    const json = JsonParse.ParseJsonText(text, 'Configuration');
    if (!json.Ok) return json;
    return MonitoringJobSpecs.ValidateJson(json.Value);
  }

  private static parse<T>(text: string | null, column: string, schema: z.ZodType<T>): ParseResult<T> {
    const json = JsonParse.ParseJsonText(text, column);
    if (!json.Ok) return json;
    const parsed = schema.safeParse(json.Value);
    if (parsed.success) return JsonParse.ParseOk(parsed.data);
    return JsonParse.ParseFail<T>(...parsed.error.issues.map((x) => `${column}.${x.path.join('.') || '(root)'}: ${x.message}`));
  }
}
