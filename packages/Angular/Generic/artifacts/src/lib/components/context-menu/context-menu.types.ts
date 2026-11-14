/**
 * Shared types and contracts for the MemberJunction Productivity Suite
 * right-click context menu component (<mj-context-menu>).
 *
 * Strictly zero `any` and zero `unknown` types.
 */

/**
 * Base constraint for strongly-typed discriminated-union menu commands.
 */
export interface ContextMenuCommandBase {
  readonly Type: string;
}

/**
 * Supported WAI-ARIA menu item roles.
 */
export type ContextMenuItemRole = 'menuitem' | 'menuitemcheckbox' | 'menuitemradio';

/**
 * Single color swatch inside a `swatch-row` menu item.
 */
export interface ContextMenuSwatchOption<TPayload = ContextMenuCommandBase> {
  /** Accessible label, e.g. 'Brand Blue Fill' or 'Clear Fill' */
  Label: string;
  /** CSS color value or semantic token expression rendered in the swatch preview dot */
  PreviewCssColor: string;
  /** Strongly-typed command dispatched when clicked */
  Command: TPayload;
  /** True when this swatch matches the current selection's color */
  Selected?: boolean;
  /** Renders a clear/reset icon instead of a solid color fill */
  IsClearSwatch?: boolean;
}

/**
 * Standard executable action item (supports checkbox/radio states, shortcuts, and disabled reasons).
 */
export interface ContextMenuActionItem<TPayload = ContextMenuCommandBase> {
  Kind: 'action';
  ID: string;
  Label: string;
  /** Font Awesome class string, e.g. 'fa-solid fa-copy' */
  Icon?: string;
  /** Platform-normalized shortcut display badge, e.g. '⌘C' or 'Ctrl+C' */
  Shortcut?: string;
  /** Optional right-aligned subtle pill/meta text (e.g. '3 rows') */
  BadgeText?: string;
  Role?: ContextMenuItemRole;
  /** Used when Role is 'menuitemcheckbox' or 'menuitemradio' */
  Checked?: boolean;
  /** Renders label/icon in semantic error token on hover/focus */
  Destructive?: boolean;
  /** Keeps item focusable via aria-disabled="true" while blocking execution */
  Disabled?: boolean;
  /** Shown as tooltip / inline assistive title when Disabled is true */
  DisabledReason?: string;
  /** Strongly-typed payload emitted on activation */
  Command: TPayload;
}

/**
 * Cascading submenu item opening a child menu panel.
 */
export interface ContextMenuSubmenuItem<TPayload = ContextMenuCommandBase> {
  Kind: 'submenu';
  ID: string;
  Label: string;
  Icon?: string;
  Disabled?: boolean;
  DisabledReason?: string;
  Children: ReadonlyArray<ContextMenuItem<TPayload>>;
}

/**
 * Compact horizontal color-swatch picker row inside a context menu.
 */
export interface ContextMenuSwatchRowItem<TPayload = ContextMenuCommandBase> {
  Kind: 'swatch-row';
  ID: string;
  Label: string;
  Disabled?: boolean;
  DisabledReason?: string;
  Swatches: ReadonlyArray<ContextMenuSwatchOption<TPayload>>;
}

/**
 * Visual separator line between menu groups.
 */
export interface ContextMenuSeparatorItem {
  Kind: 'separator';
  ID?: string;
}

/**
 * Non-interactive section heading inside a context menu.
 */
export interface ContextMenuHeaderItem {
  Kind: 'header';
  ID?: string;
  Label: string;
  Icon?: string;
}

/**
 * Discriminated union of all renderable context menu items.
 */
export type ContextMenuItem<TPayload = ContextMenuCommandBase> =
  | ContextMenuActionItem<TPayload>
  | ContextMenuSubmenuItem<TPayload>
  | ContextMenuSwatchRowItem<TPayload>
  | ContextMenuSeparatorItem
  | ContextMenuHeaderItem;

/**
 * 2D point in viewport coordinates.
 */
export interface ContextMenuPoint {
  X: number;
  Y: number;
}

/**
 * Viewport dimensions used for collision and clamping math.
 */
export interface ContextMenuViewportSize {
  Width: number;
  Height: number;
}

/**
 * Measured dimensions of a menu panel.
 */
export interface ContextMenuPanelDimensions {
  Width: number;
  Height: number;
}

/**
 * Bounding rectangle of a parent submenu trigger item.
 */
export interface ContextMenuAnchorRect {
  Top: number;
  Left: number;
  Right: number;
  Bottom: number;
  Width: number;
  Height: number;
}

/**
 * Computed fixed-viewport coordinates and flip state for a menu panel.
 */
export interface ContextMenuComputedPlacement {
  Left: number;
  Top: number;
  MaxHeight: number;
  FlippedHorizontally: boolean;
  FlippedVertically: boolean;
}

/**
 * Host view-model state for controlling <mj-context-menu>.
 */
export interface ContextMenuState<TPayload = ContextMenuCommandBase> {
  IsOpen: boolean;
  AnchorX: number;
  AnchorY: number;
  Items: ReadonlyArray<ContextMenuItem<TPayload>>;
  AriaLabel: string;
  RestoreFocusElement: HTMLElement | null;
}

/**
 * Payload emitted by TouchContextMenuMonitor when a touch long-press triggers.
 */
export interface TouchContextMenuTrigger {
  AnchorX: number;
  AnchorY: number;
  Target: EventTarget | null;
}

/**
 * Configuration options for TouchContextMenuMonitor.
 */
export interface TouchContextMenuMonitorOptions {
  /** Press duration in milliseconds before triggering (default: 500). */
  DelayMs?: number;
  /** Maximum pointer drift in pixels before cancelling (default: 10). */
  MoveTolerancePx?: number;
  /** Callback invoked when the long-press completes. */
  OnLongPress: (trigger: TouchContextMenuTrigger) => void;
}
