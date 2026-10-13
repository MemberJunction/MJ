import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ResourceData, MJCredentialTypeEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialTypeEditPanelComponent } from '@memberjunction/ng-credentials';
import { FilterFieldConfig, MJConfirmService } from '@memberjunction/ng-ui-components';
interface FieldSchemaProperty {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
}

interface TypeWithStats extends MJCredentialTypeEntity {
    credentialCount: number;
    activeCount: number;
    expiringCount: number;
}

@RegisterClass(BaseResourceComponent, 'CredentialsTypesResource')
@Component({
  standalone: false,
    selector: 'mj-credentials-types-resource',
    templateUrl: './credentials-types-resource.component.html',
    styleUrls: ['./credentials-types-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsTypesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public Types: TypeWithStats[] = [];

    /** @deprecated Use {@link Types}. */
    public get types(): TypeWithStats[] {
      return this.Types;
    }
    /** @deprecated Use {@link Types}. */
    public set types(value: TypeWithStats[]) {
      this.Types = value;
    }
    public FilteredTypes: TypeWithStats[] = [];

    /** @deprecated Use {@link FilteredTypes}. */
    public get filteredTypes(): TypeWithStats[] {
      return this.FilteredTypes;
    }
    /** @deprecated Use {@link FilteredTypes}. */
    public set filteredTypes(value: TypeWithStats[]) {
      this.FilteredTypes = value;
    }
    public Credentials: MJCredentialEntity[] = [];

    /** @deprecated Use {@link Credentials}. */
    public get credentials(): MJCredentialEntity[] {
      return this.Credentials;
    }
    /** @deprecated Use {@link Credentials}. */
    public set credentials(value: MJCredentialEntity[]) {
      this.Credentials = value;
    }
    public SelectedType: TypeWithStats | null = null;

    /** @deprecated Use {@link SelectedType}. */
    public get selectedType(): TypeWithStats | null {
      return this.SelectedType;
    }
    /** @deprecated Use {@link SelectedType}. */
    public set selectedType(value: TypeWithStats | null) {
      this.SelectedType = value;
    }
    public SchemaProperties: FieldSchemaProperty[] = [];

    /** @deprecated Use {@link SchemaProperties}. */
    public get schemaProperties(): FieldSchemaProperty[] {
      return this.SchemaProperties;
    }
    /** @deprecated Use {@link SchemaProperties}. */
    public set schemaProperties(value: FieldSchemaProperty[]) {
      this.SchemaProperties = value;
    }

    // Filters
    public SearchText = '';

    /** @deprecated Use {@link SearchText}. */
    public get searchText() {
      return this.SearchText;
    }
    /** @deprecated Use {@link SearchText}. */
    public set searchText(value) {
      this.SearchText = value;
    }
    public SelectedCategoryFilter = '';

    /** @deprecated Use {@link SelectedCategoryFilter}. */
    public get selectedCategoryFilter() {
      return this.SelectedCategoryFilter;
    }
    /** @deprecated Use {@link SelectedCategoryFilter}. */
    public set selectedCategoryFilter(value) {
      this.SelectedCategoryFilter = value;
    }
    public Categories: string[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): string[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: string[]) {
      this.Categories = value;
    }

    // Permissions
    private _metadata = this.ProviderToUse;
    private _permissionCache = new Map<string, boolean>();

    @ViewChild('typeEditPanel') TypeEditPanel!: CredentialTypeEditPanelComponent;

    /** @deprecated Use {@link TypeEditPanel}. */
    get typeEditPanel(): CredentialTypeEditPanelComponent {
      return this.TypeEditPanel;
    }
    /** @deprecated Use {@link TypeEditPanel}. */
    set typeEditPanel(value: CredentialTypeEditPanelComponent) {
      this.TypeEditPanel = value;
    }

    public get FilterFields(): FilterFieldConfig[] {
        return [
            {
                key: 'categoryFilter',
                type: 'dropdown',
                label: 'Category',
                icon: 'fa-solid fa-folder',
                placeholder: 'All Categories',
                filterable: true,
                options: [
                    { text: 'All Categories', value: '' },
                    ...this.Categories.map(c => ({ text: c, value: c }))
                ]
            }
        ];
    }
    public get FilterValues(): Record<string, unknown> {
        return { categoryFilter: this.SelectedCategoryFilter };
    }
    public get ActiveFilterCount(): number {
        return this.SelectedCategoryFilter ? 1 : 0;
    }
    public OnFilterValuesChange(v: Record<string, unknown>): void {
        const next = (v ?? {}) as { categoryFilter?: string };
        if ((next.categoryFilter ?? '') !== this.SelectedCategoryFilter) {
            this.OnCategoryFilterChange(next.categoryFilter ?? '');
        }
    }

    /** @deprecated Use {@link OnFilterValuesChange}. */
    public onFilterValuesChange(v: Record<string, unknown>): void {
      return this.OnFilterValuesChange(v);
    }
    public ResetFilters(): void {
        if (this.SelectedCategoryFilter) this.OnCategoryFilterChange('');
    }

    /** @deprecated Use {@link ResetFilters}. */
    public resetFilters(): void {
      return this.ResetFilters();
    }

    constructor(
        private cdr: ChangeDetectorRef,
        private confirm: MJConfirmService) {
        super();
    }

    ngOnInit(): void {
        super.ngOnInit();
        this.loadData();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
        // Cleanup if needed
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Credential Types';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-cubes';
    }

    // === Permission Checks ===

    public get UserCanCreate(): boolean {
        return this.checkEntityPermission('MJ: Credential Types', 'Create');
    }

    public get UserCanUpdate(): boolean {
        return this.checkEntityPermission('MJ: Credential Types', 'Update');
    }

    public get UserCanDelete(): boolean {
        return this.checkEntityPermission('MJ: Credential Types', 'Delete');
    }

    public get UserCanCreateCredential(): boolean {
        return this.checkEntityPermission('MJ: Credentials', 'Create');
    }

    private checkEntityPermission(entityName: string, permissionType: 'Create' | 'Read' | 'Update' | 'Delete'): boolean {
        const cacheKey = `${entityName}_${permissionType}`;

        if (this._permissionCache.has(cacheKey)) {
            return this._permissionCache.get(cacheKey)!;
        }

        try {
            const entityInfo = this._metadata.Entities.find(e => e.Name === entityName);
            if (!entityInfo) {
                this._permissionCache.set(cacheKey, false);
                return false;
            }

            const userPermissions = entityInfo.GetUserPermisions(this._metadata.CurrentUser);
            let hasPermission = false;

            switch (permissionType) {
                case 'Create': hasPermission = userPermissions.CanCreate; break;
                case 'Read': hasPermission = userPermissions.CanRead; break;
                case 'Update': hasPermission = userPermissions.CanUpdate; break;
                case 'Delete': hasPermission = userPermissions.CanDelete; break;
            }

            this._permissionCache.set(cacheKey, hasPermission);
            return hasPermission;
        } catch (error) {
            this._permissionCache.set(cacheKey, false);
            return false;
        }
    }

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const [typeResult, credResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credential Types',
                    OrderBy: 'Category, Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credentials',
                    ResultType: 'entity_object'
                }
            ]);

            if (typeResult.Success) {
                const baseTypes = typeResult.Results as MJCredentialTypeEntity[];
                this.Credentials = credResult.Success ? credResult.Results as MJCredentialEntity[] : [];

                // Calculate stats for each type
                this.Types = baseTypes.map(type => this.enrichTypeWithStats(type));

                // Extract unique categories
                this.Categories = [...new Set(this.Types.map(t => t.Category))].sort();
            }

            // Apply any navigation config (e.g., category filter from Categories nav item)
            this.handleNavigationConfig();

            this.applyFilters();

        } catch (error) {
            console.error('Error loading credential types:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error loading credential types', 'error', 3000);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private handleNavigationConfig(): void {
        const config = this.Data?.Configuration;
        if (!config) {
            return;
        }

        // Apply category filter from navigation config
        if (config.categoryFilter) {
            this.SelectedCategoryFilter = config.categoryFilter as string;
        }
    }

    private enrichTypeWithStats(type: MJCredentialTypeEntity): TypeWithStats {
        const typeCredentials = this.Credentials.filter(c => UUIDsEqual(c.CredentialTypeID, type.ID));
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        // Add stats properties directly to the entity object
        const enrichedType = type as TypeWithStats;
        enrichedType.credentialCount = typeCredentials.length;
        enrichedType.activeCount = typeCredentials.filter(c => c.IsActive).length;
        enrichedType.expiringCount = typeCredentials.filter(c =>
            c.ExpiresAt &&
            new Date(c.ExpiresAt) >= now &&
            new Date(c.ExpiresAt) <= thirtyDaysFromNow
        ).length;

        return enrichedType;
    }

    // === CRUD Operations ===

    public CreateNewType(): void {
        if (this.TypeEditPanel) {
            this.TypeEditPanel.open(null);
        }
    }

    /** @deprecated Use {@link CreateNewType}. */
    public createNewType(): void {
      return this.CreateNewType();
    }

    public EditType(type: TypeWithStats, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.TypeEditPanel) {
            this.TypeEditPanel.open(type);
        }
    }

    /** @deprecated Use {@link EditType}. */
    public editType(type: TypeWithStats, event?: Event): void {
      return this.EditType(type, event);
    }

    public async DeleteType(type: TypeWithStats, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }

        if (!this.UserCanDelete) {
            MJNotificationService.Instance.CreateSimpleNotification('You do not have permission to delete credential types', 'warning', 3000);
            return;
        }

        if (type.credentialCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Cannot delete "${type.Name}" - it has ${type.credentialCount} credential(s) using it`,
                'warning',
                4000
            );
            return;
        }

        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete credential type',
            message: `Delete "${type.Name}"?`,
            detail: 'This action cannot be undone.',
        });
        if (!confirmed) return;

        try {
            const success = await type.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Credential type "${type.Name}" deleted successfully`, 'success', 3000);
                this.Types = this.Types.filter(t => !UUIDsEqual(t.ID, type.ID));
                if (UUIDsEqual(this.SelectedType?.ID, type.ID)) {
                    this.CloseDetail();
                }
                this.applyFilters();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete credential type', 'error', 3000);
            }
        } catch (error) {
            console.error('Error deleting credential type:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error deleting credential type', 'error', 3000);
        }
    }

    /** @deprecated Use {@link DeleteType}. */
    public async deleteType(type: TypeWithStats, event?: Event): Promise<void> {
      return this.DeleteType(type, event);
    }

    public CreateCredentialForType(type: TypeWithStats, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Credentials nav item with the type pre-selected and create panel open
        this.navigationService.OpenNavItemByName('Credentials', {
            typeId: type.ID,
            openCreatePanel: true
        });
    }

    /** @deprecated Use {@link CreateCredentialForType}. */
    public createCredentialForType(type: TypeWithStats, event?: Event): void {
      return this.CreateCredentialForType(type, event);
    }

    // === Panel Event Handlers ===

    public OnTypeSaved(type: MJCredentialTypeEntity): void {
        const existingIndex = this.Types.findIndex(t => UUIDsEqual(t.ID, type.ID));
        const enrichedType = this.enrichTypeWithStats(type);

        if (existingIndex >= 0) {
            this.Types[existingIndex] = enrichedType;
        } else {
            this.Types.unshift(enrichedType);
        }

        // Update categories if a new one was added
        if (!this.Categories.includes(type.Category)) {
            this.Categories = [...new Set(this.Types.map(t => t.Category))].sort();
        }

        this.applyFilters();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnTypeSaved}. */
    public onTypeSaved(type: MJCredentialTypeEntity): void {
      return this.OnTypeSaved(type);
    }

    public OnTypeDeleted(typeId: string): void {
        this.Types = this.Types.filter(t => !UUIDsEqual(t.ID, typeId));
        if (UUIDsEqual(this.SelectedType?.ID, typeId)) {
            this.CloseDetail();
        }
        this.applyFilters();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnTypeDeleted}. */
    public onTypeDeleted(typeId: string): void {
      return this.OnTypeDeleted(typeId);
    }

    // === Filtering ===

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(value: string): void {
      return this.OnSearchChange(value);
    }

    public OnCategoryFilterChange(category: string): void {
        this.SelectedCategoryFilter = category;
        this.applyFilters();
    }

    /** @deprecated Use {@link OnCategoryFilterChange}. */
    public onCategoryFilterChange(category: string): void {
      return this.OnCategoryFilterChange(category);
    }

    public ClearFilters(): void {
        this.SearchText = '';
        this.SelectedCategoryFilter = '';
        this.applyFilters();
    }

    /** @deprecated Use {@link ClearFilters}. */
    public clearFilters(): void {
      return this.ClearFilters();
    }

    /** True when search and/or the category filter narrow the list. */
    public get IsListNarrowed(): boolean {
        return !!(this.SearchText || this.SelectedCategoryFilter);
    }

    /** Empty-state CTA: reset filters when narrowed, otherwise create. */
    public OnEmptyStateAction(): void {
        if (this.IsListNarrowed) {
            this.ClearFilters();
        } else {
            this.CreateNewType();
        }
    }

    /** @deprecated Use {@link OnEmptyStateAction}. */
    public onEmptyStateAction(): void {
      return this.OnEmptyStateAction();
    }

    private applyFilters(): void {
        let filtered = [...this.Types];

        // Filter by category
        if (this.SelectedCategoryFilter) {
            filtered = filtered.filter(t => t.Category === this.SelectedCategoryFilter);
        }

        // Filter by search text
        if (this.SearchText.trim()) {
            const search = this.SearchText.toLowerCase().trim();
            filtered = filtered.filter(t =>
                t.Name.toLowerCase().includes(search) ||
                (t.Description && t.Description.toLowerCase().includes(search)) ||
                t.Category.toLowerCase().includes(search)
            );
        }

        this.FilteredTypes = filtered;
        this.cdr.markForCheck();
    }

    // === Selection ===

    public SelectType(type: TypeWithStats): void {
        this.SelectedType = type;
        this.parseFieldSchema(type.FieldSchema);
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SelectType}. */
    public selectType(type: TypeWithStats): void {
      return this.SelectType(type);
    }

    public CloseDetail(): void {
        this.SelectedType = null;
        this.SchemaProperties = [];
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link CloseDetail}. */
    public closeDetail(): void {
      return this.CloseDetail();
    }

    private parseFieldSchema(schemaJson: string): void {
        try {
            const schema = JSON.parse(schemaJson) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.SchemaProperties = Object.entries(properties).map(([name, prop]) => ({
                name,
                type: (prop.type as string) || 'string',
                title: (prop.title as string) || name,
                description: (prop.description as string) || '',
                isSecret: prop.isSecret === true,
                required: required.includes(name)
            }));

            // Sort by order if available, otherwise by name
            this.SchemaProperties.sort((a, b) => {
                const propA = properties[a.name];
                const propB = properties[b.name];
                const orderA = typeof propA.order === 'number' ? propA.order : 999;
                const orderB = typeof propB.order === 'number' ? propB.order : 999;
                return orderA - orderB;
            });

        } catch (e) {
            console.error('Failed to parse field schema:', e);
            this.SchemaProperties = [];
        }
    }

    // === Helpers ===

    public GetCategoryIcon(category: string): string {
        const iconMap: Record<string, string> = {
            'AI': 'fa-solid fa-brain',
            'Communication': 'fa-solid fa-envelope',
            'Storage': 'fa-solid fa-cloud',
            'Database': 'fa-solid fa-database',
            'Authentication': 'fa-solid fa-shield-halved',
            'Integration': 'fa-solid fa-plug'
        };
        return iconMap[category] || 'fa-solid fa-key';
    }

    /** @deprecated Use {@link GetCategoryIcon}. */
    public getCategoryIcon(category: string): string {
      return this.GetCategoryIcon(category);
    }

    public GetCategoryColor(category: string): string {
        const colorMap: Record<string, string> = {
            'AI': 'var(--mj-brand-primary)',
            'Communication': 'var(--mj-brand-primary)',
            'Storage': 'var(--mj-brand-primary)',
            'Database': 'var(--mj-status-warning)',
            'Authentication': 'var(--mj-status-success)',
            'Integration': 'var(--mj-brand-primary)'
        };
        return colorMap[category] || 'var(--mj-brand-primary)';
    }

    /** @deprecated Use {@link GetCategoryColor}. */
    public getCategoryColor(category: string): string {
      return this.GetCategoryColor(category);
    }

    public GetTypesByCategory(): Map<string, TypeWithStats[]> {
        const grouped = new Map<string, TypeWithStats[]>();
        for (const type of this.FilteredTypes) {
            const category = type.Category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return grouped;
    }

    /** @deprecated Use {@link GetTypesByCategory}. */
    public getTypesByCategory(): Map<string, TypeWithStats[]> {
      return this.GetTypesByCategory();
    }

    /** Case-insensitive UUID check whether a credential type is the currently selected type. */
    public IsTypeSelected(type: TypeWithStats): boolean {
        return UUIDsEqual(this.SelectedType?.ID, type.ID);
    }

    public GetTotalCredentialCount(): number {
        return this.Types.reduce((sum, t) => sum + t.credentialCount, 0);
    }

    /** @deprecated Use {@link GetTotalCredentialCount}. */
    public getTotalCredentialCount(): number {
      return this.GetTotalCredentialCount();
    }

    public Refresh(): void {
        this.loadData();
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
      return this.Refresh();
    }
}
