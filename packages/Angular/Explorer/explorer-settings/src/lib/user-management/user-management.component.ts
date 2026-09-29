import { Component, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { MJUserEntity, MJRoleEntity, MJUserRoleEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { UserDialogData, UserDialogResult } from './user-dialog/user-dialog.component';
import { EnrolledRow, ServerRefusalReasons } from './transaction-group-refusals';
import {
  BuildUserManagementAgentContext,
  IsValidUserStatusFilter,
  ResolveUserByIDOrName,
  ResolveRoleByIDOrName,
  UserManagementAgentContextInput,
} from './user-management-agent-context';

/** Sortable user columns + direction the agent can request via SortUsers. */
type UserSortField = 'name' | 'email' | 'status' | 'type';
type UserSortDirection = 'asc' | 'desc';

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  adminUsers: number;
}

interface FilterOptions {
  status: 'all' | 'active' | 'inactive';
  role: string;
  search: string;
}

@Component({
  standalone: false,
  selector: 'mj-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['../shared/styles/_admin-patterns.css', './user-management.component.css']
})
@RegisterClass(BaseDashboard, 'UserManagement')
export class UserManagementComponent extends BaseDashboard implements OnDestroy {

  // State management
  public Users: MJUserEntity[] = [];

  /** @deprecated Use {@link Users}. */
  public get users(): MJUserEntity[] {
    return this.Users;
  }
  /** @deprecated Use {@link Users}. */
  public set users(value: MJUserEntity[]) {
    this.Users = value;
  }
  public FilteredUsers: MJUserEntity[] = [];

  /** @deprecated Use {@link FilteredUsers}. */
  public get filteredUsers(): MJUserEntity[] {
    return this.FilteredUsers;
  }
  /** @deprecated Use {@link FilteredUsers}. */
  public set filteredUsers(value: MJUserEntity[]) {
    this.FilteredUsers = value;
  }
  public Roles: MJRoleEntity[] = [];

  /** @deprecated Use {@link Roles}. */
  public get roles(): MJRoleEntity[] {
    return this.Roles;
  }
  /** @deprecated Use {@link Roles}. */
  public set roles(value: MJRoleEntity[]) {
    this.Roles = value;
  }
  public SelectedUser: MJUserEntity | null = null;

  /** @deprecated Use {@link SelectedUser}. */
  public get selectedUser(): MJUserEntity | null {
    return this.SelectedUser;
  }
  /** @deprecated Use {@link SelectedUser}. */
  public set selectedUser(value: MJUserEntity | null) {
    this.SelectedUser = value;
  }
  public isLoading = false;
  public error: string | null = null;

  // Selection state for bulk actions
  public SelectedUserIds = new Set<string>();

  /** @deprecated Use {@link SelectedUserIds}. */
  public get selectedUserIds() {
    return this.SelectedUserIds;
  }
  /** @deprecated Use {@link SelectedUserIds}. */
  public set selectedUserIds(value) {
    this.SelectedUserIds = value;
  }

  // Dialog state
  public ShowUserDialog = false;

  /** @deprecated Use {@link ShowUserDialog}. */
  public get showUserDialog() {
    return this.ShowUserDialog;
  }
  /** @deprecated Use {@link ShowUserDialog}. */
  public set showUserDialog(value) {
    this.ShowUserDialog = value;
  }
  public UserDialogData: UserDialogData | null = null;

  /** @deprecated Use {@link UserDialogData}. */
  public get userDialogData(): UserDialogData | null {
    return this.UserDialogData;
  }
  /** @deprecated Use {@link UserDialogData}. */
  public set userDialogData(value: UserDialogData | null) {
    this.UserDialogData = value;
  }

  // Bulk action dialog state
  public ShowBulkActionConfirm = false;

  /** @deprecated Use {@link ShowBulkActionConfirm}. */
  public get showBulkActionConfirm() {
    return this.ShowBulkActionConfirm;
  }
  /** @deprecated Use {@link ShowBulkActionConfirm}. */
  public set showBulkActionConfirm(value) {
    this.ShowBulkActionConfirm = value;
  }
  public BulkActionType: 'enable' | 'disable' | 'delete' | null = null;

  /** @deprecated Use {@link BulkActionType}. */
  public get bulkActionType(): 'enable' | 'disable' | 'delete' | null {
    return this.BulkActionType;
  }
  /** @deprecated Use {@link BulkActionType}. */
  public set bulkActionType(value: 'enable' | 'disable' | 'delete' | null) {
    this.BulkActionType = value;
  }
  public ShowBulkRoleAssign = false;

  /** @deprecated Use {@link ShowBulkRoleAssign}. */
  public get showBulkRoleAssign() {
    return this.ShowBulkRoleAssign;
  }
  /** @deprecated Use {@link ShowBulkRoleAssign}. */
  public set showBulkRoleAssign(value) {
    this.ShowBulkRoleAssign = value;
  }
  public BulkRoleId: string = '';

  /** @deprecated Use {@link BulkRoleId}. */
  public get bulkRoleId(): string {
    return this.BulkRoleId;
  }
  /** @deprecated Use {@link BulkRoleId}. */
  public set bulkRoleId(value: string) {
    this.BulkRoleId = value;
  }
  
  // Stats
  public Stats: UserStats = {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminUsers: 0  // This will be based on roles, not Type
  };

  /** @deprecated Use {@link Stats}. */
  public get stats(): UserStats {
    return this.Stats;
  }
  /** @deprecated Use {@link Stats}. */
  public set stats(value: UserStats) {
    this.Stats = value;
  }
  
  // Filters
  public Filters$ = new BehaviorSubject<FilterOptions>({
    status: 'all',
    role: '',
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

  // Mobile expansion state
  private expandedUserIds = new Set<string>();

  // User-Role mapping
  private userRoleMap = new Map<string, string[]>(); // userId -> roleIds[]
  
  // Grid configuration
  public GridConfig = {
    pageSize: 20,
    sortField: 'Name',
    sortDirection: 'asc'
  };

  /** @deprecated Use {@link GridConfig}. */
  public get gridConfig() {
    return this.GridConfig;
  }
  /** @deprecated Use {@link GridConfig}. */
  public set gridConfig(value) {
    this.GridConfig = value;
  }
  
  protected override destroy$ = new Subject<void>();
  private get metadata() { return this.ProviderToUse; }
  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "User Management"
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
  // User Management is a security-sensitive admin surface. The agent context
  // and client tools registered here are strictly READ-ONLY / navigational:
  // status/role filters, free-text search, SELECTING a user (view), SORTING the
  // list, clearing filters, refreshing, CSV export of already-visible rows, and
  // navigating to a user's record for viewing. The mutating operations on this
  // component — create/edit/delete users, toggle status, bulk enable/disable/
  // delete, AND bulk role assignment (a role GRANT) — are DELIBERATELY NOT
  // exposed to the agent; they remain human-initiated. Context exposes only
  // counts, active filter selections, and on-screen display names/emails —
  // NEVER passwords, tokens, or other secrets.
  // ================================================================

  /** Active agent-requested sort (defaults to the grid's Name/asc). */
  private agentSortField: UserSortField = 'name';
  private agentSortDirection: UserSortDirection = 'asc';

  /**
   * Publish the current user-management state to the AI agent. Re-invoked on
   * every meaningful state change (data load, filter, selection, sort) so the
   * agent sees a fresh, read-only, NON-SENSITIVE snapshot. Shaped by the pure
   * {@link buildUserManagementAgentContext} helper (unit-tested in isolation).
   */
  private publishAgentContext(): void {
    const filters = this.Filters$.value;
    const roleFilter = filters.role ? this.Roles.find(r => UUIDsEqual(r.ID, filters.role)) : null;
    const input: UserManagementAgentContextInput = {
      TotalUserCount: this.Users.length,
      FilteredUserCount: this.FilteredUsers.length,
      ActiveUserCount: this.Stats.activeUsers,
      InactiveUserCount: this.Stats.inactiveUsers,
      StatusFilter: filters.status,
      RoleFilterId: filters.role || null,
      RoleFilterName: roleFilter?.Name ?? null,
      SearchText: filters.search,
      SelectedUserId: this.SelectedUser?.ID ?? null,
      SelectedUserName: this.SelectedUser?.Name ?? null,
      VisibleUserNames: this.FilteredUsers.map(u => u.Name ?? '').filter(n => n !== ''),
      VisibleUserEmails: this.FilteredUsers.map(u => u.Email ?? '').filter(e => e !== ''),
      AvailableRoleNames: this.Roles.map(r => r.Name ?? '').filter(n => n !== ''),
      VisibleColumns: ['Name', 'Email', 'Type', 'Status', 'Roles'],
    };
    this.navigationService.SetAgentContext(this, BuildUserManagementAgentContext(input));
  }

  /**
   * Register the read-only / navigational client tools the agent may invoke.
   * Every Handler is tolerant: validates input and returns
   * `{ Success: false, ErrorMessage }` rather than throwing.
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchUserStatusFilter',
        Description: 'Filter the user list by status. Valid values: all, active, inactive.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: ['all', 'active', 'inactive'] } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>) => this.handleSwitchStatusFilterTool(params),
      },
      {
        Name: 'FilterUsersByRole',
        Description: 'Filter the user list by role. Accepts a role name OR a role ID; pass an empty string to clear the role filter. Available role names are published in AvailableRoleNames.',
        ParameterSchema: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'] },
        Handler: async (params: Record<string, unknown>) => this.handleFilterByRoleTool(params),
      },
      {
        Name: 'SearchUsers',
        Description: 'Free-text search across user name, email, first name, and last name.',
        ParameterSchema: { type: 'object', properties: { searchText: { type: 'string' } }, required: ['searchText'] },
        Handler: async (params: Record<string, unknown>) => this.handleSearchTool(params),
      },
      {
        Name: 'SelectUser',
        Description: 'Select a user for VIEWING by ID or name (exact ID → exact name/email → partial match). Read-only — does not edit the user. Updates SelectedUserId/SelectedUserName in context.',
        ParameterSchema: { type: 'object', properties: { user: { type: 'string' } }, required: ['user'] },
        Handler: async (params: Record<string, unknown>) => this.handleSelectUserTool(params),
      },
      {
        Name: 'SortUsers',
        Description: 'Sort the visible user list. field: name | email | status | type. direction: asc | desc (default asc).',
        ParameterSchema: { type: 'object', properties: { field: { type: 'string', enum: ['name', 'email', 'status', 'type'] }, direction: { type: 'string', enum: ['asc', 'desc'] } }, required: ['field'] },
        Handler: async (params: Record<string, unknown>) => this.handleSortUsersTool(params),
      },
      {
        Name: 'NavigateToUserRecord',
        Description: 'Open the record for a user (by ID or name) in a tab for VIEWING. Read-only navigation — does not edit the user.',
        ParameterSchema: { type: 'object', properties: { user: { type: 'string' } }, required: ['user'] },
        Handler: async (params: Record<string, unknown>) => this.handleNavigateToUserRecordTool(params),
      },
      {
        Name: 'ClearAllFilters',
        Description: 'Clear all user filters (status, role, and search) and show the full list.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.handleClearFiltersTool(),
      },
      {
        Name: 'RefreshUserList',
        Description: 'Reload the user list from the server. Read-only — does not mutate any data.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.handleRefreshTool(),
      },
      {
        Name: 'ExportUsers',
        Description: 'Export the currently filtered users as a CSV file.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => this.handleExportTool(),
      },
    ]);
  }

  private handleSwitchStatusFilterTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const status = params?.['status'];
    if (!IsValidUserStatusFilter(status)) {
      return { Success: false, ErrorMessage: `Invalid status "${String(status)}". Expected one of: all, active, inactive.` };
    }
    this.OnStatusFilterChange(status);
    this.publishAgentContext();
    return { Success: true };
  }

  private handleFilterByRoleTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const raw = String(params?.['role'] ?? '');
    if (!raw.trim()) {
      // Empty string explicitly clears the role filter.
      this.UpdateFilter({ role: '' });
      this.publishAgentContext();
      return { Success: true };
    }
    const resolved = ResolveRoleByIDOrName(raw, this.Roles.map(r => ({ ID: r.ID, Name: r.Name ?? '' })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    this.UpdateFilter({ role: resolved.match.ID });
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

  private handleSelectUserTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const raw = String(params?.['user'] ?? '');
    const resolved = ResolveUserByIDOrName(raw, this.Users.map(u => ({
      ID: u.ID, Name: u.Name ?? '', Email: u.Email, FirstName: u.FirstName, LastName: u.LastName,
    })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    const match = this.Users.find(u => UUIDsEqual(u.ID, resolved.match.ID)) ?? null;
    this.SelectedUser = match;
    this.cdr.markForCheck();
    this.publishAgentContext();
    return { Success: true };
  }

  private handleSortUsersTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const field = String(params?.['field'] ?? '');
    if (field !== 'name' && field !== 'email' && field !== 'status' && field !== 'type') {
      return { Success: false, ErrorMessage: `Invalid sort field "${field}". Expected one of: name, email, status, type.` };
    }
    const dirRaw = params?.['direction'];
    const direction: UserSortDirection = dirRaw === 'desc' ? 'desc' : 'asc';
    this.agentSortField = field;
    this.agentSortDirection = direction;
    this.applySortToVisibleUsers();
    this.cdr.markForCheck();
    this.publishAgentContext();
    return { Success: true };
  }

  private handleNavigateToUserRecordTool(params: Record<string, unknown>): { Success: boolean; ErrorMessage?: string } {
    const raw = String(params?.['user'] ?? '');
    const resolved = ResolveUserByIDOrName(raw, this.Users.map(u => ({
      ID: u.ID, Name: u.Name ?? '', Email: u.Email, FirstName: u.FirstName, LastName: u.LastName,
    })));
    if (!resolved.ok) {
      return { Success: false, ErrorMessage: resolved.error };
    }
    this.navigationService.OpenEntityRecord('MJ: Users', CompositeKey.FromID(resolved.match.ID));
    return { Success: true };
  }

  /** Sort filteredUsers in place per the active agent-requested sort. Read-only display ordering. */
  private applySortToVisibleUsers(): void {
    const dir = this.agentSortDirection === 'desc' ? -1 : 1;
    const field = this.agentSortField;
    this.FilteredUsers = [...this.FilteredUsers].sort((a, b) => {
      const av = this.sortKeyForUser(a, field);
      const bv = this.sortKeyForUser(b, field);
      return av.localeCompare(bv) * dir;
    });
  }

  private sortKeyForUser(user: MJUserEntity, field: UserSortField): string {
    switch (field) {
      case 'email': return (user.Email ?? '').toLowerCase();
      case 'status': return user.IsActive ? 'active' : 'inactive';
      case 'type': return (user.Type ?? '').toLowerCase();
      case 'name':
      default: return (user.Name ?? '').toLowerCase();
    }
  }

  private handleClearFiltersTool(): { Success: boolean } {
    this.ResetAllFiltersAndSearch();
    this.publishAgentContext();
    return { Success: true };
  }

  private async handleRefreshTool(): Promise<{ Success: boolean; ErrorMessage?: string }> {
    try {
      await this.LoadInitialData();
      this.publishAgentContext();
      return { Success: true };
    } catch (e) {
      return { Success: false, ErrorMessage: e instanceof Error ? e.message : 'Refresh failed.' };
    }
  }

  private handleExportTool(): { Success: boolean; ErrorMessage?: string } {
    if (this.FilteredUsers.length === 0) {
      return { Success: false, ErrorMessage: 'No users to export.' };
    }
    this.ExportUsers();
    return { Success: true };
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
      
      // Load users, roles, and user-role relationships in parallel
      const [users, roles, userRoles] = await Promise.all([
        this.loadUsers(),
        this.loadRoles(),
        this.loadUserRoles()
      ]);
      
      this.Users = users;
      this.Roles = roles;
      
      // Build user-role mapping
      this.buildUserRoleMapping(userRoles);
      
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading user data:', error);
      this.error = 'Failed to load user data. Please try again.';
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

  private async loadUsers(): Promise<MJUserEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJUserEntity>({
      EntityName: 'MJ: Users',
      ResultType: 'entity_object'
    });
    
    return result.Success ? result.Results : [];
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

  private async loadUserRoles(): Promise<MJUserRoleEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJUserRoleEntity>({
      EntityName: 'MJ: User Roles',
      ResultType: 'entity_object'
    });
    
    return result.Success ? result.Results : [];
  }

  private buildUserRoleMapping(userRoles: MJUserRoleEntity[]): void {
    this.userRoleMap.clear();
    
    userRoles.forEach(userRole => {
      const userId = userRole.UserID;
      const roleId = userRole.RoleID;
      
      if (!this.userRoleMap.has(userId)) {
        this.userRoleMap.set(userId, []);
      }
      
      this.userRoleMap.get(userId)!.push(roleId);
    });
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
    let filtered = [...this.Users];

    // Apply status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(user => 
        filters.status === 'active' ? user.IsActive : !user.IsActive
      );
    }
    
    // Apply role filter
    if (filters.role) {
      filtered = filtered.filter(user => {
        const userRoles = this.userRoleMap.get(user.ID) || [];
        return userRoles.includes(filters.role);
      });
    }
    
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(user =>
        user.Name?.toLowerCase().includes(searchLower) ||
        user.Email?.toLowerCase().includes(searchLower) ||
        user.FirstName?.toLowerCase().includes(searchLower) ||
        user.LastName?.toLowerCase().includes(searchLower)
      );
    }
    
    this.FilteredUsers = filtered;
    // Preserve any agent-requested sort across filter changes (read-only display ordering).
    this.applySortToVisibleUsers();
  }

  private calculateStats(): void {
    this.Stats = {
      totalUsers: this.Users.length,
      activeUsers: this.Users.filter(u => u.IsActive).length,
      inactiveUsers: this.Users.filter(u => !u.IsActive).length,
      adminUsers: this.Users.filter(u => u.Type === 'Owner').length  // Using Owner as admin type
    };
  }
  
  // Public methods for template
  public OnStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.UpdateFilter({ status });
  }

  /** @deprecated Use {@link OnStatusFilterChange}. */
  public onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    return this.OnStatusFilterChange(status);
  }

  public UpdateFilter(partial: Partial<FilterOptions>): void {
    this.Filters$.next({
      ...this.Filters$.value,
      ...partial
    });
    // Discrete changes (chips, popover dropdowns) apply immediately. Text search
    // still goes through the 300ms debounce in setupFilterSubscription so we
    // don't re-filter on every keystroke.
    if (!('search' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link UpdateFilter}. */
  public updateFilter(partial: Partial<FilterOptions>): void {
    return this.UpdateFilter(partial);
  }
  
  public SelectUser(user: MJUserEntity): void {
    this.SelectedUser = user;
    this.ShowEditDialog = true;
  }

  /** @deprecated Use {@link SelectUser}. */
  public selectUser(user: MJUserEntity): void {
    return this.SelectUser(user);
  }
  
  public createNewUser(): void {
    this.UserDialogData = {
      mode: 'create',
      availableRoles: this.Roles
    };
    this.ShowUserDialog = true;
  }
  
  public EditUser(user: MJUserEntity): void {
    this.UserDialogData = {
      user: user,
      mode: 'edit',
      availableRoles: this.Roles
    };
    this.ShowUserDialog = true;
  }

  /** @deprecated Use {@link EditUser}. */
  public editUser(user: MJUserEntity): void {
    return this.EditUser(user);
  }
  
  public ConfirmDeleteUser(user: MJUserEntity): void {
    this.SelectedUser = user;
    this.ShowDeleteConfirm = true;
  }

  /** @deprecated Use {@link ConfirmDeleteUser}. */
  public confirmDeleteUser(user: MJUserEntity): void {
    return this.ConfirmDeleteUser(user);
  }
  
  public async DeleteUser(): Promise<void> {
    if (!this.SelectedUser) return;
    
    try {
      // Load user entity to delete
      const user = await this.metadata.GetEntityObject<MJUserEntity>('MJ: Users');
      const loadResult = await user.Load(this.SelectedUser.ID);
      
      if (loadResult) {
        const deleteResult = await user.Delete();
        if (deleteResult) {
          this.ShowDeleteConfirm = false;
          this.SelectedUser = null;
          await this.LoadInitialData();
        } else {
          throw new Error(user.LatestResult?.Message || 'Failed to delete user');
        }
      } else {
        throw new Error('User not found or permission denied');
      }
    } catch (error: unknown) {
      console.error('Error deleting user:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Failed to delete user';
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link DeleteUser}. */
  public async deleteUser(): Promise<void> {
    return this.DeleteUser();
  }
  
  public async ToggleUserStatus(user: MJUserEntity): Promise<void> {
    try {
      user.IsActive = !user.IsActive;
      // BaseEntity.Save() returns false on a validation failure — it does NOT throw. Discarding
      // the result meant the catch below never ran for a refused save: no revert, no message, and
      // calculateStats() re-rendered the row as toggled, so the UI asserted success while nothing
      // had been written. Reachable for every non-Owner admin since the #4260 privilege-elevation
      // guard on MJ: Users, because deactivating a user is a write to another user's row.
      // Mirrors deleteUser() above, which already checks its result this way.
      if (!(await user.Save())) {
        throw new Error(user.LatestResult?.Message || 'Failed to update user status');
      }
      this.ngZone.run(() => {
        // Clear any banner left by a PREVIOUS refused toggle. Without this a non-Owner who is
        // refused on one row, then succeeds on a row they may edit (their own), keeps reading the
        // stale refusal. `loadInitialData()` is the only other place `error` is reset and this path
        // does not call it.
        this.error = null;
        this.calculateStats();
        this.cdr.markForCheck();
      });
    } catch (error) {
      console.error('Error updating user status:', error);
      this.ngZone.run(() => {
        user.IsActive = !user.IsActive; // Revert on error
        this.error = error instanceof Error ? error.message : 'Failed to update user status';
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link ToggleUserStatus}. */
  public async toggleUserStatus(user: MJUserEntity): Promise<void> {
    return this.ToggleUserStatus(user);
  }
  
  public ExportUsers(): void {
    if (this.FilteredUsers.length === 0) {
      this.error = 'No users to export';
      return;
    }

    try {
      // Create CSV content
      const headers = ['Name', 'First Name', 'Last Name', 'Email', 'Type', 'Status', 'Created', 'Updated'];
      const csvRows = [headers.join(',')];

      // Add user data
      this.FilteredUsers.forEach(user => {
        const row = [
          this.escapeCSV(user.Name || ''),
          this.escapeCSV(user.FirstName || ''),
          this.escapeCSV(user.LastName || ''),
          this.escapeCSV(user.Email || ''),
          this.escapeCSV(user.Type || ''),
          user.IsActive ? 'Active' : 'Inactive',
          user.__mj_CreatedAt ? new Date(user.__mj_CreatedAt).toLocaleDateString() : '',
          user.__mj_UpdatedAt ? new Date(user.__mj_UpdatedAt).toLocaleDateString() : ''
        ];
        csvRows.push(row.join(','));
      });

      // Create and download file
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `users_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting users:', error);
      this.error = 'Failed to export users';
    }
  }

  /** @deprecated Use {@link ExportUsers}. */
  public exportUsers(): void {
    return this.ExportUsers();
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  
  public RefreshData(): void {
    this.LoadInitialData();
  }

  /** @deprecated Use {@link RefreshData}. */
  public refreshData(): void {
    return this.RefreshData();
  }
  
  public GetStatusIcon(user: MJUserEntity): string {
    return user.IsActive ? 'fa-check-circle' : 'fa-times-circle';
  }

  /** @deprecated Use {@link GetStatusIcon}. */
  public getStatusIcon(user: MJUserEntity): string {
    return this.GetStatusIcon(user);
  }
  
  public GetStatusClass(user: MJUserEntity): string {
    return user.IsActive ? 'status-active' : 'status-inactive';
  }

  /** @deprecated Use {@link GetStatusClass}. */
  public getStatusClass(user: MJUserEntity): string {
    return this.GetStatusClass(user);
  }
  
  public GetUserTypeIcon(user: MJUserEntity): string {
    switch (user.Type) {
      case 'Owner':
        return 'fa-shield-halved';
      case 'User':
        return 'fa-user';
      default:
        return 'fa-user';
    }
  }

  /** @deprecated Use {@link GetUserTypeIcon}. */
  public getUserTypeIcon(user: MJUserEntity): string {
    return this.GetUserTypeIcon(user);
  }
  
  public GetUserInitials(user: MJUserEntity): string {
    const first = user.FirstName?.charAt(0) || '';
    const last = user.LastName?.charAt(0) || '';
    return (first + last).toUpperCase() || user.Name?.charAt(0).toUpperCase() || 'U';
  }

  /** @deprecated Use {@link GetUserInitials}. */
  public getUserInitials(user: MJUserEntity): string {
    return this.GetUserInitials(user);
  }

  public OnUserDialogResult(result: UserDialogResult): void {
    this.ShowUserDialog = false;
    this.UserDialogData = null;

    if (result.action === 'save') {
      // Refresh the user list to show changes
      this.LoadInitialData();
    }
  }

  /** @deprecated Use {@link OnUserDialogResult}. */
  public onUserDialogResult(result: UserDialogResult): void {
    return this.OnUserDialogResult(result);
  }

  // Selection methods for bulk actions
  public get IsAllSelected(): boolean {
    return this.FilteredUsers.length > 0 &&
           this.FilteredUsers.every(user => this.SelectedUserIds.has(user.ID));
  }

  /** @deprecated Use {@link IsAllSelected}. */
  public get isAllSelected(): boolean {
    return this.IsAllSelected;
  }

  public get IsIndeterminate(): boolean {
    const selectedCount = this.FilteredUsers.filter(user => this.SelectedUserIds.has(user.ID)).length;
    return selectedCount > 0 && selectedCount < this.FilteredUsers.length;
  }

  /** @deprecated Use {@link IsIndeterminate}. */
  public get isIndeterminate(): boolean {
    return this.IsIndeterminate;
  }

  public get HasSelection(): boolean {
    return this.SelectedUserIds.size > 0;
  }

  /** @deprecated Use {@link HasSelection}. */
  public get hasSelection(): boolean {
    return this.HasSelection;
  }

  public get SelectedCount(): number {
    return this.SelectedUserIds.size;
  }

  /** @deprecated Use {@link SelectedCount}. */
  public get selectedCount(): number {
    return this.SelectedCount;
  }

  public get HasActiveFilters(): boolean {
    const filters = this.Filters$.value;
    return filters.status !== 'all' || filters.role !== '';
  }

  /** @deprecated Use {@link HasActiveFilters}. */
  public get hasActiveFilters(): boolean {
    return this.HasActiveFilters;
  }

  public get ActiveFilterCount(): number {
    let count = 0;
    const filters = this.Filters$.value;
    if (filters.status !== 'all') count++;
    if (filters.role !== '') count++;
    return count;
  }

  /** @deprecated Use {@link ActiveFilterCount}. */
  public get activeFilterCount(): number {
    return this.ActiveFilterCount;
  }

  public ClearFilters(): void {
    this.Filters$.next({
      ...this.Filters$.value,
      status: 'all',
      role: ''
    });
    this.applyFilters();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ClearFilters}. */
  public clearFilters(): void {
    return this.ClearFilters();
  }

  // -- Filter panel binding (mj-filter-panel inside the popover) -------------
  //
  // Only Role lives inside the popover — Status is exposed as visible chips
  // in the filter card alongside search (the standardized "quick toggle"
  // pattern used by Scheduling's exterior chrome). The popover badge counts
  // only popover-resident filters (Role), so Status changes don't ghost
  // the badge.

  /**
   * FilterFieldConfig[] describing the popover's Role field. Driven off
   * `roles[]` so the dropdown stays in sync as roles load.
   */
  public get FilterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'status',
        type: 'chips',
        label: 'Status',
        chipOptions: [
          { text: 'All', value: 'all' },
          { text: 'Active', value: 'active' },
          { text: 'Inactive', value: 'inactive' },
        ],
      },
      {
        key: 'role',
        type: 'dropdown',
        label: 'Role',
        icon: 'fa-solid fa-user-shield',
        placeholder: 'All Roles',
        filterable: this.Roles.length > 10,
        options: [
          { text: 'All Roles', value: '' },
          ...this.Roles.map(r => ({ text: r.Name ?? '', value: r.ID }))
        ]
      }
    ];
  }

  /** @deprecated Use {@link FilterFields}. */
  public get filterFields(): FilterFieldConfig[] {
    return this.FilterFields;
  }

  /** Current popover field values keyed by FilterFieldConfig.key. */
  public get FilterValues(): Record<string, unknown> {
    return { status: this.Filters$.value.status, role: this.Filters$.value.role };
  }

  /** @deprecated Use {@link FilterValues}. */
  public get filterValues(): Record<string, unknown> {
    return this.FilterValues;
  }

  /** Total active filters (Status + Role) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    const f = this.Filters$.value;
    return (f.status !== 'all' ? 1 : 0) + (f.role !== '' ? 1 : 0);
  }

  /** Apply a value change from <mj-filter-panel>. */
  public OnFilterPanelChange(values: Record<string, unknown>): void {
    const partial: Partial<FilterOptions> = {};
    if ('status' in values) {
      partial.status = (values['status'] as FilterOptions['status']) || 'all';
    }
    if ('role' in values) {
      partial.role = (values['role'] as string) ?? '';
    }
    this.UpdateFilter(partial);
  }

  /** @deprecated Use {@link OnFilterPanelChange}. */
  public onFilterPanelChange(values: Record<string, unknown>): void {
    return this.OnFilterPanelChange(values);
  }

  /** Clear all filters (Status + Role); search persists. */
  public ClearAllAppliedFilters(): void {
    this.UpdateFilter({ status: 'all', role: '' });
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

  /** Reset everything narrowing the list (search + Status + Role) and refresh
   *  immediately. Wired to the no-results empty-state CTA. Unlike
   *  clearAllAppliedFilters(), this also clears the search box. */
  public ResetAllFiltersAndSearch(): void {
    this.Filters$.next({ status: 'all', role: '', search: '' });
    this.applyFilters();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ResetAllFiltersAndSearch}. */
  public resetAllFiltersAndSearch(): void {
    return this.ResetAllFiltersAndSearch();
  }

  public ToggleSelectAll(): void {
    if (this.IsAllSelected) {
      // Deselect all filtered users
      this.FilteredUsers.forEach(user => this.SelectedUserIds.delete(user.ID));
    } else {
      // Select all filtered users
      this.FilteredUsers.forEach(user => this.SelectedUserIds.add(user.ID));
    }
  }

  /** @deprecated Use {@link ToggleSelectAll}. */
  public toggleSelectAll(): void {
    return this.ToggleSelectAll();
  }

  public ToggleUserSelection(userId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.SelectedUserIds.has(userId)) {
      this.SelectedUserIds.delete(userId);
    } else {
      this.SelectedUserIds.add(userId);
    }
  }

  /** @deprecated Use {@link ToggleUserSelection}. */
  public toggleUserSelection(userId: string, event?: Event): void {
    return this.ToggleUserSelection(userId, event);
  }

  public IsUserSelected(userId: string): boolean {
    return this.SelectedUserIds.has(userId);
  }

  /** @deprecated Use {@link IsUserSelected}. */
  public isUserSelected(userId: string): boolean {
    return this.IsUserSelected(userId);
  }

  public ClearSelection(): void {
    this.SelectedUserIds.clear();
  }

  /** @deprecated Use {@link ClearSelection}. */
  public clearSelection(): void {
    return this.ClearSelection();
  }

  // Bulk action methods
  public ConfirmBulkAction(action: 'enable' | 'disable' | 'delete'): void {
    if (!this.HasSelection) return;
    this.BulkActionType = action;
    this.ShowBulkActionConfirm = true;
  }

  /** @deprecated Use {@link ConfirmBulkAction}. */
  public confirmBulkAction(action: 'enable' | 'disable' | 'delete'): void {
    return this.ConfirmBulkAction(action);
  }

  public CancelBulkAction(): void {
    this.ShowBulkActionConfirm = false;
    this.BulkActionType = null;
  }

  /** @deprecated Use {@link CancelBulkAction}. */
  public cancelBulkAction(): void {
    return this.CancelBulkAction();
  }

  public async ExecuteBulkAction(): Promise<void> {
    if (!this.BulkActionType || !this.HasSelection) return;

    try {
      this.isLoading = true;
      const selectedUsers = this.Users.filter(user => this.SelectedUserIds.has(user.ID));

      switch (this.BulkActionType) {
        case 'enable':
          await this.bulkSetUserStatus(selectedUsers, true);
          break;
        case 'disable':
          await this.bulkSetUserStatus(selectedUsers, false);
          break;
        case 'delete':
          await this.bulkDeleteUsers(selectedUsers);
          break;
      }

      this.ClearSelection();
      this.ShowBulkActionConfirm = false;
      this.BulkActionType = null;
      await this.LoadInitialData();
    } catch (error: unknown) {
      console.error('Bulk action failed:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Bulk action failed';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link ExecuteBulkAction}. */
  public async executeBulkAction(): Promise<void> {
    return this.ExecuteBulkAction();
  }

  private async bulkSetUserStatus(users: MJUserEntity[], isActive: boolean): Promise<void> {
    if (users.length === 0) return;

    const md = this.ProviderToUse;
    const tg = await md.CreateTransactionGroup();
    for (const user of users) {
      user.IsActive = isActive;
      user.TransactionGroup = tg;
      await user.Save();
    }
    if (!await tg.Submit()) {
      // Server rolled back — restore in-memory flags to their prior state
      for (const user of users) {
        user.IsActive = !isActive;
      }
      throw new Error('Failed to update users — all changes have been rolled back');
    }
  }

  private async bulkDeleteUsers(users: MJUserEntity[]): Promise<void> {
    if (users.length === 0) return;

    const md = this.ProviderToUse;
    const tg = await md.CreateTransactionGroup();
    for (const user of users) {
      user.TransactionGroup = tg;
      await user.Delete();
    }
    if (!await tg.Submit()) {
      throw new Error('Failed to delete users — all changes have been rolled back');
    }
  }

  // Bulk role assignment
  public OpenBulkRoleAssign(): void {
    if (!this.HasSelection) return;
    this.BulkRoleId = '';
    this.ShowBulkRoleAssign = true;
  }

  /** @deprecated Use {@link OpenBulkRoleAssign}. */
  public openBulkRoleAssign(): void {
    return this.OpenBulkRoleAssign();
  }

  public CancelBulkRoleAssign(): void {
    this.ShowBulkRoleAssign = false;
    this.BulkRoleId = '';
  }

  /** @deprecated Use {@link CancelBulkRoleAssign}. */
  public cancelBulkRoleAssign(): void {
    return this.CancelBulkRoleAssign();
  }

  public async ExecuteBulkRoleAssign(): Promise<void> {
    if (!this.BulkRoleId || !this.HasSelection) return;

    try {
      this.isLoading = true;
      const selectedUserIds = Array.from(this.SelectedUserIds);

      // Collect only the users that don't already have the role
      const usersNeedingRole = selectedUserIds.filter(userId => {
        const existingRoles = this.userRoleMap.get(userId) || [];
        return !existingRoles.includes(this.BulkRoleId);
      });

      if (usersNeedingRole.length > 0) {
        const tg = await this.metadata.CreateTransactionGroup();
        // Each Save() only ENROLS the row in the group — the write is deferred to Submit(). Inside
        // a TransactionGroup, Save() therefore reports ENROLMENT, not the write's outcome: the
        // provider queues the item locally and returns true with no round trip
        // (`GraphQLDataProvider.Save` — "part of a TG always return true").
        //
        // So the role-elevation guard is NOT what this check catches. `MJUserRoleEntityServer`
        // (issue #4282) lives in `@memberjunction/core-entities-server`, which no browser package
        // depends on, so it never registers here — it refuses on the server, during Submit().
        //
        // That server refusal used to reach the user NOWHERE: `ExecuteTransactionGroup` discarded
        // the refused row's `Save()` return, so the row never enrolled in the SERVER's group
        // either; an all-refused batch submitted an empty group, whose `Submit()` returns true for
        // having nothing to do, and the screen closed reporting success having written nothing.
        // Issue #4309 fixed that in the resolver — the only layer that still knows which row was
        // refused and why. It now reports the refusal, `Submit()` returns FALSE, and
        // `GraphQLTransactionGroup.recordServerFailure` copies the server's reason onto each
        // item's `BaseEntity.LatestResult`. The `!await tg.Submit()` branch below reads it back;
        // that is the only place a server-side refusal surfaces on this screen.
        //
        // What this check DOES catch is a CLIENT-side refusal — a CheckPermissions denial or a
        // field-rule failure — which really does return false here, leaving that row unenrolled.
        // Ignoring the return meant an all-refused batch left the group EMPTY, and an empty group's
        // Submit() returns true for having nothing to do, so the screen reported success having
        // assigned nothing. That is the failure this guards; keep it.
        const refusals: string[] = [];
        const enrolled: EnrolledRow[] = [];
        for (const userId of usersNeedingRole) {
          const userRole = await this.metadata.GetEntityObject<MJUserRoleEntity>('MJ: User Roles');
          userRole.NewRecord();
          userRole.UserID = userId;
          userRole.RoleID = this.BulkRoleId;
          userRole.TransactionGroup = tg;
          if (!await userRole.Save()) {
            refusals.push(`${this.describeUser(userId)}: ${userRole.LatestResult?.CompleteMessage ?? 'unknown error'}`);
          }
          else {
            // Kept so the SERVER's reason can be read back off it below. Without this the entity
            // goes out of scope at the end of the iteration and the reason #4309 puts on
            // LatestResult has nobody left to read it.
            enrolled.push({ Label: this.describeUser(userId), Entity: userRole });
          }
        }
        if (refusals.length > 0) {
          // Nothing was written: the refused rows never enrolled, and the rest are still only
          // queued because Submit() is not reached.
          throw new Error(`Failed to assign roles — nothing was changed.\n${refusals.join('\n')}`);
        }

        if (!await tg.Submit()) {
          // Every row enrolled, so this is a SERVER-side refusal (or a rollback). Since #4309 the
          // server says which row and why, and that reason is now on each entity's LatestResult.
          const reasons = ServerRefusalReasons(enrolled);
          throw new Error(reasons.length > 0
            ? `Failed to assign roles — all changes have been rolled back.\n${reasons.join('\n')}`
            : 'Failed to assign roles — all changes have been rolled back');
        }
      }

      this.ClearSelection();
      this.ShowBulkRoleAssign = false;
      this.BulkRoleId = '';
      await this.LoadInitialData();
    } catch (error: unknown) {
      console.error('Bulk role assignment failed:', error);
      this.ngZone.run(() => {
        this.error = error instanceof Error ? error.message : 'Bulk role assignment failed';
        this.cdr.markForCheck();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  /** @deprecated Use {@link ExecuteBulkRoleAssign}. */
  public async executeBulkRoleAssign(): Promise<void> {
    return this.ExecuteBulkRoleAssign();
  }

  public GetBulkActionMessage(): string {
    const count = this.SelectedCount;
    switch (this.BulkActionType) {
      case 'enable':
        return `Are you sure you want to enable ${count} user${count > 1 ? 's' : ''}?`;
      case 'disable':
        return `Are you sure you want to disable ${count} user${count > 1 ? 's' : ''}?`;
      case 'delete':
        return `Are you sure you want to delete ${count} user${count > 1 ? 's' : ''}? This action cannot be undone.`;
      default:
        return '';
    }
  }

  /** @deprecated Use {@link GetBulkActionMessage}. */
  public getBulkActionMessage(): string {
    return this.GetBulkActionMessage();
  }

  public GetBulkActionTitle(): string {
    switch (this.BulkActionType) {
      case 'enable':
        return 'Enable Users';
      case 'disable':
        return 'Disable Users';
      case 'delete':
        return 'Delete Users';
      default:
        return 'Confirm Action';
    }
  }

  /** @deprecated Use {@link GetBulkActionTitle}. */
  public getBulkActionTitle(): string {
    return this.GetBulkActionTitle();
  }

  public GetBulkActionButtonText(): string {
    const count = this.SelectedCount;
    switch (this.BulkActionType) {
      case 'enable':
        return `Enable ${count} User${count > 1 ? 's' : ''}`;
      case 'disable':
        return `Disable ${count} User${count > 1 ? 's' : ''}`;
      case 'delete':
        return `Delete ${count} User${count > 1 ? 's' : ''}`;
      default:
        return 'Confirm';
    }
  }

  /** @deprecated Use {@link GetBulkActionButtonText}. */
  public getBulkActionButtonText(): string {
    return this.GetBulkActionButtonText();
  }

  // Expansion methods
  public ToggleUserExpansion(userId: string): void {
    if (this.expandedUserIds.has(userId)) {
      this.expandedUserIds.delete(userId);
    } else {
      this.expandedUserIds.add(userId);
    }
  }

  /** @deprecated Use {@link ToggleUserExpansion}. */
  public toggleUserExpansion(userId: string): void {
    return this.ToggleUserExpansion(userId);
  }

  public IsUserExpanded(userId: string): boolean {
    return this.expandedUserIds.has(userId);
  }

  /** @deprecated Use {@link IsUserExpanded}. */
  public isUserExpanded(userId: string): boolean {
    return this.IsUserExpanded(userId);
  }

  // Get roles for a specific user
  public GetUserRoles(userId: string): MJRoleEntity[] {
    const roleIds = this.userRoleMap.get(userId);
    if (!roleIds || roleIds.length === 0) {
      return [];
    }
    // Normalize the user's role IDs into a Set rather than running a nested `.some(UUIDsEqual(...))`
    // per role: UUIDsEqual's `===` fast path misses whenever the IDs differ, so every miss allocated
    // two lowercased strings and the nested scan paid that roles x userRoles times. The template
    // calls this TWICE per user row (the @if and the @for), on every change-detection pass. Filtering
    // `this.Roles` still drives the result, so the rendered order is unchanged.
    const assignedIds = new Set(roleIds.map(id => NormalizeUUID(id)));
    return this.Roles.filter(role => assignedIds.has(NormalizeUUID(role.ID)));
  }

  /** @deprecated Use {@link GetUserRoles}. */
  public getUserRoles(userId: string): MJRoleEntity[] {
    return this.GetUserRoles(userId);
  }

  /**
   * Names a user for an error message. Falls back to the raw ID rather than to a placeholder so a
   * refusal for a user who has dropped out of the loaded page is still traceable.
   */
  private describeUser(userId: string): string {
    const user = this.Users.find(u => UUIDsEqual(u.ID, userId));
    return user?.Email ?? user?.Name ?? userId;
  }
}