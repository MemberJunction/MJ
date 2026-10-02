import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { DashboardEngine, MJDashboardEntity, MJDashboardUserPreferenceEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import {
  HomeTabChange,
  HomeTabChangePlan,
  PlanHomeTabChange,
  ResolveHomeTabDashboards,
  SelectHomeTabPreferences
} from './home-dashboard-tabs';

/**
 * UserInfoEngine setting that marks a user whose Home tabs no longer follow the system defaults.
 * The value is 'true' when set.
 */
export const HOME_TABS_CUSTOMIZED_SETTING_KEY = 'Dashboards.HomeTabs.Customized';

/**
 * The dashboards a user shows as tabs on Home: MJ: Dashboard User Preferences with Scope Global.
 * A user sees their own rows when they have any or when they are marked customized; otherwise
 * they see the system defaults.
 * Reads come from the DashboardEngine and UserInfoEngine caches; writes save preference rows,
 * set the customized marker, and reload the dashboard engine.
 *
 * Multi-provider note: callers under a non-default provider set `service.Provider` before
 * calling any method.
 */
@Injectable({ providedIn: 'root' })
export class HomeDashboardTabsService {
  /** Emits after the tab list changes. */
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

  /** The Home tab dashboards in display order. Only Config dashboards the user can read. */
  public Tabs(): MJDashboardEntity[] {
    const engine = this.dashboardEngine;
    const userId = this.Provider.CurrentUser?.ID;
    if (!userId || engine.IsPermissionConstrained) return [];
    const prefs = SelectHomeTabPreferences(engine.DashboardUserPreferences, userId, this.isCustomized());
    return ResolveHomeTabDashboards(prefs, engine.Dashboards, id => engine.CanUserReadDashboard(id, userId));
  }

  public HasTab(dashboardId: string): boolean {
    return this.Tabs().some(d => UUIDsEqual(d.ID, dashboardId));
  }

  /**
   * Adds the dashboard as the last Home tab. When the user sees the system defaults, the defaults
   * are first copied into the user's own list. Does nothing when the dashboard is already in the list.
   */
  public async Add(dashboardId: string): Promise<void> {
    await this.queueWrite(() => this.applyChange({ Action: 'Add', DashboardID: dashboardId }));
  }

  /**
   * Removes the dashboard from the user's Home tabs. When the user sees the system defaults, the
   * other defaults are first copied into the user's own list. The list then stays the user's own,
   * so removing the last tab leaves no tabs. Does nothing when the dashboard is not in the list.
   */
  public async Remove(dashboardId: string): Promise<void> {
    await this.queueWrite(() => this.applyChange({ Action: 'Remove', DashboardID: dashboardId }));
  }

  /**
   * Marks the user's Home tabs as customized, so the system defaults stop showing even when the
   * user has no rows. For callers that save the user's rows themselves. Emits Changed$ when the
   * marker is new.
   */
  public async MarkCustomized(): Promise<void> {
    await this.queueWrite(async () => {
      if (await this.saveCustomizedMarker()) this.Changed$.next();
    });
  }

  /** Reloads the dashboard cache from the server, then emits Changed$. */
  public async Reload(): Promise<void> {
    const provider = this.Provider;
    await this.dashboardEngine.Config(true, provider.CurrentUser, provider);
    this.Changed$.next();
  }

  /** Runs writes one at a time, so each write reads the state that the previous write left. */
  private queueWrite(write: () => Promise<void>): Promise<void> {
    const run = this.writeQueue.then(write);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async applyChange(change: HomeTabChange): Promise<void> {
    const provider = this.Provider;
    const user = provider.CurrentUser;
    const prefs = this.dashboardEngine.DashboardUserPreferences;
    const plan = PlanHomeTabChange(prefs, user.ID, change, this.isCustomized());
    if (!plan) return;
    try {
      await this.writePlan(plan, provider, user);
      if (plan.MarkCustomized) await this.saveCustomizedMarker();
    } finally {
      await this.Reload();
    }
  }

  private async writePlan(
    plan: HomeTabChangePlan<MJDashboardUserPreferenceEntity>,
    provider: IMetadataProvider,
    user: UserInfo
  ): Promise<void> {
    for (const row of plan.Delete) {
      if (!(await row.Delete())) {
        throw new Error(row.LatestResult?.CompleteMessage || 'Could not remove the Home tab');
      }
    }
    for (const step of plan.Reorder) {
      step.Row.DisplayOrder = step.DisplayOrder;
      if (!(await step.Row.Save())) {
        step.Row.Revert();
        throw new Error(step.Row.LatestResult?.CompleteMessage || 'Could not reorder the Home tabs');
      }
    }
    for (const item of plan.Create) {
      await this.createRow(item.DashboardID, item.DisplayOrder, provider, user);
    }
  }

  private async createRow(dashboardId: string, displayOrder: number, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const row = await provider.GetEntityObject<MJDashboardUserPreferenceEntity>('MJ: Dashboard User Preferences', user);
    row.UserID = user.ID;
    row.DashboardID = dashboardId;
    row.Scope = 'Global';
    row.ApplicationID = null;
    row.DisplayOrder = displayOrder;
    if (!(await row.Save())) {
      throw new Error(row.LatestResult?.CompleteMessage || 'Could not save the Home tab');
    }
  }

  /** Saves the customized marker when it is not set yet. Returns true when it saved the marker. */
  private async saveCustomizedMarker(): Promise<boolean> {
    if (this.isCustomized()) return false;
    const saved = await this.userInfoEngine.SetSetting(HOME_TABS_CUSTOMIZED_SETTING_KEY, 'true', this.Provider.CurrentUser);
    if (!saved) throw new Error('Could not save the Home tabs setting');
    return true;
  }

  /** True when the user is marked customized. False when the settings cache cannot be read. */
  private isCustomized(): boolean {
    const engine = this.userInfoEngine;
    return !engine.IsPermissionConstrained && engine.GetSetting(HOME_TABS_CUSTOMIZED_SETTING_KEY) === 'true';
  }

  /** The DashboardEngine for an explicitly set provider, else the global instance. */
  private get dashboardEngine(): DashboardEngine {
    return this._provider
      ? DashboardEngine.GetProviderInstance<DashboardEngine>(this._provider, DashboardEngine) as DashboardEngine
      : DashboardEngine.Instance;
  }

  /** The UserInfoEngine for an explicitly set provider, else the global instance. */
  private get userInfoEngine(): UserInfoEngine {
    return this._provider
      ? UserInfoEngine.GetProviderInstance<UserInfoEngine>(this._provider, UserInfoEngine) as UserInfoEngine
      : UserInfoEngine.Instance;
  }
}
