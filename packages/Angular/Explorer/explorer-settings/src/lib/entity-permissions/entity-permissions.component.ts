import { Component, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import {
  MJEntityPermissionEntity,
  MJEntityEntity,
  MJRoleEntity,
  ResourceData
} from '@memberjunction/core-entities';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { FilterFieldConfig, ViewToggleOption } from '@memberjunction/ng-ui-components';
import { PermissionDialogData, PermissionDialogResult } from './permission-dialog/permission-dialog.component';

interface PermissionsStats {
  totalEntities: number;
  publicEntities: number;
  restrictedEntities: number;
  totalPermissions: number;
}

interface FilterOptions {
  entitySearch: string;
  accessLevel: 'all' | 'public' | 'restricted' | 'custom';
  roleId: string | null;
}

interface EntityAccess {
  entity: MJEntityEntity;
  isPublic: boolean;
  permissions: MJEntityPermissionEntity[];
  rolePermissions: Map<string, PermissionLevel>;
}

interface PermissionLevel {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

@Component({
  standalone: false,
  selector: 'mj-entity-permissions',
  templateUrl: './entity-permissions.component.html',
  styleUrls: ['../shared/styles/_admin-patterns.css', './entity-permissions.component.css']
})
@RegisterClass(BaseDashboard, 'EntityPermissions')
export class EntityPermissionsComponent extends BaseDashboard implements OnDestroy {
  // State management
  public entityAccess: EntityAccess[] = [];
  public filteredEntityAccess: EntityAccess[] = [];
  public roles: MJRoleEntity[] = [];
  public isLoading = false;
  public error: string | null = null;
  
  // Permission dialog state
  public showPermissionDialog = false;
  public permissionDialogData: PermissionDialogData | null = null;
  
  // Stats
  public stats: PermissionsStats = {
    totalEntities: 0,
    publicEntities: 0,
    restrictedEntities: 0,
    totalPermissions: 0
  };
  
  // Filters
  public filters$ = new BehaviorSubject<FilterOptions>({
    entitySearch: '',
    accessLevel: 'all',
    roleId: null
  });
  
  // UI State
  public expandedEntityId: string | null = null;
  public viewMode: 'grid' | 'list' = 'list';

  /** Options for the <mj-view-toggle> in the interior chrome. Icon-only;
      title drives the tooltip + aria-label. */
  public readonly viewToggleOptions: ViewToggleOption[] = [
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
    { key: 'grid', icon: 'fa-solid fa-th',   title: 'Grid View' }
  ];

  protected override destroy$ = new Subject<void>();
  private get metadata() { return this.ProviderToUse; }
  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Permissions"
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
      
      // Load all required data in parallel
      const [entities, permissions, roles] = await Promise.all([
        this.loadEntities(),
        this.loadEntityPermissions(),
        this.loadRoles()
      ]);
      
      // Process the data
      this.roles = roles;
      this.processEntityAccess(entities, permissions);
      this.calculateStats();
      this.applyFilters();
      
    } catch (error) {
      console.error('Error loading permissions data:', error);
      this.error = 'Failed to load permissions data. Please try again.';
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    }
  }

  private async loadEntities(): Promise<MJEntityEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJEntityEntity>({
      EntityName: 'MJ: Entities',
      ResultType: 'entity_object',
      OrderBy: 'Name ASC'
    });
    
    return result.Success ? result.Results : [];
  }
  
  private async loadEntityPermissions(): Promise<MJEntityPermissionEntity[]> {
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const result = await rv.RunView<MJEntityPermissionEntity>({
      EntityName: 'MJ: Entity Permissions',
      ResultType: 'entity_object',
      OrderBy: 'EntityID, RoleID'
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
  
  private processEntityAccess(entities: MJEntityEntity[], permissions: MJEntityPermissionEntity[]): void {
    // Group permissions by entity
    const permissionsByEntity = new Map<string, MJEntityPermissionEntity[]>();
    
    for (const permission of permissions) {
      const entityId = permission.EntityID;
      if (!permissionsByEntity.has(entityId)) {
        permissionsByEntity.set(entityId, []);
      }
      permissionsByEntity.get(entityId)!.push(permission);
    }
    
    // Create EntityAccess objects
    this.entityAccess = entities.map(entity => {
      const entityPermissions = permissionsByEntity.get(entity.ID) || [];
      const rolePermissions = new Map<string, PermissionLevel>();
      
      // Process permissions by role
      for (const permission of entityPermissions) {
        if (permission.RoleID) {
          rolePermissions.set(permission.RoleID, {
            canCreate: permission.CanCreate || false,
            canRead: permission.CanRead || false,
            canUpdate: permission.CanUpdate || false,
            canDelete: permission.CanDelete || false
          });
        }
      }
      
      return {
        entity,
        isPublic: entity.AllowAllRowsAPI || false,
        permissions: entityPermissions,
        rolePermissions
      };
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
    let filtered = [...this.entityAccess];
    
    // Apply entity search
    if (filters.entitySearch) {
      const searchLower = filters.entitySearch.toLowerCase();
      filtered = filtered.filter(ea =>
        ea.entity.Name?.toLowerCase().includes(searchLower) ||
        ea.entity.Description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply access level filter
    switch (filters.accessLevel) {
      case 'public':
        filtered = filtered.filter(ea => ea.isPublic);
        break;
      case 'restricted':
        filtered = filtered.filter(ea => !ea.isPublic && ea.permissions.length === 0);
        break;
      case 'custom':
        filtered = filtered.filter(ea => !ea.isPublic && ea.permissions.length > 0);
        break;
    }
    
    // Apply role filter
    if (filters.roleId) {
      filtered = filtered.filter(ea => 
        ea.rolePermissions.has(filters.roleId!)
      );
    }
    
    this.filteredEntityAccess = filtered;
  }
  
  private calculateStats(): void {
    const publicEntities = this.entityAccess.filter(ea => ea.isPublic).length;
    const customPermissions = this.entityAccess.filter(ea => !ea.isPublic && ea.permissions.length > 0).length;
    const totalPermissions = this.entityAccess.reduce((sum, ea) => sum + ea.permissions.length, 0);
    
    this.stats = {
      totalEntities: this.entityAccess.length,
      publicEntities,
      restrictedEntities: this.entityAccess.length - publicEntities - customPermissions,
      totalPermissions
    };
  }
  
  // Public methods for template
  public onAccessLevelChange(level: 'all' | 'public' | 'restricted' | 'custom'): void {
    this.updateFilter({ accessLevel: level });
  }

  public updateFilter(partial: Partial<FilterOptions>): void {
    this.filters$.next({
      ...this.filters$.value,
      ...partial
    });
    // Discrete changes (chips, popover dropdowns) apply immediately. Text search
    // still goes through the 300ms debounce in setupFilterSubscription.
    if (!('entitySearch' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  // -- Filter panel binding (mj-filter-panel inside the one Filter popover) ---
  // Concise chrome: Access level + Role both live behind the single Filter
  // button; applied filters surface as removable chips below the card.

  public get filterFields(): FilterFieldConfig[] {
    return [
      {
        key: 'accessLevel',
        type: 'chips',
        label: 'Access level',
        chipOptions: [
          { text: 'All', value: 'all' },
          { text: 'Public', value: 'public' },
          { text: 'Restricted', value: 'restricted' },
          { text: 'Custom', value: 'custom' },
        ],
      },
      {
        key: 'roleId',
        type: 'dropdown',
        label: 'Role',
        icon: 'fa-solid fa-user-shield',
        placeholder: 'All Roles',
        filterable: this.roles.length > 10,
        options: [
          { text: 'All Roles', value: '' },
          ...this.roles.map(r => ({ text: r.Name ?? '', value: r.ID }))
        ]
      }
    ];
  }

  public get filterValues(): Record<string, unknown> {
    return { accessLevel: this.filters$.value.accessLevel, roleId: this.filters$.value.roleId ?? '' };
  }

  /** Total active filters (Access level + Role) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    const f = this.filters$.value;
    return (f.accessLevel !== 'all' ? 1 : 0) + (f.roleId ? 1 : 0);
  }

  public onFilterPanelChange(values: Record<string, unknown>): void {
    const partial: Partial<FilterOptions> = {};
    if ('accessLevel' in values) {
      partial.accessLevel = (values['accessLevel'] as FilterOptions['accessLevel']) || 'all';
    }
    if ('roleId' in values) {
      partial.roleId = (values['roleId'] as string) || null;
    }
    this.updateFilter(partial);
  }

  /** Clear all filters (Access level + Role); search persists. */
  public clearAllAppliedFilters(): void {
    this.updateFilter({ accessLevel: 'all', roleId: null });
  }
  
  public toggleEntityExpansion(entityId: string): void {
    this.expandedEntityId = this.expandedEntityId === entityId ? null : entityId;
  }
  
  public isEntityExpanded(entityId: string): boolean {
    return this.expandedEntityId === entityId;
  }
  
  public editEntityPermissions(entityAccess: EntityAccess): void {
    console.log('Opening permission dialog for entity:', entityAccess.entity.Name);
    console.log('Entity permissions:', entityAccess.permissions);
    console.log('Available roles:', this.roles);
    
    this.permissionDialogData = {
      entity: entityAccess.entity,
      roles: this.roles,
      existingPermissions: entityAccess.permissions
    };
    this.showPermissionDialog = true;
    
    console.log('Dialog data set:', this.permissionDialogData);
    console.log('Dialog visible:', this.showPermissionDialog);
  }
  
  public onPermissionDialogResult(result: PermissionDialogResult): void {
    this.showPermissionDialog = false;
    this.permissionDialogData = null;

    if (result.action === 'save') {
      // Refresh the data after save
      this.loadInitialData();
    }
  }
  
  public async savePermissions(): Promise<void> {
    // This method is now handled by the dialog component
    // Keeping for backwards compatibility but not used
    console.warn('savePermissions method is deprecated - use PermissionDialogComponent instead');
  }
  
  public getAccessLevelClass(entityAccess: EntityAccess): string {
    if (entityAccess.isPublic) {
      return 'access-public';
    } else if (entityAccess.permissions.length === 0) {
      return 'access-restricted';
    } else {
      return 'access-custom';
    }
  }
  
  public getAccessLevelLabel(entityAccess: EntityAccess): string {
    if (entityAccess.isPublic) {
      return 'Public';
    } else if (entityAccess.permissions.length === 0) {
      return 'Restricted';
    } else {
      return 'Custom';
    }
  }
  
  public getRoleName(roleId: string): string {
    const role = this.roles.find(r => UUIDsEqual(r.ID, roleId));
    return role?.Name || 'Unknown Role';
  }
  
  public hasPermission(entityAccess: EntityAccess, roleId: string, permission: keyof PermissionLevel): boolean {
    const rolePermission = entityAccess.rolePermissions.get(roleId);
    return rolePermission ? rolePermission[permission] : false;
  }
  
  public refreshData(): void {
    this.loadInitialData();
  }
  
  public setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode = mode;
  }
}