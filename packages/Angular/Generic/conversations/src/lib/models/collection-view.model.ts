/**
 * View modes for collections display
 */
export type CollectionViewMode = 'grid' | 'list';

/**
 * Sort options for collections view
 */
export type CollectionSortBy = 'name' | 'date' | 'type';
export type CollectionSortOrder = 'asc' | 'desc';

/**
 * Unified item type for displaying both collections and artifacts together
 */
export interface CollectionViewItem {
  type: 'folder' | 'artifact';
  id: string;
  name: string;
  description?: string;
  icon: string;
  selected?: boolean; // For multi-select

  // Folder-specific
  itemCount?: number;
  owner?: string;
  isShared?: boolean;

  // Artifact-specific
  versionNumber?: number;
  artifactType?: string;
  lastModified?: Date;

  // Original entities for actions
  collection?: any;
  artifact?: any;
  version?: any;
}
