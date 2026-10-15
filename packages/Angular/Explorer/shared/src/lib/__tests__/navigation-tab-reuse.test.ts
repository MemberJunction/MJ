/**
 * A tab's query params reach only the resource the tab shows. With one unpinned tab, opening another app
 * replaces the tab in place and keeps its ID, and the component cache keeps the replaced resource alive and
 * subscribed to that ID. Without this rule, a Home pin's `?dashboard=` write reached the cached Dashboards
 * Library, which opened the dashboard in the Dashboards app in place of Home.
 *
 * NavigationService runs over the real WorkspaceStateManager. Mock preamble as in open-dashboard-workspace.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import { WorkspaceStateManager, CreateDefaultWorkspaceConfiguration } from '@memberjunction/ng-base-application';
import type { NavItem, WorkspaceTab } from '@memberjunction/ng-base-application';
import { ResourceData } from '@memberjunction/core-entities';
import { NavigationService } from '../navigation.service';

vi.mock(import('@angular/core'), async (importOriginal) => {
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
  ResourceData: class {
    ResourceTypeID = '';
    ResourceRecordID = '';
    Configuration: Record<string, unknown> = {};
    constructor(data?: Record<string, unknown>) {
      if (data) Object.assign(this, data);
    }
  },
  UserInfoEngine: { Instance: {} },
  DashboardEngine: { Instance: {} },
}));
vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase(),
  GetGlobalObjectStore: () => ({}),
  MJGlobal: { Instance: {} },
  MJEventType: {},
}));

interface TestApp {
  ID: string;
  Name: string;
  GetColor(): string;
}

const app = (ID: string, Name: string, color: string): TestApp => ({ ID, Name, GetColor: () => color });

const HOME = app('A0000000-0000-4000-8000-00000000000A', 'Home', '#111111');
const DASHBOARDS = app('A0000000-0000-4000-8000-00000000000D', 'Dashboards', '#0e7490');
const DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000001';
const OTHER_DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000002';

const HOME_NAV_ITEM: NavItem = { Label: 'Home', ResourceType: 'Custom', DriverClass: 'HomeDashboard', isDefault: true };
const LIBRARY_NAV_ITEM: NavItem = { Label: 'Library', ResourceType: 'Custom', DriverClass: 'DashboardBrowserResource', isDefault: true };
const CATEGORIES_NAV_ITEM: NavItem = { Label: 'Categories', ResourceType: 'Custom', DriverClass: 'DashboardsCategoriesResource' };

/** A NavigationService over a real WorkspaceStateManager and an app list holding Home and Dashboards. */
function createService(): { service: NavigationService; manager: WorkspaceStateManager } {
  const manager = new WorkspaceStateManager();
  manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());
  const apps = [HOME, DASHBOARDS];
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  // Object.create skips the field initializers
  internals['dashboardEditModeRequests'] = new Subject<string>();
  internals['workspaceManager'] = manager;
  internals['appManager'] = {
    GetAppByName: (name: string) => apps.find((a) => a.Name === name),
    GetAppById: (id: string) => apps.find((a) => a.ID.toLowerCase() === id.toLowerCase()),
    GetActiveApp: () => HOME,
  };
  internals['shiftKeyPressed'] = false;
  return { service, manager };
}

const openHome = (service: NavigationService): string => service.OpenNavItem(HOME.ID, HOME_NAV_ITEM, HOME.GetColor());
const openLibrary = (service: NavigationService): string => service.OpenNavItem(DASHBOARDS.ID, LIBRARY_NAV_ITEM, DASHBOARDS.GetColor());

const tabById = (manager: WorkspaceStateManager, tabId: string): WorkspaceTab => {
  const tab = manager.GetTab(tabId);
  if (!tab) throw new Error(`No tab ${tabId}`);
  return tab;
};

/**
 * The ResourceData the tab container gives the component it creates for the tab as the tab is now: the tab's
 * configuration plus applicationId, the resolved driver class and the tab ID, and the record ID.
 */
function ownerOf(tab: WorkspaceTab, resolvedDriverClass?: string): ResourceData {
  const config = tab.configuration ?? {};
  return new ResourceData({
    ResourceRecordID: (config['recordId'] as string) || tab.resourceRecordId || '',
    Configuration: {
      ...config,
      applicationId: tab.applicationId,
      resourceTypeDriverClass: resolvedDriverClass ?? config['driverClass'],
      tabId: tab.id,
    },
  });
}

/** Collects what ObserveTabQueryParams emits for the tab and owner. */
function collect(service: NavigationService, tabId: string, owner: ResourceData): Record<string, string>[] {
  const received: Record<string, string>[] = [];
  service.ObserveTabQueryParams(tabId, owner).subscribe((params) => received.push(params));
  return received;
}

describe('ObserveTabQueryParams with an owner, after a tab is reused for another app', () => {
  it("does not give Home's dashboard param to the cached Library bound to the same tab", () => {
    const { service, manager } = createService();
    const tabId = openHome(service);
    const homeReceived = collect(service, tabId, ownerOf(tabById(manager, tabId)));

    expect(openLibrary(service)).toBe(tabId);
    const libraryReceived = collect(service, tabId, ownerOf(tabById(manager, tabId)));
    expect(openHome(service)).toBe(tabId);

    service.UpdateTabQueryParams(tabId, { dashboard: DASHBOARD_ID });

    expect(libraryReceived.some((params) => params['dashboard'])).toBe(false);
    expect(homeReceived.at(-1)).toEqual({ dashboard: DASHBOARD_ID });
  });

  it('gives a dashboard link to the Library once the tab shows the Library again', () => {
    const { service, manager } = createService();
    const tabId = openLibrary(service);
    const libraryReceived = collect(service, tabId, ownerOf(tabById(manager, tabId)));
    openHome(service);

    openLibrary(service);
    service.UpdateTabQueryParams(tabId, { dashboard: DASHBOARD_ID });

    expect(libraryReceived.at(-1)).toEqual({ dashboard: DASHBOARD_ID });
  });

  it('gives params to a caller that names no owner, as before', () => {
    const { service } = createService();
    const tabId = openHome(service);
    const received: Record<string, string>[] = [];
    service.ObserveTabQueryParams(tabId).subscribe((params) => received.push(params));
    openLibrary(service);

    service.UpdateTabQueryParams(tabId, { dashboard: DASHBOARD_ID });

    expect(received.at(-1)).toEqual({ dashboard: DASHBOARD_ID });
  });
});

describe('IsTabShowingResource', () => {
  it('is true for the resource the tab shows', () => {
    const { service, manager } = createService();
    const tabId = openHome(service);

    expect(service.IsTabShowingResource(tabId, ownerOf(tabById(manager, tabId)))).toBe(true);
  });

  it('is false after the tab is reused for another app', () => {
    const { service, manager } = createService();
    const tabId = openHome(service);
    const home = ownerOf(tabById(manager, tabId));

    openLibrary(service);

    expect(service.IsTabShowingResource(tabId, home)).toBe(false);
  });

  it('is false after the tab switches to a nav item with another driver class', () => {
    const { service, manager } = createService();
    const tabId = openLibrary(service);
    const library = ownerOf(tabById(manager, tabId));

    service.OpenNavItem(DASHBOARDS.ID, CATEGORIES_NAV_ITEM, DASHBOARDS.GetColor());

    expect(service.IsTabShowingResource(tabId, library)).toBe(false);
  });

  it('is false after the tab shows another record', () => {
    const { service, manager } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID });
    const first = ownerOf(tabById(manager, tabId), 'DashboardResource');

    expect(service.OpenDashboard(OTHER_DASHBOARD_ID, 'Costs', { applicationId: DASHBOARDS.ID })).toBe(tabId);

    expect(service.IsTabShowingResource(tabId, first)).toBe(false);
  });

  it('is true for a resource type whose driver class only the owner knows', () => {
    const { service, manager } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID });

    // The tab container resolves the driver class from metadata; the tab's configuration has none.
    expect(service.IsTabShowingResource(tabId, ownerOf(tabById(manager, tabId), 'DashboardResource'))).toBe(true);
  });

  it('is true when only the nav item label changes for the same driver class', () => {
    const { service, manager } = createService();
    const tabId = openLibrary(service);
    const library = ownerOf(tabById(manager, tabId));

    service.OpenNavItem(DASHBOARDS.ID, { ...LIBRARY_NAV_ITEM, Label: 'Browse' }, DASHBOARDS.GetColor());

    expect(service.IsTabShowingResource(tabId, library)).toBe(true);
  });

  it('is false for a tab that no longer exists', () => {
    const { service, manager } = createService();
    const tabId = openHome(service);

    expect(service.IsTabShowingResource('no-such-tab', ownerOf(tabById(manager, tabId)))).toBe(false);
  });
});
