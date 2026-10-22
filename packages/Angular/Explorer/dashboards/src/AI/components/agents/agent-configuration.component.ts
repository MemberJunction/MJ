import { Component, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { Metadata, CompositeKey, RunView } from '@memberjunction/core';
import { ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { CreateAgentService, CreateAgentDialogResult, CreateAgentResult } from '@memberjunction/ng-agents';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { TreeBranchConfig, TreeLeafConfig, AfterNodeClickEventArgs, AfterNodeDoubleClickEventArgs } from '@memberjunction/ng-trees';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';

interface AgentFilter {
  searchTerm: string;
  agentType: string;
  parentAgent: string;
  status: string;
  executionMode: string;
  exposeAsAction: string;
  categoryId: string;
}


/**
 * User preferences for the Agent Configuration dashboard
 */
interface AgentConfigurationUserPreferences {
  filterPanelVisible: boolean;
  viewMode: 'grid' | 'list' | 'tree';
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  filters: AgentFilter;
}
/**
 * AI Agents Resource - displays AI agent configuration and management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIAgentsResource')
@Component({
  standalone: false,
  selector: 'app-agent-configuration',
  templateUrl: './agent-configuration.component.html',
  styleUrls: ['./agent-configuration.component.css']
})
export class AgentConfigurationComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
  // Settings persistence
  private readonly USER_SETTINGS_KEY = 'AI.Agents.UserPreferences';
  private settingsPersistSubject = new Subject<void>();
  protected override destroy$ = new Subject<void>();
  private settingsLoaded = false;

  public isLoading = false;
  public FilterPanelVisible = true;

  /** @deprecated Use {@link FilterPanelVisible}. */
  public get filterPanelVisible() {
    return this.FilterPanelVisible;
  }
  /** @deprecated Use {@link FilterPanelVisible}. */
  public set filterPanelVisible(value) {
    this.FilterPanelVisible = value;
  }
  public ViewMode: 'grid' | 'list' | 'tree' = 'grid';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' | 'tree' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list' | 'tree') {
    this.ViewMode = value;
  }
  public ExpandedAgentId: string | null = null;

  /** @deprecated Use {@link ExpandedAgentId}. */
  public get expandedAgentId(): string | null {
    return this.ExpandedAgentId;
  }
  /** @deprecated Use {@link ExpandedAgentId}. */
  public set expandedAgentId(value: string | null) {
    this.ExpandedAgentId = value;
  }

  public Agents: MJAIAgentEntityExtended[] = [];

  /** @deprecated Use {@link Agents}. */
  public get agents(): MJAIAgentEntityExtended[] {
    return this.Agents;
  }
  /** @deprecated Use {@link Agents}. */
  public set agents(value: MJAIAgentEntityExtended[]) {
    this.Agents = value;
  }
  public FilteredAgents: MJAIAgentEntityExtended[] = [];

  /** @deprecated Use {@link FilteredAgents}. */
  public get filteredAgents(): MJAIAgentEntityExtended[] {
    return this.FilteredAgents;
  }
  /** @deprecated Use {@link FilteredAgents}. */
  public set filteredAgents(value: MJAIAgentEntityExtended[]) {
    this.FilteredAgents = value;
  }

  // Detail panel
  public SelectedAgent: MJAIAgentEntityExtended | null = null;

  /** @deprecated Use {@link SelectedAgent}. */
  public get selectedAgent(): MJAIAgentEntityExtended | null {
    return this.SelectedAgent;
  }
  /** @deprecated Use {@link SelectedAgent}. */
  public set selectedAgent(value: MJAIAgentEntityExtended | null) {
    this.SelectedAgent = value;
  }
  public DetailPanelVisible = false;

  /** @deprecated Use {@link DetailPanelVisible}. */
  public get detailPanelVisible() {
    return this.DetailPanelVisible;
  }
  /** @deprecated Use {@link DetailPanelVisible}. */
  public set detailPanelVisible(value) {
    this.DetailPanelVisible = value;
  }

  // Sorting state
  public SortColumn: string = 'Name';

  /** @deprecated Use {@link SortColumn}. */
  public get sortColumn(): string {
    return this.SortColumn;
  }
  /** @deprecated Use {@link SortColumn}. */
  public set sortColumn(value: string) {
    this.SortColumn = value;
  }
  public SortDirection: 'asc' | 'desc' = 'asc';

  /** @deprecated Use {@link SortDirection}. */
  public get sortDirection(): 'asc' | 'desc' {
    return this.SortDirection;
  }
  /** @deprecated Use {@link SortDirection}. */
  public set sortDirection(value: 'asc' | 'desc') {
    this.SortDirection = value;
  }

  public CurrentFilters: AgentFilter = {
    searchTerm: '',
    agentType: 'all',
    parentAgent: 'all',
    status: 'all',
    executionMode: 'all',
    exposeAsAction: 'all',
    categoryId: 'all'
  };

  /** @deprecated Use {@link CurrentFilters}. */
  public get currentFilters(): AgentFilter {
    return this.CurrentFilters;
  }
  /** @deprecated Use {@link CurrentFilters}. */
  public set currentFilters(value: AgentFilter) {
    this.CurrentFilters = value;
  }

  /** Static option arrays for the shared mj-filter-panel. */
  public readonly StatusOptions = [
    { text: 'All Statuses', value: 'all' },
    { text: 'Active',       value: 'active' },
    { text: 'Inactive',     value: 'inactive' },
  ];

  /** @deprecated Use {@link StatusOptions}. */
  public get statusOptions() {
    return this.StatusOptions;
  }
  public readonly ExecutionModeOptions = [
    { text: 'All Execution Modes', value: 'all' },
    { text: 'Sequential',          value: 'Sequential' },
    { text: 'Parallel',            value: 'Parallel' },
  ];

  /** @deprecated Use {@link ExecutionModeOptions}. */
  public get executionModeOptions() {
    return this.ExecutionModeOptions;
  }
  public readonly ExposeAsActionOptions = [
    { text: 'All Agents',       value: 'all' },
    { text: 'Exposed as Action', value: 'true' },
    { text: 'Not Exposed',       value: 'false' },
  ];

  /** @deprecated Use {@link ExposeAsActionOptions}. */
  public get exposeAsActionOptions() {
    return this.ExposeAsActionOptions;
  }

  /** Dynamic agent-type options built from AIEngineBase metadata. */
  public get AgentTypeOptions(): { text: string; value: string }[] {
    const aiEngine = AIEngineBase.Instance;
    const types = aiEngine?.AgentTypes ?? [];
    return [
      { text: 'All Types', value: 'all' },
      ...types.map(t => ({ text: t.Name, value: t.ID })),
    ];
  }

  /** @deprecated Use {@link AgentTypeOptions}. */
  public get agentTypeOptions(): { text: string; value: string }[] {
    return this.AgentTypeOptions;
  }

  /** Dynamic parent-agent options built from the loaded agents (top-level only). */
  public get ParentAgentOptions(): { text: string; value: string }[] {
    return [
      { text: 'All Agents', value: 'all' },
      { text: 'No Parent',  value: 'none' },
      ...this.Agents
        .filter(a => !a.ParentID)
        .map(a => ({ text: a.Name || 'Unnamed Agent', value: a.ID })),
    ];
  }

  /** @deprecated Use {@link ParentAgentOptions}. */
  public get parentAgentOptions(): { text: string; value: string }[] {
    return this.ParentAgentOptions;
  }

  /** View-mode options for the shared <mj-view-toggle>. */
  public readonly AgentViewOptions = [
    { key: 'grid', icon: 'fa-solid fa-grip',        title: 'Grid View' },
    { key: 'list', icon: 'fa-solid fa-list',        title: 'List View' },
    { key: 'tree', icon: 'fa-solid fa-folder-tree', title: 'Category Tree View' },
  ];

  /** @deprecated Use {@link AgentViewOptions}. */
  public get agentViewOptions() {
    return this.AgentViewOptions;
  }

  /** Field config consumed by the centralized <mj-filter-panel>. */
  public get AgentFilterFields(): FilterFieldConfig[] {
    return [
      { key: 'agentType',      type: 'dropdown', label: 'Type',            icon: 'fa-solid fa-robot',     options: this.AgentTypeOptions },
      { key: 'parentAgent',    type: 'dropdown', label: 'Parent',          icon: 'fa-solid fa-sitemap',   options: this.ParentAgentOptions, filterable: this.ParentAgentOptions.length > 10 },
      { key: 'status',         type: 'dropdown', label: 'Status',          icon: 'fa-solid fa-toggle-on', options: this.StatusOptions },
      { key: 'executionMode',  type: 'dropdown', label: 'Execution Mode',  icon: 'fa-solid fa-list-ol',   options: this.ExecutionModeOptions },
      { key: 'exposeAsAction', type: 'dropdown', label: 'Action Exposure', icon: 'fa-solid fa-share',     options: this.ExposeAsActionOptions },
    ];
  }

  /** @deprecated Use {@link AgentFilterFields}. */
  public get agentFilterFields(): FilterFieldConfig[] {
    return this.AgentFilterFields;
  }

  /** Current category selection for the tree dropdown (Category is projected into mj-filter-panel as a custom widget). */
  public SelectedCategoryKey: CompositeKey | null = null;

  /**
   * Timestamp of last real (non-null) category set. Used to swallow spurious
   * null re-emits from <mj-tree-dropdown> that arrive milliseconds after a
   * real selection — without the guard, the spurious null resets categoryId
   * to 'all' before the user sees the filtered list, making the Category
   * filter appear broken. See onCategoryChange below.
   */
  private _lastCategorySetAt = 0;

  /** Handler for the projected mj-tree-dropdown — extracts the entity ID from the CompositeKey. */
  public OnCategoryChange(value: CompositeKey | CompositeKey[] | null): void {
    // Duck-typed extraction — works whether tree-dropdown emits a real
    // CompositeKey instance or a plain object (it's currently the latter
    // when projected inside <mj-filter-panel>). Single-PK entities: take
    // the first KVP's Value; FieldName varies by entity so positional is
    // safer than name-matching.
    const single = !value || Array.isArray(value) ? null : value;

    // Swallow the spurious null re-emit that <mj-tree-dropdown> fires within
    // a few milliseconds of a real selection (confirmed empirically — the
    // null arrives ~2ms after the real CompositeKey). Without this guard, the
    // null resets categoryId to 'all' and the filter never narrows. A 100ms
    // window is short enough to never interfere with a deliberate user clear.
    const now = Date.now();
    if (single == null && (now - this._lastCategorySetAt) < 100) {
      return;
    }

    const idValue = single?.KeyValuePairs?.[0]?.Value;
    this.CurrentFilters = {
      ...this.CurrentFilters,
      categoryId: (idValue != null && idValue !== '') ? String(idValue) : 'all'
    };
    if (single != null) {
      this._lastCategorySetAt = now;
    }
    this.SelectedCategoryKey = single;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnCategoryChange}. */
  public onCategoryChange(value: CompositeKey | CompositeKey[] | null): void {
    return this.OnCategoryChange(value);
  }

  /** Receive the updated values record from <mj-filter-panel> and apply it. */
  public OnFilterValuesChange(values: Record<string, unknown>): void {
    // Preserve fields the panel doesn't own (searchTerm comes from toolbar, categoryId from tree-dropdown handler)
    this.CurrentFilters = {
      ...this.CurrentFilters,
      agentType:      (values['agentType']      as string) ?? 'all',
      parentAgent:    (values['parentAgent']    as string) ?? 'all',
      status:         (values['status']         as string) ?? 'all',
      executionMode:  (values['executionMode']  as string) ?? 'all',
      exposeAsAction: (values['exposeAsAction'] as string) ?? 'all',
    };
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnFilterValuesChange}. */
  public onFilterValuesChange(values: Record<string, unknown>): void {
    return this.OnFilterValuesChange(values);
  }

  /** Number of currently-applied filter criteria inside the popover (excludes searchTerm — surfaced separately in the header). */
  public get ActiveFilterCount(): number {
    const f = this.CurrentFilters;
    let n = 0;
    if (f.agentType && f.agentType !== 'all') n++;
    if (f.parentAgent && f.parentAgent !== 'all') n++;
    if (f.status && f.status !== 'all') n++;
    if (f.executionMode && f.executionMode !== 'all') n++;
    if (f.exposeAsAction && f.exposeAsAction !== 'all') n++;
    if (f.categoryId && f.categoryId !== 'all') n++;
    return n;
  }

  public SelectedAgentForTest: MJAIAgentEntityExtended | null = null;

  /** @deprecated Use {@link SelectedAgentForTest}. */
  public get selectedAgentForTest(): MJAIAgentEntityExtended | null {
    return this.SelectedAgentForTest;
  }
  /** @deprecated Use {@link SelectedAgentForTest}. */
  public set selectedAgentForTest(value: MJAIAgentEntityExtended | null) {
    this.SelectedAgentForTest = value;
  }

  // mj-tree configuration for category tree view
  public CategoryBranchConfig: TreeBranchConfig = {
    EntityName: 'MJ: AI Agent Categories',
    DisplayField: 'Name',
    ParentIDField: 'ParentID',
    DefaultIcon: 'fa-solid fa-folder',
    DescriptionField: 'Description',
    ExtraFilter: "Status='Active'",
    OrderBy: 'Name ASC'
  };

  public AgentLeafConfig: TreeLeafConfig = {
    EntityName: 'MJ: AI Agents',
    ParentField: 'CategoryID',
    DisplayField: 'Name',
    DefaultIcon: 'fa-solid fa-robot',
    IconField: 'IconClass',
    DescriptionField: 'Type',
    BadgeField: 'Status',
    OrderBy: 'Name ASC'
  };

  // === Permission Checks ===
  /** Cache for permission checks to avoid repeated calculations */
  private _permissionCache = new Map<string, boolean>();
  private _metadata = this.ProviderToUse;

  /** Check if user can create AI Agents */
  public get UserCanCreateAgents(): boolean {
    return this.checkEntityPermission('MJ: AI Agents', 'Create');
  }

  /** Check if user can read AI Agents */
  public get UserCanReadAgents(): boolean {
    return this.checkEntityPermission('MJ: AI Agents', 'Read');
  }

  /** Check if user can update AI Agents */
  public get UserCanUpdateAgents(): boolean {
    return this.checkEntityPermission('MJ: AI Agents', 'Update');
  }

  /** Check if user can delete AI Agents */
  public get UserCanDeleteAgents(): boolean {
    return this.checkEntityPermission('MJ: AI Agents', 'Delete');
  }

  /**
   * Helper method to check entity permissions with caching
   * @param entityName - The name of the entity to check permissions for
   * @param permissionType - The type of permission to check (Create, Read, Update, Delete)
   * @returns boolean indicating if user has the permission
   */
  private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
    const cacheKey = `${entityName}_${permissionType}`;
    
    if (this._permissionCache.has(cacheKey)) {
      return this._permissionCache.get(cacheKey)!;
    }

    try {
      const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
      
      if (!entityInfo) {
        console.warn(`Entity '${entityName}' not found for permission check`);
        this._permissionCache.set(cacheKey, false);
        return false;
      }

      const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
      let hasPermission = false;

      switch (permissionType) {
        case 'Create':
          hasPermission = userPermissions.CanCreate;
          break;
        case 'Read':
          hasPermission = userPermissions.CanRead;
          break;
        case 'Update':
          hasPermission = userPermissions.CanUpdate;
          break;
        case 'Delete':
          hasPermission = userPermissions.CanDelete;
          break;
      }

      this._permissionCache.set(cacheKey, hasPermission);
      return hasPermission;
    } catch (error) {
      console.error(`Error checking ${permissionType} permission for ${entityName}:`, error);
      this._permissionCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Clears the permission cache. Call this when user context changes or permissions are updated.
   */
  public ClearPermissionCache(): void {
    this._permissionCache.clear();
  }

  /** @deprecated Use {@link ClearPermissionCache}. */
  public clearPermissionCache(): void {
    return this.ClearPermissionCache();
  }

  constructor(
    private testHarnessService: AITestHarnessDialogService,
    private createAgentService: CreateAgentService,
    private cdr: ChangeDetectorRef
  ) {
    super();

    // Set up debounced settings persistence
    this.settingsPersistSubject.pipe(
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistUserPreferences();
    });
  }

  async ngAfterViewInit() {
    // Load saved user preferences first
    this.loadUserPreferences();

    // Apply initial state from resource configuration if provided (overrides saved prefs)
    if (this.Data?.Configuration) {
      this.applyInitialState(this.Data.Configuration);
    }

    // Load agents and categories in parallel
    await Promise.all([
      this.loadAgents(),
      this.loadCategories()
    ]);

    // Apply filters after data is loaded (uses saved preferences)
    this.applyFilters();
    this.cdr.detectChanges();

    // Notify that the resource has finished loading
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ========================================
  // User Settings Persistence
  // ========================================

  /**
   * Load saved user preferences from the UserInfoEngine
   */
  private loadUserPreferences(): void {
    try {
      const savedPrefs = UserInfoEngine.Instance.GetSetting(this.USER_SETTINGS_KEY);
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs) as AgentConfigurationUserPreferences;
        this.applyUserPreferences(prefs);
      }
    } catch (error) {
      console.warn('[AgentConfiguration] Failed to load user preferences:', error);
    } finally {
      this.settingsLoaded = true;
    }
  }

  /**
   * Apply loaded preferences to component state
   */
  private applyUserPreferences(prefs: AgentConfigurationUserPreferences): void {
    if (prefs.filterPanelVisible !== undefined) {
      this.FilterPanelVisible = prefs.filterPanelVisible;
    }
    if (prefs.viewMode) {
      this.ViewMode = prefs.viewMode;
    }
    if (prefs.sortColumn) {
      this.SortColumn = prefs.sortColumn;
    }
    if (prefs.sortDirection) {
      this.SortDirection = prefs.sortDirection;
    }
    if (prefs.filters) {
      this.CurrentFilters = {
        searchTerm: prefs.filters.searchTerm || '',
        agentType: prefs.filters.agentType || 'all',
        parentAgent: prefs.filters.parentAgent || 'all',
        status: prefs.filters.status || 'all',
        executionMode: prefs.filters.executionMode || 'all',
        exposeAsAction: prefs.filters.exposeAsAction || 'all',
        categoryId: prefs.filters.categoryId || 'all'
      };
    }
  }

  /**
   * Get current preferences as an object for saving
   */
  private getCurrentPreferences(): AgentConfigurationUserPreferences {
    return {
      filterPanelVisible: this.FilterPanelVisible,
      viewMode: this.ViewMode,
      sortColumn: this.SortColumn,
      sortDirection: this.SortDirection,
      filters: {
        ...this.CurrentFilters
      }
    };
  }

  /**
   * Persist user preferences to storage (debounced)
   */
  private saveUserPreferencesDebounced(): void {
    if (!this.settingsLoaded) return; // Don't save during initial load
    this.settingsPersistSubject.next();
  }

  /**
   * Actually persist user preferences to the UserInfoEngine
   */
  private async persistUserPreferences(): Promise<void> {
    try {
      const prefs = this.getCurrentPreferences();
      await UserInfoEngine.Instance.SetSetting(this.USER_SETTINGS_KEY, JSON.stringify(prefs));
    } catch (error) {
      console.warn('[AgentConfiguration] Failed to persist user preferences:', error);
    }
  }

  private applyInitialState(state: any): void {
    if (state.filterPanelVisible !== undefined) {
      this.FilterPanelVisible = state.filterPanelVisible;
    }
    if (state.viewMode) {
      this.ViewMode = state.viewMode;
    }
    if (state.expandedAgentId) {
      this.ExpandedAgentId = state.expandedAgentId;
    }
    if (state.currentFilters) {
      this.CurrentFilters = { ...this.CurrentFilters, ...state.currentFilters };
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      this.isLoading = true;

      // Ensure AIEngineBase is configured (no-op if already loaded)
      await AIEngineBase.Instance.Config(false);

      // Get cached agents from AIEngineBase
      this.Agents = AIEngineBase.Instance.Agents;
      this.FilteredAgents = [...this.Agents];
    } catch (error) {
      console.error('Error loading AI agents:', error);
    } finally {
      this.isLoading = false;
    }
  }

  public ToggleFilterPanel(): void {
    this.FilterPanelVisible = !this.FilterPanelVisible;
    this.emitStateChange();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link ToggleFilterPanel}. */
  public toggleFilterPanel(): void {
    return this.ToggleFilterPanel();
  }

  public OnMainSplitterChange(_event: any): void {
    this.emitStateChange();
  }

  /** @deprecated Use {@link OnMainSplitterChange}. */
  public onMainSplitterChange(_event: any): void {
    return this.OnMainSplitterChange(_event);
  }

  public OnFiltersChange(filters: AgentFilter): void {
    this.CurrentFilters = { ...filters };
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnFiltersChange}. */
  public onFiltersChange(filters: AgentFilter): void {
    return this.OnFiltersChange(filters);
  }

  public onFilterChange(): void {
    this.applyFilters();
  }

  /** Handler for the inline mj-page-search input in the page-header toolbar. */
  public OnSearchTermChange(value: string): void {
    this.CurrentFilters = { ...this.CurrentFilters, searchTerm: value ?? '' };
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnSearchTermChange}. */
  public onSearchTermChange(value: string): void {
    return this.OnSearchTermChange(value);
  }

  public OnResetFilters(): void {
    this.CurrentFilters = {
      searchTerm: '',
      agentType: 'all',
      parentAgent: 'all',
      status: 'all',
      executionMode: 'all',
      exposeAsAction: 'all',
      categoryId: 'all'
    };
    // Clear the tree-dropdown's bound value too — otherwise the dropdown
    // visually still shows the previous category after Reset (the value
    // input drives its internal display state).
    this.SelectedCategoryKey = null;
    this._lastCategorySetAt = 0;
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link OnResetFilters}. */
  public onResetFilters(): void {
    return this.OnResetFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.Agents];

    // Apply search filter (name contains)
    if (this.CurrentFilters.searchTerm) {
      const searchTerm = this.CurrentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        (agent.Name || '').toLowerCase().includes(searchTerm) ||
        (agent.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply agent type filter
    if (this.CurrentFilters.agentType !== 'all') {
      filtered = filtered.filter(agent => UUIDsEqual(agent.TypeID, this.CurrentFilters.agentType));
    }

    // Apply parent agent filter
    if (this.CurrentFilters.parentAgent !== 'all') {
      if (this.CurrentFilters.parentAgent === 'none') {
        filtered = filtered.filter(agent => !agent.ParentID);
      } else {
        filtered = filtered.filter(agent => UUIDsEqual(agent.ParentID, this.CurrentFilters.parentAgent));
      }
    }

    // Apply status filter
    if (this.CurrentFilters.status !== 'all') {
      const wantActive = this.CurrentFilters.status === 'active';
      if (wantActive) {
        filtered = filtered.filter(agent => agent.Status === 'Active');
      } else {
        filtered = filtered.filter(agent => agent.Status !== 'Active');
      }
    }

    // Apply execution mode filter
    if (this.CurrentFilters.executionMode !== 'all') {
      filtered = filtered.filter(agent => agent.ExecutionMode === this.CurrentFilters.executionMode);
    }

    // Apply expose as action filter
    if (this.CurrentFilters.exposeAsAction !== 'all') {
      const isExposed = this.CurrentFilters.exposeAsAction === 'true';
      filtered = filtered.filter(agent => agent.ExposeAsAction === isExposed);
    }

    // Apply category filter — match the selected category or any of its descendants
    if (this.CurrentFilters.categoryId !== 'all') {
      const matchingIds = this.getCategoryAndDescendantIds(this.CurrentFilters.categoryId);
      filtered = filtered.filter(agent => {
        const agentCatId = agent.CategoryID;
        return agentCatId != null && matchingIds.some(id => UUIDsEqual(id, agentCatId));
      });
    }

    // Apply sorting
    filtered = this.applySorting(filtered);

    this.FilteredAgents = filtered;
  }

  /**
   * Sort the agents by the specified column
   */
  public SortBy(column: string): void {
    if (this.SortColumn === column) {
      // Toggle direction if same column
      this.SortDirection = this.SortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.SortColumn = column;
      this.SortDirection = 'asc';
    }
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link SortBy}. */
  public sortBy(column: string): void {
    return this.SortBy(column);
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(agents: MJAIAgentEntityExtended[]): MJAIAgentEntityExtended[] {
    return agents.sort((a, b) => {
      let valueA: string | boolean | null | undefined;
      let valueB: string | boolean | null | undefined;

      switch (this.SortColumn) {
        case 'Name':
          valueA = a.Name;
          valueB = b.Name;
          break;
        case 'Status':
          valueA = a.Status;
          valueB = b.Status;
          break;
        case 'ExecutionMode':
          valueA = a.ExecutionMode;
          valueB = b.ExecutionMode;
          break;
        default:
          valueA = a.Name;
          valueB = b.Name;
      }

      // Handle null/undefined values
      const strA = (valueA ?? '').toString().toLowerCase();
      const strB = (valueB ?? '').toString().toLowerCase();

      let comparison = strA.localeCompare(strB);
      return this.SortDirection === 'desc' ? -comparison : comparison;
    });
  }

  private emitStateChange(): void {
    // State change handling - could be used for persisting user preferences in the future
    // For now, just a placeholder for tracking state changes
  }

  public SetViewMode(mode: 'grid' | 'list' | 'tree'): void {
    this.ViewMode = mode;
    this.emitStateChange();
    this.saveUserPreferencesDebounced();
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: 'grid' | 'list' | 'tree'): void {
    return this.SetViewMode(mode);
  }

  public ToggleAgentExpansion(agentId: string): void {
    this.ExpandedAgentId = this.ExpandedAgentId === agentId ? null : agentId;
  }

  /** @deprecated Use {@link ToggleAgentExpansion}. */
  public toggleAgentExpansion(agentId: string): void {
    return this.ToggleAgentExpansion(agentId);
  }

  /**
   * Show the detail panel for an agent
   */
  public ShowAgentDetails(agent: MJAIAgentEntityExtended, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.SelectedAgent = agent;
    this.DetailPanelVisible = true;
  }

  /** @deprecated Use {@link ShowAgentDetails}. */
  public showAgentDetails(agent: MJAIAgentEntityExtended, event?: Event): void {
    return this.ShowAgentDetails(agent, event);
  }

  /**
   * Close the detail panel
   */
  public CloseDetailPanel(): void {
    this.DetailPanelVisible = false;
    // Delay clearing selectedAgent for smoother animation
    setTimeout(() => {
      if (!this.DetailPanelVisible) {
        this.SelectedAgent = null;
      }
    }, 300);
  }

  /** @deprecated Use {@link CloseDetailPanel}. */
  public closeDetailPanel(): void {
    return this.CloseDetailPanel();
  }

  /**
   * Open the full entity record from the detail panel
   */
  public OpenAgentFromPanel(): void {
    if (this.SelectedAgent) {
      this.OpenAgentRecord(this.SelectedAgent.ID);
    }
    // Intent moved to the full record — a lingering panel paints over the
    // records view and greets the user with stale chrome on return.
    this.CloseDetailPanel();
  }

  /** @deprecated Use {@link OpenAgentFromPanel}. */
  public openAgentFromPanel(): void {
    return this.OpenAgentFromPanel();
  }

  /**
   * Get the parent agent name if it exists
   */
  public GetParentAgentName(agent: MJAIAgentEntityExtended): string | null {
    if (!agent.ParentID) return null;
    const parent = this.Agents.find(a => UUIDsEqual(a.ID, agent.ParentID));
    return parent?.Name || 'Unknown Parent';
  }

  /** @deprecated Use {@link GetParentAgentName}. */
  public getParentAgentName(agent: MJAIAgentEntityExtended): string | null {
    return this.GetParentAgentName(agent);
  }

  /**
   * Get agent type name
   */
  public getAgentTypeName(agent: MJAIAgentEntityExtended): string {
    return agent.Type || 'Standard Agent';
  }

  public OpenAgentRecord(agentId: string): void {
    this.navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(agentId));
  }

  /** @deprecated Use {@link OpenAgentRecord}. */
  public openAgentRecord(agentId: string): void {
    return this.OpenAgentRecord(agentId);
  }

  /**
   * Opens the create agent slide-in panel. Upon successful creation,
   * saves the agent and navigates to the new record.
   */
  public CreateNewAgent(): void {
    this.createAgentService.OpenSlideIn({
      Title: 'Create New Agent'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: async (dialogResult: CreateAgentDialogResult) => {
        if (!dialogResult.Cancelled && dialogResult.Result) {
          await this.handleAgentCreated(dialogResult.Result);
        }
      },
      error: (error) => {
        console.error('Error in create agent slide-in:', error);
        MJNotificationService.Instance.CreateSimpleNotification(
          'Error opening agent creation panel. Please try again.',
          'error',
          3000
        );
      }
    });
  }

  /** @deprecated Use {@link CreateNewAgent}. */
  public createNewAgent(): void {
    return this.CreateNewAgent();
  }

  /**
   * Handles the result from the create agent slide-in.
   * Saves the agent and navigates to the new record.
   */
  private async handleAgentCreated(result: CreateAgentResult): Promise<void> {
    try {
      const agent = result.Agent;

      // Create agent + linked prompts + linked actions in one atomic transaction.
      // agent.ID is assigned client-side by NewRecord() so we can use it on child records before submit.
      const md = this.ProviderToUse;
      const tg = await md.CreateTransactionGroup();

      agent.TransactionGroup = tg;
      await agent.Save();

      if (result.AgentPrompts && result.AgentPrompts.length > 0) {
        for (const agentPrompt of result.AgentPrompts) {
          agentPrompt.AgentID = agent.ID;
          agentPrompt.TransactionGroup = tg;
          await agentPrompt.Save();
        }
      }

      if (result.AgentActions && result.AgentActions.length > 0) {
        for (const agentAction of result.AgentActions) {
          agentAction.AgentID = agent.ID;
          agentAction.TransactionGroup = tg;
          await agentAction.Save();
        }
      }

      if (!await tg.Submit()) {
        throw new Error('Failed to save agent — all changes have been rolled back');
      }

      // Refresh the agent list
      await AIEngineBase.Instance.Config(true); // Force refresh
      await this.loadAgents();
      this.applyFilters();

      // Navigate to the new agent record
      this.navigationService.OpenEntityRecord('MJ: AI Agents', CompositeKey.FromID(agent.ID));

      MJNotificationService.Instance.CreateSimpleNotification(
        `Agent "${agent.Name}" created successfully`,
        'success',
        3000
      );
    } catch (error) {
      console.error('Error saving created agent:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        'Error saving agent. Please try again.',
        'error',
        3000
      );
    }
  }

  public RunAgent(agent: MJAIAgentEntityExtended): void {
    // Use the test harness service for window management features
    this.testHarnessService.openForAgent(agent.ID);
  }

  /** @deprecated Use {@link RunAgent}. */
  public runAgent(agent: MJAIAgentEntityExtended): void {
    return this.RunAgent(agent);
  }

  public CloseTestHarness(): void {
    // No longer needed - window manages its own closure
    this.SelectedAgentForTest = null;
  }

  /** @deprecated Use {@link CloseTestHarness}. */
  public closeTestHarness(): void {
    return this.CloseTestHarness();
  }

  public GetAgentIconColor(agent: MJAIAgentEntityExtended): string {
    // Generate a consistent color based on agent properties
    const colors = ['#17a2b8', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#007bff'];
    const index = (agent.Name?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  }

  /** @deprecated Use {@link GetAgentIconColor}. */
  public getAgentIconColor(agent: MJAIAgentEntityExtended): string {
    return this.GetAgentIconColor(agent);
  }

  public OnOpenRecord(entityName: string, recordId: string): void {
    // Arbitrary entity: resolve the key against its metadata instead of assuming a column named ID
    const compositeKey = CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(entityName), recordId);
    this.navigationService.OpenEntityRecord(entityName, compositeKey);
  }

  /** @deprecated Use {@link OnOpenRecord}. */
  public onOpenRecord(entityName: string, recordId: string): void {
    return this.OnOpenRecord(entityName, recordId);
  }

  public GetExecutionModeColor(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'info';
      case 'Parallel': return 'success';
      default: return 'info';
    }
  }

  /** @deprecated Use {@link GetExecutionModeColor}. */
  public getExecutionModeColor(mode: string): string {
    return this.GetExecutionModeColor(mode);
  }

  public GetExecutionModeIcon(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'fa-solid fa-list-ol';
      case 'Parallel': return 'fa-solid fa-layer-group';
      default: return 'fa-solid fa-robot';
    }
  }

  /** @deprecated Use {@link GetExecutionModeIcon}. */
  public getExecutionModeIcon(mode: string): string {
    return this.GetExecutionModeIcon(mode);
  }

  /**
   * Gets the agent's display icon
   * Prioritizes LogoURL, falls back to IconClass, then default robot icon
   */
  public GetAgentIcon(agent: MJAIAgentEntityExtended): string {
    if (agent?.LogoURL) {
      // LogoURL is used in img tag, not here
      return '';
    }
    return agent?.IconClass || 'fa-solid fa-robot';
  }

  /** @deprecated Use {@link GetAgentIcon}. */
  public getAgentIcon(agent: MJAIAgentEntityExtended): string {
    return this.GetAgentIcon(agent);
  }

  /**
   * Checks if the agent has a logo URL (for image display)
   */
  public HasLogoURL(agent: MJAIAgentEntityExtended): boolean {
    return !!agent?.LogoURL;
  }

  /** @deprecated Use {@link HasLogoURL}. */
  public hasLogoURL(agent: MJAIAgentEntityExtended): boolean {
    return this.HasLogoURL(agent);
  }

  // ========================================
  // Category Tree View (mj-tree)
  // ========================================

  /** Lightweight category row for descendant filtering */
  private categories: { ID: string; ParentID: string | null }[] = [];

  /** Load categories for descendant-based filter matching */
  private async loadCategories(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<{ ID: string; ParentID: string | null }>({
        EntityName: 'MJ: AI Agent Categories',
        Fields: ['ID', 'ParentID'],
        ExtraFilter: "Status='Active'",
        ResultType: 'simple'
      });
      if (result.Success) {
        this.categories = result.Results;
      }
    } catch (error) {
      console.error('[AgentConfiguration] Error loading categories:', error);
    }
  }

  /** Get a category and all its descendant IDs (for inclusive filtering) */
  private getCategoryAndDescendantIds(categoryId: string): string[] {
    const ids = [categoryId];
    const children = this.categories.filter(c => c.ParentID && UUIDsEqual(c.ParentID, categoryId));
    for (const child of children) {
      ids.push(...this.getCategoryAndDescendantIds(child.ID));
    }
    return ids;
  }

  /** Handle click on a tree node — open detail panel for agents */
  public OnTreeNodeClick(event: AfterNodeClickEventArgs): void {
    const node = event.Node;
    if (node.Type === 'leaf') {
      const agent = this.Agents.find(a => UUIDsEqual(a.ID, node.ID));
      if (agent) {
        this.ShowAgentDetails(agent);
      }
    }
  }

  /** @deprecated Use {@link OnTreeNodeClick}. */
  public onTreeNodeClick(event: AfterNodeClickEventArgs): void {
    return this.OnTreeNodeClick(event);
  }

  /** Handle double-click on a tree node — open full record for agents */
  public OnTreeNodeDoubleClick(event: AfterNodeDoubleClickEventArgs): void {
    const node = event.Node;
    if (node.Type === 'leaf') {
      this.OpenAgentRecord(node.ID);
    }
  }

  /** @deprecated Use {@link OnTreeNodeDoubleClick}. */
  public onTreeNodeDoubleClick(event: AfterNodeDoubleClickEventArgs): void {
    return this.OnTreeNodeDoubleClick(event);
  }

  // === BaseResourceComponent Required Methods ===

  /**
   * Get the display name for this resource
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Agents';
  }

  /**
   * Get the icon class for this resource
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-robot';
  }
}