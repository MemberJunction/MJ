/**
 * Types and interfaces for the Dashboard Viewer component.
 * These define the configuration schema for metadata-driven dashboards.
 */

// ========================================
// Dashboard Configuration (v2)
// ========================================

/**
 * Root configuration for a dashboard.
 * Stored in Dashboard.UIConfigDetails as JSON.
 */
export interface DashboardConfigV2 {
    /** Schema version for future compatibility */
    version: 2;
    /** Golden Layout configuration for panel arrangement */
    layout: GoldenLayoutConfig;
    /** Panel definitions with type-specific configuration */
    panels: DashboardPanel[];
    /** Dashboard-level settings */
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
// Golden Layout Configuration
// ========================================

/**
 * Golden Layout root configuration
 */
export interface GoldenLayoutConfig {
    root: LayoutNode;
}

/**
 * Golden Layout node types
 */
export type LayoutNodeType = 'row' | 'column' | 'stack' | 'component';

/**
 * Golden Layout node configuration
 */
export interface LayoutNode {
    /** Node type */
    type: LayoutNodeType;
    /** Child nodes (for row/column/stack) */
    content?: LayoutNode[];
    /** Panel ID reference (for component nodes) */
    componentState?: { panelId: string };
    /** Width percentage (for row children) */
    width?: number;
    /** Height percentage (for column children) */
    height?: number;
    /** Whether this node is active/selected (for stack tabs) */
    isActive?: boolean;
    /** Title for stack tabs */
    title?: string;
}

// ========================================
// Panel Configuration
// ========================================

/**
 * Dashboard panel definition
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
    config: DashboardConfigV2;
    /** What changed */
    changeType: 'panel-added' | 'panel-removed' | 'panel-config' | 'layout' | 'settings';
}

/**
 * Event emitted when layout changes (resize, move, etc.)
 */
export interface LayoutChangedEvent {
    /** Updated layout */
    layout: GoldenLayoutConfig;
    /** What changed */
    changeType: 'resize' | 'move' | 'stack' | 'close' | 'maximize';
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
 * Creates a default dashboard configuration
 */
export function createDefaultDashboardConfig(): DashboardConfigV2 {
    return {
        version: 2,
        layout: {
            root: {
                type: 'row',
                content: []
            }
        },
        panels: [],
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
