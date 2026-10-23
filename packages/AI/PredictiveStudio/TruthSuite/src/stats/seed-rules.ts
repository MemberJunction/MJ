import { ConfidenceInterval } from './confidence-interval';

/** The P11 statistical rules a gate can count seeds against. */
export type StatRule = 'noise-publish-400' | 'coverage-400' | 'detection-400' | 'false-alarm-400'
  | 'noise-publish-60'; // G0.2's publication count at n = 60

/** The P11 statistical gate rules over n seeds (§3.3), and their acceptance ranges. */
export class SeedRule {
  public static NoisePublishPasses(published: number, n: number): boolean {
    return ConfidenceInterval.Wilson(published, n).Lower <= 0.05;
  }
  public static FalseAlarmPasses(alarms: number, n: number): boolean {
    return SeedRule.NoisePublishPasses(alarms, n);
  }
  public static CoveragePasses(covered: number, n: number): boolean {
    const ci = ConfidenceInterval.Wilson(covered, n);
    return ci.Lower <= 0.95 && 0.95 <= ci.Upper;
  }
  public static DetectionPasses(detected: number, n: number): boolean {
    return ConfidenceInterval.Wilson(detected, n).Upper >= 0.95;
  }

  /** Whether `count` of `n` seeds passes `rule`. */
  public static Passes(rule: StatRule, count: number, n: number): boolean {
    switch (rule) {
      case 'noise-publish-400':
      case 'noise-publish-60': return SeedRule.NoisePublishPasses(count, n);
      case 'false-alarm-400': return SeedRule.FalseAlarmPasses(count, n);
      case 'coverage-400': return SeedRule.CoveragePasses(count, n);
      case 'detection-400': return SeedRule.DetectionPasses(count, n);
    }
  }

  /** The contiguous range of counts the rule accepts at n seeds. */
  public static AcceptanceRange(rule: StatRule, n: number): { Min: number; Max: number } {
    const accepted: number[] = [];
    for (let k = 0; k <= n; k++) if (SeedRule.Passes(rule, k, n)) accepted.push(k);
    // Defensive: none of the five rules accepts nothing at n ≥ 1, so no test reaches this throw (PR description lists it).
    if (accepted.length === 0) throw new Error(`${rule} accepts no count at n = ${n}`);
    return { Min: Math.min(...accepted), Max: Math.max(...accepted) };
  }
}
