import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import { debounceTime, takeUntil, distinctUntilChanged } from 'rxjs/operators';
import { UserInfoEngine } from '@memberjunction/core-entities';

// Setting key prefix to avoid collisions
const SETTING_PREFIX = '__ACTION_DASHBOARD__';

export type ActionViewMode = 'card' | 'list' | 'compact';
export type SortField = 'name' | 'updated' | 'status' | 'type' | 'category';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface ActionFilters {
  searchTerm: string;
  statuses: string[];
  types: string[];
  approvalStatuses: string[];
  hasExecutions: boolean | null;
}

export interface ActionExplorerState {
  treeWidth: number;
  treeCollapsed: boolean;
  viewMode: ActionViewMode;
  sortConfig: SortConfig;
  expandedCategories: string[];
  selectedCategoryId: string;
  filters: ActionFilters;
}

const DEFAULT_STATE: ActionExplorerState = {
  treeWidth: 280,
  treeCollapsed: false,
  viewMode: 'card',
  sortConfig: { field: 'name', direction: 'asc' },
  expandedCategories: [],
  selectedCategoryId: 'all',
  filters: {
    searchTerm: '',
    statuses: [],
    types: [],
    approvalStatuses: [],
    hasExecutions: null
  }
};

const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 450;
const TREE_COLLAPSED_WIDTH = 0;

@Injectable()
export class ActionExplorerStateService implements OnDestroy {
  // UI State subjects
  private _treeWidth$ = new BehaviorSubject<number>(DEFAULT_STATE.treeWidth);
  private _treeCollapsed$ = new BehaviorSubject<boolean>(DEFAULT_STATE.treeCollapsed);
  private _viewMode$ = new BehaviorSubject<ActionViewMode>(DEFAULT_STATE.viewMode);
  private _sortConfig$ = new BehaviorSubject<SortConfig>(DEFAULT_STATE.sortConfig);
  private _expandedCategories$ = new BehaviorSubject<Set<string>>(new Set(DEFAULT_STATE.expandedCategories));
  private _selectedCategoryId$ = new BehaviorSubject<string>(DEFAULT_STATE.selectedCategoryId);
  private _filters$ = new BehaviorSubject<ActionFilters>(DEFAULT_STATE.filters);

  // Slide panel states
  private _newCategoryPanelOpen$ = new BehaviorSubject<boolean>(false);
  private _newActionPanelOpen$ = new BehaviorSubject<boolean>(false);

  // Persistence subjects (debounced)
  private _persistState$ = new Subject<void>();
  private _destroy$ = new Subject<void>();

  // Public observables
  public readonly TreeWidth$: Observable<number> = this._treeWidth$.asObservable();
  public readonly TreeCollapsed$: Observable<boolean> = this._treeCollapsed$.asObservable();
  public readonly ViewMode$: Observable<ActionViewMode> = this._viewMode$.asObservable();
  public readonly SortConfig$: Observable<SortConfig> = this._sortConfig$.asObservable();
  public readonly ExpandedCategories$: Observable<Set<string>> = this._expandedCategories$.asObservable();
  public readonly SelectedCategoryId$: Observable<string> = this._selectedCategoryId$.asObservable();
  public readonly Filters$: Observable<ActionFilters> = this._filters$.asObservable();
  public readonly NewCategoryPanelOpen$: Observable<boolean> = this._newCategoryPanelOpen$.asObservable();
  public readonly NewActionPanelOpen$: Observable<boolean> = this._newActionPanelOpen$.asObservable();

  // Current values (synchronous access)
  public get TreeWidth(): number { return this._treeWidth$.value; }
  public get TreeCollapsed(): boolean { return this._treeCollapsed$.value; }
  public get ViewMode(): ActionViewMode { return this._viewMode$.value; }
  public get SortConfig(): SortConfig { return this._sortConfig$.value; }
  public get ExpandedCategories(): Set<string> { return this._expandedCategories$.value; }
  public get SelectedCategoryId(): string { return this._selectedCategoryId$.value; }
  public get Filters(): ActionFilters { return this._filters$.value; }

  // Constants
  public readonly TreeWidthMin = TREE_WIDTH_MIN;
  public readonly TreeWidthMax = TREE_WIDTH_MAX;
  public readonly TreeCollapsedWidth = TREE_COLLAPSED_WIDTH;

  constructor() {
    this.setupPersistence();
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  private setupPersistence(): void {
    // Debounced persistence - save state 500ms after last change
    this._persistState$.pipe(
      debounceTime(500),
      takeUntil(this._destroy$)
    ).subscribe(() => {
      this.saveState();
    });
  }

  /**
   * Load saved state from UserInfoEngine
   */
  public async loadSavedState(): Promise<void> {
    try {
      const savedState = UserInfoEngine.Instance.GetSetting(`${SETTING_PREFIX}action-explorer/state`);
      if (savedState) {
        const state = JSON.parse(savedState) as Partial<ActionExplorerState>;

        if (state.treeWidth != null && state.treeWidth >= TREE_WIDTH_MIN && state.treeWidth <= TREE_WIDTH_MAX) {
          this._treeWidth$.next(state.treeWidth);
        }
        if (state.treeCollapsed != null) {
          this._treeCollapsed$.next(state.treeCollapsed);
        }
        if (state.viewMode != null) {
          this._viewMode$.next(state.viewMode);
        }
        if (state.sortConfig != null) {
          this._sortConfig$.next(state.sortConfig);
        }
        if (state.expandedCategories != null) {
          this._expandedCategories$.next(new Set(state.expandedCategories));
        }
        // Note: selectedCategoryId is loaded from URL params, not saved state
        // Note: filters are loaded from URL params, not saved state
      }
    } catch (error) {
      console.warn('[ActionExplorerState] Failed to load saved state:', error);
    }
  }

  /**
   * Save current state to UserInfoEngine
   */
  private async saveState(): Promise<void> {
    try {
      const state: ActionExplorerState = {
        treeWidth: this._treeWidth$.value,
        treeCollapsed: this._treeCollapsed$.value,
        viewMode: this._viewMode$.value,
        sortConfig: this._sortConfig$.value,
        expandedCategories: Array.from(this._expandedCategories$.value),
        selectedCategoryId: this._selectedCategoryId$.value,
        filters: this._filters$.value
      };
      await UserInfoEngine.Instance.SetSetting(
        `${SETTING_PREFIX}action-explorer/state`,
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('[ActionExplorerState] Failed to save state:', error);
    }
  }

  private queuePersist(): void {
    this._persistState$.next();
  }

  // Tree panel methods
  public setTreeWidth(width: number): void {
    const clampedWidth = Math.min(Math.max(width, TREE_WIDTH_MIN), TREE_WIDTH_MAX);
    if (clampedWidth !== this._treeWidth$.value) {
      this._treeWidth$.next(clampedWidth);
      this.queuePersist();
    }
  }

  public setTreeCollapsed(collapsed: boolean): void {
    if (collapsed !== this._treeCollapsed$.value) {
      this._treeCollapsed$.next(collapsed);
      this.queuePersist();
    }
  }

  public toggleTreeCollapsed(): void {
    this.setTreeCollapsed(!this._treeCollapsed$.value);
  }

  // View mode methods
  public setViewMode(mode: ActionViewMode): void {
    if (mode !== this._viewMode$.value) {
      this._viewMode$.next(mode);
      this.queuePersist();
    }
  }

  // Sort methods
  public setSortConfig(config: SortConfig): void {
    if (config.field !== this._sortConfig$.value.field ||
        config.direction !== this._sortConfig$.value.direction) {
      this._sortConfig$.next(config);
      this.queuePersist();
    }
  }

  public toggleSortDirection(): void {
    const current = this._sortConfig$.value;
    this.setSortConfig({
      field: current.field,
      direction: current.direction === 'asc' ? 'desc' : 'asc'
    });
  }

  public setSortField(field: SortField): void {
    const current = this._sortConfig$.value;
    if (field === current.field) {
      this.toggleSortDirection();
    } else {
      this.setSortConfig({ field, direction: 'asc' });
    }
  }

  // Category expansion methods
  public toggleCategoryExpanded(categoryId: string): void {
    const expanded = new Set(this._expandedCategories$.value);
    if (expanded.has(categoryId)) {
      expanded.delete(categoryId);
    } else {
      expanded.add(categoryId);
    }
    this._expandedCategories$.next(expanded);
    this.queuePersist();
  }

  public setCategoryExpanded(categoryId: string, isExpanded: boolean): void {
    const expanded = new Set(this._expandedCategories$.value);
    if (isExpanded) {
      expanded.add(categoryId);
    } else {
      expanded.delete(categoryId);
    }
    this._expandedCategories$.next(expanded);
    this.queuePersist();
  }

  public expandPathToCategory(categoryId: string, categoryParentMap: Map<string, string | null>): void {
    const expanded = new Set(this._expandedCategories$.value);
    let currentId: string | null = categoryParentMap.get(categoryId) || null;

    while (currentId) {
      expanded.add(currentId);
      currentId = categoryParentMap.get(currentId) || null;
    }

    this._expandedCategories$.next(expanded);
    this.queuePersist();
  }

  public collapseAllCategories(): void {
    this._expandedCategories$.next(new Set());
    this.queuePersist();
  }

  public expandAllCategories(categoryIds: string[]): void {
    this._expandedCategories$.next(new Set(categoryIds));
    this.queuePersist();
  }

  // Selected category methods
  public setSelectedCategoryId(categoryId: string): void {
    if (categoryId !== this._selectedCategoryId$.value) {
      this._selectedCategoryId$.next(categoryId);
      // Don't persist - this comes from URL
    }
  }

  // Filter methods
  public setFilters(filters: Partial<ActionFilters>): void {
    this._filters$.next({ ...this._filters$.value, ...filters });
    // Don't persist filters - they come from URL
  }

  public setSearchTerm(searchTerm: string): void {
    if (searchTerm !== this._filters$.value.searchTerm) {
      this._filters$.next({ ...this._filters$.value, searchTerm });
    }
  }

  public setStatusFilter(statuses: string[]): void {
    this._filters$.next({ ...this._filters$.value, statuses });
  }

  public setTypeFilter(types: string[]): void {
    this._filters$.next({ ...this._filters$.value, types });
  }

  public clearFilters(): void {
    this._filters$.next({
      searchTerm: '',
      statuses: [],
      types: [],
      approvalStatuses: [],
      hasExecutions: null
    });
  }

  public hasActiveFilters(): boolean {
    const f = this._filters$.value;
    return f.searchTerm.length > 0 ||
           f.statuses.length > 0 ||
           f.types.length > 0 ||
           f.approvalStatuses.length > 0 ||
           f.hasExecutions != null;
  }

  // Panel methods
  public openNewCategoryPanel(): void {
    this._newCategoryPanelOpen$.next(true);
  }

  public closeNewCategoryPanel(): void {
    this._newCategoryPanelOpen$.next(false);
  }

  public openNewActionPanel(): void {
    this._newActionPanelOpen$.next(true);
  }

  public closeNewActionPanel(): void {
    this._newActionPanelOpen$.next(false);
  }

  /**
   * Build URL query params from current state for deep linking
   */
  public buildQueryParams(): Record<string, string | null> {
    const params: Record<string, string | null> = {};

    if (this._selectedCategoryId$.value !== 'all') {
      params['category'] = this._selectedCategoryId$.value;
    } else {
      params['category'] = null;
    }

    if (this._viewMode$.value !== 'card') {
      params['view'] = this._viewMode$.value;
    } else {
      params['view'] = null;
    }

    const sort = this._sortConfig$.value;
    if (sort.field !== 'name' || sort.direction !== 'asc') {
      params['sort'] = `${sort.field}_${sort.direction}`;
    } else {
      params['sort'] = null;
    }

    const f = this._filters$.value;
    if (f.searchTerm) {
      params['q'] = f.searchTerm;
    } else {
      params['q'] = null;
    }

    if (f.statuses.length > 0) {
      params['status'] = f.statuses.join(',');
    } else {
      params['status'] = null;
    }

    if (f.types.length > 0) {
      params['type'] = f.types.join(',');
    } else {
      params['type'] = null;
    }

    return params;
  }

  /**
   * Parse URL query params and update state
   */
  public parseQueryParams(params: URLSearchParams): void {
    const category = params.get('category');
    if (category) {
      this._selectedCategoryId$.next(category);
    }

    const view = params.get('view') as ActionViewMode | null;
    if (view && ['card', 'list', 'compact'].includes(view)) {
      this._viewMode$.next(view);
    }

    const sort = params.get('sort');
    if (sort) {
      const [field, direction] = sort.split('_') as [SortField, SortDirection];
      if (field && direction) {
        this._sortConfig$.next({ field, direction });
      }
    }

    const searchTerm = params.get('q') || '';
    const statuses = params.get('status')?.split(',').filter(s => s) || [];
    const types = params.get('type')?.split(',').filter(t => t) || [];

    this._filters$.next({
      ...this._filters$.value,
      searchTerm,
      statuses,
      types
    });
  }
}
