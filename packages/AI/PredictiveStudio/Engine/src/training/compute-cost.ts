/**
 * @module training/compute-cost
 *
 * A training run records the compute it really used (`ComputeSeconds`, wall-clock seconds) and prices it at
 * `PS_COMPUTE_USD_PER_SECOND`. Without a configured rate the cost is unknown (NULL), never a hard-coded 0.
 */

/** Compute pricing: the configured rate per second and the cost of a run's measured seconds. */
export class ComputePricing {
  /**
   * The configured USD price of one compute second, or null when `PS_COMPUTE_USD_PER_SECOND` is unset or blank.
   * Throws a `RangeError` for a value that is not a finite number >= 0, so a misconfigured rate fails before any
   * training starts.
   */
  public static ReadComputeRate(env: NodeJS.ProcessEnv = process.env): number | null {
    const raw = env.PS_COMPUTE_USD_PER_SECOND;
    if (raw === undefined || raw.trim().length === 0) return null;
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new RangeError(`PS_COMPUTE_USD_PER_SECOND must be a number >= 0, got "${raw}"`);
    }
    return rate;
  }

  /** Measured seconds at the scale `ComputeSeconds` stores (3 decimal places), so the run row holds what was priced. */
  public static RoundSeconds(seconds: number): number {
    return Math.round(seconds * 1e3) / 1e3;
  }

  /**
   * The cost of `seconds` (rounded as {@link RoundSeconds} stores them) at the rate, rounded to the 6 decimal places
   * `ComputeCost` stores; null when the rate is unknown.
   */
  public static ComputeCostFor(seconds: number, usdPerSecond: number | null): number | null {
    return usdPerSecond === null ? null : Math.round(ComputePricing.RoundSeconds(seconds) * usdPerSecond * 1e6) / 1e6;
  }
}
