/**
 * @module trust
 *
 * The TRUST translator — turns a model's raw quality metrics into a plain-language verdict a
 * non-technical business user can act on, and decides whether they're ALLOWED to act on it.
 *
 * This is the safety centerpiece of the Predictive Studio business-user experience (see
 * `plans/predictive-studio-business-ux/`): a business user must never unknowingly act on a model
 * that's no better than guessing. Instead of `AUC 0.513`, we grade the model Poor / Fair / Good /
 * Excellent, say in plain words how much to rely on it, and — critically — GATE the downstream
 * actions: a Poor (or unmeasured) model returns `canAct: false`.
 *
 * It lives in the **types-only Core package on purpose**: the SAME rule must drive both the business
 * UI (catalog trust badges + the workspace action gate) and the Predictive Studio Agent's **publish
 * gate** (it won't publish a model the verdict can't clear). One source of truth, no drift.
 *
 * Pure + dependency-free (Core is types-only). Tolerant of missing/garbage metrics: an unmeasurable
 * model grades `unknown` and is gated OFF — fail-safe, never fail-open.
 */

/** Plain-language reliability grade shown to business users instead of raw metrics. */
export type TrustGrade = 'Poor' | 'Fair' | 'Good' | 'Excellent';

/** The minimal model slice the verdict needs — satisfied structurally by `MJMLModelEntity` and the UI row. */
export interface TrustModelInput {
  Metrics?: string | null;
  HoldoutMetrics?: string | null;
  ProblemType?: string | null;
}

/** The full plain-language verdict for a model, derived from its metrics. */
export interface TrustVerdict {
  /** The plain reliability grade. */
  grade: TrustGrade;
  /** 0–1 normalized trust score, for a meter/visual (NOT a probability). */
  score01: number;
  /** Headline in plain words, e.g. "Right about 8 out of 10 times." */
  oneLiner: string;
  /** Guidance for how much to rely on it (grade-specific). */
  explanation: string;
  /** Whether the user may ACT on this prediction (the gate). `false` for Poor or unmeasured models. */
  canAct: boolean;
  /** When `canAct` is false, the plain reason actions are locked; otherwise null. */
  gateReason: string | null;
  /** The metric that drove the grade, for the "For analysts ▸" disclosure. null if none usable. */
  headlineMetric: { key: 'AUC' | 'Accuracy' | 'R2'; value: number } | null;
  /** True when no usable quality metric was found — trust is unknown and actions are gated off. */
  unknown: boolean;
}

/** Optional context for the human-readable evidence line. */
export interface TrustEvidenceOptions {
  /** Number of unseen records the model was checked against (the holdout set). */
  count?: number | null;
  /** What the records are, in plain words (e.g. "members"). Defaults to "records". */
  noun?: string;
}

// --- minimal, self-contained metric parsing (Core stays dependency-free) ------
interface TrustMetrics {
  AUC?: number;
  Accuracy?: number;
  R2?: number;
}
const TRUST_METRIC_ALIASES: Record<string, keyof TrustMetrics> = {
  auc: 'AUC',
  roc_auc: 'AUC',
  rocauc: 'AUC',
  accuracy: 'Accuracy',
  acc: 'Accuracy',
  r2: 'R2',
  r_squared: 'R2',
  rsquared: 'R2',
};

/** Parse a metrics JSON string into the three keys the trust verdict needs. Never throws. */
function parseTrustMetrics(json: string | null | undefined): TrustMetrics {
  if (!json) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: TrustMetrics = {};
  for (const [rawKey, rawVal] of Object.entries(parsed as Record<string, unknown>)) {
    const value = typeof rawVal === 'number' && Number.isFinite(rawVal) ? rawVal : null;
    if (value == null) continue;
    const canonical = TRUST_METRIC_ALIASES[rawKey.trim().toLowerCase()];
    if (canonical && out[canonical] == null) out[canonical] = value;
  }
  return out;
}

// --- grade thresholds (single source of truth) --------------------------------
// Classification is judged on AUC (rank-quality, base-rate-independent); Accuracy is a fallback.
// AUC 0.5 = a coin flip. Regression is judged on R².
const AUC_BANDS: ReadonlyArray<readonly [min: number, grade: TrustGrade]> = [
  [0.85, 'Excellent'],
  [0.7, 'Good'],
  [0.6, 'Fair'],
  [0, 'Poor'],
];
const R2_BANDS: ReadonlyArray<readonly [min: number, grade: TrustGrade]> = [
  [0.8, 'Excellent'],
  [0.5, 'Good'],
  [0.3, 'Fair'],
  [-Infinity, 'Poor'],
];

function bandGrade(value: number, bands: ReadonlyArray<readonly [number, TrustGrade]>): TrustGrade {
  for (const [min, grade] of bands) {
    if (value >= min) return grade;
  }
  return 'Poor';
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

function isRegression(problemType: string | null | undefined): boolean {
  return (problemType ?? '').trim().toLowerCase() === 'regression';
}

/** Holdout metrics preferred (honest, unseen-data estimate); fall back to training metrics. */
function bestMetrics(model: TrustModelInput): TrustMetrics {
  const holdout = parseTrustMetrics(model.HoldoutMetrics);
  return Object.keys(holdout).length > 0 ? holdout : parseTrustMetrics(model.Metrics);
}

const GRADE_EXPLANATION: Record<TrustGrade, string> = {
  Excellent: 'Highly reliable — you can lean on this to make decisions.',
  Good: 'Reliable enough to prioritize who to focus on. For high-stakes or one-off calls, use your judgment too.',
  Fair: 'A useful starting point, but not a sure thing — sanity-check the results before you act on them.',
  Poor: "Not reliable yet — don't use it to make decisions until an analyst improves it.",
};

/** Fallback headline when we have a grade but no clean "N out of 10" / "%" metric to phrase it. */
const GRADE_HEADLINE: Record<TrustGrade, string> = {
  Excellent: 'Very reliable.',
  Good: 'Reliable enough to act on.',
  Fair: 'A useful signal, not a sure thing.',
  Poor: 'Not reliable — about as accurate as guessing.',
};

/** Build the plain "right about N out of 10" headline (classification) or the R² headline (regression). */
function buildOneLiner(grade: TrustGrade, regression: boolean, metrics: TrustMetrics): string {
  if (regression) {
    if (metrics.R2 != null) {
      return grade === 'Poor'
        ? 'Barely better than a flat guess — not reliable.'
        : `Explains about ${Math.round(clamp01(metrics.R2) * 100)}% of what drives the outcome.`;
    }
    return GRADE_HEADLINE[grade];
  }
  if (grade === 'Poor') return 'About as accurate as guessing — not reliable.';
  if (metrics.Accuracy != null) {
    const outOf10 = Math.round(clamp01(metrics.Accuracy) * 10);
    const suffix = grade === 'Excellent' ? ' — very reliable.' : grade === 'Fair' ? ' — a useful signal, not a sure thing.' : '.';
    return `Right about ${outOf10} out of 10 times${suffix}`;
  }
  return GRADE_HEADLINE[grade];
}

const POOR_GATE_REASON =
  "This prediction is about as accurate as guessing, so it isn't safe to act on yet. An analyst needs to improve it first.";
const UNKNOWN_GATE_REASON =
  "We can't tell how reliable this prediction is yet, so actions are locked until it's been checked against real results.";

/**
 * Derive the plain-language trust verdict for a model from its metrics. Holdout metrics preferred.
 * Classification grades on AUC (then Accuracy); regression on R². An unmeasured model is gated OFF.
 *
 * @param model the model's metric JSON + problem type.
 * @returns the grade, plain copy, and the `canAct` gate (false for Poor or unmeasured models).
 */
export function deriveTrustVerdict(model: TrustModelInput): TrustVerdict {
  const regression = isRegression(model.ProblemType);
  const metrics = bestMetrics(model);

  let headlineMetric: { key: 'AUC' | 'Accuracy' | 'R2'; value: number } | null = null;
  let grade: TrustGrade | null = null;
  let score01 = 0;

  if (regression) {
    if (metrics.R2 != null) {
      headlineMetric = { key: 'R2', value: metrics.R2 };
      grade = bandGrade(metrics.R2, R2_BANDS);
      score01 = clamp01(metrics.R2);
    }
  } else if (metrics.AUC != null) {
    headlineMetric = { key: 'AUC', value: metrics.AUC };
    grade = bandGrade(metrics.AUC, AUC_BANDS);
    score01 = clamp01((metrics.AUC - 0.5) / 0.5);
  } else if (metrics.Accuracy != null) {
    headlineMetric = { key: 'Accuracy', value: metrics.Accuracy };
    grade = bandGrade(metrics.Accuracy, AUC_BANDS); // reuse the bands as a rough fallback
    score01 = clamp01((metrics.Accuracy - 0.5) / 0.5);
  }

  // Unmeasurable → unknown trust → GATE OFF (fail-safe).
  if (grade == null) {
    return {
      grade: 'Poor',
      score01: 0,
      oneLiner: "We haven't measured how reliable this is.",
      explanation: "This prediction hasn't been checked against real results yet, so we can't say how much to trust it.",
      canAct: false,
      gateReason: UNKNOWN_GATE_REASON,
      headlineMetric: null,
      unknown: true,
    };
  }

  const canAct = grade !== 'Poor';
  return {
    grade,
    score01,
    oneLiner: buildOneLiner(grade, regression, metrics),
    explanation: GRADE_EXPLANATION[grade],
    canAct,
    gateReason: canAct ? null : POOR_GATE_REASON,
    headlineMetric,
    unknown: false,
  };
}

/**
 * Human-readable "checked against N members it had never seen" evidence line. Returns a generic
 * phrasing when no count is available (never fabricates a number).
 */
export function trustEvidenceLine(opts?: TrustEvidenceOptions): string {
  const noun = opts?.noun?.trim() || 'records';
  if (opts?.count != null && Number.isFinite(opts.count) && opts.count > 0) {
    return `Checked against ${Math.round(opts.count).toLocaleString()} past ${noun} it had never seen.`;
  }
  return `Checked against past ${noun} it had never seen.`;
}

/** The 0–5 "filled dots/stars" count for a grade, for compact visuals. */
export function trustDots(grade: TrustGrade): number {
  return grade === 'Excellent' ? 5 : grade === 'Good' ? 4 : grade === 'Fair' ? 3 : 1;
}
