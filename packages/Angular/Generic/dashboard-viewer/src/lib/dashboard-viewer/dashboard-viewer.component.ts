import {
    Component,
    Input,
    Output,
    EventEmitter,
    OnInit,
    OnDestroy,
    ViewChild,
    ElementRef,
    ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata, RunView } from '@memberjunction/core';
import { DashboardEntity, DashboardPartTypeEntity } from '@memberjunction/core-entities';
import {
    DashboardConfigV2,
    DashboardPanel,
    PanelConfig,
    PanelInteractionEvent,
    DashboardConfigChangedEvent,
    LayoutChangedEvent,
    createDefaultDashboardConfig,
    generatePanelId,
    WebURLPanelConfig,
    ViewPanelConfig,
    QueryPanelConfig,
    ArtifactPanelConfig
} from '../models/dashboard-types';
import { GoldenLayoutWrapperService, LayoutLocation } from '../services/golden-layout-wrapper.service';

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
    styleUrls: ['./dashboard-viewer.component.css']
})
export class DashboardViewerComponent implements OnInit, OnDestroy {
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
    private readonly _panelComponents = new Map<string, HTMLElement>();
    private _glService: GoldenLayoutWrapperService | null = null;

    // ========================================
    // Constructor
    // ========================================

    constructor(
        private readonly cdr: ChangeDetectorRef
    ) {}

    // ========================================
    // Lifecycle
    // ========================================

    ngOnInit(): void {
        this.loadPartTypes();
    }

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
        if (!this.config || !this._glService) return;

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

        this.config.panels.push(panel);
        this._glService.addPanel(panel, location);

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
            const rv = new RunView();
            const result = await rv.RunView<DashboardPartTypeEntity>({
                EntityName: 'MJ: Dashboard Part Types',
                ExtraFilter: 'IsActive = 1',
                OrderBy: 'SortOrder ASC',
                ResultType: 'entity_object'
            });

            if (result.Success) {
                this.partTypes = result.Results;
            }
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

    private onDashboardChanged(): void {
        if (!this._dashboard) return;

        // Parse or create config
        this.config = this.parseOrCreateConfig();

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
        if (!this.config || !this.layoutContainer?.nativeElement) return;

        // Destroy existing layout
        this.destroyLayout();

        // Create new Golden Layout service
        this._glService = new GoldenLayoutWrapperService();

        // Subscribe to layout events
        this.subscribeToLayoutEvents();

        // Initialize Golden Layout
        this._glService.initialize(
            this.layoutContainer.nativeElement,
            this.config.layout,
            (panelId, container) => this.createPanelComponent(panelId, container)
        );
    }

    private destroyLayout(): void {
        // Destroy all panel components
        this._panelComponents.forEach((componentRef, panelId) => {
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
        const panel = this.config?.panels.find(p => p.id === panelId);
        if (!panel) return;

        const partType = this.partTypes.find(pt => pt.ID === panel.partTypeId);

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

        // Render part content based on type
        this.renderPartContent(panel, content, partType);

        wrapper.appendChild(content);
        container.appendChild(wrapper);

        // Store reference for cleanup
        this._panelComponents.set(panelId, wrapper);
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
        const viewInfo = config.viewId ? `View ID: ${config.viewId}` : (config.entityName ? `Entity: ${config.entityName}` : 'Not configured');
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                <i class="fa-solid fa-table" style="font-size: 48px; color: #5c6bc0; margin-bottom: 16px;"></i>
                <h4 style="margin: 0 0 8px 0; color: #333;">View Part</h4>
                <p style="margin: 0 0 4px 0; font-size: 13px;">${viewInfo}</p>
                <p style="margin: 0; font-size: 12px; color: #999;">Display mode: ${config.displayMode}</p>
            </div>
        `;
    }

    private renderQueryPart(panel: DashboardPanel, container: HTMLElement, config: QueryPanelConfig): void {
        const queryInfo = config.queryId || config.queryName || 'Not configured';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                <i class="fa-solid fa-flask" style="font-size: 48px; color: #5c6bc0; margin-bottom: 16px;"></i>
                <h4 style="margin: 0 0 8px 0; color: #333;">Query Part</h4>
                <p style="margin: 0; font-size: 13px;">Query: ${queryInfo}</p>
            </div>
        `;
    }

    private renderArtifactPart(panel: DashboardPanel, container: HTMLElement, config: ArtifactPanelConfig): void {
        const artifactInfo = config.artifactId || 'Not configured';
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; text-align: center; padding: 24px;">
                <i class="fa-solid fa-palette" style="font-size: 48px; color: #5c6bc0; margin-bottom: 16px;"></i>
                <h4 style="margin: 0 0 8px 0; color: #333;">Artifact Part</h4>
                <p style="margin: 0; font-size: 13px;">Artifact: ${artifactInfo}</p>
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
        // For placeholder implementation, just remove from the DOM if present
        this._panelComponents.delete(panelId);
    }

    private updatePanelEditModes(): void {
        // For placeholder implementation, refresh the layout
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
