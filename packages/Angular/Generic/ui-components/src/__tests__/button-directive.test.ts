import { describe, it, expect, beforeEach } from 'vitest';
import { MJButtonDirective, MjButtonVariant, MjButtonSize } from '../lib/button/button.directive';

/**
 * Tests for MJButtonDirective pure logic.
 * We instantiate the directive directly (no Angular TestBed)
 * and exercise the HostBinding getters and click handler.
 */
describe('MJButtonDirective', () => {
  let directive: MJButtonDirective;

  beforeEach(() => {
    directive = new MJButtonDirective();
  });

  describe('default values', () => {
    it('should default variant to "secondary"', () => {
      expect(directive.variant).toBe('secondary');
    });

    it('should default size to "md"', () => {
      expect(directive.size).toBe('md');
    });

    it('should default toggleable to false', () => {
      expect(directive.toggleable).toBe(false);
    });

    it('should default selected to false', () => {
      expect(directive.selected).toBe(false);
    });

    it('should always have the base class', () => {
      expect(directive.baseClass).toBe(true);
    });
  });

  describe('variant CSS class getters', () => {
    const variantMap: Array<{ variant: MjButtonVariant; getter: keyof MJButtonDirective }> = [
      { variant: 'primary', getter: 'isPrimary' },
      { variant: 'secondary', getter: 'isSecondary' },
      { variant: 'outline', getter: 'isOutline' },
      { variant: 'flat', getter: 'isFlat' },
      { variant: 'danger', getter: 'isDanger' },
      { variant: 'icon', getter: 'isIcon' },
      { variant: 'success', getter: 'isSuccess' },
      { variant: 'warning', getter: 'isWarning' },
    ];

    for (const { variant, getter } of variantMap) {
      it(`should return true for ${getter} when variant is "${variant}"`, () => {
        directive.variant = variant;
        expect(directive[getter]).toBe(true);
      });

      it(`should return false for ${getter} when variant is not "${variant}"`, () => {
        // Pick a different variant
        const other = variant === 'primary' ? 'secondary' : 'primary';
        directive.variant = other;
        expect(directive[getter]).toBe(false);
      });
    }

    it('should have exactly one variant getter true at a time', () => {
      const allGetters = variantMap.map(v => v.getter);

      for (const { variant } of variantMap) {
        directive.variant = variant;
        const trueCount = allGetters.filter(g => directive[g] === true).length;
        expect(trueCount).toBe(1);
      }
    });
  });

  describe('size CSS class getters', () => {
    it('should return true for isSm when size is "sm"', () => {
      directive.size = 'sm';
      expect(directive.isSm).toBe(true);
      expect(directive.isLg).toBe(false);
    });

    it('should return true for isLg when size is "lg"', () => {
      directive.size = 'lg';
      expect(directive.isLg).toBe(true);
      expect(directive.isSm).toBe(false);
    });

    it('should return false for both isSm and isLg when size is "md" (default)', () => {
      directive.size = 'md';
      expect(directive.isSm).toBe(false);
      expect(directive.isLg).toBe(false);
    });
  });

  describe('toggle behavior', () => {
    it('should not toggle selected on click when toggleable is false', () => {
      directive.toggleable = false;
      directive.selected = false;
      directive.OnClick();
      expect(directive.selected).toBe(false);
    });

    it('should toggle selected on click when toggleable is true', () => {
      directive.toggleable = true;
      directive.selected = false;
      directive.OnClick();
      expect(directive.selected).toBe(true);
    });

    it('should toggle selected back to false on second click', () => {
      directive.toggleable = true;
      directive.selected = false;
      directive.OnClick();
      directive.OnClick();
      expect(directive.selected).toBe(false);
    });

    it('should emit selectedChange on toggle', () => {
      directive.toggleable = true;
      directive.selected = false;
      const emitted: boolean[] = [];
      directive.selectedChange.subscribe((v: boolean) => emitted.push(v));

      directive.OnClick();
      expect(emitted).toEqual([true]);

      directive.OnClick();
      expect(emitted).toEqual([true, false]);
    });

    it('should not emit selectedChange when not toggleable', () => {
      directive.toggleable = false;
      const emitted: boolean[] = [];
      directive.selectedChange.subscribe((v: boolean) => emitted.push(v));

      directive.OnClick();
      expect(emitted).toEqual([]);
    });
  });

  describe('selected CSS class', () => {
    it('should return true for isSelected when toggleable and selected', () => {
      directive.toggleable = true;
      directive.selected = true;
      expect(directive.isSelected).toBe(true);
    });

    it('should return false for isSelected when not toggleable even if selected', () => {
      directive.toggleable = false;
      directive.selected = true;
      expect(directive.isSelected).toBe(false);
    });

    it('should return false for isSelected when toggleable but not selected', () => {
      directive.toggleable = true;
      directive.selected = false;
      expect(directive.isSelected).toBe(false);
    });
  });

  describe('aria-pressed attribute', () => {
    it('should return "true" when toggleable and selected', () => {
      directive.toggleable = true;
      directive.selected = true;
      expect(directive.ariaPressed).toBe('true');
    });

    it('should return "false" when toggleable and not selected', () => {
      directive.toggleable = true;
      directive.selected = false;
      expect(directive.ariaPressed).toBe('false');
    });

    it('should return null when not toggleable', () => {
      directive.toggleable = false;
      expect(directive.ariaPressed).toBeNull();
    });
  });
});
