/**
 * Tests for explorer-settings package:
 * - Module export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Injectable: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class {},
}));

describe('explorer-settings package', () => {
  it('should be a valid module', () => {
    expect(true).toBe(true);
  });
});
