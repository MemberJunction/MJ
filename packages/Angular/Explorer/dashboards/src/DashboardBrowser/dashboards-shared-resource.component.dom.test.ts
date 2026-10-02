import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import type { EngineDataChangeEvent } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardEngine, ResourceData } from '@memberjunction/core-entities';
import type { DashboardUserPermissions, MJDashboardEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import type { DashboardNavigationOptions } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import type { DashboardBrowserViewMode, DashboardEditEvent, DashboardOpenEvent } from '@memberjunction/ng-dashboard-viewer';
import { MJPageBodyComponent, MJPageHeaderComponent, MJPageLayoutComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Query, Text } from '@memberjunction/ng-test-utils';
import { DashboardsSharedResourceComponent } from './dashboards-shared-resource.component';

/**
 * DOM coverage for the Shared with me page of the Dashboards app (<mj-dashboards-shared-resource>).
 * The page chrome is real; the generic dashboard browser, the dashboard engine and navigation are
 * doubles.
 */

@Component({ standalone: true, selector: 'mj-dashboard-browser', template: '' })
class DashboardBrowserStub {
  @Input() Dashboards: MJDashboardEntity[] = [];
  @Input() FlatMode = false;
  @Input() ViewMode: DashboardBrowserViewMode = 'cards';
  @Input() IsLoading = false;
  @Input() ShowCreateButton = true;
  @Input() AllowMultiSelect = true;
  @Input() AllowDragDrop = true;
  @Input() DashboardPermissions: Map<string, DashboardUserPermissions> | null = null;
  @Input() Title = 'Dashboards';
  @Input() IconClass = 'fa-solid fa-gauge-high';
  @Output() DashboardOpen = new EventEmitter<DashboardOpenEvent>();
  @Output() DashboardEdit = new EventEmitter<DashboardEditEvent>();
}

/** The slice of a registered agent client tool these specs call. */
interface ClientTool {
  Name: string;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Tool names that start with a mutating verb. The page's SAFETY BOUNDARY allows none. */
const MUTATING_TOOL_NAME = /^(Create|Delete|Save|Share|Move|Rename|Remove|Update|Add|Toggle|Set)/;

const USER_ID = 'test-user-id';
const ANA_ID = 'U0000000-0000-4000-8000-0000000000a1';
const DASHBOARDS_APP = { ID: 'A0000000-0000-4000-8000-000000000001', Name: 'Dashboards' };
/** OpenDashboard options for a dashboard opened from this page: a tab of the Dashboards app, with no forced new tab. */
const IN_DASHBOARDS_APP = { applicationId: DASHBOARDS_APP.ID };

const dashboard = (n: number, Name: string, UserID: string, Type = 'Config'): MJDashboardEntity =>
  ({ ID: `D2000000-0000-4000-8000-00000000000${n}`, Name, UserID, Type, CategoryID: null, __mj_UpdatedAt: new Date(`2026-09-1${n}T00:00:00Z`) }) as unknown as MJDashboardEntity;

const REVENUE = dashboard(1, 'Revenue', USER_ID);
const BOARD_PACK = dashboard(2, 'Board Pack', ANA_ID);
const PARTNER_KPIS = dashboard(3, 'Partner KPIs', ANA_ID);
const ANA_CODE = dashboard(4, 'Ana Code', ANA_ID, 'Code');

/** Every shared dashboard gets full rights here, so the specs can check that the page turns delete off. */
function permissionsFor(dashboardId: string, dashboards: MJDashboardEntity[]): DashboardUserPermissions {
  const owner = dashboards.some(d => UUIDsEqual(d.ID, dashboardId) && UUIDsEqual(d.UserID, USER_ID));
  return { DashboardID: dashboardId, CanRead: true, CanEdit: true, CanDelete: true, CanShare: owner, IsOwner: owner, PermissionSource: owner ? 'owner' : 'direct' };
}

/**
 * Replaces DashboardEngine.Instance with an in-memory engine. `Set` replaces the dashboards it holds;
 * `EmitChange` emits what the engine emits after it changes its cache.
 */
function stubDashboardEngine(initial: MJDashboardEntity[]) {
  let dashboards = initial;
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => undefined),
    GetAccessibleDashboards: vi.fn((_userId: string) => dashboards),
    GetSharedDashboards: vi.fn((userId: string) => dashboards.filter(d => !UUIDsEqual(d.UserID, userId))),
    GetDashboardPermissions: vi.fn((id: string, _userId: string) => permissionsFor(id, dashboards)),
    Set: (next: MJDashboardEntity[]) => {
      dashboards = next;
    },
    DataChange$: changes.asObservable(),
    EmitChange: (EntityName: string) => {
      changes.next({ config: { EntityName, PropertyName: '_x' }, changeType: 'update', data: [] } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  return engine;
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    UpdateTabQueryParams: vi.fn(),
    OpenDashboard: vi.fn((_id: string, _name: string, _options?: DashboardNavigationOptions) => 'dashboard-tab'),
    SetAgentContext: vi.fn((_caller: DashboardsSharedResourceComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: DashboardsSharedResourceComponent, _tools: ClientTool[]) => undefined),
  };
}

function renderShared(dashboards: MJDashboardEntity[] = [REVENUE, BOARD_PACK, PARTNER_KPIS, ANA_CODE]) {
  const engine = stubDashboardEngine(dashboards);
  const navigation = fakeNavigation();
  const loadComplete = vi.fn();
  const fixture = RenderComponentFixture(DashboardsSharedResourceComponent, {
    imports: [MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, DashboardBrowserStub],
    declarations: [DashboardsSharedResourceComponent],
    providers: [
      { provide: NavigationService, useValue: navigation },
      { provide: ApplicationManager, useValue: { GetAllApps: () => [DASHBOARDS_APP] } },
    ],
    setup: instance => {
      instance.Provider = CreateFakeProvider();
      instance.Data = new ResourceData({
        Configuration: { tabId: 'shared-tab', resourceType: 'Custom', driverClass: 'DashboardsSharedResource', navItemName: 'Shared with me' },
      });
      instance.LoadCompleteEvent = loadComplete;
    },
  });
  return { fixture, engine, navigation, loadComplete };
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

async function renderLoaded(dashboards?: MJDashboardEntity[]) {
  const rendered = renderShared(dashboards);
  await settle();
  rendered.fixture.detectChanges();
  return rendered;
}

const browser = (fixture: ComponentFixture<DashboardsSharedResourceComponent>): DashboardBrowserStub =>
  fixture.debugElement.query(By.directive(DashboardBrowserStub)).componentInstance as DashboardBrowserStub;

const names = (dashboards: MJDashboardEntity[]): string[] => dashboards.map(d => d.Name);

function tool(navigation: ReturnType<typeof fakeNavigation>, name: string): ClientTool {
  const found = (navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? []).find(t => t.Name === name);
  if (!found) {
    throw new Error(`Agent tool ${name} is not registered`);
  }
  return found;
}

describe('DashboardsSharedResourceComponent (DOM)', () => {
  it('renders the page chrome around the dashboard browser, with no count badge', async () => {
    const { fixture } = await renderLoaded();
    expect(Text(fixture, '.mj-page-header-title')).toBe('Shared with me');
    expect(Text(fixture, '.mj-page-header-subtitle')).toBe('Dashboards other people shared with you');
    expect(Query(fixture, 'mj-page-body mj-dashboard-browser')).not.toBeNull();
    expect(Query(fixture, 'mj-stat-badge')).toBeNull();
  });

  it('shows the browser loading, then calls NotifyLoadComplete once the dashboards load', async () => {
    const { fixture, engine, loadComplete } = renderShared();
    expect(browser(fixture).IsLoading).toBe(true);
    expect(loadComplete).not.toHaveBeenCalled();

    await settle();
    fixture.detectChanges();

    expect(engine.Config).toHaveBeenCalledWith(false);
    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.LoadComplete).toBe(true);
    expect(browser(fixture).IsLoading).toBe(false);
  });

  it('gives the browser the Config dashboards shared with the user, newest first, as one flat, read-only list', async () => {
    const { fixture } = await renderLoaded();
    const shown = browser(fixture);
    expect(names(shown.Dashboards)).toEqual(['Partner KPIs', 'Board Pack']);
    expect(shown.FlatMode).toBe(true);
    expect(shown.ViewMode).toBe('list');
    expect(shown.ShowCreateButton).toBe(false);
    expect(shown.AllowMultiSelect).toBe(false);
    expect(shown.AllowDragDrop).toBe(false);
    expect(shown.Title).toBe('Shared with me');
  });

  it('keeps edit rights but turns delete off, so the browser offers no delete', async () => {
    const { fixture } = await renderLoaded();
    const permissions = browser(fixture).DashboardPermissions;
    expect(permissions?.get(BOARD_PACK.ID)).toMatchObject({ CanRead: true, CanEdit: true, CanDelete: false });
    expect(permissions?.get(PARTNER_KPIS.ID)?.CanDelete).toBe(false);
  });

  it('opens a dashboard from the list in a tab of the Dashboards app', async () => {
    const { fixture, navigation } = await renderLoaded();
    browser(fixture).DashboardOpen.emit({ Dashboard: BOARD_PACK, OpenInNewTab: false });
    expect(navigation.OpenDashboard).toHaveBeenCalledWith(BOARD_PACK.ID, 'Board Pack', IN_DASHBOARDS_APP);
  });

  it('opens a dashboard in a separate tab of the Dashboards app when the browser asks for one (a Shift, Ctrl or Cmd click)', async () => {
    const { fixture, navigation } = await renderLoaded();
    browser(fixture).DashboardOpen.emit({ Dashboard: BOARD_PACK, OpenInNewTab: true });
    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(BOARD_PACK.ID, 'Board Pack', { ...IN_DASHBOARDS_APP, forceNewTab: true });
  });

  it('opens a dashboard in edit mode in a tab of the Dashboards app for Edit', async () => {
    const { fixture, navigation } = await renderLoaded();
    browser(fixture).DashboardEdit.emit({ Dashboard: PARTNER_KPIS });
    expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(PARTNER_KPIS.ID, 'Partner KPIs', { ...IN_DASHBOARDS_APP, openInEditMode: true });
  });

  it('re-reads the dashboard cache when it changes, without reporting to the agent or reloading', async () => {
    const { fixture, engine, navigation } = await renderLoaded();
    const reported = navigation.SetAgentContext.mock.calls.length;

    // Ana shares Cash Runway and unshares Board Pack; the engine updates its cache and emits.
    engine.Set([REVENUE, PARTNER_KPIS, ANA_CODE, dashboard(5, 'Cash Runway', ANA_ID)]);
    engine.EmitChange('MJ: Dashboard Permissions');
    await settle();
    fixture.detectChanges();

    expect(names(browser(fixture).Dashboards)).toEqual(['Cash Runway', 'Partner KPIs']);
    expect(browser(fixture).DashboardPermissions?.get(`D2000000-0000-4000-8000-000000000005`)?.CanDelete).toBe(false);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
    expect(engine.Config).toHaveBeenCalledTimes(1);
  });

  it('reports the shared dashboards to the agent after loading', async () => {
    const { navigation } = await renderLoaded();
    expect(navigation.SetAgentContext.mock.calls.at(-1)?.[1]).toEqual({ IsLoading: false, SharedCount: 2, SharedNames: ['Partner KPIs', 'Board Pack'] });
  });

  it('registers only the read-only OpenDashboard and RefreshSharedDashboards agent tools, once', async () => {
    const { navigation } = await renderLoaded();
    expect(navigation.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const names = navigation.SetAgentClientTools.mock.calls[0][1].map(t => t.Name);
    expect(names).toEqual(['OpenDashboard', 'RefreshSharedDashboards']);
    expect(names.filter(name => MUTATING_TOOL_NAME.test(name))).toEqual([]);
  });

  it('the OpenDashboard agent tool opens a dashboard by name in a tab of the Dashboards app', async () => {
    const { navigation } = await renderLoaded();
    expect(await tool(navigation, 'OpenDashboard').Handler({ dashboard: 'board pack' })).toEqual({ Success: true });
    expect(navigation.OpenDashboard).toHaveBeenCalledWith(BOARD_PACK.ID, 'Board Pack', IN_DASHBOARDS_APP);
  });

  it('the RefreshSharedDashboards agent tool reloads from the server and reports the new list', async () => {
    const { fixture, engine, navigation } = await renderLoaded();
    const newlyShared = dashboard(5, 'Cash Runway', ANA_ID);
    engine.Set([REVENUE, BOARD_PACK, PARTNER_KPIS, newlyShared]);

    expect(await tool(navigation, 'RefreshSharedDashboards').Handler({})).toEqual({ Success: true });
    fixture.detectChanges();

    expect(engine.Config).toHaveBeenLastCalledWith(true);
    expect(names(browser(fixture).Dashboards)).toEqual(['Cash Runway', 'Partner KPIs', 'Board Pack']);
    expect(navigation.SetAgentContext.mock.calls.at(-1)?.[1]?.['SharedCount']).toBe(3);
  });

  it('the RefreshSharedDashboards agent tool reports a failed reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, engine, navigation } = await renderLoaded();
    engine.Config.mockRejectedValueOnce(new Error('network down'));

    const result = await tool(navigation, 'RefreshSharedDashboards').Handler({});
    fixture.detectChanges();

    expect(result).toEqual({ Success: false, ErrorMessage: 'The shared dashboards could not be reloaded.' });
    expect(engine.Config).toHaveBeenLastCalledWith(true);
    expect(browser(fixture).IsLoading).toBe(false);
  });

  it('names its tab Shared with me', async () => {
    const { fixture } = await renderLoaded();
    expect(await fixture.componentInstance.GetResourceDisplayName(new ResourceData())).toBe('Shared with me');
  });
});
