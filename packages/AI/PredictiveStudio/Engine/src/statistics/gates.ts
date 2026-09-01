/**
 * @module statistics/gates
 *
 * Evaluate a component type's inherited `StatisticalGate` rows against measured
 * {@link DatasetStatistics} — the step that turns "here are the numbers" into "this model
 * family is or isn't admissible for this data".
 *
 * Gates come from the tree, not from a hardcoded list. The `Model` root declares that no
 * descendant may train on fewer than 5 rows per feature and that no descendant may have one
 * feature carrying 60% of the signal; `Neural` REPLACES the first with a floor of 50, because
 * a network genuinely needs more data than a rubric does; `Sequence` adds
 * `requires-ordered-sequences`. That is the inheritance model doing real work: the constraint
 * lives on the node it is actually true of, and every leaf beneath it inherits it.
 *
 * Pure — no provider, no entities. The caller resolves the profile (via `MLComponentEngine`)
 * and passes the resolved `StatisticalGate` items in.
 */

import type {
  CandidateGateReport,
  DatasetStatistics,
  GateResult,
  StatisticalGateSpec,
  ResolvedComponentProfile,
  ResolvedPropertyItem,
} from '@memberjunction/predictive-studio-core';

/** The minimal leaf identity a report needs; satisfied by a `ResolvedComponentProfile.Leaf`. */
export interface GateCandidate {
  ComponentTypeID: string;
  ComponentTypeName: string;
}

/**
 * Evaluate every `StatisticalGate` a candidate inherits against the measured dataset.
 *
 * An **unknown** gate kind is reported `Unevaluated` — never silently passed. A gate we cannot
 * check is not a gate that was met, and the Architect needs to see that its decision rests on
 * an unchecked assumption rather than on a clean bill of health.
 *
 * @param candidate the component-type leaf being considered
 * @param gateItems the leaf's resolved `StatisticalGate` items (from `ResolveProfile`)
 * @param stats the measured training-partition statistics
 */
export function evaluateGates(
  candidate: GateCandidate,
  gateItems: readonly ResolvedPropertyItem[],
  stats: DatasetStatistics,
): CandidateGateReport {
  const gates = gateItems.map((item) => evaluateGate(item, stats));
  const failed = gates.filter((g) => g.Verdict === 'Failed');
  const unevaluated = gates.filter((g) => g.Verdict === 'Unevaluated');

  return {
    ComponentTypeID: candidate.ComponentTypeID,
    ComponentTypeName: candidate.ComponentTypeName,
    Admissible: failed.length === 0,
    Gates: gates,
    Summary: buildSummary(candidate.ComponentTypeName, gates.length, failed, unevaluated),
  };
}

/**
 * Convenience wrapper: evaluate straight off a {@link ResolvedComponentProfile}, reading the
 * leaf identity and the `StatisticalGate` items from the profile itself.
 */
export function evaluateProfileGates(
  profile: ResolvedComponentProfile,
  stats: DatasetStatistics,
): CandidateGateReport {
  return evaluateGates(
    { ComponentTypeID: profile.Leaf.ID, ComponentTypeName: profile.Leaf.Name },
    profile.Properties.StatisticalGate ?? [],
    stats,
  );
}

// region: per-gate evaluation -------------------------------------------------

/** Dispatch one gate to its rule. */
function evaluateGate(item: ResolvedPropertyItem, stats: DatasetStatistics): GateResult {
  const key = item.ItemKey ?? '(unnamed)';
  const spec = parseGateSpec(item.Value);
  if (!spec) {
    return unevaluated(key, 'unknown', item.SourceTypeID, `Gate '${key}' has no readable specification, so it could not be checked.`);
  }

  switch (spec.Kind) {
    case 'min-rows-per-feature':
      return minRowsPerFeature(key, spec, stats, item.SourceTypeID);
    case 'max-single-feature-share':
      return maxSingleFeatureShare(key, spec, stats, item.SourceTypeID);
    case 'requires-ordered-sequences':
      return requiresOrderedSequences(key, spec, stats, item.SourceTypeID);
    case 'min-minority-fraction':
      return minMinorityFraction(key, spec, stats, item.SourceTypeID);
    case 'max-missing-fraction':
      return maxMissingFraction(key, spec, stats, item.SourceTypeID);
    default:
      return unevaluated(
        key,
        spec.Kind,
        item.SourceTypeID,
        `Gate kind '${spec.Kind}' is not implemented by this version of the statistics pass, so it was not checked. ` +
          `Treat this candidate's admissibility as unconfirmed on that axis.`,
      );
  }
}

/** Enough rows per feature that the model family can learn something real. */
function minRowsPerFeature(key: string, spec: StatisticalGateSpec, stats: DatasetStatistics, source: string): GateResult {
  const threshold = spec.Threshold;
  if (threshold == null) {
    return unevaluated(key, spec.Kind, source, `Gate '${key}' declares no Threshold, so the row-per-feature floor could not be checked.`);
  }
  const observed = stats.RowsPerFeature;
  const passed = observed >= threshold;
  return {
    GateKey: key,
    Kind: spec.Kind,
    Verdict: passed ? 'Passed' : 'Failed',
    Observed: observed,
    Threshold: threshold,
    SourceTypeID: source,
    Message: passed
      ? `${round(observed)} rows per feature clears the floor of ${threshold}.`
      : `Only ${round(observed)} rows per feature (${stats.RowCount} rows / ${stats.FeatureCount} features), below the floor of ` +
        `${threshold}. With this little data per input, the model would mostly be memorizing. Cut features or gather more rows.`,
  };
}

/**
 * No single feature may already carry most of the answer. This is the leakage guard moved
 * BEFORE the training run: §6.4's `detectSingleFeatureDominance` catches it post-train from
 * feature importance, which costs a full fit to learn something the pre-pass can measure.
 */
function maxSingleFeatureShare(key: string, spec: StatisticalGateSpec, stats: DatasetStatistics, source: string): GateResult {
  const threshold = spec.Threshold;
  if (threshold == null) {
    return unevaluated(key, spec.Kind, source, `Gate '${key}' declares no Threshold, so single-feature dominance could not be checked.`);
  }
  const measured = stats.Features.filter((f) => f.TargetAssociation != null);
  if (measured.length === 0) {
    return unevaluated(
      key,
      spec.Kind,
      source,
      `No feature has a measurable association with the target (a multiclass label, or every candidate is constant), ` +
        `so single-feature dominance could not be checked.`,
    );
  }
  const top = measured.reduce((a, b) => ((a.TargetAssociation ?? 0) >= (b.TargetAssociation ?? 0) ? a : b));
  // Fold AUC's [0.5, 1] onto a [0, 1] "share of the answer" scale so one threshold reads the
  // same for classification and regression. |r| is already on that scale.
  const share = stats.Target.ProblemType === 'classification'
    ? Math.max(0, ((top.TargetAssociation as number) - 0.5) * 2)
    : (top.TargetAssociation as number);
  const passed = share <= threshold;
  return {
    GateKey: key,
    Kind: spec.Kind,
    Verdict: passed ? 'Passed' : 'Failed',
    Observed: round(share, 4),
    Threshold: threshold,
    SourceTypeID: source,
    Message: passed
      ? `The strongest single feature ('${top.Name}') explains ${pct(share)} of the answer, within the ${pct(threshold)} ceiling.`
      : `'${top.Name}' alone already explains ${pct(share)} of the answer, over the ${pct(threshold)} ceiling. ` +
        `A single field doing that much of the work almost always means it is the outcome under another name — ` +
        `confirm it is knowable at decision time, or exclude it.`,
  };
}

/** The Sequence subtree needs ordered per-entity sequences of a minimum length to mean anything. */
function requiresOrderedSequences(key: string, spec: StatisticalGateSpec, stats: DatasetStatistics, source: string): GateResult {
  const minLength = spec.MinLength ?? spec.Threshold;
  if (!stats.Sequence) {
    return {
      GateKey: key,
      Kind: spec.Kind,
      Verdict: 'Failed',
      Threshold: minLength,
      SourceTypeID: source,
      Message:
        `This model family needs ordered sequences per record, and the plan declares no ordering. ` +
        `Add a grouping field and an order field, or choose a non-sequence family.`,
    };
  }
  if (minLength == null) {
    return unevaluated(key, spec.Kind, source, `Gate '${key}' declares no MinLength, so sequence length could not be checked.`);
  }
  const observed = stats.Sequence.MedianLength;
  const passed = observed >= minLength;
  return {
    GateKey: key,
    Kind: spec.Kind,
    Verdict: passed ? 'Passed' : 'Failed',
    Observed: observed,
    Threshold: minLength,
    SourceTypeID: source,
    Message: passed
      ? `The median sequence is ${observed} long across ${stats.Sequence.GroupCount} groups, clearing the minimum of ${minLength}.`
      : `The median sequence is only ${observed} long (minimum ${minLength}), and ${pct(stats.Sequence.ShortGroupFraction)} of ` +
        `groups are shorter than that. There is no sequence shape here to learn from.`,
  };
}

/** Enough of the rarer class that the model can see it at all. */
function minMinorityFraction(key: string, spec: StatisticalGateSpec, stats: DatasetStatistics, source: string): GateResult {
  const threshold = spec.Threshold;
  const observed = stats.Target.MinorityFraction;
  if (threshold == null || observed == null) {
    return unevaluated(
      key,
      spec.Kind,
      source,
      observed == null
        ? `The target is not a classification label, so class balance could not be checked.`
        : `Gate '${key}' declares no Threshold, so class balance could not be checked.`,
    );
  }
  const passed = observed >= threshold;
  return {
    GateKey: key,
    Kind: spec.Kind,
    Verdict: passed ? 'Passed' : 'Failed',
    Observed: round(observed, 4),
    Threshold: threshold,
    SourceTypeID: source,
    Message: passed
      ? `The rarer outcome is ${pct(observed)} of rows, above the ${pct(threshold)} floor.`
      : `The rarer outcome is only ${pct(observed)} of rows, below the ${pct(threshold)} floor. ` +
        `A model that always predicts the common answer would look ${pct(1 - observed)} accurate and be useless — ` +
        `rebalance, gather more of the rare cases, or judge this by recall rather than accuracy.`,
  };
}

/** No candidate feature may be mostly imputed. */
function maxMissingFraction(key: string, spec: StatisticalGateSpec, stats: DatasetStatistics, source: string): GateResult {
  const threshold = spec.Threshold;
  if (threshold == null) {
    return unevaluated(key, spec.Kind, source, `Gate '${key}' declares no Threshold, so missingness could not be checked.`);
  }
  if (stats.Features.length === 0) {
    return unevaluated(key, spec.Kind, source, `There are no described features, so missingness could not be checked.`);
  }
  const worst = stats.Features.reduce((a, b) => (a.MissingFraction >= b.MissingFraction ? a : b));
  const passed = worst.MissingFraction <= threshold;
  return {
    GateKey: key,
    Kind: spec.Kind,
    Verdict: passed ? 'Passed' : 'Failed',
    Observed: round(worst.MissingFraction, 4),
    Threshold: threshold,
    SourceTypeID: source,
    Message: passed
      ? `The emptiest feature ('${worst.Name}') is ${pct(worst.MissingFraction)} missing, within the ${pct(threshold)} ceiling.`
      : `'${worst.Name}' is ${pct(worst.MissingFraction)} missing, over the ${pct(threshold)} ceiling — most of that column ` +
        `would be invented by imputation. Drop it, or replace it with a presence flag.`,
  };
}

// region: helpers -------------------------------------------------------------

/**
 * Narrow a property row's parsed `Value` to a gate spec. The resolver hands back parsed JSON
 * when the row parsed and the raw string otherwise, so a malformed row degrades to
 * `Unevaluated` rather than throwing mid-evaluation.
 */
function parseGateSpec(value: unknown): StatisticalGateSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const v = value as Partial<StatisticalGateSpec>;
  if (typeof v.Kind !== 'string' || v.Kind.length === 0) {
    return null;
  }
  return {
    Kind: v.Kind,
    Threshold: typeof v.Threshold === 'number' ? v.Threshold : undefined,
    MinLength: typeof v.MinLength === 'number' ? v.MinLength : undefined,
  };
}

function unevaluated(key: string, kind: string, source: string, message: string): GateResult {
  return { GateKey: key, Kind: kind, Verdict: 'Unevaluated', SourceTypeID: source, Message: message };
}

function buildSummary(name: string, total: number, failed: GateResult[], unevaluated: GateResult[]): string {
  if (total === 0) {
    return `${name} declares no statistical gates, so nothing constrains it for this dataset.`;
  }
  if (failed.length > 0) {
    return `${name} is NOT admissible: ${failed.map((f) => f.GateKey).join(', ')} failed.`;
  }
  if (unevaluated.length > 0) {
    return `${name} passed ${total - unevaluated.length}/${total} gates; ${unevaluated.map((u) => u.GateKey).join(', ')} could not be checked.`;
  }
  return `${name} passed all ${total} gates.`;
}

function round(v: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
