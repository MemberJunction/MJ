/**
 * @module trust
 *
 * The TRUST translator — turns a model's raw quality metrics into a plain-language verdict a
 * non-technical business user can act on, and decides whether they're ALLOWED to act on it.
 *
 * Holdout metrics preferred; validation metrics only when recorded out-of-sample; a
 * time-indexed model not evaluated as a forecast is Poor; a classifier no better than the majority class is Poor under
 * the model's recorded majority-baseline rule `enforce` (the default) and carries a visible, non-capping finding under
 * `warn` (accuracy-only verdicts are capped under either).
 *
 * Pure + dependency-free (Core is types-only). Tolerant of missing/garbage metrics: an unmeasurable
 * model grades `unknown` and is gated OFF — fail-safe, never fail-open.
 */
import { EvaluationLineage, type EvaluationRecord } from './evaluation-record';
import type { MajorityBaselineRule } from './pipeline-spec';

/** Plain-language reliability grade shown to business users instead of raw metrics. */
export type TrustGrade = 'Poor' | 'Fair' | 'Good' | 'Excellent';

/** The minimal model slice the verdict needs — satisfied structurally by `MJMLModelEntity` and the UI row. */
export interface TrustModelInput {
  Metrics?: string | null;
  HoldoutMetrics?: string | null;
  ProblemType?: string | null;
  /**
   * The model's `Lineage` JSON. Its `evaluation` record says whether `Metrics` were measured out of sample and whether
   * the verdict is withheld (a declared time index not evaluated as a forecast). `MJMLModelEntity` satisfies this.
   */
  Lineage?: string | null;
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
  /** The stored reason the verdict is withheld (e.g. "not evaluated as a forecast"); null or absent otherwise. */
  withheldReason?: string | null;
  /**
   * Set when a classifier is no better than always guessing the most common class (or predicts one class): the rule
   * in force, whether it capped the grade, and the numbers. Null otherwise. No UI renders it yet;
   * callers that show analyst detail read it here, and the truth-suite harness records it per model.
   */
  majorityBaseline?: MajorityBaselineFinding | null;
}

/** The majority-baseline check's result on one model (decision D2-C5d). */
export interface MajorityBaselineFinding {
  /** The rule recorded in the model's `Lineage.evaluation` (`'enforce'` when the lineage has none). */
  rule: MajorityBaselineRule;
  /** True when the finding graded the model Poor: rule `enforce`, or an accuracy-only verdict under either rule. */
  enforced: boolean;
  /** Holdout (or out-of-sample validation) accuracy; null when not reported. */
  accuracy: number | null;
  /** Accuracy of always guessing the most common class on the same rows (sidecar `baseline_accuracy`). */
  baselineAccuracy: number | null;
  /** How many distinct classes the model predicted on those rows (sidecar `predicted_classes`). */
  predictedClasses: number | null;
  /** One plain sentence with the numbers. */
  note: string;
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
  BaselineAccuracy?: number;
  PredictedClasses?: number;
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
  baseline_accuracy: 'BaselineAccuracy',
  predicted_classes: 'PredictedClasses',
};

/** Parse a metrics JSON string into the keys the trust verdict needs. Never throws. */
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

/**
 * Holdout metrics first. Validation `Metrics` count only when the model's evaluation record says they were measured
 * out of sample (F-TR-3): models trained before this change scored k-fold / holdout in-sample.
 */
function bestMetrics(model: TrustModelInput, evaluation: EvaluationRecord | null): TrustMetrics {
  const holdout = parseTrustMetrics(model.HoldoutMetrics);
  if (Object.keys(holdout).length > 0) return holdout;
  return evaluation?.ValidationOutOfSample === true ? parseTrustMetrics(model.Metrics) : {};
}

/** A classifier right no more often than always guessing the most common class, or one that predicts a single class. */
function noBetterThanMajority(m: TrustMetrics): boolean {
  if (m.PredictedClasses !== undefined && m.PredictedClasses <= 1) return true;
  return m.Accuracy !== undefined && m.BaselineAccuracy !== undefined && m.Accuracy <= m.BaselineAccuracy;
}

/** "79.6%" — a share as a percentage with one decimal. */
function formatShare(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * The majority-baseline finding for a classifier that fails {@link noBetterThanMajority}. Under `warn` it caps the
 * grade only when the headline is accuracy: without an AUC, accuracy against the majority rate is the only evidence.
 */
function majorityFinding(m: TrustMetrics, rule: MajorityBaselineRule, accuracyIsHeadline: boolean): MajorityBaselineFinding {
  const singleClass = m.PredictedClasses !== undefined && m.PredictedClasses <= 1;
  const note =
    !singleClass && m.Accuracy !== undefined && m.BaselineAccuracy !== undefined
      ? `Right ${formatShare(m.Accuracy)} of the time; always guessing the most common outcome is right ${formatShare(m.BaselineAccuracy)} of the time.`
      : 'Predicts the same outcome for every record.';
  return {
    rule,
    enforced: rule === 'enforce' || accuracyIsHeadline,
    // `??` on purpose: an accuracy, baseline or class count of 0 is a legitimate value.
    accuracy: m.Accuracy ?? null,
    baselineAccuracy: m.BaselineAccuracy ?? null,
    predictedClasses: m.PredictedClasses ?? null,
    note,
  };
}

const MAJORITY_ONE_LINER = 'No better than always guessing the most common outcome — not reliable.';
const MAJORITY_GATE_REASON =
  "This prediction is right no more often than always guessing the most common outcome, so it isn't safe to act on yet. An analyst needs to improve it first.";
const NOT_FORECAST_ONE_LINER = 'Not checked as a forecast — not reliable for future periods yet.';
const NOT_FORECAST_GATE_REASON =
  "This prediction looks ahead in time, but it was only checked on periods it learned from, not on later ones, so it isn't safe to act on yet.";

/** A Poor, gated-off verdict that keeps the measured headline (and any majority finding) for the analyst disclosure. */
function cappedVerdict(
  headlineMetric: TrustVerdict['headlineMetric'],
  oneLiner: string,
  gateReason: string,
  withheldReason: string | null,
  majorityBaseline: MajorityBaselineFinding | null,
): TrustVerdict {
  return {
    grade: 'Poor', score01: 0, oneLiner, explanation: GRADE_EXPLANATION.Poor, canAct: false, gateReason, headlineMetric,
    unknown: false, withheldReason, majorityBaseline,
  };
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
        : `Accounts for about ${Math.round(clamp01(metrics.R2) * 100)}% of the variation in the outcome — an association, not a cause.`;
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
export function DeriveTrustVerdict(model: TrustModelInput): TrustVerdict {
  const regression = isRegression(model.ProblemType);
  const evaluation = EvaluationLineage.Read(model.Lineage);
  const metrics = bestMetrics(model, evaluation);

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
  } else if (metrics.Accuracy !== undefined && metrics.BaselineAccuracy !== undefined) {
    // accuracy means nothing without the always-majority rate (F-TR-1); without it the model is unmeasured
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
      withheldReason: null,
      majorityBaseline: null,
    };
  }

  // The rule comes from the model's own lineage (D2-C5d): a model is graded by the rule it was trained under.
  const majority =
    !regression && noBetterThanMajority(metrics)
      ? majorityFinding(metrics, evaluation?.MajorityBaselineRule || EvaluationLineage.DefaultMajorityBaselineRule, headlineMetric?.key === 'Accuracy')
      : null;
  if (evaluation?.WithheldReason) {
    return cappedVerdict(headlineMetric, NOT_FORECAST_ONE_LINER, NOT_FORECAST_GATE_REASON, evaluation.WithheldReason, majority);
  }
  if (majority?.enforced) {
    return cappedVerdict(headlineMetric, MAJORITY_ONE_LINER, MAJORITY_GATE_REASON, null, majority);
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
    withheldReason: null,
    majorityBaseline: majority,
  };
}

/** @deprecated Use {@link TrustVerdicts.DeriveTrustVerdict}. */
export function deriveTrustVerdict(model: TrustModelInput): TrustVerdict {
  return DeriveTrustVerdict(model);
}

/**
 * Human-readable "checked against N members it had never seen" evidence line. Returns a generic
 * phrasing when no count is available (never fabricates a number).
 */
export function TrustEvidenceLine(opts?: TrustEvidenceOptions): string {
  const noun = opts?.noun?.trim() || 'records';
  if (opts?.count != null && Number.isFinite(opts.count) && opts.count > 0) {
    return `Checked against ${Math.round(opts.count).toLocaleString()} past ${noun} it had never seen.`;
  }
  return `Checked against past ${noun} it had never seen.`;
}

/** The 0–5 "filled dots/stars" count for a grade, for compact visuals. */
export function TrustDots(grade: TrustGrade): number {
  return grade === 'Excellent' ? 5 : grade === 'Good' ? 4 : grade === 'Fair' ? 3 : 1;
}

/** Static entry points for the plain-language trust verdict and evidence helpers. */
export class TrustVerdicts {
  public static DeriveTrustVerdict(model: TrustModelInput): TrustVerdict {
    return DeriveTrustVerdict(model);
  }

  public static TrustEvidenceLine(opts?: TrustEvidenceOptions): string {
    return TrustEvidenceLine(opts);
  }

  public static TrustDots(grade: TrustGrade): number {
    return TrustDots(grade);
  }
}
