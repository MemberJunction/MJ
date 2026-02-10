import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ResourceData, CredentialTypeEntity, CredentialEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialTypeEditPanelComponent } from '@memberjunction/ng-credentials';
interface FieldSchemaProperty {
    name: string;
    type: string;
    title: string;
    description: string;
    isSecret: boolean;
    required: boolean;
}

interface TypeWithStats extends CredentialTypeEntity {
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
    public types: TypeWithStats[] = [];
    public filteredTypes: TypeWithStats[] = [];
    public credentials: CredentialEntity[] = [];
    public selectedType: TypeWithStats | null = null;
    public schemaProperties: FieldSchemaProperty[] = [];

    // Filters
    public searchText = '';
    public selectedCategoryFilter = '';
    public categories: string[] = [];

    // Permissions
    private _metadata = new Metadata();
    private _permissionCache = new Map<string, boolean>();

    @ViewChild('typeEditPanel') typeEditPanel!: CredentialTypeEditPanelComponent;

    constructor(
        private cdr: ChangeDetectorRef,
        private navigationService: NavigationService
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadData();
    }

    ngOnDestroy(): void {
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

            const rv = new RunView();
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
                const baseTypes = typeResult.Results as CredentialTypeEntity[];
                this.credentials = credResult.Success ? credResult.Results as CredentialEntity[] : [];

                // Calculate stats for each type
                this.types = baseTypes.map(type => this.enrichTypeWithStats(type));

                // Extract unique categories
                this.categories = [...new Set(this.types.map(t => t.Category))].sort();
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
            this.selectedCategoryFilter = config.categoryFilter as string;
        }
    }

    private enrichTypeWithStats(type: CredentialTypeEntity): TypeWithStats {
        const typeCredentials = this.credentials.filter(c => c.CredentialTypeID === type.ID);
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

    public createNewType(): void {
        if (this.typeEditPanel) {
            this.typeEditPanel.open(null);
        }
    }

    public editType(type: TypeWithStats, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.typeEditPanel) {
            this.typeEditPanel.open(type);
        }
    }

    public async deleteType(type: TypeWithStats, event?: Event): Promise<void> {
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

        const confirmed = confirm(`Are you sure you want to delete "${type.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const success = await type.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Credential type "${type.Name}" deleted successfully`, 'success', 3000);
                this.types = this.types.filter(t => t.ID !== type.ID);
                if (this.selectedType?.ID === type.ID) {
                    this.closeDetail();
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

    public createCredentialForType(type: TypeWithStats, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Credentials nav item with the type pre-selected and create panel open
        this.navigationService.OpenNavItemByName('Credentials', {
            typeId: type.ID,
            openCreatePanel: true
        });
    }

    // === Panel Event Handlers ===

    public onTypeSaved(type: CredentialTypeEntity): void {
        const existingIndex = this.types.findIndex(t => t.ID === type.ID);
        const enrichedType = this.enrichTypeWithStats(type);

        if (existingIndex >= 0) {
            this.types[existingIndex] = enrichedType;
        } else {
            this.types.unshift(enrichedType);
        }

        // Update categories if a new one was added
        if (!this.categories.includes(type.Category)) {
            this.categories = [...new Set(this.types.map(t => t.Category))].sort();
        }

        this.applyFilters();
        this.cdr.markForCheck();
    }

    public onTypeDeleted(typeId: string): void {
        this.types = this.types.filter(t => t.ID !== typeId);
        if (this.selectedType?.ID === typeId) {
            this.closeDetail();
        }
        this.applyFilters();
        this.cdr.markForCheck();
    }

    // === Filtering ===

    public onSearchChange(value: string): void {
        this.searchText = value;
        this.applyFilters();
    }

    public onCategoryFilterChange(category: string): void {
        this.selectedCategoryFilter = category;
        this.applyFilters();
    }

    public clearFilters(): void {
        this.searchText = '';
        this.selectedCategoryFilter = '';
        this.applyFilters();
    }

    private applyFilters(): void {
        let filtered = [...this.types];

        // Filter by category
        if (this.selectedCategoryFilter) {
            filtered = filtered.filter(t => t.Category === this.selectedCategoryFilter);
        }

        // Filter by search text
        if (this.searchText.trim()) {
            const search = this.searchText.toLowerCase().trim();
            filtered = filtered.filter(t =>
                t.Name.toLowerCase().includes(search) ||
                (t.Description && t.Description.toLowerCase().includes(search)) ||
                t.Category.toLowerCase().includes(search)
            );
        }

        this.filteredTypes = filtered;
        this.cdr.markForCheck();
    }

    // === Selection ===

    public selectType(type: TypeWithStats): void {
        this.selectedType = type;
        this.parseFieldSchema(type.FieldSchema);
        this.cdr.markForCheck();
    }

    public closeDetail(): void {
        this.selectedType = null;
        this.schemaProperties = [];
        this.cdr.markForCheck();
    }

    private parseFieldSchema(schemaJson: string): void {
        try {
            const schema = JSON.parse(schemaJson) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.schemaProperties = Object.entries(properties).map(([name, prop]) => ({
                name,
                type: (prop.type as string) || 'string',
                title: (prop.title as string) || name,
                description: (prop.description as string) || '',
                isSecret: prop.isSecret === true,
                required: required.includes(name)
            }));

            // Sort by order if available, otherwise by name
            this.schemaProperties.sort((a, b) => {
                const propA = properties[a.name];
                const propB = properties[b.name];
                const orderA = typeof propA.order === 'number' ? propA.order : 999;
                const orderB = typeof propB.order === 'number' ? propB.order : 999;
                return orderA - orderB;
            });

        } catch (e) {
            console.error('Failed to parse field schema:', e);
            this.schemaProperties = [];
        }
    }

    // === Helpers ===

    public getCategoryIcon(category: string): string {
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

    public getCategoryColor(category: string): string {
        const colorMap: Record<string, string> = {
            'AI': '#8b5cf6',
            'Communication': '#3b82f6',
            'Storage': '#06b6d4',
            'Database': '#f59e0b',
            'Authentication': '#10b981',
            'Integration': '#ec4899'
        };
        return colorMap[category] || '#6366f1';
    }

    public getTypesByCategory(): Map<string, TypeWithStats[]> {
        const grouped = new Map<string, TypeWithStats[]>();
        for (const type of this.filteredTypes) {
            const category = type.Category;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(type);
        }
        return grouped;
    }

    public getTotalCredentialCount(): number {
        return this.types.reduce((sum, t) => sum + t.credentialCount, 0);
    }

    public refresh(): void {
        this.loadData();
    }
}
