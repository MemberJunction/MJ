import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/global';
import { UserEntity, RoleEntity, UserRoleEntity } from '@memberjunction/core-entities';
import { SharedSettingsModule } from '../shared/shared-settings.module';
import { UserDialogComponent, UserDialogData, UserDialogResult } from './user-dialog/user-dialog.component';
import { WindowModule } from '@progress/kendo-angular-dialog';

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
  standalone: true,
  imports: [CommonModule, FormsModule, SharedSettingsModule, UserDialogComponent, WindowModule],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss'],
})
export class UserManagementComponent implements OnInit, OnDestroy {
  // State management
  public users: UserEntity[] = [];
  public filteredUsers: UserEntity[] = [];
  public roles: RoleEntity[] = [];
  public selectedUser: UserEntity | null = null;
  public isLoading = false;
  public error: string | null = null;

  // Dialog state
  public showUserDialog = false;
  public userDialogData: UserDialogData | null = null;

  // Stats
  public stats: UserStats = {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminUsers: 0, // This will be based on roles, not Type
  };

  // Filters
  public filters$ = new BehaviorSubject<FilterOptions>({
    status: 'all',
    role: '',
    search: '',
  });

  // UI State
  public showCreateDialog = false;
  public showEditDialog = false;
  public showDeleteConfirm = false;
  public viewMode: 'grid' | 'cards' = 'grid';

  // User-Role mapping
  private userRoleMap = new Map<string, string[]>(); // userId -> roleIds[]

  // Grid configuration
  public gridConfig = {
    pageSize: 20,
    sortField: 'Name',
    sortDirection: 'asc',
  };

  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  constructor() {}

  ngOnInit(): void {
    this.loadInitialData();
    this.setupFilterSubscription();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;

      // Load users, roles, and user-role relationships in parallel
      const [users, roles, userRoles] = await Promise.all([this.loadUsers(), this.loadRoles(), this.loadUserRoles()]);

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
      ResultType: 'entity_object',
    });

    return result.Success ? result.Results : [];
  }

  private async loadRoles(): Promise<RoleEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<RoleEntity>({
      EntityName: 'Roles',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC',
    });

    return result.Success ? result.Results : [];
  }

  private async loadUserRoles(): Promise<UserRoleEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<UserRoleEntity>({
      EntityName: 'User Roles',
      ResultType: 'entity_object',
    });

    return result.Success ? result.Results : [];
  }

  private buildUserRoleMapping(userRoles: UserRoleEntity[]): void {
    this.userRoleMap.clear();

    userRoles.forEach((userRole) => {
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
      filtered = filtered.filter((user) => (filters.status === 'active' ? user.IsActive : !user.IsActive));
    }

    // Apply role filter
    if (filters.role) {
      filtered = filtered.filter((user) => {
        const userRoles = this.userRoleMap.get(user.ID) || [];
        return userRoles.includes(filters.role);
      });
    }

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (user) =>
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
      activeUsers: this.users.filter((u) => u.IsActive).length,
      inactiveUsers: this.users.filter((u) => !u.IsActive).length,
      adminUsers: this.users.filter((u) => u.Type === 'Owner').length, // Using Owner as admin type
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
      ...partial,
    });
  }

  public selectUser(user: UserEntity): void {
    this.selectedUser = user;
    this.showEditDialog = true;
  }

  public createNewUser(): void {
    this.userDialogData = {
      mode: 'create',
      availableRoles: this.roles,
    };
    this.showUserDialog = true;
  }

  public editUser(user: UserEntity): void {
    this.userDialogData = {
      user: user,
      mode: 'edit',
      availableRoles: this.roles,
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

  public toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'cards' : 'grid';
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
      this.filteredUsers.forEach((user) => {
        const row = [
          this.escapeCSV(user.Name || ''),
          this.escapeCSV(user.FirstName || ''),
          this.escapeCSV(user.LastName || ''),
          this.escapeCSV(user.Email || ''),
          this.escapeCSV(user.Type || ''),
          user.IsActive ? 'Active' : 'Inactive',
          user.__mj_CreatedAt ? new Date(user.__mj_CreatedAt).toLocaleDateString() : '',
          user.__mj_UpdatedAt ? new Date(user.__mj_UpdatedAt).toLocaleDateString() : '',
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
}
