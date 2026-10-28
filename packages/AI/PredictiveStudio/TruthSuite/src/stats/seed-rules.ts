import { ConfidenceInterval } from './confidence-interval';

/** The P11 statistical rules a gate can count seeds against. */
export type StatRule = 'noise-publish-60'; // G0.2's publication count at n = 60

/** The P11 statistical gate rules over n seeds (§3.3), and their acceptance ranges. */
export class SeedRule {
  /** Noise publication passes when the Wilson interval's lower bound is at most 5%. */
  public static NoisePublishPasses(published: number, n: number): boolean {
    return ConfidenceInterval.Wilson(published, n).Lower <= 0.05;
  }

  /** Whether `count` of `n` seeds passes `rule`. */
  public static Passes(rule: StatRule, count: number, n: number): boolean {
    switch (rule) {
      case 'noise-publish-60': return SeedRule.NoisePublishPasses(count, n);
    }
  }

  /** The contiguous range of counts the rule accepts at n seeds. */
  public static AcceptanceRange(rule: StatRule, n: number): { Min: number; Max: number } {
    const accepted: number[] = [];
    for (let k = 0; k <= n; k++) if (SeedRule.Passes(rule, k, n)) accepted.push(k);
    // Defensive: the rule accepts 0 at every n ≥ 1, so no test reaches this throw.
    if (accepted.length === 0) throw new Error(`${rule} accepts no count at n = ${n}`);
    return { Min: Math.min(...accepted), Max: Math.max(...accepted) };
  }
}
