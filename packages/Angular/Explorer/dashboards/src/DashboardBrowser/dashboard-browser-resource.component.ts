import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { RegisterClass, ClassFactory } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, DashboardEntity, DashboardCategoryEntity, DashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    DashboardViewerComponent,
    DashboardNavigationEvent,
    PanelInteractionEvent,
    AddPanelResult,
    createDefaultDashboardConfig,
    DashboardPanel,
    PanelConfig,
    BaseConfigDialog,
    ConfigDialogResult
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
 * Shows a list of dashboards and allows opening them in view or edit mode.
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
    public filteredDashboards: DashboardEntity[] = [];
    public selectedDashboard: DashboardEntity | null = null;
    public searchText = '';
    public selectedCategoryId: string | null = null;
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

    // Delete dashboard confirm state
    public showDeleteDashboardConfirm = false;
    public dashboardToDelete: DashboardEntity | null = null;

    private readonly _destroy$ = new Subject<void>();

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
        this.loadDashboards();
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
        if (this.mode === 'view') {
            this.mode = 'edit';
        } else if (this.mode === 'edit') {
            this.mode = 'view';
        }
        this.cdr.detectChanges();
    }

    // ========================================
    // Public Methods - Dashboard CRUD
    // ========================================

    /**
     * Create a new dashboard
     */
    public async createDashboard(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = new Metadata();
            const dashboard = await md.GetEntityObject<DashboardEntity>('Dashboards');

            // Set required fields
            dashboard.Name = 'New Dashboard';
            dashboard.Description = '';
            dashboard.UserID = md.CurrentUser.ID;
            dashboard.UIConfigDetails = JSON.stringify(createDefaultDashboardConfig());

            // If a category is selected, use it
            if (this.selectedCategoryId) {
                dashboard.CategoryID = this.selectedCategoryId;
            }

            const saved = await dashboard.Save();

            if (saved) {
                // Add to local list
                this.dashboards.unshift(dashboard);
                this.filterDashboards();

                // Open in edit mode
                this.editDashboard(dashboard);
            } else {
                // Log validation/save errors
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
     * Delete a dashboard (legacy method - use requestDeleteDashboard instead)
     * @deprecated Use requestDeleteDashboard for nice confirm dialog
     */
    public deleteDashboard(dashboard: DashboardEntity, event: Event): void {
        this.requestDeleteDashboard(dashboard, event);
    }

    /**
     * Save the current dashboard
     */
    public async saveDashboard(): Promise<void> {
        if (this.dashboardViewer) {
            await this.dashboardViewer.save();
        }
    }

    // ========================================
    // Public Methods - Filtering
    // ========================================

    /**
     * Handle search text change
     */
    public onSearchChange(): void {
        this.filterDashboards();
    }

    /**
     * Handle category filter change
     */
    public onCategoryChange(categoryId: string | null): void {
        this.selectedCategoryId = categoryId;
        this.filterDashboards();
    }

    /**
     * Clear all filters
     */
    public clearFilters(): void {
        this.searchText = '';
        this.selectedCategoryId = null;
        this.filterDashboards();
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
    public onNavigationRequested(event: DashboardNavigationEvent): void {
        // Bubble up navigation to parent (Explorer will handle routing)
        console.log('Navigation requested:', event);
        // TODO: Integrate with Explorer navigation service
    }

    /**
     * Handle add panel dialog result
     */
    public onPanelAdded(result: AddPanelResult): void {
        if (this.dashboardViewer) {
            this.dashboardViewer.addPanel(
                result.partType.ID,
                result.config,
                result.title,
                result.icon
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
    public onConfigDialogSaved(result: ConfigDialogResult): void {
        if (this.dashboardViewer && this.configDialogPanel) {
            this.dashboardViewer.updatePanelConfig(
                this.configDialogPanel.id,
                result.config,
                result.title,
                result.icon
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
    // Public Methods - Delete Dashboard Confirm
    // ========================================

    /**
     * Request dashboard deletion (shows confirm dialog)
     */
    public requestDeleteDashboard(dashboard: DashboardEntity, event: Event): void {
        event.stopPropagation();
        this.dashboardToDelete = dashboard;
        this.showDeleteDashboardConfirm = true;
        this.cdr.detectChanges();
    }

    /**
     * Confirm dashboard deletion
     */
    public async confirmDeleteDashboard(): Promise<void> {
        if (!this.dashboardToDelete) return;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const deleted = await this.dashboardToDelete.Delete();

            if (deleted) {
                // Remove from local list
                const index = this.dashboards.findIndex(d => d.ID === this.dashboardToDelete?.ID);
                if (index >= 0) {
                    this.dashboards.splice(index, 1);
                    this.filterDashboards();
                }

                // If viewing this dashboard, go back to list
                if (this.selectedDashboard?.ID === this.dashboardToDelete?.ID) {
                    this.backToList();
                }
            }
        } catch (err) {
            console.error('Failed to delete dashboard:', err);
        } finally {
            this.isLoading = false;
            this.closeDeleteDashboardConfirm();
        }
    }

    /**
     * Cancel dashboard deletion
     */
    public cancelDeleteDashboard(): void {
        this.closeDeleteDashboardConfirm();
    }

    /**
     * Close the delete dashboard confirm dialog
     */
    private closeDeleteDashboardConfirm(): void {
        this.showDeleteDashboardConfirm = false;
        this.dashboardToDelete = null;
        this.cdr.detectChanges();
    }

    // ========================================
    // Private Methods
    // ========================================

    private async loadDashboards(): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const rv = new RunView();

            // Load dashboards and categories in parallel
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

            this.filterDashboards();
            this.NotifyLoadComplete();
        } catch (err) {
            console.error('Failed to load dashboards:', err);
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private filterDashboards(): void {
        let filtered = [...this.dashboards];

        // Filter by search text
        if (this.searchText.trim()) {
            const search = this.searchText.toLowerCase();
            filtered = filtered.filter(d =>
                d.Name.toLowerCase().includes(search) ||
                (d.Description || '').toLowerCase().includes(search)
            );
        }

        // Filter by category
        if (this.selectedCategoryId) {
            filtered = filtered.filter(d => d.CategoryID === this.selectedCategoryId);
        }

        this.filteredDashboards = filtered;
        this.cdr.detectChanges();
    }

    /**
     * Get category name for a dashboard
     */
    public getCategoryName(categoryId: string | null): string {
        if (!categoryId) return 'Uncategorized';
        const category = this.categories.find(c => c.ID === categoryId);
        return category?.Name || 'Unknown';
    }

    /**
     * Format date for display
     */
    public formatDate(date: Date): string {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return d.toLocaleDateString();
        }
    }
}
