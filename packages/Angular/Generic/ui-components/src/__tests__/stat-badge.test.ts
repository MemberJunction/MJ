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
});
