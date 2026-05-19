import { describe, it, expect, beforeEach } from 'vitest';
import { MJStatBadgeComponent, MJStatBadgeVariant } from '../lib/stat-badge/stat-badge.component';

/**
 * Tests for MJStatBadgeComponent.
 *
 * We instantiate the component directly (no Angular TestBed) and exercise the
 * Variant → HostBinding getter mapping. The class metadata attached by
 * @Component does not require JIT compilation unless we actually render the
 * template, so plain `new` works here.
 */
describe('MJStatBadgeComponent', () => {
  let cmp: MJStatBadgeComponent;

  beforeEach(() => {
    cmp = new MJStatBadgeComponent();
  });

  describe('defaults', () => {
    it('should default Variant to "default"', () => {
      expect(cmp.Variant).toBe('default');
    });

    it('should default Count to null', () => {
      expect(cmp.Count).toBeNull();
    });

    it('should default Label to empty string', () => {
      expect(cmp.Label).toBe('');
    });

    it('should default Icon to empty string', () => {
      expect(cmp.Icon).toBe('');
    });

    it('should default Total to null (the "X of Y label" path is opt-in)', () => {
      expect(cmp.Total).toBeNull();
    });

    it('should have all variant getters false by default', () => {
      expect(cmp.IsSuccess).toBe(false);
      expect(cmp.IsError).toBe(false);
      expect(cmp.IsWarning).toBe(false);
      expect(cmp.IsRunning).toBe(false);
      expect(cmp.IsInfo).toBe(false);
    });
  });

  describe('variant → HostBinding getter mapping', () => {
    const variants: Array<{ v: MJStatBadgeVariant; getter: keyof MJStatBadgeComponent }> = [
      { v: 'success', getter: 'IsSuccess' },
      { v: 'error',   getter: 'IsError' },
      { v: 'warning', getter: 'IsWarning' },
      { v: 'running', getter: 'IsRunning' },
      { v: 'info',    getter: 'IsInfo' },
    ];

    for (const { v, getter } of variants) {
      it(`should set ${getter}=true when Variant='${v}'`, () => {
        cmp.Variant = v;
        expect(cmp[getter]).toBe(true);
      });

      it(`should leave the other variant getters false when Variant='${v}'`, () => {
        cmp.Variant = v;
        const others = variants.filter(x => x.v !== v).map(x => x.getter);
        for (const g of others) expect(cmp[g]).toBe(false);
      });
    }

    it('should leave all variant getters false when Variant="default"', () => {
      cmp.Variant = 'default';
      for (const { getter } of variants) expect(cmp[getter]).toBe(false);
    });

    it('should have at most one variant getter true at a time', () => {
      const getters: Array<keyof MJStatBadgeComponent> = variants.map(v => v.getter);
      const all: MJStatBadgeVariant[] = ['default', 'success', 'error', 'warning', 'running', 'info'];
      for (const v of all) {
        cmp.Variant = v;
        const trueCount = getters.filter(g => cmp[g] === true).length;
        expect(trueCount).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Total input (absorbed from mj-result-count)', () => {
    it('should accept numeric Count + numeric Total', () => {
      cmp.Count = 12;
      cmp.Total = 50;
      expect(cmp.Count).toBe(12);
      expect(cmp.Total).toBe(50);
    });

    it('should accept Count without Total (original stat-badge contract)', () => {
      cmp.Count = 42;
      cmp.Total = null;
      expect(cmp.Count).toBe(42);
      expect(cmp.Total).toBeNull();
    });

    it('should accept string Count + string Total', () => {
      cmp.Count = '1.2k';
      cmp.Total = '5k';
      expect(cmp.Count).toBe('1.2k');
      expect(cmp.Total).toBe('5k');
    });

    it('should accept Total=0 (legitimate zero-total state, not null/undefined)', () => {
      cmp.Count = 0;
      cmp.Total = 0;
      expect(cmp.Total).toBe(0);
    });
  });
});
