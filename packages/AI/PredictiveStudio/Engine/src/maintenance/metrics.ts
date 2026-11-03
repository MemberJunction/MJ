/**
 * @module maintenance/metrics
 *
 * Holdout-metric helpers for the challenger-vs-incumbent comparison (plan §12).
 * The model's `HoldoutMetrics` is a JSON blob of metric-name → value pairs: the
 * earlier sidecar's names (e.g. `{ "roc_auc": 0.82, "accuracy": 0.79 }`), or the
 * trainer's primary proper score and secondary metrics (e.g. `{ "log-loss": 0.41,
 * "auc": 0.82 }`; a kept simple baseline stores its primary score alone, e.g.
 * `{ "rmse": 12.1 }`). These helpers pick which metric to compare on and read it
 * off both models.
 *
 * `'auto'` prefers the problem type's default higher-is-better metrics (`roc_auc` /
 * `auc` / `f1` / `accuracy`, or `r2` / `explained_variance`) when both models carry
 * one, but it is not limited to them: it then falls back to the first metric both
 * carry whose direction is known and rankable, which may be a lower-is-better loss
 * (`log-loss`, `rmse`, a deviance). Neither the policy nor the caller inverts
 * anything for that: the maintenance engine orients every comparison by the
 * metric's direction (`MetricDirections.IsErrorMetric`), so a loss improves when it
 * falls and the promote rule (improvement ≥ margin) holds for either direction, the
 * margin being in the metric's own units.
 */

import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { MetricDirections } from '@memberjunction/predictive-studio-core';

/** Default higher-is-better metric per problem type, in priority order. */
const DEFAULT_METRICS_BY_PROBLEM: Record<'classification' | 'regression', string[]> = {
  classification: ['roc_auc', 'auc', 'f1', 'accuracy'],
  regression: ['r2', 'explained_variance'],
};

/**
 * Resolve which holdout metric to compare on. When the policy pins a concrete
 * metric name, that wins. With `'auto'`, prefer the default higher-is-better
 * metric for the incumbent's problem type that is present on BOTH models, then
 * fall back to the first numeric metric shared by both whose direction is known and
 * rankable (higher- or lower-is-better; the engine orients a lower-is-better one),
 * then to the first default name (so the caller still gets a stable key even if
 * values are absent).
 *
 * @param configured the policy's `comparisonMetric` (`'auto'` or a metric name)
 * @param incumbent the current model
 * @param challenger the freshly-retrained model
 */
export function ResolveComparisonMetric(
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
  // First numeric metric present on BOTH whose direction is declared and rankable (higher- or
  // lower-is-better): closer-to-one keys (calibration slope) and unknown keys are never auto-picked,
  // because the comparison can only rank a metric by its direction. An explicit pinned name still wins above.
  const sharedNumeric = Object.keys(incumbentMetrics).find(
    (k) =>
      isRankableDirection(MetricDirections.MetricDirectionOf(k)) &&
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
export function ReadMetric(holdoutMetricsJson: string | null | undefined, metric: string): number | null {
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

/** A direction the comparison can rank on: closer-to-one and unknown (null) keys are not rankable. */
function isRankableDirection(direction: ReturnType<typeof MetricDirections.MetricDirectionOf>): boolean {
  return direction === 'higher-is-better' || direction === 'lower-is-better';
}
