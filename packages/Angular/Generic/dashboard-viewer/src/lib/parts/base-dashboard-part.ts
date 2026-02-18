import { Input, Output, EventEmitter, ChangeDetectorRef, Directive, OnInit, OnDestroy } from '@angular/core';
import { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    PanelConfig,
    DashboardPanel,
    DashboardNavRequest,
    DashboardNavRequestEvent,
    OpenEntityRecordNavRequest,
    OpenDashboardNavRequest,
    OpenQueryNavRequest,
    OpenApplicationNavRequest
} from '../models/dashboard-types';

/**
 * Event emitted when a part requests configuration
 */
export interface PartConfigureEvent {
    /** The panel requesting configuration */
    Panel: DashboardPanel;
    /** The part type */
    PartType: MJDashboardPartTypeEntity;
}

/**
 * Event emitted when a part requests removal
 */
export interface PartRemoveEvent {
    /** The panel to remove */
    Panel: DashboardPanel;
}

/**
 * Event emitted when a part's data changes
 */
export interface PartDataChangeEvent {
    /** The panel whose data changed */
    Panel: DashboardPanel;
    /** The new data (type depends on part type) */
    Data: unknown;
}

/**
 * Base class for dashboard part renderers.
 *
 * Each part type (View, Query, Artifact, WebURL, etc.) has a renderer component
 * that extends this class. The renderer is responsible for:
 * 1. Displaying the part's content based on its configuration
 * 2. Handling edit mode UI (configure/remove buttons)
 * 3. Emitting events for user interactions
 *
 * Subclasses are registered with @RegisterClass(BaseDashboardPart, 'PartTypeName')
 * and instantiated via ClassFactory using the DashboardPartType.DriverClass field.
 *
 * This allows new part types to be added by:
 * 1. Creating a new component that extends BaseDashboardPart
 * 2. Registering it with @RegisterClass
 * 3. Adding a DashboardPartType record with the DriverClass set to the registered name
 */
@Directive()
export abstract class BaseDashboardPart implements OnInit, OnDestroy {
    /**
     * The panel data including ID, title, icon, and configuration
     */
    @Input()
    set Panel(value: DashboardPanel | null) {
        const previous = this._panel;
        this._panel = value;
        if (value !== previous) {
            this.onPanelChanged(value, previous);
        }
    }
    get Panel(): DashboardPanel | null {
        return this._panel;
    }
    private _panel: DashboardPanel | null = null;

    /**
     * The part type metadata
     */
    @Input() PartType: MJDashboardPartTypeEntity | null = null;

    /**
     * Whether the dashboard is in edit mode
     */
    @Input()
    set IsEditing(value: boolean) {
        const previous = this._isEditing;
        this._isEditing = value;
        if (value !== previous) {
            this.onEditModeChanged(value);
        }
    }
    get IsEditing(): boolean {
        return this._isEditing;
    }
    private _isEditing = false;

    /**
     * Emitted when user clicks configure button
     */
    @Output() ConfigureRequested = new EventEmitter<PartConfigureEvent>();

    /**
     * Emitted when user clicks remove button
     */
    @Output() RemoveRequested = new EventEmitter<PartRemoveEvent>();

    /**
     * Emitted when the part's data changes (e.g., selection in a grid)
     */
    @Output() DataChanged = new EventEmitter<PartDataChangeEvent>();

    /**
     * Emitted when the part requests navigation to another resource.
     * Parent component handles actual routing based on the request type.
     */
    @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();

    /**
     * Whether the part is currently loading
     */
    public IsLoading = false;

    /**
     * Error message if the part failed to load
     */
    public ErrorMessage: string | null = null;

    constructor(protected cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.initialize();
    }

    ngOnDestroy(): void {
        this.cleanup();
    }

    /**
     * Initialize the part. Called in ngOnInit.
     * Override to perform async initialization like loading data.
     */
    protected initialize(): void {
        // Default implementation does nothing
    }

    /**
     * Cleanup resources. Called in ngOnDestroy.
     * Override to unsubscribe from observables, etc.
     */
    protected cleanup(): void {
        // Default implementation does nothing
    }

    /**
     * Called when the panel input changes.
     * Override to react to configuration changes.
     */
    protected onPanelChanged(newPanel: DashboardPanel | null, oldPanel: DashboardPanel | null): void {
        // Default implementation triggers reload
        if (newPanel) {
            this.loadContent();
        }
    }

    /**
     * Called when edit mode changes.
     * Override to adjust UI for edit mode.
     */
    protected onEditModeChanged(isEditing: boolean): void {
        this.cdr.detectChanges();
    }

    /**
     * Load or reload the part's content based on current configuration.
     * Override to implement actual data loading.
     */
    public abstract loadContent(): Promise<void>;

    /**
     * Get the typed configuration for this part.
     * Subclasses should override to return the specific config type.
     */
    public getConfig<T extends PanelConfig>(): T | null {
        return this.Panel?.config as T | null;
    }

    /**
     * Request configuration (edit the part settings)
     */
    public requestConfigure(): void {
        if (this.Panel && this.PartType) {
            this.ConfigureRequested.emit({
                Panel: this.Panel,
                PartType: this.PartType
            });
        }
    }

    /**
     * Request removal of this part
     */
    public requestRemove(): void {
        if (this.Panel) {
            this.RemoveRequested.emit({
                Panel: this.Panel
            });
        }
    }

    /**
     * Emit a data change event
     */
    protected emitDataChanged(data: unknown): void {
        if (this.Panel) {
            this.DataChanged.emit({
                Panel: this.Panel,
                Data: data
            });
        }
    }

    /**
     * Set loading state
     */
    protected setLoading(loading: boolean): void {
        this.IsLoading = loading;
        this.cdr.detectChanges();
    }

    /**
     * Set error state
     */
    protected setError(message: string | null): void {
        this.ErrorMessage = message;
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    // ========================================
    // Navigation Request Methods
    // ========================================

    /**
     * Request navigation to open a specific entity record
     */
    public RequestOpenEntityRecord(
        entityName: string,
        recordId: string,
        mode: 'view' | 'edit' = 'view',
        openInNewTab = false
    ): void {
        const request: OpenEntityRecordNavRequest = {
            type: 'OpenEntityRecord',
            sourcePanelId: this.Panel?.id ?? '',
            entityName,
            recordId,
            mode,
            openInNewTab
        };
        this.emitNavigationRequest(request);
    }

    /**
     * Request navigation to another dashboard
     */
    public RequestOpenDashboard(
        dashboardId: string,
        categoryId?: string,
        openInNewTab = false
    ): void {
        const request: OpenDashboardNavRequest = {
            type: 'OpenDashboard',
            sourcePanelId: this.Panel?.id ?? '',
            dashboardId,
            categoryId,
            openInNewTab
        };
        this.emitNavigationRequest(request);
    }

    /**
     * Request navigation to a query
     */
    public RequestOpenQuery(
        queryId: string,
        parameters?: Record<string, unknown>,
        autoExecute = true,
        openInNewTab = false
    ): void {
        const request: OpenQueryNavRequest = {
            type: 'OpenQuery',
            sourcePanelId: this.Panel?.id ?? '',
            queryId,
            parameters,
            autoExecute,
            openInNewTab
        };
        this.emitNavigationRequest(request);
    }

    /**
     * Request navigation to another application
     */
    public RequestOpenApplication(
        applicationId: string,
        resourceName?: string,
        openInNewTab = false
    ): void {
        const request: OpenApplicationNavRequest = {
            type: 'OpenApplication',
            sourcePanelId: this.Panel?.id ?? '',
            applicationId,
            resourceName,
            openInNewTab
        };
        this.emitNavigationRequest(request);
    }

    /**
     * Emit a navigation request event
     */
    protected emitNavigationRequest(request: DashboardNavRequest): void {
        if (this.Panel) {
            this.NavigationRequested.emit({
                request,
                panel: this.Panel
            });
        }
    }
}
