import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ResourceData, MJCredentialCategoryEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { RunView, Metadata } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { CredentialCategoryEditPanelComponent } from '@memberjunction/ng-credentials';
interface CategoryNode {
    category: MJCredentialCategoryEntity;
    children: CategoryNode[];
    expanded: boolean;
    level: number;
    typeCount: number;
}

@RegisterClass(BaseResourceComponent, 'CredentialsCategoriesResource')
@Component({
  standalone: false,
    selector: 'mj-credentials-categories-resource',
    templateUrl: './credentials-categories-resource.component.html',
    styleUrls: ['./credentials-categories-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CredentialsCategoriesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public Categories: MJCredentialCategoryEntity[] = [];

    /** @deprecated Use {@link Categories}. */
    public get categories(): MJCredentialCategoryEntity[] {
      return this.Categories;
    }
    /** @deprecated Use {@link Categories}. */
    public set categories(value: MJCredentialCategoryEntity[]) {
      this.Categories = value;
    }
    public CategoryTree: CategoryNode[] = [];

    /** @deprecated Use {@link CategoryTree}. */
    public get categoryTree(): CategoryNode[] {
      return this.CategoryTree;
    }
    /** @deprecated Use {@link CategoryTree}. */
    public set categoryTree(value: CategoryNode[]) {
      this.CategoryTree = value;
    }
    public Types: MJCredentialTypeEntity[] = [];

    /** @deprecated Use {@link Types}. */
    public get types(): MJCredentialTypeEntity[] {
      return this.Types;
    }
    /** @deprecated Use {@link Types}. */
    public set types(value: MJCredentialTypeEntity[]) {
      this.Types = value;
    }
    public SelectedNode: CategoryNode | null = null;

    /** @deprecated Use {@link SelectedNode}. */
    public get selectedNode(): CategoryNode | null {
      return this.SelectedNode;
    }
    /** @deprecated Use {@link SelectedNode}. */
    public set selectedNode(value: CategoryNode | null) {
      this.SelectedNode = value;
    }
    public SearchText = '';

    /** @deprecated Use {@link SearchText}. */
    public get searchText() {
      return this.SearchText;
    }
    /** @deprecated Use {@link SearchText}. */
    public set searchText(value) {
      this.SearchText = value;
    }

    // Permissions
    private _metadata = this.ProviderToUse;
    private _permissionCache = new Map<string, boolean>();

    @ViewChild('categoryEditPanel') CategoryEditPanel!: CredentialCategoryEditPanelComponent;

    /** @deprecated Use {@link CategoryEditPanel}. */
    get categoryEditPanel(): CredentialCategoryEditPanelComponent {
      return this.CategoryEditPanel;
    }
    /** @deprecated Use {@link CategoryEditPanel}. */
    set categoryEditPanel(value: CredentialCategoryEditPanelComponent) {
      this.CategoryEditPanel = value;
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

            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
                this.Categories = catResult.Results as MJCredentialCategoryEntity[];
            }

            if (typeResult.Success) {
                this.Types = typeResult.Results as MJCredentialTypeEntity[];
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
        for (const category of this.Categories) {
            const typesInCategory = this.Types.filter(t => t.Category === category.Name);
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
        for (const category of this.Categories) {
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

        this.CategoryTree = roots;
    }

    // === CRUD Operations ===

    public CreateNewCategory(): void {
        if (this.CategoryEditPanel) {
            this.CategoryEditPanel.open(null);
        }
    }

    /** @deprecated Use {@link CreateNewCategory}. */
    public createNewCategory(): void {
      return this.CreateNewCategory();
    }

    public CreateChildCategory(parentNode: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.CategoryEditPanel) {
            this.CategoryEditPanel.open(null, parentNode.category.ID);
        }
    }

    /** @deprecated Use {@link CreateChildCategory}. */
    public createChildCategory(parentNode: CategoryNode, event?: Event): void {
      return this.CreateChildCategory(parentNode, event);
    }

    public EditCategory(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.CategoryEditPanel) {
            this.CategoryEditPanel.open(node.category);
        }
    }

    /** @deprecated Use {@link EditCategory}. */
    public editCategory(node: CategoryNode, event?: Event): void {
      return this.EditCategory(node, event);
    }

    public async DeleteCategory(node: CategoryNode, event?: Event): Promise<void> {
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

        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete category',
            message: `Delete "${node.category.Name}"?`,
            detail: 'This action cannot be undone.',
        });
        if (!confirmed) return;

        try {
            const success = await node.category.Delete();
            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(`Category "${node.category.Name}" deleted successfully`, 'success', 3000);
                this.Categories = this.Categories.filter(c => !UUIDsEqual(c.ID, node.category.ID));
                if (UUIDsEqual(this.SelectedNode?.category.ID, node.category.ID)) {
                    this.SelectedNode = null;
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

    /** @deprecated Use {@link DeleteCategory}. */
    public async deleteCategory(node: CategoryNode, event?: Event): Promise<void> {
      return this.DeleteCategory(node, event);
    }

    // === Panel Event Handlers ===

    public OnCategorySaved(category: MJCredentialCategoryEntity): void {
        const existingIndex = this.Categories.findIndex(c => UUIDsEqual(c.ID, category.ID));

        if (existingIndex >= 0) {
            this.Categories[existingIndex] = category;
        } else {
            this.Categories.push(category);
        }

        this.buildTree();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnCategorySaved}. */
    public onCategorySaved(category: MJCredentialCategoryEntity): void {
      return this.OnCategorySaved(category);
    }

    public OnCategoryDeleted(categoryId: string): void {
        this.Categories = this.Categories.filter(c => !UUIDsEqual(c.ID, categoryId));
        if (UUIDsEqual(this.SelectedNode?.category.ID, categoryId)) {
            this.SelectedNode = null;
        }
        this.buildTree();
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnCategoryDeleted}. */
    public onCategoryDeleted(categoryId: string): void {
      return this.OnCategoryDeleted(categoryId);
    }

    // === Selection ===

    public SelectNode(node: CategoryNode): void {
        this.SelectedNode = UUIDsEqual(this.SelectedNode?.category.ID, node.category.ID) ? null : node;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link SelectNode}. */
    public selectNode(node: CategoryNode): void {
      return this.SelectNode(node);
    }

    public ToggleExpand(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        node.expanded = !node.expanded;
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ToggleExpand}. */
    public toggleExpand(node: CategoryNode, event?: Event): void {
      return this.ToggleExpand(node, event);
    }

    // === Search ===

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        if (value) {
            this.ExpandAll();
        }
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link OnSearchChange}. */
    public onSearchChange(value: string): void {
      return this.OnSearchChange(value);
    }

    public ClearSearch(): void {
        this.SearchText = '';
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ClearSearch}. */
    public clearSearch(): void {
      return this.ClearSearch();
    }

    /** Empty-state CTA: clear search when narrowing, otherwise create. */
    public OnEmptyStateAction(): void {
        if (this.SearchText) {
            this.ClearSearch();
        } else {
            this.CreateNewCategory();
        }
    }

    /** @deprecated Use {@link OnEmptyStateAction}. */
    public onEmptyStateAction(): void {
      return this.OnEmptyStateAction();
    }

    public ExpandAll(): void {
        const expand = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = true;
                expand(node.children);
            }
        };
        expand(this.CategoryTree);
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link ExpandAll}. */
    public expandAll(): void {
      return this.ExpandAll();
    }

    public CollapseAll(): void {
        const collapse = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = false;
                collapse(node.children);
            }
        };
        collapse(this.CategoryTree);
        this.cdr.markForCheck();
    }

    /** @deprecated Use {@link CollapseAll}. */
    public collapseAll(): void {
      return this.CollapseAll();
    }

    public GetFlattenedNodes(): CategoryNode[] {
        const result: CategoryNode[] = [];
        const searchLower = this.SearchText.toLowerCase().trim();

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

        flatten(this.CategoryTree);
        return result;
    }

    /** @deprecated Use {@link GetFlattenedNodes}. */
    public getFlattenedNodes(): CategoryNode[] {
      return this.GetFlattenedNodes();
    }

    private nodeMatchesSearch(node: CategoryNode, searchLower: string): boolean {
        const nameMatch = node.category.Name.toLowerCase().includes(searchLower);
        const descMatch = node.category.Description?.toLowerCase().includes(searchLower);
        return nameMatch || descMatch || false;
    }

    public GetTotalTypeCount(): number {
        return this.Types.length;
    }

    /** @deprecated Use {@link GetTotalTypeCount}. */
    public getTotalTypeCount(): number {
      return this.GetTotalTypeCount();
    }

    public GetTypesForCategory(categoryName: string): MJCredentialTypeEntity[] {
        return this.Types.filter(t => t.Category === categoryName);
    }

    /** @deprecated Use {@link GetTypesForCategory}. */
    public getTypesForCategory(categoryName: string): MJCredentialTypeEntity[] {
      return this.GetTypesForCategory(categoryName);
    }

    public CreateCredentialWithCategory(categoryId: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Credentials nav item with the category pre-selected and create panel open
        this.navigationService.OpenNavItemByName('Credentials', {
            categoryId: categoryId,
            openCreatePanel: true
        });
    }

    /** @deprecated Use {@link CreateCredentialWithCategory}. */
    public createCredentialWithCategory(categoryId: string, event?: Event): void {
      return this.CreateCredentialWithCategory(categoryId, event);
    }

    public ViewTypesForCategory(categoryName: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        // Navigate to Types nav item filtered by this category
        this.navigationService.OpenNavItemByName('Types', {
            categoryFilter: categoryName
        });
    }

    /** @deprecated Use {@link ViewTypesForCategory}. */
    public viewTypesForCategory(categoryName: string, event?: Event): void {
      return this.ViewTypesForCategory(categoryName, event);
    }

    /** Case-insensitive UUID check whether a tree node is the currently selected node. */
    public IsNodeSelected(node: CategoryNode): boolean {
        return UUIDsEqual(this.SelectedNode?.category?.ID, node.category.ID);
    }

    public GetCategoryColor(index: number): string {
        const colors = [
            'var(--mj-brand-primary)',
            'var(--mj-brand-primary)',
            'var(--mj-brand-primary)',
            'var(--mj-status-warning)',
            'var(--mj-status-success)',
            'var(--mj-brand-primary)',
            'var(--mj-brand-primary)'
        ];
        return colors[index % colors.length];
    }

    /** @deprecated Use {@link GetCategoryColor}. */
    public getCategoryColor(index: number): string {
      return this.GetCategoryColor(index);
    }

    public Refresh(): void {
        this.SelectedNode = null;
        this.loadData();
    }

    /** @deprecated Use {@link Refresh}. */
    public refresh(): void {
      return this.Refresh();
    }
}
