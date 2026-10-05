import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: class { emit() {} },
}));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public NotifyEditModeChanged = vi.fn<(editing: boolean) => void>();
  },
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: Function) => target }));
vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  CompositeKey: class {},
  EntityInfo: class {},
  IsNewEntityRecordUrlId: vi.fn(() => false),
}));
vi.mock('../single-record/single-record.component', () => ({ SingleRecordComponent: class {} }));

import { EntityRecordResource } from './record-resource.component';

/**
 * EntityRecordResource is the last Explorer hop before BaseResourceComponent's
 * callback: it must forward the hosted form's edit-mode edge verbatim so the
 * tab container can promote the records preview tab.
 */
describe('EntityRecordResource.ResourceEditModeChanged', () => {
  it('forwards the edit flag to NotifyEditModeChanged', () => {
    const r = new EntityRecordResource();
    r.ResourceEditModeChanged(true);
    r.ResourceEditModeChanged(false);
    const notify = (r as unknown as { NotifyEditModeChanged: ReturnType<typeof vi.fn> }).NotifyEditModeChanged;
    expect(notify.mock.calls).toEqual([[true], [false]]);
  });

  it('IsEditing() stays a read of the live single-record (fallback path)', () => {
    const r = new EntityRecordResource();
    (r as unknown as { singleRecord: { IsEditing(): boolean } }).singleRecord = { IsEditing: () => true };
    expect(r.IsEditing()).toBe(true);
  });
});
