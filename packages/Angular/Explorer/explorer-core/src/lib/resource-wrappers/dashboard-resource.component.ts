import { Component, ViewContainerRef, ComponentRef, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import {
    BaseResourceComponent, NavigationService, BaseDashboard, DashboardConfig, RecentAccessService,
    DashboardFavoritesService, HomeDashboardTabsService, HomeAppPinService, SafeDetectChanges
} from '@memberjunction/ng-shared';
import type { HomeAppPinInput } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ResourceData, MJDashboardEntity, DashboardEngine, MJDashboardUserStateEntity, MJDashboardCategoryEntity, MJDashboardPartTypeEntity, DashboardUserPermissions } from '@memberjunction/core-entities';
import { RegisterClass, MJGlobal, SafeJSONParse , UUIDsEqual } from '@memberjunction/global';
import { Metadata, CompositeKey, RunView, LogError } from '@memberjunction/core';
import type { EngineDataChangeEvent } from '@memberjunction/core';
import { auditTime, filter, takeUntil } from 'rxjs';
import type { DataExplorerFilter } from '@memberjunction/ng-dashboards/data-explorer-dashboards.module';
import type { ShareDialogResult } from '@memberjunction/ng-dashboards/core-dashboards.module';
import { DashboardViewerComponent, DashboardNavRequestEvent, PanelInteractionEvent, AddPanelResult, DashboardPanel, ExtractPanelsFromLayout } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardConfig as DashboardLayoutConfig, EditPartDialogResult } from '@memberjunction/ng-dashboard-viewer';
import { BuildDashboardTabAgentContext, BuildDashboardTabAgentTools, SummarizeDashboardPanels } from './dashboard-tab-agent';
import type { DashboardPanelSummary, DashboardTabAgentHost, DashboardTabDashboard } from './dashboard-tab-agent';

/** The Home pin resource type for dashboards. */
const DASHBOARD_PIN_RESOURCE_TYPE = 'Dashboards';

/** The entity of the dashboard records DashboardEngine caches. */
const DASHBOARDS_ENTITY_NAME = 'MJ: Dashboards';

/** How long Save waits for the dashboard screenshot. After that it saves without a new one. */
const SAVE_SCREENSHOT_TIMEOUT_MS = 1500;

/** What bringing the open dashboard in step with DashboardEngine did (see syncWithSavedDashboard). */
type SavedDashboardSync = 'reloaded' | 'took-copy' | 'unchanged';

/** The part types offered while no viewer is open: one empty list, so change detection sees a stable value. */
const NO_PART_TYPES: MJDashboardPartTypeEntity[] = [];

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
                        <button
                            type="button"
                            class="btn-icon"
                            [class.active]="IsFavorite"
                            title="Favorite"
                            aria-label="Favorite"
                            [attr.aria-pressed]="IsFavorite ? 'true' : 'false'"
                            (click)="ToggleFavorite()">
                            <i [class]="IsFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
                        </button>
                        <mj-dashboard-add-to-menu
                            [IsHomeTab]="IsHomeTab"
                            [IsPinned]="IsPinnedToHome"
                            [CanShare]="DashboardPermissions.CanShare"
                            (ToggleHomeTab)="ToggleHomeTab()"
                            (PinToHome)="PinToHome()"
                            (Share)="OpenShareDialog()">
                        </mj-dashboard-add-to-menu>
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
                        <button class="btn-add-part" [disabled]="IsSaving" (click)="OpenAddPartDialog()">
                            <i class="fa-solid fa-plus"></i>
                            Add Part
                        </button>
                        <div class="header-separator"></div>
                        <div class="dashboard-info-edit">
                            <input
                                type="text"
                                class="dashboard-name-input"
                                [(ngModel)]="editingName"
                                (blur)="OnNameBlur()"
                                placeholder="Dashboard name">
                            <input
                                type="text"
                                class="dashboard-description-input"
                                [(ngModel)]="editingDescription"
                                placeholder="Add a description...">
                        </div>
                    </div>
                    <div class="header-right">
                        <button class="btn-primary" [disabled]="IsSaving" (click)="SaveDashboard()">
                            <i [class]="IsSaving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-save'"></i>
                            {{ IsSaving ? 'Saving...' : 'Save' }}
                        </button>
                        <button class="btn-cancel" [disabled]="IsSaving" (click)="CancelEdit()">
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

            <!-- Part Dialogs: Add Part, Edit Part, Remove Part confirmation. Each edit session gets new ones. -->
            @if (ConfigDashboard && IsEditMode) {
                <mj-add-panel-dialog
                    [Visible]="ShowAddPartDialog"
                    [PartTypes]="PartTypes"
                    (PanelAdded)="OnPartAdded($event)"
                    (cancelled)="OnAddPartCancelled()">
                </mj-add-panel-dialog>
                <mj-edit-part-dialog
                    [Visible]="ShowEditPartDialog"
                    [PartType]="EditPartType"
                    [Panel]="EditPartPanel"
                    [Config]="EditPartPanel?.config ?? null"
                    (Saved)="OnEditPartSaved($event)"
                    (Cancelled)="OnEditPartCancelled()">
                </mj-edit-part-dialog>
                <mj-confirm-dialog
                    [Visible]="ShowRemovePartDialog"
                    Type="danger"
                    [Title]="'Remove Part'"
                    [Message]="RemovePartMessage"
                    ConfirmText="Remove"
                    CancelText="Cancel"
                    (Confirmed)="OnRemovePartConfirmed()"
                    (Cancelled)="OnRemovePartCancelled()">
                </mj-confirm-dialog>
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
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
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
            color: var(--mj-text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .viewer-toolbar .dashboard-title i {
            color: var(--mj-brand-primary);
        }
        .shared-indicator {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
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
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
            transition: background 0.2s, border-color 0.2s;
        }
        .viewer-header.editing {
            background: linear-gradient(135deg, color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)) 0%, color-mix(in srgb, var(--mj-brand-primary) 25%, var(--mj-bg-surface)) 100%);
            border-bottom: 2px solid var(--mj-brand-primary);
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
            background: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
            box-shadow: 0 2px 4px color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
        }
        .btn-add-part:hover:not(:disabled) {
            background: var(--mj-brand-primary-hover);
            transform: translateY(-1px);
            box-shadow: 0 3px 6px color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
        }
        .btn-add-part i { font-size: 12px; }

        /* Header separator */
        .header-separator {
            width: 1px;
            height: 28px;
            background: color-mix(in srgb, var(--mj-brand-primary) 30%, transparent);
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
            background: var(--mj-brand-primary);
            color: var(--mj-text-inverse);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-primary:hover:not(:disabled) { background: var(--mj-brand-primary-hover); }

        /* While a Save runs: Save shows it is busy; Cancel and Add Part are dimmed */
        .btn-primary:disabled { cursor: progress; }
        .btn-add-part:disabled,
        .btn-cancel:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .btn-icon {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface-card);
            color: var(--mj-text-secondary);
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-icon:hover { background: var(--mj-bg-surface-sunken); }
        .btn-icon.active { color: var(--mj-status-warning); }

        .btn-cancel {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface-card);
            color: var(--mj-text-secondary);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-cancel:hover:not(:disabled) {
            background: var(--mj-bg-surface-sunken);
            border-color: var(--mj-border-default);
            color: var(--mj-text-primary);
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
            color: var(--mj-text-primary);
            background: rgba(255, 255, 255, 0.7);
            outline: none;
            min-width: 200px;
            max-width: 300px;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .dashboard-name-input:hover { background: rgba(255, 255, 255, 0.9); }
        .dashboard-name-input:focus {
            background: var(--mj-bg-surface-card);
            border-color: var(--mj-brand-primary);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
        }
        .dashboard-description-input {
            border: 1px solid transparent;
            border-radius: 4px;
            padding: 6px 12px;
            font-size: 13px;
            color: var(--mj-text-secondary);
            background: rgba(255, 255, 255, 0.5);
            outline: none;
            flex: 1;
            min-width: 150px;
            max-width: 400px;
            transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .dashboard-description-input:hover { background: rgba(255, 255, 255, 0.8); }
        .dashboard-description-input:focus {
            background: var(--mj-bg-surface-card);
            border-color: var(--mj-brand-primary);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
        }
        .dashboard-description-input::placeholder {
            color: var(--mj-text-muted);
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
            color: var(--mj-text-secondary);
        }
        .error-icon {
            font-size: 64px;
            color: var(--mj-status-error);
            margin-bottom: 24px;
            opacity: 0.8;
        }
        .error-title {
            font-size: 24px;
            font-weight: 500;
            margin: 0 0 12px 0;
            color: var(--mj-text-primary);
        }
        .error-message {
            font-size: 16px;
            color: var(--mj-text-muted);
            margin: 0 0 24px 0;
            max-width: 500px;
            line-height: 1.5;
        }
        .error-details {
            background: var(--mj-bg-surface-sunken);
            border-radius: 8px;
            padding: 12px 16px;
            max-width: 600px;
            text-align: left;
            font-size: 13px;
        }
        .error-details summary {
            cursor: pointer;
            font-weight: 500;
            color: var(--mj-text-muted);
            margin-bottom: 8px;
        }
        .error-details pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--mj-status-error-text);
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
    private recentAccess = inject(RecentAccessService);
    private favoritesService = inject(DashboardFavoritesService);
    private homeTabsService = inject(HomeDashboardTabsService);
    private homePins = inject(HomeAppPinService);

    /** True while a Home tab change is running. Further Home tab clicks wait until it ends. */
    private homeTabBusy = false;

    /** The panels last reported to the agent, as JSON. Null until the open dashboard is first reported. */
    private reportedPanelsKey: string | null = null;

    /** True once the tab follows saved dashboard changes and edit-mode requests (see watchForChanges). */
    private watchingForChanges = false;

    /**
     * A cache reattach moves this wrapper to another tab without recreating the dashboard inside it.
     * A child resource component (a Code dashboard, the Data Explorer) has its own tab stamp, taken
     * when we created it, and it has to move too. Without this the dashboard keeps reading and
     * writing the params of the tab it was born in, from inside a tab it no longer belongs to. The
     * Config viewer has no tab of its own. The new tab can hold an edit-mode request (a card's Edit
     * action reopens a closed tab this way), so the tab takes it here, where no load will.
     */
    protected override onTabIdRebound(tabId: string): void {
        const child = this.componentRef?.instance;
        if (child instanceof BaseResourceComponent) {
            this.rehomeChildToTab(child, tabId);
        }
        this.takeEditModeRequest(tabId);
    }
    private dataLoaded = false;
    @ViewChild('container', { static: true }) ContainerElement!: ElementRef<HTMLDivElement>;

    /** @deprecated Use {@link ContainerElement}. */
    get containerElement(): ElementRef<HTMLDivElement> {
      return this.ContainerElement;
    }
    /** @deprecated Use {@link ContainerElement}. */
    set containerElement(value: ElementRef<HTMLDivElement>) {
      this.ContainerElement = value;
    }

    /** Error message to display when dashboard fails to load */
    public errorMessage: string | null = null;
    /** Technical error details (shown in expandable section) */
    public ErrorDetails: string | null = null;

    /** @deprecated Use {@link ErrorDetails}. */
    public get errorDetails(): string | null {
      return this.ErrorDetails;
    }
    /** @deprecated Use {@link ErrorDetails}. */
    public set errorDetails(value: string | null) {
      this.ErrorDetails = value;
    }

    /** Cached dashboard categories for breadcrumb navigation */
    private categories: MJDashboardCategoryEntity[] = [];

    /** Reference to the dashboard viewer component (for config-based dashboards) */
    private viewerInstance: DashboardViewerComponent | null = null;

    /** The config-based dashboard entity (null for code-based dashboards) */
    public ConfigDashboard: MJDashboardEntity | null = null;

    /** @deprecated Use {@link ConfigDashboard}. */
    public get configDashboard(): MJDashboardEntity | null {
      return this.ConfigDashboard;
    }
    /** @deprecated Use {@link ConfigDashboard}. */
    public set configDashboard(value: MJDashboardEntity | null) {
      this.ConfigDashboard = value;
    }

    /** Whether we're in edit mode */
    public IsEditMode = false;

    /** @deprecated Use {@link IsEditMode}. */
    public get isEditMode() {
      return this.IsEditMode;
    }
    /** @deprecated Use {@link IsEditMode}. */
    public set isEditMode(value) {
      this.IsEditMode = value;
    }

    /**
     * True while a Save runs (the screenshot, then the save). Meanwhile Save, Cancel, Add Part and
     * part edits do nothing, and the edit header shows it.
     */
    public IsSaving = false;

    /** Editing fields */
    public EditingName = '';

    /** @deprecated Use {@link EditingName}. */
    public get editingName() {
      return this.EditingName;
    }
    /** @deprecated Use {@link EditingName}. */
    public set editingName(value) {
      this.EditingName = value;
    }
    public EditingDescription = '';

    /** @deprecated Use {@link EditingDescription}. */
    public get editingDescription() {
      return this.EditingDescription;
    }
    /** @deprecated Use {@link EditingDescription}. */
    public set editingDescription(value) {
      this.EditingDescription = value;
    }

    /** Current user's permissions for this dashboard */
    public DashboardPermissions: DashboardUserPermissions = {
        DashboardID: '',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner'
    };

    /** @deprecated Use {@link DashboardPermissions}. */
    public get dashboardPermissions(): DashboardUserPermissions {
      return this.DashboardPermissions;
    }
    /** @deprecated Use {@link DashboardPermissions}. */
    public set dashboardPermissions(value: DashboardUserPermissions) {
      this.DashboardPermissions = value;
    }

    /** Whether the share dialog is visible */
    public ShowShareDialog = false;

    /** @deprecated Use {@link ShowShareDialog}. */
    public get showShareDialog() {
      return this.ShowShareDialog;
    }
    /** @deprecated Use {@link ShowShareDialog}. */
    public set showShareDialog(value) {
      this.ShowShareDialog = value;
    }

    /** Whether the Add Part dialog is open */
    public ShowAddPartDialog = false;

    /** Whether the Edit Part dialog is open */
    public ShowEditPartDialog = false;
    /** The part the Edit Part dialog edits */
    public EditPartPanel: DashboardPanel | null = null;
    /** The part type of the part the Edit Part dialog edits */
    public EditPartType: MJDashboardPartTypeEntity | null = null;

    /** Whether the Remove Part confirmation is open */
    public ShowRemovePartDialog = false;
    /** The title of the part the Remove Part confirmation asks about */
    public RemovePartTitle = '';
    /** The ID of the part the Remove Part confirmation asks about */
    private removePartId = '';

    /** The part types the Add Part dialog offers: the open viewer's part types. */
    public get PartTypes(): MJDashboardPartTypeEntity[] {
        return this.viewerInstance?.GetPartTypes() ?? NO_PART_TYPES;
    }

    /** The question the Remove Part confirmation asks. */
    public get RemovePartMessage(): string {
        return `Are you sure you want to remove '${this.RemovePartTitle}' from this dashboard?`;
    }

    /** True when the open Config dashboard is one of the user's favorites. */
    public get IsFavorite(): boolean {
        return this.readPlacement(this.ConfigDashboard?.ID, id => this.favoritesService.IsFavorite(id));
    }

    /** True when the open Config dashboard is one of the user's Home tabs. */
    public get IsHomeTab(): boolean {
        return this.readPlacement(this.ConfigDashboard?.ID, id => this.homeTabsService.HasTab(id));
    }

    /** True when the open Config dashboard is pinned to Home. */
    public get IsPinnedToHome(): boolean {
        return this.readPlacement(this.ConfigDashboard?.ID, id => this.homePins.IsPinned(DASHBOARD_PIN_RESOURCE_TYPE, { dashboardId: id }));
    }

    /**
     * Sets the error state with a user-friendly message and optional technical details
     */
    private setError(message: string, error?: unknown): void {
        this.errorMessage = message;
        if (error instanceof Error) {
            this.ErrorDetails = error.message;
            if (error.stack) {
                this.ErrorDetails += '\n\nStack trace:\n' + error.stack;
            }
        } else if (error) {
            this.ErrorDetails = String(error);
        }
    }

    /**
     * Clears any previous error state
     */
    private clearError(): void {
        this.errorMessage = null;
        this.ErrorDetails = null;
    }

    constructor(
        private viewContainer: ViewContainerRef,
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    override set Data(value: ResourceData) {
        const previousRecordId = super.Data?.ResourceRecordID;
        super.Data = value;

        const newRecordId = value?.ResourceRecordID;

        // Load on first set, or when the dashboard has changed
        if (!this.dataLoaded || newRecordId !== previousRecordId) {
            this.dataLoaded = true;
            // Destroy previous component before loading new one
            if (this.componentRef) {
                this.componentRef.destroy();
                this.componentRef = null;
            }
            this.clearError();
            this.ConfigDashboard = null;
            this.viewerInstance = null;
            this.loadDashboard();
        }
    }

    // Need to override the getter too in TS otherwise the override to the setter alone above would break things
    override get Data(): ResourceData {
        return super.Data;
    }

    ngOnDestroy(): void {
        super.ngOnDestroy();
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
    public ToggleEditMode(): void {
        if (this.IsEditMode) {
            this.CancelEdit();
        } else {
            this.enterEditMode();
        }
    }

    /** @deprecated Use {@link ToggleEditMode}. */
    public toggleEditMode(): void {
      return this.ToggleEditMode();
    }

    /**
     * Enter edit mode. Only a user who can edit the dashboard enters it.
     */
    private enterEditMode(): void {
        if (!this.startEditing()) return;

        this.cdr.detectChanges();
        this.emitAgentContext();
    }

    /**
     * Puts the tab and its viewer in edit mode. Returns false, and changes nothing, when no Config
     * dashboard is open or the user cannot edit it. The tab first takes DashboardEngine's current
     * copy of the dashboard; when the dashboard was saved elsewhere since the viewer loaded it, the
     * viewer reloads the saved layout, so this tab's next save keeps those changes.
     */
    private startEditing(): boolean {
        if (!this.ConfigDashboard || !this.DashboardPermissions.CanEdit) return false;

        this.syncWithSavedDashboard();
        this.IsEditMode = true;
        this.EditingName = this.ConfigDashboard.Name;
        this.EditingDescription = this.ConfigDashboard.Description || '';

        // Tell the viewer to enter edit mode
        if (this.viewerInstance) {
            this.viewerInstance.IsEditing = true;
        }
        return true;
    }

    /**
     * Starts in edit mode when the tab was opened with `openInEditMode` (a new dashboard, or a card's
     * Edit action) and the user can edit the dashboard. NavigationService removes the request when
     * the tab takes it, so a later load of the tab opens for viewing.
     */
    private applyEditModeRequest(): void {
        const dashboard = this.ConfigDashboard;
        if (dashboard && this.navigationService.TakeDashboardEditModeRequest(this.getTabId(), dashboard.ID, this.tabApplicationId())) {
            this.startEditing();
        }
    }

    /**
     * Takes the tab's edit-mode request, if it has one for this tab's dashboard, and enters edit mode.
     * A tab that has not finished loading leaves the request for its load (see applyEditModeRequest).
     * A tab that is already editing keeps its changes. A request for what the tab shows now stays for
     * that tab's component: a cached component can still be bound to a tab ID that OpenTab gave to
     * another dashboard, or to this dashboard in another application.
     */
    private takeEditModeRequest(tabId: string): void {
        const dashboard = this.ConfigDashboard;
        if (!this.LoadComplete || !dashboard) return;
        if (this.navigationService.TakeDashboardEditModeRequest(tabId, dashboard.ID, this.tabApplicationId()) && !this.IsEditMode) {
            this.enterEditMode();
        }
    }

    /** The application of the tab this component was loaded for, from the resource data the tab container gives it. */
    private tabApplicationId(): string {
        const applicationId = this.Data?.Configuration?.['applicationId'];
        return typeof applicationId === 'string' ? applicationId : '';
    }

    /**
     * Cancel edit mode and discard changes: the viewer shows the saved dashboard again, without the
     * parts and layout changes made since the last save.
     */
    public CancelEdit(): void {
        if (this.IsSaving) return;
        this.IsEditMode = false;
        this.closePartDialogs();

        // Reload before the viewer leaves edit mode: the viewer drops its layout at once, so leaving
        // edit mode applies to the saved layout it rebuilds.
        this.reloadSavedDashboard();
        if (this.viewerInstance) {
            this.viewerInstance.IsEditing = false;
        }

        this.cdr.detectChanges();
        this.emitAgentContext();
    }

    /** @deprecated Use {@link CancelEdit}. */
    public cancelEdit(): void {
      return this.CancelEdit();
    }

    // ========================================
    // Saved Dashboard Changes
    // ========================================

    /**
     * Starts, once per tab, to follow saves of the open dashboard made elsewhere and edit-mode
     * requests for this tab. Both stop when the tab is destroyed.
     */
    private watchForChanges(): void {
        if (this.watchingForChanges) return;
        this.watchingForChanges = true;
        this.watchSavedDashboard();
        this.watchEditModeRequests();
    }

    /**
     * Reloads the viewer when DashboardEngine reports a change to the open dashboard and the tab is
     * not editing, so the tab shows the saved dashboard. A burst of changes reloads once, after the
     * current task. The reload reports nothing to the agent.
     */
    private watchSavedDashboard(): void {
        DashboardEngine.Instance.DataChange$.pipe(
            filter(event => this.isChangeToOpenDashboard(event)),
            auditTime(0),
            takeUntil(this.destroy$)
        ).subscribe(() => this.onSavedDashboardChanged());
    }

    /** Enters edit mode when OpenDashboard asks this open tab to (NavigationService.DashboardEditModeRequested$). */
    private watchEditModeRequests(): void {
        this.navigationService.DashboardEditModeRequested$.pipe(
            filter(tabId => UUIDsEqual(tabId, this.getTabId())),
            takeUntil(this.destroy$)
        ).subscribe(tabId => this.takeEditModeRequest(tabId));
    }

    /** True for a change to the open dashboard's record, or for a reload of all dashboards. */
    private isChangeToOpenDashboard(event: EngineDataChangeEvent): boolean {
        const open = this.ConfigDashboard;
        if (!open || event.config.EntityName?.trim().toLowerCase() !== DASHBOARDS_ENTITY_NAME.toLowerCase()) {
            return false;
        }
        const affected = event.affectedEntity;
        return !affected || affected === open || affected.PrimaryKey.Equals(open.PrimaryKey);
    }

    /** Brings the tab in step with the saved dashboard after a change to it, unless the tab is editing. */
    private onSavedDashboardChanged(): void {
        if (this.IsEditMode) return;
        const sync = this.syncWithSavedDashboard();
        if (sync === 'unchanged') return;
        if (sync === 'reloaded') {
            this.treatPanelsAsReported();
        }
        SafeDetectChanges(this.cdr);
    }

    /**
     * Brings the open dashboard in step with DashboardEngine's current copy of it. The viewer
     * rebuilds only when the saved layout differs from the one it shows. When only the copy is new
     * (DashboardEngine reloaded its dashboards), the tab and the viewer take it without a rebuild:
     * a save writes every field of the entity, so saving an old copy would write its old values.
     */
    private syncWithSavedDashboard(): SavedDashboardSync {
        const viewer = this.viewerInstance;
        const saved = this.savedDashboard();
        if (!viewer || !saved) return 'unchanged';
        if (viewer.HasNewerSavedLayout(saved)) {
            this.reloadSavedDashboard();
            return 'reloaded';
        }
        if (saved !== this.ConfigDashboard && viewer.UseSavedCopy(saved)) {
            this.ConfigDashboard = saved;
            return 'took-copy';
        }
        return 'unchanged';
    }

    /** Shows the saved dashboard in the viewer: DashboardEngine's copy of it when the engine has one. */
    private reloadSavedDashboard(): void {
        const viewer = this.viewerInstance;
        const saved = this.savedDashboard() ?? this.ConfigDashboard;
        if (!viewer || !saved) return;

        this.ConfigDashboard = saved;
        viewer.ReloadFromSaved(saved).catch((error: unknown) => {
            LogError(`Dashboard tab: could not reload the saved dashboard: ${errorMessage(error)}`);
        });
    }

    /** The open dashboard as DashboardEngine holds it now. Null when the engine does not have it. */
    private savedDashboard(): MJDashboardEntity | null {
        const open = this.ConfigDashboard;
        if (!open) return null;
        try {
            return DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, open.ID)) ?? null;
        } catch {
            return null; // the user cannot read the dashboards cache
        }
    }

    /**
     * Takes the viewer's current panels as the ones last reported to the agent, so the change events
     * of a reloaded layout report nothing. Does nothing before the first report.
     */
    private treatPanelsAsReported(): void {
        if (this.reportedPanelsKey !== null) {
            this.reportedPanelsKey = JSON.stringify(this.livePanels());
        }
    }

    /**
     * Saves the name, description and layout, then leaves edit mode. An empty name is never saved:
     * the previous name is kept. When the save fails, the tab stays in edit mode (see onSaveFailed).
     * One Save runs at a time (see IsSaving).
     */
    public async SaveDashboard(): Promise<void> {
        const dashboard = this.ConfigDashboard;
        const viewer = this.viewerInstance;
        if (!dashboard || !viewer || this.IsSaving) return;
        this.IsSaving = true;
        SafeDetectChanges(this.cdr);

        try {
            // Puts a screenshot of the layout on the dashboard (Thumbnail), so this same Save stores
            // the picture the dashboard cards show. A failed Save reverts it with the other fields.
            await this.captureDashboardThumbnail(dashboard, viewer);

            // The name and description are read after the screenshot, so edits made meanwhile count.
            this.restoreEmptyName();
            dashboard.Name = this.EditingName;
            dashboard.Description = this.EditingDescription;

            // Save via the viewer (which handles layout saving)
            if (!await viewer.save()) {
                this.onSaveFailed(dashboard);
                return;
            }

            // Exit edit mode
            this.IsEditMode = false;
            this.closePartDialogs();
            viewer.IsEditing = false;

            this.cdr.detectChanges();
            this.emitAgentContext();
        } catch (error) {
            this.onSaveFailed(dashboard, error);
        } finally {
            this.IsSaving = false;
            SafeDetectChanges(this.cdr);
        }
    }

    /** @deprecated Use {@link SaveDashboard}. */
    public async saveDashboard(): Promise<void> {
      return this.SaveDashboard();
    }

    /**
     * Sets the dashboard's Thumbnail to a small screenshot of the dashboard's layout, or to null
     * when the layout has no panels, so the dashboard cards show the icon. Keeps the current
     * Thumbnail when no screenshot is ready in time (too many elements, no size, or the timeout).
     * Never throws.
     */
    private async captureDashboardThumbnail(dashboard: MJDashboardEntity, viewer: DashboardViewerComponent): Promise<void> {
        try {
            if (ExtractPanelsFromLayout(viewer.getConfig()?.layout ?? null).length === 0) {
                dashboard.Thumbnail = null;
                return;
            }
            const thumbnail = await this.homePins.CaptureThumbnail(this.ContainerElement.nativeElement, SAVE_SCREENSHOT_TIMEOUT_MS);
            if (thumbnail) {
                dashboard.Thumbnail = thumbnail;
            }
        } catch (error) {
            LogError(`Dashboard tab: could not take a screenshot of the dashboard: ${errorMessage(error)}`);
        }
    }

    /** Keeps the previous name when the user leaves the name field empty or with only spaces. */
    public OnNameBlur(): void {
        this.restoreEmptyName();
    }

    /** Puts the saved name back into an empty or spaces-only name field. */
    private restoreEmptyName(): void {
        if (!this.EditingName.trim()) {
            this.EditingName = this.ConfigDashboard?.Name || 'Untitled Dashboard';
        }
    }

    /**
     * Handles a save that did not complete. The tab stays in edit mode with the user's changes, the
     * cached dashboard (which other pages read) goes back to its saved values, and the user sees why.
     */
    private onSaveFailed(dashboard: MJDashboardEntity, error?: unknown): void {
        const reason = this.saveFailureReason(dashboard, error);
        dashboard.Revert();
        LogError(`Dashboard tab: could not save the dashboard: ${reason || 'no reason given'}`);
        MJNotificationService.Instance.CreateSimpleNotification(reason ? `Could not save the dashboard: ${reason}` : 'Could not save the dashboard', 'error', 5000);
        SafeDetectChanges(this.cdr);
    }

    /** Why a save failed: the thrown error, else the dashboard's failed save result. Empty when neither says. */
    private saveFailureReason(dashboard: MJDashboardEntity, error: unknown): string {
        if (error !== undefined) return errorMessage(error);
        const latest = dashboard.LatestResult;
        return latest && !latest.Success ? latest.CompleteMessage : '';
    }

    // ========================================
    // Part Editing (edit mode only)
    // ========================================

    /** Opens the Add Part dialog. Does nothing outside edit mode or while a Save runs. */
    public OpenAddPartDialog(): void {
        if (!this.IsEditMode || this.IsSaving) return;
        this.ShowAddPartDialog = true;
        SafeDetectChanges(this.cdr);
    }

    /** @deprecated Use {@link OpenAddPartDialog}. */
    public openAddPartDialog(): void {
      return this.OpenAddPartDialog();
    }

    /** Closes the Add Part dialog and adds the part the user set up in it to the viewer. */
    public async OnPartAdded(result: AddPanelResult): Promise<void> {
        this.ShowAddPartDialog = false;
        SafeDetectChanges(this.cdr);
        await this.applyPartChange('Could not add the part', viewer => viewer.AddPanel(result.PartType.ID, result.Config, result.Title, result.Icon));
    }

    /** Closes the Add Part dialog without adding a part. */
    public OnAddPartCancelled(): void {
        this.ShowAddPartDialog = false;
        SafeDetectChanges(this.cdr);
    }

    /** Closes the Edit Part dialog and applies the settings the user saved in it to the part. */
    public async OnEditPartSaved(result: EditPartDialogResult): Promise<void> {
        const panel = this.EditPartPanel;
        this.closeEditPartDialog();
        SafeDetectChanges(this.cdr);
        if (panel) {
            await this.applyPartChange('Could not update the part', viewer => viewer.UpdatePanelConfig(panel.id, result.Config, result.Title, result.Icon));
        }
    }

    /** Closes the Edit Part dialog without changing the part. */
    public OnEditPartCancelled(): void {
        this.closeEditPartDialog();
        SafeDetectChanges(this.cdr);
    }

    /** Closes the Remove Part confirmation and removes the part from the viewer. */
    public async OnRemovePartConfirmed(): Promise<void> {
        const panelId = this.removePartId;
        this.closeRemovePartDialog();
        SafeDetectChanges(this.cdr);
        if (panelId) {
            await this.applyPartChange('Could not remove the part', viewer => viewer.ConfirmRemovePanel(panelId));
        }
    }

    /** Closes the Remove Part confirmation and keeps the part. */
    public OnRemovePartCancelled(): void {
        this.closeRemovePartDialog();
        SafeDetectChanges(this.cdr);
    }

    /**
     * Opens the dialog for a part request from the viewer: Add Part (its empty state), and a part's
     * Configure and Remove buttons. Ignores requests outside edit mode and while a Save runs.
     */
    private onPanelInteraction(event: PanelInteractionEvent): void {
        if (event.interactionType !== 'custom' || !this.IsEditMode || this.IsSaving) return;
        switch (event.payload?.['action']) {
            case 'add-panel-requested':
                this.OpenAddPartDialog();
                break;
            case 'configure-part-requested':
                this.openEditPartDialog(event.panelId);
                break;
            case 'remove-part-requested':
                this.openRemovePartDialog(event.panelId, event.payload['panelTitle']);
                break;
        }
    }

    /** Opens the Edit Part dialog for a part of the viewer. Does nothing when the viewer cannot find the part or its type. */
    private openEditPartDialog(panelId: string): void {
        const panel = this.viewerInstance?.GetPanel(panelId) ?? null;
        const partType = this.viewerInstance?.GetPartTypeForPanel(panelId) ?? null;
        if (!panel || !partType) {
            LogError(`Dashboard tab: cannot configure part ${panelId}: the viewer has no such part or part type`);
            return;
        }
        this.EditPartPanel = panel;
        this.EditPartType = partType;
        this.ShowEditPartDialog = true;
        SafeDetectChanges(this.cdr);
    }

    private closeEditPartDialog(): void {
        this.ShowEditPartDialog = false;
        this.EditPartPanel = null;
        this.EditPartType = null;
    }

    /** Opens the Remove Part confirmation for a part. A part without a title is called "this part". */
    private openRemovePartDialog(panelId: string, panelTitle: unknown): void {
        this.removePartId = panelId;
        this.RemovePartTitle = typeof panelTitle === 'string' && panelTitle ? panelTitle : 'this part';
        this.ShowRemovePartDialog = true;
        SafeDetectChanges(this.cdr);
    }

    private closeRemovePartDialog(): void {
        this.ShowRemovePartDialog = false;
        this.removePartId = '';
        this.RemovePartTitle = '';
    }

    /** Closes every part dialog. A part dialog belongs to one edit session. */
    private closePartDialogs(): void {
        this.ShowAddPartDialog = false;
        this.closeEditPartDialog();
        this.closeRemovePartDialog();
    }

    /**
     * Applies one part change to the viewer, tells the user when it fails, and reports the
     * dashboard's parts to the agent again. The change is saved with the dashboard's Save. Does
     * nothing while a Save runs, for example from a dialog that was open when Save was clicked.
     */
    private async applyPartChange(failureMessage: string, change: (viewer: DashboardViewerComponent) => void | Promise<void>): Promise<void> {
        const viewer = this.viewerInstance;
        if (!viewer || this.IsSaving) return;
        try {
            await change(viewer);
        } catch (error) {
            LogError(`Dashboard tab: ${failureMessage}: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification(failureMessage, 'error', 3000);
        }
        this.onViewerConfigChanged();
    }

    /**
     * Open the share dialog for this dashboard
     */
    public OpenShareDialog(): void {
        this.ShowShareDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenShareDialog}. */
    public openShareDialog(): void {
      return this.OpenShareDialog();
    }

    /**
     * Close the share dialog
     */
    public CloseShareDialog(): void {
        this.ShowShareDialog = false;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link CloseShareDialog}. */
    public closeShareDialog(): void {
      return this.CloseShareDialog();
    }

    /**
     * Handle share dialog result
     */
    public OnShareDialogResult(result: ShareDialogResult): void {
        this.ShowShareDialog = false;

        if (result.Action === 'save' && this.ConfigDashboard) {
            // Recompute permissions after sharing changes
            const md = this.ProviderToUse;
            this.DashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                this.ConfigDashboard.ID,
                md.CurrentUser.ID
            );
        }

        this.cdr.detectChanges();
        if (result.Action === 'save') {
            this.emitAgentContext();
        }
    }

    // ========================================
    // Favorite and Add to menu
    // ========================================

    /** Stars or unstars the open dashboard and tells the user the new state. */
    public async ToggleFavorite(): Promise<void> {
        const dashboard = this.ConfigDashboard;
        if (!dashboard) return;
        try {
            const isFavorite = await this.favoritesService.Toggle(dashboard.ID);
            const message = isFavorite ? `Added "${dashboard.Name}" to favorites` : `Removed "${dashboard.Name}" from favorites`;
            MJNotificationService.Instance.CreateSimpleNotification(message, 'success', 2000);
        } catch (error) {
            LogError(`Dashboard tab: could not change the favorite: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification('Could not change the favorite', 'error', 3000);
        }
        this.onPlacementChanged();
    }

    /**
     * Adds the open dashboard to the user's Home tabs, or removes it when it is already there.
     * The message comes from the Home tabs read back after the write. Clicks while a change runs do nothing.
     */
    public async ToggleHomeTab(): Promise<void> {
        const dashboard = this.ConfigDashboard;
        if (!dashboard || this.homeTabBusy) return;
        this.homeTabBusy = true;
        const adding = !this.hasHomeTab(dashboard.ID);
        try {
            await (adding ? this.homeTabsService.Add(dashboard.ID) : this.homeTabsService.Remove(dashboard.ID));
            this.notifyHomeTabResult(dashboard, adding);
        } catch (error) {
            LogError(`Dashboard tab: could not ${adding ? 'add' : 'remove'} the Home tab: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification(adding ? 'Could not add the Home tab' : 'Could not remove the Home tab', 'error', 3000);
        } finally {
            this.homeTabBusy = false;
        }
        this.onPlacementChanged();
    }

    /** Pins the open dashboard to Home as a card, then adds a thumbnail of it in the background. */
    public async PinToHome(): Promise<void> {
        const dashboard = this.ConfigDashboard;
        if (!dashboard) return;
        try {
            await this.homePins.LoadPins();
            if (this.homePins.AddPin(this.homePinFor(dashboard))) {
                MJNotificationService.Instance.CreateSimpleNotification(`Pinned "${dashboard.Name}" to Home`, 'success', 2000);
                void this.attachPinThumbnail(dashboard.ID);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(`"${dashboard.Name}" is already pinned to Home`, 'info', 2000);
            }
        } catch (error) {
            LogError(`Dashboard tab: could not pin the dashboard to Home: ${errorMessage(error)}`);
            MJNotificationService.Instance.CreateSimpleNotification('Could not pin the dashboard to Home', 'error', 3000);
        }
        this.onPlacementChanged();
    }

    /** Tells the user whether the Home tab change took effect. */
    private notifyHomeTabResult(dashboard: MJDashboardEntity, adding: boolean): void {
        const notifications = MJNotificationService.Instance;
        if (this.hasHomeTab(dashboard.ID) === adding) {
            const message = adding ? `"${dashboard.Name}" is now a tab on Home` : `Removed "${dashboard.Name}" from your Home tabs`;
            notifications.CreateSimpleNotification(message, 'success', 2000);
        } else {
            const message = adding ? `Could not add "${dashboard.Name}" as a Home tab` : `Could not remove "${dashboard.Name}" from your Home tabs`;
            notifications.CreateSimpleNotification(message, 'warning', 3000);
        }
    }

    private hasHomeTab(dashboardId: string): boolean {
        return this.readPlacement(dashboardId, id => this.homeTabsService.HasTab(id));
    }

    /**
     * Reads one placement flag (favorite, Home tab, pin) for a dashboard. False without a dashboard,
     * or when the user cannot read that data (the engine throws PermissionConstrainedError).
     */
    private readPlacement(dashboardId: string | undefined, read: (dashboardId: string) => boolean): boolean {
        if (!dashboardId) return false;
        try {
            return read(dashboardId);
        } catch {
            return false;
        }
    }

    /** The Home pin for a dashboard. A click on the pin opens the dashboard in the preview tab; a Shift-click opens a separate tab. */
    private homePinFor(dashboard: MJDashboardEntity): HomeAppPinInput {
        return {
            DisplayName: dashboard.Name,
            ResourceType: DASHBOARD_PIN_RESOURCE_TYPE,
            Icon: 'fa-solid fa-gauge-high',
            Configuration: { resourceType: DASHBOARD_PIN_RESOURCE_TYPE, dashboardId: dashboard.ID, recordId: dashboard.ID },
        };
    }

    /**
     * Adds a thumbnail of the dashboard to its pin. Best effort: without one, Home shows the pin's icon.
     * Logs a failure and never rejects, because the caller does not wait for it.
     */
    private async attachPinThumbnail(dashboardId: string): Promise<void> {
        try {
            const element = this.ContainerElement?.nativeElement;
            const thumbnail = element ? await this.homePins.CaptureThumbnail(element) : undefined;
            const pin = thumbnail ? this.homePins.FindPin(DASHBOARD_PIN_RESOURCE_TYPE, { dashboardId }) : undefined;
            if (pin && thumbnail) {
                this.homePins.UpdatePin(pin.Id, { Thumbnail: thumbnail });
            }
        } catch (error) {
            LogError(`Dashboard tab: could not add a thumbnail to the Home pin: ${errorMessage(error)}`);
        }
    }

    /** Loads the user's Home pins, so the Add to menu can show whether this dashboard is pinned. */
    private async loadHomePins(): Promise<void> {
        try {
            await this.homePins.LoadPins();
        } catch (error) {
            LogError(`Dashboard tab: could not load the Home pins: ${errorMessage(error)}`);
        }
    }

    /** Updates the toolbar and reports the new placement to the agent. */
    private onPlacementChanged(): void {
        SafeDetectChanges(this.cdr);
        this.emitAgentContext();
    }

    // ========================================
    // Agent Context & Client Tools
    //
    // 🔒 SAFETY BOUNDARY: a Config dashboard tab gives the AI agent ONLY the read-only tools built
    // in dashboard-tab-agent.ts: GetDashboardPanels and GetDashboardDetail. Editing, saving,
    // sharing, favoriting, pinning and Home tab changes are intentionally NOT exposed; the user
    // does them from the toolbar. Do NOT add a mutating tool without revisiting this boundary.
    // A Code dashboard is its own resource component and reports its own context and tools, so
    // this tab reports nothing for it.
    // ========================================

    /** Registers the read-only tools and reports the open Config dashboard to the agent. */
    private publishAgentState(): void {
        this.navigationService.SetAgentClientTools(this, BuildDashboardTabAgentTools(this.agentHost()));
        this.emitAgentContext();
    }

    /** Reports the open Config dashboard to the agent. Does nothing while none is open. */
    private emitAgentContext(): void {
        const dashboard = this.ConfigDashboard;
        if (!dashboard) return;
        const panels = this.livePanels();
        this.reportedPanelsKey = JSON.stringify(panels);
        this.navigationService.SetAgentContext(this, BuildDashboardTabAgentContext({
            Dashboard: dashboard,
            IsEditing: this.IsEditMode,
            CanEdit: this.DashboardPermissions.CanEdit,
            Panels: panels,
            IsFavorite: this.IsFavorite,
            IsHomeTab: this.IsHomeTab,
            IsPinnedToHome: this.IsPinnedToHome,
        }));
    }

    /** Reports the dashboard again when its panels change. A layout move or resize reports nothing. */
    private onViewerConfigChanged(): void {
        if (this.reportedPanelsKey !== null && JSON.stringify(this.livePanels()) !== this.reportedPanelsKey) {
            this.emitAgentContext();
        }
    }

    /** The reads the agent tools make from this tab. */
    private agentHost(): DashboardTabAgentHost {
        return {
            CurrentDashboard: () => this.ConfigDashboard,
            AccessibleDashboards: () => DashboardEngine.Instance.GetAccessibleDashboards(this.ProviderToUse.CurrentUser.ID),
            Panels: dashboard => this.isOpenDashboard(dashboard) ? this.livePanels() : this.savedPanels(dashboard),
            Permissions: dashboardId => DashboardEngine.Instance.GetDashboardPermissions(dashboardId, this.ProviderToUse.CurrentUser.ID),
        };
    }

    private isOpenDashboard(dashboard: DashboardTabDashboard): boolean {
        return !!this.ConfigDashboard && UUIDsEqual(dashboard.ID, this.ConfigDashboard.ID);
    }

    /**
     * The open dashboard's panels, read from the viewer's live layout, so unsaved edits count.
     * Empty while the viewer is not ready. Best effort: a failed read never stops the context report.
     */
    private livePanels(): DashboardPanelSummary[] {
        const viewer = this.viewerInstance;
        if (!viewer) return [];
        try {
            return SummarizeDashboardPanels(ExtractPanelsFromLayout(viewer.getConfig()?.layout ?? null), viewer.GetPartTypes());
        } catch {
            return [];
        }
    }

    /** The panels saved in a dashboard's layout. Empty when the layout or the part types cannot be read. */
    private savedPanels(dashboard: DashboardTabDashboard): DashboardPanelSummary[] {
        try {
            const config = SafeJSONParse<Pick<DashboardLayoutConfig, 'layout'>>(dashboard.UIConfigDetails);
            return SummarizeDashboardPanels(ExtractPanelsFromLayout(config?.layout ?? null), DashboardEngine.Instance.DashboardPartTypes);
        } catch {
            return [];
        }
    }

    /** @deprecated Use {@link OnShareDialogResult}. */
    public onShareDialogResult(result: ShareDialogResult): void {
      return this.OnShareDialogResult(result);
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

            if (this.isDataExplorer(data)) {
                // Special case: Data Explorer dashboard with optional entity filter
                await this.loadDataExplorer(
                    config['entityFilter'],
                    config['appName'] as string | undefined,
                    config['appIcon'] as string | undefined
                );
                return;
            }

            await DashboardEngine.Instance.Config(false); // make sure it is configured, if already configured does nothing
            const dashboard = DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, data.ResourceRecordID));
            if (!dashboard) {
                throw new Error(`Dashboard with ID ${data.ResourceRecordID} not found.`);
            }

            void this.recentAccess.LogAccess('MJ: Dashboards', dashboard.ID, 'dashboard');

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
            // Lazy-load the Data Explorer component to keep it out of the initial bundle
            const { DataExplorerDashboardComponent } = await import('@memberjunction/ng-dashboards/data-explorer-dashboards.module');
            this.ContainerElement.nativeElement.innerHTML = '';
            const componentRef = this.viewContainer.createComponent(DataExplorerDashboardComponent);
            this.componentRef = componentRef;
            const instance = componentRef.instance;

            // Scope the child's query-param reads/writes to THIS tab. A dashboard we instantiate
            // ourselves has no ResourceData and therefore no tab id of its own; without this it
            // cannot update the URL at all (BaseResourceComponent refuses tab-less writes rather
            // than corrupting whichever tab the user is viewing). Set before any await below —
            // Angular can run the child's ngOnInit, which binds its param subscription, while we
            // are suspended.
            instance.ParentTabId = this.getTabId();

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
            this.ContainerElement.nativeElement.appendChild(nativeElement);

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

            // Surface the dashboard's own load failures — but only for the INITIAL load. Wrap the
            // completion hook to learn when the first load has settled, so a later Refresh() that
            // fails does NOT replace an already-rendered Data Explorer with a sticky error card.
            let initialLoadSettled = false;
            const onComplete = instance.LoadCompleteEvent;
            instance.LoadCompleteEvent = () => { initialLoadSettled = true; onComplete?.(); };
            instance.Error.subscribe((err: Error) => {
                if (initialLoadSettled) return; // post-mount refresh failure — already logged by BaseDashboard.runGuardedLoad
                this.setError('The Data Explorer could not be loaded.', err);
                this.cdr.markForCheck();
            });

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

            // Look up the registered class using the DriverClass name (with lazy loading fallback via ClassFactory)
            const classReg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
                BaseDashboard,
                dashboard.DriverClass
            );

            if (!classReg?.SubClass) {
                throw new Error(`Dashboard class '${dashboard.DriverClass}' is not registered. Please check the class registration.`);
            }

            // Create the component instance
            this.ContainerElement.nativeElement.innerHTML = '';
            this.componentRef = this.viewContainer.createComponent<BaseDashboard>(classReg.SubClass);
            const instance = this.componentRef.instance as BaseDashboard;

            // Scope the child's query-param reads/writes to THIS tab. Code dashboards resolved via
            // ClassFactory (every Open App dashboard, MCPDashboard, DataExplorer) get no
            // ResourceData and so have no tab id of their own; without this their UpdateQueryParams
            // calls are refused (and previously — worse — landed in whatever tab the user happened
            // to be looking at). Set before the awaits below: Angular can run the child's ngOnInit,
            // which binds its param subscription, while we are suspended.
            instance.ParentTabId = this.getTabId();

            // Setup LoadCompleteEvent() to know when the dashboard is ready
            instance.LoadCompleteEvent = () => {
                this.NotifyLoadComplete();
            };

            // Surface the dashboard's own load failures in the host's error card — but only for the
            // INITIAL load. BaseDashboard guarantees the loading screen is released even when
            // initDashboard()/loadData() throws (it emits Error, then NotifyLoadComplete in a
            // finally). Wrap the completion hook to learn when the first load has settled, so a later
            // Refresh() failure keeps the rendered dashboard instead of blanking it to a sticky error
            // card. Wired BEFORE the first await below, so an Error during the instance's own
            // ngOnInit isn't missed.
            let initialLoadSettled = false;
            const onComplete = instance.LoadCompleteEvent;
            instance.LoadCompleteEvent = () => { initialLoadSettled = true; onComplete?.(); };
            instance.Error.subscribe((err: Error) => {
                if (initialLoadSettled) return; // post-mount refresh failure — already logged by BaseDashboard.runGuardedLoad
                this.setError(`The dashboard "${dashboard.Name}" could not be loaded.`, err);
                this.cdr.markForCheck();
            });

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
            this.ContainerElement.nativeElement.appendChild(nativeElement);

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
        const md = this.ProviderToUse;
        const stateResult = DashboardEngine.Instance.DashboardUserStates.filter(dus => UUIDsEqual(dus.DashboardID, dashboardId) && UUIDsEqual(dus.UserID, md.CurrentUser.ID));
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
            this.ContainerElement.nativeElement.innerHTML = '';
            const componentRef = this.viewContainer.createComponent(DashboardViewerComponent);
            this.componentRef = componentRef;
            const instance = componentRef.instance;

            // Store references for external toolbar control
            this.viewerInstance = instance;
            this.ConfigDashboard = dashboard;
            this.reportedPanelsKey = null;
            void this.loadHomePins();

            // Compute user permissions for this dashboard
            const md = this.ProviderToUse;
            this.DashboardPermissions = DashboardEngine.Instance.GetDashboardPermissions(
                dashboard.ID,
                md.CurrentUser.ID
            );

            // Manually append the component's native element inside the div
            const nativeElement = (this.componentRef.hostView as any).rootNodes[0];
            nativeElement.style.width = '100%';
            nativeElement.style.height = '100%';
            this.ContainerElement.nativeElement.appendChild(nativeElement);

            // Load categories for breadcrumb navigation (if not already loaded)
            if (this.categories.length === 0) {
                this.categories = DashboardEngine.Instance.DashboardCategories;
            }

            // Configure the viewer before assigning the dashboard. The dashboard input
            // starts the layout lifecycle synchronously, so event handlers need to be
            // wired first.
            instance.showToolbar = false;         // We provide external toolbar
            instance.ShowBreadcrumb = false;      // Already in a dashboard tab, no breadcrumb needed
            instance.ShowOpenInTabButton = false; // Already in a dashboard tab
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

            // A save can rename the dashboard: the tab takes the saved name and keeps its dashboard id
            instance.dashboardSaved.subscribe((savedDashboard: MJDashboardEntity) => {
                if (savedDashboard.Name) {
                    this.NotifyDisplayNameChanged(savedDashboard.Name);
                }
            });

            // Wire up error events
            instance.error.subscribe((errorEvent: { message: string; error?: Error }) => {
                console.error('Dashboard error:', errorEvent.message, errorEvent.error);
            });

            // Report panel adds, removals and changes to the agent
            instance.configChanged.subscribe(() => this.onViewerConfigChanged());

            // Open the part dialogs the viewer asks for: Add Part, and a part's Configure and Remove
            instance.PanelInteraction.subscribe((event: PanelInteractionEvent) => this.onPanelInteraction(event));

            // Follow saves of the dashboard made elsewhere, and edit-mode requests for this tab
            this.watchForChanges();

            // Set the dashboard entity directly on the viewer and wait for Golden Layout
            // to initialize against a real container before clearing the resource loader.
            instance.dashboard = dashboard;
            await instance.waitForLayoutReady();
            this.NotifyLoadComplete();
            this.applyEditModeRequest();
            this.cdr.detectChanges();
            this.publishAgentState();

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
                // `recordId` is documented as URL-segment format (see OpenEntityRecordNavRequest in
                // @memberjunction/ng-dashboard-viewer). E.g. a single-PK record is `"ID|11055"`; a
                // composite-PK record is `"Field1|Value1||Field2|Value2"`. Senders in
                // dashboard-viewer (artifact-part, view-part) intentionally call
                // `compositeKey.ToURLSegment()` to produce this shape.
                //
                // Wrapping that string verbatim into `{ FieldName: 'ID', Value: <segment> }` makes
                // ToURLSegment serialize it a second time as `ID|<segment>` and produces a
                // malformed `Field|Field|Value` URL the host parser silently mis-reads (manifesting
                // downstream as `BaseEntity.Load(... Key: ID=ID)` and `Primary Key value is not a
                // valid number`). Parse the segment with `FromURLSegment` against the entity's PK
                // metadata instead, so single-PK and composite-PK both round-trip correctly (it also
                // owns the last-resort `ID` fallback for an entity name metadata can't resolve).
                const md = this.ProviderToUse;
                const pkey = CompositeKey.FromURLSegment(md.EntityByName(entityRequest.entityName), entityRequest.recordId);
                this.navigationService.OpenEntityRecord(entityRequest.entityName, pkey);
                break;
            }
            case 'OpenDashboard': {
                const dashRequest = request as { type: 'OpenDashboard'; dashboardId: string };
                // Load dashboard name from engine cache
                const targetDashboard = DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, dashRequest.dashboardId));
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
     * The tab title: the dashboard's name from the DashboardEngine cache, else its record name from
     * the server, else the given name. A Data Explorer tab keeps the name of the app it belongs to.
     */
    override async GetResourceDisplayName(data: ResourceData): Promise<string> {
        if (this.isDataExplorer(data)) {
            const config: Record<string, unknown> = data.Configuration ?? {};
            const appName = typeof config['appName'] === 'string' ? config['appName'] : '';
            return data.Name || appName || 'Data Explorer';
        }
        const dashboardId = typeof data.ResourceRecordID === 'string' ? data.ResourceRecordID : '';
        const name = dashboardId ? (this.cachedDashboardName(dashboardId) ?? await this.loadDashboardName(dashboardId)) : null;
        return name || data.Name || 'Dashboard';
    }

    /** True for the Data Explorer, which this wrapper hosts but which is not a dashboard record. */
    private isDataExplorer(data: ResourceData): boolean {
        const config: Record<string, unknown> = data.Configuration ?? {};
        return config['dashboardType'] === 'DataExplorer' || data.ResourceRecordID === 'DataExplorer';
    }

    /** The dashboard's name from the DashboardEngine cache, or null when the cache does not have it. */
    private cachedDashboardName(dashboardId: string): string | null {
        try {
            return DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, dashboardId))?.Name || null;
        } catch {
            return null; // the user cannot read the dashboards cache
        }
    }

    /** The dashboard's record name from the server, or null when it cannot be read. */
    private async loadDashboardName(dashboardId: string): Promise<string | null> {
        try {
            return (await this.ProviderToUse.GetEntityRecordName('MJ: Dashboards', CompositeKey.FromID(dashboardId))) || null;
        } catch {
            return null;
        }
    }

    /**
     * Get the icon class for dashboard resources
     */
    async GetResourceIconClass(data: ResourceData): Promise<string> {
        return 'fa-solid fa-table-columns';
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
