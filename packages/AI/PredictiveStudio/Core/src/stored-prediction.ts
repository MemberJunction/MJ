/**
 * @module stored-prediction
 *
 * The one reader of a `Model` Feature Value's `ValueJSON` (§5.8.1): `{ Probabilities, Drivers, Interval }`, where
 * `Probabilities` is `{ class: probability }` in the model's class order and `Drivers` the per-record drivers as
 * `ModelValueRows` writes them (`RowDrivers['items']`). The record panel and the predictions grid both read it here, so
 * the two surfaces cannot drift (audit M5b-10). Browser-safe.
 */
import { JsonParse, type JsonObject } from './json-value';
import type { RowDrivers } from './scoring-contracts';

/** One class of a classification with its stored probability. */
export interface StoredClassProbability {
  /** The class label. */
  readonly Class: string;
  /** Its probability, 0–1. */
  readonly Probability: number;
}

/** One stored per-record driver. */
export interface StoredPredictionDriver {
  /** The source column the driver is measured on. */
  readonly SourceColumn: string;
  /** Its signed contribution. */
  readonly Contribution: number;
  /** True when the stored effect is `raises-adverse`. */
  readonly RaisesAdverse: boolean;
}

/** The members of a `Model` row's `ValueJSON` the surfaces read. */
export interface StoredPredictionValue {
  /** The class probabilities in the model's class order; empty for a regression. */
  readonly Probabilities: readonly StoredClassProbability[];
  /** The per-record drivers, in stored order; empty when the model stores none. */
  readonly Drivers: readonly StoredPredictionDriver[];
}

/** Reads a `Model` row's `ValueJSON`. */
export class StoredPrediction {
  /** The `effect` value of a driver that raises the adverse outcome. */
  public static readonly RaisesAdverseEffect: RowDrivers['items'][number]['effect'] = 'raises-adverse';

  /** The probabilities and drivers `valueJSON` stores; empty lists when it stores none or does not parse. Pure. */
  public static Parse(valueJSON: string | null): StoredPredictionValue {
    const parsed = JsonParse.ParseJsonText(valueJSON, 'ValueJSON');
    if (!parsed.Ok || !JsonParse.IsJsonObject(parsed.Value)) return { Probabilities: [], Drivers: [] };
    const json = parsed.Value;
    const probabilities = JsonParse.JsonObjectField(json, 'Probabilities');
    return {
      Probabilities: probabilities ? StoredPrediction.classProbabilities(probabilities) : [],
      Drivers: StoredPrediction.drivers(json),
    };
  }

  /** `{ class: probability }` in its stored key order, which is the model's class order. */
  private static classProbabilities(probabilities: JsonObject): StoredClassProbability[] {
    const out: StoredClassProbability[] = [];
    for (const cls of Object.keys(probabilities)) {
      const probability = JsonParse.JsonNumber(probabilities, cls);
      if (probability !== null) out.push({ Class: cls, Probability: probability });
    }
    return out;
  }

  /** The stored drivers with a source column and a numeric contribution. */
  private static drivers(json: JsonObject): StoredPredictionDriver[] {
    const out: StoredPredictionDriver[] = [];
    for (const d of (JsonParse.JsonArrayField(json, 'Drivers') || []).filter(JsonParse.IsJsonObject)) {
      const sourceColumn = JsonParse.JsonString(d, 'sourceColumn');
      const contribution = JsonParse.JsonNumber(d, 'contribution');
      if (sourceColumn === null || contribution === null) continue;
      out.push({ SourceColumn: sourceColumn, Contribution: contribution, RaisesAdverse: JsonParse.JsonString(d, 'effect') === StoredPrediction.RaisesAdverseEffect });
    }
    return out;
  }
}
