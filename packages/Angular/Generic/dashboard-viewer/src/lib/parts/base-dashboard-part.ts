import { Input, Output, EventEmitter, ChangeDetectorRef, Directive, OnInit, OnDestroy } from '@angular/core';
import { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    PanelConfig,
    DashboardPanel,
    DashboardNavRequest,
    DashboardNavRequestEvent,
    OpenEntityRecordNavRequest,
    OpenDashboardNavRequest,
    OpenQueryNavRequest,
    OpenApplicationNavRequest,
    OpenNavItemNavRequest
} from '../models/dashboard-types';
import {
    DashboardPartContext,
    DashboardPartEventArgs,
    DashboardPartInput,
    DashboardPartInputMapping,
    GetInputMappings,
    PartInputProblemMessage,
    PartInputResolution,
    PartInputResolutionKey,
    ResolvePartInputs,
} from '../models/dashboard-properties';
import { GetLocalTimeZone, PropertyResolutionContext } from '@memberjunction/core';

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
export abstract class BaseDashboardPart extends BaseAngularComponent implements OnInit, OnDestroy {
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
     * The dashboard's properties and their values as this part sees them, set by the viewer when the
     * dashboard has properties or the part has input mappings. Null (the default): the part ignores
     * its mappings and runs exactly as before. A new context reapplies the part's inputs only when
     * the values it runs with change.
     */
    @Input()
    set PropertyContext(value: DashboardPartContext | null) {
        this._propertyContext = value;
        this.OnPropertyContextChanged();
    }
    get PropertyContext(): DashboardPartContext | null {
        return this._propertyContext;
    }
    private _propertyContext: DashboardPartContext | null = null;

    /** The events of this part a dashboard wire listens to. After one fires, the part offers Clear selection. */
    @Input() WiredEvents: string[] | null = null;

    /**
     * Emitted when the part raises one of the events it declares (a View part's `RecordSelected`, a
     * Query part's `RowSelected`, a component's declared events). Values null: the selection was cleared.
     */
    @Output() PartEvent = new EventEmitter<DashboardPartEventArgs>();

    /** The part's inputs as last worked out from its mappings. Null when it has no mappings: it runs as before. */
    public InputResolution: PartInputResolution | null = null;

    /** True after a wired event of this part fired with a value, until the selection is cleared. */
    public HasActiveSelection = false;

    private declaredInputs: DashboardPartInput[] | null = null;
    private inputResolutionKey = '';
    private lastWiredEvent: string | null = null;

    /**
     * Whether the part is currently loading
     */
    public IsLoading = false;

    /**
     * Error message if the part failed to load
     */
    public ErrorMessage: string | null = null;

    constructor(protected cdr: ChangeDetectorRef) {
        super();
    }

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

    // ========================================
    // Dashboard properties, input mappings and events
    // ========================================

    /** This part's input mappings, from its config. Empty when it has none. */
    protected get InputMappings(): DashboardPartInputMapping[] {
        return GetInputMappings(this.Panel?.config);
    }

    /** Why the part can't run with its mappings (a broken mapping, a missing input), or null. */
    public get InputProblem(): string | null {
        return PartInputProblemMessage(this.InputResolution);
    }

    /**
     * Records the inputs the part declares and works out their values from its mappings. Returns null,
     * and the part runs exactly as before, when it has no mappings.
     */
    protected UpdateInputs(inputs: DashboardPartInput[]): PartInputResolution | null {
        this.declaredInputs = inputs;
        this.InputResolution = this.resolveInputs(inputs);
        this.inputResolutionKey = PartInputResolutionKey(this.InputResolution);
        return this.InputResolution;
    }

    /**
     * Called when the viewer hands the part a new context. Reapplies the inputs only when the values the
     * part runs with changed, so a property the part doesn't map, or a value its own event set, never
     * refreshes it.
     */
    protected OnPropertyContextChanged(): void {
        if (!this.declaredInputs) return; // not loaded yet: loading works the inputs out
        const next = this.resolveInputs(this.declaredInputs);
        const key = PartInputResolutionKey(next);
        if (key === this.inputResolutionKey) return;
        this.InputResolution = next;
        this.inputResolutionKey = key;
        this.ApplyInputs(next);
    }

    /** Applies new input values to the part's content. The default reloads it. */
    protected ApplyInputs(_resolution: PartInputResolution | null): void {
        void this.loadContent();
    }

    /** The context the part's token defaults are worked out with: the provider's user and the browser's zone. */
    protected get ResolutionContext(): PropertyResolutionContext {
        const user = this.ProviderToUse?.CurrentUser;
        return { User: user ? { ID: user.ID, Email: user.Email, Name: user.Name } : undefined, TimeZone: GetLocalTimeZone() };
    }

    private resolveInputs(inputs: DashboardPartInput[]): PartInputResolution | null {
        const mappings = this.InputMappings;
        if (mappings.length === 0) return null;
        const context = this._propertyContext ?? { Properties: [], Values: {} };
        return ResolvePartInputs(inputs, mappings, context.Properties, context.Values, this.ResolutionContext);
    }

    /** Raises one of the part's events. Values null clears the selection it set. */
    protected EmitPartEvent(event: string, values: Record<string, unknown> | null): void {
        if (!this.Panel) return;
        const wired = this.WiredEvents?.includes(event) ?? false;
        if (wired) {
            this.lastWiredEvent = values ? event : null;
            this.HasActiveSelection = values !== null;
        }
        this.PartEvent.emit(new DashboardPartEventArgs(event, values));
    }

    /** Clears the selection a wired event of this part set, so the dashboard property goes back to its host value or default. */
    public ClearSelection(): void {
        if (this.lastWiredEvent) {
            this.EmitPartEvent(this.lastWiredEvent, null);
            this.cdr.detectChanges();
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
     * Request navigation to a specific nav item within an application.
     * Supports setting URL query parameters after navigation.
     */
    public RequestOpenNavItem(
        navItemName: string,
        appName?: string,
        queryParams?: Record<string, string>,
        openInNewTab = false
    ): void {
        const request: OpenNavItemNavRequest = {
            type: 'OpenNavItem',
            sourcePanelId: this.Panel?.id ?? '',
            appName,
            navItemName,
            queryParams,
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
