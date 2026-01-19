import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnDestroy,
    ViewChild,
    ElementRef,
    ChangeDetectorRef,
    ApplicationRef,
    Injector,
    ComponentRef,
    createComponent,
    EnvironmentInjector,
    Type,
    ViewEncapsulation
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { DashboardEngine, DashboardEntity, DashboardPartTypeEntity, DashboardCategoryEntity } from '@memberjunction/core-entities';
import { BreadcrumbNavigateEvent } from '../breadcrumb/dashboard-breadcrumb.component';
import { ResolvedLayoutConfig } from 'golden-layout';
import {
    DashboardConfig,
    DashboardPanel,
    PanelConfig,
    PanelInteractionEvent,
    DashboardConfigChangedEvent,
    LayoutChangedEvent,
    DashboardNavRequestEvent,
    createDefaultDashboardConfig,
    generatePanelId,
    extractPanelsFromLayout,
    findPanelInLayout
} from '../models/dashboard-types';
import { GoldenLayoutWrapperService, LayoutLocation } from '../services/golden-layout-wrapper.service';
import { BaseDashboardPart } from '../parts/base-dashboard-part';

/**
 * Main dashboard viewer component.
 * Renders a configurable dashboard with draggable/resizable panels using Golden Layout.
 *
 * This component is GENERIC and has no routing dependencies.
 * Navigation events are bubbled up for the parent component to handle.
 */
@Component({
    selector: 'mj-dashboard-viewer',
    templateUrl: './dashboard-viewer.component.html',
    styleUrls: ['./dashboard-viewer.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class DashboardViewerComponent implements OnDestroy {
    // ========================================
    // Inputs
    // ========================================

    private _dashboard: DashboardEntity | null = null;
    private _dashboardId: string | null = null;

    /** The dashboard entity to display */
    @Input()
    set dashboard(value: DashboardEntity | null) {
        const previous = this._dashboard;
        this._dashboard = value;
        if (value && value !== previous) {
            this.onDashboardChanged();
        }
    }
    get dashboard(): DashboardEntity | null {
        return this._dashboard;
    }

    /** Alternative: Load dashboard by ID */
    @Input()
    set dashboardId(value: string | null) {
        const previous = this._dashboardId;
        this._dashboardId = value;
        if (value && value !== previous) {
            this.loadDashboardById(value);
        }
    }
    get dashboardId(): string | null {
        return this._dashboardId;
    }

    /** Whether the dashboard is in edit mode */
    private _isEditing = false;

    @Input()
    set isEditing(value: boolean) {
        const previous = this._isEditing;
        this._isEditing = value;
        // When isEditing changes (and layout exists), reinitialize to apply GL settings
        if (value !== previous && this._glService) {
            console.log('[DashboardViewer] isEditing changed from', previous, 'to', value);
            this.updatePanelEditModes();
        }
    }
    get isEditing(): boolean {
        return this._isEditing;
    }

    /** Whether to show the toolbar */
    private _showToolbar = true;

    @Input()
    set showToolbar(value: boolean) {
        this._showToolbar = value;
    }
    get showToolbar(): boolean {
        return this._showToolbar;
    }

    /** Whether to auto-save layout changes */
    private _autoSave = false;

    @Input()
    set autoSave(value: boolean) {
        this._autoSave = value;
    }
    get autoSave(): boolean {
        return this._autoSave;
    }

    /** Whether to show the breadcrumb navigation */
    @Input() showBreadcrumb = true;

    /** Whether to show the "Open in Tab" button (for embedded dashboards) */
    @Input() showOpenInTabButton = false;

    /** Whether to show the Edit button */
    @Input() showEditButton = true;

    /** All categories for breadcrumb path resolution */
    @Input() Categories: DashboardCategoryEntity[] = [];

    /**
     * Computed: Should the toolbar be visible?
     * Auto-hides when showToolbar=false OR when all toolbar elements are disabled
     */
    public get shouldShowToolbar(): boolean {
        if (!this._showToolbar) {
            return false;
        }
        // If all elements are hidden, hide the toolbar entirely
        return this.showBreadcrumb || this.showOpenInTabButton || this.showEditButton;
    }

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when dashboard configuration changes */
    @Output() configChanged = new EventEmitter<DashboardConfigChangedEvent>();

    /** Emitted when a panel requests navigation to another resource */
    @Output() navigationRequested = new EventEmitter<DashboardNavRequestEvent>();

    /** Emitted when a panel interaction occurs */
    @Output() panelInteraction = new EventEmitter<PanelInteractionEvent>();

    /** Emitted when the dashboard is saved */
    @Output() dashboardSaved = new EventEmitter<DashboardEntity>();

    /** Emitted when an error occurs */
    @Output() error = new EventEmitter<{ message: string; error?: Error }>();

    /** Emitted when edit mode changes */
    @Output() editModeChanged = new EventEmitter<boolean>();

    /** Emitted when user navigates via breadcrumb */
    @Output() breadcrumbNavigate = new EventEmitter<BreadcrumbNavigateEvent>();

    /** Emitted when user clicks "Open in Tab" button */
    @Output() openInTab = new EventEmitter<{ dashboardId: string; dashboardName: string }>();

    // ========================================
    // View Children
    // ========================================

    @ViewChild('layoutContainer', { static: true }) layoutContainer!: ElementRef<HTMLElement>;

    // ========================================
    // State
    // ========================================

    public isLoading = false;
    public config: DashboardConfig | null = null;
    public partTypes: DashboardPartTypeEntity[] = [];
    public hasUnsavedChanges = false;

    /**
     * Helper to check if layout has any panels (for template use).
     * Panels are stored in componentState within the layout tree.
     */
    public get hasPanels(): boolean {
        return extractPanelsFromLayout(this.config?.layout ?? null).length > 0;
    }

    private readonly _destroy$ = new Subject<void>();
    private readonly _panelComponents = new Map<string, { wrapper: HTMLElement; componentRef?: ComponentRef<BaseDashboardPart> }>();
    private _glService: GoldenLayoutWrapperService | null = null;

    /** Promise that resolves when part types are loaded - used to ensure layout waits for part types */
    private _partTypesLoaded: Promise<void> | null = null;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly appRef: ApplicationRef,
        private readonly injector: Injector,
        private readonly environmentInjector: EnvironmentInjector
    ) {
        // Store the promise so layout initialization can wait for it
        this._partTypesLoaded = this.loadPartTypes();
    }

    // ========================================
    // Lifecycle
    // ========================================

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
        this.destroyLayout();
    }

    // ========================================
    // Public Methods
    // ========================================

    /**
     * Toggle edit mode
     */
    public toggleEditMode(): void {
        this.isEditing = !this.isEditing;
        this.editModeChanged.emit(this.isEditing);
        this.updatePanelEditModes();
    }

    /**
     * Add a new panel to the dashboard.
     * The panel is stored in GL's componentState - no separate panels array.
     */
    public async addPanel(
        partTypeId: string,
        panelConfig: PanelConfig,
        title: string,
        icon?: string,
        location?: LayoutLocation
    ): Promise<void> {
        if (!this.config || !this._glService) {
            return;
        }

        const partType = this.partTypes.find(pt => pt.ID === partTypeId);
        if (!partType) {
            this.error.emit({ message: `Unknown panel type: ${partTypeId}` });
            return;
        }

        const panel: DashboardPanel = {
            id: generatePanelId(),
            partTypeId,
            title,
            icon: icon || partType.Icon || 'fa-solid fa-window-maximize',
            config: panelConfig
        };

        // Add to Golden Layout - panel data stored in componentState
        this._glService.addPanel(panel, location);

        // Sync the layout config from Golden Layout to capture the new panel
        // The layout IS the source of truth - it contains the panel in componentState
        const currentLayout = this._glService.getLayoutConfig();
        if (currentLayout) {
            this.config.layout = currentLayout;
        }

        this.markDirty();
    }

    /**
     * Remove a panel from the dashboard.
     * Panels live in GL's componentState, so removing from GL removes the panel.
     */
    public removePanel(panelId: string): void {
        if (!this.config || !this._glService) return;

        // Remove from layout (panel data is in componentState)
        this._glService.removePanel(panelId);

        // Sync layout config to persist the removal
        const currentLayout = this._glService.getLayoutConfig();
        if (currentLayout) {
            this.config.layout = currentLayout;
        }

        // Destroy component
        this.destroyPanelComponent(panelId);

        this.markDirty();
    }

    /**
     * Save the current dashboard configuration
     */
    public async save(): Promise<boolean> {
        if (!this._dashboard || !this.config) return false;

        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            // Update the layout config from Golden Layout
            if (this._glService) {
                const glConfig = this._glService.getLayoutConfig();
                if (glConfig) {
                    this.config.layout = glConfig;
                }
            }

            // Save to UIConfigDetails
            this._dashboard.UIConfigDetails = JSON.stringify(this.config);
            const saved = await this._dashboard.Save();

            if (saved) {
                this.hasUnsavedChanges = false;
                this.dashboardSaved.emit(this._dashboard);
            }

            return saved;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.error.emit({ message: 'Failed to save dashboard', error });
            return false;
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Refresh all panels
     */
    public async refreshAllPanels(): Promise<void> {
        // For placeholder implementation, reinitialize the layout
        if (this._glService) {
            await this.initializeLayout();
        }
    }

    /**
     * Get the current configuration
     */
    public getConfig(): DashboardConfig | null {
        return this.config;
    }

    /**
     * Get available part types
     */
    public getPartTypes(): DashboardPartTypeEntity[] {
        return this.partTypes;
    }

    /**
     * Get a panel by ID.
     * Extracts panel from the layout's componentState (single source of truth).
     */
    public getPanel(panelId: string): DashboardPanel | null {
        return findPanelInLayout(this.config?.layout ?? null, panelId);
    }

    /**
     * Get the part type for a panel
     */
    public getPartTypeForPanel(panelId: string): DashboardPartTypeEntity | null {
        const panel = this.getPanel(panelId);
        if (!panel) return null;
        return this.partTypes.find(pt => pt.ID === panel.partTypeId) ?? null;
    }

    /**
     * Update a panel's configuration.
     * Since panels live in componentState within the layout, we need to
     * update the layout tree directly or reinitialize with updated data.
     */
    public updatePanelConfig(panelId: string, newConfig: PanelConfig, title?: string, icon?: string): void {
        if (!this.config || !this._glService) return;

        // Get current layout which contains all panel data
        const currentLayout = this._glService.getLayoutConfig();
        if (!currentLayout) return;

        // Update panel in the layout tree
        this.updatePanelInLayout(currentLayout, panelId, newConfig, title, icon);
        this.config.layout = currentLayout;

        this.markDirty();

        // Reinitialize layout to reflect the updated panel
        this.initializeLayout();
    }

    /**
     * Recursively update a panel's config within the layout tree
     */
    private updatePanelInLayout(
        layout: ResolvedLayoutConfig,
        panelId: string,
        newConfig: PanelConfig,
        title?: string,
        icon?: string
    ): void {
        if (!layout.root) return;

        const updateNode = (node: ResolvedLayoutConfig['root']): void => {
            if (!node) return;

            // If this is a component with matching panelId
            if (node.type === 'component') {
                const componentNode = node as unknown as { componentState?: DashboardPanel; title?: string };
                if (componentNode.componentState?.id === panelId) {
                    componentNode.componentState.config = newConfig;
                    if (title) {
                        componentNode.componentState.title = title;
                        componentNode.title = title;
                    }
                    if (icon) componentNode.componentState.icon = icon;
                }
            }

            // Recursively process children
            const containerNode = node as unknown as { content?: ResolvedLayoutConfig['root'][] };
            if (containerNode.content && Array.isArray(containerNode.content)) {
                for (const child of containerNode.content) {
                    updateNode(child);
                }
            }
        };

        updateNode(layout.root);
    }

    /**
     * Handle add panel button click - emits event for parent to show dialog
     */
    public onAddPanelClick(): void {
        // Emit interaction event for parent to handle
        // Parent should show AddPanelDialog and call addPanel() with result
        this.panelInteraction.emit({
            panelId: '',
            interactionType: 'custom',
            payload: { action: 'add-panel-requested', partTypes: this.partTypes }
        });
    }

    /**
     * Handle "Open in Tab" button click - emits event for parent to open dashboard in its own tab
     */
    public onOpenInTabClick(): void {
        if (this._dashboard) {
            this.openInTab.emit({
                dashboardId: this._dashboard.ID,
                dashboardName: this._dashboard.Name
            });
        }
    }

    /**
     * Handle breadcrumb navigation
     */
    public onBreadcrumbNavigate(event: BreadcrumbNavigateEvent): void {
        this.breadcrumbNavigate.emit(event);
    }

    // ========================================
    // Private Methods - Initialization
    // ========================================

    private async loadPartTypes(): Promise<void> {
        try {
            await DashboardEngine.Instance.Config(false);
            this.partTypes = DashboardEngine.Instance.DashboardPartTypes;
        } catch (err) {
            console.error('Failed to load dashboard part types:', err);
        }
    }

    private async loadDashboardById(id: string): Promise<void> {
        try {
            this.isLoading = true;
            this.cdr.detectChanges();

            const md = new Metadata();
            const dashboard = await md.GetEntityObject<DashboardEntity>('Dashboards');
            const loaded = await dashboard.Load(id);

            if (loaded) {
                this._dashboard = dashboard;
                this.onDashboardChanged();
            } else {
                this.error.emit({ message: `Dashboard not found: ${id}` });
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.error.emit({ message: 'Failed to load dashboard', error });
        } finally {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

    private async onDashboardChanged(): Promise<void> {
        if (!this._dashboard) return;

        // Parse or create config
        this.config = this.parseOrCreateConfig();

        // Wait for part types to be loaded before initializing layout
        // This ensures partTypes array is populated when createPanelComponent is called
        if (this._partTypesLoaded) {
            await this._partTypesLoaded;
        }

        // Initialize layout
        this.initializeLayout();
    }

    private parseOrCreateConfig(): DashboardConfig {
        if (!this._dashboard?.UIConfigDetails) {
            return createDefaultDashboardConfig();
        }

        try {
            const parsed = JSON.parse(this._dashboard.UIConfigDetails);

            // Validate it has the expected structure (layout + settings)
            if (parsed.layout !== undefined && parsed.settings) {
                return parsed as DashboardConfig;
            }

            // Invalid format, return default
            console.warn('[DashboardViewer] Invalid config format, using default');
            return createDefaultDashboardConfig();
        } catch {
            return createDefaultDashboardConfig();
        }
    }

    // ========================================
    // Private Methods - Layout
    // ========================================

    private initializeLayout(): void {
        if (!this.config || !this.layoutContainer?.nativeElement) {
            return;
        }

        // Destroy existing layout
        this.destroyLayout();

        // Create new Golden Layout service
        this._glService = new GoldenLayoutWrapperService();

        // Subscribe to layout events
        this.subscribeToLayoutEvents();

        // Panel factory - called by GL when it binds a component
        // The panel comes directly from GL's componentState (single source of truth)
        const panelFactory = (panel: DashboardPanel, container: HTMLElement) => {
            this.createPanelComponent(panel, container);
        };

        // Initialize with saved layout (or null for empty dashboard)
        // Golden Layout's native ResolvedLayoutConfig is the source of truth
        // Panel data is embedded in each component's componentState
        this._glService.initialize(
            this.layoutContainer.nativeElement,
            this.config.layout,
            panelFactory,
            this.isEditing
        );

        // After GL.initialize() completes, all components from the saved layout
        // have been synchronously bound via the panelFactory callback.
        // However, Angular needs time to complete change detection and render
        // the dynamic components. A single delayed updateSize() ensures GL
        // recalculates dimensions after Angular has finished rendering.
        setTimeout(() => {
            this._glService?.updateSize();
            this.cdr.detectChanges();
        }, 100);
    }

    /** Flag to prevent panel removal during layout reinit */
    private _isReinitializing = false;

    private destroyLayout(): void {
        // Set flag to prevent onPanelClosed from removing panels during reinit
        this._isReinitializing = true;

        // Destroy all panel components
        this._panelComponents.forEach((entry, panelId) => {
            this.destroyPanelComponent(panelId);
        });
        this._panelComponents.clear();

        // Destroy Golden Layout
        if (this._glService) {
            this._glService.destroy();
            this._glService = null;
        }

        this._isReinitializing = false;
    }

    private subscribeToLayoutEvents(): void {
        if (!this._glService) return;

        this._glService.onLayoutChanged
            .pipe(takeUntil(this._destroy$))
            .subscribe((event: LayoutChangedEvent) => {
                this.onLayoutChanged(event);
            });

        this._glService.onPanelClosed
            .pipe(takeUntil(this._destroy$))
            .subscribe((panelId: string) => {
                this.onPanelClosed(panelId);
            });

        this._glService.onPanelSelected
            .pipe(takeUntil(this._destroy$))
            .subscribe((panelId: string) => {
                this.onPanelSelected(panelId);
            });
    }

    private onLayoutChanged(event: LayoutChangedEvent): void {
        if (this.config) {
            this.config.layout = event.layout;
            this.markDirty();

            // Map layout change types to config change types
            const changeType = event.changeType === 'close' ? 'panel-removed' : 'layout';
            this.configChanged.emit({
                config: this.config,
                changeType
            });
        }
    }

    private onPanelClosed(panelId: string): void {
        // Skip panel removal during layout reinit (panels are being recreated, not actually closed)
        if (this._isReinitializing) {
            return;
        }

        // Sync layout config - panel was removed from GL's tree
        if (this.config && this._glService) {
            const currentLayout = this._glService.getLayoutConfig();
            if (currentLayout) {
                this.config.layout = currentLayout;
            }
        }

        // Destroy component
        this.destroyPanelComponent(panelId);
        this.markDirty();
    }

    private onPanelSelected(panelId: string): void {
        // Could be used to highlight selected panel in edit mode
    }

    // ========================================
    // Private Methods - Panel Components
    // ========================================

    /**
     * Create a panel component from the DashboardPanel data.
     * Panel comes directly from GL's componentState - no lookup needed.
     */
    private createPanelComponent(panel: DashboardPanel, container: HTMLElement): void {
        const partType = this.partTypes.find(pt => pt.ID === panel.partTypeId);

        // Create the panel wrapper with header and content
        const wrapper = document.createElement('div');
        wrapper.className = 'dashboard-part-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; background: #fff;';

        // Only show header in edit mode - GL tabs already display the title in view mode
        if (this.isEditing) {
            const header = this.createPartHeader(panel, panel.id);
            wrapper.appendChild(header);
        }

        // Create content area
        const content = document.createElement('div');
        content.className = 'dashboard-part-content';
        content.style.cssText = 'flex: 1; overflow: auto; min-height: 0;';

        // Try to create dynamic component via ClassFactory
        const componentRef = this.createDynamicPartComponent(panel, partType, content);

        if (!componentRef) {
            // Fallback to static rendering if no DriverClass or component creation failed
            this.renderPartContent(panel, content, partType);
        }

        wrapper.appendChild(content);
        container.appendChild(wrapper);

        // Store reference for cleanup
        this._panelComponents.set(panel.id, { wrapper, componentRef: componentRef || undefined });
    }

    /**
     * Create a dynamic part component using ClassFactory
     */
    private createDynamicPartComponent(
        panel: DashboardPanel,
        partType: DashboardPartTypeEntity | undefined,
        container: HTMLElement
    ): ComponentRef<BaseDashboardPart> | null {
        if (!partType?.DriverClass) {
            return null;
        }

        try {
            // Use ClassFactory to create instance and get the component class
            const partInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDashboardPart>(
                BaseDashboardPart,
                partType.DriverClass
            );

            if (!partInstance) {
                return null;
            }

            // Get the Angular component class from the instance
            // The constructor is a concrete class that extends BaseDashboardPart
            const componentClass = (partInstance as object).constructor as Type<BaseDashboardPart>;

            // Create the component dynamically
            const componentRef = createComponent(componentClass, {
                environmentInjector: this.environmentInjector,
                elementInjector: this.injector
            });

            // Set inputs on the component
            const instance = componentRef.instance;
            instance.Panel = panel;
            instance.PartType = partType;
            instance.IsEditing = this.isEditing;

            // Subscribe to events
            instance.ConfigureRequested.subscribe(() => {
                this.onConfigurePart(panel.id);
            });
            instance.RemoveRequested.subscribe(() => {
                this.onRemovePart(panel.id);
            });
            instance.NavigationRequested.subscribe((event: DashboardNavRequestEvent) => {
                this.navigationRequested.emit(event);
            });

            // Attach component to DOM
            container.appendChild(componentRef.location.nativeElement);

            // Attach to Angular's change detection
            this.appRef.attachView(componentRef.hostView);

            return componentRef;
        } catch (error) {
            console.error('[DashboardViewer] Failed to create dynamic component:', error);
            return null;
        }
    }

    private createPartHeader(panel: DashboardPanel, panelId: string): HTMLElement {
        const header = document.createElement('div');
        header.className = 'dashboard-part-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-bottom: 1px solid #e0e0e0;
            min-height: 40px;
        `;

        // Icon and title
        const titleSection = document.createElement('div');
        titleSection.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;';
        titleSection.innerHTML = `
            <i class="${panel.icon || 'fa-solid fa-puzzle-piece'}" style="color: #5c6bc0; font-size: 14px;"></i>
            <span style="font-weight: 500; font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${panel.title}</span>
        `;
        header.appendChild(titleSection);

        // Action buttons (only in edit mode)
        if (this.isEditing) {
            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 4px;';

            // Configure button
            const configBtn = document.createElement('button');
            configBtn.className = 'part-action-btn';
            configBtn.title = 'Configure';
            configBtn.style.cssText = `
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: none;
                border-radius: 4px;
                background: transparent;
                color: #666;
                cursor: pointer;
                transition: all 0.15s;
            `;
            configBtn.innerHTML = '<i class="fa-solid fa-cog" style="font-size: 12px;"></i>';
            configBtn.addEventListener('click', () => this.onConfigurePart(panelId));
            configBtn.addEventListener('mouseenter', () => {
                configBtn.style.background = '#e0e0e0';
                configBtn.style.color = '#333';
            });
            configBtn.addEventListener('mouseleave', () => {
                configBtn.style.background = 'transparent';
                configBtn.style.color = '#666';
            });

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.className = 'part-action-btn';
            removeBtn.title = 'Remove';
            removeBtn.style.cssText = `
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: none;
                border-radius: 4px;
                background: transparent;
                color: #666;
                cursor: pointer;
                transition: all 0.15s;
            `;
            removeBtn.innerHTML = '<i class="fa-solid fa-times" style="font-size: 12px;"></i>';
            removeBtn.addEventListener('click', () => this.onRemovePart(panelId));
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.background = '#ffebee';
                removeBtn.style.color = '#d32f2f';
            });
            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.background = 'transparent';
                removeBtn.style.color = '#666';
            });

            actions.appendChild(configBtn);
            actions.appendChild(removeBtn);
            header.appendChild(actions);
        }

        return header;
    }

    private renderPartContent(panel: DashboardPanel, container: HTMLElement, partType: DashboardPartTypeEntity | undefined): void {
        const config = panel.config;

        switch (config?.type) {
            case 'WebURL':
                this.renderWebURLPart(panel, container, config);
                break;
            case 'View':
                this.renderViewPart(panel, container, config);
                break;
            case 'Query':
                this.renderQueryPart(panel, container, config);
                break;
            case 'Artifact':
                this.renderArtifactPart(panel, container, config);
                break;
            default:
                this.renderPlaceholderPart(panel, container, partType);
        }
    }

    private renderWebURLPart(panel: DashboardPanel, container: HTMLElement, config: PanelConfig): void {
        const url = config['url'] as string | undefined;
        if (!url) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-globe" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No URL Configured</h4>
                    <p style="margin: 0; font-size: 13px;">Click the configure button to set a URL for this part.</p>
                </div>
            `;
            return;
        }

        const sandboxMode = config['sandboxMode'] as string | undefined;
        // Determine sandbox permissions based on mode
        let sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
        if (sandboxMode === 'strict') {
            sandbox = 'allow-scripts';
        } else if (sandboxMode === 'permissive') {
            sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation';
        }

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframe.sandbox.value = sandbox;
        if (config['allowFullscreen'] !== false) {
            iframe.allowFullscreen = true;
        }
        iframe.title = panel.title;

        container.appendChild(iframe);
    }

    private renderViewPart(panel: DashboardPanel, container: HTMLElement, config: PanelConfig): void {
        const viewId = config['viewId'] as string | undefined;
        const entityName = config['entityName'] as string | undefined;
        if (!viewId && !entityName) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-table" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No View Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select a view for this part.</p>
                </div>
            `;
            return;
        }

        const viewInfo = viewId ? viewId.substring(0, 8) + '...' : entityName;
        const displayModeValue = config['displayMode'] as string | undefined;
        const displayMode = displayModeValue === 'grid' ? 'Grid View' : displayModeValue === 'cards' ? 'Card View' : 'Timeline View';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #fff;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-table" style="font-size: 20px; color: #5c6bc0;"></i>
                        <div>
                            <div style="font-weight: 500; color: #333; font-size: 14px;">Entity View</div>
                            <div style="font-size: 12px; color: #666;">${entityName || 'View ' + viewInfo}</div>
                        </div>
                        <span style="margin-left: auto; padding: 4px 10px; background: #e3f2fd; color: #1976d2; border-radius: 12px; font-size: 11px; font-weight: 500;">${displayMode}</span>
                    </div>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; padding: 24px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <p style="margin: 0; font-size: 13px;">Entity grid loading...</p>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #bbb;">Full implementation pending Angular integration</p>
                </div>
            </div>
        `;
    }

    private renderQueryPart(panel: DashboardPanel, container: HTMLElement, config: PanelConfig): void {
        const queryId = config['queryId'] as string | undefined;
        const queryName = config['queryName'] as string | undefined;
        if (!queryId && !queryName) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-database" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No Query Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select a query for this part.</p>
                </div>
            `;
            return;
        }

        const autoRefreshSeconds = (config['autoRefreshSeconds'] as number) || 0;
        const queryInfo = queryName || (queryId ? queryId.substring(0, 8) + '...' : 'Unknown');
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #fff;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-database" style="font-size: 20px; color: #5c6bc0;"></i>
                        <div>
                            <div style="font-weight: 500; color: #333; font-size: 14px;">Query Results</div>
                            <div style="font-size: 12px; color: #666;">${queryInfo}</div>
                        </div>
                        <span style="margin-left: auto; padding: 4px 10px; background: #e8f5e9; color: #388e3c; border-radius: 12px; font-size: 11px; font-weight: 500;">${autoRefreshSeconds > 0 ? 'Refresh: ' + autoRefreshSeconds + 's' : 'Manual refresh'}</span>
                    </div>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; padding: 24px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <p style="margin: 0; font-size: 13px;">Query grid loading...</p>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #bbb;">Full implementation pending Angular integration</p>
                </div>
            </div>
        `;
    }

    private renderArtifactPart(panel: DashboardPanel, container: HTMLElement, config: PanelConfig): void {
        const artifactId = config['artifactId'] as string | undefined;
        if (!artifactId) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-cube" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No Artifact Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select an artifact for this part.</p>
                </div>
            `;
            return;
        }

        const versionNumber = config['versionNumber'] as number | undefined;
        const artifactInfo = artifactId.substring(0, 8) + '...';
        const versionInfo = versionNumber ? `v${versionNumber}` : 'Latest';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #fff;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-cube" style="font-size: 20px; color: #5c6bc0;"></i>
                        <div>
                            <div style="font-weight: 500; color: #333; font-size: 14px;">Artifact</div>
                            <div style="font-size: 12px; color: #666;">ID: ${artifactInfo}</div>
                        </div>
                        <span style="margin-left: auto; padding: 4px 10px; background: #fce4ec; color: #c2185b; border-radius: 12px; font-size: 11px; font-weight: 500;">${versionInfo}</span>
                    </div>
                </div>
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #999; padding: 24px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <p style="margin: 0; font-size: 13px;">Artifact viewer loading...</p>
                    <p style="margin: 8px 0 0 0; font-size: 11px; color: #bbb;">Full implementation pending Angular integration</p>
                </div>
            </div>
        `;
    }

    private renderPlaceholderPart(panel: DashboardPanel, container: HTMLElement, partType: DashboardPartTypeEntity | undefined): void {
        const partTypeName = partType?.Name || 'Custom';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                <i class="fa-solid fa-puzzle-piece" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                <h4 style="margin: 0 0 8px 0; color: #333;">${partTypeName} Part</h4>
                <p style="margin: 0; font-size: 13px;">This part type is not yet fully implemented.</p>
            </div>
        `;
    }

    private onConfigurePart(panelId: string): void {
        // Emit event for parent to handle configuration
        this.panelInteraction.emit({
            panelId,
            interactionType: 'custom',
            payload: { action: 'configure-part-requested' }
        });
    }

    private onRemovePart(panelId: string): void {
        // Emit event for parent to show confirmation dialog
        const panel = findPanelInLayout(this.config?.layout ?? null, panelId);
        this.panelInteraction.emit({
            panelId,
            interactionType: 'custom',
            payload: {
                action: 'remove-part-requested',
                panelTitle: panel?.title || 'this part'
            }
        });
    }

    /**
     * Confirm removal of a panel (called by parent after confirmation dialog)
     */
    public confirmRemovePanel(panelId: string): void {
        this.removePanel(panelId);
    }

    private destroyPanelComponent(panelId: string): void {
        const entry = this._panelComponents.get(panelId);
        if (entry) {
            // Destroy the Angular component if present
            if (entry.componentRef) {
                this.appRef.detachView(entry.componentRef.hostView);
                entry.componentRef.destroy();
            }
            this._panelComponents.delete(panelId);
        }
    }

    private updatePanelEditModes(): void {
        // Update IsEditing on all dynamic components
        this._panelComponents.forEach((entry) => {
            if (entry.componentRef) {
                entry.componentRef.instance.IsEditing = this.isEditing;
            }
        });

        // Save current layout before reinitializing (preserves user's arrangement)
        if (this._glService && this.config) {
            const currentLayout = this._glService.getLayoutConfig();
            if (currentLayout) {
                this.config.layout = currentLayout;
            }
        }

        // Reinitialize layout to apply new Golden Layout settings (edit mode lock/unlock)
        if (this._glService) {
            this.initializeLayout();
        }
    }

    // ========================================
    // Private Methods - State
    // ========================================

    private markDirty(): void {
        this.hasUnsavedChanges = true;

        if (this.autoSave && this.config) {
            this.save();
        }
    }
}
