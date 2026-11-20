/**
 * @module monitoring-rules
 *
 * The monitoring job's decision rules as pure statics (M6.2, D-037, D-041): when a period's label window has closed,
 * when a retrain trigger fires, when the automated rollback fires (D4-17), and the live mirror's divergence between the
 * champion's and the challenger's scores (D-069, §5.8.3 step 5). Nothing here reads a row or a clock: the monitoring
 * driver hands each rule the stored values it read.
 */
import { IndexByUUID } from '@memberjunction/global';

import type { RetrainTrigger, RollbackTrigger } from './evaluation-protocol';
import type { MonitoringPeriodResult } from './monitoring-contracts';
import type { TaskType } from './task-type';

/** One record's score from one model, for the live mirror's divergence; `Score` null when that record failed or timed out. */
export interface ScoredValue {
  /** The scored record's key (matched with `IndexByUUID`). */
  readonly RecordID: string;
  /** The adverse-class probability or the regression value; null for a record the model did not score. */
  readonly Score: number | null;
}

/** The live mirror's divergence over one period: the champion's and the challenger's scores paired by record key. */
export interface MirrorDivergence {
  /** Records both models scored. */
  readonly Paired: number;
  /**
   * A classifier's share of the paired records on the same side of the 0.5 decision threshold (0 when nothing paired);
   * null for every other task, whose scores are not probabilities, so the threshold means nothing (the plan states no
   * regression agreement rule; {@link MeanScoreDelta} is the regression's divergence).
   */
  readonly Agreement: number | null;
  /** Mean of (challenger − champion) score over the paired records (0 when nothing paired). */
  readonly MeanScoreDelta: number;
  /** Champion records the challenger did not score: missing from its rows, or scored null (a failure or timeout). */
  readonly Failures: number;
}

/** Whether a trigger fired over the periods read, and why. */
export interface TriggerDecision {
  readonly Fired: boolean;
  readonly Reason: string;
}

/** The unit columns the label-window rule reads. */
export interface LabelWindowColumns {
  readonly LabelWindowDays: number;
  readonly LabelGapDays: number;
}

/** The monitoring job's rules. */
export class MonitoringRules {
  /** The probability threshold the divergence's agreement compares decisions at. */
  public static readonly DECISION_THRESHOLD = 0.5;

  private static readonly MS_PER_DAY = 86_400_000;

  /**
   * Whether the label window of a prediction made on `decisionDate` has closed at `now`: the unit's gap and then its
   * window have both passed (closed from `decisionDate + LabelGapDays + LabelWindowDays` on, inclusive).
   */
  public static LabelWindowClosed(unit: LabelWindowColumns, decisionDate: Date, now: Date): boolean {
    const closesAt = decisionDate.getTime() + (unit.LabelGapDays + unit.LabelWindowDays) * MonitoringRules.MS_PER_DAY;
    return now.getTime() >= closesAt;
  }

  /**
   * Whether `trigger` fires over `periods` (oldest first): its condition held in each of the last
   * `consecutivePeriods` periods. `outcome-degradation` holds when the lower bound of the period's (period − reference)
   * primary-loss interval is strictly above the margin (`Degradation`); `calibration-drift` holds when the period's
   * calibration slope lies strictly outside `slopeOutside`. A period with no degradation interval or no calibration
   * report (nothing joined) does not hold, so it breaks the streak.
   */
  public static TriggerFires(trigger: RetrainTrigger, periods: readonly MonitoringPeriodResult[]): TriggerDecision {
    const n = trigger.consecutivePeriods;
    const last = periods.slice(-n);
    if (last.length < n) return { Fired: false, Reason: `${trigger.kind}: ${periods.length} of the ${n} consecutive periods it needs have been evaluated` };
    if (trigger.kind === 'outcome-degradation') {
      const held = last.every((p) => p.Degradation !== null && p.Degradation.lower > trigger.margin);
      const lowers = last.map((p) => (p.Degradation === null ? 'none' : String(p.Degradation.lower))).join(', ');
      return {
        Fired: held,
        Reason: `outcome-degradation: the (period − reference) loss lower bounds over the last ${n} period(s) are [${lowers}] against margin ${trigger.margin}`,
      };
    }
    const [lo, hi] = trigger.slopeOutside;
    const held = last.every((p) => p.Calibration !== null && (p.Calibration.slope < lo || p.Calibration.slope > hi));
    const slopes = last.map((p) => (p.Calibration === null ? 'none' : String(p.Calibration.slope))).join(', ');
    return { Fired: held, Reason: `calibration-drift: the calibration slopes over the last ${n} period(s) are [${slopes}] against the band [${lo}, ${hi}]` };
  }

  /**
   * Whether the automated rollback fires (D4-17): in each of the last `consecutivePeriods` checks (oldest first), the
   * lower bound of the paired (current − predecessor) loss interval is strictly above the rule's margin.
   */
  public static RollbackFires(rule: RollbackTrigger, checks: readonly { readonly Lower: number }[]): boolean {
    const last = checks.slice(-rule.consecutivePeriods);
    return last.length === rule.consecutivePeriods && last.every((c) => c.Lower > rule.margin);
  }

  /**
   * The live mirror's divergence (D-069): each champion record is paired with the challenger's score of the same key
   * (`IndexByUUID`); a champion record the challenger has no score for is a failure. For a classifier (`binary`,
   * `multiclass`: the score is the adverse-class probability) agreement compares the two scores' sides of
   * {@link DECISION_THRESHOLD}; any other task computes no agreement (null). The mean delta is challenger minus champion.
   */
  public static Divergence(champion: readonly ScoredValue[], challenger: readonly ScoredValue[], task: TaskType): MirrorDivergence {
    let paired = 0;
    let agreeing = 0;
    let deltaSum = 0;
    let failures = 0;
    const byKey = IndexByUUID(challenger, (x) => x.RecordID);
    for (const c of champion) {
      if (c.Score === null) continue;
      const other = byKey.Get(c.RecordID);
      if (!other || other.Score === null) {
        failures++;
        continue;
      }
      paired++;
      deltaSum += other.Score - c.Score;
      if ((c.Score >= MonitoringRules.DECISION_THRESHOLD) === (other.Score >= MonitoringRules.DECISION_THRESHOLD)) agreeing++;
    }
    const classifier = task.kind === 'binary' || task.kind === 'multiclass';
    return { Paired: paired, Agreement: !classifier ? null : paired === 0 ? 0 : agreeing / paired, MeanScoreDelta: paired === 0 ? 0 : deltaSum / paired, Failures: failures };
  }
}
