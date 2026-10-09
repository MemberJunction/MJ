/**
 * NavigationService.OpenDashboard against the real WorkspaceStateManager (open-dashboard.test.ts
 * covers the same rules against a workspace double). A plain open replaces Home's preview tab in
 * place and pins nothing. An openInEditMode open gives the request to the tab it opens in, the
 * replaced preview tab or the dashboard's open tab, and tells that tab. A Shift-click still opens a
 * separate tab.
 *
 * Mock preamble as in open-dashboard.test.ts, plus the members the base-application package reads
 * when it loads: the Angular decorators have to be inert before NavigationService can be imported.
 */
import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import { WorkspaceStateManager, CreateDefaultWorkspaceConfiguration } from '@memberjunction/ng-base-application';
import type { NavItem } from '@memberjunction/ng-base-application';
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
  ResourceData: class {},
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

/** The Home app's Home nav item. */
const HOME_NAV_ITEM: NavItem = { Label: 'Home', ResourceType: 'Custom', DriverClass: 'HomeDashboard', isDefault: true };

/**
 * A NavigationService over a real WorkspaceStateManager and an app list holding Home and Dashboards.
 * `shift` is the Shift state of the last click. `editRequests` collects the tab IDs
 * DashboardEditModeRequested$ emits.
 */
function createService(opts: { shift?: boolean } = {}): { service: NavigationService; manager: WorkspaceStateManager; editRequests: string[] } {
  const manager = new WorkspaceStateManager();
  manager.UpdateConfiguration(CreateDefaultWorkspaceConfiguration());
  const apps = [HOME, DASHBOARDS];
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  // Object.create skips the field initializers, so the service gets its request stream here.
  internals['dashboardEditModeRequests'] = new Subject<string>();
  const editRequests: string[] = [];
  service.DashboardEditModeRequested$.subscribe((tabId) => editRequests.push(tabId));
  internals['workspaceManager'] = manager;
  internals['appManager'] = {
    GetAppByName: (name: string) => apps.find((a) => a.Name === name),
    GetAppById: (id: string) => apps.find((a) => a.ID.toLowerCase() === id.toLowerCase()),
    GetActiveApp: () => HOME,
  };
  // What the capture-phase mousedown listener would have recorded.
  internals['shiftKeyPressed'] = opts.shift === true;
  return { service, manager, editRequests };
}

/** Opens Home's page, as the shell does on startup and on Back to Home. */
const openHome = (service: NavigationService): string => service.OpenNavItem(HOME.ID, HOME_NAV_ITEM, HOME.GetColor());

const tabs = (manager: WorkspaceStateManager) => manager.GetConfiguration()?.tabs ?? [];

describe('NavigationService.OpenDashboard with the real WorkspaceStateManager', () => {
  it('replaces the Home preview tab in place with a plain open, and pins nothing', () => {
    const { service, manager } = createService();
    const homeTabId = openHome(service);

    expect(service.OpenDashboard(DASHBOARD_ID, 'Revenue')).toBe(homeTabId);

    expect(tabs(manager)).toHaveLength(1);
    expect(tabs(manager)[0].isPinned).toBe(false);
    expect(tabs(manager)[0].configuration['dashboardId']).toBe(DASHBOARD_ID);
    expect(manager.GetActiveTabId()).toBe(homeTabId);
  });

  it('opens a separate tab for a Shift-click, which pins Home', () => {
    const { service, manager } = createService({ shift: true });
    const homeTabId = openHome(service);

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue');

    expect(tabId).not.toBe(homeTabId);
    expect(tabs(manager)).toHaveLength(2);
    expect(tabs(manager).find((t) => t.id === homeTabId)?.isPinned).toBe(true);
  });

  it('gives an edit-mode request to the preview tab it replaces and tells that tab', () => {
    const { service, manager, editRequests } = createService();
    const homeTabId = openHome(service);

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID, openInEditMode: true });

    expect(tabId).toBe(homeTabId);
    expect(tabs(manager)).toHaveLength(1);
    expect(tabs(manager)[0].isPinned).toBe(false);
    expect(tabs(manager)[0].applicationId).toBe(DASHBOARDS.ID);
    expect(tabs(manager)[0].configuration['openInEditMode']).toBe(true);
    expect(editRequests).toEqual([tabId]);
    // A cached component of another application bound to the tab ID does not take it; the tab's own does, once.
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(false);
  });

  it("focuses the dashboard's open tab for an edit-mode request, gives it the request and tells it", () => {
    const { service, manager, editRequests } = createService();
    const openTabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID });

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID, openInEditMode: true });

    expect(tabId).toBe(openTabId);
    expect(tabs(manager)).toHaveLength(1);
    expect(tabs(manager)[0].configuration['openInEditMode']).toBe(true);
    expect(editRequests).toEqual([openTabId]);
    expect(service.TakeDashboardEditModeRequest(openTabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
    expect(tabs(manager)[0].configuration['openInEditMode']).toBeUndefined();
  });
});
