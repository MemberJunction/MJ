/**
 * Nav items that moved to another application: FindMovedNavItem, FindMovedNavItemApp, ResolveMovedNavItem, and
 * NavigationService's SwitchToApp, RetargetMovedNavItemTabs and WatchMovedNavItemTabs against the real
 * WorkspaceStateManager. A request for the old place opens the new one.
 *
 * Mock preamble as in open-dashboard-workspace.test.ts: the Angular decorators have to be inert before
 * NavigationService can be imported.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { LogError } from '@memberjunction/core';
import { BaseApplication, WorkspaceStateManager, CreateDefaultWorkspaceConfiguration } from '@memberjunction/ng-base-application';
import type { NavItem, WorkspaceTab } from '@memberjunction/ng-base-application';
import { NavigationService } from '../navigation.service';
import { FindMovedNavItem, FindMovedNavItemApp, ResolveMovedNavItem } from '../moved-nav-items';
import type { MovedNavItem } from '../moved-nav-items';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Directive:
      () =>
      <T>(target: T) =>
        target,
    Injectable:
      () =>
      <T>(target: T) =>
        target,
    inject: vi.fn(),
  };
});
vi.mock('@angular/router', () => ({}));
vi.mock('golden-layout', () => ({ VirtualLayout: class {} }));
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  CompositeKey: class {},
  StartupManager: { Instance: {} },
  LogError: vi.fn(),
  LogStatus: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  UserInfoEngine: { Instance: {} },
  DashboardEngine: { Instance: {} },
}));
vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase(),
  NormalizeUUID: (id: string | null | undefined) => (id ?? '').trim().toLowerCase(),
  GetGlobalObjectStore: () => ({}),
  MJGlobal: { Instance: {} },
  MJEventType: {},
}));

const navItem = (Label: string, DriverClass: string, isDefault = false): NavItem => ({ Label, ResourceType: 'Custom', DriverClass, isDefault });

/** An application with these nav items. */
const application = (ID: string, Name: string, navItems: NavItem[]): BaseApplication =>
  new BaseApplication({ ID, Name, DefaultNavItems: JSON.stringify(navItems) });

const DATA_EXPLORER_NAV_ITEMS = [navItem('Data', 'DataExplorerResource', true), navItem('Queries', 'QueryBrowserResource')];
const DATA_EXPLORER = application('A0000000-0000-4000-8000-0000000000DE', 'Data Explorer', DATA_EXPLORER_NAV_ITEMS);
const DASHBOARDS = application('A0000000-0000-4000-8000-00000000000D', 'Dashboards', [
  navItem('Library', 'DashboardBrowserResource', true),
  navItem('Categories', 'DashboardsCategoriesResource'),
]);
const LIBRARY_MOVE: MovedNavItem = { FromApplication: 'Data Explorer', FromNavItem: 'Dashboards', ToApplication: 'Dashboards', ToNavItem: 'Library' };

/** A Data Explorer that still lists the Dashboards nav item. */
const dataExplorerWithDashboards = (): BaseApplication =>
  application(DATA_EXPLORER.ID, 'Data Explorer', [...DATA_EXPLORER_NAV_ITEMS, navItem('Dashboards', 'DashboardBrowserResource')]);

/**
 * A NavigationService over a real WorkspaceStateManager and an application manager holding `apps`, whose app
 * list is ready when `ready` resolves. `applications$` and `loading$` drive the manager's Applications and Loading.
 */
function createService(
  apps: BaseApplication[],
  ready: Promise<void> = Promise.resolve()
): {
  service: NavigationService;
  manager: WorkspaceStateManager;
  setActiveApp: Mock<(appId: string) => Promise<void>>;
  applications$: BehaviorSubject<BaseApplication[]>;
  loading$: BehaviorSubject<boolean>;
} {
  const manager = new WorkspaceStateManager();
  manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());
  const setActiveApp = vi.fn(async (_appId: string): Promise<void> => undefined);
  const applications$ = new BehaviorSubject<BaseApplication[]>([...apps]);
  const loading$ = new BehaviorSubject<boolean>(false);
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  internals['workspaceManager'] = manager;
  internals['appManager'] = {
    GetAllApps: () => apps,
    GetAppById: (id: string) => apps.find((a) => a.ID.toLowerCase() === id.toLowerCase()),
    SetActiveApp: setActiveApp,
    WhenReady: () => ready,
    Applications: applications$,
    Loading: loading$,
  };
  // What the capture-phase mousedown listener would have recorded.
  internals['shiftKeyPressed'] = false;
  return { service, manager, setActiveApp, applications$, loading$ };
}

const activeTab = (manager: WorkspaceStateManager): WorkspaceTab | undefined => manager.GetTab(manager.GetActiveTabId() ?? '');

/** A saved Data Explorer tab of the Dashboards nav item, as the workspace stored it. */
const savedDashboardsTab = (): WorkspaceTab => ({
  id: 'tab-dashboards',
  applicationId: DATA_EXPLORER.ID,
  title: 'Dashboards',
  resourceTypeId: '',
  resourceRecordId: '',
  isPinned: true,
  sequence: 0,
  lastAccessedAt: '2026-10-01T00:00:00.000Z',
  configuration: {
    resourceType: 'Custom',
    driverClass: 'DashboardBrowserResource',
    appName: 'Data Explorer',
    appId: DATA_EXPLORER.ID,
    navItemName: 'Dashboards',
    queryParams: { lib: 'favorites' },
  },
});

/** A saved Data Explorer tab of the Data nav item. */
const savedDataTab = (): WorkspaceTab => ({
  id: 'tab-data',
  applicationId: DATA_EXPLORER.ID,
  title: 'Data',
  resourceTypeId: '',
  resourceRecordId: '',
  isPinned: false,
  sequence: 1,
  lastAccessedAt: '2026-10-01T00:00:00.000Z',
  configuration: {
    resourceType: 'Custom',
    driverClass: 'DataExplorerResource',
    appName: 'Data Explorer',
    appId: DATA_EXPLORER.ID,
    navItemName: 'Data',
  },
});

/** A Dashboards app tab of the Library nav item. */
const libraryTab = (): WorkspaceTab => ({
  id: 'tab-library',
  applicationId: DASHBOARDS.ID,
  title: 'Library',
  resourceTypeId: '',
  resourceRecordId: '',
  isPinned: false,
  sequence: 2,
  lastAccessedAt: '2026-10-02T00:00:00.000Z',
  configuration: {
    resourceType: 'Custom',
    driverClass: 'DashboardBrowserResource',
    appName: 'Dashboards',
    appId: DASHBOARDS.ID,
    navItemName: 'Library',
  },
});

/** Loads a saved workspace with these tabs, the first of them active. */
const loadWorkspace = (manager: WorkspaceStateManager, tabs: WorkspaceTab[]): void =>
  manager.UpdateConfiguration({ ...CreateDefaultWorkspaceConfiguration(), tabs, activeTabId: tabs[0].id });

describe('FindMovedNavItem', () => {
  it.each([
    ['Data Explorer', 'dashboards '],
    ['data explorer', ' Dashboards '],
  ])('returns the Library move for %j and %j', (applicationName, navItemName) => {
    expect(FindMovedNavItem(applicationName, navItemName)).toEqual(LIBRARY_MOVE);
  });

  it('returns null for an application and nav item that did not move', () => {
    expect(FindMovedNavItem('Data Explorer', 'Queries')).toBeNull();
    expect(FindMovedNavItem('Dashboards', 'Dashboards')).toBeNull();
    expect(FindMovedNavItem('Home', 'Dashboards')).toBeNull();
  });

  it('looks only in the moves it is given', () => {
    const moves: MovedNavItem[] = [{ FromApplication: 'Admin', FromNavItem: 'Users', ToApplication: 'People', ToNavItem: 'Directory' }];
    expect(FindMovedNavItem('admin', 'users', moves)).toBe(moves[0]);
    expect(FindMovedNavItem('Data Explorer', 'Dashboards', moves)).toBeNull();
  });
});

describe('FindMovedNavItemApp', () => {
  it('returns the app the nav item moved to, by name without regard to case or outer spaces', () => {
    const dashboards = { ID: 'd', Name: ' dashboards ' };
    expect(FindMovedNavItemApp(LIBRARY_MOVE, [{ ID: 'de', Name: 'Data Explorer' }, dashboards])).toBe(dashboards);
  });

  it('returns undefined when the list does not have that app', () => {
    expect(FindMovedNavItemApp(LIBRARY_MOVE, [{ ID: 'de', Name: 'Data Explorer' }])).toBeUndefined();
  });
});

describe('ResolveMovedNavItem', () => {
  it("returns the move and the user's new app when the old app no longer has the nav item", async () => {
    const resolved = await ResolveMovedNavItem('Data Explorer', 'Dashboards', [DATA_EXPLORER, DASHBOARDS]);
    expect(resolved?.Move).toEqual(LIBRARY_MOVE);
    expect(resolved?.App).toBe(DASHBOARDS);
  });

  it("returns null without reading the old app's nav items when the nav item did not move", async () => {
    const dataExplorer = application(DATA_EXPLORER.ID, 'Data Explorer', DATA_EXPLORER_NAV_ITEMS);
    const getNavItems = vi.spyOn(dataExplorer, 'GetNavItems');

    expect(await ResolveMovedNavItem('Data Explorer', 'Queries', [dataExplorer, DASHBOARDS])).toBeNull();
    expect(getNavItems).not.toHaveBeenCalled();
  });

  it('returns null when the old app still has the nav item or the user lacks the old or the new app', async () => {
    expect(await ResolveMovedNavItem('Data Explorer', 'Dashboards', [dataExplorerWithDashboards(), DASHBOARDS])).toBeNull();
    expect(await ResolveMovedNavItem('Data Explorer', 'Dashboards', [DASHBOARDS])).toBeNull();
    expect(await ResolveMovedNavItem('Data Explorer', 'Dashboards', [DATA_EXPLORER])).toBeNull();
  });
});

describe('NavigationService.SwitchToApp for a moved nav item', () => {
  it("opens the Dashboards app's Library with the same query params when Data Explorer has no Dashboards nav item", async () => {
    const { service, manager, setActiveApp } = createService([DATA_EXPLORER, DASHBOARDS]);

    await service.SwitchToApp(DATA_EXPLORER.ID, 'Dashboards', { lib: 'favorites' });

    // Data Explorer is never the active app on the way.
    expect(setActiveApp.mock.calls).toEqual([[DASHBOARDS.ID]]);
    const tab = activeTab(manager);
    expect(tab?.applicationId).toBe(DASHBOARDS.ID);
    expect(tab?.configuration['navItemName']).toBe('Library');
    expect(tab?.configuration['queryParams']).toEqual({ lib: 'favorites' });
  });

  it('stays on Data Explorer when the user has no Dashboards app', async () => {
    const { service, manager, setActiveApp } = createService([DATA_EXPLORER]);

    await service.SwitchToApp(DATA_EXPLORER.ID, 'Dashboards', { lib: 'favorites' });

    expect(setActiveApp.mock.calls).toEqual([[DATA_EXPLORER.ID]]);
    const tab = activeTab(manager);
    expect(tab?.applicationId).toBe(DATA_EXPLORER.ID);
    expect(tab?.configuration['navItemName']).toBe('Data');
  });

  it('opens the Dashboards nav item of a Data Explorer that still has one', async () => {
    const dataExplorer = dataExplorerWithDashboards();
    const { service, manager, setActiveApp } = createService([dataExplorer, DASHBOARDS]);

    await service.SwitchToApp(dataExplorer.ID, 'Dashboards');

    expect(setActiveApp.mock.calls).toEqual([[dataExplorer.ID]]);
    const tab = activeTab(manager);
    expect(tab?.applicationId).toBe(dataExplorer.ID);
    expect(tab?.configuration['navItemName']).toBe('Dashboards');
  });
});

describe('NavigationService.RetargetMovedNavItemTabs', () => {
  it("makes a saved Data Explorer Dashboards tab a tab of the Dashboards app's Library, and leaves other tabs alone", async () => {
    const { service, manager } = createService([DATA_EXPLORER, DASHBOARDS]);
    const dataTab = savedDataTab();
    loadWorkspace(manager, [savedDashboardsTab(), dataTab]);

    expect(await service.RetargetMovedNavItemTabs()).toBe(1);

    expect(manager.GetTab('tab-dashboards')).toEqual({
      ...savedDashboardsTab(),
      applicationId: DASHBOARDS.ID,
      title: 'Library',
      configuration: {
        resourceType: 'Custom',
        driverClass: 'DashboardBrowserResource',
        appName: 'Dashboards',
        appId: DASHBOARDS.ID,
        navItemName: 'Library',
        queryParams: { lib: 'favorites' },
      },
    });
    expect(manager.GetActiveTabId()).toBe('tab-dashboards');
    expect(manager.GetTab('tab-data')).toBe(dataTab);
  });

  it('leaves the saved tab alone when the user has no Dashboards app', async () => {
    const { service, manager } = createService([DATA_EXPLORER]);
    const tabs = [savedDashboardsTab(), savedDataTab()];
    loadWorkspace(manager, tabs);
    const update = vi.spyOn(manager, 'UpdateConfiguration');

    expect(await service.RetargetMovedNavItemTabs()).toBe(0);

    expect(update).not.toHaveBeenCalled();
    expect(manager.GetConfiguration()?.tabs).toEqual(tabs);
  });

  it("decides once the user's app list has loaded", async () => {
    const apps: BaseApplication[] = [];
    let markReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (markReady = resolve));
    const { service, manager } = createService(apps, ready);
    loadWorkspace(manager, [savedDashboardsTab()]);

    const moving = service.RetargetMovedNavItemTabs();
    apps.push(DATA_EXPLORER, DASHBOARDS);
    markReady();

    expect(await moving).toBe(1);
    expect(manager.GetTab('tab-dashboards')?.applicationId).toBe(DASHBOARDS.ID);
  });

  it('keeps a tab that changed to another nav item while the move was looked up', async () => {
    const dataExplorer = application(DATA_EXPLORER.ID, 'Data Explorer', DATA_EXPLORER_NAV_ITEMS);
    const { service, manager } = createService([dataExplorer, DASHBOARDS]);
    loadWorkspace(manager, [savedDashboardsTab()]);
    const navItems = await dataExplorer.GetNavItems();
    vi.spyOn(dataExplorer, 'GetNavItems').mockImplementation(async () => {
      manager.UpdateTabConfiguration('tab-dashboards', { navItemName: 'Data', driverClass: 'DataExplorerResource' });
      return navItems;
    });

    expect(await service.RetargetMovedNavItemTabs()).toBe(0);

    const tab = manager.GetTab('tab-dashboards');
    expect(tab?.applicationId).toBe(DATA_EXPLORER.ID);
    expect(tab?.configuration['navItemName']).toBe('Data');
  });

  it("closes the saved tab when the Dashboards app already has a Library tab, which becomes active if the saved tab was", async () => {
    const { service, manager } = createService([DATA_EXPLORER, DASHBOARDS]);
    const library = libraryTab();
    loadWorkspace(manager, [savedDashboardsTab(), library]);

    expect(await service.RetargetMovedNavItemTabs()).toBe(1);

    expect(manager.GetConfiguration()?.tabs).toEqual([library]);
    expect(manager.GetActiveTabId()).toBe(library.id);
  });

  it('closes the saved tab when the Dashboards app already has a Library tab, and keeps the active tab when the saved tab was not active', async () => {
    const { service, manager } = createService([DATA_EXPLORER, DASHBOARDS]);
    const dataTab = savedDataTab();
    const library = libraryTab();
    loadWorkspace(manager, [dataTab, savedDashboardsTab(), library]);

    expect(await service.RetargetMovedNavItemTabs()).toBe(1);

    expect(manager.GetConfiguration()?.tabs).toEqual([dataTab, library]);
    expect(manager.GetActiveTabId()).toBe(dataTab.id);
  });

  it('logs a failure, returns 0 and writes nothing', async () => {
    const dataExplorer = application(DATA_EXPLORER.ID, 'Data Explorer', DATA_EXPLORER_NAV_ITEMS);
    const { service, manager } = createService([dataExplorer, DASHBOARDS]);
    const tabs = [savedDashboardsTab()];
    loadWorkspace(manager, tabs);
    vi.spyOn(dataExplorer, 'GetNavItems').mockRejectedValue(new Error('nav items unavailable'));
    const update = vi.spyOn(manager, 'UpdateConfiguration');
    vi.mocked(LogError).mockClear();

    expect(await service.RetargetMovedNavItemTabs()).toBe(0);

    expect(LogError).toHaveBeenCalledWith('NavigationService.RetargetMovedNavItemTabs: nav items unavailable');
    expect(update).not.toHaveBeenCalled();
    expect(manager.GetConfiguration()?.tabs).toEqual(tabs);
  });

  it('never runs twice at once, and the calls made during a run share the one run after it', async () => {
    const dataExplorer = application(DATA_EXPLORER.ID, 'Data Explorer', DATA_EXPLORER_NAV_ITEMS);
    const { service, manager } = createService([dataExplorer, DASHBOARDS]);
    loadWorkspace(manager, [savedDashboardsTab()]);
    const navItems = await dataExplorer.GetNavItems();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const getNavItems = vi.spyOn(dataExplorer, 'GetNavItems').mockImplementation(async () => {
      await held;
      return navItems;
    });

    const first = service.RetargetMovedNavItemTabs();
    const second = service.RetargetMovedNavItemTabs();
    const third = service.RetargetMovedNavItemTabs();
    await vi.waitFor(() => expect(getNavItems).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getNavItems).toHaveBeenCalledTimes(1);
    expect(third).toBe(second);
    release();
    expect(await first).toBe(1);
    expect(await second).toBe(0);
    expect(getNavItems).toHaveBeenCalledTimes(1);
  });
});

describe('NavigationService.WatchMovedNavItemTabs', () => {
  it('moves a saved Data Explorer Dashboards tab when the Dashboards app is added after the workspace loaded', async () => {
    const apps = [DATA_EXPLORER];
    const { service, manager, applications$ } = createService(apps);
    loadWorkspace(manager, [savedDashboardsTab()]);
    const watch = await service.WatchMovedNavItemTabs();
    expect(manager.GetTab('tab-dashboards')?.applicationId).toBe(DATA_EXPLORER.ID);

    apps.push(DASHBOARDS);
    applications$.next([...apps]);

    await vi.waitFor(() => expect(manager.GetTab('tab-dashboards')?.applicationId).toBe(DASHBOARDS.ID));
    expect(manager.GetTab('tab-dashboards')?.configuration['navItemName']).toBe('Library');
    watch.unsubscribe();
  });

  it('runs again only when the app list changed and no app load is in progress', async () => {
    const apps = [DATA_EXPLORER];
    const { service, manager, applications$, loading$ } = createService(apps);
    loadWorkspace(manager, [savedDashboardsTab()]);
    const watch = await service.WatchMovedNavItemTabs();
    const retarget = vi.spyOn(service, 'RetargetMovedNavItemTabs');

    applications$.next([...apps]);
    loading$.next(true);
    apps.push(DASHBOARDS);
    applications$.next([...apps]);
    expect(retarget).not.toHaveBeenCalled();

    loading$.next(false);
    expect(retarget).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(manager.GetTab('tab-dashboards')?.applicationId).toBe(DASHBOARDS.ID));
    watch.unsubscribe();
  });
});
