/**
 * @module agent/profile-verdict
 *
 * `ProfileVerdict` — the two fixed refusals the profile ends a session with (PR 5, A4; §5.1.5, DD-5, D5-10). Both are
 * deterministic code over the profile's numbers, never an LLM's judgement:
 *
 * - **small data**: fewer than {@link ProfileVerdict.MIN_RESOLVED_ROWS} resolved development rows, or fewer than
 *   {@link ProfileVerdict.MIN_MINORITY_ROWS} in the minority class (fires on W7-small-imbalanced s42, ≈ 24 positives in
 *   301 persons, and on 12 people; not on W1-signal, C1 or C4);
 * - **no usable signal**: the cross-validated GLM's log-loss improvement over the dummy has an interval that includes 0
 *   (or lies wholly below it: the GLM is worse than the dummy).
 */
import type { AgentRefusal, MetricWithInterval } from '@memberjunction/predictive-studio-core';

/** The small-data refusal. */
export type SmallDataRefusal = Extract<AgentRefusal, { kind: 'small-data' }>;
/** The no-usable-signal refusal. */
export type NoSignalRefusal = Extract<AgentRefusal, { kind: 'no-usable-signal' }>;

/** The fixed refusals of a profile. */
export class ProfileVerdict {
  /** Resolved development rows below which no model is attempted (DD-5, D5-10). */
  public static readonly MIN_RESOLVED_ROWS = 200;
  /** Minority-class development rows below which no model is attempted (DD-5, D5-10). */
  public static readonly MIN_MINORITY_ROWS = 50;

  /** The small-data refusal when either count is below its threshold (strictly), else null. */
  public static SmallData(resolvedRows: number, minorityRows: number): SmallDataRefusal | null {
    if (resolvedRows >= ProfileVerdict.MIN_RESOLVED_ROWS && minorityRows >= ProfileVerdict.MIN_MINORITY_ROWS) return null;
    return { kind: 'small-data', resolvedRows, minorityRows, minResolved: 200, minMinority: 50 };
  }

  /** The no-usable-signal refusal when the improvement's interval includes 0 (or lies below it), else null. */
  public static NoSignal(improvement: MetricWithInterval): NoSignalRefusal | null {
    return improvement.interval.lower > 0 ? null : { kind: 'no-usable-signal', improvement };
  }
}
