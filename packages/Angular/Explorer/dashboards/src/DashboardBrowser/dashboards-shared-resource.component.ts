import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntil } from 'rxjs/operators';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { DashboardEngine, DashboardUserPermissions, MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import type { DashboardEditEvent, DashboardOpenEvent } from '@memberjunction/ng-dashboard-viewer';
import { BoundNameList, type AgentToolResult } from '../shared/agent-tool-validation';
import { ObserveDashboardLibraryChanges } from '../shared/dashboard-library-changes';
import { DashboardsAppOpenOptions } from '../shared/dashboards-app.helpers';
import { IsBrowsableDashboard } from './dashboard-library-filter';
import { BuildOpenDashboardTool, DashboardsAgentClientTool } from './dashboards-agent-tools';
import { NewestFirst } from './dashboards-overview.helpers';

/**
 * Shared with me page of the Dashboards app: the Config dashboards other people shared with the
 * user, as one flat list in the generic dashboard browser. The page only opens dashboards, each in a
 * tab of the Dashboards app, in place of the preview tab (Back returns to this page; a Shift-click
 * opens a separate tab). Creating, moving and deleting stay on the Browse page. The agent tools are
 * read-only; see the SAFETY BOUNDARY in the agent section below.
 */
@RegisterClass(BaseResourceComponent, 'DashboardsSharedResource')
@Component({
  standalone: false,
  selector: 'mj-dashboards-shared-resource',
  template: `
    <mj-page-layout>
      <mj-page-header Title="Shared with me" Icon="fa-solid fa-inbox" Subtitle="Dashboards other people shared with you"></mj-page-header>
      <mj-page-body [Flex]="true" [Padding]="false">
        <mj-dashboard-browser
          class="shared-browser"
          [Dashboards]="Dashboards"
          [FlatMode]="true"
          [ViewMode]="'list'"
          [IsLoading]="IsLoading"
          [ShowCreateButton]="false"
          [AllowMultiSelect]="false"
          [AllowDragDrop]="false"
          [DashboardPermissions]="Permissions"
          Title="Shared with me"
          IconClass="fa-solid fa-inbox"
          (DashboardOpen)="OnDashboardOpen($event)"
          (DashboardEdit)="OnDashboardEdit($event)">
        </mj-dashboard-browser>
      </mj-page-body>
    </mj-page-layout>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      .shared-browser {
        display: block;
        flex: 1 1 auto;
        min-height: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardsSharedResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private appManager = inject(ApplicationManager);

  /** True until the dashboards have loaded. */
  public IsLoading = true;

  /** The Config dashboards shared with the user, the most recently updated first. */
  public Dashboards: MJDashboardEntity[] = [];

  /**
   * The user's permissions on each listed dashboard. Delete is always off, which hides the browser's
   * delete button: this page does not delete dashboards.
   */
  public Permissions = new Map<string, DashboardUserPermissions>();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    // The dashboard cache also changes while this page is a background tab (shares, unshares and
    // deletes made elsewhere), so this only refreshes the view.
    ObserveDashboardLibraryChanges()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.onCacheChanged());
    this.navigationService.SetAgentClientTools(this, this.buildAgentTools());
    void this.load(false);
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Shared with me';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-inbox';
  }

  /** Opens the dashboard, in a separate tab for a Shift, Ctrl or Cmd click. */
  public OnDashboardOpen(event: DashboardOpenEvent): void {
    this.open(event.Dashboard, false, event.OpenInNewTab);
  }

  /** Opens the dashboard in edit mode. */
  public OnDashboardEdit(event: DashboardEditEvent): void {
    this.open(event.Dashboard, true);
  }

  /**
   * Opens the dashboard in a tab of the Dashboards app (see DashboardsAppOpenOptions), in edit mode
   * when `openInEditMode` is set, and in a separate tab when `openInNewTab` is set.
   */
  private open(dashboard: MJDashboardEntity, openInEditMode = false, openInNewTab = false): void {
    this.navigationService.OpenDashboard(dashboard.ID, dashboard.Name, DashboardsAppOpenOptions(this.appManager, openInEditMode, openInNewTab));
  }

  /** Loads the dashboard cache and reads the shared dashboards from it. Returns false when the load fails. */
  private async load(forceRefresh: boolean): Promise<boolean> {
    try {
      await DashboardEngine.Instance.Config(forceRefresh);
      this.readSharedDashboards();
      return true;
    } catch (error) {
      LogError(`Dashboards Shared with me: could not load the dashboards: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    } finally {
      this.IsLoading = false;
      this.emitAgentContext();
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  private onCacheChanged(): void {
    this.readSharedDashboards();
    this.cdr.detectChanges();
  }

  private readSharedDashboards(): void {
    const engine = DashboardEngine.Instance;
    const userId = this.ProviderToUse.CurrentUser.ID;
    this.Dashboards = NewestFirst(engine.GetSharedDashboards(userId).filter(IsBrowsableDashboard));
    this.Permissions = new Map(this.Dashboards.map(d => [d.ID, { ...engine.GetDashboardPermissions(d.ID, userId), CanDelete: false }]));
  }

  // ========================================
  // Agent Context & Client Tools
  //
  // 🔒 SAFETY BOUNDARY: Shared with me exposes ONLY read-only / navigational
  // tools to the AI agent: OpenDashboard (opens the dashboard)
  // and RefreshSharedDashboards (reloads the list from the server).
  //
  // Mutating operations — create / delete / save / share / move a dashboard,
  // file a shared dashboard in a category — are intentionally NOT exposed. The
  // agent helps the user find and open what others shared; the user performs
  // every mutation from the UI. Do NOT add a mutating tool here without
  // revisiting this boundary.
  // ========================================

  private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      IsLoading: this.IsLoading,
      SharedCount: this.Dashboards.length,
      SharedNames: BoundNameList(this.Dashboards.map(d => d.Name)),
    });
  }

  private buildAgentTools(): DashboardsAgentClientTool[] {
    return [
      BuildOpenDashboardTool(
        () => DashboardEngine.Instance.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID),
        dashboard => this.open(dashboard)
      ),
      {
        Name: 'RefreshSharedDashboards',
        Description: 'Reload the dashboards shared with the user from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async (): Promise<AgentToolResult> => {
          this.IsLoading = true;
          this.cdr.detectChanges();
          return (await this.load(true)) ? { Success: true } : { Success: false, ErrorMessage: 'The shared dashboards could not be reloaded.' };
        },
      },
    ];
  }
}

export function LoadDashboardsSharedResource(): void {
  // Prevents tree-shaking of the component and its @RegisterClass registration.
}
