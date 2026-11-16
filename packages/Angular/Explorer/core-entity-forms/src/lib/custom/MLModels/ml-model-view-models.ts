/**
 * Pure view-model functions and types for ML Model detail and metrics rendering.
 * Framework-free, deterministic calculations over plain model entity data.
 */
import { ImportanceDisplay } from '@memberjunction/predictive-studio-core';

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
  | 'MulticlassLogLoss'
  | 'Brier'
  | 'R2'
  | 'RMSE'
  | 'MAE'
  | 'PoissonDeviance'
  | 'TweedieDeviance'
  | 'MASE';

export type PSMetricMap = Partial<Record<PSMetricKey, number>>;

export const PS_KNOWN_METRIC_KEYS: readonly PSMetricKey[] = [
  'AUC',
  'Accuracy',
  'Precision',
  'Recall',
  'F1',
  'LogLoss',
  'MulticlassLogLoss',
  'Brier',
  'R2',
  'RMSE',
  'MAE',
  'PoissonDeviance',
  'TweedieDeviance',
  'MASE',
] as const;

export const METRIC_LABELS: Record<PSMetricKey, string> = {
  AUC: 'AUC (ROC)',
  Accuracy: 'Accuracy',
  Precision: 'Precision',
  Recall: 'Recall',
  F1: 'F1 Score',
  LogLoss: 'Log Loss',
  MulticlassLogLoss: 'Multiclass Log Loss',
  Brier: 'Brier Score',
  R2: 'R² (Fit)',
  RMSE: 'RMSE',
  MAE: 'MAE',
  PoissonDeviance: 'Poisson Deviance',
  TweedieDeviance: 'Tweedie Deviance',
  MASE: 'MASE',
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
  'multiclass-log-loss': 'MulticlassLogLoss',
  brier: 'Brier',
  brier_score: 'Brier',
  'poisson-deviance': 'PoissonDeviance',
  'tweedie-deviance': 'TweedieDeviance',
  mase: 'MASE',
  r2: 'R2',
  'r-squared': 'R2',
  r_squared: 'R2',
  rmse: 'RMSE',
  mae: 'MAE',
};

export const PS_FEATURE_DOMINANCE_THRESHOLD = 0.6;

/**
 * The ML Model form's label for a feature column: drops a leading `Is` before a capital, splits camelCase, turns `_`
 * into spaces and title-cases every word (`IsActive` → `Active`, `membership_type` → `Membership Type`). A published
 * export whose output is fixed; the dashboards' at-risk drivers use `AtRiskRules.HumanizeFeatureName` (predictive-studio-core), which
 * keeps an `Is` prefix and sentence-cases snake_case names.
 */
export function HumanizeFeatureName(name: string): string {
  if (!name) return '';
  return name
    .replace(/^Is([A-Z])/, '$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
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

export function CanonicalMetricKey(rawKey: string): PSMetricKey | null {
  const exact = PS_KNOWN_METRIC_KEYS.find((k) => k === rawKey);
  if (exact) return exact;
  return METRIC_ALIASES[rawKey.trim().toLowerCase()] ?? null;
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
    case 'MulticlassLogLoss':
    case 'Brier':
    case 'RMSE':
    case 'MAE':
    case 'PoissonDeviance':
    case 'TweedieDeviance':
    case 'MASE':
      return val < 10 ? val.toFixed(3) : val.toLocaleString(undefined, { maximumFractionDigits: 2 });
    default:
      return val.toFixed(3);
  }
}

/** A model's score as the form shows it: the metric, its label and the value. */
type PSModelScore = { key: PSMetricKey; label: string; value: number };

/**
 * The primary metric score of a model: holdout preferred, else training. R² first for a regression, AUC for a
 * classification; failing those, the first metric the holdout stores, which a trained model's holdout lists first as the
 * protocol's primary proper score (all a kept simple baseline or a forecast stores).
 */
export function PrimaryModelScore(
  model: { Metrics?: string | null; HoldoutMetrics?: string | null; ProblemType?: string | null },
): PSModelScore | null {
  const preferred: readonly PSMetricKey[] = (model.ProblemType ?? '').toLowerCase() === 'regression'
    ? ['R2', 'RMSE', 'MAE', 'AUC', 'Accuracy', 'F1']
    : ['AUC', 'Accuracy', 'F1', 'R2', 'RMSE'];
  const holdout = ParseMetrics(model.HoldoutMetrics);
  const train = ParseMetrics(model.Metrics);
  return preferredScore(holdout, preferred) || firstStoredScore(holdout) || preferredScore(train, preferred) || firstStoredScore(train);
}

/** The first of `keys` the map holds. */
function preferredScore(metrics: PSMetricMap, keys: readonly PSMetricKey[]): PSModelScore | null {
  const key = keys.find((k) => metrics[k] != null);
  const value = key === undefined ? undefined : metrics[key];
  return key === undefined || value === undefined ? null : { key, label: METRIC_LABELS[key], value };
}

/** The first metric the map holds, in the order the stored JSON lists them. */
function firstStoredScore(metrics: PSMetricMap): PSModelScore | null {
  const key = Object.keys(metrics).map((k) => CanonicalMetricKey(k)).find((k): k is PSMetricKey => k !== null);
  const value = key === undefined ? undefined : metrics[key];
  return key === undefined || value === undefined ? null : { key, label: METRIC_LABELS[key], value };
}

/**
 * Whether a model's train-side `Metrics` hold an inner cross-validation estimate rather than an in-sample score: true
 * for a model trained under an Evaluation Protocol, whose lineage names the protocol (`evaluationProtocolId`).
 */
export function TrainScoreIsInnerCv(lineageJson: string | null | undefined): boolean {
  if (!lineageJson) return false;
  try {
    const parsed: { evaluationProtocolId?: string | null } | null = JSON.parse(lineageJson);
    return typeof parsed?.evaluationProtocolId === 'string' && parsed.evaluationProtocolId.length > 0;
  } catch {
    return false;
  }
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

export function MaxFeatureImportance(raw: string | null | undefined): number | null {
  const bars = ParseFeatureImportance(raw, 1);
  if (bars.length === 0) return null;
  const num = parseFloat(bars[0].value);
  return Number.isFinite(num) ? num : null;
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

/** The importance a model view may show. */
export class ModelImportanceView {
  /** The importance bars a person may see: coefficient models only (split / impurity counts are not comparable across features and read as importance they are not, so they are hidden). */
  public static DisplayedFeatureImportance(lineageJSON: string | null | undefined, raw: string | null | undefined, topN: number = 6): PSFeatureBar[] {
    return ImportanceDisplay.GlobalDriversShowable(lineageJSON) ? ParseFeatureImportance(raw, topN) : [];
  }
}
