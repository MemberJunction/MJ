import { describe, it, expect, beforeEach } from 'vitest';
import { MJPageFrameComponent } from '../lib/page-frame/page-frame.component';

/**
 * Tests for MJPageFrameComponent default values and input contract.
 *
 * The actual template projection behavior (HideToolbar gating, slot
 * routing) is exercised by the consuming tab-parent shells in the
 * dashboards package. This file covers what we can test in isolation:
 * the input defaults and types.
 */
describe('MJPageFrameComponent', () => {
  let cmp: MJPageFrameComponent;

  beforeEach(() => {
    cmp = new MJPageFrameComponent();
  });

  describe('defaults', () => {
    it('should default Title to empty string', () => {
      expect(cmp.Title).toBe('');
    });

    it('should default Icon to null (header hides the icon block when falsy)', () => {
      expect(cmp.Icon).toBeNull();
    });

    it('should default Subtitle to null', () => {
      expect(cmp.Subtitle).toBeNull();
    });

    it('should default HideToolbar to false (chrome renders by default)', () => {
      expect(cmp.HideToolbar).toBe(false);
    });

    it('should default Padding to true (matches mj-page-body default)', () => {
      expect(cmp.Padding).toBe(true);
    });

    it('should default Flex to false (matches mj-page-body default)', () => {
      expect(cmp.Flex).toBe(false);
    });
  });

  describe('HideToolbar toggle', () => {
    it('should accept HideToolbar=true (the tab-parent embed path)', () => {
      cmp.HideToolbar = true;
      expect(cmp.HideToolbar).toBe(true);
    });

    it('should accept HideToolbar=false (the standalone deep-link path)', () => {
      cmp.HideToolbar = false;
      expect(cmp.HideToolbar).toBe(false);
    });
  });

  describe('body forwarding inputs', () => {
    it('should accept Padding=false (sidebar+content layouts that own their gutter)', () => {
      cmp.Padding = false;
      expect(cmp.Padding).toBe(false);
    });

    it('should accept Flex=true (flex-column body for full-height children)', () => {
      cmp.Flex = true;
      expect(cmp.Flex).toBe(true);
    });

    it('should support Flex=true + Padding=false simultaneously (analytics pattern)', () => {
      cmp.Flex = true;
      cmp.Padding = false;
      expect(cmp.Flex).toBe(true);
      expect(cmp.Padding).toBe(false);
    });
  });
});
