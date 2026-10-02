import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntil } from 'rxjs/operators';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { DashboardEngine, MJDashboardCategoryEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { AGENT_CONTEXT_NAME_LIST_CAP, type AgentToolResult } from '../shared/agent-tool-validation';
import { DASHBOARDS_BROWSE_NAV_ITEM, FindDashboardsApp } from '../shared/dashboards-app.helpers';
import { ObserveDashboardLibraryChanges } from '../shared/dashboard-library-changes';
import { LocationQueryParams } from './dashboard-library-filter';
import { DashboardsAgentClientTool, ResolveByIdOrName } from './dashboards-agent-tools';
import {
  BuildCategoryRows,
  BuildEffectiveCategoryMap,
  CATEGORY_NAME_MAX_LENGTH,
  CategoryRow,
  CategoryRowSummary,
} from './dashboards-categories.helpers';

/**
 * Categories page of the Dashboards app: the user's category tree with dashboard and sub-category
 * counts, a New category box, Delete for an empty category the user owns, and Open, which shows the
 * category on the Browse page. The agent tools are read-only; see the SAFETY BOUNDARY in the agent
 * section below.
 */
@RegisterClass(BaseResourceComponent, 'DashboardsCategoriesResource')
@Component({
  standalone: false,
  selector: 'mj-dashboards-categories-resource',
  template: `
    <mj-page-layout>
      <mj-page-header Title="Categories" Icon="fa-solid fa-folder-tree" Subtitle="Your category tree. Categories are per user and can be shared like dashboards.">
        <div actions>
          <input
            class="mj-input cat-new-name"
            placeholder="New category name"
            aria-label="New category name"
            [maxlength]="MaxNameLength"
            [(ngModel)]="NewName"
            (keydown.enter)="Create()" />
          <button mjButton variant="primary" size="sm" class="cat-create" [disabled]="!CanCreate" (click)="Create()">
            <i class="fa-solid fa-plus" aria-hidden="true"></i> New category
          </button>
        </div>
      </mj-page-header>
      <mj-page-body>
        @if (IsLoading) {
          <mj-loading Text="Loading categories..." Size="medium"></mj-loading>
        } @else {
          @for (row of Rows; track row.Category.ID) {
            <div class="cat-row" [style.padding-left.px]="14 + row.Depth * 28">
              <i class="fa-solid fa-folder" aria-hidden="true"></i>
              <span class="cat-main">
                <b>{{ row.Category.Name }}</b>
                <small>{{ Summary(row) }}</small>
              </span>
              <button mjButton size="sm" class="cat-open" [ariaLabel]="'Open ' + row.Category.Name + ' in Browse'" (click)="OpenInBrowse(row.Category)">Open</button>
              @if (row.CanDelete) {
                <button mjButton size="sm" variant="danger" class="cat-delete" [ariaLabel]="'Delete ' + row.Category.Name" [disabled]="IsSaving" (click)="Delete(row.Category)">
                  <i class="fa-solid fa-trash" aria-hidden="true"></i> Delete
                </button>
              }
            </div>
          } @empty {
            <mj-empty-state Icon="fa-solid fa-folder-open" Title="No categories yet" Message="Create one to organize your dashboards." />
          }
        }
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
      .cat-new-name {
        width: 220px;
        max-width: 100%;
      }
      .cat-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--mj-border-subtle);
      }
      .cat-row > i {
        color: var(--mj-text-secondary);
      }
      .cat-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .cat-main b {
        font-size: 13px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cat-main small {
        font-size: 12px;
        color: var(--mj-text-muted);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardsCategoriesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private appManager = inject(ApplicationManager);
  private notifications = inject(MJNotificationService);

  /** True until the categories have loaded. */
  public IsLoading = true;

  /** True while a category is being created or deleted. */
  public IsSaving = false;

  /** The category tree, one row per category, depth first. */
  public Rows: CategoryRow[] = [];

  /** The name typed in the New category box. */
  public NewName = '';

  /** The longest category name the box accepts. */
  public readonly MaxNameLength = CATEGORY_NAME_MAX_LENGTH;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    // The dashboard cache also changes while this page is a background tab (categories created or
    // deleted and dashboards moved in Browse or another session), so this only refreshes the view.
    ObserveDashboardLibraryChanges()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.onCacheChanged());
    this.navigationService.SetAgentClientTools(this, this.buildAgentTools());
    void this.load();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Categories';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-tree';
  }

  /** True when the New category box holds a name and nothing is being saved. */
  public get CanCreate(): boolean {
    return this.NewName.trim().length > 0 && !this.IsSaving;
  }

  /** The row's summary line, for example "3 dashboards · 1 sub-category". */
  public Summary(row: CategoryRow): string {
    return CategoryRowSummary(row);
  }

  /** Creates a top-level category owned by the user from the New category box, then reloads the tree. */
  public async Create(): Promise<void> {
    if (!this.CanCreate) {
      return;
    }
    const name = this.NewName.trim();
    this.setSaving(true);
    try {
      const md = this.ProviderToUse;
      const category = await md.GetEntityObject<MJDashboardCategoryEntity>('MJ: Dashboard Categories', md.CurrentUser);
      category.Name = name;
      category.UserID = md.CurrentUser.ID;
      if (!(await category.Save())) {
        this.notifications.CreateSimpleNotification(category.LatestResult?.CompleteMessage || 'Could not create the category', 'error', 3000);
        return;
      }
      this.NewName = '';
      // The cache adds a saved category by itself only after an asynchronous copy; the reload makes
      // the rows and the agent context include the new category now.
      await this.reload();
      this.notifications.CreateSimpleNotification(`Created "${name}"`, 'success', 2000);
    } catch (error) {
      LogError(`Dashboards Categories: could not create "${name}": ${errorMessage(error)}`);
      this.notifications.CreateSimpleNotification('Could not create the category', 'error', 3000);
    } finally {
      this.setSaving(false);
    }
  }

  /** Deletes an empty category the user owns. */
  public async Delete(category: MJDashboardCategoryEntity): Promise<void> {
    if (this.IsSaving) {
      return;
    }
    const name = category.Name;
    this.setSaving(true);
    try {
      if (await category.Delete()) {
        // The cache removes a deleted category before Delete() resolves, so no reload is needed.
        this.rebuildRows();
        this.emitAgentContext();
        this.notifications.CreateSimpleNotification(`Deleted "${name}"`, 'success', 2000);
      } else {
        this.notifications.CreateSimpleNotification(category.LatestResult?.CompleteMessage || 'Could not delete the category', 'error', 3000);
      }
    } catch (error) {
      LogError(`Dashboards Categories: could not delete "${name}": ${errorMessage(error)}`);
      this.notifications.CreateSimpleNotification('Could not delete the category', 'error', 3000);
    } finally {
      this.setSaving(false);
    }
  }

  /** Shows the category on the Browse page of the Dashboards app. */
  public async OpenInBrowse(category: MJDashboardCategoryEntity): Promise<void> {
    await this.openInBrowse(category);
  }

  private async load(): Promise<void> {
    try {
      await DashboardEngine.Instance.Config(false);
      this.rebuildRows();
    } catch (error) {
      LogError(`Dashboards Categories: could not load the categories: ${errorMessage(error)}`);
    } finally {
      this.IsLoading = false;
      this.emitAgentContext();
      this.NotifyLoadComplete();
      this.cdr.detectChanges();
    }
  }

  /**
   * Reloads the dashboard cache from the server, rebuilds the rows and reports them to the agent.
   * Returns false when the reload fails.
   */
  private async reload(): Promise<boolean> {
    try {
      await DashboardEngine.Instance.Config(true);
      this.rebuildRows();
      this.emitAgentContext();
      return true;
    } catch (error) {
      LogError(`Dashboards Categories: could not reload the categories: ${errorMessage(error)}`);
      return false;
    } finally {
      this.cdr.detectChanges();
    }
  }

  private onCacheChanged(): void {
    this.rebuildRows();
    this.cdr.detectChanges();
  }

  private rebuildRows(): void {
    const engine = DashboardEngine.Instance;
    const userId = this.ProviderToUse.CurrentUser.ID;
    const dashboards = engine.GetAccessibleDashboards(userId);
    const effectiveCategoryMap = BuildEffectiveCategoryMap(dashboards, engine.DashboardCategoryLinks, userId);
    this.Rows = BuildCategoryRows(engine.GetAccessibleCategories(userId), dashboards, effectiveCategoryMap, userId);
  }

  private async openInBrowse(category: MJDashboardCategoryEntity): Promise<AgentToolResult> {
    const app = FindDashboardsApp(this.appManager);
    if (!app) {
      this.notifications.CreateSimpleNotification('The Dashboards app is not available', 'error', 3000);
      return { Success: false, ErrorMessage: 'The Dashboards app is not available to this user.' };
    }
    try {
      await this.navigationService.SwitchToApp(app.ID, DASHBOARDS_BROWSE_NAV_ITEM, LocationQueryParams({ Filter: 'all', CategoryId: category.ID }));
      return { Success: true };
    } catch (error) {
      LogError(`Dashboards Categories: could not open "${category.Name}" in Browse: ${errorMessage(error)}`);
      return { Success: false, ErrorMessage: errorMessage(error) };
    }
  }

  private setSaving(saving: boolean): void {
    this.IsSaving = saving;
    this.cdr.detectChanges();
  }

  // ========================================
  // Agent Context & Client Tools
  //
  // 🔒 SAFETY BOUNDARY: the Categories page exposes ONLY read-only /
  // navigational tools to the AI agent: OpenCategoryInBrowse (shows a category
  // on the Browse page) and RefreshCategories (reloads the tree).
  //
  // Mutating operations — create / delete / rename / move / share a category,
  // and any change to a dashboard — are intentionally NOT exposed. The agent
  // helps the user find and understand categories; the user performs every
  // mutation from the UI (New category, Delete). Do NOT add a mutating tool
  // here without revisiting this boundary.
  // ========================================

  private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      IsLoading: this.IsLoading,
      CategoryCount: this.Rows.length,
      Categories: this.Rows.slice(0, AGENT_CONTEXT_NAME_LIST_CAP).map(r => ({
        Name: r.Category.Name,
        Depth: r.Depth,
        DashboardCount: r.DashboardCount,
        SubCategoryCount: r.SubCategoryCount,
      })),
    });
  }

  private buildAgentTools(): DashboardsAgentClientTool[] {
    return [
      {
        Name: 'OpenCategoryInBrowse',
        Description: 'Show a category and its dashboards on the Browse page. Accepts the category name or its ID.',
        ParameterSchema: {
          type: 'object',
          properties: { category: { type: 'string', description: 'The category name or ID.' } },
          required: ['category'],
        },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const lookup = ResolveByIdOrName(this.Rows.map(r => r.Category), params['category'], 'category');
          return lookup.ok ? this.openInBrowse(lookup.value) : lookup.result;
        },
      },
      {
        Name: 'RefreshCategories',
        Description: 'Reload the category tree from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async (): Promise<AgentToolResult> =>
          (await this.reload()) ? { Success: true } : { Success: false, ErrorMessage: 'The categories could not be reloaded.' },
      },
    ];
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LoadDashboardsCategoriesResource(): void {
  // Prevents tree-shaking of the component and its @RegisterClass registration.
}
