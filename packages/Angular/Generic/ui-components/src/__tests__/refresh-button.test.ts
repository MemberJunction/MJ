import { describe, it, expect, beforeEach } from 'vitest';
import { MJRefreshButtonComponent } from '../lib/refresh-button/refresh-button.component';

/**
 * Tests for MJRefreshButtonComponent OnClick gating.
 *
 * The Loading input drives both the spinner AND the disabled state, and clicks
 * during Loading/Disabled must not emit. This is the contract pages rely on
 * when they wire `[Loading]="IsLoading"` directly to (Clicked)="LoadData()".
 */
describe('MJRefreshButtonComponent', () => {
  let cmp: MJRefreshButtonComponent;

  beforeEach(() => {
    cmp = new MJRefreshButtonComponent();
  });

  describe('defaults', () => {
    it('should default Loading to false', () => {
      expect(cmp.Loading).toBe(false);
    });
    it('should default Disabled to false', () => {
      expect(cmp.Disabled).toBe(false);
    });
    it('should default Label to "Refresh"', () => {
      expect(cmp.Label).toBe('Refresh');
    });
    it('should default Title to "Refresh"', () => {
      expect(cmp.Title).toBe('Refresh');
    });
    it('should default ShowLabel to true', () => {
      expect(cmp.ShowLabel).toBe(true);
    });
    it('should default Variant to "secondary"', () => {
      expect(cmp.Variant).toBe('secondary');
    });
    it('should default Size to "sm" (page-header density)', () => {
      expect(cmp.Size).toBe('sm');
    });
  });

  describe('OnClick gating', () => {
    function captureEmits(c: MJRefreshButtonComponent): MouseEvent[] {
      const emitted: MouseEvent[] = [];
      c.Clicked.subscribe((e: MouseEvent) => emitted.push(e));
      return emitted;
    }

    it('should emit Clicked when not Loading and not Disabled', () => {
      const emitted = captureEmits(cmp);
      const ev = ({ type: 'click' } as MouseEvent);
      cmp.OnClick(ev);
      expect(emitted).toEqual([ev]);
    });

    it('should NOT emit Clicked when Loading=true', () => {
      const emitted = captureEmits(cmp);
      cmp.Loading = true;
      cmp.OnClick(({ type: 'click' } as MouseEvent));
      expect(emitted).toEqual([]);
    });

    it('should NOT emit Clicked when Disabled=true', () => {
      const emitted = captureEmits(cmp);
      cmp.Disabled = true;
      cmp.OnClick(({ type: 'click' } as MouseEvent));
      expect(emitted).toEqual([]);
    });

    it('should NOT emit Clicked when both Loading and Disabled', () => {
      const emitted = captureEmits(cmp);
      cmp.Loading = true;
      cmp.Disabled = true;
      cmp.OnClick(({ type: 'click' } as MouseEvent));
      expect(emitted).toEqual([]);
    });

    it('should resume emitting after Loading flips back to false', () => {
      const emitted = captureEmits(cmp);
      cmp.Loading = true;
      cmp.OnClick(({ type: 'click' } as MouseEvent));
      expect(emitted).toEqual([]);
      cmp.Loading = false;
      const ev = ({ type: 'click' } as MouseEvent);
      cmp.OnClick(ev);
      expect(emitted).toEqual([ev]);
    });
  });
});
