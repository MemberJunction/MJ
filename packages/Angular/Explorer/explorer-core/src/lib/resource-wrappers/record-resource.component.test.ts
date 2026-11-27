import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  EventEmitter: class { emit() {} },
  inject: vi.fn(() => ({})),
}));
// EntityRecordResource injects WorkspaceStateManager and builds agent context
// from ng-base-forms (forms Phase A/B); neither is under test here, and the
// real modules would drag Angular's DI through the mocked @angular/core.
vi.mock('@memberjunction/ng-base-application', () => ({ WorkspaceStateManager: class {} }));
vi.mock('@memberjunction/ng-base-forms', () => ({ BuildFormAgentContext: vi.fn(() => ({})) }));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    public NotifyEditModeChanged = vi.fn<(editing: boolean) => void>();
  },
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', async () => ({
  RegisterClass: () => (target: Function) => target,
  // The real pure helper, so the tab title test checks the wording users see.
  GenerateSingularName: (await vi.importActual<typeof import('@memberjunction/global')>('@memberjunction/global')).GenerateSingularName,
}));
vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  CompositeKey: class {},
  EntityInfo: class {},
  IsNewEntityRecordUrlId: vi.fn((id: string | undefined) => !id),
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

/** A new record's tab reads "New Deal" — the singular display name, without a trailing "Record". */
describe('EntityRecordResource.GetResourceDisplayName for a new record', () => {
  it('uses the singular display name of the entity', async () => {
    const entity = { Name: 'Sales: Deals', DisplayName: 'Deals', DisplayNameOrName: 'Deals' };
    const provider = { EntityByName: () => entity, Entities: [entity] };
    const r = new EntityRecordResource();
    (r as unknown as { ProviderToUse: typeof provider }).ProviderToUse = provider;
    const data = { Configuration: { Entity: 'Sales: Deals' }, ResourceRecordID: '' };
    const title = await r.GetResourceDisplayName(data as unknown as Parameters<EntityRecordResource['GetResourceDisplayName']>[0]);
    expect(title).toBe('New Deal');
  });
});
