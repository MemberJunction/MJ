import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, DashboardEntity, DashboardCategoryEntity, DashboardPartTypeEntity } from '@memberjunction/core-entities';
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
    CategoryChangeEvent,
    ViewPreferenceChangeEvent,
    DashboardBrowserViewMode
} from '@memberjunction/ng-dashboard-viewer';

export function LoadDashboardBrowserResource() {
    // Prevents tree-shaking
}

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
    public dashboards: DashboardEntity[] = [];
    public categories: DashboardCategoryEntity[] = [];
    public selectedDashboard: DashboardEntity | null = null;
    public selectedCategoryId: string | null = null;
    public viewMode: DashboardBrowserViewMode = 'cards';
    public showAddPanelDialog = false;

    // Config dialog state
    public showConfigDialog = false;
    public configDialogPanel: DashboardPanel | null = null;
    public configDialogPartType: DashboardPartTypeEntity | null = null;
    public configDialogClass: string = '';

    // Confirm dialog state
    public showConfirmDialog = false;
    public confirmPanelId: string = '';
    public confirmPanelTitle: string = '';

    // Edit mode state for name/description
    public editingName = '';
    public editingDescription = '';
    private originalName = '';
    private originalDescription = '';
    private originalConfig = '';

    private readonly _destroy$ = new Subject<void>();

    @ViewChild('dashboardViewer') dashboardViewer!: DashboardViewerComponent;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        private route: ActivatedRoute
    ) {
        super();
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        this.loadDashboards();
        this.subscribeToQueryParams();
        this.loadViewPreference();
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
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
            // TODO: Open in new tab via NavigationService
            console.log('Open in new tab:', event.Dashboard.Name);
        }
        this.openDashboard(event.Dashboard);
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
        // We just need to perform the actual deletion
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            for (const dashboard of event.Dashboards) {
                const deleted = await dashboard.Delete();
                if (deleted) {
                    const index = this.dashboards.findIndex(d => d.ID === dashboard.ID);
                    if (index >= 0) {
                        this.dashboards.splice(index, 1);
                    }
                }
            }

            // Create new array reference to trigger change detection
            this.dashboards = [...this.dashboards];
        } catch (err) {
            console.error('Failed to delete dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Handle dashboard move request from generic browser
     */
    public async onDashboardMove(event: DashboardMoveEvent): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            for (const dashboard of event.Dashboards) {
                dashboard.CategoryID = event.TargetCategoryId;
                await dashboard.Save();
            }

            // Refresh the list
            this.dashboards = [...this.dashboards];
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

    // ========================================
    // Public Methods - Navigation
    // ========================================

    /**
     * Open a dashboard for viewing
     */
    public openDashboard(dashboard: DashboardEntity): void {
        this.selectedDashboard = dashboard;
        this.mode = 'view';
        this.cdr.detectChanges();
    }

    /**
     * Open a dashboard for editing
     */
    public editDashboard(dashboard: DashboardEntity): void {
        this.selectedDashboard = dashboard;
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

            const md = new Metadata();
            const dashboard = await md.GetEntityObject<DashboardEntity>('Dashboards');

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
        // TODO: Integrate with NavigationService for proper routing
        console.log('Navigation requested:', event.request);

        switch (event.request.type) {
            case 'OpenRecord':
                // Navigate to entity record
                break;
            case 'OpenEntity':
                // Navigate to entity browser
                break;
            case 'OpenDashboard':
                // Navigate to another dashboard
                const dashboardRequest = event.request;
                const targetDashboard = this.dashboards.find(d => d.ID === dashboardRequest.dashboardId);
                if (targetDashboard) {
                    this.openDashboard(targetDashboard);
                }
                break;
            case 'OpenQuery':
                // Navigate to query viewer
                break;
            case 'OpenReport':
                // Navigate to report viewer
                break;
        }
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

            const rv = new RunView();

            const [dashboardResult, categoryResult] = await rv.RunViews([
                {
                    EntityName: 'Dashboards',
                    OrderBy: '__mj_UpdatedAt DESC',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'Dashboard Categories',
                    OrderBy: 'Name ASC',
                    ResultType: 'entity_object'
                }
            ]);

            if (dashboardResult.Success) {
                this.dashboards = dashboardResult.Results as DashboardEntity[];
            }

            if (categoryResult.Success) {
                this.categories = categoryResult.Results as DashboardCategoryEntity[];
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

    private subscribeToQueryParams(): void {
        this.route.queryParams
            .pipe(takeUntil(this._destroy$))
            .subscribe(params => {
                const categoryId = params['category'] || null;
                if (categoryId !== this.selectedCategoryId) {
                    this.selectedCategoryId = categoryId;
                    this.cdr.detectChanges();
                }
            });
    }

    private updateUrlQueryParams(): void {
        const queryParams: Record<string, string | null> = {};

        if (this.selectedCategoryId) {
            queryParams['category'] = this.selectedCategoryId;
        } else {
            queryParams['category'] = null;
        }

        this.router.navigate([], {
            relativeTo: this.route,
            queryParams,
            queryParamsHandling: 'merge'
        });
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
