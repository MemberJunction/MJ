import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, Subject } from 'rxjs';
import type {
  CompositeKey,
  EngineDataChangeEvent,
  EntityInfo,
  EntityRecordNameInput,
  EntityRecordNameResult,
  IMetadataProvider,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { DashboardNavRequestEvent, DashboardPanel } from '@memberjunction/ng-dashboard-viewer';
import { DashboardEngine, QueryEngine, ResourceData, UserInfoEngine, UserViewEngine } from '@memberjunction/core-entities';
import type {
  MJDashboardEntity,
  MJUserApplicationEntity,
  MJUserFavoriteEntity,
  MJUserNotificationEntity,
  UserApplicationAccessStatus,
} from '@memberjunction/core-entities';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import type { BaseApplication } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { DashboardFavoritesService, HomeAppPinService, HomeDashboardTabsService, NavigationService, RecentAccessService } from '@memberjunction/ng-shared';
import type { DashboardNavigationOptions, HomeAppPinInput, HomeAppPinnedItem, RecentAccessItem } from '@memberjunction/ng-shared';
import { MJAccordionModule, MJButtonDirective, MJClickableDirective } from '@memberjunction/ng-ui-components';
import {
  RenderComponentFixture,
  UseFakeGlobalProvider,
  StubEmptyStateComponent,
  StubLoadingComponent,
  Attr,
  Click,
  Query,
  QueryAll,
  Text,
} from '@memberjunction/ng-test-utils';
import { AutoInstallDashboardsApp, EnsureDashboardsApp } from '../shared/dashboards-app.helpers';
import { DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS } from '../shared/dashboards-app-install';
import type { ActionPinConfigResult } from './action-pin-config-dialog.component';
import type { ActionPinRunResult } from './action-pin-runner-dialog.component';
import type { DashboardPreferencesResult } from './dashboard-preferences-dialog/dashboard-preferences-dialog.component';
import { HomeDashboardsStripComponent } from './home-dashboards-strip.component';
import { HomeDashboardTileComponent } from './home-dashboard-tile.component';
import { HomeDashboardTabsComponent } from './home-dashboard-tabs.component';
import { HomeDashboardComponent } from './home-dashboard.component';

vi.mock('../shared/dashboards-app.helpers', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared/dashboards-app.helpers')>()),
  AutoInstallDashboardsApp: vi.fn(),
  EnsureDashboardsApp: vi.fn(),
}));

/**
 * DOM coverage for the dashboards on Home (<mj-home-dashboard>): the Dashboards strip, the dashboard
 * tabs, and the pins, favorites and recents that open a dashboard.
 * Strip: what it shows (a live tile per dashboard), how it follows favorites, dashboard opens and the
 * dashboard cache, what its buttons do, links from a tile's dashboard, and how the automatic
 * Dashboards app install fits in Home's first load. Tabs: the tab row, the dashboard a tab shows,
 * the `homeTab` query param (deep links, back and forward), Remove tab, Open in Dashboards, links
 * from the dashboard's panels, Manage home dashboards, the agent context and the SwitchHomeTab tool.
 * Pins and Quick Access: a dashboard pin, favorite or recent opens the dashboard without forcing a
 * new tab (it replaces the preview tab), a query pin opens as it always has, and so do the OpenPin
 * and OpenRecent tools. The strip and its tiles, the tab row, the button and clickable directives and
 * the accordion are real. The dashboard cache (DashboardEngine), the record logs, favorites and
 * settings (UserInfoEngine), the engines the Add Pin panel reads, dashboard favorites, the Home tabs
 * service, pins, recents, navigation, the app list, the Dashboards app install helpers,
 * notifications, the dashboard viewer and the dialogs are doubles.
 */

/** Inert <mj-action-pin-config-dialog>. */
@Component({ standalone: true, selector: 'mj-action-pin-config-dialog', template: '' })
class ActionPinConfigDialogStub {
  @Input() Visible = false;
  @Input() ActionID: string | null = null;
  @Input() ActionName: string | null = null;
  @Input() ActionDescription: string | null = null;
  @Output() Result = new EventEmitter<ActionPinConfigResult>();
}

/** Inert <mj-action-pin-runner-dialog>. */
@Component({ standalone: true, selector: 'mj-action-pin-runner-dialog', template: '' })
class ActionPinRunnerDialogStub {
  @Input() Visible = false;
  @Input() Pin: HomeAppPinnedItem | null = null;
  @Output() Result = new EventEmitter<ActionPinRunResult>();
}

/** Inert <mj-user-app-config>: the app configuration dialog. */
@Component({ standalone: true, selector: 'mj-user-app-config', template: '' })
class UserAppConfigStub {
  @Input() ShowDialog = false;
  @Output() ShowDialogChange = new EventEmitter<boolean>();
  @Output() ConfigSaved = new EventEmitter<void>();

  public Open(): void {
    this.ShowDialog = true;
  }
}

/**
 * Inert <mj-dashboard-viewer>. `Id` tells a new viewer from the one before it; `Shown` records each
 * dashboard object it is given, in order. Tests compare ids, not instances: a failed assertion prints
 * its values, and printing a component instance walks Angular's whole object graph.
 */
@Component({ standalone: true, selector: 'mj-dashboard-viewer', template: '' })
class DashboardViewerStub {
  private static created = 0;
  public readonly Id = ++DashboardViewerStub.created;
  public readonly Shown: MJDashboardEntity[] = [];
  @Input() set Dashboard(value: MJDashboardEntity | null) {
    if (value) {
      this.Shown.push(value);
    }
  }
  @Input() IsEditing = true;
  @Input() ShowToolbar = true;
  @Input() ShowBreadcrumb = true;
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
}

/** Inert <mj-dashboard-preferences-dialog>: Manage home dashboards. */
@Component({ standalone: true, selector: 'mj-dashboard-preferences-dialog', template: '' })
class PreferencesDialogStub {
  @Input() Scope = 'App';
  @Input() ApplicationId: string | null = null;
  @Output() Result = new EventEmitter<DashboardPreferencesResult>();
}

/** A client tool Home registers with SetAgentClientTools. */
interface AgentTool {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** A ResizeObserver double. `Resize` reports each observed element's current size, as a browser does after a layout. */
class FakeResizeObserver {
  public static Instances: FakeResizeObserver[] = [];
  public readonly Targets = new Set<Element>();
  public Disconnected = false;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.Instances.push(this);
  }

  public observe(target: Element): void {
    this.Targets.add(target);
  }

  public unobserve(target: Element): void {
    this.Targets.delete(target);
  }

  public disconnect(): void {
    this.Targets.clear();
    this.Disconnected = true;
  }

  public Resize(): void {
    const entries = [...this.Targets].map(target => ({ target, contentRect: target.getBoundingClientRect() }) as unknown as ResizeObserverEntry);
    if (entries.length > 0) {
      this.callback(entries, this as unknown as ResizeObserver);
    }
  }
}

const realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

/** The size Home's tab container reports (jsdom reports 0 × 0 for every element). Zero means Home is hidden. */
let tabContainerSize = { width: 1200, height: 800 };

/** The size each Dashboards tile body reports, so each tile builds its viewer as in a browser. */
const TILE_BODY_SIZE = { width: 560, height: 360 };

/** Makes `.home-tab-dashboard` report `tabContainerSize` and `.tile-body` report `TILE_BODY_SIZE`. Other elements keep jsdom's size. */
function stubTabContainerSize(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement): DOMRect {
    const size = this.classList.contains('home-tab-dashboard') ? tabContainerSize : this.classList.contains('tile-body') ? TILE_BODY_SIZE : null;
    if (!size) {
      return realGetBoundingClientRect.call(this);
    }
    const { width, height } = size;
    return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
  });
}

const TAB_ID = 'home-tab';
const USER_ID = 'test-user-id';
const ANA_ID = 'U0000000-0000-4000-8000-0000000000a1';
const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';
const APP_UNAVAILABLE_MESSAGE = 'Could not open the Dashboards app. Try again, or ask your administrator for access.';

const DASHBOARDS_APP = {
  ID: 'A0000000-0000-4000-8000-000000000001',
  Name: 'Dashboards',
  Description: '',
  Icon: 'fa-solid fa-gauge-high',
  GetColor: () => '',
  GetNavItems: async () => [],
} as unknown as BaseApplication;

const DATA_EXPLORER_APP = {
  ID: 'A0000000-0000-4000-8000-000000000002',
  Name: 'Data Explorer',
  Description: '',
  Icon: 'fa-solid fa-database',
  GetColor: () => '',
  GetNavItems: async () => [
    { Label: 'Data', Icon: 'fa-solid fa-table' },
    { Label: 'Queries', Icon: 'fa-solid fa-database' },
  ],
} as unknown as BaseApplication;

const dashboard = (n: number, Name: string, UserID: string, Type = 'Config'): MJDashboardEntity =>
  ({
    ID: `D1000000-0000-4000-8000-00000000000${n}`,
    Name,
    UserID,
    Type,
    User: UserID === USER_ID ? 'Test User' : 'Ana Ruiz',
    Description: '',
    Thumbnail: null,
    CategoryID: null,
  }) as unknown as MJDashboardEntity;

const REVENUE = dashboard(1, 'Revenue', USER_ID);
const QUOTA = dashboard(2, 'Quota', USER_ID);
const BOARD_PACK = dashboard(3, 'Board Pack', ANA_ID);
const PARTNER_KPIS = dashboard(4, 'Partner KPIs', ANA_ID);
const CUSTOM_CODE = dashboard(5, 'Custom Code', USER_ID, 'Code');
const OPS_HEALTH = dashboard(6, 'Ops Health', USER_ID);
const CASH_RUNWAY = dashboard(7, 'Cash Runway', ANA_ID);
const MARGIN = dashboard(8, 'Margin', USER_ID);
const DELETED_ID = 'D1000000-0000-4000-8000-0000000000ff';
const UNSHARED_ID = 'D1000000-0000-4000-8000-0000000000fe';
const SALES_PIPELINE = dashboard(9, 'Sales pipeline', ANA_ID);
/** The default Home tabs: Sales pipeline, then Ops Health. */
const HOME_TABS = [SALES_PIPELINE, OPS_HEALTH];

/** A copy of the dashboard, as a cache reload returns it. */
const reloadedCopy = (d: MJDashboardEntity, changes: Record<string, unknown> = {}): MJDashboardEntity =>
  ({ ...(d as unknown as Record<string, unknown>), ...changes }) as unknown as MJDashboardEntity;

/** Changes the dashboard object itself, as a save in the dashboard tab does. */
const editInPlace = (d: MJDashboardEntity, changes: Record<string, unknown>): void => {
  Object.assign(d as unknown as Record<string, unknown>, changes);
};

const NEW_LAYOUT = '{"layout":{"root":null},"settings":{}}';
const NOT_A_TAB_ID = 'D1000000-0000-4000-8000-0000000000fd';

/** An ungrouped pin as the pin service stores it. */
const pinOf = (n: number, DisplayName: string, ResourceType: string, Configuration: Record<string, unknown>): HomeAppPinnedItem => ({
  Id: `P0000000-0000-4000-8000-00000000000${n}`,
  DisplayName,
  ResourceType,
  Configuration,
  Sequence: n - 1,
  PinnedAt: '2026-09-20T12:00:00.000Z',
});

const REVENUE_PIN = pinOf(1, 'Revenue board', 'Dashboards', { dashboardId: REVENUE.ID });
const QUERY_ID = 'Q0000000-0000-4000-8000-000000000001';
const QUERY_PIN = pinOf(2, 'Open deals', 'Queries', { queryId: QUERY_ID });

/** A row of the user's favorites (MJ: User Favorites). */
const favoriteOf = (n: number, Entity: string, RecordID: string): MJUserFavoriteEntity =>
  ({ ID: `F0000000-0000-4000-8000-00000000000${n}`, Entity, RecordID }) as unknown as MJUserFavoriteEntity;

/** A dashboard open as RecentAccessService lists it. `recordName` is missing when the name did not resolve. */
const recentOpen = (d: MJDashboardEntity, recordName?: string): RecentAccessItem => ({
  id: `R-${d.ID}`,
  entityId: DASHBOARDS_ENTITY_ID,
  entityName: 'MJ: Dashboards',
  recordId: d.ID,
  recordName,
  latestAt: new Date(Date.UTC(2026, 8, 20, 12, 0, 0)),
  totalCount: 1,
  resourceType: 'dashboard',
});

/** The dashboards and user state one render starts from. */
interface HomeLibrary {
  /** The dashboards the user can open. */
  dashboards: MJDashboardEntity[];
  /** Dashboard ids in the record-log cache, most recently opened first. */
  recentIds: string[];
  /** Favorite dashboard ids, newest favorite first. */
  favoriteIds: string[];
}

/**
 * Five Config dashboards (two shared by Ana) and one Code dashboard. The Code dashboard, a deleted
 * dashboard and one the user can no longer open were opened after Board Pack.
 */
const library = (): HomeLibrary => ({
  dashboards: [REVENUE, QUOTA, BOARD_PACK, PARTNER_KPIS, CUSTOM_CODE, OPS_HEALTH],
  recentIds: [CUSTOM_CODE.ID, DELETED_ID, UNSHARED_ID, BOARD_PACK.ID, REVENUE.ID],
  favoriteIds: [BOARD_PACK.ID, PARTNER_KPIS.ID, CUSTOM_CODE.ID, REVENUE.ID, QUOTA.ID],
});

/** Replaces DashboardEngine.Instance with a cache that reads the library at call time. `EmitChange` emits what the engine emits after a change. */
function stubDashboardEngine(lib: HomeLibrary) {
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider) => undefined),
    GetAccessibleDashboards: vi.fn((_userId: string) => lib.dashboards),
    IsPermissionConstrained: false,
    get Dashboards(): MJDashboardEntity[] {
      return lib.dashboards;
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

/**
 * Replaces UserInfoEngine.Instance with the record-log cache, the user's `settings`, and the app
 * access the Dashboards app install reads: the user has no row for any app.
 * `ReloadRecordLogs` emits what the engine emits after it reloads the record logs.
 */
function stubUserInfo(recentIds: string[], settings: Record<string, string> = {}) {
  const changes = new Subject<EngineDataChangeEvent>();
  let logs = recordLogsFor(recentIds);
  const engine = {
    IsPermissionConstrained: false,
    DataChange$: changes.asObservable(),
    UserFavorites: [] as MJUserFavoriteEntity[],
    UserNotifications: [] as MJUserNotificationEntity[],
    GetSetting: (key: string): string | undefined => settings[key],
    SetSetting: vi.fn(async (_key: string, _value: string) => true),
    SetSettingDebounced: vi.fn((_key: string, _value: string) => undefined),
    CheckUserApplicationAccess: (_appId: string): UserApplicationAccessStatus => 'not_installed',
    GetRecentRecordsForEntity: vi.fn((entityId: string, _maxItems?: number) => (entityId === DASHBOARDS_ENTITY_ID ? logs : [])),
    ReloadRecordLogs: (ids: string[]) => {
      logs = recordLogsFor(ids);
      changes.next({ config: { EntityName: 'MJ: User Record Logs' }, changeType: 'refresh', data: logs } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(engine as unknown as UserInfoEngine);
  return engine;
}

/** Replaces the view, query and action engines the Add Pin panel reads (Home pre-warms two of them). They have no rows. */
function stubAddPinPanelEngines(): void {
  const empty = {
    Config: vi.fn(async () => undefined),
    IsPermissionConstrained: false,
    GetViewsForCurrentUser: () => [],
    Queries: [],
    Actions: [],
  };
  vi.spyOn(UserViewEngine, 'Instance', 'get').mockReturnValue(empty as unknown as UserViewEngine);
  vi.spyOn(QueryEngine, 'Instance', 'get').mockReturnValue(empty as unknown as QueryEngine);
  vi.spyOn(ActionEngineBase, 'Instance', 'get').mockReturnValue(empty as unknown as ActionEngineBase);
}

/** Replaces MJNotificationService.Instance with a double that records the toasts. */
function stubNotifications() {
  const notifications = { CreateSimpleNotification: vi.fn() };
  vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications as unknown as MJNotificationService);
  return notifications;
}

/**
 * A NavigationService double. Home's tab keeps its query params in a stream, as the workspace does:
 * UpdateTabQueryParams merges into it (null removes a param), and GoTo replaces it the way back and
 * forward do.
 */
function fakeNavigation(initialParams: Record<string, string> = {}) {
  const tabParams = new BehaviorSubject<Record<string, string>>(initialParams);
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: (_tabId: string) => tabParams.asObservable(),
    UpdateTabQueryParams: vi.fn((_tabId: string, params: Record<string, string | null>, _guard?: object) => {
      const next = { ...tabParams.value };
      for (const [key, value] of Object.entries(params)) {
        if (value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
      }
      tabParams.next(next);
      return true;
    }),
    GoTo: (params: Record<string, string>) => tabParams.next(params),
    TabParams: (): Record<string, string> => tabParams.value,
    OpenDashboard: vi.fn((_id: string, _name: string, _options?: DashboardNavigationOptions) => 'dashboard-tab'),
    OpenEntityRecord: vi.fn((_entityName: string, _key: CompositeKey) => 'record-tab'),
    OpenQuery: vi.fn((_queryId: string, _queryName: string) => 'query-tab'),
    OpenView: vi.fn((_viewId: string, _viewName: string) => 'view-tab'),
    SwitchToApp: vi.fn(async (_appId: string, _navItemName?: string, _queryParams?: Record<string, string | null>) => undefined),
    SetAgentContext: vi.fn((_caller: HomeDashboardComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: HomeDashboardComponent, _tools: AgentTool[]) => undefined),
  };
}

/**
 * A HomeDashboardTabsService double. Reload and Remove emit Changed$ as the service does after a
 * reload. SetTabs changes what Tabs returns without emitting, as a cache change does.
 */
function fakeHomeTabs(initialTabs: MJDashboardEntity[]) {
  let tabs = [...initialTabs];
  const changed$ = new Subject<void>();
  return {
    Changed$: changed$,
    Tabs: vi.fn(() => tabs),
    Reload: vi.fn(async () => changed$.next()),
    Remove: vi.fn(async (dashboardId: string) => {
      tabs = tabs.filter(t => !UUIDsEqual(t.ID, dashboardId));
      changed$.next();
    }),
    SetTabs: (next: MJDashboardEntity[]) => {
      tabs = next;
    },
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

/**
 * An ApplicationManager double that starts with the user's `initialApps`. `ReloadApps` emits what
 * ReloadUserApplications emits: loading, the new list, done. The system has the Dashboards app, and
 * the server never answers an install request.
 */
function fakeAppManager(initialApps: BaseApplication[] = []) {
  const loading$ = new BehaviorSubject<boolean>(false);
  const apps$ = new BehaviorSubject<BaseApplication[]>(initialApps);
  return {
    Loading: loading$.asObservable(),
    Applications: apps$.asObservable(),
    GetAllApps: (): BaseApplication[] => apps$.value,
    WhenReady: async (): Promise<void> => undefined,
    GetAllSystemApps: (): BaseApplication[] => [DASHBOARDS_APP],
    InstallAppForUser: vi.fn((_appId: string) => new Promise<MJUserApplicationEntity | null>(() => undefined)),
    ReloadUserApplications: vi.fn(async () => undefined),
    ReloadApps: (apps: BaseApplication[]) => {
      loading$.next(true);
      apps$.next(apps);
      loading$.next(false);
    },
  };
}

/** A HomeAppPinService double with these ungrouped pins. AddPin accepts every new pin. */
function fakePins(pins: HomeAppPinnedItem[] = []) {
  return {
    Pins$: new BehaviorSubject<HomeAppPinnedItem[]>(pins),
    LoadPins: vi.fn(async () => undefined),
    AddPin: vi.fn((_input: HomeAppPinInput) => true),
    GetUngroupedPins: (): HomeAppPinnedItem[] => pins,
    GetGroups: (): string[] => [],
    GetPinsInGroup: (_group: string): HomeAppPinnedItem[] => [],
    IsPinned: (_resourceType: string, _config: Record<string, unknown>) => false,
  };
}

/** A RecentAccessService double with these recent items. */
function fakeRecentAccess(items: RecentAccessItem[] = []) {
  return {
    RecentItems: new BehaviorSubject<RecentAccessItem[]>(items).asObservable(),
    loadRecentItems: vi.fn(async (_maxItems?: number) => undefined),
    LogAccess: vi.fn(async (_entityName: string, _recordId: string, _resourceType?: string) => undefined),
  };
}

/** The dashboard CreateBlankDashboard gets from the provider. Save resolves `saved`, or waits for the test when `saved` is a promise. */
function newDashboardDouble(saved: boolean | Promise<boolean>) {
  return {
    ID: 'D1000000-0000-4000-8000-000000000099',
    Name: '',
    Type: 'Config',
    Save: vi.fn(async () => saved),
    LatestResult: { CompleteMessage: 'Name is required' },
  };
}

/** Lets async work and follow-up timers finish. Advances fake timers when the test uses them. */
const settle = async (): Promise<void> => {
  if (vi.isFakeTimers()) {
    await vi.advanceTimersByTimeAsync(0);
    return;
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

type Fixture = ComponentFixture<HomeDashboardComponent>;

const texts = (fixture: Fixture, selector: string): string[] => QueryAll(fixture, selector).map(el => el.textContent?.trim() ?? '');

/** The strip's tiles, in order: the Continue tile first, then the favorite tiles. */
const stripTiles = (fixture: Fixture): Element[] => QueryAll(fixture, 'mj-home-dashboards-strip mj-home-dashboard-tile');

/** The name on a strip tile. */
const tileName = (tile: Element): string => tile.querySelector('.tile-name')?.textContent?.trim() ?? '';

/** The names on the favorite tiles (the tiles without the Continue label), in order. */
const favoriteTileNames = (fixture: Fixture): string[] => stripTiles(fixture).filter(tile => !tile.querySelector('.tile-chip')).map(tileName);

/** The name on the Continue tile, or '' when the strip has none. */
function continueTileName(fixture: Fixture): string {
  const tile = stripTiles(fixture).find(t => t.querySelector('.tile-chip'));
  return tile ? tileName(tile) : '';
}

/** The viewer in the strip tile with that name, or null. */
function stripTileViewer(fixture: Fixture, name: string): DashboardViewerStub | null {
  const tile = fixture.debugElement.queryAll(By.css('mj-home-dashboards-strip mj-home-dashboard-tile')).find(t => tileName(t.nativeElement as Element) === name);
  const element = tile?.query(By.directive(DashboardViewerStub));
  return element ? (element.componentInstance as DashboardViewerStub) : null;
}

/** The element that matches `selector` in the strip tile with that name. Throws when there is none. */
function inStripTile(fixture: Fixture, name: string, selector: string): HTMLElement {
  const element = stripTiles(fixture).find(tile => tileName(tile) === name)?.querySelector(selector);
  if (!element) {
    throw new Error(`inStripTile(): no "${selector}" in the strip tile "${name}"`);
  }
  return element as HTMLElement;
}

describe('HomeDashboardComponent: dashboards on Home (DOM)', () => {
  const installProvider = UseFakeGlobalProvider();

  beforeEach(() => {
    vi.mocked(AutoInstallDashboardsApp).mockReset();
    vi.mocked(EnsureDashboardsApp).mockReset();
    tabContainerSize = { width: 1200, height: 800 };
    stubTabContainerSize();
    FakeResizeObserver.Instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  interface HomeOptions {
    lib?: HomeLibrary;
    /**
     * What the automatic install returns; a pending promise holds it. 'real' runs the real install
     * helper and install queue against the ApplicationManager and UserInfoEngine doubles.
     */
    autoInstall?: Promise<boolean> | 'real';
    /** The dashboard cache fails to load. */
    cacheFails?: boolean;
    /** The dashboards the Home tabs service returns. */
    homeTabs?: MJDashboardEntity[];
    /** The query params of Home's tab when Home opens (Home's resource data). */
    queryParams?: Record<string, string>;
    /** The params the tab's query-param stream starts with. Defaults to `queryParams`. */
    workspaceParams?: Record<string, string>;
    /** The user's apps. */
    apps?: BaseApplication[];
    /** The user's pins, ungrouped. */
    pins?: HomeAppPinnedItem[];
    /** The user's favorites, any entity (Quick Access). */
    userFavorites?: MJUserFavoriteEntity[];
    /** The user's recent items (Quick Access). */
    recents?: RecentAccessItem[];
    /** The user's saved settings, by key. */
    settings?: Record<string, string>;
  }

  /** Makes the AutoInstallDashboardsApp mock return `autoInstall`, or run the real helper. */
  async function arrangeAutoInstall(autoInstall: Promise<boolean> | 'real'): Promise<void> {
    if (autoInstall !== 'real') {
      vi.mocked(AutoInstallDashboardsApp).mockReturnValue(autoInstall);
      return;
    }
    const actual = await vi.importActual<typeof import('../shared/dashboards-app.helpers')>('../shared/dashboards-app.helpers');
    vi.mocked(AutoInstallDashboardsApp).mockImplementation(actual.AutoInstallDashboardsApp);
  }

  /** Renders Home and waits for its first load to finish. */
  async function renderHome({
    lib = library(),
    autoInstall = Promise.resolve(false),
    cacheFails = false,
    homeTabs: initialTabs = HOME_TABS,
    queryParams = {},
    workspaceParams = queryParams,
    apps = [],
    pins = [],
    userFavorites = [],
    recents = [],
    settings = {},
  }: HomeOptions = {}) {
    const provider = installProvider({
      entityByName: name => (name === 'MJ: Dashboards' ? ({ ID: DASHBOARDS_ENTITY_ID, Name: name } as unknown as EntityInfo) : undefined),
    });
    // Home asks for the record names of its favorites. This provider finds none.
    Object.assign(provider, { GetEntityRecordNames: vi.fn(async (_inputs: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> => []) });
    const engine = stubDashboardEngine(lib);
    if (cacheFails) {
      engine.Config.mockRejectedValue(new Error('network down'));
    }
    const userInfo = stubUserInfo(lib.recentIds, settings);
    userInfo.UserFavorites = userFavorites;
    stubAddPinPanelEngines();
    const notifications = stubNotifications();
    const navigation = fakeNavigation(workspaceParams);
    const favorites = fakeFavorites(lib.favoriteIds);
    const homeTabs = fakeHomeTabs(initialTabs);
    const recentAccess = fakeRecentAccess(recents);
    const appManager = fakeAppManager(apps);
    await arrangeAutoInstall(autoInstall);
    const fixture = RenderComponentFixture(HomeDashboardComponent, {
      imports: [
        CommonModule,
        FormsModule,
        MJAccordionModule,
        MJButtonDirective,
        MJClickableDirective,
        StubLoadingComponent,
        StubEmptyStateComponent,
        ActionPinConfigDialogStub,
        ActionPinRunnerDialogStub,
        UserAppConfigStub,
        DashboardViewerStub,
        PreferencesDialogStub,
      ],
      declarations: [HomeDashboardComponent, HomeDashboardsStripComponent, HomeDashboardTileComponent, HomeDashboardTabsComponent],
      providers: [
        { provide: ApplicationManager, useValue: appManager },
        { provide: RecentAccessService, useValue: recentAccess },
        { provide: HomeAppPinService, useValue: fakePins(pins) },
        { provide: NavigationService, useValue: navigation },
        { provide: DashboardFavoritesService, useValue: favorites },
        { provide: HomeDashboardTabsService, useValue: homeTabs },
      ],
      setup: instance => {
        instance.Data = new ResourceData({
          Configuration: { tabId: TAB_ID, resourceType: 'Custom', driverClass: 'HomeDashboard', navItemName: 'Home', queryParams },
        });
      },
    });
    await settle();
    fixture.detectChanges();
    return { fixture, provider, engine, userInfo, notifications, navigation, favorites, homeTabs, recentAccess, appManager };
  }

  describe('what the strip shows', () => {
    it('shows the strip between the Home tab row and Pinned', async () => {
      const { fixture } = await renderHome();
      expect(Query(fixture, '.main-content > .home-header + mj-home-dashboard-tabs + mj-home-dashboards-strip + .pinned-section')).not.toBeNull();
      expect(Text(fixture, 'mj-home-dashboards-strip .strip-title')).toBe('Dashboards');
    });

    it("reads the dashboard cache for the current user through Home's provider", async () => {
      const { engine, provider } = await renderHome();
      expect(engine.Config).toHaveBeenCalledTimes(1);
      expect(engine.Config).toHaveBeenCalledWith(false, provider.CurrentUser, provider);
      expect(engine.GetAccessibleDashboards).toHaveBeenCalledWith(USER_ID);
    });

    it('continues with the last opened Config dashboard the user can open, from every recent dashboard', async () => {
      const { fixture, userInfo } = await renderHome();
      expect(continueTileName(fixture)).toBe('Board Pack');
      expect(tileName(stripTiles(fixture)[0])).toBe('Board Pack');
      expect(userInfo.GetRecentRecordsForEntity).toHaveBeenCalledWith(DASHBOARDS_ENTITY_ID, Number.MAX_SAFE_INTEGER);
    });

    it('shows the two newest favorites other than Continue, each live in a starred tile, and the counts on Browse all', async () => {
      const { fixture } = await renderHome();
      expect(favoriteTileNames(fixture)).toEqual(['Partner KPIs', 'Revenue']);
      expect(stripTiles(fixture).map(tile => tile.querySelector('.tile-star')?.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
      const live = fixture.debugElement.queryAll(By.css('mj-home-dashboards-strip mj-dashboard-viewer'));
      expect(live.map(v => (v.componentInstance as DashboardViewerStub).Shown.at(-1)?.Name)).toEqual(['Board Pack', 'Partner KPIs', 'Revenue']);
      expect(Text(fixture, '.strip-browse-all')).toContain('Browse all 5');
      expect(Text(fixture, '.strip-browse-all small')).toBe('4 favorites · 2 shared with you');
    });

    it('shows the empty hint to a user who has not opened or starred a dashboard', async () => {
      const { fixture } = await renderHome({ lib: { dashboards: [REVENUE], recentIds: [], favoriteIds: [] } });
      expect(Text(fixture, '.strip-empty')).toBe('Open or star a dashboard and it appears here.');
      expect(stripTiles(fixture)).toEqual([]);
      expect(Text(fixture, '.strip-browse-all')).toContain('Browse all 1');
    });

    it('still shows Home, with an empty strip, when the dashboard cache cannot load', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture } = await renderHome({ cacheFails: true });
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(Query(fixture, '.strip-empty')).not.toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
    });
  });

  describe('keeping the strip current', () => {
    it('follows favorites changed anywhere (DashboardFavoritesService.Changed$)', async () => {
      const { fixture, favorites } = await renderHome();

      favorites.Set([QUOTA.ID]);
      fixture.detectChanges();

      expect(favoriteTileNames(fixture)).toEqual(['Quota']);
      expect(Text(fixture, '.strip-browse-all small')).toBe('1 favorite · 2 shared with you');
    });

    it('shows a dashboard opened elsewhere as Continue once the record-log cache reloads', async () => {
      const { fixture, userInfo } = await renderHome();

      userInfo.ReloadRecordLogs([OPS_HEALTH.ID, BOARD_PACK.ID]);
      fixture.detectChanges();

      expect(continueTileName(fixture)).toBe('Ops Health');
      expect(favoriteTileNames(fixture)).toEqual(['Board Pack', 'Partner KPIs']);
    });

    it('re-reads the dashboard cache when it changes, without reloading it', async () => {
      const lib = library();
      const { fixture, engine } = await renderHome({ lib });

      // In another tab Revenue is deleted, Ana shares Cash Runway and the user saves Margin.
      lib.dashboards = [QUOTA, BOARD_PACK, PARTNER_KPIS, CUSTOM_CODE, OPS_HEALTH, CASH_RUNWAY, MARGIN];
      engine.EmitChange('MJ: Dashboards');
      engine.EmitChange('MJ: Dashboard Permissions');
      await settle();
      fixture.detectChanges();

      expect(favoriteTileNames(fixture)).toEqual(['Partner KPIs', 'Quota']);
      expect(Text(fixture, '.strip-browse-all')).toContain('Browse all 6');
      expect(Text(fixture, '.strip-browse-all small')).toBe('3 favorites · 3 shared with you');
      expect(engine.Config).toHaveBeenCalledTimes(1);
    });

    it("rebuilds a tile's viewer, and shows the new name, when an edit is saved into its dashboard object and the cache reports it", async () => {
      const boardPack = reloadedCopy(BOARD_PACK);
      const lib = library();
      lib.dashboards = lib.dashboards.map(d => (d === BOARD_PACK ? boardPack : d));
      const { fixture, engine } = await renderHome({ lib });
      const before = stripTileViewer(fixture, 'Board Pack')?.Id ?? null;
      expect(before).not.toBeNull();

      editInPlace(boardPack, { Name: 'Board Pack 2027', UIConfigDetails: NEW_LAYOUT });
      engine.EmitChange('MJ: Dashboards');
      await settle();
      fixture.detectChanges();

      expect(continueTileName(fixture)).toBe('Board Pack 2027');
      const after = stripTileViewer(fixture, 'Board Pack 2027');
      expect(after?.Id).not.toBe(before);
      expect(after?.Shown).toEqual([boardPack]);
    });

    it('does not report to the agent when favorites, dashboard opens or the dashboard cache change', async () => {
      const { fixture, navigation, favorites, userInfo, engine } = await renderHome();
      const reported = navigation.SetAgentContext.mock.calls.length;

      favorites.Set([QUOTA.ID]);
      userInfo.ReloadRecordLogs([OPS_HEALTH.ID]);
      engine.EmitChange('MJ: Dashboards');
      await settle();
      fixture.detectChanges();

      expect(continueTileName(fixture)).toBe('Ops Health');
      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
    });
  });

  describe('the automatic Dashboards app install', () => {
    it('runs once, during the first load', async () => {
      const { fixture, appManager, favorites, userInfo, engine } = await renderHome();
      expect(AutoInstallDashboardsApp).toHaveBeenCalledTimes(1);
      expect(AutoInstallDashboardsApp).toHaveBeenCalledWith(appManager);

      appManager.ReloadApps([DASHBOARDS_APP]);
      favorites.Set([]);
      userInfo.ReloadRecordLogs([]);
      engine.EmitChange('MJ: Dashboards');
      await settle();
      fixture.detectChanges();

      expect(AutoInstallDashboardsApp).toHaveBeenCalledTimes(1);
    });

    it('keeps Home on its loading view until the install and its app-list reload finish', async () => {
      let finishInstall: (installed: boolean) => void = () => undefined;
      const install = new Promise<boolean>(resolve => (finishInstall = resolve));
      const { fixture, appManager } = await renderHome({ autoInstall: install });

      expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
      expect(Query(fixture, 'mj-home-dashboards-strip')).toBeNull();
      expect(Query(fixture, 'mj-home-dashboard-tabs')).toBeNull();

      // Installing reloads the user's apps: loading, the list with Dashboards, done.
      appManager.ReloadApps([DASHBOARDS_APP]);
      await settle();
      fixture.detectChanges();
      expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
      expect(Query(fixture, 'mj-home-dashboards-strip')).toBeNull();

      finishInstall(true);
      await settle();
      fixture.detectChanges();
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(Query(fixture, 'mj-home-dashboards-strip')).not.toBeNull();
      expect(texts(fixture, '.app-name')).toEqual(['Dashboards']);
    });

    describe('when the server never answers the install request', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it('leaves the loading view after the install step limit, shows the strip, and saves no marker', async () => {
        vi.useFakeTimers();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { fixture, appManager, userInfo } = await renderHome({ autoInstall: 'real' });

        expect(appManager.InstallAppForUser).toHaveBeenCalledWith(DASHBOARDS_APP.ID);
        expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
        expect(Query(fixture, 'mj-home-dashboards-strip')).toBeNull();

        await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS - 1);
        fixture.detectChanges();
        expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
        expect(Query(fixture, 'mj-home-dashboards-strip')).toBeNull();

        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();
        expect(Query(fixture, '.loading-container')).toBeNull();
        expect(continueTileName(fixture)).toBe('Board Pack');
        expect(favoriteTileNames(fixture)).toEqual(['Partner KPIs', 'Revenue']);
        expect(Query(fixture, '.pinned-section')).not.toBeNull();
        expect(userInfo.SetSetting).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
      });
    });
  });

  describe('strip actions', () => {
    it('opens the Continue dashboard and a favorite from their tiles in the default application, without forcing a new tab', async () => {
      const { fixture, navigation } = await renderHome();

      inStripTile(fixture, 'Board Pack', '.tile-open').click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(BOARD_PACK.ID, 'Board Pack');

      inStripTile(fixture, 'Board Pack', '.tile-name').click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(BOARD_PACK.ID, 'Board Pack');

      inStripTile(fixture, 'Partner KPIs', '.tile-name').click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(PARTNER_KPIS.ID, 'Partner KPIs');
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(3);
    });

    it("follows links from a tile's dashboard: records, dashboards (without forcing a new tab) and queries", async () => {
      const { fixture, navigation } = await renderHome();
      const tileViewer = fixture.debugElement.query(By.css('mj-home-dashboards-strip mj-dashboard-viewer'));
      const panels = (tileViewer.componentInstance as DashboardViewerStub).NavigationRequested;

      panels.emit({ request: { type: 'OpenEntityRecord', sourcePanelId: 'panel-1', entityName: 'MJ: Users', recordId: 'ID|U-1' }, panel: PANEL });
      panels.emit({ request: { type: 'OpenDashboard', sourcePanelId: 'panel-1', dashboardId: QUOTA.ID.toLowerCase() }, panel: PANEL });
      panels.emit({ request: { type: 'OpenQuery', sourcePanelId: 'panel-1', queryId: 'Q-1' }, panel: PANEL });

      expect(navigation.OpenEntityRecord).toHaveBeenCalledTimes(1);
      const [entityName, key] = navigation.OpenEntityRecord.mock.calls[0];
      expect(entityName).toBe('MJ: Users');
      expect(key.ToURLSegment()).toBe('ID|U-1');
      expect(navigation.OpenDashboard).toHaveBeenCalledWith(QUOTA.ID.toLowerCase(), 'Quota');
      expect(navigation.OpenQuery).toHaveBeenCalledWith('Q-1', 'Query');
    });

    it('unstars a favorite tile, tells the user, and moves the next favorite up', async () => {
      const { fixture, favorites, notifications } = await renderHome();

      inStripTile(fixture, 'Partner KPIs', '.tile-star').click();
      await settle();
      fixture.detectChanges();

      expect(favorites.Toggle).toHaveBeenCalledWith(PARTNER_KPIS.ID);
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Removed "Partner KPIs" from favorites', 'success', 2000);
      expect(favoriteTileNames(fixture)).toEqual(['Revenue', 'Quota']);
    });

    it('See all installs the Dashboards app if needed, then opens its Overview page', async () => {
      let finishEnsure: (app: BaseApplication | undefined) => void = () => undefined;
      vi.mocked(EnsureDashboardsApp).mockReturnValue(new Promise(resolve => (finishEnsure = resolve)));
      const { fixture, navigation, appManager, notifications } = await renderHome();

      Click(fixture, '.strip-see-all');
      await settle();
      expect(EnsureDashboardsApp).toHaveBeenCalledWith(appManager);
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();

      finishEnsure(DASHBOARDS_APP);
      await settle();
      expect(navigation.SwitchToApp).toHaveBeenCalledTimes(1);
      expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Overview');
      expect(notifications.CreateSimpleNotification).not.toHaveBeenCalled();
    });

    it('Browse all installs the Dashboards app if needed, then opens Browse', async () => {
      vi.mocked(EnsureDashboardsApp).mockResolvedValue(DASHBOARDS_APP);
      const { fixture, navigation, appManager } = await renderHome();

      Click(fixture, '.strip-browse-all');
      await settle();

      expect(EnsureDashboardsApp).toHaveBeenCalledWith(appManager);
      expect(navigation.SwitchToApp).toHaveBeenCalledTimes(1);
      expect(navigation.SwitchToApp).toHaveBeenCalledWith(DASHBOARDS_APP.ID, 'Browse');
    });

    it('warns the user when the Dashboards app cannot be opened', async () => {
      vi.mocked(EnsureDashboardsApp).mockResolvedValue(undefined);
      const { fixture, navigation, notifications } = await renderHome();

      Click(fixture, '.strip-see-all');
      await settle();

      expect(navigation.SwitchToApp).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledTimes(1);
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith(APP_UNAVAILABLE_MESSAGE, 'warning', 4000);
    });

    it('New saves a blank dashboard, reloads the cache, then opens it in edit mode without forcing a new tab', async () => {
      const { fixture, provider, engine, navigation } = await renderHome();
      const created = newDashboardDouble(true);
      Object.assign(provider, { GetEntityObject: vi.fn(async () => created) });

      Click(fixture, '.strip-new');
      await settle();

      expect(created.Save).toHaveBeenCalledTimes(1);
      expect(engine.Config).toHaveBeenLastCalledWith(true, provider.CurrentUser, provider);
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(1);
      expect(navigation.OpenDashboard).toHaveBeenCalledWith(created.ID, 'New Dashboard', { openInEditMode: true });
      expect(engine.Config.mock.invocationCallOrder.at(-1)).toBeLessThan(navigation.OpenDashboard.mock.invocationCallOrder[0]);
    });

    it('New still opens the dashboard when the cache reload fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, provider, engine, navigation } = await renderHome();
      const created = newDashboardDouble(true);
      Object.assign(provider, { GetEntityObject: vi.fn(async () => created) });
      engine.Config.mockRejectedValueOnce(new Error('network down'));

      Click(fixture, '.strip-new');
      await settle();

      expect(navigation.OpenDashboard).toHaveBeenCalledWith(created.ID, 'New Dashboard', { openInEditMode: true });
    });

    it('New tells the user and opens nothing when the dashboard cannot be saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, provider, navigation, notifications } = await renderHome();
      Object.assign(provider, { GetEntityObject: vi.fn(async () => newDashboardDouble(false)) });

      Click(fixture, '.strip-new');
      await settle();

      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Could not create the dashboard', 'error', 3000);
    });

    it('New ignores a second click while the first dashboard is being saved', async () => {
      let finishSave: (saved: boolean) => void = () => undefined;
      const { fixture, provider, navigation } = await renderHome();
      const created = newDashboardDouble(new Promise<boolean>(resolve => (finishSave = resolve)));
      Object.assign(provider, { GetEntityObject: vi.fn(async () => created) });

      Click(fixture, '.strip-new');
      await settle();
      Click(fixture, '.strip-new');
      await settle();
      finishSave(true);
      await settle();

      expect(created.Save).toHaveBeenCalledTimes(1);
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Home dashboard tabs
  // ---------------------------------------------------------------------------------------------

  type Navigation = ReturnType<typeof fakeNavigation>;

  const tabLabels = (fixture: Fixture): string[] => texts(fixture, 'mj-home-dashboard-tabs [role="tab"]');

  const selectedTab = (fixture: Fixture): string => Text(fixture, 'mj-home-dashboard-tabs [role="tab"][aria-selected="true"]');

  /** Clicks the Home tab with that label, then renders. */
  function clickTab(fixture: Fixture, label: string): void {
    const tab = QueryAll(fixture, 'mj-home-dashboard-tabs [role="tab"]').find(el => el.textContent?.trim() === label);
    if (!tab) {
      throw new Error(`clickTab(): no Home tab "${label}"`);
    }
    (tab as HTMLElement).click();
    fixture.detectChanges();
  }

  /** The dashboard viewer of the open Home tab, or null when no Home tab dashboard shows. */
  function viewer(fixture: Fixture): DashboardViewerStub | null {
    const element = fixture.debugElement.query(By.css('.home-tab-dashboard mj-dashboard-viewer'));
    return element ? (element.componentInstance as DashboardViewerStub) : null;
  }

  /** The id of the dashboard viewer, or null when no Home tab dashboard shows. A new viewer has a new id. */
  const viewerId = (fixture: Fixture): number | null => viewer(fixture)?.Id ?? null;

  /** The dashboard object the viewer shows now, or null. */
  const shownDashboard = (fixture: Fixture): MJDashboardEntity | null => viewer(fixture)?.Shown.at(-1) ?? null;

  /** The Manage home dashboards dialog, or null when it is closed. */
  function preferencesDialog(fixture: Fixture): PreferencesDialogStub | null {
    const element = fixture.debugElement.query(By.directive(PreferencesDialogStub));
    return element ? (element.componentInstance as PreferencesDialogStub) : null;
  }

  const dialogOpen = (fixture: Fixture): boolean => preferencesDialog(fixture) !== null;

  /** True when Home shows its Overview sections: the strip, Pinned and My Applications. */
  const showsOverview = (fixture: Fixture): boolean =>
    Query(fixture, 'mj-home-dashboards-strip') !== null && Query(fixture, '.pinned-section') !== null && Query(fixture, '.apps-section') !== null;

  /** The context Home reported to the agent last. */
  const lastContext = (navigation: Navigation): Record<string, unknown> => navigation.SetAgentContext.mock.calls.at(-1)?.[1] ?? {};

  /** The client tool Home registered under that name. */
  function agentTool(navigation: Navigation, name: string): AgentTool {
    const tool = navigation.SetAgentClientTools.mock.calls.at(-1)?.[1].find(t => t.Name === name);
    if (!tool) {
      throw new Error(`agentTool(): Home registered no tool "${name}"`);
    }
    return tool;
  }

  const PANEL = { id: 'panel-1', title: 'Accounts' } as unknown as DashboardPanel;

  describe('Home tabs: the tab row and the tab dashboard', () => {
    it('shows Overview, a tab per Home dashboard and Add, with Overview selected', async () => {
      const { fixture, homeTabs } = await renderHome();
      expect(homeTabs.Tabs).toHaveBeenCalled();
      expect(tabLabels(fixture)).toEqual(['Overview', 'Sales pipeline', 'Ops Health']);
      expect(selectedTab(fixture)).toBe('Overview');
      expect(Query(fixture, 'mj-home-dashboard-tabs .ht-add')).not.toBeNull();
      expect(Text(fixture, '.home-header .home-manage-tabs')).toBe('Manage home dashboards');
      expect(showsOverview(fixture)).toBe(true);
      expect(viewerId(fixture)).toBeNull();
    });

    it('opens a tab: shows its dashboard inline, hides the Overview sections, writes the tab to the URL and records the open', async () => {
      const { fixture, navigation, recentAccess } = await renderHome();

      clickTab(fixture, 'Sales pipeline');

      expect(selectedTab(fixture)).toBe('Sales pipeline');
      expect(shownDashboard(fixture)).toBe(SALES_PIPELINE);
      const shownBy = viewer(fixture);
      expect([shownBy?.IsEditing, shownBy?.ShowToolbar, shownBy?.ShowBreadcrumb]).toEqual([false, false, false]);
      expect(Text(fixture, '.home-tab-title')).toBe('Sales pipeline');
      expect(Text(fixture, '.home-tab-meta')).toBe('Ana Ruiz');
      expect(Query(fixture, 'mj-home-dashboards-strip')).toBeNull();
      expect(Query(fixture, '.pinned-section')).toBeNull();
      expect(Query(fixture, '.apps-section')).toBeNull();
      expect(navigation.TabParams()).toEqual({ homeTab: SALES_PIPELINE.ID });
      expect(recentAccess.LogAccess).toHaveBeenCalledTimes(1);
      expect(recentAccess.LogAccess).toHaveBeenCalledWith('MJ: Dashboards', SALES_PIPELINE.ID, 'dashboard');
    });

    it('goes back to Overview and removes the tab from the URL', async () => {
      const { fixture, navigation } = await renderHome();

      clickTab(fixture, 'Sales pipeline');
      clickTab(fixture, 'Overview');

      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(viewerId(fixture)).toBeNull();
      expect(navigation.TabParams()).toEqual({});
    });

    it('does not record the open or report to the agent again when the open tab is clicked again', async () => {
      const { fixture, navigation, recentAccess } = await renderHome();
      const reported = navigation.SetAgentContext.mock.calls.length;

      clickTab(fixture, 'Sales pipeline');
      clickTab(fixture, 'Sales pipeline');

      expect(recentAccess.LogAccess).toHaveBeenCalledTimes(1);
      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported + 1);
      expect(viewer(fixture)?.Shown).toHaveLength(1);
    });
  });

  describe('Home tabs: the homeTab query param', () => {
    it("ignores the shell's tab param, which names a workspace tab, not a Home tab", async () => {
      const { fixture, navigation } = await renderHome({ queryParams: { tab: OPS_HEALTH.ID } });
      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);

      navigation.GoTo({ tab: SALES_PIPELINE.ID });
      fixture.detectChanges();
      expect(selectedTab(fixture)).toBe('Overview');
      expect(viewerId(fixture)).toBeNull();
    });

    it('opens the tab the URL names when Home opens, in any letter case', async () => {
      const { fixture, recentAccess } = await renderHome({ queryParams: { homeTab: OPS_HEALTH.ID.toLowerCase() } });

      expect(selectedTab(fixture)).toBe('Ops Health');
      expect(shownDashboard(fixture)).toBe(OPS_HEALTH);
      expect(showsOverview(fixture)).toBe(false);
      expect(recentAccess.LogAccess).not.toHaveBeenCalled();
    });

    it("opens the tab in Home's resource data before the tab's query-param stream delivers it", async () => {
      const { fixture } = await renderHome({ queryParams: { homeTab: OPS_HEALTH.ID }, workspaceParams: {} });

      expect(selectedTab(fixture)).toBe('Ops Health');
      expect(shownDashboard(fixture)).toBe(OPS_HEALTH);
    });

    it("prefers the tab the query-param stream delivered over Home's resource data", async () => {
      const { fixture } = await renderHome({ queryParams: { homeTab: OPS_HEALTH.ID }, workspaceParams: { homeTab: SALES_PIPELINE.ID } });

      expect(selectedTab(fixture)).toBe('Sales pipeline');
      expect(shownDashboard(fixture)).toBe(SALES_PIPELINE);
    });

    it('follows back and forward', async () => {
      const { fixture, navigation } = await renderHome();

      navigation.GoTo({ homeTab: SALES_PIPELINE.ID });
      fixture.detectChanges();
      expect(selectedTab(fixture)).toBe('Sales pipeline');
      expect(shownDashboard(fixture)).toBe(SALES_PIPELINE);

      navigation.GoTo({ homeTab: OPS_HEALTH.ID });
      fixture.detectChanges();
      expect(selectedTab(fixture)).toBe('Ops Health');
      expect(shownDashboard(fixture)).toBe(OPS_HEALTH);

      navigation.GoTo({});
      fixture.detectChanges();
      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(viewerId(fixture)).toBeNull();
    });

    it('shows Overview for a tab the list does not have, when Home opens and later', async () => {
      const { fixture, navigation } = await renderHome({ queryParams: { homeTab: NOT_A_TAB_ID } });
      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);

      navigation.GoTo({ homeTab: SALES_PIPELINE.ID });
      fixture.detectChanges();
      navigation.GoTo({ homeTab: NOT_A_TAB_ID });
      fixture.detectChanges();

      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(viewerId(fixture)).toBeNull();
    });

    it('shows Overview when the open tab leaves the list, and clears the URL when the user clicks Overview', async () => {
      const { fixture, navigation, homeTabs } = await renderHome();
      clickTab(fixture, 'Sales pipeline');

      homeTabs.SetTabs([OPS_HEALTH]);
      homeTabs.Changed$.next();
      fixture.detectChanges();

      expect(tabLabels(fixture)).toEqual(['Overview', 'Ops Health']);
      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(navigation.TabParams()).toEqual({ homeTab: SALES_PIPELINE.ID });

      clickTab(fixture, 'Overview');
      expect(navigation.TabParams()).toEqual({});
    });
  });

  describe('Home tabs: keeping the tabs current', () => {
    it('follows the Home tabs service and dashboard cache changes, without reporting to the agent', async () => {
      const { fixture, navigation, homeTabs, engine } = await renderHome();
      const reported = navigation.SetAgentContext.mock.calls.length;

      homeTabs.SetTabs([OPS_HEALTH]);
      engine.EmitChange('MJ: Dashboard User Preferences');
      await settle();
      fixture.detectChanges();
      expect(tabLabels(fixture)).toEqual(['Overview', 'Ops Health']);

      homeTabs.SetTabs([]);
      engine.EmitChange('MJ: Dashboard Permissions');
      await settle();
      fixture.detectChanges();
      expect(tabLabels(fixture)).toEqual(['Overview']);

      homeTabs.SetTabs([OPS_HEALTH, SALES_PIPELINE]);
      homeTabs.Changed$.next();
      fixture.detectChanges();
      expect(tabLabels(fixture)).toEqual(['Overview', 'Ops Health', 'Sales pipeline']);

      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
    });

    it('rebuilds the viewer when an edit is saved into the open dashboard object and the cache reports it', async () => {
      const sales = reloadedCopy(SALES_PIPELINE);
      const { fixture, engine } = await renderHome({ homeTabs: [sales, OPS_HEALTH] });
      clickTab(fixture, 'Sales pipeline');
      const before = viewerId(fixture);

      editInPlace(sales, { UIConfigDetails: NEW_LAYOUT });
      engine.EmitChange('MJ: Dashboards');
      await settle();
      fixture.detectChanges();

      expect(viewerId(fixture)).not.toBeNull();
      expect(viewerId(fixture)).not.toBe(before);
      expect(viewer(fixture)?.Shown).toHaveLength(1);
      expect(shownDashboard(fixture)).toBe(sales);
    });

    it('keeps the viewer when a reload returns an equal copy, and rebuilds it when the copy differs', async () => {
      const sales = reloadedCopy(SALES_PIPELINE);
      const { fixture, homeTabs } = await renderHome({ homeTabs: [sales, OPS_HEALTH] });
      clickTab(fixture, 'Sales pipeline');
      const before = viewerId(fixture);

      homeTabs.SetTabs([reloadedCopy(sales), OPS_HEALTH]);
      homeTabs.Changed$.next();
      fixture.detectChanges();
      expect(viewerId(fixture)).toBe(before);
      expect(viewer(fixture)?.Shown).toHaveLength(1);
      expect(shownDashboard(fixture)).toBe(sales);

      const relaidOut = reloadedCopy(sales, { UIConfigDetails: NEW_LAYOUT });
      homeTabs.SetTabs([relaidOut, OPS_HEALTH]);
      homeTabs.Changed$.next();
      fixture.detectChanges();
      const rebuilt = viewerId(fixture);
      expect(rebuilt).not.toBe(before);
      expect(shownDashboard(fixture)).toBe(relaidOut);

      const renamed = reloadedCopy(relaidOut, { Name: 'Pipeline' });
      homeTabs.SetTabs([renamed, OPS_HEALTH]);
      homeTabs.Changed$.next();
      fixture.detectChanges();
      expect(viewerId(fixture)).not.toBe(rebuilt);
      expect(Text(fixture, '.home-tab-title')).toBe('Pipeline');
    });

    it('waits while Home is hidden: a rebuild runs once the tab container has a size again', async () => {
      const sales = reloadedCopy(SALES_PIPELINE);
      const { fixture, engine } = await renderHome({ homeTabs: [sales, OPS_HEALTH] });
      tabContainerSize = { width: 0, height: 0 };
      clickTab(fixture, 'Sales pipeline');
      const before = viewerId(fixture);
      expect(viewer(fixture)?.Shown).toEqual([sales]);

      editInPlace(sales, { UIConfigDetails: NEW_LAYOUT });
      engine.EmitChange('MJ: Dashboards');
      await settle();
      fixture.detectChanges();
      expect(viewerId(fixture)).toBe(before);
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Targets.size).toBe(1);
      expect(observer?.Targets.has(Query(fixture, '.home-tab-dashboard') as Element)).toBe(true);

      observer?.Resize();
      fixture.detectChanges();
      expect(viewerId(fixture)).toBe(before);

      tabContainerSize = { width: 1200, height: 800 };
      observer?.Resize();
      fixture.detectChanges();
      expect(viewerId(fixture)).not.toBeNull();
      expect(viewerId(fixture)).not.toBe(before);
      expect(shownDashboard(fixture)).toBe(sales);
      expect(observer?.Disconnected).toBe(true);
    });

    it('stops watching the tab container when Home is destroyed', async () => {
      const sales = reloadedCopy(SALES_PIPELINE);
      const { fixture, engine } = await renderHome({ homeTabs: [sales, OPS_HEALTH] });
      clickTab(fixture, 'Sales pipeline');
      tabContainerSize = { width: 0, height: 0 };
      editInPlace(sales, { UIConfigDetails: NEW_LAYOUT });
      engine.EmitChange('MJ: Dashboards');
      await settle();
      const observer = FakeResizeObserver.Instances.at(-1);
      expect(observer?.Disconnected).toBe(false);

      fixture.destroy();

      expect(observer?.Disconnected).toBe(true);
    });
  });

  describe('Home tabs: actions', () => {
    it('Remove tab removes the dashboard from the Home tabs, tells the user and goes back to Overview', async () => {
      const { fixture, navigation, homeTabs, notifications } = await renderHome();
      clickTab(fixture, 'Sales pipeline');

      Click(fixture, '.home-tab-remove');
      await settle();
      fixture.detectChanges();

      expect(homeTabs.Remove).toHaveBeenCalledTimes(1);
      expect(homeTabs.Remove).toHaveBeenCalledWith(SALES_PIPELINE.ID);
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Removed "Sales pipeline" from your Home tabs', 'success', 2000);
      expect(tabLabels(fixture)).toEqual(['Overview', 'Ops Health']);
      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(navigation.TabParams()).toEqual({});
      expect(lastContext(navigation)).toMatchObject({ HomeTabNames: ['Ops Health'], ActiveHomeTab: 'Overview' });
    });

    it('Remove tab ignores a second click while the first removal runs, and disables the button', async () => {
      let finishRemove: () => void = () => undefined;
      const { fixture, homeTabs } = await renderHome();
      homeTabs.Remove.mockImplementationOnce(() => new Promise<void>(resolve => (finishRemove = resolve)));
      clickTab(fixture, 'Sales pipeline');

      // The second click lands before the view re-renders, so the button is still enabled.
      Click(fixture, '.home-tab-remove');
      Click(fixture, '.home-tab-remove');
      fixture.detectChanges();
      expect(Query(fixture, '.home-tab-remove')?.hasAttribute('disabled')).toBe(true);
      finishRemove();
      await settle();

      expect(homeTabs.Remove).toHaveBeenCalledTimes(1);
    });

    it('Remove tab tells the user when the tab cannot be removed, and keeps the tab open', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, navigation, homeTabs, notifications } = await renderHome();
      homeTabs.Remove.mockRejectedValueOnce(new Error('The server is unavailable'));
      clickTab(fixture, 'Sales pipeline');

      Click(fixture, '.home-tab-remove');
      await settle();
      fixture.detectChanges();

      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Could not remove the Home tab', 'error', 3000);
      expect(selectedTab(fixture)).toBe('Sales pipeline');
      expect(shownDashboard(fixture)).toBe(SALES_PIPELINE);
      expect(navigation.TabParams()).toEqual({ homeTab: SALES_PIPELINE.ID });
      expect(Query(fixture, '.home-tab-remove')?.hasAttribute('disabled')).toBe(false);
    });

    it('Open in Dashboards opens the dashboard without forcing a new tab', async () => {
      const { fixture, navigation } = await renderHome();
      clickTab(fixture, 'Sales pipeline');

      Click(fixture, '.home-tab-open');

      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(1);
      expect(navigation.OpenDashboard).toHaveBeenCalledWith(SALES_PIPELINE.ID, 'Sales pipeline');
    });

    it('follows links from the dashboard panels: records, dashboards (without forcing a new tab) and queries', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { fixture, navigation } = await renderHome();
      clickTab(fixture, 'Sales pipeline');
      const panels = viewer(fixture)!.NavigationRequested;

      panels.emit({ request: { type: 'OpenEntityRecord', sourcePanelId: 'panel-1', entityName: 'MJ: Users', recordId: 'ID|U-1' }, panel: PANEL });
      panels.emit({ request: { type: 'OpenDashboard', sourcePanelId: 'panel-1', dashboardId: QUOTA.ID.toLowerCase() }, panel: PANEL });
      panels.emit({ request: { type: 'OpenQuery', sourcePanelId: 'panel-1', queryId: 'Q-1' }, panel: PANEL });
      panels.emit({ request: { type: 'OpenApplication', sourcePanelId: 'panel-1', applicationId: 'Data Explorer' }, panel: PANEL });

      expect(navigation.OpenEntityRecord).toHaveBeenCalledTimes(1);
      const [entityName, key] = navigation.OpenEntityRecord.mock.calls[0];
      expect(entityName).toBe('MJ: Users');
      expect(key.ToURLSegment()).toBe('ID|U-1');
      expect(navigation.OpenDashboard).toHaveBeenCalledWith(QUOTA.ID.toLowerCase(), 'Quota');
      expect(navigation.OpenQuery).toHaveBeenCalledWith('Q-1', 'Query');
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('OpenApplication'));
    });

    it('Manage home dashboards and Add open the dialog, and Home reloads its tabs after every result', async () => {
      const { fixture, homeTabs } = await renderHome();

      Click(fixture, '.home-manage-tabs');
      fixture.detectChanges();
      expect(preferencesDialog(fixture)?.Scope).toBe('Global');
      preferencesDialog(fixture)?.Result.emit({ saved: false });
      await settle();
      fixture.detectChanges();
      expect(dialogOpen(fixture)).toBe(false);
      expect(homeTabs.Reload).toHaveBeenCalledTimes(1);

      Click(fixture, 'mj-home-dashboard-tabs .ht-add');
      fixture.detectChanges();
      homeTabs.SetTabs([OPS_HEALTH, SALES_PIPELINE]);
      preferencesDialog(fixture)?.Result.emit({ saved: true, preferences: [] });
      await settle();
      fixture.detectChanges();
      expect(dialogOpen(fixture)).toBe(false);
      expect(homeTabs.Reload).toHaveBeenCalledTimes(2);
      expect(tabLabels(fixture)).toEqual(['Overview', 'Ops Health', 'Sales pipeline']);
    });

    it('goes back to Overview when the dialog removed the open tab, and reports the new tabs', async () => {
      const { fixture, navigation, homeTabs } = await renderHome();
      clickTab(fixture, 'Sales pipeline');
      Click(fixture, '.home-manage-tabs');
      fixture.detectChanges();

      homeTabs.SetTabs([OPS_HEALTH]);
      preferencesDialog(fixture)?.Result.emit({ saved: true, preferences: [] });
      await settle();
      fixture.detectChanges();

      expect(selectedTab(fixture)).toBe('Overview');
      expect(showsOverview(fixture)).toBe(true);
      expect(navigation.TabParams()).toEqual({});
      expect(lastContext(navigation)).toMatchObject({ HomeTabNames: ['Ops Health'], ActiveHomeTab: 'Overview' });
    });

    it('closes the dialog and keeps Home working when the reload fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, homeTabs } = await renderHome();
      homeTabs.Reload.mockRejectedValueOnce(new Error('network down'));

      Click(fixture, '.home-manage-tabs');
      fixture.detectChanges();
      preferencesDialog(fixture)?.Result.emit({ saved: false });
      await settle();
      fixture.detectChanges();

      expect(dialogOpen(fixture)).toBe(false);
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('could not reload the Home tabs'));
      expect(tabLabels(fixture)).toEqual(['Overview', 'Sales pipeline', 'Ops Health']);
    });
  });

  describe('Home tabs: the agent', () => {
    it('reports the Dashboards strip and the Home tabs, and each tab change once', async () => {
      const { fixture, navigation } = await renderHome();
      expect(lastContext(navigation)).toMatchObject({
        DashboardTotal: 5,
        ContinueDashboardName: 'Board Pack',
        FavoriteDashboardNames: ['Board Pack', 'Partner KPIs', 'Revenue', 'Quota'],
        HomeTabNames: ['Sales pipeline', 'Ops Health'],
        ActiveHomeTab: 'Overview',
      });
      const reported = navigation.SetAgentContext.mock.calls.length;

      clickTab(fixture, 'Sales pipeline');

      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported + 1);
      expect(lastContext(navigation)).toMatchObject({ ActiveHomeTab: 'Sales pipeline', ActiveHomeTabDashboardID: SALES_PIPELINE.ID });
    });

    it('reports a tab change from back or forward', async () => {
      const { fixture, navigation } = await renderHome();

      navigation.GoTo({ homeTab: OPS_HEALTH.ID });
      fixture.detectChanges();
      expect(lastContext(navigation)).toMatchObject({ ActiveHomeTab: 'Ops Health', ActiveHomeTabDashboardID: OPS_HEALTH.ID });

      navigation.GoTo({});
      fixture.detectChanges();
      expect(lastContext(navigation)['ActiveHomeTab']).toBe('Overview');
      expect('ActiveHomeTabDashboardID' in lastContext(navigation)).toBe(false);
    });

    it('SwitchHomeTab opens a Home tab by name, id or "Overview", and names the tabs on a miss', async () => {
      const { fixture, navigation } = await renderHome();
      const tool = agentTool(navigation, 'SwitchHomeTab');

      expect(await tool.Handler({ tab: 'ops' })).toEqual({ Success: true, Data: { ActiveHomeTab: 'Ops Health' } });
      fixture.detectChanges();
      expect(shownDashboard(fixture)).toBe(OPS_HEALTH);

      expect(await tool.Handler({ tab: SALES_PIPELINE.ID.toLowerCase() })).toEqual({ Success: true, Data: { ActiveHomeTab: 'Sales pipeline' } });
      expect(await tool.Handler({ tab: 'Overview' })).toEqual({ Success: true, Data: { ActiveHomeTab: 'Overview' } });
      fixture.detectChanges();
      expect(showsOverview(fixture)).toBe(true);
      expect(navigation.TabParams()).toEqual({});

      expect(await tool.Handler({ tab: 'Revenue' })).toEqual({
        Success: false,
        ErrorMessage: 'No Home tab named "Revenue". Available Home tabs: Overview, Sales pipeline, Ops Health.',
      });
      expect(await tool.Handler({})).toEqual({ Success: false, ErrorMessage: 'tab must be a string.' });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Pins and Quick Access
  // ---------------------------------------------------------------------------------------------

  /** Opens the Add Pin panel, waits for it to load, closes it, and returns the apps it listed. */
  async function browseAddPinPanel(fixture: Fixture): Promise<string[]> {
    Click(fixture, '.pinned-actions .pin-action-btn.primary');
    await settle();
    fixture.detectChanges();
    const appNames = texts(fixture, '.slide-panel .panel-app-name');
    Click(fixture, '.slide-panel-close');
    fixture.detectChanges();
    return appNames;
  }

  /** Opens the Quick Access panel: notifications, favorites and recents. */
  function openQuickAccess(fixture: Fixture): void {
    Click(fixture, '.sidebar-fab-toggle');
    fixture.detectChanges();
  }

  describe('Pins', () => {
    it('opens a dashboard pin without forcing a new tab, also after the Add Pin panel finds Data Explorer', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN], apps: [DATA_EXPLORER_APP] });

      Click(fixture, '.pin-card');
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Revenue board');

      expect(await browseAddPinPanel(fixture)).toEqual(['Data Explorer']);
      Click(fixture, '.pin-card');
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Revenue board');
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(2);
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();
    });

    it('opens a dashboard pin that stores only recordId, and warns about one that stores neither id', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const recordIdPin = pinOf(3, 'Ops board', 'Dashboards', { resourceType: 'Dashboards', recordId: OPS_HEALTH.ID });
      const noIdPin = pinOf(4, 'Lost board', 'Dashboards', { resourceType: 'Dashboards' });
      const { fixture, navigation } = await renderHome({ pins: [recordIdPin, noIdPin] });
      const cards = QueryAll(fixture, '.pin-card') as HTMLElement[];
      expect(cards).toHaveLength(2);

      cards[0].click();
      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(OPS_HEALTH.ID, 'Ops board');

      cards[1].click();
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[Pin Click] Dashboards pin missing dashboardId and recordId', noIdPin.Configuration);
    });

    it('opens a query pin as before: in a query tab, then in Data Explorer once the Add Pin panel finds that app', async () => {
      const { fixture, navigation } = await renderHome({ pins: [QUERY_PIN], apps: [DATA_EXPLORER_APP] });

      Click(fixture, '.pin-card');
      expect(navigation.OpenQuery).toHaveBeenCalledTimes(1);
      expect(navigation.OpenQuery).toHaveBeenCalledWith(QUERY_ID, 'Open deals');
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();

      expect(await browseAddPinPanel(fixture)).toEqual(['Data Explorer']);
      Click(fixture, '.pin-card');
      expect(navigation.SwitchToApp).toHaveBeenCalledTimes(1);
      expect(navigation.SwitchToApp).toHaveBeenCalledWith(DATA_EXPLORER_APP.ID, 'Queries', { queryId: QUERY_ID });
      expect(navigation.OpenQuery).toHaveBeenCalledTimes(1);
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    });
  });

  describe('Quick Access', () => {
    it('opens a dashboard favorite without forcing a new tab, with or without the MJ: prefix', async () => {
      const { fixture, navigation } = await renderHome({
        userFavorites: [favoriteOf(1, 'MJ: Dashboards', REVENUE.ID), favoriteOf(2, 'Dashboards', QUOTA.ID)],
      });
      openQuickAccess(fixture);
      const items = QueryAll(fixture, '[data-testid="favorite-item"]') as HTMLElement[];
      expect(items).toHaveLength(2);

      items[0].click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Dashboard');
      items[1].click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(QUOTA.ID, 'Dashboard');
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(2);
      expect(navigation.OpenEntityRecord).not.toHaveBeenCalled();
    });

    it('opens a view favorite as a view, with or without the MJ: prefix', async () => {
      const VIEW_ID = 'V0000000-0000-4000-8000-000000000001';
      const LEGACY_VIEW_ID = 'V0000000-0000-4000-8000-000000000002';
      const { fixture, navigation } = await renderHome({
        userFavorites: [favoriteOf(4, 'MJ: User Views', VIEW_ID), favoriteOf(5, 'User Views', LEGACY_VIEW_ID)],
      });
      openQuickAccess(fixture);
      const items = QueryAll(fixture, '[data-testid="favorite-item"]') as HTMLElement[];
      expect(items).toHaveLength(2);

      items[0].click();
      expect(navigation.OpenView).toHaveBeenLastCalledWith(VIEW_ID, 'View');
      items[1].click();
      expect(navigation.OpenView).toHaveBeenLastCalledWith(LEGACY_VIEW_ID, 'View');
      expect(navigation.OpenView).toHaveBeenCalledTimes(2);
      expect(navigation.OpenEntityRecord).not.toHaveBeenCalled();
    });

    it('opens other favorites as before', async () => {
      const { fixture, navigation } = await renderHome({ userFavorites: [favoriteOf(3, 'MJ: Users', 'ID|U-1')] });
      openQuickAccess(fixture);

      Click(fixture, '[data-testid="favorite-item"]');

      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
      expect(navigation.OpenEntityRecord).toHaveBeenCalledTimes(1);
      const [entityName, key] = navigation.OpenEntityRecord.mock.calls[0];
      expect(entityName).toBe('MJ: Users');
      expect(key.ToURLSegment()).toBe('ID|U-1');
    });

    it('opens a recent dashboard without forcing a new tab', async () => {
      const { fixture, navigation } = await renderHome({ recents: [recentOpen(REVENUE, 'Revenue'), recentOpen(QUOTA)] });
      openQuickAccess(fixture);
      const items = QueryAll(fixture, '[data-testid="recent-item"]') as HTMLElement[];
      expect(items).toHaveLength(2);

      items[0].click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Revenue');
      items[1].click();
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(QUOTA.ID, 'Dashboard');
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pins and Quick Access: the agent', () => {
    it('OpenPin and OpenRecent open a dashboard without forcing a new tab', async () => {
      const { navigation } = await renderHome({ pins: [REVENUE_PIN], recents: [recentOpen(QUOTA, 'Quota')] });

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Revenue board' })).toEqual({ Success: true, Data: { PinName: 'Revenue board' } });
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(REVENUE.ID, 'Revenue board');

      expect(await agentTool(navigation, 'OpenRecent').Handler({ name: 'Quota' })).toEqual({
        Success: true,
        Data: { Name: 'Quota', ResourceType: 'dashboard' },
      });
      expect(navigation.OpenDashboard).toHaveBeenLastCalledWith(QUOTA.ID, 'Quota');
      expect(navigation.OpenDashboard).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Collapsing the Dashboards strip and Pinned
  // ---------------------------------------------------------------------------------------------

  const DASHBOARDS_TOGGLE = 'mj-home-dashboards-strip button.mj-accordion-header';
  const PINNED_TOGGLE = '.pinned-section button.mj-accordion-header';
  const DASHBOARDS_COLLAPSED = 'HomeApp.DashboardsCollapsed';
  const PINNED_COLLAPSED = 'HomeApp.PinnedCollapsed';

  /** The section toggle's aria-expanded value: 'true', 'false', or null when there is no toggle. */
  const ariaExpanded = (fixture: Fixture, toggle: string): string | null => Attr(fixture, toggle, 'aria-expanded');

  /** Clicks a section's toggle, then renders. */
  function toggleSection(fixture: Fixture, toggle: string): void {
    Click(fixture, toggle);
    fixture.detectChanges();
  }

  /** The Pinned header button with that label. */
  function pinnedAction(fixture: Fixture, label: string): HTMLElement {
    const button = QueryAll(fixture, '.pinned-actions button').find(el => el.textContent?.trim() === label);
    if (!button) {
      throw new Error(`pinnedAction(): no Pinned header button "${label}"`);
    }
    return button as HTMLElement;
  }

  describe('Collapsing the Dashboards strip and Pinned', () => {
    it('opens both sections when the user has no saved state, and saves nothing', async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });
      expect(ariaExpanded(fixture, DASHBOARDS_TOGGLE)).toBe('true');
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, 'mj-home-dashboards-strip .strip-grid')).not.toBeNull();
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();
    });

    it("reads each section's saved state when Home loads: 'true' is collapsed and 'false' is open", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [DASHBOARDS_COLLAPSED]: 'true', [PINNED_COLLAPSED]: 'false' } });
      expect(ariaExpanded(fixture, DASHBOARDS_TOGGLE)).toBe('false');
      expect(Query(fixture, 'mj-home-dashboards-strip .strip-grid')).toBeNull();
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
    });

    it('opens a section that has no saved state, next to one that is collapsed', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'true' } });
      expect(ariaExpanded(fixture, DASHBOARDS_TOGGLE)).toBe('true');
      expect(Query(fixture, 'mj-home-dashboards-strip .strip-grid')).not.toBeNull();
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');
      expect(Query(fixture, '.pinned-section .pin-grid')).toBeNull();
    });

    it("saves each section's state when the user toggles it: 'true' when collapsed, 'false' when open", async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });

      toggleSection(fixture, DASHBOARDS_TOGGLE);
      expect(ariaExpanded(fixture, DASHBOARDS_TOGGLE)).toBe('false');
      toggleSection(fixture, DASHBOARDS_TOGGLE);
      expect(ariaExpanded(fixture, DASHBOARDS_TOGGLE)).toBe('true');
      toggleSection(fixture, PINNED_TOGGLE);
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');

      expect(userInfo.SetSettingDebounced.mock.calls).toEqual([
        [DASHBOARDS_COLLAPSED, 'true'],
        [DASHBOARDS_COLLAPSED, 'false'],
        [PINNED_COLLAPSED, 'true'],
      ]);
    });

    it('hides the pin grid when the user collapses Pinned', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      expect(Query(fixture, '.pinned-section .mj-accordion-body-outer:not([inert]) .pin-grid')).not.toBeNull();

      toggleSection(fixture, PINNED_TOGGLE);

      expect(Query(fixture, '.pinned-section .mj-accordion-body-outer[inert] .pin-grid')).not.toBeNull();
    });

    it('keeps Add Pin and Edit in the Pinned header, outside the toggle, and Add Pin works when collapsed', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'true' } });
      expect(texts(fixture, '.pinned-section .mj-accordion-actions button')).toEqual(['Add Pin', 'Edit']);
      expect(Query(fixture, `${PINNED_TOGGLE} button`)).toBeNull();

      pinnedAction(fixture, 'Add Pin').click();
      await settle();
      fixture.detectChanges();

      expect(Query(fixture, '.slide-panel')).not.toBeNull();
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');
    });

    it('opens a collapsed Pinned section, and saves that, when the user enters edit mode', async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'true' } });

      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();

      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, '.pinned-section .edit-mode-banner')).not.toBeNull();
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
      expect(texts(fixture, '.pinned-actions button')).toEqual(['Done']);
      expect(userInfo.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith(PINNED_COLLAPSED, 'false');
    });

    it('saves nothing when the user enters edit mode while Pinned is open', async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });

      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();

      expect(Query(fixture, '.pinned-section .edit-mode-banner')).not.toBeNull();
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();
    });

    it('opens a collapsed Pinned section, and saves that, when the user adds a pin', async () => {
      const { fixture, userInfo } = await renderHome({ settings: { [PINNED_COLLAPSED]: 'true' } });
      pinnedAction(fixture, 'Add Pin').click();
      await settle();
      fixture.detectChanges();

      Click(fixture, '.slide-panel .pin-btn');
      fixture.detectChanges();

      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(userInfo.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith(PINNED_COLLAPSED, 'false');
    });

    it('opens a collapsed Pinned section, and saves that, when the user pins an app page from the Add Pin panel', async () => {
      const { fixture, userInfo } = await renderHome({ apps: [DATA_EXPLORER_APP], settings: { [PINNED_COLLAPSED]: 'true' } });
      pinnedAction(fixture, 'Add Pin').click();
      await settle();
      fixture.detectChanges();

      Click(fixture, '.slide-panel .panel-nav-item .pin-btn');
      fixture.detectChanges();

      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(userInfo.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith(PINNED_COLLAPSED, 'false');
    });

    it('opens a collapsed Pinned section, and saves that, when the user saves an action pin', async () => {
      const { fixture, userInfo } = await renderHome({ settings: { [PINNED_COLLAPSED]: 'true' } });
      const dialog = fixture.debugElement.query(By.directive(ActionPinConfigDialogStub)).componentInstance as ActionPinConfigDialogStub;

      dialog.Result.emit({
        Action: 'save',
        Pin: { DisplayName: 'Send digest', ActionID: 'A-1', ActionName: 'Send Digest', AccentColor: 'teal', FaIcon: 'fa-solid fa-bolt', PresetParams: {}, RuntimeParamNames: [] },
      });
      fixture.detectChanges();

      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(userInfo.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith(PINNED_COLLAPSED, 'false');
    });

    it('opens a collapsed Pinned section, and saves that, when the user chooses Edit in a pin menu', async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });
      Click(fixture, '.pinned-section .pin-card .more-btn');
      fixture.detectChanges();
      // The section collapses while the menu stays open
      fixture.componentInstance.OnPinnedExpandedChange(false);
      fixture.detectChanges();
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');

      Click(fixture, '.pin-context-menu .pin-context-item');
      fixture.detectChanges();

      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, '.pinned-section .edit-mode-banner')).not.toBeNull();
      expect(userInfo.SetSettingDebounced.mock.calls).toEqual([
        [PINNED_COLLAPSED, 'true'],
        [PINNED_COLLAPSED, 'false'],
      ]);
    });

    it('makes the "Pinned" title a level-2 heading', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      expect(Attr(fixture, '.pinned-section [role="heading"]', 'aria-level')).toBe('2');
      expect(Text(fixture, '.pinned-section [role="heading"]')).toBe('Pinned');
      expect(Query(fixture, '.pinned-section [role="heading"] button.mj-accordion-header')).not.toBeNull();
    });

    it('reports both states to the agent, and reports again when the user toggles a section', async () => {
      const { fixture, navigation } = await renderHome({ settings: { [DASHBOARDS_COLLAPSED]: 'true' } });
      expect(lastContext(navigation)).toMatchObject({ DashboardsCollapsed: true, PinnedCollapsed: false });
      const reported = navigation.SetAgentContext.mock.calls.length;

      toggleSection(fixture, PINNED_TOGGLE);

      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported + 1);
      expect(lastContext(navigation)).toMatchObject({ DashboardsCollapsed: true, PinnedCollapsed: true });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The sizes of the Dashboards tiles
  // ---------------------------------------------------------------------------------------------

  describe('the sizes of the Dashboards tiles', () => {
    const TILE_SIZES = 'HomeApp.DashboardTileSizes';

    /** The Dashboards strip component. */
    const strip = (fixture: Fixture): HomeDashboardsStripComponent =>
      fixture.debugElement.query(By.directive(HomeDashboardsStripComponent)).componentInstance as HomeDashboardsStripComponent;

    /** Each strip tile's body height, in order. */
    const bodyHeights = (fixture: Fixture): string[] => stripTiles(fixture).map(tile => (tile.querySelector('.tile-body') as HTMLElement | null)?.style.height ?? '');

    it("reads the user's saved tile sizes when Home loads and gives them to the strip", async () => {
      const { fixture } = await renderHome({ settings: { [TILE_SIZES]: '{"Version":1,"Rows":[{"Height":480,"Widths":{"2":[60,40]}}]}' } });

      expect(strip(fixture).TileSizes).toEqual({ Version: 1, Rows: [{ Height: 480, Widths: { '2': [60, 40] } }] });
      // Before the strip measures its width it shows one tile per row, so row 0 is the first tile.
      expect(bodyHeights(fixture)).toEqual(['480px', '300px', '300px']);
    });

    it('gives the strip the default sizes when the setting is missing or bad', async () => {
      const { fixture } = await renderHome({ settings: { [TILE_SIZES]: '{"Version":2,"Rows":[{"Height":480}]}' } });
      expect(strip(fixture).TileSizes).toEqual({ Version: 1, Rows: [] });
      expect(bodyHeights(fixture)).toEqual(['300px', '300px', '300px']);
    });

    it('saves the sizes for the user when the user resizes a row, and saves nothing before that', async () => {
      const { fixture, userInfo } = await renderHome();
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();

      const handle = Query(fixture, 'mj-home-dashboards-strip .strip-row-handle') as HTMLElement;
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(userInfo.SetSettingDebounced).toHaveBeenCalledExactlyOnceWith(TILE_SIZES, '{"Version":1,"Rows":[{"Height":320}]}');
      expect(strip(fixture).TileSizes).toEqual({ Version: 1, Rows: [{ Height: 320 }] });
      expect(bodyHeights(fixture)[0]).toBe('320px');
    });
  });
});
