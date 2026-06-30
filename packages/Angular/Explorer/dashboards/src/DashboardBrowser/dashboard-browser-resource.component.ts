import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { RegisterClass , UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity, MJDashboardCategoryEntity, MJDashboardPartTypeEntity, DashboardEngine, DashboardUserPermissions, MJDashboardCategoryLinkEntity } from '@memberjunction/core-entities';
import { ShareDialogResult } from './dashboard-share-dialog.component';
import {
    DashboardViewerComponent,
    DashboardNavRequestEvent,
    PanelInteractionEvent,
    AddPanelResult,
    createDefaultDashboardConfig,
    DashboardPanel,
    EditPartDialogResult,
    // Browser event types from generic component
    DashboardOpenEvent,
    DashboardEditEvent,
    DashboardDeleteEvent,
    DashboardMoveEvent,
    DashboardCreateEvent,
    CategoryCreateEvent,
    CategoryDeleteEvent,
    CategoryChangeEvent,
    ViewPreferenceChangeEvent,
    DashboardBrowserViewMode,
    BreadcrumbNavigateEvent
} from '@memberjunction/ng-dashboard-viewer';
/**
 * Mode for the dashboard browser
 */
type BrowserMode = 'list' | 'view' | 'edit';

/**
 * Resource component for browsing, creating, and editing dashboards.
 * Uses the generic DashboardBrowserComponent for list mode and handles
 * view/edit mode internally with routing integration.
 */
@RegisterClass(BaseResourceComponent, 'DashboardBrowserResource')
@Component({
  standalone: false,
    selector: 'mj-dashboard-browser-resource',
    templateUrl: './dashboard-browser-resource.component.html',
    styleUrls: ['./dashboard-browser-resource.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBrowserResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
    // ========================================
    // State
    // ========================================

    public mode: BrowserMode = 'list';
    public isLoading = false;
    public dashboards: MJDashboardEntity[] = [];
    public categories: MJDashboardCategoryEntity[] = [];
    public selectedDashboard: MJDashboardEntity | null = null;
    public selectedCategoryId: string | null = null;
    public viewMode: DashboardBrowserViewMode = 'cards';
    public showAddPanelDialog = false;

    // Config dialog state
    public showConfigDialog = false;
    public configDialogPanel: DashboardPanel | null = null;
    public configDialogPartType: MJDashboardPartTypeEntity | null = null;
    public configDialogClass: string = '';

    // Confirm dialog state
    public showConfirmDialog = false;
    public confirmPanelId: string = '';
    public confirmPanelTitle: string = '';

    // Share dialog state
    public showShareDialog = false;

    // Edit mode state for name/description
    public editingName = '';
    public editingDescription = '';
    private originalName = '';
    private originalDescription = '';
    private originalConfig = '';

    // Permission state for selected dashboard
    public selectedDashboardPermissions: DashboardUserPermissions = {
        DashboardID: '',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner'
    };

    // Permission map for all dashboards (used by browser component)
    public dashboardPermissionsMap: Map<string, DashboardUserPermissions> = new Map();

    // Effective category map for shared dashboards (maps dashboard ID to effective category for display)
    public effectiveCategoryMap: Map<string, string | null> = new Map();

    // Query params that arrived before the dashboard list finished loading (cold
    // load / deep link / pin navigation). Applied once loadDashboards() completes.
    private _pendingQueryParams: Record<string, string> | null = null;

    @ViewChild('dashboardViewer') dashboardViewer!: DashboardViewerComponent;

    // ========================================
    // Constructor
    // ========================================

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        super.ngOnInit();
        // super.ngOnInit() wires up the query-param delivery. Any deep-link/pin params
        // that arrive before loadDashboards() finishes are captured by OnQueryParamsChanged
        // into _pendingQueryParams and applied once the dashboard list is available.
        this.loadDashboards();
        this.loadViewPreference();
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
    }

    // ========================================
    // Query-Param Round-Trip (back/forward, deep links, Home pins)
    // ========================================

    /**
     * React to query-param changes from browser back/forward, deep links, and Home
     * pin navigation. Driven by BaseResourceComponent's reactive tab-param stream,
     * which reaches this component even when it's cached/detached — the path the old
     * ActivatedRoute subscription could not reliably cover.
     */
    protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
        // Category is a cheap assignment with no list lookup — apply it eagerly either way.
        this.selectedCategoryId = params['category'] || null;

        if (params['dashboard'] && this.dashboards.length === 0) {
            // List not loaded yet — defer the dashboard selection until it is.
            this._pendingQueryParams = params;
            this.cdr.detectChanges();
            return;
        }
        this.applyDashboardSelectionFromParams(params);
    }

    /**
     * Open/close the dashboard to match the `dashboard` query param. Requires the
     * dashboard list to be loaded. URL pushes from openDashboard()/backToList() are
     * auto-suppressed while delivering, so this reflects URL → state without looping.
     */
    private applyDashboardSelectionFromParams(params: Record<string, string>): void {
        const dashboardId = params['dashboard'] || null;
        const currentDashboardId = this.selectedDashboard?.ID || null;
        if (dashboardId === currentDashboardId) {
            this.cdr.detectChanges();
            return;
        }

        if (dashboardId) {
            const dashboard = this.dashboards.find(d => UUIDsEqual(d.ID, dashboardId));
            if (dashboard) {
                this.openDashboard(dashboard);
            }
        } else {
            this.backToList();
        }
    }

    // ========================================
    // BaseResourceComponent Implementation
    // ========================================

    async GetResourceDisplayName(data: ResourceData): Promise<string> {
        return 'Dashboards';
    }

    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-gauge-high';
    }

    // ========================================
    // Event Handlers from Generic Browser
    // ========================================

    /**
     * Handle dashboard open request from generic browser
     */
    public onDashboardOpen(event: DashboardOpenEvent): void {
        if (event.OpenInNewTab) {
            // Open in a dedicated Explorer tab via NavigationService
            this.navigationService.OpenDashboard(
                event.Dashboard.ID,
                event.Dashboard.Name,
                { forceNewTab: true }
            );
        } else {
            // Open inline in the browser's view pane
            this.openDashboard(event.Dashboard);
        }
    }

    /**
     * Open the current dashboard in its own dedicated Explorer tab
     */
    public openInNewTab(): void {
        if (this.selectedDashboard) {
            this.navigationService.OpenDashboard(
                this.selectedDashboard.ID,
                this.selectedDashboard.Name,
                { forceNewTab: true }
            );
        }
    }

    /**
     * Handle dashboard edit request from generic browser
     */
    public onDashboardEdit(event: DashboardEditEvent): void {
        this.editDashboard(event.Dashboard);
    }

    /**
     * Handle dashboard delete request from generic browser
     */
    public async onDashboardDelete(event: DashboardDeleteEvent): Promise<void> {
        // The generic browser handles the confirmation dialog
        // We just need to perform the actual deletion atomically
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            if (event.Dashboards.length === 0) return;

            const md = this.ProviderToUse;
            const tg = await md.CreateTransactionGroup();
            for (const dashboard of event.Dashboards) {
                dashboard.TransactionGroup = tg;
                await dashboard.Delete();
            }

            if (await tg.Submit()) {
                const deletedIds = new Set(event.Dashboards.map(d => d.ID));
                this.dashboards = this.dashboards.filter(d => !deletedIds.has(d.ID));
            } else {
                console.error('Failed to delete dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to delete dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handle dashboard move request from generic browser.
     * For owned dashboards: updates the dashboard's CategoryID directly.
     * For shared dashboards: creates/updates a DashboardCategoryLink to organize without modifying the original.
     */
    public async onDashboardMove(event: DashboardMoveEvent): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            if (event.Dashboards.length === 0) return;

            const md = this.ProviderToUse;
            const currentUserId = md.CurrentUser.ID;
            const tg = await md.CreateTransactionGroup();
            const sharedDashboardIds: string[] = [];

            for (const dashboard of event.Dashboards) {
                const permissions = DashboardEngine.Instance.GetDashboardPermissions(dashboard.ID, currentUserId);

                if (permissions.IsOwner) {
                    // Owner can modify the dashboard directly
                    dashboard.CategoryID = event.TargetCategoryId;
                    dashboard.TransactionGroup = tg;
                    await dashboard.Save();
                } else {
                    // Non-owner: create or update a category link instead
                    const existingLinks = DashboardEngine.Instance.DashboardCategoryLinks.filter(
                        link => UUIDsEqual(link.DashboardID, dashboard.ID) && UUIDsEqual(link.UserID, currentUserId)
                    );

                    let link: MJDashboardCategoryLinkEntity;
                    if (existingLinks.length > 0) {
                        link = existingLinks[0];
                        link.DashboardCategoryID = event.TargetCategoryId;
                    } else {
                        link = await md.GetEntityObject<MJDashboardCategoryLinkEntity>('MJ: Dashboard Category Links');
                        link.DashboardID = dashboard.ID;
                        link.UserID = currentUserId;
                        link.DashboardCategoryID = event.TargetCategoryId;
                    }
                    link.TransactionGroup = tg;
                    await link.Save();

                    sharedDashboardIds.push(dashboard.ID);
                }
            }

            if (await tg.Submit()) {
                // Update the effective category map for the shared dashboards now that the server confirmed
                for (const id of sharedDashboardIds) {
                    this.effectiveCategoryMap.set(id, event.TargetCategoryId);
                }
                this.effectiveCategoryMap = new Map(this.effectiveCategoryMap);
                this.dashboards = [...this.dashboards];
                this.selectedCategoryId = event.TargetCategoryId;
                this.updateUrlQueryParams();
            } else {
                console.error('Failed to move dashboards — all changes rolled back');
            }
        } catch (err) {
            console.error('Failed to move dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handle create dashboard request from generic browser
     */
    public async onDashboardCreate(event: DashboardCreateEvent): Promise<void> {
        await this.createDashboard(event.CategoryId);
    }

    /**
     * Handle category change from generic browser - update URL
     */
    public onCategoryChange(event: CategoryChangeEvent): void {
        this.selectedCategoryId = event.CategoryId;
        this.updateUrlQueryParams();
    }

    /**
     * Handle view preference change from generic browser - persist
     */
    public onViewPreferenceChange(event: ViewPreferenceChangeEvent): void {
        this.viewMode = event.ViewMode;
        this.saveViewPreference(event.ViewMode);
    }

    /**
     * Handle category create request from generic browser
     * Includes extensive logging for debugging category creation issues
     */
    public async onCategoryCreate(event: CategoryCreateEvent): Promise<void> {
        console.debug('[DashboardBrowserResource] Category create requested:', {
            name: event.Name,
            parentCategoryId: event.ParentCategoryId
        });

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = this.ProviderToUse;
            console.debug('[DashboardBrowserResource] Current user:', {
                userId: md.CurrentUser?.ID,
                userName: md.CurrentUser?.Name,
                email: md.CurrentUser?.Email
            });

            const category = await md.GetEntityObject<MJDashboardCategoryEntity>('MJ: Dashboard Categories');
            console.debug('[DashboardBrowserResource] Created category entity object');

            // Set required fields
            category.Name = event.Name;
            category.UserID = md.CurrentUser.ID;

            if (event.ParentCategoryId) {
                category.ParentID = event.ParentCategoryId;
            }

            console.debug('[DashboardBrowserResource] Category fields before save:', {
                name: category.Name,
                userId: category.UserID,
                parentId: category.ParentID,
                allFields: category.Fields.map(f => ({ name: f.Name, value: f.Value, dirty: f.Dirty }))
            });

            const saved = await category.Save();

            console.debug('[DashboardBrowserResource] Save result:', {
                success: saved,
                latestResult: category.LatestResult,
                message: category.LatestResult?.Message,
                success2: category.LatestResult?.Success,
                id: category.ID
            });

            if (saved) {
                console.debug('[DashboardBrowserResource] Category saved successfully, ID:', category.ID);
                // Add to local array - engine will self-update
                this.categories.push(category);
                this.categories = [...this.categories].sort((a, b) => a.Name.localeCompare(b.Name));
            } else {
                const errorMessage = category.LatestResult?.Message || 'Unknown error saving category';
                console.error('[DashboardBrowserResource] Failed to save category:', errorMessage);
                console.error('[DashboardBrowserResource] Full LatestResult:', JSON.stringify(category.LatestResult, null, 2));

                // Show toast or alert for user
                alert(`Failed to create category: ${errorMessage}`);
            }
        } catch (err) {
            console.error('[DashboardBrowserResource] Exception creating category:', err);
            alert(`Error creating category: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handle category delete request from generic browser
     * Performs recursive deletion of category and all children
     */
    public async onCategoryDelete(event: CategoryDeleteEvent): Promise<void> {
        console.debug('[DashboardBrowserResource] Category delete requested:', event.Category.Name);

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Get all categories in child-first order so parent FKs are satisfied as we delete.
            // getChildCategoriesRecursive returns pre-order (parent before its descendants);
            // reversing that list gives a valid leaves-first order, then we append the root last.
            const descendants = this.getChildCategoriesRecursive(event.Category.ID);
            descendants.reverse();
            const categoriesToDelete = [...descendants, event.Category];

            console.debug('[DashboardBrowserResource] Deleting categories:', categoriesToDelete.map(c => c.Name));

            const categoryIds = new Set(categoriesToDelete.map(c => c.ID));
            const dashboardsToUncategorize = this.dashboards.filter(d =>
                d.CategoryID && categoryIds.has(d.CategoryID)
            );

            // Queue dashboard uncategorize saves first, then category deletes — single atomic transaction
            const md = this.ProviderToUse;
            const tg = await md.CreateTransactionGroup();

            for (const dashboard of dashboardsToUncategorize) {
                dashboard.CategoryID = null!;
                dashboard.TransactionGroup = tg;
                await dashboard.Save();
            }

            for (const cat of categoriesToDelete) {
                cat.TransactionGroup = tg;
                await cat.Delete();
            }

            if (await tg.Submit()) {
                this.categories = this.categories.filter(c => !categoryIds.has(c.ID));
                this.dashboards = [...this.dashboards];
            } else {
                console.error('[DashboardBrowserResource] Failed to delete categories — all changes rolled back');
            }
        } catch (err) {
            console.error('[DashboardBrowserResource] Exception deleting category:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handle breadcrumb navigation event
     * Navigates back to list view with optional category selection
     */
    public onBreadcrumbNavigate(event: BreadcrumbNavigateEvent): void {
        console.debug('[DashboardBrowserResource] Breadcrumb navigate:', event);

        // CategoryId is null for root, or a category ID string
        this.selectedCategoryId = event.CategoryId;
        this.backToList();
        this.updateUrlQueryParams();
    }

    // ========================================
    // Public Methods - Navigation
    // ========================================

    /**
     * Open a dashboard for viewing
     */
    public openDashboard(dashboard: MJDashboardEntity): void {
        this.selectedDashboard = dashboard;
        this.mode = 'view';

        // Compute permissions for the selected dashboard
        const md = this.ProviderToUse;
        this.selectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
            dashboard.ID,
            md.CurrentUser.ID
        );

        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged(dashboard.Name || 'Dashboard');
        this.cdr.detectChanges();
    }

    /**
     * Open a dashboard for editing
     */
    public editDashboard(dashboard: MJDashboardEntity): void {
        // Check if user has edit permission
        const md = this.ProviderToUse;
        const permissions = DashboardEngine.Instance.GetDashboardPermissions(
            dashboard.ID,
            md.CurrentUser.ID
        );

        if (!permissions.CanEdit) {
            console.warn('User does not have permission to edit this dashboard');
            return;
        }

        this.selectedDashboard = dashboard;
        this.selectedDashboardPermissions = permissions;
        this.mode = 'edit';

        // Initialize editing fields
        this.editingName = dashboard.Name;
        this.editingDescription = dashboard.Description || '';

        // Store originals for cancel
        this.originalName = dashboard.Name;
        this.originalDescription = dashboard.Description || '';
        this.originalConfig = dashboard.UIConfigDetails || '';

        this.cdr.detectChanges();
    }

    /**
     * Go back to list view
     */
    public backToList(): void {
        this.selectedDashboard = null;
        this.mode = 'list';
        this.updateUrlQueryParams();
        this.NotifyDisplayNameChanged('Dashboards');
        this.cdr.detectChanges();
    }

    /**
     * Toggle edit mode for current dashboard
     */
    public toggleEditMode(): void {
        if (this.mode === 'view' && this.selectedDashboard) {
            this.editDashboard(this.selectedDashboard);
        } else if (this.mode === 'edit') {
            this.mode = 'view';
            this.cdr.detectChanges();
        }
    }

    /**
     * Open the share dialog for the current dashboard
     */
    public openShareDialog(): void {
        if (!this.selectedDashboard) return;

        // Verify user has share permission
        if (!this.selectedDashboardPermissions.CanShare) {
            console.warn('User does not have permission to share this dashboard');
            return;
        }

        this.showShareDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Close the share dialog
     */
    public closeShareDialog(): void {
        this.showShareDialog = false;
        this.cdr.detectChanges();
    }

    /**
     * Handle share dialog result
     */
    public onShareDialogResult(result: ShareDialogResult): void {
        this.showShareDialog = false;

        if (result.Action === 'save' && this.selectedDashboard) {
            // Recompute permissions after sharing changes
            const md = this.ProviderToUse;
            this.selectedDashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                this.selectedDashboard.ID,
                md.CurrentUser.ID
            );
        }

        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Dashboard CRUD
    // ========================================

    /**
     * Create a new dashboard
     */
    public async createDashboard(categoryId?: string | null): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = this.ProviderToUse;
            const dashboard = await md.GetEntityObject<MJDashboardEntity>('MJ: Dashboards');

            dashboard.Name = 'New Dashboard';
            dashboard.Description = '';
            dashboard.UserID = md.CurrentUser.ID;
            dashboard.UIConfigDetails = JSON.stringify(createDefaultDashboardConfig());

            if (categoryId) {
                dashboard.CategoryID = categoryId;
            } else if (this.selectedCategoryId) {
                dashboard.CategoryID = this.selectedCategoryId;
            }

            const saved = await dashboard.Save();

            if (saved) {
                this.dashboards.unshift(dashboard);
                this.dashboards = [...this.dashboards];
                this.editDashboard(dashboard);
            } else {
                console.error('Failed to save dashboard:', dashboard.LatestResult);
            }
        } catch (err) {
            console.error('Failed to create dashboard:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Save the current dashboard
     */
    public async saveDashboard(): Promise<void> {
        if (!this.selectedDashboard) return;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            this.selectedDashboard.Name = this.editingName;
            this.selectedDashboard.Description = this.editingDescription;

            if (this.dashboardViewer) {
                await this.dashboardViewer.save();
            }

            this.originalName = this.editingName;
            this.originalDescription = this.editingDescription;
            this.originalConfig = this.selectedDashboard.UIConfigDetails || '';

            // Update the dashboard in the list
            this.dashboards = [...this.dashboards];

            this.mode = 'view';
        } catch (err) {
            console.error('Failed to save dashboard:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Cancel editing and revert changes
     */
    public cancelEdit(): void {
        if (!this.selectedDashboard) {
            this.backToList();
            return;
        }

        this.selectedDashboard.Name = this.originalName;
        this.selectedDashboard.Description = this.originalDescription;
        this.selectedDashboard.UIConfigDetails = this.originalConfig;

        this.editingName = '';
        this.editingDescription = '';

        this.mode = 'view';
        this.cdr.detectChanges();
    }

    /**
     * Handle name input blur - validate name is not empty
     */
    public onNameBlur(): void {
        if (!this.editingName.trim()) {
            this.editingName = this.originalName || 'Untitled Dashboard';
        }
    }

    // ========================================
    // Public Methods - Part Management
    // ========================================

    /**
     * Open the Add Part dialog
     */
    public openAddPartDialog(): void {
        this.showAddPanelDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle panel interaction events from the viewer
     */
    public onPanelInteraction(event: PanelInteractionEvent): void {
        if (event.interactionType !== 'custom') return;

        const action = event.payload?.['action'];

        switch (action) {
            case 'add-panel-requested':
                this.openAddPartDialog();
                break;

            case 'configure-part-requested':
                this.openConfigDialog(event.panelId);
                break;

            case 'remove-part-requested':
                this.openRemoveConfirmDialog(
                    event.panelId,
                    event.payload?.['panelTitle'] as string || 'this part'
                );
                break;
        }
    }

    /**
     * Handle navigation events from panels
     */
    public onNavigationRequested(event: DashboardNavRequestEvent): void {
        const request = event.request;
        const openInNewTab = request.openInNewTab || false;

        switch (request.type) {
            case 'OpenEntityRecord': {
                // Navigate to entity record
                const compositeKey = new CompositeKey();
                compositeKey.SimpleLoadFromURLSegment(request.recordId);
                // If simple load didn't work (single ID without field name), look up actual PK field
                if (compositeKey.KeyValuePairs.length === 0) {
                    const md = this.ProviderToUse;
                    const entity = md.Entities.find(e => e.Name === request.entityName);
                    const pkFieldName = entity?.FirstPrimaryKey?.Name || 'ID';
                    compositeKey.LoadFromSingleKeyValuePair(pkFieldName, request.recordId);
                }
                this.navigationService.OpenEntityRecord(
                    request.entityName,
                    compositeKey,
                    { forceNewTab: openInNewTab }
                );
                break;
            }
            case 'OpenDashboard': {
                // Navigate to another dashboard
                const targetDashboard = this.dashboards.find(d => UUIDsEqual(d.ID, request.dashboardId));
                if (targetDashboard) {
                    if (openInNewTab) {
                        this.navigationService.OpenDashboard(
                            targetDashboard.ID,
                            targetDashboard.Name,
                            { forceNewTab: true }
                        );
                    } else {
                        this.openDashboard(targetDashboard);
                    }
                }
                break;
            }
            case 'OpenQuery': {
                // Navigate to query viewer
                const md = this.ProviderToUse;
                const queryInfo = md.Queries.find(q => UUIDsEqual(q.ID, request.queryId));
                if (queryInfo) {
                    this.navigationService.OpenQuery(
                        request.queryId,
                        queryInfo.Name,
                        { forceNewTab: openInNewTab }
                    );
                }
                break;
            }
            case 'OpenNavItem': {
                // Navigate to a specific nav item within an application
                const appId = request.appName ? this.resolveAppId(request.appName) : undefined;
                this.navigationService.OpenNavItemByName(request.navItemName, undefined, appId, {
                    queryParams: request.queryParams
                });
                break;
            }
        }
    }

    /**
     * Resolve an application name to its ID
     */
    private resolveAppId(appName: string): string | undefined {
        const md = this.ProviderToUse;
        const app = md.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
        return app?.ID;
    }

    /**
     * Handle add panel dialog result
     */
    public onPanelAdded(result: AddPanelResult): void {
        if (this.dashboardViewer) {
            this.dashboardViewer.addPanel(
                result.PartType.ID,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.showAddPanelDialog = false;
        this.cdr.detectChanges();
    }

    /**
     * Handle add panel dialog cancel
     */
    public onAddPanelCancelled(): void {
        this.showAddPanelDialog = false;
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Config Dialog
    // ========================================

    /**
     * Open the config dialog for a panel
     */
    public openConfigDialog(panelId: string): void {
        if (!this.dashboardViewer) return;

        const panel = this.dashboardViewer.getPanel(panelId);
        const partType = this.dashboardViewer.getPartTypeForPanel(panelId);

        if (!panel || !partType) {
            console.warn('Could not find panel or part type for config dialog');
            return;
        }

        this.configDialogPanel = panel;
        this.configDialogPartType = partType;
        this.configDialogClass = partType.ConfigDialogClass || '';
        this.showConfigDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle config dialog save
     */
    public onConfigDialogSaved(result: EditPartDialogResult): void {
        if (this.dashboardViewer && this.configDialogPanel) {
            this.dashboardViewer.updatePanelConfig(
                this.configDialogPanel.id,
                result.Config,
                result.Title,
                result.Icon
            );
        }
        this.closeConfigDialog();
    }

    /**
     * Handle config dialog cancel
     */
    public onConfigDialogCancelled(): void {
        this.closeConfigDialog();
    }

    /**
     * Close the config dialog
     */
    private closeConfigDialog(): void {
        this.showConfigDialog = false;
        this.configDialogPanel = null;
        this.configDialogPartType = null;
        this.configDialogClass = '';
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Remove Confirm Dialog
    // ========================================

    /**
     * Open the remove confirmation dialog
     */
    public openRemoveConfirmDialog(panelId: string, panelTitle: string): void {
        this.confirmPanelId = panelId;
        this.confirmPanelTitle = panelTitle;
        this.showConfirmDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handle remove confirmation
     */
    public onRemoveConfirmed(): void {
        if (this.dashboardViewer && this.confirmPanelId) {
            this.dashboardViewer.confirmRemovePanel(this.confirmPanelId);
        }
        this.closeRemoveConfirmDialog();
    }

    /**
     * Handle remove cancel
     */
    public onRemoveCancelled(): void {
        this.closeRemoveConfirmDialog();
    }

    /**
     * Close the remove confirm dialog
     */
    private closeRemoveConfirmDialog(): void {
        this.showConfirmDialog = false;
        this.confirmPanelId = '';
        this.confirmPanelTitle = '';
        this.cdr.detectChanges();
    }

    // ========================================
    // Private Methods - Data Loading
    // ========================================

    private async loadDashboards(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Use DashboardEngine for consistent cached data
            const engine = DashboardEngine.Instance;
            await engine.Config(false); // Wait for engine to load data

            const md = this.ProviderToUse;
            const currentUserId = md.CurrentUser.ID;

            // Get data from engine - sort dashboards by updated date, categories by name
            // Filter dashboards to only those accessible to the current user
            this.dashboards = [...engine.GetAccessibleDashboards(currentUserId)].sort((a, b) =>
                new Date(b.__mj_UpdatedAt).getTime() - new Date(a.__mj_UpdatedAt).getTime()
            );
            // Filter categories to only those owned by or shared with the current user
            this.categories = [...engine.GetAccessibleCategories(currentUserId)].sort((a, b) =>
                a.Name.localeCompare(b.Name)
            );

            // Build permissions map and effective category map for all dashboards
            this.dashboardPermissionsMap = new Map();
            this.effectiveCategoryMap = new Map();

            // Get category links for current user (from engine's cached data)
            const userCategoryLinks = engine.DashboardCategoryLinks.filter(
                link => UUIDsEqual(link.UserID, currentUserId)
            );

            for (const dashboard of this.dashboards) {
                const perms = engine.GetDashboardPermissions(dashboard.ID, currentUserId);
                this.dashboardPermissionsMap.set(dashboard.ID, perms);

                // For shared dashboards (not owned), determine effective category
                if (!perms.IsOwner) {
                    // Look for a category link for this dashboard
                    const categoryLink = userCategoryLinks.find(
                        link => UUIDsEqual(link.DashboardID, dashboard.ID)
                    );

                    if (categoryLink) {
                        // User has explicitly organized this shared dashboard
                        this.effectiveCategoryMap.set(dashboard.ID, categoryLink.DashboardCategoryID);
                    } else {
                        // No link exists - show in root (null category)
                        this.effectiveCategoryMap.set(dashboard.ID, null);
                    }
                }
                // For owned dashboards, we don't add to effectiveCategoryMap
                // so the browser will use the dashboard's actual CategoryID
            }

            console.debug('[DashboardBrowserResource] Loaded from DashboardEngine:', {
                dashboardCount: this.dashboards.length,
                categoryCount: this.categories.length,
                sharedDashboardsInEffectiveMap: this.effectiveCategoryMap.size,
                categories: this.categories.map(c => ({ id: c.ID, name: c.Name, parentId: c.ParentID }))
            });

            // List is now loaded — apply any query-param selection. Use params deferred by
            // OnQueryParamsChanged during the cold load if present, otherwise read the tab's
            // current params (covers deep links and Home pin navigation).
            const params = this._pendingQueryParams ?? this.GetQueryParams();
            this._pendingQueryParams = null;
            if (params && Object.keys(params).length > 0) {
                this.selectedCategoryId = params['category'] || this.selectedCategoryId;
                this.applyDashboardSelectionFromParams(params);
            }

            this.NotifyLoadComplete();
        } catch (err) {
            console.error('Failed to load dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    // ========================================
    // Private Methods - URL Query Params
    // ========================================

    /**
     * Update the URL query params for the current tab.
     * Routes through BaseResourceComponent.UpdateQueryParams, which updates the tab
     * configuration (triggering the shell's URL sync while respecting app-scoped
     * routes) and is auto-suppressed while delivering OnQueryParamsChanged so
     * reflecting URL → state never loops back into a redundant URL push.
     */
    private updateUrlQueryParams(): void {
        const queryParams: Record<string, string | null> = {};

        // Track category
        if (this.selectedCategoryId) {
            queryParams['category'] = this.selectedCategoryId;
        } else {
            queryParams['category'] = null;
        }

        // Track dashboard (for browser back/forward support)
        if (this.selectedDashboard) {
            queryParams['dashboard'] = this.selectedDashboard.ID;
        } else {
            queryParams['dashboard'] = null;
        }

        // Push via the base-class method (auto-suppressed during OnQueryParamsChanged
        // delivery) so the URL update respects app-scoped routes without loop-back.
        this.UpdateQueryParams(queryParams);
    }

    // ========================================
    // Private Methods - Category Helpers
    // ========================================

    /**
     * Get all child categories of a parent category recursively
     */
    private getChildCategoriesRecursive(parentId: string): MJDashboardCategoryEntity[] {
        const children: MJDashboardCategoryEntity[] = [];
        const directChildren = this.categories.filter(c => UUIDsEqual(c.ParentID, parentId));

        for (const child of directChildren) {
            children.push(child);
            children.push(...this.getChildCategoriesRecursive(child.ID));
        }

        return children;
    }

    // ========================================
    // Private Methods - View Preference
    // ========================================

    private loadViewPreference(): void {
        // TODO: Load from User Settings entity
        const stored = localStorage.getItem('dashboard-browser-view-mode');
        if (stored === 'cards' || stored === 'list') {
            this.viewMode = stored;
        }
    }

    private saveViewPreference(mode: DashboardBrowserViewMode): void {
        // TODO: Save to User Settings entity
        localStorage.setItem('dashboard-browser-view-mode', mode);
    }
}
