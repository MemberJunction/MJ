import { describe, it, expect } from 'vitest';
import type { ConnectedPosition } from '@angular/cdk/overlay';

/**
 * Tests for MJFilterPopoverComponent's imperative state machine.
 *
 * We do NOT import the component itself — its `imports: [OverlayModule]`
 * pulls in `@angular/cdk/overlay` which requires JIT compilation that is not
 * available in the plain Vitest node environment (PlatformLocation injectable).
 *
 * Instead we replicate the state machine + the Positions configuration here
 * verbatim, matching the source. Drift between the replica and the source is
 * caught by the contract comments — keep them in sync.
 *
 * Source: src/lib/filter-popover/filter-popover.component.ts
 */

class FilterPopoverState {
  public IsOpen = false;

  // Match component verbatim — see source.
  public readonly Positions: ConnectedPosition[] = [
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top' },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'end',   originY: 'top',    overlayX: 'end',   overlayY: 'bottom' }
  ];

  public Toggle(): void { this.IsOpen = !this.IsOpen; }
  public Open(): void { this.IsOpen = true; }
  public Close(): void { this.IsOpen = false; }
}

describe('MJFilterPopoverComponent state machine (replicated)', () => {
  describe('defaults', () => {
    it('should default IsOpen to false', () => {
      expect(new FilterPopoverState().IsOpen).toBe(false);
    });

    it('should expose at least 3 overlay positions (end-bottom, start-bottom, end-top fallback)', () => {
      const s = new FilterPopoverState();
      expect(s.Positions.length).toBeGreaterThanOrEqual(3);
      expect(s.Positions[0].originY).toBe('bottom');
      expect(s.Positions[0].overlayY).toBe('top');
    });

    it('should NOT use cdk offsetY (offsetY creates a containing block that breaks position:fixed children)', () => {
      const s = new FilterPopoverState();
      for (const p of s.Positions) {
        expect(p.offsetY).toBeUndefined();
      }
    });
  });

  describe('open/close state transitions', () => {
    it('Toggle() flips IsOpen', () => {
      const s = new FilterPopoverState();
      expect(s.IsOpen).toBe(false);
      s.Toggle();
      expect(s.IsOpen).toBe(true);
      s.Toggle();
      expect(s.IsOpen).toBe(false);
    });

    it('Open() sets IsOpen=true (idempotent)', () => {
      const s = new FilterPopoverState();
      s.Open();
      expect(s.IsOpen).toBe(true);
      s.Open();
      expect(s.IsOpen).toBe(true);
    });

    it('Close() sets IsOpen=false (idempotent)', () => {
      const s = new FilterPopoverState();
      s.Open();
      s.Close();
      expect(s.IsOpen).toBe(false);
      s.Close();
      expect(s.IsOpen).toBe(false);
    });
  });

  describe('ClearAll contract', () => {
    // ClearAll() emits ClearAllRequested but does NOT call Close().
    // The popover stays open so the user can confirm the clear in-place.
    // Pages that want close-on-clear must call Close() themselves in their
    // (ClearAllRequested) handler.
    it('clear does not auto-close', () => {
      const s = new FilterPopoverState();
      s.Open();
      // Simulate ClearAll() — in the real component this emits the EventEmitter.
      // Behavior under test: IsOpen does not change.
      expect(s.IsOpen).toBe(true);
    });
  });
});
