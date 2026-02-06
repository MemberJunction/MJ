import { Component, OnInit, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { APIScopeEntity } from '@memberjunction/core-entities';

/** Tree shaking prevention function */
export function LoadAPIScopesPanel(): void {
    // This function prevents tree shaking
}

/** Scope tree node structure */
interface ScopeTreeNode {
    scope: APIScopeEntity;
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
export class APIScopesPanelComponent implements OnInit {
    @Output() ScopeUpdated = new EventEmitter<void>();

    private md = new Metadata();
    private cdr: ChangeDetectorRef;

    // Loading states
    public IsLoading = true;
    public IsSaving = false;

    // Data
    public ScopeTree: ScopeTreeNode[] = [];
    public FlatScopes: APIScopeEntity[] = [];

    // Edit state
    public EditingScope: APIScopeEntity | null = null;
    public EditName = '';
    public EditDescription = '';
    public EditCategory = '';
    public EditResourceType = '';
    public EditParentId: string | null = null;
    public EditIsActive = true;

    // Dialog states
    public ShowCreateDialog = false;
    public ShowEditDialog = false;
    public SelectedParentScope: APIScopeEntity | null = null;

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
            const rv = new RunView();
            const result = await rv.RunView<APIScopeEntity>({
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
    public openCreateDialog(parentScope: APIScopeEntity | null = null): void {
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

    /**
     * Open edit dialog for existing scope
     */
    public openEditDialog(scope: APIScopeEntity): void {
        this.EditingScope = scope;
        this.EditName = scope.Name;
        this.EditDescription = scope.Description || '';
        this.EditCategory = scope.Category || 'Entities';
        this.EditResourceType = scope.ResourceType || '';
        this.EditParentId = scope.ParentID;
        this.EditIsActive = scope.IsActive;
        this.SelectedParentScope = scope.ParentID
            ? this.FlatScopes.find(s => s.ID === scope.ParentID) || null
            : null;
        this.ShowEditDialog = true;
    }

    /**
     * Save scope (create or update)
     */
    public async saveScope(): Promise<void> {
        this.IsSaving = true;
        this.ErrorMessage = '';

        try {
            let scope: APIScopeEntity;

            if (this.EditingScope) {
                scope = this.EditingScope;
            } else {
                scope = await this.md.GetEntityObject<APIScopeEntity>('MJ: API Scopes');
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
                this.closeDialogs();
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

    /**
     * Toggle node expansion
     */
    public toggleExpanded(node: ScopeTreeNode): void {
        node.expanded = !node.expanded;
    }

    /**
     * Expand all nodes
     */
    public expandAll(): void {
        const expand = (nodes: ScopeTreeNode[]) => {
            for (const node of nodes) {
                node.expanded = true;
                expand(node.children);
            }
        };
        expand(this.ScopeTree);
    }

    /**
     * Collapse all nodes
     */
    public collapseAll(): void {
        const collapse = (nodes: ScopeTreeNode[]) => {
            for (const node of nodes) {
                node.expanded = false;
                collapse(node.children);
            }
        };
        collapse(this.ScopeTree);
    }

    /**
     * Close all dialogs
     */
    public closeDialogs(): void {
        this.ShowCreateDialog = false;
        this.ShowEditDialog = false;
        this.EditingScope = null;
        this.SelectedParentScope = null;
    }

    /**
     * Get parent scopes for dropdown (exclude self and descendants)
     */
    public getParentOptions(): APIScopeEntity[] {
        if (!this.EditingScope) {
            return this.FlatScopes;
        }

        // Exclude self and all descendants
        const excludeIds = new Set<string>([this.EditingScope.ID]);
        const addDescendants = (parentId: string) => {
            for (const scope of this.FlatScopes) {
                if (scope.ParentID === parentId && !excludeIds.has(scope.ID)) {
                    excludeIds.add(scope.ID);
                    addDescendants(scope.ID);
                }
            }
        };
        addDescendants(this.EditingScope.ID);

        return this.FlatScopes.filter(s => !excludeIds.has(s.ID));
    }

    /**
     * Get category color
     */
    public getCategoryColor(category: string | null): string {
        return this.CategoryColors[category || 'Other'] || this.CategoryColors['Other'];
    }

    /**
     * Get count of total scopes
     */
    public getTotalCount(): number {
        return this.FlatScopes.length;
    }

    /**
     * Get count of active scopes
     */
    public getActiveCount(): number {
        return this.FlatScopes.filter(s => s.IsActive).length;
    }
}
