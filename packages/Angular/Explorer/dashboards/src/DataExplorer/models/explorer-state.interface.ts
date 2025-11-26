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

  // Smart filter
  smartFilterPrompt: string;
  smartFilterEnabled: boolean;

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
  recordId: string;
  displayName: string;
  timestamp: Date;
}

export interface FavoriteItem {
  type: 'record' | 'view' | 'entity';
  entityName?: string;
  recordId?: string;
  viewId?: string;
  displayName: string;
}

/**
 * Auto-generated card template based on entity metadata
 */
export interface AutoCardTemplate {
  titleField: string;
  subtitleField: string | null;
  descriptionField: string | null;
  metricFields: string[];
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
