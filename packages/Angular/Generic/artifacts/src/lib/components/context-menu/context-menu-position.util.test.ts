import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ComputeRootMenuPlacement,
  ComputeSubmenuPlacement,
  FormatMenuShortcut,
  IsKeyboardContextMenuShortcut,
  IsMovingTowardSubmenu,
  IsPointInTriangle,
  NormalizeContextMenuItems,
  TouchContextMenuMonitor,
} from './context-menu-position.util';
import type {
  ContextMenuAnchorRect,
  ContextMenuCommandBase,
  ContextMenuItem,
  TouchContextMenuTrigger,
} from './context-menu.types';

interface TestCmd extends ContextMenuCommandBase {
  readonly Type: 'copy' | 'paste' | 'delete' | 'bold' | 'italic';
}

describe('context-menu-position.util', () => {
  describe('ComputeRootMenuPlacement', () => {
    it('places menu directly at cursor when plenty of room exists', () => {
      const result = ComputeRootMenuPlacement(
        120,
        160,
        { Width: 220, Height: 260 },
        { Width: 1280, Height: 800 },
      );

      expect(result).toEqual({
        Left: 120,
        Top: 160,
        MaxHeight: 784,
        FlippedHorizontally: false,
        FlippedVertically: false,
      });
    });

    it('flips both horizontally and vertically near bottom-right corner (1260, 780) in 1280x800 viewport', () => {
      const result = ComputeRootMenuPlacement(
        1260,
        780,
        { Width: 220, Height: 300 },
        { Width: 1280, Height: 800 },
      );

      expect(result.FlippedHorizontally).toBe(true);
      expect(result.FlippedVertically).toBe(true);
      expect(result.Left).toBe(1040);
      expect(result.Top).toBe(480);
      expect(result.Left).toBeGreaterThanOrEqual(8);
      expect(result.Top).toBeGreaterThanOrEqual(8);
      expect(result.Left + 220).toBeLessThanOrEqual(1280 - 8);
      expect(result.Top + 300).toBeLessThanOrEqual(800 - 8);
    });

    it('clamps oversized menu (height 950 in 720px viewport) to Top: 8 and MaxHeight: 704', () => {
      const result = ComputeRootMenuPlacement(
        200,
        100,
        { Width: 240, Height: 950 },
        { Width: 1280, Height: 720 },
      );

      expect(result.Top).toBe(8);
      expect(result.MaxHeight).toBe(704);
      expect(result.FlippedVertically).toBe(true);
    });

    it('clamps near top-left edge so margin is respected', () => {
      const result = ComputeRootMenuPlacement(
        2,
        3,
        { Width: 220, Height: 180 },
        { Width: 1280, Height: 800 },
      );

      expect(result.Left).toBe(8);
      expect(result.Top).toBe(8);
    });
  });

  describe('ComputeSubmenuPlacement', () => {
    const viewport = { Width: 1280, Height: 800 };

    it('opens to the right of parent item with 4px overlap when space allows', () => {
      const parentRect: ContextMenuAnchorRect = {
        Top: 100,
        Left: 200,
        Right: 420,
        Bottom: 132,
        Width: 220,
        Height: 32,
      };
      const result = ComputeSubmenuPlacement(parentRect, { Width: 200, Height: 180 }, viewport);

      expect(result.FlippedHorizontally).toBe(false);
      expect(result.Left).toBe(416);
      expect(result.Top).toBe(96);
    });

    it('flips left when parentItemRect.Right + submenu.Width > viewport.Width - 8', () => {
      const parentRect: ContextMenuAnchorRect = {
        Top: 150,
        Left: 900,
        Right: 1120,
        Bottom: 182,
        Width: 220,
        Height: 32,
      };
      const result = ComputeSubmenuPlacement(parentRect, { Width: 220, Height: 200 }, viewport);

      expect(result.FlippedHorizontally).toBe(true);
      expect(result.Left).toBe(900 + 4 - 220);
    });

    it('inherits left cascade direction for second-level submenu when parentFlippedHorizontally is true', () => {
      const parentRect: ContextMenuAnchorRect = {
        Top: 150,
        Left: 684,
        Right: 904,
        Bottom: 182,
        Width: 220,
        Height: 32,
      };
      // Even though there IS space to the right (904 - 4 + 200 = 1100 <= 1272),
      // inheriting parentFlippedHorizontally keeps the cascade flowing left cleanly.
      const result = ComputeSubmenuPlacement(
        parentRect,
        { Width: 200, Height: 180 },
        viewport,
        true,
      );

      expect(result.FlippedHorizontally).toBe(true);
      expect(result.Left).toBe(684 + 4 - 200);
    });

    it('clamps submenu vertically when aligned near bottom of viewport', () => {
      const parentRect: ContextMenuAnchorRect = {
        Top: 720,
        Left: 200,
        Right: 420,
        Bottom: 752,
        Width: 220,
        Height: 32,
      };
      const result = ComputeSubmenuPlacement(parentRect, { Width: 200, Height: 240 }, viewport);

      expect(result.Top).toBe(800 - 240 - 8);
      expect(result.FlippedVertically).toBe(true);
    });
  });

  describe('IsPointInTriangle & IsMovingTowardSubmenu', () => {
    it('returns true for diagonal cursor vector moving toward submenu', () => {
      const prev = { X: 300, Y: 150 };
      const submenuRect: ContextMenuAnchorRect = {
        Top: 100,
        Left: 416,
        Right: 616,
        Bottom: 320,
        Width: 200,
        Height: 220,
      };
      const cursor = { X: 360, Y: 190 };

      expect(IsMovingTowardSubmenu(cursor, prev, submenuRect)).toBe(true);
    });

    it('returns false when cursor moves vertically downward onto sibling item away from submenu', () => {
      const prev = { X: 300, Y: 150 };
      const submenuRect: ContextMenuAnchorRect = {
        Top: 146,
        Left: 416,
        Right: 616,
        Bottom: 300,
        Width: 200,
        Height: 154,
      };
      // Moving nearly straight down in X (same X, lower Y below triangle corridor)
      const cursor = { X: 295, Y: 210 };

      expect(IsMovingTowardSubmenu(cursor, prev, submenuRect)).toBe(false);
    });

    it('handles degenerate zero-area triangle safely by returning false', () => {
      expect(
        IsPointInTriangle(
          { X: 10, Y: 10 },
          { X: 10, Y: 10 },
          { X: 10, Y: 10 },
          { X: 20, Y: 20 },
        ),
      ).toBe(false);
    });
  });

  describe('NormalizeContextMenuItems', () => {
    it('strips leading, trailing, consecutive separators and empty-section headers', () => {
      const items: ContextMenuItem<TestCmd>[] = [
        { Kind: 'separator', ID: 'lead' },
        { Kind: 'header', ID: 'empty-hdr-1', Label: 'Empty First' },
        { Kind: 'separator', ID: 'dup-1' },
        { Kind: 'separator', ID: 'dup-2' },
        { Kind: 'header', ID: 'main-hdr', Label: 'Clipboard' },
        { Kind: 'action', ID: 'copy', Label: 'Copy', Command: { Type: 'copy' } },
        { Kind: 'separator', ID: 'mid-1' },
        { Kind: 'separator', ID: 'mid-2' },
        { Kind: 'header', ID: 'empty-hdr-2', Label: 'Empty Middle' },
        { Kind: 'separator', ID: 'mid-3' },
        { Kind: 'header', ID: 'paste-hdr', Label: 'Paste Section' },
        { Kind: 'action', ID: 'paste', Label: 'Paste', Command: { Type: 'paste' } },
        { Kind: 'separator', ID: 'trail-1' },
        { Kind: 'header', ID: 'empty-hdr-3', Label: 'Empty Trailing' },
        { Kind: 'separator', ID: 'trail-2' },
      ];

      const normalized = NormalizeContextMenuItems(items);

      expect(normalized.map((i) => i.ID ?? i.Kind)).toEqual([
        'main-hdr',
        'copy',
        'mid-1',
        'paste-hdr',
        'paste',
      ]);
    });

    it('recursively normalizes submenu children without mutating input', () => {
      const items: ContextMenuItem<TestCmd>[] = [
        {
          Kind: 'submenu',
          ID: 'fmt',
          Label: 'Format',
          Children: [
            { Kind: 'separator', ID: 's1' },
            { Kind: 'action', ID: 'bold', Label: 'Bold', Command: { Type: 'bold' } },
            { Kind: 'separator', ID: 's2' },
            { Kind: 'separator', ID: 's3' },
            { Kind: 'action', ID: 'italic', Label: 'Italic', Command: { Type: 'italic' } },
            { Kind: 'separator', ID: 's4' },
          ],
        },
      ];

      const normalized = NormalizeContextMenuItems(items);
      expect(normalized).toHaveLength(1);
      const sub = normalized[0];
      expect(sub.Kind).toBe('submenu');
      if (sub.Kind === 'submenu') {
        expect(sub.Children.map((c) => c.ID)).toEqual(['bold', 's2', 'italic']);
      }
      // Input remains untouched
      const origSub = items[0];
      if (origSub.Kind === 'submenu') {
        expect(origSub.Children).toHaveLength(6);
      }
    });
  });

  describe('FormatMenuShortcut', () => {
    it('formats macOS compact glyphs when isMac is true', () => {
      expect(FormatMenuShortcut('⌘C', 'Ctrl+C', true)).toBe('⌘C');
      expect(FormatMenuShortcut('⇧⌘V', 'Ctrl+Shift+V', true)).toBe('⇧⌘V');
    });

    it('formats Windows/Linux explicit labels when isMac is false', () => {
      expect(FormatMenuShortcut('⌘C', 'Ctrl+C', false)).toBe('Ctrl+C');
      expect(FormatMenuShortcut('⇧⌘V', 'Ctrl+Shift+V', false)).toBe('Ctrl+Shift+V');
    });
  });

  describe('IsKeyboardContextMenuShortcut', () => {
    it('detects ContextMenu key and Shift+F10', () => {
      expect(IsKeyboardContextMenuShortcut({ key: 'ContextMenu', shiftKey: false } as KeyboardEvent)).toBe(true);
      expect(IsKeyboardContextMenuShortcut({ key: 'F10', shiftKey: true } as KeyboardEvent)).toBe(true);
      expect(IsKeyboardContextMenuShortcut({ key: 'F10', shiftKey: false } as KeyboardEvent)).toBe(false);
    });
  });

  describe('TouchContextMenuMonitor', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function makePointerEvent(
      type: string,
      pointerType: 'touch' | 'mouse',
      x: number,
      y: number,
      pointerId = 1,
      isPrimary = true,
    ): PointerEvent {
      return Object.assign(new Event(type), {
        pointerType,
        clientX: x,
        clientY: y,
        pointerId,
        isPrimary,
      }) as PointerEvent;
    }

    it('triggers after 500ms touch hold and suppresses one trailing click', () => {
      const triggered: TouchContextMenuTrigger[] = [];
      const monitor = new TouchContextMenuMonitor({
        OnLongPress: (t) => triggered.push(t),
      });

      monitor.OnPointerDown(makePointerEvent('pointerdown', 'touch', 140, 220));
      vi.advanceTimersByTime(499);
      expect(triggered).toHaveLength(0);

      vi.advanceTimersByTime(1);
      expect(triggered).toEqual([{ AnchorX: 140, AnchorY: 220, Target: null }]);
      expect(monitor.ConsumeSuppressedClick()).toBe(true);
      expect(monitor.ConsumeSuppressedClick()).toBe(false);
      monitor.Destroy();
    });

    it('cancels when touch drifts beyond 10px tolerance or pointerup occurs early', () => {
      const triggered: TouchContextMenuTrigger[] = [];
      const monitor = new TouchContextMenuMonitor({
        OnLongPress: (t) => triggered.push(t),
      });

      monitor.OnPointerDown(makePointerEvent('pointerdown', 'touch', 100, 100));
      monitor.OnPointerMove(makePointerEvent('pointermove', 'touch', 112, 100)); // 12px drift
      vi.advanceTimersByTime(600);
      expect(triggered).toHaveLength(0);

      monitor.OnPointerDown(makePointerEvent('pointerdown', 'touch', 100, 100, 2));
      monitor.OnPointerUp(makePointerEvent('pointerup', 'touch', 100, 100, 2));
      vi.advanceTimersByTime(600);
      expect(triggered).toHaveLength(0);
      monitor.Destroy();
    });

    it('cancels on multi-touch gesture and ignores mouse pointerdown', () => {
      const triggered: TouchContextMenuTrigger[] = [];
      const monitor = new TouchContextMenuMonitor({
        OnLongPress: (t) => triggered.push(t),
      });

      monitor.OnPointerDown(makePointerEvent('pointerdown', 'mouse', 50, 50));
      vi.advanceTimersByTime(600);
      expect(triggered).toHaveLength(0);

      monitor.OnPointerDown(makePointerEvent('pointerdown', 'touch', 100, 100, 1, true));
      monitor.OnPointerDown(makePointerEvent('pointerdown', 'touch', 150, 150, 2, false));
      vi.advanceTimersByTime(600);
      expect(triggered).toHaveLength(0);
      monitor.Destroy();
    });
  });
});
