/**
 * Root configuration stored in Workspace.Configuration
 */
export interface WorkspaceConfiguration {
  /** Schema version for future migrations */
  version: number;

  /** Golden Layout state */
  layout: LayoutConfig;

  /** ID of currently active tab */
  activeTabId: string | null;

  /** UI theme */
  theme: 'light' | 'dark';

  /** User preferences */
  preferences: WorkspacePreferences;

  /** All tabs (replaces WorkspaceItem table) */
  tabs: WorkspaceTab[];
}

/**
 * Layout configuration (Golden Layout serialized state)
 */
export interface LayoutConfig {
  root: LayoutNode;
  dimensions?: {
    headerHeight: number;
    borderWidth: number;
  };
}

/**
 * Node in the layout tree
 */
export interface LayoutNode {
  type: 'row' | 'column' | 'stack' | 'component';
  content?: LayoutNode[];
  componentType?: string;
  componentState?: Record<string, unknown>;
  width?: number;
  height?: number;
  isClosable?: boolean;
  title?: string;
}

/**
 * User preferences for workspace behavior
 */
export interface WorkspacePreferences {
  tabPosition: 'top' | 'bottom';
  showTabIcons: boolean;
  autoSaveInterval: number; // milliseconds, 0 = disabled
}

/**
 * Individual tab definition (replaces WorkspaceItem row)
 */
export interface WorkspaceTab {
  /** Unique ID for this tab */
  id: string;

  /** Application this tab belongs to */
  applicationId: string;

  /** Display title */
  title: string;

  /** Resource type for matching */
  resourceTypeId: string;

  /** Resource record for matching */
  resourceRecordId: string;

  /** Whether tab is pinned (permanent) */
  isPinned: boolean;

  /** Display order */
  sequence: number;

  /** Last accessed timestamp (ISO string) */
  lastAccessedAt: string;

  /** Tab-specific configuration */
  configuration: TabConfiguration;

  /** Layout position reference */
  layoutPosition?: string;
}

/**
 * Tab-specific configuration (extensible)
 */
export interface TabConfiguration {
  /** Entity name for entity-based tabs */
  entity?: string;

  /** Additional filter for views */
  extraFilter?: string;

  /** View ID for saved views */
  viewId?: string;

  /** Search input state */
  searchInput?: string;

  /** Scroll position for restoration */
  scrollPosition?: number;

  /** Expanded sections state */
  expandedSections?: string[];

  /** Custom title override */
  customTitle?: string;

  /** Allow additional properties */
  [key: string]: unknown;
}

/**
 * Create default workspace configuration
 */
export function createDefaultWorkspaceConfiguration(): WorkspaceConfiguration {
  return {
    version: 1,
    layout: {
      root: {
        type: 'row',
        content: []
      }
    },
    activeTabId: null,
    theme: 'light',
    preferences: {
      tabPosition: 'top',
      showTabIcons: true,
      autoSaveInterval: 5000
    },
    tabs: []
  };
}
