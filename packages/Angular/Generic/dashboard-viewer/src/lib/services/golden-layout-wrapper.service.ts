import { Injectable, ComponentRef, ViewContainerRef, Type } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
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
 * Service that wraps Golden Layout for Angular integration.
 * Handles all Golden Layout operations and converts between GL config and our types.
 *
 * NOTE: This is a simplified implementation that can be enhanced with
 * actual Golden Layout integration later. For now, it provides the
 * interface and basic layout management.
 */
@Injectable()
export class GoldenLayoutWrapperService {
    // ========================================
    // State
    // ========================================

    private _initialized = false;
    private _container: HTMLElement | null = null;
    private _config: GoldenLayoutConfig | null = null;
    private _panelContainers = new Map<string, HTMLElement>();
    private _componentFactory: PanelComponentFactory | null = null;

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
        this._container = container;
        this._config = config;
        this._componentFactory = componentFactory;
        this._initialized = true;

        // Build the initial layout
        this.buildLayout();
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
        // Clean up panel containers
        this._panelContainers.forEach((container, panelId) => {
            container.remove();
        });
        this._panelContainers.clear();

        // Clear container
        if (this._container) {
            this._container.innerHTML = '';
        }

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
        if (!this._config || !this._container) return;

        // Create a component node for this panel
        const componentNode: LayoutNode = {
            type: 'component',
            componentState: { panelId: panel.id },
            title: panel.title
        };

        // Add to layout based on location
        if (location?.targetPanelId && location.position) {
            this.insertPanelAtLocation(componentNode, location);
        } else {
            // Default: add to root row
            this.addToRootRow(componentNode);
        }

        // Create container and render panel
        this.createPanelContainer(panel.id);

        // Update observables
        this.updatePanelsList();
        this.emitLayoutChanged('resize');
    }

    /**
     * Remove a panel from the layout
     */
    public removePanel(panelId: string): void {
        if (!this._config) return;

        // Remove from layout tree
        this.removePanelFromLayout(this._config.root, panelId);

        // Remove container
        const container = this._panelContainers.get(panelId);
        if (container) {
            container.remove();
            this._panelContainers.delete(panelId);
        }

        // Emit events
        this.onPanelClosed.next(panelId);
        this.updatePanelsList();
        this.emitLayoutChanged('close');
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

    // ========================================
    // State Management
    // ========================================

    /**
     * Get the current layout configuration
     */
    public getLayoutConfig(): GoldenLayoutConfig | null {
        return this._config;
    }

    /**
     * Apply a layout configuration
     */
    public applyLayoutConfig(config: GoldenLayoutConfig): void {
        this._config = config;
        this.rebuildLayout();
    }

    /**
     * Get the container element for a panel
     */
    public getPanelContainer(panelId: string): HTMLElement | null {
        return this._panelContainers.get(panelId) || null;
    }

    /**
     * Get all panel IDs in the current layout
     */
    public getPanelIds(): string[] {
        return Array.from(this._panelContainers.keys());
    }

    // ========================================
    // Private Methods
    // ========================================

    private buildLayout(): void {
        if (!this._config || !this._container) return;

        // Clear existing
        this._container.innerHTML = '';
        this._panelContainers.clear();

        // Build DOM structure from config
        this.buildLayoutNode(this._config.root, this._container);

        this.updatePanelsList();
    }

    private rebuildLayout(): void {
        // Save current panel IDs
        const existingPanels = new Set(this._panelContainers.keys());

        // Rebuild
        this.buildLayout();

        // Emit close events for removed panels
        existingPanels.forEach(panelId => {
            if (!this._panelContainers.has(panelId)) {
                this.onPanelClosed.next(panelId);
            }
        });
    }

    private buildLayoutNode(node: LayoutNode, parentElement: HTMLElement): void {
        const element = document.createElement('div');

        switch (node.type) {
            case 'row':
                element.className = 'gl-row';
                element.style.cssText = 'display: flex; flex-direction: row; flex: 1; min-height: 0;';
                break;
            case 'column':
                element.className = 'gl-column';
                element.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-width: 0;';
                break;
            case 'stack':
                element.className = 'gl-stack';
                element.style.cssText = 'display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0;';
                break;
            case 'component':
                element.className = 'gl-component';
                element.style.cssText = 'flex: 1; min-width: 0; min-height: 0; overflow: hidden; position: relative;';
                if (node.componentState?.panelId) {
                    this.createPanelContainer(node.componentState.panelId, element);
                }
                break;
        }

        // Apply size hints
        if (node.width) {
            element.style.flex = `${node.width} 1 0%`;
        }
        if (node.height) {
            element.style.flex = `${node.height} 1 0%`;
        }

        parentElement.appendChild(element);

        // Recursively build children
        if (node.content) {
            node.content.forEach(child => this.buildLayoutNode(child, element));
        }
    }

    private createPanelContainer(panelId: string, parentElement?: HTMLElement): void {
        if (!this._container || !this._componentFactory) return;

        const container = document.createElement('div');
        container.className = 'dashboard-panel-container';
        container.style.cssText = 'width: 100%; height: 100%; overflow: hidden;';
        container.setAttribute('data-panel-id', panelId);

        if (parentElement) {
            parentElement.appendChild(container);
        } else {
            // If no parent specified, this is a standalone panel being added
            this._container.appendChild(container);
        }

        this._panelContainers.set(panelId, container);

        // Call the factory to render the component
        this._componentFactory(panelId, container);
    }

    private addToRootRow(node: LayoutNode): void {
        if (!this._config) return;

        // Ensure root is a row
        if (this._config.root.type !== 'row') {
            // Wrap existing root in a row
            const existingRoot = { ...this._config.root };
            this._config.root = {
                type: 'row',
                content: [existingRoot, node]
            };
        } else {
            // Add to existing row
            if (!this._config.root.content) {
                this._config.root.content = [];
            }
            this._config.root.content.push(node);
        }
    }

    private insertPanelAtLocation(node: LayoutNode, location: LayoutLocation): void {
        if (!this._config || !location.targetPanelId) return;

        // Find the target panel in the layout
        const result = this.findPanelNode(this._config.root, location.targetPanelId, null);
        if (!result) {
            // Target not found, add to root
            this.addToRootRow(node);
            return;
        }

        const { parent, index } = result;
        if (!parent || !parent.content) {
            this.addToRootRow(node);
            return;
        }

        switch (location.position) {
            case 'right':
            case 'left':
                // Create or use a row
                if (parent.type === 'row') {
                    const insertIndex = location.position === 'right' ? index + 1 : index;
                    parent.content.splice(insertIndex, 0, node);
                } else {
                    // Wrap in a row
                    const targetNode = parent.content[index];
                    const newRow: LayoutNode = {
                        type: 'row',
                        content: location.position === 'right'
                            ? [targetNode, node]
                            : [node, targetNode]
                    };
                    parent.content[index] = newRow;
                }
                break;

            case 'top':
            case 'bottom':
                // Create or use a column
                if (parent.type === 'column') {
                    const insertIndex = location.position === 'bottom' ? index + 1 : index;
                    parent.content.splice(insertIndex, 0, node);
                } else {
                    // Wrap in a column
                    const targetNode = parent.content[index];
                    const newColumn: LayoutNode = {
                        type: 'column',
                        content: location.position === 'bottom'
                            ? [targetNode, node]
                            : [node, targetNode]
                    };
                    parent.content[index] = newColumn;
                }
                break;

            case 'tab':
                // Create or use a stack
                if (parent.type === 'stack') {
                    parent.content.push(node);
                } else {
                    // Wrap in a stack
                    const targetNode = parent.content[index];
                    const newStack: LayoutNode = {
                        type: 'stack',
                        content: [targetNode, node]
                    };
                    parent.content[index] = newStack;
                }
                break;
        }
    }

    private findPanelNode(
        node: LayoutNode,
        panelId: string,
        parent: LayoutNode | null,
        parentIndex: number = 0
    ): { node: LayoutNode; parent: LayoutNode | null; index: number } | null {
        if (node.type === 'component' && node.componentState?.panelId === panelId) {
            return { node, parent, index: parentIndex };
        }

        if (node.content) {
            for (let i = 0; i < node.content.length; i++) {
                const result = this.findPanelNode(node.content[i], panelId, node, i);
                if (result) return result;
            }
        }

        return null;
    }

    private removePanelFromLayout(node: LayoutNode, panelId: string): boolean {
        if (!node.content) return false;

        for (let i = 0; i < node.content.length; i++) {
            const child = node.content[i];

            if (child.type === 'component' && child.componentState?.panelId === panelId) {
                node.content.splice(i, 1);

                // Clean up empty containers
                if (node.content.length === 0 && node !== this._config?.root) {
                    // This container is now empty, should be removed by parent
                }

                return true;
            }

            if (this.removePanelFromLayout(child, panelId)) {
                // Clean up single-child containers
                if (child.content && child.content.length === 1) {
                    node.content[i] = child.content[0];
                } else if (child.content && child.content.length === 0) {
                    node.content.splice(i, 1);
                }
                return true;
            }
        }

        return false;
    }

    private updatePanelsList(): void {
        this.panels$.next(Array.from(this._panelContainers.keys()));
    }

    private emitLayoutChanged(changeType: LayoutChangedEvent['changeType']): void {
        if (this._config) {
            this.onLayoutChanged.next({
                layout: this._config,
                changeType
            });
        }
    }
}
