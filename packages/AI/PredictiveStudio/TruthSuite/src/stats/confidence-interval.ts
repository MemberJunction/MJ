/** A two-sided interval. */
export interface Interval { Lower: number; Upper: number }

/** The interval constructions the gates' statistical rules use (P11, P1). */
export class ConfidenceInterval {
  /** z for a two-sided 95% interval. */
  public static readonly Z95 = 1.959963984540054;

  /** Two-sided Wilson score interval for `successes` of `n` (the rule P11 and P1 use). */
  public static Wilson(successes: number, n: number, z: number = ConfidenceInterval.Z95): Interval {
    if (!Number.isInteger(successes) || !Number.isInteger(n) || n <= 0 || successes < 0 || successes > n) {
      throw new RangeError(`ConfidenceInterval.Wilson: invalid counts ${successes}/${n}`);
    }
    const p = successes / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const centre = p + z2 / (2 * n);
    const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
    return { Lower: (centre - half) / denominator, Upper: (centre + half) / denominator };
  }

  /** Hanley & McNeil (1982) normal interval for an AUC with nPos positives and nNeg negatives. */
  public static HanleyMcNeil(auc: number, nPos: number, nNeg: number, z: number = ConfidenceInterval.Z95): Interval {
    const q1 = auc / (2 - auc);
    const q2 = (2 * auc * auc) / (1 + auc);
    const variance = (auc * (1 - auc) + (nPos - 1) * (q1 - auc * auc) + (nNeg - 1) * (q2 - auc * auc)) / (nPos * nNeg);
    const se = Math.sqrt(Math.max(0, variance));
    return { Lower: auc - z * se, Upper: auc + z * se };
  }
}
