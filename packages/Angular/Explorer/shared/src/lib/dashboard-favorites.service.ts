import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { CompositeKey, IMetadataProvider, Metadata } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardFavoriteIds } from './dashboard-favorites';

/**
 * Dashboard favorites, stored as MJ: User Favorites rows on the MJ: Dashboards entity.
 * Reads come from the UserInfoEngine cache; writes go through the provider and refresh that cache.
 *
 * Multi-provider note: callers under a non-default provider set `service.Provider` before
 * calling any method.
 */
@Injectable({ providedIn: 'root' })
export class DashboardFavoritesService {
  /** Emits after any favorite changes. */
  public readonly Changed$ = new Subject<void>();

  private _provider: IMetadataProvider | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  /** The provider for reads and writes. Falls back to the global default provider. */
  public get Provider(): IMetadataProvider {
    return this._provider ?? Metadata.Provider;
  }
  public set Provider(value: IMetadataProvider | null) {
    this._provider = value;
  }

  /** Ids of the user's favorite dashboards, newest favorite first. */
  public FavoriteIds(): string[] {
    const engine = this.userInfoEngine;
    if (engine.IsPermissionConstrained) return [];
    return DashboardFavoriteIds(engine.UserFavorites);
  }

  public IsFavorite(dashboardId: string): boolean {
    return this.FavoriteIds().some(id => UUIDsEqual(id, dashboardId));
  }

  /** Adds or removes the favorite, then reloads the favorites cache. Writes run one at a time. */
  public async SetFavorite(dashboardId: string, isFavorite: boolean): Promise<void> {
    await this.queueWrite(() => this.writeFavorite(dashboardId, isFavorite));
  }

  /**
   * Flips the favorite state and returns the new state. The state is read after earlier writes
   * finish, so quick repeated toggles alternate.
   */
  public async Toggle(dashboardId: string): Promise<boolean> {
    return this.queueWrite(async () => {
      const next = !this.IsFavorite(dashboardId);
      await this.writeFavorite(dashboardId, next);
      return next;
    });
  }

  /** Runs writes one at a time, so each write reads the cache that the previous write reloaded. */
  private queueWrite<T>(write: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(write);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async writeFavorite(dashboardId: string, isFavorite: boolean): Promise<void> {
    const provider = this.Provider;
    const user = provider.CurrentUser;
    await provider.SetRecordFavoriteStatus(user.ID, 'MJ: Dashboards', CompositeKey.FromID(dashboardId), isFavorite, user);
    await this.userInfoEngine.Config(true, user, provider);
    this.Changed$.next();
  }

  /** The UserInfoEngine for an explicitly set provider, else the global instance. */
  private get userInfoEngine(): UserInfoEngine {
    return this._provider
      ? UserInfoEngine.GetProviderInstance<UserInfoEngine>(this._provider, UserInfoEngine) as UserInfoEngine
      : UserInfoEngine.Instance;
  }
}
