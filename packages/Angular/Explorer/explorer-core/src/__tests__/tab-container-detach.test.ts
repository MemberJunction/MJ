import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChangeDetectorRef, ComponentRef } from '@angular/core';

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
  ChangeDetectorRef: class {
    detach() {}
    reattach() {}
    markForCheck() {}
    detectChanges() {}
  },
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
  ResolveRecordTabDisplayTitle: vi.fn(() => ''),
  GetDeletedRecordFromEvent: vi.fn(),
  RecordTabShowsRecord: vi.fn(),
  RemoveDeletedRecordFromOrigin: vi.fn(),
  OriginToTabConfiguration: vi.fn(),
  OriginHasReturnTarget: vi.fn(),
  NormalizeRecordIdForMatch: vi.fn(),
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
vi.mock('../lib/shell/components/record-open/record-origin-crumb.component', () => ({ RecordOriginCrumbComponent: class {} }));
vi.mock('../lib/shell/components/record-open/record-switcher.service', () => ({ RecordSwitcherService: class {} }));
vi.mock('../lib/shell/components/record-open/record-switcher-sheet.component', () => ({}));
vi.mock('../lib/shell/components/tabs/component-cache-manager', () => ({ ComponentCacheManager: class {} }));

import { TabContainerComponent } from '../lib/shell/components/tabs/tab-container.component';
import type { BaseResourceComponent } from '@memberjunction/ng-shared';

interface MockCdr {
  detach: ReturnType<typeof vi.fn>;
  reattach: ReturnType<typeof vi.fn>;
  markForCheck: ReturnType<typeof vi.fn>;
}

function createMockComponentRef(): { ref: ComponentRef<BaseResourceComponent>; cdr: MockCdr } {
  const cdr: MockCdr = {
    detach: vi.fn(),
    reattach: vi.fn(),
    markForCheck: vi.fn(),
  };
  const ref = {
    instance: {} as BaseResourceComponent,
    changeDetectorRef: cdr as unknown as ChangeDetectorRef,
    hostView: {} as unknown,
  } as ComponentRef<BaseResourceComponent>;
  return { ref, cdr };
}

function createHarness(): {
  container: TabContainerComponent;
  refs: Map<string, { ref: ComponentRef<BaseResourceComponent>; cdr: MockCdr }>;
} {
  const container = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = container as unknown as Record<string, unknown>;
  const refs = new Map<string, { ref: ComponentRef<BaseResourceComponent>; cdr: MockCdr }>();

  internals['componentRefs'] = new Map<string, ComponentRef<BaseResourceComponent>>();
  internals['UseSingleResourceMode'] = false;

  return { container, refs };
}

describe('TabContainerComponent - Tab Change Detection Optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DeactivateTabView detaches the ChangeDetectorRef of the specified tab', () => {
    const { container, refs } = createHarness();
    const mock1 = createMockComponentRef();
    refs.set('tab-1', mock1);

    const componentRefsMap = (container as unknown as { componentRefs: Map<string, ComponentRef<BaseResourceComponent>> }).componentRefs;
    componentRefsMap.set('tab-1', mock1.ref);

    container.DeactivateTabView('tab-1');

    expect(mock1.cdr.detach).toHaveBeenCalledTimes(1);
    expect(mock1.cdr.reattach).not.toHaveBeenCalled();
  });

  it('ActivateTabView reattaches and marks for check the ChangeDetectorRef of the specified tab', () => {
    const { container } = createHarness();
    const mock1 = createMockComponentRef();

    const componentRefsMap = (container as unknown as { componentRefs: Map<string, ComponentRef<BaseResourceComponent>> }).componentRefs;
    componentRefsMap.set('tab-1', mock1.ref);

    container.ActivateTabView('tab-1');

    expect(mock1.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(mock1.cdr.markForCheck).toHaveBeenCalledTimes(1);
    expect(mock1.cdr.detach).not.toHaveBeenCalled();
  });

  it('SyncTabChangeDetection activates the active tab and detaches all other tabs', () => {
    const { container } = createHarness();
    const mockActive = createMockComponentRef();
    const mockInactive1 = createMockComponentRef();
    const mockInactive2 = createMockComponentRef();

    const componentRefsMap = (container as unknown as { componentRefs: Map<string, ComponentRef<BaseResourceComponent>> }).componentRefs;
    componentRefsMap.set('active-tab', mockActive.ref);
    componentRefsMap.set('inactive-1', mockInactive1.ref);
    componentRefsMap.set('inactive-2', mockInactive2.ref);

    container.SyncTabChangeDetection('active-tab');

    // Active tab is reattached and marked for check
    expect(mockActive.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(mockActive.cdr.markForCheck).toHaveBeenCalledTimes(1);
    expect(mockActive.cdr.detach).not.toHaveBeenCalled();

    // Inactive tabs are detached
    expect(mockInactive1.cdr.detach).toHaveBeenCalledTimes(1);
    expect(mockInactive1.cdr.reattach).not.toHaveBeenCalled();

    expect(mockInactive2.cdr.detach).toHaveBeenCalledTimes(1);
    expect(mockInactive2.cdr.reattach).not.toHaveBeenCalled();
  });

  it('switching active tabs in multi-tab mode deactivates the previously active tab and activates the new one', () => {
    const { container } = createHarness();
    const tab1 = createMockComponentRef();
    const tab2 = createMockComponentRef();

    const componentRefsMap = (container as unknown as { componentRefs: Map<string, ComponentRef<BaseResourceComponent>> }).componentRefs;
    componentRefsMap.set('tab-1', tab1.ref);
    componentRefsMap.set('tab-2', tab2.ref);

    // Initial state: Tab 1 is active
    container.SyncTabChangeDetection('tab-1');
    expect(tab1.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(tab2.cdr.detach).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();

    // Switch: Tab 2 becomes active
    container.SyncTabChangeDetection('tab-2');

    // Tab 1 is now detached
    expect(tab1.cdr.detach).toHaveBeenCalledTimes(1);
    expect(tab1.cdr.reattach).not.toHaveBeenCalled();

    // Tab 2 is now reattached and marked for check
    expect(tab2.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(tab2.cdr.markForCheck).toHaveBeenCalledTimes(1);
  });

  it('handles single-resource mode component activation and deactivation correctly', () => {
    const { container } = createHarness();
    const singleMock = createMockComponentRef();

    const internals = container as unknown as Record<string, unknown>;
    internals['UseSingleResourceMode'] = true;
    internals['singleResourceComponentRef'] = singleMock.ref;
    internals['singleResourceCacheIdentity'] = { tabId: 'single-tab', driverClass: 'C', recordId: '1', appId: 'app1' };

    // Activating active tab reattaches + marks for check
    container.ActivateTabView('single-tab');
    expect(singleMock.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(singleMock.cdr.markForCheck).toHaveBeenCalledTimes(1);

    // Deactivating single-resource tab detaches
    container.DeactivateTabView('single-tab');
    expect(singleMock.cdr.detach).toHaveBeenCalledTimes(1);
  });

  it('keeps side-by-side visible split-pane tabs attached while detaching stacked hidden tabs', () => {
    const { container } = createHarness();
    const paneLeftActive = createMockComponentRef();
    const paneLeftStacked = createMockComponentRef();
    const paneRightVisibleSplit = createMockComponentRef();

    const internals = container as unknown as Record<string, unknown>;
    const componentRefsMap = internals['componentRefs'] as Map<string, ComponentRef<BaseResourceComponent>>;
    componentRefsMap.set('left-active', paneLeftActive.ref);
    componentRefsMap.set('left-stacked', paneLeftStacked.ref);
    componentRefsMap.set('right-split', paneRightVisibleSplit.ref);

    const glContainers = new Map<string, { isHidden: boolean }>([
      ['left-active', { isHidden: false }],
      ['left-stacked', { isHidden: true }],
      ['right-split', { isHidden: false }],
    ]);
    internals['layoutManager'] = {
      GetContainer: (id: string) => glContainers.get(id),
    };

    container.SyncTabChangeDetection('left-active');

    // Both visible split panes remain attached
    expect(paneLeftActive.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(paneLeftActive.cdr.detach).not.toHaveBeenCalled();
    expect(paneRightVisibleSplit.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(paneRightVisibleSplit.cdr.detach).not.toHaveBeenCalled();

    // Stacked background tab is detached
    expect(paneLeftStacked.cdr.detach).toHaveBeenCalledTimes(1);
    expect(paneLeftStacked.cdr.reattach).not.toHaveBeenCalled();
  });

  it('detaches main-region split panes while viewing the Records region in dual-region mode', () => {
    const { container } = createHarness();
    const mainDashA = createMockComponentRef();
    const mainDashB = createMockComponentRef();
    const activeRecord = createMockComponentRef();

    const internals = container as unknown as Record<string, unknown>;
    const componentRefsMap = internals['componentRefs'] as Map<string, ComponentRef<BaseResourceComponent>>;
    componentRefsMap.set('dash-a', mainDashA.ref);
    componentRefsMap.set('dash-b', mainDashB.ref);
    componentRefsMap.set('rec-1', activeRecord.ref);

    Object.defineProperty(container, 'RecordsStyleActive', { get: () => true, configurable: true });
    internals['ShowRecordsRegion'] = true;
    internals['isRecordTab'] = (tab: { id: string }) => tab.id === 'rec-1';
    internals['workspaceManager'] = {
      GetTab: (id: string) => ({ id, configuration: {} }),
    };
    internals['layoutManager'] = {
      GetContainer: () => ({ isHidden: false }),
    };

    container.SyncTabChangeDetection('rec-1');

    expect(activeRecord.cdr.reattach).toHaveBeenCalledTimes(1);
    expect(mainDashA.cdr.detach).toHaveBeenCalledTimes(1);
    expect(mainDashB.cdr.detach).toHaveBeenCalledTimes(1);
  });

  it('deduplicates Golden Layout show/hide listeners when a container is reused', () => {
    const { container } = createHarness();
    const tabMock = createMockComponentRef();
    const internals = container as unknown as {
      componentRefs: Map<string, ComponentRef<BaseResourceComponent>>;
      wireContainerVisibilityEvents: (tabId: string, glContainer: unknown) => void;
    };
    internals.componentRefs.set('tab-1', tabMock.ref);

    const listeners = new Map<string, Array<() => void>>();
    const glContainer = {
      isHidden: false,
      state: { tabId: 'tab-1' },
      on: vi.fn((evt: string, cb: () => void) => {
        const list = listeners.get(evt) ?? [];
        list.push(cb);
        listeners.set(evt, list);
      }),
    };

    internals.wireContainerVisibilityEvents('tab-1', glContainer);
    internals.wireContainerVisibilityEvents('tab-1', glContainer);

    expect(glContainer.on).toHaveBeenCalledTimes(2); // once for 'hide', once for 'show'

    listeners.get('hide')?.forEach((fn) => fn());
    expect(tabMock.cdr.detach).toHaveBeenCalledTimes(1);

    listeners.get('show')?.forEach((fn) => fn());
    expect(tabMock.cdr.reattach).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles missing tab IDs without throwing', () => {
    const { container } = createHarness();
    expect(() => container.DeactivateTabView('non-existent')).not.toThrow();
    expect(() => container.ActivateTabView('non-existent')).not.toThrow();
    expect(() => container.SyncTabChangeDetection(null)).not.toThrow();
  });
});
