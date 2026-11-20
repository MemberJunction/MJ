/**
 * @module monitoring/rollback-step
 *
 * `RollbackStep` — the automated rollback (D4-17, §5.7 R5). Each evaluated period the Published model is compared with
 * its predecessor (the model its `publish` record replaced) on the same realised rows: the period's joined rows
 * outside either model's training snapshot, the predecessor shadow-scored on exactly those rows (`Path =
 * 'monitoring'`, the only path that admits it). When the lower bound of the paired (current − predecessor) loss
 * interval is strictly above the rule's margin in `consecutivePeriods` periods in a row, the step publishes the
 * predecessor through `LifecycleGate.Publish({ purpose: 'rollback' })`; the gate writes the record and the status.
 * A protocol with `rollbackOn: null` never rolls back; a deleted predecessor, or one whose stored artifact does not
 * load verified, is `not-eligible` and nothing is rolled back (the retrain triggers handle degradation).
 */
import { IndexByUUID } from '@memberjunction/global';
import { MonitoringRules, UtcDay, type Actor, type Interval, type MonitoringRollbackCheck, type RollbackTrigger } from '@memberjunction/predictive-studio-core';

import { OutcomeJoin } from './outcome-join';
import type { JoinedRow, MonitoredUnit, MonitoringContext, MonitoringPeriod, Predecessor, MonitoredModel } from './monitoring-seams';
import { PeriodEvaluation, type PeriodScoringSpec } from './period-evaluation';

/** What a rollback check is judged by: the protocol's rule and the period scoring of the current model. */
export interface RollbackPlan {
  /** The protocol's `rollbackOn`; null turns automated rollback off. */
  readonly Rule: RollbackTrigger | null;
  readonly Scoring: PeriodScoringSpec;
  readonly Unit: MonitoredUnit;
  /** Who the rollback is published as (the scheduled job run, or the operation's caller). */
  readonly Initiator: Actor;
}

/** One period's paired comparison: the rows both models scored and the (current − predecessor) loss interval. */
export interface PairedPeriod {
  readonly SharedRows: number;
  readonly Difference: Interval;
}

/** The predecessor shadow scoring could not complete for a period, so the comparison cannot be made. */
export class RollbackComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RollbackComparisonError';
  }
}

/** The automated rollback check of one Published model. */
export class RollbackStep {
  /**
   * Checks the current model against its predecessor over `periods` (oldest first; the driver passes the last
   * `consecutivePeriods` evaluated periods, the current one last) and rolls back when the rule fires.
   *
   * @throws RollbackComparisonError when the predecessor's shadow run on a period's rows does not complete
   */
  public async CheckRollback(current: MonitoredModel, periods: readonly MonitoringPeriod[], plan: RollbackPlan, ctx: MonitoringContext): Promise<MonitoringRollbackCheck> {
    if (plan.Rule === null) return { kind: 'off' };
    const predecessor = await ctx.Seams.Store.Predecessor(current.ID, ctx);
    if (predecessor === null) return { kind: 'no-predecessor' };
    const eligible = await this.Eligibility(predecessor, ctx);
    if (eligible.kind === 'not-eligible') return eligible;
    const model = eligible.Model;
    const compared: PairedPeriod[] = [];
    for (const period of periods) compared.push(await this.ComparePeriod(current, model, period, plan, ctx));
    const comparisons = compared.map((c) => c.Difference);
    const shared = compared.length === 0 ? 0 : compared[compared.length - 1].SharedRows;
    if (!MonitoringRules.RollbackFires(plan.Rule, comparisons.map((c) => ({ Lower: c.lower })))) {
      return { kind: 'checked', predecessorModelId: predecessor.ModelID, sharedRowIds: shared, comparisons, recordId: null };
    }
    const reason = `Monitoring: the predecessor beat ML Model ${current.ID} on the same realised rows in ${plan.Rule.consecutivePeriods} consecutive period(s) (paired loss lower bounds ${comparisons.map((c) => c.lower.toFixed(6)).join(', ')} above margin ${plan.Rule.margin}).`;
    const outcome = await ctx.Seams.Gate.Publish({ modelId: predecessor.ModelID, purpose: 'rollback', initiator: plan.Initiator, signOffId: null, reason }, ctx);
    if (outcome.Kind === 'withheld') {
      return { kind: 'rollback-withheld', predecessorModelId: predecessor.ModelID, sharedRowIds: shared, comparisons, recordId: outcome.RefusalRecordID };
    }
    return { kind: 'rolled-back', predecessorModelId: predecessor.ModelID, sharedRowIds: shared, comparisons, recordId: outcome.PublishRecordID };
  }

  /**
   * Whether the predecessor may be restored: it still exists and its stored artifact loads verified. Returns its row,
   * or the `not-eligible` check naming why.
   */
  protected async Eligibility(predecessor: Predecessor, ctx: MonitoringContext): Promise<Extract<MonitoringRollbackCheck, { readonly kind: 'not-eligible' }> | { readonly kind: 'eligible'; readonly Model: MonitoredModel }> {
    if (predecessor.Model === null) return { kind: 'not-eligible', predecessorModelId: predecessor.ModelID, reason: 'the predecessor model has been deleted' };
    const artifact = await ctx.Seams.Store.ArtifactVerified(predecessor.Model, ctx);
    if (!artifact.Verified) return { kind: 'not-eligible', predecessorModelId: predecessor.ModelID, reason: `the predecessor has no verified artifact: ${artifact.Reason}` };
    return { kind: 'eligible', Model: predecessor.Model };
  }

  /**
   * One period's paired comparison: the current model's joined rows with an outcome; the predecessor shadow-scored on
   * exactly those rows; the rows in the predecessor's training snapshot (its scored rows' `inTraining`) left out of
   * both sides; the paired (current − predecessor) loss interval.
   *
   * @throws RollbackComparisonError when the predecessor's shadow run does not complete, misses a row, or leaves no row
   */
  protected async ComparePeriod(current: MonitoredModel, predecessor: MonitoredModel, period: MonitoringPeriod, plan: RollbackPlan, ctx: MonitoringContext): Promise<PairedPeriod> {
    const joined = (await OutcomeJoin.Join(current, plan.Unit, period, ctx)).Rows.filter((r) => r.Outcome !== null);
    const day = UtcDay.UtcDayIso(period.Start);
    if (joined.length === 0) throw new RollbackComparisonError(`period ${day}: no realised row outside the current model's training snapshot`);
    const run = await ctx.Seams.Scorer.Shadow(predecessor, plan.Unit, joined.map((r) => ({ RecordID: r.RecordID, DecisionDate: r.DecisionDate })), current.ID, ctx);
    if (run.Status !== 'completed') throw new RollbackComparisonError(`the predecessor's shadow run ${run.ScoringRunID} ended ${run.Status}: ${run.Reason || 'no reason given'}`);
    const byRecord = IndexByUUID(run.Predictions, (p) => p.RecordID);
    const currentRows: JoinedRow[] = [];
    const predecessorRows: JoinedRow[] = [];
    for (const r of joined) {
      const p = byRecord.Get(r.RecordID);
      if (p === undefined) throw new RollbackComparisonError(`the predecessor's shadow run ${run.ScoringRunID} has no prediction for record '${r.RecordID}'`);
      if (p.InTraining) continue;
      currentRows.push(r);
      predecessorRows.push({ ...r, Score: p.Score, Probabilities: p.Probabilities });
    }
    if (currentRows.length === 0) throw new RollbackComparisonError(`period ${day}: every realised row is in the predecessor's training snapshot`);
    const diff = PeriodEvaluation.PairedDifference(currentRows, predecessorRows, plan.Scoring);
    return { SharedRows: currentRows.length, Difference: diff.interval };
  }

  /** The words of a check, for the job run's `Details`. Pure. */
  public static Describe(check: MonitoringRollbackCheck): string {
    switch (check.kind) {
      case 'off': return 'automated rollback is off for this protocol version';
      case 'no-predecessor': return 'the model replaced no predecessor';
      case 'not-eligible': return `rollback not eligible: ${check.reason}`;
      case 'checked': return `predecessor ${check.predecessorModelId} checked on ${check.sharedRowIds} shared rows; the rule did not fire`;
      case 'rolled-back': return `rolled back to ${check.predecessorModelId} (publish record ${check.recordId})`;
      case 'rollback-withheld': return `the rollback to ${check.predecessorModelId} was withheld by the gate (refusal record ${check.recordId})`;
    }
  }
}
