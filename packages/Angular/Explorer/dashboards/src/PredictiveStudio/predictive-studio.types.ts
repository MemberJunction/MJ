/**
 * Shared view-model types + representative sample data for the Predictive Studio dashboard.
 *
 * The panels prefer live RunView-bound data from {@link PredictiveStudioEngine}. Where the live
 * Predictive Studio data surface isn't populated yet (no trained models / running experiments in a
 * fresh environment), these representative samples drive the visual fidelity of the world-class
 * mockups. Each panel falls back to samples only when its cached entity array is empty.
 */

export type PSPanelKey = 'home' | 'catalog' | 'pipelines' | 'experiments' | 'registry' | 'compare';

/** A vertical activity-feed item on the Home panel. */
export interface PSActivityItem {
  kind: 'promote' | 'run' | 'warn' | 'archive';
  icon: string;
  title: string;
  detail: string;
  when: string;
}

/** A kanban iteration card on the Experiments panel. */
export interface PSIterationCard {
  algorithm: string;
  algorithmIcon: string;
  algorithmColor: string;
  iteration: string;
  features: string[];
  status: 'Running' | 'Best' | 'Completed' | 'AwaitingApproval' | 'Pruned';
  /** For running cards: 0..100 progress; for completed/pruned: the holdout score. */
  progress?: number;
  progressDetail?: string;
  score?: number;
  scoreDelta?: string;
  rationale: string;
}

/** A leaderboard pill on the Experiments panel. */
export interface PSLeaderboardEntry {
  rank: number;
  algorithm: string;
  algorithmIcon: string;
  algorithmColor: string;
  features: string;
  auc: number;
  best?: boolean;
  pruned?: boolean;
}

/** A budget gauge on the Experiments panel. */
export interface PSBudgetGauge {
  label: string;
  fillPct: number;
  centerText: string;
  value: string;
  cap: string;
  color: string;
}

/** A feature-importance bar (registry / compare panels). */
export interface PSFeatureBar {
  name: string;
  pct: number;
  value: string;
  warning?: boolean;
}

/** A single run in the Compare panel. */
export interface PSCompareRun {
  key: 'A' | 'B' | 'C';
  label: string;
  algorithm: string;
  descriptor: string;
  color: string;
  holdoutAuc: number;
  trainAuc: number;
  overfitGap: number;
  f1: number;
  trainTime: string;
  maxImportance: number;
  interpretability: string;
  statusBadge: { text: string; variant: 'green' | 'amber' | 'blue' };
  importance: PSFeatureBar[];
}

/** Lifecycle steps shared by the registry detail stepper. */
export const PS_LIFECYCLE_STEPS = ['Draft', 'Validated', 'Published', 'Archived'] as const;
export type PSLifecycleStep = (typeof PS_LIFECYCLE_STEPS)[number];

// ---- Representative samples (used only when live arrays are empty) ----

export const SAMPLE_ACTIVITY: PSActivityItem[] = [
  {
    kind: 'promote',
    icon: 'fa-solid fa-arrow-up',
    title: 'Renewal Propensity v4 promoted to Published',
    detail: 'XGBoost · holdout AUC 0.864 · now serving production scoring',
    when: '22 minutes ago · by Amith N.',
  },
  {
    kind: 'run',
    icon: 'fa-solid fa-flask',
    title: 'Algorithm Sweep finished run #118 — LightGBM led at 0.861',
    detail: 'Renewal v5 experiment · 4 of 6 algorithms evaluated',
    when: '1 hour ago',
  },
  {
    kind: 'warn',
    icon: 'fa-solid fa-triangle-exclamation',
    title: 'Leakage flag raised on RenewalDate_Prior in Lapse Tier sweep',
    detail: 'Feature correlates 0.97 with target — review before promotion',
    when: '3 hours ago',
  },
  {
    kind: 'run',
    icon: 'fa-solid fa-bolt',
    title: 'Scoring batch completed — 48,210 members scored',
    detail: 'Renewal Propensity v4 · weekly cycle · 0 errors',
    when: 'Yesterday, 6:00 AM',
  },
  {
    kind: 'archive',
    icon: 'fa-solid fa-box-archive',
    title: 'Renewal Propensity v3 (Logistic Regression) archived',
    detail: 'Superseded by v4 champion',
    when: '2 days ago',
  },
];

export const SAMPLE_LEADERBOARD: PSLeaderboardEntry[] = [
  { rank: 1, algorithm: 'XGBoost', algorithmIcon: 'fa-solid fa-bolt', algorithmColor: '#2050c8', features: 'engagement + recency', auc: 0.864, best: true },
  { rank: 2, algorithm: 'LightGBM', algorithmIcon: 'fa-solid fa-feather', algorithmColor: '#d98213', features: 'full feature set', auc: 0.859 },
  { rank: 3, algorithm: 'Random Forest', algorithmIcon: 'fa-solid fa-tree', algorithmColor: '#1f9d57', features: 'engagement', auc: 0.847 },
  { rank: 4, algorithm: 'Logistic Reg.', algorithmIcon: 'fa-solid fa-wave-square', algorithmColor: '#7b3ff0', features: 'core', auc: 0.812 },
  { rank: 5, algorithm: 'XGBoost', algorithmIcon: 'fa-solid fa-tree', algorithmColor: '#7a8aa0', features: 'geo-heavy', auc: 0.79, pruned: true },
];

export const SAMPLE_BUDGET: PSBudgetGauge[] = [
  { label: 'Compute cost', fillPct: 62, centerText: '62%', value: '$31', cap: '$50 cap', color: '#d98213' },
  { label: 'Iterations', fillPct: 56, centerText: '14', value: '14', cap: '25 trials', color: '#2050c8' },
  { label: 'Wall-clock', fillPct: 42, centerText: '38m', value: '38', cap: '90 min', color: '#7b3ff0' },
];

export const SAMPLE_RUNNING: PSIterationCard[] = [
  {
    algorithm: 'CatBoost', algorithmIcon: 'fa-solid fa-cat', algorithmColor: '#2050c8', iteration: 'iteration 15 · 38s elapsed',
    features: ['engagement', 'tenure', 'interactions'], status: 'Running', progress: 72, progressDetail: 'fold 4 / 5 · 80 estimators',
    rationale: 'Trying ordered boosting to see if it edges past the XGBoost champion on the same feature set.',
  },
  {
    algorithm: 'LightGBM', algorithmIcon: 'fa-solid fa-feather', algorithmColor: '#d98213', iteration: 'iteration 16 · 14s elapsed',
    features: ['full feature set'], status: 'Running', progress: 41, progressDetail: 'fold 2 / 5 · early-stop on',
    rationale: 'Full feature set with early stopping to test whether wider data still helps after pruning.',
  },
  {
    algorithm: 'MLP', algorithmIcon: 'fa-solid fa-network-wired', algorithmColor: '#7b3ff0', iteration: 'iteration 17 · 6s elapsed',
    features: ['embeddings'], status: 'Running', progress: 18, progressDetail: 'epoch 6 / 40 · 2-layer 128d',
    rationale: 'Neural net on the 384-dim member embedding to probe whether dense vectors lift AUC.',
  },
];

export const SAMPLE_COMPLETED: PSIterationCard[] = [
  {
    algorithm: 'XGBoost', algorithmIcon: 'fa-solid fa-bolt', algorithmColor: '#2050c8', iteration: 'iteration 14',
    features: ['engagement', 'recency'], status: 'Best', score: 0.864, scoreDelta: 'Δ best —',
    rationale: 'Engagement + recency on gradient boosting — the current leader on the locked holdout.',
  },
  {
    algorithm: 'LightGBM', algorithmIcon: 'fa-solid fa-feather', algorithmColor: '#d98213', iteration: 'iteration 12',
    features: ['full feature set'], status: 'Completed', score: 0.859, scoreDelta: 'Δ −0.005',
    rationale: 'Within 0.005 of the champion and 2× faster to train — a viable challenger.',
  },
  {
    algorithm: 'Random Forest', algorithmIcon: 'fa-solid fa-tree', algorithmColor: '#1f9d57', iteration: 'iteration 8',
    features: ['engagement'], status: 'Completed', score: 0.847, scoreDelta: 'Δ −0.017',
    rationale: 'Robust baseline with minimal tuning — solid but trails the boosting models.',
  },
  {
    algorithm: 'Logistic Regression', algorithmIcon: 'fa-solid fa-wave-square', algorithmColor: '#7b3ff0', iteration: 'iteration 6',
    features: ['core'], status: 'AwaitingApproval', score: 0.812, scoreDelta: 'Δ −0.052',
    rationale: 'Fully interpretable with signed coefficients — flagged for review as the explainable fallback.',
  },
];

export const SAMPLE_PRUNED: PSIterationCard[] = [
  {
    algorithm: 'XGBoost', algorithmIcon: 'fa-solid fa-tree', algorithmColor: '#7a8aa0', iteration: 'iteration 9 · stopped at fold 2',
    features: ['geo-heavy'], status: 'Pruned', score: 0.79, scoreDelta: 'Δ −0.074',
    rationale: 'Geo-heavy feature set underperformed early — pruned to focus compute on engagement features.',
  },
  {
    algorithm: 'MLP', algorithmIcon: 'fa-solid fa-network-wired', algorithmColor: '#7a8aa0', iteration: 'iteration 5 · stopped at epoch 8',
    features: ['raw numeric'], status: 'Pruned', score: 0.741, scoreDelta: 'Δ −0.123',
    rationale: 'Raw numeric features without embeddings stalled — pruned in favor of the embedding variant.',
  },
];

export const SAMPLE_COMPARE_RUNS: PSCompareRun[] = [
  {
    key: 'A', label: 'Run A', algorithm: 'XGBoost', descriptor: 'engagement / recency features', color: '#2050c8',
    holdoutAuc: 0.864, trainAuc: 0.91, overfitGap: 0.046, f1: 0.79, trainTime: '42s', maxImportance: 0.31,
    interpretability: 'SHAP', statusBadge: { text: 'Recommended', variant: 'green' },
    importance: [
      { name: 'tenure', pct: 88, value: '0.22' },
      { name: 'days_since_act', pct: 76, value: '0.19' },
      { name: 'engagement', pct: 60, value: '0.15' },
      { name: 'events_signup', pct: 52, value: '0.13' },
      { name: 'emb_aggregate', pct: 72, value: '0.18' },
      { name: 'city', pct: 20, value: '0.05' },
    ],
  },
  {
    key: 'B', label: 'Run B', algorithm: 'LightGBM', descriptor: 'full feature set', color: '#7b3ff0',
    holdoutAuc: 0.859, trainAuc: 0.93, overfitGap: 0.071, f1: 0.78, trainTime: '28s', maxImportance: 0.63,
    interpretability: 'SHAP', statusBadge: { text: 'Overfit gap', variant: 'amber' },
    importance: [
      { name: 'tenure', pct: 40, value: '0.10' },
      { name: 'days_since_act', pct: 90, value: '0.63', warning: true },
      { name: 'engagement', pct: 32, value: '0.08' },
      { name: 'events_signup', pct: 28, value: '0.07' },
      { name: 'emb_aggregate', pct: 30, value: '0.07' },
      { name: 'city', pct: 18, value: '0.05' },
    ],
  },
  {
    key: 'C', label: 'Run C', algorithm: 'Logistic Reg.', descriptor: 'core features', color: '#d98213',
    holdoutAuc: 0.812, trainAuc: 0.82, overfitGap: 0.008, f1: 0.74, trainTime: '9s', maxImportance: 0.34,
    interpretability: 'full coeffs', statusBadge: { text: 'Interpretable', variant: 'blue' },
    importance: [
      { name: 'tenure', pct: 70, value: '0.34' },
      { name: 'days_since_act', pct: 58, value: '0.28' },
      { name: 'engagement', pct: 44, value: '0.21' },
      { name: 'events_signup', pct: 30, value: '0.14' },
      { name: 'emb_aggregate', pct: 0, value: '—' },
      { name: 'city', pct: 12, value: '0.06' },
    ],
  },
];

export const SAMPLE_REGISTRY_IMPORTANCE: PSFeatureBar[] = [
  { name: 'tenure', pct: 88, value: '0.22' },
  { name: 'days_since_last_activity', pct: 76, value: '0.19' },
  { name: 'emb_aggregate', pct: 72, value: '0.18' },
  { name: 'events_at_signup', pct: 60, value: '0.15' },
  { name: 'engagement_score', pct: 48, value: '0.12' },
  { name: 'city', pct: 20, value: '0.05' },
];
