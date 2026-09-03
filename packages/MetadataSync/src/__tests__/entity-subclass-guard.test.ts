import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { describeMissingEntitySubclass, resetMissingEntitySubclassWarnings } from '../lib/entity-subclass-guard';

class RegisteredTestEntity extends BaseEntity {}

describe('describeMissingEntitySubclass', () => {
  beforeEach(() => {
    resetMissingEntitySubclassWarnings();
  });

  it('warns once for an entity with no registered subclass, then goes quiet', () => {
    const first = describeMissingEntitySubclass('MJ_Test: Unregistered Widgets');
    expect(first).toMatch(/No entity subclass is registered for 'MJ_Test: Unregistered Widgets'/);
    expect(first).toMatch(/--no-app-packages/);
    expect(describeMissingEntitySubclass('mj_test: unregistered widgets')).toBeNull();
  });

  it('returns null for an entity whose subclass is registered', () => {
    MJGlobal.Instance.ClassFactory.Register(BaseEntity, RegisteredTestEntity, 'MJ_Test: Registered Widgets');
    expect(describeMissingEntitySubclass('MJ_Test: Registered Widgets')).toBeNull();
  });

  it('ignores blank names', () => {
    expect(describeMissingEntitySubclass('   ')).toBeNull();
  });
});
