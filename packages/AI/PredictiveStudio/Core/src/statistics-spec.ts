/**
 * @module statistics-spec
 *
 * The **statistics pre-pass** contract — what the Model Development Agent knows about the data
 * BEFORE it proposes an architecture.
 *
 * Today the agent picks an algorithm from the 6×7 guidance matrix and a goal statement. That is a
 * decision made blind: it cannot know that the target is 3% positive, that one candidate feature is
 * a near-duplicate of the label, that another is an id, or that there are 40 rows per feature and no
 * model family in the tree can honestly learn from them. Every one of those is cheap to measure and
 * expensive to discover after a training run.
 *
 * So the loop gains a measured step. `DatasetStatistics` describes the training partition (and ONLY
 * the training partition — the locked holdout is never described, or the "honest number" stops being
 * honest); `FeatureStatistics` describes each candidate feature and flags what is suspicious about
 * it; `CandidateGateReport` says whether a given component-tree leaf is even admissible given those
 * numbers, evaluated from the `StatisticalGate` rows the leaf inherits (`component-model.ts`).
 *
 * Everything here is plain data — computed by the sidecar's `/describe` and by pure TypeScript
 * gates, persisted onto `ModelingPlanSpec.Statistics`, and read by the Architect. No inference, no
 * LLM: a hint is an observation with a threshold behind it, not an opinion.
 */

import type { ProblemType } from './sidecar-contract';

/**
 * A machine-checkable observation about one feature. Each is produced by a threshold over a
 * measured quantity, so a consumer can always ask "which number, and what cutoff".
 */
export type FeatureHint =
  /** Alone explains most of the target — the classic leakage signature (§6.4's guard, pre-train). */
  | 'leakage-dominance'
  /** Reproduces the target almost exactly (|corr| or AUC at the ceiling) — the answer, renamed. */
  | 'near-duplicate-of-target'
  /** Distinct in (nearly) every row — an identifier, not a signal. */
  | 'id-like'
  /** One value throughout: carries no information and breaks scalers that divide by variance. */
  | 'constant'
  /** Many distinct categories relative to rows — one-hot would explode the matrix. */
  | 'high-cardinality'
  /** Missing in a large fraction of rows — imputation would be inventing most of it. */
  | 'high-missingness'
  /** Nearly collinear with another feature — the pair's coefficients become uninterpretable. */
  | 'collinear';

/** One hint plus the evidence behind it, so a reader never has to trust the label alone. */
export interface FeatureHintDetail {
  Hint: FeatureHint;
  /** The measured quantity that triggered it (e.g. the missing fraction, the AUC, the cardinality ratio). */
  Value: number;
  /** The cutoff it crossed. */
  Threshold: number;
  /** For `collinear`, the other feature; otherwise absent. */
  RelatedFeature?: string;
  /** Plain-language statement, safe to show a business user verbatim. */
  Message: string;
}

/**
 * Per-feature description of the TRAINING partition. Numeric moments are absent for categorical
 * features and vice versa; the association measure depends on the problem type.
 */
export interface FeatureStatistics {
  /** Feature/column name, matching the assembled matrix. */
  Name: string;
  /** How the assembler classified it. */
  Kind: 'numeric' | 'categorical' | 'embedding' | 'llm-derived' | 'presence';
  /** Rows where the value is null/NaN, as a fraction of the training partition. */
  MissingFraction: number;
  /** Count of distinct non-null values. */
  DistinctCount: number;
  /** `DistinctCount / non-null row count` — 1.0 means every row differs (id-like). */
  CardinalityRatio: number;
  /** Numeric moments (numeric features only). */
  Mean?: number;
  StdDev?: number;
  Min?: number;
  Max?: number;
  /** Quartiles + median (numeric features only), as `[p25, p50, p75]`. */
  Quartiles?: [number, number, number];
  /** Fisher skewness (numeric features only) — a strong signal that a log/rank transform is wanted. */
  Skewness?: number;
  /**
   * Association with the target, comparable ACROSS features of the same problem type:
   * classification → single-feature AUC in `[0.5, 1]` (0.5 = no signal);
   * regression → |Pearson r| in `[0, 1]`.
   * Absent when it cannot be computed (a constant feature, an all-null column).
   */
  TargetAssociation?: number;
  /** Mutual information with the target (nats), for features where a monotone measure is too weak. */
  MutualInformation?: number;
  /** The top categories by frequency (categorical only), for the story and for one-hot budgeting. */
  TopValues?: Array<{ Value: string; Count: number }>;
  /** Everything flagged about this feature, with its evidence. Empty = nothing suspicious. */
  Hints: FeatureHintDetail[];
}

/** Distribution of the label. Exactly one of `Classes` / `Numeric` is present. */
export interface TargetStatistics {
  /** The label column. */
  Name: string;
  ProblemType: ProblemType;
  /** Rows with a usable label (rows without one cannot train). */
  LabeledRowCount: number;
  /** Class counts, descending by count (classification). */
  Classes?: Array<{ Value: string; Count: number; Fraction: number }>;
  /**
   * Fraction held by the SMALLEST class (classification). This is the number that decides whether
   * accuracy is a meaningful metric: at 0.03, a model that always says "no" is 97% accurate and
   * completely useless, which is exactly the trap a non-expert falls into.
   */
  MinorityFraction?: number;
  /** Numeric label moments (regression). */
  Numeric?: { Mean: number; StdDev: number; Min: number; Max: number; Quartiles: [number, number, number] };
}

/**
 * Sequence shape of the training data, measured only when the plan declares an ordering. Feeds the
 * `requires-ordered-sequences` gate the `Sequence` subtree carries; irrelevant to every other
 * subtree, and absent when no ordering was declared.
 */
export interface SequenceStatistics {
  /** The field the rows were ordered within (the per-entity sequence key). */
  GroupField: string;
  /** The field the rows were ordered BY. */
  OrderField: string;
  /** Number of distinct groups (entities with a sequence). */
  GroupCount: number;
  /** Sequence lengths across groups. */
  MinLength: number;
  MedianLength: number;
  MaxLength: number;
  /** Groups shorter than the gate's `MinLength`, as a fraction — high means the shape isn't there. */
  ShortGroupFraction: number;
}

/**
 * Everything measured about the training partition in one pre-pass. Persisted on
 * `ModelingPlanSpec.Statistics` (and so onto `MJ: Experiment Sessions.PlanSpec`), which is what makes
 * the architecture decision auditable after the fact: the numbers the agent saw are stored next to
 * the choice it made.
 */
export interface DatasetStatistics {
  /** The training-unit entity described. */
  EntityName: string;
  /** Rows in the TRAINING partition (the locked holdout is deliberately not described). */
  RowCount: number;
  /** Candidate features described. */
  FeatureCount: number;
  /** `RowCount / FeatureCount` — the quantity the `min-rows-per-feature` gate reads. */
  RowsPerFeature: number;
  Target: TargetStatistics;
  Features: FeatureStatistics[];
  /** Present only when the plan declared an ordering. */
  Sequence?: SequenceStatistics;
  /** ISO-8601 UTC timestamp of the pre-pass. */
  DescribedAt: string;
  /**
   * Non-fatal notes from the pass — a feature that could not be described, a measure that was
   * skipped. Recorded rather than silently dropped, so an absent statistic is never mistaken for a
   * measured zero.
   */
  Warnings: string[];
}

// region: gates ---------------------------------------------------------------

/**
 * The kinds of `StatisticalGate` a component type can declare. Seeded values live in
 * `metadata/ml-component-type-properties`; the Model root carries `max-single-feature-share` and
 * `min-rows-per-feature`, Neural REPLACES the latter with a much higher floor, and the Sequence
 * subtree adds `requires-ordered-sequences`.
 *
 * Open-ended by design: an unknown kind is reported as `Unevaluated`, never silently treated as a
 * pass — a gate we cannot check is not a gate that was met.
 */
export type StatisticalGateKind =
  | 'max-single-feature-share'
  | 'min-rows-per-feature'
  | 'requires-ordered-sequences'
  | 'min-minority-fraction'
  | 'max-missing-fraction';

/** One gate as declared on a component type's `StatisticalGate` property row (parsed `Value`). */
export interface StatisticalGateSpec {
  Kind: StatisticalGateKind | string;
  /** The numeric floor/ceiling the gate compares against (kind-specific). */
  Threshold?: number;
  /** Minimum sequence length, for `requires-ordered-sequences`. */
  MinLength?: number;
}

/** How a single gate came out. */
export type GateVerdict = 'Passed' | 'Failed' | 'Unevaluated';

/** The result of checking one gate against one dataset. */
export interface GateResult {
  /** The property row's `ItemKey` (e.g. `min-rows-per-feature`), which is what a human recognizes. */
  GateKey: string;
  Kind: StatisticalGateKind | string;
  Verdict: GateVerdict;
  /** The measured value compared against the gate (absent when `Unevaluated`). */
  Observed?: number;
  Threshold?: number;
  /** Plain-language result — why it passed, why it failed, or why it could not be checked. */
  Message: string;
  /** The component type whose row declared this gate — the node to argue with. */
  SourceTypeID: string;
}

/**
 * Whether one candidate component-tree leaf is admissible for this dataset. `Admissible` is false as
 * soon as any gate Failed; an `Unevaluated` gate does NOT fail the candidate but IS surfaced, so the
 * Architect can see that its decision rests on an unchecked assumption.
 */
export interface CandidateGateReport {
  /** The `MJ: ML Component Types` leaf evaluated. */
  ComponentTypeID: string;
  /** Its name, for messages. */
  ComponentTypeName: string;
  Admissible: boolean;
  Gates: GateResult[];
  /** One-line summary suitable for a leaderboard row or a rejection notice. */
  Summary: string;
}

// region: pure helpers --------------------------------------------------------

/** Default hint thresholds. Exported so a caller can tighten them and a test can pin them. */
export const FEATURE_HINT_THRESHOLDS = {
  /** |corr| or AUC at/above this reads as "this IS the target". */
  NearDuplicateAssociation: 0.98,
  /** Single-feature AUC at/above this is dominance worth stopping for, pre-train. */
  LeakageDominanceAssociation: 0.9,
  /** Distinct/non-null ratio at/above this reads as an identifier. */
  IdLikeCardinalityRatio: 0.95,
  /** Missing fraction at/above this makes imputation the majority of the column. */
  HighMissingFraction: 0.5,
  /** Distinct categories above this are impractical to one-hot. */
  HighCardinalityDistinctCount: 50,
  /** |corr| between two features at/above this makes their coefficients uninterpretable. */
  CollinearCorrelation: 0.95,
} as const;

/** The shape {@link deriveFeatureHints} needs — satisfied by {@link FeatureStatistics}. */
export type FeatureHintInput = Pick<
  FeatureStatistics,
  'Name' | 'Kind' | 'MissingFraction' | 'DistinctCount' | 'CardinalityRatio' | 'TargetAssociation'
>;

/**
 * Derive the hints for one feature from its measured statistics. PURE and thresholds-explicit: every
 * hint carries the value and the cutoff that produced it, so "why was this flagged" is always
 * answerable without re-running the pass.
 *
 * Note the ordering: `constant` short-circuits, because a single-valued column trivially trips
 * several other rules and reporting all of them would bury the one that matters.
 *
 * @param f the feature's measured statistics
 * @param thresholds override the defaults (a stricter profile, or a test pinning exact values)
 */
export function deriveFeatureHints(
  f: FeatureHintInput,
  thresholds: typeof FEATURE_HINT_THRESHOLDS = FEATURE_HINT_THRESHOLDS,
): FeatureHintDetail[] {
  if (f.DistinctCount <= 1) {
    return [
      {
        Hint: 'constant',
        Value: f.DistinctCount,
        Threshold: 1,
        Message: `'${f.Name}' has the same value in every row, so it cannot help predict anything.`,
      },
    ];
  }

  const hints: FeatureHintDetail[] = [];

  if (f.TargetAssociation != null && f.TargetAssociation >= thresholds.NearDuplicateAssociation) {
    hints.push({
      Hint: 'near-duplicate-of-target',
      Value: f.TargetAssociation,
      Threshold: thresholds.NearDuplicateAssociation,
      Message:
        `'${f.Name}' reproduces the answer almost exactly (${fmt(f.TargetAssociation)}). ` +
        `That is nearly always the target under another name — check whether it is knowable at decision time.`,
    });
  } else if (f.TargetAssociation != null && f.TargetAssociation >= thresholds.LeakageDominanceAssociation) {
    hints.push({
      Hint: 'leakage-dominance',
      Value: f.TargetAssociation,
      Threshold: thresholds.LeakageDominanceAssociation,
      Message:
        `'${f.Name}' alone explains most of the answer (${fmt(f.TargetAssociation)}). ` +
        `A single field doing that much of the work usually means we are peeking at the outcome.`,
    });
  }

  if (f.CardinalityRatio >= thresholds.IdLikeCardinalityRatio) {
    hints.push({
      Hint: 'id-like',
      Value: f.CardinalityRatio,
      Threshold: thresholds.IdLikeCardinalityRatio,
      Message:
        `'${f.Name}' is different in ${fmtPct(f.CardinalityRatio)} of rows — that is an identifier, not a signal. ` +
        `A model can memorize it and will not generalize.`,
    });
  }

  if (f.MissingFraction >= thresholds.HighMissingFraction) {
    hints.push({
      Hint: 'high-missingness',
      Value: f.MissingFraction,
      Threshold: thresholds.HighMissingFraction,
      Message:
        `'${f.Name}' is missing in ${fmtPct(f.MissingFraction)} of rows, so most of the column would be invented ` +
        `by imputation. Consider a presence flag instead of a value.`,
    });
  }

  if (f.Kind === 'categorical' && f.DistinctCount > thresholds.HighCardinalityDistinctCount) {
    hints.push({
      Hint: 'high-cardinality',
      Value: f.DistinctCount,
      Threshold: thresholds.HighCardinalityDistinctCount,
      Message:
        `'${f.Name}' has ${f.DistinctCount} distinct categories; one-hot encoding it would add that many columns. ` +
        `Group the rare ones, or use a target/ordinal encoding.`,
    });
  }

  return hints;
}

/**
 * Add `collinear` hints to a described feature set, from a correlation lookup. Kept separate from
 * {@link deriveFeatureHints} because collinearity is a property of a PAIR, not of one feature — and
 * only the pass that computed the correlation matrix can supply it.
 *
 * Each pair is reported on BOTH features (they are equally implicated) but only once per pair per
 * feature, and self-pairs are ignored.
 *
 * @param features the described features, mutated in place
 * @param correlationOf `(a, b) => |r|`, or `null` when the pair cannot be measured
 * @param threshold the |r| at/above which a pair is called collinear
 */
export function addCollinearityHints(
  features: FeatureStatistics[],
  correlationOf: (a: string, b: string) => number | null,
  threshold: number = FEATURE_HINT_THRESHOLDS.CollinearCorrelation,
): void {
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      const r = correlationOf(a.Name, b.Name);
      if (r == null || Math.abs(r) < threshold) {
        continue;
      }
      const abs = Math.abs(r);
      a.Hints.push(collinearHint(a.Name, b.Name, abs, threshold));
      b.Hints.push(collinearHint(b.Name, a.Name, abs, threshold));
    }
  }
}

function collinearHint(self: string, other: string, value: number, threshold: number): FeatureHintDetail {
  return {
    Hint: 'collinear',
    Value: value,
    Threshold: threshold,
    RelatedFeature: other,
    Message:
      `'${self}' and '${other}' move together almost perfectly (${fmt(value)}). ` +
      `Keeping both makes each one's weight meaningless — pick the one a person would recognize.`,
  };
}

/** Format an association/correlation for a human-readable message. */
function fmt(v: number): string {
  return v.toFixed(2);
}

/** Format a fraction as a percentage for a human-readable message. */
function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
