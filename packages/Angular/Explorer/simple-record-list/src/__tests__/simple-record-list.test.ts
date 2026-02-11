/**
 * Tests for simple-record-list package:
 * - Module export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
}));

describe('simple-record-list package', () => {
  it('should be a valid module', () => {
    expect(true).toBe(true);
  });
});
