/**
 * Tests for NavigationService.OpenDashboard: the application a dashboard tab belongs to, the tab
 * path it takes (a plain open replaces the preview tab and pins nothing, and a Shift-click opens a
 * separate tab), and the one-time edit-mode request. Also TakeDashboardEditModeRequest, which the
 * dashboard tab calls to take that request, and DashboardEditModeRequested$, which tells the tab's
 * component that it has one.
 *
 * The workspace is a double with WorkspaceStateManager's tab rules for these specs;
 * base-application's suite covers the real rules. Mock preamble as in record-open-scope.test.ts:
 * the Angular decorators have to be inert before NavigationService can be imported.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';
import { NavigationService } from '../navigation.service';
import type { NavItem, TabRequest } from '@memberjunction/ng-base-application';

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
vi.mock('@memberjunction/ng-base-types', () => ({ BaseAngularComponent: class {} }));
vi.mock('@memberjunction/core', () => ({
  BaseEntity: class {},
  Metadata: class {},
  CompositeKey: class {},
  LogError: vi.fn(),
}));
vi.mock('@memberjunction/core-entities', () => ({ ResourceData: class {} }));
vi.mock('@memberjunction/global', () => ({
  UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase(),
  GetGlobalObjectStore: () => ({}),
}));

interface TestApp {
  ID: string;
  Name: string;
  GetColor(): string;
}

const app = (ID: string, Name: string, color: string): TestApp => ({ ID, Name, GetColor: () => color });

const HOME = app('A0000000-0000-4000-8000-00000000000A', 'Home', '#111111');
const DASHBOARDS = app('A0000000-0000-4000-8000-00000000000D', 'Dashboards', '#0e7490');
const MISSING_APP_ID = 'A0000000-0000-4000-8000-0000000000FF';
const DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000001';
const OTHER_DASHBOARD_ID = 'D0000000-0000-4000-8000-000000000002';

/** The Home app's Home nav item. */
const HOME_NAV_ITEM: NavItem = { Label: 'Home', ResourceType: 'Custom', DriverClass: 'HomeDashboard', isDefault: true };

interface TestTab {
  id: string;
  applicationId: string;
  resourceRecordId: string;
  isPinned: boolean;
  configuration: Record<string, unknown>;
}

/** Home's tab, as OpenNavItem opens it. */
const homeTab = (isPinned: boolean): TestTab => ({
  id: 'tab-home',
  applicationId: HOME.ID,
  resourceRecordId: '',
  isPinned,
  configuration: { resourceType: 'Custom', driverClass: 'HomeDashboard', appName: 'Home', appId: HOME.ID, navItemName: 'Home' },
});

/** A tab of the dashboard in an application, as OpenDashboard opens it. */
const dashboardTab = (id: string, applicationId: string, isPinned: boolean): TestTab => ({
  id,
  applicationId,
  resourceRecordId: DASHBOARD_ID,
  isPinned,
  configuration: { resourceType: 'Dashboards', dashboardId: DASHBOARD_ID, recordId: DASHBOARD_ID },
});

/**
 * A workspace double with WorkspaceStateManager's tab rules for these specs. Open tabs match per
 * application, resource type and record. OpenTab merges the request's configuration into a matching
 * tab; without one, it replaces the unpinned (preview) tab in place, else it adds an unpinned tab.
 * OpenTabForced focuses a matching tab and leaves its configuration alone; without one, it pins every
 * unpinned tab and adds a tab. UpdateTabConfiguration merges into a tab's configuration.
 */
function createWorkspace() {
  const tabs: TestTab[] = [];
  const find = (request: TabRequest): TestTab | undefined =>
    tabs.find(
      (t) =>
        t.applicationId === request.ApplicationId &&
        t.configuration['resourceType'] === request.Configuration?.resourceType &&
        t.resourceRecordId === (request.ResourceRecordId ?? ''),
    );
  const add = (request: TabRequest, isPinned: boolean): string => {
    const id = `tab-${tabs.length + 1}`;
    tabs.push({
      id,
      applicationId: request.ApplicationId,
      resourceRecordId: request.ResourceRecordId ?? '',
      isPinned,
      configuration: { ...(request.Configuration ?? {}) },
    });
    return id;
  };
  return {
    tabs,
    /** Adds a tab that an earlier open left in the workspace. */
    Seed: (tab: TestTab): void => {
      tabs.push({ ...tab, configuration: { ...tab.configuration } });
    },
    OpenTab: vi.fn((request: TabRequest, _appColor: string): string => {
      const open = find(request);
      if (open) {
        open.configuration = { ...open.configuration, ...(request.Configuration ?? {}) };
        return open.id;
      }
      const preview = tabs.find((t) => !t.isPinned);
      if (preview) {
        preview.applicationId = request.ApplicationId;
        preview.resourceRecordId = request.ResourceRecordId ?? '';
        preview.configuration = { ...(request.Configuration ?? {}) };
        return preview.id;
      }
      return add(request, false);
    }),
    OpenTabForced: vi.fn((request: TabRequest, _appColor: string): string => {
      const open = find(request);
      if (open) return open.id;
      if (!request.IsPinned) {
        tabs.forEach((t) => (t.isPinned = true));
      }
      return add(request, request.IsPinned === true);
    }),
    GetConfiguration: () => ({ tabs }),
    GetTab: (id: string): TestTab | undefined => tabs.find((t) => t.id === id),
    UpdateTabConfiguration: vi.fn((id: string, update: Record<string, unknown>) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        tab.configuration = { ...tab.configuration, ...update };
      }
    }),
  };
}

type Workspace = ReturnType<typeof createWorkspace>;

/**
 * A NavigationService over the workspace double and an app list holding Home and Dashboards.
 * `shift` is the Shift state of the last click. `editRequests` collects the tab IDs
 * DashboardEditModeRequested$ emits.
 */
function createService(opts: { shift?: boolean } = {}): { service: NavigationService; workspace: Workspace; editRequests: string[] } {
  const workspace = createWorkspace();
  const apps = [HOME, DASHBOARDS];
  const service = Object.create(NavigationService.prototype) as NavigationService;
  const internals = service as unknown as Record<string, unknown>;
  // Object.create skips the field initializers, so the service gets its request stream here.
  internals['dashboardEditModeRequests'] = new Subject<string>();
  const editRequests: string[] = [];
  service.DashboardEditModeRequested$.subscribe((tabId) => editRequests.push(tabId));
  internals['workspaceManager'] = workspace;
  internals['appManager'] = {
    GetAppByName: (name: string) => apps.find((a) => a.Name === name),
    GetAppById: (id: string) => apps.find((a) => a.ID.toLowerCase() === id.toLowerCase()),
    GetActiveApp: () => DASHBOARDS,
  };
  // What the capture-phase mousedown listener would have recorded.
  internals['shiftKeyPressed'] = opts.shift === true;
  return { service, workspace, editRequests };
}

/** The request and app color of the only open call. */
function onlyOpen(fn: Workspace['OpenTab']): { request: TabRequest; color: string } {
  expect(fn).toHaveBeenCalledTimes(1);
  const [request, color] = fn.mock.calls[0];
  return { request, color };
}

/** True when the tab shows the dashboard. */
const showsDashboard = (tab: TestTab | undefined): boolean =>
  tab?.configuration['resourceType'] === 'Dashboards' && tab.resourceRecordId === DASHBOARD_ID;

/** True when the tab shows Home. */
const showsHome = (tab: TestTab | undefined): boolean => tab?.applicationId === HOME.ID && tab.configuration['navItemName'] === 'Home';

describe('NavigationService.OpenDashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the tab in the default application (Home) when no application is given, with the same tab request as before', () => {
    const { service, workspace } = createService();

    service.OpenDashboard(DASHBOARD_ID, 'Revenue');

    const { request, color } = onlyOpen(workspace.OpenTab);
    expect(request).toEqual({
      ApplicationId: HOME.ID,
      Title: 'Revenue',
      Configuration: { resourceType: 'Dashboards', dashboardId: DASHBOARD_ID, recordId: DASHBOARD_ID },
      ResourceRecordId: DASHBOARD_ID,
      IsPinned: false,
    });
    expect(color).toBe('#111111');
  });

  it("opens the tab in the given application, in that application's color", () => {
    const { service, workspace } = createService();

    service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID });

    const { request, color } = onlyOpen(workspace.OpenTab);
    expect(request.ApplicationId).toBe(DASHBOARDS.ID);
    expect(request.Configuration).toEqual({ resourceType: 'Dashboards', dashboardId: DASHBOARD_ID, recordId: DASHBOARD_ID });
    expect(color).toBe('#0e7490');
  });

  it("uses the application ID from the application list, so an ID in other letter case still finds that application's tab", () => {
    const { service, workspace } = createService();

    service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID.toLowerCase() });

    expect(onlyOpen(workspace.OpenTab).request.ApplicationId).toBe(DASHBOARDS.ID);
  });

  it('opens the tab in the default application when the given application is not loaded', () => {
    const { service, workspace } = createService();

    service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: MISSING_APP_ID });

    const { request, color } = onlyOpen(workspace.OpenTab);
    expect(request.ApplicationId).toBe(HOME.ID);
    expect(color).toBe('#111111');
  });

  it.each([
    { name: 'forceNewTab: true', forceNewTab: true, shift: false, forced: true },
    { name: 'forceNewTab: false, even with shift', forceNewTab: false, shift: true, forced: false },
    { name: 'a shift-click without forceNewTab', forceNewTab: undefined, shift: true, forced: true },
    { name: 'a plain click without forceNewTab', forceNewTab: undefined, shift: false, forced: false },
  ])('keeps the new-tab rule with an application given: $name', ({ forceNewTab, shift, forced }) => {
    const { service, workspace } = createService({ shift });

    service.OpenDashboard(DASHBOARD_ID, 'Revenue', { forceNewTab, applicationId: DASHBOARDS.ID });

    const used = forced ? workspace.OpenTabForced : workspace.OpenTab;
    const unused = forced ? workspace.OpenTab : workspace.OpenTabForced;
    expect(onlyOpen(used).request.ApplicationId).toBe(DASHBOARDS.ID);
    expect(unused).not.toHaveBeenCalled();
  });

  it('replaces the preview tab in place and pins nothing', () => {
    const { service, workspace } = createService();
    workspace.Seed(homeTab(false));

    expect(service.OpenDashboard(DASHBOARD_ID, 'Revenue')).toBe('tab-home');

    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect(workspace.tabs).toHaveLength(1);
    expect(showsDashboard(workspace.GetTab('tab-home'))).toBe(true);
    expect(workspace.GetTab('tab-home')?.isPinned).toBe(false);
  });

  it('opens a separate tab for a Shift-click, which pins the preview tab as every Shift-click open does', () => {
    const { service, workspace } = createService({ shift: true });
    workspace.Seed(homeTab(false));

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue');

    expect(onlyOpen(workspace.OpenTabForced).request.ApplicationId).toBe(HOME.ID);
    expect(tabId).not.toBe('tab-home');
    expect(workspace.GetTab('tab-home')?.isPinned).toBe(true);
    expect(showsDashboard(workspace.GetTab(tabId))).toBe(true);
  });

  it.each([
    { name: 'without forceNewTab', forceNewTab: undefined },
    { name: 'with forceNewTab: false', forceNewTab: false },
  ])('opens an edit-mode request through OpenTab, which replaces the preview tab and pins nothing, $name', ({ forceNewTab }) => {
    const { service, workspace } = createService();
    workspace.Seed(homeTab(false));

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', { forceNewTab, openInEditMode: true });

    expect(onlyOpen(workspace.OpenTab).request.Configuration).toMatchObject({ openInEditMode: true });
    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect(tabId).toBe('tab-home');
    expect(workspace.GetTab('tab-home')?.isPinned).toBe(false);
  });

  it('opens an edit-mode request through the new-tab path for a Shift-click', () => {
    const { service, workspace } = createService({ shift: true });

    service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', { openInEditMode: true });

    expect(onlyOpen(workspace.OpenTabForced).request.Configuration).toMatchObject({ openInEditMode: true });
    expect(workspace.OpenTab).not.toHaveBeenCalled();
  });

  it('puts an edit-mode request in the tab configuration only when openInEditMode is set', () => {
    const { service, workspace } = createService();

    service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', { openInEditMode: true });
    service.OpenDashboard(OTHER_DASHBOARD_ID, 'Quota', { openInEditMode: false });

    const [edit, view] = workspace.OpenTab.mock.calls.map(([request]) => request.Configuration ?? {});
    expect(edit).toEqual({ resourceType: 'Dashboards', dashboardId: DASHBOARD_ID, recordId: DASHBOARD_ID, openInEditMode: true });
    expect('openInEditMode' in view).toBe(false);
  });
});

describe('NavigationService.OpenDashboard, then Back and Forward', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * Back to Home reopens Home's nav item (the shell's handleMissingTabForUrl, like the
   * ResourceResolver, takes the OpenTab path). Forward reopens the dashboard URL's dashboard in the
   * URL's application, as OpenDashboardForUrl does.
   */
  const back = (service: NavigationService): string => service.OpenNavItem(HOME.ID, HOME_NAV_ITEM, HOME.GetColor());
  const forward = (service: NavigationService): string => service.OpenDashboard(DASHBOARD_ID, 'Dashboard', { applicationId: HOME.ID });

  it.each([
    { name: 'a plain open', openInEditMode: false },
    { name: 'New (openInEditMode)', openInEditMode: true },
  ])('after $name replaced the Home preview tab, Back puts Home in that tab, unpinned, and Forward puts the dashboard back', ({ openInEditMode }) => {
    const { service, workspace } = createService();
    workspace.Seed(homeTab(false));

    expect(service.OpenDashboard(DASHBOARD_ID, 'Revenue', { openInEditMode })).toBe('tab-home');

    expect(back(service)).toBe('tab-home');
    expect(workspace.tabs).toHaveLength(1);
    expect(showsHome(workspace.GetTab('tab-home'))).toBe(true);
    expect(workspace.GetTab('tab-home')?.isPinned).toBe(false);

    expect(forward(service)).toBe('tab-home');
    expect(workspace.tabs).toHaveLength(1);
    expect(showsDashboard(workspace.GetTab('tab-home'))).toBe(true);
    expect(workspace.GetTab('tab-home')?.isPinned).toBe(false);
    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
  });
});

describe('NavigationService.TakeDashboardEditModeRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true once for a tab opened with openInEditMode, and removes the request from the tab', () => {
    const { service, workspace } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', { applicationId: DASHBOARDS.ID, openInEditMode: true });

    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
    expect(workspace.UpdateTabConfiguration).toHaveBeenCalledExactlyOnceWith(tabId, { openInEditMode: undefined });
    expect(workspace.GetTab(tabId)?.configuration['openInEditMode']).toBeUndefined();
    // A restored or reloaded tab opens for viewing.
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(false);
  });

  it('returns false and leaves the tab alone for a tab opened without the request, an unknown tab, and no tab id', () => {
    const { service, workspace } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue');

    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(service.TakeDashboardEditModeRequest('tab-unknown', DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(service.TakeDashboardEditModeRequest('', DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(workspace.UpdateTabConfiguration).not.toHaveBeenCalled();
  });

  it('matches the dashboard and application IDs in any letter case', () => {
    const { service } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', { openInEditMode: true });

    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID.toLowerCase(), HOME.ID.toLowerCase())).toBe(true);
  });

  it('keeps the request for the dashboard the tab shows now: a component of another dashboard does not take it', () => {
    const { service, workspace } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue');
    // OpenTab replaced this preview tab in place: it now shows another dashboard, which is asked to
    // enter edit mode. The component of the first dashboard is still bound to the tab ID.
    const tab = workspace.GetTab(tabId);
    if (!tab) throw new Error('tab missing');
    tab.resourceRecordId = OTHER_DASHBOARD_ID;
    tab.configuration = { resourceType: 'Dashboards', dashboardId: OTHER_DASHBOARD_ID, recordId: OTHER_DASHBOARD_ID, openInEditMode: true };

    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(tab.configuration['openInEditMode']).toBe(true);
    expect(service.TakeDashboardEditModeRequest(tabId, OTHER_DASHBOARD_ID, HOME.ID)).toBe(true);
    expect(tab.configuration['openInEditMode']).toBeUndefined();
  });

  it("keeps the request for the tab's application: a component of the dashboard in another application does not take it", () => {
    const { service, workspace } = createService();
    // Home's tab of the dashboard was the preview tab; the Dashboards app's edit open replaced it in
    // place. Home's component of the dashboard is still bound to the tab ID.
    workspace.Seed(dashboardTab('tab-preview', HOME.ID, false));
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', { applicationId: DASHBOARDS.ID, openInEditMode: true });
    expect(tabId).toBe('tab-preview');

    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, HOME.ID)).toBe(false);
    expect(workspace.GetTab(tabId)?.configuration['openInEditMode']).toBe(true);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
  });
});

describe('NavigationService.OpenDashboard with openInEditMode', () => {
  beforeEach(() => vi.clearAllMocks());

  const IN_DASHBOARDS_APP = { applicationId: DASHBOARDS.ID };
  const EDIT_IN_DASHBOARDS_APP = { ...IN_DASHBOARDS_APP, openInEditMode: true };

  it('gives a new tab the request in its configuration and tells it too; no component is bound to it yet, so its first load takes the request', () => {
    const { service, workspace, editRequests } = createService();

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', EDIT_IN_DASHBOARDS_APP);

    expect(onlyOpen(workspace.OpenTab).request.ApplicationId).toBe(DASHBOARDS.ID);
    expect(workspace.GetTab(tabId)?.configuration['openInEditMode']).toBe(true);
    expect(workspace.UpdateTabConfiguration).not.toHaveBeenCalled();
    expect(editRequests).toEqual([tabId]);
  });

  it('gives the request to the preview tab it replaces and tells that tab, whose cached component of the dashboard can take it', () => {
    const { service, workspace, editRequests } = createService();
    workspace.Seed(homeTab(false));

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', EDIT_IN_DASHBOARDS_APP);

    expect(tabId).toBe('tab-home');
    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.GetTab(tabId)?.isPinned).toBe(false);
    expect(workspace.GetTab(tabId)?.configuration['openInEditMode']).toBe(true);
    expect(editRequests).toEqual([tabId]);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
  });

  it('focuses the open tab, gives it the edit-mode request and tells the tab', () => {
    const { service, workspace, editRequests } = createService();
    const openTabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', IN_DASHBOARDS_APP);

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', EDIT_IN_DASHBOARDS_APP);

    expect(tabId).toBe(openTabId);
    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.GetTab(openTabId)?.configuration['openInEditMode']).toBe(true);
    expect(editRequests).toEqual([openTabId]);
    // The tab takes the request like a new tab does.
    expect(service.TakeDashboardEditModeRequest(openTabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
    expect(service.TakeDashboardEditModeRequest(openTabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(false);
  });

  it('for a Shift-click, focuses the open tab without changing it, then gives it the request and tells the tab', () => {
    const { service, workspace, editRequests } = createService({ shift: true });
    const openTabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', IN_DASHBOARDS_APP);

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', EDIT_IN_DASHBOARDS_APP);

    expect(tabId).toBe(openTabId);
    expect(workspace.OpenTab).not.toHaveBeenCalled();
    expect(workspace.UpdateTabConfiguration).toHaveBeenCalledExactlyOnceWith(openTabId, { openInEditMode: true });
    expect(editRequests).toEqual([openTabId]);
  });

  it('tells an open tab that still holds an earlier request again, and the tab takes the request once', () => {
    const { service, workspace, editRequests } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', EDIT_IN_DASHBOARDS_APP);

    expect(service.OpenDashboard(DASHBOARD_ID, 'New Dashboard', EDIT_IN_DASHBOARDS_APP)).toBe(tabId);

    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect(workspace.UpdateTabConfiguration).not.toHaveBeenCalled();
    expect(editRequests).toEqual([tabId, tabId]);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(true);
    expect(service.TakeDashboardEditModeRequest(tabId, DASHBOARD_ID, DASHBOARDS.ID)).toBe(false);
  });

  it('leaves the open tab in its mode when openInEditMode is not set', () => {
    const { service, workspace, editRequests } = createService();
    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', IN_DASHBOARDS_APP);

    expect(service.OpenDashboard(DASHBOARD_ID, 'Revenue', IN_DASHBOARDS_APP)).toBe(tabId);

    expect('openInEditMode' in (workspace.GetTab(tabId)?.configuration ?? {})).toBe(false);
    expect(editRequests).toEqual([]);
  });

  it("asks only the tab of the open's application: a pinned tab of the dashboard in another application keeps its mode", () => {
    const { service, workspace, editRequests } = createService();
    workspace.Seed(dashboardTab('tab-home-dashboard', HOME.ID, true));

    const tabId = service.OpenDashboard(DASHBOARD_ID, 'Revenue', EDIT_IN_DASHBOARDS_APP);

    expect(tabId).not.toBe('tab-home-dashboard');
    expect(workspace.OpenTabForced).not.toHaveBeenCalled();
    expect('openInEditMode' in (workspace.GetTab('tab-home-dashboard')?.configuration ?? {})).toBe(false);
    expect(editRequests).toEqual([tabId]);
  });
});
