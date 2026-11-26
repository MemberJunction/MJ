import { describe, expect, it } from 'vitest';
import { PositionAnchoredOverlay } from './positioning';

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe('PositionAnchoredOverlay', () => {
  it('centers when target is null or placement is center', () => {
    const res = PositionAnchoredOverlay(
      null,
      { width: 320, height: 180 },
      { ViewportWidth: 1000, ViewportHeight: 800 },
    );
    expect(res.Placement).toBe('center');
    expect(res.X).toBe(340);
    expect(res.Y).toBe(310);
    expect(res.ArrowX).toBeNull();
  });

  it('flips from bottom to top when bottom overflows viewport', () => {
    const targetRect = makeRect(200, 620, 120, 40);
    const res = PositionAnchoredOverlay(
      targetRect,
      { width: 280, height: 160 },
      {
        Placement: 'bottom',
        ViewportWidth: 1000,
        ViewportHeight: 720,
        OffsetPx: 12,
      },
    );
    expect(res.Side).toBe('top');
    expect(res.Y).toBeLessThan(targetRect.top);
  });

  it('avoids obscuring the currently focused element (WCAG 2.4.11)', () => {
    const targetRect = makeRect(300, 300, 100, 40);
    const focusedBelow = makeRect(260, 350, 200, 40);

    const res = PositionAnchoredOverlay(
      targetRect,
      { width: 260, height: 140 },
      {
        Placement: 'bottom',
        ViewportWidth: 1200,
        ViewportHeight: 900,
        OffsetPx: 12,
        FocusedElementRect: focusedBelow,
      },
    );
    expect(res.Side).not.toBe('bottom');
  });
});
