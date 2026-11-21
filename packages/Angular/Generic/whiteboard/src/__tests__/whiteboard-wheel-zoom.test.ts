import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Wheel / trackpad zoom on the board (LXP P15 — "zooming with the trackpad is way too fast and
 * abrupt, and it's hard to fine-tune").
 *
 * `OnWheel` used to read only the SIGN of `deltaY` and apply a fixed 10% step per EVENT. A macOS
 * trackpad pinch arrives as ctrl+wheel with small fractional deltas at the trackpad's sample
 * rate, so the zoom rate was a function of how many events the hardware emitted, not how far
 * the fingers moved: ~9 samples saturated the 25%–200% range. These specs pin the contract:
 *
 *  1. the zoom factor scales with the delta MAGNITUDE (capped per event), so ten small samples
 *     land where one sample of their sum lands — count-independent;
 *  2. one mouse notch (|deltaY| ≥ the cap) still steps 10%, so mouse users feel no change;
 *  3. `metaKey` alone is a Cmd-scroll and PANS — only `ctrlKey` (the pinch gesture) zooms, which
 *     also ends the momentum-zoom after fingers lift;
 *  4. `deltaMode` lines/pages are normalized to pixels first (Firefox mouse wheels);
 *  5. the STEPPED button path (ZoomIn/ZoomOut) flags a short transform transition; the wheel and
 *     the hold-to-zoom tick path never do (a transition on a continuous gesture lags it).
 *
 * Same harness as whiteboard-board-buckets.test.ts: Angular's decorator surface is stubbed so the
 * class can be `new`'d under node. Without a canvas ref, `zoomAt` writes `Zoom` directly, which is
 * exactly the number these specs are about.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Directive: () => (t: Function) => t,
  Injectable: () => (t: Function) => t,
  Pipe: () => (t: Function) => t,
  NgModule: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  ViewChild: () => () => {},
  HostListener: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  ElementRef: class {},
  inject: () => ({ detectChanges() {}, markForCheck() {} }),
}));
vi.mock('@angular/common', () => ({ CommonModule: class {} }));
vi.mock('@memberjunction/ng-markdown', () => ({ MarkdownModule: class {} }));
vi.mock('@memberjunction/ng-code-editor', () => ({ CodeEditorModule: class {} }));
vi.mock('../lib/whiteboard-srcdoc.pipe', () => ({ WhiteboardWidgetSrcdocPipe: class {} }));
vi.mock('../lib/whiteboard-pages.component', () => ({ RealtimeWhiteboardPagesComponent: class {} }));

const windowStub = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
(globalThis as unknown as { window: typeof windowStub }).window = windowStub;

import { RealtimeWhiteboardBoardComponent, ZOOM_STEP_TRANSITION_MS } from '../lib/whiteboard-board.component';
import { WhiteboardState } from '../lib/whiteboard-state';

type Board = RealtimeWhiteboardBoardComponent;

interface WheelInit {
  deltaY: number;
  deltaX?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** 0 = pixels (default), 1 = lines, 2 = pages. */
  deltaMode?: number;
}

/** A WheelEvent stand-in: the handler reads only these members. */
function wheel(init: WheelInit): WheelEvent {
  return {
    deltaY: init.deltaY,
    deltaX: init.deltaX ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    deltaMode: init.deltaMode ?? 0,
    clientX: 100,
    clientY: 100,
    preventDefault: vi.fn(),
  } as unknown as WheelEvent;
}

function makeBoard(): Board {
  const board = new RealtimeWhiteboardBoardComponent();
  board.State = new WhiteboardState();
  board.Zoom = 1;
  return board;
}

/** Zoom after `count` identical ctrl+wheel samples of `deltaY` px, from Zoom = 1. */
function zoomAfter(count: number, deltaY: number, deltaMode = 0): number {
  const board = makeBoard();
  for (let i = 0; i < count; i++) {
    board.OnWheel(wheel({ deltaY, ctrlKey: true, deltaMode }));
  }
  return board.Zoom;
}

describe('RealtimeWhiteboardBoardComponent — wheel zoom tracks the gesture', () => {
  describe('magnitude, not event count', () => {
    it('one mouse notch (−100px) still zooms in by the familiar 10% step', () => {
      expect(zoomAfter(1, -100)).toBeCloseTo(1.1, 6);
    });

    it('one mouse notch the other way (+100px) zooms out by the same step', () => {
      expect(zoomAfter(1, 100)).toBeCloseTo(1 / 1.1, 6);
    });

    it('a small trackpad sample (−5px) zooms far less than a full notch', () => {
      const small = zoomAfter(1, -5);
      expect(small).toBeGreaterThan(1);
      expect(small).toBeLessThan(1.02);
    });

    it('ten −5px samples land where one −50px sample lands (count-independent)', () => {
      expect(zoomAfter(10, -5)).toBeCloseTo(zoomAfter(1, -50), 6);
    });

    it('caps a single huge delta so one wild event cannot jump the whole range', () => {
      // 1000px in one event is a scroll-wheel burst, not a gesture: same as one notch.
      expect(zoomAfter(1, -1000)).toBeCloseTo(zoomAfter(1, -100), 6);
    });

    it('still clamps to the 25%–200% range', () => {
      expect(zoomAfter(200, -100)).toBe(2);
      expect(zoomAfter(200, 100)).toBe(0.25);
    });

    it('a zero delta leaves the zoom alone', () => {
      expect(zoomAfter(1, 0)).toBe(1);
    });
  });

  describe('deltaMode normalization', () => {
    it('three LINES (Firefox mouse wheel) read as a mouse notch, not as three pixels', () => {
      const lines = zoomAfter(1, -3, 1);
      expect(lines).toBeGreaterThan(zoomAfter(1, -3, 0));
      expect(lines).toBeCloseTo(1.1, 2);
    });

    it('a PAGE reads as at least a notch', () => {
      expect(zoomAfter(1, -1, 2)).toBeCloseTo(1.1, 6);
    });
  });

  describe('which modifier zooms', () => {
    it('ctrlKey (the trackpad pinch) zooms and does not pan', () => {
      const board = makeBoard();
      board.OnWheel(wheel({ deltaY: -50, ctrlKey: true }));
      expect(board.Zoom).toBeGreaterThan(1);
      expect(board.PanX).toBe(0);
      expect(board.PanY).toBe(0);
    });

    it('metaKey ALONE is a Cmd-scroll: it pans and never zooms (ends the momentum zoom)', () => {
      const board = makeBoard();
      board.OnWheel(wheel({ deltaY: 40, deltaX: 10, metaKey: true }));
      expect(board.Zoom).toBe(1);
      expect(board.PanY).toBe(-40);
      expect(board.PanX).toBe(-10);
    });

    it('a plain wheel pans by the raw deltas (unchanged)', () => {
      const board = makeBoard();
      board.OnWheel(wheel({ deltaY: 40, deltaX: -8 }));
      expect(board.Zoom).toBe(1);
      expect(board.PanY).toBe(-40);
      expect(board.PanX).toBe(8);
    });

    it('always prevents the browser default (no page zoom / scroll)', () => {
      const board = makeBoard();
      const zoomEvt = wheel({ deltaY: -5, ctrlKey: true });
      const panEvt = wheel({ deltaY: 5 });
      board.OnWheel(zoomEvt);
      board.OnWheel(panEvt);
      expect(zoomEvt.preventDefault).toHaveBeenCalledTimes(1);
      expect(panEvt.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('stepped-zoom transition flag', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('ZoomIn flags the viewport as stepping, then clears it after the transition', () => {
      const board = makeBoard();
      expect(board.ViewportStepping).toBe(false);
      board.ZoomIn();
      expect(board.ViewportStepping).toBe(true);
      vi.advanceTimersByTime(ZOOM_STEP_TRANSITION_MS);
      expect(board.ViewportStepping).toBe(false);
    });

    it('ZoomOut flags it too', () => {
      const board = makeBoard();
      board.ZoomOut();
      expect(board.ViewportStepping).toBe(true);
    });

    it('two quick steps keep ONE timer: the flag clears once, after the last step', () => {
      const board = makeBoard();
      board.ZoomIn();
      vi.advanceTimersByTime(ZOOM_STEP_TRANSITION_MS / 2);
      board.ZoomIn();
      vi.advanceTimersByTime(ZOOM_STEP_TRANSITION_MS / 2);
      expect(board.ViewportStepping).toBe(true); // the first timer must not clear the second step early
      vi.advanceTimersByTime(ZOOM_STEP_TRANSITION_MS / 2);
      expect(board.ViewportStepping).toBe(false);
    });

    it('the wheel never flags it (a transition would lag a continuous gesture)', () => {
      const board = makeBoard();
      board.OnWheel(wheel({ deltaY: -5, ctrlKey: true }));
      expect(board.ViewportStepping).toBe(false);
    });

    it('the hold-to-zoom tick path (ZoomByFactor) never flags it either', () => {
      const board = makeBoard();
      board.ZoomByFactor(1.035);
      expect(board.ViewportStepping).toBe(false);
    });
  });
});
