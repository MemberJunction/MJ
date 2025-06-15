import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import { UserEntity, RoleEntity } from '@memberjunction/core-entities';
import { SharedSettingsModule } from '../shared/shared-settings.module';
import { UserViewGridComponent } from '@memberjunction/ng-user-view-grid';

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
  imports: [
    CommonModule,
    FormsModule,
    SharedSettingsModule,
    UserViewGridComponent
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss']
})
export class UserManagementComponent implements OnInit, OnDestroy {
  @ViewChild('userGrid') userGrid?: UserViewGridComponent;
  
  // State management
  public users: UserEntity[] = [];
  public filteredUsers: UserEntity[] = [];
  public roles: RoleEntity[] = [];
  public selectedUser: UserEntity | null = null;
  public isLoading = false;
  public error: string | null = null;
  
  // Stats
  public stats: UserStats = {
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    adminUsers: 0
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
  public viewMode: 'grid' | 'cards' = 'grid';
  
  // Grid configuration
  public gridConfig = {
    pageSize: 20,
    sortField: 'Name',
    sortDirection: 'asc'
  };
  
  private destroy$ = new Subject<void>();
  
  constructor() {}
  
  ngOnInit(): void {
    this.loadInitialData();
    this.setupFilterSubscription();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  private async loadInitialData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      
      // Load users and roles in parallel
      const [users, roles] = await Promise.all([
        this.loadUsers(),
        this.loadRoles()
      ]);
      
      this.users = users;
      this.roles = roles;
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
      // This would need to be implemented based on your user-role relationship
      // For now, we'll skip this filter
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
      adminUsers: this.users.filter(u => u.Type === 'Administrator').length
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
    this.selectedUser = null;
    this.showCreateDialog = true;
  }
  
  public editUser(user: UserEntity): void {
    this.selectedUser = user;
    this.showEditDialog = true;
  }
  
  public confirmDeleteUser(user: UserEntity): void {
    this.selectedUser = user;
    this.showDeleteConfirm = true;
  }
  
  public async deleteUser(): Promise<void> {
    if (!this.selectedUser) return;
    
    try {
      // Implement user deletion logic
      this.showDeleteConfirm = false;
      await this.loadInitialData();
    } catch (error) {
      console.error('Error deleting user:', error);
      this.error = 'Failed to delete user';
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
    // Implement export functionality
    console.log('Export users');
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
      case 'Administrator':
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
}