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

interface AgentFilter {
  searchTerm: string;
  agentType: string;
  parentAgent: string;
  status: string;
  executionMode: string;
  exposeAsAction: string;
  categoryId: string;
}

/** Lightweight category row for tree-view grouping */
interface CategoryInfo {
  ID: string;
  Name: string;
  ParentID: string | null;
  Description: string | null;
}

/** A category node with nested agents and child categories for tree rendering */
export interface CategoryTreeNode {
  Category: CategoryInfo;
  Agents: MJAIAgentEntityExtended[];
  Children: CategoryTreeNode[];
  Expanded: boolean;
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
  private destroy$ = new Subject<void>();
  private settingsLoaded = false;

  public isLoading = false;
  public filterPanelVisible = true;
  public viewMode: 'grid' | 'list' | 'tree' = 'grid';
  public expandedAgentId: string | null = null;

  public agents: MJAIAgentEntityExtended[] = [];
  public filteredAgents: MJAIAgentEntityExtended[] = [];

  // Detail panel
  public selectedAgent: MJAIAgentEntityExtended | null = null;
  public detailPanelVisible = false;

  // Sorting state
  public sortColumn: string = 'Name';
  public sortDirection: 'asc' | 'desc' = 'asc';

  public currentFilters: AgentFilter = {
    searchTerm: '',
    agentType: 'all',
    parentAgent: 'all',
    status: 'all',
    executionMode: 'all',
    exposeAsAction: 'all',
    categoryId: 'all'
  };

  public selectedAgentForTest: MJAIAgentEntityExtended | null = null;

  // Category tree view data
  public categoryTree: CategoryTreeNode[] = [];
  public uncategorizedAgents: MJAIAgentEntityExtended[] = [];
  private categories: CategoryInfo[] = [];

  // === Permission Checks ===
  /** Cache for permission checks to avoid repeated calculations */
  private _permissionCache = new Map<string, boolean>();
  private _metadata = new Metadata();

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
  public clearPermissionCache(): void {
    this._permissionCache.clear();
  }

  constructor(
    private testHarnessService: AITestHarnessDialogService,
    private createAgentService: CreateAgentService,
    private navigationService: NavigationService,
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
    await this.loadAgents();

    // Apply filters after data is loaded (uses saved preferences)
    this.applyFilters();

    // If tree view mode is active, load categories for the tree
    if (this.viewMode === 'tree') {
      this.loadCategoriesAndBuildTree();
    }

    // Notify that the resource has finished loading
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
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
      this.filterPanelVisible = prefs.filterPanelVisible;
    }
    if (prefs.viewMode) {
      this.viewMode = prefs.viewMode;
    }
    if (prefs.sortColumn) {
      this.sortColumn = prefs.sortColumn;
    }
    if (prefs.sortDirection) {
      this.sortDirection = prefs.sortDirection;
    }
    if (prefs.filters) {
      this.currentFilters = {
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
      filterPanelVisible: this.filterPanelVisible,
      viewMode: this.viewMode,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      filters: {
        ...this.currentFilters
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
      this.filterPanelVisible = state.filterPanelVisible;
    }
    if (state.viewMode) {
      this.viewMode = state.viewMode;
    }
    if (state.expandedAgentId) {
      this.expandedAgentId = state.expandedAgentId;
    }
    if (state.currentFilters) {
      this.currentFilters = { ...this.currentFilters, ...state.currentFilters };
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      this.isLoading = true;

      // Ensure AIEngineBase is configured (no-op if already loaded)
      await AIEngineBase.Instance.Config(false);

      // Get cached agents from AIEngineBase
      this.agents = AIEngineBase.Instance.Agents;
      this.filteredAgents = [...this.agents];
    } catch (error) {
      console.error('Error loading AI agents:', error);
    } finally {
      this.isLoading = false;
      // force change detection to update the view
      this.cdr.detectChanges();
    }
  }

  public toggleFilterPanel(): void {
    this.filterPanelVisible = !this.filterPanelVisible;
    this.emitStateChange();
    this.saveUserPreferencesDebounced();
  }

  public onMainSplitterChange(_event: any): void {
    this.emitStateChange();
  }

  public onFiltersChange(filters: AgentFilter): void {
    this.currentFilters = { ...filters };
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  public onFilterChange(): void {
    this.applyFilters();
  }

  public onResetFilters(): void {
    this.currentFilters = {
      searchTerm: '',
      agentType: 'all',
      parentAgent: 'all',
      status: 'all',
      executionMode: 'all',
      exposeAsAction: 'all',
      categoryId: 'all'
    };
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  private applyFilters(): void {
    let filtered = [...this.agents];

    // Apply search filter (name contains)
    if (this.currentFilters.searchTerm) {
      const searchTerm = this.currentFilters.searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        (agent.Name || '').toLowerCase().includes(searchTerm) ||
        (agent.Description || '').toLowerCase().includes(searchTerm)
      );
    }

    // Apply agent type filter
    if (this.currentFilters.agentType !== 'all') {
      filtered = filtered.filter(agent => UUIDsEqual(agent.TypeID, this.currentFilters.agentType));
    }

    // Apply parent agent filter
    if (this.currentFilters.parentAgent !== 'all') {
      if (this.currentFilters.parentAgent === 'none') {
        filtered = filtered.filter(agent => !agent.ParentID);
      } else {
        filtered = filtered.filter(agent => UUIDsEqual(agent.ParentID, this.currentFilters.parentAgent));
      }
    }

    // Apply status filter
    if (this.currentFilters.status !== 'all') {
      const wantActive = this.currentFilters.status === 'active';
      if (wantActive) {
        filtered = filtered.filter(agent => agent.Status === 'Active');
      } else {
        filtered = filtered.filter(agent => agent.Status !== 'Active');
      }
    }

    // Apply execution mode filter
    if (this.currentFilters.executionMode !== 'all') {
      filtered = filtered.filter(agent => agent.ExecutionMode === this.currentFilters.executionMode);
    }

    // Apply expose as action filter
    if (this.currentFilters.exposeAsAction !== 'all') {
      const isExposed = this.currentFilters.exposeAsAction === 'true';
      filtered = filtered.filter(agent => agent.ExposeAsAction === isExposed);
    }

    // Apply category filter — match the selected category or any of its descendants
    if (this.currentFilters.categoryId !== 'all') {
      const matchingIds = this.getCategoryAndDescendantIds(this.currentFilters.categoryId);
      filtered = filtered.filter(agent => {
        const agentCatId = agent.CategoryID;
        return agentCatId != null && matchingIds.some(id => UUIDsEqual(id, agentCatId));
      });
    }

    // Apply sorting
    filtered = this.applySorting(filtered);

    this.filteredAgents = filtered;

    // Rebuild tree view data when filters change
    if (this.viewMode === 'tree') {
      this.buildCategoryTree();
    }
  }

  /**
   * Sort the agents by the specified column
   */
  public sortBy(column: string): void {
    if (this.sortColumn === column) {
      // Toggle direction if same column
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // New column, default to ascending
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
    this.saveUserPreferencesDebounced();
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(agents: MJAIAgentEntityExtended[]): MJAIAgentEntityExtended[] {
    return agents.sort((a, b) => {
      let valueA: string | boolean | null | undefined;
      let valueB: string | boolean | null | undefined;

      switch (this.sortColumn) {
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
      return this.sortDirection === 'desc' ? -comparison : comparison;
    });
  }

  private emitStateChange(): void {
    // State change handling - could be used for persisting user preferences in the future
    // For now, just a placeholder for tracking state changes
  }

  public setViewMode(mode: 'grid' | 'list' | 'tree'): void {
    this.viewMode = mode;
    if (mode === 'tree' && this.categories.length === 0) {
      this.loadCategoriesAndBuildTree();
    } else if (mode === 'tree') {
      this.buildCategoryTree();
    }
    this.emitStateChange();
    this.saveUserPreferencesDebounced();
  }

  public toggleAgentExpansion(agentId: string): void {
    this.expandedAgentId = this.expandedAgentId === agentId ? null : agentId;
  }

  /**
   * Show the detail panel for an agent
   */
  public showAgentDetails(agent: MJAIAgentEntityExtended, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.selectedAgent = agent;
    this.detailPanelVisible = true;
  }

  /**
   * Close the detail panel
   */
  public closeDetailPanel(): void {
    this.detailPanelVisible = false;
    // Delay clearing selectedAgent for smoother animation
    setTimeout(() => {
      if (!this.detailPanelVisible) {
        this.selectedAgent = null;
      }
    }, 300);
  }

  /**
   * Open the full entity record from the detail panel
   */
  public openAgentFromPanel(): void {
    if (this.selectedAgent) {
      this.openAgentRecord(this.selectedAgent.ID);
    }
  }

  /**
   * Get the parent agent name if it exists
   */
  public getParentAgentName(agent: MJAIAgentEntityExtended): string | null {
    if (!agent.ParentID) return null;
    const parent = this.agents.find(a => UUIDsEqual(a.ID, agent.ParentID));
    return parent?.Name || 'Unknown Parent';
  }

  /**
   * Get agent type name
   */
  public getAgentTypeName(agent: MJAIAgentEntityExtended): string {
    return agent.Type || 'Standard Agent';
  }

  public openAgentRecord(agentId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: agentId }]);
    this.navigationService.OpenEntityRecord('MJ: AI Agents', compositeKey);
  }

  /**
   * Opens the create agent slide-in panel. Upon successful creation,
   * saves the agent and navigates to the new record.
   */
  public createNewAgent(): void {
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

  /**
   * Handles the result from the create agent slide-in.
   * Saves the agent and navigates to the new record.
   */
  private async handleAgentCreated(result: CreateAgentResult): Promise<void> {
    try {
      const agent = result.Agent;

      // Save the agent
      const saveResult = await agent.Save();
      if (!saveResult) {
        throw new Error('Failed to save agent');
      }

      // Save linked prompts if any
      if (result.AgentPrompts && result.AgentPrompts.length > 0) {
        for (const agentPrompt of result.AgentPrompts) {
          // Update the AgentID to the saved agent's ID
          agentPrompt.AgentID = agent.ID;
          await agentPrompt.Save();
        }
      }

      // Save linked actions if any
      if (result.AgentActions && result.AgentActions.length > 0) {
        for (const agentAction of result.AgentActions) {
          // Update the AgentID to the saved agent's ID
          agentAction.AgentID = agent.ID;
          await agentAction.Save();
        }
      }

      // Refresh the agent list
      await AIEngineBase.Instance.Config(true); // Force refresh
      await this.loadAgents();
      this.applyFilters();

      // Navigate to the new agent record
      const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: agent.ID }]);
      this.navigationService.OpenEntityRecord('MJ: AI Agents', compositeKey);

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

  public runAgent(agent: MJAIAgentEntityExtended): void {
    // Use the test harness service for window management features
    this.testHarnessService.openForAgent(agent.ID);
  }

  public closeTestHarness(): void {
    // No longer needed - window manages its own closure
    this.selectedAgentForTest = null;
  }

  public getAgentIconColor(agent: MJAIAgentEntityExtended): string {
    // Generate a consistent color based on agent properties
    const colors = ['#17a2b8', '#28a745', '#ffc107', '#dc3545', '#6c757d', '#007bff'];
    const index = (agent.Name?.charCodeAt(0) || 0) % colors.length;
    return colors[index];
  }

  public onOpenRecord(entityName: string, recordId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: recordId }]);
    this.navigationService.OpenEntityRecord(entityName, compositeKey);
  }

  public getExecutionModeColor(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'info';
      case 'Parallel': return 'success';
      default: return 'info';
    }
  }

  public getExecutionModeIcon(mode: string): string {
    switch (mode) {
      case 'Sequential': return 'fa-solid fa-list-ol';
      case 'Parallel': return 'fa-solid fa-layer-group';
      default: return 'fa-solid fa-robot';
    }
  }

  /**
   * Gets the agent's display icon
   * Prioritizes LogoURL, falls back to IconClass, then default robot icon
   */
  public getAgentIcon(agent: MJAIAgentEntityExtended): string {
    if (agent?.LogoURL) {
      // LogoURL is used in img tag, not here
      return '';
    }
    return agent?.IconClass || 'fa-solid fa-robot';
  }

  /**
   * Checks if the agent has a logo URL (for image display)
   */
  public hasLogoURL(agent: MJAIAgentEntityExtended): boolean {
    return !!agent?.LogoURL;
  }

  // ========================================
  // Category Tree View
  // ========================================

  /** Load categories from the database and build the tree structure */
  private async loadCategoriesAndBuildTree(): Promise<void> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<CategoryInfo>({
        EntityName: 'MJ: AI Agent Categories',
        Fields: ['ID', 'Name', 'ParentID', 'Description'],
        ExtraFilter: "Status='Active'",
        OrderBy: 'Name ASC',
        ResultType: 'simple'
      });
      if (result.Success) {
        this.categories = result.Results;
        this.buildCategoryTree();
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('[AgentConfiguration] Error loading categories:', error);
    }
  }

  /** Build tree nodes from flat categories + filtered agents */
  private buildCategoryTree(): void {
    const agentsByCategory = new Map<string, MJAIAgentEntityExtended[]>();
    const uncategorized: MJAIAgentEntityExtended[] = [];

    for (const agent of this.filteredAgents) {
      const catId = agent.CategoryID;
      if (catId) {
        const normalizedId = catId.toUpperCase();
        if (!agentsByCategory.has(normalizedId)) {
          agentsByCategory.set(normalizedId, []);
        }
        agentsByCategory.get(normalizedId)!.push(agent);
      } else {
        uncategorized.push(agent);
      }
    }

    // Build tree from root categories (ParentID is null)
    const rootCategories = this.categories.filter(c => !c.ParentID);
    this.categoryTree = rootCategories.map(c => this.buildTreeNode(c, agentsByCategory));
    this.uncategorizedAgents = uncategorized;
  }

  /** Recursively build a CategoryTreeNode */
  private buildTreeNode(
    category: CategoryInfo,
    agentsByCategory: Map<string, MJAIAgentEntityExtended[]>
  ): CategoryTreeNode {
    const children = this.categories
      .filter(c => c.ParentID && UUIDsEqual(c.ParentID, category.ID))
      .map(c => this.buildTreeNode(c, agentsByCategory));

    const normalizedId = category.ID.toUpperCase();
    return {
      Category: category,
      Agents: agentsByCategory.get(normalizedId) || [],
      Children: children,
      Expanded: true // default expanded
    };
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

  /** Toggle a category node's expanded state in the tree view */
  public toggleCategoryNode(node: CategoryTreeNode): void {
    node.Expanded = !node.Expanded;
  }

  /** Check if a tree node has any visible content (agents or children with content) */
  public hasVisibleContent(node: CategoryTreeNode): boolean {
    if (node.Agents.length > 0) return true;
    return node.Children.some(child => this.hasVisibleContent(child));
  }

  /** Get the total agent count for a category including all descendants */
  public getAgentCount(node: CategoryTreeNode): number {
    let count = node.Agents.length;
    for (const child of node.Children) {
      count += this.getAgentCount(child);
    }
    return count;
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