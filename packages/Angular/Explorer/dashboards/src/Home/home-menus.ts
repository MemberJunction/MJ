/**
 * @fileoverview Placement and keyboard helpers for Home's fixed-position menus: the pin options menu and the
 * Dashboards switcher. Pure, so they are tested without a browser.
 */

/** The trigger's box in viewport pixels. */
export interface MenuAnchor {
  Left: number;
  Right: number;
  Top: number;
  Bottom: number;
}

/** The viewport size in pixels. */
export interface MenuViewport {
  Width: number;
  Height: number;
}

/** Where a fixed-position menu goes, in viewport pixels. */
export interface MenuPlacement {
  Left: number;
  Top: number;
  /** The tallest the menu can be: the room on its side of the trigger, and never less than 120px. */
  MaxHeight: number;
}

const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
/** The smallest max height a menu gets, so a menu with little room stays usable. */
const MENU_MIN_MAX_HEIGHT = 120;

/** The box of an element, as a menu anchor. */
export function MenuAnchorOf(element: Element): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return { Left: rect.left, Right: rect.right, Top: rect.top, Bottom: rect.bottom };
}

/**
 * Places a menu under its trigger. 'right' lines up the right edges; when that passes the viewport's left margin, the
 * menu lines up with the trigger's left edge instead. The menu stays inside the side margins. With a known height (the
 * menu's full height), a menu that does not fit below opens above the trigger when it fits there. `MaxHeight` is the
 * room on the side the menu opens to: down to the bottom margin, or up to the top margin.
 */
export function PlaceMenu(anchor: MenuAnchor, width: number, height: number, align: 'left' | 'right', viewport: MenuViewport): MenuPlacement {
  let left = align === 'right' ? anchor.Right - width : anchor.Left;
  if (align === 'right' && left < VIEWPORT_MARGIN) {
    left = anchor.Left;
  }
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewport.Width - width - VIEWPORT_MARGIN));
  const below = anchor.Bottom + MENU_GAP;
  const above = anchor.Top - MENU_GAP - height;
  const opensAbove = height > 0 && below + height > viewport.Height - VIEWPORT_MARGIN && above >= VIEWPORT_MARGIN;
  const room = opensAbove ? anchor.Top - MENU_GAP - VIEWPORT_MARGIN : viewport.Height - VIEWPORT_MARGIN - below;
  return { Left: left, Top: opensAbove ? above : below, MaxHeight: Math.max(MENU_MIN_MAX_HEIGHT, room) };
}

/**
 * The menu row to focus for ArrowDown, ArrowUp, Home or End. `current` is the focused row, or -1 when focus is outside
 * the rows (the filter box). Home and End only act on a row, so they still move the caret in the filter box.
 */
export function NextMenuFocusIndex(key: string, current: number, count: number): number | null {
  if (count === 0) {
    return null;
  }
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count;
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count;
    case 'Home':
      return current < 0 ? null : 0;
    case 'End':
      return current < 0 ? null : count - 1;
    default:
      return null;
  }
}
