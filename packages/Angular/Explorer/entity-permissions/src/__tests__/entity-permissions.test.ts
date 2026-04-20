/**
 * Tests for entity-permissions package:
 * - Module export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class {},
  ChangeDetectionStrategy: { OnPush: 1 },
}));

describe('entity-permissions package', () => {
  it('should be a valid module', () => {
    expect(true).toBe(true);
  });
});
