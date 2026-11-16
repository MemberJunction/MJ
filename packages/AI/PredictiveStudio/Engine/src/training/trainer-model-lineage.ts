/**
 * @module training/trainer-model-lineage
 *
 * Reads back the keys a trainer run writes to `MJ: ML Models.Lineage` ({@link TrainerModelLineage}) that decide what
 * may happen to the model after training: its leakage audit, its calibration hold and the driver of its shipped
 * artifact. The promotion gate, scoring readiness and the pipeline builder read them here, so a key is parsed one way.
 * A Lineage that is missing, unreadable or written before a key existed reads as the key's absence (null): such a
 * model behaves as it did before the key was written.
 */
import { JsonParse, type JsonObject } from '@memberjunction/predictive-studio-core';

import type { CalibrationHold, TrainerModelLineage, TrainingLeakageAudit } from './types';

/** Typed readers of a trainer model's stored Lineage keys. */
export class TrainerModelLineageReader {
  /**
   * The run's leakage audit ({@link TrainerModelLineage.trainingLeakageAudit}): the finalist importance's top feature and
   * its share. Null when the Lineage is absent or unreadable, records no audit, or the audit is not a feature name with
   * a finite share.
   *
   * @param lineage the model's `Lineage` JSON text
   */
  public static LeakageAuditOf(lineage: string | null | undefined): TrainingLeakageAudit | null {
    const audit = TrainerModelLineageReader.objectKey(lineage, 'trainingLeakageAudit');
    if (audit === null) return null;
    const topFeature = JsonParse.JsonString(audit, 'topFeature');
    const topShare = JsonParse.JsonNumber(audit, 'topShare');
    return topFeature === null || topShare === null ? null : { topFeature, topShare };
  }

  /**
   * The model's calibration hold ({@link TrainerModelLineage.calibrationHold}); null when the Lineage is absent or
   * unreadable or records no hold. A recorded hold whose slope is not a finite number holds with a slope of null (it
   * could not be measured): an unreadable slope never releases the hold.
   *
   * @param lineage the model's `Lineage` JSON text
   */
  public static CalibrationHoldOf(lineage: string | null | undefined): CalibrationHold | null {
    const hold = TrainerModelLineageReader.objectKey(lineage, 'calibrationHold');
    if (hold === null) return null;
    return { slope: JsonParse.JsonNumber(hold, 'slope') };
  }

  /**
   * The driver key of the model's shipped artifact ({@link TrainerModelLineage.shippedDriver}); null when the Lineage is
   * absent or unreadable or names none (a model trained before the trainer recorded it).
   *
   * @param lineage the model's `Lineage` JSON text
   */
  public static ShippedDriverOf(lineage: string | null | undefined): string | null {
    const parsed = TrainerModelLineageReader.lineageObject(lineage);
    return parsed === null ? null : JsonParse.JsonString(parsed, 'shippedDriver');
  }

  /** The Lineage's member `key` when it is a JSON object; null otherwise. */
  private static objectKey(lineage: string | null | undefined, key: keyof TrainerModelLineage): JsonObject | null {
    const parsed = TrainerModelLineageReader.lineageObject(lineage);
    return parsed === null ? null : JsonParse.JsonObjectField(parsed, key);
  }

  /** The Lineage text as a JSON object; null when it is absent, does not parse or is not an object. */
  private static lineageObject(lineage: string | null | undefined): JsonObject | null {
    const parsed = JsonParse.ParseJsonText(lineage, 'Lineage');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
  }
}
