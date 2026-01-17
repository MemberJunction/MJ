import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import {
    GoldenLayout,
    LayoutConfig,
    ResolvedLayoutConfig,
    ComponentContainer,
    JsonValue,
    RowOrColumnItemConfig,
    StackItemConfig,
    ComponentItemConfig,
    RootItemConfig,
    LayoutManager
} from 'golden-layout';
import {
    GoldenLayoutConfig,
    LayoutNode,
    DashboardPanel,
    LayoutChangedEvent
} from '../models/dashboard-types';

/**
 * Location specifier for adding panels
 */
export interface LayoutLocation {
    /** Target panel ID (add next to this panel) */
    targetPanelId?: string;
    /** Position relative to target */
    position?: 'left' | 'right' | 'top' | 'bottom' | 'tab';
}

/**
 * Panel component factory function type
 */
export type PanelComponentFactory = (panelId: string, container: HTMLElement) => void;

/**
 * State stored in each Golden Layout component
 */
export interface DashboardPanelState {
    panelId: string;
    title: string;
    icon?: string;
    partTypeId: string;
}

/**
 * Service that wraps Golden Layout for Angular integration.
 * Uses Golden Layout 2.6.0 with its standard API - no hacks or workarounds.
 */
@Injectable()
export class GoldenLayoutWrapperService {
    private _initialized = false;
    private _container: HTMLElement | null = null;
    private _goldenLayout: GoldenLayout | null = null;
    private _componentFactory: PanelComponentFactory | null = null;
    private _containerMap = new Map<string, ComponentContainer>();

    /** Emitted when layout configuration changes */
    public onLayoutChanged = new Subject<LayoutChangedEvent>();

    /** Emitted when a panel is closed */
    public onPanelClosed = new Subject<string>();

    /** Emitted when a panel is maximized/restored */
    public onPanelMaximized = new Subject<{ panelId: string; maximized: boolean }>();

    /** Emitted when a panel is selected (in a stack) */
    public onPanelSelected = new Subject<string>();

    /** Current panels in layout */
    public panels$ = new BehaviorSubject<string[]>([]);

    /**
     * Initialize Golden Layout in the specified container
     */
    public initialize(
        container: HTMLElement,
        config: GoldenLayoutConfig,
        componentFactory: PanelComponentFactory
    ): void {
        console.log('[GLWrapper] initialize() called');
        this._container = container;
        this._componentFactory = componentFactory;

        // Convert our config to Golden Layout's LayoutConfig format
        const glConfig = this.convertToGLConfig(config);
        console.log('[GLWrapper] Converted GL config:', JSON.stringify(glConfig, null, 2));

        // Create Golden Layout instance
        this._goldenLayout = new GoldenLayout(container);

        // Register the component type using factory function
        this._goldenLayout.registerComponentFactoryFunction(
            'dashboard-panel',
            (glContainer: ComponentContainer, state: JsonValue | undefined) => {
                this.handleComponentCreation(glContainer, state);
                return undefined; // We handle the component directly
            }
        );

        // Subscribe to events
        this._goldenLayout.on('stateChanged', () => {
            this.emitLayoutChanged('resize');
        });

        // Load the layout configuration
        this._goldenLayout.loadLayout(glConfig);

        this._initialized = true;
        this.updatePanelsList();
        console.log('[GLWrapper] initialize() complete');
    }

    /**
     * Handle component creation when Golden Layout creates a component
     */
    private handleComponentCreation(container: ComponentContainer, state: JsonValue | undefined): void {
        console.log('[GLWrapper] handleComponentCreation called');
        const panelState = state as DashboardPanelState | undefined;

        if (!panelState?.panelId) {
            console.warn('[GLWrapper] No panelId in component state');
            return;
        }

        console.log('[GLWrapper] Creating component for panel:', panelState.panelId);

        // Store reference to container
        this._containerMap.set(panelState.panelId, container);

        // Create the panel content via factory
        if (this._componentFactory) {
            this._componentFactory(panelState.panelId, container.element);
        }

        // Listen for close events
        container.on('beforeComponentRelease', () => {
            this._containerMap.delete(panelState.panelId);
            this.onPanelClosed.next(panelState.panelId);
            this.updatePanelsList();
        });

        // Listen for show/focus events
        container.on('show', () => {
            this.onPanelSelected.next(panelState.panelId);
        });

        this.updatePanelsList();
    }

    /**
     * Check if Golden Layout is initialized
     */
    public isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Destroy Golden Layout and clean up
     */
    public destroy(): void {
        if (this._goldenLayout) {
            this._goldenLayout.destroy();
            this._goldenLayout = null;
        }

        this._containerMap.clear();
        this._initialized = false;
        this._container = null;
        this._componentFactory = null;
    }

    /**
     * Add a panel to the layout
     */
    public addPanel(panel: DashboardPanel, location?: LayoutLocation): void {
        console.log('[GLWrapper] addPanel() called, panel:', panel);

        if (!this._goldenLayout) {
            console.warn('[GLWrapper] Golden Layout not initialized');
            return;
        }

        const state: DashboardPanelState = {
            panelId: panel.id,
            title: panel.title,
            icon: panel.icon,
            partTypeId: panel.partTypeId
        };

        const componentConfig: ComponentItemConfig = {
            type: 'component',
            componentType: 'dashboard-panel',
            componentState: state as unknown as JsonValue,
            title: panel.title,
            isClosable: true
        };

        // Use location selectors to add as a new tab in an existing stack,
        // or create a new row/column if needed
        const locationSelectors: LayoutManager.LocationSelector[] = [
            // First try: add to an existing stack (as a new tab)
            { typeId: LayoutManager.LocationSelector.TypeId.FocusedStack },
            // Second try: add to the first stack found
            { typeId: LayoutManager.LocationSelector.TypeId.FirstStack },
            // Third try: add to first row or column
            { typeId: LayoutManager.LocationSelector.TypeId.FirstRowOrColumn },
            // Last resort: create a new row at root
            { typeId: LayoutManager.LocationSelector.TypeId.Root }
        ];

        // Add the component using location selectors
        this._goldenLayout.addItemAtLocation(componentConfig, locationSelectors);

        this.emitLayoutChanged('resize');
        console.log('[GLWrapper] addPanel() complete');
    }

    /**
     * Remove a panel from the layout
     */
    public removePanel(panelId: string): void {
        const container = this._containerMap.get(panelId);
        if (container) {
            container.close();
        }
    }

    /**
     * Split a panel horizontally (add panel to the right)
     */
    public splitHorizontal(panelId: string, newPanel: DashboardPanel): void {
        this.addPanel(newPanel, { targetPanelId: panelId, position: 'right' });
    }

    /**
     * Split a panel vertically (add panel below)
     */
    public splitVertical(panelId: string, newPanel: DashboardPanel): void {
        this.addPanel(newPanel, { targetPanelId: panelId, position: 'bottom' });
    }

    /**
     * Add a panel as a tab to an existing stack
     */
    public addToStack(panelId: string, newPanel: DashboardPanel): void {
        this.addPanel(newPanel, { targetPanelId: panelId, position: 'tab' });
    }

    /**
     * Maximize a panel
     */
    public maximizePanel(panelId: string): void {
        this.onPanelMaximized.next({ panelId, maximized: true });
    }

    /**
     * Restore a maximized panel
     */
    public restorePanel(panelId: string): void {
        this.onPanelMaximized.next({ panelId, maximized: false });
    }

    /**
     * Focus a panel by ID
     */
    public focusPanel(panelId: string): void {
        const container = this._containerMap.get(panelId);
        if (container) {
            container.focus();
        }
    }

    /**
     * Get the current layout configuration
     */
    public getLayoutConfig(): GoldenLayoutConfig | null {
        if (!this._goldenLayout) return null;

        try {
            const resolved = this._goldenLayout.saveLayout();
            return this.convertFromGLConfig(resolved);
        } catch (error) {
            console.error('[GLWrapper] Failed to save layout:', error);
            return null;
        }
    }

    /**
     * Apply a layout configuration
     */
    public applyLayoutConfig(config: GoldenLayoutConfig): void {
        if (this._goldenLayout) {
            const glConfig = this.convertToGLConfig(config);
            this._goldenLayout.loadLayout(glConfig);
        }
    }

    /**
     * Get the container element for a panel
     */
    public getPanelContainer(panelId: string): HTMLElement | null {
        const container = this._containerMap.get(panelId);
        return container?.element || null;
    }

    /**
     * Get all panel IDs in the current layout
     */
    public getPanelIds(): string[] {
        return Array.from(this._containerMap.keys());
    }

    /**
     * Convert our config format to Golden Layout's LayoutConfig format
     */
    private convertToGLConfig(config: GoldenLayoutConfig): LayoutConfig {
        return {
            root: this.convertLayoutNode(config.root),
            header: {
                popout: false
            }
        };
    }

    /**
     * Convert a layout node to Golden Layout format
     */
    private convertLayoutNode(node: LayoutNode): RootItemConfig {
        if (node.type === 'component' && node.componentState?.panelId) {
            const componentConfig: ComponentItemConfig = {
                type: 'component',
                componentType: 'dashboard-panel',
                componentState: node.componentState as unknown as JsonValue,
                title: node.title || 'Panel',
                isClosable: true
            };
            return componentConfig;
        }

        if (node.type === 'row' || node.type === 'column') {
            const rowColConfig: RowOrColumnItemConfig = {
                type: node.type,
                content: node.content ? node.content.map(child => this.convertLayoutNode(child)) : []
            };
            if (node.width !== undefined) {
                rowColConfig.width = node.width;
            }
            if (node.height !== undefined) {
                rowColConfig.height = node.height;
            }
            return rowColConfig;
        }

        if (node.type === 'stack') {
            const stackConfig: StackItemConfig = {
                type: 'stack',
                content: node.content ? node.content.map(child => {
                    const childConfig = this.convertLayoutNode(child);
                    return childConfig as ComponentItemConfig;
                }) : []
            };
            if (node.width !== undefined) {
                stackConfig.width = node.width;
            }
            if (node.height !== undefined) {
                stackConfig.height = node.height;
            }
            return stackConfig;
        }

        // Default: return an empty stack (enables tabbing by default)
        return {
            type: 'stack',
            content: []
        };
    }

    /**
     * Convert Golden Layout config back to our format
     */
    private convertFromGLConfig(resolved: ResolvedLayoutConfig): GoldenLayoutConfig {
        return {
            root: this.convertFromGLNode(resolved.root)
        };
    }

    /**
     * Convert a GL node back to our format
     */
    private convertFromGLNode(glNode: ResolvedLayoutConfig['root']): LayoutNode {
        if (!glNode) {
            return { type: 'stack', content: [] };
        }

        const node: LayoutNode = {
            type: glNode.type as LayoutNode['type']
        };

        // Handle component nodes
        if (glNode.type === 'component') {
            const componentNode = glNode as unknown as { componentState?: Record<string, unknown>; title?: string };
            if (componentNode.componentState) {
                node.componentState = componentNode.componentState as { panelId: string };
            }
            node.title = componentNode.title;
        }

        // Handle container nodes (row, column, stack)
        const containerNode = glNode as unknown as { width?: number; height?: number; content?: ResolvedLayoutConfig['root'][] };
        if (containerNode.width !== undefined) {
            node.width = containerNode.width;
        }
        if (containerNode.height !== undefined) {
            node.height = containerNode.height;
        }

        if (containerNode.content && Array.isArray(containerNode.content)) {
            node.content = containerNode.content.map(child => this.convertFromGLNode(child));
        }

        return node;
    }

    private updatePanelsList(): void {
        this.panels$.next(Array.from(this._containerMap.keys()));
    }

    private emitLayoutChanged(changeType: LayoutChangedEvent['changeType']): void {
        const layoutConfig = this.getLayoutConfig();
        if (layoutConfig) {
            this.onLayoutChanged.next({
                layout: layoutConfig,
                changeType
            });
        }
    }
}
