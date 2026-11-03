/**
 * @module metrics-util
 *
 * Metric direction for Predictive Studio, derived from the one declaration `METRIC_DIRECTION`. A metric is
 * **lower-is-better** (log loss, Brier, deviances, RMSE, MAE, MASE), **higher-is-better** (AUC, accuracy, F1,
 * precision, recall, R²) or **closer-to-one** (calibration slope, ranked by its distance from 1).
 *
 * Direction matters in two places that must agree: the experiment leaderboard normalisation and the maintenance
 * challenger-vs-incumbent comparison. Deriving the lower-is-better set from `METRIC_DIRECTION` (plus the legacy
 * spellings stored by the earlier trainer) keeps them from drifting, so a Brier score or a deviance can never be
 * ranked backwards.
 */
import { METRIC_DIRECTION, type MetricDirection, type MetricKey } from './evaluation-protocol';

/** Spellings stored by the earlier trainer (sidecar snake_case and short forms) that are lower-is-better. */
const LEGACY_LOWER_IS_BETTER: readonly string[] = [
  'mse', 'loss', 'logloss', 'log_loss', 'brier_score', 'brier_score_loss', 'multiclass_log_loss',
  'poisson_deviance', 'tweedie_deviance', 'mape', 'smape', 'pinball', 'pinball_loss',
];

function isMetricKey(k: string): k is MetricKey {
  return Object.prototype.hasOwnProperty.call(METRIC_DIRECTION, k);
}

/** The canonical set of lower-is-better metric keys (lower-cased). */
const ERROR_METRIC_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(METRIC_DIRECTION).filter((k) => isMetricKey(k) && METRIC_DIRECTION[k] === 'lower-is-better'),
  ...LEGACY_LOWER_IS_BETTER,
]);

/** Metric direction lookups. */
export class MetricDirections {
  /**
   * Whether a metric is **lower-is-better** (an error/loss metric). Case-insensitive and whitespace-tolerant.
   *
   * @param metricKey the metric name (e.g. `brier`, `RMSE`, `poisson-deviance`, `auc`)
   * @returns `true` for every lower-is-better key in `METRIC_DIRECTION` and the legacy spellings, else `false`
   */
  public static IsErrorMetric(metricKey: string): boolean {
    return ERROR_METRIC_KEYS.has(metricKey.trim().toLowerCase());
  }

  /**
   * A raw score oriented so that higher is always better: a lower-is-better metric negated, a closer-to-one metric minus
   * its distance from one (|1 − value|, how a calibration slope is ranked), a higher-is-better metric as stored; null for
   * a metric whose direction is not known (it must not be ranked). {@link OnMetricScale} is its inverse.
   *
   * @param raw the score as stored
   * @param metricKey the metric it is on
   */
  public static NormalizedScore(raw: number, metricKey: string): number | null {
    switch (MetricDirections.MetricDirectionOf(metricKey)) {
      case 'higher-is-better': return raw;
      case 'lower-is-better': return -raw;
      case 'closer-to-one': return -Math.abs(1 - raw);
      default: return null;
    }
  }

  /**
   * A normalized score (higher is better: a lower-is-better metric negated, a closer-to-one metric minus its distance
   * from one) back on its metric's own scale: a loss reads as the loss, a closer-to-one score as its distance from 1
   * (label it with {@link MetricScaleLabel}), a higher-is-better or unknown metric as stored. The one inverse of the
   * leaderboard normalization; every display of a normalized score goes through it.
   *
   * @param normalized the normalized score
   * @param metricKey the metric the score was read from
   */
  public static OnMetricScale(normalized: number, metricKey: string): number {
    switch (MetricDirections.MetricDirectionOf(metricKey)) {
      case 'lower-is-better':
      case 'closer-to-one':
        return -normalized;
      default:
        return normalized;
    }
  }

  /** The label {@link OnMetricScale}'s value reads under: the metric, or "<metric> distance from 1" for a closer-to-one metric. */
  public static MetricScaleLabel(metricKey: string): string {
    return MetricDirections.MetricDirectionOf(metricKey) === 'closer-to-one' ? `${metricKey} distance from 1` : metricKey;
  }

  /** The declared direction of a metric, or null for a key Predictive Studio does not know (callers must not rank on it). */
  public static MetricDirectionOf(metricKey: string): MetricDirection | null {
    const k = metricKey.trim().toLowerCase();
    if (isMetricKey(k)) return METRIC_DIRECTION[k];
    return ERROR_METRIC_KEYS.has(k) ? 'lower-is-better' : null;
  }
}
