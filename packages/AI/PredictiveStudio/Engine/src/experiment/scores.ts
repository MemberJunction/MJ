/**
 * @module experiment/scores
 *
 * The normalized leaderboard score of an experiment's model, read from its stored holdout metrics. Pure (no data
 * access), so the orchestrator and the training-engine trainer share one reading of a score.
 */

import { JsonParse, MetricDirections, PROPER_SCORES_BY_FAMILY } from '@memberjunction/predictive-studio-core';
import type { ExperimentScore } from './types';

/** Every proper score a protocol can rank by (a model's primary holdout score is one of them; a secondary metric never is). */
const PROPER_SCORE_METRICS: ReadonlySet<string> = new Set(Object.values(PROPER_SCORES_BY_FAMILY).flat());

/** The leaderboard scores of an experiment's models. */
export class ExperimentScores {
  /**
   * The **normalized** leaderboard score of a model, read from its holdout metrics only and oriented so that higher is
   * always better (a lower-is-better metric is negated, a closer-to-one metric is minus its distance from one), with
   * the metric it was read from. The plan's success metric when the holdout gives a score on it; otherwise the model's
   * primary proper score, the one holdout metric that is a proper score (a kept simple baseline stores that score
   * alone, so it would otherwise never take a place on the leaderboard). Null when neither gives a score: the
   * holdout holds no rankable value of the success metric and no single proper score. A missing score is never a
   * stand-in number.
   *
   * @param holdoutMetricsJson the model's `HoldoutMetrics` JSON
   * @param successMetric the plan's `SuccessMetric` (e.g. `AUC`, `RMSE`)
   */
  public static ExtractNormalizedScore(holdoutMetricsJson: string | null, successMetric: string): ExperimentScore | null {
    const metrics = ExperimentScores.parseMetrics(holdoutMetricsJson);
    if (metrics === null) return null;
    return ExperimentScores.scoreOn(metrics, successMetric.trim().toLowerCase()) || ExperimentScores.scoreOn(metrics, ExperimentScores.primaryProperScore(metrics));
  }

  /** Whether a score's metric is the plan's success metric (case- and whitespace-insensitive, as the score is read). */
  public static IsSuccessMetric(scoreMetric: string, successMetric: string): boolean {
    return scoreMetric.trim().toLowerCase() === successMetric.trim().toLowerCase();
  }

  /** The normalized score on `key`; null when the metrics do not hold it or its direction is not known. */
  private static scoreOn(metrics: ReadonlyMap<string, number>, key: string | null): ExperimentScore | null {
    const raw = key === null ? undefined : metrics.get(key);
    if (key === null || raw === undefined || !Number.isFinite(raw)) return null;
    switch (MetricDirections.MetricDirectionOf(key)) {
      case 'higher-is-better': return { Score: raw, Metric: key };
      case 'lower-is-better': return { Score: -raw, Metric: key };
      case 'closer-to-one': return { Score: -Math.abs(1 - raw), Metric: key };
      case null: return null;
    }
  }

  /** The model's primary proper score: the one holdout metric that is a proper score; null when none is, or several are. */
  private static primaryProperScore(metrics: ReadonlyMap<string, number>): string | null {
    const proper = [...metrics.keys()].filter((k) => PROPER_SCORE_METRICS.has(k));
    return proper.length === 1 ? proper[0] : null;
  }

  /** A metrics JSON column as its numeric members by lower-cased key; null when the column is empty or not a JSON object. */
  private static parseMetrics(json: string | null): ReadonlyMap<string, number> | null {
    if (json === null || json.trim().length === 0) return null;
    const parsed = JsonParse.ParseJsonText(json, 'HoldoutMetrics');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return null;
    const out = new Map<string, number>();
    for (const [k, v] of Object.entries(parsed.Value)) {
      if (typeof v === 'number') out.set(k.toLowerCase(), v);
    }
    return out;
  }
}
