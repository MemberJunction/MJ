/**
 * Logic spec for two tabs that show the same dashboard in two applications: a Home tab and a
 * Dashboards app tab (NavigationService.OpenDashboard with `applicationId`). Each tab gets its own
 * component, because the component cache keys on application + driver class + record, and the
 * reload rule compares each tab with its own component's Data, so a configuration emission
 * reloads neither tab.
 *
 * Node preset (not `.dom.test.ts`): the component is reached via Object.create, as in
 * tab-sync-reload.test.ts. The component cache is the real ComponentCacheManager; `document` is
 * stubbed for the wrapper element the load path creates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationRef } from '@angular/core';

/** The component instances createComponent has handed out, in order. */
const created = vi.hoisted(() => ({ instances: [] as Array<Record<string, unknown>> }));

vi.mock('@angular/core', () => ({
  Component:
    () =>
    <T>(target: T) =>
      target,
  ViewChild: () => () => undefined,
  Input: () => () => undefined,
  Output: () => () => undefined,
  HostListener: () => () => undefined,
  EventEmitter: class {
    emit() {}
  },
  ElementRef: class {},
  ApplicationRef: class {},
  EnvironmentInjector: class {},
  ChangeDetectorRef: class {},
  ComponentRef: class {},
  ViewEncapsulation: { None: 0 },
  runInInjectionContext: vi.fn(),
  createComponent: vi.fn(() => {
    // A reattach reads IsEditing to decide whether to pin an editing records tab.
    const instance: Record<string, unknown> = { LoadComplete: false, RebindTabId: vi.fn(), IsEditing: () => false };
    created.instances.push(instance);
    return { instance, hostView: { rootNodes: [{}] }, destroy: vi.fn() };
  }),
  inject: vi.fn(() => ({})),
}));
vi.mock('@memberjunction/ng-base-application', () => ({
  GoldenLayoutManager: class {},
  WorkspaceStateManager: class {},
  ApplicationManager: class {},
  FlattenLayoutToSingleStack: vi.fn(),
}));
vi.mock('@memberjunction/global', () => ({
  MJGlobal: { Instance: { ClassFactory: { GetRegistrationAsync: vi.fn(async () => ({ SubClass: class DashboardResourceDouble {} })) } } },
}));
vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
  HomeAppPinService: class {},
  NavigationService: class {},
  ExplorerBreakpointService: class {},
  IsRecordTabsStyle: vi.fn(() => false),
  IsRecordsTabConfiguration: vi.fn(() => false),
  IsRecordsRegionTab: vi.fn(() => false),
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

import { TabContainerComponent } from './tab-container.component';
import { ComponentCacheManager } from './component-cache-manager';

const HOME_APP = 'app-home';
const DASHBOARDS_APP = 'app-dashboards';
const DASHBOARD_ID = 'dash-1';

interface TestTab {
  id: string;
  applicationId: string;
  title: string;
  resourceRecordId: string;
  isPinned: boolean;
  configuration: Record<string, unknown>;
}

/** A dashboard tab as OpenDashboard creates it. */
function dashboardTab(id: string, applicationId: string): TestTab {
  return {
    id,
    applicationId,
    title: 'Revenue Board',
    resourceRecordId: DASHBOARD_ID,
    isPinned: true,
    configuration: { resourceType: 'Dashboards', dashboardId: DASHBOARD_ID, recordId: DASHBOARD_ID },
  };
}

/** A DOM element double with the members the load path uses. */
function elementDouble(): { className: string; style: { cssText: string }; innerHTML: string; appendChild: ReturnType<typeof vi.fn> } {
  return { className: '', style: { cssText: '' }, innerHTML: '', appendChild: vi.fn() };
}

interface Harness {
  component: TabContainerComponent;
  internals: Record<string, unknown>;
  cache: ComponentCacheManager;
  setTabs(next: TestTab[]): void;
  cleanupTabComponent: ReturnType<typeof vi.fn>;
  loadTabContent: ReturnType<typeof vi.fn>;
}

/** A tab container whose main layout holds `initial`, with the real component cache. */
function createHarness(initial: TestTab[]): Harness {
  let current = initial;
  const component = Object.create(TabContainerComponent.prototype) as TabContainerComponent;
  const internals = component as unknown as Record<string, unknown>;
  const appRef = { attachView: vi.fn(), detachView: vi.fn() };
  const cache = new ComponentCacheManager(appRef as unknown as ApplicationRef);

  // Object.create skips field initializers, so the collections a constructed component owns are set here.
  internals['componentRefs'] = new Map();
  internals['tabsCurrentlyLoading'] = new Set<string>();
  internals['layoutInitialized'] = true;
  internals['layoutManager'] = {
    IsInitialized: true,
    GetAllTabIds: () => current.map((t) => t.id),
    RemoveTab: vi.fn(),
    MarkTabNotLoaded: vi.fn(),
    GetContainer: vi.fn(() => ({ element: elementDouble() })),
    UpdateTabStyle: vi.fn(),
    FocusTab: vi.fn(),
  };
  internals['workspaceManager'] = {
    GetTab: (id: string) => current.find((t) => t.id === id),
    GetConfiguration: () => ({ activeTabId: current[current.length - 1]?.id ?? null, tabs: current }),
  };
  internals['appManager'] = { GetAppById: () => undefined };
  internals['cacheManager'] = cache;
  internals['appRef'] = appRef;
  internals['environmentInjector'] = {};
  internals['getResourceDataFromTab'] = vi.fn(async (t: TestTab) => ({
    ResourceType: 'Dashboards',
    ResourceRecordID: t.resourceRecordId,
    Configuration: { ...t.configuration, applicationId: t.applicationId, resourceTypeDriverClass: 'DashboardResource', tabId: t.id },
  }));
  internals['ensureRecordOriginCrumb'] = vi.fn();
  internals['destroyOriginCrumb'] = vi.fn();
  internals['emitFirstLoadCompleteOnce'] = vi.fn();
  internals['updateTabDisplayName'] = vi.fn();
  internals['upgradeNavTabIcon'] = vi.fn(async () => undefined);
  internals['updateOriginCrumb'] = vi.fn();
  internals['UseSingleResourceMode'] = false;

  return {
    component,
    internals,
    cache,
    setTabs: (next: TestTab[]) => {
      current = next;
    },
    cleanupTabComponent: vi.fn(),
    loadTabContent: vi.fn(),
  };
}

type Internals = {
  loadTabContent(tabId: string, container: unknown): Promise<void>;
  syncTabsWithConfiguration(tabs: TestTab[]): void;
};

/** Loads a tab's content through the real load path. */
async function load(h: Harness, tabId: string): Promise<void> {
  await (h.component as unknown as Internals).loadTabContent(tabId, { element: elementDouble() });
}

/** Sends later reloads to spies, so only the sync's decision is observed. */
function watchReloads(h: Harness): void {
  h.internals['cleanupTabComponent'] = h.cleanupTabComponent;
  h.internals['loadTabContent'] = h.loadTabContent;
}

function componentOf(h: Harness, tabId: string): Record<string, unknown> | undefined {
  return (h.internals['componentRefs'] as Map<string, { instance: Record<string, unknown> }>).get(tabId)?.instance;
}

describe('main layout — one dashboard in a Home tab and a Dashboards app tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    created.instances.length = 0;
    vi.stubGlobal('document', { createElement: () => elementDouble() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives each tab its own component, and the cache keeps both', async () => {
    const home = dashboardTab('tab-home', HOME_APP);
    const dashboards = dashboardTab('tab-dashboards', DASHBOARDS_APP);
    const h = createHarness([home, dashboards]);

    await load(h, 'tab-home');
    await load(h, 'tab-dashboards');

    expect(created.instances).toHaveLength(2);
    const homeComponent = componentOf(h, 'tab-home');
    const dashboardsComponent = componentOf(h, 'tab-dashboards');
    expect(homeComponent).toBe(created.instances[0]);
    expect(dashboardsComponent).toBe(created.instances[1]);
    expect(h.cache.GetComponentByTabId('tab-home')?.componentRef.instance).toBe(homeComponent);
    expect(h.cache.GetComponentByTabId('tab-dashboards')?.componentRef.instance).toBe(dashboardsComponent);
    // Each component reads and writes its own tab.
    expect((homeComponent?.['Data'] as { Configuration: Record<string, unknown> }).Configuration['tabId']).toBe('tab-home');
    expect((dashboardsComponent?.['Data'] as { Configuration: Record<string, unknown> }).Configuration['tabId']).toBe('tab-dashboards');
  });

  it('reloads neither tab when the configuration emits, including a title change on one of them', async () => {
    const home = dashboardTab('tab-home', HOME_APP);
    const dashboards = dashboardTab('tab-dashboards', DASHBOARDS_APP);
    const h = createHarness([home, dashboards]);
    await load(h, 'tab-home');
    await load(h, 'tab-dashboards');
    watchReloads(h);

    const sync = (tabs: TestTab[]): void => {
      h.setTabs(tabs);
      (h.component as unknown as Internals).syncTabsWithConfiguration(tabs);
    };
    sync([home, dashboards]);
    sync([home, { ...dashboards, title: 'Revenue Board v2' }]);

    expect(h.cleanupTabComponent).not.toHaveBeenCalled();
    expect(h.loadTabContent).not.toHaveBeenCalled();
  });

  it('keeps the Home tab component when the Dashboards app tab is closed and opened again', async () => {
    const home = dashboardTab('tab-home', HOME_APP);
    const dashboards = dashboardTab('tab-dashboards', DASHBOARDS_APP);
    const h = createHarness([home, dashboards]);
    await load(h, 'tab-home');
    await load(h, 'tab-dashboards');
    const homeComponent = componentOf(h, 'tab-home');
    const dashboardsComponent = componentOf(h, 'tab-dashboards');

    // Closing a tab detaches its component and keeps it cached (the TabClosed handler).
    (h.component as unknown as { cleanupTabComponent(tabId: string): void }).cleanupTabComponent('tab-dashboards');
    const reopened = dashboardTab('tab-dashboards-2', DASHBOARDS_APP);
    h.setTabs([home, reopened]);
    await load(h, 'tab-dashboards-2');

    expect(componentOf(h, 'tab-dashboards-2')).toBe(dashboardsComponent);
    expect(dashboardsComponent?.['RebindTabId']).toHaveBeenCalledWith('tab-dashboards-2');
    expect(componentOf(h, 'tab-home')).toBe(homeComponent);
    expect(h.cache.GetComponentByTabId('tab-home')?.componentRef.instance).toBe(homeComponent);
    expect(created.instances).toHaveLength(2);
  });
});
