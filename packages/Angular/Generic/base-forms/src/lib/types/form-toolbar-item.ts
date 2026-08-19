import { BaseEntity } from '@memberjunction/core';

/**
 * Well-known keys for built-in standard form toolbar buttons.
 */
export type StandardToolbarItemKey =
  | 'edit'
  | 'delete'
  | 'favorite'
  | 'history'
  | 'list'
  | 'tags'
  | 'attachments';

/**
 * Union of standard toolbar item keys and any custom button key.
 */
export type FormToolbarItemKey = StandardToolbarItemKey | (string & {});

/**
 * Visual styling variant for toolbar buttons.
 */
export type ToolbarItemVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'danger'
  | 'ghost';

/**
 * Placement group for toolbar buttons:
 * - 'actions': the main action button group on the left side (alongside Edit/Delete/Favorite)
 * - 'right': right side (before section search & controls)
 * - 'overflow': secondary / overflow menu for lower-frequency actions
 */
export type ToolbarItemPlacement = 'actions' | 'right' | 'overflow';

/**
 * When the toolbar item should be available:
 * - 'read': only in read mode (default)
 * - 'edit': only in edit mode
 * - 'both': in both read and edit modes
 */
export type ToolbarItemMode = 'read' | 'edit' | 'both';

/**
 * Event arguments emitted or passed to handlers when a toolbar item is clicked.
 */
export interface FormToolbarItemClickEventArgs {
  /** The unique key of the clicked toolbar item */
  ItemKey: string;

  /** The configuration of the clicked toolbar item */
  Item: FormToolbarItemConfig;

  /** The entity record being viewed/edited */
  Record: BaseEntity;

  /** Whether the form is currently in edit mode */
  EditMode: boolean;

  /** Optional reference to the host form component */
  FormComponent?: unknown;

  /** Set to true to cancel default behavior (if applicable) */
  Cancel?: boolean;
}

/**
 * Configuration for registering or customizing a form toolbar item (action button).
 *
 * Supports dynamic predicates for visibility, enabled/disabled state (with optional
 * disabled reason tooltips), badges, and async click handlers.
 */
export interface FormToolbarItemConfig {
  /**
   * Unique identifier for this toolbar item (e.g. 'confirm-order', 'post', 'edit').
   */
  Key: string;

  /**
   * Optional button label text (e.g. "Confirm Order").
   */
  Text?: string;

  /**
   * Tooltip text shown on hover when enabled.
   */
  Description?: string;

  /**
   * FontAwesome icon class (e.g. "fa-solid fa-check-double", "fa-solid fa-calculator").
   */
  Icon?: string;

  /**
   * Visual styling variant. Default: 'default' (or 'primary' for key actions).
   */
  Variant?: ToolbarItemVariant;

  /**
   * In which mode(s) this button should appear. Default: 'read'.
   */
  Mode?: ToolbarItemMode;

  /**
   * Placement group in the toolbar. Default: 'actions'.
   */
  Placement?: ToolbarItemPlacement;

  /**
   * Numeric sort order within its placement group. Lower numbers appear first.
   * Standard built-in items default to:
   * - edit: 10
   * - delete: 20
   * - favorite: 30
   * - history: 40
   * - list: 50
   * - tags: 60
   * - attachments: 70
   * Custom action items default to 100 unless specified (e.g. 5 to appear before Edit).
   */
  Order?: number;

  /**
   * Whether the button is visible. Can be a boolean or a reactive predicate function.
   * Default: true.
   */
  Visible?: boolean | ((record: BaseEntity, editMode: boolean) => boolean);

  /**
   * Whether the button is disabled.
   * Can be:
   * - `boolean`: true = disabled, false = enabled
   * - `string`: disabled, and the string is used as the tooltip explaining why (e.g. "Save draft changes first")
   * - `predicate function`: returning boolean or reason string
   * Default: false.
   */
  Disabled?: boolean | string | ((record: BaseEntity, editMode: boolean) => boolean | string);

  /**
   * Optional badge count or text (e.g. "v3", 5).
   */
  Badge?: string | number | ((record: BaseEntity) => string | number | null | undefined);

  /**
   * Whether to display a loading spinner on the button while an operation is in progress.
   */
  IsLoading?: boolean | ((record: BaseEntity, editMode: boolean) => boolean);

  /**
   * Optional custom CSS class name to append to the button element.
   */
  CssClass?: string;

  /**
   * Handler function invoked when the button is clicked.
   */
  OnClick?: (event: FormToolbarItemClickEventArgs) => Promise<void> | void;
}

/**
 * Resolved runtime state of a toolbar item, evaluated against the active record and edit mode.
 */
export interface ResolvedToolbarItem {
  Key: string;
  Text: string;
  Description: string;
  Icon: string;
  Variant: ToolbarItemVariant;
  Mode: ToolbarItemMode;
  Placement: ToolbarItemPlacement;
  Order: number;
  Visible: boolean;
  Disabled: boolean;
  DisabledReason?: string;
  Badge?: string | number;
  IsLoading: boolean;
  CssClass: string;
  IsStandard: boolean;
  Config: FormToolbarItemConfig;
}
