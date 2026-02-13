import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter, debounceTime, distinctUntilChanged, combineLatestWith } from 'rxjs/operators';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { MJActionCategoryEntity, MJActionEntity, MJActionParamEntity, ResourceData } from '@memberjunction/core-entities';
import { ActionEngineBase, ActionEntityExtended } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import {
  ActionExplorerStateService,
  ActionViewMode,
  SortConfig,
  ActionFilters
} from '../../services/action-explorer-state.service';
import { ActionTreePanelComponent } from './action-tree-panel.component';
@RegisterClass(BaseResourceComponent, 'ActionExplorerResource')
@Component({
  standalone: false,
  selector: 'mj-action-explorer',
  templateUrl: './action-explorer.component.html',
  styleUrls: ['./action-explorer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ActionExplorerStateService]
})
export class ActionExplorerComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  @ViewChild(ActionTreePanelComponent) TreePanel!: ActionTreePanelComponent;

  public IsLoading = true;
  public Actions: ActionEntityExtended[] = [];
  public FilteredActions: ActionEntityExtended[] = [];
  public Categories: MJActionCategoryEntity[] = [];
  public CategoriesMap = new Map<string, MJActionCategoryEntity>();

  public ViewMode: ActionViewMode = 'card';
  public SelectedCategoryId = 'all';
  public NewCategoryParentId: string | null = null;

  // Run dialog state
  public IsRunDialogOpen = false;
  public SelectedActionForRun: MJActionEntity | null = null;
  public SelectedActionParams: MJActionParamEntity[] = [];

  private destroy$ = new Subject<void>();
  private lastNavigatedUrl = '';
  private skipUrlUpdate = false;

  constructor(
    public StateService: ActionExplorerStateService,
    private navigationService: NavigationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribeToState();
    this.subscribeToRouterEvents();
    this.loadInitialState();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeToState(): void {
    // Subscribe to view mode changes
    this.StateService.ViewMode$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(mode => {
      this.ViewMode = mode;
      this.cdr.markForCheck();
    });

    // Subscribe to selected category changes
    this.StateService.SelectedCategoryId$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(id => {
      this.SelectedCategoryId = id;
      this.applyFilters();
      this.updateUrl();
      this.cdr.markForCheck();
    });

    // Subscribe to filter and sort changes
    this.StateService.Filters$.pipe(
      combineLatestWith(this.StateService.SortConfig$),
      debounceTime(50),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.applyFilters();
      this.updateUrl();
      this.cdr.markForCheck();
    });
  }

  private subscribeToRouterEvents(): void {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(event => {
      const currentUrl = event.urlAfterRedirects || event.url;
      if (currentUrl !== this.lastNavigatedUrl) {
        this.onExternalNavigation(currentUrl);
      }
    });
  }

  private loadInitialState(): void {
    // Parse URL query params
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      const queryString = url.substring(queryIndex + 1);
      const params = new URLSearchParams(queryString);
      this.skipUrlUpdate = true;
      this.StateService.parseQueryParams(params);
      this.skipUrlUpdate = false;
    }

    // Load saved state from UserInfoEngine
    this.StateService.loadSavedState();
  }

  private async loadData(): Promise<void> {
    try {
      this.IsLoading = true;
      this.cdr.markForCheck();

      // Initialize ActionEngineBase
      await ActionEngineBase.Instance.Config(false);

      // Get actions and categories from engine
      this.Actions = ActionEngineBase.Instance.Actions;
      this.Categories = ActionEngineBase.Instance.ActionCategories;

      // Build categories map
      this.CategoriesMap.clear();
      this.Categories.forEach(c => this.CategoriesMap.set(c.ID, c));

      // Build tree panel if available
      if (this.TreePanel) {
        this.TreePanel.Categories = this.Categories;
        this.TreePanel.Actions = this.Actions;
        this.TreePanel.buildCategoryTree();
      }

      // Apply filters
      this.applyFilters();

      // Expand path to selected category if needed
      if (this.SelectedCategoryId !== 'all' && this.SelectedCategoryId !== 'uncategorized') {
        const categoryParentMap = new Map<string, string | null>();
        this.Categories.forEach(c => categoryParentMap.set(c.ID, c.ParentID || null));
        this.StateService.expandPathToCategory(this.SelectedCategoryId, categoryParentMap);
      }

    } catch (error) {
      LogError('Failed to load action explorer data', undefined, error);
    } finally {
      this.IsLoading = false;
      this.cdr.markForCheck();
      this.NotifyLoadComplete();
    }
  }

  private applyFilters(): void {
    let filtered = [...this.Actions];
    const filters = this.StateService.Filters;
    const sortConfig = this.StateService.SortConfig;

    // Apply category filter
    if (this.SelectedCategoryId === 'uncategorized') {
      filtered = filtered.filter(a => !a.CategoryID);
    } else if (this.SelectedCategoryId !== 'all') {
      // Include descendants
      const descendants = this.getDescendantCategoryIds(this.SelectedCategoryId);
      filtered = filtered.filter(a => a.CategoryID && descendants.has(a.CategoryID));
    }

    // Apply search filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(a =>
        a.Name.toLowerCase().includes(term) ||
        (a.Description || '').toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (filters.statuses.length > 0) {
      filtered = filtered.filter(a => filters.statuses.includes(a.Status));
    }

    // Apply type filter
    if (filters.types.length > 0) {
      filtered = filtered.filter(a => filters.types.includes(a.Type));
    }

    // Apply sorting
    filtered = this.sortActions(filtered, sortConfig);

    this.FilteredActions = filtered;
  }

  private getDescendantCategoryIds(categoryId: string): Set<string> {
    const descendants = new Set<string>([categoryId]);

    const addDescendants = (parentId: string) => {
      this.Categories.forEach(c => {
        if (c.ParentID === parentId && !descendants.has(c.ID)) {
          descendants.add(c.ID);
          addDescendants(c.ID);
        }
      });
    };

    addDescendants(categoryId);
    return descendants;
  }

  private sortActions(actions: ActionEntityExtended[], config: SortConfig): ActionEntityExtended[] {
    const sorted = [...actions];
    const direction = config.direction === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (config.field) {
        case 'name':
          comparison = a.Name.localeCompare(b.Name);
          break;
        case 'updated':
          const dateA = a.__mj_UpdatedAt ? new Date(a.__mj_UpdatedAt).getTime() : 0;
          const dateB = b.__mj_UpdatedAt ? new Date(b.__mj_UpdatedAt).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'status':
          comparison = (a.Status || '').localeCompare(b.Status || '');
          break;
        case 'type':
          comparison = (a.Type || '').localeCompare(b.Type || '');
          break;
        case 'category':
          const catA = this.CategoriesMap.get(a.CategoryID || '')?.Name || '';
          const catB = this.CategoriesMap.get(b.CategoryID || '')?.Name || '';
          comparison = catA.localeCompare(catB);
          break;
      }

      return comparison * direction;
    });

    return sorted;
  }

  private updateUrl(): void {
    if (this.skipUrlUpdate) return;

    const queryParams = this.StateService.buildQueryParams();
    this.navigationService.UpdateActiveTabQueryParams(queryParams);
    this.lastNavigatedUrl = this.router.url;
  }

  private onExternalNavigation(url: string): void {
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      const queryString = url.substring(queryIndex + 1);
      const params = new URLSearchParams(queryString);
      this.skipUrlUpdate = true;
      this.StateService.parseQueryParams(params);
      this.skipUrlUpdate = false;
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  public async onRefresh(): Promise<void> {
    await ActionEngineBase.Instance.Config(true); // Force refresh
    await this.loadData();
  }

  public onCategorySelect(categoryId: string): void {
    this.StateService.setSelectedCategoryId(categoryId);
  }

  public onNewCategory(parentId: string | null): void {
    this.NewCategoryParentId = parentId;
    this.StateService.openNewCategoryPanel();
  }

  public onEditCategory(category: MJActionCategoryEntity): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: category.ID }]);
    this.navigationService.OpenEntityRecord('MJ: Action Categories', key);
  }

  public onNewAction(): void {
    this.StateService.openNewActionPanel();
  }

  public onActionClick(action: ActionEntityExtended): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: action.ID }]);
    this.navigationService.OpenEntityRecord('Actions', key);
  }

  public onActionEdit(action: ActionEntityExtended): void {
    this.onActionClick(action);
  }

  public async onActionRun(action: ActionEntityExtended): Promise<void> {
    if (action.Status !== 'Active') {
      return; // Can't run inactive actions
    }

    try {
      // Load action params
      const rv = new RunView();
      const result = await rv.RunView<MJActionParamEntity>({
        EntityName: 'MJ: Action Params',
        ExtraFilter: `ActionID='${action.ID}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      this.SelectedActionParams = result.Success ? result.Results || [] : [];
      // ActionEntityExtended extends MJActionEntity, so this cast is safe
      this.SelectedActionForRun = action as unknown as MJActionEntity;
      this.IsRunDialogOpen = true;
      this.cdr.markForCheck();

    } catch (error) {
      LogError('Failed to open action run dialog', undefined, error);
    }
  }

  public OnRunDialogClose(): void {
    this.IsRunDialogOpen = false;
    this.SelectedActionForRun = null;
    this.SelectedActionParams = [];
    this.cdr.markForCheck();
  }

  public onCategoryClick(categoryId: string): void {
    this.StateService.setSelectedCategoryId(categoryId);
  }

  public async onCategoryCreated(category: MJActionCategoryEntity): Promise<void> {
    // Refresh data to include new category
    await this.loadData();
    // Select the new category
    this.StateService.setSelectedCategoryId(category.ID);
  }

  public async onActionCreated(): Promise<void> {
    // Refresh data to include new action
    await this.loadData();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Action Explorer';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-tree';
  }
}
