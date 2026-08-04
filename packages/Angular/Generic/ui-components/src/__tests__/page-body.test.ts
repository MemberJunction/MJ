import { describe, it, expect, beforeEach } from 'vitest';
import { MJPageBodyComponent } from '../lib/page-body/page-body.component';

/**
 * Tests for MJPageBodyComponent's Padding/Flex inputs → HostBinding class mapping.
 * The actual padding/display behavior is asserted via the inverted `--no-padding` /
 * `--flex` class hooks the component applies.
 */
describe('MJPageBodyComponent', () => {
  let cmp: MJPageBodyComponent;

  beforeEach(() => {
    cmp = new MJPageBodyComponent();
  });

  describe('defaults', () => {
    it('should default Padding to true', () => {
      expect(cmp.Padding).toBe(true);
    });

    it('should default Flex to false', () => {
      expect(cmp.Flex).toBe(false);
    });

    it('should not apply --no-padding class by default', () => {
      expect(cmp.NoPaddingClass).toBe(false);
    });

    it('should not apply --flex class by default', () => {
      expect(cmp.FlexClass).toBe(false);
    });
  });

  describe('Padding → NoPaddingClass (inverted)', () => {
    it('should apply --no-padding class when Padding=false', () => {
      cmp.Padding = false;
      expect(cmp.NoPaddingClass).toBe(true);
    });

    it('should not apply --no-padding class when Padding=true', () => {
      cmp.Padding = true;
      expect(cmp.NoPaddingClass).toBe(false);
    });
  });

  describe('Flex → FlexClass', () => {
    it('should apply --flex class when Flex=true', () => {
      cmp.Flex = true;
      expect(cmp.FlexClass).toBe(true);
    });

    it('should not apply --flex class when Flex=false', () => {
      cmp.Flex = false;
      expect(cmp.FlexClass).toBe(false);
    });
  });

  describe('independence of Padding and Flex', () => {
    it('should support Flex=true + Padding=false (e.g. AI Analytics sidebar+content)', () => {
      cmp.Flex = true;
      cmp.Padding = false;
      expect(cmp.FlexClass).toBe(true);
      expect(cmp.NoPaddingClass).toBe(true);
    });

    it('should support Flex=true + Padding=true', () => {
      cmp.Flex = true;
      cmp.Padding = true;
      expect(cmp.FlexClass).toBe(true);
      expect(cmp.NoPaddingClass).toBe(false);
    });
  });
});
