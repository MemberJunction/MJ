/**
 * Logic spec for `syncTabsWithConfiguration`'s reload decision on a saved-view tab.
 *
 * A loaded view component carries the stored ResourceType row name ('User Views'), while
 * `NavigationService.OpenView` writes the prefixed name ('MJ: User Views') into the tab's
 * configuration. An exact comparison treats every configuration emission as a content change,
 * so the tab is torn down and reloaded, and the reload emits again — the page never
 * yields (regression test T038, "Open in Tab" on a saved view).
 *
 * Node preset on purpose: this is a decision, not a rendering concern. The component is
 * reached via Object.create, as in records-tab-reload.test.ts.
 */
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

interface Harness {
  component: TabContainerComponent;
  cleanupTabComponent: ReturnType<typeof vi.fn>;
  loadTabContent: ReturnType<typeof vi.fn>;
}

/** A view tab as `NavigationService.OpenView` configures it. */
function viewTab(resourceType: string, viewId = 'view-1', applicationId = 'app-1') {
  return {
    id: 'tab-1',
    applicationId,
    title: 'Saved View',
    resourceRecordId: viewId,
    isPinned: false,
    configuration: { resourceType, recordId: viewId, viewId },
  };
}

function createHarness(boundResourceType: string, boundViewId = 'view-1'): Harness {
  const cleanupTabComponent = vi.fn();
  const loadTabContent = vi.fn(() => Promise.resolve());
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;

  internals['componentRefs'] = new Map([
    ['tab-1', { instance: { Data: { ResourceType: boundResourceType, ResourceRecordID: boundViewId, Configuration: { applicationId: 'app-1' } } } }],
  ]);
  internals['layoutInitialized'] = true;
  internals['layoutManager'] = {
    IsInitialized: true,
    GetAllTabIds: () => ['tab-1'],
    RemoveTab: vi.fn(),
    MarkTabNotLoaded: vi.fn(),
    GetContainer: vi.fn(() => ({ element: {} })),
    UpdateTabStyle: vi.fn(),
    FocusTab: vi.fn(),
  };
  internals['workspaceManager'] = { GetConfiguration: () => ({ activeTabId: 'tab-1' }) };
  internals['appManager'] = { GetAppById: () => null };
  internals['cleanupTabComponent'] = cleanupTabComponent;
  internals['loadTabContent'] = loadTabContent;
  internals['updateTabDisplayName'] = vi.fn();
  internals['upgradeNavTabIcon'] = vi.fn(() => Promise.resolve());
  internals['updateOriginCrumb'] = vi.fn();
  internals['createTab'] = vi.fn();

  return { component, cleanupTabComponent, loadTabContent };
}

const sync = (h: Harness, tab: ReturnType<typeof viewTab>): void =>
  (h.component as unknown as { syncTabsWithConfiguration(t: unknown[]): void }).syncTabsWithConfiguration([tab]);

describe('TabContainerComponent.IsSameResourceType', () => {
  it('treats the MJ: prefix as optional in either direction', () => {
    expect(TabContainerComponent.IsSameResourceType('User Views', 'MJ: User Views')).toBe(true);
    expect(TabContainerComponent.IsSameResourceType('MJ: User Views', 'User Views')).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(TabContainerComponent.IsSameResourceType(' user views ', 'MJ:User Views')).toBe(true);
  });

  it('keeps different types different', () => {
    expect(TabContainerComponent.IsSameResourceType('User Views', 'Dashboards')).toBe(false);
    expect(TabContainerComponent.IsSameResourceType('User Views', undefined)).toBe(false);
  });
});

describe('syncTabsWithConfiguration — saved-view tab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the loaded view when only the MJ: prefix differs', () => {
    const h = createHarness('User Views');
    sync(h, viewTab('MJ: User Views'));
    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  it('stays stable across repeated configuration emissions', () => {
    const h = createHarness('User Views');
    for (let i = 0; i < 5; i++) sync(h, viewTab('MJ: User Views'));
    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
  });

  it('still reloads when the tab now points at a different view', () => {
    const h = createHarness('User Views', 'view-1');
    sync(h, viewTab('MJ: User Views', 'view-2'));
    expect(h.cleanupTabComponent).toHaveBeenCalledWith('tab-1');
    expect(h.loadTabContent).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the resource type really changed', () => {
    const h = createHarness('Dashboards');
    sync(h, viewTab('MJ: User Views'));
    expect(h.cleanupTabComponent).toHaveBeenCalledWith('tab-1');
  });
});
