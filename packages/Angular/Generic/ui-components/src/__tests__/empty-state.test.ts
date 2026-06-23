import { describe, it, expect, beforeEach } from 'vitest';
import { MJEmptyStateComponent } from '../lib/empty-state/empty-state.component';

/**
 * Tests for MJEmptyStateComponent — the canonical empty/no-results/error
 * placeholder. These cover the input defaults, the variant→host-class mapping,
 * the variant→default-icon resolution, the explicit-icon override (including the
 * "" suppression case), and the Action output. Pure logic, no TestBed.
 */
describe('MJEmptyStateComponent', () => {
  let cmp: MJEmptyStateComponent;

  beforeEach(() => {
    cmp = new MJEmptyStateComponent();
  });

  describe('defaults', () => {
    it('should default Icon to null (variant default applies)', () => {
      expect(cmp.Icon).toBeNull();
    });
    it('should default Title to empty string', () => {
      expect(cmp.Title).toBe('');
    });
    it('should default Message to empty string', () => {
      expect(cmp.Message).toBe('');
    });
    it('should default ActionText to empty string', () => {
      expect(cmp.ActionText).toBe('');
    });
    it('should default ActionIcon to empty string', () => {
      expect(cmp.ActionIcon).toBe('');
    });
    it('should default ActionVariant to "primary"', () => {
      expect(cmp.ActionVariant).toBe('primary');
    });
    it('should default Variant to "empty"', () => {
      expect(cmp.Variant).toBe('empty');
    });
    it('should default Size to "default"', () => {
      expect(cmp.Size).toBe('default');
    });
  });

  describe('size host-class bindings', () => {
    it('should not set compact/large classes for the default size', () => {
      expect(cmp.IsCompact).toBe(false);
      expect(cmp.IsLarge).toBe(false);
    });
    it('should set IsCompact only when Size is "compact"', () => {
      cmp.Size = 'compact';
      expect(cmp.IsCompact).toBe(true);
      expect(cmp.IsLarge).toBe(false);
    });
    it('should set IsLarge only when Size is "large"', () => {
      cmp.Size = 'large';
      expect(cmp.IsLarge).toBe(true);
      expect(cmp.IsCompact).toBe(false);
    });
  });

  describe('variant host-class bindings', () => {
    it('should set no variant class for the default "empty" variant', () => {
      expect(cmp.IsNoResults).toBe(false);
      expect(cmp.IsSuccess).toBe(false);
      expect(cmp.IsWarning).toBe(false);
      expect(cmp.IsError).toBe(false);
    });
    it('should set IsNoResults only when Variant is "no-results"', () => {
      cmp.Variant = 'no-results';
      expect(cmp.IsNoResults).toBe(true);
      expect(cmp.IsWarning).toBe(false);
      expect(cmp.IsError).toBe(false);
    });
    it('should set IsSuccess only when Variant is "success"', () => {
      cmp.Variant = 'success';
      expect(cmp.IsSuccess).toBe(true);
      expect(cmp.IsNoResults).toBe(false);
      expect(cmp.IsError).toBe(false);
    });
    it('should set IsWarning only when Variant is "warning"', () => {
      cmp.Variant = 'warning';
      expect(cmp.IsWarning).toBe(true);
      expect(cmp.IsNoResults).toBe(false);
      expect(cmp.IsError).toBe(false);
    });
    it('should set IsError only when Variant is "error"', () => {
      cmp.Variant = 'error';
      expect(cmp.IsError).toBe(true);
      expect(cmp.IsNoResults).toBe(false);
      expect(cmp.IsWarning).toBe(false);
    });
  });

  describe('ResolvedIcon / DefaultIconForVariant', () => {
    it('should use the inbox default for the "empty" variant', () => {
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-inbox');
      expect(MJEmptyStateComponent.DefaultIconForVariant('empty')).toBe('fa-solid fa-inbox');
    });
    it('should use the magnifier default for the "no-results" variant', () => {
      cmp.Variant = 'no-results';
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-magnifying-glass');
      expect(MJEmptyStateComponent.DefaultIconForVariant('no-results')).toBe('fa-solid fa-magnifying-glass');
    });
    it('should use the circle-check default for the "success" variant', () => {
      cmp.Variant = 'success';
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-circle-check');
      expect(MJEmptyStateComponent.DefaultIconForVariant('success')).toBe('fa-solid fa-circle-check');
    });
    it('should use the triangle default for the "warning" variant', () => {
      cmp.Variant = 'warning';
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-triangle-exclamation');
      expect(MJEmptyStateComponent.DefaultIconForVariant('warning')).toBe('fa-solid fa-triangle-exclamation');
    });
    it('should use the triangle default for the "error" variant', () => {
      cmp.Variant = 'error';
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-triangle-exclamation');
      expect(MJEmptyStateComponent.DefaultIconForVariant('error')).toBe('fa-solid fa-triangle-exclamation');
    });
    it('should honor an explicit Icon over the variant default', () => {
      cmp.Variant = 'error';
      cmp.Icon = 'fa-solid fa-key';
      expect(cmp.ResolvedIcon).toBe('fa-solid fa-key');
    });
    it('should suppress the icon when Icon is explicitly set to ""', () => {
      cmp.Icon = '';
      expect(cmp.ResolvedIcon).toBe('');
    });
  });

  describe('Action output', () => {
    it('should emit the click event from OnAction', () => {
      const emitted: MouseEvent[] = [];
      cmp.Action.subscribe((e: MouseEvent) => emitted.push(e));
      const ev = ({ type: 'click' } as MouseEvent);
      cmp.OnAction(ev);
      expect(emitted).toEqual([ev]);
    });
  });
});
