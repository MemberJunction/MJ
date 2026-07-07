/**
 * @module feature-assembly/leakage-guard
 *
 * Leakage protection (plan §6.4). An automated feature-search agent will
 * relentlessly exploit target leakage — a field that's a proxy for the label →
 * AUC ~0.99 garbage. Two complementary defenses live here:
 *
 * 1. **Deny-list enforcement (assembly-time).** Deny-listed fields/sources are
 *    EXCLUDED from the assembled feature matrix — filtered out *before* any
 *    column is produced. This is enforced by {@link LeakageGuardEnforcer},
 *    used by the FeatureAssembly executor.
 * 2. **Single-feature-dominance detection (post-train).** After training, if one
 *    feature's importance exceeds a threshold (e.g. >0.6), the run is flagged as
 *    suspicious → warn loudly + block promotion until a human signs off. The
 *    detection itself ({@link detectSingleFeatureDominance}) runs post-train
 *    (importance only exists after a model is fit); the executor only enforces
 *    the deny-list at assembly time.
 */

import type { LeakageGuard, FeatureImportance } from '@memberjunction/predictive-studio-core';

/**
 * Assembly-time deny-list enforcer. Normalizes the guard's `DenyFields` /
 * `DenySources` into case-insensitive sets and answers "is this field/source
 * allowed into the matrix?".
 */
export class LeakageGuardEnforcer {
  private readonly denyFields: Set<string>;
  private readonly denySources: Set<string>;

  /**
   * @param guard the leakage-guard configuration (deny-list + dominance threshold)
   */
  constructor(guard: LeakageGuard) {
    this.denyFields = new Set((guard.DenyFields ?? []).map(normalize));
    this.denySources = new Set((guard.DenySources ?? []).map(normalize));
  }

  /**
   * Whether a field is allowed into the feature matrix (i.e. NOT deny-listed).
   *
   * @param fieldName candidate column/feature name
   */
  public isFieldAllowed(fieldName: string): boolean {
    return !this.denyFields.has(normalize(fieldName));
  }

  /**
   * Whether a source binding is allowed to be drawn from (i.e. NOT deny-listed).
   *
   * @param sourceRef the source's `Ref` (entity name / Query id / etc.)
   */
  public isSourceAllowed(sourceRef: string): boolean {
    return !this.denySources.has(normalize(sourceRef));
  }

  /**
   * Partitions a list of candidate column names into allowed vs denied — handy
   * for the executor's `select` step, which filters deny-listed columns out of
   * the matrix before producing values.
   *
   * @param columns candidate column names
   * @returns `{ allowed, denied }` partition
   */
  public partitionColumns(columns: string[]): { allowed: string[]; denied: string[] } {
    const allowed: string[] = [];
    const denied: string[] = [];
    for (const c of columns) {
      (this.isFieldAllowed(c) ? allowed : denied).push(c);
    }
    return { allowed, denied };
  }
}

/**
 * Result of the post-training single-feature-dominance check.
 */
export interface DominanceResult {
  /** Whether a single feature's importance exceeds the threshold. */
  Dominant: boolean;
  /** The most-important feature's name (when any importances were provided). */
  TopFeature?: string;
  /** The top feature's normalized importance share (0..1). */
  TopShare?: number;
  /** The threshold compared against. */
  Threshold: number;
}

/**
 * Post-training single-feature-dominance check (plan §6.4). Normalizes the raw
 * importance map to shares of total importance, then flags when the top feature's
 * share exceeds the threshold. A flagged run is suspicious (likely target
 * leakage) → training surfaces a plain-language warning and blocks promotion
 * until a human signs off.
 *
 * Importances are taken as magnitudes (`Math.abs`) so signed coefficients (e.g.
 * logistic regression) are handled correctly. When all importances are zero (or
 * the map is empty), nothing is flagged.
 *
 * @param featureImportance per-feature importance/contribution from the sidecar
 * @param threshold dominance threshold (e.g. `0.6` from `LeakageGuard.SingleFeatureDominanceThreshold`)
 * @returns the {@link DominanceResult}
 */
export function detectSingleFeatureDominance(featureImportance: FeatureImportance, threshold: number): DominanceResult {
  const entries = Object.entries(featureImportance ?? {});
  if (entries.length === 0) {
    return { Dominant: false, Threshold: threshold };
  }

  let total = 0;
  let topFeature = entries[0][0];
  let topMagnitude = -Infinity;
  for (const [name, value] of entries) {
    const mag = Math.abs(value);
    total += mag;
    if (mag > topMagnitude) {
      topMagnitude = mag;
      topFeature = name;
    }
  }

  if (total === 0) {
    return { Dominant: false, TopFeature: topFeature, TopShare: 0, Threshold: threshold };
  }

  const topShare = topMagnitude / total;
  return {
    Dominant: topShare > threshold,
    TopFeature: topFeature,
    TopShare: topShare,
    Threshold: threshold,
  };
}

/** Lowercase + trim for case/whitespace-insensitive name matching. */
function normalize(name: string): string {
  return name.trim().toLowerCase();
}
