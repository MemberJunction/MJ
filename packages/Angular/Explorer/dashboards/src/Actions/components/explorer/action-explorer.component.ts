import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, combineLatestWith } from 'rxjs/operators';
import { CompositeKey, LogError, RunView } from '@memberjunction/core';
import { MJActionCategoryEntity, MJActionEntity, MJActionParamEntity, ResourceData } from '@memberjunction/core-entities';
import { ActionEngineBase, MJActionEntityExtended } from '@memberjunction/actions-base';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ViewToggleOption } from '@memberjunction/ng-ui-components';
import {
  ActionExplorerStateService,
  ActionViewMode,
  SortConfig,
  SortField,
  SortDirection,
  ActionFilters
} from '../../services/action-explorer-state.service';
import { ActionTreePanelComponent } from './action-tree-panel.component';

interface SortOption {
  field: SortField;
  label: string;
  icon: string;
}
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
  public Actions: MJActionEntityExtended[] = [];
  public FilteredActions: MJActionEntityExtended[] = [];
  public Categories: MJActionCategoryEntity[] = [];
  public CategoriesMap = new Map<string, MJActionCategoryEntity>();

  public ViewMode: ActionViewMode = 'card';
  public SortField: SortField = 'name';
  public SortDirection: SortDirection = 'asc';
  public Filters: ActionFilters = {
    searchTerm: '',
    statuses: [],
    types: [],
    approvalStatuses: [],
    hasExecutions: null
  };
  public ShowSortDropdown = false;

  public SelectedCategoryId = 'all';
  public NewCategoryParentId: string | null = null;

  // Run dialog state
  public IsRunDialogOpen = false;
  public SelectedActionForRun: MJActionEntity | null = null;
  public SelectedActionParams: MJActionParamEntity[] = [];

  // ───── Toolbar option arrays + helpers (consolidated from former mj-action-toolbar) ─────

  public readonly ViewToggleOptions: ViewToggleOption[] = [
    { key: 'card',    icon: 'fa-solid fa-grip', title: 'Card view' },
    { key: 'list',    icon: 'fa-solid fa-list', title: 'List view' },
    { key: 'compact', icon: 'fa-solid fa-bars', title: 'Compact view' }
  ];

  public readonly SortOptions: SortOption[] = [
    { field: 'name',     label: 'Name',         icon: 'fa-solid fa-font' },
    { field: 'updated',  label: 'Last Updated', icon: 'fa-solid fa-clock' },
    { field: 'status',   label: 'Status',       icon: 'fa-solid fa-circle-check' },
    { field: 'type',     label: 'Type',         icon: 'fa-solid fa-tag' },
    { field: 'category', label: 'Category',     icon: 'fa-solid fa-folder' }
  ];

  public readonly StatusOptions = [
    { value: 'Active',   label: 'Active' },
    { value: 'Pending',  label: 'Pending' },
    { value: 'Disabled', label: 'Disabled' }
  ];

  public readonly TypeOptions = [
    { value: 'Generated', label: 'AI Generated', icon: 'fa-solid fa-robot' },
    { value: 'Custom',    label: 'Custom',       icon: 'fa-solid fa-code' }
  ];

  protected override destroy$ = new Subject<void>();
  private searchInput$ = new Subject<string>();

  constructor(
    public StateService: ActionExplorerStateService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    super.ngOnInit();
    this.subscribeToState();
    this.setupSearchDebounce();
    this.applyQueryParams(this.GetQueryParams());
    this.StateService.loadSavedState();
    this.loadData();
  }

  private setupSearchDebounce(): void {
    this.searchInput$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(term => {
      this.StateService.setSearchTerm(term);
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
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
      this.UpdateQueryParams(this.StateService.buildQueryParams());
      this.cdr.markForCheck();
    });

    // Subscribe to filter and sort changes
    this.StateService.Filters$.pipe(
      combineLatestWith(this.StateService.SortConfig$),
      debounceTime(50),
      takeUntil(this.destroy$)
    ).subscribe(([filters, sort]) => {
      this.Filters = filters;
      this.SortField = sort.field;
      this.SortDirection = sort.direction;
      this.applyFilters();
      this.UpdateQueryParams(this.StateService.buildQueryParams());
      this.cdr.markForCheck();
    });
  }

  /**
   * Convert the framework's plain-object params into the StateService's URLSearchParams-based parser.
   */
  private applyQueryParams(params: Record<string, string>): void {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value != null) {
        urlParams.set(key, value);
      }
    }
    this.StateService.parseQueryParams(urlParams);
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
        if (UUIDsEqual(c.ParentID, parentId) && !descendants.has(c.ID)) {
          descendants.add(c.ID);
          addDescendants(c.ID);
        }
      });
    };

    addDescendants(categoryId);
    return descendants;
  }

  private sortActions(actions: MJActionEntityExtended[], config: SortConfig): MJActionEntityExtended[] {
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

  /**
   * React to back/forward navigation or deep-link activation.
   * Called by the base class when the URL query params change externally.
   */
  protected override OnQueryParamsChanged(params: Record<string, string>, source: 'popstate' | 'deeplink'): void {
    this.applyQueryParams(params);
    this.applyFilters();
    this.cdr.markForCheck();
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

  public onActionClick(action: MJActionEntityExtended): void {
    const key = new CompositeKey([{ FieldName: 'ID', Value: action.ID }]);
    this.navigationService.OpenEntityRecord('MJ: Actions', key);
  }

  public onActionEdit(action: MJActionEntityExtended): void {
    this.onActionClick(action);
  }

  public async onActionRun(action: MJActionEntityExtended): Promise<void> {
    if (action.Status !== 'Active') {
      return; // Can't run inactive actions
    }

    try {
      // Load action params
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJActionParamEntity>({
        EntityName: 'MJ: Action Params',
        ExtraFilter: `ActionID='${action.ID}'`,
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      this.SelectedActionParams = result.Success ? result.Results || [] : [];
      // MJActionEntityExtended extends MJActionEntity, so this cast is safe
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

  // ───── Toolbar handlers (consolidated from former mj-action-toolbar) ─────

  public onSearchInput(term: string): void {
    this.searchInput$.next(term);
  }

  public clearSearch(): void {
    this.StateService.setSearchTerm('');
  }

  public setViewMode(mode: ActionViewMode): void {
    this.StateService.setViewMode(mode);
  }

  public setSortField(field: SortField): void {
    this.StateService.setSortField(field);
    this.ShowSortDropdown = false;
  }

  public toggleStatus(status: string): void {
    const current = [...this.Filters.statuses];
    const i = current.indexOf(status);
    if (i >= 0) current.splice(i, 1);
    else current.push(status);
    this.StateService.setStatusFilter(current);
  }

  public toggleType(type: string): void {
    const current = [...this.Filters.types];
    const i = current.indexOf(type);
    if (i >= 0) current.splice(i, 1);
    else current.push(type);
    this.StateService.setTypeFilter(current);
  }

  public isStatusSelected(status: string): boolean {
    return this.Filters.statuses.includes(status);
  }

  public isTypeSelected(type: string): boolean {
    return this.Filters.types.includes(type);
  }

  public clearFilters(): void {
    this.StateService.clearFilters();
  }

  public hasActiveFilters(): boolean {
    return this.StateService.hasActiveFilters();
  }

  /** Active filter count for the popover badge — counts only Status + Type
   *  (searchTerm has its own search input, not part of the popover). */
  public get StatusTypeFilterCount(): number {
    return this.Filters.statuses.length + this.Filters.types.length;
  }

  public toggleSortDropdown(): void {
    this.ShowSortDropdown = !this.ShowSortDropdown;
  }

  public getSortLabel(): string {
    const option = this.SortOptions.find(o => o.field === this.SortField);
    return option?.label || 'Sort';
  }

  public getSortIcon(): string {
    return this.SortDirection === 'asc' ? 'fa-solid fa-arrow-up-short-wide' : 'fa-solid fa-arrow-down-wide-short';
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Action Explorer';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-folder-tree';
  }
}
