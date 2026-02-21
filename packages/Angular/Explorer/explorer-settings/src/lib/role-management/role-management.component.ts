import { Component, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { ResourceData, MJRoleEntity } from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { RoleDialogData, RoleDialogResult } from './role-dialog/role-dialog.component';

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
  public showMobileFilters = false;
  public expandedRoleId: string | null = null;

  // Role permissions (simplified view)
  public rolePermissions: Map<string, string[]> = new Map();

  private destroy$ = new Subject<void>();
  private metadata = new Metadata();

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Role Management"
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
      });
    }
  }

  private async loadRoles(): Promise<MJRoleEntity[]> {
    const rv = new RunView();
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