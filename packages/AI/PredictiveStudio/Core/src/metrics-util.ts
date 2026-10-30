/**
 * @module metrics-util
 *
 * Metric direction for Predictive Studio, derived from the one declaration `METRIC_DIRECTION`. A metric is
 * **lower-is-better** (log loss, Brier, deviances, RMSE, MAE, MASE), **higher-is-better** (AUC, accuracy, F1,
 * precision, recall, R²) or **closer-to-one** (calibration slope, never ranked).
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

/** Metric direction lookups: static members on one owner. */
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

  /** The declared direction of a metric, or null for a key Predictive Studio does not know (callers must not rank on it). */
  public static MetricDirectionOf(metricKey: string): MetricDirection | null {
    const k = metricKey.trim().toLowerCase();
    if (isMetricKey(k)) return METRIC_DIRECTION[k];
    return ERROR_METRIC_KEYS.has(k) ? 'lower-is-better' : null;
  }
}
