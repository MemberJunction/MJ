import { describe, it, expect } from 'vitest';

/**
 * Tests for MJFilterPanelComponent's chip select/toggle logic (single + multi).
 *
 * We don't import the component (its `imports` pull in MJDropdownComponent etc.
 * which need JIT unavailable in plain Vitest). Instead we replicate the
 * `isChipActive` / `onChipClick` logic verbatim from the source and test it.
 * Keep in sync with src/lib/filter-panel/filter-panel.component.ts.
 */

type FilterOptionValue = string | number | boolean | null;
interface Field { key: string; multi?: boolean }

class PanelLogic {
  public Values: Record<string, unknown> = {};

  getValue(key: string): unknown { return this.Values?.[key]; }
  setValue(key: string, value: unknown): void { this.Values = { ...this.Values, [key]: value }; }

  isChipActive(field: Field, optValue: FilterOptionValue): boolean {
    if (field.multi) {
      const current = this.getValue(field.key);
      return Array.isArray(current) && current.includes(optValue);
    }
    return this.getValue(field.key) === optValue;
  }

  onChipClick(field: Field, optValue: FilterOptionValue): void {
    if (!field.multi) {
      this.setValue(field.key, optValue);
      return;
    }
    const current = this.getValue(field.key);
    const next: FilterOptionValue[] = Array.isArray(current) ? [...current] : [];
    const idx = next.indexOf(optValue);
    if (idx >= 0) next.splice(idx, 1); else next.push(optValue);
    this.setValue(field.key, next);
  }
}

describe('MJFilterPanelComponent chip logic (replicated)', () => {
  describe('single-select (default)', () => {
    const field: Field = { key: 'access' };

    it('click replaces the value', () => {
      const p = new PanelLogic();
      p.onChipClick(field, 'public');
      expect(p.getValue('access')).toBe('public');
      p.onChipClick(field, 'custom');
      expect(p.getValue('access')).toBe('custom');
    });

    it('isChipActive matches by equality', () => {
      const p = new PanelLogic();
      p.setValue('access', 'restricted');
      expect(p.isChipActive(field, 'restricted')).toBe(true);
      expect(p.isChipActive(field, 'public')).toBe(false);
    });
  });

  describe('multi-select', () => {
    const field: Field = { key: 'status', multi: true };

    it('first click seeds an array even when value is unset', () => {
      const p = new PanelLogic();
      p.onChipClick(field, 'Active');
      expect(p.getValue('status')).toEqual(['Active']);
    });

    it('clicking distinct options accumulates them', () => {
      const p = new PanelLogic();
      p.onChipClick(field, 'Active');
      p.onChipClick(field, 'Pending');
      expect(p.getValue('status')).toEqual(['Active', 'Pending']);
    });

    it('clicking an active option toggles it off', () => {
      const p = new PanelLogic();
      p.onChipClick(field, 'Active');
      p.onChipClick(field, 'Pending');
      p.onChipClick(field, 'Active');
      expect(p.getValue('status')).toEqual(['Pending']);
    });

    it('isChipActive reflects array membership', () => {
      const p = new PanelLogic();
      p.setValue('status', ['Active', 'Disabled']);
      expect(p.isChipActive(field, 'Active')).toBe(true);
      expect(p.isChipActive(field, 'Disabled')).toBe(true);
      expect(p.isChipActive(field, 'Pending')).toBe(false);
    });

    it('isChipActive is false when value is not an array', () => {
      const p = new PanelLogic();
      p.setValue('status', 'Active');
      expect(p.isChipActive(field, 'Active')).toBe(false);
    });
  });
});
