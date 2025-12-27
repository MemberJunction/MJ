import { Component, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { AITestHarnessDialogService } from '@memberjunction/ng-ai-test-harness';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';

interface AgentFilter {
  searchTerm: string;
  agentType: string;
  parentAgent: string;
  status: string;
  executionMode: string;
  exposeAsAction: string;
}

/**
 * Tree-shaking prevention function - ensures component is included in builds
 */
export function LoadAIAgentsResource() {
  // Force inclusion in production builds
}

/**
 * AI Agents Resource - displays AI agent configuration and management
 * Extends BaseResourceComponent to work with the resource type system
 */
@RegisterClass(BaseResourceComponent, 'AIAgentsResource')
@Component({
  selector: 'app-agent-configuration',
  templateUrl: './agent-configuration.component.html',
  styleUrls: ['./agent-configuration.component.css']
})
export class AgentConfigurationComponent extends BaseResourceComponent implements AfterViewInit, OnDestroy {
  public isLoading = false;
  public filterPanelVisible = true;
  public viewMode: 'grid' | 'list' = 'grid';
  public expandedAgentId: string | null = null;
  
  public agents: AIAgentEntityExtended[] = [];
  public filteredAgents: AIAgentEntityExtended[] = [];

  // Detail panel
  public selectedAgent: AIAgentEntityExtended | null = null;
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
    exposeAsAction: 'all'
  };

  public selectedAgentForTest: AIAgentEntityExtended | null = null;

  // === Permission Checks ===
  /** Cache for permission checks to avoid repeated calculations */
  private _permissionCache = new Map<string, boolean>();
  private _metadata = new Metadata();

  /** Check if user can create AI Agents */
  public get UserCanCreateAgents(): boolean {
    return this.checkEntityPermission('AI Agents', 'Create');
  }

  /** Check if user can read AI Agents */
  public get UserCanReadAgents(): boolean {
    return this.checkEntityPermission('AI Agents', 'Read');
  }

  /** Check if user can update AI Agents */
  public get UserCanUpdateAgents(): boolean {
    return this.checkEntityPermission('AI Agents', 'Update');
  }

  /** Check if user can delete AI Agents */
  public get UserCanDeleteAgents(): boolean {
    return this.checkEntityPermission('AI Agents', 'Delete');
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
    private navigationService: NavigationService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  async ngAfterViewInit() {
    // Apply initial state from resource configuration if provided
    if (this.Data?.Configuration) {
      this.applyInitialState(this.Data.Configuration);
    }
    await this.loadAgents();

    // Notify that the resource has finished loading
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    // Clean up if needed
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
  }

  public onMainSplitterChange(_event: any): void {
    this.emitStateChange();
  }

  public onFiltersChange(filters: AgentFilter): void {
    this.currentFilters = { ...filters };
    this.applyFilters();
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
      exposeAsAction: 'all'
    };
    this.applyFilters();
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
      filtered = filtered.filter(agent => agent.TypeID === this.currentFilters.agentType);
    }

    // Apply parent agent filter
    if (this.currentFilters.parentAgent !== 'all') {
      if (this.currentFilters.parentAgent === 'none') {
        filtered = filtered.filter(agent => !agent.ParentID);
      } else {
        filtered = filtered.filter(agent => agent.ParentID === this.currentFilters.parentAgent);
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

    // Apply sorting
    filtered = this.applySorting(filtered);

    this.filteredAgents = filtered;
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
  }

  /**
   * Apply sorting to the filtered list
   */
  private applySorting(agents: AIAgentEntityExtended[]): AIAgentEntityExtended[] {
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

  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
    this.emitStateChange();
  }

  public toggleAgentExpansion(agentId: string): void {
    this.expandedAgentId = this.expandedAgentId === agentId ? null : agentId;
  }

  /**
   * Show the detail panel for an agent
   */
  public showAgentDetails(agent: AIAgentEntityExtended, event?: Event): void {
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
  public getParentAgentName(agent: AIAgentEntityExtended): string | null {
    if (!agent.ParentID) return null;
    const parent = this.agents.find(a => a.ID === agent.ParentID);
    return parent?.Name || 'Unknown Parent';
  }

  /**
   * Get agent type name
   */
  public getAgentTypeName(agent: AIAgentEntityExtended): string {
    return agent.Type || 'Standard Agent';
  }

  public openAgentRecord(agentId: string): void {
    const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: agentId }]);
    this.navigationService.OpenEntityRecord('AI Agents', compositeKey);
  }

  public createNewAgent(): void {
    // Use the standard MemberJunction pattern to open a new AI Agent form
    // Empty CompositeKey indicates a new record
    this.navigationService.OpenEntityRecord('AI Agents', new CompositeKey([]));
  }

  public runAgent(agent: AIAgentEntityExtended): void {
    // Use the test harness service for window management features
    this.testHarnessService.openForAgent(agent.ID);
  }

  public closeTestHarness(): void {
    // No longer needed - window manages its own closure
    this.selectedAgentForTest = null;
  }

  public getAgentIconColor(agent: AIAgentEntityExtended): string {
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
  public getAgentIcon(agent: AIAgentEntityExtended): string {
    if (agent?.LogoURL) {
      // LogoURL is used in img tag, not here
      return '';
    }
    return agent?.IconClass || 'fa-solid fa-robot';
  }

  /**
   * Checks if the agent has a logo URL (for image display)
   */
  public hasLogoURL(agent: AIAgentEntityExtended): boolean {
    return !!agent?.LogoURL;
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