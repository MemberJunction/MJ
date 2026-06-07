import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { EntityInfo } from '@memberjunction/core';
import type { MJViewTypeEntity } from '@memberjunction/core-entities';
import { BaseViewTypeDescriptor } from '../lib/view-types/view-type.contracts';
import { ViewTypeEngine } from '../lib/view-types/view-type.engine';

// NOTE: We test the framework (base descriptor + engine) with an in-test descriptor rather than
// importing the four built-in descriptors — those pull the Angular component graph (grid/cards/
// timeline/map) which needs the JIT compiler in a unit-test env. The built-in renderers + the
// dynamic-mount host are exercised by the live Playwright pass.

// Module-level hooks so the test can observe the descriptor the ClassFactory instantiates.
let availableFlag = true;
let ensureCalls = 0;

@RegisterClass(BaseViewTypeDescriptor, 'TestAvailViewType')
class TestAvailViewType extends BaseViewTypeDescriptor {
  readonly Name = 'TestAvailViewType';
  readonly DisplayName = 'Test';
  readonly Icon = 'fa-solid fa-flask';
  readonly RendererComponent = class {};
  override IsAvailableFor(): boolean {
    return availableFlag;
  }
  override async EnsureAvailabilityData(): Promise<void> {
    ensureCalls++;
  }
}

function entity(): EntityInfo {
  return { ID: 'E1', Name: 'Test Entity' } as unknown as EntityInfo;
}

function seedViewTypes(rows: Array<{ ID: string; DriverClass: string; Name: string }>): void {
  (ViewTypeEngine.Instance as unknown as { _viewTypes: MJViewTypeEntity[] })._viewTypes =
    rows as unknown as MJViewTypeEntity[];
}

describe('BaseViewTypeDescriptor defaults', () => {
  class PlainViewType extends BaseViewTypeDescriptor {
    readonly Name = 'PlainViewType';
    readonly DisplayName = 'Plain';
    readonly Icon = 'fa-solid fa-shapes';
    readonly RendererComponent = class {};
  }

  it('defaults IsAvailableFor to true', () => {
    expect(new PlainViewType().IsAvailableFor(entity())).toBe(true);
  });

  it('defaults EnsureAvailabilityData to a resolved no-op', async () => {
    await expect(new PlainViewType().EnsureAvailabilityData()).resolves.toBeUndefined();
  });
});

describe('ViewTypeEngine', () => {
  beforeEach(() => {
    availableFlag = true;
    ensureCalls = 0;
    seedViewTypes([{ ID: 'VT1', DriverClass: 'TestAvailViewType', Name: 'Test' }]);
  });

  it('GetDescriptor resolves a registered descriptor by DriverClass', () => {
    const d = ViewTypeEngine.Instance.GetDescriptor('TestAvailViewType');
    expect(d).toBeTruthy();
    expect(d?.Name).toBe('TestAvailViewType');
  });

  it('GetAvailableViewTypeRows pairs the row with its descriptor when available', () => {
    const rows = ViewTypeEngine.Instance.GetAvailableViewTypeRows(entity());
    expect(rows).toHaveLength(1);
    expect(rows[0].ViewType.ID).toBe('VT1');
    expect(rows[0].Descriptor.Name).toBe('TestAvailViewType');
  });

  it('GetAvailableViewTypeRows excludes view types whose predicate is false', () => {
    availableFlag = false;
    expect(ViewTypeEngine.Instance.GetAvailableViewTypeRows(entity())).toHaveLength(0);
  });

  it('GetAvailableViewTypes returns just the descriptors', () => {
    const descriptors = ViewTypeEngine.Instance.GetAvailableViewTypes(entity());
    expect(descriptors.map(d => d.Name)).toEqual(['TestAvailViewType']);
  });

  it('EnsureAvailabilityData invokes each descriptor hook once', async () => {
    await ViewTypeEngine.Instance.EnsureAvailabilityData();
    expect(ensureCalls).toBe(1);
  });

  it('returns nothing for a null entity', () => {
    expect(ViewTypeEngine.Instance.GetAvailableViewTypeRows(null as unknown as EntityInfo)).toHaveLength(0);
  });
});
