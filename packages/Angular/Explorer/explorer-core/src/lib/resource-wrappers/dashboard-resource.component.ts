import { Component, ViewContainerRef, ComponentRef, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent, NavigationService, BaseDashboard, DashboardConfig } from '@memberjunction/ng-shared';
import { ResourceData, MJDashboardEntity, DashboardEngine, MJDashboardUserStateEntity, MJDashboardCategoryEntity, MJDashboardPartTypeEntity, DashboardUserPermissions } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { Metadata, CompositeKey, RunView, LogError } from '@memberjunction/core';
import { DataExplorerDashboardComponent, DataExplorerFilter, ShareDialogResult } from '@memberjunction/ng-dashboards';
import { DashboardViewerComponent, DashboardNavRequestEvent, PanelInteractionEvent, AddPanelResult, DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
/**
 * Dashboard Resource Wrapper - displays a single dashboard in a tab
 * Extends BaseResourceComponent to work with the resource type system
 * Dynamically routes between code-based and config-based dashboards based on dashboard type
 */
@RegisterClass(BaseResourceComponent, 'DashboardResource')
@Component({
  standalone: false,
    selector: 'mj-dashboard-resource',
    template: `
        <div class="dashboard-resource-wrapper">
            <!-- Error State -->
            @if (errorMessage) {
                <div class="error-state">
                    <div class="error-icon">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h2 class="error-title">Unable to Load Dashboard</h2>
                    <p class="error-message">{{ errorMessage }}</p>
                    @if (errorDetails) {
                        <details class="error-details">
                            <summary>Technical Details</summary>
                            <pre>{{ errorDetails }}</pre>
                        </details>
                    }
                </div>
            }

            <!-- View Mode Toolbar -->
            @if (configDashboard && !isEditMode && !errorMessage) {
                <div class="viewer-toolbar">
                    <div class="toolbar-left">
                        <span class="dashboard-title">
                            <i class="fa-solid fa-chart-line"></i>
                            {{ configDashboard.Name }}
                        </span>
                        @if (!dashboardPermissions.IsOwner && dashboardPermissions.PermissionSource !== 'none') {
                            <span class="shared-indicator" title="Shared with you">
                                <i class="fa-solid fa-share-nodes"></i>
                            </span>
                        }
                    </div>
                    <div class="toolbar-actions">
                        @if (dashboardPermissions.CanShare) {
                            <button
                                class="btn-icon"
                                title="Share Dashboard"
                                (click)="openShareDialog()">
                                <i class="fa-solid fa-share-nodes"></i>
                            </button>
                        }
                        @if (dashboardPermissions.CanEdit) {
                            <button
                                class="btn-icon"
                                title="Edit Dashboard"
                                (click)="toggleEditMode()">
                                <i class="fa-solid fa-edit"></i>
                            </button>
                        }
                    </div>
                </div>
            }

            <!-- Edit Mode Toolbar -->
            @if (configDashboard && isEditMode && !errorMessage) {
                <div class="viewer-header editing">
                    <div class="header-left">
                        <button class="btn-add-part" (click)="openAddPartDialog()">
                            <i class="fa-solid fa-plus"></i>
                            Add Part
                        </button>
                        <div class="header-separator"></div>
                        <div class="dashboard-info-edit">
                            <input
                                type="text"
                                class="dashboard-name-input"
                                [(ngModel)]="editingName"
                                placeholder="Dashboard name">
                            <input
                                type="text"
                                class="dashboard-description-input"
                                [(ngModel)]="editingDescription"
                                placeholder="Add a description...">
                        </div>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" (click)="saveDashboard()">
                            <i class="fa-solid fa-save"></i>
                            Save
                        </button>
                        <button class="btn-cancel" (click)="cancelEdit()">
                            Cancel
                        </button>
                    </div>
                </div>
            }

            <!-- Dashboard Content Container -->
            <div #container class="dashboard-resource-container"></div>

            <!-- Share Dashboard Dialog -->
            @if (configDashboard) {
                <mj-dashboard-share-dialog
                    [Visible]="showShareDialog"
                    [Dashboard]="configDashboard"
                    (Result)="onShareDialogResult($event)">
                </mj-dashboard-share-dialog>
            }
        </div>
    `,
    styles: [`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            position: relative;
            overflow: hidden;
        }
        .dashboard-resource-wrapper {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
        }
        .dashboard-resource-container {
            flex: 1;
            overflow: hidden;
            min-height: 0;
        }

        /* View Mode Toolbar */
        .viewer-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 24px;
            background: #fff;
            border-bottom: 1px solid #e0e0e0;
            gap: 16px;
        }
        .viewer-toolbar .toolbar-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .viewer-toolbar .dashboard-title {
            font-size: 16px;
            font-weight: 500;
            color: #333;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .viewer-toolbar .dashboard-title i {
            color: #5c6bc0;
        }
        .shared-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #e3f2fd;
            color: #1976d2;
            font-size: 11px;
        }
        .viewer-toolbar .toolbar-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        /* Edit Mode Header */
        .viewer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 24px;
            background: #fff;
            border-bottom: 1px solid #e0e0e0;
            transition: background 0.2s, border-color 0.2s;
        }
        .viewer-header.editing {
            background: linear-gradient(135deg, #e8eaf6 0%, #c5cae9 100%);
            border-bottom: 2px solid #5c6bc0;
        }
        .viewer-header .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }
        .viewer-header .header-right {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* Add Part button */
        .btn-add-part {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            background: #5c6bc0;
            color: #fff;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
            box-shadow: 0 2px 4px rgba(92, 107, 192, 0.3);
        }
        .btn-add-part:hover {
            background: #3f51b5;
            transform: translateY(-1px);
            box-shadow: 0 3px 6px rgba(92, 107, 192, 0.4);
        }
        .btn-add-part i { font-size: 12px; }

        /* Header separator */
        .header-separator {
            width: 1px;
            height: 28px;
            background: rgba(92, 107, 192, 0.3);
            margin: 0 4px;
        }

        /* Buttons */
        .btn-primary {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border: none;
            border-radius: 6px;
            background: #5c6bc0;
            color: #fff;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-primary:hover { background: #3f51b5; }

        .btn-icon {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            background: #fff;
            color: #666;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-icon:hover { background: #f5f5f5; }

        .btn-cancel {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border: 1px solid #d0d0d0;
            border-radius: 6px;
            background: #fff;
            color: #666;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-cancel:hover {
            background: #f5f5f5;
            border-color: #bbb;
            color: #333;
        }

        /* Dashboard info inputs */
        .dashboard-info-edit {
            display: flex;
            align-items: center;
            gap: 16px;
            flex: 1;
        }
        .dashboard-name-input {
            border: 1px solid transparent;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 16px;
            font-weight: 500;
            color: #333;
            background: rgba(255, 255, 255, 0.7);
            outline: none;
            min-width: 200px;
            max-width: 300px;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .dashboard-name-input:hover { background: rgba(255, 255, 255, 0.9); }
        .dashboard-name-input:focus {
            background: #fff;
            border-color: #5c6bc0;
            box-shadow: 0 0 0 2px rgba(92, 107, 192, 0.2);
        }
        .dashboard-description-input {
            border: 1px solid transparent;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 13px;
            color: #555;
            background: rgba(255, 255, 255, 0.5);
            outline: none;
            flex: 1;
            min-width: 150px;
            max-width: 400px;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .dashboard-description-input:hover { background: rgba(255, 255, 255, 0.8); }
        .dashboard-description-input:focus {
            background: #fff;
            border-color: #5c6bc0;
            box-shadow: 0 0 0 2px rgba(92, 107, 192, 0.2);
        }
        .dashboard-description-input::placeholder {
            color: #888;
            font-style: normal;
        }

        /* Error state */
        .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            padding: 40px;
            text-align: center;
            color: #424242;
        }
        .error-icon {
            font-size: 64px;
            color: #f44336;
            margin-bottom: 24px;
            opacity: 0.8;
        }
        .error-title {
            font-size: 24px;
            font-weight: 500;
            margin: 0 0 12px 0;
            color: #212121;
        }
        .error-message {
            font-size: 16px;
            color: #616161;
            margin: 0 0 24px 0;
            max-width: 500px;
            line-height: 1.5;
        }
        .error-details {
            background: #f5f5f5;
            border-radius: 8px;
            padding: 12px 16px;
            max-width: 600px;
            text-align: left;
            font-size: 13px;
        }
        .error-details summary {
            cursor: pointer;
            font-weight: 500;
            color: #757575;
            margin-bottom: 8px;
        }
        .error-details pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            color: #d32f2f;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .viewer-header {
                flex-direction: column;
                gap: 12px;
                align-items: stretch;
            }
            .viewer-header .header-left { flex-wrap: wrap; }
            .dashboard-info-edit {
                flex-direction: column;
                align-items: stretch;
            }
            .dashboard-name-input,
            .dashboard-description-input { max-width: none; }
        }
    `]
})
export class DashboardResource extends BaseResourceComponent {
    private componentRef: ComponentRef<unknown> | null = null;
    private dataLoaded = false;
    @ViewChild('container', { static: true }) containerElement!: ElementRef<HTMLDivElement>;

    /** Error message to display when dashboard fails to load */
    public errorMessage: string | null = null;
    /** Technical error details (shown in expandable section) */
    public errorDetails: string | null = null;

    /** Cached dashboard categories for breadcrumb navigation */
    private categories: MJDashboardCategoryEntity[] = [];

    /** Reference to the dashboard viewer component (for config-based dashboards) */
    private viewerInstance: DashboardViewerComponent | null = null;

    /** The config-based dashboard entity (null for code-based dashboards) */
    public configDashboard: MJDashboardEntity | null = null;

    /** Whether we're in edit mode */
    public isEditMode = false;

    /** Editing fields */
    public editingName = '';
    public editingDescription = '';

    /** Current user's permissions for this dashboard */
    public dashboardPermissions: DashboardUserPermissions = {
        DashboardID: '',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner'
    };

    /** Whether the share dialog is visible */
    public showShareDialog = false;

    /**
     * Sets the error state with a user-friendly message and optional technical details
     */
    private setError(message: string, error?: unknown): void {
        this.errorMessage = message;
        if (error instanceof Error) {
            this.errorDetails = error.message;
            if (error.stack) {
                this.errorDetails += '\n\nStack trace:\n' + error.stack;
            }
        } else if (error) {
            this.errorDetails = String(error);
        }
    }

    /**
     * Clears any previous error state
     */
    private clearError(): void {
        this.errorMessage = null;
        this.errorDetails = null;
    }

    constructor(
        private viewContainer: ViewContainerRef,
        private navigationService: NavigationService,
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    override set Data(value: ResourceData) {
        super.Data = value;
        if (!this.dataLoaded) {
            this.dataLoaded = true;
            this.loadDashboard();
        }
    }

    // Need to override the getter too in TS otherwise the override to the setter alone above would break things
    override get Data(): ResourceData {
        return super.Data;
    }

    ngOnDestroy(): void {
        if (this.componentRef) {
            this.componentRef.destroy();
        }
    }

    // ========================================
    // Edit Mode Methods
    // ========================================

    /**
     * Toggle between view and edit mode
     */
    public toggleEditMode(): void {
        if (this.isEditMode) {
            this.cancelEdit();
        } else {
            this.enterEditMode();
        }
    }

    /**
     * Enter edit mode
     */
    private enterEditMode(): void {
        if (!this.configDashboard) return;

        this.isEditMode = true;
        this.editingName = this.configDashboard.Name;
        this.editingDescription = this.configDashboard.Description || '';

        // Tell the viewer to enter edit mode
        if (this.viewerInstance) {
            this.viewerInstance.isEditing = true;
        }

        this.cdr.detectChanges();
    }

    /**
     * Cancel edit mode and discard changes
     */
    public cancelEdit(): void {
        this.isEditMode = false;

        // Tell the viewer to exit edit mode
        if (this.viewerInstance) {
            this.viewerInstance.isEditing = false;
        }

        this.cdr.detectChanges();
    }

    /**
     * Save dashboard changes
     */
    public async saveDashboard(): Promise<void> {
        if (!this.configDashboard || !this.viewerInstance) return;

        try {
            // Update dashboard name and description
            this.configDashboard.Name = this.editingName;
            this.configDashboard.Description = this.editingDescription;

            // Save via the viewer (which handles layout saving)
            await this.viewerInstance.save();

            // Exit edit mode
            this.isEditMode = false;
            this.viewerInstance.isEditing = false;

            this.cdr.detectChanges();
        } catch (error) {
            console.error('Error saving dashboard:', error);
        }
    }

    /**
     * Open the add panel dialog
     */
    public openAddPartDialog(): void {
        if (this.viewerInstance) {
            // Trigger the viewer's add panel flow
            this.viewerInstance.onAddPanelClick();
        }
    }

    /**
     * Open the share dialog for this dashboard
     */
    public openShareDialog(): void {
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

        if (result.Action === 'save' && this.configDashboard) {
            // Recompute permissions after sharing changes
            const md = new Metadata();
            this.dashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                this.configDashboard.ID,
                md.CurrentUser.ID
            );
        }

        this.cdr.detectChanges();
    }

    /**
     * Load the appropriate dashboard component based on dashboard type
     * Routes between code-based dashboards (registered classes) and config-based dashboards
     */
    private async loadDashboard(): Promise<void> {
        // Clear any previous error state
        this.clearError();

        const data = this.Data;

        if (!data?.ResourceRecordID) {
            this.NotifyLoadStarted();
            this.NotifyLoadComplete();
            return;
        }

        this.NotifyLoadStarted();

        try {
            // Check if this is a special dashboard type (not a database record)
            const config = data.Configuration || {};

            if (config['dashboardType'] === 'DataExplorer' || data.ResourceRecordID === 'DataExplorer') {
                // Special case: Data Explorer dashboard with optional entity filter
                await this.loadDataExplorer(
                    config['entityFilter'],
                    config['appName'] as string | undefined,
                    config['appIcon'] as string | undefined
                );
                return;
            }

            await DashboardEngine.Instance.Config(false); // make sure it is configured, if already configured does nothing
            const dashboard = DashboardEngine.Instance.Dashboards.find(d => d.ID === data.ResourceRecordID);
            if (!dashboard) {
                throw new Error(`Dashboard with ID ${data.ResourceRecordID} not found.`);
            }

            // Determine which dashboard component to load based on dashboard type
            if (dashboard.Type === 'Code') {
                // CODE-BASED DASHBOARD: Use registered class via DriverClass
                await this.loadCodeBasedDashboard(dashboard);
            } else {
                // CONFIG-BASED DASHBOARD: Use the generic metadata-driven renderer
                await this.loadConfigBasedDashboard(dashboard);
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            this.setError('The dashboard could not be loaded. This may be due to a missing component or configuration issue.', error);
            this.NotifyLoadComplete();
        }
    }

    /**
     * Load the Data Explorer dashboard component with optional entity filter and context info
     * @param entityFilter Optional filter to constrain which entities are shown
     * @param contextName Optional name to display in the header (e.g., "CRM", "Association Demo")
     * @param contextIcon Optional Font Awesome icon class for the header
     */
    private async loadDataExplorer(
        entityFilter?: DataExplorerFilter,
        contextName?: string,
        contextIcon?: string
    ): Promise<void> {
        try {
            // Create the Data Explorer component directly (it's already registered)
            this.containerElement.nativeElement.innerHTML = '';
            const componentRef = this.viewContainer.createComponent(DataExplorerDashboardComponent);
            this.componentRef = componentRef;
            const instance = componentRef.instance;

            // Set the entity filter - ngOnInit will use this when it runs
            if (entityFilter) {
                instance.entityFilter = entityFilter;
            }

            // Set context name and icon for customized header display
            if (contextName) {
                instance.contextName = contextName;
            }
            if (contextIcon) {
                instance.contextIcon = contextIcon;
            }

            // Manually append the component's native element inside the div
            const nativeElement = (componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.containerElement.nativeElement.appendChild(nativeElement);

            // Handle open entity record events
            instance.OpenEntityRecord.subscribe((eventData: { EntityName: string; RecordPKey: CompositeKey }) => {
                if (eventData && eventData.EntityName && eventData.RecordPKey) {
                    this.navigationService.OpenEntityRecord(eventData.EntityName, eventData.RecordPKey);
                }
            });

            // Setup LoadCompleteEvent to know when the dashboard is ready
            instance.LoadCompleteEvent = () => {
                this.NotifyLoadComplete();
            };

            // Initialize dashboard (no database config needed for DataExplorer)
            const config: DashboardConfig = {
                dashboard: null as unknown as MJDashboardEntity, // No database record
                userState: {}
            };
            instance.Config = config;
            instance.Refresh();

            // Trigger change detection to ensure the component updates
            componentRef.changeDetectorRef.detectChanges();
        } catch (error) {
            console.error('Error loading Data Explorer:', error);
            this.setError('The Data Explorer could not be loaded.', error);
            this.NotifyLoadComplete();
        }
    }

    /**
     * Load a code-based dashboard by looking up the registered class
     */
    private async loadCodeBasedDashboard(dashboard: MJDashboardEntity): Promise<void> {
        try {
            if (!dashboard.DriverClass) {
                throw new Error(`Dashboard '${dashboard.Name}' is marked as Code type but has no DriverClass specified`);
            }

            // Look up the registered class using the DriverClass name
            const classReg = MJGlobal.Instance.ClassFactory.GetRegistration(
                BaseDashboard,
                dashboard.DriverClass
            );

            if (!classReg?.SubClass) {
                throw new Error(`Dashboard class '${dashboard.DriverClass}' is not registered. Please check the class registration.`);
            }

            // Create the component instance
            this.containerElement.nativeElement.innerHTML = '';
            this.componentRef = this.viewContainer.createComponent<BaseDashboard>(classReg.SubClass);
            const instance = this.componentRef.instance as BaseDashboard;

            // Setup LoadCompleteEvent() to know when the dashboard is ready
            instance.LoadCompleteEvent = () => {
                this.NotifyLoadComplete();
            };

            // Initialize with dashboard data
            const userStateEntity = await this.loadDashboardUserState(dashboard.ID);
            const config: DashboardConfig = {
                dashboard,
                userState: userStateEntity.UserState ? SafeJSONParse(userStateEntity.UserState) : {}
            };

            instance.Config = config;

            // Manually append the component's native element inside the div
            const nativeElement = (this.componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.containerElement.nativeElement.appendChild(nativeElement);

            // handle open entity record events in MJ Explorer with routing
            instance.OpenEntityRecord.subscribe((data: { EntityName: string; RecordPKey: CompositeKey }) => {
                // check to see if the data has entityname/pkey
                if (data && data.EntityName && data.RecordPKey) {
                    // Use NavigationService to open entity record in new tab
                    this.navigationService.OpenEntityRecord(data.EntityName, data.RecordPKey);
                } else {
                    console.warn('DashboardResource - invalid data, missing EntityName or RecordPKey:', data);
                }
            });

            instance.UserStateChanged.subscribe(async (userState: any) => {
                if (!userState) {
                    // if the user state is null, we need to remove it from the user state
                    userState = {};
                }
                // save the user state to the dashboard user state entity
                userStateEntity.UserState = JSON.stringify(userState);
                if (!await userStateEntity.Save()) {
                    LogError('Error saving user state', null, userStateEntity.LatestResult?.CompleteMessage);
                }
            });

            instance.Refresh();
        } catch (error) {
            console.error('Error loading code-based dashboard:', error);
            this.setError(`The dashboard "${dashboard.Name}" could not be loaded. The dashboard class may not be registered or may have failed to initialize.`, error);
            this.NotifyLoadComplete();
        }
    }

    protected async loadDashboardUserState(dashboardId: string): Promise<MJDashboardUserStateEntity> {
        // handle user state changes for the dashboard
        const md = new Metadata();
        const stateResult = DashboardEngine.Instance.DashboardUserStates.filter(dus => dus.DashboardID === dashboardId && dus.UserID === md.CurrentUser.ID)
        let stateObject: MJDashboardUserStateEntity;
        if (stateResult && stateResult.length > 0) {
            stateObject = stateResult[0];
        }
        else {
            stateObject = await md.GetEntityObject<MJDashboardUserStateEntity>('MJ: Dashboard User States');
            stateObject.DashboardID = dashboardId;
            stateObject.UserID = md.CurrentUser.ID;
            // don't save becuase we don't care about the state until something changes
        }
        return stateObject;
    }

    /**
     * Load a config-based dashboard using the new DashboardViewerComponent (Golden Layout)
     */
    private async loadConfigBasedDashboard(dashboard: MJDashboardEntity): Promise<void> {
        try {
            this.containerElement.nativeElement.innerHTML = '';
            const componentRef = this.viewContainer.createComponent(DashboardViewerComponent);
            this.componentRef = componentRef;
            const instance = componentRef.instance;

            // Store references for external toolbar control
            this.viewerInstance = instance;
            this.configDashboard = dashboard;

            // Compute user permissions for this dashboard
            const md = new Metadata();
            this.dashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                dashboard.ID,
                md.CurrentUser.ID
            );

            // Manually append the component's native element inside the div
            const nativeElement = (this.componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.containerElement.nativeElement.appendChild(nativeElement);

            // Load categories for breadcrumb navigation (if not already loaded)
            if (this.categories.length === 0) {
                this.categories = DashboardEngine.Instance.DashboardCategories;
            }

            // Set the dashboard entity directly on the viewer
            // We provide our own external toolbar, so disable the viewer's internal toolbar
            instance.dashboard = dashboard;
            instance.showToolbar = false;         // We provide external toolbar
            instance.showBreadcrumb = false;      // Already in its own tab, no breadcrumb needed
            instance.showOpenInTabButton = false; // Already in its own tab
            instance.showEditButton = false;      // External toolbar handles edit
            instance.Categories = this.categories;

            // Wire up navigation events - handle navigation requests from the dashboard
            instance.navigationRequested.subscribe((event: DashboardNavRequestEvent) => {
                this.handleNavigationRequest(event);
            });

            // Wire up "Open in Tab" button click
            instance.openInTab.subscribe((event: { dashboardId: string; dashboardName: string }) => {
                this.navigationService.OpenDashboard(event.dashboardId, event.dashboardName);
            });

            // Wire up dashboard saved event
            instance.dashboardSaved.subscribe((savedDashboard: MJDashboardEntity) => {
                this.ResourceRecordSaved(savedDashboard);
            });

            // Wire up error events
            instance.error.subscribe((errorEvent: { message: string; error?: Error }) => {
                console.error('Dashboard error:', errorEvent.message, errorEvent.error);
            });

            // Notify load complete after a brief delay to let Golden Layout initialize
            setTimeout(() => {
                this.NotifyLoadComplete();
                this.cdr.detectChanges();
            }, 150);

        } catch (error) {
            console.error('Error loading config-based dashboard:', error);
            this.setError(`The dashboard "${dashboard.Name}" could not be loaded. There may be an issue with the dashboard configuration.`, error);
            this.NotifyLoadComplete();
        }
    }

    /**
     * Handle navigation requests from the dashboard viewer
     */
    private handleNavigationRequest(event: DashboardNavRequestEvent): void {
        const request = event.request;

        switch (request.type) {
            case 'OpenEntityRecord': {
                const entityRequest = request as { type: 'OpenEntityRecord'; entityName: string; recordId: string };
                const pkey = new CompositeKey([{ FieldName: 'ID', Value: entityRequest.recordId }]);
                this.navigationService.OpenEntityRecord(entityRequest.entityName, pkey);
                break;
            }
            case 'OpenDashboard': {
                const dashRequest = request as { type: 'OpenDashboard'; dashboardId: string };
                // Load dashboard name from engine cache
                const targetDashboard = DashboardEngine.Instance.Dashboards.find(d => d.ID === dashRequest.dashboardId);
                const name = targetDashboard?.Name || 'Dashboard';
                this.navigationService.OpenDashboard(dashRequest.dashboardId, name);
                break;
            }
            case 'OpenQuery': {
                const queryRequest = request as { type: 'OpenQuery'; queryId: string };
                this.navigationService.OpenQuery(queryRequest.queryId, 'Query');
                break;
            }
            default:
                console.warn('Unhandled navigation request type:', request.type);
        }
    }

    /**
     * Get the display name for a dashboard resource
     * Loads the actual dashboard name from the database if available
     */
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        try {
            // Try to load dashboard metadata if we have the record ID
            if (data.ResourceRecordID && data.ResourceRecordID.length > 0) {
                const md = new Metadata();
                const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: data.ResourceRecordID }]);
                const name = await md.GetEntityRecordName('Dashboards', compositeKey);
                if (name) {
                    return name;
                }
            }
        } catch (error) {
            // Silently fail and use fallback
        }

        // Fallback: use provided name or generic label
        return data.Name || 'Dashboard';
    }

    /**
     * Get the icon class for dashboard resources
     */
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-columns';
    }
}
