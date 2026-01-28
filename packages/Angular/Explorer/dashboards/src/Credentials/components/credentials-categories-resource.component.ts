import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ResourceData, CredentialCategoryEntity, CredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { CredentialCategoryEditPanelComponent } from '@memberjunction/ng-credentials';

export function LoadCredentialsCategoriesResource() {
    // Prevents tree-shaking
}

interface CategoryNode {
    category: CredentialCategoryEntity;
    children: CategoryNode[];
    expanded: boolean;
    level: number;
    typeCount: number;
}

@RegisterClass(BaseResourceComponent, 'CredentialsCategoriesResource')
@Component({
    selector: 'mj-credentials-categories-resource',
    templateUrl: './credentials-categories-resource.component.html',
    styleUrls: ['./credentials-categories-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsCategoriesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public categories: CredentialCategoryEntity[] = [];
    public categoryTree: CategoryNode[] = [];
    public types: CredentialTypeEntity[] = [];
    public selectedNode: CategoryNode | null = null;
    public searchText = '';

    // Permissions
    private _metadata = new Metadata();
    private _permissionCache = new Map<string, boolean>();

    @ViewChild('categoryEditPanel') categoryEditPanel!: CredentialCategoryEditPanelComponent;

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
        return 'Categories';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-folder-tree';
    }

    // === Permission Checks ===

    public get UserCanCreate(): boolean {
        return this.checkEntityPermission('MJ: Credential Categories', 'Create');
    }

    public get UserCanUpdate(): boolean {
        return this.checkEntityPermission('MJ: Credential Categories', 'Update');
    }

    public get UserCanDelete(): boolean {
        return this.checkEntityPermission('MJ: Credential Categories', 'Delete');
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
            const [catResult, typeResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credential Categories',
                    OrderBy: 'Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    ResultType: 'entity_object'
                }
            ]);

            if (catResult.Success) {
                this.categories = catResult.Results as CredentialCategoryEntity[];
            }

            if (typeResult.Success) {
                this.types = typeResult.Results as CredentialTypeEntity[];
            }

            this.buildTree();

        } catch (error) {
            console.error('Error loading credential categories:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error loading categories', 'error', 3000);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildTree(): void {
        const categoryMap = new Map<string, CategoryNode>();

        // Create nodes for all categories with stats
        for (const category of this.categories) {
            const typesInCategory = this.types.filter(t => t.Category === category.Name);
            categoryMap.set(category.ID, {
                category,
                children: [],
                expanded: true,
                level: 0,
                typeCount: typesInCategory.length
            });
        }

        // Build tree structure
        const roots: CategoryNode[] = [];
        for (const category of this.categories) {
            const node = categoryMap.get(category.ID)!;
            if (category.ParentID) {
                const parent = categoryMap.get(category.ParentID);
                if (parent) {
                    node.level = parent.level + 1;
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            } else {
                roots.push(node);
            }
        }

        // Sort children recursively
        const sortNodes = (nodes: CategoryNode[]): void => {
            nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
            for (const node of nodes) {
                sortNodes(node.children);
            }
        };
        sortNodes(roots);

        this.categoryTree = roots;
    }

    // === CRUD Operations ===

    public createNewCategory(): void {
        if (this.categoryEditPanel) {
            this.categoryEditPanel.open(null);
        }
    }

    public createChildCategory(parentNode: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.categoryEditPanel) {
            this.categoryEditPanel.open(null, parentNode.category.ID);
        }
    }

    public editCategory(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.categoryEditPanel) {
            this.categoryEditPanel.open(node.category);
        }
    }

    public async deleteCategory(node: CategoryNode, event?: Event): Promise<void> {
        if (event) {
            event.stopPropagation();
        }

        if (!this.UserCanDelete) {
            MJNotificationService.Instance.CreateSimpleNotification('You do not have permission to delete categories', 'warning', 3000);
            return;
        }

        if (node.children.length > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Cannot delete "${node.category.Name}" - it has ${node.children.length} subcategories`,
                'warning',
                4000
            );
            return;
        }

        if (node.typeCount > 0) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Cannot delete "${node.category.Name}" - it has ${node.typeCount} credential type(s) using it`,
                'warning',
                4000
            );
            return;
        }

        const confirmed = confirm(`Are you sure you want to delete "${node.category.Name}"? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const success = await node.category.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Category "${node.category.Name}" deleted successfully`, 'success', 3000);
                this.categories = this.categories.filter(c => c.ID !== node.category.ID);
                if (this.selectedNode?.category.ID === node.category.ID) {
                    this.selectedNode = null;
                }
                this.buildTree();
                this.cdr.markForCheck();
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to delete category', 'error', 3000);
            }
        } catch (error) {
            console.error('Error deleting category:', error);
            MJNotificationService.Instance.CreateSimpleNotification('Error deleting category', 'error', 3000);
        }
    }

    // === Panel Event Handlers ===

    public onCategorySaved(category: CredentialCategoryEntity): void {
        const existingIndex = this.categories.findIndex(c => c.ID === category.ID);

        if (existingIndex >= 0) {
            this.categories[existingIndex] = category;
        } else {
            this.categories.push(category);
        }

        this.buildTree();
        this.cdr.markForCheck();
    }

    public onCategoryDeleted(categoryId: string): void {
        this.categories = this.categories.filter(c => c.ID !== categoryId);
        if (this.selectedNode?.category.ID === categoryId) {
            this.selectedNode = null;
        }
        this.buildTree();
        this.cdr.markForCheck();
    }

    // === Selection ===

    public selectNode(node: CategoryNode): void {
        this.selectedNode = this.selectedNode?.category.ID === node.category.ID ? null : node;
        this.cdr.markForCheck();
    }

    public toggleExpand(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        node.expanded = !node.expanded;
        this.cdr.markForCheck();
    }

    // === Search ===

    public onSearchChange(value: string): void {
        this.searchText = value;
        if (value) {
            this.expandAll();
        }
        this.cdr.markForCheck();
    }

    public clearSearch(): void {
        this.searchText = '';
        this.cdr.markForCheck();
    }

    public expandAll(): void {
        const expand = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = true;
                expand(node.children);
            }
        };
        expand(this.categoryTree);
        this.cdr.markForCheck();
    }

    public collapseAll(): void {
        const collapse = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = false;
                collapse(node.children);
            }
        };
        collapse(this.categoryTree);
        this.cdr.markForCheck();
    }

    public getFlattenedNodes(): CategoryNode[] {
        const result: CategoryNode[] = [];
        const searchLower = this.searchText.toLowerCase().trim();

        const flatten = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                if (searchLower) {
                    const matches = this.nodeMatchesSearch(node, searchLower);
                    if (matches) {
                        result.push(node);
                    }
                } else {
                    result.push(node);
                }

                if (node.expanded && node.children.length > 0) {
                    flatten(node.children);
                }
            }
        };

        flatten(this.categoryTree);
        return result;
    }

    private nodeMatchesSearch(node: CategoryNode, searchLower: string): boolean {
        const nameMatch = node.category.Name.toLowerCase().includes(searchLower);
        const descMatch = node.category.Description?.toLowerCase().includes(searchLower);
        return nameMatch || descMatch || false;
    }

    public getTotalTypeCount(): number {
        return this.types.length;
    }

    public getTypesForCategory(categoryName: string): CredentialTypeEntity[] {
        return this.types.filter(t => t.Category === categoryName);
    }

    public createCredentialWithCategory(categoryId: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Credentials nav item with the category pre-selected and create panel open
        this.navigationService.OpenNavItemByName('Credentials', {
            categoryId: categoryId,
            openCreatePanel: true
        });
    }

    public viewTypesForCategory(categoryName: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Types nav item filtered by this category
        this.navigationService.OpenNavItemByName('Types', {
            categoryFilter: categoryName
        });
    }

    public getCategoryColor(index: number): string {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#06b6d4'];
        return colors[index % colors.length];
    }

    public refresh(): void {
        this.selectedNode = null;
        this.loadData();
    }
}
