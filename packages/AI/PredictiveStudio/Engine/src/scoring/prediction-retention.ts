/**
 * @module scoring/prediction-retention
 *
 * The daily prediction maintenance of §5.8.7 (D4-25, D4-28): the binding backfill, which gives every binding without
 * a view authorization the seeded "View Model Predictions" one, and the retention sweep, which deletes a binding's
 * `Source = 'Model'` Feature Values older than its `RetentionDays` — active and withdrawn bindings alike — and never a
 * binding, model or pipeline. `MJ: Latest Feature Values` reads the live table, so nothing is refreshed afterwards.
 *
 * The reads and writes go through an {@link IPredictionRetentionStore}; the production store
 * ({@link ProviderPredictionRetentionStore}) reads with `RunView` on the context's provider as its user and deletes each
 * row through `BaseEntity.Delete()`, so Record Changes records every delete.
 */
import { LogError, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeatureValueEntity, MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { PredictionViewAuthorization, UtcDay } from '@memberjunction/predictive-studio-core';
import type { RegistryContext } from '../registry/registry-context';

/** The binding columns the sweep reads. */
export type RetentionBindingRow = Pick<MJMLModelScoringBindingEntity, 'ID' | 'FeatureName' | 'Status' | 'RetentionDays'>;

/** A binding without a view authorization, as the backfill sees it: its ID and the step that assigns one. */
export interface UnauthorizedBinding {
  /** The binding's ID. */
  readonly ID: string;
  /**
   * Sets the binding's `ViewAuthorizationID` to `authorizationId` and saves it.
   *
   * @returns null when saved, else the save's message
   */
  Assign(authorizationId: string): Promise<string | null>;
}

/** One row whose delete failed. */
export interface RetentionDeleteFailure {
  /** The Feature Value's ID. */
  readonly ID: string;
  /** Why the delete failed. */
  readonly Message: string;
}

/** What one batch delete did. */
export interface RetentionBatchOutcome {
  /** Rows the batch read (at most the batch size). */
  readonly Read: number;
  /** Rows deleted. */
  readonly Deleted: number;
  /** Rows whose delete failed. */
  readonly Failures: readonly RetentionDeleteFailure[];
}

/** The reads and writes of the prediction maintenance, so the rules are testable with no database. */
export interface IPredictionRetentionStore {
  /** Every binding with a non-null `RetentionDays`, whatever its status. */
  ReadRetainedBindings(): Promise<RetentionBindingRow[]>;
  /** Every binding whose `ViewAuthorizationID` is null. */
  ReadBindingsWithoutViewAuthorization(): Promise<UnauthorizedBinding[]>;
  /**
   * Deletes, oldest first, at most `max` of the binding's `Source = 'Model'` rows whose `EffectiveAsOf` is before
   * `before`, one `BaseEntity.Delete()` each, skipping the rows in `skipIDs` (those whose delete already failed this
   * run, so a row that keeps failing is neither retried nor allowed to fill every later batch).
   */
  DeleteExpiredModelRows(bindingId: string, before: Date, max: number, skipIDs: readonly string[]): Promise<RetentionBatchOutcome>;
}

/** What the backfill did. */
export interface BackfillOutcome {
  /** Bindings given the seeded authorization. */
  readonly Updated: number;
  /** Bindings whose save failed, each `<id>: <message>`. */
  readonly Failures: readonly string[];
  /** False when the seeded authorization is not in the provider's metadata yet: nothing was changed. */
  readonly AuthorizationLoaded: boolean;
}

/** What the sweep did to one binding. */
export interface BindingSweepOutcome {
  /** The binding's ID. */
  readonly BindingID: string;
  /** Its feature name. */
  readonly FeatureName: string;
  /** Its status when swept. */
  readonly Status: MJMLModelScoringBindingEntity['Status'];
  /** Its `RetentionDays`. */
  readonly RetentionDays: number;
  /** The first kept instant: rows with an earlier `EffectiveAsOf` were deleted (ISO text). */
  readonly Cutoff: string;
  /** Rows deleted. */
  readonly Deleted: number;
  /** Deletes that failed, each `<id>: <message>`. */
  readonly Failures: readonly string[];
}

/**
 * The context of one maintenance run: the metadata the seeded authorization is looked up in (the run's provider) and
 * the store every read and write goes through. {@link PredictionRetention.ContextOf} builds the production one.
 */
export interface PredictionRetentionContext {
  /** The metadata the seeded authorization is looked up in by name. */
  readonly Authorizations: Pick<IMetadataProvider, 'Authorizations'>;
  /** The store every read and write goes through. */
  readonly Store: IPredictionRetentionStore;
  /**
   * Renews the scheduled job's lease (§4: scheduled work heartbeats for its whole duration); called once per binding
   * and once per batch. Self-throttling and never throws (`ScheduledJobExecutionContext.heartbeat`).
   */
  readonly Heartbeat: () => Promise<void>;
}

/** The binding backfill and the retention sweep. */
export class PredictionRetention {
  /** Rows one sweep batch deletes at most (§5.8.7). */
  public static readonly BatchSize = 1000;

  /**
   * Gives every binding whose `ViewAuthorizationID` is null the seeded {@link PredictionViewAuthorization.DefaultName}
   * authorization, looked up by name in the run provider's metadata (`ctx.Authorizations`). Idempotent: a second run finds no such binding.
   * When the authorization is not loaded yet (it arrives by `mj sync push`, after the migration, D4-25) nothing
   * changes and nothing is raised; the next run retries.
   *
   * @returns the number of bindings updated
   */
  public static async BackfillBindingViewAuthorization(ctx: PredictionRetentionContext): Promise<number> {
    return (await PredictionRetention.Backfill(ctx)).Updated;
  }

  /**
   * The backfill with its failures: {@link BackfillBindingViewAuthorization}, reporting each binding whose save failed
   * (logged, not thrown, so one bad binding does not strand the rest) and whether the authorization was loaded.
   */
  public static async Backfill(ctx: PredictionRetentionContext): Promise<BackfillOutcome> {
    const authorizationId = PredictionRetention.SeededAuthorizationID(ctx.Authorizations);
    if (authorizationId === null) return { Updated: 0, Failures: [], AuthorizationLoaded: false };
    const store = ctx.Store;
    let updated = 0;
    const failures: string[] = [];
    for (const binding of await store.ReadBindingsWithoutViewAuthorization()) {
      const refusal = await binding.Assign(authorizationId);
      if (refusal === null) {
        updated++;
      } else {
        failures.push(`${binding.ID}: ${refusal}`);
        LogError(`PredictionRetention: assigning the view authorization to scoring binding ${binding.ID} failed: ${refusal}`);
      }
    }
    return { Updated: updated, Failures: failures, AuthorizationLoaded: true };
  }

  /**
   * Deletes the binding's `Model` rows older than its `RetentionDays` before `sweepDate`, in batches of
   * {@link PredictionRetention.BatchSize}, until a batch reads fewer rows than that. A row whose delete fails is
   * skipped by every later batch, so each batch reads only rows not yet tried: the sweep always ends, reports each
   * failure once and still reaches the rows behind a failing one. A binding with a null `RetentionDays` keeps every row.
   *
   * @returns what was deleted, or null when the binding keeps all of its history
   */
  public static async SweepBinding(binding: RetentionBindingRow, sweepDate: Date, ctx: PredictionRetentionContext): Promise<BindingSweepOutcome | null> {
    if (binding.RetentionDays === null) return null;
    const cutoff = PredictionRetention.Cutoff(sweepDate, binding.RetentionDays);
    let deleted = 0;
    const failedIDs: string[] = [];
    const failures: string[] = [];
    for (;;) {
      await ctx.Heartbeat();
      const batch = await ctx.Store.DeleteExpiredModelRows(binding.ID, cutoff, PredictionRetention.BatchSize, failedIDs);
      deleted += batch.Deleted;
      for (const f of batch.Failures) {
        failedIDs.push(f.ID);
        failures.push(`${f.ID}: ${f.Message}`);
      }
      if (batch.Read < PredictionRetention.BatchSize) break;
    }
    return {
      BindingID: binding.ID, FeatureName: binding.FeatureName, Status: binding.Status, RetentionDays: binding.RetentionDays,
      Cutoff: cutoff.toISOString(), Deleted: deleted, Failures: failures,
    };
  }

  /**
   * The first kept instant: UTC midnight of `sweepDate`'s day minus `retentionDays` days. A row whose `EffectiveAsOf`
   * is that instant — exactly `retentionDays` old on the sweep date — stays; an earlier one is deleted. Pure.
   */
  public static Cutoff(sweepDate: Date, retentionDays: number): Date {
    const day = UtcDay.ToUtcDay(sweepDate);
    if (day === null) throw new Error(`PredictionRetention.Cutoff: the sweep date ${String(sweepDate)} is not a valid date`);
    return UtcDay.AddUtcDays(day, -retentionDays);
  }

  /**
   * The `ExtraFilter` of one batch read: the binding's `Source = 'Model'` rows with an `EffectiveAsOf` before
   * `before` (a strict comparison: the cutoff instant itself is kept), less the rows in `skipIDs`. Pure.
   */
  public static ExpiredFilter(bindingId: string, before: Date, skipIDs: readonly string[] = []): string {
    const filter = `MLModelScoringBindingID = '${EscapeSQLString(bindingId)}' AND Source = 'Model' AND EffectiveAsOf < '${before.toISOString()}'`;
    if (skipIDs.length === 0) return filter;
    return `${filter} AND ID NOT IN (${skipIDs.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`;
  }

  /** The seeded authorization's ID in the provider's metadata (trimmed, case-insensitive name), or null when absent. */
  public static SeededAuthorizationID(provider: Pick<IMetadataProvider, 'Authorizations'>): string | null {
    const seeded = PredictionViewAuthorization.FindDefault(provider.Authorizations);
    return seeded ? seeded.ID : null;
  }

  /** Deletes one batch runs at once: bounded so a 1,000-row batch does not open 1,000 connections. */
  public static readonly DeleteConcurrency = 20;

  /**
   * The production context of a run: the provider's metadata and the store over that provider, as the run's user,
   * renewing the job lease with `heartbeat`.
   */
  public static ContextOf(ctx: RegistryContext, heartbeat: () => Promise<void>): PredictionRetentionContext {
    return { Authorizations: ctx.Provider, Store: new ProviderPredictionRetentionStore(ctx.Provider, ctx.ContextUser), Heartbeat: heartbeat };
  }
}

/** The production store: `RunView` reads on the provider as the user, entity saves and deletes. */
export class ProviderPredictionRetentionStore implements IPredictionRetentionStore {
  /** @param provider the provider every read and write uses @param user the user they run as */
  constructor(private readonly provider: IMetadataProvider, private readonly user: UserInfo) {}

  /** @inheritdoc */
  public async ReadRetainedBindings(): Promise<RetentionBindingRow[]> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<RetentionBindingRow>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: 'RetentionDays IS NOT NULL',
      Fields: ['ID', 'FeatureName', 'Status', 'RetentionDays'], OrderBy: 'ID', ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true,
    }, this.user);
    if (!r.Success) throw new Error(`PredictionRetention: reading the scoring bindings with a retention failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** @inheritdoc */
  public async ReadBindingsWithoutViewAuthorization(): Promise<UnauthorizedBinding[]> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<MJMLModelScoringBindingEntity>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: 'ViewAuthorizationID IS NULL', OrderBy: 'ID',
      ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true,
    }, this.user);
    if (!r.Success) throw new Error(`PredictionRetention: reading the scoring bindings without a view authorization failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.map((binding) => ({
      ID: binding.ID,
      Assign: async (authorizationId: string): Promise<string | null> => {
        binding.ViewAuthorizationID = authorizationId;
        return (await binding.Save()) ? null : binding.LatestResult?.CompleteMessage || 'Save() returned false';
      },
    }));
  }

  /** @inheritdoc */
  public async DeleteExpiredModelRows(bindingId: string, before: Date, max: number, skipIDs: readonly string[]): Promise<RetentionBatchOutcome> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<MJFeatureValueEntity>({
      EntityName: 'MJ: Feature Values', ExtraFilter: PredictionRetention.ExpiredFilter(bindingId, before, skipIDs),
      OrderBy: 'EffectiveAsOf ASC, ID ASC', MaxRows: max, ResultType: 'entity_object', BypassCache: true,
    }, this.user);
    if (!r.Success) throw new Error(`PredictionRetention: reading binding ${bindingId}'s expired predictions failed: ${r.ErrorMessage || 'unknown error'}`);
    const failures: RetentionDeleteFailure[] = [];
    for (let i = 0; i < r.Results.length; i += PredictionRetention.DeleteConcurrency) {
      const chunk = r.Results.slice(i, i + PredictionRetention.DeleteConcurrency);
      const refusals = await Promise.all(chunk.map((row) => this.deleteRow(row, bindingId)));
      for (const refusal of refusals) if (refusal !== null) failures.push(refusal);
    }
    return { Read: r.Results.length, Deleted: r.Results.length - failures.length, Failures: failures };
  }

  /** Deletes one row: null when deleted, else the failure (logged). */
  private async deleteRow(row: MJFeatureValueEntity, bindingId: string): Promise<RetentionDeleteFailure | null> {
    if (await row.Delete()) return null;
    const message = row.LatestResult?.CompleteMessage || 'Delete() returned false';
    LogError(`PredictionRetention: deleting prediction ${row.ID} of scoring binding ${bindingId} failed: ${message}`);
    return { ID: row.ID, Message: message };
  }
}
