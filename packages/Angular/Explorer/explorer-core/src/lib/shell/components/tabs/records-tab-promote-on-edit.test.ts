import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  HostListener: () => () => undefined,
  EventEmitter: class { emit() {} },
  ElementRef: class {},
  ApplicationRef: class {},
  EnvironmentInjector: class {},
  ChangeDetectorRef: class {},
  ComponentRef: class {},
  ViewEncapsulation: { None: 0 },
  runInInjectionContext: vi.fn(),
  createComponent: vi.fn(),
  inject: vi.fn(() => ({})),
}));
vi.mock('@memberjunction/ng-base-application', () => ({
  GoldenLayoutManager: class {},
  WorkspaceStateManager: class {},
  ApplicationManager: class {},
  FlattenLayoutToSingleStack: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({ MJGlobal: { Instance: { ClassFactory: {} } } }));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
  HomeAppPinService: class {},
  NavigationService: class {},
  ExplorerBreakpointService: class {},
  IsRecordTabsStyle: vi.fn(() => true),
  IsRecordsTabConfiguration: vi.fn(() => true),
  IsRecordsRegionTab: vi.fn(() => true),
  IsRecordDockedToWorkspace: vi.fn(() => false),
  RECORD_DOCKED_TO_WORKSPACE_KEY: 'recordDockedToWorkspace',
  GetRecordSourceContext: vi.fn(() => null),
  SafeDetectChanges: vi.fn(),
  ResolveRecordTypeIcon: vi.fn(() => ''),
}));
vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJResourceTypeEntity: class {},
  ResourcePermissionEngine: { Instance: {} },
}));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class {} }));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('../record-open/record-origin-crumb.component', () => ({ RecordOriginCrumbComponent: class {} }));
vi.mock('../record-open/record-switcher.service', () => ({ RecordSwitcherService: class {} }));
vi.mock('../record-open/record-switcher-sheet.component', () => ({}));
vi.mock('./component-cache-manager', () => ({ ComponentCacheManager: class {} }));

import { TabContainerComponent } from './tab-container.component';
import { IsRecordsRegionTab } from '@memberjunction/ng-shared';

/**
 * Promote-on-edit: the records preview tab is PINNED the moment its form
 * enters edit mode, so it is neither replaceable nor italic from then on
 * (VS Code's promote-on-modify). Promotion is sticky — the `false` edge that
 * SaveRecord / Cancel emit never unpins — and scoped to the records REGION:
 * docked records and classic-style tabs keep user-owned pin state.
 *
 * Same node-preset / Object.create approach as records-tab-reload.test.ts,
 * whose mock preamble this file shares.
 */
interface Harness {
  component: TabContainerComponent;
  pinTab: ReturnType<typeof vi.fn>;
}

function tab(overrides: Partial<{ isPinned: boolean; configuration: Record<string, unknown> }> = {}) {
  return {
    id: 'tab-1',
    applicationId: 'app-1',
    title: 'Widgets - r1',
    resourceRecordId: 'r1',
    isPinned: false,
    configuration: { resourceType: 'Records', Entity: 'Widgets', recordId: 'r1' },
    ...overrides,
  };
}

function createHarness(opts: { tab: ReturnType<typeof tab> | undefined; recordsStyle?: boolean }): Harness {
  const pinTab = vi.fn();
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  internals['workspaceManager'] = { GetTab: () => opts.tab, PinTab: pinTab };
  Object.defineProperty(component, 'RecordsStyleActive', { get: () => opts.recordsStyle ?? true });
  return { component, pinTab };
}

describe('records region — promote on first edit', () => {
  beforeEach(() => {
    vi.mocked(IsRecordsRegionTab).mockReturnValue(true);
  });

  it('pins an unpinned region record when its form enters edit mode', () => {
    const h = createHarness({ tab: tab() });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).toHaveBeenCalledWith('tab-1');
  });

  it('does nothing for an already-pinned tab (new records are born pinned)', () => {
    const h = createHarness({ tab: tab({ isPinned: true }) });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing for a record DOCKED to the workspace (not in the region)', () => {
    vi.mocked(IsRecordsRegionTab).mockReturnValue(false);
    const h = createHarness({ tab: tab({ configuration: { resourceType: 'Records', recordDockedToWorkspace: true } }) });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing under the classic style (no records region exists)', () => {
    const h = createHarness({ tab: tab(), recordsStyle: false });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown tab id', () => {
    const h = createHarness({ tab: undefined });
    h.component.PromoteRecordTabOnEdit('tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  // A component detached into the cache mid-edit keeps its EditMode, and a
  // reattach never re-runs StartEditMode, so the only edit signal at that
  // seam is the synchronous IsEditing() read. Without this, an edited record
  // closed and re-opened lands in a fresh temp tab: editing, unpinned, italic.
  it('reattaching a cached component that is still editing promotes its new tab', () => {
    const h = createHarness({ tab: tab() });
    const instance = { IsEditing: () => true };
    (h.component as unknown as { promoteIfReattachedEditing(i: typeof instance, id: string): void })
      .promoteIfReattachedEditing(instance, 'tab-1');
    expect(h.pinTab).toHaveBeenCalledWith('tab-1');
  });

  it('reattaching a cached component that is NOT editing leaves the tab alone', () => {
    const h = createHarness({ tab: tab() });
    const instance = { IsEditing: () => false };
    (h.component as unknown as { promoteIfReattachedEditing(i: typeof instance, id: string): void })
      .promoteIfReattachedEditing(instance, 'tab-1');
    expect(h.pinTab).not.toHaveBeenCalled();
  });

  it('the wired callback pins on true and NEVER unpins on false (save / cancel)', () => {
    const h = createHarness({ tab: tab() });
    const instance = { getTabId: () => 'tab-1', ResourceEditModeChangedEvent: null as ((editing: boolean) => void) | null };
    (h.component as unknown as { wireEditModePromotion(i: typeof instance): void }).wireEditModePromotion(instance);
    expect(instance.ResourceEditModeChangedEvent).not.toBeNull();
    instance.ResourceEditModeChangedEvent!(true);
    instance.ResourceEditModeChangedEvent!(false);
    expect(h.pinTab).toHaveBeenCalledTimes(1);
    expect(h.pinTab).toHaveBeenCalledWith('tab-1');
  });
});
