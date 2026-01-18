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
import { DashboardEngine, DashboardEntity, DashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    DashboardConfigV2,
    DashboardPanel,
    PanelConfig,
    PanelInteractionEvent,
    DashboardConfigChangedEvent,
    LayoutChangedEvent,
    GoldenLayoutConfig,
    LayoutNode,
    createDefaultDashboardConfig,
    generatePanelId,
    ViewPanelConfig,
    QueryPanelConfig,
    ArtifactPanelConfig,
    WebURLPanelConfig
} from '../models/dashboard-types';
import { GoldenLayoutWrapperService, LayoutLocation } from '../services/golden-layout-wrapper.service';
import { BaseDashboardPart } from '../parts/base-dashboard-part';

/**
 * Event emitted when navigation is requested from a panel
 */
export interface DashboardNavigationEvent {
    /** Type of navigation (e.g., 'entity', 'record', 'query', 'dashboard') */
    navigationType: string;
    /** Navigation target details */
    target: {
        entityName?: string;
        recordId?: string;
        queryId?: string;
        dashboardId?: string;
        url?: string;
        [key: string]: unknown;
    };
    /** Source panel that triggered navigation */
    sourcePanelId: string;
}

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
    @Input() isEditing = false;

    /** Whether to show the toolbar */
    @Input() showToolbar = true;

    /** Whether to auto-save layout changes */
    @Input() autoSave = false;

    // ========================================
    // Outputs
    // ========================================

    /** Emitted when dashboard configuration changes */
    @Output() configChanged = new EventEmitter<DashboardConfigChangedEvent>();

    /** Emitted when a panel requests navigation */
    @Output() navigationRequested = new EventEmitter<DashboardNavigationEvent>();

    /** Emitted when a panel interaction occurs */
    @Output() panelInteraction = new EventEmitter<PanelInteractionEvent>();

    /** Emitted when the dashboard is saved */
    @Output() dashboardSaved = new EventEmitter<DashboardEntity>();

    /** Emitted when an error occurs */
    @Output() error = new EventEmitter<{ message: string; error?: Error }>();

    /** Emitted when edit mode changes */
    @Output() editModeChanged = new EventEmitter<boolean>();

    // ========================================
    // View Children
    // ========================================

    @ViewChild('layoutContainer', { static: true }) layoutContainer!: ElementRef<HTMLElement>;

    // ========================================
    // State
    // ========================================

    public isLoading = false;
    public config: DashboardConfigV2 | null = null;
    public partTypes: DashboardPartTypeEntity[] = [];
    public hasUnsavedChanges = false;

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
     * Add a new panel to the dashboard
     */
    public async addPanel(
        partTypeId: string,
        panelConfig: PanelConfig,
        title: string,
        icon?: string,
        location?: LayoutLocation
    ): Promise<void> {
        console.log('[DashboardViewer] addPanel() called');
        console.log('[DashboardViewer] partTypeId:', partTypeId);
        console.log('[DashboardViewer] panelConfig:', panelConfig);
        console.log('[DashboardViewer] title:', title);
        console.log('[DashboardViewer] config exists:', !!this.config);
        console.log('[DashboardViewer] _glService exists:', !!this._glService);

        if (!this.config || !this._glService) {
            console.log('[DashboardViewer] addPanel() early return - missing config or glService');
            return;
        }

        const partType = this.partTypes.find(pt => pt.ID === partTypeId);
        console.log('[DashboardViewer] Found partType:', partType?.Name || 'NOT FOUND');
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
        console.log('[DashboardViewer] Created panel:', panel);

        this.config.panels.push(panel);
        console.log('[DashboardViewer] config.panels now has', this.config.panels.length, 'panels');

        console.log('[DashboardViewer] Calling _glService.addPanel()');
        this._glService.addPanel(panel, location);
        console.log('[DashboardViewer] _glService.addPanel() complete');

        // Sync the layout config from Golden Layout to capture the new panel's position
        // This is critical for persistence - without this, the new panel's layout info is lost
        const currentLayout = this._glService.getLayoutConfig();
        if (currentLayout) {
            this.config.layout = currentLayout;
            console.log('[DashboardViewer] Synced layout config after adding panel');
        }

        this.markDirty();
    }

    /**
     * Remove a panel from the dashboard
     */
    public removePanel(panelId: string): void {
        if (!this.config || !this._glService) return;

        // Remove from config
        const index = this.config.panels.findIndex(p => p.id === panelId);
        if (index >= 0) {
            this.config.panels.splice(index, 1);
        }

        // Remove from layout
        this._glService.removePanel(panelId);

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
    public getConfig(): DashboardConfigV2 | null {
        return this.config;
    }

    /**
     * Get available part types
     */
    public getPartTypes(): DashboardPartTypeEntity[] {
        return this.partTypes;
    }

    /**
     * Get a panel by ID
     */
    public getPanel(panelId: string): DashboardPanel | undefined {
        return this.config?.panels.find(p => p.id === panelId);
    }

    /**
     * Get the part type for a panel
     */
    public getPartTypeForPanel(panelId: string): DashboardPartTypeEntity | undefined {
        const panel = this.getPanel(panelId);
        if (!panel) return undefined;
        return this.partTypes.find(pt => pt.ID === panel.partTypeId);
    }

    /**
     * Update a panel's configuration
     */
    public updatePanelConfig(panelId: string, config: PanelConfig, title?: string, icon?: string): void {
        const panel = this.config?.panels.find(p => p.id === panelId);
        if (!panel) return;

        panel.config = config;
        if (title) panel.title = title;
        if (icon) panel.icon = icon;

        this.markDirty();

        // Sync the layout config from Golden Layout before reinitializing
        // This preserves all panels that were added dynamically
        if (this._glService && this.config) {
            const currentLayout = this._glService.getLayoutConfig();
            if (currentLayout) {
                this.config.layout = currentLayout;
            }
        }

        // Refresh the panel to show updated content
        if (this._glService) {
            this.initializeLayout();
        }
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

    private parseOrCreateConfig(): DashboardConfigV2 {
        if (!this._dashboard?.UIConfigDetails) {
            return createDefaultDashboardConfig();
        }

        try {
            const parsed = JSON.parse(this._dashboard.UIConfigDetails);

            // Check if it's V2 config
            if (parsed.version === 2) {
                return parsed as DashboardConfigV2;
            }

            // Try to migrate from V1 or return default
            return this.migrateFromV1(parsed);
        } catch {
            return createDefaultDashboardConfig();
        }
    }

    private migrateFromV1(v1Config: Record<string, unknown>): DashboardConfigV2 {
        // TODO: Implement V1 to V2 migration if needed
        // For now, return a default config
        console.warn('Dashboard config migration from V1 not yet implemented');
        return createDefaultDashboardConfig();
    }

    // ========================================
    // Private Methods - Layout
    // ========================================

    private initializeLayout(): void {
        console.log('[DashboardViewer] initializeLayout() called');
        console.log('[DashboardViewer] config:', this.config);
        console.log('[DashboardViewer] layoutContainer:', !!this.layoutContainer?.nativeElement);

        if (!this.config || !this.layoutContainer?.nativeElement) {
            console.log('[DashboardViewer] initializeLayout() early return - missing config or container');
            return;
        }

        console.log('[DashboardViewer] config.panels:', this.config.panels);
        console.log('[DashboardViewer] config.layout:', this.config.layout);

        // Destroy existing layout
        this.destroyLayout();

        // Create new Golden Layout service
        this._glService = new GoldenLayoutWrapperService();
        console.log('[DashboardViewer] Created GoldenLayoutWrapperService');

        // Subscribe to layout events
        this.subscribeToLayoutEvents();

        // Check if we have a saved layout to restore
        const hasSavedLayout = this.hasSavedLayoutStructure(this.config.layout);
        console.log('[DashboardViewer] hasSavedLayout:', hasSavedLayout);

        if (hasSavedLayout) {
            // RESTORE MODE: Use the saved layout structure which includes panel positions
            // This preserves user's custom arrangements (stacks, rows, columns, widths, heights)
            console.log('[DashboardViewer] Restoring saved layout structure');
            this._glService.initialize(
                this.layoutContainer.nativeElement,
                this.config.layout,
                (panelId, container) => {
                    console.log('[DashboardViewer] Panel factory called for panelId:', panelId);
                    this.createPanelComponent(panelId, container);
                }
            );
        } else {
            // FRESH MODE: Initialize with empty config and add panels one-by-one
            // This is for new dashboards or configs without layout structure
            console.log('[DashboardViewer] No saved layout, adding panels fresh');
            const emptyConfig: GoldenLayoutConfig = {
                root: {
                    type: 'row',
                    content: []
                }
            };

            this._glService.initialize(
                this.layoutContainer.nativeElement,
                emptyConfig,
                (panelId, container) => {
                    console.log('[DashboardViewer] Panel factory called for panelId:', panelId);
                    this.createPanelComponent(panelId, container);
                }
            );

            // Add panels one-by-one (like shell's createTab pattern)
            console.log('[DashboardViewer] Adding panels:', this.config.panels.length);
            for (const panel of this.config.panels) {
                console.log('[DashboardViewer] Adding panel:', panel.id, panel.title);
                this._glService.addPanel(panel);
            }
        }

        console.log('[DashboardViewer] initializeLayout() complete');
    }

    /**
     * Check if the saved layout has actual component structure to restore.
     * A layout is considered "saved" if it has nested content with componentState.
     * This indicates the user has arranged panels and we should preserve that.
     */
    private hasSavedLayoutStructure(layout: GoldenLayoutConfig | null | undefined): boolean {
        if (!layout?.root) {
            return false;
        }

        // Recursively check if any node has componentState (actual panel references)
        const hasComponents = (node: LayoutNode): boolean => {
            // If this node is a component with a panelId, we have saved structure
            if (node.componentState?.panelId) {
                return true;
            }

            // Check children
            if (node.content && node.content.length > 0) {
                return node.content.some((child: LayoutNode) => hasComponents(child));
            }

            return false;
        };

        return hasComponents(layout.root);
    }

    private destroyLayout(): void {
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
        // Remove from config
        if (this.config) {
            const index = this.config.panels.findIndex(p => p.id === panelId);
            if (index >= 0) {
                this.config.panels.splice(index, 1);
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

    private createPanelComponent(panelId: string, container: HTMLElement): void {
        console.log('[DashboardViewer] createPanelComponent() panelId:', panelId);
        console.log('[DashboardViewer] Available panels in config:', this.config?.panels.map(p => ({ id: p.id, title: p.title })));

        const panel = this.config?.panels.find(p => p.id === panelId);
        if (!panel) {
            console.log('[DashboardViewer] Panel not found in config for panelId:', panelId);
            return;
        }

        console.log('[DashboardViewer] Found panel:', panel);
        const partType = this.partTypes.find(pt => pt.ID === panel.partTypeId);
        console.log('[DashboardViewer] Part type:', partType?.Name || 'NOT FOUND');

        // Create the panel wrapper with header and content
        const wrapper = document.createElement('div');
        wrapper.className = 'dashboard-part-wrapper';
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; background: #fff;';

        // Create header
        const header = this.createPartHeader(panel, panelId);
        wrapper.appendChild(header);

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
        this._panelComponents.set(panelId, { wrapper, componentRef: componentRef || undefined });
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
            console.log('[DashboardViewer] No DriverClass for part type:', partType?.Name);
            return null;
        }

        try {
            console.log('[DashboardViewer] Creating dynamic component via ClassFactory:', partType.DriverClass);

            // Use ClassFactory to create instance and get the component class
            const partInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDashboardPart>(
                BaseDashboardPart,
                partType.DriverClass
            );

            if (!partInstance) {
                console.warn('[DashboardViewer] ClassFactory returned null for:', partType.DriverClass);
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

            // Attach component to DOM
            container.appendChild(componentRef.location.nativeElement);

            // Attach to Angular's change detection
            this.appRef.attachView(componentRef.hostView);

            console.log('[DashboardViewer] Successfully created dynamic component for:', partType.DriverClass);
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

    private renderWebURLPart(panel: DashboardPanel, container: HTMLElement, config: WebURLPanelConfig): void {
        if (!config.url) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-globe" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No URL Configured</h4>
                    <p style="margin: 0; font-size: 13px;">Click the configure button to set a URL for this part.</p>
                </div>
            `;
            return;
        }

        // Determine sandbox permissions based on mode
        let sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
        if (config.sandboxMode === 'strict') {
            sandbox = 'allow-scripts';
        } else if (config.sandboxMode === 'permissive') {
            sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation';
        }

        const iframe = document.createElement('iframe');
        iframe.src = config.url;
        iframe.style.cssText = 'width: 100%; height: 100%; border: none;';
        iframe.sandbox.value = sandbox;
        if (config.allowFullscreen) {
            iframe.allowFullscreen = true;
        }
        iframe.title = panel.title;

        container.appendChild(iframe);
    }

    private renderViewPart(panel: DashboardPanel, container: HTMLElement, config: ViewPanelConfig): void {
        if (!config.viewId && !config.entityName) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-table" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No View Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select a view for this part.</p>
                </div>
            `;
            return;
        }

        const viewInfo = config.viewId ? config.viewId.substring(0, 8) + '...' : config.entityName;
        const displayMode = config.displayMode === 'grid' ? 'Grid View' : config.displayMode === 'cards' ? 'Card View' : 'Timeline View';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #fff;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-table" style="font-size: 20px; color: #5c6bc0;"></i>
                        <div>
                            <div style="font-weight: 500; color: #333; font-size: 14px;">Entity View</div>
                            <div style="font-size: 12px; color: #666;">${config.entityName || 'View ' + viewInfo}</div>
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

    private renderQueryPart(panel: DashboardPanel, container: HTMLElement, config: QueryPanelConfig): void {
        if (!config.queryId && !config.queryName) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-database" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No Query Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select a query for this part.</p>
                </div>
            `;
            return;
        }

        const queryInfo = config.queryName || (config.queryId ? config.queryId.substring(0, 8) + '...' : 'Unknown');
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: #fff;">
                <div style="padding: 16px 20px; border-bottom: 1px solid #e0e0e0; background: #fafafa;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-database" style="font-size: 20px; color: #5c6bc0;"></i>
                        <div>
                            <div style="font-weight: 500; color: #333; font-size: 14px;">Query Results</div>
                            <div style="font-size: 12px; color: #666;">${queryInfo}</div>
                        </div>
                        <span style="margin-left: auto; padding: 4px 10px; background: #e8f5e9; color: #388e3c; border-radius: 12px; font-size: 11px; font-weight: 500;">${config.autoRefreshSeconds > 0 ? 'Refresh: ' + config.autoRefreshSeconds + 's' : 'Manual refresh'}</span>
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

    private renderArtifactPart(panel: DashboardPanel, container: HTMLElement, config: ArtifactPanelConfig): void {
        if (!config.artifactId) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                    <i class="fa-solid fa-cube" style="font-size: 48px; color: #ccc; margin-bottom: 16px;"></i>
                    <h4 style="margin: 0 0 8px 0; color: #333;">No Artifact Selected</h4>
                    <p style="margin: 0; font-size: 13px;">Click configure to select an artifact for this part.</p>
                </div>
            `;
            return;
        }

        const artifactInfo = config.artifactId.substring(0, 8) + '...';
        const versionInfo = config.versionNumber ? `v${config.versionNumber}` : 'Latest';
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
        const panel = this.config?.panels.find(p => p.id === panelId);
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

        // Reinitialize layout to update headers (which show/hide edit buttons)
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
