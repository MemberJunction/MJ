import {
  ContextMenuAnchorRect,
  ContextMenuCommandBase,
  ContextMenuComputedPlacement,
  ContextMenuItem,
  ContextMenuPanelDimensions,
  ContextMenuPoint,
  ContextMenuViewportSize,
  TouchContextMenuMonitorOptions,
  TouchContextMenuTrigger,
} from './context-menu.types';

/**
 * Detects whether the current runtime platform is Apple (macOS/iOS/iPadOS)
 * and formats the appropriate keyboard shortcut badge.
 */
export function FormatMenuShortcut(
  macShortcut: string,
  winShortcut: string,
  isMac?: boolean,
): string {
  let applePlatform: boolean;
  if (typeof isMac === 'boolean') {
    applePlatform = isMac;
  } else if (typeof navigator !== 'undefined') {
    const platformHint = navigator.platform || navigator.userAgent || '';
    applePlatform = /Mac|iPhone|iPad|iPod/i.test(platformHint);
  } else {
    applePlatform = false;
  }
  return applePlatform ? macShortcut : winShortcut;
}

/**
 * Computes fixed-viewport placement for the root context menu panel with
 * edge collision flipping and viewport clamping.
 */
export function ComputeRootMenuPlacement(
  anchorX: number,
  anchorY: number,
  panel: ContextMenuPanelDimensions,
  viewport: ContextMenuViewportSize,
  edgeMargin = 8,
): ContextMenuComputedPlacement {
  const maxHeight = Math.max(160, viewport.Height - edgeMargin * 2);
  const effectiveHeight = Math.min(panel.Height, maxHeight);

  let left = anchorX;
  let flippedHorizontally = false;
  if (anchorX + panel.Width > viewport.Width - edgeMargin) {
    const flippedLeft = anchorX - panel.Width;
    left =
      flippedLeft >= edgeMargin
        ? flippedLeft
        : Math.max(edgeMargin, viewport.Width - panel.Width - edgeMargin);
    flippedHorizontally = true;
  }
  left = Math.max(edgeMargin, left);

  let top = anchorY;
  let flippedVertically = false;
  if (anchorY + effectiveHeight > viewport.Height - edgeMargin) {
    const flippedTop = anchorY - effectiveHeight;
    top =
      flippedTop >= edgeMargin
        ? flippedTop
        : Math.max(edgeMargin, viewport.Height - effectiveHeight - edgeMargin);
    flippedVertically = true;
  }
  top = Math.max(edgeMargin, top);

  return {
    Left: left,
    Top: top,
    MaxHeight: maxHeight,
    FlippedHorizontally: flippedHorizontally,
    FlippedVertically: flippedVertically,
  };
}

/**
 * Computes fixed-viewport placement for a cascading submenu panel relative
 * to its parent menu item rect, inheriting horizontal cascade direction when
 * an ancestor menu already flipped left.
 */
export function ComputeSubmenuPlacement(
  parentItemRect: ContextMenuAnchorRect,
  submenuPanel: ContextMenuPanelDimensions,
  viewport: ContextMenuViewportSize,
  parentFlippedHorizontally = false,
  overlapPx = 4,
  edgeMargin = 8,
): ContextMenuComputedPlacement {
  const maxHeight = Math.max(160, viewport.Height - edgeMargin * 2);
  const effectiveHeight = Math.min(submenuPanel.Height, maxHeight);

  const rightCandidate = parentItemRect.Right - overlapPx;
  const leftCandidate = parentItemRect.Left + overlapPx - submenuPanel.Width;
  const fitsRight = rightCandidate + submenuPanel.Width <= viewport.Width - edgeMargin;
  const fitsLeft = leftCandidate >= edgeMargin;

  let left: number;
  let flippedHorizontally: boolean;

  if (parentFlippedHorizontally) {
    if (fitsLeft) {
      left = leftCandidate;
      flippedHorizontally = true;
    } else if (fitsRight) {
      left = rightCandidate;
      flippedHorizontally = false;
    } else {
      left = edgeMargin;
      flippedHorizontally = true;
    }
  } else {
    if (fitsRight) {
      left = Math.max(edgeMargin, rightCandidate);
      flippedHorizontally = false;
    } else if (fitsLeft) {
      left = leftCandidate;
      flippedHorizontally = true;
    } else {
      left = Math.max(edgeMargin, viewport.Width - submenuPanel.Width - edgeMargin);
      flippedHorizontally = true;
    }
  }

  const preferredTop = parentItemRect.Top - 4;
  const maxTop = Math.max(edgeMargin, viewport.Height - effectiveHeight - edgeMargin);
  const clampedTop = Math.min(Math.max(edgeMargin, preferredTop), maxTop);
  const flippedVertically = clampedTop < preferredTop;

  return {
    Left: left,
    Top: clampedTop,
    MaxHeight: maxHeight,
    FlippedHorizontally: flippedHorizontally,
    FlippedVertically: flippedVertically,
  };
}

function triangleEdgeSign(
  p1: ContextMenuPoint,
  p2: ContextMenuPoint,
  p3: ContextMenuPoint,
): number {
  return (p1.X - p3.X) * (p2.Y - p3.Y) - (p2.X - p3.X) * (p1.Y - p3.Y);
}

/**
 * Returns true if `point` lies within (or on the boundary of) the non-degenerate
 * triangle formed by vertices `a`, `b`, and `c`.
 */
export function IsPointInTriangle(
  point: ContextMenuPoint,
  a: ContextMenuPoint,
  b: ContextMenuPoint,
  c: ContextMenuPoint,
): boolean {
  const area2 = Math.abs((b.X - a.X) * (c.Y - a.Y) - (c.X - a.X) * (b.Y - a.Y));
  if (area2 < 1e-6) {
    return false;
  }
  const d1 = triangleEdgeSign(point, a, b);
  const d2 = triangleEdgeSign(point, b, c);
  const d3 = triangleEdgeSign(point, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Checks whether the pointer is moving diagonally within the safe-triangle
 * corridor from `prevCursor` toward the open child `submenuRect`.
 */
export function IsMovingTowardSubmenu(
  cursor: ContextMenuPoint,
  prevCursor: ContextMenuPoint,
  submenuRect: ContextMenuAnchorRect,
  verticalPaddingPx = 8,
): boolean {
  const opensRight = submenuRect.Left >= prevCursor.X;
  const edgeX = opensRight ? submenuRect.Left : submenuRect.Right;
  const topCorner: ContextMenuPoint = { X: edgeX, Y: submenuRect.Top - verticalPaddingPx };
  const bottomCorner: ContextMenuPoint = { X: edgeX, Y: submenuRect.Bottom + verticalPaddingPx };
  return IsPointInTriangle(cursor, prevCursor, topCorner, bottomCorner);
}

function isContentItem<TPayload>(item: ContextMenuItem<TPayload>): boolean {
  return item.Kind !== 'separator' && item.Kind !== 'header';
}

/**
 * Strips leading separators, trailing separators, consecutive duplicate separators,
 * empty submenus (whose normalized children are empty), and section headers whose
 * section contains no actionable/content items.
 * Recursively normalizes submenu children without mutating the input array.
 */
export function NormalizeContextMenuItems<TPayload = ContextMenuCommandBase>(
  items: ReadonlyArray<ContextMenuItem<TPayload>>,
): ContextMenuItem<TPayload>[] {
  // Pass 1: Recursively normalize submenu children and strip empty submenus
  const withNormalizedChildren: ContextMenuItem<TPayload>[] = [];
  for (const item of items) {
    if (item.Kind === 'submenu') {
      const normalizedChildren = NormalizeContextMenuItems(item.Children);
      if (normalizedChildren.length === 0) {
        continue;
      }
      withNormalizedChildren.push({
        ...item,
        Children: normalizedChildren,
      });
    } else {
      withNormalizedChildren.push(item);
    }
  }

  // Pass 2: Drop headers that have no non-header/non-separator items in their section
  const withoutEmptyHeaders: ContextMenuItem<TPayload>[] = [];
  for (let i = 0; i < withNormalizedChildren.length; i++) {
    const current = withNormalizedChildren[i];
    if (current.Kind === 'header') {
      let hasSectionContent = false;
      for (let j = i + 1; j < withNormalizedChildren.length; j++) {
        const next = withNormalizedChildren[j];
        if (next.Kind === 'header') {
          break;
        }
        if (isContentItem(next)) {
          hasSectionContent = true;
          break;
        }
      }
      if (!hasSectionContent) {
        continue;
      }
    }
    withoutEmptyHeaders.push(current);
  }

  // Pass 3: Strip leading, trailing, and consecutive separators
  const normalized: ContextMenuItem<TPayload>[] = [];
  for (const item of withoutEmptyHeaders) {
    if (item.Kind === 'separator') {
      if (normalized.length === 0 || normalized[normalized.length - 1].Kind === 'separator') {
        continue;
      }
    }
    normalized.push(item);
  }

  while (normalized.length > 0 && normalized[normalized.length - 1].Kind === 'separator') {
    normalized.pop();
  }

  return normalized;
}

/**
 * Returns true when a keyboard event is the standard ContextMenu key or Shift+F10.
 */
export function IsKeyboardContextMenuShortcut(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
}

/**
 * Computes a deterministic viewport anchor near the top-left corner of a focused element
 * for keyboard-triggered context menus (Shift+F10 / ContextMenu key).
 */
export function ComputeElementContextMenuAnchor(element: HTMLElement): ContextMenuPoint {
  const rect = element.getBoundingClientRect();
  return {
    X: rect.left + Math.min(28, rect.width / 2),
    Y: rect.top + Math.min(28, rect.height / 2),
  };
}

/**
 * Returns true if the event target is a native text control or explicitly opted out
 * via `data-native-contextmenu="true"`, so native browser cut/copy/paste/spellcheck runs.
 */
export function IsNativeContextMenuTarget(target: EventTarget | null): boolean {
  if (!target) {
    return false;
  }
  let el: Element | null = null;
  if (typeof Element !== 'undefined' && target instanceof Element) {
    el = target;
  } else if (typeof Node !== 'undefined' && target instanceof Node) {
    el = target.parentElement;
  }
  if (!el) {
    return false;
  }
  return el.closest('input, textarea, [data-native-contextmenu="true"]') !== null;
}

/**
 * Standard host viewer contextmenu bypass guard:
 * - `event.defaultPrevented`: an embedded child widget (e.g., inline Whiteboard) already handled it
 * - `event.shiftKey`: Shift+Right-Click explicitly opts into the native browser context menu
 * - Native text inputs / `[data-native-contextmenu="true"]`
 */
export function ShouldBypassCustomContextMenu(event: MouseEvent): boolean {
  return event.defaultPrevented || event.shiftKey || IsNativeContextMenuTarget(event.target);
}

const SUPPRESS_CLICK_EXPIRY_MS = 800;

/**
 * Lightweight touch long-press monitor for iOS/Android touchscreens where
 * `pointerdown` has `pointerType === 'touch'`. Cancels on drift > 10px,
 * pointerup, pointercancel, or multi-touch, and suppresses the trailing
 * synthetic click once triggered.
 */
export class TouchContextMenuMonitor {
  private readonly delayMs: number;
  private readonly moveTolerancePx: number;
  private readonly onLongPress: (trigger: TouchContextMenuTrigger) => void;

  private activePress: {
    PointerID: number;
    StartX: number;
    StartY: number;
    Target: EventTarget | null;
    Timer: ReturnType<typeof setTimeout>;
  } | null = null;

  private suppressNextClick = false;
  private suppressClickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: TouchContextMenuMonitorOptions) {
    this.delayMs = options.DelayMs ?? 500;
    this.moveTolerancePx = options.MoveTolerancePx ?? 10;
    this.onLongPress = options.OnLongPress;
  }

  public OnPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      return;
    }
    // Multi-touch gesture cancels an in-progress single-finger long press
    if (this.activePress !== null || event.isPrimary === false) {
      this.Cancel();
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const target = event.target;
    const timer = setTimeout(() => {
      this.completeLongPress();
    }, this.delayMs);

    this.activePress = {
      PointerID: event.pointerId,
      StartX: startX,
      StartY: startY,
      Target: target,
      Timer: timer,
    };
  }

  public OnPointerMove(event: PointerEvent): void {
    if (!this.activePress || event.pointerId !== this.activePress.PointerID) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - this.activePress.StartX,
      event.clientY - this.activePress.StartY,
    );
    if (distance > this.moveTolerancePx) {
      this.Cancel();
    }
  }

  public OnPointerUp(event: PointerEvent): void {
    if (this.activePress && event.pointerId === this.activePress.PointerID) {
      this.Cancel();
    }
  }

  public OnPointerCancel(event: PointerEvent): void {
    if (this.activePress && event.pointerId === this.activePress.PointerID) {
      this.Cancel();
    }
  }

  /**
   * Returns true once if a long-press just triggered and its trailing synthetic
   * click should be ignored by the host.
   */
  public ConsumeSuppressedClick(): boolean {
    if (!this.suppressNextClick) {
      return false;
    }
    this.clearSuppressClickTimer();
    this.suppressNextClick = false;
    return true;
  }

  public Cancel(): void {
    if (this.activePress) {
      clearTimeout(this.activePress.Timer);
      this.activePress = null;
    }
  }

  public Destroy(): void {
    this.Cancel();
    this.clearSuppressClickTimer();
    this.suppressNextClick = false;
  }

  private clearSuppressClickTimer(): void {
    if (this.suppressClickTimer !== null) {
      clearTimeout(this.suppressClickTimer);
      this.suppressClickTimer = null;
    }
  }

  private completeLongPress(): void {
    const press = this.activePress;
    if (!press) {
      return;
    }
    this.activePress = null;
    this.clearSuppressClickTimer();
    this.suppressNextClick = true;
    this.suppressClickTimer = setTimeout(() => {
      this.suppressClickTimer = null;
      this.suppressNextClick = false;
    }, SUPPRESS_CLICK_EXPIRY_MS);
    this.onLongPress({
      AnchorX: press.StartX,
      AnchorY: press.StartY,
      Target: press.Target,
    });
  }
}
