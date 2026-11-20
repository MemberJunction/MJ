/**
 * @module monitoring/monitoring-driver
 *
 * `PredictiveStudioModelMonitoringJobDriver` — the one monitoring job per Published model (C7, M6.3). The lifecycle gate
 * creates the job with the model's `MonitoringJobSpec`; each run monitors the last complete period (and re-runs any
 * earlier period stored `window-open`), and `PredictiveStudio.RunModelMonitoring` runs named periods now. Per period,
 * as a composer over JSDoc'd protected steps:
 *
 * | Step | What it does |
 * |---|---|
 * | {@link JoinOutcomes} | the period's predictions (the binding's `Champion` rows, or a shadow `Predict` when no binding is `Active`, D4-67) joined to realised outcomes once the unit's label window has closed; training rows excluded |
 * | {@link EvaluatePeriod} | the primary score, tracked metrics and calibration, each with its 95% interval, and the (period − reference) degradation |
 * | {@link LookForDrift} | procedure M through the sidecar's `/monitor/drift`; an alarm is recorded and notified and starts nothing (D4-20) |
 * | {@link FireTriggers} | the protocol's retrain triggers on realised performance only |
 * | {@link RunChallenger} | a fired trigger's challenger through `AutomatedPublisher` (scheduled-job initiator) |
 * | {@link CheckRollback} | the predecessor on the same rows; a rollback through `LifecycleGate.Publish({ purpose: 'rollback' })` (D4-17) |
 * | {@link MeasureDivergence} | the live mirror's champion/challenger divergence (D-069) |
 * | {@link CheckParity} | M5's parity check, re-sampled once; a confirmed failure starts a training run (D4-20) |
 * | {@link WritePeriod} | the one `MJ: ML Monitoring Results` row of the period (a re-run updates it) |
 *
 * Monitoring writes no model status: every status change goes through the gate. Every read runs on the job's provider
 * as the job's owner (`OwnerUserID`, resolved by `resolveScheduleOwnerUser`; D4-179), never as the scheduler's user.
 */
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import {
  MonitoringResultSchemas,
  MonitoringRules,
  UtcDay,
  type Actor,
  type DriftLookEntry,
  type MetricWithInterval,
  type MonitoringChallengerResult,
  type MonitoringJobReadSpec,
  type MonitoringMirror,
  type MonitoringParity,
  type MonitoringPeriodResult,
  type MonitoringRollbackCheck,
  type MonitoringTriggerFired,
  type MonitorInputKind,
  type TaskType,
} from '@memberjunction/predictive-studio-core';

import { ChallengerStep } from './challenger-step';
import type { JoinedRow, MonitoredUnit, MonitoringContext, MonitoringPeriod, MonitoringSeams, PeriodRowWrite, StoredPeriodRow, MonitoredModel, MonitoredBinding } from './monitoring-seams';
import { MonitoringPeriods } from './monitoring-periods';
import { MonitoringSeamDefaults } from './monitoring-store';
import { OutcomeJoin, OutcomeJoinFailedError, type OutcomeJoinResult } from './outcome-join';
import { PeriodEvaluation, type PeriodScores, type PeriodScoringSpec } from './period-evaluation';
import { RollbackStep } from './rollback-step';

/** What one monitored period came to, for the job run's `Details` and the operation's output. */
export interface MonitoredPeriodOutcome {
  /** The period's first day, `YYYY-MM-DD`. */
  readonly Period: string;
  readonly MonitoringResultID: string;
  readonly State: PeriodRowWrite['State'];
  readonly JoinedRows: number;
  readonly Primary: MetricWithInterval | null;
  readonly DriftAlarms: number;
  readonly TriggersFired: readonly MonitoringTriggerFired[];
  readonly Challenger: MonitoringChallengerResult | null;
  readonly Rollback: string | null;
  readonly ErrorMessage: string | null;
}

/** What a run monitored: the model, and each period's outcome (empty when the model is no longer Published). */
export interface MonitoringRunOutcome {
  readonly ModelID: string;
  /** Why nothing was monitored (the model is gone or no longer Published); null when the periods ran. */
  readonly Skipped: string | null;
  readonly Periods: readonly MonitoredPeriodOutcome[];
}

/** A step of a period that threw: its message names the step and the error's own message. */
class PeriodStepError extends Error {
  constructor(step: string, reason: string) {
    super(`${step} could not run: ${reason}`);
    this.name = 'PeriodStepError';
  }
}

/** The period's evaluated numbers, with the degradation the triggers read. */
interface EvaluatedPeriod {
  readonly Scores: PeriodScores;
  readonly Degradation: MonitoringPeriodResult['Degradation'];
}

/** What one period's run resolved before its steps: the model, its unit and task, the spec and the initiator. */
export interface PeriodPlan {
  readonly Model: MonitoredModel;
  readonly Unit: MonitoredUnit;
  readonly Task: TaskType;
  readonly Spec: MonitoringJobReadSpec;
  readonly Initiator: Actor;
}

/** The procedure-M look of a period: every input's result and the alarms. */
interface DriftLook {
  readonly Look: readonly DriftLookEntry[] | null;
  readonly Alarms: readonly DriftLookEntry[];
}

/** Runs one Published model's monitoring, period by period. */
@RegisterClass(BaseScheduledJob, 'PredictiveStudioModelMonitoringJobDriver')
export class PredictiveStudioModelMonitoringJobDriver extends BaseScheduledJob {
  /** No-drift replays behind each look's empirical p-values (the sidecar accepts 100..100000). */
  public static readonly DRIFT_LOOK_REPLAYS = 10_000;
  /** The sidecar's largest look index. */
  public static readonly MAX_LOOK = 120;

  private readonly rollback = new RollbackStep();
  private readonly challenger = new ChallengerStep();

  /** @param seams replacements for the production collaborators (tests); each one left out is the production default */
  constructor(private readonly seams: Partial<MonitoringSeams> = {}) {
    super();
  }

  /**
   * The scheduled run: the job's spec from its `Configuration`, then the last complete period of the spec's grain and
   * every earlier period stored `window-open`. Every read runs as the job's owner (D4-179, D4-157), never as the
   * scheduler's polling user: a job with no `OwnerUserID`, or whose owner is missing or inactive, is refused before any
   * read. A failed period is recorded on its row (`State = 'failed'`) and fails the run; the other periods still run.
   */
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    const spec = MonitoringResultSchemas.ParseJobSpec(context.Schedule.Configuration);
    if (spec.Ok === false) return { Success: false, ErrorMessage: `The monitoring job's Configuration is not a valid MonitoringJobSpec: ${spec.Errors.join('; ')}` };
    const owner = await this.ownerOf(context);
    if (typeof owner === 'string') return { Success: false, ErrorMessage: owner };
    const ctx = this.ContextFor(owner, context.Provider, context.Run.ID);
    const now = ctx.Seams.Clock.Now();
    const last = MonitoringPeriods.LastComplete(now, spec.Value.performance.period);
    const reopened = (await ctx.Seams.Store.EarlierPeriods(spec.Value.modelId, last.Grain, last.Start, ctx))
      .filter((p) => p.State === 'window-open').map((p) => MonitoringPeriods.Starting(p.Period, last.Grain));
    const outcome = await this.MonitorPeriods(spec.Value, [...reopened, last], ctx);
    const failed = outcome.Periods.filter((p) => p.State === 'failed');
    return {
      Success: failed.length === 0,
      ErrorMessage: failed.length === 0 ? undefined : failed.map((p) => `${p.Period}: ${p.ErrorMessage || 'failed'}`).join('; '),
      Details: { ModelID: outcome.ModelID, Skipped: outcome.Skipped, Periods: outcome.Periods },
    };
  }

  /** Checks the job's `Configuration` against the `MonitoringJobSpec` schema. */
  public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    const spec = MonitoringResultSchemas.ParseJobSpec(schedule.Configuration);
    if (spec.Ok === false) for (const e of spec.Errors) result.Errors.push(new ValidationErrorInfo('Configuration', e, schedule.Configuration, ValidationErrorType.Failure));
    result.Success = result.Errors.length === 0;
    return result;
  }

  /** The run's summary: its error, if any, and its per-period details. A failed run is High priority. */
  public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
    return {
      Subject: `Predictive Studio monitoring (${context.Schedule.Name}): ${result.Success ? 'completed' : 'failed'}`,
      Body: [result.ErrorMessage || '', JSON.stringify(result.Details || {})].filter((l) => l.length > 0).join('\n'),
      Priority: result.Success ? 'Normal' : 'High',
    };
  }

  /**
   * Monitors `periods` (oldest first) of the spec's model. A model that is gone or no longer Published is skipped and
   * nothing is written (its job is disabled by the gate when it is archived).
   */
  public async MonitorPeriods(spec: MonitoringJobReadSpec, periods: readonly MonitoringPeriod[], ctx: MonitoringContext): Promise<MonitoringRunOutcome> {
    const model = await ctx.Seams.Store.LoadModel(spec.modelId, ctx);
    if (model === null) return { ModelID: spec.modelId, Skipped: 'the model is gone', Periods: [] };
    if (model.Status !== 'Published') return { ModelID: model.ID, Skipped: `the model is ${model.Status}, not Published`, Periods: [] };
    const plan: PeriodPlan = {
      Model: model, Unit: await ctx.Seams.Store.LoadUnit(spec.outcomeJoin.predictionUnitId, ctx), Task: ctx.Seams.Store.TaskOf(model), Spec: spec,
      Initiator: ctx.ScheduledJobRunID ? { kind: 'scheduled-job', scheduledJobRunId: ctx.ScheduledJobRunID } : { kind: 'human', userId: ctx.ContextUser.ID },
    };
    const out: MonitoredPeriodOutcome[] = [];
    for (const period of periods) out.push(await this.MonitorPeriod(plan, period, ctx));
    return { ModelID: model.ID, Skipped: null, Periods: out };
  }

  /**
   * The context of a run: the job's user and provider and the production collaborators, each replaced by the
   * constructor's seams when given.
   */
  public ContextFor(user: MonitoringContext['ContextUser'], provider: MonitoringContext['Provider'], scheduledJobRunId: string | null): MonitoringContext {
    return { ContextUser: user, Provider: provider, ScheduledJobRunID: scheduledJobRunId, Seams: MonitoringSeamDefaults.Resolve(this.seams) };
  }

  /**
   * The job's owner, resolved through `BaseScheduledJob.resolveScheduleOwnerUser` (fails closed for a missing or
   * inactive owner); the refusal in words when the job has no owner or it cannot be resolved.
   */
  private async ownerOf(context: ScheduledJobExecutionContext): Promise<MonitoringContext['ContextUser'] | string> {
    if (!context.Schedule.OwnerUserID) {
      return `The monitoring job "${context.Schedule.Name}" has no OwnerUserID: monitoring reads as the job's owner (D4-179), never as the scheduler's user, so it did not run; give the job an owner who holds the binding's view authorization`;
    }
    try {
      return await this.resolveScheduleOwnerUser(context.Schedule, context.ContextUser);
    } catch (e) {
      return `The monitoring job's owner could not be resolved, so it did not run: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // ----- one period ------------------------------------------------------------------------------------------------

  /**
   * One period through every step. A failure of the join or of any step (an unreachable sidecar, an artifact that no
   * longer loads verified, a publisher, parity or notifier error) is recorded on the period's row as `failed` with the
   * step and its reason, and the next period still runs. Only a failure to write the period's row itself propagates.
   */
  protected async MonitorPeriod(plan: PeriodPlan, period: MonitoringPeriod, ctx: MonitoringContext): Promise<MonitoredPeriodOutcome> {
    const base = PredictiveStudioModelMonitoringJobDriver.emptyRow(plan.Model.ID, ctx.ScheduledJobRunID, period);
    if (!MonitoringRules.LabelWindowClosed(plan.Unit, MonitoringPeriods.LastDay(period), ctx.Seams.Clock.Now())) {
      return this.WritePeriod({ ...base, State: 'window-open' }, ctx);
    }
    let join: OutcomeJoinResult;
    try {
      join = await this.JoinOutcomes(plan, period, ctx);
    } catch (e) {
      const reason = e instanceof OutcomeJoinFailedError ? e.message : `the outcome join could not run: ${e instanceof Error ? e.message : String(e)}`;
      return this.WritePeriod({ ...base, State: 'failed', ErrorMessage: reason }, ctx);
    }
    const counted = { ...base, ScoredRows: join.ScoredRows, JoinedRows: join.Rows.filter((r) => r.Outcome !== null).length, ExcludedInTrainingRows: join.ExcludedInTrainingRows };
    if (!join.Rows.some((r) => r.Outcome !== null)) {
      return this.WritePeriod({ ...counted, State: 'failed', ErrorMessage: `no realised outcome among the period's ${join.Rows.length} joined prediction(s)` }, ctx);
    }
    let write: PeriodRowWrite;
    try {
      write = await this.evaluateAndAct(plan, period, join, counted, ctx);
    } catch (e) {
      return this.WritePeriod({ ...counted, State: 'failed', ErrorMessage: e instanceof Error ? e.message : String(e) }, ctx);
    }
    return this.WritePeriod(write, ctx);
  }

  /** Steps 2–8 of a joined period, each named in the error that stops it; the period's row to write. */
  private async evaluateAndAct(plan: PeriodPlan, period: MonitoringPeriod, join: OutcomeJoinResult, counted: PeriodRowWrite, ctx: MonitoringContext): Promise<PeriodRowWrite> {
    const step = PredictiveStudioModelMonitoringJobDriver.step;
    const history = await step('the period history read', () => ctx.Seams.Store.EarlierPeriods(plan.Model.ID, period.Grain, period.Start, ctx));
    const evaluated = await step('the evaluation', () => this.EvaluatePeriod(plan, join.Rows, period, ctx));
    const drift = await step('the drift look', () => this.LookForDrift(plan, join, period, history, ctx));
    const current = PredictiveStudioModelMonitoringJobDriver.periodResult(plan.Model.ID, period, join.Rows.length, evaluated.Scores, evaluated.Degradation);
    const fired = await step('the retrain triggers', () => this.FireTriggers(plan, history, current, ctx));
    const previousFired = history.filter((h) => h.State === 'evaluated').slice(-1).flatMap((h) => h.TriggersFired);
    const mirror = await step('the live mirror', () => this.MeasureDivergence(plan, join, period, ctx));
    const challenger = await step('the challenger', () => this.RunChallenger(plan, fired, previousFired, mirror, ctx));
    const rollback = await step('the rollback check', () => this.CheckRollback(plan, history, period, ctx));
    const parity = await step('the parity check', () => this.CheckParity(plan, join.Binding, period, ctx));
    return {
      ...counted, State: 'evaluated', Primary: evaluated.Scores.Primary, Tracked: evaluated.Scores.Tracked, Calibration: evaluated.Scores.Calibration,
      DriftLook: drift.Look, DriftAlarms: drift.Alarms, Parity: parity, TriggersFired: fired, ChallengerRunID: challenger.ChallengerRunID,
      Challenger: challenger.Result, Rollback: rollback,
    };
  }

  /** Runs one named step; an error it throws is rethrown as a {@link PeriodStepError} naming the step. */
  private static async step<T>(name: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      throw new PeriodStepError(name, e instanceof Error ? e.message : String(e));
    }
  }

  /** Step 1: the period's predictions joined to their realised outcomes ({@link OutcomeJoin.Join}). */
  protected async JoinOutcomes(plan: PeriodPlan, period: MonitoringPeriod, ctx: MonitoringContext): Promise<OutcomeJoinResult> {
    return OutcomeJoin.Join(plan.Model, plan.Unit, period, ctx);
  }

  /** Step 2: the period's scores under the protocol, and the degradation against the model's stored holdout score. */
  protected async EvaluatePeriod(plan: PeriodPlan, rows: readonly JoinedRow[], period: MonitoringPeriod, ctx: MonitoringContext): Promise<EvaluatedPeriod> {
    const scores = PeriodEvaluation.Score(rows, this.scoringSpec(plan, period));
    const reference = await ctx.Seams.Store.ReferenceScore(plan.Model.ID, ctx);
    return { Scores: scores, Degradation: reference === null ? null : PeriodEvaluation.Degradation(scores.Primary, reference) };
  }

  /**
   * Step 3: procedure M at this period's look (one look per evaluated period since publication) through the sidecar; an
   * alarm is notified to the job's owner and starts nothing. A model with no testable input records no look.
   */
  protected async LookForDrift(plan: PeriodPlan, join: OutcomeJoinResult, period: MonitoringPeriod, history: readonly StoredPeriodRow[], ctx: MonitoringContext): Promise<DriftLook> {
    const inputs = (await ctx.Seams.Store.DriftInputs(plan.Model, plan.Unit, join.Rows.map((r) => r.RecordID), ctx))
      .map((i) => ({ name: i.Name, kind: PredictiveStudioModelMonitoringJobDriver.inputKind(i.Reference, i.Current), reference: [...i.Reference], current: [...i.Current] }))
      .filter((i): i is typeof i & { kind: MonitorInputKind } => i.kind !== null);
    if (inputs.length === 0) return { Look: null, Alarms: [] };
    const look = Math.min(PredictiveStudioModelMonitoringJobDriver.MAX_LOOK, history.filter((h) => h.State === 'evaluated').length + 1);
    const response = await ctx.Seams.Drift.MonitorDrift({
      inputs, look, q: plan.Spec.drift.fdr.q, replays: PredictiveStudioModelMonitoringJobDriver.DRIFT_LOOK_REPLAYS,
      seed: PredictiveStudioModelMonitoringJobDriver.SeedOf(plan.Model.ID, period, 'drift'),
    });
    if (response.alarms.length > 0) {
      await this.notify(plan, `Drift alarm: ML Model ${plan.Model.ID}`,
        `Monitoring flagged input drift on ${response.alarms.map((a) => a.input).join(', ')} for the period starting ${UtcDay.UtcDayIso(period.Start)} (look ${look}, q ${plan.Spec.drift.fdr.q}). A drift alarm starts no retraining; only degraded realised performance does.`, ctx);
    }
    return { Look: response.results, Alarms: response.alarms };
  }

  /** Step 4: the protocol's retrain triggers over the stored periods and this one (realised performance only). */
  protected async FireTriggers(plan: PeriodPlan, history: readonly StoredPeriodRow[], current: MonitoringPeriodResult, ctx: MonitoringContext): Promise<MonitoringTriggerFired[]> {
    const reference = await ctx.Seams.Store.ReferenceScore(plan.Model.ID, ctx);
    const earlier = history.filter((h) => h.State === 'evaluated').map((h) => PredictiveStudioModelMonitoringJobDriver.storedResult(plan.Model.ID, h, reference));
    const periods = [...earlier, current];
    const fired: MonitoringTriggerFired[] = [];
    for (const trigger of plan.Spec.retrainTriggers) {
      const decision = MonitoringRules.TriggerFires(trigger, periods);
      if (decision.Fired) fired.push({ kind: trigger.kind, reason: decision.Reason });
    }
    return fired;
  }

  /** Step 5: a fired trigger's challenger ({@link ChallengerStep}). */
  protected async RunChallenger(plan: PeriodPlan, fired: readonly MonitoringTriggerFired[], previousFired: readonly MonitoringTriggerFired[], mirror: MonitoringMirror | null, ctx: MonitoringContext): Promise<{ readonly ChallengerRunID: string | null; readonly Result: MonitoringChallengerResult }> {
    return this.challenger.RunChallenger(plan.Model, fired, previousFired, mirror, plan.Initiator, ctx);
  }

  /** Step 6: the predecessor on the same rows over the last `consecutivePeriods` evaluated periods ({@link RollbackStep}). */
  protected async CheckRollback(plan: PeriodPlan, history: readonly StoredPeriodRow[], period: MonitoringPeriod, ctx: MonitoringContext): Promise<MonitoringRollbackCheck> {
    const rule = plan.Spec.rollback;
    const earlier = rule === null ? [] : history.filter((h) => h.State === 'evaluated').slice(-(rule.consecutivePeriods - 1)).map((h) => MonitoringPeriods.Starting(h.Period, period.Grain));
    const periods = rule === null || rule.consecutivePeriods <= 1 ? [period] : [...earlier, period];
    return this.rollback.CheckRollback(plan.Model, periods, { Rule: rule, Scoring: this.scoringSpec(plan, period), Unit: plan.Unit, Initiator: plan.Initiator }, ctx);
  }

  /**
   * Step 7: the live mirror's divergence over the period — the binding's challenger `Challenger` rows against the
   * champion rows of the records in the challenger's sample; null without a binding or a named challenger.
   */
  protected async MeasureDivergence(plan: PeriodPlan, join: OutcomeJoinResult, period: MonitoringPeriod, ctx: MonitoringContext): Promise<MonitoringMirror | null> {
    if (join.Binding === null) return null;
    const selection = await ctx.Seams.Store.Challenger(join.Binding, period.Start, ctx);
    if (selection === null) return null;
    const champion = (await ctx.Seams.Store.ModelRows(plan.Model.ID, join.Binding.ID, 'Champion', period, ctx)).filter((p) => selection.Sampled(p.RecordID));
    const challenger = await ctx.Seams.Store.ModelRows(selection.ModelID, join.Binding.ID, 'Challenger', period, ctx);
    const d = MonitoringRules.Divergence(champion.map((p) => ({ RecordID: p.RecordID, Score: p.Score })), challenger.map((p) => ({ RecordID: p.RecordID, Score: p.Score })));
    return { challengerModelId: selection.ModelID, paired: d.Paired, agreement: d.Agreement, meanScoreDelta: d.MeanScoreDelta, failures: d.Failures };
  }

  /**
   * Step 8: M5's parity check on the binding's stored rows, re-sampled once when it fails; a confirmed failure starts a
   * training run on a fresh snapshot through the automated publisher (D4-20). The shadow path stores nothing to check.
   */
  protected async CheckParity(plan: PeriodPlan, binding: MonitoredBinding | null, period: MonitoringPeriod, ctx: MonitoringContext): Promise<MonitoringParity> {
    const tolerance = plan.Spec.parity.tolerance;
    const skipped = (reason: string): MonitoringParity => ({ sampled: 0, maxAbsDifference: 0, passed: true, tolerance, resampled: false, trainingRunId: null, skipped: reason });
    if (binding === null) return skipped('no Active binding stores this model\'s predictions');
    const seed = PredictiveStudioModelMonitoringJobDriver.SeedOf(plan.Model.ID, period, 'parity');
    const first = await ctx.Seams.Parity.Check(binding, plan.Spec.parity.sampleRows, seed, tolerance, ctx);
    if (first.Sampled === 0) return skipped('the binding has no stored row to sample');
    if (first.Passed) return { sampled: first.Sampled, maxAbsDifference: first.MaxAbsDifference, passed: true, tolerance, resampled: false, trainingRunId: null, skipped: null };
    const second = await ctx.Seams.Parity.Check(binding, plan.Spec.parity.sampleRows, seed + 1, tolerance, ctx);
    if (second.Passed) return { sampled: second.Sampled, maxAbsDifference: second.MaxAbsDifference, passed: true, tolerance, resampled: true, trainingRunId: null, skipped: null };
    const trained = await ctx.Seams.Publisher.Train(plan.Model.PipelineID, ctx);
    await ctx.Seams.Publisher.EvaluateAndPublish(trained.TrainingRunID, plan.Initiator, ctx);
    await this.notify(plan, `Scoring parity failure: ML Model ${plan.Model.ID}`,
      `Recomputed predictions differ from stored ones by up to ${Math.max(first.MaxAbsDifference, second.MaxAbsDifference)} (tolerance ${tolerance}) in two samples; training run ${trained.TrainingRunID} was started and publishes through the gate.`, ctx);
    return { sampled: second.Sampled, maxAbsDifference: Math.max(first.MaxAbsDifference, second.MaxAbsDifference), passed: false, tolerance, resampled: true, trainingRunId: trained.TrainingRunID, skipped: null };
  }

  /** Step 9: the period's one row (a re-run updates it), and the period's outcome. */
  protected async WritePeriod(write: PeriodRowWrite, ctx: MonitoringContext): Promise<MonitoredPeriodOutcome> {
    const id = await ctx.Seams.Store.WritePeriod(write, ctx);
    return {
      Period: UtcDay.UtcDayIso(write.Period.Start), MonitoringResultID: id, State: write.State, JoinedRows: write.JoinedRows, Primary: write.Primary,
      DriftAlarms: write.DriftAlarms.length, TriggersFired: write.TriggersFired, Challenger: write.Challenger,
      Rollback: write.Rollback === null ? null : RollbackStep.Describe(write.Rollback), ErrorMessage: write.ErrorMessage,
    };
  }

  // ----- helpers ---------------------------------------------------------------------------------------------------

  /** A deterministic 32-bit seed of a model, a period and a purpose (FNV-1a), so a re-run of a period reproduces it. Pure. */
  public static SeedOf(modelId: string, period: MonitoringPeriod, purpose: string): number {
    const text = `${modelId.toLowerCase()}|${period.Grain}|${UtcDay.UtcDayIso(period.Start)}|${purpose}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % 2_147_483_647;
  }

  private scoringSpec(plan: PeriodPlan, period: MonitoringPeriod): PeriodScoringSpec {
    return { PrimaryScore: plan.Spec.performance.primaryScore, Interval: plan.Spec.performance.interval, Task: plan.Task, Seed: PredictiveStudioModelMonitoringJobDriver.SeedOf(plan.Model.ID, period, 'interval') };
  }

  /** A notification to the job's owner (the operation's caller when no job run is behind the call), D4-18. */
  private async notify(plan: PeriodPlan, title: string, message: string, ctx: MonitoringContext): Promise<void> {
    const owner = ctx.ScheduledJobRunID ? await ctx.Seams.Store.JobOwner(ctx.ScheduledJobRunID, ctx) : ctx.ContextUser.ID;
    if (owner) await ctx.Seams.Notifier.Notify(owner, title, message, plan.Model.ID, ctx);
  }

  /** The procedure-M input kind of a column, or null when the column cannot be tested (no variation, too short). Pure. */
  private static inputKind(reference: readonly number[], current: readonly number[]): MonitorInputKind | null {
    if (current.length === 0 || reference.length < 3) return null;
    const mean = reference.reduce((s, v) => s + v, 0) / reference.length;
    if (!reference.some((v) => v !== mean)) return null;
    const binary = (xs: readonly number[]): boolean => xs.every((v) => v === 0 || v === 1);
    if (binary(reference) && binary(current)) return 'proportion';
    return current.length === 1 ? 'series' : 'mean';
  }

  /** A row with nothing measured yet. */
  private static emptyRow(modelId: string, scheduledJobRunId: string | null, period: MonitoringPeriod): PeriodRowWrite {
    return {
      ModelID: modelId, ScheduledJobRunID: scheduledJobRunId, Period: period, State: 'window-open', ScoredRows: 0, JoinedRows: 0, ExcludedInTrainingRows: 0,
      Primary: null, Tracked: null, Calibration: null, DriftLook: null, DriftAlarms: [], Parity: null, TriggersFired: [], ChallengerRunID: null,
      Challenger: null, Rollback: null, ErrorMessage: null,
    };
  }

  /** This period as the trigger rules read it. */
  private static periodResult(modelId: string, period: MonitoringPeriod, joined: number, scores: PeriodScores, degradation: MonitoringPeriodResult['Degradation']): MonitoringPeriodResult {
    return {
      ModelID: modelId, Period: UtcDay.UtcDayIso(period.Start), JoinedRows: joined, Primary: scores.Primary, Degradation: degradation, Calibration: scores.Calibration,
      DriftAlarms: [], Parity: { Sampled: 0, MaxAbsDifference: 0, Passed: true }, TriggersFired: [], ChallengerRunID: null,
    };
  }

  /**
   * An earlier evaluated period as the trigger rules read it: its stored primary score and calibration, the
   * degradation recomputed against the same reference.
   *
   * @throws Error when an evaluated row stores no primary score
   */
  private static storedResult(modelId: string, row: StoredPeriodRow, reference: MetricWithInterval | null): MonitoringPeriodResult {
    const primary = row.Primary;
    if (primary === null) throw new Error(`The evaluated monitoring period ${UtcDay.UtcDayIso(row.Period)} of ML Model ${modelId} stores no primary score`);
    return {
      ModelID: modelId, Period: UtcDay.UtcDayIso(row.Period), JoinedRows: primary.n, Primary: primary,
      Degradation: reference === null ? null : PeriodEvaluation.Degradation(primary, reference),
      Calibration: row.Calibration, DriftAlarms: [], Parity: { Sampled: 0, MaxAbsDifference: 0, Passed: true }, TriggersFired: row.TriggersFired.map((t) => t.kind), ChallengerRunID: null,
    };
  }
}
