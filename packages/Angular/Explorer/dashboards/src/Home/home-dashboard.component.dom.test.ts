import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output, TemplateRef, provideCheckNoChangesConfig } from '@angular/core';
import type { Provider, Type } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
import { DashboardEngine, QueryEngine, ResourceData, UserInfoEngine, UserViewEngine } from '@memberjunction/core-entities';
import type {
  DashboardUserPermissions,
  MJDashboardCategoryEntity,
  MJDashboardEntity,
  MJDashboardPartTypeEntity,
  MJUserApplicationEntity,
  MJUserFavoriteEntity,
  MJUserNotificationEntity,
  UserApplicationAccessStatus,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import type { BaseApplication } from '@memberjunction/ng-base-application';
import { DashboardNameDialogComponent, DashboardPartDialogComponent } from '@memberjunction/ng-dashboard-viewer';
import type { DashboardConfigChangedEvent, DashboardNavRequestEvent, DashboardPanel, PanelInteractionEvent } from '@memberjunction/ng-dashboard-viewer';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { DashboardFavoritesService, HomeAppPinService, NavigationService, RecentAccessService } from '@memberjunction/ng-shared';
import type { DashboardNavigationOptions, HomeAppPinInput, HomeAppPinnedItem, RecentAccessItem } from '@memberjunction/ng-shared';
import {
  MJAccordionModule,
  MJButtonDirective,
  MJClickableDirective,
  MJConfirmService,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJPageSearchComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import type { MJConfirmOptions } from '@memberjunction/ng-ui-components';
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
  TypeInto,
} from '@memberjunction/ng-test-utils';
import { DashboardEditorComponent } from '../DashboardEditor/dashboard-editor.component';
import { DashboardViewerFactory } from '../DashboardEditor/dashboard-viewer-factory';
import { AutoInstallDashboardsApp } from '../shared/dashboards-app.helpers';
import { DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS } from '../shared/dashboards-app-install';
import type { ActionPinConfigResult } from './action-pin-config-dialog.component';
import type { ActionPinRunResult } from './action-pin-runner-dialog.component';
import { HomeDashboardComponent } from './home-dashboard.component';
import { HomeDashboardSwitcherComponent } from './home-dashboard-switcher.component';

vi.mock('../shared/dashboards-app.helpers', async importOriginal => ({
  ...(await importOriginal<typeof import('../shared/dashboards-app.helpers')>()),
  AutoInstallDashboardsApp: vi.fn(),
}));

/**
 * DOM coverage for Home (<mj-home-dashboard>): the Overview sections, the automatic Dashboards app
 * install, the Pinned header, pin cards and the pin menu, pins, Quick Access, the agent, collapsing
 * Pinned, the Dashboards switcher, the dashboard view, New dashboard, and dashboard pin names and
 * renames.
 * Overview: one column with the greeting (the user's first name), then Pinned, then My applications
 * (app cards with an icon tile, a name and a description), with no Home tabs, Dashboards strip or
 * Manage home dashboards button; the dashboard cache, read once in the first load; and a `homeTab`
 * param and the HomeApp.DashboardsCollapsed and HomeApp.DashboardTileSizes settings, which Home
 * neither reads nor writes. The install: how it fits in Home's first load. The Pinned header, pin
 * cards and the pin menu: the header's mjButtons, one card for grouped and ungrouped pins (a
 * dashboard pin shows its dashboard's name), the keys that open a pin, and the menu under its
 * button. Pins and Quick Access: a pinned Config dashboard opens inside Home; a Code dashboard pin,
 * a dashboard favorite or recent opens the dashboard without forcing a new tab (it replaces the
 * preview tab); a query pin opens as it always has; and so do the OpenPin and OpenRecent tools. The
 * agent: the context Home reports (the Home view, the open dashboard and the pinned dashboards
 * included), the tools it registers, SwitchHomeDashboard and the question before it leaves unsaved
 * changes, the overview-only tools while a dashboard shows, and tool changes that show at the next
 * render. Collapsing Pinned: the saved state, the toggle, and the actions that open a collapsed
 * Pinned section. The Dashboards switcher and the dashboard view: the switcher in the Pinned header
 * and in the dashboard title, the view's heading, the `?dashboard` param (left alone when the editor
 * cannot show a dashboard that back or forward named), the question before leaving unsaved changes, Open in
 * Dashboards, part links, and where focus goes after a pick, a pin open or an agent's switch. New
 * dashboard: the name dialog, then the new dashboard pinned and shown in Home in edit mode.
 * Dashboard pin names and renames: a dashboard pin shows its dashboard's name, and renaming it
 * renames the dashboard when the user can edit it and no save of it runs; other pins rename only the
 * pin; where focus goes while a pin is renamed; and Unpin without a question. The button, clickable and
 * page search components, the switcher, the accordion and the New dashboard name dialog are real.
 * The dashboard cache (DashboardEngine), the record logs, favorites and settings (UserInfoEngine),
 * the engines the Add Pin panel reads, pins, recents, navigation, the app list, the Dashboards app
 * install helper, notifications, the confirm service, the dashboard editor and the other dialogs are
 * doubles. One test renders the real dashboard editor, with a viewer double, inside Home.
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
 * Inert shared dashboard editor: like the real editor, it renders its title template in view mode only, and it drops
 * an edit begun with StartEditing when it gets another DashboardId, saying so with EditingChange(false) while the
 * host renders. `Unsaved` stands for unsaved changes.
 */
@Component({
  standalone: true,
  selector: 'mj-dashboard-editor',
  imports: [NgTemplateOutlet],
  template: `@if (TitleTemplate && Dashboard && !Editing) { <ng-container [ngTemplateOutlet]="TitleTemplate" [ngTemplateOutletContext]="{ $implicit: Dashboard, Dashboard: Dashboard }"></ng-container> }`,
})
class DashboardEditorStub {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() set DashboardId(id: string | null) {
    if (this.Editing && !UUIDsEqual(id, this.Id)) {
      this.Editing = false;
      this.EditingChange.emit(false);
    }
    this.Id = id;
    this.Dashboard = id ? (DashboardEngine.Instance.Dashboards.find(d => UUIDsEqual(d.ID, id)) ?? null) : null;
  }
  @Input() StartInEditMode = false;
  @Output() StartInEditModeChange = new EventEmitter<boolean>();
  @Input() TitleTemplate: TemplateRef<{ $implicit: MJDashboardEntity; Dashboard: MJDashboardEntity }> | null = null;
  @Input() ShowOpenInDashboards = false;
  @Input() BodyStyle: 'fill' | 'card' = 'fill';
  @Output() Loaded = new EventEmitter<MJDashboardEntity>();
  @Output() EditingChange = new EventEmitter<boolean>();
  @Output() Saved = new EventEmitter<MJDashboardEntity>();
  @Output() NameChanged = new EventEmitter<string>();
  @Output() LoadFailed = new EventEmitter<{ DashboardId: string; Message: string }>();
  @Output() OpenInDashboardsRequested = new EventEmitter<MJDashboardEntity>();
  @Output() NavigationRequested = new EventEmitter<DashboardNavRequestEvent>();
  public Id: string | null = null;
  public Dashboard: MJDashboardEntity | null = null;
  public Unsaved = false;
  /** True between StartEditing and CancelEdit or another DashboardId. */
  public Editing = false;
  public get HasUnsavedChanges(): boolean {
    return this.Unsaved;
  }
  public readonly CancelEdit = vi.fn(() => {
    this.Unsaved = false;
    this.Editing = false;
  });

  /** Enters edit mode as the real editor does: EditingChange(true). */
  public StartEditing(): void {
    this.Editing = true;
    this.EditingChange.emit(true);
  }
}

/** An MJConfirmService double that answers `answer`. */
function fakeConfirm(answer = true) {
  return { Confirm: vi.fn(async (_options: MJConfirmOptions | string) => answer) };
}

/** A client tool Home registers with SetAgentClientTools. */
interface AgentTool {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

const TAB_ID = 'home-tab';
const USER_ID = 'test-user-id';
const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';
/** The MaxLength the fake metadata gives the Name field of MJ: Dashboards. */
const DASHBOARD_NAME_METADATA_MAX_LENGTH = 100;

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
const CUSTOM_CODE = dashboard(5, 'Custom Code', USER_ID, 'Code');
const OPS_HEALTH = dashboard(6, 'Ops Health', USER_ID);

/** A copy of the dashboard, as a cache reload returns it. */
const reloadedCopy = (d: MJDashboardEntity, changes: Record<string, unknown> = {}): MJDashboardEntity =>
  ({ ...(d as unknown as Record<string, unknown>), ...changes }) as unknown as MJDashboardEntity;

/** A Config dashboard the user owns that a test can rename: Save resolves `saved`. */
const editableDashboard = (Name: string, saved = true) =>
  Object.assign(dashboard(0, Name, USER_ID), { Save: vi.fn(async () => saved), LatestResult: { CompleteMessage: 'Name is required' } });

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
/** A dashboard pin in the shape the dashboard tab's Add to menu stores. */
const QUOTA_PIN = pinOf(5, 'Quota', 'Dashboards', { resourceType: 'Dashboards', dashboardId: QUOTA.ID, recordId: QUOTA.ID });
const QUERY_ID = 'Q0000000-0000-4000-8000-000000000001';
const QUERY_PIN = pinOf(2, 'Open deals', 'Queries', { queryId: QUERY_ID });

/** The same pin, in the "Leadership" group. */
const inLeadership =(pin: HomeAppPinnedItem): HomeAppPinnedItem => ({ ...pin, Group: 'Leadership' });

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
}

/** Three Config dashboards and a Code dashboard the user owns, none of them opened yet. */
const library = (): HomeLibrary => ({ dashboards: [REVENUE, QUOTA, CUSTOM_CODE, OPS_HEALTH], recentIds: [] });

/**
 * Replaces DashboardEngine.Instance with a cache that reads the library at call time. The user owns every dashboard.
 * `EmitChange` emits what the engine emits after a change.
 */
function stubDashboardEngine(lib: HomeLibrary) {
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider) => undefined),
    GetAccessibleDashboards: vi.fn((_userId: string) => lib.dashboards),
    CanUserEditDashboard: vi.fn((_dashboardId: string, _userId: string) => true),
    GetDashboardPermissions: vi.fn(
      (dashboardId: string, _userId: string): DashboardUserPermissions => ({
        DashboardID: dashboardId,
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: true,
        IsOwner: true,
        PermissionSource: 'owner',
      }),
    ),
    DashboardCategories: [] as MJDashboardCategoryEntity[],
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
    OpenDynamicView: vi.fn((_entityName: string, _extraFilter?: string) => 'dynamic-view-tab'),
    SwitchToApp: vi.fn(async (_appId: string, _navItemName?: string, _queryParams?: Record<string, string | null>) => undefined),
    SetAgentContext: vi.fn((_caller: HomeDashboardComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: HomeDashboardComponent, _tools: AgentTool[]) => undefined),
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

/**
 * A HomeAppPinService double with these pins, grouped by their Group as the service groups them.
 * AddPin accepts every new pin. UpdatePin and RemovePin only record their calls. CaptureThumbnail (the
 * dashboard editor's Save screenshot) takes none.
 */
function fakePins(pins: HomeAppPinnedItem[] = []) {
  return {
    Pins$: new BehaviorSubject<HomeAppPinnedItem[]>(pins),
    LoadPins: vi.fn(async () => undefined),
    AddPin: vi.fn((_input: HomeAppPinInput) => true),
    UpdatePin: vi.fn((_pinId: string, _updates: Partial<HomeAppPinnedItem>) => undefined),
    RemovePin: vi.fn((_pinId: string) => undefined),
    CaptureThumbnail: vi.fn(async (_element: HTMLElement, _timeoutMs?: number): Promise<string | undefined> => undefined),
    GetUngroupedPins: (): HomeAppPinnedItem[] => pins.filter(p => !p.Group),
    GetGroups: (): string[] => [...new Set(pins.flatMap(p => (p.Group ? [p.Group] : [])))],
    GetPinsInGroup: (group: string): HomeAppPinnedItem[] => pins.filter(p => p.Group === group),
    IsPinned: (_resourceType: string, _config: Record<string, unknown>) => false,
  };
}

/**
 * A dashboard viewer double with the members the real dashboard editor uses to show and edit a dashboard. Its layout
 * is ready at once, and `HasUnsavedChanges` stands for a layout change the user has not saved.
 */
function viewerDouble() {
  return {
    Provider: null as IMetadataProvider | null,
    Dashboard: null as MJDashboardEntity | null,
    IsEditing: false,
    CanEdit: false,
    ShowToolbar: true,
    ShowBreadcrumb: true,
    ShowOpenInTabButton: false,
    ShowEditButton: true,
    Categories: [] as MJDashboardCategoryEntity[],
    NavigationRequested: new EventEmitter<DashboardNavRequestEvent>(),
    DashboardSaved: new EventEmitter<MJDashboardEntity>(),
    error: new EventEmitter<{ message: string; error?: Error }>(),
    configChanged: new EventEmitter<DashboardConfigChangedEvent>(),
    PanelInteraction: new EventEmitter<PanelInteractionEvent>(),
    HasUnsavedChanges: false,
    WaitForLayoutReady: async (): Promise<void> => undefined,
    GetPartTypes: (): MJDashboardPartTypeEntity[] => [],
    HasNewerSavedLayout: (_dashboard?: MJDashboardEntity | null): boolean => false,
    UseSavedCopy: (_dashboard: MJDashboardEntity): boolean => false,
    ReloadFromSaved: vi.fn(async (_dashboard?: MJDashboardEntity | null): Promise<void> => undefined),
  };
}

type ViewerDouble = ReturnType<typeof viewerDouble>;

/** The parts of the testing module that render one kind of dashboard editor in Home. */
interface EditorModuleParts {
  imports: Type<unknown>[];
  declarations: Type<unknown>[];
  providers: Provider[];
}

/**
 * What the testing module needs to render the real dashboard editor in Home: the editor, its part dialog and badge, a
 * DashboardViewerFactory double that creates a viewer double for each dashboard the editor loads (added to `viewers`),
 * and a favorites double with no favorites.
 */
function realEditorModule(viewers: ViewerDouble[]): EditorModuleParts {
  const create = (_host: unknown) => {
    const viewer = viewerDouble();
    viewers.push(viewer);
    return { instance: viewer, location: { nativeElement: document.createElement('div') }, destroy: vi.fn() };
  };
  const favorites = { IsFavorite: (_dashboardId: string): boolean => false, Toggle: vi.fn(async (_dashboardId: string) => true), Changed$: new Subject<void>() };
  return {
    imports: [MJStatBadgeComponent, MJDialogComponent, MJDialogActionsComponent],
    declarations: [DashboardEditorComponent, DashboardPartDialogComponent],
    providers: [
      { provide: DashboardViewerFactory, useValue: { Create: create } },
      { provide: DashboardFavoritesService, useValue: favorites },
    ],
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

/** Presses a key on an element: a keydown that bubbles and can be cancelled. Returns the event. */
function pressKey(element: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** Presses Enter on a button as a browser does: a keydown, then a click unless the keydown was cancelled. */
function pressEnter(button: HTMLElement): void {
  if (!pressKey(button, 'Enter').defaultPrevented) {
    button.click();
  }
}

/** The mjButton classes of a button (base, variant and size), sorted. */
const buttonLook = (button: Element): string[] => Array.from(button.classList).filter(name => name.startsWith('mj-btn')).sort();

/**
 * Gives elements a laid-out height, as a browser does for the pin menu: `full`, cut to the element's max-height
 * style when it has one.
 */
function fakeLaidOutHeight(full: number): void {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement): number {
    const max = Number.parseFloat(this.style.maxHeight);
    return Number.isNaN(max) ? full : Math.min(full, max);
  });
}

describe('HomeDashboardComponent (DOM)', () => {
  const installProvider = UseFakeGlobalProvider();

  beforeEach(() => {
    vi.mocked(AutoInstallDashboardsApp).mockReset();
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
    /** The signed-in user's fields, over the fake provider's default user. */
    currentUser?: Partial<UserInfo>;
    /** What the confirm service answers. Defaults to a service that confirms. */
    confirm?: ReturnType<typeof fakeConfirm>;
    /** Renders the real dashboard editor, with a viewer double for each dashboard it loads, in place of the editor double. */
    realEditor?: boolean;
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
    queryParams = {},
    workspaceParams = queryParams,
    apps = [],
    pins = [],
    userFavorites = [],
    recents = [],
    settings = {},
    currentUser = {},
    confirm = fakeConfirm(),
    realEditor = false,
  }: HomeOptions = {}) {
    const provider = installProvider({
      currentUser,
      entityByName: name =>
        name === 'MJ: Dashboards'
          ? ({
              ID: DASHBOARDS_ENTITY_ID,
              Name: name,
              FieldByName: (field: string) => (field === 'Name' ? { MaxLength: DASHBOARD_NAME_METADATA_MAX_LENGTH } : undefined),
            } as unknown as EntityInfo)
          : undefined,
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
    const recentAccess = fakeRecentAccess(recents);
    const appManager = fakeAppManager(apps);
    const pinService = fakePins(pins);
    await arrangeAutoInstall(autoInstall);
    const viewers: ViewerDouble[] = [];
    const editorParts: EditorModuleParts = realEditor ? realEditorModule(viewers) : { imports: [DashboardEditorStub], declarations: [], providers: [] };
    const fixture = RenderComponentFixture(HomeDashboardComponent, {
      imports: [
        CommonModule,
        FormsModule,
        MJAccordionModule,
        MJButtonDirective,
        MJClickableDirective,
        MJPageSearchComponent,
        StubLoadingComponent,
        StubEmptyStateComponent,
        ActionPinConfigDialogStub,
        ActionPinRunnerDialogStub,
        UserAppConfigStub,
        ...editorParts.imports,
        DashboardNameDialogComponent,
      ],
      declarations: [HomeDashboardComponent, HomeDashboardSwitcherComponent, ...editorParts.declarations],
      providers: [
        { provide: ApplicationManager, useValue: appManager },
        { provide: RecentAccessService, useValue: recentAccess },
        { provide: HomeAppPinService, useValue: pinService },
        { provide: NavigationService, useValue: navigation },
        { provide: MJConfirmService, useValue: confirm },
        ...editorParts.providers,
      ],
      setup: instance => {
        instance.Data = new ResourceData({
          Configuration: { tabId: TAB_ID, resourceType: 'Custom', driverClass: 'HomeDashboard', navItemName: 'Home', queryParams },
        });
      },
    });
    await settle();
    fixture.detectChanges();
    return { fixture, provider, engine, userInfo, notifications, navigation, recentAccess, appManager, pins: pinService, confirm, viewers };
  }

  type Navigation = ReturnType<typeof fakeNavigation>;

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

  describe('the Home overview', () => {
    it('shows the greeting, then Pinned, then My applications in one overview column, and no Home tabs, Dashboards strip, Manage home dashboards button or dashboard', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      expect(Query(fixture, '.main-content > .home-overview > .home-header + .pinned-section + .apps-section')).not.toBeNull();
      expect(Query(fixture, '.home-header button')).toBeNull();
      for (const selector of ['mj-home-dashboard-tabs', 'mj-home-dashboards-strip', '.home-tab-dashboard', 'mj-dashboard-viewer', 'mj-dashboard-preferences-dialog', 'mj-dashboard-editor']) {
        expect(Query(fixture, selector)).toBeNull();
      }
    });

    it('greets the user by first name', async () => {
      const { fixture } = await renderHome({ currentUser: { FirstName: 'Ana' } });
      expect(Text(fixture, '.home-overview .home-header h1')).toBe(`${fixture.componentInstance.Greeting}, Ana`);
    });

    it('greets the user by display name when the user has no first name', async () => {
      const { fixture } = await renderHome();
      expect(Text(fixture, '.home-overview .home-header h1')).toBe(`${fixture.componentInstance.Greeting}, Test User`);
    });

    it('shows each app as a card with an icon tile, its name and description, and no nav items or arrow', async () => {
      const crmApp = {
        ID: 'A0000000-0000-4000-8000-000000000003',
        Name: 'CRM',
        Description: 'Accounts, contacts and deals',
        Icon: 'fa-solid fa-handshake',
        GetColor: () => '#0f766e',
        GetNavItems: async () => [
          { Label: 'Accounts', Icon: 'fa-solid fa-building' },
          { Label: 'Contacts', Icon: 'fa-solid fa-address-book' },
          { Label: 'Deals', Icon: 'fa-solid fa-handshake' },
          { Label: 'Reports', Icon: 'fa-solid fa-chart-bar' },
        ],
      } as unknown as BaseApplication;
      const { fixture, navigation } = await renderHome({ apps: [DATA_EXPLORER_APP, crmApp] });

      expect(Text(fixture, '.apps-section .section-title')).toBe('My applications');
      expect(Query(fixture, '.apps-section .section-title i')).toBeNull();
      expect(texts(fixture, '.apps-section .app-card .app-name')).toEqual(['Data Explorer', 'CRM']);
      expect(texts(fixture, '.apps-section .app-card .app-description')).toEqual(['Accounts, contacts and deals']);
      expect(QueryAll(fixture, '.apps-section .app-card .app-icon i').map(icon => Array.from(icon.classList).sort())).toEqual([
        ['fa-database', 'fa-solid'],
        ['fa-handshake', 'fa-solid'],
      ]);
      // The app color tints the icon tile; an app without a color takes the brand color
      const cards = QueryAll(fixture, '.apps-section .app-card') as HTMLElement[];
      expect(cards.map(card => card.style.getPropertyValue('--app-color'))).toEqual(['var(--mj-brand-primary)', '#0f766e']);
      expect(cards.map(card => card.getAttribute('role'))).toEqual(['button', 'button']);
      expect(cards.map(card => card.getAttribute('data-testid'))).toEqual(['app-tile-Data Explorer', 'app-tile-CRM']);
      for (const selector of ['.nav-preview', '.app-nav-preview', '.nav-item-chip', '.more-items', '.app-arrow']) {
        expect(Query(fixture, selector)).toBeNull();
      }

      cards[1].click();
      expect(navigation.SwitchToApp).toHaveBeenCalledExactlyOnceWith(crmApp.ID);
    });

    it("reads the dashboard cache once for the current user through Home's provider", async () => {
      const { engine, provider } = await renderHome();
      expect(engine.Config).toHaveBeenCalledTimes(1);
      expect(engine.Config).toHaveBeenCalledWith(false, provider.CurrentUser, provider);
    });

    it('keeps the overview and its apps while the app list reloads after the first load, then shows the new list', async () => {
      const { fixture, appManager } = await renderHome({ apps: [DATA_EXPLORER_APP] });

      // An app install elsewhere reloads the user's apps: loading, the new list, done
      appManager.ReloadApps([DATA_EXPLORER_APP, DASHBOARDS_APP]);
      renderFully(fixture);
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(texts(fixture, '.apps-section .app-name')).toEqual(['Data Explorer']);

      await settleAndRender(fixture);
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(texts(fixture, '.apps-section .app-name')).toEqual(['Data Explorer', 'Dashboards']);
    });

    it('still shows Home when the dashboard cache cannot load', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture } = await renderHome({ cacheFails: true });
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(Query(fixture, '.apps-section')).not.toBeNull();
    });

    it('ignores a homeTab param and the retired Dashboards settings, and writes neither', async () => {
      const { fixture, navigation, userInfo } = await renderHome({
        pins: [REVENUE_PIN],
        queryParams: { homeTab: REVENUE.ID },
        settings: { 'HomeApp.DashboardsCollapsed': 'true', 'HomeApp.DashboardTileSizes': '{"Version":1,"Rows":[{"Height":480}]}' },
      });
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
      expect(navigation.TabParams()).toEqual({ homeTab: REVENUE.ID });
      expect(navigation.UpdateTabQueryParams).not.toHaveBeenCalled();
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();
    });
  });

  describe('the agent', () => {
    it('reports the overview and PinnedCollapsed, no Dashboards strip or Home tab fields, and offers SwitchHomeDashboard, not SwitchHomeTab', async () => {
      const { navigation } = await renderHome();
      const context = lastContext(navigation);
      expect(context).toMatchObject({ HomeView: 'Overview', PinnedCollapsed: false });
      for (const key of ['DashboardsCollapsed', 'DashboardTotal', 'ContinueDashboardName', 'FavoriteDashboardNames', 'HomeTabNames', 'ActiveHomeTab', 'ActiveHomeTabDashboardID', 'CurrentDashboardName']) {
        expect(key in context).toBe(false);
      }
      const tools = navigation.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? [];
      expect(tools.map(t => t.Name)).toEqual([
        'OpenApp', 'OpenPin', 'SearchPins', 'OpenRecent', 'SearchAddPinPanel', 'ClearAddPinPanelSearch',
        'OpenAddPinPanel', 'CloseAddPinPanel', 'ToggleSidebar', 'TogglePinEditMode', 'SwitchHomeDashboard',
      ]);
    });
  });

  describe('the automatic Dashboards app install', () => {
    it('runs once, during the first load', async () => {
      const { fixture, appManager, engine } = await renderHome();
      expect(AutoInstallDashboardsApp).toHaveBeenCalledTimes(1);
      expect(AutoInstallDashboardsApp).toHaveBeenCalledWith(appManager);

      appManager.ReloadApps([DASHBOARDS_APP]);
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
      expect(Query(fixture, '.pinned-section')).toBeNull();

      // Installing reloads the user's apps: loading, the list with Dashboards, done.
      appManager.ReloadApps([DASHBOARDS_APP]);
      await settle();
      fixture.detectChanges();
      expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
      expect(Query(fixture, '.pinned-section')).toBeNull();

      finishInstall(true);
      await settle();
      fixture.detectChanges();
      expect(Query(fixture, '.loading-container')).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(texts(fixture, '.app-name')).toEqual(['Dashboards']);
    });

    describe('when the server never answers the install request', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      it('leaves the loading view after the install step limit, shows Home, and saves no marker', async () => {
        vi.useFakeTimers();
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { fixture, appManager, userInfo } = await renderHome({ autoInstall: 'real' });

        expect(appManager.InstallAppForUser).toHaveBeenCalledWith(DASHBOARDS_APP.ID);
        expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
        expect(Query(fixture, '.pinned-section')).toBeNull();

        await vi.advanceTimersByTimeAsync(DASHBOARDS_APP_INSTALL_STEP_TIMEOUT_MS - 1);
        fixture.detectChanges();
        expect(Query(fixture, '.loading-container mj-loading')).not.toBeNull();
        expect(Query(fixture, '.pinned-section')).toBeNull();

        await vi.advanceTimersByTimeAsync(1);
        fixture.detectChanges();
        expect(Query(fixture, '.loading-container')).toBeNull();
        expect(Query(fixture, '.pinned-section')).not.toBeNull();
        expect(userInfo.SetSetting).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Pins and Quick Access
  // ---------------------------------------------------------------------------------------------

  /**
   * The Pinned header's own buttons: Add Pin, the Dashboards switcher's button and Edit, or Done. The open switcher's
   * rows sit in the header too, so the selector takes only the header's direct buttons.
   */
  const PINNED_HEADER_BUTTONS = '.pinned-actions > button, .pinned-actions > mj-home-dashboard-switcher > button';

  /** The Pinned header button with that label. */
  function pinnedAction(fixture: Fixture, label: string): HTMLElement {
    const button = QueryAll(fixture, PINNED_HEADER_BUTTONS).find(el => el.textContent?.trim() === label);
    if (!button) {
      throw new Error(`pinnedAction(): no Pinned header button "${label}"`);
    }
    return button as HTMLElement;
  }

  /** The dashboard editor Home shows, or null on the overview. */
  function editor(fixture: Fixture): DashboardEditorStub | null {
    const element = fixture.debugElement.query(By.directive(DashboardEditorStub));
    return element ? (element.componentInstance as DashboardEditorStub) : null;
  }

  /** The dashboard editor Home shows. Throws on the overview. */
  function shownEditor(fixture: Fixture): DashboardEditorStub {
    const shown = editor(fixture);
    if (!shown) {
      throw new Error('shownEditor(): Home shows no dashboard');
    }
    return shown;
  }

  /** Lets Home's async work finish, then renders. */
  async function settleAndRender(fixture: Fixture): Promise<void> {
    await settle();
    fixture.detectChanges();
  }

  /** Renders all of Home's template. Home is OnPush, so a plain render skips it when nothing marked it for check. */
  function renderFully(fixture: Fixture): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  /** Opens the Add Pin panel, waits for it to load, closes it, and returns the apps it listed. */
  async function browseAddPinPanel(fixture: Fixture): Promise<string[]> {
    pinnedAction(fixture, 'Add Pin').click();
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
    it('opens a dashboard pin inside Home, also after the Add Pin panel finds Data Explorer', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN], apps: [DATA_EXPLORER_APP] });
      expect(await browseAddPinPanel(fixture)).toEqual(['Data Explorer']);

      Click(fixture, '.pin-card');
      await settleAndRender(fixture);

      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();
    });

    it('opens a dashboard pin that stores only recordId inside Home, and warns about one that stores neither id', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const recordIdPin = pinOf(3, 'Ops board', 'Dashboards', { resourceType: 'Dashboards', recordId: OPS_HEALTH.ID });
      const noIdPin = pinOf(4, 'Lost board', 'Dashboards', { resourceType: 'Dashboards' });
      const { fixture, navigation } = await renderHome({ pins: [recordIdPin, noIdPin] });
      const cards = QueryAll(fixture, '.pin-card') as HTMLElement[];
      expect(cards).toHaveLength(2);

      cards[1].click();
      await settleAndRender(fixture);
      expect(warn).toHaveBeenCalledWith('[Pin Click] Dashboards pin missing dashboardId and recordId', noIdPin.Configuration);
      expect(editor(fixture)).toBeNull();

      cards[0].click();
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(OPS_HEALTH.ID);
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    });

    it('opens nothing on a pin click while the pins are in edit mode', async () => {
      const { fixture, navigation, recentAccess } = await renderHome({ pins: [REVENUE_PIN, QUERY_PIN] });
      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();

      for (const card of QueryAll(fixture, '.pin-card') as HTMLElement[]) {
        card.click();
      }
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(recentAccess.LogAccess).not.toHaveBeenCalled();
      expect(navigation.OpenQuery).not.toHaveBeenCalled();
    });

    it('opens a dashboard pin once on a double click: one URL write and one recorded open', async () => {
      const { fixture, navigation, recentAccess } = await renderHome({ pins: [REVENUE_PIN] });
      const card = Query(fixture, '.pin-card') as HTMLElement;

      card.click();
      card.click();
      await settleAndRender(fixture);

      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(navigation.UpdateTabQueryParams).toHaveBeenCalledTimes(1);
      expect(recentAccess.LogAccess).toHaveBeenCalledTimes(1);
    });

    it('opens a legacy dashboard pin, stored under an unknown resource type, inside Home under its dashboard name', async () => {
      const legacyPin = pinOf(9, 'Old quota board', 'B7C1C3F0-0000-4000-8000-000000000001', { dashboardId: QUOTA.ID });
      const { fixture } = await renderHome({ pins: [legacyPin] });
      expect(Text(fixture, '.pin-card .pin-name-text')).toBe('Quota');

      Click(fixture, '.pin-card');
      await settleAndRender(fixture);

      expect(editor(fixture)?.Id).toBe(QUOTA.ID);
    });

    it('keeps opening a Code dashboard pin in a tab, under its live name', async () => {
      const codePin = pinOf(6, 'Old code name', 'Dashboards', { dashboardId: CUSTOM_CODE.ID });
      const { fixture, navigation } = await renderHome({ pins: [codePin] });

      Click(fixture, '.pin-card');
      await settleAndRender(fixture);

      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(CUSTOM_CODE.ID, 'Custom Code');
      expect(editor(fixture)).toBeNull();
    });

    it('fills in the icon of a legacy app page pin from its app', async () => {
      const legacyAppPage = pinOf(9, 'Queries page', 'legacy-app-page', { appName: 'Data Explorer', navItemName: 'Queries' });
      const { pins } = await renderHome({ pins: [legacyAppPage], apps: [DATA_EXPLORER_APP] });
      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(legacyAppPage.Id, { Icon: 'fa-solid fa-database' });
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
    it('OpenPin opens a dashboard pin inside Home by the name it shows, and OpenRecent opens a dashboard without forcing a new tab', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUERY_PIN], recents: [recentOpen(QUOTA, 'Quota')] });

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'revenue' })).toEqual({ Success: true, Data: { PinName: 'Revenue' } });
      fixture.detectChanges();
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();

      expect(await agentTool(navigation, 'OpenRecent').Handler({ name: 'Quota' })).toEqual({
        Success: true,
        Data: { Name: 'Quota', ResourceType: 'dashboard' },
      });
      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(QUOTA.ID, 'Quota');
    });

    it('OpenPin reports a pin that did not open, and opens other pins as before', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const lostAppPage = pinOf(9, 'Lost page', 'Custom', { resourceType: 'Custom', appName: 'Retired App', navItemName: 'Inbox' });
      const viewWithoutId = pinOf(7, 'Broken view', 'User Views', { resourceType: 'User Views' });
      const dynamicViewWithoutEntity = pinOf(8, 'Broken dynamic view', 'User Views', { resourceType: 'User Views', isDynamic: true });
      const { navigation } = await renderHome({ pins: [lostAppPage, viewWithoutId, dynamicViewWithoutEntity, QUERY_PIN] });

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Lost page' })).toEqual({
        Success: false,
        ErrorMessage: '"Lost page" did not open. The pin may be broken, or the user kept editing the open dashboard.',
      });
      expect(warn).toHaveBeenCalledWith('[Pin Click] Custom pin: app "Retired App" not found', lostAppPage.Configuration);
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Broken view' })).toEqual({
        Success: false,
        ErrorMessage: '"Broken view" did not open. The pin may be broken, or the user kept editing the open dashboard.',
      });
      expect(navigation.OpenView).not.toHaveBeenCalled();

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Broken dynamic view' })).toEqual({
        Success: false,
        ErrorMessage: '"Broken dynamic view" did not open. The pin may be broken, or the user kept editing the open dashboard.',
      });
      expect(warn).toHaveBeenCalledWith('[Pin Click] Dynamic view pin missing Entity', dynamicViewWithoutEntity.Configuration);
      expect(navigation.OpenDynamicView).not.toHaveBeenCalled();

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Open deals' })).toEqual({ Success: true, Data: { PinName: 'Open deals' } });
      expect(navigation.OpenQuery).toHaveBeenCalledExactlyOnceWith(QUERY_ID, 'Open deals');
    });

    it('SearchPins and the context name each pin as it shows: a dashboard pin by its dashboard', async () => {
      const { navigation } = await renderHome({ pins: [REVENUE_PIN, QUERY_PIN] });

      expect(await agentTool(navigation, 'SearchPins').Handler({ query: 'revenue' })).toEqual({ Success: true, Data: { Matches: ['Revenue'], MatchCount: 1 } });
      expect(await agentTool(navigation, 'SearchPins').Handler({ query: 'board' })).toEqual({ Success: true, Data: { Matches: [], MatchCount: 0 } });
      expect(lastContext(navigation)).toMatchObject({ PinnedItems: ['Revenue', 'Open deals'] });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The Pinned header, pin cards and the pin menu
  // ---------------------------------------------------------------------------------------------

  const OPS_PIN = inLeadership(pinOf(8, 'Ops board', 'Dashboards', { dashboardId: OPS_HEALTH.ID }));

  describe('the Pinned header', () => {
    it('shows Add Pin, Dashboards and Edit as small mjButtons, in that order, and Done when the user edits', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      expect(texts(fixture, PINNED_HEADER_BUTTONS)).toEqual(['Add Pin', 'Dashboards', 'Edit']);
      expect(QueryAll(fixture, PINNED_HEADER_BUTTONS).map(buttonLook)).toEqual([
        ['mj-btn', 'mj-btn--primary', 'mj-btn--sm'],
        ['mj-btn', 'mj-btn--secondary', 'mj-btn--sm'],
        ['mj-btn', 'mj-btn--secondary', 'mj-btn--sm'],
      ]);

      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();

      expect(texts(fixture, PINNED_HEADER_BUTTONS)).toEqual(['Done']);
      expect(QueryAll(fixture, PINNED_HEADER_BUTTONS).map(buttonLook)).toEqual([['mj-btn', 'mj-btn--sm', 'mj-btn--success']]);
    });
  });

  describe('Pin cards', () => {
    const INBOX_PIN = inLeadership({
      ...pinOf(7, 'Inbox', 'Custom', { resourceType: 'Custom', appName: 'CRM', navItemName: 'Inbox' }),
      ApplicationName: 'CRM',
      Icon: 'fa-solid fa-inbox',
      Color: '#0f766e',
    });
    const DIGEST_PIN = pinOf(6, 'Send digest', 'Actions', { actionId: 'A-1', accentColor: '#0f766e' });

    it('shows grouped pins under their group with the same card as ungrouped pins', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, DIGEST_PIN, INBOX_PIN, OPS_PIN] });

      expect(texts(fixture, '.pin-grid > .group-header .group-name')).toEqual(['Leadership']);
      expect(texts(fixture, '.pin-grid > .group-header .group-count')).toEqual(['2 pins']);
      // A dashboard pin shows its dashboard's name; other pins show their own
      expect(texts(fixture, '.pin-grid > .group-header ~ .pin-card .pin-name-text')).toEqual(['Inbox', 'Ops Health']);
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Revenue', 'Send digest', 'Inbox', 'Ops Health']);
      // The kind line: an icon for dashboards only, and no app badge
      expect(texts(fixture, '.pin-card .pin-kind')).toEqual(['Dashboard', 'Quick Action', 'CRM', 'Dashboard']);
      expect(QueryAll(fixture, '.pin-card .pin-meta i').map(icon => icon.className)).toEqual(['fa-solid fa-gauge-high', 'fa-solid fa-gauge-high']);
      expect(Query(fixture, '.pin-app-badge')).toBeNull();
      expect(QueryAll(fixture, '.pin-card .more-btn[aria-haspopup="menu"]')).toHaveLength(4);
      // Every pin but the action pin shows the brand icon tile, without its own color
      const tiles = QueryAll(fixture, '.pin-card .pin-thumbnail.icon-mode') as HTMLElement[];
      expect(tiles.map(tile => tile.style.getPropertyValue('--pin-icon-color'))).toEqual(['', '', '']);
      expect(QueryAll(fixture, '.pin-card .pin-thumbnail.action-mode')).toHaveLength(1);
      expect(texts(fixture, '.pin-card .pin-overlay button')).toEqual(['Open', 'Run', 'Open', 'Open']);
      expect(QueryAll(fixture, '.pin-card .pin-overlay button').map(buttonLook)).toEqual(Array(4).fill(['mj-btn', 'mj-btn--secondary', 'mj-btn--sm']));
    });

    it("names each card's Open, Run and Pin options buttons after the pin", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, DIGEST_PIN, OPS_PIN] });
      expect(QueryAll(fixture, '.pin-card .pin-overlay button').map(button => button.getAttribute('aria-label'))).toEqual([
        'Open Revenue',
        'Run Send digest',
        'Open Ops Health',
      ]);
      expect(QueryAll(fixture, '.pin-card .more-btn').map(button => button.getAttribute('aria-label'))).toEqual([
        'Pin options for Revenue',
        'Pin options for Send digest',
        'Pin options for Ops Health',
      ]);
    });

    it('runs an action pin with Enter on Run, and opens a dashboard pin inside Home with Enter on its Open button, once', async () => {
      const { fixture, navigation, recentAccess } = await renderHome({ pins: [REVENUE_PIN, DIGEST_PIN] });
      const [open, run] = QueryAll(fixture, '.pin-card .pin-overlay button') as HTMLElement[];
      expect([open.textContent?.trim(), run.textContent?.trim()]).toEqual(['Open', 'Run']);

      pressEnter(run);
      fixture.detectChanges();
      const runner = fixture.debugElement.query(By.directive(ActionPinRunnerDialogStub)).componentInstance as ActionPinRunnerDialogStub;
      expect(runner.Visible).toBe(true);
      expect(runner.Pin).toBe(DIGEST_PIN);
      expect(editor(fixture)).toBeNull();

      pressEnter(open);
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(recentAccess.LogAccess).toHaveBeenCalledExactlyOnceWith('MJ: Dashboards', REVENUE.ID, 'dashboard');
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    });

    it('gives the card no role and no tab stop: its Open and Pin options buttons are the keyboard path', async () => {
      const { fixture, recentAccess } = await renderHome({ pins: [REVENUE_PIN] });
      const card = Query(fixture, '.pin-card') as HTMLElement;
      expect([card.getAttribute('role'), card.getAttribute('tabindex'), card.getAttribute('aria-label')]).toEqual([null, null, null]);
      expect(card.tabIndex).toBe(-1);

      pressKey(card, 'Enter');
      pressKey(card, ' ');
      await settleAndRender(fixture);
      expect(editor(fixture)).toBeNull();

      // A click anywhere on the card still opens the pin
      card.click();
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(recentAccess.LogAccess).toHaveBeenCalledTimes(1);
    });

    it('keeps the keys typed in the rename box: Enter saves the name without opening the pin, and Space is typed', async () => {
      const board = editableDashboard('Board review');
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, navigation, pins } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });
      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();
      expect(Attr(fixture, '.pin-card', 'role')).toBeNull();
      expect(Attr(fixture, '.pin-card', 'tabindex')).toBeNull();

      Click(fixture, '.pin-card .pin-name');
      fixture.detectChanges();
      const input = Query(fixture, '.pin-card .pin-name-input') as HTMLInputElement;
      expect(input.value).toBe('Board review');
      expect(pressKey(input, ' ').defaultPrevented).toBe(false);
      input.value = 'Board review FY27';
      pressKey(input, 'Enter');
      await settleAndRender(fixture);

      expect(board.Save).toHaveBeenCalledTimes(1);
      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(boardPin.Id, { DisplayName: 'Board review FY27' });
      expect(Query(fixture, '.pin-card .pin-name-input')).toBeNull();
      expect(editor(fixture)).toBeNull();
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    });
  });

  describe('the pin menu', () => {
    it('opens the pin menu from a grouped pin too, right-aligned to its button and inside the viewport', async () => {
      const grouped = { ...pinOf(8, 'Ops board', 'Dashboards', { dashboardId: OPS_HEALTH.ID }), Group: 'Leadership' };
      const { fixture } = await renderHome({ pins: [grouped] });
      const button = Query(fixture, '.pin-card .more-btn') as HTMLElement;
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 900, right: 924, top: 300, bottom: 324, width: 24, height: 24, x: 900, y: 300, toJSON: () => ({}) } as DOMRect);
      button.click();
      fixture.detectChanges();
      const menu = Query(fixture, '.pin-context-menu') as HTMLElement;
      expect(menu.style.left).toBe('704px');
      expect(menu.style.top).toBe('328px');
    });

    it('limits the pin menu to the room below its button: viewport height − 8 − top (button 300..324, full height 500: 768 − 8 − 328 = 432px)', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      const button = Query(fixture, '.pin-card .more-btn') as HTMLElement;
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 300, 24, 24));
      fakeLaidOutHeight(500);
      button.click();
      fixture.detectChanges();
      const menu = Query(fixture, '.pin-context-menu') as HTMLElement;
      expect([menu.style.left, menu.style.top, menu.style.maxHeight]).toEqual(['704px', '328px', '432px']);
    });

    it('measures the pin menu with no max height, so a menu that fits above its button opens there at its full height (button 600..624, full height 300: top 296px, max height 600 − 4 − 8 = 588px)', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      const button = Query(fixture, '.pin-card .more-btn') as HTMLElement;
      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(900, 600, 24, 24));
      fakeLaidOutHeight(300);
      button.click();
      fixture.detectChanges();
      const menu = Query(fixture, '.pin-context-menu') as HTMLElement;
      expect([menu.style.top, menu.style.maxHeight]).toEqual(['296px', '588px']);
    });

    it("lists Edit, the pin's other groups and Unpin as menu items, and moves or unpins the pin", async () => {
      const { fixture, pins } = await renderHome({ pins: [REVENUE_PIN, OPS_PIN] });
      const [revenueMore, opsMore] = QueryAll(fixture, '.pin-card .more-btn') as HTMLElement[];

      revenueMore.click();
      fixture.detectChanges();
      await settle();
      expect(Attr(fixture, '.pin-context-menu', 'role')).toBe('menu');
      expect(Attr(fixture, '.pin-context-menu', 'aria-label')).toBe('Options for Revenue');
      expect(texts(fixture, '.pin-context-menu .pin-context-item')).toEqual(['Edit', 'Move to Group', 'Leadership', 'Unpin']);
      expect(texts(fixture, '.pin-context-menu button[role="menuitem"]')).toEqual(['Edit', 'Leadership', 'Unpin']);
      expect([revenueMore, opsMore].map(more => more.getAttribute('aria-expanded'))).toEqual(['true', 'false']);
      expect(QueryAll(fixture, '.pin-card').map(card => card.classList.contains('menu-open'))).toEqual([true, false]);

      Click(fixture, '.pin-context-menu .submenu-item');
      fixture.detectChanges();
      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(REVENUE_PIN.Id, { Group: 'Leadership' });
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
      expect(revenueMore.getAttribute('aria-expanded')).toBe('false');

      opsMore.click();
      fixture.detectChanges();
      await settle();
      expect(texts(fixture, '.pin-context-menu button[role="menuitem"]')).toEqual(['Edit', '(No group)', 'Unpin']);
      Click(fixture, '.pin-context-menu .pin-context-item.danger');
      fixture.detectChanges();
      expect(pins.RemovePin).toHaveBeenCalledExactlyOnceWith(OPS_PIN.Id);
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
    });

    it('moves focus into the menu: Enter on the pin options button focuses Edit, and the arrow keys, Home and End move between the rows', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, OPS_PIN] });
      const more = Query(fixture, '.pin-card .more-btn') as HTMLElement;
      more.focus();
      pressEnter(more);
      fixture.detectChanges();

      const rows = QueryAll(fixture, '.pin-context-menu [role="menuitem"]') as HTMLElement[];
      expect(rows.map(row => row.textContent?.trim())).toEqual(['Edit', 'Leadership', 'Unpin']);
      expect(document.activeElement).toBe(rows[0]);

      expect(pressKey(rows[0], 'ArrowDown').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(rows[1]);
      pressKey(rows[1], 'ArrowDown');
      pressKey(rows[2], 'ArrowDown');
      expect(document.activeElement).toBe(rows[0]);
      pressKey(rows[0], 'ArrowUp');
      expect(document.activeElement).toBe(rows[2]);
      pressKey(rows[2], 'Home');
      expect(document.activeElement).toBe(rows[0]);
      pressKey(rows[0], 'End');
      expect(document.activeElement).toBe(rows[2]);

      // The group rows are a group named by the "Move to Group" header
      const group = Query(fixture, '.pin-context-menu [role="group"]') as HTMLElement;
      const labelId = group.getAttribute('aria-labelledby') ?? '';
      expect(document.getElementById(labelId)?.textContent?.trim()).toBe('Move to Group');
      expect(Array.from(group.querySelectorAll('[role="menuitem"]')).map(row => row.textContent?.trim())).toEqual(['Leadership']);
    });

    it('closes on Escape and puts focus back on the pin options button, and closes on Tab', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      const more = Query(fixture, '.pin-card .more-btn') as HTMLElement;
      more.focus();
      pressEnter(more);
      fixture.detectChanges();
      await settle();
      const edit = Query(fixture, '.pin-context-menu [role="menuitem"]') as HTMLElement;
      expect(document.activeElement).toBe(edit);

      pressKey(edit, 'Escape');
      fixture.detectChanges();
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
      expect(document.activeElement).toBe(more);
      expect(more.getAttribute('aria-expanded')).toBe('false');

      pressEnter(more);
      fixture.detectChanges();
      await settle();
      expect(Query(fixture, '.pin-context-menu')).not.toBeNull();

      // Focus goes back to the button, and the browser's Tab moves on from there
      expect(pressKey(Query(fixture, '.pin-context-menu [role="menuitem"]') as HTMLElement, 'Tab').defaultPrevented).toBe(false);
      fixture.detectChanges();
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
      expect(document.activeElement).toBe(more);
    });

    it('closes when the user clicks elsewhere or presses Escape', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      Click(fixture, '.pin-card .more-btn');
      fixture.detectChanges();
      await settle();
      expect(Query(fixture, '.pin-context-menu')).not.toBeNull();

      document.body.click();
      fixture.detectChanges();
      expect(Query(fixture, '.pin-context-menu')).toBeNull();

      Click(fixture, '.pin-card .more-btn');
      fixture.detectChanges();
      await settle();
      expect(Query(fixture, '.pin-context-menu')).not.toBeNull();

      pressKey(document.body, 'Escape');
      fixture.detectChanges();
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Collapsing Pinned
  // ---------------------------------------------------------------------------------------------

  const PINNED_TOGGLE = '.pinned-section button.mj-accordion-header';
  const PINNED_COLLAPSED = 'HomeApp.PinnedCollapsed';

  /** The section toggle's aria-expanded value: 'true', 'false', or null when there is no toggle. */
  const ariaExpanded = (fixture: Fixture, toggle: string): string | null => Attr(fixture, toggle, 'aria-expanded');

  /** Clicks a section's toggle, then renders. */
  function toggleSection(fixture: Fixture, toggle: string): void {
    Click(fixture, toggle);
    fixture.detectChanges();
  }

  describe('Collapsing Pinned', () => {
    it('opens Pinned when the user has no saved state, and saves nothing', async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();
    });

    it("reads the saved state when Home loads: 'true' is collapsed", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'true' } });
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');
      expect(Query(fixture, '.pinned-section .pin-grid')).toBeNull();
    });

    it("reads the saved state when Home loads: 'false' is open", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'false' } });
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(Query(fixture, '.pinned-section .pin-grid')).not.toBeNull();
    });

    it("saves the state when the user toggles Pinned: 'true' when collapsed, 'false' when open", async () => {
      const { fixture, userInfo } = await renderHome({ pins: [REVENUE_PIN] });
      toggleSection(fixture, PINNED_TOGGLE);
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');
      toggleSection(fixture, PINNED_TOGGLE);
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('true');
      expect(userInfo.SetSettingDebounced.mock.calls).toEqual([[PINNED_COLLAPSED, 'true'], [PINNED_COLLAPSED, 'false']]);
    });

    it('hides the pin grid when the user collapses Pinned', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      expect(Query(fixture, '.pinned-section .mj-accordion-body-outer:not([inert]) .pin-grid')).not.toBeNull();

      toggleSection(fixture, PINNED_TOGGLE);

      expect(Query(fixture, '.pinned-section .mj-accordion-body-outer[inert] .pin-grid')).not.toBeNull();
    });

    it('keeps Add Pin, Dashboards and Edit in the Pinned header, outside the toggle, and Add Pin works when collapsed', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], settings: { [PINNED_COLLAPSED]: 'true' } });
      expect(texts(fixture, '.pinned-section .mj-accordion-actions > .pinned-actions > button, .pinned-section .mj-accordion-actions > .pinned-actions > mj-home-dashboard-switcher > button')).toEqual([
        'Add Pin',
        'Dashboards',
        'Edit',
      ]);
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

    it('reports PinnedCollapsed to the agent, and reports again when the user toggles Pinned', async () => {
      const { fixture, navigation } = await renderHome();
      expect(lastContext(navigation)).toMatchObject({ PinnedCollapsed: false });
      const reported = navigation.SetAgentContext.mock.calls.length;
      toggleSection(fixture, PINNED_TOGGLE);
      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported + 1);
      expect(lastContext(navigation)).toMatchObject({ PinnedCollapsed: true });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The Dashboards switcher and the dashboard view
  // ---------------------------------------------------------------------------------------------

  const SWITCHER_FILTER = '.switcher-menu mj-page-search input';
  const DASHBOARD_TITLE = '.dashboard-title .switcher-title';
  const CRUMB_HOME = '.dashboard-crumb .crumb-home';
  const PANEL = { id: 'panel-1', title: 'Accounts' } as unknown as DashboardPanel;

  /** Clicks the element under `selector` whose text is `label`, then renders. */
  function clickByText(fixture: Fixture, selector: string, label: string): void {
    const element = QueryAll(fixture, selector).find(el => el.textContent?.trim() === label);
    if (!element) {
      throw new Error(`clickByText(): no "${selector}" with text "${label}"`);
    }
    (element as HTMLElement).click();
    fixture.detectChanges();
  }

  /** Opens the Pinned header's Dashboards switcher. */
  function openSwitcher(fixture: Fixture): void {
    pinnedAction(fixture, 'Dashboards').click();
    fixture.detectChanges();
  }

  /** Opens the switcher in the dashboard view's title. */
  function openTitleSwitcher(fixture: Fixture): void {
    Click(fixture, DASHBOARD_TITLE);
    fixture.detectChanges();
  }

  describe('the Dashboards switcher in the Pinned header', () => {
    it('opens while Pinned is collapsed, without opening the section, and lists the pinned Config dashboards by name', async () => {
      const codePin = pinOf(6, 'Code board', 'Dashboards', { dashboardId: CUSTOM_CODE.ID });
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN, QUERY_PIN, codePin], settings: { [PINNED_COLLAPSED]: 'true' } });
      openSwitcher(fixture);
      expect(Query(fixture, '.switcher-menu')).not.toBeNull();
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Revenue', 'Quota']);
      expect(Text(fixture, '.switcher-menu .switcher-item.current')).toBe('Home');
      expect(ariaExpanded(fixture, PINNED_TOGGLE)).toBe('false');
      expect(Attr(fixture, '.pinned-actions .switcher-button', 'aria-expanded')).toBe('true');
    });

    it('narrows the list as the user types, in any letter case', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      openSwitcher(fixture);
      TypeInto(fixture, SWITCHER_FILTER, 'QUO');
      fixture.detectChanges();
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Quota']);
      TypeInto(fixture, SWITCHER_FILTER, 'zzz');
      fixture.detectChanges();
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual([]);
      expect(Text(fixture, '.switcher-menu .switcher-empty')).toBe('No pinned dashboard matches.');
    });

    it('closes on a click outside and on Escape, which returns focus to the button', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      openSwitcher(fixture);
      document.body.click();
      fixture.detectChanges();
      expect(Query(fixture, '.switcher-menu')).toBeNull();

      openSwitcher(fixture);
      const input = Query(fixture, SWITCHER_FILTER) as HTMLInputElement;
      expect(document.activeElement).toBe(input);
      pressKey(input, 'ArrowDown');
      expect(document.activeElement?.textContent?.trim()).toBe('Home');
      pressKey(document.activeElement as HTMLElement, 'Escape');
      fixture.detectChanges();
      expect(Query(fixture, '.switcher-menu')).toBeNull();
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Dashboards'));
    });
  });

  describe('the dashboard view and ?dashboard', () => {
    it('opens a picked dashboard inside Home in the shared editor, writes it to the URL and records the open', async () => {
      const { fixture, navigation, recentAccess } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      openSwitcher(fixture);
      clickByText(fixture, '.switcher-menu .switcher-dashboard', 'Quota');
      await settleAndRender(fixture);

      const shown = shownEditor(fixture);
      expect([shown.Id, shown.StartInEditMode, shown.ShowOpenInDashboards, shown.BodyStyle]).toEqual([QUOTA.ID, false, true, 'card']);
      expect(Query(fixture, '.main-content > mj-dashboard-editor.home-dashboard-view')).not.toBeNull();
      expect(Query(fixture, '.home-overview')).toBeNull();
      expect(Attr(fixture, '.dashboard-title .dashboard-crumb', 'aria-label')).toBe('Breadcrumb');
      expect(texts(fixture, '.dashboard-title .dashboard-crumb > *')).toEqual(['Home', '/', 'Pinned dashboards']);
      expect(Text(fixture, DASHBOARD_TITLE)).toBe('Quota');
      expect(navigation.TabParams()).toEqual({ dashboard: QUOTA.ID });
      expect(recentAccess.LogAccess).toHaveBeenCalledExactlyOnceWith('MJ: Dashboards', QUOTA.ID, 'dashboard');
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();

      openTitleSwitcher(fixture);
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Revenue', 'Quota']);
      expect(Text(fixture, '.switcher-menu .switcher-item.current')).toBe('Quota');
    });

    it("goes back to the overview from the breadcrumb, removes the dashboard from the URL and moves focus to the Pinned header's Dashboards button", async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);

      Click(fixture, CRUMB_HOME);
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(navigation.TabParams()).toEqual({});
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Dashboards'));
    });

    it('leaves the URL alone after back or forward to a dashboard Home cannot show, and warns', async () => {
      const { fixture, navigation, notifications } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      navigation.UpdateTabQueryParams.mockClear();

      // A URL write here would add a history entry that every later Back lands on again
      navigation.GoTo({ dashboard: CUSTOM_CODE.ID });
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(navigation.UpdateTabQueryParams).not.toHaveBeenCalled();
      expect(navigation.TabParams()).toEqual({ dashboard: CUSTOM_CODE.ID });
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('That dashboard is not available', 'warning', 3000);
    });

    it('keeps a dashboard the URL opens right after another one closed, and its URL', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID } });

      // The view closes (the editor could not show Revenue), and in the same turn back or forward names Quota
      shownEditor(fixture).LoadFailed.emit({ DashboardId: REVENUE.ID, Message: 'The layout could not be read.' });
      navigation.GoTo({ dashboard: QUOTA.ID });
      await settleAndRender(fixture);

      expect(editor(fixture)?.Id).toBe(QUOTA.ID);
      expect(navigation.TabParams()).toEqual({ dashboard: QUOTA.ID });
    });

    it('keeps the dashboard and its edit open while the app list reloads', async () => {
      const { fixture, appManager } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      const home = fixture.componentInstance;
      const shown = shownEditor(fixture);
      shown.StartEditing();

      // An app install elsewhere reloads the user's apps: loading, the new list, done
      appManager.ReloadApps([DATA_EXPLORER_APP]);
      renderFully(fixture);
      expect(editor(fixture)).toBe(shown);
      expect(Query(fixture, '.loading-container')).toBeNull();

      await settleAndRender(fixture);
      expect(editor(fixture)).toBe(shown);
      expect(home.IsEditing()).toBe(true);
      expect(Query(fixture, '.loading-container')).toBeNull();
    });

    it('shows the dashboard the URL names when Home opens, in any letter case, and follows back and forward', async () => {
      const { fixture, navigation, recentAccess } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID.toLowerCase() } });
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(recentAccess.LogAccess).not.toHaveBeenCalled();

      navigation.GoTo({ dashboard: QUOTA.ID });
      fixture.detectChanges();
      expect(editor(fixture)?.Id).toBe(QUOTA.ID);

      navigation.GoTo({});
      fixture.detectChanges();
      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
    });

    it("shows the dashboard the tab's data names when the tab's query-param stream has none", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID }, workspaceParams: {} });
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
    });

    it('shows the overview, drops the param and warns for a dashboard Home cannot show', async () => {
      const { fixture, navigation, notifications } = await renderHome({ queryParams: { dashboard: CUSTOM_CODE.ID } });
      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(navigation.TabParams()).toEqual({});
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('That dashboard is not available', 'warning', 3000);
    });

    it('opens a Config dashboard in edit mode when asked, and takes back the request once the editor has read it', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      const home = fixture.componentInstance;
      expect(await home.OpenDashboardInHome(CUSTOM_CODE.ID)).toBe(false);
      expect(await home.OpenDashboardInHome('D1000000-0000-4000-8000-0000000000ff')).toBe(false);

      expect(await home.OpenDashboardInHome(QUOTA.ID.toLowerCase(), true)).toBe(true);
      fixture.detectChanges();
      const shown = shownEditor(fixture);
      expect([shown.Id, shown.StartInEditMode]).toEqual([QUOTA.ID, true]);

      shown.StartInEditModeChange.emit(false);
      fixture.detectChanges();
      expect(home.DashboardStartsInEditMode).toBe(false);
      expect(shown.StartInEditMode).toBe(false);
    });

    it('hides Quick Access while a dashboard shows, and closes an open Quick Access panel', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], recents: [recentOpen(QUOTA, 'Quota')] });
      openQuickAccess(fixture);
      expect(Query(fixture, '.home-dashboard.sidebar-open .quick-access-sidebar')).not.toBeNull();

      Click(fixture, '.pin-card');
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(Query(fixture, '.home-dashboard.sidebar-open')).toBeNull();
      expect(Query(fixture, '.quick-access-sidebar')).toBeNull();
      expect(Query(fixture, '.sidebar-fab-toggle')).toBeNull();

      // A sidebar toggle (the agent has one) does not make room for a sidebar the dashboard view does not show
      fixture.componentInstance.ToggleSidebar();
      renderFully(fixture);
      expect(fixture.componentInstance.SidebarOpen).toBe(true);
      expect(Query(fixture, '.home-dashboard.sidebar-open')).toBeNull();
      expect(Query(fixture, '.quick-access-sidebar')).toBeNull();
      fixture.componentInstance.ToggleSidebar();

      Click(fixture, CRUMB_HOME);
      await settleAndRender(fixture);
      expect(Query(fixture, '.sidebar-fab-toggle')).not.toBeNull();
    });

    it('Open in Dashboards opens the dashboard in the Dashboards app', async () => {
      const { fixture, navigation, userInfo } = await renderHome({ apps: [DASHBOARDS_APP], pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      userInfo.CheckUserApplicationAccess = (_appId: string): UserApplicationAccessStatus => 'installed_active';

      shownEditor(fixture).OpenInDashboardsRequested.emit(REVENUE);
      await settle();

      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE.ID, 'Revenue', { applicationId: DASHBOARDS_APP.ID });
    });

    it('Open in Dashboards installs the Dashboards app first when the user lacks it, keeps the dashboard open through the app-list reload, then opens the dashboard there', async () => {
      const { fixture, navigation, appManager } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      const shown = shownEditor(fixture);
      let shownDuringReload: DashboardEditorStub | null = null;
      appManager.InstallAppForUser.mockResolvedValue({ ID: 'UA-1' } as unknown as MJUserApplicationEntity);
      appManager.ReloadUserApplications.mockImplementation(async () => {
        appManager.ReloadApps([DASHBOARDS_APP]);
        renderFully(fixture);
        shownDuringReload = editor(fixture);
        return undefined;
      });

      shown.OpenInDashboardsRequested.emit(REVENUE);
      await settle();

      expect(appManager.InstallAppForUser).toHaveBeenCalledExactlyOnceWith(DASHBOARDS_APP.ID);
      expect(shownDuringReload).toBe(shown);
      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE.ID, 'Revenue', { applicationId: DASHBOARDS_APP.ID });
    });

    it('Open in Dashboards opens the dashboard in the default app when the Dashboards app is not available', async () => {
      const { fixture, navigation, appManager } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      appManager.GetAllSystemApps = (): BaseApplication[] => [];

      shownEditor(fixture).OpenInDashboardsRequested.emit(REVENUE);
      await settle();

      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE.ID, 'Revenue', undefined);
    });

    it('returns to the overview, drops the param and tells the user when the editor cannot show a dashboard the user opened', async () => {
      const { fixture, navigation, notifications } = await renderHome({ pins: [REVENUE_PIN] });
      Click(fixture, '.pin-card');
      await settleAndRender(fixture);
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });

      shownEditor(fixture).LoadFailed.emit({ DashboardId: REVENUE.ID, Message: 'The layout could not be read.' });
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.pinned-section')).not.toBeNull();
      expect(navigation.TabParams()).toEqual({});
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('That dashboard is not available', 'warning', 3000);
    });

    it('leaves the URL alone, warns and shows the overview when the editor cannot show a dashboard that back or forward showed', async () => {
      const { fixture, navigation, notifications } = await renderHome({ pins: [REVENUE_PIN] });
      // The user opened Revenue, went back to the overview, then forward to Revenue
      Click(fixture, '.pin-card');
      await settleAndRender(fixture);
      navigation.GoTo({});
      await settleAndRender(fixture);
      navigation.GoTo({ dashboard: REVENUE.ID });
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      navigation.UpdateTabQueryParams.mockClear();

      // A URL write here would add a history entry that every later Back lands on again
      shownEditor(fixture).LoadFailed.emit({ DashboardId: REVENUE.ID, Message: 'The layout could not be read.' });
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.home-overview')).not.toBeNull();
      expect(navigation.UpdateTabQueryParams).not.toHaveBeenCalled();
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('That dashboard is not available', 'warning', 3000);
    });

    it('returns to the overview, drops the param and tells the user when the editor cannot show the dashboard the URL named as Home opened', async () => {
      const { fixture, navigation, notifications } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);

      // A param left in place would be saved with the tab, and the warning would show on every later Home load
      shownEditor(fixture).LoadFailed.emit({ DashboardId: REVENUE.ID, Message: 'The layout could not be read.' });
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.home-overview')).not.toBeNull();
      expect(navigation.UpdateTabQueryParams).toHaveBeenCalledExactlyOnceWith(TAB_ID, { dashboard: null }, expect.anything());
      expect(navigation.TabParams()).toEqual({});
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('That dashboard is not available', 'warning', 3000);
    });

    it("follows links from the dashboard's parts: records, dashboards (in a tab) and queries", async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      const parts = shownEditor(fixture).NavigationRequested;

      parts.emit({ request: { type: 'OpenEntityRecord', sourcePanelId: 'panel-1', entityName: 'MJ: Users', recordId: 'ID|U-1' }, panel: PANEL });
      parts.emit({ request: { type: 'OpenDashboard', sourcePanelId: 'panel-1', dashboardId: QUOTA.ID.toLowerCase() }, panel: PANEL });
      parts.emit({ request: { type: 'OpenQuery', sourcePanelId: 'panel-1', queryId: 'Q-1' }, panel: PANEL });
      parts.emit({ request: { type: 'OpenApplication', sourcePanelId: 'panel-1', applicationId: 'Data Explorer' }, panel: PANEL });

      expect(navigation.OpenEntityRecord).toHaveBeenCalledTimes(1);
      const [entityName, key] = navigation.OpenEntityRecord.mock.calls[0];
      expect(entityName).toBe('MJ: Users');
      expect(key.ToURLSegment()).toBe('ID|U-1');
      expect(navigation.OpenDashboard).toHaveBeenCalledExactlyOnceWith(QUOTA.ID.toLowerCase(), 'Quota');
      expect(navigation.OpenQuery).toHaveBeenCalledExactlyOnceWith('Q-1', 'Query');
      expect(navigation.SwitchToApp).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('OpenApplication'));
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
    });

    it('the switchers follow a rename the editor saved', async () => {
      const board = dashboard(9, 'Board review', USER_ID);
      const boardPin = pinOf(9, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const lib = { ...library(), dashboards: [...library().dashboards, board] };
      const { fixture } = await renderHome({ lib, pins: [boardPin, QUOTA_PIN], queryParams: { dashboard: board.ID } });

      // A save renames the cache's own dashboard object
      board.Name = 'Board review FY27';
      shownEditor(fixture).Saved.emit(board);
      fixture.detectChanges();
      openTitleSwitcher(fixture);
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Board review FY27', 'Quota']);
      openTitleSwitcher(fixture);

      board.Name = 'Board review 2027';
      shownEditor(fixture).NameChanged.emit('Board review 2027');
      fixture.detectChanges();
      openTitleSwitcher(fixture);
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Board review 2027', 'Quota']);
    });

    it('the pin names and the switcher follow a dashboard renamed elsewhere', async () => {
      const lib = library();
      const { fixture, engine } = await renderHome({ lib, pins: [REVENUE_PIN, QUOTA_PIN] });
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Revenue', 'Quota']);

      lib.dashboards = lib.dashboards.map(d => (d === REVENUE ? reloadedCopy(REVENUE, { Name: 'Revenue FY27' }) : d));
      engine.EmitChange('MJ: Dashboards');
      await settleAndRender(fixture);

      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Revenue FY27', 'Quota']);
      openSwitcher(fixture);
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Revenue FY27', 'Quota']);
    });

    it('returns to the overview and tells the user when the open dashboard is deleted elsewhere', async () => {
      const lib = library();
      const { fixture, engine, navigation, notifications } = await renderHome({ lib, pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID } });

      lib.dashboards = lib.dashboards.filter(d => d !== REVENUE);
      engine.EmitChange('MJ: Dashboards');
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(navigation.TabParams()).toEqual({});
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('The dashboard is no longer available', 'warning', 3000);
    });
  });

  describe('the dashboard view: leaving unsaved changes', () => {
    it('asks before leaving unsaved changes, naming the dashboard, and stays when the user keeps editing', async () => {
      const confirm = fakeConfirm(false);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;
      fixture.detectChanges();
      expect(Query(fixture, '.dashboard-title')).toBeNull();

      // The breadcrumb and the switcher are hidden while editing: another dashboard opens from the agent, or from back and forward
      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Quota' })).toEqual({
        Success: false,
        ErrorMessage: '"Quota" did not open. The pin may be broken, or the user kept editing the open dashboard.',
      });
      await settleAndRender(fixture);

      expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith({
        title: 'Discard changes?',
        message: 'Leave "Revenue" without saving?',
        detail: 'Your changes to this dashboard will be lost.',
        type: 'warning',
        confirmText: 'Discard changes',
        cancelText: 'Keep editing',
      });
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(shown.CancelEdit).not.toHaveBeenCalled();
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });
      expect(fixture.componentInstance.IsEditing()).toBe(true);
    });

    it('discards and switches when the user confirms; switches without asking when nothing changed', async () => {
      const confirm = fakeConfirm(true);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Quota' })).toEqual({ Success: true, Data: { PinName: 'Quota' } });
      await settleAndRender(fixture);
      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(editor(fixture)?.Id).toBe(QUOTA.ID);
      expect(navigation.TabParams()).toEqual({ dashboard: QUOTA.ID });

      // Nothing unsaved: no question
      confirm.Confirm.mockClear();
      shown.CancelEdit.mockClear();
      shown.StartEditing();
      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Revenue' })).toEqual({ Success: true, Data: { PinName: 'Revenue' } });
      await settleAndRender(fixture);
      expect(confirm.Confirm).not.toHaveBeenCalled();
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
    });

    it('asks before back or forward leaves unsaved changes, and puts the open dashboard back in the URL when the user keeps editing', async () => {
      const confirm = fakeConfirm(false);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;

      navigation.GoTo({ dashboard: QUOTA.ID });
      await settleAndRender(fixture);

      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(shown.CancelEdit).not.toHaveBeenCalled();
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });
    });

    it('follows back or forward away from unsaved changes when the user discards them', async () => {
      const confirm = fakeConfirm(true);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;

      navigation.GoTo({});
      await settleAndRender(fixture);

      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(editor(fixture)).toBeNull();
      expect(navigation.TabParams()).toEqual({});
    });

    it('leaves the URL alone when the user discards changes for back or forward to a dashboard Home cannot show', async () => {
      const confirm = fakeConfirm(true);
      const { fixture, navigation, notifications } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;
      navigation.UpdateTabQueryParams.mockClear();

      navigation.GoTo({ dashboard: CUSTOM_CODE.ID });
      await settleAndRender(fixture);

      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(editor(fixture)).toBeNull();
      expect(navigation.UpdateTabQueryParams).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('That dashboard is not available', 'warning', 3000);
    });

    it('follows back or forward to another dashboard while editing: the editor leaves edit mode during the render, Home changes nothing it renders then, and tells the agent after the render', async () => {
      const { fixture, navigation, confirm } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID } });
      const home = fixture.componentInstance;
      const shown = shownEditor(fixture);
      expect(home.IsEditing()).toBe(false);
      shown.StartEditing();
      expect(home.IsEditing()).toBe(true);
      await settle();

      navigation.GoTo({ dashboard: QUOTA.ID });
      const reported = navigation.SetAgentContext.mock.calls.length;
      // The editor leaves edit mode while Home renders the new dashboard ID
      fixture.detectChanges();
      expect(shown.Editing).toBe(false);
      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported);
      await settle();
      expect(navigation.SetAgentContext).toHaveBeenCalledTimes(reported + 1);

      // A full render afterwards shows what the first one showed: Home is OnPush, so a change made during the render would show only now
      renderFully(fixture);
      expect(editor(fixture)).toBe(shown);
      expect([shown.Id, shown.StartInEditMode]).toEqual([QUOTA.ID, false]);
      expect(home.IsEditing()).toBe(false);
      expect(confirm.Confirm).not.toHaveBeenCalled();
      expect(shown.CancelEdit).not.toHaveBeenCalled();
    });
  });

  describe('the dashboard view: Manage pins and focus', () => {
    it('Manage pins shows the overview with the pins in edit mode, and moves focus to Done', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID } });
      openTitleSwitcher(fixture);
      Click(fixture, '.switcher-menu .switcher-manage');
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(navigation.TabParams()).toEqual({});
      expect(Query(fixture, '.pinned-section .edit-mode-banner')).not.toBeNull();
      expect(texts(fixture, PINNED_HEADER_BUTTONS)).toEqual(['Done']);
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Done'));
    });

    it("returns focus to the Pinned header's Dashboards button after Home in the title switcher", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      openTitleSwitcher(fixture);
      Click(fixture, '.switcher-menu .switcher-home');
      await settleAndRender(fixture);

      expect(editor(fixture)).toBeNull();
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Dashboards'));
    });

    it('moves focus to the title of a picked dashboard once the editor has loaded it, and at once for the dashboard already shown', async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      openSwitcher(fixture);
      clickByText(fixture, '.switcher-menu .switcher-dashboard', 'Quota');
      await settleAndRender(fixture);
      const title = Query(fixture, DASHBOARD_TITLE);
      expect(document.activeElement).not.toBe(title);

      shownEditor(fixture).Loaded.emit(QUOTA);
      expect(document.activeElement).toBe(title);

      openTitleSwitcher(fixture);
      clickByText(fixture, '.switcher-menu .switcher-dashboard', 'Quota');
      await settleAndRender(fixture);
      expect(document.activeElement).toBe(title);
    });

    it("moves focus to the title once the editor has shown a dashboard the user opened with Enter on its pin's Open button", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN] });
      const open = Query(fixture, '.pin-card .pin-overlay button') as HTMLElement;
      open.focus();
      pressEnter(open);
      await settleAndRender(fixture);
      const title = Query(fixture, DASHBOARD_TITLE);
      expect(title).not.toBeNull();
      expect(document.activeElement).not.toBe(title);

      shownEditor(fixture).Loaded.emit(REVENUE);
      expect(document.activeElement).toBe(title);
    });

    it('moves focus when an agent switch removes the part of Home that has it: to the title once the editor has shown the dashboard, or to the Pinned header', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      // OpenPin removes the overview, which has focus
      pinnedAction(fixture, 'Dashboards').focus();
      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Quota' })).toEqual({ Success: true, Data: { PinName: 'Quota' } });
      fixture.detectChanges();
      shownEditor(fixture).Loaded.emit(QUOTA);
      expect(document.activeElement).toBe(Query(fixture, DASHBOARD_TITLE));

      // SwitchHomeDashboard to the overview removes the dashboard view, which has focus
      expect(await agentTool(navigation, 'SwitchHomeDashboard').Handler({ dashboard: 'Home' })).toEqual({ Success: true, Data: { HomeView: 'Overview' } });
      await settleAndRender(fixture);
      expect(editor(fixture)).toBeNull();
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Dashboards'));
    });

    it('keeps focus where it is when an agent switch does not remove it: outside Home', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      const outside = document.createElement('button');
      outside.type = 'button';
      document.body.appendChild(outside);
      onTestFinished(() => outside.remove());
      outside.focus();
      const tool = agentTool(navigation, 'SwitchHomeDashboard');

      expect(await tool.Handler({ dashboard: 'Quota' })).toEqual({ Success: true, Data: { CurrentDashboardName: 'Quota' } });
      fixture.detectChanges();
      shownEditor(fixture).Loaded.emit(QUOTA);
      expect(document.activeElement).toBe(outside);

      expect(await tool.Handler({ dashboard: 'Home' })).toEqual({ Success: true, Data: { HomeView: 'Overview' } });
      await settleAndRender(fixture);
      expect(editor(fixture)).toBeNull();
      expect(document.activeElement).toBe(outside);
    });

    it("gives the dashboard view one level-1 heading: the title switcher's trigger, named after the dashboard, without its open menu", async () => {
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      const headings = QueryAll(fixture, 'h1');
      expect(headings).toHaveLength(1);
      expect(headings[0].textContent?.trim()).toBe('Revenue');
      expect(headings[0].querySelector('.switcher-title')).toBe(Query(fixture, DASHBOARD_TITLE));

      openTitleSwitcher(fixture);
      const menu = Query(fixture, '.switcher-menu');
      expect(menu).not.toBeNull();
      expect(headings[0].contains(menu)).toBe(false);
      expect(QueryAll(fixture, 'h1')).toEqual(headings);
      expect(headings[0].textContent?.trim()).toBe('Revenue');
    });
  });

  describe('the dashboard view with the real dashboard editor', () => {
    /** The real dashboard editor Home shows. Throws when Home shows none. */
    function realEditorOf(fixture: Fixture): DashboardEditorComponent {
      const element = fixture.debugElement.query(By.directive(DashboardEditorComponent));
      if (!element) {
        throw new Error('realEditorOf(): Home shows no dashboard editor');
      }
      return element.componentInstance as DashboardEditorComponent;
    }

    /** Renders Home, lets the editor load the dashboard Home shows, and renders again once ngModel has filled the name field. */
    async function renderAndLoad(fixture: Fixture): Promise<void> {
      fixture.detectChanges();
      await settleAndRender(fixture);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    /** The value of the editor's name field. */
    const nameField = (fixture: Fixture): string => (Query(fixture, '.dashboard-editor-name') as HTMLInputElement).value;

    it('opens in edit mode once through [(StartInEditMode)], asks before leaving only while there are unsaved changes, and lets back or forward drop an unchanged edit during its render without NG0100', async () => {
      // The check after each render covers Home's OnPush view too, so state Home changes while it renders fails with NG0100
      TestBed.configureTestingModule({ providers: [provideCheckNoChangesConfig({ exhaustive: true })] });
      const consoleError = vi.spyOn(console, 'error');
      const confirm = fakeConfirm(false);
      const { fixture, navigation, viewers } = await renderHome({ realEditor: true, pins: [REVENUE_PIN, QUOTA_PIN], confirm });
      const home = fixture.componentInstance;

      // [(StartInEditMode)]: Home asks for edit mode, and the editor reads the request once and hands it back
      expect(await home.OpenDashboardInHome(REVENUE.ID, true)).toBe(true);
      expect(home.DashboardStartsInEditMode).toBe(true);
      await renderAndLoad(fixture);
      const editor = realEditorOf(fixture);
      expect([editor.Dashboard, editor.IsEditing, editor.StartInEditMode]).toEqual([REVENUE, true, false]);
      expect(home.DashboardStartsInEditMode).toBe(false);
      expect(home.IsEditing()).toBe(true);
      expect(nameField(fixture)).toBe('Revenue');

      // HasUnsavedChanges: with a changed name, leaving asks first, and Keep editing keeps the edit and the name
      TypeInto(fixture, '.dashboard-editor-name', 'Revenue FY27');
      expect(editor.HasUnsavedChanges).toBe(true);
      expect(await agentTool(navigation, 'SwitchHomeDashboard').Handler({ dashboard: 'Quota' })).toEqual({
        Success: false,
        ErrorMessage: '"Quota" did not open. The user kept editing the open dashboard.',
      });
      expect(confirm.Confirm).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Leave "Revenue" without saving?' }));
      await renderAndLoad(fixture);
      expect([editor.Dashboard, editor.IsEditing]).toEqual([REVENUE, true]);
      expect(nameField(fixture)).toBe('Revenue FY27');

      // Without unsaved changes, back or forward to Quota asks nothing, and the editor drops the edit while Home renders
      // Quota's ID: Home changes nothing it renders then
      TypeInto(fixture, '.dashboard-editor-name', 'Revenue');
      expect(editor.HasUnsavedChanges).toBe(false);
      navigation.GoTo({ dashboard: QUOTA.ID });
      expect(editor.IsEditing).toBe(true);
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(editor.IsEditing).toBe(false);
      await renderAndLoad(fixture);

      expect(realEditorOf(fixture)).toBe(editor);
      // Home handed the edit-mode request back, so Quota opens in view mode
      expect([editor.Dashboard, editor.IsEditing]).toEqual([QUOTA, false]);
      expect(home.IsEditing()).toBe(false);
      expect(Text(fixture, DASHBOARD_TITLE)).toBe('Quota');
      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(viewers.map(viewer => viewer.Dashboard)).toEqual([REVENUE, QUOTA]);
      expect(consoleError).not.toHaveBeenCalled();
    });
  });

  describe('Home view: the agent', () => {
    it('OpenPin opens a dashboard pin inside Home and reports it', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUERY_PIN] });

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'revenue' })).toEqual({ Success: true, Data: { PinName: 'Revenue' } });
      fixture.detectChanges();

      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
      expect(lastContext(navigation)).toMatchObject({ HomeView: 'Dashboard', CurrentDashboardName: 'Revenue', CurrentDashboardID: REVENUE.ID, IsEditingDashboard: false });
    });

    it('SwitchHomeDashboard opens a pinned dashboard by name or id, returns Home, and names the dashboards on a miss', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN] });
      const tool = agentTool(navigation, 'SwitchHomeDashboard');

      expect(await tool.Handler({ dashboard: 'quo' })).toEqual({ Success: true, Data: { CurrentDashboardName: 'Quota' } });
      fixture.detectChanges();
      expect(editor(fixture)?.Id).toBe(QUOTA.ID);
      expect(navigation.TabParams()).toEqual({ dashboard: QUOTA.ID });

      expect(await tool.Handler({ dashboard: REVENUE.ID.toLowerCase() })).toEqual({ Success: true, Data: { CurrentDashboardName: 'Revenue' } });
      fixture.detectChanges();
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);

      expect(await tool.Handler({ dashboard: 'Home' })).toEqual({ Success: true, Data: { HomeView: 'Overview' } });
      await settleAndRender(fixture);
      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.home-overview')).not.toBeNull();
      expect(navigation.TabParams()).toEqual({});

      expect(await tool.Handler({ dashboard: 'Margin' })).toEqual({
        Success: false,
        ErrorMessage: 'No pinned dashboard named "Margin". Available pinned dashboards: Home, Revenue, Quota.',
      });
      // Ops Health is a Config dashboard the user can open, but it is not pinned
      expect(await tool.Handler({ dashboard: OPS_HEALTH.ID })).toEqual({
        Success: false,
        ErrorMessage: `No pinned dashboard named "${OPS_HEALTH.ID}". Available pinned dashboards: Home, Revenue, Quota.`,
      });
      expect(lastContext(navigation)).toMatchObject({ HomeView: 'Overview', PinnedDashboardNames: ['Revenue', 'Quota'] });
    });

    it('SwitchHomeDashboard asks once before leaving unsaved changes, and tells the agent when the user keeps editing', async () => {
      const confirm = fakeConfirm(false);
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;
      const tool = agentTool(navigation, 'SwitchHomeDashboard');

      expect(await tool.Handler({ dashboard: 'Quota' })).toEqual({ Success: false, ErrorMessage: '"Quota" did not open. The user kept editing the open dashboard.' });
      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(await tool.Handler({ dashboard: 'home' })).toEqual({ Success: false, ErrorMessage: 'The Home overview did not open. The user kept editing the open dashboard.' });
      expect(confirm.Confirm).toHaveBeenCalledTimes(2);
      await settleAndRender(fixture);
      expect(editor(fixture)?.Id).toBe(REVENUE.ID);
      expect(shown.CancelEdit).not.toHaveBeenCalled();
      expect(navigation.TabParams()).toEqual({ dashboard: REVENUE.ID });
      expect(fixture.componentInstance.IsEditing()).toBe(true);

      // The user discards the changes: one question, then the switch
      confirm.Confirm.mockResolvedValue(true);
      expect(await tool.Handler({ dashboard: 'Quota' })).toEqual({ Success: true, Data: { CurrentDashboardName: 'Quota' } });
      fixture.detectChanges();
      expect(confirm.Confirm).toHaveBeenCalledTimes(3);
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(editor(fixture)?.Id).toBe(QUOTA.ID);
    });

    it('SwitchHomeDashboard tells the agent when Home cannot show the dashboard, and checks its input', async () => {
      const lib = library();
      const { fixture, navigation } = await renderHome({ lib, pins: [REVENUE_PIN, QUOTA_PIN] });
      const tool = agentTool(navigation, 'SwitchHomeDashboard');
      // The cache no longer has Quota, and Home has not heard of the change yet
      lib.dashboards = lib.dashboards.filter(d => d !== QUOTA);

      expect(await tool.Handler({ dashboard: 'Quota' })).toEqual({ Success: false, ErrorMessage: '"Quota" did not open. The dashboard is not available.' });
      fixture.detectChanges();
      expect(editor(fixture)).toBeNull();
      expect(navigation.TabParams()).toEqual({});

      expect(await tool.Handler({ dashboard: 7 })).toEqual({ Success: false, ErrorMessage: 'dashboard must be a string.' });
      expect(await tool.Handler({ dashboard: '  ' })).toEqual({ Success: false, ErrorMessage: 'dashboard is required.' });
    });

    it('reports the open dashboard by the name it shows, its edit mode and the pinned dashboards, and follows them back to the overview', async () => {
      const lib = library();
      const { fixture, engine, navigation } = await renderHome({ lib, pins: [REVENUE_PIN, QUOTA_PIN], queryParams: { dashboard: REVENUE.ID } });
      // The Revenue pin stores "Revenue board" and shows its dashboard's name
      expect(lastContext(navigation)).toMatchObject({
        HomeView: 'Dashboard',
        CurrentDashboardName: 'Revenue',
        CurrentDashboardID: REVENUE.ID,
        IsEditingDashboard: false,
        PinnedDashboardNames: ['Revenue', 'Quota'],
      });

      // Renamed elsewhere: the context follows the cache, as the title and the switcher do
      lib.dashboards = lib.dashboards.map(d => (d === REVENUE ? reloadedCopy(REVENUE, { Name: 'Revenue FY27' }) : d));
      engine.EmitChange('MJ: Dashboards');
      await settleAndRender(fixture);
      expect(lastContext(navigation)).toMatchObject({ CurrentDashboardName: 'Revenue FY27', PinnedDashboardNames: ['Revenue FY27', 'Quota'] });

      shownEditor(fixture).StartEditing();
      await settle();
      expect(lastContext(navigation)).toMatchObject({ HomeView: 'Dashboard', IsEditingDashboard: true });

      expect(await agentTool(navigation, 'SwitchHomeDashboard').Handler({ dashboard: 'Home' })).toEqual({ Success: true, Data: { HomeView: 'Overview' } });
      const context = lastContext(navigation);
      expect(context).toMatchObject({ HomeView: 'Overview', PinnedDashboardNames: ['Revenue FY27', 'Quota'] });
      for (const key of ['CurrentDashboardName', 'CurrentDashboardID', 'IsEditingDashboard']) {
        expect(key in context).toBe(false);
      }
    });

    it('OpenPin leaves pin edit mode first, and the next render shows it', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN, QUERY_PIN] });
      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();
      expect(texts(fixture, PINNED_HEADER_BUTTONS)).toEqual(['Done']);

      expect(await agentTool(navigation, 'OpenPin').Handler({ pinName: 'Open deals' })).toEqual({ Success: true, Data: { PinName: 'Open deals' } });
      // A plain render: Home is OnPush, so it shows the change only when the tool marked Home for check
      fixture.detectChanges();

      expect(navigation.OpenQuery).toHaveBeenCalledExactlyOnceWith(QUERY_ID, 'Open deals');
      expect(texts(fixture, PINNED_HEADER_BUTTONS)).toEqual(['Add Pin', 'Dashboards', 'Edit']);
      expect(Query(fixture, '.pinned-section .edit-mode-banner')).toBeNull();
      expect(lastContext(navigation)).toMatchObject({ EditMode: false });
    });

    it('ToggleSidebar opens and closes Quick Access, and the next render shows it', async () => {
      const { fixture, navigation } = await renderHome({ recents: [recentOpen(QUOTA, 'Quota')] });
      const tool = agentTool(navigation, 'ToggleSidebar');
      expect(Query(fixture, '.home-dashboard.sidebar-open')).toBeNull();
      expect(Query(fixture, '.sidebar-fab-toggle')).not.toBeNull();

      expect(await tool.Handler({})).toEqual({ Success: true, Data: { SidebarOpen: true } });
      // A plain render: Home is OnPush, so it shows the change only when the tool marked Home for check
      fixture.detectChanges();
      expect(Query(fixture, '.home-dashboard.sidebar-open .quick-access-sidebar')).not.toBeNull();
      expect(Query(fixture, '.sidebar-fab-toggle')).toBeNull();
      expect(lastContext(navigation)).toMatchObject({ SidebarOpen: true });

      expect(await tool.Handler({})).toEqual({ Success: true, Data: { SidebarOpen: false } });
      fixture.detectChanges();
      expect(Query(fixture, '.home-dashboard.sidebar-open')).toBeNull();
      expect(Query(fixture, '.sidebar-fab-toggle')).not.toBeNull();
      expect(lastContext(navigation)).toMatchObject({ SidebarOpen: false });
    });

    it('ToggleSidebar refuses while a dashboard shows, where Quick Access does not show, and opens nothing', async () => {
      const { fixture, navigation } = await renderHome({ pins: [REVENUE_PIN], recents: [recentOpen(QUOTA, 'Quota')], queryParams: { dashboard: REVENUE.ID } });
      const tool = agentTool(navigation, 'ToggleSidebar');
      expect(tool.Description).toContain('Home overview only');

      expect(await tool.Handler({})).toEqual({
        Success: false,
        ErrorMessage: 'Quick Access shows on the Home overview only. Use SwitchHomeDashboard with "Home" first.',
      });
      renderFully(fixture);
      expect(fixture.componentInstance.SidebarOpen).toBe(false);
      expect(lastContext(navigation)).toMatchObject({ SidebarOpen: false });
    });

    it('TogglePinEditMode refuses while a dashboard shows, where the pins do not show, and saves nothing', async () => {
      const { fixture, navigation, userInfo } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID }, settings: { [PINNED_COLLAPSED]: 'true' } });
      const tool = agentTool(navigation, 'TogglePinEditMode');
      expect(tool.Description).toContain('Home overview only');

      expect(await tool.Handler({})).toEqual({
        Success: false,
        ErrorMessage: 'Pin edit mode shows on the Home overview only. Use SwitchHomeDashboard with "Home" first.',
      });
      renderFully(fixture);
      expect(fixture.componentInstance.EditMode).toBe(false);
      expect(fixture.componentInstance.PinnedExpanded).toBe(false);
      expect(userInfo.SetSettingDebounced).not.toHaveBeenCalled();
      expect(lastContext(navigation)).toMatchObject({ EditMode: false });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // New dashboard
  // ---------------------------------------------------------------------------------------------

  const NAME_DIALOG = 'mj-dashboard-name-dialog';

  /** True while the New dashboard name dialog shows. */
  const nameDialogShows = (fixture: Fixture): boolean => Query(fixture, `${NAME_DIALOG} .mj-dialog-container`) !== null;

  /** Picks New dashboard in a switcher (by default the Pinned header's), then renders the name dialog ready for typing. */
  async function pickNewDashboard(fixture: Fixture, openMenu: (fixture: Fixture) => void = openSwitcher): Promise<void> {
    openMenu(fixture);
    Click(fixture, '.switcher-menu .switcher-new');
    await settleAndRender(fixture);
    // ngModel writes the empty name into the new field in a microtask
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Types `name` in the name dialog and clicks Create, then lets Home's work finish and renders. */
  async function createNamed(fixture: Fixture, name: string): Promise<void> {
    TypeInto(fixture, `${NAME_DIALOG} .dn-name`, name);
    fixture.detectChanges();
    Click(fixture, `${NAME_DIALOG} .dn-create`);
    await settleAndRender(fixture);
  }

  /** Makes a forced reload of the dashboard cache add `created` to the library, as the engine does after a save. */
  function reloadAdds(engine: ReturnType<typeof stubDashboardEngine>, lib: HomeLibrary, created: ReturnType<typeof newDashboardDouble>): void {
    engine.Config.mockImplementation(async (forceRefresh?: boolean) => {
      if (forceRefresh) {
        lib.dashboards = [...lib.dashboards, created as unknown as MJDashboardEntity];
      }
      return undefined;
    });
  }

  describe('New dashboard', () => {
    it('asks for a name, then creates, pins and shows the dashboard in Home in edit mode', async () => {
      const lib = library();
      const { fixture, provider, engine, navigation, pins } = await renderHome({ lib, pins: [REVENUE_PIN] });
      const created = newDashboardDouble(true);
      Object.assign(provider, { GetEntityObject: vi.fn(async () => created) });
      reloadAdds(engine, lib, created);

      await pickNewDashboard(fixture);
      expect(nameDialogShows(fixture)).toBe(true);
      expect(Attr(fixture, `${NAME_DIALOG} .dn-name`, 'maxlength')).toBe(String(DASHBOARD_NAME_METADATA_MAX_LENGTH));
      expect(created.Save).not.toHaveBeenCalled();

      await createNamed(fixture, 'Pipeline review');

      expect(created.Name).toBe('Pipeline review');
      expect(created.Save).toHaveBeenCalledTimes(1);
      expect(engine.Config).toHaveBeenLastCalledWith(true, provider.CurrentUser, provider);
      expect(pins.AddPin).toHaveBeenCalledExactlyOnceWith({
        DisplayName: 'Pipeline review',
        ResourceType: 'Dashboards',
        Icon: 'fa-solid fa-gauge-high',
        Configuration: { resourceType: 'Dashboards', dashboardId: created.ID, recordId: created.ID },
      });
      // The cache reload runs before the pin is added
      const reload = engine.Config.mock.calls.findIndex(([forceRefresh]) => forceRefresh === true);
      expect(engine.Config.mock.invocationCallOrder[reload]).toBeLessThan(pins.AddPin.mock.invocationCallOrder[0]);
      expect(nameDialogShows(fixture)).toBe(false);
      const shown = shownEditor(fixture);
      expect([shown.Id, shown.StartInEditMode]).toEqual([created.ID, true]);
      expect(navigation.TabParams()).toEqual({ dashboard: created.ID });
      expect(navigation.OpenDashboard).not.toHaveBeenCalled();
    });

    it('creates nothing when the user cancels the name dialog', async () => {
      const { fixture, provider, pins } = await renderHome();
      const getEntityObject = vi.fn();
      Object.assign(provider, { GetEntityObject: getEntityObject });
      await pickNewDashboard(fixture);
      TypeInto(fixture, `${NAME_DIALOG} .dn-name`, 'Pipeline review');
      fixture.detectChanges();

      Click(fixture, `${NAME_DIALOG} .dn-cancel`);
      fixture.detectChanges();

      expect(nameDialogShows(fixture)).toBe(false);
      expect(getEntityObject).not.toHaveBeenCalled();
      expect(pins.AddPin).not.toHaveBeenCalled();
      expect(editor(fixture)).toBeNull();
    });

    it('keeps the dialog open with the name, tells the user, pins nothing and stays on the overview when the dashboard cannot be saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, provider, engine, pins, notifications } = await renderHome();
      Object.assign(provider, { GetEntityObject: vi.fn(async () => newDashboardDouble(false)) });
      await pickNewDashboard(fixture);

      await createNamed(fixture, 'Pipeline review');
      // ngModel enables the field again in a microtask
      await fixture.whenStable();
      fixture.detectChanges();

      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Could not create the dashboard', 'error', 3000);
      expect(nameDialogShows(fixture)).toBe(true);
      const field = Query(fixture, `${NAME_DIALOG} .dn-name`) as HTMLInputElement;
      expect([field.value, field.disabled]).toEqual(['Pipeline review', false]);
      expect((Query(fixture, `${NAME_DIALOG} .dn-create`) as HTMLButtonElement).disabled).toBe(false);
      expect(engine.Config).toHaveBeenCalledTimes(1);
      expect(pins.AddPin).not.toHaveBeenCalled();
      expect(editor(fixture)).toBeNull();
      expect(Query(fixture, '.home-overview')).not.toBeNull();
    });

    it('asks before leaving unsaved changes, and opens the name dialog only when the user discards them', async () => {
      const confirm = fakeConfirm(false);
      const { fixture } = await renderHome({ pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID }, confirm });
      const home = fixture.componentInstance;
      const shown = shownEditor(fixture);
      shown.StartEditing();
      shown.Unsaved = true;

      // The switchers are hidden while the dashboard is edited, so the test calls their New handler itself
      await home.OpenNewDashboardDialog();
      fixture.detectChanges();
      expect(confirm.Confirm).toHaveBeenCalledTimes(1);
      expect(shown.CancelEdit).not.toHaveBeenCalled();
      expect(nameDialogShows(fixture)).toBe(false);

      confirm.Confirm.mockResolvedValue(true);
      await home.OpenNewDashboardDialog();
      fixture.detectChanges();
      expect(confirm.Confirm).toHaveBeenCalledTimes(2);
      expect(shown.CancelEdit).toHaveBeenCalledTimes(1);
      expect(nameDialogShows(fixture)).toBe(true);
    });

    it('works from the dashboard title too: Create shows it is busy while the dashboard saves, a second Create is ignored, then the new dashboard replaces the open one', async () => {
      let finishSave: (saved: boolean) => void = () => undefined;
      const lib = library();
      const { fixture, provider, engine, navigation } = await renderHome({ lib, pins: [REVENUE_PIN], queryParams: { dashboard: REVENUE.ID } });
      const created = newDashboardDouble(new Promise<boolean>(resolve => (finishSave = resolve)));
      const getEntityObject = vi.fn(async () => created);
      Object.assign(provider, { GetEntityObject: getEntityObject });
      reloadAdds(engine, lib, created);
      await pickNewDashboard(fixture, openTitleSwitcher);

      await createNamed(fixture, 'Pipeline review');
      expect(Query(fixture, `${NAME_DIALOG} .dn-create .fa-spinner`)).not.toBeNull();
      expect((Query(fixture, `${NAME_DIALOG} .dn-create`) as HTMLButtonElement).disabled).toBe(true);
      await fixture.componentInstance.OnNewDashboardNamed('Pipeline review');
      expect(getEntityObject).toHaveBeenCalledTimes(1);

      finishSave(true);
      await settleAndRender(fixture);

      expect(created.Save).toHaveBeenCalledTimes(1);
      expect(nameDialogShows(fixture)).toBe(false);
      expect(shownEditor(fixture).Id).toBe(created.ID);
      expect(navigation.TabParams()).toEqual({ dashboard: created.ID });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Dashboard pin names (D2) and renaming pins
  // ---------------------------------------------------------------------------------------------

  /** The ID of a dashboard the cache does not have, such as one deleted after it was pinned. */
  const DELETED_ID = 'D1000000-0000-4000-8000-0000000000dd';

  /** Clicks the name of the pin that shows `current` while the pins are in edit mode. Returns its rename box, or null. */
  function clickPinName(fixture: Fixture, current: string): HTMLInputElement | null {
    clickByText(fixture, '.pin-card .pin-name', current);
    return Query(fixture, '.pin-card .pin-name-input') as HTMLInputElement | null;
  }

  /**
   * Renames the pin that shows `current` to `next`: puts the pins in edit mode when they are not, clicks the pin's
   * name, checks that its rename box has focus and the name, types `next` and presses Enter.
   */
  function renamePin(fixture: Fixture, current: string, next: string): void {
    if (!fixture.componentInstance.EditMode) {
      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();
    }
    const input = clickPinName(fixture, current);
    if (!input) {
      throw new Error(`renamePin(): the pin "${current}" shows no rename box`);
    }
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe(current);
    input.value = next;
    pressKey(input, 'Enter');
    fixture.detectChanges();
  }

  /** Opens the first pin's options menu with Enter, then chooses its first row, Edit, with Enter. */
  function chooseEditInPinMenu(fixture: Fixture): void {
    const more = Query(fixture, '.pin-card .more-btn') as HTMLElement;
    more.focus();
    pressEnter(more);
    fixture.detectChanges();
    const edit = document.activeElement as HTMLElement;
    expect(edit.textContent?.trim()).toBe('Edit');
    pressEnter(edit);
    fixture.detectChanges();
  }

  /** Makes the removal of an element that holds focus blur the focused element first, as Chrome does. */
  function blurFocusOnRemoval(): void {
    const remove = Element.prototype.remove;
    vi.spyOn(Element.prototype, 'remove').mockImplementation(function (this: Element): void {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && this.contains(focused)) {
        focused.dispatchEvent(new FocusEvent('blur'));
      }
      remove.call(this);
    });
  }

  describe('Dashboard pin names (D2) and renaming pins', () => {
    it("shows the dashboard's name on a dashboard pin, and the stored name when the cache has no such dashboard", async () => {
      const lostPin = pinOf(3, 'Old board', 'Dashboards', { dashboardId: DELETED_ID });
      const { fixture } = await renderHome({ pins: [REVENUE_PIN, lostPin, QUERY_PIN] });
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Revenue', 'Old board', 'Open deals']);
    });

    it('follows a dashboard renamed elsewhere: the card, its buttons and the pin names the agent gets', async () => {
      const lib = library();
      const { fixture, engine, navigation } = await renderHome({ lib, pins: [REVENUE_PIN] });

      lib.dashboards = lib.dashboards.map(d => (d === REVENUE ? reloadedCopy(REVENUE, { Name: 'Revenue FY27' }) : d));
      engine.EmitChange('MJ: Dashboards');
      await settleAndRender(fixture);

      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Revenue FY27']);
      expect(Attr(fixture, '.pin-card .pin-overlay button', 'aria-label')).toBe('Open Revenue FY27');
      expect(lastContext(navigation)).toMatchObject({ PinnedItems: ['Revenue FY27'] });
    });

    it('renaming a dashboard pin renames the dashboard and keeps the pin name in step; the switcher and a later open show the new name', async () => {
      const board = editableDashboard('Board review');
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, engine, navigation, pins, notifications } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });

      renamePin(fixture, 'Board review', 'Board review FY27');
      await settleAndRender(fixture);

      expect(board.Name).toBe('Board review FY27');
      expect(board.Save).toHaveBeenCalledTimes(1);
      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(boardPin.Id, { DisplayName: 'Board review FY27' });
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Renamed the dashboard to "Board review FY27"', 'success', 2000);
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review FY27']);
      expect(lastContext(navigation)).toMatchObject({ PinnedItems: ['Board review FY27'] });

      // The cache reports the save, as DashboardEngine does after a save of its own dashboard object
      engine.EmitChange('MJ: Dashboards');
      await settleAndRender(fixture);
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review FY27']);

      pinnedAction(fixture, 'Done').click();
      fixture.detectChanges();
      Click(fixture, '.pin-card');
      await settleAndRender(fixture);
      expect(Text(fixture, DASHBOARD_TITLE)).toBe('Board review FY27');
      openTitleSwitcher(fixture);
      expect(texts(fixture, '.switcher-menu .switcher-dashboard')).toEqual(['Board review FY27']);
    });

    it('keeps the old name and tells the user when the dashboard cannot be saved', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const board = editableDashboard('Board review', false);
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, pins, notifications } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });

      renamePin(fixture, 'Board review', 'Board review FY27');
      await settleAndRender(fixture);

      expect(board.Save).toHaveBeenCalledTimes(1);
      expect(board.Name).toBe('Board review');
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review']);
      expect(pins.UpdatePin).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Could not rename "Board review"', 'error', 3000);
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Name is required'));
    });

    it('keeps the old name and tells the user when the save throws', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const board = editableDashboard('Board review');
      board.Save.mockRejectedValue(new Error('network down'));
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, pins, notifications } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });

      renamePin(fixture, 'Board review', 'Board review FY27');
      await settleAndRender(fixture);

      expect(board.Name).toBe('Board review');
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review']);
      expect(pins.UpdatePin).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Could not rename "Board review"', 'error', 3000);
      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('network down'));
    });

    it('does not rename a dashboard while a save of it runs, and says so', async () => {
      // The editor saves this dashboard object at the moment: a rename would join that save and write nothing
      const board = Object.assign(editableDashboard('Board review'), { IsSaving: true });
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, pins, notifications } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });

      renamePin(fixture, 'Board review', 'Board review FY27');
      await settleAndRender(fixture);

      expect(board.Save).not.toHaveBeenCalled();
      expect(board.Name).toBe('Board review');
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review']);
      expect(pins.UpdatePin).not.toHaveBeenCalled();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('"Board review" is being saved. Rename it again in a moment.', 'info', 3000);
    });

    it('does not offer a rename for a dashboard the user cannot edit, and says why', async () => {
      const { fixture, engine, notifications } = await renderHome({ pins: [REVENUE_PIN] });
      engine.CanUserEditDashboard.mockReturnValue(false);
      pinnedAction(fixture, 'Edit').click();
      fixture.detectChanges();

      expect(clickPinName(fixture, 'Revenue')).toBeNull();

      expect(engine.CanUserEditDashboard).toHaveBeenCalledWith(REVENUE.ID, USER_ID);
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Only people who can edit "Revenue" can rename it', 'info', 3000);
    });

    it('renaming another pin, or a dashboard pin whose dashboard the cache does not have, renames only the pin', async () => {
      const lostPin = pinOf(3, 'Old board', 'Dashboards', { dashboardId: DELETED_ID });
      const { fixture, pins, notifications } = await renderHome({ pins: [QUERY_PIN, lostPin] });

      renamePin(fixture, 'Open deals', 'Deals to close');
      renamePin(fixture, 'Old board', 'Retired board');

      expect(pins.UpdatePin.mock.calls).toEqual([
        [QUERY_PIN.Id, { DisplayName: 'Deals to close' }],
        [lostPin.Id, { DisplayName: 'Retired board' }],
      ]);
      expect(notifications.CreateSimpleNotification).not.toHaveBeenCalled();
    });

    it('saves a rename once, also when the browser blurs the rename box as the box goes away', async () => {
      blurFocusOnRemoval();
      const { fixture, pins } = await renderHome({ pins: [QUERY_PIN] });

      renamePin(fixture, 'Open deals', 'Deals to close');
      await settleAndRender(fixture);

      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(QUERY_PIN.Id, { DisplayName: 'Deals to close' });
    });

    it('Edit in the pin menu starts renaming the pin with focus in its rename box and the name selected; Enter renames the dashboard and moves focus to Done', async () => {
      const board = editableDashboard('Board review');
      const boardPin = pinOf(7, 'Board review', 'Dashboards', { dashboardId: board.ID });
      const { fixture, pins } = await renderHome({ lib: { ...library(), dashboards: [board] }, pins: [boardPin] });
      chooseEditInPinMenu(fixture);

      const input = Query(fixture, '.pin-card .pin-name-input') as HTMLInputElement;
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Board review'.length]);

      input.value = 'Board review FY27';
      pressKey(input, 'Enter');
      fixture.detectChanges();
      expect(Query(fixture, '.pin-card .pin-name-input')).toBeNull();
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Done'));

      await settleAndRender(fixture);
      expect(board.Name).toBe('Board review FY27');
      expect(board.Save).toHaveBeenCalledTimes(1);
      expect(pins.UpdatePin).toHaveBeenCalledExactlyOnceWith(boardPin.Id, { DisplayName: 'Board review FY27' });
      expect(texts(fixture, '.pin-card .pin-name-text')).toEqual(['Board review FY27']);
    });

    it('Edit in the pin menu of a dashboard the user cannot edit puts the pins in edit mode without a rename box, says why and moves focus to Done', async () => {
      const { fixture, engine, notifications } = await renderHome({ pins: [REVENUE_PIN] });
      engine.CanUserEditDashboard.mockReturnValue(false);
      chooseEditInPinMenu(fixture);

      expect(Query(fixture, '.pin-context-menu')).toBeNull();
      expect(Query(fixture, '.pinned-section .edit-mode-banner')).not.toBeNull();
      expect(Query(fixture, '.pin-card .pin-name-input')).toBeNull();
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Only people who can edit "Revenue" can rename it', 'info', 3000);
      expect(document.activeElement).toBe(pinnedAction(fixture, 'Done'));
    });

    it('Unpin removes the pin at once, without asking (D6)', async () => {
      const confirm = fakeConfirm(true);
      const { fixture, pins } = await renderHome({ pins: [REVENUE_PIN], confirm });
      Click(fixture, '.pin-card .more-btn');
      fixture.detectChanges();

      Click(fixture, '.pin-context-menu .pin-context-item.danger');
      fixture.detectChanges();

      expect(pins.RemovePin).toHaveBeenCalledExactlyOnceWith(REVENUE_PIN.Id);
      expect(confirm.Confirm).not.toHaveBeenCalled();
      expect(Query(fixture, '.pin-context-menu')).toBeNull();
    });
  });
});
