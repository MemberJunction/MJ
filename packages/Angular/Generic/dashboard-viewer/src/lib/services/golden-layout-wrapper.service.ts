import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import {
    GoldenLayoutConfig,
    LayoutNode,
    DashboardPanel,
    LayoutChangedEvent
} from '../models/dashboard-types';

// Golden Layout interfaces - defined here to match GL 2.6.0 API
interface GLComponentContainer {
    state: Record<string, unknown>;
    tab?: { element: HTMLElement };
    on(event: string, callback: () => void): void;
    close(): void;
    focus(): void;
    setTitle(title: string): void;
    element: HTMLElement;
}

interface GLVirtualLayout {
    rootItem: GLLayoutItem | null;
    on(event: string, callback: (item?: unknown) => void): void;
    destroy(): void;
    loadLayout(config: GLLayoutConfig): void;
    saveLayout(): GLResolvedLayoutConfig;
    addItemAtLocation(config: GLComponentItemConfig, location: Array<{ typeId: number }>): void;
    addComponent(componentType: string, componentState: Record<string, unknown>, title: string): void;
    setSize(width: number, height: number): void;
}

interface GLLayoutItem {
    type: string;
    contentItems?: GLLayoutItem[];
    container?: GLComponentContainer;
    addItem(config: GLComponentItemConfig): void;
}

interface GLLayoutConfig {
    root: GLLayoutNode;
    header?: {
        show: string;
        popout: boolean;
        maximise: boolean;
        close: string;
    };
}

interface GLResolvedLayoutConfig {
    root: GLLayoutNode;
}

interface GLLayoutNode {
    type: string;
    content?: GLLayoutNode[];
    componentType?: string;
    componentState?: Record<string, unknown>;
    width?: number;
    height?: number;
    isClosable?: boolean;
    title?: string;
}

interface GLComponentItemConfig {
    type: 'component';
    componentType: string;
    componentState: Record<string, unknown>;
    title: string;
    isClosable?: boolean;
}

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
 * Uses the real Golden Layout VirtualLayout for proper drag-and-drop, tabs, and resizing.
 */
@Injectable()
export class GoldenLayoutWrapperService {
    // ========================================
    // State
    // ========================================

    private _initialized = false;
    private _container: HTMLElement | null = null;
    private _config: GoldenLayoutConfig | null = null;
    private _layout: GLVirtualLayout | null = null;
    private _componentFactory: PanelComponentFactory | null = null;
    private _containerMap = new Map<string, GLComponentContainer>();
    private _panelElements = new Map<string, HTMLElement>();

    // ========================================
    // Observables
    // ========================================

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

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize Golden Layout in the specified container
     */
    public initialize(
        container: HTMLElement,
        config: GoldenLayoutConfig,
        componentFactory: PanelComponentFactory
    ): void {
        console.log('[GLWrapper] initialize() called');
        console.log('[GLWrapper] container:', container);
        console.log('[GLWrapper] config:', config);

        this._container = container;
        this._config = config;
        this._componentFactory = componentFactory;

        // Import Golden Layout dynamically at runtime
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { VirtualLayout } = require('golden-layout');
        console.log('[GLWrapper] VirtualLayout imported:', !!VirtualLayout);

        // Convert our config to GL format
        const glConfig = this.convertToGLConfig(config);
        console.log('[GLWrapper] Converted GL config:', glConfig);

        // Create Virtual Layout with bind/unbind component handlers
        this._layout = new VirtualLayout(
            container,
            this.bindComponentEventListener.bind(this),
            this.unbindComponentEventListener.bind(this)
        ) as GLVirtualLayout;

        // Enable automatic resize when container size changes
        (this._layout as unknown as { resizeWithContainerAutomatically: boolean }).resizeWithContainerAutomatically = true;

        // Configure debounce for responsive resizing
        (this._layout as unknown as { resizeDebounceInterval: number }).resizeDebounceInterval = 50;
        (this._layout as unknown as { resizeDebounceExtendedWhenPossible: boolean }).resizeDebounceExtendedWhenPossible = false;

        // Subscribe to state changes
        this._layout.on('stateChanged', () => {
            if (this._layout) {
                this.emitLayoutChanged('resize');
            }
        });

        this._layout.on('activeContentItemChanged', (item: unknown) => {
            const typedItem = item as { container?: { state?: DashboardPanelState } };
            const state = typedItem?.container?.state;
            if (state?.panelId) {
                this.onPanelSelected.next(state.panelId);
            }
        });

        // Load the configuration
        console.log('[GLWrapper] Calling loadLayout()');
        this._layout.loadLayout(glConfig);
        console.log('[GLWrapper] loadLayout() complete');

        // Set initial size
        const rect = container.getBoundingClientRect();
        console.log('[GLWrapper] Container rect:', rect);
        if (rect.width > 0 && rect.height > 0) {
            this._layout.setSize(rect.width, rect.height);
            console.log('[GLWrapper] Set size to', rect.width, 'x', rect.height);
        } else {
            console.log('[GLWrapper] Container has no size yet, will retry');
        }

        // Retry size updates for timing issues with flexbox
        setTimeout(() => this.updateSize(), 50);
        setTimeout(() => this.updateSize(), 150);
        setTimeout(() => this.updateSize(), 300);

        this._initialized = true;
        this.updatePanelsList();
        console.log('[GLWrapper] initialize() complete, panels:', this.getPanelIds());
    }

    /**
     * Update layout size to match container
     */
    public updateSize(): void {
        if (this._layout && this._container) {
            const rect = this._container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this._layout.setSize(rect.width, rect.height);
            }
        }
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
        if (this._layout) {
            this._layout.destroy();
            this._layout = null;
        }

        this._containerMap.clear();
        this._panelElements.clear();

        this._initialized = false;
        this._container = null;
        this._config = null;
        this._componentFactory = null;
    }

    // ========================================
    // Layout Manipulation
    // ========================================

    /**
     * Add a panel to the layout
     */
    public addPanel(panel: DashboardPanel, location?: LayoutLocation): void {
        console.log('[GLWrapper] addPanel() called, panel:', panel);
        console.log('[GLWrapper] _layout exists:', !!this._layout);
        console.log('[GLWrapper] Current panels before add:', this.getPanelIds());

        if (!this._layout) {
            console.log('[GLWrapper] addPanel() early return - no layout');
            return;
        }

        const state: DashboardPanelState = {
            panelId: panel.id,
            title: panel.title,
            icon: panel.icon,
            partTypeId: panel.partTypeId
        };
        console.log('[GLWrapper] Panel state:', state);

        try {
            // Create the component config
            const componentConfig: GLComponentItemConfig = {
                type: 'component',
                componentType: 'dashboard-panel',
                componentState: state as unknown as Record<string, unknown>,
                title: panel.title,
                isClosable: true
            };

            // Try to find an existing stack or row to add to
            const rootItem = this._layout.rootItem;
            console.log('[GLWrapper] rootItem:', rootItem);
            console.log('[GLWrapper] rootItem?.type:', rootItem?.type);
            console.log('[GLWrapper] rootItem?.contentItems?.length:', rootItem?.contentItems?.length);

            if (rootItem && rootItem.contentItems && rootItem.contentItems.length > 0) {
                // Layout has existing content - find a place to add the new component
                // First try to find a stack to add as a tab
                const stack = this.findFirstStack();
                if (stack) {
                    console.log('[GLWrapper] Found stack, adding item to stack');
                    stack.addItem(componentConfig);
                } else if (rootItem.type === 'row' || rootItem.type === 'column') {
                    // Add directly to the root row/column
                    console.log('[GLWrapper] Adding item to root', rootItem.type);
                    rootItem.addItem(componentConfig);
                } else {
                    // Fallback to addComponent
                    console.log('[GLWrapper] Fallback to addComponent()');
                    this._layout.addComponent(
                        'dashboard-panel',
                        state as unknown as Record<string, unknown>,
                        panel.title
                    );
                }
            } else {
                // Layout is empty - use addComponent which will create the necessary structure
                console.log('[GLWrapper] Layout empty, using addComponent()');
                this._layout.addComponent(
                    'dashboard-panel',
                    state as unknown as Record<string, unknown>,
                    panel.title
                );
            }

            this.updatePanelsList();
            this.emitLayoutChanged('resize');
            console.log('[GLWrapper] addPanel() complete, panels now:', this.getPanelIds());
        } catch (error) {
            console.error('[GLWrapper] Failed to add panel', error);
        }
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

    // ========================================
    // State Management
    // ========================================

    /**
     * Get the current layout configuration
     */
    public getLayoutConfig(): GoldenLayoutConfig | null {
        if (!this._layout) return this._config;

        try {
            const resolved = this._layout.saveLayout();
            return this.convertFromGLConfig(resolved);
        } catch {
            return this._config;
        }
    }

    /**
     * Apply a layout configuration
     */
    public applyLayoutConfig(config: GoldenLayoutConfig): void {
        this._config = config;
        if (this._layout) {
            const glConfig = this.convertToGLConfig(config);
            this._layout.loadLayout(glConfig);
        }
    }

    /**
     * Get the container element for a panel
     */
    public getPanelContainer(panelId: string): HTMLElement | null {
        return this._panelElements.get(panelId) || null;
    }

    /**
     * Get all panel IDs in the current layout
     */
    public getPanelIds(): string[] {
        return Array.from(this._containerMap.keys());
    }

    // ========================================
    // Private Methods - GL Event Handlers
    // ========================================

    /**
     * Bind component event listener (called by Golden Layout)
     */
    private bindComponentEventListener(
        container: GLComponentContainer,
        itemConfig: { componentState: Record<string, unknown> }
    ): { component: HTMLElement; virtual: boolean } {
        console.log('[GLWrapper] bindComponentEventListener() called');
        console.log('[GLWrapper] container.state:', container.state);
        console.log('[GLWrapper] container.element:', container.element);
        console.log('[GLWrapper] itemConfig:', itemConfig);

        const state = container.state as unknown as DashboardPanelState;
        console.log('[GLWrapper] Parsed state:', state);

        // Create container element for the panel
        const element = document.createElement('div');
        element.className = 'dashboard-panel-gl-container';
        element.style.cssText = 'width: 100%; height: 100%; overflow: hidden; background: #fff;';

        if (state?.panelId) {
            console.log('[GLWrapper] Registering panel:', state.panelId);
            this._containerMap.set(state.panelId, container);
            this._panelElements.set(state.panelId, element);

            // Call the factory to render panel content
            if (this._componentFactory) {
                console.log('[GLWrapper] Calling componentFactory for:', state.panelId);
                this._componentFactory(state.panelId, element);
                console.log('[GLWrapper] componentFactory complete, element.children.length:', element.children.length);
            } else {
                console.log('[GLWrapper] WARNING: No componentFactory set!');
            }

            // Listen for show events
            container.on('show', () => {
                this.onPanelSelected.next(state.panelId);
            });

            // Listen for close events
            container.on('beforeComponentRelease', () => {
                this._containerMap.delete(state.panelId);
                this._panelElements.delete(state.panelId);
                this.onPanelClosed.next(state.panelId);
                this.updatePanelsList();
            });
        } else {
            console.log('[GLWrapper] WARNING: No panelId in state!');
        }

        // IMPORTANT: For VirtualLayout, we must manually append to container.element
        // The returned component is not automatically appended by GL VirtualLayout
        console.log('[GLWrapper] Appending element to container.element');
        container.element.appendChild(element);
        console.log('[GLWrapper] container.element.children.length:', container.element.children.length);

        // Return the bindable component object
        console.log('[GLWrapper] Returning bound component element');
        return {
            component: element,
            virtual: false // false means actual DOM content
        };
    }

    /**
     * Unbind component event listener (called by Golden Layout)
     */
    private unbindComponentEventListener(container: GLComponentContainer): void {
        // Cleanup is handled in beforeComponentRelease
    }

    // ========================================
    // Private Methods - Configuration
    // ========================================

    /**
     * Convert our config format to Golden Layout format
     */
    private convertToGLConfig(config: GoldenLayoutConfig): GLLayoutConfig {
        return {
            root: this.convertLayoutNode(config.root),
            header: {
                show: 'top',
                popout: false,
                maximise: true,
                close: 'tab'
            }
        };
    }

    /**
     * Convert a layout node to GL format
     */
    private convertLayoutNode(node: LayoutNode): GLLayoutNode {
        const glNode: GLLayoutNode = {
            type: node.type
        };

        // Convert component nodes
        if (node.type === 'component' && node.componentState?.panelId) {
            glNode.componentType = 'dashboard-panel';
            glNode.componentState = node.componentState;
            glNode.title = node.title || 'Panel';
            glNode.isClosable = true;
        }

        // Add size hints
        if (node.width !== undefined) {
            glNode.width = node.width;
        }
        if (node.height !== undefined) {
            glNode.height = node.height;
        }

        // Convert children
        if (node.content && node.content.length > 0) {
            glNode.content = node.content.map(child => this.convertLayoutNode(child));
        }

        return glNode;
    }

    /**
     * Convert Golden Layout config back to our format
     */
    private convertFromGLConfig(resolved: GLResolvedLayoutConfig): GoldenLayoutConfig {
        return {
            root: this.convertFromGLNode(resolved.root)
        };
    }

    /**
     * Convert a GL node back to our format
     */
    private convertFromGLNode(glNode: GLLayoutNode): LayoutNode {
        const node: LayoutNode = {
            type: glNode.type as LayoutNode['type']
        };

        // Convert component nodes
        if (glNode.type === 'component' && glNode.componentState) {
            node.componentState = glNode.componentState as { panelId: string };
            node.title = glNode.title;
        }

        // Add size hints
        if (glNode.width !== undefined) {
            node.width = glNode.width;
        }
        if (glNode.height !== undefined) {
            node.height = glNode.height;
        }

        // Convert children
        if (glNode.content && glNode.content.length > 0) {
            node.content = glNode.content.map(child => this.convertFromGLNode(child));
        }

        return node;
    }

    // ========================================
    // Private Methods - Utilities
    // ========================================

    /**
     * Find first stack in layout for adding tabs
     */
    private findFirstStack(): GLLayoutItem | null {
        if (!this._layout || !this._layout.rootItem) return null;

        const findStack = (item: GLLayoutItem): GLLayoutItem | null => {
            if (item.type === 'stack') {
                return item;
            }
            if (item.contentItems) {
                for (const child of item.contentItems) {
                    const found = findStack(child);
                    if (found) return found;
                }
            }
            return null;
        };

        return findStack(this._layout.rootItem);
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
