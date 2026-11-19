/**
 * Pure mapping from a scoring binding's latest values (`MJ: Latest Feature Values`, §5.8.4) to the per-record rows the
 * predictions grid and the At-Risk list render. A `Model` row stores (§5.8.1) the adverse-class probability of a
 * classification in `ValueNumeric`, the predicted class in `ValueText` and the class probabilities (in the model's
 * class order) and the per-record drivers in `ValueJSON`; a regression's point prediction in `ValueNumeric`. The
 * surfaces rank on the model's own score — P(class 1) of a binary model, the predicted class's probability of a
 * multiclass model, the point of a regression — so the score is read back from the stored probabilities, and the
 * surfaces' polarity rule (`AtRiskRules.BuildAtRiskOptions`) applies unchanged.
 */
import type { MJMLModelScoringBindingEntity, MJvwLatestFeatureValuesEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { JsonParse, type JsonObject } from '@memberjunction/predictive-studio-core';
import type { PSRunDetailRow } from './engine/predictive-studio.engine';

/** The `MJ: Latest Feature Values` fields the surfaces read. */
export type LatestPredictionRow = Pick<MJvwLatestFeatureValuesEntity, 'ID' | 'RecordID' | 'ValueText' | 'ValueNumeric' | 'ValueJSON' | 'Confidence' | 'EffectiveAsOf' | 'ComputedAt'>;

/** The binding fields the latest-values read names. */
export type LatestPredictionBinding = Pick<MJMLModelScoringBindingEntity, 'TargetEntityID' | 'FeatureName'>;

/** Reads and maps a binding's latest values. */
export class LatestPredictionRows {
  /** The fields of {@link LatestPredictionRow}, as the read names them. */
  public static readonly Fields = ['ID', 'RecordID', 'ValueText', 'ValueNumeric', 'ValueJSON', 'Confidence', 'EffectiveAsOf', 'ComputedAt'] as const satisfies readonly (keyof LatestPredictionRow)[];

  /** The filter of a binding's latest scored values: its feature on its target entity, `Model` rows only. */
  public static Filter(binding: LatestPredictionBinding): string {
    return `EntityID='${EscapeSQLString(binding.TargetEntityID || '')}' AND FeatureName='${EscapeSQLString(binding.FeatureName)}' AND Source='Model'`;
  }

  /** The model's own score of a stored row, or null when the row stores none (see the module comment). */
  public static Score(row: LatestPredictionRow): number | null {
    if (row.ValueText === null) return LatestPredictionRows.finite(row.ValueNumeric);
    const probabilities = LatestPredictionRows.probabilities(row.ValueJSON);
    if (probabilities.length === 2) return probabilities[1];
    return LatestPredictionRows.finite(row.Confidence);
  }

  /**
   * A stored row as the run-detail row the surfaces parse (`AtRiskRules.ParseAtRiskRows` reads `ResultPayload`'s
   * `score`, `class` and `drivers`), dated by its as-of date; null when the row stores no score.
   */
  public static ToRunDetail(row: LatestPredictionRow): PSRunDetailRow | null {
    const score = LatestPredictionRows.Score(row);
    if (score === null) return null;
    const scoredAt = LatestPredictionRows.date(row.EffectiveAsOf) || LatestPredictionRows.date(row.ComputedAt);
    const payload = { score, class: row.ValueText, drivers: LatestPredictionRows.drivers(row.ValueJSON) };
    return { ID: row.ID, RecordID: row.RecordID, ResultPayload: JSON.stringify(payload), Status: 'Succeeded', CompletedAt: scoredAt, __mj_CreatedAt: scoredAt || new Date(0) };
  }

  /** The stored class probabilities in their stored (class) order. */
  private static probabilities(valueJSON: string | null): number[] {
    const json = LatestPredictionRows.json(valueJSON);
    const probabilities = json ? JsonParse.JsonObjectField(json, 'Probabilities') : null;
    if (!probabilities) return [];
    return Object.keys(probabilities).map((k) => JsonParse.JsonNumber(probabilities, k)).filter((p): p is number => p !== null);
  }

  /** The stored per-record drivers in the payload form the surfaces parse (`{ feature, value }`, signed on the model's score). */
  private static drivers(valueJSON: string | null): Array<{ feature: string; value: number }> { // case-violation-ok-legacy-back-compat: the scoring payload's wire keys AtRiskRules.ParseRowDrivers reads
    const json = LatestPredictionRows.json(valueJSON);
    const items = json ? JsonParse.JsonArrayField(json, 'Drivers') || [] : [];
    return items
      .filter(JsonParse.IsJsonObject)
      .map((d) => ({ feature: JsonParse.JsonString(d, 'sourceColumn'), value: JsonParse.JsonNumber(d, 'contribution') }))
      .filter((d): d is { feature: string; value: number } => d.feature !== null && d.value !== null);
  }

  private static json(valueJSON: string | null): JsonObject | null {
    const parsed = JsonParse.ParseJsonText(valueJSON, 'ValueJSON');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : null;
  }

  private static finite(value: number | null): number | null {
    return value !== null && Number.isFinite(value) ? value : null;
  }

  private static date(value: Date | string | null): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}
