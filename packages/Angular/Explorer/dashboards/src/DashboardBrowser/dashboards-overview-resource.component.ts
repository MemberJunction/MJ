import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { merge } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { DashboardEngine, MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent, DashboardFavoritesService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { BoundNameList, type AgentToolResult } from '../shared/agent-tool-validation';
import { CreateBlankDashboard, DASHBOARDS_BROWSE_NAV_ITEM, DashboardsAppOpenOptions, FindDashboardsApp } from '../shared/dashboards-app.helpers';
import { ObserveDashboardLibraryChanges } from '../shared/dashboard-library-changes';
import { GetRecentDashboardIds, ObserveRecentDashboardChanges } from '../shared/dashboard-recents';
import { IsBrowsableDashboard } from './dashboard-library-filter';
import { BuildOpenDashboardTool, DashboardsAgentClientTool } from './dashboards-agent-tools';
import { CategoryPath, ContinueDashboards, FavoriteDashboards, NewestFirst, SharedWithMe } from './dashboards-overview.helpers';

/** How many recently opened dashboards the Continue section shows. */
const CONTINUE_CARD_COUNT = 3;

/**
 * Overview page of the Dashboards app: Continue (the dashboards the user opened last), Favorites,
 * Shared with you, Browse all and New dashboard. The lists hold the Config dashboards the user can
 * open, as Browse does. A dashboard opens in a tab of the Dashboards app, in place of the preview tab
 * (Back returns to this page; a Shift-click opens a separate tab). The agent tools are read-only; see
 * the SAFETY BOUNDARY in the agent section below.
 */
@RegisterClass(BaseResourceComponent, 'DashboardsOverviewResource')
@Component({
  standalone: false,
  selector: 'mj-dashboards-overview-resource',
  templateUrl: './dashboards-overview-resource.component.html',
  styleUrls: ['./dashboards-overview-resource.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardsOverviewResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private favoritesService = inject(DashboardFavoritesService);
  private appManager = inject(ApplicationManager);
  private notifications = inject(MJNotificationService);

  /** True until the dashboards have loaded. */
  public IsLoading = true;

  /** True while a new dashboard is being created. */
  public IsCreating = false;

  /** The dashboards the user opened last, the most recent first. */
  public ContinueList: MJDashboardEntity[] = [];

  /** The user's favorite dashboards, the newest favorite first. */
  public Favorites: MJDashboardEntity[] = [];

  /** Dashboards other people shared with the user, the most recently updated first. */
  public Shared: MJDashboardEntity[] = [];

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    // Favorites, recents and the dashboard cache also change while Overview is a background tab, so
    // these only refresh the view. Agent context is reported for user and agent actions on this page.
    merge(this.favoritesService.Changed$, ObserveRecentDashboardChanges(), ObserveDashboardLibraryChanges())
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.onListSourcesChanged());
    this.navigationService.SetAgentClientTools(this, this.buildAgentTools());
    void this.load();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Overview';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }

  /** True when the dashboard is one of the user's favorites. */
  public IsFavorite(dashboard: MJDashboardEntity): boolean {
    return this.favoritesService.IsFavorite(dashboard.ID);
  }

  /** The dashboard's category path, or "Uncategorized". */
  public CategoryLabel(dashboard: MJDashboardEntity): string {
    return CategoryPath(dashboard.CategoryID, DashboardEngine.Instance.DashboardCategories) ?? 'Uncategorized';
  }

  /** Opens the dashboard in a tab of the Dashboards app (see DashboardsAppOpenOptions). */
  public Open(dashboard: MJDashboardEntity): void {
    this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, DashboardsAppOpenOptions(this.appManager));
  }

  /** Stars or unstars the dashboard, then reports the new favorites to the agent. */
  public async ToggleFavorite(dashboard: MJDashboardEntity): Promise<void> {
    try {
      const isFavorite = await this.favoritesService.Toggle(dashboard.ID);
      const message = isFavorite ? `Added "${dashboard.Name}" to favorites` : `Removed "${dashboard.Name}" from favorites`;
      this.notifications.CreateSimpleNotification(message, 'success', 2000);
      this.emitAgentContext();
    } catch (error) {
      LogError(`Dashboards Overview: could not change the favorite: ${errorMessage(error)}`);
      this.notifications.CreateSimpleNotification('Could not change the favorite', 'error', 3000);
    }
  }

  /** Goes to the Browse page of the Dashboards app. */
  public async BrowseAll(): Promise<void> {
    await this.goToBrowse();
  }

  /** Creates an empty dashboard and opens it in edit mode, in a tab of the Dashboards app. */
  public async NewDashboard(): Promise<void> {
    if (this.IsCreating) {
      return;
    }
    this.IsCreating = true;
    this.cdr.detectChanges();
    try {
      const dashboard = await CreateBlankDashboard(this.ProviderToUse);
      if (!dashboard) {
        this.notifications.CreateSimpleNotification('Could not create the dashboard', 'error', 3000);
        return;
      }
      await this.reloadDashboardCache();
      this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, DashboardsAppOpenOptions(this.appManager, true));
    } catch (error) {
      LogError(`Dashboards Overview: could not open the new dashboard: ${errorMessage(error)}`);
      this.notifications.CreateSimpleNotification('Could not open the new dashboard', 'error', 3000);
    } finally {
      this.IsCreating = false;
      this.cdr.detectChanges();
    }
  }

  private async load(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(false);
      this.refreshLists();
    } catch (error) {
      LogError(`Dashboards Overview: could not load the dashboards: ${errorMessage(error)}`);
    } finally {
      this.IsLoading = false;
      this.emitAgentContext();
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private onListSourcesChanged(): void {
    this.refreshLists();
    this.cdr.detectChanges();
  }

  /**
   * Recomputes the three lists from the dashboard cache, the favorites and the recents. Recents are
   * read without a limit, then narrowed to the listed dashboards, so dashboards the user can no
   * longer open do not take Continue places.
   */
  private refreshLists(): void {
    const dashboards = NewestFirst(this.accessibleDashboards().filter(IsBrowsableDashboard));
    this.ContinueList = ContinueDashboards(dashboards, GetRecentDashboardIds(this.ProviderToUse), CONTINUE_CARD_COUNT);
    this.Favorites = FavoriteDashboards(dashboards, this.favoritesService.FavoriteIds());
    this.Shared = SharedWithMe(dashboards, this.ProviderToUse.CurrentUser.ID);
  }

  /** Every dashboard the user can open, of any type. */
  private accessibleDashboards(): MJDashboardEntity[] {
    return DashboardEngine.Instance.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID);
  }

  private async goToBrowse(): Promise<AgentToolResult> {
    const app = FindDashboardsApp(this.appManager);
    if (!app) {
      this.notifications.CreateSimpleNotification('The Dashboards app is not available', 'error', 3000);
      return { Success: false, ErrorMessage: 'The Dashboards app is not available to this user.' };
    }
    try {
      await this.navigationService.SwitchToApp(app.ID, DASHBOARDS_BROWSE_NAV_ITEM);
      return { Success: true };
    } catch (error) {
      LogError(`Dashboards Overview: could not open Browse: ${errorMessage(error)}`);
      return { Success: false, ErrorMessage: errorMessage(error) };
    }
  }

  /**
   * Reloads the dashboard cache from the server before the new dashboard's tab opens. The tab reads the
   * dashboard from this cache, and the cache adds a saved dashboard by itself only after an
   * asynchronous copy. A failure is only logged.
   */
  private async reloadDashboardCache(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(true);
    } catch (error) {
      LogError(`Dashboards Overview: could not reload the dashboards: ${errorMessage(error)}`);
    }
  }

  // ========================================
  // Agent Context & Client Tools
  //
  // 🔒 SAFETY BOUNDARY: the Overview exposes ONLY read-only / navigational
  // tools to the AI agent: OpenDashboard (opens the dashboard)
  // and BrowseAllDashboards (goes to the Browse page).
  //
  // Mutating operations — create / delete / save / share / move a dashboard,
  // add or remove a favorite — are intentionally NOT exposed. The agent helps
  // the user find and open dashboards; the user performs every mutation from
  // the UI (New dashboard, the star on a card). Do NOT add a mutating tool here
  // without revisiting this boundary.
  // ========================================

  private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      IsLoading: this.IsLoading,
      ContinueCount: this.ContinueList.length,
      ContinueNames: this.ContinueList.map(d => d.Name),
      FavoriteCount: this.Favorites.length,
      FavoriteNames: BoundNameList(this.Favorites.map(d => d.Name)),
      SharedCount: this.Shared.length,
      SharedNames: BoundNameList(this.Shared.map(d => d.Name)),
    });
  }

  private buildAgentTools(): DashboardsAgentClientTool[] {
    return [
      BuildOpenDashboardTool(() => this.accessibleDashboards(), dashboard => this.Open(dashboard)),
      {
        Name: 'BrowseAllDashboards',
        Description: 'Go to the Browse page of the Dashboards app, which lists every dashboard the user can open, by category.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async (): Promise<AgentToolResult> => this.goToBrowse(),
      },
    ];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LoadDashboardsOverviewResource(): void {
  // Prevents tree-shaking of the component and its @RegisterClass registration.
}
