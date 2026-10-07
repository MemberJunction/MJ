import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, Subject } from 'rxjs';
import type { EngineDataChangeEvent, EntityInfo, IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DashboardFavoritesService, NavigationService } from '@memberjunction/ng-shared';
import type { DashboardNavigationOptions } from '@memberjunction/ng-shared';
import { RecentAccessService } from '@memberjunction/ng-shared-generic';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { RecentAccessItem } from '@memberjunction/ng-shared-generic';
import { DashboardEngine, ResourceData, UserInfoEngine } from '@memberjunction/core-entities';
import type { DashboardUserPermissions, MJDashboardCategoryEntity, MJDashboardCategoryLinkEntity, MJDashboardEntity } from '@memberjunction/core-entities';
import {
  MJLeftNavComponent,
  MJLeftNavContentComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { DashboardNameDialogComponent } from '@memberjunction/ng-dashboard-viewer';
import type {
  CategoryChangeEvent,
  CategoryCreateEvent,
  CategoryDeleteEvent,
  DashboardBrowserViewMode,
  DashboardCreateEvent,
  DashboardDeleteEvent,
  DashboardEditEvent,
  DashboardFavoriteToggleEvent,
  DashboardMoveEvent,
  DashboardOpenEvent,
  ViewPreferenceChangeEvent,
} from '@memberjunction/ng-dashboard-viewer';
import { RenderComponentFixture, CreateFakeProvider, Click, Query, QueryAll, Text, TypeInto } from '@memberjunction/ng-test-utils';
import type { DashboardOwnerRow } from '../shared/dashboard-owner-names';
import { DashboardBrowserResourceComponent } from './dashboard-browser-resource.component';

/**
 * DOM coverage for the Library page of the Dashboards app (<mj-dashboard-browser-resource>). Every
 * open, edit, new dashboard and `?dashboard=` deep link goes to a tab of the Dashboards app through
 * NavigationService.OpenDashboard, with no forced new tab; the Library itself always shows the list.
 * The page chrome, the library rail and the New dashboard name dialog are the real components; the
 * generic browser is stubbed, the dashboard engine is an in-memory double that can emit cache
 * changes, favorites, notifications and RecentAccessService are doubles, UserInfoEngine is a double
 * holding the user settings and the record-log cache that Recently opened reads, and
 * NavigationService is a double whose tab params behave like the workspace (writes merge in and
 * replay to the tab), so the real BaseResourceComponent query-param delivery runs.
 */

@Component({ standalone: true, selector: 'mj-dashboard-browser', template: '' })
class DashboardBrowserStub {
  @Input() Dashboards: MJDashboardEntity[] = [];
  @Input() Categories: MJDashboardCategoryEntity[] = [];
  @Input() SelectedCategoryId: string | null = null;
  @Input() FlatMode = false;
  @Input() ViewMode: DashboardBrowserViewMode = 'cards';
  @Input() IsLoading = false;
  @Input() ShowCreateButton = true;
  @Input() AllowMultiSelect = true;
  @Input() AllowDragDrop = true;
  @Input() DashboardPermissions: Map<string, DashboardUserPermissions> | null = null;
  @Input() EffectiveCategoryMap: Map<string, string | null> | null = null;
  @Input() FavoriteIds: string[] = [];
  @Input() ShowFavorites = false;
  @Input() OwnerLabels: Map<string, string> | null = null;
  @Input() FlatEmptyIcon = '';
  @Input() FlatEmptyTitle = '';
  @Input() FlatEmptyMessage = '';
  @Input() FlatEmptyWelcome = false;
  @Output() DashboardOpen = new EventEmitter<DashboardOpenEvent>();
  @Output() DashboardEdit = new EventEmitter<DashboardEditEvent>();
  @Output() DashboardDelete = new EventEmitter<DashboardDeleteEvent>();
  @Output() DashboardMove = new EventEmitter<DashboardMoveEvent>();
  @Output() DashboardCreate = new EventEmitter<DashboardCreateEvent>();
  @Output() DashboardFavoriteToggle = new EventEmitter<DashboardFavoriteToggleEvent>();
  @Output() CategoryCreate = new EventEmitter<CategoryCreateEvent>();
  @Output() CategoryDelete = new EventEmitter<CategoryDeleteEvent>();
  @Output() CategoryChange = new EventEmitter<CategoryChangeEvent>();
  @Output() ViewPreferenceChange = new EventEmitter<ViewPreferenceChangeEvent>();
}

/** The slice of a registered agent client tool these specs call. */
interface ClientTool {
  Name: string;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
}

const TAB_ID = 'library-tab';
const CATEGORY_ID = 'C0000000-0000-4000-8000-000000000001';
const USER_ID = 'test-user-id';
const ANA_ID = 'U-ANA';
const DASHBOARDS_ENTITY_ID = 'E0000000-0000-4000-8000-00000000da5b';
/** The MaxLength of MJ: Dashboards.Name in the fake metadata. */
const NAME_MAX_LENGTH = 120;
const DASHBOARDS_APP = { ID: 'A0000000-0000-4000-8000-000000000001', Name: 'Dashboards' };
/** OpenDashboard options for a dashboard opened from the Library: a tab of the Dashboards app, with no forced new tab. */
const IN_DASHBOARDS_APP = { applicationId: DASHBOARDS_APP.ID };

const REVENUE = { ID: 'D0000000-0000-4000-8000-000000000001', Name: 'Revenue', Type: 'Config', CategoryID: null, UserID: USER_ID, __mj_UpdatedAt: new Date('2026-09-02') } as unknown as MJDashboardEntity;
const CHURN = { ID: 'D0000000-0000-4000-8000-000000000002', Name: 'Churn', Type: 'Config', CategoryID: null, UserID: USER_ID, __mj_UpdatedAt: new Date('2026-09-01') } as unknown as MJDashboardEntity;

/** The dashboards, categories and user state one Library render starts from. */
interface LibraryFixture {
  dashboards?: MJDashboardEntity[];
  categories?: MJDashboardCategoryEntity[];
  links?: MJDashboardCategoryLinkEntity[];
  favoriteIds?: string[];
  /** Dashboard ids in UserInfoEngine's record-log cache, most recently opened first. */
  recentIds?: string[];
  /** The list RecentAccessService holds. The Library only uses that service as a change trigger. */
  serviceRecentIds?: string[];
  settings?: Record<string, string>;
  /** The dashboard cache fails to load. */
  loadFails?: boolean;
}

function permissionsFor(dashboard: MJDashboardEntity | undefined, dashboardId: string): DashboardUserPermissions {
  const owner = dashboard?.UserID === USER_ID;
  return { DashboardID: dashboardId, CanRead: true, CanEdit: owner, CanDelete: owner, CanShare: owner, IsOwner: owner, PermissionSource: owner ? 'owner' : 'direct' };
}

/** What the in-memory engine holds. */
interface EngineState {
  dashboards: MJDashboardEntity[];
  categories: MJDashboardCategoryEntity[];
  links: MJDashboardCategoryLinkEntity[];
}

/**
 * Replaces DashboardEngine.Instance with an in-memory engine holding the fixture. `Change` replaces
 * what it holds and emits the change, as the engine does after a save or delete made anywhere.
 */
function stubDashboardEngine(dashboards: MJDashboardEntity[], categories: MJDashboardCategoryEntity[], links: MJDashboardCategoryLinkEntity[]) {
  const state: EngineState = { dashboards, categories, links };
  const changes = new Subject<EngineDataChangeEvent>();
  const engine = {
    Config: vi.fn(async (_forceRefresh?: boolean) => undefined),
    GetAccessibleDashboards: vi.fn(() => state.dashboards),
    GetAccessibleCategories: vi.fn(() => state.categories),
    get DashboardCategoryLinks(): MJDashboardCategoryLinkEntity[] {
      return state.links;
    },
    GetDashboardPermissions: vi.fn((id: string) => permissionsFor(state.dashboards.find(d => d.ID === id), id)),
    GetDashboardShares: vi.fn(() => []),
    DataChange$: changes.asObservable(),
    Change: (next: Partial<EngineState>, EntityName: string) => {
      Object.assign(state, next);
      changes.next({ config: { EntityName, PropertyName: '_x' }, changeType: 'update', data: [] } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  return engine;
}

/** Record logs for dashboard ids, the first opened most recently. */
const recordLogsFor = (ids: string[]) => ids.map((RecordID, i) => ({ RecordID, LatestAt: new Date(Date.UTC(2026, 8, 20, 12, 0, 59 - i)) }));

/**
 * Replaces UserInfoEngine.Instance with a double: user settings, and the record-log cache.
 * `ReloadRecordLogs` replaces the cache and emits the change the engine emits after it reloads.
 */
function stubUserInfoEngine(recentIds: string[], settings: Record<string, string>) {
  const changes = new Subject<EngineDataChangeEvent>();
  let logs = recordLogsFor(recentIds);
  const engine = {
    IsPermissionConstrained: false,
    DataChange$: changes.asObservable(),
    GetRecentRecordsForEntity: vi.fn((entityId: string, _maxItems?: number) => (entityId === DASHBOARDS_ENTITY_ID ? logs : [])),
    GetSetting: vi.fn((key: string): string | undefined => settings[key]),
    SetSettingDebounced: vi.fn((_key: string, _value: string) => undefined),
    ReloadRecordLogs: (ids: string[]) => {
      logs = recordLogsFor(ids);
      changes.next({ config: { EntityName: 'MJ: User Record Logs', PropertyName: '_UserRecordLogs' }, changeType: 'refresh', data: logs } as unknown as EngineDataChangeEvent);
    },
    EmitOtherChange: () => {
      changes.next({ config: { EntityName: 'MJ: User Settings', PropertyName: '_UserSettings' }, changeType: 'refresh', data: [] } as unknown as EngineDataChangeEvent);
    },
  };
  vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(engine as unknown as UserInfoEngine);
  return engine;
}

/** A fake provider whose metadata knows the MJ: Dashboards entity and its Name length. `ownerRows` answers MJ: Users reads. */
function providerWithDashboardsEntity(ownerRows: DashboardOwnerRow[] = [], reads: RunViewParams[] = []): IMetadataProvider {
  const dashboardsEntity = {
    ID: DASHBOARDS_ENTITY_ID,
    Name: 'MJ: Dashboards',
    FieldByName: (field: string) => (field === 'Name' ? { MaxLength: NAME_MAX_LENGTH } : undefined),
  } as unknown as EntityInfo;
  return CreateFakeProvider<DashboardOwnerRow>({
    entityByName: name => (name === 'MJ: Dashboards' ? dashboardsEntity : undefined),
    runViewResults: params => {
      reads.push(params);
      return params.EntityName === 'MJ: Users' ? ownerRows : [];
    },
  });
}

/** A provider whose MJ: Users reads wait until the test calls `finish` with the rows. */
function providerWithPendingOwnerRead() {
  const reads: RunViewParams[] = [];
  let answer: (rows: DashboardOwnerRow[]) => void = () => undefined;
  const provider = {
    ...providerWithDashboardsEntity(),
    RunView: vi.fn((params: RunViewParams) => {
      reads.push(params);
      return new Promise<RunViewResult>(resolve => {
        answer = rows => resolve({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length } as RunViewResult);
      });
    }),
  } as unknown as IMetadataProvider;
  return { provider, reads, finish: (rows: DashboardOwnerRow[]) => answer(rows) };
}

/** A provider whose new MJ: Dashboards object saves, fails to save, or saves when `saves` resolves, without a server. */
function providerCreatingDashboards(saves: boolean | Promise<boolean> = true) {
  const created = {
    ID: 'D0000000-0000-4000-8000-000000000003',
    Name: '',
    Type: 'Config',
    UserID: '',
    CategoryID: null,
    __mj_UpdatedAt: new Date('2026-09-20'),
    LatestResult: { CompleteMessage: 'Name is required' },
    Save: vi.fn(async () => saves),
  } as unknown as MJDashboardEntity;
  const getEntityObject = vi.fn(async () => created);
  const provider = { ...providerWithDashboardsEntity(), GetEntityObject: getEntityObject } as unknown as IMetadataProvider;
  return { created, provider, getEntityObject };
}

/** A NavigationService double. Its tab params act like the workspace: writes merge in and replay to the tab. */
function fakeNavigation(initialParams: Record<string, string>) {
  const params$ = new BehaviorSubject<Record<string, string>>(initialParams);
  const service = {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => params$.asObservable(),
    UpdateTabQueryParams: vi.fn((_tabId: string, update: Record<string, string | null>) => {
      const next: Record<string, string> = { ...params$.value };
      for (const [key, value] of Object.entries(update)) {
        if (value === null) {
          delete next[key];
        } else {
          next[key] = value;
        }
      }
      params$.next(next);
      return true;
    }),
    OpenDashboard: vi.fn((_id: string, _name: string, _options?: DashboardNavigationOptions) => 'dashboard-tab'),
    SetAgentContext: vi.fn((_caller: DashboardBrowserResourceComponent, _context: Record<string, unknown>) => undefined),
    SetAgentClientTools: vi.fn((_caller: DashboardBrowserResourceComponent, _tools: ClientTool[]) => undefined),
  };
  return { params$, service };
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

const dashboardRecent = (recordId: string): RecentAccessItem => ({
  id: `log-${recordId}`,
  entityId: DASHBOARDS_ENTITY_ID,
  entityName: 'MJ: Dashboards',
  recordId,
  latestAt: new Date('2026-09-20'),
  totalCount: 1,
  resourceType: 'dashboard',
});

/** A RecentAccessService double. `Emit` re-emits its list, as the service does right after logging an open. */
function fakeRecents(initialIds: string[]) {
  const items$ = new BehaviorSubject<RecentAccessItem[]>(initialIds.map(dashboardRecent));
  return {
    RecentItems: items$.asObservable(),
    get RecentItemsValue(): RecentAccessItem[] {
      return items$.value;
    },
    LoadRecentItems: vi.fn(async () => items$.value),
    Emit: () => items$.next([...items$.value]),
  };
}

type FakeNavigation = ReturnType<typeof fakeNavigation>;

function renderPage(initialParams: Record<string, string> = {}, provider: IMetadataProvider = providerWithDashboardsEntity(), library: LibraryFixture = {}) {
  const engine = stubDashboardEngine(library.dashboards ?? [REVENUE, CHURN], library.categories ?? [], library.links ?? []);
  if (library.loadFails) {
    engine.Config.mockRejectedValue(new Error('network down'));
  }
  const userInfo = stubUserInfoEngine(library.recentIds ?? [], library.settings ?? {});
  const navigation = fakeNavigation(initialParams);
  const favorites = fakeFavorites(library.favoriteIds ?? []);
  const recents = fakeRecents(library.serviceRecentIds ?? []);
  const notifications = { CreateSimpleNotification: vi.fn() };
  const loadComplete = vi.fn();
  const fixture = RenderComponentFixture(DashboardBrowserResourceComponent, {
    imports: [
      DashboardBrowserStub,
      DashboardNameDialogComponent,
      MJPageLayoutComponent,
      MJPageHeaderComponent,
      MJPageBodyComponent,
      MJStatBadgeComponent,
      MJLeftNavComponent,
      MJLeftNavContentComponent,
    ],
    declarations: [DashboardBrowserResourceComponent],
    providers: [
      { provide: NavigationService, useValue: navigation.service },
      { provide: DashboardFavoritesService, useValue: favorites },
      { provide: RecentAccessService, useValue: recents },
      { provide: ApplicationManager, useValue: { GetAllApps: () => [DASHBOARDS_APP] } },
      { provide: MJNotificationService, useValue: notifications },
    ],
    setup: instance => {
      instance.Provider = provider;
      instance.Data = new ResourceData({
        Configuration: {
          tabId: TAB_ID,
          resourceType: 'Custom',
          driverClass: 'DashboardBrowserResource',
          navItemName: 'Library',
          queryParams: initialParams,
        },
      });
      instance.LoadCompleteEvent = loadComplete;
    },
  });
  return { fixture, navigation, favorites, recents, notifications, engine, userInfo, loadComplete };
}

/** Lets the async list load and any deferred tab-param writes finish. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const browser = (fixture: ComponentFixture<DashboardBrowserResourceComponent>): DashboardBrowserStub =>
  fixture.debugElement.query(By.directive(DashboardBrowserStub)).componentInstance as DashboardBrowserStub;

/** True while the New dashboard dialog shows. */
const nameDialogOpen = (fixture: ComponentFixture<DashboardBrowserResourceComponent>): boolean =>
  Query(fixture, 'mj-dashboard-name-dialog .mj-dialog-container') !== null;

/** Types `name` into the open New dashboard dialog and clicks Create. */
function createNamedDashboard(fixture: ComponentFixture<DashboardBrowserResourceComponent>, name: string): void {
  TypeInto(fixture, 'mj-dashboard-name-dialog .dn-name', name);
  fixture.detectChanges();
  Click(fixture, 'mj-dashboard-name-dialog .dn-create');
}

function registeredTools(navigation: FakeNavigation): ClientTool[] {
  return navigation.service.SetAgentClientTools.mock.calls.at(-1)?.[1] ?? [];
}

function tool(navigation: FakeNavigation, name: string): ClientTool {
  const found = registeredTools(navigation).find(t => t.Name === name);
  if (!found) {
    throw new Error(`Agent tool ${name} is not registered`);
  }
  return found;
}

/** The context from the most recent SetAgentContext call. */
const lastAgentContext = (navigation: FakeNavigation): Record<string, unknown> | undefined => navigation.service.SetAgentContext.mock.calls.at(-1)?.[1];

/** One rendered rail item: its label, its badge text, and whether it is the active item. */
interface RailItem {
  label: string;
  badge: string;
  active: boolean;
}

function railItems(fixture: ComponentFixture<DashboardBrowserResourceComponent>): RailItem[] {
  return QueryAll(fixture, 'button.mj-left-nav__item').map(el => ({
    label: el.querySelector('.mj-left-nav__label')?.textContent?.trim() ?? '',
    badge: el.querySelector('.mj-left-nav__badge')?.textContent?.trim() ?? '',
    active: el.classList.contains('mj-left-nav__item--active'),
  }));
}

function railItem(fixture: ComponentFixture<DashboardBrowserResourceComponent>, label: string): RailItem {
  const found = railItems(fixture).find(i => i.label === label);
  if (!found) {
    throw new Error(`Rail item ${label} is not rendered`);
  }
  return found;
}

function clickRail(fixture: ComponentFixture<DashboardBrowserResourceComponent>, label: string): void {
  const button = QueryAll(fixture, 'button.mj-left-nav__item').find(el => el.querySelector('.mj-left-nav__label')?.textContent?.trim() === label);
  if (!button) {
    throw new Error(`Rail item ${label} is not rendered`);
  }
  (button as HTMLButtonElement).click();
  fixture.detectChanges();
}

const names = (dashboards: MJDashboardEntity[]): string[] => dashboards.map(d => d.Name);

/** The MJ: Users reads among the RunView calls. */
const ownerReads = (reads: RunViewParams[]): RunViewParams[] => reads.filter(r => r.EntityName === 'MJ: Users');

describe('DashboardBrowserResourceComponent (DOM)', () => {
  it('always renders the dashboard browser with the loaded dashboards', async () => {
    const { fixture } = renderPage();
    await settle();
    expect(Query(fixture, 'mj-dashboard-browser')).not.toBeNull();
    expect(browser(fixture).Dashboards.map(d => d.Name)).toEqual(['Revenue', 'Churn']);
  });

  it('names its tab Library', async () => {
    const { fixture } = renderPage();
    await settle();
    expect(await fixture.componentInstance.GetResourceDisplayName(new ResourceData())).toBe('Library');
    expect(await fixture.componentInstance.GetResourceIconClass(new ResourceData())).toBe('fa-solid fa-layer-group');
  });

  it('calls NotifyLoadComplete once when the list loads', async () => {
    const { fixture, loadComplete } = renderPage();
    await settle();

    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.LoadComplete).toBe(true);
  });

  it('calls NotifyLoadComplete and stops loading when the dashboard cache fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fixture, loadComplete } = renderPage({}, providerWithDashboardsEntity(), { loadFails: true });
    await settle();
    fixture.detectChanges();

    expect(loadComplete).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.LoadComplete).toBe(true);
    expect(browser(fixture).IsLoading).toBe(false);
  });

  it('opens a card in a tab of the Dashboards app and leaves the Library on the list', async () => {
    const { fixture, navigation } = renderPage();
    await settle();

    browser(fixture).DashboardOpen.emit({ Dashboard: CHURN, OpenInNewTab: false });
    await settle();

    expect(navigation.service.OpenDashboard).toHaveBeenCalledWith(CHURN.ID, 'Churn', IN_DASHBOARDS_APP);
    expect(navigation.service.UpdateTabQueryParams).not.toHaveBeenCalled();
    expect(Query(fixture, 'mj-dashboard-browser')).not.toBeNull();
  });

  it('opens a card in a separate tab of the Dashboards app when the browser asks for one (a Shift, Ctrl or Cmd click)', async () => {
    const { fixture, navigation } = renderPage();
    await settle();

    browser(fixture).DashboardOpen.emit({ Dashboard: CHURN, OpenInNewTab: true });
    await settle();

    expect(navigation.service.OpenDashboard).toHaveBeenCalledExactlyOnceWith(CHURN.ID, 'Churn', { ...IN_DASHBOARDS_APP, forceNewTab: true });
  });

  it('opens the dashboard in edit mode in a tab of the Dashboards app for Edit', async () => {
    const { fixture, navigation } = renderPage();
    await settle();

    browser(fixture).DashboardEdit.emit({ Dashboard: REVENUE });

    expect(navigation.service.OpenDashboard).toHaveBeenCalledExactlyOnceWith(REVENUE.ID, 'Revenue', { ...IN_DASHBOARDS_APP, openInEditMode: true });
  });

  it('New dashboard asks for a name and creates nothing when the user cancels', async () => {
    const { provider, getEntityObject } = providerCreatingDashboards();
    const { fixture, navigation } = renderPage({}, provider);
    await settle();
    expect(nameDialogOpen(fixture)).toBe(false);

    browser(fixture).DashboardCreate.emit({ CategoryId: null });
    fixture.detectChanges();

    expect(Text(fixture, 'mj-dashboard-name-dialog .mj-dialog-title')).toBe('New dashboard');
    expect(Query(fixture, 'mj-dashboard-name-dialog .dn-name')?.getAttribute('maxlength')).toBe(String(NAME_MAX_LENGTH));
    Click(fixture, 'mj-dashboard-name-dialog .dn-cancel');
    fixture.detectChanges();

    expect(nameDialogOpen(fixture)).toBe(false);
    expect(getEntityObject).not.toHaveBeenCalled();
    expect(navigation.service.OpenDashboard).not.toHaveBeenCalled();
  });

  it('New dashboard saves the named dashboard in the folder, reloads the cache, then opens it in edit mode in a tab of the Dashboards app', async () => {
    const { created, provider } = providerCreatingDashboards();
    const { fixture, navigation, engine } = renderPage({ category: CATEGORY_ID }, provider);
    await settle();

    browser(fixture).DashboardCreate.emit({ CategoryId: CATEGORY_ID });
    fixture.detectChanges();
    createNamedDashboard(fixture, '  Q3 Pipeline ');
    await settle();
    fixture.detectChanges();

    expect(created.Name).toBe('Q3 Pipeline');
    expect(created.UserID).toBe(USER_ID);
    expect(created.CategoryID).toBe(CATEGORY_ID);
    expect(engine.Config).toHaveBeenLastCalledWith(true, provider.CurrentUser, provider);
    expect(navigation.service.OpenDashboard).toHaveBeenCalledExactlyOnceWith(created.ID, 'Q3 Pipeline', { ...IN_DASHBOARDS_APP, openInEditMode: true });
    expect(engine.Config.mock.invocationCallOrder.at(-1)).toBeLessThan(navigation.service.OpenDashboard.mock.invocationCallOrder[0]);
    expect(browser(fixture).Dashboards[0]).toBe(created);
    expect(names(browser(fixture).Dashboards)).toEqual(['Q3 Pipeline', 'Revenue', 'Churn']);
    expect(railItem(fixture, 'All dashboards').badge).toBe('3');
    expect(nameDialogOpen(fixture)).toBe(false);
  });

  it('keeps the dialog open with the name and tells the user when the dashboard cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider } = providerCreatingDashboards(false);
    const { fixture, navigation, engine, notifications } = renderPage({}, provider);
    await settle();

    browser(fixture).DashboardCreate.emit({ CategoryId: null });
    fixture.detectChanges();
    createNamedDashboard(fixture, 'Q3 Pipeline');
    await settle();
    fixture.detectChanges();
    await fixture.whenStable();   // ngModel enables the field again in a microtask
    fixture.detectChanges();

    expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Could not create the dashboard', 'error', 3000);
    expect(nameDialogOpen(fixture)).toBe(true);
    expect((Query(fixture, 'mj-dashboard-name-dialog .dn-name') as HTMLInputElement).value).toBe('Q3 Pipeline');
    expect((Query(fixture, 'mj-dashboard-name-dialog .dn-name') as HTMLInputElement).disabled).toBe(false);
    expect((Query(fixture, 'mj-dashboard-name-dialog .dn-create') as HTMLButtonElement).disabled).toBe(false);
    expect(navigation.service.OpenDashboard).not.toHaveBeenCalled();
    expect(engine.Config).not.toHaveBeenCalledWith(true, provider.CurrentUser, provider);
    expect(names(browser(fixture).Dashboards)).toEqual(['Revenue', 'Churn']);
  });

  it('ignores a second Create while the named dashboard is being saved', async () => {
    let finishSave: (saved: boolean) => void = () => undefined;
    const { created, provider, getEntityObject } = providerCreatingDashboards(new Promise<boolean>(resolve => (finishSave = resolve)));
    const { fixture, navigation } = renderPage({}, provider);
    await settle();

    browser(fixture).DashboardCreate.emit({ CategoryId: null });
    fixture.detectChanges();
    createNamedDashboard(fixture, 'Q3 Pipeline');
    await settle();
    fixture.detectChanges();

    expect((Query(fixture, 'mj-dashboard-name-dialog .dn-create') as HTMLButtonElement).disabled).toBe(true);
    expect((Query(fixture, 'mj-dashboard-name-dialog .dn-cancel') as HTMLButtonElement).disabled).toBe(true);
    const secondCreate = fixture.componentInstance.OnNewDashboardNamed('Q3 Pipeline');
    await settle();
    expect(getEntityObject).toHaveBeenCalledTimes(1);

    finishSave(true);
    await secondCreate;
    await settle();
    fixture.detectChanges();

    expect(created.Save).toHaveBeenCalledTimes(1);
    expect(navigation.service.OpenDashboard).toHaveBeenCalledExactlyOnceWith(created.ID, 'Q3 Pipeline', { ...IN_DASHBOARDS_APP, openInEditMode: true });
    expect(nameDialogOpen(fixture)).toBe(false);
  });

  it('opens a ?dashboard= deep link in a tab of the Dashboards app once the list loads, then removes only that param', async () => {
    const { navigation } = renderPage({ category: CATEGORY_ID, dashboard: CHURN.ID });
    await settle();

    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(1);
    expect(navigation.service.OpenDashboard).toHaveBeenCalledWith(CHURN.ID, 'Churn', IN_DASHBOARDS_APP);
    expect(navigation.service.UpdateTabQueryParams).toHaveBeenCalledWith(TAB_ID, { dashboard: null }, expect.anything());
    expect(navigation.params$.value).toEqual({ category: CATEGORY_ID });
  });

  it('removes a ?dashboard= param delivered to a loaded Library tab, so the same link opens again', async () => {
    const { navigation } = renderPage();
    await settle();

    // A Home pin or bookmark re-focusing the cached Library tab.
    navigation.params$.next({ dashboard: REVENUE.ID });
    await settle();
    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(1);
    expect(navigation.params$.value).toEqual({});

    navigation.params$.next({ dashboard: REVENUE.ID });
    await settle();
    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(2);
    expect(navigation.params$.value).toEqual({});
  });

  it('does not report to the agent while opening a ?dashboard= link and removing the param', async () => {
    const { navigation } = renderPage();
    await settle();
    const reported = navigation.service.SetAgentContext.mock.calls.length;

    navigation.params$.next({ dashboard: REVENUE.ID });
    await settle();

    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(1);
    expect(navigation.params$.value).toEqual({});
    expect(navigation.service.SetAgentContext).toHaveBeenCalledTimes(reported);
  });

  it('removes a ?dashboard= param for a dashboard the user cannot access, without opening a tab', async () => {
    const { navigation } = renderPage({ dashboard: 'D0000000-0000-4000-8000-00000000dead' });
    await settle();

    expect(navigation.service.OpenDashboard).not.toHaveBeenCalled();
    expect(navigation.params$.value).toEqual({});
  });

  it('does not reopen a deep-linked dashboard when the agent refreshes the list', async () => {
    const { navigation } = renderPage({ dashboard: CHURN.ID });
    await settle();
    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(1);

    await tool(navigation, 'RefreshDashboardList').Handler({});
    await settle();

    expect(navigation.service.OpenDashboard).toHaveBeenCalledTimes(1);
  });

  it('registers one agent tool set, without the old open-dashboard tools', async () => {
    const { navigation } = renderPage();
    await settle();

    expect(navigation.service.SetAgentClientTools).toHaveBeenCalledTimes(1);
    expect(registeredTools(navigation).map(t => t.Name)).toEqual([
      'SearchDashboards',
      'OpenDashboard',
      'RefreshDashboardList',
      'GetCategoryHierarchy',
      'GetDashboardShares',
      'SelectLibraryFilter',
      'SelectCategory',
      'FilterByCategory',
      'ClearDashboardFilters',
      'SwitchViewMode',
    ]);
  });

  it('the OpenDashboard agent tool opens the named dashboard in a tab of the Dashboards app', async () => {
    const { navigation } = renderPage();
    await settle();

    const result = await tool(navigation, 'OpenDashboard').Handler({ dashboard: 'churn' });

    expect(result).toEqual({ Success: true });
    expect(navigation.service.OpenDashboard).toHaveBeenCalledWith(CHURN.ID, 'Churn', IN_DASHBOARDS_APP);
  });

  it('the GetDashboardShares agent tool requires a dashboard ID or name', async () => {
    const { navigation } = renderPage();
    await settle();

    const result = await tool(navigation, 'GetDashboardShares').Handler({});

    expect(result).toEqual({ Success: false, ErrorMessage: 'A dashboard ID or name is required.' });
  });

  describe('library rail and page chrome', () => {
    const SALES_ID = 'C0000000-0000-4000-8000-00000000000a';
    const PIPELINE_ID = 'C0000000-0000-4000-8000-00000000000b';
    const OWNER_CATEGORY_ID = 'C0000000-0000-4000-8000-0000000000ff';

    const category = (ID: string, Name: string, ParentID: string | null): MJDashboardCategoryEntity =>
      ({ ID, Name, ParentID }) as unknown as MJDashboardCategoryEntity;

    const dashboard = (n: number, Name: string, UserID: string, CategoryID: string | null, Type = 'Config'): MJDashboardEntity =>
      ({
        ID: `D1000000-0000-4000-8000-00000000000${n}`,
        Name,
        UserID,
        User: UserID === ANA_ID ? 'ana@example.com' : 'test@example.com',
        CategoryID,
        Type,
        __mj_UpdatedAt: new Date(`2026-09-1${n}`),
        Save: vi.fn(async () => true),
      }) as unknown as MJDashboardEntity;

    type Library = Required<Omit<LibraryFixture, 'settings' | 'loadFails'>> & { byName: (name: string) => MJDashboardEntity };

    /** A fresh library for each render: moves mutate CategoryID. */
    function library(): Library {
      // Newest first.
      const dashboards = [
        dashboard(6, 'Pipeline Health', USER_ID, PIPELINE_ID),
        dashboard(5, 'Custom Code', USER_ID, null, 'Code'),
        dashboard(4, 'Partner KPIs', ANA_ID, OWNER_CATEGORY_ID),
        dashboard(3, 'Board Pack', ANA_ID, OWNER_CATEGORY_ID),
        dashboard(2, 'Quota', USER_ID, SALES_ID),
        dashboard(1, 'Revenue', USER_ID, null),
      ];
      const byName = (name: string): MJDashboardEntity => {
        const found = dashboards.find(d => d.Name === name);
        if (!found) throw new Error(`No fixture dashboard ${name}`);
        return found;
      };
      // The user filed Partner KPIs under Sales; Board Pack is unfiled, so it is in no category.
      const links = [{ DashboardID: byName('Partner KPIs').ID, UserID: USER_ID, DashboardCategoryID: SALES_ID }] as unknown as MJDashboardCategoryLinkEntity[];
      return {
        dashboards,
        categories: [category(PIPELINE_ID, 'Pipeline', SALES_ID), category(SALES_ID, 'Sales', null)],
        links,
        favoriteIds: [byName('Custom Code').ID, byName('Partner KPIs').ID, byName('Revenue').ID],
        recentIds: [byName('Board Pack').ID, byName('Custom Code').ID, byName('Quota').ID],
        // RecentAccessService holds only the latest records of any entity; here it holds none of the dashboards.
        serviceRecentIds: [],
        byName,
      };
    }

    async function renderLibrary(params: Record<string, string> = {}, settings: Record<string, string> = {}, provider: IMetadataProvider = providerWithDashboardsEntity()) {
      const fixtureLibrary = library();
      const rendered = renderPage(params, provider, { ...fixtureLibrary, settings });
      await settle();
      rendered.fixture.detectChanges();
      return { ...rendered, library: fixtureLibrary };
    }

    it('renders the page chrome with the Library title and an X of Y dashboards badge', async () => {
      const { fixture } = await renderLibrary();
      expect(Text(fixture, '.mj-page-header-title')).toBe('Library');
      expect(QueryAll(fixture, 'mj-stat-badge strong').map(el => el.textContent?.trim())).toEqual(['5', '5']);
      expect(Text(fixture, 'mj-stat-badge .mj-stat-badge-label')).toBe('dashboards');
    });

    it('lands on every dashboard as a flat list: favorites first, then the ones opened last, then the rest', async () => {
      const { fixture, library: lib } = await renderLibrary();
      const shown = browser(fixture);

      expect(shown.FlatMode).toBe(true);
      expect(shown.SelectedCategoryId).toBeNull();
      expect(names(shown.Dashboards)).toEqual(['Custom Code', 'Partner KPIs', 'Revenue', 'Board Pack', 'Quota', 'Pipeline Health']);
      expect(shown.ShowFavorites).toBe(true);
      expect(shown.FavoriteIds).toEqual(lib.favoriteIds);
    });

    it('moves a dashboard to the front when the user stars it', async () => {
      const { fixture, favorites, library: lib } = await renderLibrary();

      favorites.Set([lib.byName('Quota').ID]);
      fixture.detectChanges();

      expect(names(browser(fixture).Dashboards)[0]).toBe('Quota');
      expect(browser(fixture).FavoriteIds).toEqual([lib.byName('Quota').ID]);
    });

    it('stars a dashboard from its card and tells the user', async () => {
      const { fixture, favorites, notifications, library: lib } = await renderLibrary();

      browser(fixture).DashboardFavoriteToggle.emit({ Dashboard: lib.byName('Quota') });
      await settle();
      fixture.detectChanges();

      expect(favorites.Toggle).toHaveBeenCalledExactlyOnceWith(lib.byName('Quota').ID);
      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Added "Quota" to favorites', 'success', 2000);
      // Quota joins the favorites, after Custom Code, which the user opened more recently.
      expect(names(browser(fixture).Dashboards)).toEqual(['Custom Code', 'Quota', 'Partner KPIs', 'Revenue', 'Board Pack', 'Pipeline Health']);
    });

    it('unstars a dashboard from its card and tells the user', async () => {
      const { fixture, notifications, library: lib } = await renderLibrary();

      browser(fixture).DashboardFavoriteToggle.emit({ Dashboard: lib.byName('Revenue') });
      await settle();

      expect(notifications.CreateSimpleNotification).toHaveBeenCalledWith('Removed "Revenue" from favorites', 'success', 2000);
    });

    it('tells the user when the favorite cannot be changed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { fixture, favorites, notifications, library: lib } = await renderLibrary();
      favorites.Toggle.mockRejectedValueOnce(new Error('network down'));

      browser(fixture).DashboardFavoriteToggle.emit({ Dashboard: lib.byName('Quota') });
      await settle();

      expect(notifications.CreateSimpleNotification).toHaveBeenCalledExactlyOnceWith('Could not change the favorite', 'error', 3000);
    });

    it("labels the user's own dashboards You and reads the other owners' names once", async () => {
      const reads: RunViewParams[] = [];
      const provider = providerWithDashboardsEntity([{ ID: ANA_ID, Name: 'ana@example.com', FirstName: 'Ana', LastName: 'Ruiz' }], reads);
      const { fixture, library: lib } = await renderLibrary({}, {}, provider);
      await settle();
      fixture.detectChanges();

      const labels = browser(fixture).OwnerLabels;
      expect(labels?.get(lib.byName('Revenue').ID)).toBe('You');
      expect(labels?.get(lib.byName('Partner KPIs').ID)).toBe('Ana Ruiz');
      expect(labels?.get(lib.byName('Board Pack').ID)).toBe('Ana Ruiz');
      expect(ownerReads(reads)).toHaveLength(1);
      expect(ownerReads(reads)[0].ExtraFilter).toBe("ID IN ('u-ana')");
    });

    it("shows the owner's user name without its e-mail domain when the read returns no name", async () => {
      const { fixture, library: lib } = await renderLibrary();
      await settle();
      fixture.detectChanges();

      expect(browser(fixture).OwnerLabels?.get(lib.byName('Partner KPIs').ID)).toBe('ana');
    });

    it('reads an owner once while the read is still running, then shows the name', async () => {
      const { provider, reads, finish } = providerWithPendingOwnerRead();
      const { fixture, engine, library: lib } = await renderLibrary({}, {}, provider);
      expect(ownerReads(reads)).toHaveLength(1);

      engine.Change({ dashboards: [...lib.dashboards] }, 'MJ: Dashboards');
      await settle();
      expect(ownerReads(reads)).toHaveLength(1);

      finish([{ ID: ANA_ID, Name: 'ana@example.com', FirstName: 'Ana', LastName: 'Ruiz' }]);
      await settle();
      fixture.detectChanges();

      expect(browser(fixture).OwnerLabels?.get(lib.byName('Partner KPIs').ID)).toBe('Ana Ruiz');
      expect(ownerReads(reads)).toHaveLength(1);
    });

    it('gives the browser the empty state of the list it shows', async () => {
      const { fixture } = await renderLibrary();
      expect(browser(fixture).FlatEmptyWelcome).toBe(true);

      clickRail(fixture, 'Favorites');
      expect(browser(fixture).FlatEmptyTitle).toBe('No favorites yet');
      expect(browser(fixture).FlatEmptyWelcome).toBe(false);

      clickRail(fixture, 'Uncategorized');
      expect(browser(fixture).FlatEmptyTitle).toBe('No uncategorized dashboards');
    });

    it('shows the Library filters with counts, then the category tree and Uncategorized', async () => {
      const { fixture } = await renderLibrary();
      expect(railItems(fixture).map(i => `${i.label}:${i.badge}`)).toEqual([
        'All dashboards:5',
        'My dashboards:3',
        'Shared with me:2',
        'Favorites:2',
        'Recently opened:2',
        'Sales:2',
        'Pipeline:1',
        'Uncategorized:2',
      ]);
      expect(railItem(fixture, 'All dashboards').active).toBe(true);
    });

    it('counts a shared dashboard where the user filed it, and an unfiled one as uncategorized', async () => {
      const { fixture } = await renderLibrary();
      // Sales: Quota + Partner KPIs (filed there by the user). Uncategorized: Revenue + Board Pack
      // (unfiled, although its owner put it in a category). Custom Code is not a Config dashboard.
      expect(railItem(fixture, 'Sales').badge).toBe('2');
      expect(railItem(fixture, 'Uncategorized').badge).toBe('2');
    });

    it('clicking Favorites gives the browser only the favorites, as a flat list, and writes ?lib=favorites', async () => {
      const { fixture, navigation } = await renderLibrary();

      clickRail(fixture, 'Favorites');

      expect(names(browser(fixture).Dashboards)).toEqual(['Custom Code', 'Partner KPIs', 'Revenue']);
      expect(browser(fixture).FlatMode).toBe(true);
      expect(browser(fixture).SelectedCategoryId).toBeNull();
      expect(navigation.params$.value).toEqual({ lib: 'favorites' });
      expect(railItem(fixture, 'Favorites').active).toBe(true);
      expect(QueryAll(fixture, 'mj-stat-badge strong').map(el => el.textContent?.trim())).toEqual(['2', '5']);
    });

    it('each Library badge equals the Config dashboards the browser is given for that filter', async () => {
      const { fixture } = await renderLibrary();
      for (const label of ['All dashboards', 'My dashboards', 'Shared with me', 'Favorites', 'Recently opened']) {
        clickRail(fixture, label);
        const shown = browser(fixture).Dashboards.filter(d => d.Type === 'Config').length;
        expect(`${label}:${railItem(fixture, label).badge}`).toBe(`${label}:${shown}`);
      }
    });

    it('Recently opened reads the record-log cache, in recents order, not the RecentAccessService list', async () => {
      const { fixture, recents, userInfo } = await renderLibrary();
      clickRail(fixture, 'Recently opened');

      expect(recents.RecentItemsValue).toEqual([]);
      expect(names(browser(fixture).Dashboards)).toEqual(['Board Pack', 'Custom Code', 'Quota']);
      expect(userInfo.GetRecentRecordsForEntity).toHaveBeenCalledWith(DASHBOARDS_ENTITY_ID, Number.MAX_SAFE_INTEGER);
    });

    it('shows a dashboard opened in this session once the record-log cache reloads', async () => {
      const { fixture, recents, userInfo, library: lib } = await renderLibrary({ lib: 'recent' });
      expect(recents.LoadRecentItems).toHaveBeenCalledTimes(1);
      expect(railItem(fixture, 'Recently opened').badge).toBe('2');

      // Opening Revenue: RecentAccessService re-emits right after saving the log, before the engine reloads it.
      recents.Emit();
      fixture.detectChanges();
      expect(railItem(fixture, 'Recently opened').badge).toBe('2');

      // The engine reloads its record-log cache and emits DataChange$.
      userInfo.ReloadRecordLogs([lib.byName('Revenue').ID, ...lib.recentIds]);
      fixture.detectChanges();

      expect(railItem(fixture, 'Recently opened').badge).toBe('3');
      expect(names(browser(fixture).Dashboards)).toEqual(['Revenue', 'Board Pack', 'Custom Code', 'Quota']);
    });

    it('ignores engine changes to caches other than the record logs', async () => {
      const { fixture, userInfo } = await renderLibrary();
      const reads = userInfo.GetRecentRecordsForEntity.mock.calls.length;

      userInfo.EmitOtherChange();
      fixture.detectChanges();

      expect(userInfo.GetRecentRecordsForEntity).toHaveBeenCalledTimes(reads);
    });

    it('refreshes on favorites and recents changes without reporting to the agent', async () => {
      const { fixture, navigation, favorites, recents, userInfo, library: lib } = await renderLibrary();
      const reported = navigation.service.SetAgentContext.mock.calls.length;

      favorites.Set([lib.byName('Quota').ID]);
      recents.Emit();
      userInfo.ReloadRecordLogs([lib.byName('Revenue').ID]);
      fixture.detectChanges();

      expect(navigation.service.SetAgentContext).toHaveBeenCalledTimes(reported);
      expect(railItem(fixture, 'Favorites').badge).toBe('1');
      expect(railItem(fixture, 'Recently opened').badge).toBe('1');
    });

    it('clicking a category shows that folder under All and writes ?category=', async () => {
      const { fixture, navigation } = await renderLibrary();
      clickRail(fixture, 'Favorites');

      clickRail(fixture, 'Sales');

      expect(browser(fixture).SelectedCategoryId).toBe(SALES_ID);
      expect(browser(fixture).FlatMode).toBe(false);
      expect(browser(fixture).Dashboards).toHaveLength(6);
      expect(navigation.params$.value).toEqual({ category: SALES_ID });
      expect(railItem(fixture, 'Sales').active).toBe(true);
    });

    it('clicking Uncategorized lists the dashboards in no category, flat, and writes ?category=uncategorized', async () => {
      const { fixture, navigation } = await renderLibrary();
      clickRail(fixture, 'Shared with me');

      clickRail(fixture, 'Uncategorized');

      // The stub also receives the Code dashboard; the real browser leaves it out.
      expect(names(browser(fixture).Dashboards)).toEqual(['Custom Code', 'Revenue', 'Board Pack']);
      expect(browser(fixture).FlatMode).toBe(true);
      expect(browser(fixture).SelectedCategoryId).toBeNull();
      expect(navigation.params$.value).toEqual({ category: 'uncategorized' });
      expect(railItem(fixture, 'Uncategorized').active).toBe(true);
    });

    it('reports Uncategorized to the agent by name, and the SelectCategory agent tool opens it', async () => {
      const { fixture, navigation } = await renderLibrary();

      expect(await tool(navigation, 'SelectCategory').Handler({ category: 'uncategorized' })).toEqual({ Success: true });
      fixture.detectChanges();

      expect(railItem(fixture, 'Uncategorized').active).toBe(true);
      expect(navigation.params$.value).toEqual({ category: 'uncategorized' });
      expect(lastAgentContext(navigation)?.['SelectedCategoryName']).toBe('Uncategorized');
    });

    it('restores ?lib= from the URL on load', async () => {
      const { fixture } = await renderLibrary({ lib: 'recent' });
      expect(browser(fixture).FlatMode).toBe(true);
      expect(names(browser(fixture).Dashboards)).toEqual(['Board Pack', 'Custom Code', 'Quota']);
      expect(railItem(fixture, 'Recently opened').active).toBe(true);
    });

    it('treats an unknown ?lib= value as All', async () => {
      const { fixture } = await renderLibrary({ lib: 'bogus' });
      expect(browser(fixture).FlatMode).toBe(true);
      expect(browser(fixture).Dashboards).toHaveLength(6);
      expect(railItem(fixture, 'All dashboards').active).toBe(true);
    });

    it('follows back and forward between Library filters and reports each one to the agent', async () => {
      const { fixture, navigation } = await renderLibrary();

      navigation.params$.next({ lib: 'mine' });
      fixture.detectChanges();
      expect(names(browser(fixture).Dashboards)).toEqual(['Custom Code', 'Revenue', 'Quota', 'Pipeline Health']);
      expect(railItem(fixture, 'My dashboards').active).toBe(true);
      expect(lastAgentContext(navigation)?.['LibraryFilter']).toBe('mine');

      navigation.params$.next({});
      fixture.detectChanges();
      expect(browser(fixture).FlatMode).toBe(true);
      expect(browser(fixture).Dashboards).toHaveLength(6);
      expect(railItem(fixture, 'All dashboards').active).toBe(true);
      expect(lastAgentContext(navigation)?.['LibraryFilter']).toBe('all');
    });

    it('re-reads the cache when it changes elsewhere, without reporting to the agent', async () => {
      const FINANCE_ID = 'C0000000-0000-4000-8000-0000000000f1';
      const { fixture, navigation, engine, library: lib } = await renderLibrary();
      const reported = navigation.service.SetAgentContext.mock.calls.length;

      // In another tab, Quota is deleted and a Finance category is created; the engine updates its cache and emits.
      engine.Change(
        { dashboards: lib.dashboards.filter(d => d.Name !== 'Quota'), categories: [...lib.categories, category(FINANCE_ID, 'Finance', null)] },
        'MJ: Dashboard Categories'
      );
      await settle();
      fixture.detectChanges();

      expect(railItem(fixture, 'All dashboards').badge).toBe('4');
      expect(railItem(fixture, 'Sales').badge).toBe('1');
      expect(railItem(fixture, 'Finance').badge).toBe('0');
      expect(names(browser(fixture).Dashboards)).not.toContain('Quota');
      expect(browser(fixture).Categories.map(c => c.Name)).toEqual(['Finance', 'Pipeline', 'Sales']);
      expect(navigation.service.SetAgentContext).toHaveBeenCalledTimes(reported);
      expect(engine.Config).toHaveBeenCalledTimes(1);
    });

    it('keeps an agent search applied when the cache changes', async () => {
      const { fixture, navigation, engine, library: lib } = await renderLibrary();
      await tool(navigation, 'SearchDashboards').Handler({ query: 'pipeline' });
      fixture.detectChanges();
      expect(names(browser(fixture).Dashboards)).toEqual(['Pipeline Health']);

      engine.Change({ dashboards: [...lib.dashboards, dashboard(7, 'Pipeline Review', USER_ID, null)] }, 'MJ: Dashboards');
      await settle();
      fixture.detectChanges();

      expect(names(browser(fixture).Dashboards)).toEqual(['Pipeline Review', 'Pipeline Health']);
    });

    it('keeps the rights and the folder of every shared dashboard after an agent search, a cache change and a clear', async () => {
      const { fixture, navigation, engine, library: lib } = await renderLibrary();
      await tool(navigation, 'SearchDashboards').Handler({ query: 'pipeline' });

      // While the search narrows the list, a save in another tab changes the cache.
      engine.Change({ dashboards: [...lib.dashboards] }, 'MJ: Dashboards');
      await settle();
      await tool(navigation, 'ClearDashboardFilters').Handler({});
      fixture.detectChanges();

      const shown = browser(fixture);
      const partnerKpis = lib.byName('Partner KPIs');
      const boardPack = lib.byName('Board Pack');
      expect(names(shown.Dashboards)).toContain('Board Pack');
      expect(shown.DashboardPermissions?.get(partnerKpis.ID)).toMatchObject({ IsOwner: false, CanEdit: false, CanDelete: false });
      expect(shown.DashboardPermissions?.get(boardPack.ID)).toMatchObject({ IsOwner: false, CanEdit: false, CanDelete: false });
      // Partner KPIs stays where the user filed it; the unfiled Board Pack stays in no category.
      expect(shown.EffectiveCategoryMap?.get(partnerKpis.ID)).toBe(SALES_ID);
      expect(shown.EffectiveCategoryMap?.has(boardPack.ID)).toBe(true);
      expect(shown.EffectiveCategoryMap?.get(boardPack.ID)).toBeNull();
      expect(railItem(fixture, 'Sales').badge).toBe('2');
      expect(railItem(fixture, 'Uncategorized').badge).toBe('2');
    });

    it('recounts and refilters when favorites change, without reloading', async () => {
      const { fixture, favorites, engine, library: lib } = await renderLibrary({ lib: 'favorites' });

      favorites.Set([lib.byName('Quota').ID]);
      fixture.detectChanges();

      expect(names(browser(fixture).Dashboards)).toEqual(['Quota']);
      expect(railItem(fixture, 'Favorites').badge).toBe('1');
      expect(engine.Config).toHaveBeenCalledTimes(1);
    });

    it('expands top-level categories and toggles a branch from its chevron', async () => {
      const { fixture } = await renderLibrary();
      expect(railItems(fixture).map(i => i.label)).toContain('Pipeline');

      (Query(fixture, 'button.mj-left-nav__chevron') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(railItems(fixture).map(i => i.label)).not.toContain('Pipeline');

      (Query(fixture, 'button.mj-left-nav__chevron') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(railItems(fixture).map(i => i.label)).toContain('Pipeline');
    });

    it('marks the folder the browser navigates into', async () => {
      const { fixture, navigation } = await renderLibrary();

      browser(fixture).CategoryChange.emit({ CategoryId: PIPELINE_ID, Category: null });
      fixture.detectChanges();

      expect(railItem(fixture, 'Pipeline').active).toBe(true);
      expect(navigation.params$.value).toEqual({ category: PIPELINE_ID });
    });

    it('keeps a flat Library list after moving its dashboards to a folder', async () => {
      const provider = { ...providerWithDashboardsEntity(), CreateTransactionGroup: vi.fn(async () => ({ Submit: vi.fn(async () => true) })) } as unknown as IMetadataProvider;
      const fixtureLibrary = library();
      const { fixture, navigation } = renderPage({ lib: 'mine' }, provider, fixtureLibrary);
      await settle();

      await fixture.componentInstance.OnDashboardMove({ Dashboards: [fixtureLibrary.byName('Revenue')], TargetCategoryId: SALES_ID });
      fixture.detectChanges();

      expect(browser(fixture).FlatMode).toBe(true);
      expect(railItem(fixture, 'My dashboards').active).toBe(true);
      expect(railItem(fixture, 'Sales').badge).toBe('3');
      expect(navigation.params$.value).toEqual({ lib: 'mine' });
    });

    it('the deprecated CreateDashboard asks for the name, then files the dashboard in the open category folder', async () => {
      const { created, provider, getEntityObject } = providerCreatingDashboards();
      const { fixture } = await renderLibrary({ category: SALES_ID }, {}, provider);

      await fixture.componentInstance.CreateDashboard();
      fixture.detectChanges();
      expect(nameDialogOpen(fixture)).toBe(true);
      expect(getEntityObject).not.toHaveBeenCalled();

      createNamedDashboard(fixture, 'Q3 Pipeline');
      await settle();

      expect(created.Name).toBe('Q3 Pipeline');
      expect(created.CategoryID).toBe(SALES_ID);
    });

    it('files a new dashboard made from Uncategorized in no category', async () => {
      const { created, provider } = providerCreatingDashboards();
      const { fixture, navigation } = await renderLibrary({ category: 'uncategorized' }, {}, provider);

      browser(fixture).DashboardCreate.emit({ CategoryId: null });
      fixture.detectChanges();
      createNamedDashboard(fixture, 'Q3 Pipeline');
      await settle();

      expect(created.CategoryID).toBeNull();
      expect(navigation.service.OpenDashboard).toHaveBeenCalledExactlyOnceWith(created.ID, 'Q3 Pipeline', { ...IN_DASHBOARDS_APP, openInEditMode: true });
    });

    it('saves the collapsed rail for the user', async () => {
      const { fixture, userInfo } = await renderLibrary();

      (Query(fixture, 'button.mj-left-nav__collapse-toggle') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(userInfo.SetSettingDebounced).toHaveBeenCalledWith('mj.dashboards.browseRailCollapsed', 'true');
      expect(fixture.componentInstance.RailCollapsed).toBe(true);
    });

    it('restores the collapsed rail from the user settings', async () => {
      const { fixture } = await renderLibrary({}, { 'mj.dashboards.browseRailCollapsed': 'true' });

      expect(fixture.componentInstance.RailCollapsed).toBe(true);
      expect(Query(fixture, 'button.mj-left-nav__collapse-toggle')?.getAttribute('aria-label')).toBe('Expand navigation');
    });

    it('the SelectLibraryFilter agent tool switches the Library filter and rejects unknown ones', async () => {
      const { fixture, navigation } = await renderLibrary();

      expect(await tool(navigation, 'SelectLibraryFilter').Handler({ filter: 'shared' })).toEqual({ Success: true });
      expect(names(browser(fixture).Dashboards)).toEqual(['Partner KPIs', 'Board Pack']);
      expect(navigation.params$.value).toEqual({ lib: 'shared' });

      const rejected = await tool(navigation, 'SelectLibraryFilter').Handler({ filter: 'starred' });
      expect(rejected).toEqual({ Success: false, ErrorMessage: 'filter must be one of: all, mine, shared, favorites, recent.' });
    });

    it('the ClearDashboardFilters agent tool also clears the Library filter', async () => {
      const { fixture, navigation } = await renderLibrary({ lib: 'favorites' });

      await tool(navigation, 'ClearDashboardFilters').Handler({});
      fixture.detectChanges();

      expect(browser(fixture).FlatMode).toBe(true);
      expect(browser(fixture).Dashboards).toHaveLength(6);
      expect(railItem(fixture, 'All dashboards').active).toBe(true);
    });

    it('reports the Library filter to the agent', async () => {
      const { navigation } = await renderLibrary({ lib: 'recent' });
      const context = lastAgentContext(navigation);
      expect(context?.['LibraryFilter']).toBe('recent');
      expect(context?.['VisibleDashboards']).toEqual(['Board Pack', 'Custom Code', 'Quota']);
    });

    it('reports the Library counts and the dashboards opened last to the agent', async () => {
      const { navigation } = await renderLibrary();
      const context = lastAgentContext(navigation);
      expect(context?.['LibraryCounts']).toEqual({ all: 5, mine: 3, shared: 2, favorites: 2, recent: 2 });
      expect(context?.['RecentlyOpenedNames']).toEqual(['Board Pack', 'Quota']);
    });
  });
});
