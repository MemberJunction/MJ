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
import { DEFAULT_VIEW_AUTHORIZATION_NAME, FindDefaultViewAuthorization, UtcDay } from '@memberjunction/predictive-studio-core';
import type { RegistryContext } from '../registry/registry-context';

/** Rows one sweep batch deletes at most (§5.8.7). */
export const PREDICTION_RETENTION_BATCH_SIZE = 1000;

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

/** What one batch delete did. */
export interface RetentionBatchOutcome {
  /** Rows the batch read (at most the batch size). */
  readonly Read: number;
  /** Rows deleted. */
  readonly Deleted: number;
  /** Rows whose delete failed, each `<id>: <message>`. */
  readonly Failures: readonly string[];
}

/** The reads and writes of the prediction maintenance, so the rules are testable with no database. */
export interface IPredictionRetentionStore {
  /** Every binding with a non-null `RetentionDays`, whatever its status. */
  ReadRetainedBindings(): Promise<RetentionBindingRow[]>;
  /** Every binding whose `ViewAuthorizationID` is null. */
  ReadBindingsWithoutViewAuthorization(): Promise<UnauthorizedBinding[]>;
  /**
   * Deletes, oldest first, at most `max` of the binding's `Source = 'Model'` rows whose `EffectiveAsOf` is before
   * `before`, one `BaseEntity.Delete()` each.
   */
  DeleteExpiredModelRows(bindingId: string, before: Date, max: number): Promise<RetentionBatchOutcome>;
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
}

/** The binding backfill and the retention sweep. */
export class PredictionRetention {
  /**
   * Gives every binding whose `ViewAuthorizationID` is null the seeded {@link DEFAULT_VIEW_AUTHORIZATION_NAME}
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
   * {@link PREDICTION_RETENTION_BATCH_SIZE}, until a batch reads fewer rows than that or deletes none (so a row that
   * cannot be deleted never loops the sweep). A binding with a null `RetentionDays` keeps every row.
   *
   * @returns what was deleted, or null when the binding keeps all of its history
   */
  public static async SweepBinding(binding: RetentionBindingRow, sweepDate: Date, ctx: PredictionRetentionContext): Promise<BindingSweepOutcome | null> {
    if (binding.RetentionDays === null) return null;
    const cutoff = PredictionRetention.Cutoff(sweepDate, binding.RetentionDays);
    const store = ctx.Store;
    let deleted = 0;
    const failures: string[] = [];
    for (;;) {
      const batch = await store.DeleteExpiredModelRows(binding.ID, cutoff, PREDICTION_RETENTION_BATCH_SIZE);
      deleted += batch.Deleted;
      failures.push(...batch.Failures);
      if (batch.Read < PREDICTION_RETENTION_BATCH_SIZE || batch.Deleted === 0) break;
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
   * `before` (a strict comparison: the cutoff instant itself is kept). Pure.
   */
  public static ExpiredFilter(bindingId: string, before: Date): string {
    return `MLModelScoringBindingID = '${EscapeSQLString(bindingId)}' AND Source = 'Model' AND EffectiveAsOf < '${before.toISOString()}'`;
  }

  /** The seeded authorization's ID in the provider's metadata (trimmed, case-insensitive name), or null when absent. */
  public static SeededAuthorizationID(provider: Pick<IMetadataProvider, 'Authorizations'>): string | null {
    const seeded = FindDefaultViewAuthorization(provider.Authorizations);
    return seeded ? seeded.ID : null;
  }

  /** The production context of a run: the provider's metadata and the store over that provider, as the run's user. */
  public static ContextOf(ctx: RegistryContext): PredictionRetentionContext {
    return { Authorizations: ctx.Provider, Store: new ProviderPredictionRetentionStore(ctx.Provider, ctx.ContextUser) };
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
    if (!r.Success) throw new Error(`PredictionRetention: reading the scoring bindings with a retention failed: ${r.ErrorMessage}`);
    return r.Results;
  }

  /** @inheritdoc */
  public async ReadBindingsWithoutViewAuthorization(): Promise<UnauthorizedBinding[]> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<MJMLModelScoringBindingEntity>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: 'ViewAuthorizationID IS NULL', OrderBy: 'ID',
      ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true,
    }, this.user);
    if (!r.Success) throw new Error(`PredictionRetention: reading the scoring bindings without a view authorization failed: ${r.ErrorMessage}`);
    return r.Results.map((binding) => ({
      ID: binding.ID,
      Assign: async (authorizationId: string): Promise<string | null> => {
        binding.ViewAuthorizationID = authorizationId;
        return (await binding.Save()) ? null : binding.LatestResult?.CompleteMessage || 'Save() returned false';
      },
    }));
  }

  /** @inheritdoc */
  public async DeleteExpiredModelRows(bindingId: string, before: Date, max: number): Promise<RetentionBatchOutcome> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<MJFeatureValueEntity>({
      EntityName: 'MJ: Feature Values', ExtraFilter: PredictionRetention.ExpiredFilter(bindingId, before),
      OrderBy: 'EffectiveAsOf ASC, ID ASC', MaxRows: max, ResultType: 'entity_object', BypassCache: true,
    }, this.user);
    if (!r.Success) throw new Error(`PredictionRetention: reading binding ${bindingId}'s expired predictions failed: ${r.ErrorMessage}`);
    let deleted = 0;
    const failures: string[] = [];
    for (const row of r.Results) {
      if (await row.Delete()) {
        deleted++;
      } else {
        const message = row.LatestResult?.CompleteMessage || 'Delete() returned false';
        failures.push(`${row.ID}: ${message}`);
        LogError(`PredictionRetention: deleting prediction ${row.ID} of scoring binding ${bindingId} failed: ${message}`);
      }
    }
    return { Read: r.Results.length, Deleted: deleted, Failures: failures };
  }
}
