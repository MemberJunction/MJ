/**
 * @fileoverview Zero-dependency viewport-aware anchored overlay positioning (`PositionAnchoredOverlay`)
 * and `ResizeObserver` + capture-scroll `AutoUpdateOverlayPosition` loop.
 * Enforces viewport flip/clamp, directional arrow alignment, and WCAG 2.4.11 Focus Not Obscured.
 * @module @memberjunction/ng-tours
 */

import type { TourStepPlacement } from '@memberjunction/tours-runtime';

export type OverlayPlacementSide = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type OverlayPlacementAlign = 'start' | 'center' | 'end';

export interface OverlayPositionResult {
  X: number;
  Y: number;
  Placement: TourStepPlacement;
  Side: OverlayPlacementSide;
  ArrowX: number | null;
  ArrowY: number | null;
}

export interface OverlayPositionOptions {
  Placement?: TourStepPlacement;
  OffsetPx?: number;
  ViewportPaddingPx?: number;
  ViewportWidth?: number;
  ViewportHeight?: number;
  FocusedElementRect?: DOMRect | null;
}

interface BoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Standard clearance gap between the anchored popover card and the target element border (leaves room for directional arrow). */
const DEFAULT_OFFSET_PX = 12;
/** Minimum viewport edge gutter so tour popovers never touch screen boundaries or clip box shadows. */
const DEFAULT_PADDING_PX = 12;

/**
 * Computes coordinates for `floating` relative to `target` (or viewport-centered when `target` is null
 * or `Placement === 'center'`). Automatically flips across axes when overflowing, clamps to viewport
 * bounds, and checks WCAG 2.4.11 so `FocusedElementRect` is not obscured.
 */
export function PositionAnchoredOverlay(
  target: HTMLElement | DOMRect | null,
  floating: HTMLElement | { width: number; height: number },
  options: OverlayPositionOptions = {},
): OverlayPositionResult {
  const vw = options.ViewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280);
  const vh = options.ViewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 720);
  const offset = options.OffsetPx ?? DEFAULT_OFFSET_PX;
  const padding = options.ViewportPaddingPx ?? DEFAULT_PADDING_PX;

  const floatSize = measureFloating(floating);
  const requested = options.Placement ?? 'auto';

  if (!target || requested === 'center') {
    const x = clamp(Math.round((vw - floatSize.width) / 2), padding, Math.max(padding, vw - floatSize.width - padding));
    const y = clamp(Math.round((vh - floatSize.height) / 2), padding, Math.max(padding, vh - floatSize.height - padding));
    return {
      X: x,
      Y: y,
      Placement: 'center',
      Side: 'center',
      ArrowX: null,
      ArrowY: null,
    };
  }

  const targetRect = toBoxRect(target);
  const candidateOrder = buildCandidateOrder(requested, targetRect, floatSize, vw, vh, offset, padding);

  const focusedRect = options.FocusedElementRect ?? resolveActiveElementRect(floating);

  let best: OverlayPositionResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const placement of candidateOrder) {
    const computed = computeSinglePlacement(placement, targetRect, floatSize, vw, vh, offset, padding);
    const floatBox: BoxRect = {
      left: computed.X,
      top: computed.Y,
      right: computed.X + floatSize.width,
      bottom: computed.Y + floatSize.height,
      width: floatSize.width,
      height: floatSize.height,
    };

    const targetOverlap = intersectionArea(floatBox, targetRect);
    const focusOverlap = focusedRect ? intersectionArea(floatBox, toBoxRect(focusedRect)) : 0;
    const viewportFit = computeViewportFitScore(computed.X, computed.Y, floatSize, vw, vh, padding);

    // Penalize obscuring focused element (WCAG 2.4.11) or overlapping the target
    const score = viewportFit - targetOverlap * 10 - focusOverlap * 100;

    if (score > bestScore) {
      bestScore = score;
      best = computed;
    }

    // First candidate that fits cleanly without overlapping target or active focus wins
    if (viewportFit >= 0 && targetOverlap === 0 && focusOverlap === 0) {
      return computed;
    }
  }

  return best ?? computeSinglePlacement('bottom', targetRect, floatSize, vw, vh, offset, padding);
}

/**
 * Keeps an anchored overlay synchronized with target/floating size changes and scroll/resize events
 * using `ResizeObserver` and capture-phase scroll listeners.
 */
export function AutoUpdateOverlayPosition(
  target: HTMLElement | null,
  floating: HTMLElement,
  onUpdate: () => void,
): () => void {
  let rafId: number | null = null;
  let disposed = false;

  const schedule = (): void => {
    if (disposed) {
      return;
    }
    if (typeof requestAnimationFrame === 'function') {
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!disposed) {
          onUpdate();
        }
      });
    } else {
      onUpdate();
    }
  };

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => schedule());
    if (target) {
      resizeObserver.observe(target);
    }
    resizeObserver.observe(floating);
  }

  const onWindowEvent = (): void => schedule();
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', onWindowEvent, { capture: true, passive: true });
    window.addEventListener('resize', onWindowEvent, { passive: true });
  }

  // Run initial alignment synchronously
  onUpdate();

  return () => {
    disposed = true;
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', onWindowEvent, { capture: true });
      window.removeEventListener('resize', onWindowEvent);
    }
  };
}

function measureFloating(floating: HTMLElement | { width: number; height: number }): { width: number; height: number } {
  if ('getBoundingClientRect' in floating) {
    const rect = floating.getBoundingClientRect();
    return {
      width: rect.width || floating.offsetWidth || 320,
      height: rect.height || floating.offsetHeight || 160,
    };
  }
  return floating;
}

function toBoxRect(rectOrEl: HTMLElement | DOMRect): BoxRect {
  const rect = 'getBoundingClientRect' in rectOrEl ? rectOrEl.getBoundingClientRect() : rectOrEl;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function resolveActiveElementRect(floating: HTMLElement | { width: number; height: number }): DOMRect | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) {
    return null;
  }
  if ('contains' in floating && floating.contains(active)) {
    return null;
  }
  if (active === document.body || active === document.documentElement) {
    return null;
  }
  return typeof active.getBoundingClientRect === 'function' ? active.getBoundingClientRect() : null;
}

function parsePlacement(placement: TourStepPlacement): { side: Exclude<OverlayPlacementSide, 'center'>; align: OverlayPlacementAlign } {
  if (placement === 'auto' || placement === 'center') {
    return { side: 'bottom', align: 'center' };
  }
  const [rawSide, rawAlign] = placement.split('-') as [
    Exclude<OverlayPlacementSide, 'center'>,
    OverlayPlacementAlign | undefined,
  ];
  return { side: rawSide, align: rawAlign ?? 'center' };
}

function flipSide(side: Exclude<OverlayPlacementSide, 'center'>): Exclude<OverlayPlacementSide, 'center'> {
  if (side === 'top') return 'bottom';
  if (side === 'bottom') return 'top';
  if (side === 'left') return 'right';
  return 'left';
}

function buildCandidateOrder(
  requested: TourStepPlacement,
  target: BoxRect,
  floating: { width: number; height: number },
  vw: number,
  vh: number,
  offset: number,
  padding: number,
): TourStepPlacement[] {
  if (requested === 'auto') {
    const spaceBelow = vh - target.bottom - offset - padding;
    const spaceAbove = target.top - offset - padding;
    const spaceRight = vw - target.right - offset - padding;
    const spaceLeft = target.left - offset - padding;

    const scored: Array<{ placement: TourStepPlacement; fits: boolean; space: number }> = [
      { placement: 'bottom', fits: spaceBelow >= floating.height, space: spaceBelow },
      { placement: 'top', fits: spaceAbove >= floating.height, space: spaceAbove },
      { placement: 'right', fits: spaceRight >= floating.width, space: spaceRight },
      { placement: 'left', fits: spaceLeft >= floating.width, space: spaceLeft },
    ];
    scored.sort((a, b) => Number(b.fits) - Number(a.fits) || b.space - a.space);
    return scored.map((s) => s.placement);
  }

  const { side, align } = parsePlacement(requested);
  const suffix = align === 'center' ? '' : `-${align}`;
  const opposite = `${flipSide(side)}${suffix}` as TourStepPlacement;
  const perpendicularA: TourStepPlacement = side === 'top' || side === 'bottom' ? 'right' : 'bottom';
  const perpendicularB: TourStepPlacement = side === 'top' || side === 'bottom' ? 'left' : 'top';

  return [requested, opposite, perpendicularA, perpendicularB];
}

function computeSinglePlacement(
  placement: TourStepPlacement,
  target: BoxRect,
  floating: { width: number; height: number },
  vw: number,
  vh: number,
  offset: number,
  padding: number,
): OverlayPositionResult {
  const { side, align } = parsePlacement(placement);

  let rawX = 0;
  let rawY = 0;

  if (side === 'bottom') {
    rawY = target.bottom + offset;
    rawX = alignHorizontal(target, floating.width, align);
  } else if (side === 'top') {
    rawY = target.top - floating.height - offset;
    rawX = alignHorizontal(target, floating.width, align);
  } else if (side === 'right') {
    rawX = target.right + offset;
    rawY = alignVertical(target, floating.height, align);
  } else {
    rawX = target.left - floating.width - offset;
    rawY = alignVertical(target, floating.height, align);
  }

  const x = clamp(Math.round(rawX), padding, Math.max(padding, vw - floating.width - padding));
  const y = clamp(Math.round(rawY), padding, Math.max(padding, vh - floating.height - padding));

  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  const arrowX =
    side === 'top' || side === 'bottom'
      ? clamp(Math.round(targetCenterX - x), 16, Math.max(16, floating.width - 16))
      : null;
  const arrowY =
    side === 'left' || side === 'right'
      ? clamp(Math.round(targetCenterY - y), 16, Math.max(16, floating.height - 16))
      : null;

  return {
    X: x,
    Y: y,
    Placement: placement,
    Side: side,
    ArrowX: arrowX,
    ArrowY: arrowY,
  };
}

function alignHorizontal(target: BoxRect, width: number, align: OverlayPlacementAlign): number {
  if (align === 'start') return target.left;
  if (align === 'end') return target.right - width;
  return target.left + (target.width - width) / 2;
}

function alignVertical(target: BoxRect, height: number, align: OverlayPlacementAlign): number {
  if (align === 'start') return target.top;
  if (align === 'end') return target.bottom - height;
  return target.top + (target.height - height) / 2;
}

function computeViewportFitScore(
  x: number,
  y: number,
  floating: { width: number; height: number },
  vw: number,
  vh: number,
  padding: number,
): number {
  const overflowLeft = Math.max(0, padding - x);
  const overflowTop = Math.max(0, padding - y);
  const overflowRight = Math.max(0, x + floating.width - (vw - padding));
  const overflowBottom = Math.max(0, y + floating.height - (vh - padding));
  return -(overflowLeft + overflowTop + overflowRight + overflowBottom);
}

function intersectionArea(a: BoxRect, b: BoxRect): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return xOverlap * yOverlap;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
