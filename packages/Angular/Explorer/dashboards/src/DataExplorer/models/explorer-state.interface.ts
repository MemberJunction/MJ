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
 * Per-entity cached state (filters, scroll position, etc.)
 */
export interface EntityCacheEntry {
  filterText: string;
  scrollPosition?: number;
  lastAccessed: number; // timestamp for LRU eviction
}

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

  // Smart filter (current entity's filter - also cached in entityCache)
  smartFilterPrompt: string;
  smartFilterEnabled: boolean;

  // Per-entity cache for filters and state
  entityCache: Record<string, EntityCacheEntry>;

  // View mode
  viewMode: 'cards' | 'grid';

  // Detail panel
  detailPanelOpen: boolean;
  detailPanelWidth: number;
  selectedRecordId: string | null;

  // Section states
  favoritesSectionExpanded: boolean;
  recentSectionExpanded: boolean;
  entitiesSectionExpanded: boolean;
  viewsSectionExpanded: boolean;

  // Recent items
  recentItems: RecentItem[];

  // Favorites
  favorites: FavoriteItem[];
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
  smartFilterPrompt: '',
  smartFilterEnabled: true,
  entityCache: {},
  viewMode: 'grid',
  detailPanelOpen: false,
  detailPanelWidth: 400,
  selectedRecordId: null,
  favoritesSectionExpanded: true,
  recentSectionExpanded: true,
  entitiesSectionExpanded: true,
  viewsSectionExpanded: true,
  recentItems: [],
  favorites: []
};
