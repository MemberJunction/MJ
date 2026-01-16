import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, QueryInfo, QueryCategoryInfo, CompositeKey } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import {
    QueryEntityLinkClickEvent,
    QueryRowClickEvent
} from '@memberjunction/ng-query-viewer';

export function LoadQueryBrowserResource() {
    // Prevents tree-shaking
}

/**
 * Tree node for the query category hierarchy
 */
interface CategoryNode {
    category: QueryCategoryInfo;
    children: CategoryNode[];
    queries: QueryInfo[];
    expanded: boolean;
    level: number;
}

/**
 * A resource component for browsing and executing stored queries.
 * Features:
 * - Hierarchical category navigation
 * - Query search
 * - Query viewer with parameter input
 * - Entity linking for clickable record IDs
 */
@RegisterClass(BaseResourceComponent, 'QueryBrowserResource')
@Component({
    selector: 'mj-query-browser-resource',
    templateUrl: './query-browser-resource.component.html',
    styleUrls: ['./query-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    public isLoading = true;
    public categories: QueryCategoryInfo[] = [];
    public categoryTree: CategoryNode[] = [];
    public queries: QueryInfo[] = [];
    public filteredQueries: QueryInfo[] = [];
    public selectedQuery: QueryInfo | null = null;
    public searchText = '';

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();
    private dataLoaded = false;

    constructor(
        private cdr: ChangeDetectorRef,
        private navigationService: NavigationService,
        private route: ActivatedRoute,
        private router: Router
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadData();

        // Subscribe to query param changes for deep linking
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
                if (this.dataLoaded) {
                    this.applyQueryParams();
                }
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Queries';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-database';
    }

    // ========================================
    // Data Loading
    // ========================================

    private async loadData(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            // Load from metadata (already cached)
            this.categories = this.metadata.QueryCategories || [];
            this.queries = (this.metadata.Queries || []).filter(q =>
                q.Status === 'Approved' && q.UserCanRun(this.metadata.CurrentUser)
            );

            this.filteredQueries = [...this.queries];
            this.buildCategoryTree();

            // Mark data as loaded and apply any query params for deep linking
            this.dataLoaded = true;
            this.applyQueryParams();

        } catch (error) {
            console.error('Error loading queries:', error);
        } finally {
            this.isLoading = false;
            this.NotifyLoadComplete();
            this.cdr.markForCheck();
        }
    }

    private buildCategoryTree(): void {
        const categoryMap = new Map<string, CategoryNode>();

        // Create nodes for all categories
        for (const category of this.categories) {
            const queriesInCategory = this.queries.filter(q => q.CategoryID === category.ID);
            categoryMap.set(category.ID, {
                category,
                children: [],
                queries: queriesInCategory,
                expanded: true,
                level: 0
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

        // Add uncategorized queries to a virtual root
        const uncategorizedQueries = this.queries.filter(q => !q.CategoryID);
        if (uncategorizedQueries.length > 0) {
            const uncategorizedCategory = new QueryCategoryInfo({
                ID: '__uncategorized__',
                Name: 'Uncategorized',
                Description: 'Queries without a category'
            });
            roots.push({
                category: uncategorizedCategory,
                children: [],
                queries: uncategorizedQueries,
                expanded: true,
                level: 0
            });
        }

        // Sort children recursively
        const sortNodes = (nodes: CategoryNode[]): void => {
            nodes.sort((a, b) => a.category.Name.localeCompare(b.category.Name));
            for (const node of nodes) {
                node.queries.sort((a, b) => a.Name.localeCompare(b.Name));
                sortNodes(node.children);
            }
        };
        sortNodes(roots);

        this.categoryTree = roots;
    }

    // ========================================
    // Search
    // ========================================

    public onSearchChange(value: string): void {
        this.searchText = value;

        if (!value.trim()) {
            this.filteredQueries = [...this.queries];
        } else {
            const searchLower = value.toLowerCase();
            this.filteredQueries = this.queries.filter(q =>
                q.Name.toLowerCase().includes(searchLower) ||
                q.Description?.toLowerCase().includes(searchLower) ||
                q.Category?.toLowerCase().includes(searchLower)
            );
        }

        // Expand all categories when searching
        if (value) {
            this.expandAll();
        }

        this.cdr.markForCheck();
    }

    public clearSearch(): void {
        this.searchText = '';
        this.filteredQueries = [...this.queries];
        this.cdr.markForCheck();
    }

    // ========================================
    // Tree Navigation
    // ========================================

    public toggleExpand(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        node.expanded = !node.expanded;
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

    public selectQuery(query: QueryInfo, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        this.selectedQuery = query;
        this.updateQueryParams();
        this.cdr.markForCheck();
    }

    public isQueryVisible(query: QueryInfo): boolean {
        if (!this.searchText) return true;
        return this.filteredQueries.some(q => q.ID === query.ID);
    }

    public hasVisibleContent(node: CategoryNode): boolean {
        if (!this.searchText) return true;

        // Check if any queries in this category match
        if (node.queries.some(q => this.isQueryVisible(q))) {
            return true;
        }

        // Check if any child categories have visible content
        return node.children.some(child => this.hasVisibleContent(child));
    }

    // ========================================
    // Query Viewer Events
    // ========================================

    public onEntityLinkClick(event: QueryEntityLinkClickEvent): void {
        // Open the entity record using navigation service
        // Convert the recordId string to a CompositeKey (assumes single-field primary key)
        const compositeKey = CompositeKey.FromID(event.recordId);
        this.navigationService.OpenEntityRecord(event.entityName, compositeKey);
    }

    public onRowDoubleClick(event: QueryRowClickEvent): void {
        // Could show record details or other action
    }

    public openQueryDetails(query: QueryInfo, event: Event): void {
        // Stop propagation so clicking the button doesn't also select the query
        event.stopPropagation();
        // Open the Query entity record
        const compositeKey = CompositeKey.FromID(query.ID);
        this.navigationService.OpenEntityRecord('Queries', compositeKey);
    }

    // ========================================
    // Utilities
    // ========================================

    public getTotalQueryCount(): number {
        return this.queries.length;
    }

    public getNodeQueryCount(node: CategoryNode): number {
        let count = node.queries.length;
        for (const child of node.children) {
            count += this.getNodeQueryCount(child);
        }
        return count;
    }

    public refresh(): void {
        this.selectedQuery = null;
        this.loadData();
    }

    public trackByCategory(index: number, node: CategoryNode): string {
        return node.category.ID;
    }

    public trackByQuery(index: number, query: QueryInfo): string {
        return query.ID;
    }

    // ========================================
    // Deep Linking
    // ========================================

    /**
     * Apply query parameters to component state (deep linking support)
     * Supports: ?queryId=<UUID>
     */
    private applyQueryParams(): void {
        const params = this.route.snapshot.queryParams;

        // Query selection: ?queryId=<UUID>
        if (params['queryId']) {
            const queryId = params['queryId'] as string;
            const query = this.queries.find(q => q.ID === queryId);
            if (query) {
                this.selectedQuery = query;
                // Ensure the category containing this query is expanded
                this.expandCategoryForQuery(query);
            }
        }

        this.cdr.markForCheck();
    }

    /**
     * Update query parameters to reflect current state (for deep linking)
     * Updates URL without adding to browser history for state changes,
     * but allows back/forward navigation
     */
    private updateQueryParams(): void {
        const queryParams: Record<string, string | null> = {
            queryId: this.selectedQuery?.ID || null
        };

        // Remove null values for cleaner URLs
        const cleanParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(queryParams)) {
            if (value !== null) {
                cleanParams[key] = value;
            }
        }

        // Update URL - use replaceUrl: false to add to browser history
        this.router.navigate([], {
            relativeTo: this.route,
            queryParams: cleanParams,
            queryParamsHandling: '', // Replace all query params
            replaceUrl: false // Add to browser history for back/forward support
        });
    }

    /**
     * Expands the category tree to show the given query
     */
    private expandCategoryForQuery(query: QueryInfo): void {
        if (!query.CategoryID) return;

        const expandCategory = (nodes: CategoryNode[], targetCategoryId: string): boolean => {
            for (const node of nodes) {
                if (node.category.ID === targetCategoryId) {
                    node.expanded = true;
                    return true;
                }
                if (this.expandCategoryForQueryRecursive(node.children, targetCategoryId)) {
                    node.expanded = true;
                    return true;
                }
            }
            return false;
        };

        expandCategory(this.categoryTree, query.CategoryID);
    }

    /**
     * Helper for recursive category expansion
     */
    private expandCategoryForQueryRecursive(nodes: CategoryNode[], targetCategoryId: string): boolean {
        for (const node of nodes) {
            if (node.category.ID === targetCategoryId) {
                node.expanded = true;
                return true;
            }
            if (node.children.length > 0 && this.expandCategoryForQueryRecursive(node.children, targetCategoryId)) {
                node.expanded = true;
                return true;
            }
        }
        return false;
    }
}
