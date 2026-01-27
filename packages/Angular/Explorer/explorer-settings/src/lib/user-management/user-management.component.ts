import { Component, OnDestroy } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { UserEntity, RoleEntity, UserRoleEntity, ResourceData } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { UserDialogData, UserDialogResult } from './user-dialog/user-dialog.component';

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
  selector: 'mj-user-management',
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
@RegisterClass(BaseDashboard, 'UserManagement')
export class UserManagementComponent extends BaseDashboard implements OnDestroy {
  
  // State management
  public users: UserEntity[] = [];
  public filteredUsers: UserEntity[] = [];
  public roles: RoleEntity[] = [];
  public selectedUser: UserEntity | null = null;
  public isLoading = false;
  public error: string | null = null;

  // Selection state for bulk actions
  public selectedUserIds = new Set<string>();

  // Dialog state
  public showUserDialog = false;
  public userDialogData: UserDialogData | null = null;

  // Bulk action dialog state
  public showBulkActionConfirm = false;
  public bulkActionType: 'enable' | 'disable' | 'delete' | null = null;
  public showBulkRoleAssign = false;
  public bulkRoleId: string = '';
  
  // Stats
  public stats: UserStats = {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminUsers: 0  // This will be based on roles, not Type
  };
  
  // Filters
  public filters$ = new BehaviorSubject<FilterOptions>({
    status: 'all',
    role: '',
    search: ''
  });
  
  // UI State
  public showCreateDialog = false;
  public showEditDialog = false;
  public showDeleteConfirm = false;
  public showMobileFilters = false;

  // Mobile expansion state
  private expandedUserIds = new Set<string>();

  // User-Role mapping
  private userRoleMap = new Map<string, string[]>(); // userId -> roleIds[]
  
  // Grid configuration
  public gridConfig = {
    pageSize: 20,
    sortField: 'Name',
    sortDirection: 'asc'
  };
  
  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  constructor() {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "User Management"
  }

  protected initDashboard(): void {
    this.setupFilterSubscription();
  }

  protected loadData(): void {
    this.loadInitialData();
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
      
      // Load users, roles, and user-role relationships in parallel
      const [users, roles, userRoles] = await Promise.all([
        this.loadUsers(),
        this.loadRoles(),
        this.loadUserRoles()
      ]);
      
      this.users = users;
      this.roles = roles;
      
      // Build user-role mapping
      this.buildUserRoleMapping(userRoles);
      
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading user data:', error);
      this.error = 'Failed to load user data. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
  
  private async loadUsers(): Promise<UserEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<UserEntity>({
      EntityName: 'Users',
      ResultType: 'entity_object'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private async loadRoles(): Promise<RoleEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<RoleEntity>({
      EntityName: 'Roles',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    return result.Success ? result.Results : [];
  }

  private async loadUserRoles(): Promise<UserRoleEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<UserRoleEntity>({
      EntityName: 'User Roles',
      ResultType: 'entity_object'
    });
    
    return result.Success ? result.Results : [];
  }

  private buildUserRoleMapping(userRoles: UserRoleEntity[]): void {
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
    this.filters$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.applyFilters();
      });
  }
  
  private applyFilters(): void {
    const filters = this.filters$.value;
    let filtered = [...this.users];
    
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
    
    this.filteredUsers = filtered;
  }
  
  private calculateStats(): void {
    this.stats = {
      totalUsers: this.users.length,
      activeUsers: this.users.filter(u => u.IsActive).length,
      inactiveUsers: this.users.filter(u => !u.IsActive).length,
      adminUsers: this.users.filter(u => u.Type === 'Owner').length  // Using Owner as admin type
    };
  }
  
  // Public methods for template
  public onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateFilter({ search: value });
  }
  
  public onStatusFilterChange(status: 'all' | 'active' | 'inactive'): void {
    this.updateFilter({ status });
  }
  
  public onRoleFilterChange(role: string): void {
    this.updateFilter({ role });
  }
  
  public updateFilter(partial: Partial<FilterOptions>): void {
    this.filters$.next({
      ...this.filters$.value,
      ...partial
    });
  }
  
  public selectUser(user: UserEntity): void {
    this.selectedUser = user;
    this.showEditDialog = true;
  }
  
  public createNewUser(): void {
    this.userDialogData = {
      mode: 'create',
      availableRoles: this.roles
    };
    this.showUserDialog = true;
  }
  
  public editUser(user: UserEntity): void {
    this.userDialogData = {
      user: user,
      mode: 'edit',
      availableRoles: this.roles
    };
    this.showUserDialog = true;
  }
  
  public confirmDeleteUser(user: UserEntity): void {
    this.selectedUser = user;
    this.showDeleteConfirm = true;
  }
  
  public async deleteUser(): Promise<void> {
    if (!this.selectedUser) return;
    
    try {
      // Load user entity to delete
      const user = await this.metadata.GetEntityObject<UserEntity>('Users');
      const loadResult = await user.Load(this.selectedUser.ID);
      
      if (loadResult) {
        const deleteResult = await user.Delete();
        if (deleteResult) {
          this.showDeleteConfirm = false;
          this.selectedUser = null;
          await this.loadInitialData();
        } else {
          throw new Error(user.LatestResult?.Message || 'Failed to delete user');
        }
      } else {
        throw new Error('User not found or permission denied');
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      this.error = error.message || 'Failed to delete user';
    }
  }
  
  public async toggleUserStatus(user: UserEntity): Promise<void> {
    try {
      user.IsActive = !user.IsActive;
      await user.Save();
      this.calculateStats();
    } catch (error) {
      console.error('Error updating user status:', error);
      user.IsActive = !user.IsActive; // Revert on error
    }
  }
  
  public exportUsers(): void {
    if (this.filteredUsers.length === 0) {
      this.error = 'No users to export';
      return;
    }

    try {
      // Create CSV content
      const headers = ['Name', 'First Name', 'Last Name', 'Email', 'Type', 'Status', 'Created', 'Updated'];
      const csvRows = [headers.join(',')];

      // Add user data
      this.filteredUsers.forEach(user => {
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

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
  
  public refreshData(): void {
    this.loadInitialData();
  }
  
  public getStatusIcon(user: UserEntity): string {
    return user.IsActive ? 'fa-check-circle' : 'fa-times-circle';
  }
  
  public getStatusClass(user: UserEntity): string {
    return user.IsActive ? 'status-active' : 'status-inactive';
  }
  
  public getUserTypeIcon(user: UserEntity): string {
    switch (user.Type) {
      case 'Owner':
        return 'fa-shield-halved';
      case 'User':
        return 'fa-user';
      default:
        return 'fa-user';
    }
  }
  
  public getUserInitials(user: UserEntity): string {
    const first = user.FirstName?.charAt(0) || '';
    const last = user.LastName?.charAt(0) || '';
    return (first + last).toUpperCase() || user.Name?.charAt(0).toUpperCase() || 'U';
  }

  public onUserDialogResult(result: UserDialogResult): void {
    this.showUserDialog = false;
    this.userDialogData = null;

    if (result.action === 'save') {
      // Refresh the user list to show changes
      this.loadInitialData();
    }
  }

  // Selection methods for bulk actions
  public get isAllSelected(): boolean {
    return this.filteredUsers.length > 0 &&
           this.filteredUsers.every(user => this.selectedUserIds.has(user.ID));
  }

  public get isIndeterminate(): boolean {
    const selectedCount = this.filteredUsers.filter(user => this.selectedUserIds.has(user.ID)).length;
    return selectedCount > 0 && selectedCount < this.filteredUsers.length;
  }

  public get hasSelection(): boolean {
    return this.selectedUserIds.size > 0;
  }

  public get selectedCount(): number {
    return this.selectedUserIds.size;
  }

  public get hasActiveFilters(): boolean {
    const filters = this.filters$.value;
    return filters.status !== 'all' || filters.role !== '';
  }

  public get activeFilterCount(): number {
    let count = 0;
    const filters = this.filters$.value;
    if (filters.status !== 'all') count++;
    if (filters.role !== '') count++;
    return count;
  }

  public clearFilters(): void {
    this.filters$.next({
      ...this.filters$.value,
      status: 'all',
      role: ''
    });
    this.showMobileFilters = false;
  }

  public toggleSelectAll(): void {
    if (this.isAllSelected) {
      // Deselect all filtered users
      this.filteredUsers.forEach(user => this.selectedUserIds.delete(user.ID));
    } else {
      // Select all filtered users
      this.filteredUsers.forEach(user => this.selectedUserIds.add(user.ID));
    }
  }

  public toggleUserSelection(userId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  public isUserSelected(userId: string): boolean {
    return this.selectedUserIds.has(userId);
  }

  public clearSelection(): void {
    this.selectedUserIds.clear();
  }

  // Bulk action methods
  public confirmBulkAction(action: 'enable' | 'disable' | 'delete'): void {
    if (!this.hasSelection) return;
    this.bulkActionType = action;
    this.showBulkActionConfirm = true;
  }

  public cancelBulkAction(): void {
    this.showBulkActionConfirm = false;
    this.bulkActionType = null;
  }

  public async executeBulkAction(): Promise<void> {
    if (!this.bulkActionType || !this.hasSelection) return;

    try {
      this.isLoading = true;
      const selectedUsers = this.users.filter(user => this.selectedUserIds.has(user.ID));

      switch (this.bulkActionType) {
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

      this.clearSelection();
      this.showBulkActionConfirm = false;
      this.bulkActionType = null;
      await this.loadInitialData();
    } catch (error: unknown) {
      console.error('Bulk action failed:', error);
      this.error = error instanceof Error ? error.message : 'Bulk action failed';
    } finally {
      this.isLoading = false;
    }
  }

  private async bulkSetUserStatus(users: UserEntity[], isActive: boolean): Promise<void> {
    for (const user of users) {
      user.IsActive = isActive;
      const result = await user.Save();
      if (!result) {
        throw new Error(`Failed to update user ${user.Name}: ${user.LatestResult?.Message}`);
      }
    }
  }

  private async bulkDeleteUsers(users: UserEntity[]): Promise<void> {
    for (const user of users) {
      const result = await user.Delete();
      if (!result) {
        throw new Error(`Failed to delete user ${user.Name}: ${user.LatestResult?.Message}`);
      }
    }
  }

  // Bulk role assignment
  public openBulkRoleAssign(): void {
    if (!this.hasSelection) return;
    this.bulkRoleId = '';
    this.showBulkRoleAssign = true;
  }

  public cancelBulkRoleAssign(): void {
    this.showBulkRoleAssign = false;
    this.bulkRoleId = '';
  }

  public async executeBulkRoleAssign(): Promise<void> {
    if (!this.bulkRoleId || !this.hasSelection) return;

    try {
      this.isLoading = true;
      const selectedUserIds = Array.from(this.selectedUserIds);

      for (const userId of selectedUserIds) {
        // Check if user already has this role
        const existingRoles = this.userRoleMap.get(userId) || [];
        if (!existingRoles.includes(this.bulkRoleId)) {
          const userRole = await this.metadata.GetEntityObject<UserRoleEntity>('User Roles');
          userRole.NewRecord();
          userRole.UserID = userId;
          userRole.RoleID = this.bulkRoleId;

          const result = await userRole.Save();
          if (!result) {
            console.warn(`Failed to assign role to user ${userId}:`, userRole.LatestResult?.Message);
          }
        }
      }

      this.clearSelection();
      this.showBulkRoleAssign = false;
      this.bulkRoleId = '';
      await this.loadInitialData();
    } catch (error: unknown) {
      console.error('Bulk role assignment failed:', error);
      this.error = error instanceof Error ? error.message : 'Bulk role assignment failed';
    } finally {
      this.isLoading = false;
    }
  }

  public getBulkActionMessage(): string {
    const count = this.selectedCount;
    switch (this.bulkActionType) {
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

  public getBulkActionTitle(): string {
    switch (this.bulkActionType) {
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

  public getBulkActionButtonText(): string {
    const count = this.selectedCount;
    switch (this.bulkActionType) {
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

  // Expansion methods
  public toggleUserExpansion(userId: string): void {
    if (this.expandedUserIds.has(userId)) {
      this.expandedUserIds.delete(userId);
    } else {
      this.expandedUserIds.add(userId);
    }
  }

  public isUserExpanded(userId: string): boolean {
    return this.expandedUserIds.has(userId);
  }

  // Get roles for a specific user
  public getUserRoles(userId: string): RoleEntity[] {
    const roleIds = this.userRoleMap.get(userId) || [];
    return this.roles.filter(role => roleIds.includes(role.ID));
  }
}