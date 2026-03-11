import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ElementRef, NgZone, HostListener } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { Metadata, QueryInfo, QueryCategoryInfo, CompositeKey } from '@memberjunction/core';
import { ResourceData, UserInfoEngine, MJQueryEntity } from '@memberjunction/core-entities';
import {
    QueryEntityLinkClickEvent,
    QueryRowClickEvent
} from '@memberjunction/ng-query-viewer';
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
  standalone: false,
    selector: 'mj-query-browser-resource',
    templateUrl: './query-browser-resource.component.html',
    styleUrls: ['./query-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueryBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    private static readonly SETTINGS_KEY = 'QueryBrowser/panelWidth';
    private static readonly STATUS_FILTERS_KEY = 'QueryBrowser/statusFilters';
    private static readonly EXPANDED_STATE_KEY = 'QueryBrowser/expandedCategories';
    private static readonly DEFAULT_PANEL_WIDTH = 320;
    private static readonly MIN_PANEL_WIDTH = 200;
    private static readonly MAX_PANEL_WIDTH = 600;

    public isLoading = true;
    public categories: QueryCategoryInfo[] = [];
    public categoryTree: CategoryNode[] = [];
    /** All queries the user has permission to run */
    public queries: QueryInfo[] = [];
    public filteredQueries: QueryInfo[] = [];
    private filteredQueryIds = new Set<string>();
    public selectedQuery: QueryInfo | null = null;
    public searchText = '';
    public PanelWidth = QueryBrowserResourceComponent.DEFAULT_PANEL_WIDTH;
    public IsResizing = false;

    /** Status filter toggles — which statuses to show in the tree */
    public StatusFilters: Record<string, boolean> = {
        'Approved': true,
        'Pending': true,
        'Rejected': false,
        'Expired': false
    };

    /** Ordered list of all possible statuses for the filter bar */
    public readonly AllStatuses: string[] = ['Approved', 'Pending', 'Rejected', 'Expired'];

    /** Tracks expanded state by category ID — persisted across sessions */
    private expandedState = new Map<string, boolean>();

    private metadata = new Metadata();
    private destroy$ = new Subject<void>();
    private dataLoaded = false;
    private skipUrlUpdate = true; // Skip URL updates during initialization
    private lastNavigatedUrl = ''; // Track URL to avoid reacting to our own navigation

    // Bound event handlers for resize (need references for removeEventListener)
    private boundOnResizeMove = this.onResizeMove.bind(this);
    private boundOnResizeEnd = this.onResizeEnd.bind(this);

    // ========================================
    // Drawer State (Create / Edit)
    // ========================================

    public ShowQueryDrawer = false;
    public DrawerMode: 'create' | 'edit' = 'create';
    public DrawerQueryId: string | null = null;
    public DrawerName = '';
    public DrawerSQL = '';
    public DrawerDescription = '';
    public DrawerCategoryID = '';
    public DrawerStatus: 'Pending' | 'Approved' | 'Rejected' | 'Expired' = 'Pending';
    public IsSavingDrawer = false;
    public DrawerNameError = false;
    public DrawerSaveError: string | null = null;

    /** Ordered status options for the drawer dropdown — all valid Query statuses */
    public readonly DrawerStatuses: Array<'Pending' | 'Approved' | 'Rejected' | 'Expired'> =
        ['Pending', 'Approved', 'Rejected', 'Expired'];

    private initialDrawerSnapshot = '';

    constructor(
        private cdr: ChangeDetectorRef,
        private navigationService: NavigationService,
        private router: Router,
        private elementRef: ElementRef,
        private zone: NgZone
    ) {
        super();
    }

    ngOnInit(): void {
        this.loadSavedPanelWidth();
        this.loadSavedStatusFilters();
        this.loadSavedExpandedState();
        this.loadData();

        // Subscribe to router NavigationEnd events for back/forward button support
        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntil(this.destroy$)
            )
            .subscribe(event => {
                const currentUrl = event.urlAfterRedirects || event.url;
                if (currentUrl !== this.lastNavigatedUrl && this.dataLoaded) {
                    this.onExternalNavigation(currentUrl);
                }
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        // Ensure any pending debounced settings are flushed
        UserInfoEngine.Instance.FlushPendingSettings();
        // Remove resize listeners if active
        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);
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

    private async loadData(forceRefresh = false): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.markForCheck();

            // Force re-fetch from server when explicitly refreshing
            if (forceRefresh) {
                await this.metadata.Refresh();
            }

            // Load all queries the user has permission to run (regardless of status)
            this.categories = this.metadata.QueryCategories || [];
            this.queries = (this.metadata.Queries || []).filter(q =>
                q.UserCanRun(this.metadata.CurrentUser)
            );

            this.applyFilters();
            this.buildCategoryTree();

            // Mark data as loaded and apply any query params for deep linking
            this.dataLoaded = true;

            // Parse initial URL state
            const urlState = this.parseUrlState();
            if (urlState?.queryId) {
                const query = this.queries.find(q => UUIDsEqual(q.ID, urlState.queryId));
                if (query) {
                    this.selectedQuery = query;
                    this.expandCategoryForQuery(query);
                }
            }

            // Enable URL updates after initialization
            this.skipUrlUpdate = false;

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

        // Use filtered queries (status + search filters applied)
        const visibleQueries = this.filteredQueries;

        // Create nodes for all categories, restoring expanded state
        for (const category of this.categories) {
            const queriesInCategory = visibleQueries.filter(q => UUIDsEqual(q.CategoryID, category.ID));
            categoryMap.set(category.ID, {
                category,
                children: [],
                queries: queriesInCategory,
                expanded: this.expandedState.get(category.ID) ?? false,
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
        const uncategorizedQueries = visibleQueries.filter(q => !q.CategoryID);
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
                expanded: this.expandedState.get('__uncategorized__') ?? false,
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
        this.applyFilters();
        this.buildCategoryTree();

        // Expand all categories when searching so results are visible
        if (value) {
            this.expandAll();
        }

        this.cdr.markForCheck();
    }

    public clearSearch(): void {
        this.searchText = '';
        this.applyFilters();
        this.buildCategoryTree();
        this.cdr.markForCheck();
    }

    // ========================================
    // Status Filters
    // ========================================

    /** Toggle a status filter on/off and rebuild the tree */
    public toggleStatusFilter(status: string): void {
        this.StatusFilters[status] = !this.StatusFilters[status];
        this.applyFilters();
        this.buildCategoryTree();
        this.saveStatusFilters();
        this.cdr.markForCheck();
    }

    /** Get the count of queries with a given status */
    public getStatusCount(status: string): number {
        return this.queries.filter(q => q.Status === status).length;
    }

    /** Get the CSS color for a query status */
    public getStatusColor(status: string): string {
        switch (status) {
            case 'Approved':  return '#28a745';
            case 'Pending':   return '#f59e0b';
            case 'Rejected':  return '#dc3545';
            case 'Expired':   return '#6c757d';
            default:          return '#6c757d';
        }
    }

    /** Get the Font Awesome icon for a query status */
    public getStatusIcon(status: string): string {
        switch (status) {
            case 'Approved':  return 'fa-check-circle';
            case 'Pending':   return 'fa-clock';
            case 'Rejected':  return 'fa-times-circle';
            case 'Expired':   return 'fa-archive';
            default:          return 'fa-question-circle';
        }
    }

    /** Apply both status and search filters to produce filteredQueries */
    private applyFilters(): void {
        // First filter by status
        let result = this.queries.filter(q => this.StatusFilters[q.Status] === true);

        // Then filter by search text
        if (this.searchText.trim()) {
            const searchLower = this.searchText.toLowerCase();
            result = result.filter(q =>
                q.Name.toLowerCase().includes(searchLower) ||
                q.Description?.toLowerCase().includes(searchLower) ||
                q.Category?.toLowerCase().includes(searchLower)
            );
        }

        this.filteredQueries = result;
        this.filteredQueryIds = new Set(result.map(q => q.ID.toLowerCase()));
    }

    /** Load saved status filter preferences */
    private loadSavedStatusFilters(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.STATUS_FILTERS_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Merge saved values onto defaults (preserves any new statuses added later)
                for (const key of Object.keys(this.StatusFilters)) {
                    if (typeof parsed[key] === 'boolean') {
                        this.StatusFilters[key] = parsed[key];
                    }
                }
            } catch {
                // Ignore invalid JSON, keep defaults
            }
        }
    }

    /** Save status filter preferences with debouncing */
    private saveStatusFilters(): void {
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.STATUS_FILTERS_KEY,
            JSON.stringify(this.StatusFilters)
        );
    }

    /** Load saved expanded/collapsed state for category nodes */
    private loadSavedExpandedState(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.EXPANDED_STATE_KEY);
        if (saved) {
            try {
                const parsed: Record<string, boolean> = JSON.parse(saved);
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === 'boolean') {
                        this.expandedState.set(key, value);
                    }
                }
            } catch {
                // Ignore invalid JSON, start fresh
            }
        }
    }

    /** Save expanded/collapsed state with debouncing */
    private saveExpandedState(): void {
        const obj: Record<string, boolean> = {};
        for (const [key, value] of this.expandedState.entries()) {
            obj[key] = value;
        }
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.EXPANDED_STATE_KEY,
            JSON.stringify(obj)
        );
    }

    // ========================================
    // Tree Navigation
    // ========================================

    public toggleExpand(node: CategoryNode, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        node.expanded = !node.expanded;
        this.expandedState.set(node.category.ID, node.expanded);
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public expandAll(): void {
        const expand = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = true;
                this.expandedState.set(node.category.ID, true);
                expand(node.children);
            }
        };
        expand(this.categoryTree);
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public collapseAll(): void {
        const collapse = (nodes: CategoryNode[]): void => {
            for (const node of nodes) {
                node.expanded = false;
                this.expandedState.set(node.category.ID, false);
                collapse(node.children);
            }
        };
        collapse(this.categoryTree);
        this.saveExpandedState();
        this.cdr.markForCheck();
    }

    public selectQuery(query: QueryInfo, event?: Event): void {
        if (event) {
            event.stopPropagation();
        }
        this.selectedQuery = query;
        this.updateUrl();
        this.cdr.markForCheck();
    }

    public isQueryVisible(query: QueryInfo): boolean {
        if (!this.searchText) return true;
        return this.filteredQueryIds.has(query.ID.toLowerCase());
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
        // Look up the entity's actual primary key field name from metadata
        const entity = this.metadata.Entities.find(e => e.Name === event.entityName);
        const pkField = entity?.FirstPrimaryKey;
        const pkFieldName = pkField?.Name || 'ID';

        const compositeKey = new CompositeKey([{ FieldName: pkFieldName, Value: event.recordId }]);
        this.navigationService.OpenEntityRecord(event.entityName, compositeKey);
    }

    public onRowDoubleClick(event: QueryRowClickEvent): void {
        // Could show record details or other action
    }

    public onOpenQueryRecord(event: { queryId: string; queryName: string }): void {
        // Open the Query entity record using navigation service
        const compositeKey = CompositeKey.FromID(event.queryId);
        this.navigationService.OpenEntityRecord('MJ: Queries', compositeKey);
    }

    /** True when the current user has permission to create new queries. */
    public get CanCreateQuery(): boolean {
        const entity = this.metadata.EntityByName('MJ: Queries');
        if (!entity || !this.metadata.CurrentUser) return false;
        return entity.GetUserPermisions(this.metadata.CurrentUser).CanCreate;
    }

    /** True when the current user has permission to edit queries. */
    public get CanEditQuery(): boolean {
        const entity = this.metadata.EntityByName('MJ: Queries');
        if (!entity || !this.metadata.CurrentUser) return false;
        return entity.GetUserPermisions(this.metadata.CurrentUser).CanUpdate;
    }

    // ========================================
    // Drawer — Open / Close
    // ========================================

    /** Close the drawer when Escape is pressed (if open). */
    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        if (this.ShowQueryDrawer) {
            this.CloseDrawer();
        }
    }

    /** Open the drawer in create mode. */
    public OpenCreateDrawer(): void {
        this.DrawerMode = 'create';
        this.DrawerQueryId = null;
        this.DrawerName = '';
        this.DrawerSQL = '';
        this.DrawerDescription = '';
        this.DrawerCategoryID = '';
        this.DrawerStatus = 'Pending';
        this.DrawerNameError = false;
        this.DrawerSaveError = null;
        this.captureDrawerSnapshot();
        this.ShowQueryDrawer = true;
        this.cdr.markForCheck();
    }

    /**
     * Open the drawer in edit mode, pre-populated from a QueryInfo.
     * Stops event propagation so clicking the edit icon doesn't also select the query.
     */
    public OpenEditDrawer(query: QueryInfo, event?: Event): void {
        if (event) event.stopPropagation();
        this.DrawerMode = 'edit';
        this.DrawerQueryId = query.ID;
        this.DrawerName = query.Name ?? '';
        this.DrawerSQL = query.SQL ?? '';
        this.DrawerDescription = query.Description ?? '';
        this.DrawerCategoryID = query.CategoryID ?? '';
        this.DrawerStatus = query.Status ?? 'Pending';
        this.DrawerNameError = false;
        this.DrawerSaveError = null;
        this.captureDrawerSnapshot();
        this.ShowQueryDrawer = true;
        this.cdr.markForCheck();
    }

    /**
     * Close the drawer. If dirty, ask for confirmation unless force=true.
     */
    public CloseDrawer(force = false): void {
        if (!force && this.IsDrawerDirty) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        this.ShowQueryDrawer = false;
        this.cdr.markForCheck();
    }

    /** Close drawer when clicking the backdrop. */
    public OnDrawerBackdropClick(): void {
        this.CloseDrawer();
    }

    // ========================================
    // Drawer — Form Helpers
    // ========================================

    /** Handle Tab key inside the SQL textarea to insert spaces instead of shifting focus. */
    public OnSQLKeyDown(event: KeyboardEvent): void {
        if (event.key !== 'Tab') return;
        event.preventDefault();
        const textarea = event.target as HTMLTextAreaElement;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        this.DrawerSQL =
            this.DrawerSQL.substring(0, start) + '    ' + this.DrawerSQL.substring(end);
        // Restore cursor after Angular re-renders
        Promise.resolve().then(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 4;
        });
        this.cdr.markForCheck();
    }

    private get currentDrawerSnapshot(): string {
        return JSON.stringify({
            name: this.DrawerName,
            sql: this.DrawerSQL,
            description: this.DrawerDescription,
            categoryID: this.DrawerCategoryID,
            status: this.DrawerStatus,
        });
    }

    private captureDrawerSnapshot(): void {
        this.initialDrawerSnapshot = this.currentDrawerSnapshot;
    }

    public get IsDrawerDirty(): boolean {
        return this.currentDrawerSnapshot !== this.initialDrawerSnapshot;
    }

    // ========================================
    // Drawer — Save
    // ========================================

    /** Save the drawer form (create or edit). */
    public async SaveDrawer(): Promise<void> {
        this.DrawerNameError = !this.DrawerName.trim();
        this.DrawerSaveError = null;
        if (this.DrawerNameError) {
            this.cdr.markForCheck();
            return;
        }

        this.IsSavingDrawer = true;
        this.cdr.markForCheck();

        try {
            const entity = await this.metadata.GetEntityObject<MJQueryEntity>('MJ: Queries');

            if (this.DrawerMode === 'edit' && this.DrawerQueryId) {
                const loaded = await entity.Load(this.DrawerQueryId);
                if (!loaded) {
                    this.DrawerSaveError = 'Could not load query record. Please refresh and try again.';
                    return;
                }
            }

            entity.Name = this.DrawerName.trim();
            entity.SQL = this.DrawerSQL;
            entity.Description = this.DrawerDescription;
            entity.CategoryID = this.DrawerCategoryID || null;
            entity.Status = this.DrawerStatus;

            const saved = await entity.Save();
            if (saved) {
                const savedId = entity.ID;
                this.ShowQueryDrawer = false;
                await this.loadData(true);
                const refreshed = this.queries.find(q => UUIDsEqual(q.ID, savedId));
                if (refreshed) {
                    this.selectedQuery = refreshed;
                    this.expandCategoryForQuery(refreshed);
                    this.updateUrl();
                }
            } else {
                this.DrawerSaveError = 'Save failed. Please check your inputs and try again.';
            }
        } catch (e) {
            console.error('Error saving query:', e);
            this.DrawerSaveError = 'An unexpected error occurred while saving.';
        } finally {
            this.IsSavingDrawer = false;
            this.cdr.markForCheck();
        }
    }

    // ========================================
    // Drawer — Open Full Record
    // ========================================

    /** Open the full entity form in a new tab (for sub-entity management). */
    public OpenFullRecord(): void {
        if (!this.DrawerQueryId) return;
        this.navigationService.OpenEntityRecord(
            'MJ: Queries',
            CompositeKey.FromID(this.DrawerQueryId)
        );
        this.CloseDrawer(true);
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
        this.loadData(true);
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
     * Parse URL query string for query state.
     * Query params: queryId
     */
    private parseUrlState(): { queryId?: string } | null {
        return this.parseUrlFromString(this.router.url);
    }

    /**
     * Update URL query string to reflect current state.
     * Uses NavigationService for proper URL management that respects app-scoped routes.
     */
    private updateUrl(): void {
        if (this.skipUrlUpdate) return;

        const queryParams: Record<string, string | null> = {};

        // Add query ID if selected, null to remove
        if (this.selectedQuery?.ID) {
            queryParams['queryId'] = this.selectedQuery.ID;
        } else {
            queryParams['queryId'] = null;
        }

        // Use NavigationService to update query params properly
        this.navigationService.UpdateActiveTabQueryParams(queryParams);
    }

    /**
     * Handle external navigation (back/forward buttons).
     * Parses the URL and applies the state without triggering a new navigation.
     */
    private onExternalNavigation(url: string): void {
        // Check if this URL is for our component (contains our base path)
        const currentPath = this.router.url.split('?')[0];
        const newPath = url.split('?')[0];

        // Only handle if we're still on the same base path (same component instance)
        if (currentPath !== newPath) {
            return; // Different route entirely, shell will handle it
        }

        // Parse the new URL state
        const urlState = this.parseUrlFromString(url);

        // Apply the state without triggering URL updates
        this.skipUrlUpdate = true;
        if (urlState?.queryId) {
            const query = this.queries.find(q => UUIDsEqual(q.ID, urlState.queryId));
            if (query) {
                if (!UUIDsEqual(this.selectedQuery?.ID, query.ID)) {
                    this.selectedQuery = query;
                    this.expandCategoryForQuery(query);
                }
            }
        } else {
            // No queryId means clear selection
            this.selectedQuery = null;
        }
        this.skipUrlUpdate = false;

        // Update the tracked URL
        this.lastNavigatedUrl = url;

        this.cdr.markForCheck();
    }

    /**
     * Parse URL state from a URL string (used for external navigation).
     */
    private parseUrlFromString(url: string): { queryId?: string } | null {
        const queryIndex = url.indexOf('?');
        if (queryIndex === -1) return null;

        const queryString = url.substring(queryIndex + 1);
        const params = new URLSearchParams(queryString);
        const queryId = params.get('queryId');

        if (!queryId) return null;

        return { queryId };
    }

    /**
     * Expands the category tree to show the given query
     */
    private expandCategoryForQuery(query: QueryInfo): void {
        if (!query.CategoryID) return;

        const expandToTarget = (nodes: CategoryNode[], targetCategoryId: string): boolean => {
            for (const node of nodes) {
                if (UUIDsEqual(node.category.ID, targetCategoryId)) {
                    node.expanded = true;
                    this.expandedState.set(node.category.ID, true);
                    return true;
                }
                if (expandToTarget(node.children, targetCategoryId)) {
                    node.expanded = true;
                    this.expandedState.set(node.category.ID, true);
                    return true;
                }
            }
            return false;
        };

        if (expandToTarget(this.categoryTree, query.CategoryID)) {
            this.saveExpandedState();
        }
    }

    // ========================================
    // Panel Resize
    // ========================================

    /**
     * Load saved panel width from user settings
     */
    private loadSavedPanelWidth(): void {
        const saved = UserInfoEngine.Instance.GetSetting(QueryBrowserResourceComponent.SETTINGS_KEY);
        if (saved) {
            const width = parseInt(saved, 10);
            if (!isNaN(width) && width >= QueryBrowserResourceComponent.MIN_PANEL_WIDTH && width <= QueryBrowserResourceComponent.MAX_PANEL_WIDTH) {
                this.PanelWidth = width;
            }
        }
    }

    /**
     * Start resizing the left panel via drag handle
     */
    public onResizeStart(event: MouseEvent): void {
        event.preventDefault();
        this.IsResizing = true;
        this.cdr.markForCheck();

        // Run outside Angular zone for performance during mousemove
        this.zone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.boundOnResizeMove);
            document.addEventListener('mouseup', this.boundOnResizeEnd);
        });
    }

    private onResizeMove(event: MouseEvent): void {
        if (!this.IsResizing) return;

        const containerRect = this.elementRef.nativeElement.querySelector('.query-browser-container')?.getBoundingClientRect();
        if (!containerRect) return;

        const newWidth = event.clientX - containerRect.left;
        const clamped = Math.max(
            QueryBrowserResourceComponent.MIN_PANEL_WIDTH,
            Math.min(QueryBrowserResourceComponent.MAX_PANEL_WIDTH, newWidth)
        );

        this.PanelWidth = clamped;
        this.zone.run(() => this.cdr.markForCheck());
    }

    private onResizeEnd(): void {
        if (!this.IsResizing) return;
        this.IsResizing = false;

        document.removeEventListener('mousemove', this.boundOnResizeMove);
        document.removeEventListener('mouseup', this.boundOnResizeEnd);

        // Persist width with debouncing
        UserInfoEngine.Instance.SetSettingDebounced(
            QueryBrowserResourceComponent.SETTINGS_KEY,
            this.PanelWidth.toString()
        );

        this.zone.run(() => this.cdr.markForCheck());
    }

    /** Case-insensitive UUID check whether a query is the currently selected query. */
    public IsQuerySelected(query: QueryInfo): boolean {
        return UUIDsEqual(this.selectedQuery?.ID, query.ID);
    }
}
