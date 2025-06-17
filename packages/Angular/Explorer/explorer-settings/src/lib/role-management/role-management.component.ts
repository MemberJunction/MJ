import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { RoleEntity, UserEntity } from '@memberjunction/core-entities';
import { SharedSettingsModule } from '../shared/shared-settings.module';

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
  selector: 'mj-role-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SharedSettingsModule
  ],
  templateUrl: './role-management.component.html',
  styleUrls: ['./role-management.component.scss']
})
export class RoleManagementComponent implements OnInit, OnDestroy {
  // State management
  public roles: RoleEntity[] = [];
  public filteredRoles: RoleEntity[] = [];
  public selectedRole: RoleEntity | null = null;
  public isLoading = false;
  public error: string | null = null;
  
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
      
      // Load roles
      const roles = await this.loadRoles();
      this.roles = roles;
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading role data:', error);
      this.error = 'Failed to load role data. Please try again.';
    } finally {
      this.isLoading = false;
    }
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
  
  public isSystemRole(role: RoleEntity): boolean {
    // System roles typically have certain naming patterns or flags
    const systemRoleNames = ['Administrator', 'User', 'Guest', 'Developer'];
    return systemRoleNames.includes(role.Name || '');
  }
  
  // Public methods for template
  public onSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.updateFilter({ search: value });
  }
  
  public onTypeFilterChange(type: 'all' | 'system' | 'custom'): void {
    this.updateFilter({ type });
  }
  
  public updateFilter(partial: Partial<FilterOptions>): void {
    this.filters$.next({
      ...this.filters$.value,
      ...partial
    });
  }
  
  public toggleRoleExpansion(roleId: string): void {
    this.expandedRoleId = this.expandedRoleId === roleId ? null : roleId;
  }
  
  public isRoleExpanded(roleId: string): boolean {
    return this.expandedRoleId === roleId;
  }
  
  public createNewRole(): void {
    this.selectedRole = null;
    this.showCreateDialog = true;
  }
  
  public editRole(role: RoleEntity): void {
    this.selectedRole = role;
    this.showEditDialog = true;
  }
  
  public confirmDeleteRole(role: RoleEntity): void {
    this.selectedRole = role;
    this.showDeleteConfirm = true;
  }
  
  public async deleteRole(): Promise<void> {
    if (!this.selectedRole) return;
    
    try {
      // Implement role deletion logic
      this.showDeleteConfirm = false;
      await this.loadInitialData();
    } catch (error) {
      console.error('Error deleting role:', error);
      this.error = 'Failed to delete role';
    }
  }
  
  public getRoleIcon(role: RoleEntity): string {
    if (this.isSystemRole(role)) {
      return 'fa-shield-halved';
    }
    return 'fa-user-tag';
  }
  
  public getRoleTypeLabel(role: RoleEntity): string {
    return this.isSystemRole(role) ? 'System' : 'Custom';
  }
  
  public getRoleTypeClass(role: RoleEntity): string {
    return this.isSystemRole(role) ? 'badge-system' : 'badge-custom';
  }
  
  public refreshData(): void {
    this.loadInitialData();
  }
}