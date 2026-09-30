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
  public EntityAccess: EntityAccess[] = [];

  /** @deprecated Use {@link EntityAccess}. */
  public get entityAccess(): EntityAccess[] {
    return this.EntityAccess;
  }
  /** @deprecated Use {@link EntityAccess}. */
  public set entityAccess(value: EntityAccess[]) {
    this.EntityAccess = value;
  }
  public FilteredEntityAccess: EntityAccess[] = [];

  /** @deprecated Use {@link FilteredEntityAccess}. */
  public get filteredEntityAccess(): EntityAccess[] {
    return this.FilteredEntityAccess;
  }
  /** @deprecated Use {@link FilteredEntityAccess}. */
  public set filteredEntityAccess(value: EntityAccess[]) {
    this.FilteredEntityAccess = value;
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
  public isLoading = false;
  public error: string | null = null;
  
  // Permission dialog state
  public ShowPermissionDialog = false;

  /** @deprecated Use {@link ShowPermissionDialog}. */
  public get showPermissionDialog() {
    return this.ShowPermissionDialog;
  }
  /** @deprecated Use {@link ShowPermissionDialog}. */
  public set showPermissionDialog(value) {
    this.ShowPermissionDialog = value;
  }
  public PermissionDialogData: PermissionDialogData | null = null;

  /** @deprecated Use {@link PermissionDialogData}. */
  public get permissionDialogData(): PermissionDialogData | null {
    return this.PermissionDialogData;
  }
  /** @deprecated Use {@link PermissionDialogData}. */
  public set permissionDialogData(value: PermissionDialogData | null) {
    this.PermissionDialogData = value;
  }
  
  // Stats
  public Stats: PermissionsStats = {
    totalEntities: 0,
    publicEntities: 0,
    restrictedEntities: 0,
    totalPermissions: 0
  };

  /** @deprecated Use {@link Stats}. */
  public get stats(): PermissionsStats {
    return this.Stats;
  }
  /** @deprecated Use {@link Stats}. */
  public set stats(value: PermissionsStats) {
    this.Stats = value;
  }
  
  // Filters
  public Filters$ = new BehaviorSubject<FilterOptions>({
    entitySearch: '',
    accessLevel: 'all',
    roleId: null
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
  public ExpandedEntityId: string | null = null;

  /** @deprecated Use {@link ExpandedEntityId}. */
  public get expandedEntityId(): string | null {
    return this.ExpandedEntityId;
  }
  /** @deprecated Use {@link ExpandedEntityId}. */
  public set expandedEntityId(value: string | null) {
    this.ExpandedEntityId = value;
  }
  public ViewMode: 'grid' | 'list' = 'list';

  /** @deprecated Use {@link ViewMode}. */
  public get viewMode(): 'grid' | 'list' {
    return this.ViewMode;
  }
  /** @deprecated Use {@link ViewMode}. */
  public set viewMode(value: 'grid' | 'list') {
    this.ViewMode = value;
  }

  /** Options for the <mj-view-toggle> in the interior chrome. Icon-only;
      title drives the tooltip + aria-label. */
  public readonly ViewToggleOptions: ViewToggleOption[] = [
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
    { key: 'grid', icon: 'fa-solid fa-th',   title: 'Grid View' }
  ];

  /** @deprecated Use {@link ViewToggleOptions}. */
  public get viewToggleOptions(): ViewToggleOption[] {
    return this.ViewToggleOptions;
  }

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
    this.LoadInitialData();
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
      
      // Load all required data in parallel
      const [entities, permissions, roles] = await Promise.all([
        this.loadEntities(),
        this.loadEntityPermissions(),
        this.loadRoles()
      ]);
      
      // Process the data
      this.Roles = roles;
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

  /** @deprecated Use {@link LoadInitialData}. */
  public async loadInitialData(): Promise<void> {
    return this.LoadInitialData();
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
    this.EntityAccess = entities.map(entity => {
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
    this.Filters$
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
    const filters = this.Filters$.value;
    let filtered = [...this.EntityAccess];
    
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
    
    this.FilteredEntityAccess = filtered;
  }
  
  private calculateStats(): void {
    const publicEntities = this.EntityAccess.filter(ea => ea.isPublic).length;
    const customPermissions = this.EntityAccess.filter(ea => !ea.isPublic && ea.permissions.length > 0).length;
    const totalPermissions = this.EntityAccess.reduce((sum, ea) => sum + ea.permissions.length, 0);
    
    this.Stats = {
      totalEntities: this.EntityAccess.length,
      publicEntities,
      restrictedEntities: this.EntityAccess.length - publicEntities - customPermissions,
      totalPermissions
    };
  }
  
  // Public methods for template
  public OnAccessLevelChange(level: 'all' | 'public' | 'restricted' | 'custom'): void {
    this.UpdateFilter({ accessLevel: level });
  }

  /** @deprecated Use {@link OnAccessLevelChange}. */
  public onAccessLevelChange(level: 'all' | 'public' | 'restricted' | 'custom'): void {
    return this.OnAccessLevelChange(level);
  }

  public UpdateFilter(partial: Partial<FilterOptions>): void {
    this.Filters$.next({
      ...this.Filters$.value,
      ...partial
    });
    // Discrete changes (chips, popover dropdowns) apply immediately. Text search
    // still goes through the 300ms debounce in setupFilterSubscription.
    if (!('entitySearch' in partial)) {
      this.applyFilters();
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link UpdateFilter}. */
  public updateFilter(partial: Partial<FilterOptions>): void {
    return this.UpdateFilter(partial);
  }

  // -- Filter panel binding (mj-filter-panel inside the one Filter popover) ---
  // Concise chrome: Access level + Role both live behind the single Filter
  // button; applied filters surface as removable chips below the card.

  public get FilterFields(): FilterFieldConfig[] {
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

  public get FilterValues(): Record<string, unknown> {
    return { accessLevel: this.Filters$.value.accessLevel, roleId: this.Filters$.value.roleId ?? '' };
  }

  /** @deprecated Use {@link FilterValues}. */
  public get filterValues(): Record<string, unknown> {
    return this.FilterValues;
  }

  /** Total active filters (Access level + Role) — drives the Filter button badge. */
  public get TotalActiveFilterCount(): number {
    const f = this.Filters$.value;
    return (f.accessLevel !== 'all' ? 1 : 0) + (f.roleId ? 1 : 0);
  }

  public OnFilterPanelChange(values: Record<string, unknown>): void {
    const partial: Partial<FilterOptions> = {};
    if ('accessLevel' in values) {
      partial.accessLevel = (values['accessLevel'] as FilterOptions['accessLevel']) || 'all';
    }
    if ('roleId' in values) {
      partial.roleId = (values['roleId'] as string) || null;
    }
    this.UpdateFilter(partial);
  }

  /** @deprecated Use {@link OnFilterPanelChange}. */
  public onFilterPanelChange(values: Record<string, unknown>): void {
    return this.OnFilterPanelChange(values);
  }

  /** Clear all filters (Access level + Role); search persists. */
  public ClearAllAppliedFilters(): void {
    this.UpdateFilter({ accessLevel: 'all', roleId: null });
  }

  /** @deprecated Use {@link ClearAllAppliedFilters}. */
  public clearAllAppliedFilters(): void {
    return this.ClearAllAppliedFilters();
  }

  /** True when search and/or panel filters are narrowing the list — gates the
   *  no-results empty-state "Reset filters" CTA. */
  public get IsListNarrowed(): boolean {
    return this.Filters$.value.entitySearch !== '' || this.TotalActiveFilterCount > 0;
  }

  /** Reset everything narrowing the list (search + Access level + Role) and
   *  refresh immediately. Wired to the no-results empty-state CTA. Unlike
   *  clearAllAppliedFilters(), this also clears the search box. */
  public ResetAllFiltersAndSearch(): void {
    this.Filters$.next({ entitySearch: '', accessLevel: 'all', roleId: null });
    this.applyFilters();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ResetAllFiltersAndSearch}. */
  public resetAllFiltersAndSearch(): void {
    return this.ResetAllFiltersAndSearch();
  }

  /** Empty-state CTA handler: reset filters when the list is narrowed,
   *  otherwise reload the data (the original "Refresh" affordance). */
  public OnEmptyStateAction(): void {
    if (this.IsListNarrowed) {
      this.ResetAllFiltersAndSearch();
    } else {
      this.RefreshData();
    }
  }

  /** @deprecated Use {@link OnEmptyStateAction}. */
  public onEmptyStateAction(): void {
    return this.OnEmptyStateAction();
  }
  
  public ToggleEntityExpansion(entityId: string): void {
    this.ExpandedEntityId = this.ExpandedEntityId === entityId ? null : entityId;
  }

  /** @deprecated Use {@link ToggleEntityExpansion}. */
  public toggleEntityExpansion(entityId: string): void {
    return this.ToggleEntityExpansion(entityId);
  }
  
  public IsEntityExpanded(entityId: string): boolean {
    return this.ExpandedEntityId === entityId;
  }

  /** @deprecated Use {@link IsEntityExpanded}. */
  public isEntityExpanded(entityId: string): boolean {
    return this.IsEntityExpanded(entityId);
  }
  
  public EditEntityPermissions(entityAccess: EntityAccess): void {
    console.log('Opening permission dialog for entity:', entityAccess.entity.Name);
    console.log('Entity permissions:', entityAccess.permissions);
    console.log('Available roles:', this.Roles);
    
    this.PermissionDialogData = {
      entity: entityAccess.entity,
      roles: this.Roles,
      existingPermissions: entityAccess.permissions
    };
    this.ShowPermissionDialog = true;
    
    console.log('Dialog data set:', this.PermissionDialogData);
    console.log('Dialog visible:', this.ShowPermissionDialog);
  }

  /** @deprecated Use {@link EditEntityPermissions}. */
  public editEntityPermissions(entityAccess: EntityAccess): void {
    return this.EditEntityPermissions(entityAccess);
  }
  
  public OnPermissionDialogResult(result: PermissionDialogResult): void {
    this.ShowPermissionDialog = false;
    this.PermissionDialogData = null;

    if (result.action === 'save') {
      // Refresh the data after save
      this.LoadInitialData();
    }
  }

  /** @deprecated Use {@link OnPermissionDialogResult}. */
  public onPermissionDialogResult(result: PermissionDialogResult): void {
    return this.OnPermissionDialogResult(result);
  }
  
  public async SavePermissions(): Promise<void> {
    // This method is now handled by the dialog component
    // Keeping for backwards compatibility but not used
    console.warn('savePermissions method is deprecated - use PermissionDialogComponent instead');
  }

  /** @deprecated Use {@link SavePermissions}. */
  public async savePermissions(): Promise<void> {
    return this.SavePermissions();
  }
  
  public GetAccessLevelClass(entityAccess: EntityAccess): string {
    if (entityAccess.isPublic) {
      return 'access-public';
    } else if (entityAccess.permissions.length === 0) {
      return 'access-restricted';
    } else {
      return 'access-custom';
    }
  }

  /** @deprecated Use {@link GetAccessLevelClass}. */
  public getAccessLevelClass(entityAccess: EntityAccess): string {
    return this.GetAccessLevelClass(entityAccess);
  }
  
  public GetAccessLevelLabel(entityAccess: EntityAccess): string {
    if (entityAccess.isPublic) {
      return 'Public';
    } else if (entityAccess.permissions.length === 0) {
      return 'Restricted';
    } else {
      return 'Custom';
    }
  }

  /** @deprecated Use {@link GetAccessLevelLabel}. */
  public getAccessLevelLabel(entityAccess: EntityAccess): string {
    return this.GetAccessLevelLabel(entityAccess);
  }
  
  public GetRoleName(roleId: string): string {
    const role = this.Roles.find(r => UUIDsEqual(r.ID, roleId));
    return role?.Name || 'Unknown Role';
  }

  /** @deprecated Use {@link GetRoleName}. */
  public getRoleName(roleId: string): string {
    return this.GetRoleName(roleId);
  }
  
  public HasPermission(entityAccess: EntityAccess, roleId: string, permission: keyof PermissionLevel): boolean {
    const rolePermission = entityAccess.rolePermissions.get(roleId);
    return rolePermission ? rolePermission[permission] : false;
  }

  /** @deprecated Use {@link HasPermission}. */
  public hasPermission(entityAccess: EntityAccess, roleId: string, permission: keyof PermissionLevel): boolean {
    return this.HasPermission(entityAccess, roleId, permission);
  }
  
  public RefreshData(): void {
    this.LoadInitialData();
  }

  /** @deprecated Use {@link RefreshData}. */
  public refreshData(): void {
    return this.RefreshData();
  }
  
  public SetViewMode(mode: 'grid' | 'list'): void {
    this.ViewMode = mode;
  }

  /** @deprecated Use {@link SetViewMode}. */
  public setViewMode(mode: 'grid' | 'list'): void {
    return this.SetViewMode(mode);
  }
}