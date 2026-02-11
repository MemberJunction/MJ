/**
 * Tests for link-directives package:
 * - BaseLink (pure logic)
 * - Module exports verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Directive: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Input: () => () => {},
  ElementRef: class {},
  Renderer2: class {},
  OnInit: class {},
  HostListener: () => () => {},
}));

vi.mock('@memberjunction/core', () => ({
  EntityField: class {},
  EntityInfo: class {},
  BaseEntity: class {},
  CompositeKey: class {},
  Metadata: class { Entities = []; },
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/ng-shared', () => ({
  NavigationService: class {
    OpenEntityRecord = vi.fn();
  },
}));

describe('link-directives package', () => {
  it('should export BaseLink class', async () => {
    const mod = await import('../lib/ng-base-link');
    expect(mod.BaseLink).toBeDefined();
  });

  it('should export EmailLink directive', async () => {
    const mod = await import('../lib/ng-email-link');
    expect(mod.EmailLink).toBeDefined();
  });

  it('should export WebLink directive', async () => {
    const mod = await import('../lib/ng-web-link');
    expect(mod.WebLink).toBeDefined();
  });

  it('should export FieldLink directive', async () => {
    const mod = await import('../lib/ng-field-link');
    expect(mod.FieldLink).toBeDefined();
  });
});
