import { TemplateRef } from '@angular/core';
import { CustomToolbarButton } from './form-events';

/**
 * Configuration object for the form toolbar.
 * Controls which buttons/sections are visible and behavioral options.
 *
 * Pass to `<mj-form-toolbar [config]="toolbarConfig">` to customize the toolbar.
 * Use `DEFAULT_TOOLBAR_CONFIG` as a starting point and override specific properties.
 *
 * @example
 * ```typescript
 * const myConfig: FormToolbarConfig = {
 *   ...DEFAULT_TOOLBAR_CONFIG,
 *   ShowDeleteButton: false,         // Hide delete for this form
 *   ShowEntityHierarchy: true,       // Show IS-A breadcrumb
 *   ShowFavoriteButton: false,       // No favorites in this app
 * };
 * ```
 */
export interface FormToolbarConfig {
  // ---- Visibility ----

  /** Show the Edit button in read mode. Default: true */
  ShowEditButton: boolean;

  /** Show the Delete button in read mode. Default: true */
  ShowDeleteButton: boolean;

  /** Show the Favorite/Unfavorite button. Default: true */
  ShowFavoriteButton: boolean;

  /** Show the Record History button (only if entity tracks changes). Default: true */
  ShowHistoryButton: boolean;

  /** Show the Lists button for managing list membership. Default: true */
  ShowListButton: boolean;

  /** Show the IS-A entity hierarchy breadcrumb. Default: true */
  ShowEntityHierarchy: boolean;

  /** Show section controls (search, expand/collapse, count). Default: true */
  ShowSectionControls: boolean;

  /** Show the edit banner when entering edit mode. Default: true */
  ShowEditBanner: boolean;

  /** Show the "Changes" button when record is dirty in edit mode. Default: true */
  ShowChangesButton: boolean;

  /** Show the section search/filter input. Default: true */
  ShowSectionFilter: boolean;

  /** Allow drag-and-drop section reordering. Default: true */
  AllowSectionReorder: boolean;

  /** Show the "Manage Sections" button (section manager drawer). Default: true */
  ShowSectionManager: boolean;

  // ---- Behavior ----

  /**
   * Whether the toolbar should be sticky at the top when scrolling.
   * Default: true
   */
  StickyToolbar: boolean;

  // ---- Custom Slots ----

  /**
   * Optional template reference for additional toolbar actions.
   * Rendered after the standard buttons via ng-content or TemplateRef.
   */
  AdditionalActions: TemplateRef<unknown> | null;

  /**
   * Custom toolbar buttons to display in the read-mode toolbar.
   * Shown after the standard buttons (edit, delete, favorite, history, lists).
   */
  CustomButtons: CustomToolbarButton[];
}

/**
 * Default toolbar configuration - everything visible and sticky.
 * Use as a base and override individual properties.
 */
export const DEFAULT_TOOLBAR_CONFIG: FormToolbarConfig = {
  ShowEditButton: true,
  ShowDeleteButton: true,
  ShowFavoriteButton: true,
  ShowHistoryButton: true,
  ShowListButton: true,
  ShowEntityHierarchy: true,
  ShowSectionControls: true,
  ShowEditBanner: true,
  ShowChangesButton: true,
  ShowSectionFilter: true,
  AllowSectionReorder: true,
  ShowSectionManager: true,
  StickyToolbar: true,
  AdditionalActions: null,
  CustomButtons: []
};

/**
 * Toolbar config for use inside MJ Explorer where favorites, history, and
 * list management are handled by the host app.
 * Pass as `[ToolbarConfig]="EXPLORER_TOOLBAR_CONFIG"` on the container.
 */
export const EXPLORER_TOOLBAR_CONFIG: FormToolbarConfig = {
  ShowEditButton: true,
  ShowDeleteButton: true,
  ShowFavoriteButton: true,
  ShowHistoryButton: true,
  ShowListButton: true,
  ShowEntityHierarchy: true,
  ShowSectionControls: true,
  ShowEditBanner: true,
  ShowChangesButton: true,
  ShowSectionFilter: true,
  AllowSectionReorder: true,
  ShowSectionManager: true,
  StickyToolbar: true,
  AdditionalActions: null,
  CustomButtons: []
};
