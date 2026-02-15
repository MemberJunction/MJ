import { MJListEntity, MJListDetailEntity, MJListCategoryEntity } from '@memberjunction/core-entities';

/**
 * Configuration for the ListManagementDialog component
 */
export interface ListManagementDialogConfig {
  /**
   * Operation mode for the dialog
   * - 'add': Only show add functionality
   * - 'remove': Only show remove functionality
   * - 'manage': Show both add and remove (full management)
   */
  mode: 'add' | 'remove' | 'manage';

  /**
   * The Entity ID that the lists are associated with
   */
  entityId: string;

  /**
   * Display name of the entity (for UI labels)
   */
  entityName: string;

  /**
   * Array of record IDs to add/remove from lists
   */
  recordIds: string[];

  /**
   * Optional display names for the records (for better context in UI)
   */
  recordDisplayNames?: string[];

  /**
   * Allow inline creation of new lists (default: true)
   */
  allowCreate?: boolean;

  /**
   * Allow removing records from lists (default: true in 'manage' mode)
   */
  allowRemove?: boolean;

  /**
   * Show membership indicators on lists (default: true)
   */
  showMembership?: boolean;

  /**
   * Pre-select specific lists by their IDs
   */
  preSelectedListIds?: string[];

  /**
   * Optional title override for the dialog
   */
  dialogTitle?: string;
}

/**
 * Result returned when the ListManagementDialog is closed
 */
export interface ListManagementResult {
  /**
   * Action taken by the user
   * - 'apply': User confirmed changes
   * - 'cancel': User cancelled without applying changes
   */
  action: 'apply' | 'cancel';

  /**
   * Lists and records that were added
   */
  added: ListOperationDetail[];

  /**
   * Lists and records that were removed
   */
  removed: ListOperationDetail[];

  /**
   * New lists that were created during this session
   */
  newListsCreated: MJListEntity[];
}

/**
 * Details of a list operation (add or remove)
 */
export interface ListOperationDetail {
  /**
   * The list ID that was modified
   */
  listId: string;

  /**
   * The list name (for display purposes)
   */
  listName: string;

  /**
   * Record IDs that were added/removed
   */
  recordIds: string[];
}

/**
 * View model for displaying a list in the dialog
 */
export interface ListItemViewModel {
  /**
   * The underlying list entity
   */
  list: MJListEntity;

  /**
   * Total number of items in this list
   */
  itemCount: number;

  /**
   * Number of selected records that are already in this list
   */
  membershipCount: number;

  /**
   * Total number of records being managed
   */
  totalSelectedRecords: number;

  /**
   * True if all selected records are in this list
   */
  isFullMember: boolean;

  /**
   * True if some (but not all) selected records are in this list
   */
  isPartialMember: boolean;

  /**
   * True if no selected records are in this list
   */
  isNotMember: boolean;

  /**
   * Last updated timestamp
   */
  lastUpdated: Date;

  /**
   * Category entity if categorized
   */
  category?: MJListCategoryEntity;

  /**
   * Whether this list is selected for adding records
   */
  isSelectedForAdd: boolean;

  /**
   * Whether this list is selected for removing records
   */
  isSelectedForRemove: boolean;
}

/**
 * Filter/tab options for the list display
 */
export type ListFilterTab = 'all' | 'my-lists' | 'shared' | 'recent';

/**
 * Sort options for the list display
 */
export type ListSortOption = 'name' | 'recent' | 'item-count';

/**
 * Configuration for creating a new list inline
 */
export interface CreateListConfig {
  /**
   * Name for the new list
   */
  name: string;

  /**
   * Optional description
   */
  description?: string;

  /**
   * Optional category ID
   */
  categoryId?: string;

  /**
   * Entity ID the list is for
   */
  entityId: string;
}

/**
 * Batch operation result for adding/removing records
 */
export interface BatchOperationResult {
  /**
   * Number of successful operations
   */
  success: number;

  /**
   * Number of failed operations
   */
  failed: number;

  /**
   * Number of skipped operations (e.g., duplicates)
   */
  skipped: number;

  /**
   * Error messages if any failures occurred
   */
  errors: string[];
}

/**
 * Membership info for a single record
 */
export interface RecordMembershipInfo {
  /**
   * The record ID
   */
  recordId: string;

  /**
   * List IDs this record belongs to
   */
  listIds: string[];

  /**
   * Full list entities this record belongs to
   */
  lists: MJListEntity[];
}
