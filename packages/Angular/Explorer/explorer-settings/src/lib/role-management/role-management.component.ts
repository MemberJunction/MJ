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
  BuildRoleManagementAgentContext,
  IsValidRoleTypeFilter,
  ResolveRoleByIDOrName,
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
  public Roles: MJRoleEntity[] = [];

  /** @deprecated Use {@link Roles}. */
  public get roles(): MJRoleEntity[] {
    return this.Roles;
  }
  /** @deprecated Use {@link Roles}. */
  public set roles(value: MJRoleEntity[]) {
    this.Roles = value;
  }
  public FilteredRoles: MJRoleEntity[] = [];

  /** @deprecated Use {@link FilteredRoles}. */
  public get filteredRoles(): MJRoleEntity[] {
    return this.FilteredRoles;
  }
  /** @deprecated Use {@link FilteredRoles}. */
  public set filteredRoles(value: MJRoleEntity[]) {
    this.FilteredRoles = value;
  }
  public SelectedRole: MJRoleEntity | null = null;

  /** @deprecated Use {@link SelectedRole}. */
  public get selectedRole(): MJRoleEntity | null {
    return this.SelectedRole;
  }
  /** @deprecated Use {@link SelectedRole}. */
  public set selectedRole(value: MJRoleEntity | null) {
    this.SelectedRole = value;
  }
  public isLoading = false;
  public error: string | null = null;

  // Dialog state
  public ShowRoleDialog = false;

  /** @deprecated Use {@link ShowRoleDialog}. */
  public get showRoleDialog() {
    return this.ShowRoleDialog;
  }
  /** @deprecated Use {@link ShowRoleDialog}. */
  public set showRoleDialog(value) {
    this.ShowRoleDialog = value;
  }
  public RoleDialogData: RoleDialogData | null = null;

  /** @deprecated Use {@link RoleDialogData}. */
  public get roleDialogData(): RoleDialogData | null {
    return this.RoleDialogData;
  }
  /** @deprecated Use {@link RoleDialogData}. */
  public set roleDialogData(value: RoleDialogData | null) {
    this.RoleDialogData = value;
  }

  // Stats
  public Stats: RoleStats = {
    totalRoles: 0,
    systemRoles: 0,
    customRoles: 0,
    activeRoles: 0
  };

  /** @deprecated Use {@link Stats}. */
  public get stats(): RoleStats {
    return this.Stats;
  }
  /** @deprecated Use {@link Stats}. */
  public set stats(value: RoleStats) {
    this.Stats = value;
  }

  // Filters
  public Filters$ = new BehaviorSubject<FilterOptions>({
    type: 'all',
    search: ''
  });

  /** @deprecated Use {@link Filters$}. */
  public get filters$() {
    return this.Filters$;
  }
  /** @deprecated Use {@link Filters$}. */
  public set filters$(value) {
    this.Filters$ = value;
  }

  // UI State
  public showCreateDialog = false;
  public ShowEditDialog = false;

  /** @deprecated Use {@link ShowEditDialog}. */
  public get showEditDialog() {
    return this.ShowEditDialog;
  }
  /** @deprecated Use {@link ShowEditDialog}. */
  public set showEditDialog(value) {
    this.ShowEditDialog = value;
  }
  public ShowDeleteConfirm = false;

  /** @deprecated Use {@link ShowDeleteConfirm}. */
  public get showDeleteConfirm() {
    return this.ShowDeleteConfirm;
  }
  /** @deprecated Use {@link ShowDeleteConfirm}. */
  public set showDeleteConfirm(value) {
    this.ShowDeleteConfirm = value;
  }
  public ExpandedRoleId: string | null = null;

  /** @deprecated Use {@link ExpandedRoleId}. */
  public get expandedRoleId(): string | null {
    return this.ExpandedRoleId;
  }
  /** @deprecated Use {@link ExpandedRoleId}. */
  public set expandedRoleId(value: string | null) {
    this.ExpandedRoleId = value;
  }

  // Role permissions (simplified view)
  public RolePermissions: Map<string, string[]> = new Map();

  /** @deprecated Use {@link RolePermissions}. */
  public get rolePermissions(): Map<string, string[]> {
    return this.RolePermissions;
  }
  /** @deprecated Use {@link RolePermissions}. */
  public set rolePermissions(value: Map<string, string[]>) {
    this.RolePermissions = value;
  }

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
    this.LoadInitialData();
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
    const selected = this.ExpandedRoleId
      ? this.Roles.find(r => UUIDsEqual(r.ID, this.ExpandedRoleId!)) ?? null
      : null;
    const input: RoleManagementAgentContextInput = {
      TotalRoleCount: this.Roles.length,
      FilteredRoleCount: this.FilteredRoles.length,
      SystemRoleCount: this.Stats.systemRoles,
      CustomRoleCount: this.Stats.customRoles,
      TypeFilter: this.Filters$.value.type,
      SearchText: this.Filters$.value.search,
      SelectedRoleId: selected?.ID ?? null,
      SelectedRoleName: selected?.Name ?? null,
      VisibleRoleNames: this.FilteredRoles.map(r => r.Name ?? '').filter(n => n !== ''),
      SelectedRolePermissions: selected ? this.selectedRolePermissionSummary : null,
    };
    this.navigationService.SetAgentContext(this, BuildRoleManagementAgentContext(input));
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
    if (!IsValidRoleTypeFilter(type)) {
      return { Success: false, ErrorMessage: `Invalid type "${String(type)}". Expected one of: all, system, custom.` };
    }
    this.OnTypeFilterChange(type);
    this.publishAgentContext();
    return { Success: true };
  }

  private handleSearchTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const searchText = params?.['searchText'];
    if (typeof searchText !== 'string') {
      return { Success: false, ErrorMessage: 'searchText must be a string.' };
    }
    this.UpdateFilter({ search: searchText });
    this.publishAgentContext();
    return { Success: true };
  }

  private async handleSelectRoleTool(params: Record<string, unknown>): Promise<{ Success: boolean; ErrorMessage?: string }> {
    const raw = String(params?.['role'] ?? '');
    const resolved = ResolveRoleByIDOrName(raw, this.Roles.map(r => ({ ID: r.ID, Name: r.Name ?? '' })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    this.ExpandedRoleId = resolved.match.ID;
    this.selectedRolePermissionSummary = await this.loadPermissionSummary(resolved.match.ID);
    this.cdr.markForCheck();
    this.publishAgentContext();
    return { Success: true };
  }

  private handleNavigateToRoleRecordTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const raw = String(params?.['role'] ?? '');
    const resolved = ResolveRoleByIDOrName(raw, this.Roles.map(r => ({ ID: r.ID, Name: r.Name ?? '' })));
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
    this.ResetAllFiltersAndSearch();
    this.publishAgentContext();
    return { Success: true };
  }

  private async handleRefreshTool(): Promise<{ Success: boolean; ErrorMessage?: string }> {
    try {
      this.permissionSummaryCache.clear();
      this.selectedRolePermissionSummary = null;
      await this.LoadInitialData();
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
  
  public async LoadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load roles
      const roles = await this.loadRoles();
      this.Roles = roles;
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

  /** @deprecated Use {@link LoadInitialData}. */
  public async loadInitialData(): Promise<void> {
    return this.LoadInitialData();
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
    this.Filters$
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
    const filters = this.Filters$.value;
    let filtered = [...this.Roles];
    
    // Apply type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(role => {
        const isSystem = this.IsSystemRole(role);
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
    
    this.FilteredRoles = filtered;
  }
  
  private calculateStats(): void {
    const systemRoles = this.Roles.filter(r => this.IsSystemRole(r));
    
    this.Stats = {
      totalRoles: this.Roles.length,
      systemRoles: systemRoles.length,
      customRoles: this.Roles.length - systemRoles.length,
      activeRoles: this.Roles.length // All roles are considered active for now
    };
  }
  
  public IsSystemRole(role: MJRoleEntity): boolean {
    // System roles typically have certain naming patterns or flags
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(role.Name || '');
  }

  /** @deprecated Use {@link IsSystemRole}. */
  public isSystemRole(role: MJRoleEntity): boolean {
    return this.IsSystemRole(role);
  }
  
  // Public methods for template
  public OnTypeFilterChange(type: 'all' | 'system' | 'custom'): void {
    this.UpdateFilter({ type });
  }

  /** @deprecated Use {@link OnTypeFilterChange}. */
  public onTypeFilterChange(type: 'all' | 'system' | 'custom'): void {
    return this.OnTypeFilterChange(type);
  }
  
  public UpdateFilter(partial: Partial<FilterOptions>): void {
    this.Filters$.next({
      ...this.Filters$.value,
      ...partial
    });
    // Discrete changes (chips) apply immediately. Text search still goes
    // through the 300ms debounce in setupFilterSubscription.
    if (!('search' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link UpdateFilter}. */
  public updateFilter(partial: Partial<FilterOptions>): void {
    return this.UpdateFilter(partial);
  }

  // -- Concise chrome: one Filter popover (Type) + applied-filter chips -------

  public get FilterFields(): FilterFieldConfig[] {
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

  /** @deprecated Use {@link FilterFields}. */
  public get filterFields(): FilterFieldConfig[] {
    return this.FilterFields;
  }

  public get FilterValues(): Record<string, unknown> {
    return { type: this.Filters$.value.type };
  }

  /** @deprecated Use {@link FilterValues}. */
  public get filterValues(): Record<string, unknown> {
    return this.FilterValues;
  }

  /** Total active filters (Type) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    return this.Filters$.value.type !== 'all' ? 1 : 0;
  }

  public OnFilterPanelChange(values: Record<string, unknown>): void {
    if ('type' in values) {
      this.UpdateFilter({ type: (values['type'] as FilterOptions['type']) || 'all' });
    }
  }

  /** @deprecated Use {@link OnFilterPanelChange}. */
  public onFilterPanelChange(values: Record<string, unknown>): void {
    return this.OnFilterPanelChange(values);
  }

  /** Clear all filters (Type); search persists. */
  public ClearAllAppliedFilters(): void {
    this.UpdateFilter({ type: 'all' });
  }

  /** @deprecated Use {@link ClearAllAppliedFilters}. */
  public clearAllAppliedFilters(): void {
    return this.ClearAllAppliedFilters();
  }

  /** True when search and/or panel filters are narrowing the list — gates the
   *  no-results empty-state "Reset filters" CTA. */
  public get IsListNarrowed(): boolean {
    return this.Filters$.value.search !== '' || this.TotalActiveFilterCount > 0;
  }

  /** Reset everything narrowing the list (search + Type) and refresh
   *  immediately. Wired to the no-results empty-state CTA. Unlike
   *  clearAllAppliedFilters(), this also clears the search box. */
  public ResetAllFiltersAndSearch(): void {
    this.Filters$.next({ type: 'all', search: '' });
    this.applyFilters();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ResetAllFiltersAndSearch}. */
  public resetAllFiltersAndSearch(): void {
    return this.ResetAllFiltersAndSearch();
  }
  
  public ToggleRoleExpansion(roleId: string): void {
    this.ExpandedRoleId = this.ExpandedRoleId === roleId ? null : roleId;
    if (this.ExpandedRoleId) {
      // Lazy-load the read-only permission summary so the agent context reflects
      // the user's current selection; fire-and-forget (re-publishes on completion).
      void this.loadPermissionSummary(this.ExpandedRoleId).then(summary => {
        this.selectedRolePermissionSummary = summary;
        this.publishAgentContext();
      });
    } else {
      this.selectedRolePermissionSummary = null;
    }
    this.publishAgentContext();
  }

  /** @deprecated Use {@link ToggleRoleExpansion}. */
  public toggleRoleExpansion(roleId: string): void {
    return this.ToggleRoleExpansion(roleId);
  }
  
  public IsRoleExpanded(roleId: string): boolean {
    return this.ExpandedRoleId === roleId;
  }

  /** @deprecated Use {@link IsRoleExpanded}. */
  public isRoleExpanded(roleId: string): boolean {
    return this.IsRoleExpanded(roleId);
  }
  
  public CreateNewRole(): void {
    this.RoleDialogData = {
      mode: 'create'
    };
    this.ShowRoleDialog = true;
  }

  /** @deprecated Use {@link CreateNewRole}. */
  public createNewRole(): void {
    return this.CreateNewRole();
  }
  
  public EditRole(role: MJRoleEntity): void {
    this.RoleDialogData = {
      role: role,
      mode: 'edit'
    };
    this.ShowRoleDialog = true;
  }

  /** @deprecated Use {@link EditRole}. */
  public editRole(role: MJRoleEntity): void {
    return this.EditRole(role);
  }
  
  public ConfirmDeleteRole(role: MJRoleEntity): void {
    this.SelectedRole = role;
    this.ShowDeleteConfirm = true;
  }

  /** @deprecated Use {@link ConfirmDeleteRole}. */
  public confirmDeleteRole(role: MJRoleEntity): void {
    return this.ConfirmDeleteRole(role);
  }
  
  public async DeleteRole(): Promise<void> {
    if (!this.SelectedRole) return;
    
    try {
      // Load role entity to delete
      const role = await this.metadata.GetEntityObject<MJRoleEntity>('MJ: Roles');
      const loadResult = await role.Load(this.SelectedRole.ID);
      
      if (loadResult) {
        const deleteResult = await role.Delete();
        if (deleteResult) {
          this.ShowDeleteConfirm = false;
          this.SelectedRole = null;
          await this.LoadInitialData();
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

  /** @deprecated Use {@link DeleteRole}. */
  public async deleteRole(): Promise<void> {
    return this.DeleteRole();
  }
  
  public GetRoleIcon(role: MJRoleEntity): string {
    if (this.IsSystemRole(role)) {
      return 'fa-shield-halved';
    }
    return 'fa-user-tag';
  }

  /** @deprecated Use {@link GetRoleIcon}. */
  public getRoleIcon(role: MJRoleEntity): string {
    return this.GetRoleIcon(role);
  }
  
  public GetRoleTypeLabel(role: MJRoleEntity): string {
    return this.IsSystemRole(role) ? 'System' : 'Custom';
  }

  /** @deprecated Use {@link GetRoleTypeLabel}. */
  public getRoleTypeLabel(role: MJRoleEntity): string {
    return this.GetRoleTypeLabel(role);
  }
  
  public GetRoleTypeClass(role: MJRoleEntity): string {
    return this.IsSystemRole(role) ? 'badge-system' : 'badge-custom';
  }

  /** @deprecated Use {@link GetRoleTypeClass}. */
  public getRoleTypeClass(role: MJRoleEntity): string {
    return this.GetRoleTypeClass(role);
  }
  
  public RefreshData(): void {
    this.LoadInitialData();
  }

  /** @deprecated Use {@link RefreshData}. */
  public refreshData(): void {
    return this.RefreshData();
  }

  public OnRoleDialogResult(result: RoleDialogResult): void {
    this.ShowRoleDialog = false;
    this.RoleDialogData = null;
    
    if (result.action === 'save') {
      // Refresh the role list to show changes
      this.LoadInitialData();
    }
  }

  /** @deprecated Use {@link OnRoleDialogResult}. */
  public onRoleDialogResult(result: RoleDialogResult): void {
    return this.OnRoleDialogResult(result);
  }
}