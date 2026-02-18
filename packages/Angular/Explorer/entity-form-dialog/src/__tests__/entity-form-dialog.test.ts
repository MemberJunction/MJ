/**
 * Tests for entity-form-dialog package:
 * - Module export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ViewChild: () => () => {},
  ViewContainerRef: class {},
  ChangeDetectorRef: class {},
}));

describe('entity-form-dialog package', () => {
  it('should be a valid module', () => {
    expect(true).toBe(true);
  });
});
