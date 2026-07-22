import { Component, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { ResourceData, MJRoleEntity, MJEntityPermissionEntity } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { RoleDialogData, RoleDialogResult } from './role-dialog/role-dialog.component';
import {
  buildRoleManagementAgentContext,
  isValidRoleTypeFilter,
  resolveRoleByIDOrName,
  RoleManagementAgentContextInput,
  RolePermissionSummary,
} from './role-management-agent-context';

interface RoleStats {
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
  activeRoles: number;
}

interface FilterOptions {
  type: 'all' | 'system' | 'custom';
  search: string;
}

@Component({
  standalone: false,
  selector: 'mj-role-management',
  templateUrl: './role-management.component.html',
  styleUrls: ['../shared/styles/_admin-patterns.css', './role-management.component.css']
})
@RegisterClass(BaseDashboard, 'RoleManagement')
export class RoleManagementComponent extends BaseDashboard implements OnDestroy {
  // State management
  public roles: MJRoleEntity[] = [];
  public filteredRoles: MJRoleEntity[] = [];
  public selectedRole: MJRoleEntity | null = null;
  public isLoading = false;
  public error: string | null = null;

  // Dialog state
  public showRoleDialog = false;
  public roleDialogData: RoleDialogData | null = null;

  // Stats
  public stats: RoleStats = {
    totalRoles: 0,
    systemRoles: 0,
    customRoles: 0,
    activeRoles: 0
  };

  // Filters
  public filters$ = new BehaviorSubject<FilterOptions>({
    type: 'all',
    search: ''
  });

  // UI State
  public showCreateDialog = false;
  public showEditDialog = false;
  public showDeleteConfirm = false;
  public expandedRoleId: string | null = null;

  // Role permissions (simplified view)
  public rolePermissions: Map<string, string[]> = new Map();

  // Read-only entity-permission summary per role id (lazily loaded on selection),
  // used only to surface a non-sensitive count summary to the agent context.
  private permissionSummaryCache = new Map<string, RolePermissionSummary>();
  private selectedRolePermissionSummary: RolePermissionSummary | null = null;

  protected override destroy$ = new Subject<void>();
  private get metadata() { return this.ProviderToUse; }
  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Role Management"
  }

  protected initDashboard(): void {
    this.setupFilterSubscription();
    this.registerAgentClientTools();
  }

  protected loadData(): void {
    this.loadInitialData();
  }

  // ================================================================
  // AI Agent Context & Client Tools
  //
  // 🚨 SAFETY BOUNDARY — READ-ONLY / GOVERNANCE SURFACE 🚨
  // Role Management is a security-sensitive admin surface. The agent context
  // and client tools registered here are strictly READ-ONLY / navigational:
  // type filter, free-text search, SELECTING a role (view, with a read-only
  // permission-count summary), clearing filters, refreshing, and navigating to
  // a role's record for viewing. The mutating operations on this component —
  // create/edit/delete roles — AND any permission-grant/revoke surface are
  // DELIBERATELY NOT exposed to the agent; they remain human-initiated. The
  // permission summary published here is COUNTS ONLY (how many entities the role
  // can read/create/update/delete) — never a grant control. Context exposes only
  // counts, active filter selection, and on-screen display names.
  // ================================================================

  /**
   * Publish the current role-management state to the AI agent. Re-invoked on
   * every meaningful state change (data load, filter, selection). Shaped by the
   * pure {@link buildRoleManagementAgentContext} helper (unit-tested in isolation).
   */
  private publishAgentContext(): void {
    const selected = this.expandedRoleId
      ? this.roles.find(r => UUIDsEqual(r.ID, this.expandedRoleId!)) ?? null
      : null;
    const input: RoleManagementAgentContextInput = {
      TotalRoleCount: this.roles.length,
      FilteredRoleCount: this.filteredRoles.length,
      SystemRoleCount: this.stats.systemRoles,
      CustomRoleCount: this.stats.customRoles,
      TypeFilter: this.filters$.value.type,
      SearchText: this.filters$.value.search,
      SelectedRoleId: selected?.ID ?? null,
      SelectedRoleName: selected?.Name ?? null,
      VisibleRoleNames: this.filteredRoles.map(r => r.Name ?? '').filter(n => n !== ''),
      SelectedRolePermissions: selected ? this.selectedRolePermissionSummary : null,
    };
    this.navigationService.SetAgentContext(this, buildRoleManagementAgentContext(input));
  }

  /**
   * Register the read-only / navigational client tools the agent may invoke.
   * Every Handler is tolerant: validates input and returns
   * `{ Success: false, ErrorMessage }` rather than throwing.
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'FilterRolesByType',
        Description: 'Filter the role list by type. Valid values: all, system, custom.',
        ParameterSchema: { type: 'object', properties: { type: { type: 'string', enum: ['all', 'system', 'custom'] } }, required: ['type'] },
        Handler: async (params: Record<string, unknown>) => this.handleFilterByTypeTool(params),
      },
      {
        Name: 'SearchRoles',
        Description: 'Free-text search across role name and description.',
        ParameterSchema: { type: 'object', properties: { searchText: { type: 'string' } }, required: ['searchText'] },
        Handler: async (params: Record<string, unknown>) => this.handleSearchTool(params),
      },
      {
        Name: 'SelectRole',
        Description: 'Select a role for VIEWING by ID or name (exact ID → exact name → partial match). Read-only — does not edit the role. Loads a read-only permission-count summary into SelectedRolePermissions.',
        ParameterSchema: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] },
        Handler: async (params: Record<string, unknown>) => this.handleSelectRoleTool(params),
      },
      {
        Name: 'NavigateToRoleRecord',
        Description: 'Open the record for a role (by ID or name) in a tab for VIEWING. Read-only navigation — does not edit the role.',
        ParameterSchema: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] },
        Handler: async (params: Record<string, unknown>) => this.handleNavigateToRoleRecordTool(params),
      },
      {
        Name: 'ClearRoleFilters',
        Description: 'Clear all role filters (type and search) and show the full list.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.handleClearFiltersTool(),
      },
      {
        Name: 'RefreshRoles',
        Description: 'Reload the role list from the server. Read-only — does not mutate any data.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.handleRefreshTool(),
      },
    ]);
  }

  private handleFilterByTypeTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const type = params?.['type'];
    if (!isValidRoleTypeFilter(type)) {
      return { Success: false, ErrorMessage: `Invalid type "${String(type)}". Expected one of: all, system, custom.` };
    }
    this.onTypeFilterChange(type);
    this.publishAgentContext();
    return { Success: true };
  }

  private handleSearchTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const searchText = params?.['searchText'];
    if (typeof searchText !== 'string') {
      return { Success: false, ErrorMessage: 'searchText must be a string.' };
    }
    this.updateFilter({ search: searchText });
    this.publishAgentContext();
    return { Success: true };
  }

  private async handleSelectRoleTool(params: Record<string, unknown>): Promise<{ Success: boolean; ErrorMessage?: string }> {
    const raw = String(params?.['role'] ?? '');
    const resolved = resolveRoleByIDOrName(raw, this.roles.map(r => ({ ID: r.ID, Name: r.Name ?? '' })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    this.expandedRoleId = resolved.match.ID;
    this.selectedRolePermissionSummary = await this.loadPermissionSummary(resolved.match.ID);
    this.cdr.markForCheck();
    this.publishAgentContext();
    return { Success: true };
  }

  private handleNavigateToRoleRecordTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const raw = String(params?.['role'] ?? '');
    const resolved = resolveRoleByIDOrName(raw, this.roles.map(r => ({ ID: r.ID, Name: r.Name ?? '' })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    this.navigationService.OpenEntityRecord('MJ: Roles', CompositeKey.FromID(resolved.match.ID));
    return { Success: true };
  }

  /**
   * Lazily load and cache the READ-ONLY entity-permission count summary for a role.
   * Surfaces only how broadly the role is granted access — never a grant control.
   */
  private async loadPermissionSummary(roleId: string): Promise<RolePermissionSummary> {
    const cached = this.permissionSummaryCache.get(roleId);
    if (cached) {
      return cached;
    }
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJEntityPermissionEntity>({
      EntityName: 'MJ: Entity Permissions',
      ExtraFilter: `RoleID='${roleId.replace(/'/g, "''")}'`,
      ResultType: 'entity_object'
    });
    const rows = result.Success ? result.Results : [];
    const summary: RolePermissionSummary = {
      EntityCount: rows.length,
      ReadCount: rows.filter(p => p.CanRead).length,
      CreateCount: rows.filter(p => p.CanCreate).length,
      UpdateCount: rows.filter(p => p.CanUpdate).length,
      DeleteCount: rows.filter(p => p.CanDelete).length,
    };
    this.permissionSummaryCache.set(roleId, summary);
    return summary;
  }

  private handleClearFiltersTool(): { Success: boolean } {
    this.resetAllFiltersAndSearch();
    this.publishAgentContext();
    return { Success: true };
  }

  private async handleRefreshTool(): Promise<{ Success: boolean; ErrorMessage?: string }> {
    try {
      this.permissionSummaryCache.clear();
      this.selectedRolePermissionSummary = null;
      await this.loadInitialData();
      this.publishAgentContext();
      return { Success: true };
    } catch (e) {
      return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
    }
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }
  
  public async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load roles
      const roles = await this.loadRoles();
      this.roles = roles;
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading role data:', error);
      this.error = 'Failed to load role data. Please try again.';
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
        this.publishAgentContext();
      });
    }
  }

  private async loadRoles(): Promise<MJRoleEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJRoleEntity>({
      EntityName: 'MJ: Roles',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private setupFilterSubscription(): void {
    this.filters$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.applyFilters();
        this.publishAgentContext();
      });
  }

  private applyFilters(): void {
    const filters = this.filters$.value;
    let filtered = [...this.roles];
    
    // Apply type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(role => {
        const isSystem = this.isSystemRole(role);
        return filters.type === 'system' ? isSystem : !isSystem;
      });
    }
    
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(role =>
        role.Name?.toLowerCase().includes(searchLower) ||
        role.Description?.toLowerCase().includes(searchLower)
      );
    }
    
    this.filteredRoles = filtered;
  }
  
  private calculateStats(): void {
    const systemRoles = this.roles.filter(r => this.isSystemRole(r));
    
    this.stats = {
      totalRoles: this.roles.length,
      systemRoles: systemRoles.length,
      customRoles: this.roles.length - systemRoles.length,
      activeRoles: this.roles.length // All roles are considered active for now
    };
  }
  
  public isSystemRole(role: MJRoleEntity): boolean {
    // System roles typically have certain naming patterns or flags
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(role.Name || '');
  }
  
  // Public methods for template
  public onTypeFilterChange(type: 'all' | 'system' | 'custom'): void {
    this.updateFilter({ type });
  }
  
  public updateFilter(partial: Partial<FilterOptions>): void {
    this.filters$.next({
      ...this.filters$.value,
      ...partial
    });
    // Discrete changes (chips) apply immediately. Text search still goes
    // through the 300ms debounce in setupFilterSubscription.
    if (!('search' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  // -- Concise chrome: one Filter popover (Type) + applied-filter chips -------

  public get filterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'type',
        type: 'chips',
        label: 'Type',
        chipOptions: [
          { text: 'All', value: 'all' },
          { text: 'System', value: 'system' },
          { text: 'Custom', value: 'custom' },
        ],
      },
    ];
  }

  public get filterValues(): Record<string, unknown> {
    return { type: this.filters$.value.type };
  }

  /** Total active filters (Type) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    return this.filters$.value.type !== 'all' ? 1 : 0;
  }

  public onFilterPanelChange(values: Record<string, unknown>): void {
    if ('type' in values) {
      this.updateFilter({ type: (values['type'] as FilterOptions['type']) || 'all' });
    }
  }

  /** Clear all filters (Type); search persists. */
  public clearAllAppliedFilters(): void {
    this.updateFilter({ type: 'all' });
  }

  /** True when search and/or panel filters are narrowing the list — gates the
   *  no-results empty-state "Reset filters" CTA. */
  public get IsListNarrowed(): boolean {
    return this.filters$.value.search !== '' || this.TotalActiveFilterCount > 0;
  }

  /** Reset everything narrowing the list (search + Type) and refresh
   *  immediately. Wired to the no-results empty-state CTA. Unlike
   *  clearAllAppliedFilters(), this also clears the search box. */
  public resetAllFiltersAndSearch(): void {
    this.filters$.next({ type: 'all', search: '' });
    this.applyFilters();
    this.cdr.markForCheck();
  }
  
  public toggleRoleExpansion(roleId: string): void {
    this.expandedRoleId = this.expandedRoleId === roleId ? null : roleId;
    if (this.expandedRoleId) {
      // Lazy-load the read-only permission summary so the agent context reflects
      // the user's current selection; fire-and-forget (re-publishes on completion).
      void this.loadPermissionSummary(this.expandedRoleId).then(summary => {
        this.selectedRolePermissionSummary = summary;
        this.publishAgentContext();
      });
    } else {
      this.selectedRolePermissionSummary = null;
    }
    this.publishAgentContext();
  }
  
  public isRoleExpanded(roleId: string): boolean {
    return this.expandedRoleId === roleId;
  }
  
  public createNewRole(): void {
    this.roleDialogData = {
      mode: 'create'
    };
    this.showRoleDialog = true;
  }
  
  public editRole(role: MJRoleEntity): void {
    this.roleDialogData = {
      role: role,
      mode: 'edit'
    };
    this.showRoleDialog = true;
  }
  
  public confirmDeleteRole(role: MJRoleEntity): void {
    this.selectedRole = role;
    this.showDeleteConfirm = true;
  }
  
  public async deleteRole(): Promise<void> {
    if (!this.selectedRole) return;
    
    try {
      // Load role entity to delete
      const role = await this.metadata.GetEntityObject<MJRoleEntity>('MJ: Roles');
      const loadResult = await role.Load(this.selectedRole.ID);
      
      if (loadResult) {
        const deleteResult = await role.Delete();
        if (deleteResult) {
          this.showDeleteConfirm = false;
          this.selectedRole = null;
          await this.loadInitialData();
        } else {
          throw new Error(role.LatestResult?.Message || 'Failed to delete role');
        }
      } else {
        throw new Error('Role not found or permission denied');
      }
    } catch (error: unknown) {
      console.error('Error deleting role:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Failed to delete role';
        this.cdr.markForCheck();
      });
    }
  }
  
  public getRoleIcon(role: MJRoleEntity): string {
    if (this.isSystemRole(role)) {
      return 'fa-shield-halved';
    }
    return 'fa-user-tag';
  }
  
  public getRoleTypeLabel(role: MJRoleEntity): string {
    return this.isSystemRole(role) ? 'System' : 'Custom';
  }
  
  public getRoleTypeClass(role: MJRoleEntity): string {
    return this.isSystemRole(role) ? 'badge-system' : 'badge-custom';
  }
  
  public refreshData(): void {
    this.loadInitialData();
  }

  public onRoleDialogResult(result: RoleDialogResult): void {
    this.showRoleDialog = false;
    this.roleDialogData = null;
    
    if (result.action === 'save') {
      // Refresh the role list to show changes
      this.loadInitialData();
    }
  }
}