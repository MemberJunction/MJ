import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { DescribeMissingEntitySubclass, ResetMissingEntitySubclassWarnings } from '../lib/entity-subclass-guard';

class RegisteredTestEntity extends BaseEntity {}

describe('describeMissingEntitySubclass', () => {
  beforeEach(() => {
    ResetMissingEntitySubclassWarnings();
  });

  it('warns once for an entity with no registered subclass, then goes quiet', () => {
    const first = DescribeMissingEntitySubclass('MJ_Test: Unregistered Widgets');
    expect(first).toMatch(/No entity subclass is registered for 'MJ_Test: Unregistered Widgets'/);
    expect(first).toMatch(/--no-app-packages/);
    expect(DescribeMissingEntitySubclass('mj_test: unregistered widgets')).toBeNull();
  });

  it('phrases the consequence conditionally under dry-run and names both package sources', () => {
    const message = DescribeMissingEntitySubclass('MJ_Test: DryRun Widgets', { dryRun: true });
    expect(message).toMatch(/would be written/);
    expect(message).toMatch(/codeGeneration\.packages\.entities/);
    expect(message).toMatch(/dynamicPackages\.server/);
  });

  it('returns null for an entity whose subclass is registered', () => {
    MJGlobal.Instance.ClassFactory.Register(BaseEntity, RegisteredTestEntity, 'MJ_Test: Registered Widgets');
    expect(DescribeMissingEntitySubclass('MJ_Test: Registered Widgets')).toBeNull();
  });

  it('ignores blank names', () => {
    expect(DescribeMissingEntitySubclass('   ')).toBeNull();
  });
});
