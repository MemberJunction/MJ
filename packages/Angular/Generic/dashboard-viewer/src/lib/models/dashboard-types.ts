/**
 * Types and interfaces for the Dashboard Viewer component.
 * These define the configuration schema for metadata-driven dashboards.
 *
 * DESIGN PRINCIPLE: Single Source of Truth
 * - Golden Layout's native config is the ground truth for layout AND panel data
 * - Full DashboardPanel objects are stored in componentState within the layout
 * - No redundant arrays or conversion functions needed
 */

import { ResolvedLayoutConfig } from 'golden-layout';

// ========================================
// Dashboard Configuration
// ========================================

/**
 * Root configuration for a dashboard.
 * Stored in Dashboard.UIConfigDetails as JSON.
 *
 * The layout contains EVERYTHING - both geometry AND panel configurations.
 * Panel data is embedded in each component's componentState within the layout tree.
 */
export interface DashboardConfig {
    /**
     * Golden Layout configuration - THE SINGLE SOURCE OF TRUTH
     * Contains both layout geometry AND panel configurations (in componentState)
     * Stored as GL's native format for lossless persistence
     */
    layout: ResolvedLayoutConfig | null;
    /** Dashboard-level settings (not per-panel) */
    settings: DashboardSettings;
}

/**
 * Dashboard-level settings
 */
export interface DashboardSettings {
    /** Visual theme */
    theme: 'light' | 'dark';
    /** Show panel headers with title/actions */
    showHeaders: boolean;
    /** Allow panels to pop out into separate windows */
    enablePopout: boolean;
    /** Allow panels to be maximized */
    enableMaximize: boolean;
    /** Allow users to rearrange panels */
    enableDragDrop: boolean;
    /** Allow users to resize panels */
    enableResize: boolean;
}

/**
 * Default dashboard settings
 */
export const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
    theme: 'light',
    showHeaders: true,
    enablePopout: false,
    enableMaximize: true,
    enableDragDrop: true,
    enableResize: true
};

// ========================================
// Panel Configuration (stored in componentState)
// ========================================

/**
 * Complete panel data stored in Golden Layout's componentState.
 * This is the ONLY place panel configuration lives.
 */
export interface DashboardPanel {
    /** Unique panel identifier */
    id: string;
    /** Display title */
    title: string;
    /** Optional icon class (Font Awesome) */
    icon?: string;
    /** Reference to DashboardPartType.ID */
    partTypeId: string;
    /** Type-specific configuration */
    config: PanelConfig;
    /** Persisted panel state (e.g., scroll position, selections) */
    state?: Record<string, unknown>;
}

/**
 * Union type for all panel configurations
 */
export type PanelConfig =
    | ViewPanelConfig
    | QueryPanelConfig
    | ArtifactPanelConfig
    | WebURLPanelConfig
    | CustomPanelConfig;

// ========================================
// Panel Type Configurations
// ========================================

/**
 * Configuration for View panels
 */
export interface ViewPanelConfig {
    type: 'View';
    /** Specific saved view ID */
    viewId?: string;
    /** Entity name for dynamic/default view */
    entityName?: string;
    /** Additional filter criteria */
    extraFilter?: string;
    /** Display mode */
    displayMode: 'grid' | 'cards' | 'timeline';
    /** Show mode toggle in panel header */
    allowModeSwitch: boolean;
    /** Enable row selection */
    enableSelection: boolean;
    /** Selection mode */
    selectionMode: 'none' | 'single' | 'multiple';
}

/**
 * Configuration for Query panels
 */
export interface QueryPanelConfig {
    type: 'Query';
    /** Query ID */
    queryId?: string;
    /** Query name (alternative to ID) */
    queryName?: string;
    /** Category path for browsing */
    categoryPath?: string;
    /** Default parameter values */
    defaultParameters?: Record<string, unknown>;
    /** Show parameter controls */
    showParameterControls: boolean;
    /** Parameter UI layout */
    parameterLayout: 'header' | 'sidebar' | 'dialog';
    /** Auto-refresh interval in seconds (0 = disabled) */
    autoRefreshSeconds: number;
    /** Show execution metadata (time, row count) */
    showExecutionMetadata: boolean;
}

/**
 * Configuration for Artifact panels
 */
export interface ArtifactPanelConfig {
    type: 'Artifact';
    /** Artifact ID */
    artifactId: string;
    /** Specific version number (null = latest) */
    versionNumber?: number;
    /** Show version selector dropdown */
    showVersionSelector: boolean;
    /** Show artifact metadata */
    showMetadata: boolean;
}

/**
 * Configuration for WebURL panels
 */
export interface WebURLPanelConfig {
    type: 'WebURL';
    /** URL to embed */
    url: string;
    /** iframe sandbox mode */
    sandboxMode: 'standard' | 'strict' | 'permissive';
    /** Allow fullscreen */
    allowFullscreen: boolean;
    /** Refresh iframe on resize */
    refreshOnResize: boolean;
}

/**
 * Configuration for Custom panels
 */
export interface CustomPanelConfig {
    type: 'Custom';
    /** @RegisterClass name for the custom component */
    driverClass: string;
    /** Custom configuration passed to the component */
    configuration?: Record<string, unknown>;
}

// ========================================
// Events
// ========================================

/**
 * Event emitted when a panel interacts with content
 */
export interface PanelInteractionEvent {
    /** Panel that emitted the event */
    panelId: string;
    /** Type of interaction */
    interactionType: 'record-select' | 'record-open' | 'entity-link' | 'query-execute' | 'custom';
    /** Interaction payload */
    payload: Record<string, unknown>;
}

/**
 * Event emitted when dashboard configuration changes
 */
export interface DashboardConfigChangedEvent {
    /** Updated configuration */
    config: DashboardConfig;
    /** What changed */
    changeType: 'panel-added' | 'panel-removed' | 'panel-config' | 'layout' | 'settings';
}

/**
 * Event emitted when layout changes (resize, move, etc.)
 */
export interface LayoutChangedEvent {
    /** Updated layout - Golden Layout's native format */
    layout: ResolvedLayoutConfig;
    /** What changed */
    changeType: 'resize' | 'move' | 'stack' | 'close' | 'maximize';
}

// ========================================
// Navigation Request Events
// ========================================

/**
 * Union type for all navigation requests from dashboard parts.
 * These are high-level abstractions - the parent component handles routing.
 */
export type DashboardNavRequest =
    | OpenRecordNavRequest
    | OpenEntityNavRequest
    | OpenDashboardNavRequest
    | OpenQueryNavRequest
    | OpenReportNavRequest
    | OpenApplicationNavRequest;

/**
 * Base interface for navigation requests
 */
export interface BaseNavRequest {
    /** Type discriminator for the navigation request */
    type: string;
    /** Source panel ID that initiated the request */
    sourcePanelId: string;
    /** Whether to open in a new tab/window */
    openInNewTab?: boolean;
}

/**
 * Request to open a specific record by entity and ID
 */
export interface OpenRecordNavRequest extends BaseNavRequest {
    type: 'OpenRecord';
    /** Entity name */
    entityName: string;
    /** Record primary key value */
    recordId: string;
    /** Optional: Open in edit or view mode */
    mode?: 'view' | 'edit';
}

/**
 * Request to navigate to an entity browser/list
 */
export interface OpenEntityNavRequest extends BaseNavRequest {
    type: 'OpenEntity';
    /** Entity name */
    entityName: string;
    /** Optional: Pre-applied filter */
    filter?: string;
    /** Optional: Default view ID */
    viewId?: string;
}

/**
 * Request to navigate to another dashboard
 */
export interface OpenDashboardNavRequest extends BaseNavRequest {
    type: 'OpenDashboard';
    /** Dashboard ID */
    dashboardId: string;
    /** Optional: Dashboard category to navigate to first */
    categoryId?: string;
}

/**
 * Request to navigate to a query
 */
export interface OpenQueryNavRequest extends BaseNavRequest {
    type: 'OpenQuery';
    /** Query ID */
    queryId: string;
    /** Optional: Pre-filled parameter values */
    parameters?: Record<string, unknown>;
    /** Optional: Auto-execute on open */
    autoExecute?: boolean;
}

/**
 * Request to navigate to a report
 */
export interface OpenReportNavRequest extends BaseNavRequest {
    type: 'OpenReport';
    /** Report ID */
    reportId: string;
    /** Optional: Pre-filled parameter values */
    parameters?: Record<string, unknown>;
}

/**
 * Request to navigate to another application
 */
export interface OpenApplicationNavRequest extends BaseNavRequest {
    type: 'OpenApplication';
    /** Application name or ID */
    applicationId: string;
    /** Optional: Specific resource/tab within the app */
    resourceName?: string;
}

/**
 * Event wrapper for navigation requests emitted from dashboard parts
 */
export interface DashboardNavRequestEvent {
    /** The navigation request */
    request: DashboardNavRequest;
    /** Panel data at time of request (for context) */
    panel: DashboardPanel;
}

// ========================================
// Validation
// ========================================

/**
 * Result of configuration validation
 */
export interface ValidationResult {
    /** Whether the configuration is valid */
    valid: boolean;
    /** Validation errors */
    errors: ValidationError[];
    /** Validation warnings */
    warnings: ValidationWarning[];
}

export interface ValidationError {
    field: string;
    message: string;
}

export interface ValidationWarning {
    field: string;
    message: string;
}

// ========================================
// Utility Functions
// ========================================

/**
 * Creates a default dashboard configuration with empty layout
 */
export function createDefaultDashboardConfig(): DashboardConfig {
    return {
        layout: null,
        settings: { ...DEFAULT_DASHBOARD_SETTINGS }
    };
}

/**
 * Generates a unique panel ID
 */
export function generatePanelId(): string {
    return `panel-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract all panels from a Golden Layout config.
 * Walks the layout tree and extracts DashboardPanel from each component's componentState.
 */
export function extractPanelsFromLayout(layout: ResolvedLayoutConfig | null): DashboardPanel[] {
    if (!layout?.root) {
        return [];
    }

    const panels: DashboardPanel[] = [];

    const extractFromNode = (node: ResolvedLayoutConfig['root']): void => {
        if (!node) return;

        // If this is a component, extract the panel from componentState
        if (node.type === 'component') {
            const componentNode = node as unknown as { componentState?: DashboardPanel };
            if (componentNode.componentState?.id) {
                panels.push(componentNode.componentState);
            }
        }

        // Recursively process children
        const containerNode = node as unknown as { content?: ResolvedLayoutConfig['root'][] };
        if (containerNode.content && Array.isArray(containerNode.content)) {
            for (const child of containerNode.content) {
                extractFromNode(child);
            }
        }
    };

    extractFromNode(layout.root);
    return panels;
}

/**
 * Find a panel in the layout by ID
 */
export function findPanelInLayout(layout: ResolvedLayoutConfig | null, panelId: string): DashboardPanel | null {
    const panels = extractPanelsFromLayout(layout);
    return panels.find(p => p.id === panelId) || null;
}

/**
 * Creates a default View panel configuration
 */
export function createDefaultViewPanelConfig(): ViewPanelConfig {
    return {
        type: 'View',
        displayMode: 'grid',
        allowModeSwitch: true,
        enableSelection: true,
        selectionMode: 'single'
    };
}

/**
 * Creates a default Query panel configuration
 */
export function createDefaultQueryPanelConfig(): QueryPanelConfig {
    return {
        type: 'Query',
        showParameterControls: true,
        parameterLayout: 'header',
        autoRefreshSeconds: 0,
        showExecutionMetadata: true
    };
}

/**
 * Creates a default Artifact panel configuration
 */
export function createDefaultArtifactPanelConfig(): ArtifactPanelConfig {
    return {
        type: 'Artifact',
        artifactId: '',
        showVersionSelector: true,
        showMetadata: false
    };
}

/**
 * Creates a default WebURL panel configuration
 */
export function createDefaultWebURLPanelConfig(): WebURLPanelConfig {
    return {
        type: 'WebURL',
        url: '',
        sandboxMode: 'standard',
        allowFullscreen: true,
        refreshOnResize: false
    };
}

/**
 * Creates a default Custom panel configuration
 */
export function createDefaultCustomPanelConfig(): CustomPanelConfig {
    return {
        type: 'Custom',
        driverClass: ''
    };
}
