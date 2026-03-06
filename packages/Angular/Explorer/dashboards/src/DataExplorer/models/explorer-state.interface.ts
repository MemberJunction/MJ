import { EntityInfo } from '@memberjunction/core';

/**
 * Filter configuration for the Data Explorer
 * Allows constraining which entities are shown in the explorer
 */
export interface DataExplorerFilter {
  /**
   * Application ID to filter entities by.
   * Only entities linked via ApplicationEntities will be shown.
   */
  applicationId?: string;

  /**
   * Application name for display purposes (breadcrumbs, titles)
   */
  applicationName?: string;

  /**
   * Schema names to filter by (e.g., ['dbo', 'sales'])
   * Only entities in these schemas will be shown.
   */
  schemaNames?: string[];

  /**
   * Explicit entity names to include (e.g., ['Accounts', 'Contacts'])
   * If provided, only these entities will be shown.
   */
  entityNames?: string[];

  /**
   * Whether to show system entities (entities starting with __ or system schemas)
   * Default: false
   */
  includeSystemEntities?: boolean;
}

/**
 * Breadcrumb item for navigation display
 */
export interface BreadcrumbItem {
  label: string;
  type: 'application' | 'entity' | 'record';
  /** For entity type - the entity name */
  entityName?: string;
  /** For record type - the composite key string */
  compositeKeyString?: string;
  /** Icon class for the breadcrumb */
  icon?: string;
}

/**
 * View mode options for the Data Explorer
 */
export type DataExplorerViewMode = 'grid' | 'cards' | 'timeline';

/**
 * Timeline orientation options
 */
export type TimelineOrientationType = 'vertical' | 'horizontal';

/**
 * Initial navigation state from URL query parameters.
 * Used for deep linking into the Data Explorer.
 */
export interface DataExplorerDeepLink {
  /** Entity name to navigate to */
  entity?: string;
  /** Record ID or composite key string to select */
  record?: string;
  /** Filter text to apply */
  filter?: string;
  /** View mode to use */
  viewMode?: DataExplorerViewMode;
}

/**
 * Per-entity cached state (filters, scroll position, etc.)
 */
export interface EntityCacheEntry {
  filterText: string;
  scrollPosition?: number;
  lastAccessed: number; // timestamp for LRU eviction
}

/**
 * Recent entity access tracking for home screen
 */
export interface RecentEntityAccess {
  entityName: string;
  entityId: string;
  lastAccessed: Date;
  accessCount: number;
}

/**
 * Favorite entity for home screen (using User Favorites entity)
 */
export interface FavoriteEntity {
  userFavoriteId: string;  // ID from User Favorites entity
  entityName: string;
  entityId: string;
}

/**
 * Recent record access for home screen (from User Record Logs)
 */
export interface RecentRecordAccess {
  entityName: string;
  entityId: string;
  recordId: string;
  recordName?: string;
  latestAt: Date;
  totalCount: number;
}

/**
 * Favorite record for home screen (from User Favorites, excluding entity favorites)
 */
export interface FavoriteRecord {
  userFavoriteId: string;  // ID from User Favorites entity
  entityName: string;
  entityId: string;
  recordId: string;
  recordName?: string;
}

/**
 * Represents an application group with its entities for the home view.
 * Used by Concept D to organize entities by their first Application membership.
 */
export interface AppEntityGroup {
  applicationId: string;
  applicationName: string;
  applicationIcon: string;
  applicationColor: string | null;
  entities: EntityInfo[];
  isExpanded: boolean;
}

/**
 * Home view mode for the All/Favorites toggle
 */
export type HomeViewMode = 'all' | 'favorites';

/**
 * State interface for the Data Explorer dashboard
 */
export interface DataExplorerState {
  // Navigation panel
  navigationPanelWidth: number;
  navigationPanelCollapsed: boolean;

  // Current context
  selectedEntityName: string | null;
  selectedViewId: string | null;

  // View modification tracking
  /** Whether the current view configuration has unsaved changes */
  viewModified: boolean;

  // View configuration panel
  /** Whether the view configuration panel is open */
  viewConfigPanelOpen: boolean;

  // Smart filter (current entity's filter - also cached in entityCache)
  smartFilterPrompt: string;
  smartFilterEnabled: boolean;

  // Per-entity cache for filters and state
  entityCache: Record<string, EntityCacheEntry>;

  // View mode
  viewMode: DataExplorerViewMode;

  // Timeline configuration (per-entity, but stored here for simplicity)
  timelineOrientation: TimelineOrientationType;
  timelineDateFieldName: string | null;
  timelineSortOrder: 'asc' | 'desc';

  // Detail panel
  detailPanelOpen: boolean;
  detailPanelWidth: number;
  selectedRecordId: string | null;
  /** Display name of the currently selected record (for breadcrumbs) */
  selectedRecordName: string | null;

  // Section states
  favoritesSectionExpanded: boolean;
  recentSectionExpanded: boolean;
  entitiesSectionExpanded: boolean;
  viewsSectionExpanded: boolean;

  // Recent items (legacy - records within current explorer context)
  recentItems: RecentItem[];

  // Favorites (legacy - records within current explorer context)
  favorites: FavoriteItem[];

  // Home screen state
  /** Whether to show all entities or just DefaultForNewUser entities */
  showAllEntities: boolean;
  /** Recent entity access tracking for home screen */
  recentEntityAccesses: RecentEntityAccess[];
  /** Favorite entities for home screen */
  favoriteEntities: FavoriteEntity[];
  /** Favorite records for home screen (non-entity favorites) */
  favoriteRecords: FavoriteRecord[];

  // Concept D: Application Groups + Search-First
  /** Which application group IDs are currently expanded */
  expandedAppGroups: string[];
  /** Whether the right-side quick access panel is open */
  quickAccessPanelOpen: boolean;
  /** Collapse state per section in the quick access panel (key = section id, value = expanded) */
  quickAccessSections: Record<string, boolean>;
  /** Home view mode toggle: show all entities or favorites only */
  homeViewMode: HomeViewMode;
}

export interface RecentItem {
  entityName: string;
  /** Serialized CompositeKey using ToConcatenatedString format (Field1|Value1||Field2|Value2) */
  compositeKeyString: string;
  displayName: string;
  timestamp: Date;
}

export interface FavoriteItem {
  type: 'record' | 'view' | 'entity';
  entityName?: string;
  /** Serialized CompositeKey using ToConcatenatedString format (Field1|Value1||Field2|Value2) */
  compositeKeyString?: string;
  viewId?: string;
  displayName: string;
}

/**
 * Field display type for smart rendering in cards
 */
export type CardFieldType = 'number' | 'boolean' | 'text' | 'date';

/**
 * Metadata for a field to display in a card
 */
export interface CardDisplayField {
  name: string;
  type: CardFieldType;
  label: string;
}

/**
 * Auto-generated card template based on entity metadata
 */
export interface AutoCardTemplate {
  titleField: string;
  subtitleField: string | null;
  descriptionField: string | null;
  /** Display fields with type information for smart rendering */
  displayFields: CardDisplayField[];
  thumbnailField: string | null;
  badgeField: string | null;
}

/**
 * Default state for the Data Explorer
 */
export const DEFAULT_EXPLORER_STATE: DataExplorerState = {
  navigationPanelWidth: 280,
  navigationPanelCollapsed: false,
  selectedEntityName: null,
  selectedViewId: null,
  viewModified: false,
  viewConfigPanelOpen: false,
  smartFilterPrompt: '',
  smartFilterEnabled: true,
  entityCache: {},
  viewMode: 'grid',
  timelineOrientation: 'vertical',
  timelineDateFieldName: null,
  timelineSortOrder: 'desc',
  detailPanelOpen: false,
  detailPanelWidth: 400,
  selectedRecordId: null,
  selectedRecordName: null,
  favoritesSectionExpanded: true,
  recentSectionExpanded: true,
  entitiesSectionExpanded: true,
  viewsSectionExpanded: true,
  recentItems: [],
  favorites: [],
  // Home screen state
  showAllEntities: false,  // Default to showing only common entities
  recentEntityAccesses: [],
  favoriteEntities: [],
  favoriteRecords: [],
  // Concept D: Application Groups + Search-First
  expandedAppGroups: [],
  quickAccessPanelOpen: false,
  quickAccessSections: { recentRecords: true, recentEntities: true, favoriteRecords: true },
  homeViewMode: 'all',
};
