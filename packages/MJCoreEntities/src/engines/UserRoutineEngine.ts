import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  RunView,
  UserInfo,
} from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Observable } from 'rxjs';

import {
  MJUserRoutineEntity,
  MJUserRoutineRecipientEntity,
  MJUserRoutineRunEntity,
} from '../generated/entity_subclasses';

/**
 * Placeholder filter used when the current user has no routines yet — keeps the
 * dependent (recipients / runs) configs valid SQL while returning zero rows.
 */
const NO_ROUTINES_FILTER = `RoutineID='00000000-0000-0000-0000-000000000000'`;

/** Client-side cap applied by the {@link UserRoutineEngine.RecentRuns} getter. */
const RECENT_RUNS_CAP = 500;

/**
 * UserRoutineEngine provides centralized, cached access to the current user's
 * User Routines ("MJ: User Routines"), their notification recipients, and their
 * recent runs. It is the single data source the User Routines UI widgets consume —
 * components should NOT issue ad-hoc RunViews for data this engine already caches.
 *
 * Unlike {@link UserInfoEngine} this engine is NOT auto-configured at startup —
 * routines are a lazily-entered surface, so every consumer calls
 * `await UserRoutineEngine.Instance.Config(false, user, provider)` on entry
 * (a no-op once loaded).
 *
 * Per-user scoping follows the UserInfoEngine convention: on the client
 * (Network provider) the configs carry a per-user Filter so only the current
 * user's rows are transferred; on the server everything is loaded (one process
 * serves many users) and the public getters filter by the loaded user.
 *
 * Recipients and runs have no UserID column — they hang off UserRoutine via
 * RoutineID — so on the client their config Filter is a `RoutineID IN (...)`
 * list computed from the user's routine IDs at Config time. That filter is a
 * snapshot: after CREATING or DELETING a routine, call {@link Refresh} so the
 * dependent configs re-scope to the new routine set.
 *
 * Usage:
 * ```typescript
 * const engine = UserRoutineEngine.Instance;
 * await engine.Config(false, currentUser, provider);
 * const routines = engine.Routines;             // current user's routines
 * const runs = engine.RunsForRoutine(routineId); // most recent first
 * engine.Routines$.subscribe(r => ...);          // reactive updates
 * ```
 */
export class UserRoutineEngine extends BaseEngine<UserRoutineEngine> {
  /**
   * Returns the global instance of the class. This is a singleton class, so there is
   * only one instance of it in the application. Do not directly create new instances
   * of it, always use this method (or `GetProviderInstance` for non-default providers).
   */
  public static get Instance(): UserRoutineEngine {
    return super.getInstance<UserRoutineEngine>();
  }

  // Private storage for entity data (populated by BaseEngine.Load via Configs)
  private _Routines: MJUserRoutineEntity[] = [];
  private _Recipients: MJUserRoutineRecipientEntity[] = [];
  private _Runs: MJUserRoutineRunEntity[] = [];

  // Track the user ID we loaded data for
  private _loadedForUserId: string | null = null;

  /**
   * Configures the engine by loading the current user's routines, recipients, and runs.
   *
   * @param forceRefresh - If true, forces a refresh from the server even if data is cached
   * @param contextUser - The user context (required for server-side, auto-detected on client)
   * @param provider - Optional custom metadata provider
   */
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
    const md = provider ?? this.ProviderToUse;
    const userId = contextUser?.ID || md.CurrentUser?.ID;

    if (!userId) {
      console.warn('UserRoutineEngine: No user context available, skipping configuration');
      return;
    }

    // Force refresh when the user changed (e.g., logout/login)
    if (this._loadedForUserId && this._loadedForUserId !== userId) {
      forceRefresh = true;
    }

    // Client (Network provider): per-user filters so only this user's rows transfer.
    // Server (Database provider): load everything; getters filter per user.
    const isClientSide = md.ProviderType === 'Network';
    const routineFilter = isClientSide ? `UserID='${userId}'` : undefined;
    const dependentFilter = isClientSide
      ? await this.buildDependentFilter(userId, md, contextUser)
      : undefined;

    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: User Routines',
        PropertyName: '_Routines',
        CacheLocal: true,
        Filter: routineFilter,
        OrderBy: 'Name ASC',
      },
      {
        Type: 'entity',
        EntityName: 'MJ: User Routine Recipients',
        PropertyName: '_Recipients',
        CacheLocal: true,
        Filter: dependentFilter,
        OrderBy: 'Sequence ASC',
      },
      {
        Type: 'entity',
        EntityName: 'MJ: User Routine Runs',
        PropertyName: '_Runs',
        CacheLocal: true,
        Filter: dependentFilter,
        OrderBy: 'StartedAt DESC',
      },
    ];

    await super.Load(configs, provider, forceRefresh, contextUser);
    this._loadedForUserId = userId;
  }

  /**
   * Builds the client-side `RoutineID IN (...)` filter for the recipient/run configs
   * from the user's current routine IDs (lightweight ID-only query).
   */
  private async buildDependentFilter(
    userId: string,
    provider: IMetadataProvider,
    contextUser?: UserInfo,
  ): Promise<string> {
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const result = await rv.RunView<{ ID: string }>(
        {
          EntityName: 'MJ: User Routines',
          ExtraFilter: `UserID='${userId}'`,
          Fields: ['ID'],
          ResultType: 'simple',
        },
        contextUser,
      );
      const ids = result.Success ? (result.Results ?? []).map((r) => `'${r.ID}'`) : [];
      return ids.length > 0 ? `RoutineID IN (${ids.join(',')})` : NO_ROUTINES_FILTER;
    } catch {
      return NO_ROUTINES_FILTER;
    }
  }

  // ========================================================================
  // OBSERVABLE ACCESSORS
  // ========================================================================

  /**
   * Observable stream of the routines cache. Emits the current (raw/unfiltered) array on
   * subscribe and re-emits on save / delete / remote-invalidate / refresh. Consumers that
   * need the per-user view should read the {@link Routines} getter inside the subscription.
   */
  public get Routines$(): Observable<MJUserRoutineEntity[]> {
    return this.ObserveProperty<MJUserRoutineEntity>('_Routines');
  }

  /** Observable stream of the recipients cache (raw). */
  public get Recipients$(): Observable<MJUserRoutineRecipientEntity[]> {
    return this.ObserveProperty<MJUserRoutineRecipientEntity>('_Recipients');
  }

  /** Observable stream of the runs cache (raw). */
  public get Runs$(): Observable<MJUserRoutineRunEntity[]> {
    return this.ObserveProperty<MJUserRoutineRunEntity>('_Runs');
  }

  // ========================================================================
  // PUBLIC ACCESSORS (per-user filtered)
  // ========================================================================

  /** The loaded user's routines, sorted by name. */
  public get Routines(): MJUserRoutineEntity[] {
    if (!this._loadedForUserId) return [];
    return this.GetConfigData<MJUserRoutineEntity>('_Routines')
      .filter((r) => UUIDsEqual(r.UserID, this._loadedForUserId))
      .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
  }

  /** All recipients across the loaded user's routines. */
  public get Recipients(): MJUserRoutineRecipientEntity[] {
    const routineIds = this.loadedRoutineIdSet();
    return this.GetConfigData<MJUserRoutineRecipientEntity>('_Recipients').filter((r) =>
      routineIds.has(NormalizeUUID(r.RoutineID)),
    );
  }

  /**
   * Recent runs across the loaded user's routines, most recent first (capped at
   * {@link RECENT_RUNS_CAP} rows client-side).
   */
  public get RecentRuns(): MJUserRoutineRunEntity[] {
    const routineIds = this.loadedRoutineIdSet();
    return this.GetConfigData<MJUserRoutineRunEntity>('_Runs')
      .filter((r) => routineIds.has(NormalizeUUID(r.RoutineID)))
      .sort((a, b) => new Date(b.StartedAt).getTime() - new Date(a.StartedAt).getTime())
      .slice(0, RECENT_RUNS_CAP);
  }

  // ========================================================================
  // CONVENIENCE METHODS
  // ========================================================================

  /** A routine by ID (loaded user's routines only). */
  public GetRoutineByID(routineId: string): MJUserRoutineEntity | undefined {
    return this.Routines.find((r) => UUIDsEqual(r.ID, routineId));
  }

  /** Runs for one routine, most recent first. */
  public RunsForRoutine(routineId: string, maxRuns?: number): MJUserRoutineRunEntity[] {
    const runs = this.GetConfigData<MJUserRoutineRunEntity>('_Runs')
      .filter((r) => UUIDsEqual(r.RoutineID, routineId))
      .sort((a, b) => new Date(b.StartedAt).getTime() - new Date(a.StartedAt).getTime());
    return maxRuns != null && maxRuns > 0 ? runs.slice(0, maxRuns) : runs;
  }

  /** Recipients for one routine, in Sequence order. */
  public RecipientsForRoutine(routineId: string): MJUserRoutineRecipientEntity[] {
    return this.GetConfigData<MJUserRoutineRecipientEntity>('_Recipients')
      .filter((r) => UUIDsEqual(r.RoutineID, routineId))
      .sort((a, b) => a.Sequence - b.Sequence);
  }

  /** Routines for an arbitrary user (server-side / admin scenarios; raw cache scan). */
  public GetRoutinesForUser(userId: string): MJUserRoutineEntity[] {
    return (this._Routines || [])
      .filter((r) => UUIDsEqual(r.UserID, userId))
      .sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
  }

  /** The user ID this engine was loaded for. */
  public get LoadedForUserId(): string | null {
    return this._loadedForUserId;
  }

  /**
   * Force-refreshes all cached data. Call after CREATING or DELETING a routine so the
   * dependent recipient/run configs re-scope to the new routine-ID set (their client-side
   * Filter is a snapshot taken at Config time).
   */
  public async Refresh(contextUser?: UserInfo): Promise<void> {
    await this.Config(true, contextUser);
  }

  private loadedRoutineIdSet(): Set<string> {
    return new Set(this.Routines.map((r) => NormalizeUUID(r.ID)));
  }
}
