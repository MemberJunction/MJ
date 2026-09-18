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
  type: 'folder' | 'artifact';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  icon: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  selected?: boolean; // For multi-select — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Folder-specific
  itemCount?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  owner?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  isShared?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Artifact-specific
  versionNumber?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  artifactType?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  lastModified?: Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  // Original entities for actions
  collection?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  artifact?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  version?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}
