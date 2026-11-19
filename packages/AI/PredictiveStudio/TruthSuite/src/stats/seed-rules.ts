import { ConfidenceInterval } from './confidence-interval';

/**
 * The P11 statistical rules a gate can count seeds against: G0.2's publication count at n = 60 and G3.4's at n = 400;
 * G6.6's false-alarm count and G6.8's detection count at n = 400 (M6.7).
 */
export type StatRule = 'noise-publish-60' | 'noise-publish-400' | 'false-alarm-400' | 'detection-400';

/** The P11 statistical gate rules over n seeds (§3.3), and their acceptance ranges. */
export class SeedRule {
  /** Noise publication passes when the Wilson interval's lower bound is at most 5%. */
  public static NoisePublishPasses(published: number, n: number): boolean {
    return ConfidenceInterval.Wilson(published, n).Lower <= 0.05;
  }

  /**
   * Monitor procedure M's false-alarm count (G6.6, §4.1): passes when the Wilson interval's lower bound of the share of
   * no-drift replays that raised any alarm is at most the documented 5% (at n = 400: at most 28).
   */
  public static FalseAlarmPasses(alarms: number, n: number): boolean {
    return ConfidenceInterval.Wilson(alarms, n).Lower <= 0.05;
  }

  /**
   * Procedure M's detection count (G6.8, §4.1): passes when the Wilson interval's upper bound of the share of seeds that
   * flagged the shifted input is at least the 95% power target (at n = 400: at least 372).
   */
  public static DetectionPasses(detected: number, n: number): boolean {
    return ConfidenceInterval.Wilson(detected, n).Upper >= 0.95;
  }

  /** Whether `count` of `n` seeds passes `rule`. */
  public static Passes(rule: StatRule, count: number, n: number): boolean {
    switch (rule) {
      case 'noise-publish-60':
      case 'noise-publish-400':
        return SeedRule.NoisePublishPasses(count, n);
      case 'false-alarm-400':
        return SeedRule.FalseAlarmPasses(count, n);
      case 'detection-400':
        return SeedRule.DetectionPasses(count, n);
    }
  }

  /** The contiguous range of counts the rule accepts at n seeds. */
  public static AcceptanceRange(rule: StatRule, n: number): { Min: number; Max: number } {
    const accepted: number[] = [];
    for (let k = 0; k <= n; k++) if (SeedRule.Passes(rule, k, n)) accepted.push(k);
    // Defensive: every rule accepts some count at every n ≥ 1, so no test reaches this throw.
    if (accepted.length === 0) throw new Error(`${rule} accepts no count at n = ${n}`);
    return { Min: Math.min(...accepted), Max: Math.max(...accepted) };
  }
}
