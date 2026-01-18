import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import {
    LayoutConfig,
    ResolvedLayoutConfig,
    ComponentContainer,
    JsonValue,
    RowOrColumnItemConfig,
    StackItemConfig,
    ComponentItemConfig,
    RootItemConfig
} from 'golden-layout';
import {
    GoldenLayoutConfig,
    LayoutNode,
    LayoutComponentState,
    DashboardPanel,
    LayoutChangedEvent
} from '../models/dashboard-types';

// Golden Layout interfaces for VirtualLayout
interface GLVirtualLayout {
    rootItem: GLLayoutItem | null;
    on(event: string, callback: (item?: unknown) => void): void;
    destroy(): void;
    loadLayout(config: LayoutConfig): void;
    saveLayout(): ResolvedLayoutConfig;
    addItemAtLocation(config: ComponentItemConfig, location: Array<{ typeId: number }>): void;
    addComponent(componentType: string, componentState: Record<string, unknown>, title: string): void;
    setSize(width: number, height: number): void;
}

interface GLLayoutItem {
    type: string;
    contentItems?: GLLayoutItem[];
    container?: ComponentContainer;
    addItem(config: ComponentItemConfig): void;
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
 * Uses Golden Layout 2.6.0 VirtualLayout API like the shell's GoldenLayoutManager.
 */
@Injectable()
export class GoldenLayoutWrapperService {
    private _initialized = false;
    private _layout: GLVirtualLayout | null = null;
    private _containerElement: HTMLElement | null = null;
    private _componentFactory: PanelComponentFactory | null = null;
    private _containerMap = new Map<string, ComponentContainer>();
    private _isEditing = false;

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

    /** Whether layout editing (drag/drop/resize/close) is enabled */
    public get isEditing(): boolean {
        return this._isEditing;
    }

    /**
     * Initialize Golden Layout in the specified container
     * Uses VirtualLayout like the shell's GoldenLayoutManager
     * @param container The HTML element to render Golden Layout in
     * @param config The layout configuration
     * @param componentFactory Factory function to create panel content
     * @param isEditing Whether editing (drag/drop/resize/close) is enabled
     */
    public initialize(
        container: HTMLElement,
        config: GoldenLayoutConfig,
        componentFactory: PanelComponentFactory,
        isEditing = false
    ): void {
        this._componentFactory = componentFactory;
        this._containerElement = container;
        this._isEditing = isEditing;

        // Import VirtualLayout dynamically at runtime (like shell does)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { VirtualLayout } = require('golden-layout');

        // Convert our config to Golden Layout's LayoutConfig format
        const glConfig = this.convertToGLConfig(config);

        // Create VirtualLayout instance with bind/unbind callbacks
        this._layout = new VirtualLayout(
            container,
            this.bindComponentEventListener.bind(this),
            this.unbindComponentEventListener.bind(this)
        ) as GLVirtualLayout;

        // Enable automatic resize when container size changes
        (this._layout as unknown as { resizeWithContainerAutomatically: boolean }).resizeWithContainerAutomatically = true;

        // Subscribe to events
        this._layout.on('stateChanged', () => {
            this.emitLayoutChanged('resize');
        });

        // Load the layout configuration
        this._layout.loadLayout(glConfig);

        // CRITICAL: Set the size of Golden Layout to match the container
        // Without this, all internal elements will have height: 0
        const rect = container.getBoundingClientRect();
        this._layout.setSize(rect.width, rect.height);

        // Retry setSize after delays to handle timing issues with flexbox layout
        setTimeout(() => this.updateSize(), 50);
        setTimeout(() => this.updateSize(), 150);
        setTimeout(() => this.updateSize(), 300);

        this._initialized = true;
        this.updatePanelsList();
    }

    /**
     * Update layout size to match container.
     */
    public updateSize(): void {
        if (this._layout && this._containerElement) {
            const rect = this._containerElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this._layout.setSize(rect.width, rect.height);
            }
        }
    }

    /**
     * Bind component event listener (called by Golden Layout VirtualLayout)
     */
    private bindComponentEventListener(
        container: ComponentContainer,
        itemConfig: { componentState: Record<string, unknown> }
    ): { component: HTMLElement; virtual: boolean } {
        const state = container.state as unknown as DashboardPanelState;

        // Create a wrapper element for our panel content
        const wrapper = document.createElement('div');
        wrapper.className = 'dashboard-panel-content';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.overflow = 'auto';

        if (!state?.panelId) {
            wrapper.innerHTML = '<div class="panel-error">No panel ID provided</div>';
        } else {

            // Store reference to container
            this._containerMap.set(state.panelId, container);

            // Create the panel content via factory
            if (this._componentFactory) {
                this._componentFactory(state.panelId, wrapper);
            }

            // Listen for close events
            container.on('beforeComponentRelease', () => {
                this._containerMap.delete(state.panelId);
                this.onPanelClosed.next(state.panelId);
                this.updatePanelsList();
            });

            // Listen for show/focus events
            container.on('show', () => {
                this.onPanelSelected.next(state.panelId);
            });

            this.updatePanelsList();
        }

        // CRITICAL: Append the wrapper to container.element (.lm_content)
        // Golden Layout does NOT automatically append the returned component to the DOM
        // We must do this ourselves - this is how the shell's tab-container works
        container.element.appendChild(wrapper);

        // Return the bindable component object
        return {
            component: wrapper,
            virtual: false  // false means actual DOM content
        };
    }

    /**
     * Unbind component event listener (called by Golden Layout VirtualLayout)
     */
    private unbindComponentEventListener(container: ComponentContainer): void {
        // Cleanup handled in beforeComponentRelease
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
        this._initialized = false;
        this._componentFactory = null;
        this._containerElement = null;
    }

    /**
     * Add a panel to the layout
     */
    public addPanel(panel: DashboardPanel, _location?: LayoutLocation): void {
        if (!this._layout) {
            return;
        }

        const state: DashboardPanelState = {
            panelId: panel.id,
            title: panel.title,
            icon: panel.icon,
            partTypeId: panel.partTypeId
        };

        // Try to add to existing stack first, otherwise create new
        const existingStack = this.findFirstStack();
        if (existingStack) {
            const componentConfig: ComponentItemConfig = {
                type: 'component',
                componentType: 'dashboard-panel',
                componentState: state as unknown as JsonValue,
                title: panel.title,
                isClosable: true
            };
            existingStack.addItem(componentConfig);
        } else {
            // Use addComponent which will create a stack
            this._layout.addComponent(
                'dashboard-panel',
                state as unknown as Record<string, unknown>,
                panel.title
            );
        }

        this.emitLayoutChanged('resize');
    }

    /**
     * Find first stack in layout
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
        if (!this._layout) return null;

        try {
            const resolved = this._layout.saveLayout();
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
        if (this._layout) {
            const glConfig = this.convertToGLConfig(config);
            this._layout.loadLayout(glConfig);
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
     * Set editing mode and update Golden Layout settings.
     * When editing is disabled, drag/drop/resize/close are all locked.
     * Note: This requires reinitializing the layout to apply settings changes.
     * @param isEditing Whether to enable editing mode
     */
    public setEditingMode(isEditing: boolean): void {
        this._isEditing = isEditing;
        // Note: Golden Layout 2 doesn't support changing settings after initialization
        // The layout must be reinitialized to apply new settings
        // The component calling this should reinitialize the layout if settings need to change
    }

    /**
     * Convert our config format to Golden Layout's LayoutConfig format
     * Match shell's config pattern for proper header rendering
     * Settings are controlled by isEditing mode
     */
    private convertToGLConfig(config: GoldenLayoutConfig): LayoutConfig {
        return {
            root: this.convertLayoutNode(config.root),
            settings: {
                // Disable drag reordering when not editing
                reorderEnabled: this._isEditing
            },
            header: {
                show: 'top',
                popout: false,
                maximise: false,
                // Only show close button when editing
                close: this._isEditing ? 'tab' : false
            }
        };
    }

    /**
     * Convert a layout node to Golden Layout format
     */
    private convertLayoutNode(node: LayoutNode): RootItemConfig {
        if (node.type === 'component' && node.componentState?.panelId) {
            // Build complete component state for Golden Layout
            const state: DashboardPanelState = {
                panelId: node.componentState.panelId,
                title: node.componentState.title || node.title || 'Panel',
                icon: node.componentState.icon,
                partTypeId: node.componentState.partTypeId || ''
            };
            const componentConfig: ComponentItemConfig = {
                type: 'component',
                componentType: 'dashboard-panel',
                componentState: state as unknown as JsonValue,
                title: state.title,
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

        // Handle component nodes - preserve full componentState for reload
        if (glNode.type === 'component') {
            const componentNode = glNode as unknown as { componentState?: DashboardPanelState; title?: string };
            if (componentNode.componentState) {
                // Preserve full component state including panelId, title, icon, partTypeId
                node.componentState = {
                    panelId: componentNode.componentState.panelId,
                    title: componentNode.componentState.title,
                    icon: componentNode.componentState.icon,
                    partTypeId: componentNode.componentState.partTypeId
                };
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
