import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';
import {
    LayoutConfig,
    ResolvedLayoutConfig,
    ComponentContainer,
    JsonValue,
    ComponentItemConfig,
    VirtualLayout
} from 'golden-layout';
import {
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
 * Panel component factory function type.
 * Receives the full DashboardPanel from GL's componentState (single source of truth).
 */
export type PanelComponentFactory = (panel: DashboardPanel, container: HTMLElement) => void;

/**
 * Service that wraps Golden Layout for Angular integration.
 * Uses Golden Layout 2.6.0 VirtualLayout API.
 *
 * DESIGN: This service works with GL's native ResolvedLayoutConfig format.
 * Full DashboardPanel objects are stored in componentState - no conversion needed.
 */
@Injectable()
export class GoldenLayoutWrapperService {
    private _initialized = false;
    private _layout: GLVirtualLayout | null = null;
    private _containerElement: HTMLElement | null = null;
    private _componentFactory: PanelComponentFactory | null = null;
    private _containerMap = new Map<string, ComponentContainer>();
    private _isEditing = false;
    /** Tracks which panels have been lazily loaded (content created) */
    private _loadedPanels = new Set<string>();

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
     * Initialize Golden Layout in the specified container.
     * @param container The HTML element to render Golden Layout in
     * @param savedLayout Previously saved layout (from saveLayout()) or null for empty
     * @param componentFactory Factory function to create panel content
     * @param isEditing Whether editing (drag/drop/resize/close) is enabled
     */
    public initialize(
        container: HTMLElement,
        savedLayout: ResolvedLayoutConfig | null,
        componentFactory: PanelComponentFactory,
        isEditing = false
    ): void {
        this._componentFactory = componentFactory;
        this._containerElement = container;
        this._isEditing = isEditing;

        // Create VirtualLayout instance with bind/unbind callbacks
        // Cast through unknown: GLVirtualLayout is a subset interface used throughout this service;
        // the structural mismatch with golden-layout's VirtualLayout is intentional.
        this._layout = new VirtualLayout(
            container,
            this.bindComponentEventListener.bind(this) as VirtualLayout.BindComponentEventHandler,
            this.unbindComponentEventListener.bind(this) as VirtualLayout.UnbindComponentEventHandler
        ) as unknown as GLVirtualLayout;

        // Enable automatic resize when container size changes
        (this._layout as unknown as { resizeWithContainerAutomatically: boolean }).resizeWithContainerAutomatically = true;

        // Subscribe to events
        this._layout.on('stateChanged', () => {
            this.emitLayoutChanged('resize');
        });

        // Build the LayoutConfig to load
        const glConfig = this.buildLayoutConfig(savedLayout);

        // Load the layout configuration
        this._layout.loadLayout(glConfig);

        // Set the size of Golden Layout to match the container
        const rect = container.getBoundingClientRect();
        this._layout.setSize(rect.width, rect.height);

        this._initialized = true;
        this.updatePanelsList();
    }

    /**
     * Build LayoutConfig from saved ResolvedLayoutConfig.
     * Uses GL's LayoutConfig.fromResolved() for proper conversion,
     * then applies current edit mode settings.
     */
    private buildLayoutConfig(savedLayout: ResolvedLayoutConfig | null): LayoutConfig {
        // Base settings - reorderEnabled is always true so users can click tabs and
        // rearrange in view mode (changes won't be saved). Close button only in edit mode.
        const baseSettings: LayoutConfig = {
            settings: {
                reorderEnabled: this._isEditing
            },
            header: {
                show: 'top',
                popout: false,
                maximise: false,
                close: this._isEditing ? 'tab' : false
            },
            root: undefined
        };

        // If we have a saved layout, convert it properly using GL's conversion
        if (savedLayout && savedLayout.root) {
            try {
                // Validate the saved layout has required structure
                if (!this.isValidLayoutConfig(savedLayout)) {
                    console.warn('[GoldenLayoutWrapper] Invalid saved layout structure, using default');
                    return baseSettings;
                }

                // Use GL's built-in conversion from ResolvedLayoutConfig to LayoutConfig
                const convertedConfig = LayoutConfig.fromResolved(savedLayout) as LayoutConfig;

                // Merge our base settings with the converted config
                return {
                    ...convertedConfig,
                    settings: {
                        ...convertedConfig.settings,
                        ...baseSettings.settings
                    },
                    header: {
                        ...convertedConfig.header,
                        ...baseSettings.header
                    }
                };
            } catch (err) {
                console.error('[GoldenLayoutWrapper] Error converting saved layout, using default:', err);
                // Fall through to return base settings
            }
        }

        return baseSettings;
    }

    /**
     * Validate that a saved layout config has the required structure for GL conversion.
     * GL's fromResolved() can crash if certain properties are undefined.
     */
    private isValidLayoutConfig(config: ResolvedLayoutConfig): boolean {
        if (!config || !config.root) {
            return false;
        }

        // Check that root has a type
        if (!config.root.type) {
            return false;
        }

        // Recursively validate content items have required properties
        return this.validateLayoutItem(config.root);
    }

    /**
     * Recursively validate a layout item and its children.
     */
    private validateLayoutItem(item: unknown): boolean {
        if (!item || typeof item !== 'object') {
            return false;
        }

        const layoutItem = item as Record<string, unknown>;

        // Must have a type
        if (!layoutItem['type']) {
            return false;
        }

        // If it has content, validate each child
        const content = layoutItem['content'] as unknown[] | undefined;
        if (content && Array.isArray(content)) {
            for (const child of content) {
                if (!this.validateLayoutItem(child)) {
                    return false;
                }
            }
        }

        return true;
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
     * Bind component event listener (called by Golden Layout VirtualLayout).
     * The componentState contains the full DashboardPanel object.
     */
    private bindComponentEventListener(
        container: ComponentContainer,
        _itemConfig: { componentState: Record<string, unknown> }
    ): { component: HTMLElement; virtual: boolean } {
        // componentState IS the DashboardPanel
        const panel = container.state as unknown as DashboardPanel;

        // Create a wrapper element for our panel content
        const wrapper = document.createElement('div');
        wrapper.className = 'dashboard-panel-content';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.overflow = 'auto';

        if (!panel?.id) {
            wrapper.innerHTML = '<div class="panel-error">No panel ID provided</div>';
        } else {
            // Store reference to container
            this._containerMap.set(panel.id, container);

            // Set the tab title (plain text - GL escapes HTML)
            container.setTitle(panel.title);

            // Add icon to the tab element via DOM manipulation
            // This must happen after GL has created the tab element
            // Always add an icon - use panel's icon or a default fallback (cube = generic widget)
            // IMPORTANT: We append to tabElement, NOT modify .lm_title, to preserve GL's drag/drop
            const iconClass = panel.icon || 'fa-solid fa-cube';
            this.addIconToTab(container, iconClass);

            // LAZY LOADING: Show loading placeholder initially
            // Actual content is created when panel is first shown (visible)
            wrapper.innerHTML = `
                <div class="panel-loading" style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">
                    <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i>
                    Loading...
                </div>
            `;

            // Listen for close events
            container.on('beforeComponentRelease', () => {
                this._containerMap.delete(panel.id);
                this._loadedPanels.delete(panel.id);
                this.onPanelClosed.next(panel.id);
                this.updatePanelsList();
            });

            // Listen for show/focus events - LAZY LOAD on first show
            container.on('show', () => {
                // Check if this is first time panel is shown
                if (!this._loadedPanels.has(panel.id)) {
                    // First show - create actual content
                    wrapper.innerHTML = ''; // Clear loading placeholder
                    if (this._componentFactory) {
                        this._componentFactory(panel, wrapper);
                    }
                    this._loadedPanels.add(panel.id);
                }
                this.onPanelSelected.next(panel.id);
            });

            this.updatePanelsList();
        }

        // Append the wrapper to container.element (.lm_content)
        container.element.appendChild(wrapper);

        // Return the bindable component object
        return {
            component: wrapper,
            virtual: false
        };
    }

    /**
     * Unbind component event listener (called by Golden Layout VirtualLayout)
     */
    private unbindComponentEventListener(_container: ComponentContainer): void {
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
        this._loadedPanels.clear();
        this._initialized = false;
        this._componentFactory = null;
        this._containerElement = null;
    }

    /**
     * Add a panel to the layout.
     * The full DashboardPanel is stored in componentState.
     */
    public addPanel(panel: DashboardPanel, _location?: LayoutLocation): void {
        if (!this._layout) {
            return;
        }

        // Try to add to existing stack first, otherwise create new
        const existingStack = this.findFirstStack();
        if (existingStack) {
            const componentConfig: ComponentItemConfig = {
                type: 'component',
                componentType: 'dashboard-panel',
                componentState: panel as unknown as JsonValue,
                title: panel.title,
                isClosable: true
            };
            existingStack.addItem(componentConfig);
        } else {
            // Use addComponent which will create a stack
            this._layout.addComponent(
                'dashboard-panel',
                panel as unknown as Record<string, unknown>,
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
     * Get the current layout configuration.
     * Returns GL's native ResolvedLayoutConfig - no conversion.
     */
    public getLayoutConfig(): ResolvedLayoutConfig | null {
        if (!this._layout) return null;

        try {
            return this._layout.saveLayout();
        } catch (error) {
            console.error('[GLWrapper] Failed to save layout:', error);
            return null;
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
     * Set editing mode.
     * Note: Golden Layout 2 doesn't support changing settings after initialization.
     * The layout must be reinitialized to apply new settings.
     */
    public setEditingMode(isEditing: boolean): void {
        this._isEditing = isEditing;
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

    /**
     * Add an icon to a tab element via DOM manipulation.
     * IMPORTANT: We append to tabElement, NOT modify .lm_title, to preserve GL's drag/drop.
     * This follows the same pattern as the shell's GoldenLayoutManager.
     */
    private addIconToTab(container: ComponentContainer, iconClass: string): void {
        // Normalize the icon class - ensure it has the Font Awesome prefix
        let normalizedIconClass = iconClass.trim();
        if (!normalizedIconClass.includes('fa-') && !normalizedIconClass.includes('fa ')) {
            // If no FA prefix, assume it's a Font Awesome icon name and add fa-solid prefix
            normalizedIconClass = `fa-solid fa-${normalizedIconClass}`;
        } else if (!normalizedIconClass.startsWith('fa-') && !normalizedIconClass.startsWith('fa ')) {
            // Has fa- in it but not at the start - likely just the icon name like "globe"
            // Check if it's missing the style prefix (fa-solid, fa-regular, etc.)
            if (!normalizedIconClass.match(/^fa[srldb]?\s/) && !normalizedIconClass.match(/^fa-(solid|regular|light|duotone|brands)\s/)) {
                normalizedIconClass = `fa-solid ${normalizedIconClass}`;
            }
        }

        // Try immediately, then retry with delay if tab not ready
        const tryAddIcon = (): boolean => {
            const tab = container.tab;
            if (!tab) return false;

            const tabElement = tab.element as HTMLElement;
            if (!tabElement) return false;

            // Check if icon already added to tab element
            if (tabElement.querySelector('.panel-icon')) return true;

            // Create icon element and insert at the beginning of tabElement
            // This preserves GL's .lm_title structure for drag/drop
            // Icon is positioned absolutely via CSS in the left padding area
            const iconEl = document.createElement('i');
            iconEl.className = `${normalizedIconClass} panel-icon`;

            // Insert icon as first child of tab element
            tabElement.insertBefore(iconEl, tabElement.firstChild);
            return true;
        };

        // Try immediately
        if (tryAddIcon()) return;

        // Tab may not be created yet - try again after a delay
        setTimeout(() => {
            if (tryAddIcon()) return;

            // Still not ready - try one more time with longer delay
            setTimeout(() => {
                tryAddIcon();
            }, 100);
        }, 50);
    }
}
