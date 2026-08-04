/**
 * Pure, framework-free view-model derivations for the Predictive Studio dashboard.
 *
 * Everything in this module is a deterministic function over plain data shapes (NOT BaseEntity
 * instances) so it can be unit-tested with zero DB / Angular / metadata-provider setup. The Angular
 * panels (Registry / Experiments / Home / Compare) thread their cached engine rows through narrow
 * row interfaces declared here, keeping the parsing + grouping + leaderboard logic out of the
 * components and under test.
 *
 * Design rules honored throughout:
 * - **100% entity-agnostic.** Nothing references members / renewals / any specific business entity —
 *   model/metric names come straight from the data. The single domain assumption is the ML metric
 *   vocabulary (AUC / F1 / precision / recall …), which is universal to predictive modeling.
 * - **Tolerant of missing/partial/garbage JSON.** Every parser returns `null` / `[]` rather than
 *   throwing, so a half-populated environment renders gracefully instead of erroring.
 * - **Only surface what's present.** Metric maps omit absent keys; the UI shows just the numbers the
 *   model actually recorded, never fabricated zeros.
 */

import { PSFeatureBar, PSIterationCard, PSLeaderboardEntry } from './predictive-studio.types';

// ---------------------------------------------------------------------------
// Narrow row shapes — the minimal slice of each entity these derivations need.
// Decoupled from the generated entity classes so the functions stay pure/testable.
// ---------------------------------------------------------------------------

/** Minimal model slice consumed by the registry/home/compare derivations. */
export interface PSModelRow {
  ID: string;
  Version: number;
  Status: string;
  AlgorithmID: string | null;
  PipelineID: string | null;
  Metrics: string | null;
  HoldoutMetrics: string | null;
  FeatureImportance: string | null;
  TargetVariable: string | null;
  ProblemType: string | null;
  TrainingDurationSec?: number | null;
}

/** Minimal experiment-session-iteration slice consumed by the experiments/compare derivations. */
export interface PSIterationRow {
  ID: string;
  ExperimentSessionID: string;
  Sequence: number;
  Label: string | null;
  Status: string;
  Score: number | null;
  ComputeCost: number | null;
  TokensUsed: number | null;
  Rationale: string | null;
  AlgorithmName?: string;
}

/** Minimal process-run slice consumed by the home activity/KPI derivations. */
export interface PSProcessRunRow {
  ID: string;
  Status: string;
  StartTime: Date | null;
  CreatedAt: Date | null;
  SuccessCount: number;
  TotalItemCount?: number | null;
  ProcessName: string | null;
  EntityName: string | null;
  DryRun: boolean;
}

// ---------------------------------------------------------------------------
// Metric JSON parsing
// ---------------------------------------------------------------------------

/** Canonical metric keys we know how to surface, in display order. */
export const PS_KNOWN_METRIC_KEYS = [
  'AUC',
  'Accuracy',
  'Precision',
  'Recall',
  'F1',
  'LogLoss',
  'Brier',
  'RMSE',
  'MAE',
  'R2',
] as const;

export type PSMetricKey = (typeof PS_KNOWN_METRIC_KEYS)[number];

/**
 * A parsed metric map — canonical key → numeric value. Only keys actually present (and numeric) in
 * the source JSON appear; everything else is omitted so the UI shows just real numbers.
 */
export type PSMetricMap = Partial<Record<PSMetricKey, number>>;

/** Lower-cased alias → canonical key, so we accept `auc`/`f1_score`/`logloss`/etc. across sidecars. */
const METRIC_ALIASES: Record<string, PSMetricKey> = {
  auc: 'AUC',
  'roc_auc': 'AUC',
  rocauc: 'AUC',
  accuracy: 'Accuracy',
  acc: 'Accuracy',
  precision: 'Precision',
  recall: 'Recall',
  f1: 'F1',
  'f1_score': 'F1',
  f1score: 'F1',
  logloss: 'LogLoss',
  'log_loss': 'LogLoss',
  brier: 'Brier',
  'brier_score': 'Brier',
  rmse: 'RMSE',
  mae: 'MAE',
  r2: 'R2',
  'r_squared': 'R2',
};

/**
 * Parse a metrics JSON string (e.g. `model.Metrics` / `model.HoldoutMetrics`) into a canonical
 * {@link PSMetricMap}. Accepts both canonical (`AUC`) and common alias (`auc`, `f1_score`) keys,
 * keeps only finite numeric values, and never throws — invalid/empty input yields `{}`.
 *
 * @param json The raw JSON string, or null/undefined.
 * @returns A metric map containing only the recognized, numeric metrics present in the source.
 */
export function parseMetrics(json: string | null | undefined): PSMetricMap {
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
    const value = coerceFiniteNumber(rawVal);
    if (value == null) continue;
    const canonical = canonicalMetricKey(rawKey);
    if (canonical && out[canonical] == null) out[canonical] = value;
  }
  return out;
}

/** Resolve a raw metric key to its canonical form (exact match first, then alias), or null. */
export function canonicalMetricKey(rawKey: string): PSMetricKey | null {
  const exact = PS_KNOWN_METRIC_KEYS.find((k) => k === rawKey);
  if (exact) return exact;
  return METRIC_ALIASES[rawKey.trim().toLowerCase()] ?? null;
}

/** The primary AUC/score of a model: holdout AUC preferred, else training AUC, else null. */
export function primaryAuc(model: Pick<PSModelRow, 'Metrics' | 'HoldoutMetrics'>): number | null {
  const holdout = parseMetrics(model.HoldoutMetrics);
  if (holdout.AUC != null) return holdout.AUC;
  const train = parseMetrics(model.Metrics);
  return train.AUC ?? null;
}

/** A labeled metric ready for display (value formatted to a sensible precision). */
export interface PSMetricDisplay {
  key: PSMetricKey;
  label: string;
  value: string;
}

/** Human labels for the canonical metric keys. */
const METRIC_LABELS: Record<PSMetricKey, string> = {
  AUC: 'AUC',
  Accuracy: 'Accuracy',
  Precision: 'Precision',
  Recall: 'Recall',
  F1: 'F1',
  LogLoss: 'Log Loss',
  Brier: 'Brier',
  RMSE: 'RMSE',
  MAE: 'MAE',
  R2: 'R²',
};

/**
 * Turn a metric map into an ordered, formatted display list (canonical order, only present keys).
 * AUC is excluded by default since the panels surface it as a hero number separately.
 *
 * @param metrics The parsed metric map.
 * @param options.excludeAuc When true (default), omit AUC from the secondary stat list.
 */
export function metricsToDisplay(metrics: PSMetricMap, options?: { excludeAuc?: boolean }): PSMetricDisplay[] {
  const excludeAuc = options?.excludeAuc ?? true;
  const out: PSMetricDisplay[] = [];
  for (const key of PS_KNOWN_METRIC_KEYS) {
    if (excludeAuc && key === 'AUC') continue;
    const value = metrics[key];
    if (value == null) continue;
    out.push({ key, label: METRIC_LABELS[key], value: formatMetricValue(key, value) });
  }
  return out;
}

/** Format a metric value: 3 decimals for ratio metrics, 2 for the rest. */
export function formatMetricValue(key: PSMetricKey, value: number): string {
  const threeDecimals: PSMetricKey[] = ['AUC', 'LogLoss', 'Brier', 'RMSE', 'MAE', 'R2'];
  return value.toFixed(threeDecimals.includes(key) ? 3 : 2);
}

/**
 * The train-vs-holdout overfit gap (train AUC − holdout AUC), or null when either is missing.
 * Positive means the model does better in-sample than out-of-sample (the expected direction).
 */
export function overfitGap(model: Pick<PSModelRow, 'Metrics' | 'HoldoutMetrics'>): number | null {
  const train = parseMetrics(model.Metrics).AUC;
  const holdout = parseMetrics(model.HoldoutMetrics).AUC;
  if (train == null || holdout == null) return null;
  return train - holdout;
}

// ---------------------------------------------------------------------------
// Feature importance
// ---------------------------------------------------------------------------

/** The dominance threshold above which a single feature's share triggers the leakage guard. */
export const PS_FEATURE_DOMINANCE_THRESHOLD = 0.6;

/**
 * Parse a `FeatureImportance` JSON string (a `Record<string, number>`) into sorted importance bars.
 * Sorts by absolute value (descending), normalizes the bar widths against the largest |value| so the
 * top bar fills the track, flags any bar at/above {@link PS_FEATURE_DOMINANCE_THRESHOLD}, and returns
 * at most `topN`. Never throws — invalid/empty input yields `[]`.
 *
 * Also accepts an array-of-`{ name|feature, importance|value }` shape (some sidecars emit that),
 * making the parser robust to both common serializations.
 *
 * @param json The raw feature-importance JSON, or null/undefined.
 * @param topN Maximum bars to return (default 6).
 */
export function parseFeatureImportance(json: string | null | undefined, topN = 6): PSFeatureBar[] {
  const entries = extractImportanceEntries(json);
  if (entries.length === 0) return [];
  const sorted = entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const maxAbs = Math.abs(sorted[0].value) || 1;
  return sorted.slice(0, topN).map((entry) => {
    const abs = Math.abs(entry.value);
    return {
      name: entry.name,
      pct: Math.round((abs / maxAbs) * 100),
      value: entry.value.toFixed(2),
      warning: abs >= PS_FEATURE_DOMINANCE_THRESHOLD,
    };
  });
}

/** The single largest absolute feature importance (the dominance number), or null. */
export function maxFeatureImportance(json: string | null | undefined): number | null {
  const entries = extractImportanceEntries(json);
  if (entries.length === 0) return null;
  return entries.reduce((max, e) => Math.max(max, Math.abs(e.value)), 0);
}

/** Internal: tolerant extraction of `{ name, value }[]` from either object or array JSON. */
function extractImportanceEntries(json: string | null | undefined): { name: string; value: number }[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const out: { name: string; value: number }[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const name = (rec['name'] ?? rec['feature'] ?? rec['Name'] ?? rec['Feature']) as unknown;
      const value = coerceFiniteNumber(rec['importance'] ?? rec['value'] ?? rec['Importance'] ?? rec['Value']);
      if (typeof name === 'string' && name.length > 0 && value != null) out.push({ name, value });
    }
    return out;
  }
  if (parsed && typeof parsed === 'object') {
    for (const [name, rawVal] of Object.entries(parsed as Record<string, unknown>)) {
      const value = coerceFiniteNumber(rawVal);
      if (value != null) out.push({ name, value });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Experiments — kanban grouping + leaderboard derivation
// ---------------------------------------------------------------------------

/** Algorithm chip styling (icon + categorical color), keyed by a normalized algorithm name. */
interface AlgoStyle {
  icon: string;
  color: string;
}

/**
 * Categorical algorithm accents. These are data-viz colors that must stay distinct across themes
 * (allowed token exception #3). A normalized-name lookup with a stable fallback keeps any algorithm
 * — known or not — rendering with a sensible icon + color.
 */
const ALGO_STYLES: { match: RegExp; style: AlgoStyle }[] = [
  { match: /xgb|xgboost|gradient/, style: { icon: 'fa-solid fa-bolt', color: '#2050c8' } },
  { match: /light\s*gbm|lgbm/, style: { icon: 'fa-solid fa-feather', color: '#d98213' } },
  { match: /cat\s*boost/, style: { icon: 'fa-solid fa-cat', color: '#2050c8' } },
  { match: /random\s*forest|forest|tree/, style: { icon: 'fa-solid fa-tree', color: '#1f9d57' } },
  { match: /logistic|linear|regression/, style: { icon: 'fa-solid fa-wave-square', color: '#7b3ff0' } },
  { match: /mlp|neural|network|deep/, style: { icon: 'fa-solid fa-network-wired', color: '#7b3ff0' } },
];

const ALGO_FALLBACK: AlgoStyle = { icon: 'fa-solid fa-cube', color: '#6b7280' };

/** Resolve an algorithm display name to its icon + categorical color. */
export function algoStyle(name: string | null | undefined): AlgoStyle {
  const normalized = (name ?? '').toLowerCase();
  return ALGO_STYLES.find((s) => s.match.test(normalized))?.style ?? ALGO_FALLBACK;
}

/** The three kanban buckets an iteration set is grouped into. */
export interface PSKanbanColumns {
  running: PSIterationCard[];
  completed: PSIterationCard[];
  pruned: PSIterationCard[];
}

/**
 * Group a session's iterations into the Running / Completed / Pruned kanban columns, mapping each to
 * a {@link PSIterationCard}. The single best-scoring Completed iteration is badged `Best`; `Pending`
 * iterations are treated as Running (they're queued/in-flight); `Failed` iterations join Pruned (a
 * terminal non-success outcome). Completed/pruned cards carry the holdout score + Δ-from-best; running
 * cards carry an indeterminate progress hint.
 *
 * @param iterations The session's iterations (any order — sorted by Sequence internally).
 * @returns The three populated kanban columns.
 */
export function groupIterationsToKanban(iterations: PSIterationRow[]): PSKanbanColumns {
  const sorted = [...iterations].sort((a, b) => a.Sequence - b.Sequence);
  const bestScore = bestIterationScore(sorted);

  const running: PSIterationCard[] = [];
  const completed: PSIterationCard[] = [];
  const pruned: PSIterationCard[] = [];

  for (const it of sorted) {
    const status = it.Status;
    if (status === 'Running' || status === 'Pending') {
      running.push(toRunningCard(it));
    } else if (status === 'Completed') {
      const isBest = it.Score != null && bestScore != null && it.Score === bestScore;
      completed.push(toScoredCard(it, isBest ? 'Best' : 'Completed', bestScore));
    } else {
      // Pruned or Failed → the pruned column (terminal, non-leading).
      pruned.push(toScoredCard(it, 'Pruned', bestScore));
    }
  }
  return { running, completed, pruned };
}

/** The highest Completed-iteration score in a set (the leaderboard top), or null. */
export function bestIterationScore(iterations: PSIterationRow[]): number | null {
  let best: number | null = null;
  for (const it of iterations) {
    if (it.Status !== 'Completed' || it.Score == null) continue;
    if (best == null || it.Score > best) best = it.Score;
  }
  return best;
}

/**
 * Derive the leaderboard (rank-ordered pills) from a session's iterations: every iteration with a
 * score, sorted by score descending, ranked 1..N. The top entry is flagged `best`; pruned/failed
 * iterations are flagged `pruned`. Iterations without a score are omitted.
 *
 * @param iterations The session's iterations.
 * @param topN Maximum leaderboard entries (default 6).
 */
export function deriveLeaderboard(iterations: PSIterationRow[], topN = 6): PSLeaderboardEntry[] {
  const scored = iterations.filter((it) => it.Score != null);
  scored.sort((a, b) => (b.Score as number) - (a.Score as number));
  return scored.slice(0, topN).map((it, idx) => {
    const algo = it.AlgorithmName ?? 'Unknown';
    const style = algoStyle(algo);
    return {
      rank: idx + 1,
      algorithm: algo,
      algorithmIcon: style.icon,
      algorithmColor: style.color,
      features: it.Label ?? `iteration ${it.Sequence}`,
      auc: it.Score as number,
      best: idx === 0,
      pruned: it.Status === 'Pruned' || it.Status === 'Failed',
    };
  });
}

/** Build a Running/Pending iteration card (indeterminate progress — no live percent available). */
function toRunningCard(it: PSIterationRow): PSIterationCard {
  const algo = it.AlgorithmName ?? 'Unknown';
  const style = algoStyle(algo);
  return {
    algorithm: algo,
    algorithmIcon: style.icon,
    algorithmColor: style.color,
    iteration: `iteration ${it.Sequence}${it.Status === 'Pending' ? ' · queued' : ' · in progress'}`,
    features: featureChips(it.Label),
    status: 'Running',
    progress: it.Status === 'Pending' ? 8 : 50,
    progressDetail: it.Status === 'Pending' ? 'waiting for a slot' : 'training…',
    rationale: it.Rationale ?? 'No rationale recorded.',
  };
}

/** Build a Completed/Best/Pruned iteration card carrying the score + Δ-from-best. */
function toScoredCard(it: PSIterationRow, status: 'Best' | 'Completed' | 'Pruned', bestScore: number | null): PSIterationCard {
  const algo = it.AlgorithmName ?? 'Unknown';
  const style = algoStyle(algo);
  return {
    algorithm: algo,
    algorithmIcon: style.icon,
    algorithmColor: status === 'Pruned' ? ALGO_FALLBACK.color : style.color,
    iteration: `iteration ${it.Sequence}`,
    features: featureChips(it.Label),
    status,
    score: it.Score ?? undefined,
    scoreDelta: scoreDelta(it.Score, bestScore, status),
    rationale: it.Rationale ?? 'No rationale recorded.',
  };
}

/** Split an iteration label into feature chips; falls back to a single generic chip. */
function featureChips(label: string | null): string[] {
  if (!label) return ['features'];
  // Labels are often "Algo + featureA, featureB" — keep the part after a '+' if present.
  const afterPlus = label.includes('+') ? label.slice(label.indexOf('+') + 1) : label;
  const chips = afterPlus
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return chips.length > 0 ? chips.slice(0, 4) : [label];
}

/** Format the Δ-from-best string for a scored card. */
function scoreDelta(score: number | null | undefined, bestScore: number | null, status: 'Best' | 'Completed' | 'Pruned'): string {
  if (status === 'Best') return 'Δ best —';
  if (score == null || bestScore == null) return '';
  const delta = score - bestScore;
  return `Δ ${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(3)}`;
}

// ---------------------------------------------------------------------------
// Home — KPIs + activity feed
// ---------------------------------------------------------------------------

/** A derived Home KPI strip — all entity-agnostic counts/metrics. */
export interface PSHomeKpis {
  publishedCount: number;
  activeExperiments: number;
  /** Best holdout AUC across published models, formatted, or '—' when none. */
  bestHoldout: string;
  /** Sum of SuccessCount across recent non-dry-run ML scoring runs this week. */
  scoredThisWeek: string;
  /** Total training runs (experiment iterations) recorded. */
  experimentRuns: number;
}

/**
 * Compute the Home KPI strip from the cached engine rows. `bestHoldout` is the max holdout AUC across
 * **published** models (the production-quality number); `scoredThisWeek` sums successful records
 * across the supplied recent scoring runs (already filtered to ML-scoring, non-dry-run, last 7 days
 * by the caller). Everything degrades gracefully to '—' / 0 when data is absent.
 */
export function computeHomeKpis(
  models: PSModelRow[],
  runningSessionCount: number,
  recentScoringRuns: PSProcessRunRow[],
  experimentRunCount: number,
): PSHomeKpis {
  const published = models.filter((m) => m.Status === 'Published');
  const bestHoldoutNum = published.reduce<number | null>((best, m) => {
    const auc = parseMetrics(m.HoldoutMetrics).AUC;
    if (auc == null) return best;
    return best == null ? auc : Math.max(best, auc);
  }, null);
  const scored = recentScoringRuns.reduce((sum, r) => sum + (r.SuccessCount || 0), 0);
  return {
    publishedCount: published.length,
    activeExperiments: runningSessionCount,
    bestHoldout: bestHoldoutNum == null ? '—' : bestHoldoutNum.toFixed(3),
    scoredThisWeek: scored.toLocaleString(),
    experimentRuns: experimentRunCount,
  };
}

/** A vertical activity-feed item, with the icon/kind chosen by {@link buildActivityFeed}. */
export interface PSActivityFeedItem {
  kind: 'promote' | 'run' | 'warn' | 'archive';
  icon: string;
  title: string;
  detail: string;
  when: string;
  /** Sort key (epoch ms) — most recent first. Not rendered. */
  sortMs: number;
}

/**
 * Build the Home recent-activity feed by merging recent ML scoring runs and recent model promotions
 * into one reverse-chronological list. Scoring runs become `run` (or `warn` when failed) items;
 * published models become `promote` items; archived models become `archive` items. Capped at `limit`.
 *
 * @param scoringRuns Recent ML scoring process runs (any order).
 * @param models All cached models (used to surface recent promotions/archives by UpdatedAt-derived time).
 * @param now Reference time for the relative "when" strings.
 * @param limit Max feed items (default 6).
 */
export function buildActivityFeed(
  scoringRuns: PSProcessRunRow[],
  modelEvents: PSModelEvent[],
  now: Date,
  limit = 6,
): PSActivityFeedItem[] {
  const items: PSActivityFeedItem[] = [];

  for (const run of scoringRuns) {
    // Never let a missing/invalid timestamp crash the whole feed — fall back to `now` so the run
    // still appears (a just-created run can transiently arrive with no usable date).
    const when = toDate(run.StartTime) ?? toDate(run.CreatedAt) ?? now;
    const failed = run.Status === 'Failed';
    items.push({
      kind: failed ? 'warn' : 'run',
      icon: failed ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-bolt',
      title: failed
        ? `Scoring run failed${run.ProcessName ? ` — ${run.ProcessName}` : ''}`
        : `Scored ${run.SuccessCount.toLocaleString()} ${run.EntityName ?? 'records'}`,
      detail: `${run.ProcessName ?? 'ML scoring'}${run.DryRun ? ' · dry run' : ''} · ${run.Status}`,
      when: relativeTime(when, now),
      sortMs: when.getTime(),
    });
  }

  for (const ev of modelEvents) {
    const isArchive = ev.kind === 'archive';
    const when = toDate(ev.when) ?? now;
    items.push({
      kind: isArchive ? 'archive' : 'promote',
      icon: isArchive ? 'fa-solid fa-box-archive' : 'fa-solid fa-arrow-up',
      title: isArchive
        ? `${ev.name} archived`
        : `${ev.name} promoted to ${ev.status}`,
      detail: ev.auc != null ? `${ev.algorithm ?? 'model'} · holdout AUC ${ev.auc.toFixed(3)}` : (ev.algorithm ?? 'model'),
      when: relativeTime(when, now),
      sortMs: when.getTime(),
    });
  }

  items.sort((a, b) => b.sortMs - a.sortMs);
  return items.slice(0, limit);
}

/** A model lifecycle event (promotion / archive) feeding the activity timeline. */
export interface PSModelEvent {
  kind: 'promote' | 'archive';
  name: string;
  status: string;
  algorithm: string | null;
  auc: number | null;
  when: Date;
}

/**
 * Project recent non-Draft models into lifecycle activity events (Published → promote, Archived →
 * archive), ordered by `when` (their last-updated time) descending. Validated models are treated as
 * promotions too (a meaningful lifecycle advance).
 *
 * @param models Model rows extended with a display name + last-updated time.
 * @param limit Max events (default 8).
 */
export function deriveModelEvents(models: PSModelEventSource[], limit = 8): PSModelEvent[] {
  const events: PSModelEvent[] = [];
  for (const m of models) {
    if (m.Status === 'Published' || m.Status === 'Validated') {
      events.push({ kind: 'promote', name: m.Name, status: m.Status, algorithm: m.Algorithm, auc: primaryAuc(m), when: m.UpdatedAt });
    } else if (m.Status === 'Archived') {
      events.push({ kind: 'archive', name: m.Name, status: m.Status, algorithm: m.Algorithm, auc: primaryAuc(m), when: m.UpdatedAt });
    }
  }
  events.sort((a, b) => b.when.getTime() - a.when.getTime());
  return events.slice(0, limit);
}

/** Source row for {@link deriveModelEvents} — a model plus its resolved display name + timestamp. */
export interface PSModelEventSource extends Pick<PSModelRow, 'Metrics' | 'HoldoutMetrics' | 'Status'> {
  Name: string;
  Algorithm: string | null;
  UpdatedAt: Date;
}

/**
 * A compact relative-time string ("just now", "22 minutes ago", "3 hours ago", "Yesterday",
 * "2 days ago", or a date for older). Deterministic given `now` — testable.
 */
/** Coerce a possibly-null / string / Date value to a valid Date, or `null` when there isn't one. */
export function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function relativeTime(when: Date, now: Date): string {
  const ms = now.getTime() - when.getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return when.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Compare — side-by-side runs from a session's iterations
// ---------------------------------------------------------------------------

/** A single run column in the Compare panel, derived from a scored iteration. */
export interface PSCompareColumn {
  key: string;
  label: string;
  algorithm: string;
  descriptor: string;
  color: string;
  holdoutAuc: number | null;
  computeCost: number | null;
  status: string;
  isBest: boolean;
}

/**
 * Derive Compare-panel run columns from a session's iterations: the scored iterations ranked by score
 * descending, capped at `maxRuns`, each carrying its holdout score, compute cost, and algorithm chip.
 * The top scorer is flagged `isBest`. Returns `[]` when nothing scored — the panel shows its prompt
 * state.
 *
 * @param iterations The session's iterations.
 * @param maxRuns Maximum run columns to compare (default 3).
 */
export function deriveCompareColumns(iterations: PSIterationRow[], maxRuns = 3): PSCompareColumn[] {
  const scored = iterations.filter((it) => it.Score != null);
  scored.sort((a, b) => (b.Score as number) - (a.Score as number));
  return scored.slice(0, maxRuns).map((it, idx) => {
    const algo = it.AlgorithmName ?? 'Unknown';
    const style = algoStyle(algo);
    return {
      key: it.ID,
      label: `Run ${idx + 1}`,
      algorithm: algo,
      descriptor: it.Label ?? `iteration ${it.Sequence}`,
      color: style.color,
      holdoutAuc: it.Score,
      computeCost: it.ComputeCost,
      status: it.Status,
      isBest: idx === 0,
    };
  });
}

/** A compare metric row (label + per-run formatted values + which column is best). */
export interface PSCompareMetricRow {
  label: string;
  qualifier: string;
  values: string[];
  bestIndex: number;
}

/**
 * Build the side-by-side metric rows for a set of compare columns. Currently surfaces Holdout AUC
 * (higher is better) and Compute Cost (lower is better) — the two universally-available iteration
 * metrics — formatting absent values as '—' and marking the best column per row.
 */
export function buildCompareMetricRows(columns: PSCompareColumn[]): PSCompareMetricRow[] {
  if (columns.length === 0) return [];
  const aucs = columns.map((c) => c.holdoutAuc);
  const costs = columns.map((c) => c.computeCost);
  return [
    {
      label: 'Holdout score',
      qualifier: 'the honest number · higher is better',
      values: aucs.map((v) => (v == null ? '—' : v.toFixed(3))),
      bestIndex: indexOfExtreme(aucs, 'max'),
    },
    {
      label: 'Compute cost',
      qualifier: 'lower is better',
      values: costs.map((v) => (v == null ? '—' : v.toFixed(2))),
      bestIndex: indexOfExtreme(costs, 'min'),
    },
  ];
}

/** Index of the max/min finite value in an array (−1 when all null). */
function indexOfExtreme(values: (number | null)[], dir: 'max' | 'min'): number {
  let bestIdx = -1;
  let bestVal: number | null = null;
  values.forEach((v, i) => {
    if (v == null) return;
    if (bestVal == null || (dir === 'max' ? v > bestVal : v < bestVal)) {
      bestVal = v;
      bestIdx = i;
    }
  });
  return bestIdx;
}

// ---------------------------------------------------------------------------
// shared coercion
// ---------------------------------------------------------------------------

/** Coerce an unknown value to a finite number, or null. Accepts numeric strings. */
export function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
