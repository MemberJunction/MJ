import { Component, OnInit, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJAPIScopeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
/** Scope tree node structure */
interface ScopeTreeNode {
    scope: MJAPIScopeEntity;
    children: ScopeTreeNode[];
    expanded: boolean;
    level: number;
}

/**
 * API Scopes Panel Component
 * Manages API Scopes in a hierarchical tree structure
 */
@Component({
  standalone: false,
    selector: 'mj-api-scopes-panel',
    templateUrl: './api-scopes-panel.component.html',
    styleUrls: ['./api-scopes-panel.component.css']
})
export class APIScopesPanelComponent extends BaseAngularComponent implements OnInit {
    @Output() ScopeUpdated = new EventEmitter<void>();

    private get md() { return this.ProviderToUse; }
    private cdr: ChangeDetectorRef;

    // Loading states
    public IsLoading = true;
    public IsSaving = false;

    // Data
    public ScopeTree: ScopeTreeNode[] = [];
    public FlatScopes: MJAPIScopeEntity[] = [];

    // Edit state
    public EditingScope: MJAPIScopeEntity | null = null;
    public EditName = '';
    public EditDescription = '';
    public EditCategory = '';
    public EditResourceType = '';
    public EditParentId: string | null = null;
    public EditIsActive = true;

    // Dialog states
    public ShowCreateDialog = false;
    public ShowEditDialog = false;
    public SelectedParentScope: MJAPIScopeEntity | null = null;

    // Messages
    public SuccessMessage = '';
    public ErrorMessage = '';

    // Category colors
    public readonly CategoryColors: Record<string, string> = {
        'Entities': '#6366f1',
        'Agents': '#10b981',
        'Admin': '#f59e0b',
        'Actions': '#8b5cf6',
        'Queries': '#3b82f6',
        'Reports': '#ef4444',
        'Communication': '#ec4899',
        'Other': '#6b7280'
    };

    // Resource type options
    public readonly ResourceTypes = ['Entity', 'Agent', 'Query', 'Mutation', 'Action', 'Report', 'Admin', 'Other'];
    public readonly Categories = ['Entities', 'Agents', 'Admin', 'Actions', 'Queries', 'Reports', 'Communication', 'Other'];

    constructor(cdr: ChangeDetectorRef) {
        super();
        this.cdr = cdr;
    }

    async ngOnInit(): Promise<void> {
        await this.loadData();
    }

    /**
     * Load all scopes
     */
    public async loadData(): Promise<void> {
        this.IsLoading = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJAPIScopeEntity>({
                EntityName: 'MJ: API Scopes',
                OrderBy: 'FullPath',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.FlatScopes = result.Results;
                this.buildTree();
            }
        } catch (error) {
            console.error('Error loading scopes:', error);
            this.ErrorMessage = 'Failed to load scopes';
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Build tree structure from flat scopes
     */
    private buildTree(): void {
        const scopeMap = new Map<string, ScopeTreeNode>();
        const rootNodes: ScopeTreeNode[] = [];

        // Create nodes
        for (const scope of this.FlatScopes) {
            scopeMap.set(scope.ID, {
                scope,
                children: [],
                expanded: true,
                level: 0
            });
        }

        // Build hierarchy
        for (const scope of this.FlatScopes) {
            const node = scopeMap.get(scope.ID)!;
            if (scope.ParentID) {
                const parent = scopeMap.get(scope.ParentID);
                if (parent) {
                    parent.children.push(node);
                    node.level = parent.level + 1;
                } else {
                    rootNodes.push(node);
                }
            } else {
                rootNodes.push(node);
            }
        }

        // Calculate levels recursively
        const calculateLevels = (nodes: ScopeTreeNode[], level: number) => {
            for (const node of nodes) {
                node.level = level;
                calculateLevels(node.children, level + 1);
            }
        };
        calculateLevels(rootNodes, 0);

        this.ScopeTree = rootNodes;
    }

    /**
     * Open create dialog for new scope
     */
    public OpenCreateDialog(parentScope: MJAPIScopeEntity | null = null): void {
        this.EditName = '';
        this.EditDescription = '';
        this.EditCategory = parentScope?.Category || 'Entities';
        this.EditResourceType = '';
        this.EditParentId = parentScope?.ID || null;
        this.EditIsActive = true;
        this.EditingScope = null;
        this.SelectedParentScope = parentScope;
        this.ShowCreateDialog = true;
    }

    /** @deprecated Use {@link OpenCreateDialog}. */
    public openCreateDialog(parentScope: MJAPIScopeEntity | null = null): void {
      return this.OpenCreateDialog(parentScope);
    }

    /**
     * Open edit dialog for existing scope
     */
    public OpenEditDialog(scope: MJAPIScopeEntity): void {
        this.EditingScope = scope;
        this.EditName = scope.Name;
        this.EditDescription = scope.Description || '';
        this.EditCategory = scope.Category || 'Entities';
        this.EditResourceType = scope.ResourceType || '';
        this.EditParentId = scope.ParentID;
        this.EditIsActive = scope.IsActive;
        this.SelectedParentScope = scope.ParentID
            ? this.FlatScopes.find(s => UUIDsEqual(s.ID, scope.ParentID)) || null
            : null;
        this.ShowEditDialog = true;
    }

    /** @deprecated Use {@link OpenEditDialog}. */
    public openEditDialog(scope: MJAPIScopeEntity): void {
      return this.OpenEditDialog(scope);
    }

    /**
     * Save scope (create or update)
     */
    public async SaveScope(): Promise<void> {
        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            let scope: MJAPIScopeEntity;

            if (this.EditingScope) {
                scope = this.EditingScope;
            } else {
                scope = await this.md.GetEntityObject<MJAPIScopeEntity>('MJ: API Scopes');
                scope.NewRecord();
            }

            scope.Name = this.EditName.trim();
            scope.Description = this.EditDescription.trim() || null;
            scope.Category = this.EditCategory;
            scope.ResourceType = this.EditResourceType || null;
            scope.ParentID = this.EditParentId;
            scope.IsActive = this.EditIsActive;
            // FullPath is auto-computed by the trigger

            const result = await scope.Save();
            if (result) {
                this.SuccessMessage = this.EditingScope
                    ? 'Scope updated successfully'
                    : 'Scope created successfully';
                this.CloseDialogs();
                await this.loadData();
                this.ScopeUpdated.emit();
                setTimeout(() => this.SuccessMessage = '', 3000);
            } else {
                this.ErrorMessage = 'Failed to save scope';
            }
        } catch (error) {
            console.error('Error saving scope:', error);
            this.ErrorMessage = 'An error occurred while saving';
        } finally {
            this.IsSaving = false;
        }
    }

    /** @deprecated Use {@link SaveScope}. */
    public async saveScope(): Promise<void> {
      return this.SaveScope();
    }

    /**
     * Toggle node expansion
     */
    public ToggleExpanded(node: ScopeTreeNode): void {
        node.expanded = !node.expanded;
    }

    /** @deprecated Use {@link ToggleExpanded}. */
    public toggleExpanded(node: ScopeTreeNode): void {
      return this.ToggleExpanded(node);
    }

    /**
     * Expand all nodes
     */
    public ExpandAll(): void {
        const expand = (nodes: ScopeTreeNode[]) => {
            for (const node of nodes) {
                node.expanded = true;
                expand(node.children);
            }
        };
        expand(this.ScopeTree);
    }

    /** @deprecated Use {@link ExpandAll}. */
    public expandAll(): void {
      return this.ExpandAll();
    }

    /**
     * Collapse all nodes
     */
    public CollapseAll(): void {
        const collapse = (nodes: ScopeTreeNode[]) => {
            for (const node of nodes) {
                node.expanded = false;
                collapse(node.children);
            }
        };
        collapse(this.ScopeTree);
    }

    /** @deprecated Use {@link CollapseAll}. */
    public collapseAll(): void {
      return this.CollapseAll();
    }

    /**
     * Close all dialogs
     */
    public CloseDialogs(): void {
        this.ShowCreateDialog = false;
        this.ShowEditDialog = false;
        this.EditingScope = null;
        this.SelectedParentScope = null;
    }

    /** @deprecated Use {@link CloseDialogs}. */
    public closeDialogs(): void {
      return this.CloseDialogs();
    }

    /**
     * Get parent scopes for dropdown (exclude self and descendants)
     */
    public GetParentOptions(): MJAPIScopeEntity[] {
        if (!this.EditingScope) {
            return this.FlatScopes;
        }

        // Exclude self and all descendants
        const excludeIds = new Set<string>([this.EditingScope.ID]);
        const addDescendants = (parentId: string) => {
            for (const scope of this.FlatScopes) {
                if (UUIDsEqual(scope.ParentID, parentId) && !excludeIds.has(scope.ID)) {
                    excludeIds.add(scope.ID);
                    addDescendants(scope.ID);
                }
            }
        };
        addDescendants(this.EditingScope.ID);

        return this.FlatScopes.filter(s => !excludeIds.has(s.ID));
    }

    /** @deprecated Use {@link GetParentOptions}. */
    public getParentOptions(): MJAPIScopeEntity[] {
      return this.GetParentOptions();
    }

    /**
     * Get category color
     */
    public GetCategoryColor(category: string | null): string {
        return this.CategoryColors[category || 'Other'] || this.CategoryColors['Other'];
    }

    /** @deprecated Use {@link GetCategoryColor}. */
    public getCategoryColor(category: string | null): string {
      return this.GetCategoryColor(category);
    }

    /**
     * Get count of total scopes
     */
    public GetTotalCount(): number {
        return this.FlatScopes.length;
    }

    /** @deprecated Use {@link GetTotalCount}. */
    public getTotalCount(): number {
      return this.GetTotalCount();
    }

    /**
     * Get count of active scopes
     */
    public GetActiveCount(): number {
        return this.FlatScopes.filter(s => s.IsActive).length;
    }

    /** @deprecated Use {@link GetActiveCount}. */
    public getActiveCount(): number {
      return this.GetActiveCount();
    }
}
