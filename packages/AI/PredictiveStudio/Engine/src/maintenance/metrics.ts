/**
 * @module maintenance/metrics
 *
 * Holdout-metric helpers for the challenger-vs-incumbent comparison (plan §12).
 * The model's `HoldoutMetrics` is a JSON blob of metric-name → value pairs
 * produced by the sidecar (e.g. `{ "roc_auc": 0.82, "accuracy": 0.79 }` for
 * classification, `{ "r2": 0.64, "rmse": 12.1 }` for regression). These helpers
 * pick which metric to compare on and read it off both models.
 *
 * **Higher-is-better is assumed** for the built-in default metrics
 * (`roc_auc` / `r2`). When comparing on a lower-is-better metric (e.g. `rmse`),
 * pin `RetrainingPolicy.comparisonMetric` explicitly and invert the margin sign in
 * the caller — the default `'auto'` selection only ever picks higher-is-better
 * metrics, so the engine's promote-when-delta≥margin rule is correct by default.
 */

import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { isErrorMetric } from '@memberjunction/predictive-studio-core';

/** Default higher-is-better metric per problem type, in priority order. */
const DEFAULT_METRICS_BY_PROBLEM: Record<'classification' | 'regression', string[]> = {
  classification: ['roc_auc', 'auc', 'f1', 'accuracy'],
  regression: ['r2', 'explained_variance'],
};

/**
 * Resolve which holdout metric to compare on. When the policy pins a concrete
 * metric name, that wins. With `'auto'`, prefer the default higher-is-better
 * metric for the incumbent's problem type that is present on BOTH models, then
 * fall back to the first numeric metric shared by both, then to the first default
 * name (so the caller still gets a stable key even if values are absent).
 *
 * @param configured the policy's `comparisonMetric` (`'auto'` or a metric name)
 * @param incumbent the current model
 * @param challenger the freshly-retrained model
 */
export function resolveComparisonMetric(
  configured: string,
  incumbent: MJMLModelEntity,
  challenger: MJMLModelEntity,
): string {
  if (configured && configured !== 'auto') {
    return configured;
  }
  const incumbentMetrics = parseMetrics(incumbent.HoldoutMetrics);
  const challengerMetrics = parseMetrics(challenger.HoldoutMetrics);
  const problem = (incumbent.ProblemType as 'classification' | 'regression') ?? 'classification';

  for (const name of DEFAULT_METRICS_BY_PROBLEM[problem] ?? []) {
    if (isFiniteNumber(incumbentMetrics[name]) && isFiniteNumber(challengerMetrics[name])) {
      return name;
    }
  }
  // First numeric metric present on BOTH — but skip error metrics here so the
  // `'auto'` fallback always lands on a higher-is-better key (an explicit pinned
  // metric name still wins above, where the comparison handles direction).
  const sharedNumeric = Object.keys(incumbentMetrics).find(
    (k) =>
      !isErrorMetric(k) &&
      isFiniteNumber(incumbentMetrics[k]) &&
      isFiniteNumber(challengerMetrics[k]),
  );
  if (sharedNumeric) {
    return sharedNumeric;
  }
  return (DEFAULT_METRICS_BY_PROBLEM[problem] ?? ['roc_auc'])[0];
}

/**
 * Read a single metric value off a model's `HoldoutMetrics` JSON. Returns `null`
 * when the blob is absent/unparseable or the metric is missing/non-numeric.
 *
 * @param holdoutMetricsJson the model's `HoldoutMetrics` column
 * @param metric the metric name to read
 */
export function readMetric(holdoutMetricsJson: string | null | undefined, metric: string): number | null {
  const metrics = parseMetrics(holdoutMetricsJson);
  const value = metrics[metric];
  return isFiniteNumber(value) ? value : null;
}

/** Parse a `HoldoutMetrics` JSON blob into a name → value map (empty on null/parse error). */
function parseMetrics(raw: string | null | undefined): Record<string, unknown> {
  if (raw == null || raw.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Type guard: a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
