import { describe, it, expect, vi } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import type { EngineDataChangeEvent, EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardEngine, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import type { MJDashboardCategoryEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardFavoritesService, NavigationService } from '@memberjunction/ng-shared';
import type { DashboardNavigationOptions } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  MJButtonDirective,
  MJEmptyStateComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
} from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Click, Query, QueryAll, Text } from '@memberjunction/ng-test-utils';
import { DashboardCardComponent } from '../shared/dashboard-card/dashboard-card.component';
import { DashboardsOverviewResourceComponent } from './dashboards-overview-resource.component';

/**
 * DOM coverage for the Overview page of the Dashboards app (<mj-dashboards-overview-resource>).
 * The page chrome, the empty states, the button directive and the dashboard card are real; the
 * dashboard engine, the record-log cache (UserInfoEngine), favorites, navigation, the app list and
 * notifications are doubles.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '<p class="loading-stub">{{ text }}</p>' })
class LoadingStub {
  @Input() text = '';
  @Input() size = '';
}

/** The slice of a registered agent client tool these specs call. */
interface ClientTool {
  Name: string;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Tool names that start with a mutating verb. The page's SAFETY BOUNDARY allows none. */
const MUTATING_TOOL_NAME = /^(Create|Delete|Save|Share|Move|Rename|Remove|Update|Add|Toggle|Set)/;

const TAB_ID = 'overview-tab';
const USER_ID = 'test-user-id';
const ANA_ID = 'U0000000-0000-4000-8000-0000000000a1';
const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';
const DASHBOARDS_APP = { ID: 'A0000000-0000-4000-8000-000000000001', Name: 'Dashboards' };
/** OpenDashboard options for a dashboard opened from this page: a tab of the Dashboards app, with no forced new tab. */
const IN_DASHBOARDS_APP = { applicationId: DASHBOARDS_APP.ID };
/** OpenDashboard options for a new dashboard: a tab of the Dashboards app, in edit mode. */
const NEW_IN_DASHBOARDS_APP = { ...IN_DASHBOARDS_APP, openInEditMode: true };
const SALES_ID = 'C0000000-0000-4000-8000-00000000000a';
const PIPELINE_ID = 'C0000000-0000-4000-8000-00000000000b';

const dashboard = (n: number, Name: string, UserID: string, CategoryID: string | null, Type = 'Config'): MJDashboardEntity =>
  ({
    ID: `D1000000-0000-4000-8000-00000000000${n}`,
    Name,
    UserID,
    CategoryID,
    Type,
    User: UserID === USER_ID ? 'Test User' : 'Ana Ruiz',
    Description: '',
    Thumbnail: null,
    __mj_UpdatedAt: new Date(`2026-09-1${n}T00:00:00Z`),
  }) as unknown as MJDashboardEntity;

const REVENUE = dashboard(1, 'Revenue', USER_ID, null);
const QUOTA = dashboard(2, 'Quota', USER_ID, SALES_ID);
const BOARD_PACK = dashboard(3, 'Board Pack', ANA_ID, PIPELINE_ID);
const PARTNER_KPIS = dashboard(4, 'Partner KPIs', ANA_ID, null);
const CUSTOM_CODE = dashboard(5, 'Custom Code', USER_ID, null, 'Code');
const OPS_HEALTH = dashboard(6, 'Ops Health', USER_ID, null);
const DELETED_ID = 'D1000000-0000-4000-8000-0000000000ff';

const category = (ID: string, Name: string, ParentID: string | null): MJDashboardCategoryEntity =>
  ({ ID, Name, ParentID }) as unknown as MJDashboardCategoryEntity;

/** The dashboards, categories and user state one render starts from. */
interface OverviewLibrary {
  dashboards: MJDashboardEntity[];
  categories: MJDashboardCategoryEntity[];
  /** Dashboard ids in the record-log cache, most recently opened first. */
  recentIds: string[];
  favoriteIds: string[];
}

const LIBRARY: OverviewLibrary = {
  dashboards: [REVENUE, QUOTA, BOARD_PACK, PARTNER_KPIS, CUSTOM_CODE, OPS_HEALTH],
  categories: [category(PIPELINE_ID, 'Pipeline', SALES_ID), category(SALES_ID, 'Sales', null)],
  // A Code dashboard and a deleted dashboard were opened last; neither takes a Continue place.
  recentIds: [CUSTOM_CODE.ID, DELETED_ID, BOARD_PACK.ID, REVENUE.ID, QUOTA.ID, OPS_HEALTH.ID],
  favoriteIds: [PARTNER_KPIS.ID, CUSTOM_CODE.ID, REVENUE.ID],
};

/**
 * Replaces DashboardEngine.Instance with an in-memory engine that reads the library at call time.
 * `EmitChange` emits what the engine emits after it changes its cache.
 */
function stubDashboardEngine(library: OverviewLibrary) {
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => undefined),
    GetAccessibleDashboards: vi.fn((_userId: string) => library.dashboards),
    get DashboardCategories(): MJDashboardCategoryEntity[] {
      return library.categories;
    },
    DataChange$: changes.asObservable(),
    EmitChange: (EntityName: string) => {
      changes.next({ config: { EntityName, PropertyName: '_x' }, changeType: 'update', data: [] } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  return engine;
}

const recordLogsFor = (ids: string[]) => ids.map((RecordID, i) => ({ RecordID, LatestAt: new Date(Date.UTC(2026, 8, 20, 12, 0, 59 - i)) }));

/** Replaces UserInfoEngine.Instance with a record-log cache. `ReloadRecordLogs` emits what the engine emits after a reload. */
function stubRecordLogs(recentIds: string[]) {
  const changes = new Subject<EngineDataChangeEvent>();
  let logs = recordLogsFor(recentIds);
  const engine = {
    IsPermissionConstrained: false,
    DataChange$: changes.asObservable(),
    GetRecentRecordsForEntity: vi.fn((entityId: string, _maxItems?: number) => (entityId === DASHBOARDS_ENTITY_ID ? logs : [])),
    ReloadRecordLogs: (ids: string[]) => {
      logs = recordLogsFor(ids);
      changes.next({ config: { EntityName: 'MJ: User Record Logs' }, changeType: 'refresh', data: logs } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(engine as unknown as UserInfoEngine);
  return engine;
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    UpdateTabQueryParams: vi.fn(),
    OpenDashboard: vi.fn((_id: string, _name: string, _options?: DashboardNavigationOptions) => 'dashboard-tab'),
    SwitchToApp: vi.fn(async (_appId: string, _navItemName?: string, _queryParams?: Record<string, string | null>) => undefined),
    SetAgentContext: vi.fn((_caller: DashboardsOverviewResourceComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: DashboardsOverviewResourceComponent, _tools: ClientTool[]) => undefined),
  };
}

/** A DashboardFavoritesService double. `Toggle` and `Set` change the favorites and emit Changed$. */
function fakeFavorites(initialIds: string[]) {
  let ids = [...initialIds];
  const changed$ = new Subject<void>();
  const isFavorite = (id: string): boolean => ids.some(f => UUIDsEqual(f, id));
  return {
    Changed$: changed$,
    FavoriteIds: () => ids,
    IsFavorite: isFavorite,
    Toggle: vi.fn(async (id: string) => {
      const on = !isFavorite(id);
      ids = on ? [id, ...ids] : ids.filter(f => !UUIDsEqual(f, id));
      changed$.next();
      return on;
    }),
    Set: (next: string[]) => {
      ids = next;
      changed$.next();
    },
  };
}

function providerWithDashboardsEntity(): IMetadataProvider {
  return CreateFakeProvider({
    entityByName: name => (name === 'MJ: Dashboards' ? ({ ID: DASHBOARDS_ENTITY_ID, Name: name } as unknown as EntityInfo) : undefined),
  });
}

function renderOverview(
  library: OverviewLibrary = LIBRARY,
  provider: IMetadataProvider = providerWithDashboardsEntity(),
  apps: Array<typeof DASHBOARDS_APP> = [DASHBOARDS_APP],
) {
  const engine = stubDashboardEngine(library);
  const recordLogs = stubRecordLogs(library.recentIds);
  const navigation = fakeNavigation();
  const favorites = fakeFavorites(library.favoriteIds);
  const notifications = { CreateSimpleNotification: vi.fn() };
  const loadComplete = vi.fn();
  const fixture = RenderComponentFixture(DashboardsOverviewResourceComponent, {
    imports: [MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJEmptyStateComponent, MJButtonDirective, LoadingStub],
    declarations: [DashboardsOverviewResourceComponent, DashboardCardComponent],
    providers: [
      { provide: NavigationService, useValue: navigation },
      { provide: DashboardFavoritesService, useValue: favorites },
      { provide: ApplicationManager, useValue: { GetAllApps: () => apps } },
      { provide: MJNotificationService, useValue: notifications },
    ],
    setup: instance => {
      instance.Provider = provider;
      instance.Data = new ResourceData({
        Configuration: { tabId: TAB_ID, resourceType: 'Custom', driverClass: 'DashboardsOverviewResource', navItemName: 'Overview' },
      });
      instance.LoadCompleteEvent = loadComplete;
    },
  });
  return { fixture, engine, recordLogs, navigation, favorites, notifications, loadComplete };
}

/** Lets the async load and any follow-up work finish. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

async function renderLoaded(library: OverviewLibrary = LIBRARY, provider?: IMetadataProvider, apps?: Array<typeof DASHBOARDS_APP>) {
  const rendered = renderOverview(library, provider, apps);
  await settle();
  rendered.fixture.detectChanges();
  return rendered;
}

type Fixture = ComponentFixture<DashboardsOverviewResourceComponent>;

const texts = (fixture: Fixture, selector: string): string[] => QueryAll(fixture, selector).map(el => el.textContent?.trim() ?? '');

function tool(navigation: ReturnType<typeof fakeNavigation>, name: string): ClientTool {
  const found = (navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? []).find(t => t.Name === name);
  if (!found) {
    throw new Error(`Agent tool ${name} is not registered`);
  }
  return found;
}

const lastAgentContext = (navigation: ReturnType<typeof fakeNavigation>): Record<string, unknown> | undefined =>
  navigation.SetAgentContext.mock.calls.at(-1)?.[1];

function createdDashboardProvider(saved: boolean) {
  const created = {
    ID: 'D1000000-0000-4000-8000-000000000099',
    Name: '',
    Type: 'Config',
    Save: vi.fn(async () => saved),
    LatestResult: { CompleteMessage: 'Name is required' },
  } as unknown as MJDashboardEntity;
  const provider = { ...providerWithDashboardsEntity(), GetEntityObject: vi.fn(async () => created) } as unknown as IMetadataProvider;
  return { created, provider };
}

describe('DashboardsOverviewResourceComponent (DOM)', () => {
  it('renders the page chrome with no count badges', async () => {
    const { fixture } = await renderLoaded();
    expect(Query(fixture, 'mj-page-layout mj-page-header')).not.toBeNull();
    expect(Text(fixture, '.mj-page-header-title')).toBe('Dashboards');
    expect(Text(fixture, '.mj-page-header-subtitle')).toBe('Pick up where you left off, or start something new');
    expect(Query(fixture, 'mj-page-body')).not.toBeNull();
    expect(Query(fixture, 'mj-stat-badge')).toBeNull();
    expect(texts(fixture, '.mj-page-header-actions button')).toEqual(['Browse all', 'New dashboard']);
  });

  it('shows the loading indicator, then calls NotifyLoadComplete once the dashboards load', async () => {
    const { fixture, engine, loadComplete } = renderOverview();
    expect(Query(fixture, 'mj-loading')).not.toBeNull();
    expect(loadComplete).not.toHaveBeenCalled();

    await settle();
    fixture.detectChanges();

    expect(engine.Config).toHaveBeenCalledWith(false);
    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.LoadComplete).toBe(true);
    expect(Query(fixture, 'mj-loading')).toBeNull();
  });

  it('continues with the last three opened Config dashboards the user can open, most recent first', async () => {
    const { fixture } = await renderLoaded();
    expect(texts(fixture, '.ov-continue .dc-name')).toEqual(['Board Pack', 'Revenue', 'Quota']);
  });

  it('lists favorites in favorite order and dashboards shared with the user, newest first', async () => {
    const { fixture } = await renderLoaded();
    expect(texts(fixture, '.ov-favorites .ov-row-main b')).toEqual(['Partner KPIs', 'Revenue']);
    expect(texts(fixture, '.ov-shared .ov-row-main b')).toEqual(['Partner KPIs', 'Board Pack']);
  });

  it('shows the category path and the owner under each row', async () => {
    const { fixture } = await renderLoaded();
    expect(texts(fixture, '.ov-shared .ov-row-main small')).toEqual(['Uncategorized · shared by Ana Ruiz', 'Sales › Pipeline · shared by Ana Ruiz']);
  });

  it('opens a Continue card in a tab of the Dashboards app', async () => {
    const { fixture, navigation } = await renderLoaded();
    Click(fixture, '.ov-continue .dc-name');
    expect(navigation.OpenDashboard).toHaveBeenCalledWith(BOARD_PACK.ID, 'Board Pack', IN_DASHBOARDS_APP);
  });

  it('opens a favorite or shared row in a tab of the Dashboards app', async () => {
    const { fixture, navigation } = await renderLoaded();

    (QueryAll(fixture, '.ov-favorites .ov-row-main')[1] as HTMLElement).click();
    expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Revenue', IN_DASHBOARDS_APP);

    Click(fixture, '.ov-shared .ov-row .mj-btn');
    expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(PARTNER_KPIS.ID, 'Partner KPIs', IN_DASHBOARDS_APP);
  });

  it('opens dashboards in the default application when the user does not have the Dashboards app', async () => {
    const { created, provider } = createdDashboardProvider(true);
    const { fixture, navigation } = await renderLoaded(LIBRARY, provider, []);

    Click(fixture, '.ov-continue .dc-name');
    expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(BOARD_PACK.ID, 'Board Pack', {});

    Click(fixture, '.ov-new');
    await settle();
    expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(created.ID, 'New Dashboard', { openInEditMode: true });
  });

  it('Browse all goes to the Browse page of the Dashboards app', async () => {
    const { fixture, navigation } = await renderLoaded();
    Click(fixture, '.ov-browse-all');
    await settle();
    expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Browse');
  });

  it('New dashboard saves a blank dashboard, reloads the cache, then opens it in edit mode in a tab of the Dashboards app', async () => {
    const { created, provider } = createdDashboardProvider(true);
    const { fixture, engine, navigation } = await renderLoaded(LIBRARY, provider);

    Click(fixture, '.ov-new');
    await settle();

    expect(created.Save).toHaveBeenCalledTimes(1);
    expect(engine.Config).toHaveBeenLastCalledWith(true);
    expect(navigation.OpenDashboard).toHaveBeenCalledWith(created.ID, 'New Dashboard', NEW_IN_DASHBOARDS_APP);
    expect(engine.Config.mock.invocationCallOrder.at(-1)).toBeLessThan(navigation.OpenDashboard.mock.invocationCallOrder[0]);
    expect((Query(fixture, '.ov-new') as HTMLButtonElement).disabled).toBe(false);
  });

  it('still opens the new dashboard when the cache reload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { created, provider } = createdDashboardProvider(true);
    const { fixture, engine, navigation } = await renderLoaded(LIBRARY, provider);
    engine.Config.mockRejectedValueOnce(new Error('network down'));

    Click(fixture, '.ov-new');
    await settle();

    expect(navigation.OpenDashboard).toHaveBeenCalledWith(created.ID, 'New Dashboard', NEW_IN_DASHBOARDS_APP);
  });

  it('tells the user and opens nothing when the new dashboard cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider } = createdDashboardProvider(false);
    const { fixture, navigation, notifications } = await renderLoaded(LIBRARY, provider);

    Click(fixture, '.ov-new');
    await settle();

    expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Could not create the dashboard', 'error', 3000);
  });

  it('refreshes when favorites or recents change, without reporting to the agent', async () => {
    const { fixture, navigation, favorites, recordLogs } = await renderLoaded();
    const reported = navigation.SetAgentContext.mock.calls.length;

    favorites.Set([QUOTA.ID]);
    recordLogs.ReloadRecordLogs([OPS_HEALTH.ID, REVENUE.ID]);
    fixture.detectChanges();

    expect(texts(fixture, '.ov-favorites .ov-row-main b')).toEqual(['Quota']);
    expect(texts(fixture, '.ov-continue .dc-name')).toEqual(['Ops Health', 'Revenue']);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
  });

  it('re-reads the dashboard cache when it changes, without reporting to the agent', async () => {
    const library: OverviewLibrary = { ...LIBRARY, dashboards: [...LIBRARY.dashboards] };
    const { fixture, engine, navigation } = await renderLoaded(library);
    const reported = navigation.SetAgentContext.mock.calls.length;

    // In another tab, Revenue is deleted and Ana shares Cash Runway; the engine updates its cache and emits.
    library.dashboards = [...library.dashboards.filter(d => d !== REVENUE), dashboard(7, 'Cash Runway', ANA_ID, null)];
    engine.EmitChange('MJ: Dashboards');
    engine.EmitChange('MJ: Dashboard Permissions');
    await settle();
    fixture.detectChanges();

    expect(texts(fixture, '.ov-continue .dc-name')).toEqual(['Board Pack', 'Quota', 'Ops Health']);
    expect(texts(fixture, '.ov-favorites .ov-row-main b')).toEqual(['Partner KPIs']);
    expect(texts(fixture, '.ov-shared .ov-row-main b')).toEqual(['Cash Runway', 'Partner KPIs', 'Board Pack']);
    expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
    expect(engine.Config).toHaveBeenCalledTimes(1);
  });

  it('stars a Continue card and reports the new favorites to the agent', async () => {
    const { fixture, favorites, navigation, notifications } = await renderLoaded();

    Click(fixture, '.ov-continue .dc-star');
    await settle();
    fixture.detectChanges();

    expect(favorites.Toggle).toHaveBeenCalledWith(BOARD_PACK.ID);
    expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Added "Board Pack" to favorites', 'success', 2000);
    expect(texts(fixture, '.ov-favorites .ov-row-main b')).toEqual(['Board Pack', 'Partner KPIs', 'Revenue']);
    expect(lastAgentContext(navigation)?.['FavoriteNames']).toEqual(['Board Pack', 'Partner KPIs', 'Revenue']);
  });

  it('reports its lists to the agent after loading', async () => {
    const { navigation } = await renderLoaded();
    expect(lastAgentContext(navigation)).toEqual({
      IsLoading: false,
      ContinueCount: 3,
      ContinueNames: ['Board Pack', 'Revenue', 'Quota'],
      FavoriteCount: 2,
      FavoriteNames: ['Partner KPIs', 'Revenue'],
      SharedCount: 2,
      SharedNames: ['Partner KPIs', 'Board Pack'],
    });
  });

  it('registers only the read-only OpenDashboard and BrowseAllDashboards agent tools, once', async () => {
    const { navigation } = await renderLoaded();
    expect(navigation.SetAgentClientTools).toHaveBeenCalledTimes(1);
    const names = navigation.SetAgentClientTools.mock.calls[0][1].map(t => t.Name);
    expect(names).toEqual(['OpenDashboard', 'BrowseAllDashboards']);
    expect(names.filter(name => MUTATING_TOOL_NAME.test(name))).toEqual([]);
  });

  it('the OpenDashboard agent tool opens any dashboard the user can open, by name, in a tab of the Dashboards app', async () => {
    const { navigation } = await renderLoaded();

    expect(await tool(navigation, 'OpenDashboard').Handler({ dashboard: 'custom code' })).toEqual({ Success: true });
    expect(navigation.OpenDashboard).toHaveBeenCalledWith(CUSTOM_CODE.ID, 'Custom Code', IN_DASHBOARDS_APP);

    const missing = (await tool(navigation, 'OpenDashboard').Handler({ dashboard: 'Nope' })) as { Success: boolean };
    expect(missing.Success).toBe(false);
  });

  it('the BrowseAllDashboards agent tool goes to the Browse page of the Dashboards app', async () => {
    const { navigation } = await renderLoaded();

    expect(await tool(navigation, 'BrowseAllDashboards').Handler({})).toEqual({ Success: true });
    expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Browse');
  });

  it('shows a hint in each section when nothing was opened, starred or shared', async () => {
    const { fixture } = await renderLoaded({ dashboards: [REVENUE], categories: [], recentIds: [], favoriteIds: [] });
    expect(texts(fixture, 'mj-empty-state .mj-empty-state__title')).toEqual([
      'Open a dashboard and it appears here',
      'Star a dashboard to keep it here',
      'Nothing shared with you yet',
    ]);
  });

  it('names its tab Overview', async () => {
    const { fixture } = await renderLoaded();
    expect(await fixture.componentInstance.GetResourceDisplayName(new ResourceData())).toBe('Overview');
  });
});
