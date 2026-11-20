/**
 * @module scoring/prediction-retention-driver
 *
 * The scheduled-job driver of the daily prediction maintenance (§5.8.7; `MJ: Scheduled Job Types` "Predictive Studio
 * Prediction Retention", one Active job at 02:00 UTC): the binding backfill first, then the retention sweep of every
 * binding with a `RetentionDays`, with the counts per binding in the job run's `Details`. It runs as the job's user on
 * the provider the engine read the job with; the system user holds "View Model Predictions" (A-FV-SYSUSER), so the view
 * gate hides no `Model` row from it.
 */
import { ValidationResult } from '@memberjunction/core';
import type { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseScheduledJob, type ScheduledJobExecutionContext } from '@memberjunction/scheduling-engine';
import type { NotificationContent, ScheduledJobResult } from '@memberjunction/scheduling-base-types';
import {
  PredictionRetention,
  type BackfillOutcome,
  type BindingSweepOutcome,
  type PredictionRetentionContext,
} from './prediction-retention';

/** The job run's `Details`: the backfill's count and each swept binding's. */
export interface PredictionRetentionDetails {
  /** Bindings the backfill gave the seeded view authorization. */
  readonly BackfilledBindings: number;
  /** False when the seeded authorization was not loaded: the backfill changed nothing and retries next run. */
  readonly AuthorizationLoaded: boolean;
  /** Backfill saves that failed, each `<binding id>: <message>`. */
  readonly BackfillFailures: readonly string[];
  /** The sweep date (ISO text). */
  readonly SweepDate: string;
  /** One entry per binding with a `RetentionDays`. */
  readonly Bindings: readonly BindingSweepOutcome[];
  /** Rows deleted across every binding. */
  readonly Deleted: number;
  /** Deletes that failed across every binding. */
  readonly DeleteFailures: number;
}

/**
 * Runs the binding backfill and the prediction retention sweep. A composer over the protected steps
 * {@link BackfillViewAuthorizations}, {@link SweepBindings} and {@link WriteDetails}, over the production store of the
 * run's provider ({@link PredictionRetention.ContextOf}).
 */
@RegisterClass(BaseScheduledJob, 'PredictiveStudioPredictionRetentionJobDriver')
export class PredictiveStudioPredictionRetentionJobDriver extends BaseScheduledJob {
  /**
   * @inheritdoc Runs as the job's user on the provider the engine read the job with, on the run's start date, renewing
   * the job's lease as it goes (a hand-built context without `heartbeat` renews nothing).
   */
  public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
    const heartbeat = context.heartbeat ?? (async (): Promise<void> => undefined);
    const ctx = PredictionRetention.ContextOf({ ContextUser: context.ContextUser, Provider: context.Provider }, heartbeat);
    return this.RunMaintenance(ctx, context.Run.StartedAt || new Date());
  }

  /**
   * One maintenance run as a job result: {@link Maintain}'s details, `Success` false when a backfill save or a delete
   * failed (each counted, the other bindings still swept) and the run failed with the message when a read failed.
   */
  public async RunMaintenance(ctx: PredictionRetentionContext, sweepDate: Date): Promise<ScheduledJobResult> {
    try {
      const details = await this.Maintain(ctx, sweepDate);
      const failed = details.BackfillFailures.length + details.DeleteFailures;
      return {
        Success: failed === 0,
        ErrorMessage: failed === 0 ? undefined : `${details.BackfillFailures.length} backfill save(s) and ${details.DeleteFailures} prediction delete(s) failed`,
        Details: { ...details },
      };
    } catch (e) {
      return { Success: false, ErrorMessage: `Prediction retention failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  /**
   * The maintenance itself: the backfill, then the sweep, then the details.
   *
   * @throws when a read fails
   */
  public async Maintain(ctx: PredictionRetentionContext, sweepDate: Date): Promise<PredictionRetentionDetails> {
    const backfill = await this.BackfillViewAuthorizations(ctx);
    const swept = await this.SweepBindings(ctx, sweepDate);
    return this.WriteDetails(backfill, swept, sweepDate);
  }

  /** Step 1: the binding backfill (§5.8.7), before any sweep. */
  protected async BackfillViewAuthorizations(ctx: PredictionRetentionContext): Promise<BackfillOutcome> {
    return PredictionRetention.Backfill(ctx);
  }

  /** Step 2: the sweep of every binding with a `RetentionDays`, active or withdrawn. */
  protected async SweepBindings(ctx: PredictionRetentionContext, sweepDate: Date): Promise<BindingSweepOutcome[]> {
    const bindings = await ctx.Store.ReadRetainedBindings();
    const out: BindingSweepOutcome[] = [];
    for (const binding of bindings) {
      await ctx.Heartbeat();
      const swept = await PredictionRetention.SweepBinding(binding, sweepDate, ctx);
      if (swept !== null) out.push(swept);
    }
    return out;
  }

  /** Step 3: the job run's `Details` from the two steps. Pure. */
  protected WriteDetails(backfill: BackfillOutcome, swept: readonly BindingSweepOutcome[], sweepDate: Date): PredictionRetentionDetails {
    return {
      BackfilledBindings: backfill.Updated, AuthorizationLoaded: backfill.AuthorizationLoaded, BackfillFailures: backfill.Failures,
      SweepDate: sweepDate.toISOString(), Bindings: swept,
      Deleted: swept.reduce((n, b) => n + b.Deleted, 0), DeleteFailures: swept.reduce((n, b) => n + b.Failures.length, 0),
    };
  }

  /** @inheritdoc The job takes no configuration. */
  public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
    const result = new ValidationResult();
    result.Success = true;
    return result;
  }

  /** @inheritdoc */
  public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
    const deleted = typeof result.Details?.['Deleted'] === 'number' ? result.Details['Deleted'] : 0;
    const backfilled = typeof result.Details?.['BackfilledBindings'] === 'number' ? result.Details['BackfilledBindings'] : 0;
    return result.Success
      ? {
          Subject: `Prediction retention: ${deleted} expired prediction(s) removed`,
          Body: `The scheduled prediction retention "${context.Schedule.Name}" removed ${deleted} expired prediction(s) and gave ${backfilled} scoring binding(s) the default view authorization.`,
          Priority: 'Low',
        }
      : {
          Subject: `Prediction retention failed: ${context.Schedule.Name}`,
          Body: `The scheduled prediction retention "${context.Schedule.Name}" did not complete cleanly.\n\nError: ${result.ErrorMessage || 'unknown'}`,
          Priority: 'High',
        };
  }
}
