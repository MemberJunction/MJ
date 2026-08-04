/**
 * @module metrics-util
 *
 * Shared metric-direction helpers for Predictive Studio. A model metric is
 * either **higher-is-better** (ranking/quality metrics like AUC, F1, accuracy,
 * R²) or **lower-is-better** (error metrics like RMSE, MAE, MSE, log-loss).
 *
 * This direction matters in two independent places that MUST agree:
 *  - the experiment leaderboard normalization (`extractNormalizedScore`), which
 *    negates error metrics so a higher normalized Score is always "better"; and
 *  - the maintenance challenger-vs-incumbent comparison, which must compute the
 *    improvement in the metric's natural direction before testing it against the
 *    promotion margin.
 *
 * Lifting the canonical error-metric set here (rather than duplicating it in
 * each consumer) prevents the two from drifting apart — a divergence that
 * silently promotes a *worse* model when comparing on an error metric.
 *
 * Pure / dependency-free so it stays in the types-only Core package.
 */

/** The canonical set of lower-is-better metric keys (lower-cased). */
const ERROR_METRIC_KEYS: ReadonlySet<string> = new Set([
  'rmse',
  'mae',
  'mse',
  'loss',
  'logloss',
  'log_loss',
]);

/**
 * Whether a metric is **lower-is-better** (an error/loss metric). The check is
 * case-insensitive and trims surrounding whitespace, so callers can pass a raw
 * metric name or a pre-lower-cased key interchangeably.
 *
 * @param metricKey the metric name (e.g. `RMSE`, `rmse`, `roc_auc`)
 * @returns `true` for error metrics (RMSE/MAE/MSE/loss/logloss), else `false`
 */
export function isErrorMetric(metricKey: string): boolean {
  return ERROR_METRIC_KEYS.has(metricKey.trim().toLowerCase());
}
