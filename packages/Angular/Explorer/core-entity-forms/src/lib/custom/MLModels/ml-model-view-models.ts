/**
 * Pure view-model functions and types for ML Model detail and metrics rendering.
 * Framework-free, deterministic calculations over plain model entity data.
 */

export interface PSFeatureBar {
  name: string;
  value: string;
  pct: number;
  warning: boolean;
}

export interface PSMetricDisplay {
  key: string;
  label: string;
  value: string;
  raw: number;
}

export type PSMetricKey =
  | 'AUC'
  | 'Accuracy'
  | 'Precision'
  | 'Recall'
  | 'F1'
  | 'LogLoss'
  | 'R2'
  | 'RMSE'
  | 'MAE';

export type PSMetricMap = Partial<Record<PSMetricKey, number>>;

export const PS_KNOWN_METRIC_KEYS: readonly PSMetricKey[] = [
  'AUC',
  'Accuracy',
  'Precision',
  'Recall',
  'F1',
  'LogLoss',
  'R2',
  'RMSE',
  'MAE',
] as const;

export const METRIC_LABELS: Record<PSMetricKey, string> = {
  AUC: 'AUC (ROC)',
  Accuracy: 'Accuracy',
  Precision: 'Precision',
  Recall: 'Recall',
  F1: 'F1 Score',
  LogLoss: 'Log Loss',
  R2: 'R² (Fit)',
  RMSE: 'RMSE',
  MAE: 'MAE',
};

const METRIC_ALIASES: Record<string, PSMetricKey> = {
  auc: 'AUC',
  'roc-auc': 'AUC',
  roc_auc: 'AUC',
  acc: 'Accuracy',
  accuracy: 'Accuracy',
  prec: 'Precision',
  precision: 'Precision',
  rec: 'Recall',
  recall: 'Recall',
  f1: 'F1',
  'f1-score': 'F1',
  f1_score: 'F1',
  logloss: 'LogLoss',
  'log-loss': 'LogLoss',
  log_loss: 'LogLoss',
  r2: 'R2',
  'r-squared': 'R2',
  r_squared: 'R2',
  rmse: 'RMSE',
  mae: 'MAE',
};

export const PS_FEATURE_DOMINANCE_THRESHOLD = 0.6;

export function HumanizeFeatureName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^Is([A-Z])/, '$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** @deprecated Use {@link HumanizeFeatureName}. */
export function humanizeFeatureName(name: string): string {
  return HumanizeFeatureName(name);
}

export function ParseMetrics(json: string | null | undefined): PSMetricMap {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: PSMetricMap = {};
  for (const [rawKey, rawVal] of Object.entries(parsed as Record<string, unknown>)) {
    const value = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;
    if (value == null) continue;
    const canonical = CanonicalMetricKey(rawKey);
    if (canonical && out[canonical] == null) out[canonical] = value;
  }
  return out;
}

/** @deprecated Use {@link ParseMetrics}. */
export function parseMetrics(json: string | null | undefined): PSMetricMap {
  return ParseMetrics(json);
}

export function CanonicalMetricKey(rawKey: string): PSMetricKey | null {
  const exact = PS_KNOWN_METRIC_KEYS.find((k) => k === rawKey);
  if (exact) return exact;
  return METRIC_ALIASES[rawKey.trim().toLowerCase()] ?? null;
}

/** @deprecated Use {@link CanonicalMetricKey}. */
export function canonicalMetricKey(rawKey: string): PSMetricKey | null {
  return CanonicalMetricKey(rawKey);
}

export function FormatMetricValue(key: PSMetricKey | string, val: number): string {
  if (!Number.isFinite(val)) return '—';
  switch (key) {
    case 'AUC':
    case 'Accuracy':
    case 'Precision':
    case 'Recall':
    case 'F1':
    case 'R2':
      return val.toFixed(3);
    case 'LogLoss':
    case 'RMSE':
    case 'MAE':
      return val < 10 ? val.toFixed(3) : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
    default:
      return val.toFixed(3);
  }
}

/** @deprecated Use {@link FormatMetricValue}. */
export function formatMetricValue(key: PSMetricKey | string, val: number): string {
  return FormatMetricValue(key, val);
}

export function PrimaryModelScore(
  model: { Metrics?: string | null; HoldoutMetrics?: string | null; ProblemType?: string | null },
): { key: PSMetricKey; label: string; value: number } | null {
  const isReg = (model.ProblemType ?? '').toLowerCase() === 'regression';
  const holdout = ParseMetrics(model.HoldoutMetrics);
  const train = ParseMetrics(model.Metrics);

  if (isReg) {
    for (const k of ['R2', 'RMSE', 'MAE'] as const) {
      if (holdout[k] != null) return { key: k, label: METRIC_LABELS[k], value: holdout[k]! };
    }
    for (const k of ['R2', 'RMSE', 'MAE'] as const) {
      if (train[k] != null) return { key: k, label: METRIC_LABELS[k], value: train[k]! };
    }
  }

  for (const k of ['AUC', 'Accuracy', 'F1', 'R2', 'RMSE'] as const) {
    if (holdout[k] != null) return { key: k, label: METRIC_LABELS[k], value: holdout[k]! };
  }
  for (const k of ['AUC', 'Accuracy', 'F1', 'R2', 'RMSE'] as const) {
    if (train[k] != null) return { key: k, label: METRIC_LABELS[k], value: train[k]! };
  }
  return null;
}

/** @deprecated Use {@link PrimaryModelScore}. */
export function primaryModelScore(
  model: { Metrics?: string | null; HoldoutMetrics?: string | null; ProblemType?: string | null },
): { key: PSMetricKey; label: string; value: number } | null {
  return PrimaryModelScore(model);
}

export function MetricsToDisplay(metrics: PSMetricMap, options: { excludeAuc?: boolean } = {}): PSMetricDisplay[] {
  const out: PSMetricDisplay[] = [];
  for (const k of PS_KNOWN_METRIC_KEYS) {
    if (options.excludeAuc && k === 'AUC') continue;
    const v = metrics[k];
    if (v != null) {
      out.push({
        key: k,
        label: METRIC_LABELS[k] ?? k,
        value: FormatMetricValue(k, v),
        raw: v,
      });
    }
  }
  return out;
}

/** @deprecated Use {@link MetricsToDisplay}. */
export function metricsToDisplay(metrics: PSMetricMap, options: { excludeAuc?: boolean } = {}): PSMetricDisplay[] {
  return MetricsToDisplay(metrics, options);
}

export function ParseFeatureImportance(raw: string | null | undefined, topN: number = 6): PSFeatureBar[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const entries: { name: string; val: number }[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed as Array<{ feature?: unknown; name?: unknown; importance?: unknown; weight?: unknown; value?: unknown }>) {
      const name = typeof item?.feature === 'string' ? item.feature : typeof item?.name === 'string' ? item.name : '';
      const rawVal = typeof item?.importance === 'number' ? item.importance : typeof item?.weight === 'number' ? item.weight : typeof item?.value === 'number' ? item.value : NaN;
      const val = Number(rawVal);
      if (name && Number.isFinite(val)) {
        entries.push({ name, val: Math.abs(val) });
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const val = typeof v === 'number' && Number.isFinite(v) ? Math.abs(v) : NaN;
      if (k && Number.isFinite(val)) {
        entries.push({ name: k, val });
      }
    }
  }

  if (entries.length === 0) return [];

  entries.sort((a, b) => b.val - a.val);
  const sliced = entries.slice(0, topN);
  const max = sliced[0]?.val ?? 1;

  return sliced.map((e) => ({
    name: e.name,
    value: e.val < 1 ? e.val.toFixed(3) : e.val.toFixed(1),
    pct: max > 0 ? Math.round((e.val / max) * 100) : 0,
    warning: e.val >= PS_FEATURE_DOMINANCE_THRESHOLD,
  }));
}

/** @deprecated Use {@link ParseFeatureImportance}. */
export function parseFeatureImportance(raw: string | null | undefined, topN: number = 6): PSFeatureBar[] {
  return ParseFeatureImportance(raw, topN);
}

export function MaxFeatureImportance(raw: string | null | undefined): number | null {
  const bars = ParseFeatureImportance(raw, 1);
  if (bars.length === 0) return null;
  const num = parseFloat(bars[0].value);
  return Number.isFinite(num) ? num : null;
}

/** @deprecated Use {@link MaxFeatureImportance}. */
export function maxFeatureImportance(raw: string | null | undefined): number | null {
  return MaxFeatureImportance(raw);
}

export function OverfitGap(model: { Metrics?: string | null; HoldoutMetrics?: string | null }): number | null {
  const train = ParseMetrics(model.Metrics);
  const holdout = ParseMetrics(model.HoldoutMetrics);
  if (train.AUC != null && holdout.AUC != null) {
    return train.AUC - holdout.AUC;
  }
  if (train.R2 != null && holdout.R2 != null) {
    return train.R2 - holdout.R2;
  }
  return null;
}

/** @deprecated Use {@link OverfitGap}. */
export function overfitGap(model: { Metrics?: string | null; HoldoutMetrics?: string | null }): number | null {
  return OverfitGap(model);
}
